import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { Agent } from "undici";

export class NetworkPolicyError extends Error {
  code: string;

  constructor(message: string, code = "upstream_url_blocked") {
    super(message);
    this.name = "NetworkPolicyError";
    this.code = code;
  }
}

function ipv4Parts(value: string) {
  const parts = value.split(".").map((part) => Number(part));
  return parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)
    ? parts
    : null;
}

function blockedIpv4Parts(parts: number[]) {
  const [first, second] = parts;
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224
  );
}

function ipv6Words(value: string) {
  const sides = value.split("::");
  if (sides.length > 2) return null;
  const parseSide = (side: string) => side ? side.split(":").flatMap((part) => {
    const dotted = ipv4Parts(part);
    if (dotted) return [(dotted[0] << 8) | dotted[1], (dotted[2] << 8) | dotted[3]];
    const word = Number.parseInt(part, 16);
    return Number.isInteger(word) && word >= 0 && word <= 0xffff ? [word] : [];
  }) : [];
  const left = parseSide(sides[0]);
  const right = parseSide(sides[1] ?? "");
  if (sides.length === 1) return left.length === 8 ? left : null;
  const zeroCount = 8 - left.length - right.length;
  return zeroCount >= 1 ? [...left, ...Array<number>(zeroCount).fill(0), ...right] : null;
}

export function isBlockedRuntimeHostname(hostname: string) {
  const lower = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  const ipVersion = isIP(lower);

  if (ipVersion === 4) {
    const parts = ipv4Parts(lower);
    if (!parts) return true;
    return blockedIpv4Parts(parts);
  }

  if (ipVersion === 6) {
    const words = ipv6Words(lower);
    if (!words) return true;
    const first = words[0];
    if (words.every((word) => word === 0) || words.slice(0, 7).every((word) => word === 0) && words[7] === 1) return true;
    if ((first & 0xfe00) === 0xfc00 || (first & 0xffc0) === 0xfe80 || (first & 0xff00) === 0xff00) return true;

    const isMapped = words.slice(0, 5).every((word) => word === 0) && words[5] === 0xffff;
    const isCompatible = words.slice(0, 6).every((word) => word === 0);
    if (isMapped || isCompatible) {
      const embedded = [words[6] >> 8, words[6] & 0xff, words[7] >> 8, words[7] & 0xff];
      return blockedIpv4Parts(embedded);
    }
    return false;
  }

  return (
    lower === "localhost" ||
    lower === "0.0.0.0" ||
    lower.endsWith(".local")
  );
}

export function assertPublicHttpUrl(url: URL) {
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new NetworkPolicyError("Only public http/https upstream URLs are supported.", "upstream_protocol_blocked");
  }

  if (isBlockedRuntimeHostname(url.hostname)) {
    throw new NetworkPolicyError("Upstream URL points to a blocked private or local network target.");
  }
}

export async function resolveSafeUpstreamAddresses(url: URL) {
  assertPublicHttpUrl(url);

  const literal = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(literal)) return [literal];

  let addresses: Array<{ address: string }> = [];
  try {
    addresses = await lookup(url.hostname, { all: true, verbatim: true });
  } catch {
    throw new NetworkPolicyError("Could not resolve upstream hostname.", "upstream_dns_failed");
  }

  if (addresses.length === 0 || addresses.some((item) => isBlockedRuntimeHostname(item.address))) {
    throw new NetworkPolicyError("Upstream hostname resolves to a blocked private or local network target.");
  }
  return Array.from(new Set(addresses.map((item) => item.address)));
}

export async function assertSafeUpstreamUrl(url: URL) {
  await resolveSafeUpstreamAddresses(url);
}

export async function createPinnedPublicDispatcher(url: URL) {
  const addresses = await resolveSafeUpstreamAddresses(url);
  let cursor = 0;
  const dispatcher = new Agent({
    connect: {
      lookup(_hostname, options, callback) {
        const family = typeof options === "object" && options && "family" in options ? Number(options.family) : 0;
        const eligible = addresses.filter((address) => family === 0 || isIP(address) === family);
        if (typeof options === "object" && options && "all" in options && options.all) {
          const candidates = (eligible.length > 0 ? eligible : addresses).map((address) => ({
            address,
            family: isIP(address),
          }));
          callback(null, candidates as never);
          return;
        }
        const selected = eligible[cursor % eligible.length] ?? addresses[cursor % addresses.length];
        cursor += 1;
        callback(null, selected, isIP(selected));
      },
    },
  });
  return dispatcher;
}

export async function readBoundedResponseText(response: Response, maxBytes: number, label = "Upstream response") {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new Error(`${label} exceeded ${maxBytes} bytes.`);
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        throw new Error(`${label} exceeded ${maxBytes} bytes.`);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(body);
}
