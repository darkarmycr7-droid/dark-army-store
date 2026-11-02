import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { storage } from '../../services/storage.service';
import { HttpError } from '../../middleware/error';
import {
  assertAllocationCovers,
  assertNoLeaveOverlap,
  checkIn,
  checkOut,
  docStatus,
  documentActivities,
  employeeIdsAtWork,
  employeeIdsOffToday,
  expiringDocuments,
  hoursThisMonth,
  kwDayKey,
  kwStartOfDay,
  kwEndOfDay,
  kwToday,
  kwYear,
  leaveBalances,
  onLeaveToday,
  openAttendance,
  parseRestDays,
  presentNow,
  proposeLeaveDays,
} from '../../services/hr.service';

export const adminHr = Router();

/**
 * Employees, Attendance and Time Off.
 *
 * Mirrors the reference instance's hr / hr_attendance / hr_holidays apps. The
 * list endpoints speak the same search + filters + group-by + pager language as
 * Contacts, so the shared Odoo view components drive them unchanged.
 *
 * Route order matters: every static path is declared before the `/:id` that
 * would otherwise swallow it.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const num = (v: any) => (v == null || v === '' ? null : Number(v));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const str = (v: any) => (v == null || v === '' ? null : String(v));
/** Date-only inputs arrive as 'YYYY-MM-DD' and mean a Kuwait-local day. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const day = (v: any) => (v == null || v === '' ? null : kwStartOfDay(String(v).slice(0, 10)));

const dayString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

// ==========================================================================
// Dashboard
// ==========================================================================

adminHr.get('/overview', async (_req, res) => {
  const today = kwToday();
  const year = kwYear();

  const [headcount, archived, present, onLeave, pending, departments, docs, todayPunches] = await Promise.all([
    prisma.employee.count({ where: { active: true } }),
    prisma.employee.count({ where: { active: false } }),
    presentNow(),
    onLeaveToday(),
    prisma.leaveRequest.count({ where: { state: 'TO_APPROVE' } }),
    prisma.department.count({ where: { active: true } }),
    expiringDocuments(60),
    prisma.attendance.count({ where: { checkIn: { gte: kwStartOfDay(today), lt: kwEndOfDay(today) } } }),
  ]);

  res.json({
    today,
    year,
    headcount,
    archived,
    presentNow: present,
    onLeaveToday: onLeave,
    pendingApprovals: pending,
    departments,
    todayPunches,
    expiringDocuments: docs.slice(0, 20),
    expiringCount: docs.length,
  });
});

// ==========================================================================
// Configuration — the dropdown sources every form needs in one call
// ==========================================================================

adminHr.get('/config', async (_req, res) => {
  const [departments, jobPositions, schedules, leaveTypes] = await Promise.all([
    prisma.department.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
    prisma.jobPosition.findMany({ where: { active: true }, orderBy: { name: 'asc' }, include: { department: true } }),
    prisma.workSchedule.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
    prisma.leaveType.findMany({ where: { active: true }, orderBy: [{ sequence: 'asc' }, { name: 'asc' }] }),
  ]);

  res.json({
    departments: departments.map((d) => ({ id: d.id, name: d.name, nameAr: d.nameAr, parentId: d.parentId })),
    jobPositions: jobPositions.map((j) => ({
      id: j.id, name: j.name, nameAr: j.nameAr,
      departmentId: j.departmentId, departmentName: j.department?.name ?? null, expected: j.expected,
    })),
    schedules: schedules.map((s) => ({
      id: s.id, name: s.name,
      hoursPerDay: Number(s.hoursPerDay), hoursPerWeek: Number(s.hoursPerWeek),
      startTime: s.startTime, endTime: s.endTime, restDays: s.restDays, timezone: s.timezone,
    })),
    leaveTypes: leaveTypes.map((t) => ({
      id: t.id, name: t.name, nameAr: t.nameAr, code: t.code,
      requiresAllocation: t.requiresAllocation, payPercent: Number(t.payPercent),
      maxDaysPerYear: t.maxDaysPerYear, color: t.color,
    })),
  });
});

// ---- Departments ----
adminHr.get('/departments', async (_req, res) => {
  const rows = await prisma.department.findMany({
    where: { active: true },
    orderBy: { name: 'asc' },
    include: { manager: { select: { id: true, name: true } }, _count: { select: { employees: true } } },
  });
  res.json(rows.map((d) => ({
    id: d.id, name: d.name, nameAr: d.nameAr, parentId: d.parentId,
    managerId: d.managerId, managerName: d.manager?.name ?? null,
    employeeCount: d._count.employees,
  })));
});

const departmentInput = z.object({
  name: z.string().min(1),
  nameAr: z.string().optional().nullable(),
  parentId: z.number().int().optional().nullable(),
  managerId: z.number().int().optional().nullable(),
});

adminHr.post('/departments', async (req, res) => {
  const b = departmentInput.parse(req.body);
  const row = await prisma.department.create({ data: { ...b, nameAr: str(b.nameAr) } });
  res.status(201).json(row);
});

adminHr.patch('/departments/:id', async (req, res) => {
  const b = departmentInput.partial().parse(req.body);
  const row = await prisma.department.update({ where: { id: Number(req.params.id) }, data: b });
  res.json(row);
});

adminHr.delete('/departments/:id', async (req, res) => {
  const id = Number(req.params.id);
  const used = await prisma.employee.count({ where: { departmentId: id } });
  if (used) throw new HttpError(400, `${used} employee(s) are in this department. Move them first.`);
  await prisma.department.update({ where: { id }, data: { active: false } });
  res.json({ ok: true });
});

// ---- Job positions ----
adminHr.get('/job-positions', async (_req, res) => {
  const rows = await prisma.jobPosition.findMany({
    where: { active: true },
    orderBy: { name: 'asc' },
    include: { department: true, _count: { select: { employees: true } } },
  });
  res.json(rows.map((j) => ({
    id: j.id, name: j.name, nameAr: j.nameAr, expected: j.expected,
    departmentId: j.departmentId, departmentName: j.department?.name ?? null,
    employeeCount: j._count.employees,
  })));
});

const jobInput = z.object({
  name: z.string().min(1),
  nameAr: z.string().optional().nullable(),
  departmentId: z.number().int().optional().nullable(),
  expected: z.number().int().min(0).optional(),
  description: z.string().optional().nullable(),
});

adminHr.post('/job-positions', async (req, res) => {
  const b = jobInput.parse(req.body);
  res.status(201).json(await prisma.jobPosition.create({ data: { ...b, nameAr: str(b.nameAr) } }));
});

adminHr.patch('/job-positions/:id', async (req, res) => {
  const b = jobInput.partial().parse(req.body);
  res.json(await prisma.jobPosition.update({ where: { id: Number(req.params.id) }, data: b }));
});

adminHr.delete('/job-positions/:id', async (req, res) => {
  const id = Number(req.params.id);
  const used = await prisma.employee.count({ where: { jobPositionId: id } });
  if (used) throw new HttpError(400, `${used} employee(s) hold this position. Reassign them first.`);
  await prisma.jobPosition.update({ where: { id }, data: { active: false } });
  res.json({ ok: true });
});

// ---- Working schedules ----
adminHr.get('/schedules', async (_req, res) => {
  const rows = await prisma.workSchedule.findMany({
    where: { active: true },
    orderBy: { name: 'asc' },
    include: { _count: { select: { employees: true } } },
  });
  res.json(rows.map((s) => ({
    id: s.id, name: s.name,
    hoursPerDay: Number(s.hoursPerDay), hoursPerWeek: Number(s.hoursPerWeek),
    startTime: s.startTime, endTime: s.endTime, restDays: s.restDays, timezone: s.timezone,
    // A shift whose end is at or before its start runs through midnight.
    overnight: !!(s.startTime && s.endTime && s.endTime <= s.startTime),
    employeeCount: s._count.employees,
  })));
});

const scheduleInput = z.object({
  name: z.string().min(1),
  hoursPerDay: z.number().min(0).max(24).optional(),
  hoursPerWeek: z.number().min(0).max(168).optional(),
  startTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  endTime: z.string().regex(/^\d{2}:\d{2}$/).optional().nullable(),
  restDays: z.string().optional(),
  timezone: z.string().optional(),
});

adminHr.post('/schedules', async (req, res) => {
  const b = scheduleInput.parse(req.body);
  res.status(201).json(await prisma.workSchedule.create({ data: b }));
});

adminHr.patch('/schedules/:id', async (req, res) => {
  const b = scheduleInput.partial().parse(req.body);
  res.json(await prisma.workSchedule.update({ where: { id: Number(req.params.id) }, data: b }));
});

adminHr.delete('/schedules/:id', async (req, res) => {
  const id = Number(req.params.id);
  const used = await prisma.employee.count({ where: { workScheduleId: id } });
  if (used) throw new HttpError(400, `${used} employee(s) are on this schedule. Move them first.`);
  await prisma.workSchedule.update({ where: { id }, data: { active: false } });
  res.json({ ok: true });
});

// ---- Leave types ----
adminHr.get('/leave-types', async (_req, res) => {
  const rows = await prisma.leaveType.findMany({
    where: { active: true },
    orderBy: [{ sequence: 'asc' }, { name: 'asc' }],
    include: { _count: { select: { requests: true } } },
  });
  res.json(rows.map((t) => ({
    id: t.id, name: t.name, nameAr: t.nameAr, code: t.code,
    requiresAllocation: t.requiresAllocation, payPercent: Number(t.payPercent),
    maxDaysPerYear: t.maxDaysPerYear, color: t.color, sequence: t.sequence,
    requestCount: t._count.requests,
  })));
});

const leaveTypeInput = z.object({
  name: z.string().min(1),
  nameAr: z.string().optional().nullable(),
  code: z.string().optional().nullable(),
  requiresAllocation: z.boolean().optional(),
  payPercent: z.number().min(0).max(100).optional(),
  maxDaysPerYear: z.number().int().min(0).optional().nullable(),
  color: z.string().optional(),
  sequence: z.number().int().optional(),
});

adminHr.post('/leave-types', async (req, res) => {
  const b = leaveTypeInput.parse(req.body);
  res.status(201).json(await prisma.leaveType.create({ data: { ...b, code: str(b.code), nameAr: str(b.nameAr) } }));
});

adminHr.patch('/leave-types/:id', async (req, res) => {
  const b = leaveTypeInput.partial().parse(req.body);
  res.json(await prisma.leaveType.update({ where: { id: Number(req.params.id) }, data: b }));
});

// ==========================================================================
// Employees
// ==========================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeEmployee(e: any) {
  return {
    id: e.id,
    ref: e.ref,
    name: e.name,
    nameAr: e.nameAr,
    active: e.active,
    status: e.status,
    employeeType: e.employeeType,
    workLocation: e.workLocation,
    tags: (e.tags || []).map((t: any) => ({ id: t.tag.id, name: t.tag.name, color: t.tag.color })),
    // Validity is computed, never stored — a stored copy goes stale the moment
    // the clock passes midnight and nobody re-saves the record.
    docs: {
      civilId: docStatus(e.civilId, e.civilIdExpiry),
      passport: docStatus(e.passportNo, e.passportExpiry),
      workPermit: docStatus(e.workPermitNo, e.workPermitExpiry),
    },
    departmentId: e.departmentId,
    departmentName: e.department?.name ?? null,
    jobPositionId: e.jobPositionId,
    jobPositionName: e.jobPosition?.name ?? null,
    jobTitle: e.jobTitle,
    managerId: e.managerId,
    managerName: e.manager?.name ?? null,
    workEmail: e.workEmail,
    workPhone: e.workPhone,
    mobile: e.mobile,
    privatePhone: e.privatePhone,
    nationality: e.nationality,
    birthday: e.birthday ? kwDayKey(e.birthday) : null,
    gender: e.gender,
    marital: e.marital,
    civilId: e.civilId,
    civilIdExpiry: e.civilIdExpiry ? kwDayKey(e.civilIdExpiry) : null,
    passportNo: e.passportNo,
    passportExpiry: e.passportExpiry ? kwDayKey(e.passportExpiry) : null,
    workPermitNo: e.workPermitNo,
    workPermitExpiry: e.workPermitExpiry ? kwDayKey(e.workPermitExpiry) : null,
    badgeId: e.badgeId,
    pin: e.pin,
    workScheduleId: e.workScheduleId,
    workScheduleName: e.workSchedule?.name ?? null,
    hireDate: e.hireDate ? kwDayKey(e.hireDate) : null,
    endDate: e.endDate ? kwDayKey(e.endDate) : null,
    monthlySalary: Number(e.monthlySalary ?? 0),
    emergencyContact: e.emergencyContact,
    emergencyPhone: e.emergencyPhone,
    imageUrl: e.imageUrl,
    notes: e.notes,
    createdAt: e.createdAt,
  };
}

const employeeInclude = {
  department: true,
  jobPosition: true,
  manager: { select: { id: true, name: true } },
  workSchedule: true,
  tags: { include: { tag: true } },
} as const;

/**
 * Employee photo upload.
 *
 * Unlike the product uploader this checks the MIME type: an employee photo is
 * rendered straight into a card, and letting anything through means a broken
 * image on a record nobody looks at twice. 5MB matches the rest of the admin —
 * a phone photo of an ID badge lands well under it.
 */
