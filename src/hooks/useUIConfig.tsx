import { useState, useCallback, useEffect, createContext, useContext, ReactNode } from 'react';
import { useAuth } from './useAuth';
import { toast } from 'sonner';
import {
  LayoutDashboard,
  FileText,
  Trophy,
  User,
  Settings,
  Users,
  Wallet,
  BarChart3,
  Target,
  Building,
  Building2,
  Briefcase,
  Handshake,
  UserPlus,
  ContactRound,
} from 'lucide-react';

export interface DashboardWidgetConfig {
  realtor: string[];
  manager: string[];
  admin: string[];
  director: string[];
  commercial: string[];
  head_sales: string[];
  sales_manager: string[];
  mortgage_broker: string[];
}

export interface MobileNavConfig {
  realtor: string[];
  manager: string[];
  admin: string[];
  director: string[];
  commercial: string[];
  head_sales: string[];
  sales_manager: string[];
  mortgage_broker: string[];
}

export interface FabMenuConfig {
  realtor: string[];
  manager: string[];
  admin: string[];
  director: string[];
  commercial: string[];
  head_sales: string[];
  sales_manager: string[];
  mortgage_broker: string[];
}

export interface SidebarConfig {
  realtor: string[];
  manager: string[];
  admin: string[];
  director: string[];
  commercial: string[];
  head_sales: string[];
  sales_manager: string[];
  mortgage_broker: string[];
}

const DEFAULT_DASHBOARD_WIDGETS: DashboardWidgetConfig = {
  realtor: ['daily_report', 'service_request', 'realtor_stats', 'quarterly_plan', 'attendance', 'calendar', 'notifications'],
  manager: ['manager_stats', 'manager_actions', 'calendar', 'attendance', 'quarterly_plan', 'notifications'],
  admin: ['director_stats', 'calendar', 'attendance', 'notifications'], // Как у директора
  director: ['director_stats', 'calendar', 'attendance', 'notifications'],
  commercial: ['director_stats', 'calendar', 'attendance', 'notifications'], // Dashboard как у директора
  head_sales: ['daily_report', 'service_request', 'realtor_stats', 'quarterly_plan', 'attendance', 'calendar', 'notifications'], // Как у риелтора
  sales_manager: ['daily_report', 'service_request', 'realtor_stats', 'quarterly_plan', 'attendance', 'calendar', 'notifications'], // Как у риелтора
  mortgage_broker: ['daily_report', 'service_request', 'realtor_stats', 'quarterly_plan', 'attendance', 'calendar', 'notifications'],
};

// ...

export const DASHBOARD_WIDGET_LABELS: Record<string, string> = {
  stats: 'Статистика риелтора',
  manager_stats: 'Статистика команды',
  director_stats: 'Статистика компании',
  attendance: 'Посещаемость',
  daily_report: 'Ежедневный отчет',
  service_request: 'Кнопка "Новая служебка"',
  realtor_stats: 'Статистика (Рейтинг/Задатки/Показы)',
  quarterly_plan: 'План на квартал',
  quick_actions: 'Быстрые действия (Legacy)',
  manager_actions: 'Действия руководителя',
  calendar: 'Распорядок дня',
  notifications: 'Уведомления',
};

const DEFAULT_MOBILE_NAV: MobileNavConfig = {
  realtor: ['home', 'service_requests', 'rating', 'team', 'profile'],
  manager: ['home', 'service_requests', 'rating', 'team', 'profile'],
  admin: ['home', 'service_requests', 'rating', 'team', 'profile'],
  director: ['home', 'service_requests', 'rating', 'team', 'profile'],
  commercial: ['home', 'service_requests', 'rating', 'team', 'profile'], // Как у риелтора
  head_sales: ['home', 'service_requests', 'rating', 'team', 'profile'], // Как у риелтора
  sales_manager: ['home', 'service_requests', 'rating', 'team', 'profile'], // Как у риелтора
  mortgage_broker: ['home', 'service_requests', 'rating', 'team', 'profile'],
};

const DEFAULT_FAB_MENU: FabMenuConfig = {
  realtor: [],
  manager: [],
  admin: ['planning', 'employees', 'finances', 'analytics', 'settings'],
  director: ['planning', 'employees', 'finances', 'analytics', 'settings'],
  commercial: [], // Как у риелтора — без доп. меню
  head_sales: ['analytics'], // Только аналитика
  sales_manager: ['analytics'], // Только аналитика
  mortgage_broker: [],
};

