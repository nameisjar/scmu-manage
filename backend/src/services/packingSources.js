const {fail,choice,text}=require('./jpt');
const canonical=v=>String(v||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const same=(a,b)=>Boolean(a&&b&&canonical(a)===canonical(b));
function sourceIdentity(value={}){return Object.fromEntries(['vesselName','voyageNumber','billNumber'].map(key=>[key,text(value[key],key,200,true)]));}
const TYPES=['PARTNER_PL','RECEIVING_REPORT','MANUAL'];
function preferredType(bill){const type=bill.registerData?.internalPackingList?.sourceType;return TYPES.includes(type)?type:bill.registerData?.manualPacking?.groups?.length?'MANUAL':bill.registerData?.receivingReport?.groups?.length?'RECEIVING_REPORT':'PARTNER_PL';}
function basis(input={}){
 fail(input&&typeof input==='object'&&!Array.isArray(input),'Isi dasar perbandingan yang valid.');
 return {scope:choice(input.scope||'UNCONFIRMED',['UNCONFIRMED','FULL','PARTIAL'],'Cakupan PL'),billUnit:input.billUnit?text(input.billUnit,'Satuan jumlah B/L',30).toUpperCase():null};
}
function sourceOf(bill,type){
 choice(type,TYPES,'Sumber Packing List');
 return (type==='MANUAL'?bill.registerData?.manualPacking:type==='RECEIVING_REPORT'?bill.registerData?.receivingReport:bill.registerData?.operational?.packing)||{status:'DRAFT',groups:[]};
}
module.exports={TYPES,preferredType,sourceOf,sourceIdentity,basis};
