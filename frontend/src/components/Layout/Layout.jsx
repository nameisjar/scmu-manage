import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import { ApprovalToast } from '../jpt/DirectorApproval';
import { NavigationScrollArea, PageNavigationProvider } from './PageNavigation';

export default function Layout() {
  return (
    <PageNavigationProvider><div className="flex h-screen overflow-hidden bg-zinc-950">
      <Sidebar />
      <NavigationScrollArea>
          <ApprovalToast />
          <Outlet />
      </NavigationScrollArea>
    </div></PageNavigationProvider>
  );
}
