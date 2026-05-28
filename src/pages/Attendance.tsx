import { useState, useMemo } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { localAPI } from '@/integrations/localAPI';
import {
    Users, UserCheck, Clock, MapPin,
    Calendar as CalendarIcon, Filter,
    ChevronRight, ArrowRight, AlertCircle,
    TrendingUp, Timer, Search
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '@/components/ui/select';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { parseUTCDate } from '@/lib/date-utils';

export default function AttendancePage() {
    const { profile, accessLevel } = useAuth();
    const queryClient = useQueryClient();
    const [selectedBranchId, setSelectedBranchId] = useState<string>('all');
    const [searchQuery, setSearchQuery] = useState('');

    const normalizeId = (id: any) => id ? String(id) : null;
    const isSuperAdmin = accessLevel >= 90;

    // 1. Fetch Employees
    const { data: employees, isLoading: employeesLoading } = useQuery({
        queryKey: ['attendance-employees'],
        queryFn: async () => {
            const { data } = await localAPI.request('/employees');
            const employeesArray = Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
            return employeesArray.filter((e: any) => e.is_active);
        },
        staleTime: 120000, // Cache for 2 minutes
    });

    // 2. Fetch Branches
    const { data: branches } = useQuery({
        queryKey: ['branches-list-attendance'],
        queryFn: async () => {
            const { data } = await localAPI.request('/branches');
            if (Array.isArray(data?.data)) return data.data;
            if (Array.isArray(data)) return data;
            return [];
        },
        staleTime: 300000, // Cache for 5 minutes
    });

    // 3. Fetch Attendance for today
    const { data: attendance } = useQuery({
        queryKey: ['attendance-today-records'],
        queryFn: async () => {
            const date = new Date().toISOString().split('T')[0];
            const { data } = await localAPI.request(`/attendance?start_date=${date}&end_date=${date}`);
            if (Array.isArray(data?.data)) return data.data;
            if (Array.isArray(data)) return data;
            return [];
        },
        staleTime: 30000, // Cache for 30 seconds (attendance changes frequently)
    });

    // Filtering logic
    const filteredStaff = useMemo(() => {
        if (!employees) return [];
        let pool = employees;

        if (selectedBranchId !== 'all') {
            pool = pool.filter((e: any) => normalizeId(e.branch_id) === selectedBranchId);
        }

        if (searchQuery) {
            const lowSearch = String(searchQuery || '').toLowerCase();
            pool = pool.filter((e: any) => String(e.full_name || '').toLowerCase().includes(lowSearch));
        }

        return pool;
    }, [employees, selectedBranchId, searchQuery]);

    // Stats
    const stats = useMemo(() => {
        if (!filteredStaff.length) return { inOffice: 0, missing: 0, checkedOut: 0 };
        const inOffice = attendance?.filter((a: any) =>
            filteredStaff.some((e: any) => normalizeId(e.id) === normalizeId(a.user_id)) && !a.check_out && !a.is_in_fields
        ).length || 0;
        const inFields = attendance?.filter((a: any) =>
            filteredStaff.some((e: any) => normalizeId(e.id) === normalizeId(a.user_id)) && !a.check_out && a.is_in_fields
        ).length || 0;
        const checkedOut = attendance?.filter((a: any) =>
            filteredStaff.some((e: any) => normalizeId(e.id) === normalizeId(a.user_id)) && a.check_out
        ).length || 0;
        return {
            inOffice,
            inFields,
            checkedOut,
            missing: Math.max(0, filteredStaff.length - inOffice - inFields - checkedOut)
        };
    }, [filteredStaff, attendance]);

    if (employeesLoading) {
        return (
            <MainLayout>
                <div className="space-y-6">
                    <div className="h-32 rounded-3xl bg-zinc-900/50 animate-pulse" />
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        {[1, 2, 3].map(i => <Skeleton key={i} className="h-48 rounded-3xl" />)}
                    </div>
                </div>
            </MainLayout>
        );
    }

    return (
        <MainLayout>
            <div className="space-y-8 animate-fade-in pb-20 max-w-[1600px] mx-auto">
                {/* Header Section */}
                <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
                    <div className="space-y-1">
                        <div className="mb-3">
                            <img src="/logo-panel.svg" alt="Logo" className="h-6 w-auto object-contain opacity-60" />
                        </div>
                        <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70 flex items-center gap-2">
                            Аналитика <span className="text-white/20 font-light">/</span> Посещаемость
                        </h1>
                        <p className="text-xs text-muted-foreground mt-0.5">
                            {format(new Date(), 'dd MMMM yyyy', { locale: ru })}
                        </p>
                        <p className="text-muted-foreground font-medium flex items-center gap-2">
                            <MapPin className="h-4 w-4 text-primary" />
                            Мониторинг присутствия в офисах
                        </p>
                    </div>

                    <div className="flex flex-col md:flex-row items-center gap-4 bg-zinc-950/40 p-2 rounded-[2rem] border border-white/5 backdrop-blur-xl">
                        <div className="flex items-center gap-3 pl-4 min-w-[240px]">
                            <Filter className="h-4 w-4 text-zinc-500" />
                            <Select value={selectedBranchId} onValueChange={setSelectedBranchId}>
                                <SelectTrigger className="bg-transparent border-none text-white focus:ring-0 focus:ring-offset-0 h-10 p-0 text-sm font-bold">
                                    <SelectValue placeholder="Выберите филиал" />
                                </SelectTrigger>
                                <SelectContent className="bg-zinc-900 border-white/10 rounded-2xl shadow-2xl overflow-hidden p-1">
                                    <SelectItem value="all" className="rounded-xl focus:bg-white/10 focus:text-white transition-colors cursor-pointer py-2.5">
                                        Все филиалы
                                    </SelectItem>
                                    {branches?.map((b: any) => (
                                        <SelectItem key={b.id} value={normalizeId(b.id)!} className="rounded-xl focus:bg-white/10 focus:text-white transition-colors cursor-pointer py-2.5">
                                            {b.name} ({b.city})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="h-8 w-px bg-white/10 hidden md:block" />

                        <div className="relative group flex-1 md:min-w-[240px]">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500 group-focus-within:text-primary transition-colors" />
                            <Input
                                placeholder="Поиск сотрудника..."
                                className="pl-12 bg-transparent border-none focus-visible:ring-0 h-10 text-sm font-medium"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                    </div>
                </div>

                {/* Quick Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <PresenceCard
                        title="В офисе"
                        value={stats.inOffice}
                        icon={UserCheck}
                        color="emerald"
                        percent={Math.round((stats.inOffice / (filteredStaff.length || 1)) * 100)}
                    />
                    <PresenceCard
                        title="В полях"
                        value={stats.inFields}
                        icon={MapPin}
                        color="amber"
                        percent={Math.round((stats.inFields / (filteredStaff.length || 1)) * 100)}
                    />
                    <PresenceCard
                        title="Ушли"
                        value={stats.checkedOut}
                        icon={Clock}
                        color="zinc"
                        percent={Math.round((stats.checkedOut / (filteredStaff.length || 1)) * 100)}
                    />
                    <PresenceCard
                        title="Отсутствуют"
                        value={stats.missing}
                        icon={AlertCircle}
                        color="red"
                        percent={Math.round((stats.missing / (filteredStaff.length || 1)) * 100)}
                    />
                </div>

                {/* Main List Table */}
                <Card className="glass-card border-white/5 overflow-hidden rounded-[2.5rem]">
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="bg-white/[0.02] border-b border-white/5">
                                        <th className="px-8 py-5 text-left text-[11px] font-bold text-zinc-500 uppercase tracking-widest">Сотрудник</th>
                                        <th className="px-8 py-5 text-left text-[11px] font-bold text-zinc-500 uppercase tracking-widest">Филиал</th>
                                        <th className="px-8 py-5 text-left text-[11px] font-bold text-zinc-500 uppercase tracking-widest">Приход</th>
                                        <th className="px-8 py-5 text-left text-[11px] font-bold text-zinc-500 uppercase tracking-widest">Уход</th>
                                        <th className="px-8 py-5 text-right text-[11px] font-bold text-zinc-500 uppercase tracking-widest">Статус</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-white/5">
                                    {filteredStaff.map((emp: any) => {
                                        const record = attendance?.find((a: any) => normalizeId(a.user_id) === normalizeId(emp.id));
                                        return (
                                            <tr key={emp.id} className="group hover:bg-white/[0.02] transition-colors">
                                                <td className="px-8 py-5 text-white">
                                                    <div className="flex items-center gap-4">
                                                        <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-zinc-800 to-zinc-900 border border-white/10 flex items-center justify-center font-bold text-zinc-400">
                                                            {emp.avatar_url ? (
                                                                <img src={emp.avatar_url} className="w-full h-full object-cover rounded-xl" />
                                                            ) : emp.full_name?.charAt(0)}
                                                        </div>
                                                        <div>
                                                            <div className="font-bold text-sm tracking-tight">{emp.full_name}</div>
                                                            <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-bold">
                                                                {emp.position?.name || 'Сотрудник'}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td className="px-8 py-5">
                                                    <div className="flex items-center gap-2 text-zinc-400">
                                                        <MapPin className="h-3.5 w-3.5" />
                                                        <span className="text-sm font-medium">{emp.branch?.name || '—'}</span>
                                                    </div>
                                                </td>
                                                <td className="px-8 py-5">
                                                    <div className="flex items-center gap-2">
                                                        <Timer className="h-3.5 w-3.5 text-zinc-500" />
                                                        <span className={cn("text-sm font-bold font-mono", record?.check_in ? "text-white" : "text-zinc-600")}>
                                                            {record?.check_in ? format(parseUTCDate(record.check_in), 'HH:mm') : '--:--'}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-8 py-5">
                                                    <div className="flex items-center gap-2">
                                                        <ArrowRight className="h-3.5 w-3.5 text-zinc-500" />
                                                        <span className={cn("text-sm font-bold font-mono", record?.check_out ? "text-white" : "text-zinc-600")}>
                                                            {record?.check_out ? format(parseUTCDate(record.check_out), 'HH:mm') : '--:--'}
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="px-8 py-5 text-right">
                                                    <Badge className={cn(
                                                        "rounded-lg px-3 py-1 text-[10px] font-black uppercase tracking-widest",
                                                        record?.check_out
                                                            ? "bg-zinc-800 text-zinc-400"
                                                            : (record?.is_in_fields
                                                                ? "bg-amber-500/10 text-amber-500 border-amber-500/20"
                                                                : (record ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-red-500/10 text-red-500 border-red-500/20"))
                                                    )} variant="outline">
                                                        {record?.check_out ? 'Завершил' : (record?.is_in_fields ? 'В полях' : (record ? 'В офисе' : 'Прогул'))}
                                                    </Badge>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </MainLayout>
    );
}

function PresenceCard({ title, value, icon: Icon, color, percent }: any) {
    const colors: any = {
        emerald: 'from-emerald-500/20 to-emerald-500/5 text-emerald-400 border-emerald-500/20',
        amber: 'from-amber-500/20 to-amber-500/5 text-amber-400 border-amber-500/20',
        red: 'from-red-500/20 to-red-500/5 text-red-400 border-red-500/20',
        zinc: 'from-zinc-500/20 to-zinc-500/5 text-zinc-400 border-zinc-500/20',
    };

    return (
        <Card className={cn("bg-zinc-900/40 border border-white/5 rounded-[2rem] overflow-hidden group")}>
            <CardContent className="p-7">
                <div className="flex justify-between items-start mb-4">
                    <div className={cn("p-4 rounded-2xl bg-gradient-to-br", colors[color])}>
                        <Icon className="h-6 w-6" />
                    </div>
                    <div className="text-right">
                        <span className="text-3xl font-black text-white">{value}</span>
                        <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-widest">Человек</div>
                    </div>
                </div>
                <div>
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-bold text-zinc-400">{title}</span>
                        <span className="text-xs font-bold text-zinc-500">{percent}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
                        <div
                            className={cn("h-full transition-all duration-1000",
                                color === 'emerald' ? 'bg-emerald-500' :
                                    color === 'amber' ? 'bg-amber-500' :
                                        color === 'red' ? 'bg-red-500' : 'bg-zinc-500')}
                            style={{ width: `${percent}%` }}
                        />
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}
