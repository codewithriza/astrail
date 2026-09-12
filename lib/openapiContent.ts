function contentRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function isJsonLikeMediaType(mediaType: string) {
  const normalized = mediaType.split(";")[0].trim().toLowerCase();
  return normalized === "application/json" || normalized === "application/problem+json" || normalized.endsWith("+json");
}

export function jsonLikeContent(content: unknown) {
  const entries = Object.entries(contentRecord(content));
  const exactJson = entries.find(([mediaType]) => mediaType.trim().toLowerCase() === "application/json");
  const selected = exactJson ?? entries.find(([mediaType]) => isJsonLikeMediaType(mediaType));
  const value = selected?.[1];
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function extractJsonRequestBodySchema(requestBody: unknown) {
  const body = contentRecord(requestBody);
  const jsonContent = jsonLikeContent(body.content);
  const schema = jsonContent?.schema;
  return schema && typeof schema === "object" && !Array.isArray(schema) ? schema : null;
}
