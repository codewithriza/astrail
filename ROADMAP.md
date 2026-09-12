# Roadmap

The priority is a reproducible tool that contributors can understand and operators can test. These are proposed milestones, not shipped capabilities or promised dates.

## 1. Make first use dependable

- Keep a credential-free generation example passing in CI.
- Add minimal fixtures for importer failures and document supported schema constructs.
- Verify the dashboard setup on a fresh Neon project and document each required step.
- Replace operator-specific demo assumptions with configurable fixtures.

## 2. Reduce runtime coupling

- Define a persistence interface before adding alternative database backends.
- Separate hosted billing policy from the reusable runtime without bypassing authorization.
- Extract oversized route handlers behind contract tests, one behavior at a time.
- Add behavioral coverage where existing checks only match source text.

## 3. Earn a stable release

- Publish a tested compatibility matrix for supported MCP transports and clients.
- Reproduce exports in CI and document their runtime limitations.
- Review dependency licenses, release artifacts, and version conventions before publishing packages.
- Document upgrade and rollback steps for database migrations.

## Help wanted

Good first contributions include a minimal schema fixture reproducing an import bug, a verified setup correction, or a CLI error-message improvement with a test. Open an issue with reproduction steps before claiming a broad refactor.

The older feature inventory remains in `FEATURE_ROADMAP.md`; it is historical planning context, not a commitment to ship every feature.
