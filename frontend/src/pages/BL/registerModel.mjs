export function registerPayload(form) {
  const keys = ['journeyId','version', 'billNumber', 'carrierName', 'vesselName', 'voyageNumber', 'portOfLoading', 'portOfDischarge', 'shipperName', 'consigneeName', 'notes', 'revisionNote','vesselId','voyageId','issueDate','onBoardDate','notifyPartyName','grossWeightKg','importSessionId','importConfirmed','importCategory'];
  const registerKeys = ['dateMeaning','departureDate','arrivalDate','quantity20','quantity21','quantity40','cargoDescription','partyName','partyText','reference1','reference2','additionalDate1','additionalDate2','additionalNotes','documentPolicy','includeInPackingHeader','billingStatus','pph23Applicable'];
  const register = { ...Object.fromEntries(registerKeys.filter(key=>form.register?.[key]!==undefined).map(key=>[key,form.register[key]])), dateMeaning: form.register?.dateMeaning || 'UNCONFIRMED' };
  for (const key of ['quantity20','quantity21','quantity40']) {
    const value = register[key];
    if (value === '' || value === null || value === undefined) register[key] = null;
    else if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value))) throw Error('Jumlah harus berupa bilangan bulat positif atau nol.');
    else register[key] = Number(value);
  }
  const amount = form.registerAmount;
  if (amount !== '' && amount !== null && amount !== undefined && (typeof amount !== 'string' || !/^-?\d+(?:\.\d{1,2})?$/.test(amount))) throw Error('Nominal harus berupa teks desimal (maksimal dua angka desimal), tanpa pemisah ribuan.');
  return { ...Object.fromEntries(keys.filter(key => form[key] !== undefined).map(key => [key, form[key]])), ...(Array.isArray(form.containers)?{containers:form.containers}:{}), registerAmount: amount === '' || amount == null ? null : amount, register };
}
export function isRegisterDeleted(row = {}) { return Boolean(row.deleted || row.trash?.deletedAt || row.registerData?.trash?.deletedAt); }
export function isRegisterArchived(row = {}) { return Boolean(isRegisterDeleted(row) || row.archived || row.archivedAt || row.registerData?.archivedAt || row.register?.archivedAt); }
export function registerDocumentAvailability(row = {}) {
 const flags = row.documentAvailability || row.availability || {};
 return { billOfLading: Object.hasOwn(flags,'billOfLading')?Boolean(flags.billOfLading):Boolean(row.documentSummary?.hasBL || row.document?.filename || ['SEA_FINAL_RECEIVED','SEA_DRAFT_RECEIVED'].includes(row.receiptStatus) || row.files?.some(file=>['DRAFT','FINAL'].includes(file.category))), packingList: Object.hasOwn(flags,'packingList')?Boolean(flags.packingList):Boolean(row.documentSummary?.hasPackingList || row.files?.some(file=>file.category==='PACKING_LIST') || row.allocations?.some(item=>item.packingList?.document?.filename)) };
}
export function formatRegisterAmount(value) {
  if (value === null || value === undefined || value === '') return '—';
  const match = String(value).match(/^(-?)(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) return '—';
  return `Rp ${match[1]}${match[2].replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${(match[3] || '').padEnd(2, '0')}`;
}
export function tariffUnitCounts(bill={}) {
 const containers=Array.isArray(bill.containers)?bill.containers:[];
 if(containers.some(row=>row?.size))return Object.fromEntries(['20','21','40'].map(size=>[size,containers.filter(row=>row.size===size).length]));
 return Object.fromEntries(['20','21','40'].map(size=>[size,Number(bill.register?.[`quantity${size}`]||0)]));
}
export function selectableTariffs(rows=[],bill={}) {
 const counts=tariffUnitCounts(bill);const carrier=(bill.carrierName||'').trim().toLowerCase();const now=new Date();
 return rows.filter(row=>row.enabled&&!row.confirmationRequired&&(!row.effectiveFrom||new Date(row.effectiveFrom)<=now)&&(!row.effectiveTo||new Date(row.effectiveTo)>=now)&&(!row.carrierName||row.carrierName.trim().toLowerCase()===carrier)&&(row.unit==='BL'||counts[row.size||'20']>0||!row.size&&Object.values(counts).some(Boolean)));
}
