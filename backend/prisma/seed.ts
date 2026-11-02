import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();

// Committed product photos (prisma/seed-images/<slug>.png) are copied into the
// public uploads dir so the catalogue ships with real, self-hosted images.
const SEED_IMG_DIR = path.resolve(__dirname, 'seed-images');
const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads');

function copySeedImage(srcName: string, targetName: string): string | null {
  const file = path.join(SEED_IMG_DIR, srcName);
  if (!fs.existsSync(file)) return null;
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  fs.copyFileSync(file, path.join(UPLOAD_DIR, targetName));
  return `/uploads/${targetName}`;
}
const seedProductImage = (slug: string) => copySeedImage(`${slug}.png`, `seed-${slug}.png`);
const seedCategoryImage = (slug: string) => copySeedImage(`category-${slug}.png`, `seed-category-${slug}.png`);

type Seed = {
  name: string;
  price: number;
  cost: number;
  was?: number;
  stock: number;
  cat: string;
  brand?: string;
  featured?: boolean;
  best?: boolean;
  desc: string;
  specs?: { key: string; value: string }[];
};

const CATEGORIES = [
  { name: 'Groceries & Food', slug: 'groceries', nameAr: 'بقالة وأغذية' },
  { name: 'Home & Kitchen', slug: 'home-kitchen', nameAr: 'المنزل والمطبخ' },
  { name: 'Electronics', slug: 'electronics', nameAr: 'إلكترونيات' },
  { name: 'Health & Beauty', slug: 'health-beauty', nameAr: 'الصحة والجمال' },
  { name: 'Cleaning & Household', slug: 'cleaning', nameAr: 'التنظيف' },
  { name: 'Baby & Kids', slug: 'baby-kids', nameAr: 'الأطفال' },
];

const BRANDS = ['Dark-Army', 'KuwaitFresh', 'HomePro', 'TechLine', 'PureCare'];

