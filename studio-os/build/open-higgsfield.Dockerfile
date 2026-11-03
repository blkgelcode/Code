# Build recipe for wide-trace/open-higgsfield (the project ships no Dockerfile).
# It lives in studio-os/build/ so their source in src/open-higgsfield stays untouched.
# Context: ./src/open-higgsfield (see docker-compose.yml).

FROM node:22-alpine AS build
WORKDIR /app
# The repo pins no pnpm version; pnpm 10 understands its pnpm-workspace.yaml settings.
RUN npm install -g pnpm@10
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm build

FROM node:22-alpine
WORKDIR /app
RUN npm install -g pnpm@10
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=build /app ./
EXPOSE 3000
CMD ["pnpm", "start"]
