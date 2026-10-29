const numberKey = value => String(value || '').trim().toUpperCase().replace(/\s+/g, '');
export function resolveBatchBL(targets = [], number) {
  const bills = targets.find(target => numberKey(target.number) === numberKey(number))?.bills || [];
  if (bills.length > 1) return { kind: 'AMBIGUOUS', bills };
  if (bills.length === 1) return { kind: bills[0].readOnly || bills[0].archivedAt ? 'READ_ONLY' : 'EXISTING', bill: bills[0], bills };
  return { kind: 'NEW', bills };
}
export function batchRow(data) {
  return { ...data, key: data.id, status: data.saved ? data.saved.trashedBillIds?.length ? 'TRASHED' : data.saved.attachmentsPresent === false ? 'REMOVED' : 'SAVED' : 'READY', reviewed: false, fields: structuredClone(data.fields || {}), references: (data.referenceBillNumbers || []).join(', '), action: resolveBatchBL(data.targets, data.fields?.billNumber).kind === 'EXISTING' ? 'ATTACH' : 'CREATE', category: 'FINAL' };
}
export function batchOutcome(rows) {
  const saved = rows.filter(row => row.status === 'SAVED');
  const created = new Set(saved.flatMap(row => row.saved?.createdBillIds || []));
  const attached = new Set(saved.flatMap(row => row.saved?.attachedBillIds || []).filter(id => !created.has(id)));
  const billIds = [...new Set(saved.flatMap(row => row.saved?.activeBillIds || row.saved?.billIds || []))];
  return { saved: saved.length, pending: rows.filter(row => !['SAVED', 'REMOVED', 'TRASHED'].includes(row.status)).length, removed: rows.filter(row => row.status === 'REMOVED').length, trashed: rows.filter(row => row.status === 'TRASHED').length, created: created.size, attached: attached.size, billIds,journeyIds:[...new Set(saved.flatMap(row=>row.saved?.journeyIds||[]))] };
}
