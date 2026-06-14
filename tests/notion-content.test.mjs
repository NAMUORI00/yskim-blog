import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  assertNoUnsupportedGeneratedMarkdown,
  buildPostDocument,
  convertPageToMarkdown,
  hasTemporaryNotionUrl,
  pageToPost,
  prepareGeneratedContent,
  queryPublishedPages,
  rewriteMarkdownAssetUrls,
  rewriteMarkdownImageUrls,
  toPlayerEmbedUrl,
  videoEmbedTag,
  videoFileTag,
  mediaSrc,
  fileLinkTag,
  fileAttachmentTag,
  pdfEmbedTag,
  collectRemoteMarkdownAssets,
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

test("allows supported media HTML but still rejects file:// artifacts", () => {
  assert.doesNotThrow(() =>
    assertNoUnsupportedGeneratedMarkdown(
      '<video controls src="/files/notion/post/file-1.mp4"></video>',
      "markdown",
    ),
  );
  assert.doesNotThrow(() =>
    assertNoUnsupportedGeneratedMarkdown(
      '<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>',
      "markdown",
    ),
  );
  assert.throws(
    () => assertNoUnsupportedGeneratedMarkdown('<audio src="file://clip"></audio>', "markdown"),
    /Unsupported Notion artifact remains/,
  );
});

test("converts video provider URLs to embeddable player URLs", () => {
  assert.equal(
    toPlayerEmbedUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
    "https://www.youtube.com/embed/dQw4w9WgXcQ",
  );
  assert.equal(
    toPlayerEmbedUrl("https://youtu.be/dQw4w9WgXcQ"),
    "https://www.youtube.com/embed/dQw4w9WgXcQ",
  );
  assert.equal(
    toPlayerEmbedUrl("https://www.youtube.com/shorts/dQw4w9WgXcQ"),
    "https://www.youtube.com/embed/dQw4w9WgXcQ",
  );
  assert.equal(
    toPlayerEmbedUrl("https://vimeo.com/76979871"),
    "https://player.vimeo.com/video/76979871",
  );
  assert.equal(toPlayerEmbedUrl("https://example.com/clip.mp4"), null);
});

test("renders YouTube/Vimeo embeds as responsive iframes", () => {
  const html = videoEmbedTag("https://www.youtube.com/embed/dQw4w9WgXcQ", "데모 영상");
  assert.match(html, /class="video-embed"/);
  assert.match(html, /<iframe src="https:\/\/www\.youtube\.com\/embed\/dQw4w9WgXcQ"/);
  assert.match(html, /allowfullscreen/);
  assert.match(html, /<figcaption>데모 영상<\/figcaption>/);
});

test("renders Notion-hosted uploads as native video players with the raw url", () => {
  const url = "https://prod-files-secure.s3.us-west-2.amazonaws.com/clip.mp4?X-Amz-Expires=3600";
  const html = videoFileTag(url, "");
  assert.match(html, /class="video-file"/);
  assert.ok(html.includes(`src="${url}"`));
  assert.ok(!html.includes("<figcaption>"));
});

test("mediaSrc proxies uploaded files but passes external URLs through", () => {
  const uploaded = {
    type: "file",
    file: { url: "https://prod-files-secure.s3.amazonaws.com/v.mp4?X-Amz-Expires=3600" },
  };
  const external = { type: "external", external: { url: "https://example.com/v.mp4" } };

  assert.equal(mediaSrc({ id: "11112222-3333-4444-5555-666677778888" }, uploaded, "proxy"), "/media/11112222-3333-4444-5555-666677778888");
  assert.equal(mediaSrc({ id: "x" }, external, "proxy"), "https://example.com/v.mp4");
  // Download mode keeps the real (temporary) URL so the asset can be downloaded.
  assert.match(mediaSrc({ id: "x" }, uploaded, "download"), /amazonaws\.com/);
});

test("fileLinkTag renders a download link", () => {
  assert.equal(
    fileLinkTag("/media/abc", "slides.pdf"),
    '<a class="file-attachment" href="/media/abc" download>slides.pdf</a>',
  );
});

test("fileAttachmentTag renders a download card with an extension badge", () => {
  const html = fileAttachmentTag("/files/notion/post/report.xlsx", "report.xlsx", "분기 보고서");
  assert.match(html, /class="file-figure"/);
  assert.match(html, /class="file-attachment"/);
  assert.ok(html.includes('href="/files/notion/post/report.xlsx"'));
  assert.match(html, /<span class="file-attachment-icon"[^>]*>XLSX<\/span>/);
  assert.match(html, /<span class="file-attachment-label">report\.xlsx<\/span>/);
  assert.match(html, /<figcaption>분기 보고서<\/figcaption>/);
});

test("pdfEmbedTag renders an inline preview plus a download fallback", () => {
  const url = "https://prod-files-secure.s3.us-west-2.amazonaws.com/slides.pdf?X-Amz-Expires=3600";
  const html = pdfEmbedTag(url, "발표 자료", "slides.pdf");
  assert.match(html, /class="pdf-embed"/);
  assert.match(html, /<object class="pdf-frame" data="[^"]+" type="application\/pdf">/);
  // Raw url is kept verbatim (in every occurrence) so the downloader can rewrite it.
  assert.ok(html.includes(`data="${url}"`));
  assert.ok(html.includes(`href="${url}"`));
  assert.match(html, /class="file-attachment file-attachment--pdf"/);
  assert.match(html, /<figcaption>발표 자료<\/figcaption>/);
});

