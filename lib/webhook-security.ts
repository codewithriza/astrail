import { createHash, createHmac, timingSafeEqual } from "crypto";

const SENSITIVE_HEADER_PATTERN = /(^|[-_])(authorization|cookie|token|secret|api[-_]?key)([-_]|$)/i;

export function isSensitiveWebhookHeader(name: string) {
  return SENSITIVE_HEADER_PATTERN.test(name.trim());
}

function signedWebhookMessage(raw: string, eventId?: string | null) {
  return eventId ? `${eventId}.${raw}` : raw;
}

export function signWebhookPayload(raw: string, secret: string, eventId?: string | null) {
  return createHmac("sha256", secret).update(signedWebhookMessage(raw, eventId)).digest("hex");
}

export function verifyWebhookSignature(raw: string, supplied: string, secret: string, eventId?: string | null) {
  const normalized = supplied.trim().replace(/^sha256=/i, "");
  if (!/^[a-f0-9]{64}$/i.test(normalized)) return false;
  return timingSafeEqual(Buffer.from(normalized, "hex"), Buffer.from(signWebhookPayload(raw, secret, eventId), "hex"));
}
export type WebhookProvider="generic"|"github"|"slack"|"stripe";
function secureHex(expected:string,supplied:string){return /^[a-f0-9]+$/i.test(supplied)&&expected.length===supplied.length&&timingSafeEqual(Buffer.from(expected,"hex"),Buffer.from(supplied,"hex"));}
export function verifyProviderWebhookSignature(provider:WebhookProvider,raw:string,headers:Headers,secret:string,eventId?:string|null,now=Math.floor(Date.now()/1000)){
 if(provider==="generic")return verifyWebhookSignature(raw,headers.get("x-astrail-signature")??"",secret,eventId);
 if(provider==="github"){const supplied=(headers.get("x-hub-signature-256")??"").replace(/^sha256=/,"");return secureHex(createHmac("sha256",secret).update(raw).digest("hex"),supplied);}
 if(provider==="slack"){const timestamp=headers.get("x-slack-request-timestamp")??"";if(!/^\d+$/.test(timestamp)||Math.abs(now-Number(timestamp))>300)return false;const supplied=(headers.get("x-slack-signature")??"").replace(/^v0=/,"");return secureHex(createHmac("sha256",secret).update(`v0:${timestamp}:${raw}`).digest("hex"),supplied);}
 const stripe=headers.get("stripe-signature")??"";const timestamp=stripe.match(/(?:^|,)t=(\d+)/)?.[1];const signatures=Array.from(stripe.matchAll(/(?:^|,)v1=([a-f0-9]+)/gi)).map((m)=>m[1]);if(!timestamp||Math.abs(now-Number(timestamp))>300)return false;const expected=createHmac("sha256",secret).update(`${timestamp}.${raw}`).digest("hex");return signatures.some((value)=>secureHex(expected,value));
}

export function webhookEventId(raw: string, supplied?: string | null) {
  return (supplied || createHash("sha256").update(raw).digest("hex")).slice(0, 240);
}

export async function readBoundedRequestText(request: Request, maxBytes: number) {
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel();
        return null;
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
