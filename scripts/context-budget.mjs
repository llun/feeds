#!/usr/bin/env node
// Keeps the files agents read as instructions from growing, and keeps history out of them.
//
//   node scripts/context-budget.mjs [--base <git ref>] [--update] [--config <path>]
//
// Reads context-budget.json at the top of the repository:
//   target   bytes a budgeted file may grow to once it is under it (default 12288).
//   files    { path: ceiling } in bytes. A file may never be bigger than its ceiling, and a ceiling may never
//            be above max(file size, target): when a file shrinks, its ceiling comes down with it (--update
//            writes the lowered ceilings). Raising a ceiling is an edit to this file, which a reviewer sees.
//   targets  { path: bytes } a per-file target in place of `target`.
//   routes   files whose links to other Markdown files are required reading. Only reported, never enforced:
//            the size of what each line of a route makes an agent read, with every linked section counted.
//   history  extra files where added lines must not carry history (PR or issue numbers, phase numbers,
//            "since <date>"). The budgeted files and every file a route links to are always included.
//            Needs --base (or GITHUB_BASE_REF in CI); without a base the history check is skipped.
// Exits 1 when a check fails. Plain Node, no dependencies.
import { execFileSync } from "node:child_process";
import { existsSync, lstatSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join, normalize, relative } from "node:path";
import { fileURLToPath } from "node:url";

