import { useState } from 'react';
import api from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../i18n/LanguageContext';
import { PageHeader, SearchInput } from '../../components/common';
import { Button, DataTable, Fields, ModalForm, Notice, ResourceState, useAction, useResource } from '../../components/jpt/Workspace';
import { INTERNAL_ROLES } from '../../auth-policy.mjs';
export default function UserManagement() {
  const { t } = useLanguage(); const { user, isSuperAdmin } = useAuth();
  const resource = useResource(isSuperAdmin() ? '/users?limit=200' : null); const action = useAction(resource.reload);
  const [search, setSearch] = useState(''); const [form, setForm] = useState(null);
  if (!isSuperAdmin()) return <Notice message="User management is restricted to Super Admin" />;
  const rows = (resource.data?.data || []).filter(row => `${row.name} ${row.email}`.toLowerCase().includes(search.toLowerCase()));
  return <div className="space-y-5 animate-fade-in"><PageHeader title={t('User Management')} subtitle={t('Only Super Admin and Admin can access SCMU')} action={<Button onClick={() => setForm({ name: '', email: '', password: '', phone: '', role: 'ADMIN' })}>{t('Add User')}</Button>} /><Notice message={action.error} /><SearchInput value={search} onChange={setSearch} placeholder={t('Search users...')} />
    <ResourceState resource={resource}><DataTable rows={rows} columns={[{ key: 'name', label: 'Name' }, { key: 'email', label: 'Email' }, { key: 'role', label: 'Role', render: row => t(row.role) }, { key: 'phone', label: 'Phone' }, { key: 'isActive', label: 'Status', render: row => t(row.isActive ? 'Active' : 'Inactive') }, { key: 'actions', label: 'Actions', render: row => <Button size="sm" variant="secondary" disabled={action.busy || row.id === user.id} onClick={() => action.run(() => api.put(`/users/${row.id}`, { isActive: !row.isActive }))}>{t(row.isActive ? 'Deactivate' : 'Activate')}</Button> }]} /></ResourceState>
    {form && <ModalForm title="Add User" onClose={() => setForm(null)} onSubmit={async () => { await api.post('/users', form); resource.reload(); }}><Fields fields={[{ key: 'name', label: 'Full Name', required: true }, { key: 'email', label: 'Email', type: 'email', required: true }, { key: 'password', label: 'Password', type: 'password', required: true }, { key: 'phone', label: 'Phone' }, { key: 'role', label: 'Role', options: INTERNAL_ROLES, required: true }]} values={form} onChange={(key, value) => setForm({ ...form, [key]: value })} /></ModalForm>}
  </div>;
}
