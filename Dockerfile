FROM node:24.20.0@sha256:be23f54a88d34e8824c741b19b91064094f92c1c97b194144bfc8b50d67258e2 AS build
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json ./packages/core/package.json
COPY packages/i18n/package.json ./packages/i18n/package.json
COPY packages/i18next/package.json ./packages/i18next/package.json
COPY packages/paraglide/package.json ./packages/paraglide/package.json
COPY packages/vue-i18n/package.json ./packages/vue-i18n/package.json
COPY playgrounds/docs/package.json ./playgrounds/docs/package.json

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
  pnpm install --frozen-lockfile \
    --filter @verific/docs... \
    --filter @verific/i18next... \
    --filter @verific/paraglide...

COPY packages/core/src ./packages/core/src
COPY packages/core/tsconfig.json ./packages/core/tsconfig.json
COPY packages/i18n/src ./packages/i18n/src
COPY packages/i18n/tsconfig.json ./packages/i18n/tsconfig.json
COPY packages/i18next/src ./packages/i18next/src
COPY packages/i18next/tsconfig.json ./packages/i18next/tsconfig.json
COPY packages/paraglide/src ./packages/paraglide/src
COPY packages/paraglide/tsconfig.json ./packages/paraglide/tsconfig.json
COPY packages/vue-i18n/src ./packages/vue-i18n/src
COPY packages/vue-i18n/tsconfig.json ./packages/vue-i18n/tsconfig.json
COPY playgrounds/docs ./playgrounds/docs

RUN pnpm --filter @verific/core build \
  && pnpm --filter @verific/i18n build \
  && pnpm --filter @verific/i18next build \
  && pnpm --filter @verific/paraglide build \
  && pnpm --filter @verific/vue-i18n build \
  && pnpm --dir playgrounds/docs build

FROM nginx:alpine@sha256:db35bfc6b2951e7f8a72db5db120288c127ffaeeb4a6d4b95a26fead017d5913 AS production-stage

COPY --from=build /app/playgrounds/docs/.vitepress/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
