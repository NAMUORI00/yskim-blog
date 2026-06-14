import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { organizePostsByCategory } from "./content-paths.mjs";

const DEFAULT_PROPERTIES = {
  title: "Title",
  status: "Status",
  slug: "Slug",
  date: "Date",
  category: "Category",
  tags: "Tags",
  summary: "Summary",
  cover: "Cover",
  canonical: "Canonical",
  comments: "Comments",
};

const GENERATED_POSTS_DIR = path.join("content", "posts");
const GENERATED_NOTION_IMAGES_DIR = path.join("static", "images", "notion");
const GENERATED_NOTION_FILES_DIR = path.join("static", "files", "notion");

export function pageToPost(page, propertyNames = DEFAULT_PROPERTIES) {
  const properties = page.properties ?? {};
  const post = {
    notionId: page.id,
    title: readPlainText(properties[propertyNames.title]),
    status: readSelect(properties[propertyNames.status]),
    slug: readPlainText(properties[propertyNames.slug]),
    date: readDate(properties[propertyNames.date]),
    category: readSelect(properties[propertyNames.category]),
    tags: readMultiSelect(properties[propertyNames.tags]),
    summary: readPlainText(properties[propertyNames.summary]),
    cover: readFileUrl(properties[propertyNames.cover]) || readObjectFileUrl(page.cover),
    canonical: readUrl(properties[propertyNames.canonical]),
    comments: readCheckbox(properties[propertyNames.comments], true),
  };

  const missing = [];
  for (const field of ["title", "slug", "date", "category"]) {
    if (!post[field]) {
      missing.push(field);
    }
  }
  if (post.tags.length === 0) {
    missing.push("tags");
  }
  if (missing.length > 0) {
    throw new Error(`Notion page ${page.id} is missing required fields: ${missing.join(", ")}`);
  }

  return post;
}

export function buildPostDocument(post, markdownBody) {
  const frontMatter = [
    "---",
    `title: ${yamlString(post.title)}`,
    `date: ${post.date}`,
    "draft: false",
    `slug: ${yamlString(post.slug)}`,
    "categories:",
    `  - ${yamlString(post.category)}`,
    "tags:",
    ...post.tags.map((tag) => `  - ${yamlString(tag)}`),
    `summary: ${yamlString(post.summary)}`,
    `cover: ${yamlString(post.cover ?? "")}`,
    `canonical: ${yamlString(post.canonical ?? "")}`,
    `comments: ${post.comments ? "true" : "false"}`,
    `notion_id: ${yamlString(post.notionId)}`,
    `generated_by: ${yamlString("notion")}`,
  ];

  if (containsMath(markdownBody)) {
    frontMatter.push("math: true");
  }

  frontMatter.push("---", "");
  return `${frontMatter.join("\n")}${markdownBody.trim()}\n`;
}

export function hasTemporaryNotionUrl(markdown) {
  return /https?:\/\/[^\s)"]*(notion-static\.com|notion\.site|amazonaws\.com)[^\s)"]*(X-Amz-|notion|secure)/i.test(
    markdown,
  );
}

export function rewriteMarkdownImageUrls(markdown, replacements) {
  return markdown.replace(/!\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g, (match, alt, url) => {
    const replacement = replacements.get(url);
    if (!replacement) {
      return match;
    }
    return `![${alt}](${replacement})`;
  });
}

export function rewriteMarkdownAssetUrls(markdown, replacements) {
  return markdown.replace(/(!?\[[^\]]*\]\()(https?:\/\/[^)\s]+)(\))/g, (match, prefix, url, suffix) => {
    const replacement = replacements.get(url);
    if (!replacement) {
      return match;
    }
    return `${prefix}${replacement}${suffix}`;
  });
}

export function assertNoUnsupportedGeneratedMarkdown(markdown, slug) {
  // Video/audio/iframe embeds are supported and rendered as HTML. Genuinely
  // unsupported artifacts (`<unknown>`, raw `<pdf>`/`<file>` tags) and any
  // `file://` URL must never reach the published output.
  if (/<(unknown|pdf|file)\b|file:\/\//i.test(markdown)) {
    throw new Error(`Unsupported Notion artifact remains after conversion for ${slug}.`);
  }
}

