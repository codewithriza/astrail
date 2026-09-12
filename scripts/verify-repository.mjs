import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
const read = path => readFileSync(path, "utf8");
for (const file of readdirSync(".")) {
  assert.ok(!file.endsWith(".sql"), "Keep SQL files under database/, not the root.");
  assert.ok(!/^tsconfig\..+-smoke\.json$/.test(file), "Keep smoke compiler configs under config/typescript/.");
}
const pkg = JSON.parse(read("package.json"));
const lock = JSON.parse(read("package-lock.json"));
assert.match(pkg.version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, "Use a semantic package version.");
assert.equal(read("VERSION").trim(), pkg.version, "VERSION must match package.json.");
assert.equal(lock.version, pkg.version, "The lockfile must match package.json.");
assert.equal(lock.packages[""].version, pkg.version);
assert.equal(pkg.license, "MIT");

for (const file of files) {
  assert.ok(!/^(?:\.(?:agents|claude|codex)(?:\/|$)|AGENTS\.md$|CLAUDE\.md$|skills-lock\.json$|\.neon$)/.test(file), `Keep personal coding-agent setup out of Git: ${file}`);
  if (/(^|\/)\.env(?:$|\.)/.test(file)) {
    assert.ok(/(^|\/)\.env(?:\.local)?\.example$/.test(file), `Only blank environment templates belong in Git: ${file}`);
  }
}
for (const command of Object.values(pkg.scripts)) {
  for (const match of command.matchAll(/\bscripts\/[\w./-]+\.(?:mjs|cjs|ts)\b/g)) {
    assert.ok(existsSync(match[0]), `Missing script referenced by package.json: ${match[0]}`);
  }
}
const documents = files.filter(file => /^(README\.md|CONTRIBUTING\.md|SECURITY\.md|docs\/.*\.md|examples\/.*README\.md|sdk\/.*README\.md)$/.test(file));
for (const file of documents) {
  for (const [, raw] of read(file).matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
    if (/^[a-z][a-z\d+.-]*:/i.test(raw) || raw.startsWith("#")) continue;
    const target = decodeURIComponent(raw.split("#")[0]);
    assert.ok(existsSync(resolve(dirname(file), target)), `Broken local documentation link: ${file} → ${raw}`);
  }
}
console.log(`PASS: version/lockfile consistency, environment-file hygiene, script paths, and local links in ${documents.length} documents.`);
