import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { check, historyHit, parseAdded, routeLinks, sectionBytes, slug } from "./context-budget.mjs";

test("history in an added line is caught, ordinary text is not", () => {
  for (const line of ["Fixed in (#2837).", "see PR 15b", "phase 2 of the editor", "since 19 November 2026", "since Nov 19, 2026", "since 2026-11-19"])
    assert.ok(historyHit(line), line);
  for (const line of ["Use `#agents-surfaces`.", "HTTP 404 means gone", "colour #0b6a69", "since the save finished", "a phased rollout"])
    assert.ok(!historyHit(line), line);
});

test("a section runs from its anchor to the next heading at its level or above", () => {
  const text = ["# A", "", '<a id="x"></a>', "### X", "body", "#### sub", "more", "### Y", "other"].join("\n");
  assert.equal(sectionBytes(text, "x"), Buffer.byteLength(['<a id="x"></a>', "### X", "body", "#### sub", "more"].join("\n")));
  assert.equal(sectionBytes(text, "y"), Buffer.byteLength(["### Y", "other"].join("\n")));
  assert.equal(sectionBytes(text, "missing"), null);
  const fenced = ["## A", "x", "```bash", "# comment", "```", "y", "## B"].join("\n");
  assert.equal(sectionBytes(fenced, "a"), Buffer.byteLength(fenced.slice(0, fenced.indexOf("\n## B"))));
  assert.equal(sectionBytes(fenced, "comment"), null);
  const nested = ["## A", "````md", "```bash", "# comment", "```", "~~~", '<a id="b"></a>', "````", "```js```", "## B", "body"].join("\n");
  assert.equal(sectionBytes(nested, "a"), Buffer.byteLength(nested.slice(0, nested.indexOf("\n## B"))));
  assert.equal(sectionBytes(nested, "b"), Buffer.byteLength("## B\nbody"));
  assert.equal(sectionBytes(["## A", '```js``` <a id="x"></a>', "body"].join("\n"), "x"), Buffer.byteLength('```js``` <a id="x"></a>\nbody'));
  assert.equal(slug("Status Posts & Actions"), "status-posts--actions");
});

test("route links resolve against the route file and skip web links", () => {
  assert.deepEqual(routeLinks("| a | [G](docs/g.md#s), [H](https://x.dev/h.md) |", "AGENTS.md"), [{ line: 1, links: [{ file: "docs/g.md", anchor: "s" }] }]);
});

test("a file over its ceiling fails, and a ceiling left above a shrunk file must come down", () => {
  const root = mkdtempSync(join(tmpdir(), "budget-"));
  writeFileSync(join(root, "A.md"), "x".repeat(100));
  assert.equal(check(root, { target: 50, files: { "A.md": 100 } }).errors.length, 0);
  assert.match(check(root, { target: 50, files: { "A.md": 90 } }).errors[0], /over its ceiling/);
  const high = check(root, { target: 50, files: { "A.md": 150 } });
  assert.match(high.errors[0], /must come down to 100/);
  assert.equal(high.ceilings["A.md"], 100);
  assert.equal(check(root, { target: 200, files: { "A.md": 200 } }).errors.length, 0);
});

test("added history fails only with a base to compare against", () => {
  const root = mkdtempSync(join(tmpdir(), "budget-"));
  writeFileSync(join(root, "A.md"), "rule\n");
  const config = { target: 100, files: { "A.md": 100 } };
  const diff = () => [{ file: "A.md", line: 2, text: "Changed in PR 12." }];
  assert.match(check(root, config, { base: "main", diff }).errors[0], /adds history/);
  assert.equal(check(root, config, { diff }).errors.length, 0);
});

