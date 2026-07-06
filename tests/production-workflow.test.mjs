import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workflowUrl = new URL("../.github/workflows/validate-and-build.yml", import.meta.url);

test("workflow deploys the Astro build to the production branch", async () => {
  const workflow = await readFile(workflowUrl, "utf8");

  assert.match(workflow, /production_branch:/);
  assert.match(workflow, /default: production/);
  assert.match(workflow, /PUBLISH_BRANCH:/);
  assert.match(workflow, /npm run build/);
  assert.match(workflow, /wrangler pages deploy dist/);
  assert.match(workflow, /--branch "\$\{PUBLISH_BRANCH\}"/);
});

test("workflow no longer builds with Hugo or fetches a legacy content repository", async () => {
  const workflow = await readFile(workflowUrl, "utf8");

  assert.doesNotMatch(workflow, /repository_dispatch/);
  assert.doesNotMatch(workflow, /CONTENT_REPO_TOKEN/);
  assert.doesNotMatch(workflow, /yskim-blog-private/);
  assert.doesNotMatch(workflow, /hugo/i);
});

test("workflow keeps generated Notion content out of style-only Markdown lint", async () => {
  const workflow = await readFile(workflowUrl, "utf8");

  assert.match(workflow, /markdownlint-cli2 "README\.md" "docs\/\*\*\/\*\.md"/);
  assert.doesNotMatch(workflow, /markdownlint-cli2 "content\/\*\*\/\*\.md"/);
});

test("workflow accepts either legacy or split Notion database variables", async () => {
  const workflow = await readFile(workflowUrl, "utf8");

  assert.match(workflow, /NOTION_DATABASE_ID:/);
  assert.match(workflow, /NOTION_POSTS_DATABASE_ID:/);
  assert.match(workflow, /NOTION_SITE_DATABASE_ID:/);
  assert.match(workflow, /NOTION_DATABASE_ID or both NOTION_POSTS_DATABASE_ID and NOTION_SITE_DATABASE_ID/);
});
