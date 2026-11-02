import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { prisma } from '../../lib/prisma';
import { storage } from '../../services/storage.service';
import { HttpError } from '../../middleware/error';

export const adminBanners = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serialize(b: any) {
  return {
    id: b.id,
    title: b.title,
    titleAr: b.titleAr,
    subtitle: b.subtitle,
    subtitleAr: b.subtitleAr,
    ctaLabel: b.ctaLabel,
    ctaLabelAr: b.ctaLabelAr,
    ctaHref: b.ctaHref,
    imageUrl: b.imageUrl,
    align: b.align,
    overlay: b.overlay,
    sortOrder: b.sortOrder,
    isActive: b.isActive,
  };
}

const bannerSchema = z.object({
  title: z.string().min(1),
  titleAr: z.string().optional().nullable(),
  subtitle: z.string().optional().nullable(),
  subtitleAr: z.string().optional().nullable(),
  ctaLabel: z.string().optional().nullable(),
  ctaLabelAr: z.string().optional().nullable(),
  ctaHref: z.string().optional(),
  imageUrl: z.string().optional().nullable(),
  align: z.enum(['left', 'center', 'right']).default('left'),
  overlay: z.number().int().min(0).max(80).default(40),
  sortOrder: z.number().int().default(0),
  isActive: z.boolean().default(true),
});

// ---- Image upload (background) ----
adminBanners.post('/upload', upload.single('file'), async (req, res) => {
  if (!req.file) throw new HttpError(400, 'No file uploaded');
  const url = await storage.save(req.file.buffer, req.file.originalname);
  res.status(201).json({ url });
});

// ---- List (all, ordered) ----
adminBanners.get('/', async (_req, res) => {
  const rows = await prisma.banner.findMany({ orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] });
  res.json(rows.map(serialize));
});

// ---- Slider settings (autoplay interval). Registered before /:id. ----
const HERO_INTERVAL_KEY = 'heroIntervalSeconds';

adminBanners.get('/settings', async (_req, res) => {
  const row = await prisma.setting.findUnique({ where: { key: HERO_INTERVAL_KEY } });
  res.json({ intervalSeconds: row ? Number(row.value) : 5 });
});

adminBanners.put('/settings', async (req, res) => {
  const { intervalSeconds } = z
    .object({ intervalSeconds: z.number().int().min(2).max(30) })
    .parse(req.body);
  await prisma.setting.upsert({
    where: { key: HERO_INTERVAL_KEY },
    update: { value: String(intervalSeconds) },
    create: { key: HERO_INTERVAL_KEY, value: String(intervalSeconds) },
  });
  res.json({ intervalSeconds });
});

// ---- Create ----
adminBanners.post('/', async (req, res) => {
  const data = bannerSchema.parse(req.body);
  const created = await prisma.banner.create({
    data: { ...data, ctaHref: data.ctaHref || '/products' },
  });
  res.status(201).json(serialize(created));
});

// ---- Update ----
adminBanners.put('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.banner.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, 'Banner not found');
  const data = bannerSchema.parse(req.body);
  const updated = await prisma.banner.update({
    where: { id },
    data: { ...data, ctaHref: data.ctaHref || '/products' },
  });
  res.json(serialize(updated));
});

// ---- Reorder (array of ids in desired order) ----
adminBanners.patch('/reorder', async (req, res) => {
  const { ids } = z.object({ ids: z.array(z.number().int()) }).parse(req.body);
  await prisma.$transaction(ids.map((id, i) => prisma.banner.update({ where: { id }, data: { sortOrder: i } })));
  res.json({ ok: true });
});

// ---- Delete ----
adminBanners.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  await prisma.banner.delete({ where: { id } }).catch(() => {
    throw new HttpError(404, 'Banner not found');
  });
  res.json({ ok: true });
});