const DEFAULT_SIDEBAR_MENU: SidebarConfig = {
  realtor: ['home', 'service_requests', 'properties', 'leads', 'clients', 'rating', 'team', 'deals', 'profile'],
  manager: ['home', 'service_requests', 'properties', 'leads', 'clients', 'rating', 'team', 'deals', 'profile'],
  admin: ['home', 'service_requests', 'properties', 'leads', 'clients', 'rating', 'team', 'planning', 'employees', 'finances', 'deals', 'analytics', 'settings', 'profile'],
  director: ['home', 'service_requests', 'properties', 'leads', 'clients', 'rating', 'team', 'planning', 'employees', 'finances', 'deals', 'analytics', 'settings', 'profile'],
  commercial: ['home', 'service_requests', 'properties', 'leads', 'clients', 'rating', 'team', 'deals', 'analytics', 'profile'],
  head_sales: ['home', 'service_requests', 'properties', 'leads', 'clients', 'rating', 'team', 'deals', 'analytics', 'profile'],
  sales_manager: ['home', 'service_requests', 'properties', 'leads', 'clients', 'rating', 'team', 'deals', 'analytics', 'profile'],
  mortgage_broker: ['home', 'service_requests', 'properties', 'leads', 'clients', 'rating', 'team', 'deals', 'profile'],
};

// Unified Registry for both Mobile and Sidebar
export const NAV_ITEMS_REGISTRY: Record<string, { label: string; icon: any; href: string }> = {
  home: { label: 'Главная', icon: LayoutDashboard, href: '/' },
  rating: { label: 'Рейтинг', icon: Trophy, href: '/rating' },
  profile: { label: 'Профиль', icon: User, href: '/profile' },
  settings: { label: 'Настройки', icon: Settings, href: '/settings' },
  employees: { label: 'Сотрудники', icon: Users, href: '/employees' },
  finances: { label: 'Финансы', icon: Wallet, href: '/finances' },
  analytics: { label: 'Аналитика', icon: BarChart3, href: '/analytics' },
  planning: { label: 'Планирование', icon: Target, href: '/planning' },
  team: { label: 'Команда', icon: Briefcase, href: '/team' },
  teams_manage: { label: 'Упр. Командами', icon: Users, href: '/teams-manage' },
  branches: { label: 'Филиалы', icon: Building, href: '/branches' },
  service_requests: { label: 'Служебки', icon: FileText, href: '/service-requests' },
  properties: { label: 'Объекты', icon: Building2, href: '/properties' },
  leads: { label: 'Лиды', icon: UserPlus, href: '/leads' },
  clients: { label: 'Клиенты', icon: ContactRound, href: '/clients' },
  deals: { label: 'Сделки', icon: Handshake, href: '/deals' },
  my_deals: { label: 'Мои сделки', icon: Handshake, href: '/deals' },
  team_deals: { label: 'Сделки команды', icon: Handshake, href: '/deals' },
  branch_deals: { label: 'Сделки филиала', icon: Handshake, href: '/deals' },
  company_deals: { label: 'Все сделки', icon: Handshake, href: '/deals' },
};

// Keep for backward compatibility if needed, but alias to new registry
export const MOBILE_NAV_LABELS = Object.entries(NAV_ITEMS_REGISTRY).reduce((acc, [key, val]) => {
  acc[key] = { label: val.label, icon: val.icon?.displayName || val.icon?.name || 'Icon' };
  return acc;
}, {} as Record<string, { label: string; icon: string }>);

export const NAV_ROUTES = Object.entries(NAV_ITEMS_REGISTRY).reduce((acc, [key, val]) => {
  acc[key] = val.href;
  return acc;
}, {} as Record<string, string>);
// Increment storage key to force reset (admin = director role parity)
// Bump when default sidebar/nav must reset (e.g. new NAV_ITEMS_REGISTRY keys)
const STORAGE_KEY = 'crm_ui_config_v40';

function loadConfig() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return null;
    return JSON.parse(saved);
  } catch {
    return null;
  }
}

