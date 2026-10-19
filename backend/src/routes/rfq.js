const { internalCompany } = require('../services/access');
const express = require('express');

const { authenticate, authorize } = require('../middleware/auth');
const { validate, createRFQRules, submitQuoteRules, paginationRules } = require('../middleware/validators');

const router = express.Router();
const prisma = require('../prisma');
const { choice, CURRENCIES, transaction, vendor, fail, audit, route } = require('../services/jpt');

function generateRFQNumber() {
  return `RFQ-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

// GET /api/rfq
router.get('/', authenticate, paginationRules, validate, async (req, res, next) => {
  try {
    const { page = 1, limit = 20, status, search } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const where = {
      ...(status && { status }),
      ...(search && {
        OR: [
          { rfqNumber: { contains: search, mode: 'insensitive' } },
          { title: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const [rfqs, total] = await Promise.all([
      prisma.rFQ.findMany({
        where, skip, take: Number(limit),
        include: {
          shipper: { select: { id: true, name: true } },
          goodsType: { select: { id: true, name: true } },
          createdBy: { select: { id: true, name: true } },
          _count: { select: { quotes: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.rFQ.count({ where }),
    ]);

    res.json({ data: rfqs, total, page: Number(page), limit: Number(limit) });
  } catch (err) { next(err); }
});

// GET /api/rfq/:id
router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const rfq = await prisma.rFQ.findUnique({
      where: { id: req.params.id },
      include: {
        shipper: true, goodsType: true, route: true,
        createdBy: { select: { id: true, name: true } },
        quotes: {
          include: {
            transporter: { select: { id: true, name: true } },
            submittedBy: { select: { id: true, name: true } },
          },
          orderBy: { amount: 'asc' },
        },
        awardedQuote: { include: { transporter: { select: { id: true, name: true } } } },
      },
    });
    if (!rfq) return res.status(404).json({ message: 'RFQ not found' });

    res.json(rfq);
  } catch (err) { next(err); }
});

// POST /api/rfq
router.post(
  '/',
  authenticate,
  authorize('SUPER_ADMIN', 'ADMIN'),
  createRFQRules,
  validate,
  async (req, res, next) => {
    try {
      // Whitelist fields
      const {
        title, shipperCompanyId, goodsTypeId, routeId,
        originCity, originState, destCity, destState, vehicleType,
        weight, quantity, loadingDate, deliveryDate, basePrice, expiresAt, description, notes,
      } = req.body;

      const rfq = await prisma.rFQ.create({
        data: {
          title, shipperCompanyId: (await internalCompany(prisma, shipperCompanyId)).id, goodsTypeId: goodsTypeId || null, routeId: routeId || null,
          originCity, originState, destCity, destState,
          vehicleType: vehicleType || 'TRUCK',
          weight: weight ? Number(weight) : null,
          quantity: quantity ? Number(quantity) : 1,
          loadingDate: new Date(loadingDate),
          deliveryDate: deliveryDate ? new Date(deliveryDate) : null,
          basePrice: basePrice ? Number(basePrice) : null,
          currency: choice(req.body.currency || 'IDR', CURRENCIES, 'Currency'),
          expiresAt: expiresAt ? new Date(expiresAt) : null,
          description: description || notes || null,
          rfqNumber: generateRFQNumber(),
          createdById: req.user.id,
          status: 'OPEN',
        },
      });
      res.status(201).json(rfq);
    } catch (err) { next(err); }
  }
);

// POST /api/rfq/:id/quote
router.post(
  '/:id/quote',
  authenticate,
  authorize('SUPER_ADMIN', 'ADMIN'),
  submitQuoteRules,
  validate,
  async (req, res, next) => {
    try {
      const quote = await transaction(async tx => {
        const { amount, validUntil, notes, transporterId } = req.body;
        await vendor(tx, transporterId);
        const rfq = await tx.rFQ.findUnique({ where: { id: req.params.id } });
        fail(rfq && ['OPEN', 'QUOTED'].includes(rfq.status), 'RFQ is not open for quoting', 409);
        const existing = await tx.quote.findFirst({ where: { rfqId: rfq.id, transporterId, status: { not: 'WITHDRAWN' } } });
        fail(!existing, 'A quote for this vendor already exists', 409);
        const created = await tx.quote.create({ data: { rfqId: rfq.id, transporterId, submittedById: req.user.id, amount: Number(amount), currency: rfq.currency, validUntil: validUntil ? new Date(validUntil) : null, notes } });
        await tx.rFQ.update({ where: { id: rfq.id }, data: { status: 'QUOTED' } });
        await audit(tx, req.user, 'VENDOR_QUOTE_RECORDED', 'RFQ', rfq.id, { quoteId: created.id, vendorId: transporterId });
        return created;
      });
      res.status(201).json(quote);
    } catch (err) { next(err); }
  }
);

// Awards are executed atomically from the director approval queue.
router.post('/:id/award/:quoteId', authenticate, route(async () => fail(false, 'Submit this action for director approval', 403)));

// PUT /api/rfq/:id — whitelist fields
router.put(
  '/:id',
  authenticate,
  authorize('SUPER_ADMIN', 'ADMIN'),
  async (req, res, next) => {
    try {
      const { title, originCity, destCity, weight, loadingDate, deliveryDate, notes } = req.body;
      const current = await prisma.rFQ.findUnique({ where: { id: req.params.id } });
      fail(current && !['AWARDED','CANCELLED'].includes(current.status), 'Awarded or cancelled RFQs are locked', 409);
      const rfq = await prisma.rFQ.update({
        where: { id: req.params.id },
        data: {
          ...(title !== undefined && { title }),
          ...(originCity !== undefined && { originCity }),
          ...(destCity !== undefined && { destCity }),
          ...(weight !== undefined && { weight: Number(weight) }),
          ...(loadingDate !== undefined && { loadingDate: new Date(loadingDate) }),
          ...(deliveryDate !== undefined && { deliveryDate: new Date(deliveryDate) }),
          ...(notes !== undefined && { notes }),
        },
      });
      res.json(rfq);
    } catch (err) { next(err); }
  }
);

// DELETE /api/rfq/:id (cancel)
router.delete(
  '/:id',
  authenticate,
  authorize('SUPER_ADMIN', 'ADMIN'),
  async (req, res, next) => {
    try {
      const current = await prisma.rFQ.findUnique({ where: { id: req.params.id } });
      fail(current && current.status !== 'AWARDED', 'Awarded RFQs are locked', 409);
      await prisma.rFQ.update({ where: { id: req.params.id }, data: { status: 'CANCELLED' } });
      res.json({ message: 'RFQ cancelled' });
    } catch (err) { next(err); }
  }
);

module.exports = router;
