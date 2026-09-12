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
if (result.error) {
  const signup = await auth.signUp.email({ email, password, name: "Astrail Runtime", callbackURL: "https://astrail.dev", fetchOptions });
  if (signup.error || !signup.data.user) throw signup.error ?? new Error("Service identity creation failed.");
  console.log(JSON.stringify({ id: signup.data.user.id, email: signup.data.user.email, created: true }));
} else {
  console.log(JSON.stringify({ id: result.data.user?.id, email: result.data.user?.email, created: false }));
}
