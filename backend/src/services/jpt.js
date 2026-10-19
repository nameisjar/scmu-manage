const { Prisma } = require('@prisma/client');
const { randomUUID } = require('crypto');
const prisma = require('../prisma');

const { INTERNAL_ROLES, internalCompany } = require('./access');
const STAFF = INTERNAL_ROLES;
const OPERATORS = INTERNAL_ROLES;
const FINANCE = INTERNAL_ROLES;
const CURRENCIES = ['IDR', 'USD', 'EUR', 'SGD', 'INR'];
const FINAL_SHIPMENTS = ['DELIVERED', 'POD_UPLOADED', 'COMPLETED'];
const DOCUMENT_TYPES = ['SURAT_JALAN', 'PACKING_LIST', 'BILL_OF_LADING', 'AIR_WAYBILL', 'POD', 'CUSTOMS', 'CLAIM', 'OTHER'];
const fail = (condition, message, status = 422) => { if (!condition) throw Object.assign(new Error(message), { status }); };
const route = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
const number = prefix => `${prefix}-${new Date().getFullYear()}-${randomUUID().slice(0, 8).toUpperCase()}`;

function text(value, name = 'Text', max = 500, optional = false) {
  if (optional && (value == null || value === '')) return null;
  fail(typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max, `${name} is required or too long`);
  return value.trim();
}
function decimal(value, name = 'Amount', scale = 2, positive = false) {
  fail((typeof value === 'number' || typeof value === 'string') && String(value).trim() !== '', `${name} must be a valid number`);
  let result;
  try { result = new Prisma.Decimal(value); } catch { fail(false, `${name} must be a valid number`); }
  fail(result.isFinite() && result.gte(positive ? 0.0001 : 0) && result.lte('999999999999') && result.decimalPlaces() <= scale, `${name} is outside the allowed range`);
  return result;
}
function integer(value, name, min = 1, max = 1000000) {
  const result = Number(value);
  fail(Number.isInteger(result) && result >= min && result <= max, `${name} is outside the allowed range`);
  return result;
}
function date(value, optional = false) {
  if (optional && !value) return null;
  const result = new Date(value);
  fail(value && Number.isFinite(result.getTime()), 'A valid date is required');
  return result;
}
function choice(value, values, name = 'Status') {
  fail(values.includes(value), `${name} is invalid`);
  return value;
}
const money = value => new Prisma.Decimal(value || 0);
const sum = (rows, select) => rows.reduce((total, item) => total.plus(select(item) || 0), money(0));

async function transaction(work) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await prisma.$transaction(work, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 20000 }); }
    catch (error) { if (error.code !== 'P2034' || attempt === 2) throw error; }
  }
}
function audit(tx, user, action, entity, entityId, metadata = {}) {
  return tx.activityLog.create({ data: { userId: user.id, action, entity, entityId, metadata: JSON.parse(JSON.stringify(metadata)) } });
}
async function customer(tx, id) { return internalCompany(tx, id); }
async function vendor(tx, id) {
  if (!id) return null;
  const company = await tx.company.findUnique({ where: { id } });
  fail(company && company.isActive && !company.isInternal && ['TRANSPORTER', 'BROKER', 'BOTH'].includes(company.type), 'Select an active vendor');
  return company.id;
}
async function mutableJob(tx, id) {
  const job = await tx.jobOrder.findUnique({ where: { id } });
  fail(job, 'Job order not found', 404);
  fail(!['CLOSED', 'CANCELLED'].includes(job.status), 'This job is already closed or cancelled', 409);
  return job;
}

function cargo(body) {
  const plannedPickup = date(body.plannedPickup, true);
  const expectedDelivery = date(body.expectedDelivery, true);
  fail(!plannedPickup || !expectedDelivery || expectedDelivery >= plannedPickup, 'Delivery must be after pickup');
  return {
    title: text(body.title, 'Title', 200), originCity: text(body.originCity, 'Origin', 100),
    destCity: text(body.destCity, 'Destination', 100), cargoDescription: text(body.cargoDescription, 'Cargo description', 2000),
    serviceType: choice(body.serviceType || 'DOMESTIC', ['DOMESTIC', 'EXPORT', 'IMPORT']),
    currency: choice(body.currency || 'IDR', CURRENCIES, 'Currency'), packages: integer(body.packages ?? 1, 'Packages'),
    weightKg: decimal(body.weightKg ?? 0, 'Weight', 3), volumeCbm: decimal(body.volumeCbm ?? 0, 'Volume', 4),
    plannedPickup, expectedDelivery,
  };
}
function quotationItems(items) {
  fail(Array.isArray(items) && items.length > 0 && items.length <= 50, 'Add between 1 and 50 quotation items');
  const result = items.map(item => ({ description: text(item.description, 'Description', 300),
    quantity: decimal(item.quantity, 'Quantity', 4, true), unit: text(item.unit || 'JOB', 'Unit', 30),
    sellRate: decimal(item.sellRate, 'Sell rate'), buyRate: decimal(item.buyRate ?? 0, 'Buy rate') }));
  fail(result.every(item => item.quantity.lte(1000000)), 'Quotation quantity exceeds limit');
  fail(sum(result, item => item.quantity.mul(item.sellRate)).lte('999999999999') && sum(result, item => item.quantity.mul(item.buyRate)).lte('999999999999'), 'Quotation total exceeds limit');
  return result;
}
function quotationTotals(quotation) {
  const revenue = sum(quotation.items, item => item.quantity.mul(item.sellRate).toDecimalPlaces(2));
  const cost = sum(quotation.items, item => item.quantity.mul(item.buyRate).toDecimalPlaces(2));
  return { revenue: revenue.toFixed(2), estimatedCost: cost.toFixed(2), estimatedProfit: revenue.minus(cost).toFixed(2), marginPercent: revenue.gt(0) ? revenue.minus(cost).div(revenue).mul(100).toFixed(2) : '0.00' };
}

