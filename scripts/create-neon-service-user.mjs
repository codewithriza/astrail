#!/usr/bin/env node
import { createAuthClient } from "@neondatabase/neon-js/auth";

const url = process.env.NEON_AUTH_BASE_URL;
const email = process.env.NEON_AUTH_SERVICE_EMAIL;
const password = process.env.NEON_AUTH_SERVICE_PASSWORD;
if (!url || !email || !password) throw new Error("Neon service identity environment is incomplete.");

if (process.argv.includes("--payload")) {
  process.stdout.write(JSON.stringify({ email, password, name: "Astrail Runtime", callbackURL: "https://astrail.dev" }));
  process.exit(0);
}
if (process.argv.includes("--signin-payload")) {
  process.stdout.write(JSON.stringify({ email, password, callbackURL: "https://astrail.dev" }));
  process.exit(0);
}

const auth = createAuthClient(url);
const fetchOptions = { headers: { Origin: "https://astrail.dev" } };
let result = await auth.signIn.email({ email, password, callbackURL: "https://astrail.dev", fetchOptions });
let created = false;
if (result.error) {
  const signup = await auth.signUp.email({ email, password, name: "Astrail Runtime", callbackURL: "https://astrail.dev", fetchOptions });
  if (signup.error || !signup.data.user) throw signup.error ?? new Error("Service identity creation failed.");
  created = true;
  result = await auth.signIn.email({ email, password, callbackURL: "https://astrail.dev", fetchOptions });
  if (result.error || !result.data.user) throw result.error ?? new Error("Created service identity could not sign in.");
}

const tokenResult = await auth.token();
const token = typeof tokenResult.data === "string" ? tokenResult.data : tokenResult.data?.token;
if (tokenResult.error || !token) throw tokenResult.error ?? new Error("Service identity returned no Data API token.");
const claims = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"));
const roles = Array.isArray(claims.roles) ? claims.roles : [claims.role].filter(Boolean);
if (!roles.includes("admin")) {
  throw new Error("Service identity was created but is not a Neon Auth admin. Assign the admin role in Neon, then rerun this command.");
}

console.log(JSON.stringify({ id: result.data.user?.id, email: result.data.user?.email, created, role: "admin", verified: true }));
