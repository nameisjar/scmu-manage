export const FINANCE_TABS = ['overview', 'receivables', 'payables', 'internal'];
export const DRAFT_INVOICE_STATUSES = ['PENDING', 'SUBMITTED', 'UNDER_REVIEW', 'CANCELLED'];
export const isPostedInvoice = invoice => !DRAFT_INVOICE_STATUSES.includes(invoice.status);

// Project the server's amounts without recalculating financial balances.
export function financeView(data, { currency, search = '', outstandingOnly = false }) {
  const query = search.trim().toLocaleLowerCase();
  const matchingJobs = (data?.jobs || []).filter(job => job.currency === currency && (!query ||
    [job.jobNumber, job.title, job.originCity, job.destCity, job.customerReference].filter(Boolean).join(' ').toLocaleLowerCase().includes(query)));
  const ids = new Set(matchingJobs.map(job => job.id));
  const hasBalance = row => !outstandingOnly || Number(row.balance) > 0;
  const jobs = matchingJobs.filter(job => !outstandingOnly || ['receivable','payable','internalOutstanding'].some(key => Number(job.financials[key]) > 0));
  const visibleIds = new Set(jobs.map(job => job.id));
  const related = rows => (rows || []).filter(row => row.currency === currency && ids.has(row.jobId) && hasBalance(row));
  return {
    jobs,
    invoices: related(data?.invoices).filter(isPostedInvoice),
    payables: related(data?.payables),
    internal: related(data?.internalExpenses),
    alerts: (data?.alerts || []).filter(row => data?.pagination || visibleIds.has(row.jobId)).map((row,index) => ({ ...row, id: `${row.jobId}-${index}` })),
    jobById: new Map(matchingJobs.map(job => [job.id,job])),
  };
}

export function financeExport(tab, view, t = value => value) {
  let labels; let rows;
  if (tab === 'receivables') {
    labels = ['Invoice #','Job order','Currency','Due Date','Outstanding balance','Days overdue','Aging bucket'];
    rows = view.invoices.map(row => [row.invoiceNumber,row.jobNumber,row.currency,row.dueDate || '',row.balance,row.daysOverdue,t(row.agingBucket)]);
  } else if (tab === 'payables' || tab === 'internal') {
    labels = ['Job order','Currency',tab === 'payables' ? 'Vendor' : 'Cost category','Description','Due Date','Outstanding balance','Days overdue'];
    rows = view[tab].map(row => [row.jobNumber,row.currency,tab === 'payables' ? row.vendorName : t(row.costCategory),row.description,row.dueDate || '',row.balance,row.daysOverdue]);
  } else {
    // Keep the existing ledger columns and exact decimal strings.
    labels = ['Job order','SCMU company','Currency','Approved revenue','Approved cost','Internal operating cost','Vendor bill','Internal expenses paid','Internal costs outstanding','Billed gross profit','Receivable','Vendor payable'];
    rows = view.jobs.map(job => [job.jobNumber,job.customer.name,job.currency,...['revenue','approvedCost','internalCost','vendorCost','internalExpensePaid','internalOutstanding','grossProfit','receivable','payable'].map(key => job.financials[key])]);
  }
  return { headers: labels.map(label => t(label)), rows };
}
