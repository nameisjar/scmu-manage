const modules = {
  'sales-quotations': 'Commercial quotations', jobs: 'Job orders', shipments: 'Shipments',
  rfq: 'RFQ Indenting', approvals: 'Director approvals', 'job-finance': 'Job finance',
  fleet: 'Fleet Management', drivers: 'Drivers', companies: 'Companies', invoices: 'Invoices',
  analytics: 'Analytics', reports: 'Reports', users: 'User Management', settings: 'Settings',
};
export function pageLabel(url) {
  const [module, id] = url.split('?')[0].split('/').filter(Boolean);
  if (!module) return 'Dashboard';
  if (id && id !== 'new') return { jobs: 'Job order', shipments: 'Shipment', rfq: 'RFQ', 'sales-quotations': 'Quotation' }[module] || modules[module];
  return modules[module] || 'Dashboard';
}
export function detailModule(pathname) {
  return /^\/(sales-quotations|jobs|shipments|rfq)\/[^/]+\/?$/.exec(pathname)?.[1] || null;
}
export function localPage(url) {
  if (typeof url !== 'string' || !url.startsWith('/') || url.startsWith('//') || /[\\\r\n]/.test(url)) return false;
  const path = url.split('?')[0].split('#')[0];
  return path === '/' || Object.keys(modules).some(module => path === `/${module}` || path.startsWith(`/${module}/`));
}
export function positivePage(value) {
  const page = Number(value); return Number.isSafeInteger(page) && page > 0 ? page : 1;
}
