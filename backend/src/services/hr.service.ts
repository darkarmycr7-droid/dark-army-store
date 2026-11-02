import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { HttpError } from '../middleware/error';

/**
 * HR rules — attendance and time off.
 *
 * Everything that decides "is this punch allowed", "how many days is this
 * request" or "does this employee have the balance" lives here, so the routes
 * stay thin and the same answer comes back no matter who asks.
 *
 * TIME. The business runs in Kuwait, which is UTC+3 all year with no daylight
 * saving — so a fixed offset is correct here, and a full tz library would be
 * ceremony. Timestamps are stored UTC; anything that means "a day" (today's
 * attendance, a leave date, the year an allocation belongs to) is resolved
 * against Kuwait local time, because a shift that starts 11 PM Sunday belongs
 * to Sunday even though it is already Monday in UTC.
 */

/** Kuwait is UTC+3, fixed. No DST. */
export const KW_OFFSET_MIN = 180;

/** 'YYYY-MM-DD' for the Kuwait-local day a UTC instant falls in. */
export function kwDayKey(d: Date): string {
  return new Date(d.getTime() + KW_OFFSET_MIN * 60_000).toISOString().slice(0, 10);
}

/** Kuwait-local weekday, 0 = Sunday … 6 = Saturday. */
export function kwWeekday(d: Date): number {
  return new Date(d.getTime() + KW_OFFSET_MIN * 60_000).getUTCDay();
}

/** The UTC instant of 00:00 Kuwait time on a 'YYYY-MM-DD' date. */
export function kwStartOfDay(day: string): Date {
  return new Date(new Date(`${day}T00:00:00.000Z`).getTime() - KW_OFFSET_MIN * 60_000);
}

/** The UTC instant just after 23:59:59.999 Kuwait time — an exclusive upper bound. */
export function kwEndOfDay(day: string): Date {
  return new Date(kwStartOfDay(day).getTime() + 24 * 60 * 60_000);
}

/** Today's Kuwait-local date as 'YYYY-MM-DD'. */
export function kwToday(): string {
  return kwDayKey(new Date());
}

/** The Kuwait-local year, used to bucket allocations. */
export function kwYear(d: Date = new Date()): number {
  return Number(kwDayKey(d).slice(0, 4));
}

function dec(v: Prisma.Decimal | number | null | undefined): number {
  return v == null ? 0 : Number(v);
}

/** Hours between two instants, rounded to 2dp. */
export function hoursBetween(from: Date, to: Date): number {
  return Math.round(((to.getTime() - from.getTime()) / 3_600_000) * 100) / 100;
}

/**
 * "0,6" -> [0, 6]. Empty string means a 7-day week.
 *
 * The empty entries have to go BEFORE the Number() conversion: `''.split(',')`
 * yields `['']`, and `Number('')` is 0 — so a schedule with no rest days would
 * otherwise report Sunday as one, and every leave range spanning a Sunday would
 * quietly come up a day short.
 */