export async function prepareGeneratedContent(root) {
  await rm(path.join(root, GENERATED_POSTS_DIR), { recursive: true, force: true });
  await rm(path.join(root, GENERATED_NOTION_IMAGES_DIR), { recursive: true, force: true });
  await rm(path.join(root, GENERATED_NOTION_FILES_DIR), { recursive: true, force: true });
  await mkdir(path.join(root, GENERATED_POSTS_DIR), { recursive: true });
  await mkdir(path.join(root, GENERATED_NOTION_IMAGES_DIR), { recursive: true });
  await mkdir(path.join(root, GENERATED_NOTION_FILES_DIR), { recursive: true });
}

export async function fetchNotionContent(options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const token = options.token ?? process.env.NOTION_TOKEN;
  const databaseId = options.databaseId ?? process.env.NOTION_DATABASE_ID;
  const status = options.status ?? process.env.NOTION_STATUS ?? "Published";
  const propertyNames = {
    ...DEFAULT_PROPERTIES,
    ...options.propertyNames,
  };

  if (!token) {
    throw new Error("Missing NOTION_TOKEN. Create a read-only Notion integration and store it as a secret.");
  }
  if (!databaseId) {
    throw new Error("Missing NOTION_DATABASE_ID. Set it to the Namu Garden Blog CMS database id.");
  }

  const [{ Client }, { NotionToMarkdown }] = await Promise.all([
    import("@notionhq/client"),
    import("notion-to-md"),
  ]);
  const notion = new Client({ auth: token });
  const n2m = new NotionToMarkdown({ notionClient: notion });
  const mediaMode =
    (options.mediaMode ?? process.env.NOTION_MEDIA_MODE) === "proxy" ? "proxy" : "download";
  installCustomTransformers(n2m, mediaMode);

  await prepareGeneratedContent(root);
  await ensureBaseContent(root);
  const pages = await queryPublishedPages(notion, databaseId, propertyNames, status);
  const exported = [];

  for (const page of pages) {
    const post = pageToPost(page, propertyNames);
    const rawMarkdown = await convertPageToMarkdown(n2m, page.id);
    const bodyWithAssets = await downloadAndRewriteAssets(rawMarkdown, post, root, mediaMode);
    assertNoUnsupportedGeneratedMarkdown(bodyWithAssets, post.slug);
    const cover = await downloadCover(post, root);
    const postDocument = buildPostDocument({ ...post, cover: cover || post.cover }, bodyWithAssets);
    const postPath = path.join(root, GENERATED_POSTS_DIR, `${post.slug}.md`);
    await writeFile(postPath, postDocument, "utf8");
    exported.push(post);
  }

  await organizePostsByCategory(path.join(root, GENERATED_POSTS_DIR));
  await writeContentSourceMeta(root, {
    provider: "notion",
    databaseId,
    status,
    exportedCount: exported.length,
    fetchedAt: new Date().toISOString(),
  });

  return { exportedCount: exported.length, posts: exported };
}

async function ensureBaseContent(root) {
  await writeIfMissing(
    path.join(root, "content", "_index.md"),
    `---
title: "yskim blog"
description: "Notion에서 관리하고 Hugo로 렌더링하는 연구 엔지니어링 블로그."
translationKey: "home"
---
`,
  );
  await writeIfMissing(
    path.join(root, "content", "posts", "_index.md"),
    `---
title: "글"
description: "공개 발행된 노트와 글."
translationKey: "posts"
---
`,
  );
  await writeIfMissing(
    path.join(root, "content", "pages", "about.md"),
    `---
title: "소개"
date: 2026-06-12
draft: false
slug: "about"
tags:
  - meta
summary: "이 블로그와 Notion 기반 발행 워크플로 소개."
translationKey: "about"
---

이 블로그는 Notion을 CMS와 편집 공간으로 사용하고 Hugo로 공개 사이트를 렌더링합니다.

Notion은 글의 단일 원본이며, GitHub Actions는 발행 상태의 글을 가져와 Hugo Markdown과 정적 이미지 산출물로 재생성합니다.
`,
  );
}

