const valueOptions = new Set(["endpoint", "api-key", "task-token", "args", "query", "execution-id", "workspace"]);

export function parseArguments(argv) {
  const options = {};
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--help" || value === "-h") return { options: {}, positional: ["help"] };
    if (!value.startsWith("--")) {
      positional.push(value);
      continue;
    }
    const key = value.slice(2);
    if (!valueOptions.has(key)) throw new Error(`Unknown option: --${key}`);
    const next = argv[++index];
    if (next === undefined || next.startsWith("--")) throw new Error(`--${key} requires a value.`);
    if (Object.hasOwn(options, key)) throw new Error(`--${key} must be specified only once.`);
    options[key] = next;
  }
  return { options, positional };
}

export function validateEndpoint(value) {
  let url;
  try { url = new URL(value); } catch { throw new Error("The endpoint must be an absolute HTTP or HTTPS URL."); }
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("The endpoint must use HTTP or HTTPS.");
  if (url.username || url.password) throw new Error("Do not put credentials in the endpoint URL. Use ASTRAIL_API_KEY instead.");
  if (url.hash) throw new Error("The endpoint URL must not contain a fragment.");
  return url.toString();
}
