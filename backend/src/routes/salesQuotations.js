const express = require('express');
const prisma = require('../prisma');
const { authenticate, authorize } = require('../middleware/auth');
const { STAFF, FINANCE, fail, route, number, text, date, choice, cargo, quotationItems, quotationTotals, transaction, audit, customer, money, invoiceBalance } = require('../services/jpt');
const router = express.Router();
router.use(authenticate, authorize(...STAFF));
const include = { customer: { select: { id: true, name: true, email: true, address: true, npwp: true } }, items: true, job: { select: { id: true, jobNumber: true } } };
const present = quotation => ({ ...quotation, canEdit: ['DRAFT','APPROVED'].includes(quotation.status), status: ['DRAFT', 'APPROVED', 'SENT'].includes(quotation.status) && quotation.validUntil < new Date() ? 'EXPIRED' : quotation.status, totals: quotationTotals(quotation) });

async function createJobFromQuotation(tx, quotation, user, jobType = 'SENDER') {
  const existing = await tx.jobOrder.findUnique({ where: { quotationId: quotation.id } });
  if (existing) return existing;
  fail(quotation.status === 'ACCEPTED', 'Accept the customer quotation before creating a job', 409);
  const company = await customer(tx, quotation.customerId);
  const { title, originCity, destCity, serviceType, cargoDescription, packages, weightKg, volumeCbm, currency, plannedPickup, expectedDelivery } = quotation;
  const charges = quotation.items.flatMap(item => {
    const revenue = { kind: 'REVENUE', description: item.description, estimatedAmount: item.quantity.mul(item.sellRate).toDecimalPlaces(2), actualAmount: item.quantity.mul(item.sellRate).toDecimalPlaces(2), status: 'APPROVED', approvedById: user.id, approvedAt: new Date(), createdById: user.id };
    return item.buyRate.gt(0) ? [revenue, { kind: 'COST', description: item.description, estimatedAmount: item.quantity.mul(item.buyRate).toDecimalPlaces(2), status: 'PROPOSED', createdById: user.id }] : [revenue];
  });
  const job = await tx.jobOrder.create({ data: {
    title, originCity, destCity, serviceType, cargoDescription, packages, weightKg, volumeCbm, currency, plannedPickup, expectedDelivery, jobType,
    ...(jobType === 'RECEIVER' ? { recipientName: company.name, deliveryAddress: company.address } : {}),
    jobNumber: number('JOB'), customerId: quotation.customerId, quotationId: quotation.id, createdById: user.id,
    charges: { create: charges }, documents: { create: [
      { title: 'Packing list', type: 'PACKING_LIST', required: true, customerVisible: false },
      ...(jobType === 'SENDER' ? [{ title: 'Proof of delivery', type: 'POD', required: true, customerVisible: false }] : []),
    ] },
  } });
  await audit(tx, user, 'JOB_CREATED_FROM_QUOTATION', 'JobOrder', job.id, { quotationNumber: quotation.quotationNumber });
  return job;
}