test("a line moved from another file is not an added line", () => {
  const diff = ["diff --git a/A.md b/A.md", "--- a/A.md", "+++ b/A.md", "@@ -3,1 +2,0 @@", "-Moved in PR 12.", "diff --git a/B.md b/B.md", "--- /dev/null", "+++ b/B.md", "@@ -0,0 +1,2 @@", "+Moved in PR 12.", "+New in PR 13."].join("\n");
  assert.deepEqual(parseAdded(diff, ["B.md"]), [{ file: "B.md", line: 2, text: "New in PR 13." }]);
});

test("a header-like line inside a hunk is content, and only b/ paths name files", () => {
  const diff = ["diff --git a/A.md b/A.md", "--- a/A.md", "+++ b/A.md", "@@ -1,0 +1,2 @@", "+++ b/other", "+Fixed in PR 12."].join("\n");
  assert.deepEqual(parseAdded(diff, ["A.md"]).map((a) => a.line), [1, 2]);
});

test("a route link to a missing file fails", () => {
  const root = mkdtempSync(join(tmpdir(), "budget-"));
  writeFileSync(join(root, "R.md"), "[gone](gone.md)\n");
  assert.match(check(root, { files: {}, routes: ["R.md"] }).errors[0], /gone\.md, which is not a file here/);
});

// The CLI from a path with a space and through a symlink, where a naive entry guard silently skips main().
test("the command line fails over a ceiling, keeps other failures under --update, and needs values", () => {
  const root = join(mkdtempSync(join(tmpdir(), "budget-")), "a b");
  mkdirSync(join(root, "scripts"), { recursive: true });
  copyFileSync(fileURLToPath(new URL("./context-budget.mjs", import.meta.url)), join(root, "scripts/context-budget.mjs"));
  writeFileSync(join(root, "A.md"), "x".repeat(100));
  writeFileSync(join(root, "B.md"), "x".repeat(10));
  writeFileSync(join(root, "context-budget.json"), JSON.stringify({ target: 50, files: { "A.md": 90, "B.md": 80 } }));
  execFileSync("git", ["init", "-q"], { cwd: root });
  symlinkSync(root, join(dirname(root), "link"));
  const run = (script, ...args) => spawnSync("node", [script, ...args], { cwd: root, encoding: "utf8", env: { ...process.env, GITHUB_BASE_REF: "" } });
  for (const script of [join(root, "scripts/context-budget.mjs"), join(dirname(root), "link/scripts/context-budget.mjs")]) {
    const r = run(script);
    assert.equal(r.status, 1, r.stdout);
    assert.match(r.stdout, /FAIL A\.md is 100 bytes, over its ceiling/);
  }
  const update = run("scripts/context-budget.mjs", "--update");
  assert.equal(update.status, 1);
  assert.match(update.stdout, /FAIL A\.md is 100 bytes, over its ceiling/);
  assert.doesNotMatch(update.stdout, /FAIL B\.md/);
  assert.equal(run("scripts/context-budget.mjs", "--base").status, 2);
  assert.equal(run("scripts/context-budget.mjs", "--base", "--update").status, 2);
  const imported = spawnSync("node", ["--input-type=module", "-e", `await import(${JSON.stringify(join(root, "scripts/context-budget.mjs"))})`, "no-such-file"], { encoding: "utf8" });
  assert.equal(imported.status, 0, imported.stderr);
});

test("a per-file target replaces the default, which is 12 KB, and route totals are only reported", () => {
  const root = mkdtempSync(join(tmpdir(), "budget-"));
  writeFileSync(join(root, "A.md"), "x".repeat(100));
  writeFileSync(join(root, "R.md"), "[a](A.md)\n");
  assert.match(check(root, { files: { "A.md": 12289 } }).errors[0], /must come down to 12288/);
  assert.match(check(root, { targets: { "A.md": 150 }, files: { "A.md": 200 } }).errors[0], /must come down to 150/);
  const routed = check(root, { files: {}, routes: ["R.md"] });
  assert.equal(routed.errors.length, 0);
  assert.match(routed.notes[0], /R\.md: required reading per line, median 100 bytes/);
});