async function writeIfMissing(filePath, content) {
  try {
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, content, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if (error.code !== "EEXIST") {
      throw error;
    }
  }
}

export async function queryPublishedPages(notion, databaseId, propertyNames, status) {
  const dataSourceId = await resolveDataSourceId(notion, databaseId);
  const results = [];
  let startCursor;

  do {
    const response = await notion.dataSources.query({
      data_source_id: dataSourceId,
      filter: {
        property: propertyNames.status,
        select: {
          equals: status,
        },
      },
      sorts: [
        {
          property: propertyNames.date,
          direction: "descending",
        },
      ],
      start_cursor: startCursor,
      page_size: 100,
    });

    results.push(...response.results);
    startCursor = response.has_more ? response.next_cursor : undefined;
  } while (startCursor);

  return results;
}

async function resolveDataSourceId(notion, databaseId) {
  if (!notion.databases?.retrieve) {
    return databaseId;
  }

  try {
    const database = await notion.databases.retrieve({ database_id: databaseId });
    const dataSources = database.data_sources ?? database.dataSources ?? [];
    return dataSources[0]?.id ?? databaseId;
  } catch (error) {
    if (!notion.dataSources?.retrieve) {
      throw error;
    }
    await notion.dataSources.retrieve({ data_source_id: databaseId });
    return databaseId;
  }
}

function installCustomTransformers(n2m, mediaMode = "download") {
  n2m.setCustomTransformer("equation", async (block) => {
    const expression = block?.equation?.expression?.trim();
    return expression ? `$$\n${expression}\n$$` : "";
  });

  n2m.setCustomTransformer("embed", async (block) => {
    const url = block?.embed?.url;
    if (!url) {
      return "";
    }
    const caption = richTextToPlain(block.embed.caption);
    if (isTweetUrl(url)) {
      return tweetTag(url, caption);
    }
    const playerUrl = toPlayerEmbedUrl(url);
    if (playerUrl) {
      return videoEmbedTag(playerUrl, caption);
    }
    return caption ? `[${caption}](${url})` : `<${url}>`;
  });

  // Mermaid code blocks render as live diagrams (like Notion). Every other
  // language falls back to notion-to-md's default fenced-code handling.
  n2m.setCustomTransformer("code", async (block) => {
    const node = block?.code;
    const language = String(node?.language || "").toLowerCase();
    if (language !== "mermaid") {
      return false;
    }
    const code = (node?.rich_text || []).map((t) => t.plain_text).join("");
    return code.trim() ? mermaidTag(code) : "";
  });

  n2m.setCustomTransformer("video", async (block) => {
    const node = block?.video;
    const url = readObjectFileUrl(node);
    if (!url) {
      return "";
    }
    const caption = richTextToPlain(node?.caption);
    const playerUrl = toPlayerEmbedUrl(url);
    if (playerUrl) {
      return videoEmbedTag(playerUrl, caption);
    }
    return videoFileTag(mediaSrc(block, node, mediaMode), caption);
  });

  n2m.setCustomTransformer("audio", async (block) => {
    const node = block?.audio;
    const url = readObjectFileUrl(node);
    if (!url) {
      return "";
    }
    const caption = richTextToPlain(node?.caption);
    return audioFileTag(mediaSrc(block, node, mediaMode), caption);
  });

  // PDF blocks render as an inline preview with a download fallback; other file
  // attachments render as a labelled download card. Both media modes emit clean
  // HTML: proxy mode points at the /media/<id> redirect Function, download mode
  // keeps the raw URL so the asset pipeline can self-host it.
  n2m.setCustomTransformer("pdf", async (block) => {
    const node = block?.pdf;
    const url = readObjectFileUrl(node);
    if (!url) {
      return "";
    }
    const caption = richTextToPlain(node?.caption);
    const name = node?.name || fileNameFromUrl(url) || caption || "PDF 문서";
    return pdfEmbedTag(mediaSrc(block, node, mediaMode), caption, name);
  });

  n2m.setCustomTransformer("file", async (block) => {
    const node = block?.file;
    const url = readObjectFileUrl(node);
    if (!url) {
      return "";
    }
    const caption = richTextToPlain(node?.caption);
    const name = node?.name || fileNameFromUrl(url) || caption || "첨부파일";
    return fileAttachmentTag(mediaSrc(block, node, mediaMode), name, caption);
  });

  // Bookmarks, link previews, and link-to-page blocks: render a tidy link card.
  // The default notion-to-md output prints the literal block type ("bookmark")
  // as the link text, which looks broken; show the caption or hostname instead.
  const linkCardTransformer = (type) => async (block) => {
    const node = block?.[type];
    let url = node?.url;
    if (type === "link_to_page") {
      const pageId = block?.link_to_page?.page_id || block?.link_to_page?.database_id;
      url = pageId ? `https://www.notion.so/${String(pageId).replace(/-/g, "")}` : "";
    }
    if (!url) {
      return "";
    }
    const caption = richTextToPlain(node?.caption);
    if (isTweetUrl(url)) {
      return tweetTag(url, caption);
    }
    return bookmarkTag(url, caption);
  };
  n2m.setCustomTransformer("bookmark", linkCardTransformer("bookmark"));
  n2m.setCustomTransformer("link_preview", linkCardTransformer("link_preview"));
  n2m.setCustomTransformer("link_to_page", linkCardTransformer("link_to_page"));

  // Callout intentionally has NO custom transformer: notion-to-md's built-in
  // handler renders the icon AND recurses into nested children (a custom
  // transformer that returns a string would drop the callout's child blocks).
}

