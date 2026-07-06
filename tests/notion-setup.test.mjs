import test from "node:test";
import assert from "node:assert/strict";

import { parseGhList, summarizeNotionSetup } from "../scripts/notion-setup.mjs";

test("parses GitHub CLI table output into names and values", () => {
  const rows = parseGhList(`
CONTENT_SOURCE\tnotion\t2026-06-12T06:48:12Z
NOTION_DATABASE_ID\t2e8cf325d81c4acdb302800e2dcfc4df\t2026-06-12T06:40:34Z
NOTION_STATUS\tPublished\t2026-06-12T06:48:12Z
`);

  assert.deepEqual(rows, new Map([
    ["CONTENT_SOURCE", "notion"],
    ["NOTION_DATABASE_ID", "2e8cf325d81c4acdb302800e2dcfc4df"],
    ["NOTION_STATUS", "Published"],
  ]));
});

test("reports the exact missing Notion token handoff when the secret is absent", () => {
  const summary = summarizeNotionSetup({
    repo: "NAMUORI00/yskim-blog",
    secrets: new Map([
      ["CLOUDFLARE_API_TOKEN", "2026-06-09T04:45:25Z"],
    ]),
    variables: new Map([
      ["CONTENT_SOURCE", "notion"],
      ["NOTION_POSTS_DATABASE_ID", "posts-db"],
      ["NOTION_SITE_DATABASE_ID", "site-db"],
      ["NOTION_STATUS", "Published"],
    ]),
  });

  assert.equal(summary.readyForNotionDryRun, false);
  assert.deepEqual(summary.missing, ["NOTION_TOKEN"]);
  assert.match(summary.nextSteps.join("\n"), /gh secret set NOTION_TOKEN --repo NAMUORI00\/yskim-blog/);
});

test("requires split Notion database variables even if the legacy database id exists", () => {
  const summary = summarizeNotionSetup({
    repo: "NAMUORI00/yskim-blog",
    secrets: new Map([["NOTION_TOKEN", "2026-06-12T07:30:00Z"]]),
    variables: new Map([
      ["CONTENT_SOURCE", "notion"],
      ["NOTION_DATABASE_ID", "2e8cf325d81c4acdb302800e2dcfc4df"],
      ["NOTION_STATUS", "Published"],
      ["PUBLISH_BRANCH", "production"],
    ]),
  });

  assert.equal(summary.readyForNotionDryRun, false);
  assert.deepEqual(summary.missing, ["NOTION_POSTS_DATABASE_ID", "NOTION_SITE_DATABASE_ID"]);
});

test("reports dry-run commands once split Notion database ids exist", () => {
  const summary = summarizeNotionSetup({
    repo: "NAMUORI00/yskim-blog",
    secrets: new Map([["NOTION_TOKEN", "2026-06-12T07:30:00Z"]]),
    variables: new Map([
      ["CONTENT_SOURCE", "notion"],
      ["NOTION_POSTS_DATABASE_ID", "posts-db"],
      ["NOTION_SITE_DATABASE_ID", "site-db"],
      ["NOTION_STATUS", "Published"],
      ["PUBLISH_BRANCH", "production"],
    ]),
  });

  assert.equal(summary.readyForNotionDryRun, true);
  assert.deepEqual(summary.missing, []);
  assert.doesNotMatch(summary.nextSteps.join("\n"), /NOTION_DATABASE_ID --body/);
  assert.match(summary.nextSteps.join("\n"), /gh workflow run validate-and-build\.yml/);
  assert.match(summary.nextSteps.join("\n"), /content_source=notion/);
  assert.match(summary.nextSteps.join("\n"), /notion_status=Ready/);
  assert.equal(summary.productionSource, "notion");
  assert.equal(summary.publishBranch, "production");
});

test("requires both split Notion database variables when split mode is started", () => {
  const summary = summarizeNotionSetup({
    repo: "NAMUORI00/yskim-blog",
    secrets: new Map([["NOTION_TOKEN", "2026-06-12T07:30:00Z"]]),
    variables: new Map([
      ["CONTENT_SOURCE", "notion"],
      ["NOTION_POSTS_DATABASE_ID", "posts-db"],
      ["NOTION_STATUS", "Published"],
    ]),
  });

  assert.equal(summary.readyForNotionDryRun, false);
  assert.deepEqual(summary.missing, ["NOTION_SITE_DATABASE_ID"]);
  assert.match(summary.nextSteps.join("\n"), /gh variable set NOTION_SITE_DATABASE_ID --body/);
});
