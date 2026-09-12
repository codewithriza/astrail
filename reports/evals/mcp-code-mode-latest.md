# Astrail MCP Code Mode Eval

Status: **PASS**

Generated at: 2026-09-12T14:27:53.260Z

Base URL: `http://localhost:3217`

## Summary

| Metric | Value |
| --- | ---: |
| Tasks passed | 9/9 |
| Completeness | 100.0% |
| Average turns | 1.89 |
| Unexpected error rate | 0.0% |
| Average latency | 570 ms |
| Deterministic exactness checks | 32 |

## Task Results

| Status | Task | Mode | Turns | Latency | Failed checks |
| --- | --- | --- | ---: | ---: | --- |
| PASS | `static.helpdesk.list_tickets` | static | 2 | 673 ms | - |
| PASS | `static.helpdesk.validation` | static | 1 | 12 ms | - |
| PASS | `dynamic.helpdesk.catalog_invoke` | dynamic | 3 | 384 ms | - |
| PASS | `dynamic.helpdesk.invalid_arguments` | dynamic | 2 | 17 ms | - |
| PASS | `static.helpdesk.auth_required` | static | 1 | 8 ms | - |
| PASS | `code.helpdesk.search_execute` | code | 3 | 1679 ms | - |
| PASS | `code.petstore.public_demo` | code | 3 | 2275 ms | - |
| PASS | `code.helpdesk.typecheck` | code | 1 | 39 ms | - |
| PASS | `code.helpdesk.sandbox_runtime_block` | code | 1 | 44 ms | - |

## Metric Notes

- Completeness: fraction of tasks whose required checks passed.
- Efficiency/turn count: MCP JSON-RPC calls made by the task flow, excluding fixture generation.
- Unexpected error rate: tasks with failed checks, excluding expected validation/typecheck failures that returned the correct structured error.
- Latency: wall-clock HTTP latency observed by the harness for MCP calls.
- Deterministic exactness: exact checks against stable fields such as echoed arguments, SDK method names, execution model, and error codes.