const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|webp|gif|avif)$/.test(file.mimetype)) return cb(null, true);
    cb(new HttpError(400, 'That is not an image. Use a JPG, PNG, WEBP, GIF or AVIF file.'));
  },
});

adminHr.post('/employees/upload', photoUpload.single('file'), async (req, res) => {
  if (!req.file) throw new HttpError(400, 'No file uploaded');
  const url = await storage.save(req.file.buffer, req.file.originalname);
  res.status(201).json({ url });
});

/**
 * Department counts for the search panel down the left of the employee views —
 * the reference's `<searchpanel>`. Counts respect the archived filter but not
 * the department selection itself, so the panel does not collapse to one row
 * the moment you click something.
 */
adminHr.get('/employees/department-counts', async (req, res) => {
  const archived = String(req.query.filters || '').split(',').includes('archived');
  const where = { active: !archived };

  const [grouped, departments, total] = await Promise.all([
    prisma.employee.groupBy({ by: ['departmentId'], where, _count: { _all: true } }),
    prisma.department.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
    prisma.employee.count({ where }),
  ]);

  const counts = new Map(grouped.map((g) => [g.departmentId, g._count._all]));
  res.json({
    total,
    departments: departments
      .map((d) => ({ id: d.id, name: d.name, nameAr: d.nameAr, count: counts.get(d.id) ?? 0 }))
      .filter((d) => d.count > 0),
    unassigned: counts.get(null) ?? 0,
  });
});

