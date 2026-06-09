import test from "node:test";
import assert from "node:assert/strict";

import {
  REACTION_KEYS,
  applyReactionDelta,
  emptyReactionCounts,
  normalizePath,
  normalizeReaction,
  rowsToReactionCounts,
} from "../functions/api/_reactions-core.mjs";

test("normalizes only safe post paths", () => {
  assert.equal(normalizePath("/posts/example/"), "/posts/example/");
  assert.equal(normalizePath("posts/example/"), "");
  assert.equal(normalizePath("/posts/../secret"), "");
  assert.equal(normalizePath("/".repeat(300)), "");
});

test("normalizes only supported reaction keys", () => {
  assert.deepEqual(REACTION_KEYS, ["like", "useful", "reread"]);
  assert.equal(normalizeReaction("like"), "like");
  assert.equal(normalizeReaction("unknown"), "");
  assert.equal(normalizeReaction(null), "");
});

test("converts D1 rows to a complete count object", () => {
  const counts = rowsToReactionCounts([
    { reaction: "like", count: 2 },
    { reaction: "reread", count: 1 },
    { reaction: "ignored", count: 99 },
  ]);

  assert.deepEqual(counts, { like: 2, useful: 0, reread: 1 });
});

test("applies client reaction changes without negative counts", () => {
  const counts = { ...emptyReactionCounts(), like: 1 };
  assert.deepEqual(applyReactionDelta(counts, "like", "useful"), {
    like: 0,
    useful: 1,
    reread: 0,
  });
  assert.deepEqual(applyReactionDelta(counts, "like", ""), {
    like: 0,
    useful: 0,
    reread: 0,
  });
});
