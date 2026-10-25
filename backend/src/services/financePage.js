const { choice, CURRENCIES } = require('./jpt');
const { arrayPage } = require('./pagination');
function financePage(payload, query) {
  const currency=choice(query.currency||'IDR',CURRENCIES,'Currency');
  const tab=choice(query.financeTab||'overview',['overview','receivables','payables','internal'],'Finance view');
  const search=String(query.search||'').trim().toLocaleLowerCase();const outstanding=query.outstanding==='1';
  const matching=payload.jobs.filter(job=>job.currency===currency&&(!search||[job.jobNumber,job.title,job.originCity,job.destCity,job.customerReference].filter(Boolean).join(' ').toLocaleLowerCase().includes(search)));
  const ids=new Set(matching.map(job=>job.id));
  const related=rows=>rows.filter(row=>row.currency===currency&&ids.has(row.jobId)&&(!outstanding||Number(row.balance)>0));
  const tables={overview:matching.filter(job=>!outstanding||['receivable','payable','internalOutstanding'].some(key=>Number(job.financials[key])>0)),receivables:related(payload.invoices),payables:related(payload.payables),internal:related(payload.internalExpenses)};
  const counts=Object.fromEntries(Object.entries(tables).map(([key,rows])=>[key,rows.length]));
  const result=query.export==='1'?{data:tables[tab],total:tables[tab].length}:arrayPage(tables[tab],query);
  const activeIds=new Set(result.data.map(row=>tab==='overview'?row.id:row.jobId));
  const overviewIds=new Set(tables.overview.map(row=>row.id));
  // Job context contains only the active page, including the complete data needed
  // by its detail modals. Currency KPI totals always cover the full dataset.
  return {groups:payload.groups,counts,pagination:{...result,data:undefined},jobs:matching.filter(job=>activeIds.has(job.id)),invoices:tab==='receivables'?result.data:[],payables:tab==='payables'?result.data:[],internalExpenses:tab==='internal'?result.data:[],alerts:payload.alerts.filter(row=>overviewIds.has(row.jobId)),data:result.data};
}
module.exports = { financePage };
