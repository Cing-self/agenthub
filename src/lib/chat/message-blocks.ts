import type { MessageBlock, MessagePart, ParsedMessageContent } from "@/lib/types/chat";

function findJsonEnd(source: string, startIndex: number) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = startIndex; index < source.length; index += 1) {
    const char = source[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === "\\" && inString) {
      escaped = true;
      continue;
    }

    if (char === "\"") {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === "{") depth += 1;
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : undefined;
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function extractJsonStringValue(source: string, key: string) {
  const keyIndex = source.indexOf(`"${key}"`);
  if (keyIndex === -1) return null;

  const colonIndex = source.indexOf(":", keyIndex);
  if (colonIndex === -1) return null;

  let quoteIndex = colonIndex + 1;
  while (quoteIndex < source.length && /\s/.test(source[quoteIndex])) {
    quoteIndex += 1;
  }

  if (source[quoteIndex] !== "\"") return null;

  let value = "";
  let escaped = false;

  for (let index = quoteIndex + 1; index < source.length; index += 1) {
    const char = source[index];

    if (escaped) {
      switch (char) {
        case "n":
          value += "\n";
          break;
        case "r":
          value += "\r";
          break;
        case "t":
          value += "\t";
          break;
        case "\"":
          value += "\"";
          break;
        case "\\":
          value += "\\";
          break;
        case "/":
          value += "/";
          break;
        default:
          value += char;
          break;
      }
      escaped = false;
      continue;
    }

    if (char === "\\") {
      escaped = true;
      continue;
    }

    if (char === "\"") {
      return {
        value,
        closed: true,
      };
    }

    value += char;
  }

  return {
    value,
    closed: false,
  };
}

function extractPartialWidgetBlock(source: string) {
  const title = extractJsonStringValue(source, "title")?.value?.trim() || undefined;
  const caption = extractJsonStringValue(source, "caption")?.value?.trim() || undefined;
  const widgetCodeResult = extractJsonStringValue(source, "widget_code");
  const widgetCode = widgetCodeResult?.value?.trim() || "";

  if (!widgetCode) return null;

  return {
    type: "sandbox_widget",
    title,
    caption,
    widget_code: widgetCode,
    partial: !(widgetCodeResult?.closed ?? false),
  } as MessageBlock;
}

function normalizeBlock(value: unknown): MessageBlock | null {
  if (!isPlainObject(value)) {
    return null;
  }

  const blockType =
    typeof value.type === "string"
      ? value.type
      : typeof value.widget_code === "string"
        ? "sandbox_widget"
        : null;

  if (!blockType) {
    return null;
  }

  switch (blockType) {
    case "weather_card": {
      if (!isPlainObject(value.data) || typeof value.data.location !== "string") return null;
      return {
        type: "weather_card",
        title: asOptionalString(value.title),
        data: {
          location: value.data.location,
          timezone: asOptionalString(value.data.timezone),
          condition: asOptionalString(value.data.condition) ?? "天气变化",
          temperature_c: asNumber(value.data.temperature_c) ?? 0,
          feels_like_c: asNumber(value.data.feels_like_c),
          wind_speed_kmh: asNumber(value.data.wind_speed_kmh),
          high_c: asNumber(value.data.high_c),
          low_c: asNumber(value.data.low_c),
          updated_at: asOptionalString(value.data.updated_at),
          daily: Array.isArray(value.data.daily)
            ? value.data.daily
                .filter(isPlainObject)
                .map((item) => ({
                  date: asOptionalString(item.date) ?? "",
                  high_c: asNumber(item.high_c) ?? 0,
                  low_c: asNumber(item.low_c) ?? 0,
                  condition: asOptionalString(item.condition) ?? "天气变化",
                }))
                .filter((item) => item.date)
            : undefined,
        },
      } as MessageBlock;
    }
    case "memory_card": {
      if (!isPlainObject(value.data) || !Array.isArray(value.data.items)) return null;
      const items = value.data.items
        .filter(isPlainObject)
        .map((item) => {
          const content =
            asOptionalString(item.content) ??
            [asOptionalString(item.title), asOptionalString(item.description), asOptionalString(item.summary)]
              .filter(Boolean)
              .join("：")
              .trim();
          if (!content) return null;
          return {
            id: asOptionalString(item.id),
            content,
            scope: asOptionalString(item.scope),
            updated_at: asOptionalString(item.updated_at),
            tags: Array.isArray(item.tags)
              ? item.tags.filter((tag): tag is string => typeof tag === "string" && tag.trim().length > 0)
              : undefined,
          };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item));

      return {
        type: "memory_card",
        title: asOptionalString(value.title),
        data: {
          query: asOptionalString(value.data.query),
          items,
        },
      } as MessageBlock;
    }
    case "task_board_card":
      if (
        !isPlainObject(value.data) ||
        typeof value.data.thread_title !== "string" ||
        !Array.isArray(value.data.tasks)
      ) {
        return null;
      }
      return {
        type: "task_board_card",
        title: asOptionalString(value.title),
        data: {
          thread_title: value.data.thread_title,
          objective: asOptionalString(value.data.objective) ?? "",
          current_focus: asOptionalString(value.data.current_focus),
          summary: asOptionalString(value.data.summary),
          open_questions: Array.isArray(value.data.open_questions)
            ? value.data.open_questions.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
            : undefined,
          key_files: Array.isArray(value.data.key_files)
            ? value.data.key_files.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
            : undefined,
          artifacts: Array.isArray(value.data.artifacts)
            ? value.data.artifacts
                .filter(isPlainObject)
                .map((item) => ({
                  title: asOptionalString(item.title) ?? "",
                  ref: asOptionalString(item.ref) ?? "",
                  kind: asOptionalString(item.kind),
                }))
                .filter((item) => item.title && item.ref)
            : undefined,
          tasks: value.data.tasks
            .filter(isPlainObject)
            .map((item) => ({
              title: asOptionalString(item.title) ?? "未命名任务",
              status: asOptionalString(item.status) ?? "unknown",
              assigned_agent_id: asOptionalString(item.assigned_agent_id),
              priority: asOptionalString(item.priority),
            })),
        },
      } as MessageBlock;
    case "sandbox_widget":
      if (typeof value.widget_code !== "string") return null;
      return {
        type: "sandbox_widget",
        title: asOptionalString(value.title),
        caption: asOptionalString(value.caption),
        widget_code: value.widget_code,
        partial: value.partial === true,
      } as MessageBlock;
    default:
      return null;
  }
}

function buildText(parts: MessagePart[]) {
  return parts
    .filter((part): part is Extract<MessagePart, { type: "text" }> => part.type === "text")
    .map((part) => part.content)
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function parseMessageContent(rawText: string): ParsedMessageContent {
  const source = rawText ?? "";
  const parts: MessagePart[] = [];
  const blocks: MessageBlock[] = [];

  const markerRegex = /```show-widget\s*\n?/g;
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = markerRegex.exec(source)) !== null) {
    const before = source.slice(cursor, match.index).trim();
    if (before) {
      parts.push({ type: "text", content: before });
    }

    const jsonStart = source.indexOf("{", markerRegex.lastIndex);
    if (jsonStart === -1) {
      const fallback = source.slice(match.index).trim();
      if (fallback) {
        parts.push({ type: "text", content: fallback });
      }
      cursor = source.length;
      break;
    }

    const jsonEnd = findJsonEnd(source, jsonStart);
    if (jsonEnd === -1) {
      const partialSource = source.slice(jsonStart);
      const partialBlock = extractPartialWidgetBlock(partialSource);
      if (partialBlock) {
        blocks.push(partialBlock);
        parts.push({ type: "block", block: partialBlock });
        cursor = source.length;
        break;
      }

      const fallback = source.slice(match.index).trim();
      if (fallback) {
        parts.push({ type: "text", content: fallback });
      }
      cursor = source.length;
      break;
    }

    const fenceEnd = source.indexOf("```", jsonEnd + 1);
    if (fenceEnd === -1) {
      const partialSource = source.slice(jsonStart);
      const partialBlock = extractPartialWidgetBlock(partialSource);
      if (partialBlock) {
        blocks.push(partialBlock);
        parts.push({ type: "block", block: partialBlock });
        cursor = source.length;
        break;
      }

      const fallback = source.slice(match.index).trim();
      if (fallback) {
        parts.push({ type: "text", content: fallback });
      }
      cursor = source.length;
      break;
    }

    const jsonText = source.slice(jsonStart, jsonEnd + 1);

    try {
      const parsed = JSON.parse(jsonText);
      const block = normalizeBlock(parsed);
      if (!block) {
        cursor = match.index;
        continue;
      }

      blocks.push(block);
      parts.push({ type: "block", block });
      cursor = fenceEnd + 3;
      markerRegex.lastIndex = cursor;
    } catch {
      cursor = match.index;
    }
  }

  const trailing = source.slice(cursor).trim();
  if (trailing) {
    parts.push({ type: "text", content: trailing });
  }

  if (parts.length === 0) {
    parts.push({ type: "text", content: source.trim() });
  }

  return {
    rawText: source,
    text: buildText(parts),
    blocks,
    parts,
  };
}
