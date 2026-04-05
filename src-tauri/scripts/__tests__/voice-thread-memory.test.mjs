import test from "node:test";
import assert from "node:assert/strict";

import { createVoiceThreadMemoryStore } from "../voice-thread-memory.mjs";

function createIdFactory() {
  let counter = 0;
  return (prefix) => `${prefix}_${String(++counter).padStart(3, "0")}`;
}

test("voice thread memory store persists one final user and assistant event for a bound call", async () => {
  const hub = {
    collaboration: {
      threads: [
        {
          id: "thread_123",
          title: "语音测试",
          goal: "测试语音记忆",
          status: "active",
          primary_agent_id: "dolphin",
          board_id: "board_123",
          created_at: "2026-04-05T13:00:00.000Z",
          updated_at: "2026-04-05T13:00:00.000Z",
        },
      ],
      boards: [
        {
          id: "board_123",
          thread_id: "thread_123",
          version: 1,
          objective: "测试语音记忆",
          current_focus: null,
          summary: "",
          decisions: [],
          open_questions: [],
          key_files: [],
          artifacts: [],
          updated_by: null,
          updated_at: "2026-04-05T13:00:00.000Z",
        },
      ],
      tasks: [],
      sessions: [
        {
          id: "session_123",
          thread_id: "thread_123",
          agent_id: "dolphin",
          runtime_session_id: null,
          mode: "native",
          status: "idle",
          last_seen_board_version: 1,
          last_handoff_version: 0,
          created_at: "2026-04-05T13:00:00.000Z",
          updated_at: "2026-04-05T13:00:00.000Z",
        },
      ],
      events: [],
    },
  };

  const store = createVoiceThreadMemoryStore({
    hub,
    nextId: createIdFactory(),
    now: () => "2026-04-05T13:11:00.000Z",
  });

  store.bindCall({
    callId: "call_voice_1",
    threadId: "thread_123",
    agentId: "dolphin",
    sessionId: "session_123",
  });

  await store.recordInteraction({
    callId: "call_voice_1",
    kind: "user_final",
    text: "你好，帮我记一下这件事。",
    providerId: "volcengine",
    modelId: "O",
    occurredAt: "2026-04-05T13:11:00.000Z",
  });

  await store.recordInteraction({
    callId: "call_voice_1",
    kind: "assistant_final",
    text: "好的，我已经记下来了。",
    providerId: "volcengine",
    modelId: "O",
    occurredAt: "2026-04-05T13:11:01.000Z",
  });

  await store.recordInteraction({
    callId: "call_voice_1",
    kind: "assistant_final",
    text: "好的，我已经记下来了。",
    providerId: "volcengine",
    modelId: "O",
    occurredAt: "2026-04-05T13:11:02.000Z",
  });

  assert.deepEqual(
    hub.collaboration.events.map((event) => ({
      eventType: event.event_type,
      threadId: event.thread_id,
      sessionId: event.session_id,
      agentId: event.agent_id,
      body: event.body,
      payload: event.payload,
    })),
    [
      {
        eventType: "user_message",
        threadId: "thread_123",
        sessionId: "session_123",
        agentId: "dolphin",
        body: "你好，帮我记一下这件事。",
        payload: {
          source: "voice-call",
          providerId: "volcengine",
          modelId: "O",
          callId: "call_voice_1",
        },
      },
      {
        eventType: "assistant_message",
        threadId: "thread_123",
        sessionId: "session_123",
        agentId: "dolphin",
        body: "好的，我已经记下来了。",
        payload: {
          source: "voice-call",
          providerId: "volcengine",
          modelId: "O",
          callId: "call_voice_1",
        },
      },
    ],
  );
});
