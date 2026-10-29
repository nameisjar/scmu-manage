import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import api from '../../api/client';
import { Button } from '../../components/common';
import { Notice } from '../../components/jpt/Workspace';
import { useBL } from '../../i18n/bl.mjs';
import { registerPayload, isRegisterArchived } from './registerModel.mjs';
import BLImport from './BLImport';
import VesselPicker from './VesselPicker';

function Input({ label, value, onChange, type = 'text', required = false, children, ...props }) {
  const { t } = useBL();
  return <label className="block space-y-1.5"><span className="text-xs text-zinc-400">{t(label)}</span>{children || <input aria-label={t(label)} className="input-field" value={value ?? ''} type={type} required={required} {...props} onChange={event => onChange(event.target.value)} />}</label>;
}
function Group({ title, disabled, children, columns = 3 }) {
  const { t } = useBL();
  return <fieldset disabled={disabled} className="bl-form-group"><legend className="sr-only">{t(title)}</legend><h2>{t(title)}</h2><div className={`grid sm:grid-cols-2 ${columns === 3 ? 'xl:grid-cols-3' : ''} gap-4`}>{children}</div></fieldset>;
}
export default function RegisterForm({ initial, onSaved, formId, hideActions = false, onStateChange }) {
  const { t } = useBL(); const navigate = useNavigate(); const location = useLocation(); const generatedId = useId();
  const [form, setForm] = useState(() => initial ? structuredClone(initial) : { register: { dateMeaning: 'UNCONFIRMED' } });
  const [saving, setSaving] = useState(false); const [error, setError] = useState(''); const [conflict, setConflict] = useState(false);
  const [reading,setReading]=useState(false);const staged=useRef(null);
  useEffect(()=>{staged.current=form.importSessionId||null;},[form.importSessionId]);
  useEffect(()=>()=>{if(staged.current)void api.delete('/bl-imports/'+staged.current).catch(()=>{});},[]);
  const [success, setSuccess] = useState(location.state?.registerSaved ? 'Register berhasil disimpan.' : '');
  useEffect(() => { onStateChange?.({ saving:saving||reading, conflict }); }, [saving, reading, conflict, onStateChange]);
  const disabled = saving || reading || conflict || isRegisterArchived(form);
  const update = (key, value) => setForm(previous => ({ ...previous, [key]: value }));
  const register = (key, value) => setForm(previous => ({ ...previous, register: { ...previous.register, [key]: value } }));
  const save = async event => {
    event.preventDefault(); if (disabled) return; setSaving(true); setError(''); setSuccess('');
    try {
      const response = form.id ? await api.put(`/bl-register/${form.id}`, registerPayload(form)) : await api.post('/bl-register', registerPayload(form));
      staged.current=null;
      const id = response.data.id || response.data.data?.id || form.id;
      if (!id) throw Error('Register response is missing its identifier.');
      const confirmed = await api.get(`/bl-register/${id}`); setForm(structuredClone(confirmed.data)); setSuccess('Register berhasil disimpan.');
      if (!form.id && onSaved) onSaved(confirmed.data);
      else if (!form.id) navigate(`/bl-register/${id}`, { replace: true, state: { registerSaved: true } });
      else onSaved?.(confirmed.data);
    } catch (err) {
      const stale = err.response?.status === 409 && /changed|reload|version/i.test(err.response?.data?.message || '');
      setConflict(stale); setError(stale ? t('This record changed. Reload before editing again. Your unsaved values are retained.') : err.response?.data?.message || err.message);
    } finally { setSaving(false); }
  };
  const fields = entries => entries.map(([key, label]) => <Input key={key} label={label} value={form[key]} readOnly={key==='vesselName'&&!!form.vesselId||key==='voyageNumber'&&!!form.voyageId} maxLength={key === 'billNumber' ? 100 : 200}  onChange={value => update(key, value)} />);
  const extraFields = entries => entries.map(([key, label]) => <Input key={key} label={label} value={form.register?.[key]} maxLength={key === 'additionalNotes' ? 2000 : 200} onChange={value => register(key, value)} />);
  return <form id={formId || generatedId} onSubmit={save} className="bl-editor space-y-4" data-bl-form>
    <Notice message={error} />
    {success && <p role="status" className="rounded-lg border border-emerald-600/40 bg-emerald-500/5 p-3 text-sm text-emerald-300">{t(success)}</p>}
    {isRegisterArchived(form) && <p role="status" className="text-amber-300 text-sm">{t('Register diarsipkan: hanya baca. Pulihkan dari daftar untuk mengubah data.')}</p>}
    {!form.id && <p className="rounded-lg border border-brand-500/20 bg-brand-500/5 p-3 text-sm text-zinc-300">{t('Isi pengiriman secara manual. Nomor B/L dan dokumen dapat dilengkapi kemudian.')}</p>}
    {form.id && <BLImport form={form} disabled={disabled} onBusy={setReading} onApply={patch=>setForm(previous=>({...previous,...patch}))}/>}
    <fieldset disabled={disabled} className="bl-form-group"><VesselPicker form={form} disabled={disabled} onChange={setForm}/></fieldset>
    <p className="rounded-lg bg-brand-500/5 p-3 text-sm">{t('Nomor B/L boleh kosong. Simpan pengiriman dan kumpulkan dokumen terlebih dahulu.')}</p>
    <Group title="Identitas pengiriman" disabled={disabled}>
      {fields([['billNumber', 'B/L number'], ['vesselName', 'Vessel'], ['voyageNumber', 'Voyage'], ['portOfLoading', 'Port of loading'], ['portOfDischarge', 'Port of discharge'], ['carrierName', 'Carrier']])}
    </Group>
    <Group title="Pihak terkait" disabled={disabled} columns={2}>
      {fields([['shipperName', 'Shipper'], ['consigneeName', 'Consignee'],['notifyPartyName','Notify party']])}
      {extraFields([['partyName', 'Vendor/JPT'], ['partyText', 'Pihak penanggung jawab']])}
    </Group>
    <Group title="Tanggal pengiriman" disabled={disabled}>
      <Input label="Tanggal penerbitan B/L" type="date" value={form.issueDate?.slice(0,10)} onChange={value=>update('issueDate',value||null)}/>
      <Input label="Tanggal muat di kapal" type="date" value={form.onBoardDate?.slice(0,10)} onChange={value=>update('onBoardDate',value||null)}/>
      <Input label="Tanggal keluar" type="date" value={form.register?.departureDate?.slice(0, 10)} onChange={value => register('departureDate', value || null)} />
      <Input label="Tanggal masuk" type="date" value={form.register?.arrivalDate?.slice(0, 10)} onChange={value => register('arrivalDate', value || null)} />
      <Input label="Date meaning"><select className="input-field" aria-label={t('Date meaning')} value={form.register?.dateMeaning || 'UNCONFIRMED'} onChange={event => register('dateMeaning', event.target.value)}>{['UNCONFIRMED', 'VESSEL', 'CONTAINER', 'DOCUMENT'].map(value => <option key={value} value={value}>{t(value)}</option>)}</select></Input>
    </Group>
    <details className="bl-section bl-extra" data-register-additional>
      <summary>{t('Muatan dan catatan tambahan')}<ChevronDown size={16} /></summary>
      <Group title="Informasi tambahan" disabled={disabled}>
        <Input label="Berat kotor (kg)" inputMode="decimal" value={form.grossWeightKg} onChange={value=>update('grossWeightKg',value||'0')}/>
        {[['quantity20', 'Jumlah 20'], ['quantity21', 'Jumlah 21'], ['quantity40', 'Jumlah 40']].map(([key, label]) => <Input key={key} label={label} type="number" min="0" max="2147483647" step="1" value={form.register?.[key]} onChange={value => register(key, value)} />)}
        <p className="sm:col-span-2 xl:col-span-3 text-xs leading-5 text-zinc-400">{t('Jumlah manual tidak dihitung dari kontainer. Angka 21 berasal dari daftar tarif; judul kolom buku belum dikonfirmasi.')}</p>
        <div className="sm:col-span-2 xl:col-span-3 grid sm:grid-cols-2 gap-4">
          <Input label="Cargo description"><textarea aria-label={t('Cargo description')} className="input-field" rows={3} maxLength={2000} value={form.register?.cargoDescription || ''} onChange={event => register('cargoDescription', event.target.value)} /></Input>
          <Input label="Notes"><textarea aria-label={t('Notes')} className="input-field" rows={3} maxLength={3000} value={form.notes || ''} onChange={event => update('notes', event.target.value)} /></Input>
        </div>
      </Group>
    </details>
    <details className="bl-section bl-extra" data-register-billing>
      <summary>{t('Tagihan register')}<ChevronDown size={16} /></summary>
      <Group title="Informasi tagihan pada buku" disabled={disabled}>
        <p className="sm:col-span-2 xl:col-span-3 text-xs leading-5 text-zinc-400">{t('Salin data tagihan sesuai buku atau invoice. PPh 23 dihitung hanya jika ditandai berlaku dan tetap memerlukan verifikasi keuangan.')}</p>
        {extraFields([['reference1', 'Nomor internal'], ['reference2', 'Nomor invoice']])}
        {[['additionalDate1', 'Tanggal invoice'], ['additionalDate2', 'Jatuh tempo']].map(([key, label]) => <Input key={key} label={label} type="date" value={form.register?.[key]?.slice(0, 10)} onChange={value => register(key, value || null)} />)}
        <Input label="Jumlah tagihan" inputMode="decimal" placeholder="1000000.00" value={form.registerAmount} onChange={value => update('registerAmount', value)} />
        <Input label="Status tagihan"><select className="input-field" aria-label={t('Status tagihan')} value={form.register?.billingStatus || 'NOT_RECEIVED'} onChange={event => register('billingStatus', event.target.value)}>{['NOT_RECEIVED', 'RECEIVED', 'VERIFIED', 'APPROVED', 'PAID'].map(value => <option key={value} value={value}>{t(value)}</option>)}</select></Input>
        <label className="flex items-center gap-3 rounded-lg border border-zinc-800 px-3 py-2 text-sm text-zinc-300"><input type="checkbox" checked={!!form.register?.pph23Applicable} onChange={event => register('pph23Applicable', event.target.checked)} /><span>{t('Potong PPh 23 sebesar 2%')}</span></label>
        {extraFields([['additionalNotes', 'Catatan tambahan']])}
      </Group>
    </details>
    <details className="bl-section bl-extra">
      <summary>{t('Aturan dokumen mitra')}<ChevronDown size={16} /></summary>
      <Group title="Aturan dokumen mitra" disabled={disabled}>
        <Input label="Dokumen dari mitra"><select className="input-field" aria-label={t('Dokumen dari mitra')} value={form.register?.documentPolicy || 'BL_ONLY'} onChange={event => register('documentPolicy', event.target.value)}><option value="BL_ONLY">{t('B/L saja')}</option><option value="BL_AND_PACKING">{t('B/L dan Packing List')}</option></select></Input>
        <label className="flex items-center gap-3 rounded-lg border border-zinc-800 px-3 py-2 text-sm text-zinc-300"><input type="checkbox" checked={form.register?.includeInPackingHeader !== false} onChange={event => register('includeInPackingHeader', event.target.checked)} /><span>{t('Masukkan ke Kepala Packing List')}</span></label>
      </Group>
    </details>
    <details className="bl-section bl-extra" data-register-containers>
      <summary>{t('Kontainer dalam B/L')}<ChevronDown size={16}/></summary>
      <fieldset disabled={disabled} className="p-5 space-y-4"><p className="text-sm text-zinc-400">{t('Nomor kontainer, ukuran, dan segel mengikuti dokumen B/L. Data ini dipakai untuk mencocokkan Packing List.')}</p>
        {(form.containers||[]).map((row,index)=><div key={index} className="grid sm:grid-cols-4 gap-3 border border-zinc-700 rounded-lg p-3">
          <Input label="Nomor kontainer" value={row.number} maxLength={50} onChange={value=>update('containers',form.containers.map((r,i)=>i===index?{...r,number:value.toUpperCase()}:r))}/>
          <Input label="Segel" value={row.seal} maxLength={100} onChange={value=>update('containers',form.containers.map((r,i)=>i===index?{...r,seal:value}:r))}/>
          <Input label="Ukuran"><select className="input-field" aria-label={t('Ukuran')} value={row.size||''} onChange={e=>update('containers',form.containers.map((r,i)=>i===index?{...r,size:e.target.value||null}:r))}><option value="">—</option>{['20','21','40'].map(n=><option key={n} value={n}>{n}′</option>)}</select></Input>
          <div className="flex items-end"><Button type="button" variant="secondary" onClick={()=>update('containers',form.containers.filter((_,i)=>i!==index))}>{t('Hapus kontainer')}</Button></div>
        </div>)}
        {!(form.containers||[]).length&&<p className="text-sm text-zinc-500">{t('Belum ada nomor kontainer pada B/L ini.')}</p>}
        <Button type="button" variant="secondary" onClick={()=>update('containers',[...(form.containers||[]),{number:'',seal:'',size:null,status:'REGISTERED'}])}>{t('Tambah kontainer')}</Button>
      </fieldset>
    </details>
    {form.id && <fieldset disabled={disabled} className="bl-form-group"><Input label="Revision note" maxLength={3000} value={form.revisionNote} onChange={value => update('revisionNote', value)} /></fieldset>}
    {conflict && <Button type="button" variant="secondary" onClick={() => window.location.reload()}>{t('Reload record')}</Button>}
    {!hideActions && <div className="bl-form-actions border-t border-zinc-800 pt-4 flex flex-wrap items-center gap-3"><Button type="submit" disabled={disabled}>{t(saving ? 'Saving...' : 'Simpan pengiriman')}</Button><Link className="text-sm text-zinc-400" to="/bl-register">{t('Cancel')}</Link></div>}
  </form>;
}
