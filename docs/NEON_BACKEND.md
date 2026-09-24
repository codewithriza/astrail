# Neon backend

Astrail uses Neon for PostgreSQL, Managed Better Auth, and the Data API. Supabase is not a runtime dependency.

## Required environment

```env
DATABASE_URL=postgresql://...-pooler.../neondb?sslmode=require
NEON_DATABASE_URL=postgresql://.../neondb?sslmode=require
NEON_AUTH_BASE_URL=https://...neonauth.../neondb/auth
NEXT_PUBLIC_NEON_AUTH_URL=https://...neonauth.../neondb/auth
NEON_DATA_API_URL=https://...apirest.../neondb/rest/v1
NEXT_PUBLIC_NEON_DATA_API_URL=https://...apirest.../neondb/rest/v1
NEON_AUTH_COOKIE_SECRET=<at-least-32-random-characters>
NEON_AUTH_SERVICE_EMAIL=<dedicated-runtime-user>
NEON_AUTH_SERVICE_PASSWORD=<random-runtime-password>
```

Keep every variable except the two `NEXT_PUBLIC_` URLs server-only. Create the runtime identity with `npm run configure:neon:service-user`, assign it the Neon Auth `admin` role in the Neon console, and rerun the command to verify the token role. PostgreSQL role `admin` is the only Data API role with `BYPASSRLS`; browser users run as `authenticated` and remain restricted by RLS.

## Existing users

Legacy password hashes cannot be imported into Managed Better Auth. Existing users reset/create their Neon password or reauthenticate through OAuth. On first sign-in, `public.link_neon_identity` atomically relinks their profile and owned Astrail records by verified email. New users receive a profile automatically.

## Verification

```bash
npm run verify:neon
npm run verify:schema
npm run audit:neon:identities
npm run lint
npx tsc --noEmit --pretty false
npm run build
```
