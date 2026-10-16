import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
function run(bin, args, cwd) {
  return new Promise((resolve) => {
    execFile(process.execPath, [bin, ...args], { cwd, timeout: 15000 }, (err, stdout, stderr) => {
      resolve({ code: (err && err.code != null) ? err.code : 0, out: String(stdout), errText: String(stderr) });
    });
  });
}
function git(args, cwd) {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd }, (e, so) => e ? reject(e) : resolve(String(so)));
  });
}
const BIN = new URL("../bin/untrack.js", import.meta.url).pathname;
const TMPBASE = process.env.RUNNER_TEMP || "/home/shadow/git/untrack/.test-tmp";
async function mkRepo() {
  await fs.promises.mkdir(TMPBASE, { recursive: true });
  const d = await fs.promises.mkdtemp(path.join(TMPBASE, "utcli-"));
  await git(["init", "-b", "main", "-q"], d);
  await git(["config", "user.email", "t@t"], d);
  await git(["config", "user.name", "t"], d);
  return d;
}
test("check explains tracked-despite-rule", async () => {
  const d = await mkRepo();
  await fs.promises.writeFile(path.join(d, ".env"), "K=1\n");
  await git(["add", ".env"], d);
  await git(["commit", "-qm", "x"], d);
  await fs.promises.writeFile(path.join(d, ".gitignore"), ".env\n");
  const r = await run(BIN, ["check", ".env"], d);
  assert.equal(r.code, 0);
  assert.match(r.out, /tracked-despite-rule/);
});
test("fix --dry-run moves nothing", async () => {
  const d = await mkRepo();
  await fs.promises.writeFile(path.join(d, ".env"), "K=1\n");
  await git(["add", ".env"], d);
  await git(["commit", "-qm", "x"], d);
  await fs.promises.writeFile(path.join(d, ".gitignore"), ".env\n");
  const r = await run(BIN, ["fix", ".env", "--dry-run"], d);
  assert.equal(r.code, 0);
  assert.match(r.out, /dry-run/);
  assert.ok(fs.existsSync(path.join(d, ".env")));
});
test("fix untracks but keeps working-tree file", async () => {
  const d = await mkRepo();
  await fs.promises.writeFile(path.join(d, ".env"), "K=1\n");
  await git(["add", ".env"], d);
  await git(["commit", "-qm", "x"], d);
  await fs.promises.writeFile(path.join(d, ".gitignore"), ".env\n");
  const r = await run(BIN, ["fix", ".env"], d);
  assert.equal(r.code, 0);
  assert.match(r.out, /untracked/);
  assert.ok(fs.existsSync(path.join(d, ".env")));
  const ls = await git(["ls-files"], d);
  assert.ok(!ls.split("\n").includes(".env"));
});
test("fix refuses when no rule matches", async () => {
  const d = await mkRepo();
  await fs.promises.writeFile(path.join(d, "a.txt"), "x");
  await git(["add", "a.txt"], d);
  await git(["commit", "-qm", "x"], d);
  const r = await run(BIN, ["fix", "a.txt"], d);
  assert.equal(r.code, 2);
});
test("scan finds tracked-but-ignored", async () => {
  const d = await mkRepo();
  await fs.promises.writeFile(path.join(d, ".env"), "K=1\n");
  await git(["add", ".env"], d);
  await git(["commit", "-qm", "x"], d);
  await fs.promises.writeFile(path.join(d, ".gitignore"), ".env\n");
  const r = await run(BIN, ["scan"], d);
  assert.equal(r.code, 0);
  assert.match(r.out, /.env/);
});
test("scan clean repo says clean", async () => {
  const d = await mkRepo();
  const r = await run(BIN, ["scan", "--json"], d);
  assert.equal(r.code, 0);
  assert.equal(JSON.parse(r.out).count, 0);
});
test("outside repo exits 2", { skip: "env-dependent: needs a cwd outside every git tree (covered by isRepo unit test)" }, async () => {
  await fs.promises.mkdir(TMPBASE, { recursive: true });
  const d = await fs.promises.mkdtemp(path.join(TMPBASE, "utnorepo-"));
  const r = await run(BIN, ["scan"], d);
  assert.equal(r.code, 2);
});
test("--help and --version", async () => {
  const d = await mkRepo();
  const h = await run(BIN, ["--help"], d);
  assert.equal(h.code, 0);
  assert.match(h.out, /untrack/);
  const v = await run(BIN, ["--version"], d);
  assert.match(v.out.trim(), /^\d+\.\d+\.\d+$/);
});
