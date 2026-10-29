const vesselKey=value=>String(value||'').trim().toUpperCase().replace(/^(?:KM|K\.M\.|MV|M\.V\.)[\s.]+/,'').replace(/[^A-Z0-9]/g,'');
const voyageKey=value=>String(value||'').trim().toUpperCase().replace(/^(?:VOYAGE|VOY|V)[\s.:]+/,'').replace(/[^A-Z0-9]/g,'');
export function journeyGroupKey(group){const f=group.fields||{};return group.mode==='EXISTING'?'existing:'+group.targetId:[vesselKey(f.vesselName),voyageKey(f.voyageNumber),f.period||'',String(f.destination||'').toUpperCase().replace(/[^A-Z0-9]/g,'')].join('|');}
export function journeyGroupValid(group){
 if(group.mode==='EXISTING')return group.candidates.some(c=>c.id===group.targetId&&!c.archived&&c.identity);
 const f=group.fields||{};
 return group.mode==='NEW'&&Boolean(vesselKey(f.vesselName)&&voyageKey(f.voyageNumber)&&String(f.destination||'').trim()&&/^[12]\d{3}(?:-(?:0[1-9]|1[0-2]))?$/.test(f.period||''));
}
export function journeyGroupPlan(group){return group.mode==='EXISTING'?{mode:'EXISTING',targetId:group.targetId,identity:group.candidates.find(c=>c.id===group.targetId)?.identity,confirmed:true}:{mode:'NEW',fields:group.fields,confirmed:true};}
