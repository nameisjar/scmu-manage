const express = require('express');
const bcrypt = require('bcryptjs');
const prisma = require('../prisma');
const { listPage } = require('../services/pagination');
const { authenticate, authorize } = require('../middleware/auth');
const { validate, createUserRules, updateUserRules, paginationRules } = require('../middleware/validators');
const { INTERNAL_ROLES, internalCompany, isInternalRole } = require('../services/access');
const { route, fail, choice, transaction, audit } = require('../services/jpt');
const router = express.Router();
router.use(authenticate, authorize('SUPER_ADMIN'));
const select = { id: true, name: true, email: true, role: true, phone: true, isActive: true, createdAt: true };
async function requireSuperAdmin(tx, actorId) {
  const actor = await tx.user.findUnique({ where: { id: actorId } });
  fail(actor?.isActive && actor.role === 'SUPER_ADMIN', 'Access denied', 403);
}
async function protectLastSuperAdmin(tx, current, role, isActive) {
  if (current.role === 'SUPER_ADMIN' && current.isActive && (isActive === false || (role && role !== 'SUPER_ADMIN'))) {
    const remaining = await tx.user.count({ where: { role: 'SUPER_ADMIN', isActive: true } });
    fail(remaining > 1, 'At least one active Super Admin is required', 409);
  }
}
function disconnectUser(req, id) {
  for (const socket of req.app.get('io')?.sockets.sockets.values() || []) if (socket.data.userId === id) socket.disconnect(true);
}
router.get('/', paginationRules, validate, route(async (req, res) => {
  const { page = 1, limit = 20, search, role } = req.query;
  const where = { role: role ? choice(role, INTERNAL_ROLES, 'Role') : { in: INTERNAL_ROLES }, ...(search && { OR: ['name', 'email'].map(key => ({ [key]: { contains: search, mode: 'insensitive' } })) }) };
  res.json(await listPage(prisma.user, { where, select, orderBy: [{createdAt:'desc'},{id:'desc'}] }, {page,limit}));
}));
router.post('/', createUserRules, validate, route(async (req, res) => {
  const { name, email, role, phone, password } = req.body;
  const hash = await bcrypt.hash(password || 'SCMU@1234', 12);
  const user = await transaction(async tx => {
    await requireSuperAdmin(tx, req.user.id);
    const company = await internalCompany(tx, req.body.companyId);
    const created = await tx.user.create({ data: { name, email, role, phone, password: hash, companyId: company.id }, select });
    await audit(tx, req.user, 'INTERNAL_USER_CREATED', 'User', created.id, { role });
    return created;
  }); res.status(201).json(user);
}));
router.put('/:id', updateUserRules, validate, route(async (req, res) => {
  const { name, phone, role, isActive } = req.body;
  fail(req.params.id !== req.user.id || (isActive !== false && (!role || role === 'SUPER_ADMIN')), 'You cannot deactivate or demote your own Super Admin account', 409);
  const user = await transaction(async tx => {
    await requireSuperAdmin(tx, req.user.id);
    const current = await tx.user.findUnique({ where: { id: req.params.id } }); fail(current, 'User not found', 404);
    await protectLastSuperAdmin(tx, current, role, isActive);
    fail(isInternalRole(role || current.role), 'Only Super Admin and Admin accounts are allowed');
    const company = await internalCompany(tx, req.body.companyId);
    const updated = await tx.user.update({ where: { id: current.id }, data: { name, phone, role, isActive, companyId: company.id }, select });
    await audit(tx, req.user, 'INTERNAL_USER_UPDATED', 'User', current.id, { role: updated.role, isActive: updated.isActive });
    return updated;
  });
  if (!user.isActive || req.body.role) disconnectUser(req, user.id);
  res.json(user);
}));
router.delete('/:id', route(async (req, res) => {
  fail(req.params.id !== req.user.id, 'Cannot deactivate your own account', 409);
  await transaction(async tx => {
    await requireSuperAdmin(tx, req.user.id);
    const current = await tx.user.findUnique({ where: { id: req.params.id } }); fail(current, 'User not found', 404);
    await protectLastSuperAdmin(tx, current, undefined, false);
    await tx.user.update({ where: { id: req.params.id }, data: { isActive: false } });
    await audit(tx, req.user, 'INTERNAL_USER_DEACTIVATED', 'User', req.params.id);
  }); disconnectUser(req, req.params.id); res.json({ message: 'User deactivated' });
}));
module.exports = router;
