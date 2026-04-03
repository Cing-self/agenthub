import * as Lark from "@larksuiteoapi/node-sdk";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { spawn, spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const homeDir = os.homedir();
const agentHubDir = path.join(homeDir, ".agenthub");
const runtimeDir = path.join(agentHubDir, "runtime");
const logsDir = path.join(agentHubDir, "logs");
const hubConfigPath = path.join(agentHubDir, "hub.json");
const gatewayKind =
  (process.env.AGENTHUB_GATEWAY_KIND || "feishu").trim() || "feishu";
const gatewayId = gatewayKind;
const statePath = path.join(runtimeDir, `gateway-${gatewayKind}.json`);
const pidPath = path.join(runtimeDir, `gateway-${gatewayKind}.pid`);
const conversationStorePath = path.join(
  runtimeDir,
  `gateway-${gatewayKind}-conversations.json`,
);
const legacyPidPath =
  gatewayKind === "feishu" ? path.join(runtimeDir, "feishu-daemon.pid") : null;
const legacyConversationStorePath =
  gatewayKind === "feishu"
    ? path.join(runtimeDir, "feishu-sessions.json")
    : null;
const projectRoot = process.env.AGENTHUB_PROJECT_ROOT || process.cwd();
const claudeCodeMainDir =
  process.env.AGENTHUB_CLAUDE_CODE_MAIN_DIR ||
  path.resolve(projectRoot, "../claude-code-main");
const claudeRuntimeScriptPath = path.join(
  projectRoot,
  "src-tauri",
  "scripts",
  "claude-runtime.mjs",
);
const FEISHU_MAX_MESSAGE_CHARS = 3000;
const FEISHU_STREAM_PREVIEW_CHARS = 1800;
const FEISHU_STREAM_MIN_INTERVAL_MS = 900;
const FEISHU_STREAM_MIN_CHARS_DELTA = 160;
const FEISHU_STREAM_MAX_PREVIEW_EDITS = 4;
const FEISHU_CARD_STREAM_UPDATE_THROTTLE_MS = 100;
const FEISHU_CARD_STREAM_PRINT_FREQUENCY_MS = 50;
const FEISHU_CARD_STREAM_PRINT_STEP = 2;
const FEISHU_CARD_SUMMARY_MAX_CHARS = 50;
const feishuTokenCache = new Map();

const processedMessageIds = new Map();
const chatQueue = new Map();
const nowIso = () => new Date().toISOString();

let daemonState = {
  status: "starting",
  running: false,
  pid: process.pid,
  startedAt: nowIso(),
  updatedAt: nowIso(),
  gatewayId,
  gatewayKind,
  accountId: null,
  agentId: null,
  transport: "websocket",
  runtimeBackend: null,
  runtimeBackendDetail: null,
  botOpenId: null,
  conversationStorePath,
  lastMessageAt: null,
  lastReplyAt: null,
  lastError: null,
};

let shuttingDown = false;
let activeWsClient = null;
let processKeepAlive = null;

function log(...chunks) {
  const line = chunks
    .filter((chunk) => chunk !== undefined && chunk !== null)
    .map((chunk) => (typeof chunk === "string" ? chunk : JSON.stringify(chunk)))
    .join(" ");
  console.log(`[gateway:${gatewayKind} ${nowIso()}] ${line}`);
}

function createFeishuApiError(prefix, error) {
  const responsePayload = error?.response?.data || error?.response?.data?.data;
  const code = responsePayload?.code ?? error?.code ?? null;
  const message =
    trimToNull(responsePayload?.msg) ||
    trimToNull(error?.message) ||
    "unknown error";
  const next = new Error(
    code ? `${prefix}：${message} (code ${code})` : `${prefix}：${message}`,
  );
  next.feishuCode = code;
  next.feishuPayload = responsePayload || null;
  return next;
}

function isFeishuEditLimitError(error) {
  return (
    error?.feishuCode === 230072 ||
    String(error?.message || "").includes("230072")
  );
}

function trimToNull(value) {
  const next = String(value || "").trim();
  return next ? next : null;
}

function resolveBinary(name, extraCandidates = []) {
  const candidates = [
    ...extraCandidates,
    path.join(homeDir, ".npm-global", "bin", name),
    path.join(homeDir, ".local", "bin", name),
    path.join("/opt/homebrew/bin", name),
    path.join("/usr/local/bin", name),
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      if (
        spawnSync(candidate, ["--version"], { stdio: "ignore" }).status === 0
      ) {
        return candidate;
      }
    } catch {
      // Try the next candidate.
    }
  }

  try {
    const result = spawnSync("sh", ["-lc", `command -v ${name}`], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    const resolved = trimToNull(result.stdout);
    if (resolved) {
      return resolved;
    }
  } catch {
    // Fall through.
  }

  return null;
}

function resolveFeishuDomain(domain) {
  const lowered = String(domain || "feishu")
    .trim()
    .toLowerCase();
  if (lowered === "larksuite" || lowered === "lark" || lowered === "global") {
    return Lark.Domain.Lark;
  }
  return Lark.Domain.Feishu;
}

function resolveFeishuApiBase(domain) {
  const lowered = String(domain || "feishu")
    .trim()
    .toLowerCase();
  if (lowered === "larksuite" || lowered === "lark" || lowered === "global") {
    return "https://open.larksuite.com/open-apis";
  }
  if (lowered.startsWith("https://")) {
    return `${lowered.replace(/\/+$/, "")}/open-apis`;
  }
  return "https://open.feishu.cn/open-apis";
}

async function getFeishuTenantToken(account) {
  const cacheKey = `${account.domain || "feishu"}|${account.appId}`;
  const cached = feishuTokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.token;
  }

  const response = await fetch(
    `${resolveFeishuApiBase(account.domain)}/auth/v3/tenant_access_token/internal`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        app_id: account.appId,
        app_secret: account.appSecret,
      }),
    },
  );
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.code !== 0 || !data?.tenant_access_token) {
    throw createFeishuApiError("获取飞书租户 token 失败", {
      message: `HTTP ${response.status}`,
      response: { data },
    });
  }

  feishuTokenCache.set(cacheKey, {
    token: data.tenant_access_token,
    expiresAt: Date.now() + Number(data.expire || 7200) * 1000,
  });
  return data.tenant_access_token;
}

