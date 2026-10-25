import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {readFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {checkPage} from './browser-check.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));const require=createRequire(new URL('../frontend/package.json',import.meta.url));const {createServer}=require('vite');
const {PrismaClient}=require('../backend/node_modules/@prisma/client');const jwt=require('../backend/node_modules/jsonwebtoken');
const prisma=new PrismaClient({datasources:{db:{url:'postgresql://scmu_demo@127.0.0.1:55432/scmu_demo'}}});
const marker='BLUI-'+randomUUID().slice(0,8);let server;
async function cleanup(){const jobs=await prisma.jobOrder.findMany({where:{title:{contains:marker}},select:{id:true}});const ids=jobs.map(row=>row.id);if(!ids.length)return;await prisma.activityLog.deleteMany({where:{entity:'JobOrder',entityId:{in:ids}}});await prisma.directorApproval.deleteMany({where:{jobId:{in:ids}}});await prisma.jobCharge.deleteMany({where:{jobId:{in:ids}}});await prisma.seaBill.deleteMany({where:{jobId:{in:ids}}});await prisma.jobDocument.deleteMany({where:{jobId:{in:ids}}});await prisma.shipment.deleteMany({where:{jobId:{in:ids}}});await prisma.jobOrder.deleteMany({where:{id:{in:ids}}});}
try{
 const user=await prisma.user.findFirst({where:{role:'ADMIN',isActive:true},select:{id:true,name:true,role:true,companyId:true}});assert.ok(user);const secret=await readFile(path.join(root,'.demo/jwt-secret'),'utf8');const boot=JSON.stringify({marker,user,token:jwt.sign({userId:user.id},secret,{expiresIn:'10m'})}).replaceAll('<','\\u003c');
 process.chdir(path.join(root,'frontend'));process.env.NODE_ENV='production';process.env.VITE_API_URL='http://127.0.0.1:5188';
 server=await createServer({root:path.join(root,'frontend'),plugins:[{name:'authorized-demo-bl-live-test',transformIndexHtml(html,ctx){return ctx.path==='/bl-live-check.html'?html.replace('<head>',`<head><script>window.__SCMU_BL_LIVE__=${boot}</script>`):html;}}],server:{host:'127.0.0.1',port:5188,strictPort:true,hmr:false,proxy:{'/api':{target:'http://[::1]:5000',changeOrigin:true,configure(proxy){proxy.on('proxyReq',req=>req.removeHeader('origin'));}}}}});console.log('LIVE PROXY TARGET',server.config.server.proxy['/api'].target);await server.listen();const output=path.join(root,'.demo/ui-check');await mkdir(output,{recursive:true});
 for(const [label,width,height] of [['desktop',1440,1000],['compact',700,900]]){await cleanup();const result=await checkPage({chrome:process.env.SCMU_TEST_BROWSER||'C:/Program Files/Google/Chrome/Application/chrome.exe',output,width,height,url:'http://127.0.0.1:5188/bl-live-check.html',screenshot:path.join(output,`bl-live-${label}.png`)});assert.ok(result.ok,result.error);console.log(`PASS live ${label}: ${result.checks.join(', ')}`);const record=await prisma.seaBill.findUnique({where:{id:result.id}});assert.equal(record.billNumber,marker);assert.equal(record.registerData.containers[0].vehicleNumber,'QA-VEHICLE');console.log('PASS independent Prisma readback');}
}finally{if(server)await server.close();await cleanup();assert.equal(await prisma.jobOrder.count({where:{title:{contains:marker}}}),0);await prisma.$disconnect();}
