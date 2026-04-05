import type { DetectedAgent } from "@/lib/types/agents";
import { parseMessageContent } from "@/lib/chat/message-blocks";
import type {
  RuntimeAdapter,
  RuntimeCapabilities,
  RuntimeSendResult,
  RuntimeSessionMode,
} from "@/lib/runtime/types";

const SHELL_TIMEOUT_SECS = 120;

function buildCapabilities(overrides: Partial<RuntimeCapabilities>): RuntimeCapabilities {
  return {
    native_sessions: false,
    memory_tool: false,
    configurable_bootstrap: false,
    structured_output: false,
    streaming_output: false,
    ...overrides,
  };
}

function escapeShellPrompt(prompt: string) {
  return prompt
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/`/g, "\\`")
    .replace(/\$/g, "\\$");
}

function buildOpenClawSessionKey(threadId: string, agentId: string) {
  return `agenthub-${agentId}-${threadId}`;
}

function compactRuntimeError(...chunks: Array<string | null | undefined>) {
  const merged = chunks
    .filter((chunk): chunk is string => typeof chunk === "string" && chunk.trim().length > 0)
    .flatMap((chunk) => chunk.split("\n"))
    .map((line) => line.trim())
    .filter(
      (line) =>
        line.length > 0 &&
        !line.startsWith("[plugins]") &&
        !line.startsWith("Config warnings:") &&
        !line.startsWith("- plugins."),
    );

  if (!merged.length) return null;
  return merged.slice(0, 6).join("\n");
}

async function invokeCore<T>(command: string, args: Record<string, unknown>) {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}

async function runShellPrompt(command: string) {
  return invokeCore<{ stdout: string; success: boolean }>("run_shell_cmd", {
    command,
    timeoutSecs: SHELL_TIMEOUT_SECS,
  });
}

function parseOpenClawResponse(
  result: { stdout: string; stderr?: string; success: boolean; json?: unknown },
  fallbackRuntimeSessionId: string | null,
): RuntimeSendResult {
  let runtimeSessionId = fallbackRuntimeSessionId;

  if (result.json) {
    const data = result.json as Record<string, unknown>;
    const runtime = (data.result as Record<string, unknown>) ?? {};
    runtimeSessionId =
      typeof runtime.sessionId === "string" ? runtime.sessionId : runtimeSessionId;
    const payloads = (runtime.payloads || []) as { text?: string }[];
    const rawText = payloads.map((payload) => payload.text || "").join("\n").trim() || "（无回复）";
    const parsed = parseMessageContent(rawText);
    return {
      rawText,
      parsedBlocks: parsed.blocks,
      runtimeSessionId,
    };
  }

  if (result.stdout) {
    const lines = result.stdout.split("\n").filter((line) => line.trim().startsWith("{"));
    const jsonLine = lines.pop();
    if (jsonLine) {
      try {
        const data = JSON.parse(jsonLine) as {
          result?: { payloads?: { text?: string }[]; sessionId?: string };
        };
        runtimeSessionId =
          typeof data.result?.sessionId === "string" ? data.result.sessionId : runtimeSessionId;
        const payloads = data.result?.payloads || [];
        const rawText = payloads.map((payload) => payload.text || "").join("\n").trim() || "（无回复）";
        const parsed = parseMessageContent(rawText);
        return {
          rawText,
          parsedBlocks: parsed.blocks,
          runtimeSessionId,
        };
      } catch {
        return { rawText: "（解析失败）", parsedBlocks: [], runtimeSessionId };
      }
    }
  }

  if (!result.success) {
    const runtimeError = compactRuntimeError(result.stderr, result.stdout);
    if (runtimeError) {
      return {
        rawText: runtimeError,
        parsedBlocks: [],
        runtimeSessionId,
      };
    }
  }

  return {
    rawText: result.success ? "（无回复）" : "（Gateway 未响应）",
    parsedBlocks: [],
    runtimeSessionId,
  };
}

const openClawRuntime: RuntimeAdapter = {
  id: "openclaw",
  label: "OpenClaw Runtime",
  sessionMode: "native",
  capabilities: buildCapabilities({
    native_sessions: true,
    configurable_bootstrap: true,
  }),
  async sendMessage({ agent, threadId, agentId, prompt, runtimeSessionId }) {
    const idKey = `hub-${Date.now()}`;
    const params: Record<string, unknown> = {
      message: prompt,
      agentId: "main",
      idempotencyKey: idKey,
    };

    if (runtimeSessionId) {
      params.sessionId = runtimeSessionId;
    } else {
      params.sessionKey = buildOpenClawSessionKey(threadId, agentId);
    }

    const result = await invokeCore<{ stdout: string; stderr?: string; success: boolean; json?: unknown }>(
      "run_openclaw_cmd",
      {
        args: [
          "gateway",
          "call",
          "agent",
          "--params",
          JSON.stringify(params),
          "--json",
          "--expect-final",
          "--timeout",
          "90000",
        ],
        configPath: agent.config_path !== "default" ? agent.config_path : null,
      },
    );

    return parseOpenClawResponse(result, runtimeSessionId);
  },
};