const PRODUCTS: Seed[] = [
  { name: 'Premium Basmati Rice 5kg', price: 4.250, cost: 3.1, was: 5.0, stock: 120, cat: 'groceries', brand: 'KuwaitFresh', best: true, featured: true,
    desc: 'Long-grain aged basmati rice, perfect for biryani and everyday meals.', specs: [{ key: 'Weight', value: '5 kg' }, { key: 'Origin', value: 'India' }] },
  { name: 'Extra Virgin Olive Oil 1L', price: 3.750, cost: 2.4, stock: 80, cat: 'groceries', brand: 'KuwaitFresh', featured: true,
    desc: 'Cold-pressed extra virgin olive oil, rich and fruity.', specs: [{ key: 'Volume', value: '1 L' }] },
  { name: 'Arabic Coffee 250g', price: 2.500, cost: 1.5, stock: 60, cat: 'groceries', best: true,
    desc: 'Freshly roasted and ground Arabic coffee with cardamom.' },
  { name: 'Stainless Steel Cookware Set (7 pc)', price: 24.900, cost: 16, was: 32.0, stock: 25, cat: 'home-kitchen', brand: 'HomePro', featured: true,
    desc: 'Durable 7-piece stainless steel pots and pans set with glass lids.', specs: [{ key: 'Pieces', value: '7' }, { key: 'Material', value: 'Stainless Steel' }] },
  { name: 'Non-Stick Frying Pan 28cm', price: 5.900, cost: 3.5, stock: 40, cat: 'home-kitchen', brand: 'HomePro', best: true,
    desc: 'PFOA-free non-stick frying pan with heat-resistant handle.' },
  { name: 'Electric Kettle 1.7L', price: 7.500, cost: 4.8, was: 9.0, stock: 35, cat: 'home-kitchen', brand: 'HomePro',
    desc: 'Fast-boil stainless steel kettle with auto shut-off.' },
  { name: 'Wireless Earbuds Pro', price: 12.900, cost: 7.5, was: 18.0, stock: 50, cat: 'electronics', brand: 'TechLine', featured: true, best: true,
    desc: 'True-wireless earbuds with active noise cancellation and 24h battery.', specs: [{ key: 'Battery', value: '24h' }, { key: 'Bluetooth', value: '5.3' }] },
  { name: 'Smart LED Bulb (RGB)', price: 2.250, cost: 1.2, stock: 200, cat: 'electronics', brand: 'TechLine',
    desc: 'Wi-Fi smart bulb, 16M colors, app & voice control.' },
  { name: '20000mAh Power Bank', price: 6.750, cost: 4.0, stock: 70, cat: 'electronics', brand: 'TechLine', best: true,
    desc: 'Fast-charging power bank with dual USB and USB-C.' },
  { name: 'Vitamin C Serum 30ml', price: 4.500, cost: 2.2, was: 6.0, stock: 90, cat: 'health-beauty', brand: 'PureCare', featured: true,
    desc: 'Brightening vitamin C facial serum with hyaluronic acid.' },
  { name: 'Argan Hair Oil 100ml', price: 3.250, cost: 1.6, stock: 110, cat: 'health-beauty', brand: 'PureCare', best: true,
    desc: 'Nourishing argan oil for smooth, shiny, frizz-free hair.' },
  { name: 'Multi-Surface Cleaner 2L', price: 1.750, cost: 0.8, stock: 150, cat: 'cleaning', best: true,
    desc: 'Powerful multi-surface disinfectant cleaner, lemon scent.' },
  { name: 'Microfiber Cloth Pack (12)', price: 2.100, cost: 1.0, stock: 130, cat: 'cleaning',
    desc: 'Lint-free microfiber cleaning cloths, 12-pack.' },
  { name: 'Baby Diapers Mega Pack', price: 5.500, cost: 3.4, was: 7.0, stock: 95, cat: 'baby-kids', featured: true,
    desc: 'Ultra-soft, 12h dry-protection diapers. Size 4, 80 count.', specs: [{ key: 'Size', value: '4' }, { key: 'Count', value: '80' }] },
  { name: 'Baby Wipes 6x72', price: 3.900, cost: 2.1, stock: 140, cat: 'baby-kids', best: true,
    desc: 'Fragrance-free, alcohol-free baby wipes, 6 packs of 72.' },
  { name: 'Kids Building Blocks 200pc', price: 4.750, cost: 2.5, stock: 60, cat: 'baby-kids',
    desc: 'Creative building blocks set, compatible with major brands.' },
];

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// Arabic product names keyed by English name (for the bilingual storefront)
const AR_NAMES: Record<string, string> = {
  'Premium Basmati Rice 5kg': 'أرز بسمتي فاخر ٥ كجم',
  'Extra Virgin Olive Oil 1L': 'زيت زيتون بكر ممتاز ١ لتر',
  'Arabic Coffee 250g': 'قهوة عربية ٢٥٠ جم',
  'Stainless Steel Cookware Set (7 pc)': 'طقم أواني طهي ستينلس ستيل (٧ قطع)',
  'Non-Stick Frying Pan 28cm': 'مقلاة غير لاصقة ٢٨ سم',
  'Electric Kettle 1.7L': 'غلاية كهربائية ١.٧ لتر',
  'Wireless Earbuds Pro': 'سماعات لاسلكية برو',
  'Smart LED Bulb (RGB)': 'لمبة ذكية LED (متعددة الألوان)',
  '20000mAh Power Bank': 'بطارية متنقلة ٢٠٠٠٠ مللي أمبير',
  'Vitamin C Serum 30ml': 'سيروم فيتامين سي ٣٠ مل',
  'Argan Hair Oil 100ml': 'زيت الأرغان للشعر ١٠٠ مل',
  'Multi-Surface Cleaner 2L': 'منظف متعدد الأسطح ٢ لتر',
  'Microfiber Cloth Pack (12)': 'مناشف ميكروفايبر (١٢ قطعة)',
  'Baby Diapers Mega Pack': 'حفاضات أطفال عبوة كبيرة',
  'Baby Wipes 6x72': 'مناديل أطفال ٦×٧٢',
  'Kids Building Blocks 200pc': 'مكعبات بناء للأطفال ٢٠٠ قطعة',
};

