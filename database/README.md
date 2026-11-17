# Database

- `schema.sql` — the base Neon PostgreSQL schema.
- `migrations/` — incremental schema changes, with descriptive filenames.

The files moved here from the repository root without SQL changes. Moving them does not require applying them again. Migration filenames are not a safe execution order: follow the [migration checklist](../docs/PLATFORM_GUIDE.md#migration-checklist) for an existing database.

Run operator commands from the repository root:

```bash
npm run apply:neon:schema
npm run verify:schema
```

The apply command requires `NEON_DATABASE_URL` or `DATABASE_URL` in its environment and applies the base schema plus the workspace migration in a transaction. It is not a runner for every incremental migration. Use a disposable database to verify changes before upgrading a deployment.