export function parseRestDays(restDays: string | null | undefined): number[] {
  return String(restDays || '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '')
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
}

/**
 * How many days a leave range costs, given the employee's schedule.
 *
 * Both ends are inclusive — a request "from the 5th to the 5th" is one day, not
 * zero. Rest days are skipped. The caller may override the result: half days
 * and split shifts are real, and the reference lets HR type a number.
 */
export function proposeLeaveDays(from: string, to: string, restDays: number[]): number {
  const start = kwStartOfDay(from);
  const end = kwStartOfDay(to);
  if (end < start) return 0;

  let days = 0;
  for (let t = start.getTime(); t <= end.getTime(); t += 24 * 60 * 60_000) {
    if (!restDays.includes(kwWeekday(new Date(t)))) days += 1;
  }
  return days;
}

/** Requests in these states are provisional or dead — they never consume balance. */
const CONSUMING_STATES = ['APPROVED'];
/** States that still block the calendar, so two requests cannot overlap. */
const BLOCKING_STATES = ['DRAFT', 'TO_APPROVE', 'APPROVED'];

export interface LeaveBalance {
  leaveTypeId: number;
  leaveTypeName: string;
  requiresAllocation: boolean;
  allocated: number;
  taken: number;
  /** Approved-but-future days are already counted in `taken`. */
  remaining: number;
}

/**
 * Balance per leave type for one employee in one year.
 *
 * Types that do not require an allocation still report what has been taken —
 * sick leave has no balance to draw down, but HR needs to see the running
 * total against the statutory cap.
 */
export async function leaveBalances(employeeId: number, year: number): Promise<LeaveBalance[]> {
  const [types, allocations, taken] = await Promise.all([
    prisma.leaveType.findMany({ where: { active: true }, orderBy: [{ sequence: 'asc' }, { name: 'asc' }] }),
    prisma.leaveAllocation.findMany({ where: { employeeId, year } }),
    prisma.leaveRequest.findMany({
      where: {
        employeeId,
        state: { in: CONSUMING_STATES },
        dateFrom: { gte: kwStartOfDay(`${year}-01-01`), lt: kwStartOfDay(`${year + 1}-01-01`) },
      },
      select: { leaveTypeId: true, days: true },
    }),
  ]);

  return types.map((t) => {
    const allocated = allocations.filter((a) => a.leaveTypeId === t.id).reduce((s, a) => s + dec(a.days), 0);
    const used = taken.filter((r) => r.leaveTypeId === t.id).reduce((s, r) => s + dec(r.days), 0);
    return {
      leaveTypeId: t.id,
      leaveTypeName: t.name,
      requiresAllocation: t.requiresAllocation,
      allocated,
      taken: used,
      remaining: Math.round((allocated - used) * 100) / 100,
    };
  });
}

/**
 * Reject a leave request that overlaps one the employee already has.
 * `ignoreId` lets an edit exclude itself.
 */
export async function assertNoLeaveOverlap(
  employeeId: number,
  from: string,
  to: string,
  ignoreId?: number,
) {
  const clash = await prisma.leaveRequest.findFirst({
    where: {
      employeeId,
      id: ignoreId ? { not: ignoreId } : undefined,
      state: { in: BLOCKING_STATES },
      // Two ranges overlap when each starts before the other ends.
      dateFrom: { lte: kwStartOfDay(to) },
      dateTo: { gte: kwStartOfDay(from) },
    },
    include: { leaveType: true },
  });

  if (clash) {
    throw new HttpError(
      400,
      `Overlaps an existing request (${clash.leaveType.name}, ` +
        `${kwDayKey(clash.dateFrom)} to ${kwDayKey(clash.dateTo)}).`,
    );
  }
}

/**
 * Check that approving this request will not overdraw the allocation.
 * Only types that require an allocation are gated; the rest are informational.
 */
export async function assertAllocationCovers(request: {
  id: number;
  employeeId: number;
  leaveTypeId: number;
  days: Prisma.Decimal | number;
  dateFrom: Date;
}) {
  const type = await prisma.leaveType.findUnique({ where: { id: request.leaveTypeId } });
  if (!type || !type.requiresAllocation) return;

  const year = kwYear(request.dateFrom);
  const balances = await leaveBalances(request.employeeId, year);
  const b = balances.find((x) => x.leaveTypeId === request.leaveTypeId);
  const remaining = b?.remaining ?? 0;

  if (dec(request.days) > remaining) {
    throw new HttpError(
      400,
      `Not enough ${type.name} balance for ${year}: ` +
        `${remaining} day(s) left, ${dec(request.days)} requested. Allocate more days first.`,
    );
  }
}

/**
 * Document validity, as the reference shows it on the kanban card.
 *
 * The reference stores this as a selection with three values (Valid / Expiring
 * Soon / Expired). Two more are needed to be truthful: `missing` when there is
 * no document number at all, and `undated` when a number is recorded but no
 * expiry is — which is common, and is not the same as valid.
 */
export type DocStatus = 'valid' | 'expiring' | 'expired' | 'undated' | 'missing';

export function docStatus(
  documentNo: string | null | undefined,
  expiry: Date | null | undefined,
  withinDays = 60,
): DocStatus {
  if (!documentNo) return 'missing';
  if (!expiry) return 'undated';
  const days = Math.ceil((expiry.getTime() - Date.now()) / 86_400_000);
  if (days < 0) return 'expired';
  if (days <= withinDays) return 'expiring';
  return 'valid';
}

/**
 * Document-expiry reminders, derived rather than stored.
 *
 * The reference schedules a real activity record per expiring document ("Civil
 * ID expiring on 2027-05-03", due in 235 days) which somebody can mark done.
 * These are computed from the expiry dates instead, which means they cannot
 * drift out of step with the document and cannot be dismissed while the problem
 * is still real — a lapsed Civil ID does not stop mattering because a manager
 * clicked "done". They disappear when the date is renewed.
 */
export interface DocActivity {
  document: string;
  number: string | null;
  expiresOn: string;
  daysUntil: number;
  status: DocStatus;
  summary: string;
}

export function documentActivities(e: {
  civilId: string | null; civilIdExpiry: Date | null;
  passportNo: string | null; passportExpiry: Date | null;
  workPermitNo: string | null; workPermitExpiry: Date | null;
}): DocActivity[] {
  const rows: { label: string; no: string | null; date: Date | null }[] = [
    { label: 'Civil ID', no: e.civilId, date: e.civilIdExpiry },
    { label: 'Passport', no: e.passportNo, date: e.passportExpiry },
    { label: 'Work permit', no: e.workPermitNo, date: e.workPermitExpiry },
  ];

  return rows
    .filter((r) => r.no && r.date)
    .map((r) => {
      const on = kwDayKey(r.date as Date);
      const days = Math.ceil(((r.date as Date).getTime() - Date.now()) / 86_400_000);
      return {
        document: r.label,
        number: r.no,
        expiresOn: on,
        daysUntil: days,
        status: docStatus(r.no, r.date),
        summary: days < 0 ? `${r.label} expired on ${on}` : `${r.label} expiring on ${on}`,
      };
    })
    // Only what needs chasing: anything already expired, or lapsing within a year.
    .filter((a) => a.daysUntil <= 365)
    .sort((a, b) => a.daysUntil - b.daysUntil);
}

/** Hours worked in the current Kuwait month — the reference's "Monthly Hours". */
export async function hoursThisMonth(employeeId: number): Promise<number> {
  const month = kwToday().slice(0, 7);
  const from = kwStartOfDay(`${month}-01`);
  const [y, m] = month.split('-').map(Number);
  const nextMonth = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;

  const agg = await prisma.attendance.aggregate({
    where: { employeeId, checkIn: { gte: from, lt: kwStartOfDay(nextMonth) } },
    _sum: { workedHours: true },
  });
  return Number(agg._sum.workedHours ?? 0);
}

/** Employees whose approved leave covers today — the "On Time Off" filter. */
export async function employeeIdsOffToday(): Promise<number[]> {
  const t = kwStartOfDay(kwToday());
  const rows = await prisma.leaveRequest.findMany({
    where: { state: 'APPROVED', dateFrom: { lte: t }, dateTo: { gte: t } },
    select: { employeeId: true },
  });
  return [...new Set(rows.map((r) => r.employeeId))];
}

/** Employees with an open attendance — the "At Work" filter. */
export async function employeeIdsAtWork(): Promise<number[]> {
  const rows = await prisma.attendance.findMany({ where: { checkOut: null }, select: { employeeId: true } });
  return [...new Set(rows.map((r) => r.employeeId))];
}

/** The employee's currently open attendance row, if they are checked in. */
export async function openAttendance(employeeId: number) {
  return prisma.attendance.findFirst({
    where: { employeeId, checkOut: null },
    orderBy: { checkIn: 'desc' },
  });
}

/**
 * Check in. Refuses a second check-in while one is open — that is the single
 * rule that keeps worked-hours arithmetic honest.
 */
export async function checkIn(employeeId: number, at: Date, source: 'KIOSK' | 'MANUAL', note?: string) {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee) throw new HttpError(404, 'Employee not found');
  if (!employee.active) throw new HttpError(400, `${employee.name} is archived and cannot check in.`);

  const open = await openAttendance(employeeId);
  if (open) {
    throw new HttpError(400, `${employee.name} is already checked in since ${open.checkIn.toISOString()}.`);
  }

  return prisma.attendance.create({
    data: { employeeId, checkIn: at, source, note: note || null },
  });
}