async function main() {
  console.log('Seeding Dark-Army Store…');

  // Categories
  const catMap = new Map<string, number>();
  for (let i = 0; i < CATEGORIES.length; i++) {
    const c = CATEGORIES[i];
    const imageUrl = seedCategoryImage(c.slug);
    const row = await prisma.category.upsert({
      where: { slug: c.slug },
      update: { name: c.name, nameAr: c.nameAr, sortOrder: i, imageUrl },
      create: { name: c.name, nameAr: c.nameAr, slug: c.slug, sortOrder: i, imageUrl },
    });
    catMap.set(c.slug, row.id);
  }

  // Brands
  const brandMap = new Map<string, number>();
  for (const name of BRANDS) {
    const row = await prisma.brand.upsert({
      where: { slug: slugify(name) },
      update: { name },
      create: { name, slug: slugify(name) },
    });
    brandMap.set(name, row.id);
  }

  // Products
  let sku = 1000;
  for (const p of PRODUCTS) {
    sku++;
    const slug = slugify(p.name);
    const created = await prisma.product.upsert({
      where: { slug },
      // NOTE: stockQty and avgCost are deliberately not updated for products
      // that already exist — both are owned by the inventory ledger, and
      // overwriting them here would desync stock from its movements.
      update: {
        name: p.name,
        nameAr: AR_NAMES[p.name] ?? null,
        sellingPrice: p.price,
        costPrice: p.cost,
        compareAtPrice: p.was ?? null,
        categoryId: catMap.get(p.cat)!,
        brandId: p.brand ? brandMap.get(p.brand)! : null,
        description: p.desc,
        specs: p.specs ? JSON.stringify(p.specs) : null,
        isFeatured: !!p.featured,
        isBestSeller: !!p.best,
        soldCount: p.best ? 120 + Math.floor(Math.random() * 200) : Math.floor(Math.random() * 50),
        ratingAvg: 4 + Math.random(),
        ratingCount: 5 + Math.floor(Math.random() * 80),
      },
      create: {
        name: p.name,
        nameAr: AR_NAMES[p.name] ?? null,
        slug,
        sku: `DA-${sku}`,
        barcode: `62900000${sku}`,
        sellingPrice: p.price,
        costPrice: p.cost,
        avgCost: p.cost,
        compareAtPrice: p.was ?? null,
        stockQty: p.stock,
        categoryId: catMap.get(p.cat)!,
        brandId: p.brand ? brandMap.get(p.brand)! : null,
        description: p.desc,
        specs: p.specs ? JSON.stringify(p.specs) : null,
        isFeatured: !!p.featured,
        isBestSeller: !!p.best,
        soldCount: p.best ? 120 + Math.floor(Math.random() * 200) : Math.floor(Math.random() * 50),
        ratingAvg: 4 + Math.random(),
        ratingCount: 5 + Math.floor(Math.random() * 80),
      },
    });
    // Attach the committed product photo (falls back to a branded placeholder
    // in the UI if a slug has no image file).
    const imageUrl = seedProductImage(slug);
    await prisma.productImage.deleteMany({ where: { productId: created.id } });
    if (imageUrl) {
      await prisma.productImage.create({
        data: { productId: created.id, url: imageUrl, alt: p.name, sortOrder: 0 },
      });
    }
  }

  // Opening stock balances — one INITIAL movement per product that has no
  // ledger history yet, so sum(movements) matches stockQty from the start.
  for (const p of await prisma.product.findMany()) {
    if ((await prisma.stockMovement.count({ where: { productId: p.id } })) > 0) continue;
    if (p.stockQty === 0) continue;
    const cost = Number(p.costPrice);
    await prisma.stockMovement.create({
      data: {
        productId: p.id,
        qty: p.stockQty,
        type: 'INITIAL',
        unitCost: cost,
        balanceAfter: p.stockQty,
        avgCostAfter: cost,
        refType: 'PRODUCT',
        refId: p.id,
        reason: 'Opening balance (seed)',
      },
    });
  }

  // Suppliers — sample vendors so purchasing is usable straight after setup.
  const SUPPLIERS = [
    { name: 'Gulf Trading Co.', nameAr: 'شركة الخليج للتجارة', contactName: 'Yousef Al-Ali', phone: '+965 2222 1100', email: 'sales@gulftrading.com.kw', address: 'Shuwaikh Industrial, Block 1', paymentTerms: 'NET30' },
    { name: 'Kuwait Fresh Supplies', nameAr: 'الكويت للتوريدات الطازجة', contactName: 'Mariam Al-Sabah', phone: '+965 2222 3344', email: 'orders@kwfresh.com', address: 'Shuwaikh Port, Warehouse 12', paymentTerms: 'NET15' },
    { name: 'TechLine Distribution', nameAr: 'تك لاين للتوزيع', contactName: 'Omar Hassan', phone: '+965 2222 7788', email: 'b2b@techline.com.kw', address: 'Al-Rai, Block 5', paymentTerms: 'CASH' },
  ];
  for (const s of SUPPLIERS) {
    const found = await prisma.supplier.findFirst({ where: { name: s.name } });
    if (!found) await prisma.supplier.create({ data: s });
  }

  // Coupon
  await prisma.coupon.upsert({
    where: { code: 'WELCOME10' },
    update: { type: 'PERCENT', value: 10, isActive: true, minSubtotal: 5 },
    create: { code: 'WELCOME10', type: 'PERCENT', value: 10, minSubtotal: 5, isActive: true },
  });

  // Homepage banners — only seed defaults when none exist yet, so we never
  // clobber slides the admin has customised.
  if ((await prisma.banner.count()) === 0) {
    await prisma.banner.createMany({
      data: [
        {
          title: 'Everything You Need.\nDelivered Across Kuwait.',
          titleAr: 'كل ما تحتاجه.\nيوصل إلى كل الكويت.',
          subtitle: 'Groceries, home, electronics & more — one store, endless choices.',
          subtitleAr: 'بقالة ومنزل وإلكترونيات والمزيد — متجر واحد بخيارات لا تنتهي.',
          ctaLabel: 'Shop Now',
          ctaLabelAr: 'تسوّق الآن',
          ctaHref: '/products',
          align: 'left',
          overlay: 40,
          sortOrder: 0,
        },
        {
          title: 'Mega Electronics Sale.\nUp to 40% Off.',
          titleAr: 'تخفيضات الإلكترونيات الكبرى.\nحتى ٤٠٪ خصم.',
          subtitle: 'Earbuds, power banks, smart home — limited-time prices.',
          subtitleAr: 'سماعات وبنوك طاقة ومنزل ذكي — لفترة محدودة.',
          ctaLabel: 'Grab the Deals',
          ctaLabelAr: 'احصل على العروض',
          ctaHref: '/products?category=electronics',
          align: 'left',
          overlay: 40,
          sortOrder: 1,
        },
        {
          title: 'Fresh Groceries,\nEvery Single Day.',
          titleAr: 'بقالة طازجة،\nكل يوم.',
          subtitle: 'Pantry staples at the best prices, free delivery over KD 20.',
          subtitleAr: 'أساسيات المطبخ بأفضل الأسعار، توصيل مجاني فوق ٢٠ د.ك.',
          ctaLabel: 'Fill Your Cart',
          ctaLabelAr: 'املأ سلتك',
          ctaHref: '/products?category=groceries',
          align: 'left',
          overlay: 40,
          sortOrder: 2,
        },
      ],
    });
  }

  // Admin user
  await prisma.adminUser.upsert({
    where: { email: 'admin@darkarmy.store' },
    update: {},
    create: {
      name: 'Store Admin',
      email: 'admin@darkarmy.store',
      passwordHash: await bcrypt.hash('admin123', 10),
      role: 'ADMIN',
    },
  });

  console.log(`✔ ${CATEGORIES.length} categories, ${PRODUCTS.length} products, 1 coupon (WELCOME10), admin@darkarmy.store / admin123`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
