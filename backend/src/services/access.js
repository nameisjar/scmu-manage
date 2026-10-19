const INTERNAL_ROLES = Object.freeze(['SUPER_ADMIN', 'ADMIN']);
const INTERNAL_COMPANY_ID = 'dd597ed2-fad1-5482-ab82-8f2bb84d8852';
const isInternalRole = role => INTERNAL_ROLES.includes(role);
async function internalCompany(tx, requestedId) {
  // Historical relation names remain compatible; their owner is always SCMU, not a customer master.
  if (requestedId && requestedId !== INTERNAL_COMPANY_ID) throw Object.assign(new Error('Transactions must use the internal SCMU company'), { status: 422 });
  const company = await tx.company.findUnique({ where: { id: INTERNAL_COMPANY_ID } });
  if (!company?.isInternal || !company.isActive) throw Object.assign(new Error('Internal SCMU company is not configured'), { status: 409 });
  return company;
}
module.exports = { INTERNAL_ROLES, INTERNAL_COMPANY_ID, isInternalRole, internalCompany };
