import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, parse, resolve, sep } from "node:path";

const bundleUrl = process.env.ASTRAIL_SDK_BUNDLE_URL;
const appUrl = process.env.ASTRAIL_APP_URL ?? process.env.NEXT_PUBLIC_APP_URL;
const serverId = process.env.ASTRAIL_SERVER_ID;
const apiKey = process.env.ASTRAIL_API_KEY ?? process.env.ASTRAIL_MCP_API_KEY;
const outDir = resolve(process.env.ASTRAIL_SDK_OUT_DIR ?? "astrail-sdk-bundle");

function fail(message, detail) {
  console.error(`FAIL: ${message}`);
  if (detail) console.error(detail);
  process.exit(1);
}

function endpoint() {
  if (bundleUrl) return bundleUrl;
  if (appUrl && serverId) return `${appUrl.replace(/\/$/, "")}/api/servers/${serverId}/sdk`;
  fail("Set ASTRAIL_SDK_BUNDLE_URL or ASTRAIL_APP_URL + ASTRAIL_SERVER_ID.");
}

function ensureSafeOutputDir() {
  const root = parse(outDir).root;
  const cwd = resolve(process.cwd());
  if (outDir === root || outDir === cwd || cwd.startsWith(outDir + sep)) {
    fail(`Refusing to replace dangerous SDK output dir: ${outDir}`);
  }
}

function outputPath(filePath, writtenPaths) {
  if (typeof filePath !== "string" || filePath.length === 0 || filePath.includes("\0")) {
    fail("SDK bundle contains an invalid file path.");
  }
  const path = resolve(outDir, filePath);
  if (path !== outDir && !path.startsWith(outDir + sep)) {
    fail(`Refusing to write outside output dir: ${filePath}`);
  }
  if (writtenPaths.has(path)) {
    fail(`SDK bundle contains a duplicate file path: ${filePath}`);
  }
  writtenPaths.add(path);
  return path;
}

function planBundleFiles(files) {
  const writtenPaths = new Set();
  return files.map((file) => {
    if (!file || typeof file.content !== "string") fail("SDK bundle contains an invalid file entry.");
    return {
      path: outputPath(file.path, writtenPaths),
      content: file.content,
    };
  });
}

async function main() {
  ensureSafeOutputDir();
  const url = endpoint();
  const response = await fetch(url, {
    headers: {
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
  });
  const bundle = await response.json().catch(() => null);
  if (!response.ok || bundle?.runtime !== "astrail-sdk-factory" || !Array.isArray(bundle.files)) {
    fail("Could not fetch SDK bundle.", JSON.stringify(bundle, null, 2));
  }
  const files = planBundleFiles(bundle.files);

  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  for (const file of files) {
    await mkdir(dirname(file.path), { recursive: true });
    await writeFile(file.path, file.content);
  }

  console.log(`PASS: wrote ${files.length} SDK files to ${outDir}`);
}

main().catch((error) => fail(error instanceof Error ? error.message : "unknown SDK pull failure"));
