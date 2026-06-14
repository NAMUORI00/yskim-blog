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
  installCustomTransformers(n2m);

  await prepareGeneratedContent(root);
  await ensureBaseContent(root);
  const pages = await queryPublishedPages(notion, databaseId, propertyNames, status);
  const exported = [];

  for (const page of pages) {
    const post = pageToPost(page, propertyNames);
    const rawMarkdown = await convertPageToMarkdown(n2m, page.id);
    const bodyWithAssets = await downloadAndRewriteAssets(rawMarkdown, post, root);
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

function installCustomTransformers(n2m) {
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
    const playerUrl = toPlayerEmbedUrl(url);
    if (playerUrl) {
      return videoEmbedTag(playerUrl, caption);
    }
    return caption ? `[${caption}](${url})` : `<${url}>`;
  });

  n2m.setCustomTransformer("video", async (block) => {
    const url = readObjectFileUrl(block?.video);
    if (!url) {
      return "";
    }
    const caption = richTextToPlain(block.video?.caption);
    const playerUrl = toPlayerEmbedUrl(url);
    if (playerUrl) {
      return videoEmbedTag(playerUrl, caption);
    }
    // Notion-hosted upload or a direct video file: render a native player.
    // The (temporary) URL is downloaded and rewritten to a local path later.
    return videoFileTag(url, caption);
  });

  n2m.setCustomTransformer("audio", async (block) => {
    const url = readObjectFileUrl(block?.audio);
    if (!url) {
      return "";
    }
    const caption = richTextToPlain(block.audio?.caption);
    return audioFileTag(url, caption);
  });

  n2m.setCustomTransformer("callout", async (block) => {
    const text = richTextToPlain(block.callout?.rich_text);
    const icon = block.callout?.icon?.emoji ? `${block.callout.icon.emoji} ` : "";
    return `> ${icon}${String(text).replace(/\n/g, "\n> ")}`;
  });
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

async function downloadAndRewriteAssets(markdown, post, root) {
  const remoteAssets = collectRemoteMarkdownAssets(markdown);
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

function collectRemoteMarkdownAssets(markdown) {
  const assets = [];

  for (const match of markdown.matchAll(/!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g)) {
    assets.push({ url: match[1], kind: "image" });
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