/** Check out of the open row, caching the worked hours. */
export async function checkOut(employeeId: number, at: Date, note?: string) {
  const employee = await prisma.employee.findUnique({ where: { id: employeeId } });
  if (!employee) throw new HttpError(404, 'Employee not found');

  const open = await openAttendance(employeeId);
  if (!open) throw new HttpError(400, `${employee.name} is not checked in.`);
  if (at <= open.checkIn) throw new HttpError(400, 'Check-out must be after check-in.');

  return prisma.attendance.update({
    where: { id: open.id },
    data: {
      checkOut: at,
      workedHours: new Prisma.Decimal(hoursBetween(open.checkIn, at)),
      note: note ?? open.note,
    },
  });
}

/** Employees currently checked in — the "present now" figure. */
export async function presentNow() {
  return prisma.attendance.count({ where: { checkOut: null } });
}

/** Employees whose approved leave covers today. */
export async function onLeaveToday() {
  const today = kwToday();
  return prisma.leaveRequest.count({
    where: {
      state: 'APPROVED',
      dateFrom: { lte: kwStartOfDay(today) },
      dateTo: { gte: kwStartOfDay(today) },
    },
  });
}

/**
 * Documents expiring within `days`. Civil ID, passport and work permit are the
 * three the reference tracks, and a lapsed one stops an employee working — so
 * this is the number that belongs on the dashboard.
 */
