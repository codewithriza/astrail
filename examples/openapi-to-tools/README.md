# Offline OpenAPI → tools

From the repository root, run `npm ci` and `npm run demo:offline` using Node.js 22+.

`demo.ts` reads the adjacent `openapi.json`, calls the shared generation pipeline with the deterministic OpenAI client preset, validates that three tools were generated, and checks their policies. It replaces `fetch` with an error for the duration of the example to catch unintended network access.

Expected policies: `listNotes` → `allow`, `createNote` → `approval`, `deleteNote` → `block`. The printed tool names are normalized from the spec. No API call is executed and no files are generated. The Notes API hostname is illustrative.

Change a schema or parameter to explore generated tools. If you add or rename operations, update the example's assertions intentionally. Runtime authentication and approval enforcement require the hosted execution path; this example demonstrates generation policy metadata.
