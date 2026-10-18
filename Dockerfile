FROM node:26.12@sha256:1b84b89ada025e3b14543cbb837ffaa1c1b5273b841c5b94dd1a8f9c1d8cf7fe AS build
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/core/package.json ./packages/core/package.json
COPY packages/i18n/package.json ./packages/i18n/package.json
COPY playgrounds/docs/package.json ./playgrounds/docs/package.json

RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
  pnpm install --frozen-lockfile \
    --filter @verific/docs...

COPY packages/core/src ./packages/core/src
COPY packages/core/tsconfig.json ./packages/core/tsconfig.json
COPY packages/i18n/src ./packages/i18n/src
COPY packages/i18n/tsconfig.json ./packages/i18n/tsconfig.json
COPY playgrounds/docs ./playgrounds/docs

RUN pnpm --filter @verific/core build \
  && pnpm --filter @verific/i18n build \
  && pnpm --dir playgrounds/docs build

FROM nginx:alpine@sha256:72ba65eb42c10344912a84ff42408db7d34f2feb642204570ab8fc5ffd29f1d3 AS production-stage

COPY --from=build /app/playgrounds/docs/.vitepress/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
