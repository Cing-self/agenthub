const FILE_REF_PATTERN = /(?:\/[\w.-]+)+\/[\w.-]+|(?:[\w.-]+\/)+[\w.-]+\.[a-zA-Z0-9]+/g;

function slashCount(value) {
  return (value.match(/\//g) || []).length;
}

function hasFileExtension(value) {
  return /\.[a-zA-Z0-9]+$/.test(value);
}

function isAbsolutePathRef(value) {
  return value.startsWith("/");
}

export function isMeaningfulFileRef(value) {
  const normalized = String(value || "").trim();
  if (!normalized) return false;

  if (!normalized.includes("/")) return false;

  if (!isAbsolutePathRef(normalized)) {
    return hasFileExtension(normalized);
  }

  if (hasFileExtension(normalized)) {
    return true;
  }

  return slashCount(normalized) >= 3 || /[a-z]/.test(normalized);
}

export function filterMeaningfulFileRefs(values) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => String(value || "").trim())
        .filter((value) => value.length > 0 && isMeaningfulFileRef(value)),
    ),
  );
}

export function extractFileRefs(...texts) {
  const refs = texts
    .flatMap((text) => String(text || "").match(FILE_REF_PATTERN) ?? []);

  return filterMeaningfulFileRefs(refs).slice(0, 6);
}