export async function convertPageToMarkdown(n2m, pageId) {
  const markdownBlocks = await n2m.pageToMarkdown(pageId);
  const markdown = n2m.toMarkdownString(markdownBlocks);
  return typeof markdown === "string" ? markdown : markdown.parent ?? "";
}

const VIDEO_PROVIDERS = [
  {
    test: /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/,
    embed: (id) => `https://www.youtube.com/embed/${id}`,
  },
  {
    test: /(?:player\.)?vimeo\.com\/(?:video\/)?(\d+)/,
    embed: (id) => `https://player.vimeo.com/video/${id}`,
  },
];

export function toPlayerEmbedUrl(url) {
  if (typeof url !== "string") {
    return null;
  }
  for (const provider of VIDEO_PROVIDERS) {
    const match = url.match(provider.test);
    if (match) {
      return provider.embed(match[1]);
    }
  }
  return null;
}

function escapeHtmlAttribute(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function captionHtml(caption) {
  const text = String(caption ?? "").trim();
  return text ? `\n  <figcaption>${escapeHtmlAttribute(text)}</figcaption>` : "";
}

// Player embeds (YouTube/Vimeo). The src is a clean provider URL with no
// ampersands, so it is safe to leave unescaped for later URL matching.
export function videoEmbedTag(playerUrl, caption) {
  return `<figure class="video-embed">\n  <iframe src="${playerUrl}" title="${escapeHtmlAttribute(caption || "video")}" loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen></iframe>${captionHtml(caption)}\n</figure>`;
}

// Native media players. The raw (possibly temporary) URL is kept verbatim so the
// asset downloader can match and rewrite it to a local path.
export function videoFileTag(url, caption) {
  return `<figure class="video-file">\n  <video controls preload="metadata" src="${url}"></video>${captionHtml(caption)}\n</figure>`;
}

export function audioFileTag(url, caption) {
  return `<figure class="audio-file">\n  <audio controls preload="metadata" src="${url}"></audio>${captionHtml(caption)}\n</figure>`;
}

export function fileLinkTag(href, label) {
  return `<a class="file-attachment" href="${href}" download>${escapeHtmlAttribute(label)}</a>`;
}

// A labelled download card for a generic file attachment. The raw url is kept
// verbatim in download mode so the asset downloader can match and self-host it.
export function fileAttachmentTag(src, name, caption) {
  const label = String(name || "첨부파일");
  const badge = fileExtensionLabel(name) || fileExtensionLabel(src) || "FILE";
  return `<figure class="file-figure">
  <a class="file-attachment" href="${src}" target="_blank" rel="noopener" download>
    <span class="file-attachment-icon" aria-hidden="true">${escapeHtmlAttribute(badge)}</span>
    <span class="file-attachment-label">${escapeHtmlAttribute(label)}</span>
    <span class="file-attachment-action" aria-hidden="true">내려받기 ↗</span>
  </a>${captionHtml(caption)}
</figure>`;
}

// An inline PDF preview backed by <object>, with a labelled download link as the
// fallback for browsers that cannot render PDFs inline.
export function pdfEmbedTag(src, caption, name) {
  const label = String(name || "PDF 문서");
  return `<figure class="pdf-embed">
  <object class="pdf-frame" data="${src}" type="application/pdf">
    <p class="pdf-fallback">PDF 미리보기를 표시할 수 없습니다. <a href="${src}" target="_blank" rel="noopener" download>${escapeHtmlAttribute(label)} 내려받기</a></p>
  </object>
  <a class="file-attachment file-attachment--pdf" href="${src}" target="_blank" rel="noopener" download>
    <span class="file-attachment-icon" aria-hidden="true">PDF</span>
    <span class="file-attachment-label">${escapeHtmlAttribute(label)}</span>
    <span class="file-attachment-action" aria-hidden="true">열기 ↗</span>
  </a>${captionHtml(caption)}
</figure>`;
}

// Twitter / X status URLs (twitter.com/<user>/status/<id> or x.com/...).
export function isTweetUrl(url) {
  return /^https?:\/\/(?:www\.)?(?:twitter\.com|x\.com|mobile\.twitter\.com)\/[^/]+\/status(?:es)?\/\d+/i.test(
    String(url || ""),
  );
}

// An embedded tweet. platform.twitter.com/widgets.js (loaded by js/embeds.js)
// upgrades the blockquote into the rendered tweet — the same approach Notion uses.
export function tweetTag(url, caption) {
  const tweetUrl = String(url).replace(/^http:/i, "https:");
  return `<figure class="tweet-embed">
  <blockquote class="twitter-tweet"><a href="${escapeHtmlAttribute(tweetUrl)}"></a></blockquote>${captionHtml(caption)}
</figure>`;
}

// A Mermaid diagram source block. js/embeds.js loads mermaid on demand and
// renders any <pre class="mermaid"> into an SVG. Blank lines are collapsed so the
// raw HTML block survives Markdown parsing intact.
export function mermaidTag(code) {
  const source = escapeHtmlAttribute(String(code)).replace(/\n{2,}/g, "\n").replace(/^\n+|\n+$/g, "");
  return `<pre class="mermaid">${source}</pre>`;
}

// A compact link card for bookmark / link_preview / link_to_page blocks. URLs
// here are ordinary public links (never expiring Notion URLs), so they are
// HTML-escaped normally and left untouched by the asset downloader.
export function bookmarkTag(url, caption) {
  let host = url;
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    host = String(url);
  }
  const title = String(caption ?? "").trim() || host;
  return `<a class="bookmark-card" href="${escapeHtmlAttribute(url)}" target="_blank" rel="noopener noreferrer">
  <span class="bookmark-title">${escapeHtmlAttribute(title)}</span>
  <span class="bookmark-host">${escapeHtmlAttribute(host)}</span>
</a>`;
}

