FROM node:26.8@sha256:e961046fec20896e8904f2b4a8b4c7e5ca91826d84d8d33d83dbaa61f942069e AS build
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
