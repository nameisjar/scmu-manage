export const PAGE_SIZES = [10, 25, 50];
export function pageSize(value) { return PAGE_SIZES.includes(Number(value)) ? Number(value) : 10; }
export function pageNumber(value) { const number=Number(value); return Number.isSafeInteger(number)&&number>0&&number<=1000000?number:1; }
export function pageInfo(total, requestedPage, limit) {
  const pages=Math.max(1,Math.ceil(total/limit)); const page=Math.min(pageNumber(requestedPage),pages);
  return { page, pages, start:total?(page-1)*limit+1:0, end:Math.min(page*limit,total) };
}
export function pageButtons(page, pages) {
  const values=[1,...Array.from({length:5},(_,index)=>page-2+index),pages].filter(value=>value>0&&value<=pages);
  const ordered=[...new Set(values)].sort((a,b)=>a-b);const result=[];
  ordered.forEach((value,index)=>{if(index&&value-ordered[index-1]>1)result.push(`gap-${value}`);result.push(value);});return result;
}
