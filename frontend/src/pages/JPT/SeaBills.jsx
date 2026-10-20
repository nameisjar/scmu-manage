import { useState } from 'react';
import api from '../../api/client';
import { useLanguage } from '../../i18n/LanguageContext';
import { Button, DataTable, DetailModal, Fields, ModalForm, Notice, ResourceState, StatusBadge, useResource } from '../../components/jpt/Workspace';
import { requestDirector } from '../../components/jpt/DirectorApproval';
import DocumentPreview from '../../components/jpt/DocumentPreview';
import { formatDate } from '../../utils/format.mjs';
import { packingSummaryValue } from './packingSummary.mjs';

const identity = [['documentKind','Sea document type'],['billNumber','BL number'],['issueDate','Issue date'],['carrierName','Carrier / issuing agent'],['vesselName','Vessel name'],['voyageNumber','Voyage number'],['portOfLoading','Port of loading'],['portOfDischarge','Port of discharge'],['shipperName','Shipper on document'],['consigneeName','Consignee on document']];
const cargoFields = [{key:'packages',label:'Allocated packages',type:'number',min:1,step:1},{key:'grossWeightKg',label:'Gross weight (kg)',type:'number',min:0,step:0.001},{key:'volumeCbm',label:'Volume (CBM)',type:'number',min:0,step:0.0001}];
const checks = [['parties','I checked the shipper and consignee against the original document'],['route','I checked the vessel, voyage and loading/discharge ports'],['containers','I checked the container and seal numbers, or confirmed they do not apply'],['cargo','I checked the packing lists, cargo portions and declared totals'],['finalDocument','I checked the final document issued by the carrier / agent']];
const dateInput = value => value ? new Date(value).toISOString().slice(0,10) : '';
const localNow = () => { const now=new Date();return new Date(now.getTime()-now.getTimezoneOffset()*60000).toISOString().slice(0,16); };
const fileLabel = category => ({DRAFT:'Draft BL / waybill',FINAL:'Final BL / waybill',RELEASE:'Carrier release evidence',DELIVERY_ORDER:'Delivery order',LEGACY:'Existing attachment'})[category] || category;
const currentFile = bill => bill?.files.find(file => ['DRAFT','FINAL'].includes(file.category) && file.contentVersion===bill.contentVersion);

