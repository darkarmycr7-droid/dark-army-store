// Seed the HR configuration, copied from the reference Odoo instance.
//
//   npm run seed:hr
//
// Idempotent — matches on name, so running it twice changes nothing and it is
// safe against a database that already has employees pointing at these rows.
//
// WHAT IS COPIED, AND WHAT IS NOT
// The shift calendars and department names are taken verbatim from the
// reference (10 calendars, 24 departments, mostly Arabic). The leave types are
// its 14 types, with English names added alongside the Arabic.
//
// `maxDaysPerYear` is OUR field — Odoo's hr.leave.type has no statutory cap, so
// there was nothing to copy. Only annual leave is set (30 days, Kuwait Labour
// Law No. 6 of 2010, Art. 70). The sick-leave bands are left uncapped rather
// than guessed; set them once HR confirms the figures they apply.

import { prisma } from '../src/lib/prisma';

/** Shift windows, named exactly as the reference names them. */
const SCHEDULES = [
  { name: '8 AM : 5 PM', startTime: '08:00', endTime: '17:00', hoursPerDay: 9 },
  { name: '10 AM : 7 PM', startTime: '10:00', endTime: '19:00', hoursPerDay: 9 },
  { name: '12 PM : 9 PM', startTime: '12:00', endTime: '21:00', hoursPerDay: 9 },
  { name: '2 PM : 11 PM', startTime: '14:00', endTime: '23:00', hoursPerDay: 9 },
  { name: '10 AM : 9 PM', startTime: '10:00', endTime: '21:00', hoursPerDay: 11 },
  { name: '10 AM : 10 PM', startTime: '10:00', endTime: '22:00', hoursPerDay: 12 },
  { name: '10 AM : 11 PM', startTime: '10:00', endTime: '23:00', hoursPerDay: 13 },
  // These three run through midnight — endTime <= startTime marks that.
  { name: '10 PM : 10 AM', startTime: '22:00', endTime: '10:00', hoursPerDay: 12 },
  { name: '11 PM : 8 AM', startTime: '23:00', endTime: '08:00', hoursPerDay: 9 },
  { name: '11 PM : 10 AM', startTime: '23:00', endTime: '10:00', hoursPerDay: 11 },
];

/** Departments as they exist in the reference, with English names added. */
const DEPARTMENTS: { name: string; nameAr?: string }[] = [
  { name: 'Administration' },
  { name: 'Sales' },
  { name: 'Markets', nameAr: 'الأسواق' },
  { name: 'Imports', nameAr: 'الاستيراد' },
  { name: 'Security', nameAr: 'الامن' },
  { name: 'Online', nameAr: 'الاونلاين' },
  { name: 'Cafeteria', nameAr: 'البوفية' },
  { name: 'Loading & Unloading', nameAr: 'التحميل والتنزيل' },
  { name: 'General Services', nameAr: 'الخدمات العامة' },
  { name: 'Social Media', nameAr: 'السوشيل ميديا' },
  { name: 'Legal Affairs', nameAr: 'الشئون القانونية' },
  { name: 'Maintenance', nameAr: 'الصيانة' },
  { name: 'Cashiers', nameAr: 'الكاشيرية' },
  { name: 'Finance', nameAr: 'المالية' },
  { name: 'Warehouses', nameAr: 'المخازن' },
  { name: 'Purchasing', nameAr: 'المشتريات' },
  { name: 'Carpentry', nameAr: 'المنجرة' },
  { name: 'Human Resources', nameAr: 'الموارد البشرية' },
  { name: 'Cleaning', nameAr: 'النظافة' },
  { name: 'Transport', nameAr: 'النقليات' },
  { name: 'Gifts', nameAr: 'الهدايا' },
  { name: 'Hawalli Office', nameAr: 'مكتب حولي' },
  { name: 'IT', nameAr: 'نظم المعلومات' },
  { name: 'Other', nameAr: 'اخرى' },
];