const claudeCodeRuntime: RuntimeAdapter = {
  id: "claude-code",
  label: "Claude Code Runtime",
  sessionMode: "native",
  capabilities: buildCapabilities({
    native_sessions: true,
    memory_tool: true,
    configurable_bootstrap: true,
    structured_output: true,
    streaming_output: true,
  }),
  async sendMessage({ prompt, runtimeSessionId, threadId, agentId, agent, requestId }) {
    const { invoke } = await import("@tauri-apps/api/core");
    const result = await invoke<{
      stdout: string;
      stderr: string;
      success: boolean;
      json?: {
        success?: boolean;
        error?: string;
        rawText?: string;
        runtimeSessionId?: string | null;
        metadata?: Record<string, unknown>;
      };
    }>("run_claude_sdk_cmd", {
      payload: {
        prompt,
        runtimeSessionId,
        threadId,
        agentId,
        agentName: agent.name,
        model: agent.runtime_profile?.default_model ?? null,
        requestId,
        enableGenerativeUi: agent.id === "dolphin",
        outputSurface: "plain-chat",
        maxTurns: 12,
      },
    });

    const rawText =
      (result.json?.rawText && String(result.json.rawText).trim()) ||
      (result.json?.error ? `Claude Runtime 错误：${result.json.error}` : "") ||
      result.stdout.trim() ||
      (result.success ? "（无回复或超时）" : "Claude Runtime 调用失败");
    const parsed = parseMessageContent(rawText);
    return {
      rawText,
      parsedBlocks: parsed.blocks,
      runtimeSessionId: result.json?.runtimeSessionId ?? runtimeSessionId ?? null,
      metadata: (result.json?.metadata as RuntimeSendResult["metadata"]) ?? undefined,
    };
  },
};

function resolveRuntimeFamily(agent?: DetectedAgent | null) {
  return agent?.runtime_family || agent?.runtime_profile?.runtime_family || agent?.agent_type;
}

const codexRuntime: RuntimeAdapter = {
  id: "codex",
  label: "Codex Runtime",
  sessionMode: "stateless",
  capabilities: buildCapabilities({
    configurable_bootstrap: true,
  }),
  async sendMessage({ prompt }) {
    const escaped = escapeShellPrompt(prompt);
    const result = await runShellPrompt(`codex exec "${escaped}" 2>/dev/null`);
    const rawText = result.success && result.stdout.trim() ? result.stdout.trim() : "（无回复或超时）";
    const parsed = parseMessageContent(rawText);
    return {
      rawText,
      parsedBlocks: parsed.blocks,
      runtimeSessionId: null,
    };
  },
};

const openCodeRuntime: RuntimeAdapter = {
  id: "opencode",
  label: "OpenCode Runtime",
  sessionMode: "stateless",
  capabilities: buildCapabilities({
    configurable_bootstrap: true,
  }),
  async sendMessage({ prompt }) {
    const escaped = escapeShellPrompt(prompt);
    const result = await runShellPrompt(`opencode run "${escaped}" 2>/dev/null`);
    const rawText = result.success && result.stdout.trim() ? result.stdout.trim() : "（无回复或超时）";
    const parsed = parseMessageContent(rawText);
    return {
      rawText,
      parsedBlocks: parsed.blocks,
      runtimeSessionId: null,
    };
  },
};

const fallbackRuntime: RuntimeAdapter = {
  id: "unsupported",
  label: "Unsupported Runtime",
  sessionMode: "stateless",
  capabilities: buildCapabilities({}),
  async sendMessage() {
    return {
      rawText: "该 Agent 暂不支持对话",
      parsedBlocks: [],
      runtimeSessionId: null,
    };
  },
};

export function getRuntimeAdapter(agent?: DetectedAgent | null): RuntimeAdapter {
  switch (resolveRuntimeFamily(agent)) {
    case "openclaw":
      return openClawRuntime;
    case "claude-code":
      return claudeCodeRuntime;
    case "codex":
      return codexRuntime;
    case "opencode":
      return openCodeRuntime;
    default:
      return fallbackRuntime;
  }
}

export function getRuntimeSessionMode(agent?: DetectedAgent | null): RuntimeSessionMode {
  return getRuntimeAdapter(agent).sessionMode;
}

export function usesNativeRuntimeSession(agent?: DetectedAgent | null) {
  return getRuntimeAdapter(agent).capabilities.native_sessions;
}
