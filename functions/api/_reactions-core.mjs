export const REACTION_KEYS = ["like", "useful", "reread"];

export const emptyReactionCounts = () =>
  Object.fromEntries(REACTION_KEYS.map((key) => [key, 0]));

export const normalizePath = (value) => {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.length > 240 || trimmed.includes("..")) {
    return "";
  }
  return trimmed;
};

export const normalizeReaction = (value) =>
  REACTION_KEYS.includes(value) ? value : "";

export const rowsToReactionCounts = (rows) => {
  const counts = emptyReactionCounts();
  for (const row of rows || []) {
    const key = normalizeReaction(row.reaction);
    if (key) {
      counts[key] = Math.max(0, Number(row.count) || 0);
    }
  }
  return counts;
};

export const applyReactionDelta = (counts, previousReaction, nextReaction) => {
  const nextCounts = { ...emptyReactionCounts(), ...counts };
  const previous = normalizeReaction(previousReaction);
  const next = normalizeReaction(nextReaction);

  if (previous && previous !== next) {
    nextCounts[previous] = Math.max(0, (Number(nextCounts[previous]) || 0) - 1);
  }
  if (next && previous !== next) {
    nextCounts[next] = Math.max(0, (Number(nextCounts[next]) || 0) + 1);
  }

  return nextCounts;
};
