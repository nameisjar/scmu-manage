const express = require('express');

const { authenticate, authorize } = require('../middleware/auth');
const { validate, createInvoiceRules, paginationRules } = require('../middleware/validators');

const router = express.Router();
const prisma = require('../prisma');
const { number, choice, CURRENCIES, invoiceBalance, fail } = require('../services/jpt');

function generateInvoiceNumber() {
  return number('INV');
}

router.get('/', authenticate, paginationRules, validate, async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status, search } = req.query;
    const skip = (Number(page) - 1) * Number(limit);
    const where = {
      ...(status && { status }),
      ...(search && {
        OR: [
          { invoiceNumber: { contains: search, mode: 'insensitive' } },
          { shipment: { shipmentNumber: { contains: search, mode: 'insensitive' } } },
        ],
      }),
    };
    const [invoices, total] = await Promise.all([
      prisma.invoice.findMany({
        where, skip, take: Number(limit),
        include: {
          shipment: { select: { id: true, shipmentNumber: true, originCity: true, destCity: true } },
          company: { select: { id: true, name: true } },
          job: { select: { id: true, jobNumber: true, originCity: true, destCity: true } },
          items: true,
          payments: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.invoice.count({ where }),
    ]);
    res.json({ data: invoices.map(invoice => ({ ...invoice, balance: invoiceBalance(invoice).toFixed(2) })), total, page: Number(page), limit: Number(limit) });
  } catch (err) { next(err); }
});

router.post(
  '/',
  authenticate,
  authorize('SUPER_ADMIN', 'ADMIN'),
  createInvoiceRules,
  validate,
  async (req, res, next) => {
    try {
      const { shipmentId, companyId, freightAmount, gstAmount = 0, invoiceDate, dueDate, notes } = req.body;
      const shipment = await prisma.shipment.findUnique({ where: { id: shipmentId } });
      fail(shipment && shipment.shipperCompanyId === companyId, 'Invoice company must match the shipment customer');
      fail(!shipment.jobId, 'Create invoices from the job order for linked shipments', 409);
      const total = Number(freightAmount) + Number(gstAmount);
      const invoice = await prisma.invoice.create({
        data: {
          invoiceNumber: generateInvoiceNumber(),
          shipmentId, companyId,
          currency: shipment.currency || choice(req.body.currency || 'IDR', CURRENCIES, 'Currency'),
          freightAmount: Number(freightAmount),
          gstAmount: Number(gstAmount),
          totalAmount: total,
          invoiceDate: new Date(invoiceDate),
          dueDate: dueDate ? new Date(dueDate) : null,
          notes,
        },
      });
      res.status(201).json(invoice);
    } catch (err) { next(err); }
  }
);

router.put('/:id', authenticate, authorize('SUPER_ADMIN', 'ADMIN'), async (req, res, next) => {
  try {
    // Whitelist updatable fields
    const { status, paidDate, notes } = req.body;
    const existing = await prisma.invoice.findUnique({ where: { id: req.params.id }, include: { payments: true } });
    fail(existing, 'Invoice not found', 404);
    fail(!existing.jobId, 'Manage this invoice and its payments from the job order', 409);
    fail(status === undefined || status === 'DISPUTED', 'Submit this action for director approval', 403);
    fail(status === undefined || !['PAID','CANCELLED'].includes(existing.status), 'Final invoice statuses are locked', 409);
    fail(paidDate === undefined, 'Submit this action for director approval', 403);
    const invoice = await prisma.invoice.update({
      where: { id: req.params.id },
      data: {
        ...(status !== undefined && { status }),
        ...(paidDate !== undefined && { paidDate: new Date(paidDate) }),
        ...(notes !== undefined && { notes }),
      },
    });
    res.json(invoice);
  } catch (err) { next(err); }
});

module.exports = router;
