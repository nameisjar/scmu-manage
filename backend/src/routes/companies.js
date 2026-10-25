const express = require('express');

const { authenticate, authorize } = require('../middleware/auth');
const { validate, createCompanyRules, paginationRules } = require('../middleware/validators');

const router = express.Router();
const prisma = require('../prisma');
const { listPage } = require('../services/pagination');
const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN'];
const { text, integer, decimal, audit, transaction, fail } = require('../services/jpt');
const { internalCompany } = require('../services/access');

function customerFields(body) {
  return {
    ...(body.npwp !== undefined && { npwp: text(body.npwp, 'NPWP', 40, true) }),
    ...(body.paymentTermsDays !== undefined && { paymentTermsDays: integer(body.paymentTermsDays, 'Payment terms', 0, 365) }),
    ...(body.creditLimit !== undefined && { creditLimit: decimal(body.creditLimit, 'Credit limit') }),
    ...(body.notes !== undefined && { notes: text(body.notes, 'Notes', 3000, true) }),
  };
}

router.get('/', authenticate, paginationRules, validate, async (req, res, next) => {
  try {
    const { page = 1, limit = 20, search, type } = req.query;
    const where = {
      isActive: true,
      ...(search && { OR: ['name','city','email','contactPerson'].map(key=>({[key]:{contains:search,mode:'insensitive'}})) }),
      ...(type && { type }),
      ...(req.query.internal === 'true' && { isInternal: true }),
    };
    const result = await listPage(prisma.company, { where, orderBy: [{ name: 'asc' }, { id: 'asc' }] }, { page, limit });
    const companies = result.data;
    res.json({ ...result, data: companies });
  } catch (err) { next(err); }
});

router.get('/internal', authenticate, async (req, res, next) => { try { res.json(await internalCompany(prisma)); } catch (error) { next(error); } });

router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const company = await prisma.company.findUnique({
      where: { id: req.params.id },
      include: {
        vehicles: { where: { isActive: true } },
        drivers: { where: { isActive: true } },
        _count: { select: { shipments: true, rfqs: true } },
      },
    });
    if (!company) return res.status(404).json({ message: 'Company not found' });
    res.json(company);
  } catch (err) { next(err); }
});

router.post(
  '/',
  authenticate,
  authorize(...ADMIN_ROLES),
  createCompanyRules,
  validate,
  async (req, res, next) => {
    try {
      const { name, type, email, phone, address, city, state, gstin, contactPerson } = req.body;
      const company = await transaction(async tx => {
        const record = await tx.company.create({ data: { name, type, email, phone, address, city, state, gstin, contactPerson, ...customerFields(req.body) } });
        await audit(tx, req.user, 'COMPANY_CREATED', 'Company', record.id);
        return record;
      });
      res.status(201).json(company);
    } catch (err) { next(err); }
  }
);

router.put('/:id', authenticate, authorize(...ADMIN_ROLES), async (req, res, next) => {
  try {
    const existing = await prisma.company.findUnique({ where: { id: req.params.id } });
    fail(existing, 'Company not found', 404);
    fail(!existing.isInternal || req.user.role === 'SUPER_ADMIN', 'Only Super Admin can edit the SCMU company profile', 403);
    const { name, email, phone, address, city, state, gstin, contactPerson } = req.body;
    const company = await prisma.company.update({
      where: { id: req.params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(email !== undefined && { email }),
        ...(phone !== undefined && { phone }),
        ...(address !== undefined && { address }),
        ...(city !== undefined && { city }),
        ...(state !== undefined && { state }),
        ...(gstin !== undefined && { gstin }),
        ...(contactPerson !== undefined && { contactPerson }),
        ...customerFields(req.body),
      },
    });
    res.json(company);
  } catch (err) { next(err); }
});

router.delete('/:id', authenticate, authorize('SUPER_ADMIN', 'ADMIN'), async (req, res, next) => {
  try {
    const existing = await prisma.company.findUnique({ where: { id: req.params.id } });
    fail(existing && !existing.isInternal, 'The internal SCMU company cannot be deactivated', 409);
    await prisma.company.update({ where: { id: req.params.id }, data: { isActive: false } });
    res.json({ message: 'Company deactivated' });
  } catch (err) { next(err); }
});

module.exports = router;