export const HISTORY = [
  /(^|[\s(\[])#\d{1,5}(?![\w-])/, // "#123", "(#2837)": a PR or issue number
  /\bPRs? ?#?\d+[a-z]?\d*\b/i, // "PR 15", "PR #15", "PR15b"
  /\bphase \d+/i, // "phase 2"
  /\bsince (\d{1,2} )?(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* (\d{1,2},? )?\d{4}\b/i,
  /\bsince \d{4}-\d{2}-\d{2}\b/i,
];

export function historyHit(line) {
  return HISTORY.some((re) => re.test(line));
}

// GitHub's heading slug: lower case, punctuation dropped, spaces to hyphens.
export function slug(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");
}

// The bytes from an anchor (an `<a id>` or a heading's slug) to the next heading of the same or a higher level.
// A `#` line inside a code fence is a comment, not a heading.
export function sectionBytes(text, anchor) {
  const lines = text.split("\n");
  let fence = null; // the opening marker, e.g. "````"; a fence closes on the same character, at least as long, bare
  const inFence = [];
  const heading = lines.map((l, i) => {
    const m = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(l);
    const opens = fence === null && m !== null && !(m[1][0] === "`" && m[2].includes("`"));
    inFence[i] = fence !== null || opens;
    if (opens) fence = m[1];
    else if (fence !== null && m && m[1][0] === fence[0] && m[1].length >= fence.length && !m[2].trim()) fence = null;
    else if (fence === null) return /^(#{1,6})\s+(.*)$/.exec(l);
    return null;
  });
  let start = -1;
  for (let i = 0; i < lines.length && start < 0; i++) {
    if (!inFence[i] && lines[i].includes(`id="${anchor}"`)) start = i;
    if (heading[i] && slug(heading[i][2]) === anchor) start = i;
  }
  if (start < 0) return null;
  let level = 7;
  let end = lines.length;
  for (let i = start; i < lines.length; i++) {
    const h = heading[i];
    if (!h) continue;
    if (level === 7) level = h[1].length;
    else if (h[1].length <= level) {
      end = i;
      break;
    }
  }
  return Buffer.byteLength(lines.slice(start, end).join("\n"));
}

// Links to Markdown files in the repository, per line of a route file: [{ line, links: [{ file, anchor }] }].
export function routeLinks(text, from) {
  const out = [];
  text.split("\n").forEach((line, i) => {
    const links = [];
    for (const m of line.matchAll(/\]\(([^)\s#]+\.md)(?:#([^)\s]+))?\)/g)) {
      if (/^[a-z]+:/i.test(m[1])) continue;
      links.push({ file: normalize(join(dirname(from), m[1])), anchor: m[2] ?? null });
    }
    if (links.length) out.push({ line: i + 1, links });
  });
  return out;
}

function realFile(root, path) {
  const abs = join(root, path);
  return existsSync(abs) && !lstatSync(abs).isSymbolicLink() && lstatSync(abs).isFile();
}

export function check(root, config, { base = null, read = (p) => readFileSync(join(root, p), "utf8"), diff = null } = {}) {
  const errors = [];
  const notes = [];
  const target = config.target ?? 12288;
  const lowerable = []; // errors --update fixes
  const ceilings = { ...config.files };
  for (const [path, ceiling] of Object.entries(ceilings)) {
    if (!realFile(root, path)) {
      errors.push(`${path} is in context-budget.json but is not a file here: remove it from "files".`);
      continue;
    }
    const size = Buffer.byteLength(read(path));
    const goal = config.targets?.[path] ?? target;
    const allowed = Math.max(size, goal);
    if (size > ceiling)
      errors.push(`${path} is ${size} bytes, over its ceiling of ${ceiling}. Replace or move text instead of adding it (a rule a test can check becomes the test), or raise the ceiling in context-budget.json and say why in the PR.`);
    else if (ceiling > allowed) {
      errors.push(`${path} is ${size} bytes, so its ceiling of ${ceiling} must come down to ${allowed}: run node scripts/context-budget.mjs --update.`);
      lowerable.push(errors.at(-1));
    }
    else notes.push(`${path}: ${size} of ${ceiling} bytes${size > goal ? ` (target ${goal})` : ""}`);
    ceilings[path] = Math.min(ceiling, allowed);
  }

  const required = new Set();
  for (const route of config.routes ?? []) {
    if (!realFile(root, route)) {
      errors.push(`route ${route} is not a file here.`);
      continue;
    }
    const rows = routeLinks(read(route), route);
    const totals = [];
    for (const { line, links } of rows) {
      let bytes = 0;
      for (const { file, anchor } of links) {
        if (!realFile(root, file)) {
          errors.push(`${route}:${line} links to ${file}, which is not a file here.`);
          continue;
        }
        required.add(file);
        const text = read(file);
        const part = anchor ? sectionBytes(text, anchor) : Buffer.byteLength(text);
        if (part === null) errors.push(`${route}:${line} links to ${file}#${anchor}, which has no such anchor.`);
        else bytes += part;
      }
      totals.push({ line, bytes });
    }
    if (totals.length) {
      const sorted = totals.map((t) => t.bytes).sort((a, b) => a - b);
      const top = [...totals].sort((a, b) => b.bytes - a.bytes).slice(0, 3);
      notes.push(`${route}: required reading per line, median ${sorted[Math.floor(sorted.length / 2)]} bytes, largest ${top.map((t) => `${t.bytes} (line ${t.line})`).join(", ")}`);
    }
  }

  if (base) {
    const files = [...new Set([...Object.keys(config.files ?? {}), ...required, ...(config.history ?? [])])].filter((p) => realFile(root, p));
    const added = diff ? diff(files) : addedLines(root, base, files);
    for (const { file, line, text } of added)
      if (historyHit(text)) errors.push(`${file}:${line} adds history to an instruction file ("${text.trim().slice(0, 80)}"). Say what is true now; the PR and git keep the history.`);
  } else notes.push("no base ref, so added lines were not checked for history");

  return { errors, notes, ceilings, lowerable };
}

// Lines the change adds to the files, relative to the merge base with `base`. A line the same change removes
// somewhere else in the repository was moved, not added, so it is left out.
export function parseAdded(diffText, files) {
  const wanted = new Set(files);
  const added = [];
  const removed = new Set();
  let file = null;
  let line = 0;
  let header = false; // between "diff --git" and the first "@@", where "--- "/"+++ " name the files
  for (const l of diffText.split("\n")) {
    if (l.startsWith("diff --git ")) [header, file] = [true, null];
    else if (header && l.startsWith("+++ ")) file = l.startsWith("+++ b/") ? l.slice(6).replace(/\t$/, "") : null;
    else if (header && !l.startsWith("@@ ")) continue;
    else if (l.startsWith("@@ ")) [header, line] = [false, Number(/\+(\d+)/.exec(l)[1])];
    else if (l.startsWith("-")) removed.add(l.slice(1).trim());
    else if (l.startsWith("+")) {
      if (file && wanted.has(file)) added.push({ file, line, text: l.slice(1) });
      line++;
    }
  }
  return added.filter((a) => !removed.has(a.text.trim()));
}

function addedLines(root, base, files) {
  if (!files.length) return [];
  const mergeBase = execFileSync("git", ["merge-base", base, "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const out = execFileSync("git", ["-c", "core.quotePath=false", "diff", "--no-color", "--no-ext-diff", "--no-renames", "--src-prefix=a/", "--dst-prefix=b/", "-U0", mergeBase], { cwd: root, encoding: "utf8", maxBuffer: 256 << 20 });
  return parseAdded(out, files);
}

function main(argv) {
  const args = { base: null, update: false, config: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--update") args.update = true;
    else if ((argv[i] === "--base" || argv[i] === "--config") && argv[i + 1] && !argv[i + 1].startsWith("--")) args[argv[i].slice(2)] = argv[++i];
    else if (argv[i] === "--base" || argv[i] === "--config") {
      console.error(`${argv[i]} needs a value`);
      return 2;
    } else {
      console.error(`unknown argument ${argv[i]}`);
      return 2;
    }
  }
  const root = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
  const configPath = args.config ?? join(root, "context-budget.json");
  const config = JSON.parse(readFileSync(configPath, "utf8"));
  const base = args.base ?? (process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : null);
  const { errors: all, notes, ceilings, lowerable } = check(root, config, { base });
  for (const n of notes) console.log(`ok   ${n}`);
  const errors = args.update ? all.filter((e) => !lowerable.includes(e)) : all;
  if (args.update) {
    writeFileSync(configPath, JSON.stringify({ ...config, files: ceilings }, null, 2) + "\n");
    console.log(`wrote lowered ceilings to ${relative(process.cwd(), configPath) || configPath}`);
  }
  for (const e of errors) console.log(`FAIL ${e}`);
  return errors.length ? 1 : 0;
}

// Compare real paths: import.meta.url is percent-encoded and symlink-resolved, argv[1] is neither.
if (process.argv[1] && existsSync(process.argv[1]) && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) process.exit(main(process.argv.slice(2)));
