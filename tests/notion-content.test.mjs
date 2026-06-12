import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  assertNoUnsupportedGeneratedMarkdown,
  buildPostDocument,
  hasTemporaryNotionUrl,
  pageToPost,
  prepareGeneratedContent,
  rewriteMarkdownImageUrls,
} from "../scripts/notion-content.mjs";

const notionPage = {
  id: "37ddcd44-779f-81ca-b0c8-ff017ae62cc1",
  properties: {
    Title: {
      type: "title",
      title: [{ plain_text: "Notion publishing smoke test" }],
    },
    Status: { type: "select", select: { name: "Published" } },
    Slug: {
      type: "rich_text",
      rich_text: [{ plain_text: "notion-publishing-smoke-test" }],
    },
    Date: { type: "date", date: { start: "2026-06-12" } },
    Category: { type: "select", select: { name: "운영 노트" } },
    Tags: {
      type: "multi_select",
      multi_select: [{ name: "notion" }, { name: "workflow" }],
    },
    Summary: {
      type: "rich_text",
      rich_text: [{ plain_text: "Notion CMS smoke test." }],
    },
    Canonical: { type: "url", url: "" },
    Comments: { type: "checkbox", checkbox: true },
  },
};

test("maps Notion page properties to Hugo post metadata", () => {
  const post = pageToPost(notionPage);

  assert.deepEqual(post, {
    notionId: "37ddcd44-779f-81ca-b0c8-ff017ae62cc1",
    title: "Notion publishing smoke test",
    status: "Published",
    slug: "notion-publishing-smoke-test",
    date: "2026-06-12",
    category: "운영 노트",
    tags: ["notion", "workflow"],
    summary: "Notion CMS smoke test.",
    cover: "",
    canonical: "",
    comments: true,
  });
});

test("renders Hugo frontmatter without allowing Markdown edits to become source of truth", () => {
  const post = pageToPost(notionPage);
  const document = buildPostDocument(post, "Body with math:\n\n$$E = mc^2$$\n");

  assert.match(document, /^---\n/);
  assert.match(document, /title: "Notion publishing smoke test"/);
  assert.match(document, /slug: "notion-publishing-smoke-test"/);
  assert.match(document, /categories:\n  - "운영 노트"/);
  assert.match(document, /tags:\n  - "notion"\n  - "workflow"/);
  assert.match(document, /comments: true/);
  assert.match(document, /notion_id: "37ddcd44-779f-81ca-b0c8-ff017ae62cc1"/);
  assert.match(document, /generated_by: "notion"/);
  assert.match(document, /math: true/);
});

test("detects temporary Notion file URLs", () => {
  assert.equal(
    hasTemporaryNotionUrl("![image](https://secure.notion-static.com/image.png?X-Amz-Expires=3600)"),
    true,
  );
  assert.equal(hasTemporaryNotionUrl("![image](/images/notion/post/image.png)"), false);
});

test("rejects unsupported generated Notion artifacts", () => {
  assert.throws(
    () => assertNoUnsupportedGeneratedMarkdown("<video src=\"file://attachment\"></video>", "markdown"),
    /Unsupported Notion artifact remains/,
  );
});

test("rewrites remote Markdown images to generated local paths", () => {
  const markdown = "![diagram](https://secure.notion-static.com/diagram.png?X-Amz-Expires=3600)";
  const rewritten = rewriteMarkdownImageUrls(markdown, new Map([
    [
      "https://secure.notion-static.com/diagram.png?X-Amz-Expires=3600",
      "/images/notion/notion-publishing-smoke-test/diagram.png",
    ],
  ]));

  assert.equal(
    rewritten,
    "![diagram](/images/notion/notion-publishing-smoke-test/diagram.png)",
  );
});

test("full rebuild removes generated posts and Notion images only", async () => {
  const root = await mkdtemp(join(tmpdir(), "yskim-blog-notion-"));
  await mkdir(join(root, "content", "posts", "old"), { recursive: true });
  await mkdir(join(root, "content", "pages"), { recursive: true });
  await mkdir(join(root, "static", "images", "notion", "old"), { recursive: true });
  await mkdir(join(root, "static", "images", "manual"), { recursive: true });
  await writeFile(join(root, "content", "posts", "old", "stale.md"), "stale", "utf8");
  await writeFile(join(root, "content", "pages", "about.md"), "about", "utf8");
  await writeFile(join(root, "static", "images", "notion", "old", "stale.png"), "image", "utf8");
  await writeFile(join(root, "static", "images", "manual", "keep.png"), "image", "utf8");

  await prepareGeneratedContent(root);

  assert.equal(existsSync(join(root, "content", "posts", "old", "stale.md")), false);
  assert.equal(existsSync(join(root, "static", "images", "notion", "old", "stale.png")), false);
  assert.equal(await readFile(join(root, "content", "pages", "about.md"), "utf8"), "about");
  assert.equal(await readFile(join(root, "static", "images", "manual", "keep.png"), "utf8"), "image");
});
