# syntax=docker/dockerfile:1.7

ARG NODE_IMAGE=node:24.14.0-bookworm-slim@sha256:d8e448a56fc63242f70026718378bd4b00f8c82e78d20eefb199224a4d8e33d8

FROM ${NODE_IMAGE} AS workspace
ENV PNPM_HOME=/pnpm
ENV PATH=/pnpm:$PATH
RUN corepack enable && corepack prepare pnpm@11.9.0 --activate
WORKDIR /workspace
COPY --link . .
RUN --mount=type=cache,id=eiep-pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm run build
RUN pnpm --filter @eiep/api --prod deploy /out/api \
  && pnpm --filter @eiep/job-worker --prod deploy /out/job-worker

FROM ${NODE_IMAGE} AS api
ARG SOURCE_REVISION=unrecorded
LABEL org.opencontainers.image.source="https://github.com/EPVIND/EPV-EIEP" \
  org.opencontainers.image.revision="${SOURCE_REVISION}" \
  org.opencontainers.image.title="EIEP API"
ENV NODE_ENV=production
ENV EIEP_CONFIG_ROOT=/app
WORKDIR /app
COPY --from=workspace --chown=node:node /out/api/ ./
COPY --from=workspace --chown=node:node /workspace/config/ ./config/
USER node
EXPOSE 3100
STOPSIGNAL SIGTERM
CMD ["node", "dist/main.js"]

FROM ${NODE_IMAGE} AS job-worker
ARG SOURCE_REVISION=unrecorded
LABEL org.opencontainers.image.source="https://github.com/EPVIND/EPV-EIEP" \
  org.opencontainers.image.revision="${SOURCE_REVISION}" \
  org.opencontainers.image.title="EIEP job worker"
ENV NODE_ENV=production
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /app
COPY --from=workspace --chown=node:node /out/job-worker/ ./
RUN ./node_modules/.bin/playwright install --with-deps chromium \
  && rm -rf /var/lib/apt/lists/* \
  && chown -R node:node /app /ms-playwright
USER node
STOPSIGNAL SIGTERM
CMD ["node", "dist/main.js"]

FROM ${NODE_IMAGE} AS web
ARG SOURCE_REVISION=unrecorded
LABEL org.opencontainers.image.source="https://github.com/EPVIND/EPV-EIEP" \
  org.opencontainers.image.revision="${SOURCE_REVISION}" \
  org.opencontainers.image.title="EIEP internal web"
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080
ENV PUBLIC_ROOT=/app/public
WORKDIR /app
COPY --from=workspace --chown=node:node /workspace/containers/static-server.mjs ./static-server.mjs
COPY --from=workspace --chown=node:node /workspace/apps/web/dist/ ./public/
USER node
EXPOSE 8080
STOPSIGNAL SIGTERM
CMD ["node", "static-server.mjs"]

FROM ${NODE_IMAGE} AS portal
ARG SOURCE_REVISION=unrecorded
LABEL org.opencontainers.image.source="https://github.com/EPVIND/EPV-EIEP" \
  org.opencontainers.image.revision="${SOURCE_REVISION}" \
  org.opencontainers.image.title="EIEP partner portal"
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8080
ENV PUBLIC_ROOT=/app/public
WORKDIR /app
COPY --from=workspace --chown=node:node /workspace/containers/static-server.mjs ./static-server.mjs
COPY --from=workspace --chown=node:node /workspace/apps/portal/dist/ ./public/
USER node
EXPOSE 8080
STOPSIGNAL SIGTERM
CMD ["node", "static-server.mjs"]