export default function SeaBills({ job, onChange }) {
  const { t, locale } = useLanguage(); const base=`/jobs/${job.id}/sea-bills`; const resource=useResource(base);
  const records=resource.data?.data || []; const packing=resource.data?.packingLists || []; const users=resource.data?.users || [];
  const [selectedId,setSelectedId]=useState(null); const [dialog,setDialog]=useState(null); const [form,setForm]=useState({});
  const [file,setFile]=useState(null); const [revision,setRevision]=useState(null); const [viewingFile,setViewingFile]=useState(null); const [downloadError,setDownloadError]=useState('');
  const selected=records.find(row=>row.id===selectedId); const mainFile=currentFile(selected);
  const legs=job.shipments.filter(leg=>leg.mode==='SEA' && leg.status!=='CANCELLED');
  const editable=!['CLOSED','CANCELLED'].includes(job.status); const selectedEditable=editable && selected?.shipment.mode==='SEA' && selected?.shipment.status!=='CANCELLED';
  const reload=()=>{resource.reload();onChange?.();};
  const actor=id=>users.find(user=>user.id===id)?.name || '—';
  const amount=value=>value == null ? t('Not stated') : Number(value).toLocaleString(locale,{maximumFractionDigits:4});
  const label=bill=>currentFile(bill)?.originalName || bill.billNumber || t('Awaiting BL upload');
  const change=(key,value)=>setForm(previous=>({...previous,[key]:value,...(key==='category' && !['DRAFT','FINAL'].includes(value)?{materialChange:false}:{})}));
  const candidates=shipmentId=>records.filter(row=>row.shipmentId===shipmentId && !currentFile(row));
  const initialTarget=shipmentId=>{const target=candidates(shipmentId)[0];return {shipmentId,billId:target?.id || '',version:target?.version,documentKind:target?.documentKind || 'BILL_OF_LADING'};};
  const open=(type,row=selected,category='FINAL')=>{
    setFile(null);setDialog({type,id:row?.id});
    if(type==='initial') setForm({...initialTarget(row?.shipmentId || legs[0]?.id || ''),...(row?{billId:row.id,version:row.version}:{}),category:'FINAL',note:'',documentId:''});
    else if(type==='file') setForm({version:row.version,category,note:'',materialChange:false,externalNumber:'',documentDate:dateInput(new Date())});
    else if(type==='cargo') setForm({version:row.version,revisionNote:'',allocations:row.allocations.map(link=>({...link,partial:packing.some(source=>source.id===link.packingListId && (source.packages!==link.packages || Number(source.grossWeightKg)!==Number(link.grossWeightKg) || Number(source.volumeCbm)!==Number(link.volumeCbm)))}))});
    else if(type==='metadata') setForm({...row,issueDate:dateInput(row.issueDate),revisionNote:''});
    else if(type==='verify') setForm({version:row.version,checks:{},note:''});
    else if(type==='release') setForm({version:row.version,method:row.documentKind==='SEA_WAYBILL'?'SEA_WAYBILL':'ORIGINAL_SURRENDER',proofId:'',reference:'',releasedAt:localNow(),note:''});
    else setForm({version:row.version,note:''});
  };
  const save=async()=>{
    const {type,id}=dialog; const endpoint=`${base}/${id}`; let response;
    if(type==='initial' || type==='file') {
      if(!file) throw Error(t('Select a document file'));
      if(file.size>5*1024*1024) throw Error(t('PDF or image, maximum 5 MB'));
      const body=new FormData();body.append('file',file);
      if(type==='initial') body.append('data',JSON.stringify(form)); else for(const [key,value] of Object.entries(form)) body.append(key,value??'');
      response=await api.post(type==='initial'?`${base}/upload`:`${endpoint}/files`,body);
    } else if(type==='cargo') response=await api.put(endpoint,{version:form.version,allocations:form.allocations,revisionNote:form.revisionNote});
    else if(type==='metadata') response=await api.put(endpoint,form);
    else if(type==='verify') {
      if(selected.issues.length) await requestDirector('SEA_BILL_EXCEPTION',id,form,form.note);
      else response=await api.post(`${endpoint}/verify`,form);
    } else response=await api.post(`${endpoint}/${type}`,form);
    if(response?.data?.id) setSelectedId(response.data.id);
    reload();setFile(null);
  };
  const downloadFile=async attachment=>{
    setDownloadError('');
    try {const response=await api.get(`${base}/${selected.id}/files/${attachment.id}`,{responseType:'blob'});const url=URL.createObjectURL(response.data);const link=document.createElement('a');link.href=url;link.download=attachment.originalName;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
    catch(error){setDownloadError(error.response?.data?.message || error.message);}
  };
  const preview=attachment=><DocumentPreview key={attachment.id} endpoint={`${base}/${selected.id}/files/${attachment.id}`} name={attachment.originalName} mimeType={attachment.mimeType}/>;
  const detail=(title,value)=><div key={title} className="min-w-0"><dt className="text-xs text-zinc-500">{t(title)}</dt><dd className="mt-1 break-words text-sm text-zinc-200">{value??'—'}</dd></div>;
  const metadataView=data=><dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{identity.filter(([key])=>data[key]).map(([key,title])=>detail(title,key==='documentKind'?t(data[key]):key==='issueDate'?formatDate(data[key],locale):data[key]))}</dl>;
  const reference=row=>row.packingList?.externalNumber || row.packingList?.recordNumber || packing.find(source=>source.id===row.packingListId)?.externalNumber || packing.find(source=>source.id===row.packingListId)?.recordNumber || row.declaredSnapshot?.externalNumber || '—';
  const allocationColumns=[{key:'reference',label:'Packing list',render:reference},{key:'scope',label:'Cargo scope / marks'},{key:'packages',label:'Allocated packages',align:'right'},{key:'grossWeightKg',label:'Gross weight (kg)',align:'right',render:row=>amount(row.grossWeightKg)},{key:'volumeCbm',label:'Volume (CBM)',align:'right',render:row=>amount(row.volumeCbm)}];
  const linked=form.allocations || [];
  const updateLink=(id,key,value)=>change('allocations',linked.map(row=>row.packingListId===id?{...row,[key]:value}:row));
  const fullLink=source=>({packingListId:source.id,packages:source.packages,grossWeightKg:source.grossWeightKg,volumeCbm:source.volumeCbm,scope:'',partial:false});
  const proofOptions=selected?.files.filter(row=>['RELEASE','DELIVERY_ORDER'].includes(row.category) && row.contentVersion===selected.contentVersion).map(row=>({value:row.id,label:`${t(fileLabel(row.category))}: ${row.externalNumber || row.originalName}`})) || [];
  const findings=selected && <div className={`rounded-lg border p-3 text-sm ${selected.internalStatus==='SEA_MATCHED' && !selected.issues.includes('SEA_PACKING_CHANGED')?'border-brand-500/30 text-brand-200':'border-red-500/30 text-red-200'}`}><p className="font-medium">{t(selected.internalStatus==='SEA_MATCHED' && !selected.issues.includes('SEA_PACKING_CHANGED')?'Findings accepted in the recorded review':'BL review findings')}</p><ul className="mt-2 list-disc pl-5">{selected.issues.map(issue=><li key={issue}>{t(issue)}</li>)}</ul>{selected.reviewIssues && <p className="mt-2 whitespace-pre-wrap">{selected.reviewIssues}</p>}</div>;

  return <div className="space-y-5" data-sea-bills>
    <p className="text-sm text-zinc-400">{t('Upload the BL received from the carrier or sender, link its packing lists, then check the original file. Retyping the BL is optional.')}</p>
    <p className="rounded-lg border border-brand-500/25 bg-brand-500/10 p-3 text-sm text-brand-200">{t('Internal verification does not authorize cargo release. Record the carrier confirmation and its evidence separately.')}</p>
    {editable && <Button disabled={!legs.length || resource.loading} onClick={()=>open('initial',null)}>{t('Upload BL')}</Button>}
    {!legs.length && <p className="text-sm text-zinc-400">{t('Add an approved sea transport leg before recording a BL.')}</p>}
    <ResourceState resource={resource}><DataTable rows={records} columns={[
      {key:'file',label:'BL file',render:row=><button className="text-left text-brand-400 break-words" onClick={()=>setSelectedId(row.id)}>{label(row)}<span className="mt-1 block text-xs text-zinc-500">{row.shipment.shipmentNumber}{currentFile(row) && row.billNumber?` · ${row.billNumber}`:''}</span></button>},
      {key:'receiptStatus',label:'Document receipt',render:row=><StatusBadge status={row.receiptStatus}/>},
      {key:'internalStatus',label:'Internal review',render:row=><StatusBadge status={row.issues.includes('SEA_PACKING_CHANGED')?'SEA_UNCHECKED':row.internalStatus}/>},
      {key:'releaseStatus',label:'Carrier release',render:row=><StatusBadge status={row.releaseStatus}/>},
      {key:'actions',label:'Actions',render:row=><div className="flex gap-2"><Button size="sm" variant="secondary" onClick={()=>setSelectedId(row.id)}>{t('View')}</Button>{editable && row.shipment.mode==='SEA' && row.shipment.status!=='CANCELLED' && !currentFile(row) && <Button size="sm" disabled={resource.loading} onClick={()=>open('initial',row)}>{t('Upload BL')}</Button>}</div>}
    ]}/></ResourceState>

    {selected && !dialog && !revision && !viewingFile && <DetailModal title="Sea transport document details" onClose={()=>setSelectedId(null)} actions={<>
      {mainFile && <Button size="sm" variant="secondary" onClick={()=>downloadFile(mainFile)}>{t('Download BL')}</Button>}
      {selectedEditable && <>
        <Button size="sm" disabled={resource.loading} onClick={()=>mainFile?open('file'):open('initial')}>{t(mainFile?'Upload BL revision':'Upload BL')}</Button>
        <Button size="sm" variant="secondary" disabled={resource.loading} onClick={()=>open('cargo')}>{t('Link packing lists')}</Button>
        <Button size="sm" variant="secondary" disabled={resource.loading || selected.internalStatus==='SEA_MATCHED' && !selected.issues.includes('SEA_PACKING_CHANGED')} onClick={()=>open('verify')}>{t(selected.issues.length?'Submit BL exception':'Verify BL')}</Button>
        {selected.internalStatus==='SEA_MATCHED' && <Button size="sm" variant="secondary" disabled={resource.loading || selected.issues.includes('SEA_PACKING_CHANGED')} onClick={()=>open('release')}>{t('Record carrier release')}</Button>}
      </>}
    </>}><section className="space-y-6" data-sea-detail>
      <Notice message={downloadError}/><div className="flex flex-wrap gap-3"><StatusBadge status={selected.receiptStatus}/><StatusBadge status={selected.internalStatus}/><StatusBadge status={selected.releaseStatus}/></div>
      {mainFile?<div className="space-y-3"><h3 className="break-all font-medium text-zinc-100">{mainFile.originalName}</h3><p className="text-xs text-zinc-400">{t('Uploaded by')}: {actor(mainFile.uploadedById)} · {formatDate(mainFile.createdAt,locale,true)} · {t('File version')}: {mainFile.contentVersion}</p>{preview(mainFile)}</div>:<p className="rounded-lg border border-dashed border-zinc-700 p-6 text-sm text-zinc-400">{t('Upload the BL file to start. You do not need to fill in the document contents.')}</p>}
      {!!selected.issues.length && findings}
      <div className="space-y-3"><div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-medium text-zinc-100">{t('BL cargo links')}</h3>{selectedEditable && <Button size="sm" variant="secondary" disabled={resource.loading} onClick={()=>open('cargo')}>{t('Link packing lists')}</Button>}</div><DataTable rows={selected.allocations} columns={allocationColumns}/><p className="text-sm text-zinc-400">{t('Linked totals')}: {selected.totals.packages} {t('Packages')} · {packingSummaryValue(selected.totals, 'grossWeightKg', { t, locale })} kg · {packingSummaryValue(selected.totals, 'volumeCbm', { t, locale })} CBM</p></div>
      <details className="rounded-lg border border-zinc-700 p-4"><summary className="cursor-pointer text-sm font-medium text-zinc-300">{t('Additional BL data (optional)')}</summary><div className="mt-4 space-y-4"><p className="text-xs text-zinc-400">{t('These fields help with searching and reports. They are not required to upload or verify a BL.')}</p>{metadataView(selected)}{selected.notes && <p className="whitespace-pre-wrap text-sm text-zinc-400">{selected.notes}</p>}{selectedEditable && <Button size="sm" variant="secondary" disabled={resource.loading} onClick={()=>open('metadata')}>{t('Edit optional BL data')}</Button>}</div></details>
      <div className="space-y-3"><h3 className="font-medium text-zinc-100">{t('BL attachments')}</h3><DataTable rows={selected.files} columns={[
        {key:'category',label:'Attachment category',render:row=><>{t(fileLabel(row.category))}<p className="text-xs text-zinc-500">{t('File version')}: {row.contentVersion}</p></>},
        {key:'originalName',label:'Original filename',className:'break-all',render:row=><>{row.originalName}{row.externalNumber && <p>{row.externalNumber} · {formatDate(row.documentDate,locale)}</p>}{row.note && <p className="text-xs text-zinc-500">{t(row.note)}</p>}</>},
        {key:'createdAt',label:'Date',render:row=>formatDate(row.createdAt,locale,true)},
        {key:'uploader',label:'Uploaded by',render:row=>actor(row.uploadedById)},
        {key:'actions',label:'Actions',render:row=><div className="flex gap-2"><Button size="sm" variant="secondary" onClick={()=>setViewingFile(row)}>{t('View document')}</Button><Button size="sm" variant="secondary" onClick={()=>downloadFile(row)}>{t('Download')}</Button></div>}
      ]}/></div>
      <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-3 rounded-lg border border-zinc-700 p-4"><h3 className="font-medium text-zinc-100">{t('Internal review')}</h3><dl className="space-y-3">{detail('Verified by',actor(selected.reviewedById))}{detail('Date',formatDate(selected.reviewedAt,locale,true))}</dl>{selectedEditable && <Button size="sm" variant="secondary" disabled={resource.loading} onClick={()=>open('correction')}>{t('Request BL correction')}</Button>}</div><div className="space-y-3 rounded-lg border border-zinc-700 p-4"><h3 className="font-medium text-zinc-100">{t('Carrier release')}</h3><dl className="space-y-3">{detail('Release method',t(selected.releaseMethod)||'—')}{detail('Carrier confirmation reference',selected.releaseReference)}{detail('Date',formatDate(selected.releasedAt,locale,true))}{detail('Recorded by',actor(selected.releasedById))}{detail('Notes',selected.releaseNote)}</dl>{selectedEditable && <Button size="sm" variant="secondary" disabled={resource.loading} onClick={()=>open('file',selected,'RELEASE')}>{t('Upload release evidence / DO')}</Button>}</div></div>
      <div className="space-y-3"><h3 className="font-medium text-zinc-100">{t('BL revision history')}</h3><DataTable rows={selected.history} columns={[{key:'version',label:'Revision'},{key:'action',label:'Action',render:row=>t(row.action)},{key:'createdAt',label:'Date',render:row=>formatDate(row.createdAt,locale,true)},{key:'actor',label:'User',render:row=>actor(row.createdById)},{key:'note',label:'Revision note',render:row=>t(row.note)||'—'},{key:'actions',label:'Actions',render:row=><Button size="sm" variant="secondary" onClick={()=>setRevision(row)}>{t('View')}</Button>}]}/></div>
    </section></DetailModal>}

    {viewingFile && <DetailModal title="Document preview" onClose={()=>setViewingFile(null)} actions={<Button size="sm" onClick={()=>downloadFile(viewingFile)}>{t('Download')}</Button>}><div className="space-y-4"><p className="break-all text-sm text-zinc-200">{viewingFile.originalName}</p><p className="text-xs text-zinc-400">{t(fileLabel(viewingFile.category))} · {actor(viewingFile.uploadedById)} · {formatDate(viewingFile.createdAt,locale,true)}</p>{preview(viewingFile)}</div></DetailModal>}
    {revision && !viewingFile && <DetailModal title="BL revision details" onClose={()=>setRevision(null)}><div className="space-y-5"><p className="text-sm text-zinc-400">{t('Revision')} {revision.version} · {formatDate(revision.createdAt,locale,true)} · {actor(revision.createdById)}</p><div className="flex flex-wrap gap-3">{['internalStatus','releaseStatus'].map(key=>revision.snapshot[key] && <StatusBadge key={key} status={revision.snapshot[key]}/>)}</div><DataTable rows={revision.snapshot.allocations || []} columns={allocationColumns}/><div className="space-y-2">{(revision.snapshot.files || []).map(row=>{const attachment=selected.files.find(file=>file.id===row.id);return attachment && <Button key={row.id} size="sm" variant="secondary" onClick={()=>setViewingFile(attachment)}>{t('View document')}: {attachment.originalName}</Button>;})}</div><details><summary className="cursor-pointer text-sm text-zinc-300">{t('Additional BL data (optional)')}</summary><div className="mt-4">{metadataView(revision.snapshot)}</div></details><p className="whitespace-pre-wrap text-sm text-zinc-300">{t(revision.note)}</p></div></DetailModal>}

    {dialog && <ModalForm width={['metadata','cargo'].includes(dialog.type)?'max-w-5xl':'max-w-3xl'} title={dialog.type==='initial'?'Upload BL':dialog.type==='file'?(['RELEASE','DELIVERY_ORDER'].includes(form.category)?'Upload release evidence / DO':'Upload BL revision'):dialog.type==='cargo'?'Link packing lists':dialog.type==='metadata'?'Edit optional BL data':dialog.type==='verify'?(selected.issues.length?'Submit BL exception':'Verify BL'):dialog.type==='release'?'Record carrier release':'Request BL correction'} onClose={()=>{setDialog(null);setFile(null);}} onSubmit={save} submitLabel={['initial','file'].includes(dialog.type)?'Upload':dialog.type==='verify' && selected.issues.length?'Submit request':'Save'}>
      {['initial','file'].includes(dialog.type) && <>
        <label className="block space-y-2 text-sm text-zinc-300"><span>{t('PDF or image, maximum 5 MB')}</span><input className="input-field" type="file" required accept="application/pdf,image/jpeg,image/png,image/webp" onChange={event=>setFile(event.target.files[0] || null)}/></label>
        {dialog.type==='initial'?<Fields fields={[{key:'shipmentId',label:'Sea transport leg',options:legs.map(leg=>({value:leg.id,label:`${leg.shipmentNumber} · ${leg.originCity} → ${leg.destCity}`})),required:true},...(candidates(form.shipmentId).length?[{key:'billId',label:'Upload destination',options:[{value:'',label:t('New BL file')},...candidates(form.shipmentId).map(row=>({value:row.id,label:`${row.billNumber || t('Existing BL checklist')} · ${row.shipment.shipmentNumber}`}))]}]:[]),{key:'category',label:'Document stage',options:[{value:'FINAL',label:t('Final BL / waybill')},{value:'DRAFT',label:t('Draft BL / waybill')}],required:true},...(!form.billId?[{key:'documentKind',label:'Sea document type',options:['BILL_OF_LADING','SEA_WAYBILL']}]:[])]} values={form} onChange={(key,value)=>key==='shipmentId'?setForm(previous=>({...previous,...initialTarget(value),documentId:''})):key==='billId'?setForm(previous=>({...previous,billId:value,version:records.find(row=>row.id===value)?.version})):change(key,value)}/>:<Fields fields={[{key:'category',label:'Attachment category',options:['DRAFT','FINAL','RELEASE','DELIVERY_ORDER'].map(value=>({value,label:t(fileLabel(value))})),required:true},...(form.category==='DELIVERY_ORDER'?[{key:'externalNumber',label:'Delivery order number',required:true},{key:'documentDate',label:'Document date',type:'date',required:true}]:[])]} values={form} onChange={change}/>}
        {dialog.type==='file' && ['DRAFT','FINAL'].includes(form.category) && <label className="flex items-start gap-3 text-sm text-zinc-200"><input type="checkbox" className="mt-1 accent-blue-600" checked={!!form.materialChange} onChange={event=>change('materialChange',event.target.checked)}/><span>{t('This revision changes the consignee, destination or cargo, or contains an important discrepancy')}</span></label>}
        <Fields fields={[{key:'note',label:form.materialChange?'Exception explanation':'Notes (optional)',type:'textarea',wide:true,required:!!form.materialChange}]} values={form} onChange={change}/>
        {dialog.type==='initial' && !form.billId && job.documents.some(doc=>['BILL_OF_LADING','SEA_WAYBILL'].includes(doc.type) && !records.some(row=>row.documentId===doc.id)) && <details><summary className="cursor-pointer text-sm text-zinc-400">{t('Link existing BL checklist')}</summary><div className="mt-3"><Fields fields={[{key:'documentId',label:'Link existing BL checklist',options:job.documents.filter(doc=>['BILL_OF_LADING','SEA_WAYBILL'].includes(doc.type) && !records.some(row=>row.documentId===doc.id)).map(doc=>({value:doc.id,label:doc.title})),placeholder:'Create a new document'}]} values={form} onChange={change}/></div></details>}
        {file && <DocumentPreview key={`${file.name}-${file.lastModified}`} localFile={file} name={file.name} mimeType={file.type}/>}
      </>}
      {dialog.type==='cargo' && <>
        <p className="text-sm text-zinc-400">{t('Select the packing lists covered by the uploaded BL. Their quantities are filled automatically; enter quantities only for partial shipments.')}</p>
        {!packing.length && <p className="text-sm text-brand-300">{t('Record a packing list first, then return to link its cargo.')}</p>}
        {packing.map(source=>{const link=linked.find(row=>row.packingListId===source.id);return <div key={source.id} className="space-y-3 rounded-lg border border-zinc-700 p-4"><label className="flex items-start gap-3 text-sm text-zinc-200"><input type="checkbox" className="mt-1 accent-blue-600" checked={!!link} onChange={event=>change('allocations',event.target.checked?[...linked,fullLink(source)]:linked.filter(row=>row.packingListId!==source.id))}/><span>{source.externalNumber || source.recordNumber}<span className="block text-xs text-zinc-500">{source.packages} {t('Packages')} · {amount(source.grossWeightKg)} kg · {amount(source.volumeCbm)} CBM</span></span></label>{link && <><label className="flex items-center gap-2 text-sm text-zinc-300"><input type="checkbox" checked={!!link.partial} onChange={event=>event.target.checked?updateLink(source.id,'partial',true):change('allocations',linked.map(row=>row.packingListId===source.id?fullLink(source):row))}/>{t('Only part of this packing list')}</label>{link.partial && <Fields fields={[...cargoFields.filter(field=>field.key==='packages'||source[field.key]!=null).map(field=>({...field,required:true})),{key:'scope',label:'Cargo scope / marks',required:Number(link.packages)<source.packages,wide:true}]} values={link} onChange={(key,value)=>updateLink(source.id,key,value)}/>}</>}</div>;})}
        <Fields fields={[{key:'revisionNote',label:'Revision note',type:'textarea',wide:true,required:!!selected.approvedSnapshot}]} values={form} onChange={change}/>
      </>}
      {dialog.type==='metadata' && <>
        <p className="text-sm text-zinc-400">{t('These fields help with searching and reports. They are not required to upload or verify a BL.')}</p>
        <Fields fields={[...identity.map(([key,label])=>({key,label,...(key==='documentKind'?{options:['BILL_OF_LADING','SEA_WAYBILL']}:key==='issueDate'?{type:'date'}:{})})),{key:'notes',label:'Notes',type:'textarea',wide:true}]} values={form} onChange={change}/>
        <details className="space-y-4"><summary className="cursor-pointer text-sm text-zinc-400">{t('Previously recorded cargo totals (optional)')}</summary><Fields fields={cargoFields.map(field=>({...field,label:field.key==='packages'?'Packages':field.label,min:0}))} values={form} onChange={change}/></details>
        <div className="space-y-3">{(form.containers || []).map((row,index)=><div key={index} className="space-y-2 rounded-lg border border-zinc-700 p-3"><Fields fields={[{key:'number',label:'Container number',required:true},{key:'seal',label:'Seal number'}]} values={row} onChange={(key,value)=>change('containers',form.containers.map((item,i)=>i===index?{...item,[key]:value}:item))}/><Button type="button" size="sm" variant="secondary" onClick={()=>change('containers',form.containers.filter((_,i)=>i!==index))}>{t('Remove container')}</Button></div>)}<Button type="button" variant="secondary" disabled={form.containers?.length>=100} onClick={()=>change('containers',[...(form.containers || []),{number:'',seal:''}])}>{t('Add container')}</Button></div>
        <Fields fields={[{key:'revisionNote',label:'Revision note',type:'textarea',wide:true,required:!!selected.approvedSnapshot}]} values={form} onChange={change}/>
      </>}
      {dialog.type==='verify' && <>
        <p className="text-sm text-zinc-400">{t('Read the uploaded final BL and compare it with the linked packing lists. You do not need to type its contents.')}</p>
        {mainFile && preview(mainFile)}{!!selected.issues.length && findings}
        <div className="space-y-3">{checks.map(([key,title])=><label key={key} className="flex items-start gap-3 text-sm text-zinc-200"><input type="checkbox" className="mt-1 accent-blue-600" required checked={!!form.checks[key]} onChange={event=>change('checks',{...form.checks,[key]:event.target.checked})}/><span>{t(title)}</span></label>)}</div>
        <Fields fields={[{key:'note',label:selected.issues.length?'Exception explanation':'Notes (optional)',type:'textarea',wide:true,required:!!selected.issues.length}]} values={form} onChange={change}/>
      </>}
      {dialog.type==='correction' && <Fields fields={[{key:'note',label:'Correction explanation',type:'textarea',wide:true,required:true}]} values={form} onChange={change}/>}
      {dialog.type==='release' && <><p className="text-sm text-brand-200">{t('Record an actual confirmation from the carrier / agent. This action does not issue a delivery order or instruct the carrier to release goods.')}</p>{!proofOptions.length && <p className="text-sm text-red-200">{t('Attach carrier release evidence or a delivery order for this revision')}</p>}<Fields fields={[{key:'proofId',label:'Carrier release evidence',options:proofOptions,required:true,placeholder:'Select...'},{key:'method',label:'Release method',options:['ORIGINAL_SURRENDER','TELEX','SEA_WAYBILL','ELECTRONIC','OTHER'],required:true},{key:'reference',label:'Carrier confirmation reference',required:true},{key:'releasedAt',label:'Carrier confirmation date',type:'datetime-local',required:true},{key:'note',label:'Carrier confirmation note',type:'textarea',wide:true,required:true}]} values={form} onChange={change}/></>}
    </ModalForm>}
  </div>;
}
