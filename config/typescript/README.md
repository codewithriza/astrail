# Smoke-test TypeScript configurations

These configurations compile focused smoke tests into the root `.tmp/` directory. Their paths resolve relative to this folder; runtime commands still run from the repository root.

Use the `npm run smoke:*` commands from `package.json` instead of invoking generated JavaScript directly. The application configuration remains at `tsconfig.json` in the root, where Next.js expects it.
