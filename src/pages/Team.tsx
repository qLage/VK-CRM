import { useState, useMemo, memo } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { motion, AnimatePresence } from 'framer-motion';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/hooks/useAuth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { localAPI } from '@/integrations/localAPI';
import { useEmployeesData, useSharedData } from '@/hooks/useSharedData';
import { Phone, Mail, UserCheck, Trophy, Clock, Edit2, Users, ChevronDown, CheckCircle, LogOut, MapPin, Building2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { cn, getAvatarUrl } from '@/lib/utils';
import { parseUTCDate } from '@/lib/date-utils';
import { useNavigate } from 'react-router-dom';
import { AttendanceHistoryDialog } from '@/components/team/AttendanceHistoryDialog';
import { startOfQuarter, endOfQuarter } from 'date-fns';

function Team() {
    const { user, profile, accessLevel, canManageUsers } = useAuth();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [editingAttendance, setEditingAttendance] = useState<any>(null);
    const [checkInTime, setCheckInTime] = useState('');
    const [checkOutTime, setCheckOutTime] = useState('');
    const [collapsedTeams, setCollapsedTeams] = useState<Set<string>>(new Set());
    const [historyEmployee, setHistoryEmployee] = useState<{ id: string | number; name: string } | null>(null);
    const [selectedBranchId, setSelectedBranchId] = useState<string>('all');

    const toggleTeam = (teamId: string) => {
        setCollapsedTeams(prev => {
            const next = new Set(prev);
            if (next.has(teamId)) next.delete(teamId);
            else next.add(teamId);
            return next;
        });
    };

    const normalizeId = (id: any) => id ? String(id) : null;
    const userPos = String(profile?.position?.name || '').toLowerCase().trim();
    // Директор (уровень 90+) или Коммерческий директор
    const isSuperAdmin = accessLevel >= 90 || userPos.includes('коммерческий');
    const isBranchManager = accessLevel >= 50 || userPos === 'роп' || userPos === 'моп';

    // 1. Employees (centralized cache)
    const { data: employees = [], isLoading: employeesLoading } = useEmployeesData();

    const activeEmployees = useMemo(
        () => (Array.isArray(employees) ? employees : []).filter((e: any) => e.is_active),
        [employees]
    );

    // 2. Fetch Leaderboard for current month (metrics)
    const { data: leaderboard, isLoading: leaderboardLoading } = useQuery({
        queryKey: ['team-leaderboard-metrics'],
        queryFn: async () => {
            const now = new Date();
            const start = startOfQuarter(now).toISOString();
            const end = endOfQuarter(now).toISOString();
            const { data, error } = await localAPI.request(`/kpi/leaderboard?start=${start}&end=${end}`);
            if (error) throw error;
            if (Array.isArray(data?.data)) return data.data;
            if (Array.isArray(data)) return data;
            return [];
        },
        staleTime: 180000, // 3 min
        gcTime: 600000, // 10 min
        refetchOnWindowFocus: false,
    });

    // 3. Fetch all user plans (for plan %)
    const { data: userPlans } = useQuery({
        queryKey: ['team-user-plans'],
        queryFn: async () => {
            const { data } = await localAPI.request('/plans/users-plans');
            // backend may wrap in {data: ...}
            return (data?.data || data) || {};
        },
        staleTime: 300000, // 5 min
        gcTime: 900000, // 15 min
        refetchOnWindowFocus: false,
    });
    // 4. Fetch Attendance for today (to identify who to edit)
    const { data: todayAttendance } = useQuery({
        queryKey: ['team-today-attendance'],
        queryFn: async () => {
            const date = new Date().toISOString().split('T')[0];
            const { data } = await localAPI.request(`/attendance?start_date=${date}&end_date=${date}`);
            if (Array.isArray(data?.data)) return data.data;
            if (Array.isArray(data)) return data;
            return [];
        },
        staleTime: 0, // Always refetch on invalidation
        gcTime: 300000, // 5 min
        refetchOnWindowFocus: false,
    });

    // NOTE: this page doesn't use the authenticated user object directly yet
    void user;

    // 5. Централизованные API запросы через useSharedData
    const { teams, branches } = useSharedData();

    // Filtering logic
    const filteredEmployees = useMemo(() => {
        if (!activeEmployees || !profile) return [];

        // Директор, Администратор и Коммерческий Директор видят всех
        if (isSuperAdmin) {
            // Filter by selected branch for super admin
            if (selectedBranchId && selectedBranchId !== 'all') {
                return activeEmployees.filter((e: any) => normalizeId(e.branch_id) === normalizeId(selectedBranchId));
            }
            return activeEmployees;
        }

        const userId = normalizeId(profile.id);
        const userTeamId = normalizeId(profile.team_id);
        const userBranchId = normalizeId(profile.branch_id);

        // ID команд, которыми руководит текущий пользователь
        const ledTeamIds = (teams || [])
            .filter((t: any) => normalizeId(t.leader_id) === userId)
            .map((t: any) => normalizeId(t.id));

        return activeEmployees.filter((e: any) => {
            const empId = normalizeId(e.id);
            const empTeamId = normalizeId(e.team_id);
            const empBranchId = normalizeId(e.branch_id);

            // Filter by selected branch first
            if (selectedBranchId && selectedBranchId !== 'all' && empBranchId !== normalizeId(selectedBranchId)) {
                return false;
            }

            // Всегда видим себя
            if (empId === userId) return true;

            // РОП (Руководитель филиала) видит всех сотрудников своего филиала
            const isHeadSales = accessLevel >= 70 || userPos === 'роп';
            if (isHeadSales && userBranchId && empBranchId === userBranchId) return true;

            // Видим членов команд, которыми руководим (важно для МОП)
            if (ledTeamIds.length > 0 && empTeamId && ledTeamIds.includes(empTeamId)) return true;

            // Видим коллег по своей команде (если сами в команде)
            if (userTeamId && empTeamId === userTeamId) return true;

            return false;
        });
    }, [activeEmployees, profile, isSuperAdmin, accessLevel, userPos, teams, selectedBranchId]);

    // Группировка (для всех руководителей)
    const groupedData = useMemo(() => {
        const canSeeGroups = isSuperAdmin || accessLevel >= 50;
        if (!canSeeGroups || !filteredEmployees.length) return null;

        // Если выбрано «Все филиалы» (только для супер-админа)
        const showMultiBranch = isSuperAdmin && selectedBranchId === 'all';

        if (showMultiBranch) {
            // Группировка: Филиал -> Команда -> Сотрудники
            const branchGroups: Record<string, {
                branchName: string;
                teams: Record<string, { teamName: string; members: any[] }>
            }> = {};

            for (const emp of filteredEmployees) {
                const bId = normalizeId(emp.branch_id) || '__no_branch__';
                const bName = emp.branch?.name || (branches?.find((b: any) => normalizeId(b.id) === bId)?.name) || (bId === '__no_branch__' ? 'Индивидуальные / Вне филиала' : 'Неизвестный филиал');
                const tId = normalizeId(emp.team_id) || '__no_team__';
                const tName = emp.team?.name || (teams?.find((t: any) => normalizeId(t.id) === tId)?.name) || 'Без команды';

                if (!branchGroups[bId]) {
                    branchGroups[bId] = { branchName: bName, teams: {} };
                }
                if (!branchGroups[bId].teams[tId]) {
                    branchGroups[bId].teams[tId] = { teamName: tName, members: [] };
                }
                branchGroups[bId].teams[tId].members.push(emp);
            }

            // Сортировка внутри каждой команды (лидер первый)
            for (const bId in branchGroups) {
                for (const tId in branchGroups[bId].teams) {
                    branchGroups[bId].teams[tId].members.sort((a: any, b: any) => {
                        const aIsLeader = teams?.some((t: any) => normalizeId(t.leader_id) === normalizeId(a.id));
                        const bIsLeader = teams?.some((t: any) => normalizeId(t.leader_id) === normalizeId(b.id));
                        if (aIsLeader && !bIsLeader) return -1;
                        if (!aIsLeader && bIsLeader) return 1;
                        return 0;
                    });
                }
            }

            return { type: 'multi-branch', data: Object.entries(branchGroups) };
        } else {
            // Обычная группировка по командам
            const groups: Record<string, { teamName: string; members: any[] }> = {};
            for (const emp of filteredEmployees) {
                const tId = normalizeId(emp.team_id) || '__no_team__';
                const tName = emp.team?.name || (teams?.find((t: any) => normalizeId(t.id) === tId)?.name) || 'Без команды';
                if (!groups[tId]) {
                    groups[tId] = { teamName: tName, members: [] };
                }
                groups[tId].members.push(emp);
            }

            // Сортировка внутри каждой команды (лидер первый)
            for (const tId in groups) {
                groups[tId].members.sort((a: any, b: any) => {
                    const aIsLeader = teams?.some((t: any) => normalizeId(t.leader_id) === normalizeId(a.id));
                    const bIsLeader = teams?.some((t: any) => normalizeId(t.leader_id) === normalizeId(b.id));
                    if (aIsLeader && !bIsLeader) return -1;
                    if (!aIsLeader && bIsLeader) return 1;
                    return 0;
                });
            }
            const sorted = Object.entries(groups).sort(([a], [b]) => {
                if (a === '__no_team__') return 1;
                if (b === '__no_team__') return -1;
                return 0;
            });
            return { type: 'single-branch', data: sorted };
        }
    }, [filteredEmployees, teams, branches, isSuperAdmin, accessLevel, selectedBranchId]);

    // Check if user is a team leader of a specific employee
    const isTeamLeaderOf = (targetEmployee: any) => {
        if (!teams || !profile || !targetEmployee.team_id) return false;
        const userId = normalizeId(profile.id);
        const targetTeamId = normalizeId(targetEmployee.team_id);

        // Find if any team led by current user matches the target employee's team
        return teams.some((t: any) => normalizeId(t.id) === targetTeamId && normalizeId(t.leader_id) === userId);
    };

    const canEditAttendance = (employee: any) => {
        if (isSuperAdmin) return true;

        const userId = normalizeId(profile?.id);
        const userBranchId = normalizeId(profile?.branch_id);
        const empId = normalizeId(employee.id);
        const empBranchId = normalizeId(employee.branch_id);

        // Can always edit self
        if (empId === userId) return true;

        // Team leadership (MOP & ROP who are leaders)
        if (isTeamLeaderOf(employee)) return true;

        // ROP can edit anyone in their branch
        const isHeadSales = accessLevel >= 50 || userPos === 'роп';
        if (isHeadSales && userBranchId && empBranchId === userBranchId) return true;

        return false;
    };

    // Mutation for updating or creating attendance
    const updateAttendance = useMutation({
        mutationFn: async ({ id, user_id, date, check_in, check_out, isNew }: any) => {
            if (isNew) {
                const { error } = await localAPI.request('/attendance', {
                    method: 'POST',
                    body: { user_id, date, check_in, check_out }
                });
                if (error) throw error;
            } else {
                const { error } = await localAPI.request(`/attendance/${id}`, {
                    method: 'PATCH',
                    body: { check_in, check_out }
                });
                if (error) throw error;
            }
        },
        onSuccess: () => {
            toast.success("Посещаемость обновлена");
            queryClient.invalidateQueries({ queryKey: ['team-today-attendance'] });
            queryClient.invalidateQueries({ queryKey: ['analytics-base-data'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
            setEditingAttendance(null);
        },
        onError: (err: any) => toast.error(err.message || "Ошибка обновления")
    });

    // Mutation for toggling "In Fields" status
    const toggleInFields = useMutation({
        mutationFn: async ({ id, currentStatus }: { id: string; currentStatus: boolean }) => {
            const { error } = await localAPI.request(`/attendance/${id}`, {
                method: 'PATCH',
                body: { is_in_fields: !currentStatus }
            });
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['team-today-attendance'] });
            queryClient.invalidateQueries({ queryKey: ['analytics-base-data'] });
            queryClient.invalidateQueries({ queryKey: ['dashboard-stats'] });
        },
        onError: (err: any) => toast.error(err.message || "Ошибка обновления статуса")
    });

    const handleEditAttendance = (emp: any) => {
        const att = todayAttendance?.find((a: any) => normalizeId(a.user_id) === normalizeId(emp.id));
        const today = new Date().toISOString().split('T')[0];
        if (att) {
            setEditingAttendance({ ...att, empName: emp.full_name || emp.name || 'Сотрудник' });
            // Extract HH:mm in local time
            setCheckInTime(att.check_in ? parseUTCDate(att.check_in).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '');
            setCheckOutTime(att.check_out ? parseUTCDate(att.check_out).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : '');
        } else {
            // Allow creating if missing
            setEditingAttendance({ user_id: emp.id, empName: emp.full_name || emp.name || 'Сотрудник', date: today, isNew: true });
            setCheckInTime('');
            setCheckOutTime('');
        }
    };

    if (employeesLoading || leaderboardLoading) {
        return (
            <MainLayout>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-6 p-4">
                    {[1, 2, 3].map(i => <Skeleton key={i} className="h-48 md:h-64 rounded-2xl md:rounded-3xl" />)}
                </div>
            </MainLayout>
        );
    }

    const renderEmployeeCard = (employee: any) => {
        const metrics = leaderboard?.find((l: any) => normalizeId(l.userId) === normalizeId(employee.id));
        const plan = userPlans?.[employee.id];
        const planPercent = Math.round(metrics?.planCompletion || 0);
        const attRecord = todayAttendance?.find((a: any) => normalizeId(a.user_id) === normalizeId(employee.id));
        const isLeader = teams?.some((t: any) => normalizeId(t.leader_id) === normalizeId(employee.id));
        const canEdit = canEditAttendance(employee);

        const getStatusInfo = () => {
            // Robust check for various truthy representations (boolean, number, string)
            const isInFields = attRecord?.is_in_fields === true || attRecord?.is_in_fields === 1 || attRecord?.is_in_fields === 'true' || attRecord?.is_in_fields === '1';

            if (attRecord?.check_out) return { label: 'Ушёл из офиса', color: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/20', icon: LogOut, colorHex: '#fb7185' };
            if (isInFields) return { label: 'В полях', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', icon: MapPin, colorHex: '#fbbf24' };
            if (attRecord?.check_in) return { label: 'В офисе', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', icon: CheckCircle, colorHex: '#10b981' };
            return { label: 'Нет отметки', color: 'text-white/20', bg: 'bg-white/5', border: 'border-white/5', icon: Clock, colorHex: 'rgba(255,255,255,0.1)' };
        };

        const status = getStatusInfo();
        const StatusIcon = status.icon;

        return (
            <div
                key={employee.id}
                onClick={() => setHistoryEmployee({ id: employee.id, name: employee.full_name || employee.name || 'Сотрудник' })}
                className="group relative overflow-hidden rounded-xl md:rounded-[2rem] border border-white/5 bg-zinc-900/40 backdrop-blur-2xl hover:bg-zinc-900/60 transition-all duration-500 hover:shadow-2xl hover:-translate-y-1 cursor-pointer"
            >
                <div className="p-3 md:p-4 md:px-6 relative z-10 w-full">
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-3 md:gap-6">
                        {/* 1. Avatar + Name/Pos */}
                        <div className="flex items-center gap-3 md:gap-4 flex-1 min-w-0 w-full sm:w-auto">
                            <div className="relative shrink-0">
                                <div className={cn(
                                    "h-10 w-10 md:h-12 md:w-12 rounded-lg md:rounded-xl bg-zinc-900 border transition-all duration-700 overflow-hidden shadow-xl",
                                    status.label !== 'Нет отметки' ? status.border : "border-white/5"
                                )}>
                                    {employee.avatar_url ? (
                                        <img src={getAvatarUrl(employee.avatar_url)} className="w-full h-full object-cover" alt="" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center bg-zinc-800 text-[10px] md:text-sm font-black text-white/10 uppercase">
                                            {(employee.full_name || employee.name || '?').charAt(0)}
                                        </div>
                                    )}
                                </div>
                                {attRecord?.check_in && !attRecord?.check_out && (
                                    <div
                                        className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-zinc-900 shadow-xl animate-pulse transition-colors duration-500"
                                        style={{ backgroundColor: status.colorHex }}
                                    />
                                )}
                            </div>

                            <div className="min-w-0 flex-1">
                                <h3 className="text-xs md:text-sm font-black text-white truncate group-hover:text-primary transition-colors tracking-tight">
                                    {employee.full_name || employee.name || 'Имя не указано'}
                                </h3>
                                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                    <span className="text-[8px] md:text-[9px] font-black text-white/20 uppercase tracking-widest truncate">
                                        {employee.position?.name || employee.position_name || 'Сотрудник'}
                                    </span>
                                    {isLeader && (
                                        <span className="px-1.5 py-0.5 rounded-md bg-primary/10 border border-primary/20 text-[7px] font-black text-primary uppercase tracking-widest shadow-lg shadow-primary/5">
                                            Лидер
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* 2. Plan Progress (Compact) */}
                        {(() => {
                            const posName = (employee.position?.name || '').toLowerCase();
                            const isDirectorOrAdmin = posName.includes('директор') || posName.includes('админ');
                            const isComm = posName.includes('коммерческий');

                            if (isDirectorOrAdmin && !isComm) return null;

                            return (
                                <div className="hidden lg:flex flex-col items-center gap-1.5 px-4 border-l border-white/5 min-w-[120px]">
                                    <span className="text-[8px] font-black text-white/20 uppercase tracking-widest">План</span>
                                    <div className="flex items-center gap-2.5 w-full">
                                        <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-primary shadow-[0_0_8px_rgba(var(--primary),0.4)] transition-all duration-1000"
                                                style={{ width: `${planPercent}%` }}
                                            />
                                        </div>
                                        <span className="text-[9px] font-black text-white/40 tabular-nums leading-none">
                                            {planPercent}%
                                        </span>
                                    </div>
                                </div>
                            );
                        })()}

                        {/* 4. Actions */}
                        <div className="flex items-center gap-2 md:gap-3 pl-4 border-l border-white/5 w-full sm:w-auto justify-end">
                            
                            {/* Attendance Edit */}
                            {canEdit && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleEditAttendance(employee);
                                    }}
                                    className="p-2 md:p-3 rounded-lg md:rounded-xl bg-white/5 border border-white/5 text-white/20 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all duration-300 shadow-xl"
                                    title="Редактировать посещаемость"
                                >
                                    <Edit2 className="h-3.5 w-3.5 md:h-4 md:w-4" />
                                </button>
                            )}
                            
                            {/* Attendance History */}
                            <button
                                onClick={(e) => {
                                    e.stopPropagation();
                                    setHistoryEmployee({ id: employee.id, name: employee.full_name || employee.name || 'Сотрудник' });
                                }}
                                className="p-2 md:p-3 rounded-lg md:rounded-xl bg-white/5 border border-white/5 text-white/20 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all duration-300 shadow-xl"
                                title="История посещаемости"
                            >
                                <Clock className="h-3.5 w-3.5 md:h-4 md:w-4" />
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    return (
        <MainLayout>
            <div className="space-y-6 md:space-y-12 animate-fade-in max-w-[1600px] mx-auto pb-16 md:pb-28 pt-4 md:pt-8">

                {/* === PREMIUM HEADER === */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 md:gap-10 mb-4 md:mb-8 px-4 sm:px-8 relative">
                    <div className="absolute -top-20 -left-20 w-64 h-64 bg-primary/10 rounded-full blur-[100px] pointer-events-none" />
                    <div className="space-y-2 md:space-y-4 relative z-10">
                        <div className="mb-3 md:mb-4">
                            <img src="/logo-panel.svg" alt="Logo" className="h-5 md:h-6 lg:h-7 w-auto object-contain opacity-40" />
                        </div>
                        <h1 className="text-4xl md:text-5xl lg:text-7xl font-black text-white uppercase tracking-tighter leading-none">
                            КОМАНДА
                        </h1>
                        <p className="text-[10px] md:text-sm font-black text-white/20 uppercase tracking-[0.2em] md:tracking-[0.4em] flex items-center gap-2 md:gap-4">
                            <span className="w-8 md:w-12 h-px bg-white/10" />
                            Управление персоналом и посещаемостью
                        </p>
                    </div>
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-4 shrink-0 relative z-10 w-full md:w-auto">
                        {/* Branch Selector — only for super admin */}
                        {isSuperAdmin && (
                            <Select value={selectedBranchId} onValueChange={setSelectedBranchId}>
                                <SelectTrigger className="w-[200px] md:w-[240px] bg-zinc-900/60 border-white/10 text-white">
                                    <SelectValue placeholder="Все филиалы" />
                                </SelectTrigger>
                                <SelectContent className="bg-zinc-900 border-white/10 rounded-xl p-1 shadow-2xl">
                                    <SelectItem value="all" className="rounded-lg h-9 md:h-10 px-3 md:px-4 font-bold text-xs uppercase cursor-pointer">
                                        <div className="flex items-center whitespace-nowrap">
                                            <Building2 className="mr-2 h-3 w-3 md:h-4 md:w-4 text-primary/60 shrink-0" />
                                            <span className="truncate">Все филиалы</span>
                                        </div>
                                    </SelectItem>
                                    {(Array.isArray(branches) ? branches : []).map((branch: any) => (
                                        <SelectItem key={branch.id} value={branch.id} className="rounded-lg h-9 md:h-10 px-3 md:px-4 font-bold text-xs uppercase cursor-pointer">
                                            <div className="flex items-center whitespace-nowrap">
                                                <Building2 className="mr-2 h-3 w-3 md:h-4 md:w-4 text-primary/60 shrink-0" />
                                                <span className="truncate">{branch.name}</span>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                        {(isSuperAdmin || canManageUsers || accessLevel >= 50) && (
                            <Button
                                onClick={() => navigate('/teams-manage')}
                                className="gap-2 bg-primary hover:bg-primary/90 shadow-lg shadow-primary/25 font-black uppercase tracking-wider text-xs"
                            >
                                <Users className="h-4 w-4" />
                                Управление
                            </Button>
                        )}
                    </div>
                </div>
                {/* Группировка по филиалам и командам */}
                {groupedData?.type === 'multi-branch' ? (
                    <div className="space-y-8 md:space-y-12">
                        {(groupedData.data as any[]).map(([branchId, branchGroup]) => (
                            <div key={branchId} className="space-y-4 md:space-y-6">
                                {/* Скрываем заголовок филиала, если он всего один (у данного пользователя только один доступный контекст) */}
                                {(groupedData.data as any[]).length > 1 && (
                                    <div className="flex items-center gap-3 px-1 border-b border-white/5 pb-2">
                                        <h3 className="text-xs md:text-sm font-black text-white tracking-widest uppercase flex items-center gap-2">
                                            <MapPin className="h-4 w-4 text-primary" />
                                            {branchId === '__no_branch__' ? 'ВНЕ ФИЛИАЛА' : branchGroup.branchName}
                                        </h3>
                                        <div className="flex-1 h-px bg-gradient-to-r from-white/5 to-transparent" />
                                        <Badge variant="outline" className="text-[10px] border-white/10 text-white/40">
                                            {Object.values(branchGroup.teams).reduce((acc: number, t: any) => acc + (t.members?.length || 0), 0)} чел.
                                        </Badge>
                                    </div>
                                )}
                                <div className="space-y-3 md:space-y-4">
                                    {Object.entries(branchGroup.teams).sort(([a], [b]) => {
                                        if (a === '__no_team__') return 1;
                                        if (b === '__no_team__') return -1;
                                        return 0;
                                    }).map(([teamId, group]: [string, any]) => {
                                        const uniqueId = `${branchId}-${teamId}`;
                                        const isCollapsed = collapsedTeams.has(uniqueId);
                                        return (
                                            <div key={teamId} className="rounded-xl md:rounded-2xl border border-white/[0.06] bg-zinc-900/20 overflow-hidden">
                                                <button
                                                    onClick={() => toggleTeam(uniqueId)}
                                                    className="w-full flex items-center justify-between gap-3 md:gap-4 px-4 md:px-6 py-3 md:py-4 hover:bg-white/[0.03] transition-all duration-500"
                                                >
                                                    <div className="flex items-center gap-3 md:gap-4 min-w-0">
                                                        <div className="h-10 w-10 md:h-12 md:w-12 rounded-lg md:rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0 shadow-lg shadow-primary/5">
                                                            <Users className="h-4 w-4 md:h-5 md:w-5 text-primary" />
                                                        </div>
                                                        <div className="text-left space-y-0.5 min-w-0">
                                                            <h2 className="text-sm md:text-lg font-black text-white tracking-tight uppercase truncate">{group.teamName}</h2>
                                                            <div className="flex items-center gap-1.5 md:gap-2 flex-wrap">
                                                                <span className="text-[8px] md:text-[9px] font-black text-white/20 uppercase tracking-[0.15em] md:tracking-[0.2em]">{group.members.length} сотрудников</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className={cn(
                                                        "w-8 h-8 md:w-10 md:h-10 rounded-full bg-white/5 border border-white/5 flex items-center justify-center transition-all duration-500 flex-shrink-0",
                                                        isCollapsed ? "" : "rotate-180 bg-primary/10 border-primary/20 text-primary"
                                                    )}>
                                                        <ChevronDown className="h-4 w-4 md:h-5 md:w-5" />
                                                    </div>
                                                </button>
                                                <div
                                                    style={{
                                                        display: 'grid',
                                                        gridTemplateRows: isCollapsed ? '0fr' : '1fr',
                                                        transition: 'grid-template-rows 0.25s ease',
                                                    }}
                                                >
                                                    <div style={{ overflow: 'hidden' }}>
                                                        <div className="px-3 md:px-5 pb-3 md:pb-5 pt-2">
                                                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 md:gap-3">
                                                                {group.members.map(renderEmployeeCard)}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                ) : groupedData?.type === 'single-branch' ? (
                    <div className="space-y-3 md:space-y-6">
                        {(groupedData.data as any[]).map(([teamId, group]) => {
                            const isCollapsed = collapsedTeams.has(teamId);
                            return (
                                <div key={teamId} className="rounded-xl md:rounded-2xl border border-white/[0.06] bg-zinc-900/20 overflow-hidden">
                                    <button
                                        onClick={() => toggleTeam(teamId)}
                                        className="w-full flex items-center justify-between gap-3 md:gap-4 px-4 md:px-6 py-3 md:py-4 hover:bg-white/[0.03] transition-all duration-500"
                                    >
                                        <div className="flex items-center gap-3 md:gap-4 min-w-0">
                                            <div className="h-10 w-10 md:h-12 md:w-12 rounded-lg md:rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0 shadow-lg shadow-primary/5">
                                                <Users className="h-4 w-4 md:h-5 md:w-5 text-primary" />
                                            </div>
                                            <div className="text-left space-y-0.5 min-w-0">
                                                <h2 className="text-sm md:text-lg font-black text-white tracking-tight uppercase truncate">{group.teamName}</h2>
                                                <div className="flex items-center gap-1.5 md:gap-2 flex-wrap">
                                                    <span className="text-[8px] md:text-[9px] font-black text-white/20 uppercase tracking-[0.15em] md:tracking-[0.2em]">{group.members.length} сотрудников</span>
                                                    <div className="w-1 h-1 rounded-full bg-white/10" />
                                                    <span className="text-[8px] md:text-[9px] font-black text-primary uppercase tracking-[0.15em] md:tracking-[0.2em] truncate">Филиал {group.members[0]?.branch?.name || 'Основной'}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className={cn(
                                            "w-8 h-8 md:w-10 md:h-10 rounded-full bg-white/5 border border-white/5 flex items-center justify-center transition-all duration-500 flex-shrink-0",
                                            isCollapsed ? "" : "rotate-180 bg-primary/10 border-primary/20 text-primary"
                                        )}>
                                            <ChevronDown className="h-4 w-4 md:h-5 md:w-5" />
                                        </div>
                                    </button>
                                    <div
                                        style={{
                                            display: 'grid',
                                            gridTemplateRows: isCollapsed ? '0fr' : '1fr',
                                            transition: 'grid-template-rows 0.25s ease',
                                        }}
                                    >
                                        <div style={{ overflow: 'hidden' }}>
                                            <div className="px-3 md:px-5 pb-3 md:pb-5 pt-2">
                                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 md:gap-3">
                                                    {group.members.map(renderEmployeeCard)}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 md:gap-3">
                        {[...filteredEmployees]
                            .sort((a: any, b: any) => {
                                const aIsLeader = teams?.some((t: any) => normalizeId(t.leader_id) === normalizeId(a.id));
                                const bIsLeader = teams?.some((t: any) => normalizeId(t.leader_id) === normalizeId(b.id));
                                if (aIsLeader && !bIsLeader) return -1;
                                if (!aIsLeader && bIsLeader) return 1;
                                return 0;
                            })
                            .map(renderEmployeeCard)}
                    </div>
                )}

                {filteredEmployees.length === 0 && (
                    <div className="text-center py-12 md:py-20 bg-zinc-900/40 rounded-2xl md:rounded-3xl border border-dashed border-white/5">
                        <Users className="h-10 w-10 md:h-12 md:w-12 text-muted-foreground mx-auto mb-3 md:mb-4 opacity-20" />
                        <h3 className="text-lg md:text-xl font-bold text-white">Команда не найдена</h3>
                        <p className="text-muted-foreground text-xs md:text-sm max-w-xs mx-auto mt-2 px-4">
                            В вашем филиале или команде пока нет сотрудников
                        </p>
                    </div>
                )}
            </div>

            {/* Edit Attendance Dialog */}
            <Dialog open={!!editingAttendance} onOpenChange={() => setEditingAttendance(null)}>
                <DialogContent className="sm:max-w-md w-[calc(100%-2rem)] rounded-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-base md:text-lg">Посещаемость: {editingAttendance?.empName}</DialogTitle>
                        <DialogDescription className="sr-only">
                            Редактирование времени прихода и ухода сотрудника.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3 md:space-y-4 py-3 md:py-4">
                        <div className="space-y-1.5 md:space-y-2">
                            <label className="text-[10px] md:text-xs font-bold uppercase text-muted-foreground">Время прихода</label>
                            <Input
                                type="time"
                                className="bg-white/5 border-white/10 h-10 md:h-11"
                                value={checkInTime}
                                onChange={(e) => setCheckInTime(e.target.value)}
                            />
                        </div>
                        <div className="space-y-1.5 md:space-y-2">
                            <label className="text-[10px] md:text-xs font-bold uppercase text-muted-foreground">Время ухода</label>
                            <Input
                                type="time"
                                className="bg-white/5 border-white/10 h-10 md:h-11"
                                value={checkOutTime}
                                onChange={(e) => setCheckOutTime(e.target.value)}
                            />
                        </div>
                    </div>
                    <DialogFooter className="gap-2 sm:gap-0">
                        <Button variant="ghost" onClick={() => setEditingAttendance(null)} className="h-10 md:h-11 text-sm">Отмена</Button>
                        <Button
                            className="bg-primary hover:bg-primary/90 h-10 md:h-11 text-sm"
                            onClick={() => {
                                const datePart = editingAttendance.date || new Date().toISOString().split('T')[0];
                                const formatISO = (time: string) => time ? new Date(`${datePart}T${time}`).toISOString() : null;

                                updateAttendance.mutate({
                                    id: editingAttendance.id,
                                    user_id: editingAttendance.user_id,
                                    date: datePart,
                                    check_in: formatISO(checkInTime),
                                    check_out: formatISO(checkOutTime),
                                    isNew: editingAttendance.isNew
                                });
                            }}
                            disabled={updateAttendance.isPending}
                        >
                            {updateAttendance.isPending ? "Сохранение..." : "Сохранить"}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Attendance History Dialog */}
            <AttendanceHistoryDialog
                open={!!historyEmployee}
                onOpenChange={(open) => !open && setHistoryEmployee(null)}
                employeeId={historyEmployee?.id || ''}
                employeeName={historyEmployee?.name || ''}
            />
        </MainLayout>
    );
}

export default memo(Team);