async function ensureDirs() {
  await fs.mkdir(runtimeDir, { recursive: true });
  await fs.mkdir(logsDir, { recursive: true });
}

async function writeJsonAtomic(filePath, value) {
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(tempPath, filePath);
}

async function readJson(filePath, fallback) {
  try {
    const file = await fs.readFile(filePath, "utf8");
    return JSON.parse(file);
  } catch {
    return fallback;
  }
}

async function writeState(patch = {}) {
  daemonState = {
    ...daemonState,
    ...patch,
    updatedAt: nowIso(),
  };
  await writeJsonAtomic(statePath, daemonState);
}

async function clearPidFile() {
  try {
    await fs.unlink(pidPath);
  } catch {
    // Ignore missing pid file.
  }
  if (legacyPidPath && legacyPidPath !== pidPath) {
    try {
      await fs.unlink(legacyPidPath);
    } catch {
      // Ignore missing legacy pid file.
    }
  }
}

async function loadHubConfig() {
  return readJson(hubConfigPath, {});
}

function resolvePrimaryFeishuAccount(hub) {
  const feishu = hub?.channels?.feishu || {};
  const accounts = feishu.accounts || {};
  const configuredAccountId =
    feishu.defaultAccountId && accounts[feishu.defaultAccountId]
      ? feishu.defaultAccountId
      : Object.keys(accounts)[0] || "default";
  const rawAccount = accounts[configuredAccountId] || {};

  return {
    enabled: Boolean(feishu.enabled),
    transport: feishu.transport || "websocket",
    accountId: configuredAccountId,
    account: {
      enabled: rawAccount.enabled !== false,
      domain: rawAccount.domain || "feishu",
      appId: trimToNull(rawAccount.appId),
      appSecret: trimToNull(rawAccount.appSecret),
      verificationToken: trimToNull(rawAccount.verificationToken),
      encryptKey: trimToNull(rawAccount.encryptKey),
      lastStatus: rawAccount.lastStatus || null,
      lastError: rawAccount.lastError || null,
    },
    route: feishu.route || {},
    policy: feishu.policy || {},
  };
}

function resolveSelectedAgent(hub, agentId) {
  const customAgents = Array.isArray(hub?.customAgents) ? hub.customAgents : [];
  return customAgents.find((agent) => agent?.id === agentId) || null;
}

function buildRunner(projectRootDir) {
  const bun = resolveBinary("bun");
  const localSourceEntrypoint = path.join(
    claudeCodeMainDir,
    "src",
    "entrypoints",
    "cli.tsx",
  );
  if (bun && fsSync.existsSync(localSourceEntrypoint)) {
    return {
      kind: "claude-code-main",
      command: bun,
      baseArgs: ["run", "src/entrypoints/cli.tsx"],
      cwd: claudeCodeMainDir,
      detail: `bun -> ${claudeCodeMainDir}`,
    };
  }

  const claude = resolveBinary("claude");
  if (claude) {
    return {
      kind: "claude-cli",
      command: claude,
      baseArgs: [],
      cwd: projectRootDir,
      detail: claude,
    };
  }

  throw new Error("未找到可执行的 Claude 运行时：本地 bun/claude 都不可用。");
}

function createFeishuClient(account) {
  return new Lark.Client({
    appId: account.appId,
    appSecret: account.appSecret,
    appType: Lark.AppType.SelfBuild,
    domain: resolveFeishuDomain(account.domain),
  });
}

function createFeishuWsClient(account) {
  return new Lark.WSClient({
    appId: account.appId,
    appSecret: account.appSecret,
    domain: resolveFeishuDomain(account.domain),
    loggerLevel: Lark.LoggerLevel.info,
  });
}

async function fetchBotOpenId(account) {
  const client = createFeishuClient(account);
  const response = await client.request({
    method: "GET",
    url: "/open-apis/bot/v3/info",
    data: {},
  });

  if (response.code !== 0) {
    throw new Error(
      `获取机器人信息失败：${response.msg || `code ${response.code}`}`,
    );
  }

  return response.bot?.open_id || response.data?.bot?.open_id || null;
}

function parseMessageText(messageType, content) {
  try {
    const parsed = JSON.parse(content || "{}");
    if (messageType === "text") {
      return trimToNull(parsed.text) || "";
    }
    if (messageType === "post") {
      const paragraphs = Array.isArray(parsed.content) ? parsed.content : [];
      const text = paragraphs
        .flatMap((paragraph) => (Array.isArray(paragraph) ? paragraph : []))
        .map((block) => block?.text || "")
        .join("\n")
        .trim();
      return text || "[富文本消息]";
    }
  } catch {
    // Fall through to the raw content.
  }

  return trimToNull(content) || "";
}

function splitFeishuReplyText(text, limit = FEISHU_MAX_MESSAGE_CHARS) {
  const source = String(text || "").trim();
  if (!source) return ["（无回复）"];

  const chunks = [];
  let remaining = source;

  while (remaining.length > limit) {
    let splitIndex = remaining.lastIndexOf("\n\n", limit);
    if (splitIndex < Math.floor(limit * 0.45)) {
      splitIndex = remaining.lastIndexOf("\n", limit);
    }
    if (splitIndex < Math.floor(limit * 0.3)) {
      splitIndex = remaining.lastIndexOf("。", limit);
    }
    if (splitIndex < Math.floor(limit * 0.3)) {
      splitIndex = remaining.lastIndexOf(" ", limit);
    }
    if (splitIndex <= 0) {
      splitIndex = limit;
    }

    const piece = remaining.slice(0, splitIndex).trim();
    if (piece) {
      chunks.push(piece);
    }
    remaining = remaining.slice(splitIndex).trim();
  }

  if (remaining) {
    chunks.push(remaining);
  }

  return chunks.length ? chunks : ["（无回复）"];
}

