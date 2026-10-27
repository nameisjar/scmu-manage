import { useEffect, useState } from 'react';
import api from '../../api/client';
import { useLanguage } from '../../i18n/LanguageContext';
import { Notice } from './Workspace';

export default function DocumentPreview({ endpoint, localFile, name, mimeType }) {
  const { t } = useLanguage();
  const [preview, setPreview] = useState({ loading: true });
  useEffect(() => {
    const controller = new AbortController();
    let active = true; let url;
    setPreview({ loading: true });
    (async () => {
      try {
        const blob = localFile || (await api.get(endpoint, { responseType: 'blob', signal: controller.signal })).data;
        if (!active) return;
        const type = mimeType || blob.type;
        url = URL.createObjectURL(new Blob([blob], { type }));
        setPreview({ url, type, loading: false });
      } catch (error) {
        if (active && error.code !== 'ERR_CANCELED') setPreview({ loading: false, error: t('Unable to load document preview. Download the file to view it.') });
      }
    })();
    return () => { active = false; controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, [endpoint, localFile, mimeType, t]);
  return <div className="space-y-3" data-document-preview data-preview-ready={preview.ready || false}>
    <Notice message={preview.error} />
    {preview.loading && <p role="status" className="text-sm text-zinc-400">{t('Loading document preview...')}</p>}
    {preview.url && <>
      <div className="overflow-hidden rounded-lg border border-zinc-700 bg-white">
        {preview.type === 'application/pdf'
          ? <iframe src={preview.url} title={`${t('Document preview')}: ${name}`} tabIndex={0} onLoad={()=>setPreview(value=>({...value,ready:true}))} className="h-[440px] w-full sm:h-[540px]" />
          : ['image/png','image/jpeg','image/webp','image/gif','image/bmp'].includes(preview.type)
            ? <img src={preview.url} alt={`${t('Document preview')}: ${name}`} onLoad={()=>setPreview(value=>({...value,ready:true}))} className="mx-auto max-h-[540px] w-full object-contain" />
            : <p className="p-5 text-sm text-zinc-600">{t('Download the file to view this document.')}</p>}
      </div>
      <a className="inline-block break-all text-sm text-brand-300 underline" href={preview.url} download={name}>{t('Download')}: {name}</a>
    </>}
  </div>;
}