function fileNameFromUrl(url) {
  try {
    const pathname = new URL(url).pathname;
    return decodeURIComponent(pathname.split("/").pop() || "");
  } catch {
    return "";
  }
}

function fileExtensionLabel(value) {
  if (!value) {
    return "";
  }
  const match = String(value).match(/\.([A-Za-z0-9]{1,5})(?:\?|#|$)/);
  return match ? match[1].toUpperCase() : "";
}

// Choose the src for a media file. Notion-uploaded files have expiring URLs, so
// in proxy mode they are served through /media/<block-id> (resolved at request
// time by a Cloudflare Function). External URLs and download mode use the URL as-is.
export function mediaSrc(block, node, mode = "download") {
  if (mode === "proxy" && node?.type === "file" && block?.id) {
    return `/media/${block.id}`;
  }
  return readObjectFileUrl(node);
}

async function downloadAndRewriteAssets(markdown, post, root, mediaMode = "download") {
  const remoteAssets = collectRemoteMarkdownAssets(markdown, mediaMode);
  if (remoteAssets.length === 0) {
    return markdown;
  }

  const replacements = new Map();
  for (let index = 0; index < remoteAssets.length; index += 1) {
    const { url, kind } = remoteAssets[index];
    if (replacements.has(url)) {
      continue;
    }
    const localPath = await downloadAsset(url, root, post.slug, `${kind}-${index + 1}`, kind);
    replacements.set(url, localPath);
  }

  let rewritten = rewriteMarkdownAssetUrls(markdown, replacements);
  // The Markdown rewriter only covers `![]()`/`[]()` syntax. Media players use
  // HTML `src="..."` attributes, so rewrite any remaining mapped URLs directly.
  for (const [url, localPath] of replacements) {
    if (rewritten.includes(url)) {
      rewritten = rewritten.split(url).join(localPath);
    }
  }
  if (hasTemporaryNotionUrl(rewritten)) {
    throw new Error(`Temporary Notion URL remains after asset rewrite for ${post.slug}.`);
  }
  return rewritten;
}

export function collectRemoteMarkdownAssets(markdown, mediaMode = "download") {
  const assets = [];

  // Images are always self-hosted (small, and best for performance/SEO).
  for (const match of markdown.matchAll(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g)) {
    assets.push({ url: match[1], kind: "image" });
  }

  // In proxy mode, heavy media/attachments are served from Notion via /media/<id>
  // (uploaded) or kept as their direct external URL — never downloaded here.
  if (mediaMode === "proxy") {
    return assets;
  }

  for (const match of markdown.matchAll(/\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g)) {
    if (match.index > 0 && markdown[match.index - 1] === "!") {
      continue;
    }
    const url = match[1];
    if (hasTemporaryNotionUrl(url)) {
      assets.push({ url, kind: "file" });
    }
  }

  // Native media players emitted by the video/audio transformers. Download the
  // referenced file (Notion-hosted uploads or direct media URLs) and self-host it.
  for (const match of markdown.matchAll(/<(?:video|audio|source)\b[^>]*?\ssrc="(https?:\/\/[^"]+)"/gi)) {
    assets.push({ url: match[1], kind: "file" });
  }

  // PDF previews (<object data>) and attachment download cards (<a class=
  // "file-attachment">) emitted by the pdf/file transformers. Self-host the
  // referenced file so the published page carries no expiring Notion URLs.
  for (const match of markdown.matchAll(/<object\b[^>]*?\sdata="(https?:\/\/[^"]+)"/gi)) {
    assets.push({ url: match[1], kind: "file" });
  }
  for (const match of markdown.matchAll(/<a\b[^>]*?\sclass="[^"]*file-attachment[^"]*"[^>]*?\shref="(https?:\/\/[^"]+)"/gi)) {
    assets.push({ url: match[1], kind: "file" });
  }

  return assets;
}

