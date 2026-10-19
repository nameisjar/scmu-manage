// Integration-test adapter: explicitly exercise Admin submission and Director review
// for workflows that used to call finalization endpoints directly.
const assert = require('node:assert/strict');
module.exports = function governedRequest(api) {
  assert.ok(['localhost','127.0.0.1'].includes(new URL(api).hostname));
  let actors; const approvalIds=[]; const started = new Date();
  async function raw(path, token, body, method = body ? 'POST' : 'GET') {
    const response=await fetch(`${api}/api${path}`,{method,headers:{...(token&&{Authorization:`Bearer ${token}`}),...(!(body instanceof FormData)&&{'Content-Type':'application/json'})},body:body instanceof FormData?body:body&&JSON.stringify(body),signal:AbortSignal.timeout(20000)});
    return {status:response.status,data:await response.json()};
  }
  async function auth() {
    if(!actors) { const admin=await raw('/auth/login',null,{email:'operasional@scmu.local',password:'Ops@1234'}); const director=await raw('/auth/login',null,{email:'admin@scmu.local',password:'Admin@1234'}); assert.equal(admin.status,200);assert.equal(director.status,200);actors={admin:admin.data.token,director:director.data.token}; } return actors;
  }
  async function approve(action, entityId, payload={}, decision='APPROVED') {
    const {admin,director}=await auth(); const submitted=await raw('/approvals',admin,{action,entityId,payload,note:'Integration workflow fixture'});
    if(submitted.status>=400) return submitted; approvalIds.push(submitted.data.id);
    const reviewed=await raw(`/approvals/${submitted.data.id}/review`,director,{decision,note:'Integration check'});
    return reviewed.status>=400?reviewed:{status:200,data:reviewed.data};
  }
  async function mapped(path, token, body, method) {
    const {admin}=await auth(); let match; let approval;
    if(method==='POST'&&(match=path.match(/^\/jobs\/([^/]+)\/charges\/([^/]+)\/review$/))) { approval=await approve('CHARGE_APPROVE',match[2],{actualAmount:body.actualAmount},body.status==='REJECTED'?'REJECTED':'APPROVED'); if(approval.status>=400)return approval;return{status:200,data:(await raw(`/jobs/${match[1]}`,admin)).data.charges.find(row=>row.id===match[2])}; }
    if(method==='POST'&&(match=path.match(/^\/jobs\/([^/]+)\/shipments$/))&&(body.transportSource==='EXTERNAL'||body.carrierId||['SEA','AIR','RAIL'].includes(body.mode))) { approval=await approve('TRANSPORT_BOOK',match[1],body); if(approval.status>=400)return approval;return{status:201,data:(await raw(`/shipments/${approval.data.resultId}`,admin)).data}; }
    if(method==='PUT'&&(match=path.match(/^\/shipments\/([^/]+)$/))) {
      const current=await raw(path,admin); if(current.status>=400)return current;
      const changed=['transportSource','mode','carrierId','quoteId','vehicleId','driverId'].some(key=>body[key]!==undefined&&(body[key]||null)!==(current.data[key]||null));
      if((changed&&(body.transportSource==='EXTERNAL'||current.data.transportSource==='EXTERNAL'))||(body.freightAmount!==undefined&&Number(body.freightAmount)!==Number(current.data.freightAmount))) { approval=await approve('TRANSPORT_CHANGE',match[1],body); if(approval.status>=400)return approval;return raw(path,admin); }
    }
    if(method==='POST'&&(match=path.match(/^\/jobs\/([^/]+)\/packing-lists\/([^/]+)\/finalize$/))) { const current=await raw(`/jobs/${match[1]}/packing-lists/${match[2]}`,admin); if(current.status>=400)return current;
      if(current.data.direction==='OUTBOUND'||current.data.receiptStatus==='DISCREPANCY') { approval=await approve(current.data.direction==='OUTBOUND'?'PACKING_FINALIZE':'PACKING_EXCEPTION',match[2],body); if(approval.status>=400)return approval;return raw(`/jobs/${match[1]}/packing-lists/${match[2]}`,admin); }
    }
    if(method==='POST'&&(match=path.match(/^\/jobs\/([^/]+)\/packing-header\/finalize$/))) { const head=await raw(`/jobs/${match[1]}/packing-header`,admin);approval=await approve('PACKING_HEADER_FINALIZE',head.data.data?.id||'missing',body); if(approval.status>=400)return approval;return{status:200,data:(await raw(`/jobs/${match[1]}/packing-header`,admin)).data.data}; }
    if(method==='POST'&&(match=path.match(/^\/jobs\/([^/]+)\/close$/))) { approval=await approve('JOB_CLOSE',match[1]); if(approval.status>=400)return approval;return raw(`/jobs/${match[1]}`,admin); }
    if(method==='POST'&&(match=path.match(/^\/jobs\/([^/]+)\/payments$/))&&body.direction!=='RECEIVABLE') { approval=await approve('PAYMENT_AUTHORIZE',match[1],body); if(approval.status>=400)return approval;return raw(path,token,{...body,approvalId:approval.data.id,notes:body.notes||'Integration payment proof'}); }
    if(method==='POST'&&(match=path.match(/^\/sales-quotations\/([^/]+)\/status$/))&&body.status==='SENT') { const current=await raw(`/sales-quotations/${match[1]}`,admin);if(current.data.status==='DRAFT'){approval=await approve('SALES_QUOTATION_APPROVE',match[1]);if(approval.status>=400)return approval;} }
    if(method==='POST'&&(match=path.match(/^\/rfq\/([^/]+)\/award\/([^/]+)$/))) { approval=await approve('VENDOR_AWARD',match[2]);if(approval.status>=400)return approval;return{status:200,data:{message:'Director approved vendor selection'}}; }
    if(method==='POST'&&(match=path.match(/^\/jobs\/([^/]+)\/documents\/([^/]+)\/verify$/))) { const job=(await raw(`/jobs/${match[1]}`,admin)).data;const doc=job.documents?.find(row=>row.id===match[2]);if(job.jobType==='SENDER'&&doc?.type==='PACKING_LIST'&&!doc.packingList){approval=await approve('DOCUMENT_VERIFY',doc.id);if(approval.status>=400)return approval;return{status:200,data:(await raw(`/jobs/${match[1]}`,admin)).data.documents.find(row=>row.id===doc.id)};} }
    if(method==='PUT'&&(match=path.match(/^\/jobs\/([^/]+)\/operations\/([^/]+)$/))&&['APPROVED','SETTLED','REJECTED'].includes(body.status)) {const job=(await raw(`/jobs/${match[1]}`,admin)).data;const op=job.operations?.find(row=>row.id===match[2]);if(op?.kind==='CLAIM'){approval=await approve('CLAIM_DECISION',op.id,{...body,notes:body.notes||'Integration claim resolution'});if(approval.status>=400)return approval;return{status:200,data:(await raw(`/jobs/${match[1]}`,admin)).data.operations.find(row=>row.id===op.id)};} }
    if(method==='PUT'&&(match=path.match(/^\/invoices\/([^/]+)$/))&&['APPROVED','PAID'].includes(body.status)){if(body.status==='PAID'){const current=await raw('/invoices?limit=200',admin);const row=current.data.data.find(row=>row.id===match[1]);if(row?.status==='PENDING'){approval=await approve('INVOICE_ISSUE',row.id);if(approval.status>=400)return approval;}}approval=await approve(body.status==='PAID'?'LEGACY_INVOICE_SETTLE':'INVOICE_ISSUE',match[1],body);if(approval.status>=400)return approval;return{status:200,data:(await raw('/invoices?limit=200',admin)).data.data.find(row=>row.id===match[1])};}
    const response=await raw(path,token,body,method);
    if(response.status<400&&method==='POST'&&(match=path.match(/^\/jobs\/([^/]+)\/invoices$/))) {approval=await approve('INVOICE_ISSUE',response.data.id);if(approval.status>=400)return approval;return{status:201,data:(await raw(`/jobs/${match[1]}`,admin)).data.invoices.find(row=>row.id===response.data.id)};}
    return response;
  }
  async function request(path,token,body,method=body?'POST':'GET',expected){
    const result=path.startsWith('/auth')?await raw(path,token,body,method):await mapped(path,token,body,method);
    assert.ok(expected?result.status===expected:result.status<400,`${method} ${path}: ${result.status} ${JSON.stringify(result.data)}`);return result.data;
  }
  request.approve=async(action,entityId,payload)=>{const response=await approve(action,entityId,payload);assert.equal(response.status,200,JSON.stringify(response.data));return response.data;};
  request.authorizePayment=async(jobId,body)=>{const row=await request.approve('PAYMENT_AUTHORIZE',jobId,body);return{...body,approvalId:row.id,notes:body.notes||'Integration payment proof'};};
  request.actors=auth;
  request.cleanup=async prisma=>{await prisma.directorApproval.deleteMany({where:{id:{in:approvalIds}}});const logs=await prisma.activityLog.findMany({where:{createdAt:{gte:started}}});await prisma.activityLog.deleteMany({where:{id:{in:logs.filter(row=>approvalIds.includes(row.entityId)||approvalIds.includes(row.metadata?.approvalId)).map(row=>row.id)}}});};
  return request;
};
