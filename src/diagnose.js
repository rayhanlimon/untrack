import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
function git(args, cwd) {
  return new Promise((resolve) => {
    execFile("git", args, { cwd, timeout: 10000 }, (err, stdout, stderr) => {
      if (err) return resolve({ ok: false, out: "", err: String((err && err.message) || err) });
      resolve({ ok: true, out: String(stdout), err: String(stderr) });
    });
  });
}
export async function isRepo(dir) {
  const r = await git(["rev-parse", "--is-inside-work-tree"], dir);
  return r.ok && r.out.trim() === "true";
}
export async function trackedFiles(dir) {
  const r = await git(["ls-files", "-z"], dir);
  if (!r.ok) return null;
  return r.out.split("\0").filter(Boolean);
}
export async function checkIgnore(dir, file) {
  // --no-index: match rules even for already-tracked files (plain check-ignore hides those by design)
  const r = await git(["check-ignore", "-v", "--no-index", "--", file], dir);
  if (!r.ok) return { ignored: false };
  const line = r.out.trim();
  const m = /^([^:]+):(\d+):(\S*)\s+(.*)$/.exec(line);
  if (!m) return { ignored: true, source: line };
  return { ignored: true, source: m[1], lineno: Number(m[2]), pattern: m[3], file: m[4] };
}
function buildGlob(body) {
  let esc = "";
  for (const ch of body) {
    if (ch === "*") esc += ".*";
    else if (ch === "?") esc += ".";
    else if ("+.^${}()|[]\\".includes(ch)) esc += "\\" + ch;
    else esc += ch;
  }
  return new RegExp("^" + esc + "$");
}
export function matchGitignorePattern(pattern, relPath) {
  let p = pattern.trim();
  if (!p || p.startsWith("#")) return { matches: false, reason: "blank-or-comment" };
  let neg = false;
  if (p.startsWith("!")) { neg = true; p = p.slice(1); }
  if (p.includes("\\")) return { matches: false, neg, reason: "backslash-needs-escaping" };
  const dirOnly = p.endsWith("/");
  if (dirOnly) p = p.slice(0, -1);
  const anchored = p.includes("/");
  const body = anchored ? p.split("/").pop() : p;
  const rx = buildGlob(body);
  const base = relPath.split("/").pop();
  const target = anchored ? relPath : base;
  const matches = rx.test(dirOnly ? base : target);
  return { matches, neg, reason: neg ? "negation-rule" : dirOnly ? "dir-only-rule" : anchored ? "anchored-path" : "basename-match" };
}
export async function diagnose(dir, relFile) {
  const findings = [];
  const abs = path.join(dir, relFile);
  let exists = true;
  try { await fs.promises.stat(abs); } catch { exists = false; }
  const tracked = await trackedFiles(dir);
  if (tracked === null) return { error: "not a git repo or git failed" };
  const isTracked = tracked.includes(relFile);
  const ig = await checkIgnore(dir, relFile);
  if (!exists && !isTracked) return { relFile, status: "gone-untracked", findings: ["file does not exist and is not tracked - nothing to do"] };
  if (!isTracked && !ig.ignored) return { relFile, status: "untracked-unignored", findings: ["not tracked and not ignored - git will show it as untracked; add a rule if it should stay out"] };
  if (!isTracked && ig.ignored) return { relFile, status: "ignored-ok", findings: ["not tracked and ignored by " + (ig.source || "a rule") + " - all good"] };
  if (isTracked && !ig.ignored) {
    findings.push("tracked but NO ignore rule matches - add a pattern (e.g. " + relFile + ") then run: untrack fix " + relFile);
    return { relFile, status: "tracked-no-rule", isTracked, ignore: ig, findings };
  }
  findings.push("tracked AND ignored - classic: file was committed BEFORE the rule existed; .gitignore never untracks");
  findings.push("rule source: " + (ig.source || "?") + (ig.lineno ? ":" + ig.lineno : "") + " pattern=" + (ig.pattern || "?"));
  findings.push("fix: untrack fix " + relFile + " (git rm --cached, keeps working-tree file)");
  return { relFile, status: "tracked-despite-rule", isTracked, ignore: ig, findings };
}