async function downloadCover(post, root) {
  if (!post.cover || !/^https?:\/\//i.test(post.cover)) {
    return post.cover;
  }
  return downloadAsset(post.cover, root, post.slug, "cover", "image");
}

async function downloadAsset(url, root, slug, basename, kind) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download Notion asset ${url}: HTTP ${response.status}`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  const extension = extensionForAsset(url, contentType);
  const fileName = `${basename}${extension}`;
  const relative = path.join(kind === "file" ? "files" : "images", "notion", slug, fileName);
  const destination = path.join(root, "static", relative);
  await mkdir(path.dirname(destination), { recursive: true });
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(destination, buffer);
  return `/${relative.split(path.sep).join("/")}`;
}

function extensionForAsset(url, contentType) {
  const contentTypeExtension = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "video/ogg": ".ogv",
    "video/quicktime": ".mov",
    "audio/mpeg": ".mp3",
    "audio/ogg": ".oga",
    "audio/wav": ".wav",
    "audio/webm": ".weba",
    "application/pdf": ".pdf",
    "application/zip": ".zip",
  }[contentType.split(";")[0].trim().toLowerCase()];
  if (contentTypeExtension) {
    return contentTypeExtension;
  }

  try {
    const pathname = new URL(url).pathname;
    const extension = path.extname(pathname);
    if (extension) {
      return extension.toLowerCase();
    }
  } catch {
  }
  return ".bin";
}

async function writeContentSourceMeta(root, meta) {
  const dataDir = path.join(root, "data");
  await mkdir(dataDir, { recursive: true });
  const yaml = [
    `provider: ${yamlString(meta.provider)}`,
    `database_id: ${yamlString(meta.databaseId)}`,
    `status: ${yamlString(meta.status)}`,
    `exported_count: ${meta.exportedCount}`,
    `fetched_at: ${yamlString(meta.fetchedAt)}`,
    "paths:",
    `  - ${yamlString("content/posts")}`,
    `  - ${yamlString("static/images/notion")}`,
    `  - ${yamlString("static/files/notion")}`,
    "",
  ].join("\n");
  await writeFile(path.join(dataDir, "content-source.yaml"), yaml, "utf8");
}

function readPlainText(property) {
  if (!property) {
    return "";
  }
  if (property.type === "title") {
    return richTextToPlain(property.title);
  }
  if (property.type === "rich_text") {
    return richTextToPlain(property.rich_text);
  }
  return "";
}

function richTextToPlain(items) {
  return (items ?? []).map((item) => item.plain_text ?? "").join("").trim();
}

function readSelect(property) {
  if (!property) {
    return "";
  }
  if (property.type === "select") {
    return property.select?.name ?? "";
  }
  if (property.type === "status") {
    return property.status?.name ?? "";
  }
  return "";
}

function readMultiSelect(property) {
  if (property?.type !== "multi_select") {
    return [];
  }
  return property.multi_select.map((item) => item.name).filter(Boolean);
}

function readDate(property) {
  return property?.type === "date" ? property.date?.start ?? "" : "";
}

function readUrl(property) {
  return property?.type === "url" ? property.url ?? "" : "";
}

function readCheckbox(property, fallback = false) {
  return property?.type === "checkbox" ? Boolean(property.checkbox) : fallback;
}

function readFileUrl(property) {
  if (property?.type !== "files") {
    return "";
  }
  const file = property.files?.[0];
  return readObjectFileUrl(file);
}

function readObjectFileUrl(file) {
  if (!file) {
    return "";
  }
  if (file.type === "file") {
    return file.file?.url ?? "";
  }
  if (file.type === "external") {
    return file.external?.url ?? "";
  }
  return "";
}

function containsMath(markdown) {
  return /(^|\n)\s*\$\$[\s\S]*?\$\$|\$[^$\n]+\$/.test(markdown);
}

function yamlString(value) {
  const text = String(value ?? "");
  return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, "\\n")}"`;
}

async function runCli() {
  const args = process.argv.slice(2);
  const rootIndex = args.indexOf("--root");
  const root = rootIndex === -1 ? process.cwd() : args[rootIndex + 1];
  const result = await fetchNotionContent({ root });
  console.log(`Fetched ${result.exportedCount} published Notion posts.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await runCli();
}
