FROM node:22-bookworm-slim AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS build
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Public client configuration is inlined by Next.js during the build.
ARG NEXT_PUBLIC_NEON_AUTH_URL
ARG NEXT_PUBLIC_NEON_DATA_API_URL
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ARG NEXT_PUBLIC_RUNTIME_BASE_URL=http://localhost:3000
ARG NEXT_PUBLIC_SITE_URL=http://localhost:3000
ARG NEXT_PUBLIC_ASTRAIL_GOOGLE_OAUTH_ENABLED=false
ARG NEXT_PUBLIC_ASTRAIL_GITHUB_OAUTH_ENABLED=false
ARG NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY
RUN npm run build
RUN npm prune --omit=dev --ignore-scripts

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
COPY --from=build --chown=node:node /app/package.json /app/package-lock.json /app/next.config.mjs ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["npm", "run", "start"]
