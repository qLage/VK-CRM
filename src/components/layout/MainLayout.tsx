import { ReactNode, forwardRef } from 'react';
import { useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Sidebar } from './Sidebar';
import { MobileNav } from './MobileNav';
import { MobileHeader } from './MobileHeader';
import { useAuth } from '@/hooks/useAuth';
import { GlobalSearch } from '@/components/GlobalSearch';

interface MainLayoutProps {
  children: ReactNode;
}

export const MainLayout = forwardRef<HTMLDivElement, MainLayoutProps>(
  function MainLayout({ children }, ref) {
    const location = useLocation();
    const { uiRole } = useAuth();

    // NOTE: MainLayout no longer derives UI from legacy `role`.

    return (
      <div ref={ref} className="flex h-screen w-full bg-background overflow-hidden">
        {/* Skip to main content link for keyboard navigation */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-lg focus:shadow-lg"
        >
          Перейти к основному содержимому
        </a>

        {/* Desktop Sidebar - Flex Item */}
        <Sidebar />

        {/* Mobile Navigation */}
        <MobileNav />
        <MobileHeader />

        {/* Main Content Area */}
        <main id="main-content" className="flex-1 h-full overflow-y-auto overflow-x-hidden relative scroll-smooth no-scrollbar select-none" role="main">
          <GlobalSearch />
          <div className="min-h-full p-3 pb-24 md:p-6 md:pb-20 lg:p-8 lg:pb-8">
            {/* Mobile Header Spacer */}
            <div className="lg:hidden h-12" />

            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="w-full h-full"
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </div>
        </main>
      </div>
    );
  }
);
