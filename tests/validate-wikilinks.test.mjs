import test from "node:test";
import assert from "node:assert/strict";
import { findObsidianArtifacts } from "../scripts/validate-wikilinks.mjs";

test("technical code and exported Mermaid do not become wikilinks", () => {
  const article = '```python\ngreen = np.uint8([[[0, 255, 0]]])\n```\n\n<pre class="mermaid">\nflowchart LR\n a --> app[["Application"]]\n</pre>\n\nAn inline example: `[[note]]`.\n';
  assert.deepEqual(findObsidianArtifacts(article), []);
});

test("real prose links and embeds are still rejected alongside code", () => {
  const article = '```python\na = [[0]]\n```\n\nRead [[Missing page]] and ![[image.png]].';
  assert.deepEqual(findObsidianArtifacts(article), ["[[Missing page]]", "![[image.png]]"]);
});

test("Markdown parser handles indented code and quoted variable-length fences", () => {
  const article = '    a = [[0]]\n\n> ~~~~python\n> x = [[1]]\n> ~~~~\n\n``a = `[[2]]` ``\n\n[[Still a link]]';
  assert.deepEqual(findObsidianArtifacts(article), ["[[Still a link]]"]);
});

test("prose after raw pre remains subject to validation", () => {
  assert.deepEqual(findObsidianArtifacts('<pre>[[example]]</pre>\n\n[[Unconverted]]'), ["[[Unconverted]]"]);
});
