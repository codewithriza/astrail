type MetadataValue = string | number | boolean | null | undefined;

export type UserIdentityLike = {
  email?: string | null;
  user_metadata?: Record<string, MetadataValue> | null;
  app_metadata?: Record<string, MetadataValue> | null;
};

const firstNameKeys = ["first_name", "given_name"];
const fullNameKeys = ["full_name", "name", "display_name"];
const usernameKeys = ["user_name", "preferred_username", "nickname"];
const avatarKeys = ["avatar_url", "picture", "image", "photo_url"];
const timezoneHeaders = ["x-vercel-ip-timezone", "cf-timezone", "x-timezone"];

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function firstToken(value: string) {
  const cleaned = value.trim().replace(/^@+/, "");
  if (!cleaned) return "";
  return cleaned.split(/[\s._-]+/).filter(Boolean)[0] ?? "";
}

function humanizeName(value: string) {
  const token = firstToken(value);
  if (!token) return "";
  if (token === token.toLowerCase() || token === token.toUpperCase()) {
    return `${token.charAt(0).toUpperCase()}${token.slice(1).toLowerCase()}`;
  }
  return token;
}

function firstMetadataValue(metadata: Record<string, MetadataValue> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = clean(metadata?.[key]);
    if (value) return value;
  }
  return "";
}

function safeUrl(value: string) {
  if (!value) return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : "";
  } catch {
    return "";
  }
}

export function accountDisplayName(user: UserIdentityLike | null | undefined) {
  const metadata = user?.user_metadata ?? {};
  const email = clean(user?.email);

  const providerName = firstMetadataValue(metadata, fullNameKeys);
  if (providerName) return providerName.replace(/^@+/, "");

  const username = firstMetadataValue(metadata, usernameKeys);
  if (username) return username.replace(/^@+/, "");

  if (email) return email.split("@")[0] ?? "";
  return "Builder";
}

export function accountFirstName(user: UserIdentityLike | null | undefined) {
  const metadata = user?.user_metadata ?? {};
  const email = clean(user?.email);

  const manualFirstName = firstMetadataValue(metadata, firstNameKeys);
  if (manualFirstName) return humanizeName(manualFirstName);

  const providerName = firstMetadataValue(metadata, fullNameKeys);
  if (providerName) return humanizeName(providerName);

  const username = firstMetadataValue(metadata, usernameKeys);
  if (username) return humanizeName(username);

  if (email) return humanizeName(email.split("@")[0] ?? "");
  return "Builder";
}

export function accountAvatarUrl(user: UserIdentityLike | null | undefined) {
  const metadata = user?.user_metadata ?? {};
  const appMetadata = user?.app_metadata ?? {};
  return safeUrl(firstMetadataValue(metadata, avatarKeys)) || safeUrl(firstMetadataValue(appMetadata, avatarKeys));
}

function validTimezone(value: string) {
  if (!value) return "";
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format(new Date());
    return value;
  } catch {
    return "";
  }
}

export function timezoneFromHeaders(headersList: Headers) {
  for (const header of timezoneHeaders) {
    const timezone = validTimezone(headersList.get(header) ?? "");
    if (timezone) return timezone;
  }
  return "";
}

function hourForTimezone(date: Date, timezone?: string | null) {
  const hour = Number(
    new Intl.DateTimeFormat("en", {
      hour: "numeric",
      hour12: false,
      timeZone: validTimezone(timezone ?? "") || undefined,
    }).format(date)
  );

  return Number.isFinite(hour) ? hour % 24 : date.getHours();
}

export function timeGreeting(date = new Date(), timezone?: string | null) {
  const hour = hourForTimezone(date, timezone);

  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  if (hour >= 17 && hour < 22) return "Good evening";
  return "Good night";
}
