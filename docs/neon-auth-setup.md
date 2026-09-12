# Neon Auth setup

Astrail uses Neon Managed Auth through the first-party `/api/auth/*` proxy. Browser sessions use secure cookies, user Data API calls carry Neon Auth JWTs, and server administration uses the dedicated runtime identity.

## Required configuration

Set the Neon values listed in `.env.example`. Keep database URLs, the cookie secret, runtime-user password, and optional Data API key server-only. Only `NEXT_PUBLIC_NEON_AUTH_URL` and `NEXT_PUBLIC_NEON_DATA_API_URL` are public.

In Neon, allow the deployed Astrail origins and localhost during development. Enable Google or GitHub in Neon Auth before setting the corresponding `NEXT_PUBLIC_ASTRAIL_*_OAUTH_ENABLED` flag. Provider callback URLs are handled by Neon Auth; Astrail's application callback is `/auth/complete`.

The runtime service user must have the Neon Auth `admin` role. The matching PostgreSQL `admin` role has `BYPASSRLS`; ordinary sessions use `authenticated` and remain governed by row-level security.

## Legacy accounts

Password hashes from the old provider cannot be imported into Neon Auth. Existing users must reset/create their password or sign in again with OAuth. Their first verified Neon session invokes `public.link_neon_identity`, which atomically moves the old profile and owned records to the new Neon user UUID by email.

## Verify

```bash
npm run verify:neon
npm run verify:schema
npm run audit:neon:identities
```