function saveConfig(config: Record<string, unknown>) {
  if (import.meta.env.DEV) {
    console.debug('Saving config to localStorage:', config);
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

interface UIConfigContextType {
  dashboardConfig: DashboardWidgetConfig;
  navConfig: MobileNavConfig;
  fabConfig: FabMenuConfig;
  sidebarConfig: SidebarConfig;
  isLoading: boolean;
  getDashboardWidgets: (role: string) => string[];
  getNavItems: (role: string) => string[];
  getFabItems: (role: string) => string[];
  getSidebarItems: (role: string) => string[];
  updateDashboardConfig: (value: DashboardWidgetConfig) => void;
  updateNavConfig: (value: MobileNavConfig) => void;
  updateFabConfig: (value: FabMenuConfig) => void;
  updateSidebarConfig: (value: SidebarConfig) => void;
  updateInterfaceConfig: (d: DashboardWidgetConfig, n: MobileNavConfig, f: FabMenuConfig, s: SidebarConfig) => void;
  isUpdating: boolean;
}

const UIConfigContext = createContext<UIConfigContextType | undefined>(undefined);

export function UIConfigProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();

  const cleanupConfig = useCallback((rawConfig: any) => {
    const config = rawConfig || {};

    const dashboard = { ...DEFAULT_DASHBOARD_WIDGETS, ...(config.dashboard_widgets || {}) };
    const nav = { ...DEFAULT_MOBILE_NAV, ...(config.mobile_nav || {}) };
    const fab = { ...DEFAULT_FAB_MENU, ...(config.fab_menu || {}) };
    const sidebar = { ...DEFAULT_SIDEBAR_MENU, ...(config.sidebar_menu || {}) };

    const cleanArray = (arr: any[]) => Array.isArray(arr) ? Array.from(new Set(arr)) : [];

    Object.keys(DEFAULT_MOBILE_NAV).forEach(role => {
      dashboard[role as keyof DashboardWidgetConfig] = cleanArray(dashboard[role as keyof DashboardWidgetConfig]);
      let roleNav = cleanArray(nav[role as keyof MobileNavConfig]);
      let roleFab = cleanArray(fab[role as keyof FabMenuConfig]);
      let roleSidebar = cleanArray(sidebar[role as keyof SidebarConfig]);

      // Enforce mutual exclusivity for mobile only
      roleFab = roleFab.filter(item => !roleNav.includes(item));

      nav[role as keyof MobileNavConfig] = roleNav;
      fab[role as keyof FabMenuConfig] = roleFab;
      sidebar[role as keyof SidebarConfig] = roleSidebar;
    });

    // Hard-enforce commercial role restrictions (cannot be overridden by localStorage)
    nav.commercial = [...DEFAULT_MOBILE_NAV.commercial];
    fab.commercial = [...DEFAULT_FAB_MENU.commercial];
    sidebar.commercial = [...DEFAULT_SIDEBAR_MENU.commercial];

    return {
      dashboard_widgets: dashboard,
      mobile_nav: nav,
      fab_menu: fab,
      sidebar_menu: sidebar
    };
  }, []);

  const [stored, setStored] = useState(() => {
    const loaded = loadConfig();
    if (import.meta.env.DEV) console.debug('Initial load config:', loaded);
    return cleanupConfig(loaded);
  });

  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    const loaded = loadConfig();
    if (!loaded) {
      saveConfig(stored);
    }
  }, [cleanupConfig, stored]);

  const dashboardConfig = stored.dashboard_widgets;
  const navConfig = stored.mobile_nav;
  const fabConfig = stored.fab_menu;
  const sidebarConfig = stored.sidebar_menu;

  const getDashboardWidgets = useCallback((role: string): string[] => {
    return dashboardConfig[role as keyof DashboardWidgetConfig] || DEFAULT_DASHBOARD_WIDGETS.realtor;
  }, [dashboardConfig]);

  const getNavItems = useCallback((role: string): string[] => {
    return navConfig[role as keyof MobileNavConfig] || DEFAULT_MOBILE_NAV.realtor;
  }, [navConfig]);

  const getFabItems = useCallback((role: string): string[] => {
    return fabConfig[role as keyof FabMenuConfig] || DEFAULT_FAB_MENU.realtor;
  }, [fabConfig]);

  const getSidebarItems = useCallback((role: string): string[] => {
    return sidebarConfig[role as keyof SidebarConfig] || DEFAULT_SIDEBAR_MENU.realtor;
  }, [sidebarConfig]);

  const updateConfig = useCallback((newFullConfig: any) => {
    setIsUpdating(true);
    try {
      const configToSave = newFullConfig;
      setStored(configToSave);
      saveConfig(configToSave);
      toast.success('Настройки сохранены');
    } catch (e) {
      console.error(e);
      toast.error('Ошибка сохранения');
    } finally {
      setIsUpdating(false);
    }
  }, []);

  const updateInterfaceConfig = useCallback((
    dashboard: DashboardWidgetConfig,
    nav: MobileNavConfig,
    fab: FabMenuConfig,
    sidebar: SidebarConfig
  ) => {
    updateConfig({
      ...stored,
      dashboard_widgets: dashboard,
      mobile_nav: nav,
      fab_menu: fab,
      sidebar_menu: sidebar
    });
  }, [updateConfig, stored]);

  const updateDashboardConfig = useCallback((value: DashboardWidgetConfig) =>
    updateConfig({ ...stored, dashboard_widgets: value }), [updateConfig, stored]);

  const updateNavConfig = useCallback((value: MobileNavConfig) =>
    updateConfig({ ...stored, mobile_nav: value }), [updateConfig, stored]);

  const updateFabConfig = useCallback((value: FabMenuConfig) =>
    updateConfig({ ...stored, fab_menu: value }), [updateConfig, stored]);

  const updateSidebarConfig = useCallback((value: SidebarConfig) =>
    updateConfig({ ...stored, sidebar_menu: value }), [updateConfig, stored]);

  return (
    <UIConfigContext.Provider value={{
      dashboardConfig,
      navConfig,
      fabConfig,
      sidebarConfig,
      isLoading: false,
      getDashboardWidgets,
      getNavItems,
      getFabItems,
      getSidebarItems,
      updateDashboardConfig,
      updateNavConfig,
      updateFabConfig,
      updateSidebarConfig,
      updateInterfaceConfig,
      isUpdating
    }}>
      {children}
    </UIConfigContext.Provider>
  );
}

export function useUIConfig() {
  const context = useContext(UIConfigContext);
  if (context === undefined) {
    throw new Error('useUIConfig must be used within a UIConfigProvider');
  }
  return context;
}
