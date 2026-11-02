# 🚀 Deploying Dark-Army Store (PostgreSQL + Docker)

This deploys the whole stack — **PostgreSQL + backend + frontend + Nginx** — with
one command. Everything runs behind Nginx on port 80 (HTTPS optional).

```
Internet → Nginx (80/443) → Frontend (Next.js :3200) → Backend (Express :4000) → PostgreSQL
                                     │ proxies /api and /uploads ┘
```

## What you need
- A Linux server (any VPS — DigitalOcean, Hetzner, AWS Lightsail, etc.) or any machine with:
  - **Docker** + **Docker Compose v2** (`docker compose version`)
- (For a domain + HTTPS) a domain name pointed at the server's IP.

## 1. Get the code on the server
Copy the `dark-army-store/` folder to the server (git clone, `scp`, etc.).

## 2. Configure
```bash
cd dark-army-store
cp .env.docker.example .env
nano .env            # set strong POSTGRES_PASSWORD, JWT_SECRET, PUBLIC_URL
```
Generate a strong JWT secret: `openssl rand -base64 48`.
For the **first** deploy keep `SEED_ON_START=true` (creates sample data + the admin account).

## 3. Launch
```bash
docker compose up -d --build
```
First build takes a few minutes. Then open **http://YOUR_SERVER_IP**.

- Storefront: `http://YOUR_SERVER_IP/`
- Admin: `http://YOUR_SERVER_IP/admin/login` → `admin@darkarmy.store` / `admin123`

## 4. Secure it (do this immediately) 🔒
1. **Change the admin password** in Admin → Settings.
2. In `.env`, set `SEED_ON_START=false` (so restarts don't overwrite your catalog), then:
   ```bash
   docker compose up -d
   ```
3. Confirm `JWT_SECRET` and `POSTGRES_PASSWORD` are strong and unique.
4. Set up HTTPS (below).

## 5. HTTPS with a domain
Point your domain's A record at the server, then the easy path is a one-off certbot run:
```bash
# stop nginx container briefly so certbot can bind :80
docker compose stop nginx
sudo apt install certbot -y
sudo certbot certonly --standalone -d your-domain.com
# copy certs where nginx expects them
mkdir -p nginx/certs
sudo cp /etc/letsencrypt/live/your-domain.com/fullchain.pem nginx/certs/
sudo cp /etc/letsencrypt/live/your-domain.com/privkey.pem  nginx/certs/
```
Then in `nginx/nginx.conf` uncomment the HTTPS server block (set `server_name`), in
`docker-compose.yml` uncomment the `443:443` port and the `./nginx/certs` mount,
set `PUBLIC_URL=https://your-domain.com` in `.env`, and:
```bash
docker compose up -d --build      # rebuild frontend so PUBLIC_URL bakes in
```
(Renew with `certbot renew` + re-copy certs, or use the certbot Docker companion.)

## 6. Real emails & payments (production)
- **Email** (verification / password reset / order notifications): in `.env` set
  `EMAIL_DRIVER=smtp` and fill `SMTP_HOST/PORT/USER/PASS` + `MAIL_FROM`
  (Gmail app-password, Zoho, Mailgun/SendGrid SMTP, …), then `docker compose up -d`.
- **Payments**: COD works out of the box. For **KNET / cards** you need a Kuwaiti
  payment provider (MyFatoorah, Tap, UPayments). Implement a `PaymentGateway` in
  `backend/src/services/payment.service.ts`, add it to `PAYMENT_METHODS`.

## 7. Database backups (PostgreSQL)
The SQLite `npm run backup` script is for local dev. In production, dump Postgres:
```bash
# one-off
docker compose exec -T db pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" > backup-$(date +%F).sql
# restore
cat backup-2026-01-01.sql | docker compose exec -T db psql -U "$POSTGRES_USER" "$POSTGRES_DB"
```
Automate with a cron entry on the host, e.g. daily at 2am:
```
0 2 * * * cd /path/to/dark-army-store && docker compose exec -T db pg_dump -U darkarmy darkarmy > /backups/da-$(date +\%F).sql
```

## Everyday commands
```bash
docker compose logs -f backend      # follow backend logs (incl. dev email codes)
docker compose logs -f frontend
docker compose ps                   # status
docker compose up -d --build        # rebuild after code changes
docker compose down                 # stop (keeps data in volumes)
docker compose down -v              # stop AND DELETE data volumes (careful!)
```

## How the database switch works
Local dev stays on **SQLite** (zero-config). The backend Docker build runs
`scripts/use-postgres.js`, which flips the Prisma datasource to **PostgreSQL**
inside the image only — `schema.prisma` remains the single source of truth.
Schema is applied at container start with `prisma db push` (idempotent).
> Money columns use Prisma `Decimal` (Postgres `decimal`), so KD/fils precision is preserved.

## Troubleshooting
- **Frontend can't reach API** → it proxies to `http://backend:4000` (compose service
  name). Ensure the `backend` service is healthy: `docker compose logs backend`.
- **`exec ./docker-entrypoint.sh: no such file`** → CRLF line endings; the Dockerfile
  strips them, and `.gitattributes` forces LF — re-clone or re-build.
- **Admin edits disappear after restart** → `SEED_ON_START` is still `true`. Set it
  to `false` and `docker compose up -d`.
- **Uploaded images vanish on redeploy** → they live in the `uploads` volume; don't
  run `docker compose down -v`. For scale, switch `STORAGE_DRIVER=s3`.

## Going back to local dev (SQLite)
Nothing to undo — `schema.prisma` is still SQLite on disk. Just run the dev servers
(`start.bat` or `npm run dev` in each folder). The Postgres switch only happens
inside the Docker image.
