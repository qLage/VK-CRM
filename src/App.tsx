import { useEffect, lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./hooks/useAuth";
import { UIConfigProvider } from "./hooks/useUIConfig";
import { ThemeProvider } from "./components/theme-provider";
import { RealtimeProvider } from "./contexts/RealtimeContext";
import { EnableNotificationsPrompt } from "./components/notifications/EnableNotificationsPrompt";
import { ForcedNotificationDisplay } from "./components/notifications/ForcedNotificationDisplay";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import { RequireAuth } from "./components/layout/RequireAuth";
import { ErrorBoundary } from "./components/ui/error-boundary";

// Service Worker registration is handled in main.tsx

// Lazy load all pages for faster initial load
const Index = lazy(() => import("./pages/Index"));
const Profile = lazy(() => import("./pages/Profile"));
const Employees = lazy(() => import("./pages/Employees"));
const EmployeeProfile = lazy(() => import("./pages/EmployeeProfile"));
const Finances = lazy(() => import("./pages/Finances"));
const Analytics = lazy(() => import("./pages/Analytics"));
const Settings = lazy(() => import("./pages/Settings"));
const Rating = lazy(() => import("./pages/Rating"));
const Team = lazy(() => import("./pages/Team"));
const Attendance = lazy(() => import("./pages/Attendance"));
const TeamManagement = lazy(() => import("./pages/TeamManagement"));
const ServiceRequests = lazy(() => import("./pages/ServiceRequests"));
const Planning = lazy(() => import("./pages/Planning"));
const Branches = lazy(() => import("./pages/Branches"));
const Deals = lazy(() => import("./pages/Deals"));
const MortgageDeals = lazy(() => import("./pages/MortgageDeals"));
const DealDetail = lazy(() => import("./pages/DealDetail"));
const DealForm = lazy(() => import("./pages/DealForm"));
const DealTable = lazy(() => import("./pages/DealTable"));
const DealTeamsSummary = lazy(() => import("./pages/DealTeamsSummary"));
const Properties = lazy(() => import("./pages/Properties"));
const Leads = lazy(() => import("./pages/Leads"));
const Clients = lazy(() => import("./pages/Clients"));

// Loading fallback component
const PageLoader = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <div className="flex flex-col items-center gap-4">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      <p className="text-sm text-muted-foreground">Загрузка...</p>
    </div>
  </div>
);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 минут (снижает количество запросов при навигации)
      gcTime: 30 * 60 * 1000, // 30 минут сборщик мусора
      refetchOnWindowFocus: false, // Don't refetch on window focus
      refetchOnReconnect: false, // Don't refetch on reconnect
      retry: (failureCount, error: any) => {
        // Не повторять запросы в случае ошибок аутентификации (401/403)
        if (error?.response?.status >= 400 && error?.response?.status < 500) return false;
        return failureCount < 2; // Только 2 попытки
      },
    },
  },
});

const APP_VERSION = "1.0.15"; // Deals / Ипотека toggle, страница ипотеки, salaries + mortgage splits

const App = () => {
  // Force reload if version mismatch (fixes persistent caching)
  useEffect(() => {
    const savedVersion = localStorage.getItem("app_version");
    if (savedVersion !== APP_VERSION) {
      localStorage.setItem("app_version", APP_VERSION);
      // Clear cache and reload
      if ('caches' in window) {
        caches.keys().then((names) => {
          for (const name of names) caches.delete(name);
        });
      }
      window.location.reload();
    }
  }, []);

  // App version check and cache management

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
        <TooltipProvider>
          <AuthProvider>
            <UIConfigProvider>
              <RealtimeProvider>
                <Toaster />
                <Sonner />
                <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                  <EnableNotificationsPrompt />
                  <ForcedNotificationDisplay />
                  <ErrorBoundary>
                    <Suspense fallback={<PageLoader />}>
                      <Routes>
                        <Route path="/auth" element={<Auth />} />
                        <Route path="/" element={
                          <RequireAuth>
                            <Index />
                          </RequireAuth>
                        } />
                        <Route path="/profile" element={
                          <RequireAuth>
                            <Profile />
                          </RequireAuth>
                        } />
                        {/* Reports page deleted */}
                        <Route path="/employees" element={
                          <RequireAuth>
                            <Employees />
                          </RequireAuth>
                        } />
                        <Route path="/employees/:id" element={
                          <RequireAuth>
                            <EmployeeProfile />
                          </RequireAuth>
                        } />
                        <Route path="/finances" element={
                          <RequireAuth>
                            <Finances />
                          </RequireAuth>
                        } />
                        <Route path="/analytics" element={
                          <RequireAuth>
                            <Analytics />
                          </RequireAuth>
                        } />
                        <Route path="/settings" element={
                          <RequireAuth>
                            <Settings />
                          </RequireAuth>
                        } />
                        <Route path="/rating" element={
                          <RequireAuth>
                            <Rating />
                          </RequireAuth>
                        } />
                        <Route path="/team" element={
                          <RequireAuth>
                            <Team />
                          </RequireAuth>
                        } />
                        <Route path="/attendance" element={
                          <RequireAuth>
                            <Attendance />
                          </RequireAuth>
                        } />
                        <Route path="/planning" element={
                          <RequireAuth>
                            <Planning />
                          </RequireAuth>
                        } />
                        <Route path="/branches" element={
                          <RequireAuth>
                            <Branches />
                          </RequireAuth>
                        } />
                        <Route path="/service-requests" element={
                          <RequireAuth>
                            <ServiceRequests />
                          </RequireAuth>
                        } />
                        <Route path="/properties" element={
                          <RequireAuth>
                            <Properties />
                          </RequireAuth>
                        } />
                        <Route path="/leads" element={
                          <RequireAuth>
                            <Leads />
                          </RequireAuth>
                        } />
                        <Route path="/clients" element={
                          <RequireAuth>
                            <Clients />
                          </RequireAuth>
                        } />
                        <Route path="/teams-manage" element={
                          <RequireAuth>
                            <TeamManagement />
                          </RequireAuth>
                        } />
                        <Route path="/deals" element={
                          <RequireAuth>
                            <Deals />
                          </RequireAuth>
                        } />
                        <Route path="/deals/mortgage" element={
                          <RequireAuth>
                            <MortgageDeals />
                          </RequireAuth>
                        } />
                        <Route path="/deal-table" element={
                          <RequireAuth>
                            <DealTable />
                          </RequireAuth>
                        } />
                        <Route path="/deal-teams-summary" element={
                          <RequireAuth>
                            <DealTeamsSummary />
                          </RequireAuth>
                        } />
                        {/* Redirect old deal routes to unified page */}
                        <Route path="/my-deals" element={<Navigate to="/deals" replace />} />
                        <Route path="/team-deals" element={<Navigate to="/deals" replace />} />
                        <Route path="/branch-deals" element={<Navigate to="/deals" replace />} />
                        <Route path="/company-deals" element={<Navigate to="/deals" replace />} />
                        <Route path="/deals/new" element={
                          <RequireAuth>
                            <DealForm />
                          </RequireAuth>
                        } />
                        <Route path="/deals/:id" element={
                          <RequireAuth>
                            <DealDetail />
                          </RequireAuth>
                        } />
                        <Route path="/deals/:id/edit" element={
                          <RequireAuth>
                            <DealForm />
                          </RequireAuth>
                        } />
                        <Route path="*" element={<NotFound />} />
                      </Routes>
                    </Suspense>
                  </ErrorBoundary>
                </BrowserRouter>
              </RealtimeProvider>
            </UIConfigProvider>
          </AuthProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
};

export default App;
