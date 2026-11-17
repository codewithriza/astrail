-- Runtime quality iteration: human-readable audit summaries.
-- Adds a plain-English summary sentence to every tool call log row so the
-- audit trail reads without decoding status enums. Safe to run repeatedly.

alter table if exists public.tool_call_logs add column if not exists summary text;
