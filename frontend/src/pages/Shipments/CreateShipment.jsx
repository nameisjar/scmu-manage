import { Fields } from '../../components/jpt/Workspace';
import { transportFormFields, changeTransport } from '../../components/jpt/transport.mjs';
import { useLanguage } from '../../i18n/LanguageContext';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api/client';
import { PageHeader, Button, FormField } from '../../components/common';

const VEHICLE_TYPES = ['TRUCK', 'TRAILER', 'CONTAINER', 'TANKER', 'REFRIGERATED', 'FLATBED', 'MINI_TRUCK', 'TEMPO'];

export default function CreateShipment() {
  const { t: tr } = useLanguage();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [companies, setCompanies] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [goodsTypes, setGoodsTypes] = useState([]);
  const [routes, setRoutes] = useState([]);

  const [form, setForm] = useState({
    transportSource: 'INTERNAL', mode: 'ROAD', carrierId: '', shipperCompanyId: '', vehicleId: '', driverId: '', goodsTypeId: '', routeId: '',
    originCity: '', originState: '', destCity: '', destState: '',
    weight: '', quantity: 1, freightAmount: '', loadingDate: '', expectedDelivery: '',
    ewayBillNo: '', lrNumber: '', notes: '',
  });

  useEffect(() => {
    Promise.all([
      api.get('/companies', { params: { limit: 200 } }),
      api.get('/fleet', { params: { limit: 200 } }),
      api.get('/drivers', { params: { limit: 200 } }),
      api.get('/goods'),
      api.get('/routes'),
    ]).then(([c, v, d, g, r]) => {
      setCompanies(c.data.data || []);
      setVehicles(v.data.data || []);
      setDrivers(d.data.data || []);
      setGoodsTypes(g.data || []);
      setRoutes(r.data || []);
    });
  }, []);

  const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

  const handleRouteSelect = (routeId) => {
    const route = routes.find(r => r.id === routeId);
    if (route) setForm(f => ({ ...f, routeId, originCity: route.originCity, originState: route.originState, destCity: route.destCity, destState: route.destState }));
    else setForm(f => ({ ...f, routeId }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { data } = await api.post('/shipments', {
        ...form,
        shipperCompanyId: undefined,
        quantity: Number(form.quantity),
        weight: form.weight ? Number(form.weight) : undefined,
        freightAmount: form.freightAmount ? Number(form.freightAmount) : undefined,
      });
      navigate(`/shipments/${data.id}`);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create shipment');
    } finally { setLoading(false); }
  };

  return (
    <div className="max-w-3xl animate-fade-in">
      <PageHeader title={tr("Create Shipment")} subtitle={tr("Schedule and dispatch a new freight trip")} />
      {error && <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">{tr(error)}</div>}

      <form onSubmit={handleSubmit} className="card p-6 space-y-5">
        <div className="grid grid-cols-2 gap-4">

          <FormField label={tr("Route")}>
            <select className="input-field" value={form.routeId} onChange={e => handleRouteSelect(e.target.value)}>
              <option value="">{tr("Custom route")}</option>
              {routes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </FormField>

          <FormField label={tr("Origin City")} required><input className="input-field" value={form.originCity} onChange={set('originCity')} placeholder="Surabaya" required /></FormField>
          <FormField label={tr("Origin State")} required><input className="input-field" value={form.originState} onChange={set('originState')} placeholder="Jawa Timur" required /></FormField>
          <FormField label={tr("Destination City")} required><input className="input-field" value={form.destCity} onChange={set('destCity')} placeholder="Merauke" required /></FormField>
          <FormField label={tr("Destination State")} required><input className="input-field" value={form.destState} onChange={set('destState')} placeholder="Papua Selatan" required /></FormField>

          <div className="col-span-2"><Fields fields={transportFormFields(form, { companies, vehicles, drivers, t: tr })} values={form} onChange={(key, value) => setForm(previous => changeTransport(previous, key, value))} /></div>

          <FormField label={tr("Goods Type")}>
            <select className="input-field" value={form.goodsTypeId} onChange={set('goodsTypeId')}>
              <option value="">{tr("Select goods...")}</option>
              {goodsTypes.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </FormField>

          <FormField label={tr("Weight (tonnes)")}><input type="number" className="input-field" value={form.weight} onChange={set('weight')} placeholder="10.5" step="0.1" /></FormField>
          <FormField label={tr("Freight Amount (IDR)")}><input type="number" className="input-field" value={form.freightAmount} onChange={set('freightAmount')} placeholder="15000000" /></FormField>
          <FormField label={tr("Loading Date")} required><input type="datetime-local" className="input-field" value={form.loadingDate} onChange={set('loadingDate')} required /></FormField>
          <FormField label={tr("Expected Delivery")}><input type="datetime-local" className="input-field" value={form.expectedDelivery} onChange={set('expectedDelivery')} /></FormField>
          <FormField label={tr("Shipping reference")}><input className="input-field font-mono" value={form.ewayBillNo} onChange={set('ewayBillNo')} placeholder="REF-SCMU-DEMO-001" /></FormField>
          <FormField label={tr("Delivery note number")}><input className="input-field font-mono" value={form.lrNumber} onChange={set('lrNumber')} placeholder="SJ/SCMU/2026/001" /></FormField>

          <div className="col-span-2">
            <FormField label={tr("Notes")}><textarea className="input-field" rows={2} value={form.notes} onChange={set('notes')} placeholder={tr("Additional instructions...")} /></FormField>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2 border-t border-zinc-800">
          <Button type="button" variant="secondary" onClick={() => navigate('/shipments')}>{tr("Cancel")}</Button>
          <Button type="submit" disabled={loading}>{loading ? tr('Creating...') : tr('Create Shipment')}</Button>
        </div>
      </form>
    </div>
  );
}
