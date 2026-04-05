function defaultNowIso() {
  return new Date().toISOString();
}

function defaultNextId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function requiredString(value, fieldName) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${fieldName} is required`);
  }
  return value.trim();
}

function optionalString(value) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function buildEventRecord({
  threadId,
  boardVersion,
  eventType,
  title,
  body,
  agentId,
  sessionId,
  payload,
  eventId,
  createdAt,
}) {
  return {
    id: eventId,
    thread_id: threadId,
    board_version: boardVersion,
    event_type: eventType,
    title,
    body,
    agent_id: agentId || null,
    session_id: sessionId || null,
    task_id: null,
    payload,
    created_at: createdAt,
  };
}

export function createVoiceThreadMemoryStore({
  hub,
  loadHub = async () => hub,
  writeHubConfig = async () => {},
  nextId = defaultNextId,
  now = defaultNowIso,
} = {}) {
  if (!hub && typeof loadHub !== "function") {
    throw new TypeError("hub or loadHub is required");
  }

  const bindings = new Map();

  function bindCall({ callId, threadId, agentId = null, sessionId = null }) {
    const normalizedCallId = requiredString(callId, "callId");
    const normalizedThreadId = requiredString(threadId, "threadId");
    bindings.set(normalizedCallId, {
      threadId: normalizedThreadId,
      agentId: optionalString(agentId),
      sessionId: optionalString(sessionId),
      lastUserText: null,
      lastAssistantText: null,
    });
  }

  function unbindCall(callId) {
    const normalizedCallId = requiredString(callId, "callId");
    bindings.delete(normalizedCallId);
  }

  async function recordInteraction(interaction) {
    const normalizedCallId = requiredString(interaction?.callId, "interaction.callId");
    const binding = bindings.get(normalizedCallId);
    if (!binding) {
      return null;
    }

    const resolvedHub = await loadHub();
    if (!resolvedHub || typeof resolvedHub !== "object") {
      return null;
    }

    const collaboration = resolvedHub.collaboration || (resolvedHub.collaboration = {});
    collaboration.threads ||= [];
    collaboration.boards ||= [];
    collaboration.events ||= [];

    const thread = collaboration.threads.find((item) => item.id === binding.threadId);
    if (!thread) {
      return null;
    }

    const text = optionalString(interaction?.text);
    if (!text) {
      return null;
    }

    const kind = requiredString(interaction?.kind, "interaction.kind");
    if (kind !== "user_final" && kind !== "assistant_final") {
      return null;
    }

    if (kind === "user_final" && binding.lastUserText === text) {
      return null;
    }
    if (kind === "assistant_final" && binding.lastAssistantText === text) {
      return null;
    }

    const board = collaboration.boards.find((item) => item.id === thread.board_id);
    const boardVersion = Number(board?.version || 1);
    const createdAt = optionalString(interaction?.occurredAt) || now();
    thread.updated_at = createdAt;

    const event = buildEventRecord({
      threadId: binding.threadId,
      boardVersion,
      eventType: kind === "user_final" ? "user_message" : "assistant_message",
      title: kind === "user_final" ? "语音通话转写" : "语音通话回复",
      body: text,
      agentId: binding.agentId,
      sessionId: binding.sessionId,
      payload: {
        source: "voice-call",
        providerId: optionalString(interaction?.providerId),
        modelId: optionalString(interaction?.modelId),
        callId: normalizedCallId,
      },
      eventId: nextId("event"),
      createdAt,
    });

    collaboration.events.push(event);

    if (kind === "user_final") {
      binding.lastUserText = text;
    } else {
      binding.lastAssistantText = text;
    }

    await writeHubConfig(resolvedHub);

    return event;
  }

  return {
    bindCall,
    unbindCall,
    recordInteraction,
  };
}
