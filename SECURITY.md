# Security policy

Astrail handles upstream credentials and agent-initiated actions. The project is early-stage and has no guaranteed security support window. Use the latest reviewed main-branch revision and inspect its CI status.

## Report a vulnerability privately

Use [GitHub private vulnerability reporting](https://github.com/codewithriza/astrail/security/advisories/new). Include the affected commit, reproduction steps, expected authorization boundary, and impact. Use synthetic credentials and fixtures. Do not include live secrets or publish exploit details in a public issue before a fix is available.

Maintainers will assess reports as availability permits; no response-time SLA is promised.

## Deployment boundaries

Read `SECURITY_THREAT_MODEL.md` and the production deployment section of `docs/PLATFORM_GUIDE.md`. Public endpoints, network policy, encryption, OAuth scope checks, and runtime permissions must remain enforced. Development demo authentication is not a production identity system.

Do not expose a local preview to the internet. Production deployments need configured authentication, encrypted credential storage, durable rate limits, provider-level edge controls, and a reviewed database schema. Optional billing and schema-watch credentials belong to the operator's own deployment.
