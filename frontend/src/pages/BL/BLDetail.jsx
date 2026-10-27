import { useParams } from 'react-router-dom';
import { Spinner } from '../../components/common';
import { Notice, useResource } from '../../components/jpt/Workspace';
import { useBL } from '../../i18n/bl.mjs';
import BLWorkspace from './BLWorkspace';
import BLPageHeader from './BLPageHeader';
import RegisterForm from './RegisterForm';
export { default as RegisterForm } from './RegisterForm';

export default function BLDetail({ create = false }) {
  const { id } = useParams(); const { t } = useBL(); const resource = useResource(create ? null : `/bl-register/${id}`);
  if (!create && resource.loadedUrl === `/bl-register/${id}` && resource.data) return <BLWorkspace key={id} bill={resource.data} />;
  return <div className="bl-detail-page"><BLPageHeader title={t(create ? 'Tambah Pengiriman' : 'B/L register')} /><div className="bl-workspace-body"><Notice message={resource.error} />{create ? <RegisterForm /> : resource.loading && <Spinner />}</div></div>;
}
