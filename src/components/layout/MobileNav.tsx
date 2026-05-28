import { memo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  LayoutDashboard,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { useRatingVisibility } from '@/hooks/useRatingVisibility';
import { useUIConfig, NAV_ITEMS_REGISTRY } from '@/hooks/useUIConfig';
import { MobileFABMenu } from './MobileFAB';

export const MobileNav = memo(function MobileNav() {
  const location = useLocation();
  const { profile, accessLevel, uiRole } = useAuth();
  const { canSeeRating } = useRatingVisibility();
  const { getNavItems, getFabItems } = useUIConfig();

  const navKeys = getNavItems(uiRole);
  const fabKeys = getFabItems(uiRole);

  const filteredItems = navKeys
    .filter(key => {
      if (key === 'rating' && !canSeeRating) return false;
      if (key === 'team') {
        const isHighLevel = accessLevel >= 90;
        const hasNoTeam = !profile?.team_id;
        if (hasNoTeam && !isHighLevel) return false;
      }
      return true;
    })
    .map(key => {
      const item = NAV_ITEMS_REGISTRY[key] || {
        icon: LayoutDashboard,
        label: key,
        href: '#'
      };

      return {
        key,
        ...item
      };
    });

  const hasFabItems = fabKeys.length > 0;

  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-50" role="navigation" aria-label="Мобильная навигация">
      {/* Gradient blur background */}
      <div className="absolute inset-0 bg-gradient-to-t from-background via-background/95 to-transparent -top-4" />
      <div className="relative glass border-t border-border/50" style={{ paddingBottom: 'max(6px, env(safe-area-inset-bottom))' }}>
        <div className="flex items-center justify-around px-1.5 py-1.5">
          {filteredItems.map((item) => {
            const isActive = location.pathname === item.href;
            const Icon = item.icon;

            return (
              <Link
                key={item.key}
                to={item.href}
                className={cn(
                  'flex flex-col items-center gap-0.5 py-1.5 px-2 rounded-xl transition-all relative touch-target flex-1 max-w-[80px] focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2',
                  isActive
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                aria-label={item.label}
                aria-current={isActive ? "page" : undefined}
              >
                {isActive && (
                  <motion.div
                    layoutId="mobile-nav-active"
                    className="absolute inset-0 bg-primary/20 rounded-xl shadow-glow"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                <Icon className={cn(
                  'h-4.5 w-4.5 relative z-10 transition-transform',
                  isActive && 'text-primary scale-110'
                )} />
                <span 
                  translate="no"
                  className={cn(
                    'text-[9px] font-medium relative z-10 transition-colors truncate w-full text-center',
                    isActive ? 'text-primary' : 'text-muted-foreground'
                  )}
                >
                  {item.label}
                </span>
              </Link>
            );
          })}
          {hasFabItems && (
            <div className="shrink-0 px-1.5 border-l border-white/5 ml-1">
              <MobileFABMenu />
            </div>
          )}
        </div>
      </div>
    </nav>
  );
});
