import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { unified } from "unified";
import remarkParse from "remark-parse";

const parser = unified().use(remarkParse);

export function findObsidianArtifacts(markdown) {
  const ranges = [];
  function visit(node) {
    if (node.type === "code" || node.type === "inlineCode") {
      ranges.push([node.position.start.offset, node.position.end.offset]);
      return;
    }
    // The Notion exporter emits Mermaid diagrams as raw HTML pre blocks.
    if (node.type === "html") {
      for (const match of node.value.matchAll(/<pre\b[^>]*>[\s\S]*?<\/pre\s*>/gi)) {
        const start = node.position.start.offset + match.index;
        ranges.push([start, start + match[0].length]);
      }
    }
    for (const child of node.children ?? []) visit(child);
  }
  visit(parser.parse(markdown));
  let prose = markdown;
  for (const [start, end] of ranges.sort((a, b) => b[0] - a[0])) {
    prose = prose.slice(0, start) + prose.slice(start, end).replace(/[^\r\n]/g, " ") + prose.slice(end);
  }
  return [...prose.matchAll(/!?\[\[[^\]\r\n]+\]\]/g)].map((match) => match[0]);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2];
  if (!file) throw new Error("Usage: node scripts/validate-wikilinks.mjs <markdown-file>");
  const artifacts = findObsidianArtifacts(await readFile(file, "utf8"));
  if (artifacts.length) {
    console.error(`Unconverted Obsidian links or embeds in ${file}: ${artifacts.join(", ")}`);
    process.exitCode = 1;
  }
}
