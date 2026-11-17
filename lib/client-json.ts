"use client";

export async function readJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text.trim()) {
    if (!response.ok) {
      throw new Error(`Astrail returned HTTP ${response.status} without a response body. Retry, then check service status if it continues.`);
    }
    return {} as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Astrail returned an unreadable response (HTTP ${response.status}). Retry, then check service status if it continues.`);
  }
}