adminHr.get('/employees', async (req, res) => {
  const q = req.query;
  const filters = String(q.filters || '').split(',').filter(Boolean);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { active: filters.includes('archived') ? false : true };

  // The search panel sends a multi-select list of departments.
  const deptIds = String(q.departmentId || '').split(',').filter(Boolean).map(Number);
  if (deptIds.length === 1) where.departmentId = deptIds[0];
  else if (deptIds.length > 1) where.departmentId = { in: deptIds };
  if (q.jobPositionId) where.jobPositionId = Number(q.jobPositionId);
  if (q.workScheduleId) where.workScheduleId = Number(q.workScheduleId);
  if (q.tagId) where.tags = { some: { tagId: Number(q.tagId) } };

  // Status filters, mirroring the reference's own selection values.
  const statuses = filters
    .filter((f) => f.startsWith('status:'))
    .map((f) => f.slice(7).toUpperCase());
  if (statuses.length) where.status = { in: statuses };

  if (filters.includes('atwork')) where.id = { in: await employeeIdsAtWork() };
  if (filters.includes('offtoday')) where.id = { in: await employeeIdsOffToday() };
  if (filters.includes('newhires')) {
    // "Newly Hired" in the reference means started within the last 90 days.
    where.hireDate = { gte: new Date(Date.now() - 90 * 24 * 60 * 60_000) };
  }

  // Documents lapsing inside 60 days — the filter HR lives on.
  if (filters.includes('expiring')) {
    const now = new Date();
    const until = new Date(now.getTime() + 60 * 24 * 60 * 60_000);
    where.OR = [
      { civilIdExpiry: { gte: now, lte: until } },
      { passportExpiry: { gte: now, lte: until } },
      { workPermitExpiry: { gte: now, lte: until } },
    ];
  }
  if (filters.includes('nodocs')) {
    where.AND = [
      ...(where.AND || []),
      { OR: [{ civilId: null }, { passportNo: null }, { workPermitNo: null }] },
    ];
  }
  if (filters.includes('kiosk')) where.badgeId = { not: null };

  const search = String(q.q || '').trim();
  if (search) {
    const like = { contains: search };
    const searchOr = [
      { name: like }, { nameAr: like }, { ref: like }, { jobTitle: like },
      { civilId: like }, { passportNo: like }, { workPermitNo: like },
      { badgeId: like }, { mobile: like }, { workEmail: like },
    ];
    // Keep an existing OR (the expiring filter) intact by ANDing the two.
    if (where.OR) {
      where.AND = [...(where.AND || []), { OR: where.OR }, { OR: searchOr }];
      delete where.OR;
    } else {
      where.OR = searchOr;
    }
  }

  const take = Math.min(Number(q.limit) || 80, 500);
  const skip = Number(q.skip) || 0;
  const order = String(q.order || 'name');
  const dir = String(q.dir || 'asc') === 'desc' ? 'desc' : 'asc';

  const [rows, total] = await Promise.all([
    prisma.employee.findMany({ where, orderBy: { [order]: dir }, take, skip, include: employeeInclude }),
    prisma.employee.count({ where }),
  ]);

  // Group-by counts, Odoo style.
  let groups: { key: string; label: string; count: number }[] | undefined;
  const groupBy = String(q.groupBy || '');

  // Scalar group-bys need no lookup — the value is its own label.
  if (groupBy === 'status' || groupBy === 'employeeType') {
    const raw = await prisma.employee.groupBy({
      by: [groupBy as 'status'], where, _count: { _all: true },
    });
    groups = raw
      .map((r) => ({
        key: String(r[groupBy as 'status']),
        label: titleise(String(r[groupBy as 'status'])),
        count: r._count._all,
      }))
      .sort((a, b) => b.count - a.count);
  } else if (groupBy === 'department' || groupBy === 'jobPosition' || groupBy === 'schedule' || groupBy === 'manager') {
    const field = groupBy === 'department' ? 'departmentId'
      : groupBy === 'jobPosition' ? 'jobPositionId'
      : groupBy === 'manager' ? 'managerId'
      : 'workScheduleId';
    const raw = await prisma.employee.groupBy({ by: [field as 'departmentId'], where, _count: { _all: true } });
    const ids = raw.map((r) => r[field as 'departmentId']).filter((v): v is number => v != null);
    const names = new Map<number, string>();
    if (groupBy === 'department') {
      (await prisma.department.findMany({ where: { id: { in: ids } } })).forEach((d) => names.set(d.id, d.name));
    } else if (groupBy === 'jobPosition') {
      (await prisma.jobPosition.findMany({ where: { id: { in: ids } } })).forEach((d) => names.set(d.id, d.name));
    } else if (groupBy === 'manager') {
      (await prisma.employee.findMany({ where: { id: { in: ids } } })).forEach((d) => names.set(d.id, d.name));
    } else {
      (await prisma.workSchedule.findMany({ where: { id: { in: ids } } })).forEach((d) => names.set(d.id, d.name));
    }
    groups = raw
      .map((r) => {
        const id = r[field as 'departmentId'];
        return {
          key: String(id ?? 'none'),
          label: id == null ? 'Not set' : names.get(id) || `#${id}`,
          count: r._count._all,
        };
      })
      .sort((a, b) => b.count - a.count);
  }

  res.json({ rows: rows.map(serializeEmployee), total, skip, take, groups });
});

