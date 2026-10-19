export const COST_CATEGORIES = ['FUEL', 'TOLL', 'PARKING', 'DRIVER_ALLOWANCE', 'LOADING_UNLOADING', 'FREIGHT', 'OTHER'];
export function changeTransport(form, key, value) {
  const next = { ...form, [key]: value };
  if (['transportSource', 'carrierId', 'mode'].includes(key)) { next.vehicleId = ''; next.driverId = ''; }
  if (key === 'transportSource') { next.carrierId = ''; if (value === 'INTERNAL') next.mode = 'ROAD'; }
  return next;
}
export function transportFormFields(form, { companies = [], vehicles = [], drivers = [], t = value => value }) {
  const internal = form.transportSource === 'INTERNAL';
  const owner = internal ? companies.find(company => company.isInternal)?.id : form.carrierId;
  const road = (form.mode || 'ROAD') === 'ROAD';
  return [
    { key: 'transportSource', label: 'Transport source', required: true, options: [{ value: 'INTERNAL', label: t('SCMU fleet') }, { value: 'EXTERNAL', label: t('External vendor') }] },
    { key: 'mode', label: 'Transport mode', required: true, options: internal ? ['ROAD'] : ['ROAD', 'SEA', 'AIR', 'RAIL'] },
    ...(!internal ? [{ key: 'carrierId', label: 'Vendor', required: true, placeholder: 'Select company...', options: companies.filter(company => !company.isInternal && ['TRANSPORTER', 'BROKER', 'BOTH'].includes(company.type)).map(company => ({ value: company.id, label: company.name })) }] : []),
    ...(road ? [
      { key: 'vehicleId', label: 'Vehicle', required: internal, placeholder: 'Assign vehicle...', options: vehicles.filter(vehicle => owner && vehicle.companyId === owner && vehicle.isActive !== false).map(vehicle => ({ value: vehicle.id, label: vehicle.registrationNo })) },
      { key: 'driverId', label: 'Driver', required: internal, placeholder: 'Assign driver...', options: drivers.filter(driver => owner && driver.companyId === owner && driver.isActive !== false).map(driver => ({ value: driver.id, label: driver.name })) },
    ] : []),
  ];
}
