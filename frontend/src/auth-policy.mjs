export const INTERNAL_ROLES = Object.freeze(['SUPER_ADMIN', 'ADMIN']);
export const isInternalRole = role => INTERNAL_ROLES.includes(role);
