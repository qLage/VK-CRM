import { useEffect, useState, memo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LogOut,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { cn, getAvatarUrl } from '@/lib/utils';
import { useAuth, AppRole } from '@/hooks/useAuth';
import { usePropertyPendingCount } from '@/hooks/useProperties';
import { useDealsPendingCount, useServiceRequestsPendingCount } from '@/hooks/useNavBadges';

import { useUIConfig, NAV_ITEMS_REGISTRY } from '@/hooks/useUIConfig';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';

export const Sidebar = memo(function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('sidebar_collapsed') === '1';
    } catch {
      return false;
    }
  });
  const location = useLocation();
  const navigate = useNavigate();
  const { profile, signOut, role, accessLevel, uiRole } = useAuth();
  const { getSidebarItems } = useUIConfig();
  const { data: pendingPropertiesCount } = usePropertyPendingCount();
  const isLeader = accessLevel >= 50;
  const hasTeam = !!profile?.team_id;
  const { data: pendingServiceRequestsCount } = useServiceRequestsPendingCount(isLeader);
  const { data: pendingDealsCount } = useDealsPendingCount(isLeader, accessLevel, hasTeam);

  useEffect(() => {
    try {
      localStorage.setItem('sidebar_collapsed', isCollapsed ? '1' : '0');
    } catch {}
  }, [isCollapsed]);

  // Get items based on UI scope configured in UIConfig
  const sidebarKeys = getSidebarItems(uiRole);

  // Map keys to full item definitions and apply additional runtime filters
  const filteredItems = sidebarKeys
    .map(key => {
      const entry = NAV_ITEMS_REGISTRY[key];
      if (!entry) return null; // Skip keys not in registry (stale localStorage)
      return { key, ...entry };
    })
    .filter((item): item is NonNullable<typeof item> => {
      if (!item || !item.href || !item.icon) return false;

      // Hide Templates
      if (item.href === '/templates') return false;

      // Logic for "Team" (Команда) page
      if (item.href === '/team') {
        const isHighLevel = accessLevel >= 90;
        const hasNoTeam = !profile?.team_id;
        if (hasNoTeam && !isHighLevel) return false;
      }

      return true;
    });

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const getRoleLabel = (r: AppRole | null) => {
    switch (r) {
      case 'admin': return 'Администратор';
      case 'director': return 'Директор';
      case 'commercial': return 'Коммерческий Директор';
      case 'head_sales': return 'РОП';
      case 'sales_manager': return 'МОП';
      case 'manager': return 'Управляющий'; // Legacy
      case 'realtor': return 'Риелтор';
      case 'mortgage_broker': return 'Ипотечный Брокер';
      default: return 'Пользователь';
    }
  }

  return (
    <aside
      className={cn(
        'hidden lg:flex flex-col h-full border-r border-border bg-card/50 backdrop-blur-xl transition-all duration-300 z-50 shrink-0 relative',
        isCollapsed ? 'w-20' : 'w-[280px]'
      )}
    >
      {/* Toggle Button */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute -right-3 top-9 z-50 flex h-6 w-6 items-center justify-center rounded-full border border-border bg-card shadow-md hover:bg-accent transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
        aria-label={isCollapsed ? "Развернуть боковую панель" : "Свернуть боковую панель"}
        aria-expanded={!isCollapsed}
      >
        {isCollapsed ? (
          <ChevronRight className="h-3 w-3" />
        ) : (
          <ChevronLeft className="h-3 w-3" />
        )}
      </button>

      {/* Header */}
      <div className={cn("flex items-center gap-4 px-6 py-6 border-b border-border/40 min-h-[100px]", isCollapsed && "justify-center px-2")}>
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl transition-all duration-500">
          <img src="/logo.svg" alt="Logo" className="h-12 w-12 object-contain" />
        </div>
        <AnimatePresence>
          {!isCollapsed && (
            <motion.div
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 'auto' }}
              exit={{ opacity: 0, width: 0 }}
              className="overflow-hidden whitespace-nowrap"
            >
              <span className="text-lg font-bold tracking-tight">Ваша Крыша</span>
              <p className="text-xs text-muted-foreground">CRM System</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <nav className="flex-1 overflow-y-auto py-6 px-3 space-y-1 custom-scrollbar" role="navigation" aria-label="Основная навигация">
        {filteredItems.map((item) => {
          const isActive = location.pathname === item.href;

          return (
            <Link
              key={item.href}
              to={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group relative focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
                isActive
                  ? 'bg-primary text-primary-foreground shadow-lg shadow-primary/20'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                isCollapsed && "justify-center px-0"
              )}
              aria-label={item.label}
              aria-current={isActive ? "page" : undefined}
            >
              <item.icon className={cn("h-5 w-5 shrink-0", isActive ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground")} />

              {!isCollapsed && (
                <span translate="no" className="font-medium truncate">{item.label}</span>
              )}

              {/* Pending properties badge */}
              {item.key === 'properties' && !!pendingPropertiesCount && pendingPropertiesCount > 0 && (
                <span className={cn(
                  "flex items-center justify-center min-w-[20px] h-5 px-1.5 bg-amber-500 rounded-full shadow-lg shadow-amber-500/40 border border-amber-400/50 text-[10px] font-black text-white leading-none",
                  isCollapsed && "absolute -top-1 -right-1"
                )}>
                  {pendingPropertiesCount}
                </span>
              )}

              {/* Pending service requests badge for leaders */}
              {item.key === 'service_requests' && !!pendingServiceRequestsCount && pendingServiceRequestsCount > 0 && (
                <span className={cn(
                  "flex items-center justify-center min-w-[20px] h-5 px-1.5 bg-amber-500 rounded-full shadow-lg shadow-amber-500/40 border border-amber-400/50 text-[10px] font-black text-white leading-none",
                  isCollapsed && "absolute -top-1 -right-1"
                )}>
                  {pendingServiceRequestsCount}
                </span>
              )}

              {/* Pending deals badge for leaders */}
              {item.key === 'deals' && !!pendingDealsCount && pendingDealsCount > 0 && (
                <span className={cn(
                  "flex items-center justify-center min-w-[20px] h-5 px-1.5 bg-amber-500 rounded-full shadow-lg shadow-amber-500/40 border border-amber-400/50 text-[10px] font-black text-white leading-none",
                  isCollapsed && "absolute -top-1 -right-1"
                )}>
                  {pendingDealsCount}
                </span>
              )}

              {isActive && !isCollapsed && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute right-2 h-1.5 w-1.5 rounded-full bg-primary-foreground"
                />
              )}

              {isCollapsed && (
                <div className="absolute left-14 z-50 ml-2 w-max rounded-md bg-popover px-2 py-1 text-sm font-medium text-popover-foreground shadow-md opacity-0 transition-opacity group-hover:opacity-100 pointer-events-none">
                  {item.label}
                </div>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer / User Profile */}
      <div className="p-3 border-t border-border/40 mt-auto">
        <div className={cn("flex flex-col gap-2 p-3 rounded-2xl bg-muted/30 transition-all", isCollapsed ? "items-center" : "")}>
          {!isCollapsed && (
            <div className="flex items-center gap-3 mb-2">
              <Avatar className="h-8 w-8 rounded-full border border-white/10 shrink-0">
                {profile?.avatar_url && (
                  <AvatarImage
                    src={getAvatarUrl(profile.avatar_url)}
                    alt={profile.full_name || ''}
                    className="object-cover"
                  />
                )}
                <AvatarFallback className="bg-primary/20 text-primary font-bold text-xs">
                  {profile?.full_name?.charAt(0) || 'U'}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 overflow-hidden">
                <p className="text-sm font-medium truncate text-foreground">{profile?.full_name}</p>
                <p translate="no" className="text-xs text-muted-foreground truncate">
                  {profile?.position?.name || (profile as any)?.position_name || getRoleLabel(role)}
                </p>
              </div>
            </div>
          )}

          <button
            onClick={handleSignOut}
            className={cn(
              "flex items-center gap-2 rounded-xl text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors h-9 focus:outline-none focus:ring-2 focus:ring-destructive focus:ring-offset-2",
              isCollapsed ? "justify-center w-9" : "justify-start px-3 w-full"
            )}
            aria-label="Выйти из системы"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {!isCollapsed && <span className="text-sm font-medium">Выйти</span>}
          </button>
        </div>
      </div>
    </aside>
  );
});
