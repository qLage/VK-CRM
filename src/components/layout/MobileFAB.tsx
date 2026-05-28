import { useState, memo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import * as React from 'react';
import {
  LayoutDashboard,
  FileText,
  Trophy,
  User,
  Settings,
  Users,
  Wallet,
  BarChart3,
  MoreHorizontal,
  X,
  Target,
  Building,
  Briefcase
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useUIConfig, NAV_ROUTES, MOBILE_NAV_LABELS } from '@/hooks/useUIConfig';

const navKeyToIcon: Record<string, React.ElementType> = {
  home: LayoutDashboard,
  service_requests: FileText,
  rating: Trophy,
  profile: User,
  settings: Settings,
  employees: Users,
  finances: Wallet,
  analytics: BarChart3,
  planning: Target,
  branches: Building,
  teams_manage: Users,
  team: Briefcase,
};

export const MobileFABMenu = memo(function MobileFABMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const { uiRole } = useAuth();
  const { getFabItems } = useUIConfig();

  const fabKeys = getFabItems(uiRole);

  // Close menu on Escape key
  React.useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen]);

  if (fabKeys.length === 0) return null;

  const items = fabKeys.map(key => ({
    key,
    icon: navKeyToIcon[key] || LayoutDashboard,
    label: MOBILE_NAV_LABELS[key]?.label || key,
    href: NAV_ROUTES[key] || '/',
  }));

  const isAnyActive = items.some(item => location.pathname === item.href);

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 bg-background/60 backdrop-blur-sm z-[60]"
              onClick={() => setIsOpen(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 10 }}
              transition={{ type: 'spring', stiffness: 400, damping: 25 }}
              className="fixed z-[61] min-w-[180px]"
              style={{ bottom: 'calc(60px + max(8px, env(safe-area-inset-bottom)))', right: '8px' }}
              role="menu"
              aria-label="Дополнительная навигация"
            >
              <div className="glass rounded-2xl border border-border/50 p-2 shadow-2xl space-y-1">
                {items.map((item, index) => {
                  const isActive = location.pathname === item.href;
                  const Icon = item.icon;
                  return (
                    <motion.div
                      key={item.key}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                    >
                      <Link
                        to={item.href}
                        onClick={() => setIsOpen(false)}
                        className={cn(
                          "flex items-center gap-3 px-4 py-3 rounded-xl transition-all focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2",
                          isActive
                            ? "bg-primary/20 text-primary"
                            : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                        )}
                        role="menuitem"
                        aria-label={item.label}
                      >
                        <Icon className="h-5 w-5 flex-shrink-0" />
                        <span className="text-sm font-medium">{item.label}</span>
                      </Link>
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Menu button rendered inline in the nav bar */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'flex flex-col items-center gap-1 py-2 px-3 rounded-2xl transition-all relative touch-target min-w-0 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
          isOpen
            ? 'text-primary'
            : isAnyActive
              ? 'text-primary'
              : 'text-muted-foreground hover:text-foreground'
        )}
        aria-label={isOpen ? "Закрыть меню" : "Открыть дополнительное меню"}
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        {(isOpen || isAnyActive) && (
          <motion.div
            layoutId={isOpen ? undefined : "mobile-nav-active"}
            className="absolute inset-0 bg-primary/20 rounded-2xl shadow-glow"
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
          />
        )}
        <AnimatePresence mode="wait">
          {isOpen ? (
            <motion.div key="close" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.15 }}>
              <X className="h-5 w-5 relative z-10" />
            </motion.div>
          ) : (
            <motion.div key="menu" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.15 }}>
              <MoreHorizontal className="h-5 w-5 relative z-10" />
            </motion.div>
          )}
        </AnimatePresence>
        <span className={cn(
          'text-[10px] font-semibold relative z-10 transition-colors truncate max-w-[60px]',
          isOpen || isAnyActive ? 'text-primary' : 'text-muted-foreground'
        )}>
          Ещё
        </span>
      </button>
    </>
  );
});