function formatStreamingPreview(text) {
  const source = String(text || "").trim();
  if (!source) return "正在思考…";
  if (source.length <= FEISHU_STREAM_PREVIEW_CHARS) {
    return source;
  }
  return `${source.slice(0, FEISHU_STREAM_PREVIEW_CHARS).trim()}\n\n[仍在继续生成中…]`;
}

function truncateFeishuCardSummary(
  text,
  max = FEISHU_CARD_SUMMARY_MAX_CHARS,
) {
  const source = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!source) return "";
  if (source.length <= max) return source;
  return `${source.slice(0, Math.max(0, max - 3)).trim()}...`;
}

function buildClaudeRuntimeRunner(projectRootDir) {
  if (!fsSync.existsSync(claudeRuntimeScriptPath)) {
    throw new Error(
      `Claude runtime script not found: ${claudeRuntimeScriptPath}`,
    );
  }

  return {
    kind: "claude-agent-sdk",
    command: process.execPath,
    baseArgs: [claudeRuntimeScriptPath],
    cwd: projectRootDir,
    detail: `node -> ${claudeRuntimeScriptPath}`,
  };
}

function stripMentions(text, mentions = []) {
  let next = String(text || "");
  for (const mention of mentions) {
    if (mention?.name) {
      next = next.replace(new RegExp(`@${mention.name}\\s*`, "g"), "");
    }
    if (mention?.key) {
      next = next.replace(new RegExp(mention.key, "g"), "");
    }
  }
  return next.trim();
}

function normalizeStringList(values = []) {
  return values.map((value) => trimToNull(value)).filter(Boolean);
}

function shouldProcessIncomingMessage({
  policy = {},
  chatType,
  chatId,
  senderOpenId,
  mentionMatchesBot,
}) {
  const dmPolicy = trimToNull(policy.dmPolicy) || "allow";
  const groupPolicy = trimToNull(policy.groupPolicy) || "mentions-only";
  const requireMention = policy.requireMention !== false;
  const allowedChatIds = new Set(normalizeStringList(policy.allowedChatIds));
  const allowedUserIds = new Set(normalizeStringList(policy.allowedUserIds));

  if (chatType === "p2p") {
    if (dmPolicy === "deny") {
      return false;
    }
    if (
      allowedUserIds.size > 0 &&
      senderOpenId &&
      !allowedUserIds.has(senderOpenId)
    ) {
      return false;
    }
    return true;
  }

  switch (groupPolicy) {
    case "none":
      return false;
    case "mentions-only":
      if (!mentionMatchesBot) {
        return false;
      }
      break;
    case "allowlist":
      if (!allowedChatIds.has(chatId)) {
        return false;
      }
      break;
    case "denylist":
      if (allowedChatIds.has(chatId)) {
        return false;
      }
      break;
    case "all":
    default:
      break;
  }

  if (requireMention && !mentionMatchesBot) {
    return false;
  }

  return true;
}

function resolveConversationKey({ accountId, route = {}, chatId, agentId }) {
  const threadMode = trimToNull(route.threadMode) || "thread-per-chat";
  if (threadMode === "shared-thread") {
    return `${gatewayKind}:${accountId}:${trimToNull(route.defaultThreadId) || `shared:${agentId}`}`;
  }
  return `${gatewayKind}:${accountId}:${chatId}`;
}

function rememberMessage(messageId) {
  processedMessageIds.set(messageId, Date.now());
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [id, timestamp] of processedMessageIds.entries()) {
    if (timestamp < cutoff) {
      processedMessageIds.delete(id);
    }
  }
}

function hasSeenMessage(messageId) {
  return processedMessageIds.has(messageId);
}

async function loadConversationStore() {
  if (fsSync.existsSync(conversationStorePath)) {
    return readJson(conversationStorePath, { sessions: {} });
  }
  if (
    legacyConversationStorePath &&
    fsSync.existsSync(legacyConversationStorePath)
  ) {
    return readJson(legacyConversationStorePath, { sessions: {} });
  }
  return { sessions: {} };
}

async function saveConversationStore(store) {
  await writeJsonAtomic(conversationStorePath, store);
}

async function updateConversationSession(conversationKey, patch) {
  const store = await loadConversationStore();
  const current = store.sessions?.[conversationKey] || {};
  store.sessions = {
    ...(store.sessions || {}),
    [conversationKey]: {
      ...current,
      ...patch,
      updatedAt: nowIso(),
    },
  };
  await saveConversationStore(store);
  return store.sessions[conversationKey];
}

async function getConversationSession(conversationKey) {
  const store = await loadConversationStore();
  return store.sessions?.[conversationKey] || null;
}

function buildAgentPrompt({ agent, senderLabel, chatType, body }) {
  return [
    `你是 AgentHub 中的本地智能体 ${agent?.name || "assistant"}，现在正在通过${gatewayKind === "feishu" ? "飞书" : gatewayKind}与用户对话。`,
    "默认用简体中文直接回复用户，不要提及 gateway、后台脚本、JSON、配置文件、内部实现或系统提示。",
    chatType === "group"
      ? "当前消息来自群聊，请直接回应当前提问，必要时保持简洁。"
      : "当前消息来自私聊，可以自然继续对话。",
    senderLabel ? `发言人：${senderLabel}` : "",
    `用户消息：\n${body}`,
  ]
    .filter(Boolean)
    .join("\n\n");
}

