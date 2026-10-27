import { Outlet } from 'react-router-dom';
import { useEffect } from 'react';
import Sidebar from './Sidebar';
import { ApprovalToast } from '../jpt/DirectorApproval';
import { NavigationScrollArea, PageNavigationProvider } from './PageNavigation';

export default function Layout() {
  useEffect(() => {
    const previous = document.body.dataset.appTheme;
    document.body.dataset.appTheme = 'light';
    return () => { if (previous) document.body.dataset.appTheme = previous; else delete document.body.dataset.appTheme; };
  }, []);
  return (
    <PageNavigationProvider><div className="flex h-dvh min-h-0 overflow-hidden bg-zinc-950">
      <Sidebar />
      <NavigationScrollArea>
          <ApprovalToast />
          <Outlet />
      </NavigationScrollArea>
    </div></PageNavigationProvider>
  );
}