const jobInclude = {
  customer: true, quotation: { include: { items: true } },
  shipments: { orderBy: { sequence: 'asc' }, include: { carrier: { select: { id: true, name: true } }, vehicle: true, driver: true, trackingEvents: { orderBy: { recordedAt: 'desc' } }, pods: true } },
  charges: { orderBy: { createdAt: 'asc' }, include: { vendor: { select: { id: true, name: true } }, invoiceItem: true, payments: true } },
  documents: { orderBy: { createdAt: 'asc' }, include: { packingList: { select: { id: true, direction: true, status: true, recordNumber: true } } } }, invoices: { include: { items: true, payments: true }, orderBy: { createdAt: 'desc' } },
  packingLists: { select: { id: true, status: true, direction: true, recordNumber: true } },
  packingHeader: { select: { id: true, status: true, headerNumber: true } },
  payments: { orderBy: { paidAt: 'desc' } }, operations: { orderBy: { eventDate: 'desc' } },
};
function invoiceBalance(invoice) {
  if (invoice.status === 'PAID' && !invoice.jobId && !invoice.payments?.length) return money(0);
  return money(invoice.totalAmount).minus(sum(invoice.payments || [], payment => payment.amount));
}
function financials(job) {
  const charges = job.charges || [];
  const active = charges.filter(charge => charge.status !== 'REJECTED');
  const revenue = sum(active.filter(charge => charge.kind === 'REVENUE' && charge.status === 'APPROVED'), charge => charge.actualAmount ?? charge.estimatedAmount);
  const estimatedCost = sum(active.filter(charge => charge.kind === 'COST'), charge => charge.estimatedAmount);
  const approvedCost = sum(active.filter(charge => charge.kind === 'COST' && charge.status === 'APPROVED'), charge => charge.actualAmount);
  const invoices = (job.invoices || []).filter(invoice => !['CANCELLED','PENDING','SUBMITTED','UNDER_REVIEW'].includes(invoice.status));
  const draftInvoiceIds = new Set((job.invoices || []).filter(invoice => ['PENDING','SUBMITTED','UNDER_REVIEW'].includes(invoice.status)).map(invoice => invoice.id));
  const billed = sum(invoices, invoice => invoice.freightAmount);
  const receivable = sum(invoices, invoice => invoiceBalance(invoice));
  const approved = active.filter(charge => charge.kind === 'COST' && charge.status === 'APPROVED');
  const internalCost = sum(approved.filter(charge => charge.costSource === 'INTERNAL'), charge => charge.actualAmount);
  const vendorCost = approvedCost.minus(internalCost);
  const paidVendor = sum((job.payments || []).filter(payment => payment.direction === 'PAYABLE'), payment => payment.amount);
  const internalExpensePaid = sum((job.payments || []).filter(payment => payment.direction === 'INTERNAL_EXPENSE'), payment => payment.amount);
  return Object.fromEntries(Object.entries({ revenue, estimatedCost, approvedCost, estimatedProfit: revenue.minus(estimatedCost),
    grossProfit: billed.minus(approvedCost), billed, receivable, payable: vendorCost.minus(paidVendor),
    internalCost, vendorCost, internalExpensePaid, internalOutstanding: internalCost.minus(internalExpensePaid),
    unbilled: sum(active.filter(charge => charge.kind === 'REVENUE' && charge.status === 'APPROVED' && (!charge.invoiceItem || draftInvoiceIds.has(charge.invoiceItem.invoiceId))), charge => charge.actualAmount ?? charge.estimatedAmount),
  }).map(([key, value]) => [key, value.toFixed(2)]));
}
function alerts(job, now = new Date()) {
  if (['CLOSED', 'CANCELLED'].includes(job.status)) return [];
  const list = [];
  for (const shipment of job.shipments || []) {
    if (shipment.expectedDelivery && shipment.expectedDelivery < now && ![...FINAL_SHIPMENTS, 'CANCELLED'].includes(shipment.status)) list.push({ type: 'LATE_SHIPMENT', reference: shipment.shipmentNumber });
    if (shipment.freeUntil && shipment.freeUntil < now && !shipment.emptyReturnedAt) list.push({ type: 'CONTAINER_OVERDUE', reference: shipment.containerNumber || shipment.shipmentNumber });
  }
  for (const document of job.documents || []) {
    if (document.required && document.status !== 'VERIFIED') list.push({ type: 'DOCUMENT_REQUIRED', reference: document.title });
    if (document.expiresAt && document.expiresAt < now) list.push({ type: 'DOCUMENT_EXPIRED', reference: document.title });
  }
  for (const invoice of job.invoices || []) if (invoice.status !== 'CANCELLED' && invoice.dueDate && invoice.dueDate < now && invoiceBalance(invoice).gt(0)) list.push({ type: 'INVOICE_OVERDUE', reference: invoice.invoiceNumber });
  if ((job.charges || []).some(charge => charge.status === 'PROPOSED')) list.push({ type: 'APPROVAL_REQUIRED', reference: job.jobNumber });
  return list;
}
function presentJob(job) {
  return { ...job, financials: financials(job), alerts: alerts(job), invoices: job.invoices.map(invoice => ({ ...invoice, balance: invoiceBalance(invoice).toFixed(2) })) };
}
async function syncJob(tx, jobId) {
  if (!jobId) return;
  const job = await tx.jobOrder.findUnique({ where: { id: jobId }, include: { shipments: true, packingLists: true, packingHeader: true } });
  if (!job || ['CLOSED', 'CANCELLED'].includes(job.status)) return;
  const active = job.shipments.filter(shipment => shipment.status !== 'CANCELLED');
  const receiptDone = job.packingHeader?.status === 'FINAL' && job.packingLists.filter(record => record.direction === 'INBOUND').every(record => record.status === 'FINAL');
  const status = job.jobType === 'RECEIVER' ? (receiptDone && active.every(shipment => FINAL_SHIPMENTS.includes(shipment.status)) ? 'DELIVERED' : job.packingLists.length || active.length ? 'IN_PROGRESS' : 'BOOKED')
    : active.length && active.every(shipment => FINAL_SHIPMENTS.includes(shipment.status)) ? 'DELIVERED'
    : active.some(shipment => shipment.status !== 'PENDING' && shipment.status !== 'ASSIGNED') ? 'IN_PROGRESS' : 'BOOKED';
  if (job.status !== status) await tx.jobOrder.update({ where: { id: jobId }, data: { status } });
}
function checkJobClosure(job) {
  if (job.jobType === 'RECEIVER') {
    fail(job.packingHeader?.status === 'FINAL', 'Finalize the receiving packing header before closing', 409);
    fail(!['CLOSED', 'CANCELLED'].includes(job.status), 'This job is already closed or cancelled', 409);
    fail((job.shipments || []).filter(shipment => shipment.status !== 'CANCELLED').every(shipment => FINAL_SHIPMENTS.includes(shipment.status)), 'Complete all transport legs before closing this job', 409);
  } else fail(job.status === 'DELIVERED', 'Complete all transport legs before closing this job', 409);
  fail((job.packingLists || []).every(record => record.status === 'FINAL'), 'Finalize packing records before closing', 409);
  fail(job.documents.filter(document => document.required).every(document => document.status === 'VERIFIED'), 'Verify all required documents before closing', 409);
  fail(job.documents.filter(document => document.required).every(document => !document.expiresAt || document.expiresAt >= new Date()), 'Renew expired required documents before closing', 409);
  fail(job.charges.every(charge => charge.status !== 'PROPOSED'), 'Review pending charges before closing', 409);
  fail(job.shipments.every(shipment => !shipment.containerNumber || shipment.emptyReturnedAt), 'Return empty containers before closing', 409);
  const totals = financials(job);
  fail(money(totals.unbilled).eq(0) && money(totals.receivable).eq(0) && money(totals.payable).eq(0), 'Settle invoices and vendor costs before closing', 409);
  fail(money(totals.internalOutstanding).eq(0), 'Settle internal operating costs before closing', 409);
  const stock = (job.operations || []).filter(operation => operation.kind === 'WAREHOUSE').reduce((total, operation) => total + (operation.status === 'IN' ? operation.quantity : -operation.quantity), 0);
  fail(stock === 0, 'Release warehouse cargo before closing', 409);
  fail(!job.operations.some(operation => operation.kind === 'CLAIM' && !['SETTLED', 'REJECTED'].includes(operation.status)), 'Resolve open claims before closing', 409);
  fail(!job.invoices.some(invoice => ['PENDING','SUBMITTED','UNDER_REVIEW'].includes(invoice.status)), 'Approve draft invoices before closing', 409);
}
async function closeJob(tx, job) {
  checkJobClosure(job);
  return tx.jobOrder.update({ where: { id: job.id }, data: { status: 'CLOSED' } });
}

module.exports = { STAFF, OPERATORS, FINANCE, CURRENCIES, FINAL_SHIPMENTS, DOCUMENT_TYPES, fail, route, number, text, decimal, integer, date, choice, money, sum, transaction, audit, customer, vendor, mutableJob, cargo, quotationItems, quotationTotals, jobInclude, invoiceBalance, financials, alerts, presentJob, syncJob, checkJobClosure, closeJob };
