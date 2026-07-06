import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import path from "node:path";

const execFileAsync = promisify(execFile);
const DEFAULT_REPO = "NAMUORI00/yskim-blog";

export function parseGhList(output) {
  const rows = new Map();
  for (const line of String(output ?? "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }
    const [name, value = ""] = trimmed.split(/\t+/);
    if (name) {
      rows.set(name, value);
    }
  }
  return rows;
}

export function summarizeNotionSetup({ repo = DEFAULT_REPO, secrets, variables }) {
  const missing = [];
  const nextSteps = [];
  const productionSource = variables.get("CONTENT_SOURCE") || "notion";
  const publishBranch = variables.get("PUBLISH_BRANCH") || "production";
  const hasPostsDatabase = variables.has("NOTION_POSTS_DATABASE_ID");
  const hasSiteDatabase = variables.has("NOTION_SITE_DATABASE_ID");

  if (!hasPostsDatabase) {
    missing.push("NOTION_POSTS_DATABASE_ID");
    nextSteps.push(`gh variable set NOTION_POSTS_DATABASE_ID --body <posts-database-id> --repo ${repo}`);
  }
  if (!hasSiteDatabase) {
    missing.push("NOTION_SITE_DATABASE_ID");
    nextSteps.push(`gh variable set NOTION_SITE_DATABASE_ID --body <site-database-id> --repo ${repo}`);
  }
  if (!secrets.has("NOTION_TOKEN")) {
    missing.push("NOTION_TOKEN");
    nextSteps.push(`gh secret set NOTION_TOKEN --repo ${repo}`);
    nextSteps.push("Notion DB page -> Share/Connections -> add the read-only integration.");
  }

  if (missing.length === 0) {
    nextSteps.push(
      `gh workflow run validate-and-build.yml --repo ${repo} -f content_source=notion -f notion_status=Ready -f deploy=false`,
    );
    nextSteps.push(`If the dry run passes, set CONTENT_SOURCE=notion and deploy to the ${publishBranch} branch.`);
  }

  return {
    missing,
    productionSource,
    publishBranch,
    readyForNotionDryRun: missing.length === 0,
    nextSteps,
  };
}

async function ghList(kind, repo) {
  const { stdout } = await execFileAsync("gh", [kind, "list", "--repo", repo], {
    windowsHide: true,
  });
  return parseGhList(stdout);
}

function renderSummary(summary) {
  const lines = [
    `Repository: ${summary.repo}`,
    `Production source: ${summary.productionSource}`,
    `Production branch: ${summary.publishBranch}`,
    "",
  ];

  if (summary.readyForNotionDryRun) {
    lines.push("Notion credentials are present. Next dry-run command:");
  } else {
    lines.push(`Missing: ${summary.missing.join(", ")}`);
    lines.push("Next steps:");
  }

  for (const step of summary.nextSteps) {
    lines.push(`- ${step}`);
  }

  return `${lines.join("\n")}\n`;
}

async function runCli() {
  const args = process.argv.slice(2);
  const repoIndex = args.indexOf("--repo");
  const repo = repoIndex === -1 ? DEFAULT_REPO : args[repoIndex + 1];
  const [secrets, variables] = await Promise.all([
    ghList("secret", repo),
    ghList("variable", repo),
  ]);
  const summary = summarizeNotionSetup({ repo, secrets, variables });
  console.log(renderSummary({ ...summary, repo }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await runCli();
}
