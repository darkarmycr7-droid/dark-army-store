# 🛒 Dark-Army Store

A standalone **ERP and e-commerce platform** for Kuwait — built with Next.js 14 + Express + Prisma.
One codebase covers the shop front, the back office, the tills and the books:
storefront and customer accounts, admin panel, inventory with a weighted-average
stock ledger, purchasing, point of sale, HR (employees, attendance, time off),
and double-entry accounting. Amounts are Kuwaiti Dinar, 3-decimal (fils) aware,
and the storefront is bilingual English / Arabic with full RTL.

> Self-contained: own database, own backend, own frontend. SQLite out of the box —
> clone it and it runs, with no services to provision.

## Stack
- **Frontend:** Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS
- **Backend:** Node.js, Express, TypeScript, Prisma
- **Database:** SQLite (dev, zero-config) → PostgreSQL (production, one-line swap)
- **Auth:** JWT (bcrypt) — wired for customers & admin
- **Payments:** Cash on Delivery + a sandbox card gateway (pluggable for KNET/Visa/Apple Pay)
- **Storage:** local disk → AWS S3 (pluggable)
- **Currency:** Kuwaiti Dinar (KD), 3-decimal (fils) aware

## Modules
| Module | Where | What it does |
|---|---|---|
| Storefront | `/` | Catalog, cart, checkout, order tracking, bilingual EN/AR |
| Customer accounts | `/account` | Sign-up with email verification, orders, wishlist, addresses |
| Admin | `/admin` | Dashboard, products, orders, customers, settings, users |
| Inventory | `/admin/inventory` | Weighted-average cost ledger, stock moves, warehouses, low-stock |
| Purchasing | `/admin/purchases` | Vendors, purchase orders, receipts that cost stock in |
| Point of sale | `/pos` | Register per branch, cashier PIN login, opening control, till sessions |
| Employees | `/admin/employees` | List + kanban, full employee form, photos, departments, job positions |
| Attendance | `/admin/attendance` | Check in / out, kiosk mode, work schedules, overnight shifts |
| Time off | `/admin/time-off` | Leave types, allocations, requests, balances |
| Accounting | `/admin/accounting` | Journals, double-entry ledger, chart of accounts, partner ledger, aged balances |

The accounting ledger is append-only: posted entries are never edited, only
reversed, and every posting is idempotent on a dedupe key. Kuwait is fixed at
UTC+3 with no DST, so attendance is credited to the day a shift *started* and
overnight shifts stay on that day.

## Storefront
- Home page: hero slider, categories, featured & best-seller grids, promo, testimonials, about, newsletter
- Product listing: search, category & price filters, sort, pagination
- Product detail: gallery, specs, related items, schema.org markup
- Cart: add / update qty / remove (localStorage), free-shipping progress
- Checkout: contact + Kuwait address + delivery method + payment (COD / sandbox card) + coupon
- Order placement: real order created, **stock decremented**, coupon applied
- Order confirmation + public order tracking (tracking number + timeline)
- SEO: metadata, sitemap.xml, robots.txt, JSON-LD product schema

