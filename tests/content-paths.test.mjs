import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  expectedPostPath,
  organizePostsByCategory,
  slugifyPathSegment,
} from "../scripts/content-paths.mjs";

const postText = `---
title: "Path test"
date: 2026-06-09
draft: false
slug: "category-path-test"
categories:
  - 연구 노트
tags:
  - publishing
summary: "Path test"
comments: true
---

Body.
`;

test("slugifies category names into filesystem-safe path segments", () => {
  assert.equal(slugifyPathSegment("연구 노트"), "연구-노트");
  assert.equal(slugifyPathSegment("AI / RAG"), "ai-rag");
  assert.equal(slugifyPathSegment("  Project_Log  "), "project-log");
});

test("derives the expected category post path from frontmatter", () => {
  assert.equal(
    expectedPostPath(postText, "fallback.md"),
    "연구-노트/category-path-test.md",
  );
});

test("organizes flat published posts into category folders", async () => {
  const root = await mkdtemp(join(tmpdir(), "yskim-blog-paths-"));
  const postsRoot = join(root, "content", "posts");
  await mkdir(postsRoot, { recursive: true });
  const original = join(postsRoot, "flat-note.md");
  await writeFile(original, postText, "utf8");

  const result = await organizePostsByCategory(postsRoot);

  const moved = join(postsRoot, "연구-노트", "category-path-test.md");
  assert.equal(result.ok, true);
  assert.deepEqual(
    result.moved.map((item) => item.to),
    ["연구-노트/category-path-test.md"],
  );
  assert.equal(existsSync(original), false);
  assert.equal(existsSync(moved), true);
  assert.equal(await readFile(moved, "utf8"), postText);
});

test("check mode reports posts outside their category path without moving them", async () => {
  const root = await mkdtemp(join(tmpdir(), "yskim-blog-paths-"));
  const postsRoot = join(root, "content", "posts");
  await mkdir(postsRoot, { recursive: true });
  const original = join(postsRoot, "flat-note.md");
  await writeFile(original, postText, "utf8");

  const result = await organizePostsByCategory(postsRoot, { check: true });

  assert.equal(result.ok, false);
  assert.deepEqual(
    result.moved.map((item) => item.to),
    ["연구-노트/category-path-test.md"],
  );
  assert.equal(existsSync(original), true);
});
