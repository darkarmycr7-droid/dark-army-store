import { apiBase } from './apiBase';

const TOKEN_KEY = 'da-admin-token';

export const adminToken = {
  get: () => (typeof window === 'undefined' ? null : localStorage.getItem(TOKEN_KEY)),
  set: (t: string) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

class AuthError extends Error {}

async function req<T>(path: string, opts: RequestInit = {}, isForm = false): Promise<T> {
  const token = adminToken.get();
  const headers: Record<string, string> = { ...(opts.headers as any) };
  if (!isForm) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${apiBase()}/admin${path}`, { cache: 'no-store', ...opts, headers });
  if (res.status === 401) {
    adminToken.clear();
    if (typeof window !== 'undefined' && !location.pathname.endsWith('/admin/login')) {
      location.href = '/admin/login';
    }
    throw new AuthError('Not authenticated');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.json();
}

export const adminApi = {
  login: (email: string, password: string) =>
    req<{ token: string; user: AdminUser }>('/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  me: () => req<AdminUser>('/me'),
  changePassword: (currentPassword: string, newPassword: string) =>
    req<{ ok: boolean }>('/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }),
  forgot: (email: string) =>
    req<{ ok: boolean; devCode?: string }>('/forgot', { method: 'POST', body: JSON.stringify({ email }) }),
  reset: (email: string, code: string, newPassword: string) =>
    req<{ token: string; user: AdminUser }>('/reset', { method: 'POST', body: JSON.stringify({ email, code, newPassword }) }),

  audit: (limit = 100) => req<AuditEntry[]>(`/audit?limit=${limit}`),

  report: (type: string, from?: string, to?: string) => {
    const qs = new URLSearchParams();
    if (from) qs.set('from', from);
    if (to) qs.set('to', to);
    return req<ReportData>(`/reports/${type}?${qs.toString()}`);
  },

  coupons: () => req<Coupon[]>('/coupons'),
  createCoupon: (data: CouponInput) => req<Coupon>('/coupons', { method: 'POST', body: JSON.stringify(data) }),
  updateCoupon: (id: number, data: Partial<Coupon>) => req<Coupon>(`/coupons/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteCoupon: (id: number) => req<{ ok: boolean }>(`/coupons/${id}`, { method: 'DELETE' }),

  team: () => req<TeamMember[]>('/team'),
  createAdmin: (data: { name: string; email: string; password: string; role?: string }) =>
    req<TeamMember>('/team', { method: 'POST', body: JSON.stringify(data) }),
  updateAdmin: (id: number, data: { isActive?: boolean; role?: string }) =>
    req<TeamMember>(`/team/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),

  dashboard: () => req<Dashboard>('/dashboard'),

  banners: () => req<AdminBanner[]>('/banners'),
  bannerSettings: () => req<{ intervalSeconds: number }>('/banners/settings'),
  updateBannerSettings: (intervalSeconds: number) =>
    req<{ intervalSeconds: number }>('/banners/settings', { method: 'PUT', body: JSON.stringify({ intervalSeconds }) }),
  createBanner: (data: BannerInput) => req<AdminBanner>('/banners', { method: 'POST', body: JSON.stringify(data) }),
  updateBanner: (id: number, data: BannerInput) => req<AdminBanner>(`/banners/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteBanner: (id: number) => req<{ ok: boolean }>(`/banners/${id}`, { method: 'DELETE' }),
  reorderBanners: (ids: number[]) => req<{ ok: boolean }>('/banners/reorder', { method: 'PATCH', body: JSON.stringify({ ids }) }),
  uploadBannerImage: async (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return req<{ url: string }>('/banners/upload', { method: 'POST', body: fd }, true);
  },

  products: (q = '', lowStock = false) =>
    req<AdminProduct[]>(`/products?q=${encodeURIComponent(q)}${lowStock ? '&lowStock=true' : ''}`),
  product: (id: number) => req<AdminProduct>(`/products/${id}`),
  createProduct: (data: ProductInput) => req<AdminProduct>('/products', { method: 'POST', body: JSON.stringify(data) }),
  updateProduct: (id: number, data: ProductInput) =>
    req<AdminProduct>(`/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteProduct: (id: number) => req<{ ok: boolean }>(`/products/${id}`, { method: 'DELETE' }),
  uploadImage: async (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return req<{ url: string }>('/products/upload', { method: 'POST', body: fd }, true);
  },
  categories: () => req<{ id: number; name: string; slug: string }[]>('/products/meta/categories'),
  createCategory: (name: string) =>
    req<{ id: number; name: string; slug: string }>('/products/meta/categories', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  // ---- Purchasing & stock ----
  suppliers: (q = '', activeOnly = false) =>
    req<Supplier[]>(`/suppliers?q=${encodeURIComponent(q)}${activeOnly ? '&active=true' : ''}`),
  supplier: (id: number) => req<SupplierDetail>(`/suppliers/${id}`),
  createSupplier: (data: SupplierInput) => req<Supplier>('/suppliers', { method: 'POST', body: JSON.stringify(data) }),
  updateSupplier: (id: number, data: SupplierInput) =>
    req<Supplier>(`/suppliers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteSupplier: (id: number) => req<{ ok: boolean; softDeleted?: boolean }>(`/suppliers/${id}`, { method: 'DELETE' }),

  purchaseOrders: (status = '', q = '') =>
    req<PurchaseOrder[]>(`/purchase-orders?status=${status}&q=${encodeURIComponent(q)}`),
  purchaseOrder: (id: number) => req<PurchaseOrder>(`/purchase-orders/${id}`),
  createPurchaseOrder: (data: PurchaseOrderInput) =>
    req<PurchaseOrder>('/purchase-orders', { method: 'POST', body: JSON.stringify(data) }),
  updatePurchaseOrder: (id: number, data: PurchaseOrderInput) =>
    req<PurchaseOrder>(`/purchase-orders/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  setPurchaseOrderStatus: (id: number, status: 'DRAFT' | 'ORDERED' | 'CANCELLED') =>
    req<PurchaseOrder>(`/purchase-orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  receivePurchaseOrder: (id: number, lines: { itemId: number; qty: number }[], reference?: string | null) =>
    req<PurchaseOrder>(`/purchase-orders/${id}/receive`, { method: 'POST', body: JSON.stringify({ lines, reference }) }),
  deletePurchaseOrder: (id: number) => req<{ ok: boolean }>(`/purchase-orders/${id}`, { method: 'DELETE' }),

  stockMovements: (params: { productId?: number; type?: string; from?: string; to?: string; skip?: number; limit?: number } = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== '') qs.set(k, String(v)); });
    return req<{ rows: StockMovement[]; total: number; skip: number; take: number }>(`/stock/movements?${qs}`);
  },
  adjustStock: (data: { productId: number; countedQty?: number; qty?: number; reason: string; unitCost?: number }) =>
    req<{ movement: StockMovement; product: { id: number; name: string; sku: string; stockQty: number; avgCost: number } }>(
      '/stock/adjust',
      { method: 'POST', body: JSON.stringify(data) }
    ),

  // ---- Point of sale ----
  posSessions: () => req<PosSessionRow[]>('/pos/sessions'),
  journals: () => req<AccountingJournal[]>('/accounting/journals'),
  createJournal: (data: JournalInput) =>
    req<AccountingJournal>('/accounting/journals', { method: 'POST', body: JSON.stringify(data) }),
  updateJournal: (id: number, data: Partial<JournalInput>) =>
    req<AccountingJournal>(`/accounting/journals/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteJournal: (id: number) =>
    req<{ ok: boolean; archived: boolean; entries?: number }>(`/accounting/journals/${id}`, { method: 'DELETE' }),
  partnerLedger: (params: { from?: string; to?: string; partnerId?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.from) qs.set('from', params.from);
    if (params.to) qs.set('to', params.to);
    if (params.partnerId) qs.set('partnerId', String(params.partnerId));
    return req<PartnerLedgerReport>(`/accounting/reports/partner-ledger?${qs}`);
  },
  agedBalance: (kind: 'receivable' | 'payable', asOf?: string) =>
    req<AgedReport>(`/accounting/reports/aged?kind=${kind}${asOf ? `&asOf=${asOf}` : ''}`),

  posRegisters: () => req<PosRegister[]>('/pos/registers'),
  createPosRegister: (data: PosRegisterInput) =>
    req<PosRegister>('/pos/registers', { method: 'POST', body: JSON.stringify(data) }),
  updatePosRegister: (id: number, data: Partial<PosRegisterInput>) =>
    req<PosRegister>(`/pos/registers/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deletePosRegister: (id: number) =>
    req<{ ok: boolean; archived: boolean; sessions?: number }>(`/pos/registers/${id}`, { method: 'DELETE' }),
  posCashiers: (registerId: number, q = '') =>
    req<PosCashier[]>(`/pos/registers/${registerId}/cashiers?q=${encodeURIComponent(q)}`),
  posVerifyCashier: (registerId: number, employeeId: number, pin: string) =>
    req<{ ok: boolean; employee: { id: number; name: string; imageUrl: string | null } }>(
      `/pos/registers/${registerId}/verify-cashier`,
      { method: 'POST', body: JSON.stringify({ employeeId, pin }) },
    ),
  posOpenRegister: (data: {
    registerId: number; cashierId: number; pin: string; openingFloat: number; openingNote?: string;
  }) =>
    req<{ id: number; sessionNumber: string; openingFloat: number }>('/pos/sessions', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  posCurrentSession: (registerId?: number) =>
    req<PosCurrentSession | null>(`/pos/sessions/current${registerId ? `?registerId=${registerId}` : ''}`),
  posSessionReport: (id: number) => req<PosSessionReport>(`/pos/sessions/${id}`),
  posOpenSession: (registerName: string, openingFloat: number, warehouseId?: number) =>
    req<{ id: number; sessionNumber: string; openingFloat: number }>('/pos/sessions', {
      method: 'POST',
      body: JSON.stringify({ registerName, openingFloat, warehouseId }),
    }),
  posCloseSession: (id: number, countedCash: number, note?: string) =>
    req<PosSessionReport>(`/pos/sessions/${id}/close`, { method: 'POST', body: JSON.stringify({ countedCash, note }) }),
  posCashMove: (sessionId: number, type: 'IN' | 'OUT', amount: number, reason: string) =>
    req<{ id: number }>('/pos/cash-moves', { method: 'POST', body: JSON.stringify({ sessionId, type, amount, reason }) }),
  posTillProducts: (q = '') => req<TillProduct[]>(`/pos/products?q=${encodeURIComponent(q)}`),
  posSale: (data: PosSaleInput) => req<{ order: PosOrder; change: number }>('/pos/orders', { method: 'POST', body: JSON.stringify(data) }),
  posOrder: (id: number) => req<PosOrder>(`/pos/orders/${id}`),
  posRefund: (id: number, reason?: string) =>
    req<PosOrder>(`/pos/orders/${id}/refund`, { method: 'POST', body: JSON.stringify({ reason }) }),

  // ---- Manufacturing ----
  boms: (params: { q?: string; filters?: string[]; skip?: number; limit?: number } = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v === undefined || v === '') return; qs.set(k, Array.isArray(v) ? v.join(',') : String(v)); });
    return req<{ rows: Bom[]; total: number; skip: number; take: number }>(`/boms?${qs}`);
  },
  bom: (id: number) => req<Bom>(`/boms/${id}`),
  createBom: (data: BomInput) => req<Bom>('/boms', { method: 'POST', body: JSON.stringify(data) }),
  updateBom: (id: number, data: BomInput) => req<Bom>(`/boms/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteBom: (id: number) => req<{ ok: boolean; archived?: boolean }>(`/boms/${id}`, { method: 'DELETE' }),

  manufacturingOrders: (params: { q?: string; filters?: string[]; groupBy?: string; skip?: number; limit?: number } = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v === undefined || v === '') return; qs.set(k, Array.isArray(v) ? v.join(',') : String(v)); });
    return req<{ rows: Mo[]; total: number; skip: number; take: number; groups?: { key: string; label: string; count: number }[] }>(`/manufacturing-orders?${qs}`);
  },
  manufacturingOrder: (id: number) => req<Mo>(`/manufacturing-orders/${id}`),
  explodeBom: (bomId: number, quantity: number, warehouseId?: number) => {
    const qs = new URLSearchParams({ quantity: String(quantity) });
    if (warehouseId) qs.set('warehouseId', String(warehouseId));
    return req<ExplodedComponent[]>(`/manufacturing-orders/explode/${bomId}?${qs}`);
  },
  createMo: (data: MoInput) => req<Mo>('/manufacturing-orders', { method: 'POST', body: JSON.stringify(data) }),
  updateMo: (id: number, data: MoInput) => req<Mo>(`/manufacturing-orders/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  confirmMo: (id: number) => req<Mo>(`/manufacturing-orders/${id}/confirm`, { method: 'POST' }),
  produceMo: (id: number, quantity: number) => req<Mo>(`/manufacturing-orders/${id}/produce`, { method: 'POST', body: JSON.stringify({ quantity }) }),
  cancelMo: (id: number) => req<Mo>(`/manufacturing-orders/${id}/cancel`, { method: 'POST' }),
  deleteMo: (id: number) => req<{ ok: boolean }>(`/manufacturing-orders/${id}`, { method: 'DELETE' }),

  // ---- Warehouses & transfers ----
  warehouses: (params: { q?: string; filters?: string[] } = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v === undefined || v === '') return;
      qs.set(k, Array.isArray(v) ? v.join(',') : String(v));
    });
    return req<{ rows: Warehouse[]; total: number; skip: number; take: number }>(`/warehouses?${qs}`);
  },
  warehouse: (id: number) => req<WarehouseDetail>(`/warehouses/${id}`),
  createWarehouse: (data: WarehouseInput) => req<Warehouse>('/warehouses', { method: 'POST', body: JSON.stringify(data) }),
  updateWarehouse: (id: number, data: WarehouseInput) => req<Warehouse>(`/warehouses/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteWarehouse: (id: number) => req<{ ok: boolean; archived?: boolean }>(`/warehouses/${id}`, { method: 'DELETE' }),

  transfers: (params: { q?: string; filters?: string[]; groupBy?: string; skip?: number; limit?: number } = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v === undefined || v === '') return;
      qs.set(k, Array.isArray(v) ? v.join(',') : String(v));
    });
    return req<{ rows: StockTransfer[]; total: number; skip: number; take: number; groups?: { key: string; label: string; count: number }[] }>(`/transfers?${qs}`);
  },
  transfer: (id: number) => req<StockTransfer>(`/transfers/${id}`),
  createTransfer: (data: TransferInput) => req<StockTransfer>('/transfers', { method: 'POST', body: JSON.stringify(data) }),
  updateTransfer: (id: number, data: TransferInput) => req<StockTransfer>(`/transfers/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  sendTransfer: (id: number) => req<StockTransfer>(`/transfers/${id}/send`, { method: 'POST' }),
  receiveTransfer: (id: number, lines: { lineId: number; qty: number }[]) =>
    req<StockTransfer>(`/transfers/${id}/receive`, { method: 'POST', body: JSON.stringify({ lines }) }),
  cancelTransfer: (id: number) => req<StockTransfer>(`/transfers/${id}/cancel`, { method: 'POST' }),
  deleteTransfer: (id: number) => req<{ ok: boolean }>(`/transfers/${id}`, { method: 'DELETE' }),

  // ---- Contacts ----
  partners: (params: { q?: string; filters?: string[]; groupBy?: string; tagId?: number; skip?: number; limit?: number; order?: string; dir?: string } = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v === undefined || v === '') return;
      qs.set(k, Array.isArray(v) ? v.join(',') : String(v));
    });
    return req<{ rows: Partner[]; total: number; skip: number; take: number; groups?: { key: string; label: string; count: number }[] }>(`/partners?${qs}`);
  },
  partner: (id: number) => req<PartnerDetail>(`/partners/${id}`),
  createPartner: (data: PartnerInput) => req<Partner>('/partners', { method: 'POST', body: JSON.stringify(data) }),
  updatePartner: (id: number, data: PartnerInput) => req<Partner>(`/partners/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  archivePartner: (id: number, active: boolean) =>
    req<{ ok: boolean; active: boolean }>(`/partners/${id}/active`, { method: 'PATCH', body: JSON.stringify({ active }) }),
  deletePartner: (id: number) => req<{ ok: boolean; archived?: boolean }>(`/partners/${id}`, { method: 'DELETE' }),
  partnerTags: () => req<PartnerTag[]>('/partners/meta/tags'),
  createPartnerTag: (name: string, color = 'slate') =>
    req<PartnerTag>('/partners/meta/tags', { method: 'POST', body: JSON.stringify({ name, color }) }),
  partnerMessages: (id: number) => req<ChatterMsg[]>(`/partners/${id}/messages`),
  postPartnerMessage: (id: number, body: string) =>
    req<ChatterMsg>(`/partners/${id}/messages`, { method: 'POST', body: JSON.stringify({ body }) }),

  // ---- Sales ----
  salesOrders: (params: { q?: string; filters?: string[]; groupBy?: string; partnerId?: number; skip?: number; limit?: number } = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v === undefined || v === '') return;
      qs.set(k, Array.isArray(v) ? v.join(',') : String(v));
    });
    return req<{ rows: SalesOrder[]; total: number; skip: number; take: number; groups?: { key: string; label: string; count: number }[] }>(`/sales-orders?${qs}`);
  },
  salesOrder: (id: number) => req<SalesOrder>(`/sales-orders/${id}`),
  createSalesOrder: (data: SalesOrderInput) => req<SalesOrder>('/sales-orders', { method: 'POST', body: JSON.stringify(data) }),
  updateSalesOrder: (id: number, data: SalesOrderInput) => req<SalesOrder>(`/sales-orders/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  confirmSalesOrder: (id: number) => req<SalesOrder>(`/sales-orders/${id}/confirm`, { method: 'POST' }),
  cancelSalesOrder: (id: number, reason?: string) =>
    req<SalesOrder>(`/sales-orders/${id}/cancel`, { method: 'POST', body: JSON.stringify({ reason }) }),
  deliverSalesOrder: (id: number, lines: { lineId: number; qty: number }[]) =>
    req<SalesOrder>(`/sales-orders/${id}/deliver`, { method: 'POST', body: JSON.stringify({ lines }) }),
  invoiceSalesOrder: (id: number) => req<SalesOrder>(`/sales-orders/${id}/invoice`, { method: 'POST' }),
  paySalesOrder: (id: number, amount: number, method: 'CASH' | 'BANK') =>
    req<SalesOrder>(`/sales-orders/${id}/payments`, { method: 'POST', body: JSON.stringify({ amount, method }) }),
  deleteSalesOrder: (id: number) => req<{ ok: boolean }>(`/sales-orders/${id}`, { method: 'DELETE' }),
  salesOrderMessages: (id: number) => req<ChatterMsg[]>(`/sales-orders/${id}/messages`),
  postSalesOrderMessage: (id: number, body: string) =>
    req<ChatterMsg>(`/sales-orders/${id}/messages`, { method: 'POST', body: JSON.stringify({ body }) }),

  // ---- Accounting ----
  acctStatus: () => req<AccountingStatus>('/accounting/status'),
  openBooks: (openingCash: number, openingBank: number) =>
    req<{ ok: boolean; entryNumber: string; inventory: number; equity: number }>('/accounting/open-books', {
      method: 'POST',
      body: JSON.stringify({ openingCash, openingBank }),
    }),
  accounts: (withBalances = false) =>
    req<LedgerAccount[]>(`/accounting/accounts${withBalances ? '?balances=true' : ''}`),
  createAccount: (data: AccountInput) => req<LedgerAccount>('/accounting/accounts', { method: 'POST', body: JSON.stringify(data) }),
  updateAccount: (id: number, data: AccountInput) =>
    req<LedgerAccount>(`/accounting/accounts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteAccount: (id: number) => req<{ ok: boolean; softDeleted?: boolean }>(`/accounting/accounts/${id}`, { method: 'DELETE' }),
  journal: (params: { source?: string; journalId?: number; from?: string; to?: string; q?: string; skip?: number; limit?: number } = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== '') qs.set(k, String(v)); });
    return req<{ rows: JournalEntry[]; total: number; skip: number; take: number }>(`/accounting/journal?${qs}`);
  },
  journalEntry: (id: number) => req<JournalEntry>(`/accounting/journal/${id}`),
  createJournalEntry: (data: { date?: string; memo: string; lines: { account: string; debit?: number; credit?: number; memo?: string }[] }) =>
    req<JournalEntry>('/accounting/journal', { method: 'POST', body: JSON.stringify(data) }),
  reverseJournalEntry: (id: number, reason?: string) =>
    req<JournalEntry>(`/accounting/journal/${id}/reverse`, { method: 'POST', body: JSON.stringify({ reason }) }),
  acctReport: (type: string, params: { from?: string; to?: string; accountId?: number } = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => { if (v !== undefined && v !== '') qs.set(k, String(v)); });
    return req<ReportData>(`/accounting/reports/${type}?${qs}`);
  },
  paySupplier: (poId: number, amount: number, method: 'CASH' | 'BANK') =>
    req<PurchaseOrder & { billed: number; outstanding: number }>(`/purchase-orders/${poId}/payments`, {
      method: 'POST',
      body: JSON.stringify({ amount, method }),
    }),
  payLandedCosts: (poId: number, amount: number, method: 'CASH' | 'BANK') =>
    req<PurchaseOrder & { landedBilled: number; landedOutstanding: number }>(`/purchase-orders/${poId}/landed-payments`, {
      method: 'POST',
      body: JSON.stringify({ amount, method }),
    }),

  orders: (status = '', q = '') =>
    req<AdminOrder[]>(`/orders?status=${status}&q=${encodeURIComponent(q)}`),
  order: (id: number) => req<AdminOrder>(`/orders/${id}`),
  updateOrderStatus: (id: number, status: string, note?: string, driverName?: string) =>
    req<AdminOrder>(`/orders/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status, note, driverName }),
    }),
  refundOrder: (id: number, reason?: string) =>
    req<AdminOrder>(`/orders/${id}/refund`, { method: 'POST', body: JSON.stringify({ reason }) }),

  // ---- Human resources ----
  hrOverview: () => req<HrOverview>('/hr/overview'),
  hrConfig: () => req<HrConfig>('/hr/config'),

  employees: (params: {
    q?: string; filters?: string[]; groupBy?: string; departmentId?: number | number[];
    tagId?: number; order?: string; dir?: string; skip?: number; limit?: number;
  } = {}) => {
    const qs = new URLSearchParams();
    if (params.q) qs.set('q', params.q);
    if (params.filters?.length) qs.set('filters', params.filters.join(','));
    if (params.groupBy) qs.set('groupBy', params.groupBy);
    if (params.tagId) qs.set('tagId', String(params.tagId));
    if (Array.isArray(params.departmentId)) {
      if (params.departmentId.length) qs.set('departmentId', params.departmentId.join(','));
    } else if (params.departmentId) qs.set('departmentId', String(params.departmentId));
    if (params.order) qs.set('order', params.order);
    if (params.dir) qs.set('dir', params.dir);
    if (params.skip) qs.set('skip', String(params.skip));
    if (params.limit) qs.set('limit', String(params.limit));
    return req<{ rows: Employee[]; total: number; skip: number; take: number; groups?: HrGroup[] }>(`/hr/employees?${qs}`);
  },
  employee: (id: number) => req<EmployeeDetail>(`/hr/employees/${id}`),
  departmentCounts: (filters: string[] = []) =>
    req<DepartmentCounts>(`/hr/employees/department-counts?filters=${filters.join(',')}`),
  uploadEmployeePhoto: async (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return req<{ url: string }>('/hr/employees/upload', { method: 'POST', body: fd }, true);
  },
  employeeMessages: (id: number) =>
    req<{ id: number; type: string; body: string; authorName: string | null; authorEmail: string | null; createdAt: string }[]>(
      `/hr/employees/${id}/messages`,
    ),
  postEmployeeMessage: (id: number, body: string) =>
    req<unknown>(`/hr/employees/${id}/messages`, { method: 'POST', body: JSON.stringify({ body }) }),
  employeeTags: () => req<EmployeeTag[]>('/hr/employee-tags'),
  createEmployeeTag: (name: string, color?: string) =>
    req<EmployeeTag>('/hr/employee-tags', { method: 'POST', body: JSON.stringify({ name, color }) }),
  createEmployee: (data: EmployeeInput) => req<Employee>('/hr/employees', { method: 'POST', body: JSON.stringify(data) }),
  updateEmployee: (id: number, data: EmployeeInput) =>
    req<Employee>(`/hr/employees/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  archiveEmployee: (id: number) => req<Employee>(`/hr/employees/${id}/archive`, { method: 'POST' }),
  unarchiveEmployee: (id: number) => req<Employee>(`/hr/employees/${id}/unarchive`, { method: 'POST' }),

  attendance: (params: {
    q?: string; filters?: string[]; employeeId?: number; departmentId?: number;
    from?: string; to?: string; skip?: number; limit?: number;
  } = {}) => {
    const qs = new URLSearchParams();
    if (params.q) qs.set('q', params.q);
    if (params.filters?.length) qs.set('filters', params.filters.join(','));
    if (params.employeeId) qs.set('employeeId', String(params.employeeId));
    if (params.departmentId) qs.set('departmentId', String(params.departmentId));
    if (params.from) qs.set('from', params.from);
    if (params.to) qs.set('to', params.to);
    if (params.skip) qs.set('skip', String(params.skip));
    if (params.limit) qs.set('limit', String(params.limit));
    return req<{ rows: AttendanceRow[]; total: number; skip: number; take: number; totalHours: number }>(`/hr/attendance?${qs}`);
  },
  punch: (data: { badgeId?: string; pin?: string }) =>
    req<PunchResult>('/hr/attendance/punch', { method: 'POST', body: JSON.stringify(data) }),
  checkIn: (employeeId: number) =>
    req<AttendanceRow>('/hr/attendance/check-in', { method: 'POST', body: JSON.stringify({ employeeId }) }),
  checkOut: (employeeId: number) =>
    req<AttendanceRow>('/hr/attendance/check-out', { method: 'POST', body: JSON.stringify({ employeeId }) }),
  createAttendance: (data: { employeeId: number; checkIn: string; checkOut?: string | null; note?: string }) =>
    req<AttendanceRow>('/hr/attendance', { method: 'POST', body: JSON.stringify(data) }),
  updateAttendance: (id: number, data: { checkIn?: string; checkOut?: string | null; note?: string | null }) =>
    req<AttendanceRow>(`/hr/attendance/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteAttendance: (id: number) => req<{ ok: boolean }>(`/hr/attendance/${id}`, { method: 'DELETE' }),

  leaves: (params: {
    q?: string; filters?: string[]; employeeId?: number; leaveTypeId?: number;
    departmentId?: number; year?: number; skip?: number; limit?: number;
  } = {}) => {
    const qs = new URLSearchParams();
    if (params.q) qs.set('q', params.q);
    if (params.filters?.length) qs.set('filters', params.filters.join(','));
    if (params.employeeId) qs.set('employeeId', String(params.employeeId));
    if (params.leaveTypeId) qs.set('leaveTypeId', String(params.leaveTypeId));
    if (params.departmentId) qs.set('departmentId', String(params.departmentId));
    if (params.year) qs.set('year', String(params.year));
    if (params.skip) qs.set('skip', String(params.skip));
    if (params.limit) qs.set('limit', String(params.limit));
    return req<{ rows: LeaveRow[]; total: number; skip: number; take: number; totalDays: number }>(`/hr/leaves?${qs}`);
  },
  proposeLeaveDays: (employeeId: number, from: string, to: string) =>
    req<{ days: number; restDays: number[] }>(`/hr/leaves/propose?employeeId=${employeeId}&from=${from}&to=${to}`),
  createLeave: (data: LeaveInput) => req<LeaveRow>('/hr/leaves', { method: 'POST', body: JSON.stringify(data) }),
  updateLeave: (id: number, data: Partial<LeaveInput>) =>
    req<LeaveRow>(`/hr/leaves/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  leaveAction: (id: number, action: 'submit' | 'approve' | 'refuse' | 'cancel' | 'reset', reason?: string) =>
    req<LeaveRow>(`/hr/leaves/${id}/${action}`, { method: 'POST', body: JSON.stringify({ reason }) }),
  deleteLeave: (id: number) => req<{ ok: boolean }>(`/hr/leaves/${id}`, { method: 'DELETE' }),

  allocations: (params: { year?: number; employeeId?: number; leaveTypeId?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.year) qs.set('year', String(params.year));
    if (params.employeeId) qs.set('employeeId', String(params.employeeId));
    if (params.leaveTypeId) qs.set('leaveTypeId', String(params.leaveTypeId));
    return req<Allocation[]>(`/hr/allocations?${qs}`);
  },
  saveAllocation: (data: { employeeId: number; leaveTypeId: number; year: number; days: number; note?: string }) =>
    req<Allocation>('/hr/allocations', { method: 'POST', body: JSON.stringify(data) }),
  deleteAllocation: (id: number) => req<{ ok: boolean }>(`/hr/allocations/${id}`, { method: 'DELETE' }),

  balances: (employeeId: number, year?: number) =>
    req<{ year: number; balances: LeaveBalance[] }>(`/hr/balances?employeeId=${employeeId}${year ? `&year=${year}` : ''}`),

  departments: () => req<HrDepartment[]>('/hr/departments'),
  createDepartment: (data: { name: string; nameAr?: string | null }) =>
    req<HrDepartment>('/hr/departments', { method: 'POST', body: JSON.stringify(data) }),
  jobPositions: () => req<HrJobPosition[]>('/hr/job-positions'),
  createJobPosition: (data: { name: string; nameAr?: string | null; departmentId?: number | null }) =>
    req<HrJobPosition>('/hr/job-positions', { method: 'POST', body: JSON.stringify(data) }),
  schedules: () => req<HrSchedule[]>('/hr/schedules'),
  createSchedule: (data: { name: string; startTime?: string; endTime?: string; hoursPerDay?: number; restDays?: string }) =>
    req<HrSchedule>('/hr/schedules', { method: 'POST', body: JSON.stringify(data) }),
  leaveTypes: () => req<HrLeaveType[]>('/hr/leave-types'),
};

// ---- Types ----
export interface AdminUser { id: number; name: string; email: string; role: string }

// ---- Human resources ----
export interface HrGroup { key: string; label: string; count: number }

export interface HrDepartment {
  id: number; name: string; nameAr: string | null; parentId: number | null;
  managerId?: number | null; managerName?: string | null; employeeCount?: number;
}
export interface HrJobPosition {
  id: number; name: string; nameAr: string | null;
  departmentId: number | null; departmentName: string | null; expected: number; employeeCount?: number;
}
export interface HrSchedule {
  id: number; name: string; hoursPerDay: number; hoursPerWeek: number;
  startTime: string | null; endTime: string | null; restDays: string; timezone: string;
  overnight?: boolean; employeeCount?: number;
}
export interface HrLeaveType {
  id: number; name: string; nameAr: string | null; code: string | null;
  requiresAllocation: boolean; payPercent: number; maxDaysPerYear: number | null;
  color: string; sequence?: number; requestCount?: number;
}
export interface HrConfig {
  departments: HrDepartment[];
  jobPositions: HrJobPosition[];
  schedules: HrSchedule[];
  leaveTypes: HrLeaveType[];
}

export interface HrOverview {
  today: string; year: number;
  headcount: number; archived: number;
  presentNow: number; onLeaveToday: number; pendingApprovals: number;
  departments: number; todayPunches: number;
  expiringDocuments: { employeeId: number; employeeName: string; document: string; number: string | null; expiresOn: string }[];
  expiringCount: number;
}

/** Computed on the server from the number + expiry, never stored. */
export type DocStatus = 'valid' | 'expiring' | 'expired' | 'undated' | 'missing';

/** Mirrors the reference's employee_status selection. */
export type EmployeeStatus =
  'WORKING' | 'ON_PROBATION' | 'ON_LEAVE' | 'ON_NOTICE' | 'SEVERANCE' | 'TERMINATED';

export type EmployeeType =
  'EMPLOYEE' | 'WORKER' | 'STUDENT' | 'TRAINEE' | 'CONTRACTOR' | 'FREELANCE';

export interface EmployeeTag { id: number; name: string; color: string; count?: number }

export interface DepartmentCounts {
  total: number;
  departments: { id: number; name: string; nameAr: string | null; count: number }[];
  unassigned: number;
}

export interface Employee {
  id: number; ref: string | null; name: string; nameAr: string | null; active: boolean;
  status: EmployeeStatus;
  employeeType: EmployeeType;
  workLocation: string | null;
  tags: EmployeeTag[];
  docs: { civilId: DocStatus; passport: DocStatus; workPermit: DocStatus };
  departmentId: number | null; departmentName: string | null;
  jobPositionId: number | null; jobPositionName: string | null; jobTitle: string | null;
  managerId: number | null; managerName: string | null;
  workEmail: string | null; workPhone: string | null; mobile: string | null; privatePhone: string | null;
  nationality: string | null; birthday: string | null; gender: string | null; marital: string | null;
  civilId: string | null; civilIdExpiry: string | null;
  passportNo: string | null; passportExpiry: string | null;
  workPermitNo: string | null; workPermitExpiry: string | null;
  badgeId: string | null; pin: string | null;
  workScheduleId: number | null; workScheduleName: string | null;
  hireDate: string | null; endDate: string | null; monthlySalary: number;
  emergencyContact: string | null; emergencyPhone: string | null;
  imageUrl: string | null; notes: string | null; createdAt: string;
}

export interface LeaveBalance {
  leaveTypeId: number; leaveTypeName: string; requiresAllocation: boolean;
  allocated: number; taken: number; remaining: number;
}

export interface DocActivity {
  document: string;
  number: string | null;
  expiresOn: string;
  daysUntil: number;
  status: DocStatus;
  summary: string;
}

export interface EmployeeDetail extends Employee {
  year: number;
  balances: LeaveBalance[];
  checkedIn: boolean;
  checkedInSince: string | null;
  attendanceCount: number;
  leaveCount: number;
  hoursThisMonth: number;
  presence: 'present' | 'absent' | 'on_leave';
  onLeaveUntil: string | null;
  onLeaveType: string | null;
  activities: DocActivity[];
  reports: { id: number; name: string; jobTitle: string | null; imageUrl: string | null }[];
  recentAttendance: { id: number; checkIn: string; checkOut: string | null; workedHours: number; source: string; day: string }[];
  recentLeaves: { id: number; leaveTypeName: string; dateFrom: string; dateTo: string; days: number; state: string }[];
}

export type EmployeeInput = Partial<Omit<Employee, 'id' | 'createdAt' | 'active' | 'docs' | 'tags' |
  'departmentName' | 'jobPositionName' | 'managerName' | 'workScheduleName'>> &
  { name?: string; tagIds?: number[] };

export interface AttendanceRow {
  id: number; employeeId: number; employeeName: string | null; departmentName: string | null;
  checkIn: string; checkOut: string | null; day: string;
  workedHours: number; source: string; note: string | null;
}
export interface PunchResult {
  direction: 'in' | 'out';
  employee: { id: number; name: string };
  at: string;
  workedHours: number;
}

export type LeaveState = 'DRAFT' | 'TO_APPROVE' | 'APPROVED' | 'REFUSED' | 'CANCELLED';
export interface LeaveRow {
  id: number; employeeId: number; employeeName: string | null; departmentName: string | null;
  leaveTypeId: number; leaveTypeName: string | null; leaveTypeColor: string; payPercent: number;
  dateFrom: string; dateTo: string; days: number; reason: string | null;
  state: LeaveState; approvedBy: string | null; approvedAt: string | null;
  refusedReason: string | null; createdAt: string;
}
export interface LeaveInput {
  employeeId: number; leaveTypeId: number; dateFrom: string; dateTo: string;
  days?: number; reason?: string | null; draft?: boolean;
}
export interface Allocation {
  id: number; employeeId: number; employeeName: string; departmentName?: string | null;
  leaveTypeId: number; leaveTypeName: string; year: number; days: number; note: string | null;
}

export interface ReportData {
  title: string;
  columns: { key: string; label: string; money?: boolean }[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  rows: Record<string, any>[];
  summary: { label: string; value: string | number; money?: boolean }[];
}

export interface AuditEntry {
  id: number;
  actorEmail: string | null;
  action: string;
  entity: string | null;
  entityId: string | null;
  status: number | null;
  ip: string | null;
  metadata: string | null;
  createdAt: string;
}

export interface Coupon {
  id: number;
  code: string;
  type: 'PERCENT' | 'FIXED';
  value: number;
  minSubtotal: number;
  maxUses: number | null;
  usedCount: number;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
}
export interface CouponInput {
  code: string;
  type: 'PERCENT' | 'FIXED';
  value: number;
  minSubtotal: number;
  maxUses?: number | null;
  expiresAt?: string | null;
  isActive?: boolean;
}
export interface TeamMember { id: number; name: string; email: string; role: string; isActive: boolean; createdAt: string }

export interface AdminBanner {
  id: number;
  title: string;
  titleAr: string | null;
  subtitle: string | null;
  subtitleAr: string | null;
  ctaLabel: string | null;
  ctaLabelAr: string | null;
  ctaHref: string;
  imageUrl: string | null;
  align: 'left' | 'center' | 'right';
  overlay: number;
  sortOrder: number;
  isActive: boolean;
}
export interface BannerInput {
  title: string;
  titleAr?: string | null;
  subtitle?: string | null;
  subtitleAr?: string | null;
  ctaLabel?: string | null;
  ctaLabelAr?: string | null;
  ctaHref?: string;
  imageUrl?: string | null;
  align: 'left' | 'center' | 'right';
  overlay: number;
  sortOrder?: number;
  isActive: boolean;
}

export interface AdminProduct {
  id: number;
  name: string;
  nameAr: string | null;
  slug: string;
  sku: string;
  barcode: string | null;
  description: string | null;
  descriptionAr: string | null;
  specs: { key: string; value: string }[];
  categoryId: number | null;
  category: { id: number; name: string } | null;
  unit: string;
  costPrice: number;
  /** Weighted-average landed cost, maintained by goods receipts. Read-only. */
  avgCost: number;
  sellingPrice: number;
  compareAtPrice: number | null;
  margin: number;
  stockQty: number;
  lowStockAlert: number;
  isActive: boolean;
  isFeatured: boolean;
  isBestSeller: boolean;
  soldCount: number;
  images: { id?: number; url: string; alt?: string }[];
  image: string | null;
}

export interface ProductInput {
  name: string;
  nameAr?: string | null;
  sku?: string;
  barcode?: string | null;
  description?: string | null;
  descriptionAr?: string | null;
  specs?: { key: string; value: string }[];
  categoryId?: number | null;
  unit?: string;
  costPrice: number;
  sellingPrice: number;
  compareAtPrice?: number | null;
  stockQty: number;
  lowStockAlert: number;
  isActive: boolean;
  isFeatured: boolean;
  isBestSeller: boolean;
  images?: string[];
}

// ---- Purchasing & stock ----
export type PaymentTerms = 'CASH' | 'NET7' | 'NET15' | 'NET30';
export type PoStatus = 'DRAFT' | 'ORDERED' | 'PARTIAL' | 'RECEIVED' | 'CANCELLED';
export type MovementType = 'PURCHASE' | 'SALE' | 'RETURN' | 'REFUND_RESTOCK' | 'ADJUSTMENT' | 'INITIAL';

export interface Supplier {
  id: number;
  name: string;
  nameAr: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  paymentTerms: PaymentTerms;
  isInternational: boolean;
  currency: string;
  notes: string | null;
  isActive: boolean;
  createdAt: string;
  poCount?: number;
}
export interface SupplierDetail extends Supplier {
  totalSpend: number;
  purchaseOrders: { id: number; poNumber: string; status: PoStatus; total: number; createdAt: string; receivedAt: string | null }[];
}
export interface SupplierInput {
  name: string;
  nameAr?: string | null;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  paymentTerms: PaymentTerms;
  isInternational: boolean;
  currency: string;
  notes?: string | null;
  isActive: boolean;
}

export interface PurchaseOrderItem {
  id: number;
  productId: number;
  name: string;
  sku: string;
  unitCost: number;
  quantity: number;
  receivedQty: number;
  lineTotal: number;
}
export interface PurchaseOrder {
  id: number;
  poNumber: string;
  supplierId: number;
  supplier: { id: number; name: string } | null;
  status: PoStatus;
  reference: string | null;
  notes: string | null;
  subtotal: number;
  currency: string;
  exchangeRate: number;
  subtotalKwd: number;
  shipping: number;
  customsDuty: number;
  clearanceFee: number;
  insurance: number;
  otherCost: number;
  landedTotal: number;
  landedPaid: number;
  total: number;
  amountPaid: number;
  expectedAt: string | null;
  orderedAt: string | null;
  receivedAt: string | null;
  createdByEmail: string | null;
  createdAt: string;
  items: PurchaseOrderItem[];
}
export interface PurchaseOrderInput {
  supplierId: number;
  status: 'DRAFT' | 'ORDERED';
  reference?: string | null;
  notes?: string | null;
  currency: string;
  exchangeRate: number;
  shipping: number;
  customsDuty: number;
  clearanceFee: number;
  insurance: number;
  otherCost: number;
  expectedAt?: string | null;
  items: { productId: number; quantity: number; unitCost: number }[];
}

export interface StockMovement {
  id: number;
  productId: number;
  product: { id: number; name: string; sku: string } | null;
  qty: number;
  type: MovementType;
  unitCost: number;
  value: number;
  balanceAfter: number;
  avgCostAfter: number;
  refType: string | null;
  refId: number | null;
  refLabel: string | null;
  reason: string | null;
  actorEmail: string | null;
  createdAt: string;
}

// ---- Manufacturing ----
export interface BomLine {
  id?: number;
  componentId: number;
  name: string;
  sku: string;
  quantity: number;
  unitCost: number;
  lineCost: number;
}
export interface Bom {
  id: number;
  reference: string;
  productId: number;
  productName: string | null;
  productSku: string | null;
  quantity: number;
  name: string | null;
  isActive: boolean;
  lines: BomLine[];
  totalCost: number;
  unitCost: number;
  createdAt: string;
}
export interface BomInput {
  productId: number;
  quantity: number;
  name?: string | null;
  isActive: boolean;
  lines: { componentId: number; quantity: number }[];
}
export interface ExplodedComponent {
  productId: number;
  name: string;
  sku: string;
  quantityRequired: number;
  unitCost: number;
  available: number;
}
export type MoState = 'DRAFT' | 'CONFIRMED' | 'DONE' | 'CANCELLED';
export interface MoComponent {
  id: number;
  productId: number;
  name: string;
  sku: string;
  quantityRequired: number;
  quantityConsumed: number;
  unitCost: number;
  available?: number;
}
export interface Mo {
  id: number;
  reference: string;
  productId: number;
  productName: string | null;
  productSku: string | null;
  bomId: number | null;
  bomReference: string | null;
  warehouseId: number | null;
  warehouseName: string | null;
  quantity: number;
  producedQty: number;
  state: MoState;
  unitCost: number;
  totalCost: number;
  scheduledAt: string | null;
  doneAt: string | null;
  note: string | null;
  createdByEmail: string | null;
  createdAt: string;
  components: MoComponent[];
}
export interface MoInput {
  productId: number;
  bomId?: number | null;
  warehouseId?: number | null;
  quantity: number;
  scheduledAt?: string | null;
  note?: string | null;
  components?: { productId: number; quantityRequired: number }[];
}

// ---- Warehouses & transfers ----
export type WarehouseType = 'CENTRAL' | 'SHOP';
export type TransferState = 'DRAFT' | 'SENT' | 'DONE' | 'CANCELLED';

export interface Warehouse {
  id: number;
  code: string;
  name: string;
  nameAr: string | null;
  type: WarehouseType;
  isDefault: boolean;
  area: string | null;
  address: string | null;
  phone: string | null;
  isActive: boolean;
  skuCount: number;
  units?: number;
  stockValue?: number;
}
export interface WarehouseDetail extends Warehouse {
  stock: { productId: number; name: string; sku: string; quantity: number; unitCost: number; value: number; low: boolean }[];
}
export interface WarehouseInput {
  code: string;
  name: string;
  nameAr?: string | null;
  type: WarehouseType;
  isDefault: boolean;
  area?: string | null;
  address?: string | null;
  phone?: string | null;
  isActive: boolean;
}

export interface TransferLine {
  id: number;
  productId: number;
  name: string;
  sku: string;
  quantity: number;
  receivedQty: number;
}
export interface StockTransfer {
  id: number;
  reference: string;
  fromWarehouseId: number;
  fromWarehouse: { id: number; code: string; name: string } | null;
  toWarehouseId: number;
  toWarehouse: { id: number; code: string; name: string } | null;
  state: TransferState;
  note: string | null;
  createdByEmail: string | null;
  sentAt: string | null;
  receivedAt: string | null;
  createdAt: string;
  lines: TransferLine[];
}
export interface TransferInput {
  fromWarehouseId: number;
  toWarehouseId: number;
  note?: string | null;
  lines: { productId: number; quantity: number }[];
}

// ---- Contacts ----
export interface PartnerTag { id: number; name: string; color: string }
export interface ChatterMsg {
  id: number; type: string; body: string;
  authorName: string | null; authorEmail: string | null; createdAt: string;
}
export interface Partner {
  id: number;
  name: string;
  nameAr: string | null;
  ref: string | null;
  isCompany: boolean;
  parentId: number | null;
  parentName: string | null;
  customerRank: number;
  supplierRank: number;
  jobTitle: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  website: string | null;
  vat: string | null;
  street: string | null;
  street2: string | null;
  area: string | null;
  block: string | null;
  building: string | null;
  floor: string | null;
  city: string | null;
  country: string | null;
  zip: string | null;
  imageUrl: string | null;
  comment: string | null;
  paymentTerms: string | null;
  creditLimit: number;
  active: boolean;
  tags: PartnerTag[];
  childCount: number;
  createdAt: string;
}
export interface PartnerDetail extends Partner {
  children: { id: number; name: string; jobTitle: string | null; email: string | null; phone: string | null }[];
  stats: { orderCount: number; poCount: number; customerId: number | null; supplierId: number | null };
}
export interface PartnerInput {
  name: string;
  nameAr?: string | null;
  ref?: string | null;
  isCompany: boolean;
  parentId?: number | null;
  customerRank: number;
  supplierRank: number;
  jobTitle?: string | null;
  email?: string | null;
  phone?: string | null;
  mobile?: string | null;
  website?: string | null;
  vat?: string | null;
  street?: string | null;
  street2?: string | null;
  area?: string | null;
  block?: string | null;
  building?: string | null;
  floor?: string | null;
  city?: string | null;
  country?: string | null;
  zip?: string | null;
  imageUrl?: string | null;
  comment?: string | null;
  paymentTerms?: string | null;
  creditLimit: number;
  active: boolean;
  tagIds?: number[];
}

// ---- Sales ----
export type SoState = 'DRAFT' | 'SENT' | 'SALE' | 'DONE' | 'CANCELLED';

export interface SalesOrderLine {
  id: number;
  productId: number;
  name: string;
  sku: string;
  quantity: number;
  deliveredQty: number;
  unitPrice: number;
  discount: number;
  lineTotal: number;
}
export interface SalesOrder {
  id: number;
  name: string;
  partnerId: number;
  partnerName: string | null;
  state: SoState;
  dateOrder: string;
  validityDate: string | null;
  confirmedAt: string | null;
  customerRef: string | null;
  paymentTerms: string;
  salespersonEmail: string | null;
  note: string | null;
  amountUntaxed: number;
  amountTax: number;
  amountTotal: number;
  amountInvoiced: number;
  amountPaid: number;
  amountDue: number;
  invoiceStatus: 'NO' | 'TO_INVOICE' | 'INVOICED';
  deliveryStatus: 'PENDING' | 'PARTIAL' | 'DONE';
  lines: SalesOrderLine[];
}
export interface SalesOrderInput {
  partnerId: number;
  customerRef?: string | null;
  paymentTerms: string;
  validityDate?: string | null;
  note?: string | null;
  lines: { productId: number; quantity: number; unitPrice?: number; discount?: number }[];
}

// ---- Accounting ----
export type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';

export interface AccountingStatus {
  accounts: number;
  entries: number;
  isLive: boolean;
  openedAt: string | null;
}
export interface LedgerAccount {
  id: number;
  code: string;
  name: string;
  nameAr: string | null;
  type: AccountType;
  isContra: boolean;
  isSystem: boolean;
  isActive: boolean;
  debit?: number;
  credit?: number;
  balance?: number;
}
export interface AccountInput {
  code: string;
  name: string;
  nameAr?: string | null;
  type: AccountType;
  isContra: boolean;
  isActive: boolean;
}
export interface JournalLine {
  id: number;
  accountId: number;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  memo: string | null;
}
export interface JournalEntry {
  id: number;
  entryNumber: string;
  date: string;
  memo: string | null;
  source: string;
  refType: string | null;
  refId: number | null;
  refLabel: string | null;
  status: 'POSTED' | 'REVERSED';
  createdByEmail: string | null;
  debit: number;
  credit: number;
  lines: JournalLine[];
}

// ---- Point of sale ----
export type Tender = 'CASH' | 'KNET' | 'CARD';

export interface TillProduct {
  id: number;
  name: string;
  nameAr: string | null;
  sku: string;
  barcode: string | null;
  sellingPrice: number;
  stockQty: number;
  unit: string;
  image: string | null;
  exactMatch: boolean;
}

// ---- Accounting: journals & partner reports ----
export type JournalType = 'SALE' | 'PURCHASE' | 'CASH' | 'BANK' | 'GENERAL';

export interface AccountingJournal {
  id: number;
  code: string;
  name: string;
  nameAr: string | null;
  type: JournalType;
  sequence: number;
  isSystem: boolean;
  defaultAccountId: number | null;
  defaultAccountCode: string | null;
  defaultAccountName: string | null;
  posRegisterId: number | null;
  posRegisterName: string | null;
  entryCount: number;
  lastEntryAt: string | null;
  /** Only set for CASH and BANK journals — the books that hold money. */
  balance: number | null;
}

export interface JournalInput {
  code: string;
  name: string;
  nameAr?: string | null;
  type: JournalType;
  defaultAccountId?: number | null;
  posRegisterId?: number | null;
  sequence?: number;
}

export interface PartnerLedgerReport {
  title: string;
  from: string;
  to: string;
  partners: {
    partnerId: number;
    partnerName: string;
    debit: number;
    credit: number;
    balance: number;
    rows: Record<string, string | number>[];
  }[];
  summary: { label: string; value: number | string; money?: boolean }[];
}

export interface AgedReport {
  title: string;
  asOf: string;
  buckets: string[];
  rows: Record<string, string | number>[];
  totals: Record<string, number>;
}

/** A till on the POS dashboard. */
export interface PosRegister {
  id: number;
  name: string;
  branch: string | null;
  warehouseId: number | null;
  warehouseName: string | null;
  cashControl: boolean;
  status: 'OPEN' | 'CLOSED';
  openSessionId: number | null;
  openSessionNumber: string | null;
  openedAt: string | null;
  cashierId: number | null;
  cashierName: string | null;
  cashierImageUrl: string | null;
  lastClosedAt: string | null;
  lastClosingCash: number | null;
}

export interface PosRegisterInput {
  name: string;
  branch?: string | null;
  warehouseId?: number | null;
  cashControl?: boolean;
  sequence?: number;
}

/** An employee who can sign in at a till. The PIN never leaves the server. */
export interface PosCashier {
  id: number;
  name: string;
  ref: string | null;
  jobTitle: string | null;
  imageUrl: string | null;
  departmentName: string | null;
}

export interface PosCurrentSession {
  id: number;
  sessionNumber: string;
  registerId: number | null;
  registerName: string;
  cashierId: number | null;
  cashierName: string | null;
  cashierImageUrl: string | null;
  openingNote: string | null;
  /** The shop this till sells from; stock leaves this warehouse. */
  warehouseId: number | null;
  warehouseName: string | null;
  status: 'OPEN';
  openedAt: string;
  openedByEmail: string | null;
  openingFloat: number;
  expectedCash: number;
}

export interface PosSessionRow {
  id: number;
  sessionNumber: string;
  registerName: string;
  status: 'OPEN' | 'CLOSED';
  openedAt: string;
  closedAt: string | null;
  openedByEmail: string | null;
  openingFloat: number;
  closingCounted: number | null;
  variance: number | null;
  orderCount: number;
}

export interface PosSessionReport extends PosSessionRow {
  closedByEmail: string | null;
  expectedCash: number;
  refundCount: number;
  gross: number;
  discounts: number;
  net: number;
  cogs: number;
  grossProfit: number;
  byTender: { method: Tender; amount: number; count: number }[];
  cashMoves: { id: number; type: 'IN' | 'OUT'; amount: number; reason: string; actorEmail: string | null; createdAt: string }[];
  orders: { id: number; orderNumber: string; contactName: string; total: number; payMethod: string; payStatus: string; placedAt: string; itemCount: number }[];
}

export interface PosOrder {
  id: number;
  orderNumber: string;
  channel: string;
  contactName: string;
  customer: { id: number; name: string; phone: string | null } | null;
  status: string;
  payStatus: string;
  payMethod: string;
  subtotal: number;
  discount: number;
  total: number;
  placedAt: string;
  items: { id: number; productId: number; name: string; sku: string; unitPrice: number; quantity: number; lineTotal: number }[];
  tenders: { id: number; method: Tender; amount: number; reference: string | null }[];
}

export interface PosSaleInput {
  lines: { productId: number; quantity: number; unitPrice?: number }[];
  tenders: { method: Tender; amount: number; reference?: string }[];
  customerId?: number;
  customerName?: string;
  discount?: number;
  note?: string;
}

export interface AdminOrderItem {
  id: number; name: string; sku: string; imageUrl: string | null;
  unitPrice: number; quantity: number; lineTotal: number;
}
export interface AdminOrder {
  id: number; orderNumber: string; trackingNumber: string;
  contactName: string; contactEmail: string; contactPhone: string;
  shipArea: string; shipBlock: string | null; shipStreet: string | null; shipBuilding: string | null; shipNotes: string | null;
  status: string; payStatus: string; payMethod: string; deliveryMethod: string;
  subtotal: number; discount: number; shipping: number; tax: number; total: number; couponCode: string | null;
  driverName: string | null; placedAt: string;
  items: AdminOrderItem[];
  events?: { id: number; status: string; note: string | null; createdAt: string }[];
}

export interface Dashboard {
  cards: {
    revenue: number; orders: number; customers: number; products: number;
    inventoryValue: number; retailValue: number; potentialProfit: number;
  };
  statusCounts: Record<string, number>;
  salesByDay: { date: string; sales: number; orders: number }[];
  lowStock: { id: number; name: string; sku: string; stockQty: number; lowStockAlert: number }[];
  topProducts: { id: number; name: string; soldCount: number; price: number }[];
  recentOrders: AdminOrder[];
}
