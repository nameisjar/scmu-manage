export function formatMoney(value, currency = 'IDR', locale = 'id-ID') {
  return new Intl.NumberFormat(locale, { style: 'currency', currency, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(Number(value || 0));
}
export function formatDate(value, locale = 'id-ID', withTime = false) {
  if (!value) return '—';
  const date = new Date(value);
  return withTime ? date.toLocaleString(locale) : date.toLocaleDateString(locale);
}
export function downloadCsv(filename, headers, rows) {
  const cell = value => {
    let text = String(value ?? '');
    if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  const blob = new Blob(['\uFEFF', [headers, ...rows].map(row => row.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = filename; anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
