import { useEffect } from 'react';
import { useLanguage } from '../../i18n/LanguageContext';
import { usePageQuery } from '../Layout/PageNavigation';
import { PAGE_SIZES, pageButtons, pageInfo, pageNumber, pageSize } from './paginationState.mjs';
export function usePagination(scope = '') {
  const [query,setQuery]=usePageQuery();const pageKey=scope?`${scope}Page`:'page';const limitKey=scope?`${scope}Limit`:'limit';
  const page=pageNumber(query.get(pageKey));const limit=pageSize(query.get(limitKey));
  return { page,limit,onPageChange:value=>setQuery({[pageKey]:value===1?null:value}),onLimitChange:value=>setQuery({[limitKey]:value,[pageKey]:null}), reset:{[pageKey]:null},params:{page,limit} };
}
export function usePageCorrection(paging,total,ready=true) {
  const corrected=pageInfo(total,paging.page,paging.limit).page;
  useEffect(()=>{if(ready&&corrected!==paging.page)paging.onPageChange(corrected);},[ready,corrected,paging.page,paging.onPageChange]);
}
export default function Pagination({ total=0,page=1,limit=10,onPageChange,onLimitChange,loading=false }) {
  const {t,locale}=useLanguage();const info=pageInfo(total,page,limit);const number=value=>value.toLocaleString(locale);
  const buttonClass='min-w-8 rounded-md border px-2.5 py-1.5 text-xs disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500';
  return <nav aria-label={t('Pagination')} aria-busy={loading} data-pagination className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800 px-4 py-3">
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2"><p role="status" className="text-xs text-zinc-400">{t('Showing {start}–{end} of {total} records',{start:number(info.start),end:number(info.end),total:number(total)})}</p><label className="flex items-center gap-2 text-xs text-zinc-400"><span>{t('Rows per page')}</span><select aria-label={t('Rows per page')} className="rounded-md border border-zinc-700 bg-zinc-800 px-2 py-1.5 text-zinc-200" value={limit} disabled={loading} onChange={event=>onLimitChange(Number(event.target.value))}>{PAGE_SIZES.map(value=><option key={value} value={value}>{value}</option>)}</select></label></div>
    <div className="flex flex-wrap items-center gap-1"><button type="button" className={`${buttonClass} border-zinc-700 text-zinc-300`} disabled={loading||info.page===1} onClick={()=>onPageChange(info.page-1)}>{t('Previous')}</button>{pageButtons(info.page,info.pages).map(value=>typeof value==='string'?<span className="px-1 text-xs text-zinc-500" key={value}>…</span>:<button type="button" key={value} aria-label={t('Go to page {page}',{page:value})} aria-current={value===info.page?'page':undefined} disabled={loading} className={`${buttonClass} ${value===info.page?'border-brand-500 bg-brand-500/15 text-brand-300':'border-zinc-700 text-zinc-400 hover:bg-zinc-800'}`} onClick={()=>onPageChange(value)}>{number(value)}</button>)}<button type="button" className={`${buttonClass} border-zinc-700 text-zinc-300`} disabled={loading||info.page===info.pages} onClick={()=>onPageChange(info.page+1)}>{t('Next')}</button></div>
  </nav>;
}
