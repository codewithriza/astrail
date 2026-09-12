const valueOptions = new Set(["endpoint", "api-key", "task-token", "args", "query", "execution-id", "workspace"]);

export function parseArguments(argv) {
  const options = {};
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--") {
      positional.push(...argv.slice(index + 1));
      break;
    }
    if (value === "--help" || value === "-h") return { options: {}, positional: ["help"] };
    if (!value.startsWith("--")) {
      positional.push(value);
      continue;
    }
    const equals = value.indexOf("=");
    const key = value.slice(2, equals === -1 ? undefined : equals);
    if (!valueOptions.has(key)) throw new Error(`Unknown option: --${key}`);
    const next = equals === -1 ? argv[++index] : value.slice(equals + 1);
    if (next === undefined || (equals === -1 && next.startsWith("--"))) throw new Error(`--${key} requires a value.`);
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