## Admin panel (`/admin`)
Sign in at **http://localhost:3200/admin/login** with `admin@darkarmy.store` / `admin123`
— the seeded local account. **Change it in Admin → Settings before the app is reachable
by anyone but you.** A production build never prefills or displays these.
- **Dashboard:** revenue, orders, customers, products, inventory value, potential profit, 14-day sales chart, low-stock list, top products, recent orders
- **Products:** searchable table, create/edit modal with **image upload** (local disk → S3-ready), cost/price/margin, stock + low-stock alert, featured/best-seller/active flags, delete (soft-deletes if referenced by an order)
- **Orders:** filter by status, search, detail drawer to update status (PENDING→…→DELIVERED), assign a driver, auto-restock on cancel/return, full status history timeline
- **Settings:** change the admin password (`/admin/settings`) — warns when the default password is still in use; **manage admin users** (add a teammate with their own login, enable/disable accounts; can't disable yourself or the last active admin)
- JWT-protected API (`/api/admin/*`); token kept in `localStorage`, 401 auto-redirects to login

## Customer accounts (`/account`)
Shoppers can **sign up / sign in** at `/account/login` (guest checkout still works).
- **Overview:** order/wishlist/address counts, recent orders, editable profile
- **My Orders:** full order history with expandable detail, status timeline, and a track-order link
- **Wishlist:** heart any product (storefront cards + product page); add-to-cart or remove from the wishlist page; live count in the header
- **Addresses:** saved Kuwait addresses (area/block/street/building) with a default; **prefilled at checkout** via a saved-address picker
- **Email verification:** new sign-ups receive a **6-digit code** by email and must enter it before the account is active (and before they can sign in / check out). Resend with a 30s cooldown, codes expire in 10 min, 5 attempts max.
- **Sign-in is required to check out** (enforced on the frontend *and* the backend — `POST /api/orders/checkout` rejects requests without a customer token). Browsing and building a cart stay open to guests; the gate is at the purchase step. Orders are always linked to the account. JWT token in `localStorage` (`da-customer-token`).

### Email delivery (verification codes)
The OTP flow is fully working out of the box using a **pluggable email sender**:
| `EMAIL_DRIVER` | Behaviour |
|---|---|
| `console` (default, dev) | Prints the code to the **server log**; the verify screen also shows it as a "Dev mode" hint so you can test without a real inbox |
| `smtp` | Sends real email via **nodemailer** — set `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` |

Set `REQUIRE_EMAIL_VERIFICATION=false` to skip verification entirely (instant sign-in).

## Quick start

### Run it in the browser (GitHub Codespaces — nothing to install)
On the repo page: **Code → Codespaces → Create codespace on main**.
The container installs both apps and seeds a fresh database on first boot
(a few minutes). When it finishes, run the two `npm run dev` commands it prints,
then open the forwarded **port 3200**.

### Run it locally
Needs **Node 20+**. Nothing else — the database is a file.

```bash
git clone https://github.com/darkarmycr7-droid/dark-army-store.git
cd dark-army-store
```

### 1. Backend (port 4000)
```bash
cd backend
cp .env.example .env     # Windows: copy .env.example .env
npm install
npm run setup     # prisma generate + db push + seed
npm run dev
```

### 2. Frontend (port 3200) — in a second terminal
```bash
cd frontend
cp .env.local.example .env.local     # Windows: copy .env.local.example .env.local
npm install
npm run dev
```

Open **http://localhost:3200**

### One-click start (Windows)
Double-click **`start.bat`** in the project root — it opens the backend + frontend
in two windows and launches the browser. **`stop.bat`** stops both servers.

## Bilingual (English / Arabic + RTL)
The storefront is bilingual with a language toggle (🌐) in the header.
- Switching to Arabic flips the whole page to **RTL** (`dir="rtl"`), swaps to the **Cairo** Arabic font, and translates the UI.
- Product & category **Arabic names** come from the `nameAr` fields (seeded for all sample products).
- Choice persists via cookie + `localStorage`; the server reads the cookie so the first paint is already in the right direction (no flash).
- Implementation: `lib/i18n.ts` (EN→AR dictionary, English text is the key with graceful fallback), `components/LanguageProvider.tsx`, `components/Tr.tsx` (`<T>`/`<Loc>` helpers for server components).
- Covered: home, product listing, product detail, cart, checkout. (Admin + account screens remain English for now.)

## Sharing the app
The frontend proxies `/api` and `/uploads` to the backend (see `next.config.js`
rewrites), so **everything runs on one port (3200)** — no separate API host, no
CORS setup, no hardcoded IPs.

**On your Wi-Fi / LAN (friend on the same network):**
1. Make sure both servers are running (`start.bat`).
2. Allow the port through Windows Firewall **once** (admin PowerShell):
   ```powershell
   New-NetFirewallRule -DisplayName "Dark-Army Store" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3200 -Profile Private
   ```
3. Find your address with `ipconfig` (e.g. `192.168.8.153`) and share
   **http://192.168.8.153:3200**. (Only port 3200 needs to be open.)

**Over the internet (anywhere):** double-click **`share-online.bat`** — it runs a
free Cloudflare quick tunnel and prints a temporary `https://….trycloudflare.com`
link you can send to anyone. The link changes each run. Requires `cloudflared`
(install once: `winget install Cloudflare.cloudflared`).
> ⚠️ Before exposing publicly, change the default admin password in
> **Admin → Settings** (`/admin/settings`). The default is
> `admin@darkarmy.store` / `admin123`.

### Seeded data
- 6 categories, 16 products across an "all-in-one" catalog
- Coupon **`WELCOME10`** — 10% off, min KD 5
- Admin user: `admin@darkarmy.store` / `admin123` — **local seed only, change it before deploying**

### Sandbox payments
Choose **Card (Sandbox)** at checkout. Card number ending in an **even** digit → approved,
**odd** → declined. Cash on Delivery always succeeds.

## Going to production
| Concern | Dev now | Production swap |
|---|---|---|
| Database | SQLite | Set `provider = "postgresql"` in `prisma/schema.prisma` + `DATABASE_URL`, then `prisma migrate deploy` |
| Storage | local `/uploads` | `STORAGE_DRIVER=s3` + implement `S3Storage` in `storage.service.ts` |
| Payments | COD + STUB | Implement a `PaymentGateway` for KNET/Visa in `payment.service.ts`, add to `PAYMENT_METHODS` |
| Secrets | `.env` | Real `JWT_SECRET`, locked `CORS_ORIGIN` |

## Roadmap (next phases)
1. ✅ ~~Admin panel: product CRUD + image upload, order management, sales dashboard, inventory & low-stock~~ **(done)**
2. ✅ ~~Customer accounts: signup/login, dashboard, wishlist, saved addresses, order history~~ **(done)**
3. Reports module: Sales / Product / Customer / Inventory / P&L with Excel/PDF/CSV export
4. Arabic (RTL) bilingual storefront
5. Live KNET / card payment integration
6. Delivery zones, driver assignment, email/SMS notifications
7. Email/mobile verification (schema fields `emailVerified`/`phoneVerified` already present)
