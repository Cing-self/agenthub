import test from "node:test";
import assert from "node:assert/strict";

import { buildClaudeQueryOptions } from "../claude-runtime.mjs";

test("buildClaudeQueryOptions disables thinking for remote bridge chat turns", () => {
  const options = buildClaudeQueryOptions({
    payload: {
      prompt: "Reply with exactly: relay-text-turn-ok",
      agentName: "dolphin",
      outputSurface: "plain-chat",
    },
    bundle: {
      thread: {
        title: "Relay Demo Session",
      },
    },
    agenthubServer: { name: "agenthub-test" },
  });

  assert.deepEqual(options.thinking, {
    type: "disabled",
  });
  assert.deepEqual(
    options.tools,
    [],
    "plain-chat turns should not expose Claude Code built-in tools",
  );
  assert.equal(typeof options.systemPrompt, "string");
  assert.match(options.systemPrompt, /Relay Demo Session/);
  assert.match(options.systemPrompt, /external chat surface/);
});

test("buildClaudeQueryOptions keeps Claude Code tools for agenthub widget chat", () => {
  const options = buildClaudeQueryOptions({
    payload: {
      prompt: "Inspect the current repository",
      agentName: "dolphin",
      outputSurface: "agenthub-chat",
    },
    bundle: {
      thread: {
        title: "Desktop Agent Chat",
      },
    },
    agenthubServer: { name: "agenthub-test" },
  });

  assert.deepEqual(options.tools, {
    type: "preset",
    preset: "claude_code",
  });
});

test("buildClaudeQueryOptions ignores inherited Anthropic overrides for claude-subscription auth", () => {
  const previousApiKey = process.env.ANTHROPIC_API_KEY;
  const previousBaseUrl = process.env.ANTHROPIC_BASE_URL;
  const previousModel = process.env.ANTHROPIC_MODEL;

  process.env.ANTHROPIC_API_KEY = "sk-test-insufficient-balance";
  process.env.ANTHROPIC_BASE_URL = "https://api.siliconflow.cn/";
  process.env.ANTHROPIC_MODEL = "Pro/deepseek-ai/DeepSeek-V3.1";

  try {
    const options = buildClaudeQueryOptions({
      payload: {
        prompt: "Reply with exactly: relay-text-turn-ok",
        agentName: "dolphin",
        authSource: "claude-subscription",
      },
      bundle: {
        thread: {
          title: "Relay Demo Session",
        },
      },
      agenthubServer: { name: "agenthub-test" },
    });

    assert.equal(options.env.ANTHROPIC_API_KEY, undefined);
    assert.equal(options.env.ANTHROPIC_BASE_URL, undefined);
    assert.equal(options.env.ANTHROPIC_MODEL, undefined);
  } finally {
    if (previousApiKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = previousApiKey;

    if (previousBaseUrl === undefined) delete process.env.ANTHROPIC_BASE_URL;
    else process.env.ANTHROPIC_BASE_URL = previousBaseUrl;

    if (previousModel === undefined) delete process.env.ANTHROPIC_MODEL;
    else process.env.ANTHROPIC_MODEL = previousModel;
  }
});
