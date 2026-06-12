import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const workflowUrl = new URL("../.github/workflows/validate-and-build.yml", import.meta.url);
const hugoConfigUrl = new URL("../hugo.yaml", import.meta.url);

test("workflow deploys generated builds as the production branch", async () => {
  const workflow = await readFile(workflowUrl, "utf8");

  assert.match(workflow, /production_branch:/);
  assert.match(workflow, /default: production/);
  assert.match(workflow, /PUBLISH_BRANCH:/);
  assert.match(workflow, /wrangler pages deploy public/);
  assert.match(workflow, /--branch "\$\{PUBLISH_BRANCH\}"/);
});

test("workflow no longer fetches the legacy private content repository", async () => {
  const workflow = await readFile(workflowUrl, "utf8");
  const hugoConfig = await readFile(hugoConfigUrl, "utf8");

  assert.doesNotMatch(workflow, /repository_dispatch/);
  assert.doesNotMatch(workflow, /CONTENT_REPO_TOKEN/);
  assert.doesNotMatch(workflow, /yskim-blog-private/);
  assert.doesNotMatch(hugoConfig, /contentRepo:/);
});

test("workflow keeps generated Notion content out of style-only Markdown lint", async () => {
  const workflow = await readFile(workflowUrl, "utf8");

  assert.match(workflow, /markdownlint-cli2 "README\.md" "docs\/\*\*\/\*\.md"/);
  assert.doesNotMatch(workflow, /markdownlint-cli2 "content\/\*\*\/\*\.md"/);
});
