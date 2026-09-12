# P2 integration reduction

Apply `neon-migration-p2-integration-reduction.sql` before enabling these controls in a persistent workspace.

## Safe reconciliation

Schema checks classify changes as additive, compatible, conditionally compatible, or breaking. Only additive changes can use `auto_apply`; every other change requires a dry-run preview and explicit approval. Previews include tool, policy/visibility, mapping, and scope-review impact. Configuration follows a unique stable method/path identity when a tool is renamed, while ambiguous matches are flagged. Every apply or rollback creates a reconciliation event and owner notification. Stored schema versions can restore the endpoint map, tools, mappings, and runtime policy.

## Advanced mappings

Request and response mappings accept bounded dot paths, string/number/integer/boolean/JSON coercion, enum translation, conditional defaults, and declarative validation. They never evaluate JavaScript. Use the sample preview before saving. Mapping suggestions from diffs and repeated provider validation errors are advisory and always require confirmation. Named versions can be saved for one server or as tenant/provider templates.

## Overlay and compression

Reconciliation accepts an OpenAPI Overlay 1.0 document with bounded exact JSONPath update/remove actions. The source contract is cloned and remains unchanged. Curated operation IDs can restrict the generated group. Model-visible schemas remove known auth, transport, and tracing parameters, exclude read-only request fields, and retain write-only request fields.

The compression benchmark compares raw one-to-one endpoint schemas, direct tools, catalog mode, and Code Mode. Token numbers are deterministic estimates; task accuracy, argument validity, latency, and success require supplied fixtures. The 70–75% reduction remains a target, never an automatic product claim.
