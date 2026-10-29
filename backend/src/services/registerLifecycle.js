const { Prisma } = require('@prisma/client');
const notTrashed = { OR: [
  { registerData: { path: ['trash', 'deletedAt'], equals: Prisma.AnyNull } },
  { registerData: { path: ['trash', 'deletedAt'], equals: '' } },
] };
const trashed = { NOT: notTrashed };
const isTrashed = bill => Boolean(bill?.registerData?.trash?.deletedAt);
const currentNumberWhere = (number, excludeId) => ({ billNumber: { equals: number.trim(), mode: 'insensitive' }, AND: [notTrashed], ...(excludeId ? { id: { not: excludeId } } : {}) });
module.exports = { notTrashed, trashed, isTrashed, currentNumberWhere };
