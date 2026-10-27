import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {mkdir} from 'node:fs/promises';
import {checkPage} from './browser-check.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));const require=createRequire(new URL('../frontend/package.json',import.meta.url));const {createServer}=require('vite');process.chdir(path.join(root,'frontend'));process.env.NODE_ENV='production';process.env.VITE_API_URL='http://127.0.0.1:5193';
const seed=()=>({id:'existing',jobId:'fixture-job',version:1,registerNumber:'REG-OLD',billNumber:'BL-OLD',vesselName:'MV OLD',voyageNumber:'V-OLD',portOfLoading:'Origin',register:{customerName:'Legacy',dateMeaning:'UNCONFIRMED',quantity20:null,quantity21:7,quantity40:0},registerAmount:'1000000.21',containers:[],archived:false,createdAt:'2026-01-01T00:00:00Z'});
let records=[seed()];let requests=[];let files={};
const server=await createServer({root:path.join(root,'frontend'),plugins:[{name:'isolated-unified-register-contract',configureServer(server){server.middlewares.use(async(req,res,next)=>{const url=new URL(req.url,'http://127.0.0.1');if(!url.pathname.startsWith('/api/'))return next();const raw=await new Promise(resolve=>{const chunks=[];req.on('data',chunk=>chunks.push(chunk));req.on('end',()=>resolve(Buffer.concat(chunks)));});const multipart=req.headers['content-type']?.includes('multipart/');const body=raw.length&&!multipart?JSON.parse(raw):{};requests.push({method:req.method,path:url.pathname,query:Object.fromEntries(url.searchParams),body,multipart,authorization:req.headers.authorization});res.setHeader('Content-Type','application/json');const send=(value,status=200)=>{res.statusCode=status;res.end(JSON.stringify(value));};
 if(url.pathname==='/api/check-state')return send({records,requests,files});
 if(url.pathname==='/api/bl-register/export.xlsx'){res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');return res.end(Buffer.from('PK\x03\x04isolated XLSX transport fixture'));}
 if(url.pathname==='/api/bl-register'){
 if(req.method==='POST'){if(body.billNumber==='SERVER-INVALID')return send({message:'B/L test validation'},400);const row={...seed(),...body,id:'created-'+records.length,registerNumber:body.registerNumber||'REG-NEW',version:1};records.push(row);return send(row,201);}
 let rows=records.filter(row=>url.searchParams.get('archived')==='all'||(url.searchParams.get('archived')==='archived'?row.archived:!row.archived));const search=url.searchParams.get('search')?.toLowerCase();if(search)rows=rows.filter(row=>JSON.stringify(row).toLowerCase().includes(search));
 return send({data:rows,total:rows.length,page:1,limit:10,summary:{totalRegisters:records.length,periodRegisters:rows.length,missingBL:rows.length,missingPackingList:rows.length,incompleteRegisters:rows.length,byVessel:[{vesselName:'MV OLD',count:1}],byVoyage:[{voyageNumber:'V-OLD',count:1}],recentRegisters:rows}});}
 const match=url.pathname.match(/^\/api\/bl-register\/([^/]+)(?:\/(.*))?$/);if(match){let row=records.find(row=>row.id===match[1]);if(!row)return send({message:'Not found'},404);const tail=match[2];
 if(tail==='archive'){row.archived=body.archived;row.version++;return send(row);}
 if(tail==='files'){if(req.method==='POST'){const text=raw.toString();const category=text.match(/name="category"\r\n\r\n([^\r]+)/)?.[1];const version=text.match(/name="version"\r\n\r\n([^\r]+)/)?.[1];if(Number(version)!==row.version)return send({message:'Record changed'},409);const file={id:'file-'+(files[row.id]?.length||0),category,originalName:category==='PACKING_LIST'?'packing.pdf':'bill.pdf',note:'fixture',createdAt:'2026-01-02T00:00:00Z'};files[row.id]=[...(files[row.id]||[]),file];row.version++;return send(file,201);}return send({data:files[row.id]||[]});}
 if(tail?.startsWith('files/')){res.setHeader('Content-Type','text/plain');return res.end('authenticated fixture document');}
 if(!tail){if(req.method==='PUT'){if(body.notes==='conflict')return send({message:'Changed'},409);if(body.version!==row.version)return send({message:'Record changed'},409);row={...row,...body,version:row.version+1};records=records.map(r=>r.id===row.id?row:r);}return send(row);}}
 if(url.pathname.endsWith('/activity'))return send({data:[],total:0,page:1,limit:10});
 return send({message:'Unexpected isolated contract '+url.pathname},404);
 });}}],server:{host:'127.0.0.1',port:5193,strictPort:true,hmr:false}});
const output=path.join(process.env.TMPDIR||path.join(root,'.demo','test-output'),'unified-register-ui');await mkdir(output,{recursive:true});await server.listen();
try{for(const [label,width,height] of [['desktop',1440,1000],['tablet',800,1000]]){records=[seed()];requests=[];files={};const result=await checkPage({chrome:process.env.SCMU_TEST_BROWSER||'C:/Program Files/Google/Chrome/Application/chrome.exe',output,width,height,url:'http://127.0.0.1:5193/register-unified-check.html',screenshot:path.join(output,label+'.png')});assert.ok(result.ok,`${label}: ${result.error}`);console.log(`PASS ${label} isolated HTTP contract: ${result.checks.join(', ')}`);}}finally{await server.close();}
