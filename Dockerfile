# Pinned runtime. Refresh the digest deliberately, after reviewing the Node 22 release notes.
# The digest is the same in both stages, so the build and the runtime use one exact Node binary.
ARG NODE_IMAGE=node:22.23.3-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402

# Build stage: installs production dependencies from the lockfile. Nothing from this stage except node_modules is shipped.
FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

# Runtime stage: only the Node binary, the production modules, and the server source.
FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production
# The container must listen on all interfaces to receive traffic from its platform.
ENV HOST=0.0.0.0
WORKDIR /app

# The process only runs `node src/index.js`, so the package managers bundled in the base image are removed.
# They are build tools, and their own dependencies are a vulnerability surface the runtime does not need.
RUN rm -rf /usr/local/lib/node_modules /usr/local/bin/npm /usr/local/bin/npx \
      /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg /opt/yarn-v1.22.22

# Owned by root and readable by the unprivileged node user, which is the only user the process runs as.
COPY --from=build /app/node_modules ./node_modules
COPY server/package.json ./package.json
COPY server/src ./src

USER node
EXPOSE 5051

# Liveness only: the process answers. Readiness is reported on /api/health/ready for the orchestrator.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 5051) + '/api/health/live').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]

CMD ["node", "src/index.js"]
