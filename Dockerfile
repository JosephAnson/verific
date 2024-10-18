FROM node:lts AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

COPY ./playgrounds/docs /app

WORKDIR /app

FROM base AS build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install
RUN pnpm run build

FROM nginx:alpine AS production-stage

COPY --from=build /app/.vitepress/dist /usr/share/nginx/html

# Debug: List files in the nginx html directory
RUN ls -al /usr/share/nginx/html

# COPY --from=build /app/nginx.conf /etc/nginx/nginx.conf

# Debug: List files in the nginx html directory
RUN ls -al /etc/nginx/

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

