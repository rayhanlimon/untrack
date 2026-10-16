import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { matchGitignorePattern, diagnose, checkIgnore, isRepo } from "../src/diagnose.js";
function git(args, cwd) {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd }, (e, so) => e ? reject(e) : resolve(String(so)));
  });
}
const TMPBASE = process.env.RUNNER_TEMP || "/home/shadow/git/untrack/.test-tmp";
async function mkRepo() {
  await fs.promises.mkdir(TMPBASE, { recursive: true });
  const d = await fs.promises.mkdtemp(path.join(TMPBASE, "ut-"));
  await git(["init", "-b", "main", "-q"], d);
  await git(["config", "user.email", "t@t"], d);
  await git(["config", "user.name", "t"], d);
  return d;
}
test("isRepo detects git work trees", async () => {
  const d = await mkRepo();
  assert.equal(await isRepo(d), true);
  assert.equal(await isRepo(path.join(TMPBASE, "nonexistent-xyz")), false);
});
test("diagnose tracked-despite-rule (classic .env case)", async () => {
  const d = await mkRepo();
  await fs.promises.writeFile(path.join(d, ".env"), "K=1\n");
  await git(["add", ".env"], d);
  await git(["commit", "-qm", "add env"], d);
  await fs.promises.writeFile(path.join(d, ".gitignore"), ".env\n");
  const r = await diagnose(d, ".env");
  assert.equal(r.status, "tracked-despite-rule");
  assert.ok(r.findings.join().includes("BEFORE"));
});
test("diagnose tracked-no-rule", async () => {
  const d = await mkRepo();
  await fs.promises.writeFile(path.join(d, "a.log"), "x");
  await git(["add", "a.log"], d);
  await git(["commit", "-qm", "x"], d);
  const r = await diagnose(d, "a.log");
  assert.equal(r.status, "tracked-no-rule");
});
test("diagnose ignored-ok and untracked-unignored", async () => {
  const d = await mkRepo();
  await fs.promises.writeFile(path.join(d, ".gitignore"), "*.log\n");
  await fs.promises.writeFile(path.join(d, "x.log"), "x");
  const r1 = await diagnose(d, "x.log");
  assert.equal(r1.status, "ignored-ok");
  await fs.promises.writeFile(path.join(d, "note.txt"), "hi");
  const r2 = await diagnose(d, "note.txt");
  assert.equal(r2.status, "untracked-unignored");
});
test("checkIgnore reports rule source", async () => {
  const d = await mkRepo();
  await fs.promises.writeFile(path.join(d, ".gitignore"), "*.log\n");
  const r = await checkIgnore(d, "a.log");
  assert.equal(r.ignored, true);
  assert.ok((r.source || "").includes(".gitignore"));
  const r2 = await checkIgnore(d, "keep.txt");
  assert.equal(r2.ignored, false);
});
test("matchGitignorePattern basics", () => {
  assert.equal(matchGitignorePattern("*.log", "a.log").matches, true);
  assert.equal(matchGitignorePattern("*.log", "a.txt").matches, false);
  assert.equal(matchGitignorePattern("# comment", "x").matches, false);
  assert.equal(matchGitignorePattern("build/", "build").matches, true);
  assert.equal(matchGitignorePattern("!keep.log", "keep.log").neg, true);
});
test("matchGitignorePattern negation and anchored", () => {
  const n = matchGitignorePattern("!keep.log", "keep.log");
  assert.equal(n.neg, true);
  assert.equal(matchGitignorePattern("/root-only.txt", "root-only.txt").matches, true);
  assert.equal(matchGitignorePattern("", "x").matches, false);
});
test("diagnose gone-untracked for missing file", async () => {
  const d = await mkRepo();
  const r = await diagnose(d, "nope-missing.txt");
  assert.equal(r.status, "gone-untracked");
});
