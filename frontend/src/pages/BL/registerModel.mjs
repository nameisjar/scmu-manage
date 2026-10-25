export function datetimeInput(value) {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
export function datetimeValue(value) { return value ? new Date(value).toISOString() : null; }
export function selectableTariffs(tariffs = [], containers = []) {
  return tariffs.filter(row => row.enabled === true && !row.confirmationRequired && (!row.size || containers.some(container => container.size === row.size)));
}
export function registerPayload(form) {
  const keys = ['version', 'registerNumber', 'billNumber', 'carrierName', 'vesselName', 'voyageNumber', 'portOfLoading', 'portOfDischarge', 'shipperName', 'consigneeName', 'notes', 'revisionNote'];
  return { ...Object.fromEntries(keys.filter(key => form[key] !== undefined).map(key => [key, form[key]])), register: { ...form.register, dateMeaning: form.register?.dateMeaning || 'UNCONFIRMED' }, containers: (form.containers || []).map(row => ({ ...row, size: row.size || null })) };
}
export function containerCounts(containers = []) {
  return containers.reduce((counts, row) => { counts[['20', '21', '40'].includes(row.size) ? row.size : 'unknown']++; return counts; }, { '20': 0, '21': 0, '40': 0, unknown: 0 });
}