router.get('/', route(async (req, res) => {
  const where = { ...(req.query.status && { status: choice(req.query.status, ['DRAFT', 'APPROVED', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED']) }),
    ...(req.query.search && { OR: ['quotationNumber', 'title'].map(field => ({ [field]: { contains: String(req.query.search).slice(0, 200), mode: 'insensitive' } })) }) };
  const data = await prisma.salesQuotation.findMany({ where, include, orderBy: { createdAt: 'desc' }, take: 200 });
  res.json({ data: data.map(present) });
}));
router.post('/', authorize(...FINANCE), route(async (req, res) => {
  const data = cargo(req.body);
  const items = quotationItems(req.body.items);
  const validUntil = date(req.body.validUntil);
  fail(validUntil > new Date(), 'Quotation validity must be in the future');
  const result = await transaction(async tx => {
    const company = await customer(tx, req.body.customerId);
    const quotation = await tx.salesQuotation.create({ data: { ...data, customerId: company.id, quotationNumber: number('SQ'), validUntil,
      terms: text(req.body.terms, 'Terms', 3000, true), createdById: req.user.id, items: { create: items } }, include });
    await audit(tx, req.user, 'QUOTATION_CREATED', 'SalesQuotation', quotation.id);
    return quotation;
  });
  res.status(201).json(present(result));
}));
router.get('/:id', route(async (req, res) => {
  const quotation = await prisma.salesQuotation.findUnique({ where: { id: req.params.id }, include });
  fail(quotation, 'Customer quotation not found', 404);
  res.json(present(quotation));
}));
router.put('/:id', authorize(...FINANCE), route(async (req, res) => {
  const result = await transaction(async tx => {
    const quotation = await tx.salesQuotation.findUnique({ where: { id: req.params.id } });
    fail(quotation, 'Customer quotation not found', 404);
    fail(['DRAFT','APPROVED'].includes(quotation.status), 'Only draft quotations can be edited', 409);
    const data = cargo(req.body);
    const company = await customer(tx, req.body.customerId);
    const validUntil = date(req.body.validUntil);
    fail(validUntil > new Date(), 'Quotation validity must be in the future');
    await tx.salesQuotationItem.deleteMany({ where: { quotationId: quotation.id } });
    const updated = await tx.salesQuotation.update({ where: { id: quotation.id }, data: { ...data, status: 'DRAFT', customerId: company.id, validUntil,
      terms: text(req.body.terms, 'Terms', 3000, true), items: { create: quotationItems(req.body.items) } }, include });
    await audit(tx, req.user, 'QUOTATION_UPDATED', 'SalesQuotation', quotation.id);
    return updated;
  });
  res.json(present(result));
}));
router.post('/:id/status', authorize(...FINANCE), route(async (req, res) => {
  const status = choice(req.body.status, ['SENT', 'ACCEPTED', 'REJECTED']);
  const result = await transaction(async tx => {
    const quotation = await tx.salesQuotation.findUnique({ where: { id: req.params.id }, include: { job: true, items: true } });
    fail(quotation, 'Customer quotation not found', 404);
    fail(!quotation.job && (status === 'SENT' ? quotation.status === 'APPROVED' : quotation.status === 'SENT'), 'Director approval is required before sending a quotation', 403);
    fail(quotation.validUntil > new Date(), 'This quotation has expired', 409);
    if (status === 'SENT') fail(quotation.items.length > 0 && money(quotationTotals(quotation).revenue).gt(0), 'Add a positive sales price before sending this quotation');
    const updated = await tx.salesQuotation.update({ where: { id: quotation.id }, data: { status }, include });
    await audit(tx, req.user, `QUOTATION_${status}`, 'SalesQuotation', quotation.id);
    return updated;
  });
  res.json(present(result));
}));
router.post('/:id/revise', authorize(...FINANCE), route(async (req, res) => {
  const result = await transaction(async tx => {
    const source = await tx.salesQuotation.findUnique({ where: { id: req.params.id }, include: { items: true } });
    fail(source, 'Customer quotation not found', 404);
    const { title, originCity, destCity, serviceType, cargoDescription, packages, weightKg, volumeCbm, currency, terms, customerId } = source;
    const updated = await tx.salesQuotation.create({ data: { title, originCity, destCity, serviceType, cargoDescription, packages, weightKg, volumeCbm, currency, terms, customerId,
      quotationNumber: number('SQ'), revision: source.revision + 1, createdById: req.user.id, validUntil: new Date(Date.now() + 7 * 86400000),
      items: { create: source.items.map(({ description, quantity, unit, sellRate, buyRate }) => ({ description, quantity, unit, sellRate, buyRate })) } }, include });
    await audit(tx, req.user, 'QUOTATION_REVISED', 'SalesQuotation', updated.id, { sourceId: source.id });
    return updated;
  });
  res.status(201).json(present(result));
}));
router.post('/:id/job', authorize(...FINANCE), route(async (req, res) => {
  const job = await transaction(async tx => {
    const quotation = await tx.salesQuotation.findUnique({ where: { id: req.params.id }, include: { items: true } });
    fail(quotation, 'Customer quotation not found', 404);
    return createJobFromQuotation(tx, quotation, req.user, choice(req.body.jobType || 'SENDER', ['SENDER', 'RECEIVER'], 'Job type'));
  });
  res.json(job);
}));
module.exports = { router, createJobFromQuotation };