/**
 * Job positions from the reference. Several exist there twice under slightly
 * different spellings ("سائق شاحنة" with one space and with two, "عامل مخازن"
 * likewise); they are deduplicated here rather than copied as-is.
 */
const JOB_POSITIONS: { name: string; nameAr?: string }[] = [
  { name: 'Cashier' },
  { name: 'Decor Service Employee' },
  { name: 'General Accountant', nameAr: 'محاسب عام' },
  { name: 'Administrative Supervisor', nameAr: 'مشرف اداري' },
  { name: 'Government Transactions Clearer', nameAr: 'مخلص معاملات' },
  { name: 'Third-party Residencies', nameAr: 'اقامات الغير' },
  { name: 'Messenger', nameAr: 'مراسل' },
  { name: 'Truck Driver', nameAr: 'سائق شاحنة' },
  { name: 'Bus Driver', nameAr: 'سائق حافلة' },
  { name: 'Private Car Driver', nameAr: 'سائق سيارة خصوصي' },
  { name: 'Warehouse Worker', nameAr: 'عامل مخازن' },
  { name: 'Product Packaging Worker', nameAr: 'عامل تغليف منتجات' },
  { name: 'Packaging Worker', nameAr: 'عامل تغليف' },
  { name: 'Product Filling Worker', nameAr: 'عامل تعبئة منتجات' },
  { name: 'General Light Worker', nameAr: 'عامل عادي خفيف' },
  { name: 'Cleaner', nameAr: 'عامل نظافة' },
  { name: 'Office Cleaner', nameAr: 'عامل تنظيف مكاتب' },
  { name: 'Restroom Cleaner', nameAr: 'عامل تنظيف دورات المياه' },
  { name: 'General Furniture Carpenter', nameAr: 'نجار أثاث عام' },
  { name: 'Manufactured Product Painter', nameAr: 'دهان منتجات مصنعة' },
  { name: 'Artificial Flower Salesperson', nameAr: 'بائع زهور صناعية' },
  { name: 'Calligrapher', nameAr: 'خطاط' },
  { name: 'Tailor', nameAr: 'خياط' },
  { name: 'Other', nameAr: 'اخرى' },
];

/**
 * Leave types. `requiresAllocation` and `payPercent` follow the reference:
 * annual leave is the only type that draws on a balance, and sick leave is
 * banded by the share of salary it pays.
 */
