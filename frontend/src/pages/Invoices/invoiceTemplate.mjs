import { DEFAULT_LANGUAGE, LOCALES, isLanguage, translate } from '../../i18n/translations.mjs';
import { formatMoney } from '../../utils/format.mjs';

function escapeText(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function escapeRecord(value) {
  if (typeof value === 'string') return escapeText(value);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(escapeRecord);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, escapeRecord(item)]));
  return value;
}

export function createInvoiceHtml(data, { language: requestedLanguage = DEFAULT_LANGUAGE, logoUrl = '/scmu-logo.svg', generatedAt = new Date() } = {}) {
  const language = isLanguage(requestedLanguage) ? requestedLanguage : DEFAULT_LANGUAGE;
  const locale = LOCALES[language];
  const tr = key => escapeText(translate(language, key));
  const invoice = escapeRecord(data);
  const fmt = value => escapeText(formatMoney(value, data.currency || 'IDR', locale));
  const fmtDate = value => value ? new Date(value).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  return `<!DOCTYPE html>
<html lang="${language}">
<head>
  <meta charset="utf-8">
  <title>${tr("Invoice")} ${invoice.invoiceNumber}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; color: #111; background: #fff; padding: 40px; font-size: 13px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; border-bottom: 3px solid #2563eb; padding-bottom: 20px; }
    .brand { font-size: 24px; font-weight: 800; letter-spacing: -0.5px; }
    .brand span { color: #2563eb; }
    .inv-label { text-align: right; }
    .inv-label h2 { font-size: 22px; font-weight: 700; color: #333; }
    .inv-label .inv-num { font-family: monospace; font-size: 14px; color: #2563eb; margin-top: 4px; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 28px; }
    .meta-box { background: #f9f9f9; border: 1px solid #eee; border-radius: 8px; padding: 14px; }
    .meta-box h4 { font-size: 10px; text-transform: uppercase; color: #999; letter-spacing: 1px; margin-bottom: 8px; }
    .meta-box p { font-size: 13px; color: #222; line-height: 1.6; }
    .meta-box .highlight { font-weight: 600; font-size: 14px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    th { background: #1c1c1e; color: #fff; padding: 10px 14px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
    td { padding: 10px 14px; border-bottom: 1px solid #eee; }
    .amount { text-align: right; font-family: monospace; }
    .totals-table { width: 320px; margin-left: auto; }
    .totals-table td { padding: 6px 14px; }
    .totals-table .grand-total td { background: #1c1c1e; color: #fff; font-weight: 700; font-size: 15px; border-radius: 4px; }
    .totals-table .grand-total .amount { color: #2563eb; }
    .status-badge { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 600; letter-spacing: 0.5px;
      background: ${invoice.status === 'PAID' ? '#d1fae5' : invoice.status === 'DISPUTED' ? '#fee2e2' : '#dbeafe'};
      color: ${invoice.status === 'PAID' ? '#065f46' : invoice.status === 'DISPUTED' ? '#991b1b' : '#1e40af'}; }
    .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #eee; display: flex; justify-content: space-between; color: #999; font-size: 11px; }
    .notes { margin-top: 16px; padding: 12px 16px; background: #eff6ff; border-left: 3px solid #2563eb; border-radius: 4px; font-size: 12px; color: #666; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand" style="display:flex;align-items:center;gap:12px"><img src="${escapeText(logoUrl)}" alt="Logo SCMU" width="56" height="56" /><span>SCMU</span></div>
      <div style="color:#999;font-size:12px;margin-top:4px;">${tr("Management System")}</div>
    </div>
    <div class="inv-label">
      <h2>${tr("INVOICE")}</h2>
      <div class="inv-num">${invoice.invoiceNumber}</div>
      <div style="margin-top:8px"><span class="status-badge">${tr(invoice.status)}</span></div>
    </div>
  </div>

  <div class="meta">
    <div class="meta-box">
      <h4>${tr("Bill To")}</h4>
      <p class="highlight">${invoice.company?.name || '—'}</p>
      ${invoice.company?.email ? `<p>${invoice.company.email}</p>` : ''}
      ${invoice.company?.phone ? `<p>${invoice.company.phone}</p>` : ''}
      ${invoice.company?.address ? `<p>${invoice.company.address}</p>` : ''}
    </div>
    <div class="meta-box">
      <h4>${tr("Invoice Details")}</h4>
      <p><b>${tr("Invoice Date")}:</b> ${fmtDate(invoice.invoiceDate)}</p>
      ${invoice.dueDate ? `<p><b>${tr("Due Date")}:</b> ${fmtDate(invoice.dueDate)}</p>` : ''}
      ${invoice.paidDate ? `<p><b>${tr("Paid Date")}:</b> ${fmtDate(invoice.paidDate)}</p>` : ''}
      <p><b>${tr("Currency")}:</b> ${invoice.currency || 'IDR'}</p>
    </div>
  </div>

  ${invoice.shipment ? `
  <div class="meta-box" style="margin-bottom:24px">
    <h4>${tr("Shipment Details")}</h4>
    <p><b>${tr("Shipment #")}:</b> ${invoice.shipment.shipmentNumber}</p>
    <p><b>${tr("Route")}:</b> ${invoice.shipment.originCity} → ${invoice.shipment.destCity}</p>
    ${invoice.shipment.loadingDate ? `<p><b>${tr("Loading Date")}:</b> ${fmtDate(invoice.shipment.loadingDate)}</p>` : ''}
  </div>` : ''}

  ${invoice.job ? `<div class="meta-box" style="margin-bottom:24px"><h4>${tr('Job order')}</h4><p>${invoice.job.jobNumber} · ${invoice.job.title || ''}</p><p>${invoice.job.originCity || ''} → ${invoice.job.destCity || ''}</p></div>` : ''}

  <table>
    <thead>
      <tr>
        <th>${tr("Description")}</th>
        <th class="amount">${tr("Amount")} (${invoice.currency || 'IDR'})</th>
      </tr>
    </thead>
    <tbody>
      ${invoice.items?.length ? invoice.items.map(item => `<tr><td>${item.description}</td><td class="amount">${fmt(item.amount)}</td></tr>`).join('') : `<tr>
        <td>${tr("Freight Charges")} — ${invoice.shipment?.originCity || ''} ${tr('to')} ${invoice.shipment?.destCity || ''}</td>
        <td class="amount">${fmt(invoice.freightAmount)}</td>
      </tr>`}
      ${invoice.gstAmount > 0 ? `<tr><td>${tr("Tax")}</td><td class="amount">${fmt(invoice.gstAmount)}</td></tr>` : ''}
    </tbody>
  </table>

  <table class="totals-table">
    <tr>
      <td>${tr("Subtotal (Freight)")}</td>
      <td class="amount">${fmt(invoice.freightAmount)}</td>
    </tr>
    ${invoice.gstAmount > 0 ? `<tr><td>${tr('Tax amount')}</td><td class="amount">${fmt(invoice.gstAmount)}</td></tr>` : ''}
    <tr class="grand-total">
      <td><b>${tr("TOTAL DUE")}</b></td>
      <td class="amount"><b>${fmt(invoice.totalAmount)}</b></td>
    </tr>
    ${invoice.balance !== undefined ? `<tr><td>${tr('Outstanding balance')}</td><td class="amount">${fmt(invoice.balance)}</td></tr>` : ''}
  </table>

  ${invoice.notes ? `<div class="notes"><b>${tr("Notes")}:</b> ${invoice.notes}</div>` : ''}

  <div class="footer">
    <span>SCMU ${tr("Management System")} · ${tr("Generated")} ${generatedAt.toLocaleString(locale)}</span>
    <span>${tr("This is a system-generated invoice.")}</span>
  </div>
</body>
</html>`;
}