const EMPLOYEE_STATUSES = ['WORKING', 'ON_PROBATION', 'ON_LEAVE', 'ON_NOTICE', 'SEVERANCE', 'TERMINATED'] as const;
const EMPLOYEE_TYPES = ['EMPLOYEE', 'WORKER', 'STUDENT', 'TRAINEE', 'CONTRACTOR', 'FREELANCE'] as const;

const employeeInput = z.object({
  ref: z.string().optional().nullable(),
  name: z.string().min(1, 'Name is required'),
  nameAr: z.string().optional().nullable(),
  status: z.enum(EMPLOYEE_STATUSES).optional(),
  employeeType: z.enum(EMPLOYEE_TYPES).optional(),
  workLocation: z.string().optional().nullable(),
  tagIds: z.array(z.number().int()).optional(),
  departmentId: z.number().int().optional().nullable(),
  jobPositionId: z.number().int().optional().nullable(),
  jobTitle: z.string().optional().nullable(),
  managerId: z.number().int().optional().nullable(),
  workEmail: z.string().optional().nullable(),
  workPhone: z.string().optional().nullable(),
  mobile: z.string().optional().nullable(),
  privatePhone: z.string().optional().nullable(),
  nationality: z.string().optional().nullable(),
  birthday: dayString.optional().nullable(),
  gender: z.enum(['MALE', 'FEMALE']).optional().nullable(),
  marital: z.enum(['SINGLE', 'MARRIED', 'WIDOWED', 'DIVORCED']).optional().nullable(),
  civilId: z.string().optional().nullable(),
  civilIdExpiry: dayString.optional().nullable(),
  passportNo: z.string().optional().nullable(),
  passportExpiry: dayString.optional().nullable(),
  workPermitNo: z.string().optional().nullable(),
  workPermitExpiry: dayString.optional().nullable(),
  badgeId: z.string().optional().nullable(),
  pin: z.string().optional().nullable(),
  workScheduleId: z.number().int().optional().nullable(),
  hireDate: dayString.optional().nullable(),
  endDate: dayString.optional().nullable(),
  monthlySalary: z.number().min(0).optional(),
  emergencyContact: z.string().optional().nullable(),
  emergencyPhone: z.string().optional().nullable(),
  imageUrl: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toEmployeeData(b: any) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d: any = { ...b };
  // tagIds is a relation instruction, not a column — handled separately.
  delete d.tagIds;
  for (const k of ['birthday', 'civilIdExpiry', 'passportExpiry', 'workPermitExpiry', 'hireDate', 'endDate']) {
    if (k in d) d[k] = day(d[k]);
  }
  for (const k of ['ref', 'nameAr', 'jobTitle', 'workEmail', 'workPhone', 'mobile', 'privatePhone',
    'nationality', 'gender', 'marital', 'civilId', 'passportNo', 'workPermitNo', 'badgeId', 'pin',
    'emergencyContact', 'emergencyPhone', 'imageUrl', 'notes', 'workLocation']) {
    if (k in d) d[k] = str(d[k]);
  }
  if ('monthlySalary' in d && d.monthlySalary != null) d.monthlySalary = new Prisma.Decimal(d.monthlySalary);
  return d;
}

/** Replace an employee's tag links with exactly the ids given. */
async function setTags(employeeId: number, tagIds: number[]) {
  await prisma.employeeTagLink.deleteMany({ where: { employeeId, tagId: { notIn: tagIds } } });
  for (const tagId of tagIds) {
    await prisma.employeeTagLink.upsert({
      where: { employeeId_tagId: { employeeId, tagId } },
      create: { employeeId, tagId },
      update: {},
    });
  }
}

/** Turn WORKING / ON_PROBATION into "Working" / "On Probation". */
function titleise(v: string) {
  return v.toLowerCase().split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// ---- Employee tags ----
adminHr.get('/employee-tags', async (_req, res) => {
  const rows = await prisma.employeeTag.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { links: true } } },
  });
  res.json(rows.map((t) => ({ id: t.id, name: t.name, color: t.color, count: t._count.links })));
});

adminHr.post('/employee-tags', async (req, res) => {
  const b = z.object({ name: z.string().min(1), color: z.string().optional() }).parse(req.body);
  res.status(201).json(await prisma.employeeTag.create({ data: b }));
});

adminHr.post('/employees', async (req, res) => {
  const b = employeeInput.parse(req.body);
  const data = toEmployeeData(b);
  if (data.badgeId) {
    const clash = await prisma.employee.findUnique({ where: { badgeId: data.badgeId } });
    if (clash) throw new HttpError(400, `Badge ${data.badgeId} already belongs to ${clash.name}.`);
  }
  const created = await prisma.employee.create({ data });
  if (b.tagIds) await setTags(created.id, b.tagIds);
  const row = await prisma.employee.findUnique({ where: { id: created.id }, include: employeeInclude });
  res.status(201).json(serializeEmployee(row));
});

