# Browser and UI testing

The Playwright suite starts an isolated Astrail development server on port 4173 with local preview data and demo authentication. It does not use or modify production Neon data.

```bash
npx playwright install chromium
npm run test:ui
```

Use `npm run test:ui:chromium` for desktop only and `npm run test:ui:report` to open the HTML report. Failed tests retain screenshots, videos and traces under `test-results/`; the HTML report is written under `reports/playwright/`. Both directories are ignored by Git.

Coverage includes public route rendering, desktop/mobile authentication, dashboard route switching and timing budgets, browser console errors, uncaught page errors, unexpected 5xx responses, navigation behavior, public API contracts, local-memory rejection, API error UI, and TanStack Query mutation invalidation/refetch behavior.

Route timing assertions use a generous 8–10 second development-server budget because first visits compile routes on demand. The report records individual dashboard timings as test annotations. Production performance should additionally be measured against a deployed build with real network and database latency.

TanStack Query currently owns the approval queue's polling, mutation, error state and cache invalidation. Server-rendered inventory pages remain server components; do not convert them solely for client caching.
