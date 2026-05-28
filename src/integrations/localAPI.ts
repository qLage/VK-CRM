// Local API client to replace Supabase
// In dev, prefer VITE_API_URL, otherwise assume backend on 127.0.0.1:5000 (standard local address)
const DEFAULT_DEV_API_URL = `${window.location.protocol}//127.0.0.1:5000/api`;
const API_URL = import.meta.env.PROD ? '/api' : (import.meta.env.VITE_API_URL || DEFAULT_DEV_API_URL);

interface RequestOptions {
    method?: string;
    headers?: Record<string, string>;
    body?: any;
    signal?: AbortSignal;
}

class LocalAPIClient {
    private token: string | null;

    constructor() {
        this.token = localStorage.getItem('auth_token');
    }

    setToken(token: string | null) {
        this.token = token;
        if (token) {
            localStorage.setItem('auth_token', token);
        } else {
            localStorage.removeItem('auth_token');
        }
    }

    getHeaders(): Record<string, string> {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };
        // Always read token from localStorage to get the latest value
        const token = localStorage.getItem('auth_token');
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        return headers;
    }

    async upload(endpoint: string, formData: FormData): Promise<{ data: any; error: any }> {
        const base = import.meta.env.PROD ? API_URL : API_URL.replace('localhost', '127.0.0.1');
        const url = `${base}${endpoint}`;
        const token = localStorage.getItem('auth_token');
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;
        try {
            const response = await fetch(url, { method: 'POST', headers, body: formData });
            let data;
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                data = await response.json();
            } else {
                const text = await response.text();
                data = text ? { message: text } : {};
            }
            if (!response.ok) {
                let errorMessage = 'Upload failed';
                if (data.error?.message) errorMessage = data.error.message;
                else if (data.message) errorMessage = data.message;
                const error = new Error(errorMessage);
                (error as any).status = response.status;
                throw error;
            }
            return { data, error: null };
        } catch (error) {
            console.error('API upload error:', error);
            return { data: null, error };
        }
    }

    async request<T = any>(endpoint: string, options: RequestOptions = {}): Promise<{ data: T | null; error: any }> {
        // Only force 127.0.0.1 in development to bypass local proxies
        const base = import.meta.env.PROD 
            ? API_URL 
            : API_URL.replace('localhost', '127.0.0.1');
            
        const url = `${base}${endpoint}`;
        
        const config: RequestInit = {
            method: options.method || 'GET',
            headers: {
                ...this.getHeaders(),
                ...options.headers,
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
            },
            body: options.body ? JSON.stringify(options.body) : undefined,
            cache: 'no-store',
            signal: options.signal,
        };

        try {
            const response = await fetch(url, config);
            console.log(`[localAPI] Request started: ${url} (${response.status})`);

            // Handle empty responses
            let data;
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                data = await response.json();
            } else {
                const text = await response.text();
                data = text ? { message: text } : {};
            }

            if (!response.ok) {
                let errorMessage = 'Request failed';
                if (typeof data.error === 'string') {
                    errorMessage = data.error;
                } else if (data.error?.message) {
                    errorMessage = data.error.message;
                    if (data.error.detail) {
                        errorMessage = `${errorMessage} (${data.error.detail})`;
                    }
                } else if (Array.isArray(data.errors)) {
                    errorMessage = data.errors.map((e: any) => `${e.path || e.msg}`).join(', ');
                } else if (data.message) {
                    errorMessage = data.message;
                }

                const error = new Error(errorMessage);
                (error as any).status = response.status;
                throw error;
            }

            return { data, error: null };
        } catch (error) {
            console.error('API request error:', error);
            return { data: null, error };
        }
    }

    // Auth methods
    async signIn(credentials: { email?: string; phone?: string; password: string }) {
        const result = await this.request('/auth/login', {
            method: 'POST',
            body: credentials,
        });

        if (result.data?.token) {
            this.setToken(result.data.token);
            // Save user_id for SSE and other features
            if (result.data?.user?.id) {
                localStorage.setItem('user_id', result.data.user.id);
            }
        }

        return result;
    }

    async signOut() {
        this.setToken(null);
        return { error: null };
    }

    async getUser() {
        if (!this.token) {
            return { data: { user: null }, error: null };
        }

        const result = await this.request('/auth/me');
        return { data: { user: result.data }, error: result.error };
    }

    async getKPIStats(period = 'month', branch_id?: string) {
        let qs = `?period=${period}`;
        if (branch_id) qs += `&branch_id=${branch_id}`;
        return this.request(`/kpi/my-stats${qs}`);
    }

    async getDualKPIStats(period = 'month', branch_id?: string) {
        let qs = `?period=${period}`;
        if (branch_id) qs += `&branch_id=${branch_id}`;
        return this.request(`/kpi/my-dual-stats${qs}`);
    }

    async getLeaderboard(period = 'month', branch_id?: string) {
        let qs = `?period=${period}`;
        if (branch_id) qs += `&branch_id=${branch_id}`;
        return this.request(`/kpi/leaderboard${qs}`);
    }

    async getDashboardStats(period = 'month', branch_id?: string) {
        let qs = `?period=${period}`;
        if (branch_id) qs += `&branch_id=${branch_id}`;
        return this.request(`/kpi/dashboard-stats${qs}`);
    }

    async getKPIRules(role: string) {
        return this.request(`/kpi-settings/rules/${role}`);
    }

    async getMySalary(year: number, month?: number, quarter?: number) {
        const params = new URLSearchParams();
        params.set('year', String(year));
        if (quarter) {
            params.set('quarter', String(quarter));
        } else if (month) {
            params.set('month', String(month));
        }
        return this.request(`/finances/salaries/me?${params.toString()}`);
    }

    // Database-like methods for compatibility
    from(table: string) {
        return new TableQuery(table, this);
    }
}

class TableQuery {
    private filters: Array<{ column: string; op: string; value: any }>;

    constructor(_table: string, _client: LocalAPIClient) {
        this.filters = [];
    }

    select(_columns = '*') {
        return this;
    }

    eq(column: string, value: any) {
        this.filters.push({ column, op: 'eq', value });
        return this;
    }

    async execute() {
        // For now, return empty data - we'll implement API endpoints as needed
        return { data: [], error: null };
    }
}

// Create singleton instance
export const localAPI = new LocalAPIClient();

// Export auth object for compatibility
export const auth = {
    signIn: (credentials: { email?: string; phone?: string; password: string }) =>
        localAPI.signIn(credentials),
    signOut: () => localAPI.signOut(),
    getUser: () => localAPI.getUser(),
    onAuthStateChange: (callback: (event: string, session: any) => void) => {
        // Simple implementation - check on mount
        localAPI.getUser().then(({ data }) => {
            callback('SIGNED_IN', data?.user);
        });
        return { data: { subscription: { unsubscribe: () => { } } } };
    },
};

export default localAPI;