adminHr.get('/employees/:id', async (req, res) => {
  const id = Number(req.params.id);
  const e = await prisma.employee.findUnique({ where: { id }, include: employeeInclude });
  if (!e) throw new HttpError(404, 'Employee not found');

  const year = kwYear();
  const today = kwToday();
  const [
    balances, open, attendanceCount, leaveCount, recentAttendance, recentLeaves,
    reports, monthHours, leaveNow,
  ] = await Promise.all([
    leaveBalances(id, year),
    openAttendance(id),
    prisma.attendance.count({ where: { employeeId: id } }),
    prisma.leaveRequest.count({ where: { employeeId: id } }),
    prisma.attendance.findMany({ where: { employeeId: id }, orderBy: { checkIn: 'desc' }, take: 10 }),
    prisma.leaveRequest.findMany({
      where: { employeeId: id }, orderBy: { dateFrom: 'desc' }, take: 10, include: { leaveType: true },
    }),
    prisma.employee.findMany({
      where: { managerId: id, active: true },
      select: { id: true, name: true, jobTitle: true, imageUrl: true },
      orderBy: { name: 'asc' },
    }),
    hoursThisMonth(id),
    prisma.leaveRequest.findFirst({
      where: {
        employeeId: id, state: 'APPROVED',
        dateFrom: { lte: kwStartOfDay(today) }, dateTo: { gte: kwStartOfDay(today) },
      },
      include: { leaveType: true },
    }),
  ]);

  // The reference shows a present/absent pill. Approved leave outranks a punch:
  // somebody on leave who forgot to check out is on leave, not at work.
  const presence = leaveNow ? 'on_leave' : open ? 'present' : 'absent';

  res.json({
    ...serializeEmployee(e),
    year,
    balances,
    checkedIn: !!open,
    checkedInSince: open?.checkIn ?? null,
    attendanceCount,
    leaveCount,
    hoursThisMonth: monthHours,
    presence,
    onLeaveUntil: leaveNow ? kwDayKey(leaveNow.dateTo) : null,
    onLeaveType: leaveNow?.leaveType.name ?? null,
    activities: documentActivities(e),
    reports,
    recentAttendance: recentAttendance.map((a) => ({
      id: a.id, checkIn: a.checkIn, checkOut: a.checkOut,
      workedHours: Number(a.workedHours), source: a.source, day: kwDayKey(a.checkIn),
    })),
    recentLeaves: recentLeaves.map((l) => ({
      id: l.id, leaveTypeName: l.leaveType.name, dateFrom: kwDayKey(l.dateFrom),
      dateTo: kwDayKey(l.dateTo), days: Number(l.days), state: l.state,
    })),
  });
});

adminHr.patch('/employees/:id', async (req, res) => {
  const id = Number(req.params.id);
  const b = employeeInput.partial().parse(req.body);
  const data = toEmployeeData(b);
  if (data.badgeId) {
    const clash = await prisma.employee.findUnique({ where: { badgeId: data.badgeId } });
    if (clash && clash.id !== id) throw new HttpError(400, `Badge ${data.badgeId} already belongs to ${clash.name}.`);
  }

  const before = await prisma.employee.findUnique({ where: { id }, include: employeeInclude });
  if (!before) throw new HttpError(404, 'Employee not found');

  await prisma.employee.update({ where: { id }, data });
  if (b.tagIds) await setTags(id, b.tagIds);
  const row = await prisma.employee.findUnique({ where: { id }, include: employeeInclude });

  await logTrackedChanges(id, before, row, req.auth?.email ?? null);
  res.json(serializeEmployee(row));
});

/**
 * Write an "old → new" line to the chatter for the fields that matter.
 *
 * The reference tracks a handful of fields this way, and it is the only record
 * of who moved somebody's department or changed a document number — the audit
 * log covers the request, but not in a form HR will ever read.
 */
const TRACKED: { key: string; label: string; date?: boolean }[] = [
  { key: 'status', label: 'Employee Status' },
  { key: 'employeeType', label: 'Employee Type' },
  { key: 'departmentId', label: 'Department' },
  { key: 'jobPositionId', label: 'Job Position' },
  { key: 'jobTitle', label: 'Job Title' },
  { key: 'managerId', label: 'Manager' },
  { key: 'workScheduleId', label: 'Working Schedule' },
  { key: 'civilId', label: 'Civil ID' },
  { key: 'civilIdExpiry', label: 'Civil ID Expiry', date: true },
  { key: 'passportNo', label: 'Passport Number' },
  { key: 'passportExpiry', label: 'Passport Expiry', date: true },
  { key: 'workPermitNo', label: 'Work Permit Number' },
  { key: 'workPermitExpiry', label: 'Work Permit Expiry', date: true },
  { key: 'monthlySalary', label: 'Monthly Salary' },
  { key: 'badgeId', label: 'Badge ID' },
  { key: 'hireDate', label: 'Hire Date', date: true },
  { key: 'endDate', label: 'End Date', date: true },
];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function logTrackedChanges(employeeId: number, before: any, after: any, author: string | null) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const show = (field: { key: string; label: string; date?: boolean }, row: any) => {
    const v = row[field.key];
    if (v == null || v === '') return 'not set';
    if (field.date) return kwDayKey(v);
    if (field.key === 'departmentId') return row.department?.name ?? `#${v}`;
    if (field.key === 'jobPositionId') return row.jobPosition?.name ?? `#${v}`;
    if (field.key === 'managerId') return row.manager?.name ?? `#${v}`;
    if (field.key === 'workScheduleId') return row.workSchedule?.name ?? `#${v}`;
    if (field.key === 'monthlySalary') return Number(v).toFixed(3);
    if (field.key === 'status' || field.key === 'employeeType') return titleise(String(v));
    return String(v);
  };

  const lines: string[] = [];
  for (const f of TRACKED) {
    const a = show(f, before);
    const bb = show(f, after);
    if (a !== bb) lines.push(`${f.label}: ${a} → ${bb}`);
  }
  if (!lines.length) return;

  await prisma.mailMessage.create({
    data: {
      resModel: 'employee',
      resId: employeeId,
      type: 'LOG',
      body: lines.join('\n'),
      authorEmail: author,
    },
  });
}

// ---- Chatter ----
adminHr.get('/employees/:id/messages', async (req, res) => {
  const rows = await prisma.mailMessage.findMany({
    where: { resModel: 'employee', resId: Number(req.params.id) },
    orderBy: { createdAt: 'desc' },
    take: 60,
  });
  res.json(rows.map((m) => ({
    id: m.id, type: m.type, body: m.body,
    authorName: m.authorName, authorEmail: m.authorEmail, createdAt: m.createdAt,
  })));
});

adminHr.post('/employees/:id/messages', async (req, res) => {
  const id = Number(req.params.id);
  const b = z.object({ body: z.string().min(1) }).parse(req.body);

  const exists = await prisma.employee.count({ where: { id } });
  if (!exists) throw new HttpError(404, 'Employee not found');

  const m = await prisma.mailMessage.create({
    data: {
      resModel: 'employee', resId: id, type: 'COMMENT',
      body: b.body, authorEmail: req.auth?.email ?? null,
    },
  });
  res.status(201).json(m);
});

adminHr.post('/employees/:id/archive', async (req, res) => {
  const id = Number(req.params.id);
  // An archived employee must not be left checked in — the "present now" count
  // would drift for ever.
  const open = await openAttendance(id);
  if (open) throw new HttpError(400, 'Check this employee out before archiving them.');
  const row = await prisma.employee.update({ where: { id }, data: { active: false }, include: employeeInclude });
  res.json(serializeEmployee(row));
});

