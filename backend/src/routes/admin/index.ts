import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { auditAdmin } from '../../middleware/audit';
import { adminAuth } from './auth';
import { adminProducts } from './products';
import { adminOrders } from './orders';
import { adminDashboard } from './dashboard';
import { adminTeam } from './team';
import { adminCoupons } from './coupons';
import { adminAudit } from './audit';
import { adminReports } from './reports';
import { adminBanners } from './banners';
import { adminSuppliers } from './suppliers';
import { adminPurchaseOrders } from './purchaseOrders';
import { adminStock } from './stock';
import { adminPos } from './pos';
import { adminAccounting } from './accounting';
import { adminPartners } from './partners';
import { adminSalesOrders } from './salesOrders';
import { adminWarehouses, adminTransfers } from './warehouses';
import { adminBoms, adminMos } from './manufacturing';
import { adminHr } from './hr';

export const admin = Router();

// Public: login / forgot / reset (rate-limited inside adminAuth)
admin.use('/', adminAuth);

// Everything below requires a valid admin token
admin.use(requireAuth('admin'));
admin.use(auditAdmin); // record mutating admin actions
admin.use('/dashboard', adminDashboard);
admin.use('/products', adminProducts);
admin.use('/orders', adminOrders);
admin.use('/team', adminTeam);
admin.use('/coupons', adminCoupons);
admin.use('/audit', adminAudit);
admin.use('/reports', adminReports);
admin.use('/banners', adminBanners);
admin.use('/suppliers', adminSuppliers);
admin.use('/purchase-orders', adminPurchaseOrders);
admin.use('/stock', adminStock);
admin.use('/pos', adminPos);
admin.use('/accounting', adminAccounting);
admin.use('/partners', adminPartners);
admin.use('/sales-orders', adminSalesOrders);
admin.use('/warehouses', adminWarehouses);
admin.use('/transfers', adminTransfers);
admin.use('/boms', adminBoms);
admin.use('/manufacturing-orders', adminMos);
admin.use('/hr', adminHr);
