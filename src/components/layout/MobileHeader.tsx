import { memo } from 'react';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { Settings } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';

export const MobileHeader = memo(function MobileHeader() {
  const { accessLevel } = useAuth();
  const canSeeSettings = accessLevel >= 90;

  return (
    <header
      className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-xl border-b border-border/30"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      role="banner"
    >
      <div className="flex items-center justify-between px-3 h-11">
        <div className="flex items-center">
          <img src="/logo-panel.svg" alt="Логотип Ваша Крыша CRM" className="h-5 w-auto object-contain" />
        </div>
        <div className="flex items-center gap-1.5">
          <NotificationBell />
        </div>
      </div>
    </header>
  );
});