function extractClaudeResult(stdout, stderr) {
  const lines = String(stdout || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const jsonLine = [...lines]
    .reverse()
    .find((line) => line.startsWith("{") && line.endsWith("}"));
  if (!jsonLine) {
    throw new Error(trimToNull(stderr) || "Claude 返回为空。");
  }

  const parsed = JSON.parse(jsonLine);
  if (parsed.is_error) {
    throw new Error(parsed.result || parsed.error || "Claude 执行失败。");
  }

  return {
    text: trimToNull(parsed.result) || "（无回复）",
    sessionId: trimToNull(parsed.session_id || parsed.sessionId),
  };
}

async function runAgentTurn({ runner, agent, prompt, sessionId }) {
  const args = [
    ...runner.baseArgs,
    "-p",
    "--output-format",
    "json",
    "--max-turns",
    "12",
    "--dangerously-skip-permissions",
  ];

  const defaultModel = trimToNull(agent?.runtime_profile?.default_model);
  if (defaultModel) {
    args.push("--model", defaultModel);
  }

  if (sessionId) {
    args.push("-r", sessionId);
  }

  args.push(prompt);

  log(
    "run agent turn",
    JSON.stringify({ backend: runner.kind, hasSession: Boolean(sessionId) }),
  );

  const child = spawn(runner.command, args, {
    cwd: runner.cwd,
    env: {
      ...process.env,
      CLAUDE_CODE_ENTRYPOINT: "local-agent",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const stdoutChunks = [];
  const stderrChunks = [];

  child.stdout.on("data", (chunk) => stdoutChunks.push(chunk));
  child.stderr.on("data", (chunk) => stderrChunks.push(chunk));

  const exitCode = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });

  const stdout = Buffer.concat(stdoutChunks).toString("utf8");
  const stderr = Buffer.concat(stderrChunks).toString("utf8");
  if (exitCode !== 0) {
    throw new Error(
      trimToNull(stderr) || trimToNull(stdout) || `Claude 退出码 ${exitCode}`,
    );
  }

  return extractClaudeResult(stdout, stderr);
}

function extractClaudeRuntimeResult(finalPayload, stderr) {
  if (finalPayload?.success === false) {
    throw new Error(
      trimToNull(finalPayload?.error) ||
        trimToNull(stderr) ||
        "Claude Runtime 执行失败。",
    );
  }

  const text = trimToNull(finalPayload?.rawText) || "（无回复）";
  return {
    text,
    sessionId: trimToNull(finalPayload?.runtimeSessionId),
    metadata:
      finalPayload && typeof finalPayload.metadata === "object"
        ? finalPayload.metadata
        : null,
  };
}

async function runClaudeStreamingTurn({
  runner,
  agent,
  prompt,
  sessionId,
  onPartial,
}) {
  const requestId = `gateway-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const child = spawn(runner.command, runner.baseArgs, {
    cwd: runner.cwd,
    env: {
      ...process.env,
      CLAUDE_CODE_ENTRYPOINT: "local-agent",
    },
    stdio: ["pipe", "pipe", "pipe"],
  });

  const payload = {
    prompt,
    runtimeSessionId: sessionId,
    threadId: null,
    agentId: agent.id,
    agentName: agent.name,
    model: trimToNull(agent?.runtime_profile?.default_model),
    requestId,
    enableGenerativeUi: false,
    outputSurface: "plain-chat",
    maxTurns: 12,
  };

  child.stdin.end(JSON.stringify(payload));

  const stderrChunks = [];
  child.stderr.on("data", (chunk) => stderrChunks.push(chunk));

  let latestPartialText = "";
  let finalPayload = null;
  const stdoutReader = createInterface({ input: child.stdout });
  const stdoutClosed = new Promise((resolve) => {
    stdoutReader.on("close", resolve);
  });

  stdoutReader.on("line", (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    let parsed;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return;
    }

    if (parsed?.type === "partial") {
      const nextText = trimToNull(parsed.rawText) || latestPartialText;
      if (!nextText || nextText === latestPartialText) {
        return;
      }
      latestPartialText = nextText;
      onPartial?.(nextText);
      return;
    }

    if (parsed?.type === "final") {
      finalPayload = parsed;
      return;
    }

    finalPayload = parsed;
  });

  const exitCode = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });
  await stdoutClosed;

  const stderr = Buffer.concat(stderrChunks).toString("utf8");
  if (exitCode !== 0 && !finalPayload) {
    throw new Error(trimToNull(stderr) || `Claude Runtime 退出码 ${exitCode}`);
  }

  const result = extractClaudeRuntimeResult(finalPayload, stderr);
  if (trimToNull(result.text) && result.text !== latestPartialText) {
    onPartial?.(result.text);
  }
  return result;
}

function buildReplyPayload(text, renderMode = "markdown") {
  const safeText = String(text || "").trim() || "（无回复）";
  const block =
    renderMode === "plain"
      ? {
          tag: "text",
          text: safeText,
        }
      : {
          tag: "md",
          text: safeText,
        };
  return {
    content: JSON.stringify({
      zh_cn: {
        content: [[block]],
      },
    }),
    msg_type: "post",
  };
}

async function replyFeishu(client, messageId, text, options = {}) {
  const payload = buildReplyPayload(text, options.renderMode);
  let response;
  try {
    response = await client.im.message.reply({
      path: { message_id: messageId },
      data: payload,
    });
  } catch (error) {
    throw createFeishuApiError("飞书回复失败", error);
  }

  if (response.code !== 0) {
    throw new Error(`飞书回复失败：${response.msg || `code ${response.code}`}`);
  }

  return trimToNull(response.data?.message_id);
}

async function replyFeishuInChunks(client, messageId, text, options = {}) {
  const chunks = splitFeishuReplyText(text);
  let firstMessageId = null;

  for (const chunk of chunks) {
    const nextMessageId = await replyFeishu(client, messageId, chunk, options);
    if (!firstMessageId && nextMessageId) {
      firstMessageId = nextMessageId;
    }
  }

  return firstMessageId;
}

async function callFeishuCardApi(account, request) {
  const token = await getFeishuTenantToken(account);
  const url = `${resolveFeishuApiBase(account.domain)}${request.path}`;
  let response;

  try {
    response = await fetch(url, {
      method: request.method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: request.body ? JSON.stringify(request.body) : undefined,
    });
  } catch (error) {
    throw createFeishuApiError(request.errorPrefix, error);
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.code !== 0) {
    throw createFeishuApiError(request.errorPrefix, {
      message: `HTTP ${response.status}`,
      response: { data: payload },
    });
  }

  return payload?.data ?? payload;
}

async function sendFeishuInteractiveCard({
  client,
  sourceMessageId,
  chatId,
  cardId,
}) {
  const content = JSON.stringify({
    type: "card",
    data: {
      card_id: cardId,
    },
  });

  try {
    const response = await client.im.message.reply({
      path: { message_id: sourceMessageId },
      data: {
        msg_type: "interactive",
        content,
      },
    });
    if (response.code !== 0 || !response.data?.message_id) {
      throw new Error(response.msg || `code ${response.code}`);
    }
    return trimToNull(response.data.message_id);
  } catch (error) {
    log(
      "interactive reply fallback to chat message",
      error instanceof Error ? error.message : String(error),
    );
  }

  let response;
  try {
    response = await client.im.message.create({
      params: { receive_id_type: "chat_id" },
      data: {
        receive_id: chatId,
        msg_type: "interactive",
        content,
      },
    });
  } catch (error) {
    throw createFeishuApiError("飞书发送流式卡片失败", error);
  }

  if (response.code !== 0 || !response.data?.message_id) {
    throw new Error(
      `飞书发送流式卡片失败：${response.msg || `code ${response.code}`}`,
    );
  }

  return trimToNull(response.data.message_id);
}

async function updateFeishuMessage(client, messageId, text, options = {}) {
  const payload = buildReplyPayload(text, options.renderMode);
  let response;
  try {
    response = await client.im.message.update({
      path: { message_id: messageId },
      data: payload,
    });
  } catch (error) {
    throw createFeishuApiError("飞书更新消息失败", error);
  }

  if (response.code !== 0) {
    throw new Error(
      `飞书更新消息失败：${response.msg || `code ${response.code}`}`,
    );
  }

  return response;
}

class FeishuStreamingCardSession {
  constructor({ client, account, sourceMessageId, chatId }) {
    this.client = client;
    this.account = account;
    this.sourceMessageId = sourceMessageId;
    this.chatId = chatId;
    this.state = null;
    this.queue = Promise.resolve();
    this.pendingText = null;
    this.flushTimer = null;
    this.lastUpdateAt = 0;
    this.closed = false;
  }

  isActive() {
    return Boolean(this.state) && !this.closed;
  }

  getMessageId() {
    return trimToNull(this.state?.messageId);
  }

  async start(initialText = "正在思考…") {
    if (this.state) {
      return this.getMessageId();
    }

    const card = await callFeishuCardApi(this.account, {
      method: "POST",
      path: "/cardkit/v1/cards",
      body: {
        type: "card_json",
        data: JSON.stringify({
          schema: "2.0",
          config: {
            streaming_mode: true,
            summary: { content: "[正在生成...]" },
            streaming_config: {
              print_frequency_ms: {
                default: FEISHU_CARD_STREAM_PRINT_FREQUENCY_MS,
              },
              print_step: {
                default: FEISHU_CARD_STREAM_PRINT_STEP,
              },
            },
          },
          body: {
            elements: [
              {
                tag: "markdown",
                content: initialText,
                element_id: "content",
              },
            ],
          },
        }),
      },
      errorPrefix: "创建飞书流式卡片失败",
    });

    const cardId = trimToNull(card?.card_id);
    if (!cardId) {
      throw new Error("创建飞书流式卡片成功，但没有返回 card_id。");
    }

    const messageId = await sendFeishuInteractiveCard({
      client: this.client,
      sourceMessageId: this.sourceMessageId,
      chatId: this.chatId,
      cardId,
    });

    this.state = {
      cardId,
      messageId,
      sequence: 1,
      currentText: initialText,
    };
    this.lastUpdateAt = Date.now();
    return messageId;
  }

  push(text) {
    if (!this.isActive()) return;
    this.pendingText = text;
    const elapsed = Date.now() - this.lastUpdateAt;
    const delay = Math.max(0, FEISHU_CARD_STREAM_UPDATE_THROTTLE_MS - elapsed);
    if (delay === 0) {
      void this.flushPending().catch((error) => {
        log(
          "card streaming update failed",
          error instanceof Error ? error.message : String(error),
        );
      });
      return;
    }
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.flushPending().catch((error) => {
        log(
          "card streaming update failed",
          error instanceof Error ? error.message : String(error),
        );
      });
    }, delay);
  }

  async flushPending(force = false) {
    if (!this.state || !this.pendingText) return;
    const nextText = this.pendingText;
    if (!force && nextText === this.state.currentText) {
      this.pendingText = null;
      return;
    }
    this.pendingText = null;

    this.queue = this.queue.then(async () => {
      if (!this.state) return;
      if (!force && nextText === this.state.currentText) return;
      await this.updateCardContent(nextText);
      this.state.currentText = nextText;
      this.lastUpdateAt = Date.now();
    });
    await this.queue;
  }

  async updateCardContent(text) {
    if (!this.state) return;
    this.state.sequence += 1;
    await callFeishuCardApi(this.account, {
      method: "PUT",
      path: `/cardkit/v1/cards/${this.state.cardId}/elements/content/content`,
      body: {
        content: text,
        sequence: this.state.sequence,
        uuid: `content_${this.state.cardId}_${this.state.sequence}`,
      },
      errorPrefix: "更新飞书流式卡片失败",
    });
  }

  async finalize(finalText, options = {}) {
    if (!this.state) {
      return null;
    }

    this.closed = true;
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    await this.queue.catch(() => {});

    let finalError = null;
    let displayText = this.state.currentText || "正在思考…";
    const nextText = trimToNull(finalText) || displayText;

    if (nextText !== displayText) {
      try {
        await this.updateCardContent(nextText);
        displayText = nextText;
        this.state.currentText = nextText;
      } catch (error) {
        finalError = error;
        const fallbackNotice = trimToNull(options.fallbackNotice);
        if (fallbackNotice && fallbackNotice !== displayText) {
          try {
            await this.updateCardContent(fallbackNotice);
            displayText = fallbackNotice;
            this.state.currentText = fallbackNotice;
          } catch (noticeError) {
            if (!finalError) {
              finalError = noticeError;
            }
          }
        }
      }
    }

    this.state.sequence += 1;
    try {
      await callFeishuCardApi(this.account, {
        method: "PATCH",
        path: `/cardkit/v1/cards/${this.state.cardId}/settings`,
        body: {
          settings: JSON.stringify({
            config: {
              streaming_mode: false,
              summary: {
                content: truncateFeishuCardSummary(displayText),
              },
            },
          }),
          sequence: this.state.sequence,
          uuid: `settings_${this.state.cardId}_${this.state.sequence}`,
        },
        errorPrefix: "关闭飞书流式卡片失败",
      });
    } catch (error) {
      if (!finalError) {
        finalError = error;
      }
    }

    if (finalError) {
      throw finalError;
    }
    return this.getMessageId();
  }
}

function createPlainStreamingReplyManager({ client, sourceMessageId }) {
  let replyMessageId = null;
  let latestText = null;
  let lastSentText = null;
  let lastFlushAt = 0;
  let previewEditCount = 0;
  let flushTimer = null;
  let flushChain = Promise.resolve();
  let closed = false;

  async function flush(force = false) {
    if (!replyMessageId) return;
    const nextText =
      formatStreamingPreview(latestText) || lastSentText || "正在思考…";
    if (!force && nextText === lastSentText) {
      return;
    }

    flushChain = flushChain
      .then(async () => {
        const currentText =
          formatStreamingPreview(latestText) || nextText || "正在思考…";
        if (!force && currentText === lastSentText) {
          return;
        }
        if (!force && previewEditCount >= FEISHU_STREAM_MAX_PREVIEW_EDITS) {
          return;
        }
        await updateFeishuMessage(client, replyMessageId, currentText, {
          renderMode: "plain",
        });
        lastSentText = currentText;
        lastFlushAt = Date.now();
        previewEditCount += 1;
      })
      .catch((error) => {
        log(
          "streaming flush failed",
          error instanceof Error ? error.message : String(error),
        );
      });

    await flushChain;
  }

  function scheduleFlush() {
    if (closed || flushTimer || !replyMessageId) return;
    if (previewEditCount >= FEISHU_STREAM_MAX_PREVIEW_EDITS) return;
    const currentPreview = formatStreamingPreview(latestText);
    const delta = Math.abs(currentPreview.length - (lastSentText || "").length);
    if (delta < FEISHU_STREAM_MIN_CHARS_DELTA) return;
    const elapsed = Date.now() - lastFlushAt;
    const delay = Math.max(0, FEISHU_STREAM_MIN_INTERVAL_MS - elapsed);
    flushTimer = setTimeout(() => {
      flushTimer = null;
      void flush(false);
    }, delay);
  }

  return {
    async start(initialText = "正在思考…") {
      replyMessageId = await replyFeishu(client, sourceMessageId, initialText, {
        renderMode: "plain",
      });
      if (!replyMessageId) {
        throw new Error("飞书回复成功但未返回 message_id，无法开启流式更新。");
      }
      lastSentText = initialText;
      lastFlushAt = Date.now();
      return replyMessageId;
    },
    push(text) {
      latestText = text;
      scheduleFlush();
    },
    async finalize(text) {
      latestText = text;
      closed = true;
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      if (!replyMessageId) {
        return replyMessageId;
      }
      await flushChain.catch(() => {});
      const chunks = splitFeishuReplyText(text);
      log(
        "final reply chunks",
        JSON.stringify({ chunks: chunks.length, textLength: text.length }),
      );
      try {
        await updateFeishuMessage(client, replyMessageId, chunks[0], {
          renderMode: "markdown",
        });
      } catch (error) {
        if (!isFeishuEditLimitError(error)) {
          throw error;
        }
        log("edit limit reached on finalize, falling back to fresh replies");
        replyMessageId = null;
      }

      if (!replyMessageId) {
        replyMessageId = await replyFeishu(client, sourceMessageId, chunks[0], {
          renderMode: "markdown",
        });
      }

      for (const chunk of chunks.slice(1)) {
        await replyFeishu(client, sourceMessageId, chunk, {
          renderMode: "markdown",
        });
      }
      lastSentText = chunks[chunks.length - 1] || text;
      lastFlushAt = Date.now();
      return replyMessageId;
    },
    async fail(text) {
      latestText = text;
      closed = true;
      if (flushTimer) {
        clearTimeout(flushTimer);
        flushTimer = null;
      }
      if (!replyMessageId) {
        replyMessageId = await replyFeishu(client, sourceMessageId, text, {
          renderMode: "plain",
        });
        lastSentText = text;
        lastFlushAt = Date.now();
        return replyMessageId;
      }
      await flush(true);
      return replyMessageId;
    },
  };
}

function createStreamingReplyManager({
  client,
  account,
  sourceMessageId,
  chatId,
}) {
  let mode = "disabled";
  let cardSession = null;

  return {
    async start(initialText = "正在思考…") {
      if (account?.appId && account?.appSecret) {
        cardSession = new FeishuStreamingCardSession({
          client,
          account,
          sourceMessageId,
          chatId,
        });
        try {
          await cardSession.start(initialText);
          mode = "card";
          log("streaming mode", JSON.stringify({ mode: "card", chatId }));
          return true;
        } catch (error) {
          cardSession = null;
          log(
            "card streaming unavailable, fallback to final-only reply",
            error instanceof Error ? error.message : String(error),
          );
        }
      }

      mode = "disabled";
      return false;
    },
    push(text) {
      if (mode === "card" && cardSession?.isActive()) {
        cardSession.push(text);
      }
    },
    async finalize(text) {
      if (mode === "card" && cardSession) {
        try {
          return await cardSession.finalize(text, {
            fallbackNotice: "内容较长，完整回复见下方消息。",
          });
        } catch (error) {
          log(
            "card streaming finalize failed, fallback to chunked replies",
            error instanceof Error ? error.message : String(error),
          );
          return replyFeishuInChunks(client, sourceMessageId, text, {
            renderMode: "markdown",
          });
        }
      }

      return replyFeishuInChunks(client, sourceMessageId, text, {
        renderMode: "markdown",
      });
    },
    async fail(text) {
      if (mode === "card" && cardSession) {
        try {
          return await cardSession.finalize(text);
        } catch (error) {
          log(
            "card streaming error reply failed, fallback to plain message",
            error instanceof Error ? error.message : String(error),
          );
          return replyFeishu(client, sourceMessageId, text, {
            renderMode: "plain",
          });
        }
      }

      return replyFeishu(client, sourceMessageId, text, {
        renderMode: "plain",
      });
    },
  };
}

function enqueueChatTask(conversationKey, task) {
  const previous = chatQueue.get(conversationKey) || Promise.resolve();
  const next = previous
    .catch(() => {})
    .then(task)
    .finally(() => {
      if (chatQueue.get(conversationKey) === next) {
        chatQueue.delete(conversationKey);
      }
    });
  chatQueue.set(conversationKey, next);
  return next;
}

async function handleIncomingMessage({
  hub,
  accountConfig,
  agent,
  botOpenId,
  runner,
  streamingRunner,
  client,
  event,
}) {
  const message = event?.message || {};
  const sender = event?.sender?.sender_id || {};
  const messageId = trimToNull(message.message_id);
  const chatId = trimToNull(message.chat_id);
  const senderOpenId = trimToNull(sender.open_id);
  const senderLabel = trimToNull(
    senderOpenId || sender.user_id || sender.union_id,
  );

  if (!messageId || !chatId) {
    return;
  }

  if (hasSeenMessage(messageId)) {
    return;
  }

  if (senderOpenId && botOpenId && senderOpenId === botOpenId) {
    return;
  }

  const chatType = message.chat_type === "group" ? "group" : "p2p";
  const mentionMatchesBot =
    chatType === "p2p" ||
    (Array.isArray(message.mentions) &&
      message.mentions.some(
        (mention) => trimToNull(mention?.id?.open_id) === botOpenId,
      ));

  if (
    !shouldProcessIncomingMessage({
      policy: accountConfig.policy,
      chatType,
      chatId,
      senderOpenId,
      mentionMatchesBot,
    })
  ) {
    return;
  }

  const body = stripMentions(
    parseMessageText(message.message_type, message.content),
    message.mentions,
  );
  if (!body) {
    return;
  }

  rememberMessage(messageId);

  const conversationKey = resolveConversationKey({
    accountId: accountConfig.accountId,
    route: accountConfig.route,
    chatId,
    agentId: agent.id,
  });
  await enqueueChatTask(conversationKey, async () => {
    const session = await getConversationSession(conversationKey);
    const runtimeSessionId =
      session?.agentId && session.agentId !== agent.id
        ? null
        : trimToNull(session?.runtimeSessionId);
    const streamingEnabled = accountConfig.policy?.streaming === true;
    const prompt = buildAgentPrompt({
      agent,
      senderLabel,
      chatType,
      body,
    });

    await writeState({
      running: true,
      status: "running",
      accountId: accountConfig.accountId,
      agentId: agent.id,
      lastMessageAt: nowIso(),
      lastError: null,
    });

    const streamingReply = streamingEnabled
      ? createStreamingReplyManager({
          client,
          account: accountConfig,
          sourceMessageId: messageId,
          chatId,
        })
      : null;

    try {
      if (session?.agentId && session.agentId !== agent.id) {
        log(
          "agent switched for conversation",
          JSON.stringify({
            conversationKey,
            from: session.agentId,
            to: agent.id,
          }),
        );
      }

      const streamingSessionActive = streamingReply
        ? await streamingReply.start()
        : false;

      const result =
        streamingEnabled && streamingRunner && streamingSessionActive
          ? await runClaudeStreamingTurn({
              runner: streamingRunner,
              agent,
              prompt,
              sessionId: runtimeSessionId,
              onPartial: (partialText) => {
                streamingReply?.push(partialText);
              },
            })
          : await runAgentTurn({
              runner,
              agent,
              prompt,
              sessionId: runtimeSessionId,
            });

      await updateConversationSession(conversationKey, {
        chatId,
        accountId: accountConfig.accountId,
        agentId: agent.id,
        runtimeSessionId: result.sessionId,
        conversationKey,
        threadMode:
          trimToNull(accountConfig.route?.threadMode) || "thread-per-chat",
        lastMessageId: messageId,
      });

      if (streamingReply) {
        await streamingReply.finalize(result.text);
      } else {
        await replyFeishuInChunks(client, messageId, result.text, {
          renderMode: "markdown",
        });
      }
      await writeState({
        running: true,
        status: "running",
        lastReplyAt: nowIso(),
        lastError: null,
      });
      log("reply delivered", JSON.stringify({ chatId, messageId }));
    } catch (error) {
      const messageText =
        error instanceof Error ? error.message : String(error);
      await writeState({
        running: true,
        status: "error",
        lastError: messageText,
      });
      log("message handling failed", messageText);

      try {
        if (streamingReply) {
          await streamingReply.fail(`这边处理消息时出错了：${messageText}`);
        } else {
          await replyFeishu(
            client,
            messageId,
            `这边处理消息时出错了：${messageText}`,
          );
        }
      } catch (replyError) {
        log(
          "failed to send error reply",
          replyError instanceof Error ? replyError.message : String(replyError),
        );
      }
    }
  });
}

async function shutdown(nextStatus = "stopped", nextError = null) {
  if (shuttingDown) return;
  shuttingDown = true;
  if (processKeepAlive) {
    clearInterval(processKeepAlive);
    processKeepAlive = null;
  }
  if (activeWsClient && typeof activeWsClient.close === "function") {
    try {
      activeWsClient.close({ force: true });
    } catch {
      // Ignore shutdown errors from ws client.
    }
    activeWsClient = null;
  }
  await writeState({
    pid: null,
    running: false,
    status: nextStatus,
    lastError: nextError,
  });
  await clearPidFile();
}

async function runFeishuGateway() {
  await ensureDirs();
  await fs.writeFile(pidPath, `${process.pid}\n`, "utf8");
  await writeState({});

  process.on("SIGTERM", () => {
    void shutdown("stopped", null).finally(() => process.exit(0));
  });

  process.on("SIGINT", () => {
    void shutdown("stopped", null).finally(() => process.exit(0));
  });

  process.on("uncaughtException", (error) => {
    const message =
      error instanceof Error ? error.stack || error.message : String(error);
    void shutdown("error", message).finally(() => process.exit(1));
  });

  process.on("unhandledRejection", (error) => {
    const message =
      error instanceof Error ? error.stack || error.message : String(error);
    void shutdown("error", message).finally(() => process.exit(1));
  });

  const hub = await loadHubConfig();
  const feishu = resolvePrimaryFeishuAccount(hub);

  if (!feishu.enabled) {
    await writeState({
      status: "stopped",
      running: false,
      lastError: "飞书渠道未启用。",
    });
    return;
  }

  if (feishu.transport !== "websocket") {
    throw new Error(
      `当前只支持 WebSocket 长连，收到 transport=${feishu.transport}`,
    );
  }

  if (!feishu.account.enabled) {
    throw new Error("飞书账号已被禁用。");
  }

  if (!feishu.account.appId || !feishu.account.appSecret) {
    throw new Error("飞书 App ID / App Secret 未配置完整。");
  }

  const agentId = trimToNull(feishu.route.defaultAgentId);
  if (!agentId) {
    throw new Error("还没有为飞书渠道选择处理智能体。");
  }

  const agent = resolveSelectedAgent(hub, agentId);
  if (!agent) {
    throw new Error(`未找到智能体：${agentId}`);
  }

  if (trimToNull(agent?.runtime_profile?.runtime_family) !== "claude-code") {
    throw new Error(
      `当前 ${gatewayKind} gateway worker 只支持 claude-code 运行时，收到 ${agent?.runtime_profile?.runtime_family || "unknown"}`,
    );
  }

  const runner = buildRunner(projectRoot);
  const streamingRunner =
    feishu.policy?.streaming === true
      ? buildClaudeRuntimeRunner(projectRoot)
      : null;
  const client = createFeishuClient(feishu.account);
  const botOpenId = await fetchBotOpenId(feishu.account);

  await writeState({
    status: "running",
    running: true,
    accountId: feishu.accountId,
    agentId,
    transport: feishu.transport,
    runtimeBackend: streamingRunner ? streamingRunner.kind : runner.kind,
    runtimeBackendDetail: streamingRunner
      ? streamingRunner.detail
      : runner.detail,
    botOpenId,
    lastError: null,
  });

  const dispatcher = new Lark.EventDispatcher({
    encryptKey: feishu.account.encryptKey || undefined,
    verificationToken: feishu.account.verificationToken || undefined,
  });

  dispatcher.register({
    "im.message.receive_v1": async (payload) => {
      await handleIncomingMessage({
        hub,
        accountConfig: {
          ...feishu.account,
          accountId: feishu.accountId,
          policy: feishu.policy,
          route: feishu.route,
        },
        agent,
        botOpenId,
        runner,
        streamingRunner,
        client,
        event: payload,
      });
    },
  });

  const wsClient = createFeishuWsClient(feishu.account);
  activeWsClient = wsClient;
  if (!processKeepAlive) {
    processKeepAlive = setInterval(() => {
      // Keep the background gateway process alive while the Feishu SDK
      // completes its async WebSocket bootstrap and manages reconnects.
    }, 60_000);
  }
  await wsClient.start({ eventDispatcher: dispatcher });
  log(
    "feishu gateway started",
    JSON.stringify({ accountId: feishu.accountId, backend: runner.kind }),
  );
}

export async function startGatewayWorker(options = {}) {
  const kind = trimToNull(options.kind) || gatewayKind;
  if (kind !== "feishu") {
    throw new Error(`当前暂不支持 gateway kind: ${kind}`);
  }
  await runFeishuGateway();
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    await startGatewayWorker();
  } catch (error) {
    const message =
      error instanceof Error ? error.stack || error.message : String(error);
    await shutdown("error", message);
    process.exit(1);
  }
}
