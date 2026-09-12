import { gzipSync } from "node:zlib";
import type { SdkBundle } from "./sdk-export";

const BLOCK_SIZE = 512;

function octal(value: number, bytes: number) {
  const text = value.toString(8);
  return `${text.padStart(bytes - 1, "0")}\0`;
}

function writeString(buffer: Buffer, value: string, offset: number, length: number) {
  buffer.write(value.slice(0, length), offset, length, "utf8");
}

function splitTarPath(path: string) {
  if (path.length <= 100) return { name: path, prefix: "" };
  const index = path.lastIndexOf("/", 155);
  if (index <= 0) throw new Error(`SDK archive path is too long for tar: ${path}`);
  const prefix = path.slice(0, index);
  const name = path.slice(index + 1);
  if (name.length > 100 || prefix.length > 155) {
    throw new Error(`SDK archive path is too long for tar: ${path}`);
  }
  return { name, prefix };
}

function assertSafePath(path: string) {
  if (!path || path.startsWith("/") || path.includes("..") || path.includes("\0")) {
    throw new Error(`Unsafe SDK archive path: ${path}`);
  }
}

function tarHeader(path: string, size: number, mtime: number) {
  assertSafePath(path);
  const { name, prefix } = splitTarPath(path);
  const header = Buffer.alloc(BLOCK_SIZE, 0);
  writeString(header, name, 0, 100);
  writeString(header, octal(0o644, 8), 100, 8);
  writeString(header, octal(0, 8), 108, 8);
  writeString(header, octal(0, 8), 116, 8);
  writeString(header, octal(size, 12), 124, 12);
  writeString(header, octal(mtime, 12), 136, 12);
  header.fill(" ", 148, 156);
  header[156] = "0".charCodeAt(0);
  writeString(header, "ustar", 257, 6);
  writeString(header, "00", 263, 2);
  if (prefix) writeString(header, prefix, 345, 155);

  let checksum = 0;
  for (let index = 0; index < header.length; index += 1) checksum += header[index] ?? 0;
  writeString(header, octal(checksum, 8), 148, 8);
  return header;
}

function padBlock(buffer: Buffer) {
  const remainder = buffer.length % BLOCK_SIZE;
  if (remainder === 0) return Buffer.alloc(0);
  return Buffer.alloc(BLOCK_SIZE - remainder, 0);
}

export function buildSdkTarGz(bundle: SdkBundle) {
  const mtime = Math.floor(Date.now() / 1000);
  const chunks: Buffer[] = [];

  for (const file of bundle.files) {
    assertSafePath(file.path);
    const content = Buffer.from(file.content, "utf8");
    chunks.push(tarHeader(file.path, content.length, mtime));
    chunks.push(content);
    chunks.push(padBlock(content));
  }

  chunks.push(Buffer.alloc(BLOCK_SIZE * 2, 0));
  return gzipSync(Buffer.concat(chunks), { level: 9 });
}
