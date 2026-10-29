// Document availability and field work are independent of the admin's manual review.
const sources=require('./packingSources');
const managed=bill=>bill.registerData?.workflowVersion===2;
const blAvailable=bill=>Boolean(bill.billNumber&&!bill.registerData?.documentState?.blMissing&&(bill.document?.filename||bill.files?.some(f=>f.filename&&['DRAFT','FINAL','LEGACY'].includes(f.category))));
function status(bill){
 const type=sources.preferredType(bill),source=sources.sourceOf(bill,type),hasPL=(bill.files||[]).some(f=>f.filename&&f.category==='PACKING_LIST');
 const docs=blAvailable(bill)&&(bill.registerData?.register?.documentPolicy!=='BL_AND_PACKING'||hasPL);
 const inspectionStatus=require('./packingFieldChecks').status(bill),inspected=inspectionStatus==='CONFIRMED',bons=(bill.registerData?.driverBons||[]).filter(b=>b.status!=='CANCELLED');
 const field=inspected&&bons.every(b=>b.status==='COMPLETED')?'COMPLETED':inspected||inspectionStatus==='DRAFT'||bons.some(b=>['IN_PROGRESS','COMPLETED'].includes(b.status))?'IN_PROGRESS':'NOT_STARTED';
 return {version:3,documents:docs?'COMPLETE':'INCOMPLETE',sourceType:type,sourcePrepared:source.status==='CONFIRMED'&&source.groups?.length>0,field};
}
module.exports={managed,blAvailable,status};
