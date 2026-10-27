const fs=require('node:fs/promises');const assert=require('node:assert/strict');
const {PrismaClient}=require('../backend/node_modules/@prisma/client');
const url=process.env.DATABASE_URL;const target=new URL(url);
assert.ok(['localhost','127.0.0.1'].includes(target.hostname));
assert.ok(target.pathname==='/scmu_demo'||/^\/scmu_register_check_\d+$/.test(target.pathname),'Only local demo and owned migration copies');
const prisma=new PrismaClient({datasources:{db:{url}}});
(async()=>{
 const [mode,filename]=process.argv.slice(2);assert.ok(['write','verify'].includes(mode));assert.ok(filename);
 const baseline=mode==='verify'?JSON.parse(await fs.readFile(filename,'utf8')):null;
 const tables=await prisma.$queryRaw`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'_prisma_migrations' ORDER BY tablename`;
 const result={};
 for(const {tablename}of tables){
  const quoted='"'+tablename.replaceAll('"','""')+'"';
  const columns=(await prisma.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=${tablename} ORDER BY column_name`).map(row=>row.column_name);
  const original=baseline?baseline[tablename]?.columns:columns;assert.ok(original,'Unexpected application table');
  assert.ok(original.every(column=>columns.includes(column)),'Historical column was removed');
  const added=columns.filter(column=>!original.includes(column));
  const base=added.length?`(to_jsonb(t)-ARRAY[${added.map(column=>"'"+column.replaceAll("'","''")+"'").join(',')}]::text[])`:'to_jsonb(t)';
  // The scoped cleanup removes only deprecated customer labels nested in the
  // register JSON. Compare the same scrubbed representation before and after,
  // so every other historical value is still protected by the checksum.
  const expression=process.env.SCMU_ALLOWED_CLEANUP==='register-customer-fields'&&tablename==='sea_bills'
   ? `jsonb_set(${base},'{registerData,register}',COALESCE(${base}#>'{registerData,register}','{}'::jsonb)-'customerName'-'billingPartyName',true)`
   : base;
  const [row]=await prisma.$queryRawUnsafe(`SELECT count(*)::text AS count, md5(COALESCE(string_agg(${expression}::text,E'\\n' ORDER BY ${expression}::text),'')) AS checksum FROM ${quoted} t`);
  result[tablename]={...row,columns:original};
 }
 if(mode==='write')await fs.writeFile(filename,JSON.stringify(result,null,2));
 else assert.deepEqual(result,baseline,'Historical data changed during migration');
 console.log(`PASS ${mode}: ${tables.length} tables; all historical columns and records ${mode==='verify'?'unchanged':'captured'}`);
})().catch(error=>{console.error(error.message);process.exitCode=1;}).finally(()=>prisma.$disconnect());