test("collectRemoteMarkdownAssets self-hosts pdf/file attachment urls in download mode", () => {
  const url = "https://prod-files-secure.s3.us-west-2.amazonaws.com/slides.pdf?X-Amz-Expires=3600";
  const markdown = pdfEmbedTag(url, "", "slides.pdf");
  const assets = collectRemoteMarkdownAssets(markdown, "download");
  assert.ok(assets.some((a) => a.url === url && a.kind === "file"));
  // Proxy mode emits /media/<id> links and must not try to download anything here.
  assert.deepEqual(collectRemoteMarkdownAssets(markdown, "proxy"), []);
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

test("rewrites temporary Notion file links to generated local paths", () => {
  const markdown = [
    "![diagram](https://secure.notion-static.com/diagram.png?X-Amz-Expires=3600)",
    "[slides.pdf](https://prod-files-secure.s3.us-west-2.amazonaws.com/slides.pdf?X-Amz-Expires=3600)",
  ].join("\n");

  const rewritten = rewriteMarkdownAssetUrls(markdown, new Map([
    [
      "https://secure.notion-static.com/diagram.png?X-Amz-Expires=3600",
      "/images/notion/notion-publishing-smoke-test/diagram.png",
    ],
    [
      "https://prod-files-secure.s3.us-west-2.amazonaws.com/slides.pdf?X-Amz-Expires=3600",
      "/files/notion/notion-publishing-smoke-test/slides.pdf",
    ],
  ]));

  assert.equal(
    rewritten,
    [
      "![diagram](/images/notion/notion-publishing-smoke-test/diagram.png)",
      "[slides.pdf](/files/notion/notion-publishing-smoke-test/slides.pdf)",
    ].join("\n"),
  );
});

test("full rebuild removes generated posts and Notion images only", async () => {
  const root = await mkdtemp(join(tmpdir(), "yskim-blog-notion-"));
  await mkdir(join(root, "content", "posts", "old"), { recursive: true });
  await mkdir(join(root, "content", "pages"), { recursive: true });
  await mkdir(join(root, "static", "images", "notion", "old"), { recursive: true });
  await mkdir(join(root, "static", "files", "notion", "old"), { recursive: true });
  await mkdir(join(root, "static", "images", "manual"), { recursive: true });
  await writeFile(join(root, "content", "posts", "old", "stale.md"), "stale", "utf8");
  await writeFile(join(root, "content", "pages", "about.md"), "about", "utf8");
  await writeFile(join(root, "static", "images", "notion", "old", "stale.png"), "image", "utf8");
  await writeFile(join(root, "static", "files", "notion", "old", "stale.pdf"), "file", "utf8");
  await writeFile(join(root, "static", "images", "manual", "keep.png"), "image", "utf8");

  await prepareGeneratedContent(root);

  assert.equal(existsSync(join(root, "content", "posts", "old", "stale.md")), false);
  assert.equal(existsSync(join(root, "static", "images", "notion", "old", "stale.png")), false);
  assert.equal(existsSync(join(root, "static", "files", "notion", "old", "stale.pdf")), false);
  assert.equal(await readFile(join(root, "content", "pages", "about.md"), "utf8"), "about");
  assert.equal(await readFile(join(root, "static", "images", "manual", "keep.png"), "utf8"), "image");
});

test("queries the current Notion data source API after resolving the database id", async () => {
  const calls = [];
  const notion = {
    databases: {
      retrieve: async (request) => {
        calls.push({ type: "retrieve", request });
        return {
          data_sources: [{ id: "7c47a75e-f37b-4345-a370-7bbbfb19d666" }],
        };
      },
    },
    dataSources: {
      query: async (request) => {
        calls.push({ type: "query", request });
        return {
          results: [{ object: "page", id: "page-1" }],
          has_more: false,
          next_cursor: null,
        };
      },
    },
  };

  const pages = await queryPublishedPages(
    notion,
    "2e8cf325-d81c-4acd-b302-800e2dcfc4df",
    { status: "Status", date: "Date" },
    "Ready",
  );

  assert.deepEqual(pages, [{ object: "page", id: "page-1" }]);
  assert.deepEqual(calls, [
    {
      type: "retrieve",
      request: { database_id: "2e8cf325-d81c-4acd-b302-800e2dcfc4df" },
    },
    {
      type: "query",
      request: {
        data_source_id: "7c47a75e-f37b-4345-a370-7bbbfb19d666",
        filter: {
          property: "Status",
          select: {
            equals: "Ready",
          },
        },
        sorts: [
          {
            property: "Date",
            direction: "descending",
          },
        ],
        page_size: 100,
        start_cursor: undefined,
      },
    },
  ]);
});

test("converts an empty Notion page to an empty Markdown body", async () => {
  const n2m = {
    pageToMarkdown: async () => [],
    toMarkdownString: () => ({}),
  };

  assert.equal(await convertPageToMarkdown(n2m, "empty-page"), "");
});