const LEAVE_TYPES = [
  { name: 'Annual Leave', nameAr: 'الإجازة السنوية', code: 'ANNUAL', requiresAllocation: true, payPercent: 100, maxDaysPerYear: 30, color: 'emerald', sequence: 10 },
  { name: 'Sick Leave (full pay)', nameAr: 'إجازة مرضية (مدفوعة الأجر بالكامل)', code: 'SICK100', requiresAllocation: false, payPercent: 100, maxDaysPerYear: null, color: 'amber', sequence: 20 },
  { name: 'Sick Leave (75% pay)', nameAr: 'إجازة مرضية (مدفوعة بنسبة 75%)', code: 'SICK75', requiresAllocation: false, payPercent: 75, maxDaysPerYear: null, color: 'amber', sequence: 21 },
  { name: 'Sick Leave (unpaid)', nameAr: 'إجازة مرضية (بدون أجر)', code: 'SICK0', requiresAllocation: false, payPercent: 0, maxDaysPerYear: null, color: 'amber', sequence: 22 },
  { name: 'Maternity Leave', nameAr: 'إجازة وضع', code: 'MATERNITY', requiresAllocation: false, payPercent: 100, maxDaysPerYear: null, color: 'rose', sequence: 30 },
  { name: 'Paternity Leave', nameAr: 'إجازة الأبوة', code: 'PATERNITY', requiresAllocation: false, payPercent: 100, maxDaysPerYear: null, color: 'rose', sequence: 31 },
  { name: 'Marriage Leave', nameAr: 'إجازة الزواج', code: 'MARRIAGE', requiresAllocation: false, payPercent: 100, maxDaysPerYear: null, color: 'violet', sequence: 40 },
  { name: 'Bereavement Leave', nameAr: 'إجازة وفاة', code: 'BEREAVE', requiresAllocation: false, payPercent: 100, maxDaysPerYear: null, color: 'slate', sequence: 41 },
  { name: 'Iddah Leave', nameAr: 'إجازة العدة', code: 'IDDAH', requiresAllocation: false, payPercent: 100, maxDaysPerYear: null, color: 'slate', sequence: 42 },
  { name: 'Hajj Leave', nameAr: 'إجازة الحج', code: 'HAJJ', requiresAllocation: false, payPercent: 100, maxDaysPerYear: null, color: 'teal', sequence: 50 },
  { name: 'Study Leave', nameAr: 'إجازة دراسة', code: 'STUDY', requiresAllocation: false, payPercent: 100, maxDaysPerYear: null, color: 'sky', sequence: 51 },
  { name: 'Emergency Leave', nameAr: 'إجازة طارئة', code: 'EMERGENCY', requiresAllocation: false, payPercent: 100, maxDaysPerYear: null, color: 'orange', sequence: 52 },
  { name: 'Unpaid Leave', nameAr: 'أجازة غير مدفوعة', code: 'UNPAID', requiresAllocation: false, payPercent: 0, maxDaysPerYear: null, color: 'stone', sequence: 60 },
];

/** The reference has exactly one employee tag today, on every record. */
const TAGS = [{ name: 'Staff', color: 'sky' }];

async function main() {
  let created = { schedules: 0, departments: 0, jobs: 0, leaveTypes: 0, tags: 0 };

  for (const t of TAGS) {
    const existing = await prisma.employeeTag.findUnique({ where: { name: t.name } });
    if (existing) continue;
    await prisma.employeeTag.create({ data: t });
    created.tags += 1;
  }

  for (const s of SCHEDULES) {
    const existing = await prisma.workSchedule.findFirst({ where: { name: s.name } });
    if (existing) continue;
    await prisma.workSchedule.create({
      data: {
        name: s.name,
        startTime: s.startTime,
        endTime: s.endTime,
        hoursPerDay: s.hoursPerDay,
        // The reference sets every calendar to 63 hours a week.
        hoursPerWeek: 63,
        // No rest days: the reference's calendars are configured as 7-day weeks.
        restDays: '',
        timezone: 'Asia/Kuwait',
      },
    });
    created.schedules += 1;
  }

  for (const d of DEPARTMENTS) {
    const existing = await prisma.department.findFirst({ where: { name: d.name } });
    if (existing) continue;
    await prisma.department.create({ data: { name: d.name, nameAr: d.nameAr ?? null } });
    created.departments += 1;
  }

  for (const j of JOB_POSITIONS) {
    const existing = await prisma.jobPosition.findFirst({ where: { name: j.name } });
    if (existing) continue;
    await prisma.jobPosition.create({ data: { name: j.name, nameAr: j.nameAr ?? null } });
    created.jobs += 1;
  }

  for (const t of LEAVE_TYPES) {
    const existing = await prisma.leaveType.findFirst({ where: { OR: [{ code: t.code }, { name: t.name }] } });
    if (existing) continue;
    await prisma.leaveType.create({ data: t });
    created.leaveTypes += 1;
  }

  console.log('HR configuration seeded:');
  console.log(`  work schedules   +${created.schedules}`);
  console.log(`  departments      +${created.departments}`);
  console.log(`  job positions    +${created.jobs}`);
  console.log(`  leave types      +${created.leaveTypes}`);
  console.log(`  employee tags    +${created.tags}`);
  console.log('\nNothing with a matching name is touched, so this is safe to re-run.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
