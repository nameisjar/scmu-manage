import { formatMoney } from '../../utils/format.mjs';
import { useLanguage } from '../../i18n/LanguageContext';
import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../../api/client';
import { StatusBadge, Button, Modal, FormField, Spinner } from '../../components/common';
import { MapPin, ChevronLeft, Navigation, Upload, Clock, Truck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ModalForm, Fields, Notice, useAction } from '../../components/jpt/Workspace';
import { downloadDocument } from '../JPT/JobDetail';

const TRACKING_EVENTS = ['DEPARTED', 'REACHED_CHECKPOINT', 'HALTED', 'RESUMED', 'REACHED_DESTINATION', 'DELIVERED'];

export default function ShipmentDetail() {
  const { t: tr, locale } = useLanguage();
  const { id } = useParams();
  const [shipment, setShipment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [trackModal, setTrackModal] = useState(false);
  const [trackForm, setTrackForm] = useState({ eventType: 'REACHED_CHECKPOINT', location: '', city: '', state: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const { hasRole } = useAuth();
  const [podModal, setPodModal] = useState(false);
  const [podForm, setPodForm] = useState({ signedBy: '', receivedAt: '', notes: '' });
  const [podFile, setPodFile] = useState(null);
  const [error, setError] = useState('');
  const canOperate = hasRole('SUPER_ADMIN', 'ADMIN');

  const load = () => api.get(`/shipments/${id}`).then(r => setShipment(r.data)).finally(() => setLoading(false));
  useEffect(() => { load(); }, [id]);

  const addTracking = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      await api.post(`/shipments/${id}/tracking`, trackForm);
      setTrackModal(false);
      setTrackForm({ eventType: 'REACHED_CHECKPOINT', location: '', city: '', state: '', notes: '' });
      load();
    } catch (error) { setError(error.response?.data?.message || error.message); } finally { setSubmitting(false); }
  };

  if (loading) return <Spinner />;
  if (!shipment) return <div className="text-zinc-400">{tr("Shipment not found")}</div>;

  const s = shipment;

  return (
    <div className="max-w-4xl animate-fade-in space-y-5">
      <Notice message={error} />
      <Link to="/shipments" className="text-zinc-500 hover:text-zinc-300 flex items-center gap-1 text-sm w-fit"><ChevronLeft size={16} />{tr("Back")}</Link>
      {s.job && <Link className="text-brand-400 text-sm block" to={`/jobs/${s.job.id}`}>{s.job.jobNumber} →</Link>}

      {/* Header */}
      <div className="card p-6">
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="font-mono text-xs text-brand-400 mb-1">{s.shipmentNumber}</p>
            <h1 className="font-display text-xl font-bold text-zinc-100">{s.originCity} → {s.destCity}</h1>
            <p className="text-zinc-500 text-sm mt-0.5">{s.shipper?.name}</p>
          </div>
          <div className="flex items-center gap-2">
            <StatusBadge status={s.status} />
            {canOperate && <><Button size="sm" onClick={() => setTrackModal(true)} variant="secondary"><Navigation size={14} /> {tr("Update Tracking")}</Button><Button size="sm" onClick={() => setPodModal(true)} variant="secondary"><Upload size={14} />{tr('Upload POD')}</Button></>}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-5 pt-4 border-t border-zinc-800">
          <Detail label={tr("Vehicle")} value={s.vehicle?.registrationNo || '—'} mono />
          <Detail label={tr("Driver")} value={s.driver?.name || '—'} />
          <Detail label={tr("Loading Date")} value={new Date(s.loadingDate).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })} />
          <Detail label={tr("Freight Amount")} value={s.freightAmount ? formatMoney(s.freightAmount, s.currency, locale) : '—'} mono />
          <Detail label={tr("Goods Type")} value={s.goodsType?.name || '—'} />
          <Detail label={tr("Weight")} value={s.weight ? `${s.weight} T` : '—'} />
          <Detail label={tr("Shipping reference")} value={s.ewayBillNo || '—'} mono />
          <Detail label={tr("Delivery note number")} value={s.lrNumber || '—'} mono />
          <Detail label={tr('Transport mode')} value={tr(s.mode)} />
          <Detail label={tr('Transport source')} value={s.transportSource === 'INTERNAL' ? tr('SCMU fleet') : s.carrier?.name || tr('External vendor')} />
          <Detail label={tr('Container number')} value={s.containerNumber || '—'} />
        </div>
      </div>

      {/* Tracking Timeline */}
      <div className="card p-5">
        <h2 className="font-display font-semibold text-zinc-200 mb-4 flex items-center gap-2">
          <Navigation size={16} className="text-brand-400" /> {tr("Tracking Timeline")} </h2>
        {s.trackingEvents?.length === 0 ? (
          <div className="text-center py-8 text-zinc-500 text-sm">{tr("No tracking events yet")}</div>
        ) : (
          <div className="space-y-0">
            {s.trackingEvents?.map((ev, i) => (
              <div key={ev.id} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className={`w-3 h-3 rounded-full mt-1 flex-shrink-0 ${i === 0 ? 'bg-brand-400 pulse-brand' : 'bg-zinc-600'}`} />
                  {i < s.trackingEvents.length - 1 && <div className="w-px flex-1 bg-zinc-800 my-1" />}
                </div>
                <div className="pb-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono font-medium text-brand-400">{tr(ev.eventType.replace(/_/g, ' '))}</span>
                    <span className="text-xs text-zinc-500 flex items-center gap-1"><Clock size={10} /> {new Date(ev.recordedAt).toLocaleString(locale)}</span>
                  </div>
                  <p className="text-sm text-zinc-300 mt-0.5">{ev.location}</p>
                  {ev.city && <p className="text-xs text-zinc-500">{ev.city}, {ev.state}</p>}
                  {ev.notes && <p className="text-xs text-zinc-500 mt-1 italic">{ev.notes}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* PODs */}
      {s.pods?.length > 0 && (
        <div className="card p-5">
          <h2 className="font-display font-semibold text-zinc-200 mb-4">{tr("Proof of Delivery (")}{s.pods.length})</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {s.pods.map(pod => (
              <button key={pod.id} type="button" onClick={async () => { try { await downloadDocument(`/shipments/${id}/pod/${encodeURIComponent(pod.imageUrl.split('/').pop())}`, pod.imageUrl.split('/').pop()); } catch (error) { setError(error.response?.data?.message || error.message); } }}
                className="text-left block rounded-lg overflow-hidden border border-zinc-800 hover:border-brand-500/50 transition-colors">
                <p className="px-3 pt-3 text-xs text-brand-400">{tr('Download')} · {tr('Proof of delivery')}</p>
                <div className="px-3 py-2">
                  <p className="text-xs text-zinc-400">{tr("Signed by:")} {pod.signedBy || '—'}</p>
                  {pod.receivedAt && <p className="text-xs text-zinc-600">{new Date(pod.receivedAt).toLocaleDateString(locale)}</p>}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Tracking Modal */}
      {podModal && <ModalForm title="Upload POD" onClose={() => setPodModal(false)} onSubmit={async () => { const payload = new FormData(); payload.append('podImage', podFile); for (const [key, value] of Object.entries(podForm)) if (value) payload.append(key, value); await api.post(`/shipments/${id}/pod`, payload); load(); }}><Fields fields={[{ key: 'signedBy', label: 'Received by', required: true }, { key: 'receivedAt', label: 'Received at', type: 'datetime-local' }, { key: 'notes', label: 'Notes', type: 'textarea' }]} values={podForm} onChange={(key, value) => setPodForm({ ...podForm, [key]: value })} /><label className="block text-sm text-zinc-400">{tr('PDF or image, maximum 5 MB')}<input type="file" className="input-field mt-2" accept="image/png,image/jpeg,image/webp,application/pdf" required onChange={event => setPodFile(event.target.files[0])} /></label></ModalForm>}
      <Modal open={trackModal} onClose={() => setTrackModal(false)} title={tr("Add Tracking Event")}>
        <form onSubmit={addTracking} className="space-y-4">
          <Notice message={error} />
          <FormField label={tr("Event Type")} required>
            <select className="input-field" value={trackForm.eventType} onChange={e => setTrackForm(f => ({ ...f, eventType: e.target.value }))}>
              {TRACKING_EVENTS.map(t => <option key={t} value={t}>{tr(t.replace(/_/g, ' '))}</option>)}
            </select>
          </FormField>
          <FormField label={tr("Location / Description")} required>
            <input className="input-field" value={trackForm.location} onChange={e => setTrackForm(f => ({ ...f, location: e.target.value }))} placeholder={tr('Near Merauke warehouse')} required />
          </FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label={tr("City")}>
              <input className="input-field" value={trackForm.city} onChange={e => setTrackForm(f => ({ ...f, city: e.target.value }))} placeholder="Merauke" />
            </FormField>
            <FormField label={tr("State")}>
              <input className="input-field" value={trackForm.state} onChange={e => setTrackForm(f => ({ ...f, state: e.target.value }))} placeholder="Papua Selatan" />
            </FormField>
          </div>
          <FormField label={tr("Notes")}>
            <textarea className="input-field" rows={2} value={trackForm.notes} onChange={e => setTrackForm(f => ({ ...f, notes: e.target.value }))} placeholder={tr("Any additional info...")} />
          </FormField>
          <div className="flex justify-end gap-3">
            <Button type="button" variant="secondary" onClick={() => setTrackModal(false)}>{tr("Cancel")}</Button>
            <Button type="submit" disabled={submitting}>{submitting ? tr('Saving...') : tr('Add Event')}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function Detail({ label, value, mono }) {
  const { t: tr } = useLanguage();
  return (
    <div>
      <p className="text-xs text-zinc-500 mb-0.5">{tr(label)}</p>
      <p className={`text-sm text-zinc-200 ${mono ? 'font-mono' : 'font-medium'}`}>{value}</p>
    </div>
  );
}
