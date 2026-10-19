const express = require('express');
const prisma = require('../prisma');
const { authenticate, authorize } = require('../middleware/auth');
const { uploadLimiter } = require('../middleware/rateLimiter');
const files = require('../services/jobFiles');
const { transportFields, costFields } = require('../services/transport');
const { STAFF, OPERATORS, FINANCE, DOCUMENT_TYPES, fail, route, number, text, decimal, integer, date, choice, money, sum, transaction, audit, customer, vendor, mutableJob, cargo, jobInclude, invoiceBalance, presentJob, syncJob, closeJob } = require('../services/jpt');
const router = express.Router();
router.use(authenticate, authorize(...STAFF));

router.get('/', route(async (req, res) => {
  const where = { ...(req.query.status && { status: choice(req.query.status, ['BOOKED', 'IN_PROGRESS', 'DELIVERED', 'CLOSED', 'CANCELLED']) }),
    ...(req.query.search && { OR: ['jobNumber', 'title', 'customerReference'].map(field => ({ [field]: { contains: String(req.query.search).slice(0, 200), mode: 'insensitive' } })) }) };
  const jobs = await prisma.jobOrder.findMany({ where, include: jobInclude, orderBy: { createdAt: 'desc' }, take: 200 });
  res.json({ data: jobs.map(presentJob) });
}));
router.get('/finance', route(async (req, res) => {
  const jobs = (await prisma.jobOrder.findMany({ where: { status: { not: 'CANCELLED' } }, include: jobInclude, orderBy: { createdAt: 'desc' } })).map(presentJob);
  const groups = {};
  for (const job of jobs) {
    groups[job.currency] ||= { currency: job.currency, jobs: 0, revenue: money(0), approvedCost: money(0), estimatedProfit: money(0), grossProfit: money(0), receivable: money(0), payable: money(0), internalCost: money(0), vendorCost: money(0), internalExpensePaid: money(0), internalOutstanding: money(0) };
    const group = groups[job.currency]; group.jobs++;
    for (const field of ['revenue', 'approvedCost', 'estimatedProfit', 'grossProfit', 'receivable', 'payable', 'internalCost', 'vendorCost', 'internalExpensePaid', 'internalOutstanding']) group[field] = group[field].plus(job.financials[field]);
  }
  const invoices = jobs.flatMap(job => job.invoices.map(invoice => {
    const days = invoice.dueDate && money(invoice.balance).gt(0) ? Math.max(0, Math.floor((Date.now() - invoice.dueDate.getTime()) / 86400000)) : 0;
    return { ...invoice, jobNumber: job.jobNumber, customerName: job.customer.name, daysOverdue: days, agingBucket: days > 90 ? 'OVER_90' : days > 60 ? '61_90' : days > 30 ? '31_60' : days > 0 ? '1_30' : 'CURRENT' };
  }));
  const balances = source => jobs.flatMap(job => job.charges.filter(charge => charge.kind === 'COST' && charge.costSource === source && charge.status === 'APPROVED').map(charge => {
    const balance = money(charge.actualAmount).minus(sum(charge.payments, payment => payment.amount));
    const days = charge.dueDate && balance.gt(0) ? Math.max(0, Math.floor((Date.now() - charge.dueDate.getTime()) / 86400000)) : 0;
    return { id: charge.id, jobId: job.id, jobNumber: job.jobNumber, currency: job.currency, vendorName: charge.vendor?.name, costCategory: charge.costCategory, description: charge.description, dueDate: charge.dueDate, balance: balance.toFixed(2), daysOverdue: days };
  }));
  res.json({ groups: Object.values(groups), jobs, invoices, payables: balances('VENDOR'), internalExpenses: balances('INTERNAL'), alerts: jobs.flatMap(job => job.alerts.map(alert => ({ ...alert, jobId: job.id, jobNumber: job.jobNumber }))) });
}));
router.post('/', authorize(...FINANCE), route(async (req, res) => {
  const result = await transaction(async tx => {
    const company = await customer(tx, req.body.customerId);
    const job = await tx.jobOrder.create({ data: { ...cargo(req.body), jobNumber: number('JOB'), customerId: company.id,
      customerReference: text(req.body.customerReference, 'Customer reference', 200, true), recipientName: text(req.body.recipientName, 'Recipient', 200, true), deliveryAddress: text(req.body.deliveryAddress, 'Delivery address', 2000, true),
      notes: text(req.body.notes, 'Notes', 3000, true), createdById: req.user.id,
      documents: { create: [{ title: 'Packing list', type: 'PACKING_LIST', required: true }, { title: 'Proof of delivery', type: 'POD', required: true }] } } });
    await audit(tx, req.user, 'JOB_CREATED', 'JobOrder', job.id);
    return job;
  });
  res.status(201).json(result);
}));
router.get('/:id', route(async (req, res) => {
  const job = await prisma.jobOrder.findUnique({ where: { id: req.params.id }, include: jobInclude });
  fail(job, 'Job order not found', 404);
  const activity = await prisma.activityLog.findMany({ where: { entity: 'JobOrder', entityId: job.id }, include: { user: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 100 });
  res.json({ ...presentJob(job), activity });
}));
router.put('/:id', authorize(...OPERATORS), route(async (req, res) => {
  const result = await transaction(async tx => {
    const job = await mutableJob(tx, req.params.id);
    const expectedDelivery = date(req.body.expectedDelivery, true);
    const updated = await tx.jobOrder.update({ where: { id: job.id }, data: {
      ...(req.body.expectedDelivery !== undefined && { expectedDelivery }),
      ...(req.body.customerReference !== undefined && { customerReference: text(req.body.customerReference, 'Customer reference', 200, true) }),
      ...(req.body.recipientName !== undefined && { recipientName: text(req.body.recipientName, 'Recipient', 200, true) }),
      ...(req.body.deliveryAddress !== undefined && { deliveryAddress: text(req.body.deliveryAddress, 'Delivery address', 2000, true) }),
      ...(req.body.notes !== undefined && { notes: text(req.body.notes, 'Notes', 3000, true) }),
    } });
    await audit(tx, req.user, 'JOB_UPDATED', 'JobOrder', job.id);
    return updated;
  });
  res.json(result);
}));
router.post('/:id/close', authorize(...FINANCE), route(async (req, res) => {
  const job = await transaction(async tx => {
    const current = await tx.jobOrder.findUnique({ where: { id: req.params.id }, include: jobInclude });
    fail(current, 'Job order not found', 404);
    const updated = await closeJob(tx, current);
    await audit(tx, req.user, 'JOB_CLOSED', 'JobOrder', current.id);
    return updated;
  }); res.json(job);
}));
router.post('/:id/shipments', authorize(...OPERATORS), route(async (req, res) => {
  const result = await transaction(async tx => {
    const job = await mutableJob(tx, req.params.id);
    const body = req.body;
    const mode = choice(body.mode || 'ROAD', ['ROAD', 'SEA', 'AIR', 'RAIL']);
    const loadingDate = date(body.loadingDate);
    const expectedDelivery = date(body.expectedDelivery, true);
    fail(!expectedDelivery || expectedDelivery >= loadingDate, 'Delivery must be after pickup');
    const assignment = await transportFields(tx, { ...body, mode });
    const shipment = await tx.shipment.create({ data: { jobId: job.id, shipperCompanyId: job.customerId, createdById: req.user.id, currency: job.currency,
      shipmentNumber: number('SHP'), sequence: await tx.shipment.count({ where: { jobId: job.id } }) + 1,
      ...assignment,
      originCity: text(body.originCity, 'Origin', 100), originState: text(body.originState || '-', 'Origin province', 100),
      destCity: text(body.destCity, 'Destination', 100), destState: text(body.destState || '-', 'Destination province', 100),
      loadingDate, expectedDelivery, weight: Number(job.weightKg) / 1000, quantity: job.packages,
      bookingNumber: text(body.bookingNumber, 'Booking number', 100, true), vesselFlight: text(body.vesselFlight, 'Vessel or flight', 100, true),
      containerNumber: text(body.containerNumber, 'Container number', 50, true), sealNumber: text(body.sealNumber, 'Seal number', 50, true),
      freeUntil: date(body.freeUntil, true), notes: text(body.notes, 'Notes', 2000, true),
    } });
    const type = mode === 'SEA' ? 'BILL_OF_LADING' : mode === 'AIR' ? 'AIR_WAYBILL' : 'SURAT_JALAN';
    await tx.jobDocument.create({ data: { jobId: job.id, shipmentId: shipment.id, type, title: `${type} - ${shipment.shipmentNumber}`, required: true } });
    await syncJob(tx, job.id);
    await audit(tx, req.user, 'TRANSPORT_LEG_CREATED', 'JobOrder', job.id, { shipmentId: shipment.id, mode });
    return shipment;
  }); res.status(201).json(result);
}));
router.post('/:id/shipments/:shipmentId/empty-return', authorize(...OPERATORS), route(async (req, res) => {
  const updated = await transaction(async tx => {
    await mutableJob(tx, req.params.id);
    const shipment = await tx.shipment.findFirst({ where: { id: req.params.shipmentId, jobId: req.params.id } });
    fail(shipment && shipment.containerNumber, 'Container shipment not found', 404);
    const result = await tx.shipment.update({ where: { id: shipment.id }, data: { emptyReturnedAt: date(req.body.emptyReturnedAt || new Date()) } });
    await audit(tx, req.user, 'CONTAINER_RETURNED', 'JobOrder', req.params.id, { shipmentId: shipment.id });
    return result;
  }); res.json(updated);
}));

router.post('/:id/charges', authorize(...OPERATORS), route(async (req, res) => {
  const result = await transaction(async tx => {
    await mutableJob(tx, req.params.id);
    const kind = choice(req.body.kind, ['REVENUE', 'COST']);
    const charge = await tx.jobCharge.create({ data: { jobId: req.params.id, kind, description: text(req.body.description, 'Description', 300), estimatedAmount: decimal(req.body.estimatedAmount),
      ...(kind === 'COST' ? await costFields(tx, req.params.id, req.body) : {}), dueDate: date(req.body.dueDate, true), notes: text(req.body.notes, 'Notes', 2000, true), createdById: req.user.id } });
    await audit(tx, req.user, 'CHARGE_PROPOSED', 'JobOrder', req.params.id, { chargeId: charge.id, kind });
    return charge;
  }); res.status(201).json(result);
}));
router.put('/:id/charges/:chargeId', authorize(...OPERATORS), route(async (req, res) => {
  const result = await transaction(async tx => {
    await mutableJob(tx, req.params.id);
    const charge = await tx.jobCharge.findFirst({ where: { id: req.params.chargeId, jobId: req.params.id } });
    fail(charge, 'Charge not found', 404);
    fail(charge.status === 'PROPOSED', 'Only proposed charges can be edited', 409);
    const updated = await tx.jobCharge.update({ where: { id: charge.id }, data: { description: text(req.body.description, 'Description', 300), estimatedAmount: decimal(req.body.estimatedAmount),
      ...(charge.kind === 'COST' ? await costFields(tx, req.params.id, req.body, charge) : {}), dueDate: date(req.body.dueDate, true), notes: text(req.body.notes, 'Notes', 2000, true) } });
    await audit(tx, req.user, 'CHARGE_UPDATED', 'JobOrder', req.params.id, { chargeId: charge.id });
    return updated;
  }); res.json(result);
}));
router.post('/:id/charges/:chargeId/review', authorize(...FINANCE), route(async (req, res) => {
  const result = await transaction(async tx => {
    await mutableJob(tx, req.params.id);
    const charge = await tx.jobCharge.findFirst({ where: { id: req.params.chargeId, jobId: req.params.id } });
    fail(charge, 'Charge not found', 404);
    fail(charge.status === 'PROPOSED', 'This charge was already reviewed', 409);
    const status = choice(req.body.status, ['APPROVED', 'REJECTED']);
    if (status === 'APPROVED' && charge.kind === 'COST') {
      await costFields(tx, req.params.id, charge);
      if (charge.costSource === 'VENDOR') { fail(charge.vendorId, 'Assign a vendor before approving a cost'); await vendor(tx, charge.vendorId); }
    }
    const updated = await tx.jobCharge.update({ where: { id: charge.id }, data: { status, actualAmount: status === 'APPROVED' ? decimal(req.body.actualAmount ?? charge.estimatedAmount.toString()) : null, approvedById: req.user.id, approvedAt: new Date() } });
    await audit(tx, req.user, `CHARGE_${status}`, 'JobOrder', req.params.id, { chargeId: charge.id, actualAmount: updated.actualAmount });
    return updated;
  }); res.json(result);
}));

router.post('/:id/documents', authorize(...OPERATORS), route(async (req, res) => {
  const result = await transaction(async tx => {
    await mutableJob(tx, req.params.id);
    fail(req.body.required === undefined || typeof req.body.required === 'boolean', 'Required must be true or false');
    fail(req.body.customerVisible === undefined || typeof req.body.customerVisible === 'boolean', 'Visibility must be true or false');
    const document = await tx.jobDocument.create({ data: { jobId: req.params.id, type: choice(req.body.type || 'OTHER', DOCUMENT_TYPES), title: text(req.body.title, 'Document title', 200),
      required: req.body.required ?? false, customerVisible: false, expiresAt: date(req.body.expiresAt, true) } });
    await audit(tx, req.user, 'DOCUMENT_ADDED', 'JobOrder', req.params.id, { documentId: document.id });
    return document;
  }); res.status(201).json(result);
}));
router.post('/:id/documents/:documentId/upload', authorize(...OPERATORS), uploadLimiter, route(async (req, res) => {
  // Check ownership and job status before accepting a file.
  await mutableJob(prisma, req.params.id);
  const record = await prisma.jobDocument.findFirst({ where: { id: req.params.documentId, jobId: req.params.id } });
  fail(record, 'Document not found', 404);
  await new Promise((resolve, reject) => files.upload(req, res, error => error ? reject(error) : resolve()));
  try {
    await files.validateFile(req.file);
    const document = await transaction(async tx => {
      await mutableJob(tx, req.params.id);
      const updated = await tx.jobDocument.update({ where: { id: record.id }, data: { filename: req.file.filename, originalName: text(req.file.originalname, 'Filename', 255), mimeType: req.file.mimetype,
        size: req.file.size, status: 'UPLOADED', uploadedById: req.user.id, verifiedById: null } });
      await audit(tx, req.user, 'DOCUMENT_UPLOADED', 'JobOrder', req.params.id, { documentId: record.id });
      return updated;
    });
    await files.removeFile(record.filename);
    res.json(document);
  } catch (error) { if (req.file) await files.removeFile(req.file.filename); throw error; }
}));
router.post('/:id/documents/:documentId/verify', authorize(...FINANCE), route(async (req, res) => {
  const document = await transaction(async tx => {
    await mutableJob(tx, req.params.id);
    const record = await tx.jobDocument.findFirst({ where: { id: req.params.documentId, jobId: req.params.id } });
    fail(record && record.filename && record.status === 'UPLOADED', 'Upload a document before verification', 409);
    const updated = await tx.jobDocument.update({ where: { id: record.id }, data: { status: 'VERIFIED', verifiedById: req.user.id } });
    await audit(tx, req.user, 'DOCUMENT_VERIFIED', 'JobOrder', req.params.id, { documentId: record.id });
    return updated;
  }); res.json(document);
}));
router.get('/:id/documents/:documentId/file', route(async (req, res) => {
  const document = await prisma.jobDocument.findFirst({ where: { id: req.params.documentId, jobId: req.params.id } });
  fail(document && document.filename, 'Document file not found', 404);
  res.download(files.filePath(document.filename), document.originalName || document.title);
}));

router.post('/:id/invoices', authorize(...FINANCE), route(async (req, res) => {
  const invoice = await transaction(async tx => {
    const job = await mutableJob(tx, req.params.id);
    const company = await customer(tx, job.customerId);
    const charges = await tx.jobCharge.findMany({ where: { jobId: job.id, kind: 'REVENUE', status: 'APPROVED', invoiceItem: null } });
    fail(charges.length > 0, 'No approved unbilled revenue remains', 409);
    const freight = sum(charges, charge => charge.actualAmount ?? charge.estimatedAmount);
    fail(freight.gt(0), 'Invoice amount must be positive');
    const tax = decimal(req.body.taxAmount ?? 0, 'Tax amount');
    fail(freight.plus(tax).lte('999999999999'), 'Invoice total exceeds limit');
    const invoiceDate = date(req.body.invoiceDate || new Date());
    const dueDate = req.body.dueDate ? date(req.body.dueDate) : new Date(invoiceDate.getTime() + company.paymentTermsDays * 86400000);
    fail(dueDate >= invoiceDate, 'Invoice due date must not precede invoice date');
    const result = await tx.invoice.create({ data: { invoiceNumber: number('INV'), jobId: job.id, companyId: job.customerId, freightAmount: freight.toNumber(), gstAmount: tax.toNumber(), totalAmount: freight.plus(tax).toNumber(),
      currency: job.currency, invoiceDate, dueDate, status: 'APPROVED', notes: text(req.body.notes, 'Notes', 2000, true),
      items: { create: charges.map(charge => ({ chargeId: charge.id, description: charge.description, amount: charge.actualAmount ?? charge.estimatedAmount })) } }, include: { items: true, payments: true } });
    await audit(tx, req.user, 'INVOICE_CREATED', 'JobOrder', job.id, { invoiceId: result.id });
    return result;
  }); res.status(201).json(invoice);
}));
router.post('/:id/payments', authorize(...FINANCE), route(async (req, res) => {
  const payment = await transaction(async tx => {
    const job = await mutableJob(tx, req.params.id);
    const direction = choice(req.body.direction, ['RECEIVABLE', 'PAYABLE', 'INTERNAL_EXPENSE']);
    const amount = decimal(req.body.amount, 'Payment amount', 2, true);
    let invoiceId = null; let chargeId = null;
    if (direction === 'RECEIVABLE') {
      text(req.body.invoiceId, 'Invoice ID', 100);
      const invoice = await tx.invoice.findFirst({ where: { id: req.body.invoiceId, jobId: job.id }, include: { payments: true } });
      fail(invoice && invoice.status !== 'CANCELLED', 'Invoice not found', 404);
      fail(amount.lte(invoiceBalance(invoice)), 'Payment exceeds outstanding balance', 409);
      invoiceId = invoice.id;
      const paid = invoiceBalance(invoice).eq(amount);
      await tx.invoice.update({ where: { id: invoice.id }, data: { status: paid ? 'PAID' : 'APPROVED', paidDate: paid ? date(req.body.paidAt || new Date()) : null } });
    } else {
      text(req.body.chargeId, 'Charge ID', 100);
      const charge = await tx.jobCharge.findFirst({ where: { id: req.body.chargeId, jobId: job.id, kind: 'COST', status: 'APPROVED' }, include: { payments: true } });
      fail(charge, 'Approved cost not found', 404);
      fail(charge.costSource === (direction === 'INTERNAL_EXPENSE' ? 'INTERNAL' : 'VENDOR'), 'Payment direction must match the cost source');
      fail(amount.lte(money(charge.actualAmount).minus(sum(charge.payments, item => item.amount))), 'Payment exceeds outstanding balance', 409);
      chargeId = charge.id;
    }
    fail(req.body.isAdvance === undefined || typeof req.body.isAdvance === 'boolean', 'Advance must be true or false');
    const result = await tx.jobPayment.create({ data: { jobId: job.id, direction, invoiceId, chargeId, amount, reference: text(req.body.reference, 'Payment reference', 150),
      method: choice(req.body.method || 'BANK_TRANSFER', ['BANK_TRANSFER', 'CASH', 'OTHER']),
      paidTo: text(req.body.paidTo, 'Payment recipient', 200, direction !== 'INTERNAL_EXPENSE'), notes: text(req.body.notes, 'Notes', 2000, true),
      isAdvance: req.body.isAdvance ?? false, paidAt: date(req.body.paidAt || new Date()), createdById: req.user.id } });
    await audit(tx, req.user, 'PAYMENT_RECORDED', 'JobOrder', job.id, { paymentId: result.id, direction, amount: result.amount });
    return result;
  }); res.status(201).json(payment);
}));

const operationStatuses = { WAREHOUSE: ['IN', 'OUT'], CUSTOMS: ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'RELEASED'], CLAIM: ['OPEN', 'UNDER_REVIEW', 'APPROVED', 'SETTLED', 'REJECTED'], INSURANCE: ['ACTIVE', 'EXPIRED', 'CANCELLED'] };
router.post('/:id/operations', authorize(...OPERATORS), route(async (req, res) => {
  const operation = await transaction(async tx => {
    await mutableJob(tx, req.params.id);
    const kind = choice(req.body.kind, Object.keys(operationStatuses));
    const status = choice(req.body.status, operationStatuses[kind]);
    const quantity = kind === 'WAREHOUSE' ? integer(req.body.quantity, 'Packages') : null;
    const location = text(req.body.location, 'Location', 200, kind !== 'WAREHOUSE');
    if (kind === 'WAREHOUSE' && status === 'OUT') {
      const movements = await tx.jobOperation.findMany({ where: { jobId: req.params.id, kind: 'WAREHOUSE', location } });
      const available = movements.reduce((total, item) => total + (item.status === 'IN' ? item.quantity : -item.quantity), 0);
      fail(quantity <= available, 'Warehouse dispatch exceeds available packages', 409);
    }
    const result = await tx.jobOperation.create({ data: { jobId: req.params.id, kind, status, quantity, location,
      reference: text(req.body.reference, 'Reference', 150), party: text(req.body.party, 'Party', 200, true), amount: req.body.amount !== undefined && req.body.amount !== '' ? decimal(req.body.amount) : null,
      eventDate: date(req.body.eventDate || new Date()), expiresAt: date(req.body.expiresAt, true), notes: text(req.body.notes, 'Notes', 3000, true), createdById: req.user.id } });
    await audit(tx, req.user, 'OPERATION_RECORDED', 'JobOrder', req.params.id, { operationId: result.id, kind, status });
    return result;
  }); res.status(201).json(operation);
}));
router.put('/:id/operations/:operationId', authorize(...FINANCE), route(async (req, res) => {
  const operation = await transaction(async tx => {
    await mutableJob(tx, req.params.id);
    const source = await tx.jobOperation.findFirst({ where: { id: req.params.operationId, jobId: req.params.id } });
    fail(source, 'Operational record not found', 404);
    fail(source.kind !== 'WAREHOUSE', 'Warehouse movements cannot be edited', 409);
    const status = choice(req.body.status, operationStatuses[source.kind]);
    const result = await tx.jobOperation.update({ where: { id: source.id }, data: { status, notes: text(req.body.notes ?? source.notes, 'Notes', 3000, true) } });
    await audit(tx, req.user, 'OPERATION_UPDATED', 'JobOrder', req.params.id, { operationId: source.id, status });
    return result;
  }); res.json(operation);
}));
module.exports = router;
