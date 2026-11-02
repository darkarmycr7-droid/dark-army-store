# ---- Dark-Army Store frontend (Next.js 14, standalone) ----
FROM node:20-slim AS build
WORKDIR /app

COPY package*.json ./
RUN npm install
COPY . .

# Next evaluates rewrites() at build time, so the backend origin must be set
# here. Defaults to the compose service name.
ARG BACKEND_ORIGIN=http://backend:4000
ARG NEXT_PUBLIC_SITE_URL=http://localhost
ENV BACKEND_ORIGIN=$BACKEND_ORIGIN \
    NEXT_PUBLIC_SITE_URL=$NEXT_PUBLIC_SITE_URL \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- Runtime ----
FROM node:20-slim AS run
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3200 \
    HOSTNAME=0.0.0.0

COPY --from=build /app/public ./public
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static

EXPOSE 3200
CMD ["node", "server.js"]
