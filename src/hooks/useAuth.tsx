import { createContext, useContext, useEffect, useState, ReactNode, useMemo } from 'react';
import { localAPI } from '@/integrations/localAPI';

// Legacy role strings are kept only for backward-compatible UI labels.
export type AppRole = 'admin' | 'director' | 'commercial' | 'head_sales' | 'sales_manager' | 'manager' | 'realtor' | 'mortgage_broker';

interface User {
  id: string;
  email: string;
  role?: string; // compatibility (derived on backend)
  access_level?: number;
  permissions?: {
    can_view_finances?: number;
    can_manage_finances?: number;
    can_manage_branches?: number;
    can_manage_users?: number;
  };
  branch_id?: string | null;
  team_id?: string | null;
}

interface Profile {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  avatar_url: string | null;
  position_id: string | null;
  branch_id: string | null;
  team_id: string | null;
  company_id: string | null;
  has_salary: boolean;
  commission_percent: number;
  is_active: boolean;
  position?: { id: string; name: string } | null;
  branch?: { id: string; name: string } | null;
  realtor_type?: 'universal' | 'secondary' | 'newbuildings' | null;
  custom_total_deals?: number;
  custom_total_objects?: number;
  custom_total_revenue?: number;
  registration_date?: string | null;
  personal_kpi_current?: number;
  management_kpi_current?: number;
  passport_series_number?: string | null;
  extra_phone?: string | null;
  emergency_contacts?: unknown;
  passport_address?: string | null;
  residential_address?: string | null;
}

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  role: AppRole | null; // compatibility
  loading: boolean;
  signIn: (credentials: { email?: string; phone?: string; password: string }) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  isManager: boolean;
  isDirector: boolean;
  isAdmin: boolean;
  isCommercial: boolean;
  isHeadSales: boolean;
  isSalesManager: boolean;
  participatesInRating: boolean;
  canCreateReports: boolean;
  // New position-based permissions (preferred)
  accessLevel: number;
  canViewFinances: boolean;
  canManageFinances: boolean;
  canManageBranches: boolean;
  canManageUsers: boolean;
  // UI scope derived from position/access (preferred)
  uiRole: 'director' | 'manager' | 'realtor';
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    const handleAuthRefresh = () => {
      void checkAuth();
    };
    window.addEventListener('auth:refresh', handleAuthRefresh);
    return () => window.removeEventListener('auth:refresh', handleAuthRefresh);
  }, []);

  const checkAuth = async () => {
    try {
      const { data, error } = await localAPI.getUser();
      if (error || !data.user) {
        // If we get a 403 Forbidden, it means the token is invalid/expired
        // We must clear it to prevent infinite reconnection loops
        if (error?.status === 403) {
          console.warn('Auth session expired or invalid. Clearing token...');
          localStorage.removeItem('auth_token');
          // Dispatch a storage event so other contexts know the token updated
          window.dispatchEvent(new Event('storage'));
        }
        
        if (user !== null) setUser(null);
        if (role !== null) setRole(null);
        if (profile !== null) setProfile(null);
      } else {
        const userData = data.user;
        const newUser = {
          id: userData.id,
          email: userData.email,
          role: userData.role,
          access_level: (userData as any).access_level,
          permissions: (userData as any).permissions,
          team_id: (userData as any).team_id,
          branch_id: (userData as any).branch_id,
        };

        // Deep comparison to avoid unnecessary state updates
        if (JSON.stringify(user) !== JSON.stringify(newUser)) {
          setUser(newUser);
        }

        const newProfile = userData as unknown as Profile;
        if (JSON.stringify(profile) !== JSON.stringify(newProfile)) {
          setProfile(newProfile);
        }

        const userRole = (userData.role || 'realtor') as AppRole;
        if (role !== userRole) {
          setRole(userRole);
        }
      }
    } catch (error) {
      console.error('Auth check error:', error);
      setUser(null);
      setRole(null);
    } finally {
      setLoading(false);
    }
  };

  interface SignInCredentials {
    email?: string;
    phone?: string;
    password: string;
  }

  const signIn = async (credentials: SignInCredentials) => {
    try {
      const { data, error } = await localAPI.signIn(credentials);
      if (error) throw error;

      // Token is already set by localAPI.signIn
      await checkAuth();
      return { error: null };
    } catch (error: any) {
      return { error };
    }
  };

  const signOut = async () => {
    try {
      await localAPI.signOut();
      localStorage.removeItem('auth_token');
      setUser(null);
      setProfile(null);
      setRole(null);
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  const refreshProfile = async () => {
    const { data } = await localAPI.getUser();
    if (data.user) {
      setProfile(data.user as unknown as Profile);
    }
  };

  // Мемоизируем основные объекты, чтобы предотвратить лишние ре-рендеры
  const memoizedUser = useMemo(() => user, [user]);
  const memoizedProfile = useMemo(() => profile, [profile]);

  // Position-based permissions (preferred)
  const accessLevel = useMemo(() => Number((user as any)?.access_level || 0), [user]);
  const canViewFinances = useMemo(() => Number((user as any)?.permissions?.can_view_finances || 0) === 1, [user]);
  const canManageFinances = useMemo(() => Number((user as any)?.permissions?.can_manage_finances || 0) === 1, [user]);
  const canManageBranches = useMemo(() => Number((user as any)?.permissions?.can_manage_branches || 0) === 1, [user]);
  const canManageUsers = useMemo(() => Number((user as any)?.permissions?.can_manage_users || 0) === 1, [user]);

  // Position-based access flags (preferred)
  const isAdmin = useMemo(() => accessLevel >= 100, [accessLevel]);
  const isDirector = useMemo(() => accessLevel >= 90, [accessLevel]);
  const isManager = useMemo(() => accessLevel >= 50, [accessLevel]);

  // Legacy flags (display-only / transitional; do not use for auth)
  const isCommercial = useMemo(() => role === 'commercial', [role]);
  const isHeadSales = useMemo(() => ['head_sales', 'manager'].includes(role || ''), [role]);
  const isSalesManager = useMemo(() => role === 'sales_manager', [role]);

  const positionNameLower = useMemo(() => String(profile?.position?.name || '').toLowerCase(), [profile]);
  const participatesInRating = useMemo(() => {
    const byAppRole = ['head_sales', 'sales_manager', 'realtor', 'manager', 'mortgage_broker', 'commercial'].includes(
      role || '',
    );
    // Prefer position-based semantics. Fall back to legacy role if position missing.
    if (positionNameLower) {
      if (positionNameLower.includes('ипот')) return true;
      if (positionNameLower.includes('риел')) return true;
      // «Риэлтор» через «э» — старая проверка на «риел» не срабатывала
      if (positionNameLower.includes('риэл')) return true;
      if (positionNameLower.includes('агент')) return true;
      if (positionNameLower.includes('моп')) return true;
      if (positionNameLower.includes('роп')) return true;
      if (positionNameLower.includes('коммерческ')) return true;
      // Должность задана, но без ключевых слов — не отрезаем KPI по роли аккаунта
      if (byAppRole) return true;
      return false;
    }
    return byAppRole;
  }, [positionNameLower, role]);

  const canCreateReports = useMemo(() => {
    const byAppRole = ['head_sales', 'sales_manager', 'realtor', 'manager', 'mortgage_broker', 'commercial'].includes(
      role || '',
    );
    if (positionNameLower) {
      if (positionNameLower.includes('ипот')) return true;
      if (positionNameLower.includes('риел')) return true;
      if (positionNameLower.includes('риэл')) return true;
      if (positionNameLower.includes('агент')) return true;
      if (positionNameLower.includes('моп')) return true;
      if (positionNameLower.includes('роп')) return true;
      if (positionNameLower.includes('коммерческ')) return true;
      if (byAppRole) return true;
      return false;
    }
    return byAppRole;
  }, [positionNameLower, role]);

  // legacy flags are kept for now (UI labels/filters)
  void isCommercial;
  void isHeadSales;
  void isSalesManager;


  // Preferred: UI scope derived from position/access, not legacy role strings
  const uiRole = useMemo(() => {
    if (accessLevel >= 90) return 'director' as const;
    if (accessLevel >= 50) return 'manager' as const;
    return 'realtor' as const;
  }, [accessLevel]);



  return (
    <AuthContext.Provider value={{
      user: memoizedUser,
      profile: memoizedProfile,
      role,
      loading,
      signIn,
      signOut,
      refreshProfile,
      isManager,
      isDirector,
      isAdmin,
      isCommercial,
      isHeadSales,
      isSalesManager,
      participatesInRating,
      canCreateReports,
      accessLevel,
      canViewFinances,
      canManageFinances,
      canManageBranches,
      canManageUsers,
      uiRole,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