adminHr.post('/employees/:id/unarchive', async (req, res) => {
  const row = await prisma.employee.update({
    where: { id: Number(req.params.id) }, data: { active: true }, include: employeeInclude,
  });
  res.json(serializeEmployee(row));
});

// ==========================================================================
// Attendance
// ==========================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeAttendance(a: any) {
  return {
    id: a.id,
    employeeId: a.employeeId,
    employeeName: a.employee?.name ?? null,
    departmentName: a.employee?.department?.name ?? null,
    checkIn: a.checkIn,
    checkOut: a.checkOut,
    // The Kuwait-local day the shift is credited to — its check-in date, so an
    // overnight shift stays on the day it started.
    day: kwDayKey(a.checkIn),
    workedHours: Number(a.workedHours),
    source: a.source,
    note: a.note,
  };
}

adminHr.get('/attendance', async (req, res) => {
  const q = req.query;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};
  if (q.employeeId) where.employeeId = Number(q.employeeId);
  if (q.departmentId) where.employee = { departmentId: Number(q.departmentId) };

  const filters = String(q.filters || '').split(',').filter(Boolean);
  if (filters.includes('open')) where.checkOut = null;
  if (filters.includes('today')) {
    const t = kwToday();
    where.checkIn = { gte: kwStartOfDay(t), lt: kwEndOfDay(t) };
  } else if (q.from || q.to) {
    where.checkIn = {};
    if (q.from) where.checkIn.gte = kwStartOfDay(String(q.from));
    if (q.to) where.checkIn.lt = kwEndOfDay(String(q.to));
  }

  const search = String(q.q || '').trim();
  if (search) where.employee = { ...(where.employee || {}), name: { contains: search } };

  const take = Math.min(Number(q.limit) || 80, 500);
  const skip = Number(q.skip) || 0;

  const [rows, total, agg] = await Promise.all([
    prisma.attendance.findMany({
      where, orderBy: { checkIn: 'desc' }, take, skip,
      include: { employee: { include: { department: true } } },
    }),
    prisma.attendance.count({ where }),
    prisma.attendance.aggregate({ where, _sum: { workedHours: true } }),
  ]);

  res.json({
    rows: rows.map(serializeAttendance),
    total, skip, take,
    totalHours: Number(agg._sum.workedHours ?? 0),
  });
});

/**
 * Kiosk punch — one endpoint that toggles. A badge scan or a typed PIN comes in,
 * and whichever direction the employee is facing is the direction they go.
 * The device never has to know or guess the current state.
 */
adminHr.post('/attendance/punch', async (req, res) => {
  const b = z.object({
    badgeId: z.string().optional(),
    pin: z.string().optional(),
    at: z.string().datetime().optional(),
  }).parse(req.body);

  if (!b.badgeId && !b.pin) throw new HttpError(400, 'Scan a badge or enter a PIN.');

  // The kiosk has one field and cannot tell a scanned badge from a typed PIN,
  // so it sends the same value as both. Badge wins when it matches, and the PIN
  // is tried afterwards rather than instead — otherwise a typed PIN would fail
  // as an unknown badge.
  let employee = b.badgeId
    ? await prisma.employee.findUnique({ where: { badgeId: b.badgeId } })
    : null;
  if (!employee && b.pin) {
    employee = await prisma.employee.findFirst({ where: { pin: b.pin, active: true } });
  }

  if (!employee) throw new HttpError(404, 'No employee matches that badge or PIN.');
  if (!employee.active) throw new HttpError(400, `${employee.name} is archived.`);

  const at = b.at ? new Date(b.at) : new Date();
  const open = await openAttendance(employee.id);

  if (open) {
    const row = await checkOut(employee.id, at);
    return res.json({
      direction: 'out',
      employee: { id: employee.id, name: employee.name },
      at: row.checkOut,
      workedHours: Number(row.workedHours),
    });
  }

  const row = await checkIn(employee.id, at, 'KIOSK');
  res.json({ direction: 'in', employee: { id: employee.id, name: employee.name }, at: row.checkIn, workedHours: 0 });
});

adminHr.post('/attendance/check-in', async (req, res) => {
  const b = z.object({
    employeeId: z.number().int(),
    at: z.string().datetime().optional(),
    note: z.string().optional(),
  }).parse(req.body);
  const row = await checkIn(b.employeeId, b.at ? new Date(b.at) : new Date(), 'MANUAL', b.note);
  res.status(201).json(serializeAttendance(row));
});

adminHr.post('/attendance/check-out', async (req, res) => {
  const b = z.object({
    employeeId: z.number().int(),
    at: z.string().datetime().optional(),
    note: z.string().optional(),
  }).parse(req.body);
  const row = await checkOut(b.employeeId, b.at ? new Date(b.at) : new Date(), b.note);
  res.json(serializeAttendance(row));
});

/** Manual entry — HR correcting a missed punch. */
adminHr.post('/attendance', async (req, res) => {
  const b = z.object({
    employeeId: z.number().int(),
    checkIn: z.string().datetime(),
    checkOut: z.string().datetime().optional().nullable(),
    note: z.string().optional().nullable(),
  }).parse(req.body);

  const start = new Date(b.checkIn);
  const end = b.checkOut ? new Date(b.checkOut) : null;
  if (end && end <= start) throw new HttpError(400, 'Check-out must be after check-in.');

  // A second open row would break the "one open attendance" rule the kiosk
  // depends on, so only allow an open manual row if there isn't one already.
  if (!end) {
    const open = await openAttendance(b.employeeId);
    if (open) throw new HttpError(400, 'That employee already has an open attendance.');
  }

  const row = await prisma.attendance.create({
    data: {
      employeeId: b.employeeId,
      checkIn: start,
      checkOut: end,
      workedHours: new Prisma.Decimal(end ? Math.round(((end.getTime() - start.getTime()) / 3_600_000) * 100) / 100 : 0),
      source: 'MANUAL',
      note: str(b.note),
    },
    include: { employee: { include: { department: true } } },
  });
  res.status(201).json(serializeAttendance(row));
});

