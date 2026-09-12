export type GithubDemoScenario = "normal" | "expired_token" | "rate_limit_once" | "revoked";
export class GithubProviderSimulator {
  private generation = 0; private rateLimited = false; private revoked = false; refreshCalls = 0; calls = 0;
  accessToken() { return `demo_access_generation_${this.generation}`; }
  revoke() { this.revoked = true; return { status: 204 }; }
  refresh(refreshToken: string) {
    if (this.revoked || refreshToken !== "demo_refresh") return { status: 400, body: { error: "invalid_grant" } };
    this.refreshCalls += 1; this.generation += 1;
    return { status: 200, body: { access_token: this.accessToken(), expires_in: 3600 } }; // Deliberately omits refresh_token.
  }
  request(input: { token: string; method: "GET" | "POST"; scenario?: GithubDemoScenario }) {
    this.calls += 1;
    if (this.revoked || input.scenario === "revoked") return { status: 401, body: { message: "Bad credentials" } };
    if (input.scenario === "expired_token" || input.token !== this.accessToken()) return { status: 401, body: { message: "Expired token" } };
    if (input.scenario === "rate_limit_once" && !this.rateLimited) { this.rateLimited = true; return { status: 429, headers: { "retry-after": "0" }, body: { message: "rate limited" } }; }
    return input.method === "GET" ? { status: 200, body: [{ number: 42, title: "Deterministic demo issue" }] } : { status: 201, body: { number: 43, title: "Created after approval" } };
  }
}
