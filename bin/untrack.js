#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { isRepo, trackedFiles, checkIgnore, diagnose } from "../src/diagnose.js";
const VERSION = "0.1.0";
function help() {
  console.log("untrack " + VERSION + " - fix \".gitignore not working\" (tracked-but-ignored files)");
  console.log("");
  console.log("Usage:");
  console.log("  untrack check [file...] [--json]     explain why each file is (not) ignored");
  console.log("  untrack fix [file...] [--dry-run]   git rm --cached (keeps working-tree files)");
  console.log("  untrack scan [--json]               find all tracked files that match ignore rules");
  console.log("");
  console.log("Safety: fix keeps working-tree files, refuses --force-less history rewrites, prints exact git commands.");
}
function fail(m) { console.error("untrack: " + m); process.exit(2); }
function sh(cmd, args, cwd) {
  return new Promise((resolve) => {
    execFile(cmd, args, { cwd }, (e, so) => e ? resolve({ ok: false }) : resolve({ ok: true, out: String(so) }));
  });
}
const argv = process.argv.slice(2);
const cmd = argv[0];
if (!cmd || cmd === "--help" || cmd === "-h") { help(); process.exit(0); }
if (cmd === "--version" || cmd === "-v") { console.log(VERSION); process.exit(0); }
const cwd = process.cwd();
if (!(await isRepo(cwd))) fail("not inside a git work tree");
const json = argv.includes("--json");
if (cmd === "check") {
  const files = argv.slice(1).filter((a) => !a.startsWith("-"));
  if (!files.length) fail("check needs at least one file");
  const out = [];
  for (const f of files) out.push(await diagnose(cwd, f));
  if (json) console.log(JSON.stringify(out, null, 2));
  else for (const d of out) { console.log("== " + d.relFile + " [" + d.status + "]"); for (const l of (d.findings || [])) console.log("  - " + l); }
} else if (cmd === "scan") {
  const tracked = await trackedFiles(cwd);
  const hits = [];
  for (const f of tracked) { const ig = await checkIgnore(cwd, f); if (ig.ignored) hits.push({ file: f, rule: (ig.source || "?") + ":" + (ig.lineno || "?") }); }
  if (json) console.log(JSON.stringify({ count: hits.length, hits }, null, 2));
  else if (!hits.length) console.log("untrack: no tracked-but-ignored files. Clean.");
  else { console.log("untrack: " + hits.length + " tracked file(s) match ignore rules:"); for (const h of hits) console.log("  " + h.file + "  [" + h.rule + "]"); console.log("Fix with: untrack fix <file> (dry-run default off; use --dry-run to preview)"); }
} else if (cmd === "fix") {
  const dry = argv.includes("--dry-run");
  const files = argv.slice(1).filter((a) => !a.startsWith("-"));
  if (!files.length) fail("fix needs at least one file");
  for (const f of files) {
    const d = await diagnose(cwd, f);
    if (d.error) fail(d.error);
    if (d.status === "ignored-ok" || d.status === "gone-untracked") { console.log("skip " + f + " [" + d.status + "]"); continue; }
    if (d.status === "tracked-no-rule") fail(f + ": no ignore rule matches - add one first, then re-run fix");
    if (dry) { console.log("[dry-run] would run: git rm --cached -- " + f); continue; }
    const r = await sh("git", ["rm", "--cached", "--", f], cwd);
    console.log(r.ok ? ("untracked " + f + " (working-tree file kept)") : ("FAILED " + f));
    if (!r.ok) process.exitCode = 1;
  }
  console.log("Next: commit the removal, then verify with: untrack check <file>");
} else fail("Unknown command: " + cmd);
