# Docker deployment

The image uses Node.js 22, builds the application in a separate stage, removes development dependencies from the runtime, and runs as the unprivileged `node` user.

Docker runs the application only. It does not provision Neon, OAuth providers, Redis, or payment services. Configure those services following the [platform guide](PLATFORM_GUIDE.md) before expecting authenticated runtime functionality.

## Build and start

Copy `.env.example` to `.env.local` and fill in the settings for your own environment. Then run:

```bash
docker compose --env-file .env.local up --build -d
docker compose logs -f astrail
```

Compose reads the supplied environment file to pass public settings into the build and private settings into the running container. `NEXT_PUBLIC_*` configuration is compiled into the browser bundle: rebuild after changing a public URL, OAuth UI flag, or Turnstile site key. Never pass private keys as build arguments.

The default port mapping binds to `127.0.0.1:3000`. Use a reverse proxy with TLS and appropriate request limits when exposing a deployment. Match public URLs, OAuth origins, and CORS settings to that deployment.

Environment files are excluded from the Docker build context and Git. Production auth and backend configuration remain required; development demo auth is disabled in a production build.

## Health and verification

`/api/health` reports runtime readiness and returns 503 when required production services are missing. A container without configuration can serve the landing page while its healthcheck reports unhealthy. That is expected and is not proof of a working backend.

CI builds the image, verifies its process is non-root, and loads the landing page. It does not test real credentials, database migrations, browser-based provider workflows, or payment processing inside the image. Verify those separately in a disposable configured deployment.

Stop the application with `docker compose down`. External Neon data is managed separately.
