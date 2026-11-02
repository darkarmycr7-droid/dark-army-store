# ---- Dark-Army Store backend (Express + Prisma + PostgreSQL) ----
FROM node:20-slim

WORKDIR /app

# Prisma needs OpenSSL on Debian-slim
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install

COPY . .

# Switch Prisma to PostgreSQL, generate the client, and compile TypeScript
RUN node scripts/use-postgres.js \
  && npx prisma generate \
  && npm run build

ENV NODE_ENV=production
EXPOSE 4000

# Normalize line endings (in case the file was checked out with CRLF on Windows)
RUN sed -i 's/\r$//' docker-entrypoint.sh && chmod +x docker-entrypoint.sh
CMD ["./docker-entrypoint.sh"]
