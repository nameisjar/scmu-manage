import { formatDate, formatMoney } from './format.mjs';
const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
function print(html) {
  const target = window.open('', '_blank', 'width=900,height=950'); if (!target) return;
  target.document.write(html); target.document.close();
  Promise.all(Array.from(target.document.images, image => image.decode().catch(() => {}))).then(() => { target.focus(); target.print(); });
}
function layout(title, content, language) {
  return `<!doctype html><html lang="${escape(language)}"><head><meta charset="utf-8"><title>${escape(title)}</title><style>body{font:14px Arial;color:#18181b;margin:40px}header{display:flex;gap:16px;align-items:center;border-bottom:3px solid #2563eb;padding-bottom:20px;margin-bottom:24px}h1{font-size:24px}table{width:100%;border-collapse:collapse;margin:24px 0}th,td{padding:12px;border-bottom:1px solid #ddd;text-align:left}th{background:#eee}p{line-height:1.7;white-space:pre-wrap}.total{text-align:right;font-size:20px;font-weight:bold}</style></head><body><header><img width="64" height="64" src="${escape(new URL('/scmu-logo.svg', window.location.origin).href)}"><div><b>SCMU</b><h1>${escape(title)}</h1></div></header>${content}</body></html>`;
}
export function printQuotation(quotation, { t, locale, language }) {
  const e = escape;
  const total = quotation.totalAmount ?? quotation.totals?.revenue ?? quotation.items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.sellRate), 0);
  const html = `<p><b>${e(quotation.quotationNumber)}</b><br>${e(quotation.customer?.name || '')}<br>${e(quotation.title)}<br>${e(quotation.originCity)} → ${e(quotation.destCity)}<br>${e(t('Valid Until'))}: ${e(formatDate(quotation.validUntil, locale))}</p><p>${e(quotation.cargoDescription)}</p><table><thead><tr><th>${e(t('Description'))}</th><th>${e(t('Quantity'))}</th><th>${e(t('Sell rate'))}</th><th>${e(t('Total'))}</th></tr></thead><tbody>${quotation.items.map(item => `<tr><td>${e(item.description)}</td><td>${e(item.quantity)} ${e(item.unit)}</td><td>${e(formatMoney(item.sellRate, quotation.currency, locale))}</td><td>${e(formatMoney(Number(item.quantity) * Number(item.sellRate), quotation.currency, locale))}</td></tr>`).join('')}</tbody></table><p class="total">${e(t('Total'))}: ${e(formatMoney(total, quotation.currency, locale))}</p><p>${e(quotation.terms || '')}</p>`;
  print(layout(t('Commercial quotation'), html, language));
}
export function printDeliveryNote(job, shipment, { t, locale, language }) {
  const e = escape;
  print(layout(t('Delivery note'), `<p><b>${e(shipment.shipmentNumber)}</b> · ${e(job.jobNumber)}<br>${e(t('SCMU company'))}: ${e(job.customer.name)}<br>${e(t('Route'))}: ${e(shipment.originCity)} → ${e(shipment.destCity)}<br>${e(t('Loading Date'))}: ${e(formatDate(shipment.loadingDate, locale))}<br>${e(t('Recipient'))}: ${e(job.recipientName || '')}<br>${e(job.deliveryAddress || '')}</p><table><tr><th>${e(t('Cargo description'))}</th><th>${e(t('Packages'))}</th><th>${e(t('Weight (kg)'))}</th></tr><tr><td>${e(job.cargoDescription)}</td><td>${e(job.packages)}</td><td>${e(job.weightKg)}</td></tr></table><p>${e(t('Driver'))}: ${e(shipment.driver?.name || '')}<br>${e(t('Vehicle'))}: ${e(shipment.vehicle?.registrationNo || '')}</p><p style="margin-top:80px">${e(t('Received by'))}: ____________________ &nbsp; ${e(t('Date'))}: ____________________</p>`, language));
}