adminHr.patch('/attendance/:id', async (req, res) => {
  const id = Number(req.params.id);
  const b = z.object({
    checkIn: z.string().datetime().optional(),
    checkOut: z.string().datetime().optional().nullable(),
    note: z.string().optional().nullable(),
  }).parse(req.body);

  const existing = await prisma.attendance.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, 'Attendance not found');

  const start = b.checkIn ? new Date(b.checkIn) : existing.checkIn;
  const end = b.checkOut === undefined ? existing.checkOut : b.checkOut ? new Date(b.checkOut) : null;
  if (end && end <= start) throw new HttpError(400, 'Check-out must be after check-in.');

  const row = await prisma.attendance.update({
    where: { id },
    data: {
      checkIn: start,
      checkOut: end,
      workedHours: new Prisma.Decimal(end ? Math.round(((end.getTime() - start.getTime()) / 3_600_000) * 100) / 100 : 0),
      note: b.note === undefined ? existing.note : str(b.note),
    },
    include: { employee: { include: { department: true } } },
  });
  res.json(serializeAttendance(row));
});

adminHr.delete('/attendance/:id', async (req, res) => {
  await prisma.attendance.delete({ where: { id: Number(req.params.id) } });
  res.json({ ok: true });
});

// ==========================================================================
// Time Off
// ==========================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serializeLeave(l: any) {
  return {
    id: l.id,
    employeeId: l.employeeId,
    employeeName: l.employee?.name ?? null,
    departmentName: l.employee?.department?.name ?? null,
    leaveTypeId: l.leaveTypeId,
    leaveTypeName: l.leaveType?.name ?? null,
    leaveTypeColor: l.leaveType?.color ?? 'slate',
    payPercent: l.leaveType ? Number(l.leaveType.payPercent) : 100,
    dateFrom: kwDayKey(l.dateFrom),
    dateTo: kwDayKey(l.dateTo),
    days: Number(l.days),
    reason: l.reason,
    state: l.state,
    approvedBy: l.approvedBy,
    approvedAt: l.approvedAt,
    refusedReason: l.refusedReason,
    createdAt: l.createdAt,
  };
}

const leaveInclude = { employee: { include: { department: true } }, leaveType: true } as const;

/** Days a range would cost for this employee, so the form can propose a number. */
adminHr.get('/leaves/propose', async (req, res) => {
  const employeeId = num(req.query.employeeId);
  const from = String(req.query.from || '');
  const to = String(req.query.to || from);
  if (!from) throw new HttpError(400, 'from is required');

  let restDays: number[] = [];
  if (employeeId) {
    const e = await prisma.employee.findUnique({ where: { id: employeeId }, include: { workSchedule: true } });
    restDays = parseRestDays(e?.workSchedule?.restDays);
  }
  res.json({ days: proposeLeaveDays(from, to, restDays), restDays });
});

adminHr.get('/leaves', async (req, res) => {
  const q = req.query;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {};
  if (q.employeeId) where.employeeId = Number(q.employeeId);
  if (q.leaveTypeId) where.leaveTypeId = Number(q.leaveTypeId);
  if (q.departmentId) where.employee = { departmentId: Number(q.departmentId) };

  const filters = String(q.filters || '').split(',').filter(Boolean);
  if (filters.includes('pending')) where.state = 'TO_APPROVE';
  if (filters.includes('approved')) where.state = 'APPROVED';
  if (filters.includes('refused')) where.state = 'REFUSED';
  if (filters.includes('current')) {
    const t = kwStartOfDay(kwToday());
    where.dateFrom = { lte: t };
    where.dateTo = { gte: t };
  }
  if (filters.includes('upcoming')) where.dateFrom = { gt: kwStartOfDay(kwToday()) };
  if (q.year) {
    const y = Number(q.year);
    where.dateFrom = { ...(where.dateFrom || {}), gte: kwStartOfDay(`${y}-01-01`), lt: kwStartOfDay(`${y + 1}-01-01`) };
  }

  const search = String(q.q || '').trim();
  if (search) where.employee = { ...(where.employee || {}), name: { contains: search } };

  const take = Math.min(Number(q.limit) || 80, 500);
  const skip = Number(q.skip) || 0;

  const [rows, total, agg] = await Promise.all([
    prisma.leaveRequest.findMany({ where, orderBy: { dateFrom: 'desc' }, take, skip, include: leaveInclude }),
    prisma.leaveRequest.count({ where }),
    prisma.leaveRequest.aggregate({ where, _sum: { days: true } }),
  ]);

  res.json({ rows: rows.map(serializeLeave), total, skip, take, totalDays: Number(agg._sum.days ?? 0) });
});

const leaveInput = z.object({
  employeeId: z.number().int(),
  leaveTypeId: z.number().int(),
  dateFrom: dayString,
  dateTo: dayString,
  days: z.number().min(0.5).optional(),
  reason: z.string().optional().nullable(),
  /** Submit straight for approval, or park it as a draft. */
  draft: z.boolean().optional(),
});

adminHr.post('/leaves', async (req, res) => {
  const b = leaveInput.parse(req.body);
  if (b.dateTo < b.dateFrom) throw new HttpError(400, 'The end date is before the start date.');

  const employee = await prisma.employee.findUnique({ where: { id: b.employeeId }, include: { workSchedule: true } });
  if (!employee) throw new HttpError(404, 'Employee not found');
  if (!employee.active) throw new HttpError(400, `${employee.name} is archived.`);

  await assertNoLeaveOverlap(b.employeeId, b.dateFrom, b.dateTo);

  const days = b.days ?? proposeLeaveDays(b.dateFrom, b.dateTo, parseRestDays(employee.workSchedule?.restDays));
  if (days <= 0) throw new HttpError(400, 'That range is entirely rest days — nothing to book.');

  const row = await prisma.leaveRequest.create({
    data: {
      employeeId: b.employeeId,
      leaveTypeId: b.leaveTypeId,
      dateFrom: kwStartOfDay(b.dateFrom),
      dateTo: kwStartOfDay(b.dateTo),
      days: new Prisma.Decimal(days),
      reason: str(b.reason),
      state: b.draft ? 'DRAFT' : 'TO_APPROVE',
    },
    include: leaveInclude,
  });
  res.status(201).json(serializeLeave(row));
});

