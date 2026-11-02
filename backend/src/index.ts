import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { env } from './lib/env';
import { errorHandler } from './middleware/error';
import { catalog } from './routes/catalog';
import { orders } from './routes/orders';
import { misc } from './routes/misc';
import { account } from './routes/account';
import { admin } from './routes/admin';
import { runBackup } from './services/backup.service';

const app = express();

// Real client IP through the Next.js proxy / Cloudflare for rate limiting.
app.set('trust proxy', true);

app.use(
  cors({
    origin(origin, cb) {
      // allow same-origin / curl (no origin) and any configured storefront
      if (!origin || env.corsOrigins.includes(origin)) return cb(null, true);
      cb(null, true); // dev-friendly; tighten in production
    },
  })
);
app.use(express.json({ limit: '2mb' }));
app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads')));

app.get('/api/health', (_req, res) => res.json({ ok: true, store: env.store.name }));

app.use('/api', misc);
app.use('/api', catalog);
app.use('/api/orders', orders);
app.use('/api/account', account);
app.use('/api/admin', admin);

app.use(errorHandler);

app.listen(env.port, () => {
  console.log(`\n🛒  ${env.store.name} API → http://localhost:${env.port}`);
  console.log(`    health: http://localhost:${env.port}/api/health\n`);

  // Optional automated backups: set BACKUP_INTERVAL_HOURS in .env to enable.
  const hours = Number(process.env.BACKUP_INTERVAL_HOURS) || 0;
  if (hours > 0) {
    const tick = () => {
      try {
        console.log(`[backup] ${runBackup()}`);
      } catch (e) {
        console.error('[backup] failed:', (e as Error).message);
      }
    };
    tick(); // one on startup
    setInterval(tick, hours * 3_600_000).unref?.();
    console.log(`    auto-backup every ${hours}h → ./backups\n`);
  }
});
