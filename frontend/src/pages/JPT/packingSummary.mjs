export function packingNumber(value, { t = key => key, locale = 'id-ID' } = {}) {
  return value === null || value === undefined || value === '' ? t('Not stated') : Number(value).toLocaleString(locale, { maximumFractionDigits: 4 });
}
export function packingSummaryValue(summary, key, options = {}) {
  const t = options.t || (key => key);
  const missing = summary.missingDocuments?.[key] || 0;
  if (!missing) return packingNumber(summary[key], options);
  const known = summary.knownTotals?.[key];
  return `${known == null ? t('Not stated') : `${t('Partial total')}: ${packingNumber(known, options)}`} · ${t('Not stated in {count} documents', { count: missing }).replaceAll('{count}', String(missing))}`;
}