export async function expiringDocuments(days = 60) {
  const now = new Date();
  const until = new Date(now.getTime() + days * 24 * 60 * 60_000);
  const window = { gte: now, lte: until };

  const rows = await prisma.employee.findMany({
    where: {
      active: true,
      OR: [
        { civilIdExpiry: window },
        { passportExpiry: window },
        { workPermitExpiry: window },
      ],
    },
    select: {
      id: true, name: true, civilId: true, civilIdExpiry: true,
      passportNo: true, passportExpiry: true,
      workPermitNo: true, workPermitExpiry: true,
    },
    orderBy: { name: 'asc' },
  });

  // Flatten to one row per expiring document, soonest first — an employee with
  // two documents lapsing is two things to chase, not one.
  const out: { employeeId: number; employeeName: string; document: string; number: string | null; expiresOn: Date }[] = [];
  for (const e of rows) {
    if (e.civilIdExpiry && e.civilIdExpiry >= now && e.civilIdExpiry <= until) {
      out.push({ employeeId: e.id, employeeName: e.name, document: 'Civil ID', number: e.civilId, expiresOn: e.civilIdExpiry });
    }
    if (e.passportExpiry && e.passportExpiry >= now && e.passportExpiry <= until) {
      out.push({ employeeId: e.id, employeeName: e.name, document: 'Passport', number: e.passportNo, expiresOn: e.passportExpiry });
    }
    if (e.workPermitExpiry && e.workPermitExpiry >= now && e.workPermitExpiry <= until) {
      out.push({ employeeId: e.id, employeeName: e.name, document: 'Work permit', number: e.workPermitNo, expiresOn: e.workPermitExpiry });
    }
  }
  return out.sort((a, b) => a.expiresOn.getTime() - b.expiresOn.getTime());
}