adminHr.patch('/leaves/:id', async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.leaveRequest.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, 'Request not found');
  if (existing.state === 'APPROVED') {
    throw new HttpError(400, 'Approved leave cannot be edited. Reset it to draft first.');
  }

  const b = leaveInput.partial().omit({ employeeId: true }).parse(req.body);
  const from = b.dateFrom ?? kwDayKey(existing.dateFrom);
  const to = b.dateTo ?? kwDayKey(existing.dateTo);
  if (to < from) throw new HttpError(400, 'The end date is before the start date.');
  await assertNoLeaveOverlap(existing.employeeId, from, to, id);

  const employee = await prisma.employee.findUnique({
    where: { id: existing.employeeId }, include: { workSchedule: true },
  });
  const days = b.days
    ?? (b.dateFrom || b.dateTo
      ? proposeLeaveDays(from, to, parseRestDays(employee?.workSchedule?.restDays))
      : Number(existing.days));

  const row = await prisma.leaveRequest.update({
    where: { id },
    data: {
      leaveTypeId: b.leaveTypeId ?? existing.leaveTypeId,
      dateFrom: kwStartOfDay(from),
      dateTo: kwStartOfDay(to),
      days: new Prisma.Decimal(days),
      reason: b.reason === undefined ? existing.reason : str(b.reason),
    },
    include: leaveInclude,
  });
  res.json(serializeLeave(row));
});

adminHr.post('/leaves/:id/submit', async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.leaveRequest.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, 'Request not found');
  if (existing.state !== 'DRAFT') throw new HttpError(400, 'Only a draft can be submitted.');
  const row = await prisma.leaveRequest.update({
    where: { id }, data: { state: 'TO_APPROVE' }, include: leaveInclude,
  });
  res.json(serializeLeave(row));
});

adminHr.post('/leaves/:id/approve', async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.leaveRequest.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, 'Request not found');
  if (existing.state === 'APPROVED') throw new HttpError(400, 'Already approved.');
  if (existing.state === 'CANCELLED') throw new HttpError(400, 'Cancelled requests cannot be approved.');

  // The balance gate — only types that require an allocation are checked.
  await assertAllocationCovers(existing);

  const row = await prisma.leaveRequest.update({
    where: { id },
    data: {
      state: 'APPROVED',
      approvedBy: req.auth?.email ?? null,
      approvedAt: new Date(),
      refusedReason: null,
    },
    include: leaveInclude,
  });
  res.json(serializeLeave(row));
});

adminHr.post('/leaves/:id/refuse', async (req, res) => {
  const id = Number(req.params.id);
  const b = z.object({ reason: z.string().optional().nullable() }).parse(req.body ?? {});
  const row = await prisma.leaveRequest.update({
    where: { id },
    data: { state: 'REFUSED', refusedReason: str(b.reason), approvedBy: req.auth?.email ?? null, approvedAt: new Date() },
    include: leaveInclude,
  });
  res.json(serializeLeave(row));
});

adminHr.post('/leaves/:id/cancel', async (req, res) => {
  const row = await prisma.leaveRequest.update({
    where: { id: Number(req.params.id) }, data: { state: 'CANCELLED' }, include: leaveInclude,
  });
  res.json(serializeLeave(row));
});

/** Send an approved or refused request back to draft so it can be corrected. */
adminHr.post('/leaves/:id/reset', async (req, res) => {
  const row = await prisma.leaveRequest.update({
    where: { id: Number(req.params.id) },
    data: { state: 'DRAFT', approvedBy: null, approvedAt: null, refusedReason: null },
    include: leaveInclude,
  });
  res.json(serializeLeave(row));
});

adminHr.delete('/leaves/:id', async (req, res) => {
  const id = Number(req.params.id);
  const existing = await prisma.leaveRequest.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, 'Request not found');
  if (existing.state === 'APPROVED') {
    throw new HttpError(400, 'Approved leave is history — cancel it instead of deleting it.');
  }
  await prisma.leaveRequest.delete({ where: { id } });
  res.json({ ok: true });
});

// ---- Allocations ----
adminHr.get('/allocations', async (req, res) => {
  const year = Number(req.query.year) || kwYear();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { year };
  if (req.query.employeeId) where.employeeId = Number(req.query.employeeId);
  if (req.query.leaveTypeId) where.leaveTypeId = Number(req.query.leaveTypeId);

  const rows = await prisma.leaveAllocation.findMany({
    where,
    orderBy: [{ employee: { name: 'asc' } }],
    include: { employee: { include: { department: true } }, leaveType: true },
    take: 500,
  });

  res.json(rows.map((a) => ({
    id: a.id,
    employeeId: a.employeeId,
    employeeName: a.employee.name,
    departmentName: a.employee.department?.name ?? null,
    leaveTypeId: a.leaveTypeId,
    leaveTypeName: a.leaveType.name,
    year: a.year,
    days: Number(a.days),
    note: a.note,
  })));
});

const allocationInput = z.object({
  employeeId: z.number().int(),
  leaveTypeId: z.number().int(),
  year: z.number().int().min(2000).max(2100),
  days: z.number().min(0),
  note: z.string().optional().nullable(),
});

adminHr.post('/allocations', async (req, res) => {
  const b = allocationInput.parse(req.body);
  // One row per employee/type/year — granting more days updates the same row
  // rather than stacking rows that have to be summed and reconciled.
  const row = await prisma.leaveAllocation.upsert({
    where: { employeeId_leaveTypeId_year: { employeeId: b.employeeId, leaveTypeId: b.leaveTypeId, year: b.year } },
    create: { ...b, days: new Prisma.Decimal(b.days), note: str(b.note) },
    update: { days: new Prisma.Decimal(b.days), note: str(b.note) },
    include: { employee: true, leaveType: true },
  });
  res.status(201).json({
    id: row.id, employeeId: row.employeeId, employeeName: row.employee.name,
    leaveTypeId: row.leaveTypeId, leaveTypeName: row.leaveType.name,
    year: row.year, days: Number(row.days), note: row.note,
  });
});

adminHr.delete('/allocations/:id', async (req, res) => {
  const id = Number(req.params.id);
  const a = await prisma.leaveAllocation.findUnique({ where: { id } });
  if (!a) throw new HttpError(404, 'Allocation not found');

  // Removing days that approved leave has already consumed would make the
  // balance negative and unexplainable.
  const balances = await leaveBalances(a.employeeId, a.year);
  const b = balances.find((x) => x.leaveTypeId === a.leaveTypeId);
  if (b && b.taken > 0) {
    throw new HttpError(400, `${b.taken} day(s) of this allocation are already approved. Cancel that leave first.`);
  }
  await prisma.leaveAllocation.delete({ where: { id } });
  res.json({ ok: true });
});

/** Balances for one employee, or the whole workforce for a type. */
adminHr.get('/balances', async (req, res) => {
  const year = Number(req.query.year) || kwYear();
  const employeeId = num(req.query.employeeId);
  if (!employeeId) throw new HttpError(400, 'employeeId is required');
  res.json({ year, balances: await leaveBalances(employeeId, year) });
});
