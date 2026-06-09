import { access, mkdir, readdir, readFile, rename, rm } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const MARKER = "---";

export function slugifyPathSegment(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .trim()
    .replace(/^["']|["']$/g, "")
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/[\\/]+/g, "-")
    .replace(/[^\p{L}\p{N}-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function expectedPostPath(text, fallbackFileName = "") {
  const frontMatter = parseFrontMatter(text);
  const category = readFirstListValue(frontMatter, "categories");
  const slug =
    readScalarValue(frontMatter, "slug") ||
    path.basename(fallbackFileName, path.extname(fallbackFileName));

  const categorySegment = slugifyPathSegment(category);
  const slugSegment = slugifyPathSegment(slug);
  if (!categorySegment || !slugSegment) {
    return null;
  }

  return toPosixPath(path.join(categorySegment, `${slugSegment}.md`));
}

export async function organizePostsByCategory(postsRoot, options = {}) {
  const check = Boolean(options.check);
  const root = path.resolve(postsRoot);
  if (!(await exists(root))) {
    return { ok: true, moved: [] };
  }

  const files = await collectMarkdownFiles(root);
  const moved = [];

  for (const file of files) {
    const fileName = path.basename(file);
    if (shouldSkipPostFile(fileName)) {
      continue;
    }

    const text = await readFile(file, "utf8");
    const expectedRelative = expectedPostPath(text, fileName);
    if (!expectedRelative) {
      throw new Error(`Unable to derive category path for ${file}`);
    }

    const currentRelative = toPosixPath(path.relative(root, file));
    if (currentRelative === expectedRelative) {
      continue;
    }

    moved.push({ from: currentRelative, to: expectedRelative });
    if (check) {
      continue;
    }

    const destination = path.join(root, ...expectedRelative.split("/"));
    await ensureNoCollision(file, destination);
    await mkdir(path.dirname(destination), { recursive: true });
    await rename(file, destination);
  }

  if (!check) {
    await removeEmptyDirectories(root);
  }

  return { ok: moved.length === 0 || !check, moved };
}

function parseFrontMatter(text) {
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== MARKER) {
    throw new Error("Missing YAML frontmatter.");
  }

  const end = lines.findIndex((line, index) => index > 0 && line.trim() === MARKER);
  if (end === -1) {
    throw new Error("Unclosed YAML frontmatter.");
  }

  return lines.slice(1, end).join("\n");
}

function readScalarValue(frontMatter, fieldName) {
  const match = frontMatter.match(new RegExp(`^${escapeRegExp(fieldName)}\\s*:\\s*(.+)$`, "m"));
  if (!match) {
    return "";
  }
  return trimYamlValue(match[1]);
}

function readFirstListValue(frontMatter, fieldName) {
  const inline = frontMatter.match(new RegExp(`^${escapeRegExp(fieldName)}\\s*:\\s*\\[(.*?)\\]\\s*$`, "m"));
  if (inline) {
    const first = inline[1].split(",")[0] ?? "";
    return trimYamlValue(first);
  }

  const lines = frontMatter.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    if (!new RegExp(`^${escapeRegExp(fieldName)}\\s*:\\s*$`).test(lines[index])) {
      continue;
    }

    for (let child = index + 1; child < lines.length; child += 1) {
      const line = lines[child];
      if (/^\S/.test(line)) {
        return "";
      }
      const item = line.match(/^\s*-\s*(.+)\s*$/);
      if (item) {
        return trimYamlValue(item[1]);
      }
    }
  }

  return "";
}

function trimYamlValue(value) {
  return String(value ?? "")
    .trim()
    .replace(/^["']|["']$/g, "")
    .trim();
}

function shouldSkipPostFile(fileName) {
  return (
    fileName === "_index.md" ||
    /^_index\.[A-Za-z-]+\.md$/.test(fileName) ||
    /\.[A-Za-z-]+\.md$/.test(fileName)
  );
}

async function collectMarkdownFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectMarkdownFiles(fullPath)));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(fullPath);
    }
  }

  return files;
}

async function removeEmptyDirectories(root) {
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const directory = path.join(root, entry.name);
    await removeEmptyDirectories(directory);
    const remaining = await readdir(directory);
    if (remaining.length === 0) {
      await rm(directory, { recursive: false });
    }
  }
}

async function ensureNoCollision(source, destination) {
  if (path.resolve(source) === path.resolve(destination)) {
    return;
  }
  if (await exists(destination)) {
    throw new Error(`Refusing to overwrite existing post path: ${destination}`);
  }
}

async function exists(target) {
  try {
    await access(target, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

function toPosixPath(value) {
  return value.split(path.sep).join("/");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function runCli() {
  const args = process.argv.slice(2);
  const check = args.includes("--check");
  const postsRoot = args.find((arg) => !arg.startsWith("--")) || "content/posts";
  const result = await organizePostsByCategory(postsRoot, { check });

  for (const item of result.moved) {
    const action = check ? "Would move" : "Moved";
    console.log(`${action}: ${item.from} -> ${item.to}`);
  }

  if (!result.ok) {
    console.error("Post files are not organized by category.");
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await runCli();
}
