import { useState, useEffect } from 'react';
import { MainLayout } from '@/components/layout/MainLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Dialog, DialogContent, DialogHeader,
    DialogTitle, DialogTrigger, DialogDescription
} from '@/components/ui/dialog';
import {
    AlertDialog, AlertDialogAction, AlertDialogCancel,
    AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
    AlertDialogHeader, AlertDialogTitle
} from "@/components/ui/alert-dialog";
import {
    Select, SelectContent, SelectItem,
    SelectTrigger, SelectValue
} from '@/components/ui/select';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { localAPI } from '@/integrations/localAPI';
import { Users, Plus, Pencil, Trash2, Building2, User, UserCog } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { TeamMembersDialog } from '@/components/teams/TeamMembersDialog';
import { cn } from '@/lib/utils';

export default function TeamManagement() {
    const { accessLevel, canManageUsers } = useAuth();
    const queryClient = useQueryClient();
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [deleteId, setDeleteId] = useState<string | null>(null);
    const [editingTeam, setEditingTeam] = useState<any>(null);
    const [formData, setFormData] = useState({ name: '', branch_id: '', leader_id: '' });

    // Members Management Dialog State
    const [membersDialogTeam, setMembersDialogTeam] = useState<any>(null);
    const [isMembersDialogOpen, setIsMembersDialogOpen] = useState(false);

    const isManagement = canManageUsers || accessLevel >= 90;

    // Fetch Lists
    const { data: teams } = useQuery({
        queryKey: ['teams-list'],
        queryFn: async () => {
            const { data } = await localAPI.request('/teams');
            if (Array.isArray(data?.data)) return data.data;
            if (Array.isArray(data)) return data;
            return [];
        },
        staleTime: 180000, // Cache for 3 minutes
    });

    const { data: branches } = useQuery({
        queryKey: ['branches-list'],
        queryFn: async () => {
            const { data } = await localAPI.request('/branches');
            if (Array.isArray(data?.data)) return data.data;
            if (Array.isArray(data)) return data;
            return [];
        },
        staleTime: 300000, // Cache for 5 minutes
    });

    const { data: employees } = useQuery({
        queryKey: ['employees-for-teams'],
        queryFn: async () => {
            const { data } = await localAPI.request('/employees');
            if (Array.isArray(data?.data)) return data.data;
            if (Array.isArray(data)) return data;
            return [];
        },
        staleTime: 120000, // Cache for 2 minutes
    });

    const createMutation = useMutation({
        mutationFn: async (data: any) => {
            const { error } = await localAPI.request('/teams', { method: 'POST', body: data });
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['teams-list'] });
            queryClient.invalidateQueries({ queryKey: ['employees-for-teams'] });
            queryClient.invalidateQueries({ queryKey: ['all-employees-for-management'] });
            queryClient.invalidateQueries({ queryKey: ['team-employees'] });
            setIsDialogOpen(false);
            resetForm();
            toast.success('Команда создана');
        },
        onError: () => toast.error('Ошибка при создании')
    });

    const updateMutation = useMutation({
        mutationFn: async (data: any) => {
            const { error } = await localAPI.request(`/teams/${editingTeam.id}`, { method: 'PUT', body: data });
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['teams-list'] });
            queryClient.invalidateQueries({ queryKey: ['employees-for-teams'] });
            queryClient.invalidateQueries({ queryKey: ['all-employees-for-management'] });
            queryClient.invalidateQueries({ queryKey: ['team-employees'] });
            setIsDialogOpen(false);
            resetForm();
            toast.success('Команда обновлена');
        },
        onError: () => toast.error('Ошибка при обновлении')
    });

    const deleteMutation = useMutation({
        mutationFn: async (id: string) => {
            const { error } = await localAPI.request(`/teams/${id}`, { method: 'DELETE' });
            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['teams-list'] });
            setDeleteId(null);
            toast.success('Команда удалена');
        },
        onError: () => toast.error('Ошибка при удалении')
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (editingTeam) {
            updateMutation.mutate(formData);
        } else {
            createMutation.mutate(formData);
        }
    };

    const handleEdit = (team: any) => {
        setEditingTeam(team);
        setFormData({
            name: team.name,
            branch_id: team.branch_id || '',
            leader_id: team.leader_id || ''
        });
        setIsDialogOpen(true);
    };

    const handleManageMembers = (team: any) => {
        setMembersDialogTeam(team);
        setIsMembersDialogOpen(true);
    };

    // Helper for redundant ID comparison
    const normalizeId = (id: any) => id ? String(id).toLowerCase().trim() : null;

    const resetForm = () => {
        setEditingTeam(null);
        setFormData({ name: '', branch_id: '', leader_id: '' });
    };

    // Log employees for debug
    useEffect(() => {
        if (employees && import.meta.env.DEV) {
            console.log("TeamManagement Employees Data:", employees.map((e: any) => ({
                name: e.full_name,
                role: e.role,
                branch_id: e.branch_id,
                is_active: e.is_active,
                id: e.id
            })));
        }
    }, [employees]);

    if (!isManagement) return null; // Or unauthorized page

    return (
        <MainLayout>
            <div className="space-y-6 animate-fade-in pb-20">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="mb-3">
                            <img src="/logo-panel.svg" alt="Logo" className="h-6 w-auto object-contain opacity-60" />
                        </div>
                        <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-foreground to-foreground/70">Управление Командами</h1>
                        <p className="text-sm text-muted-foreground mt-1">Отделы продаж и группы</p>
                    </div>

                    <Dialog open={isDialogOpen} onOpenChange={(open) => {
                        setIsDialogOpen(open);
                        if (!open) resetForm();
                    }}>
                        <DialogTrigger asChild>
                            <Button className="gradient-primary shadow-lg hover:shadow-primary/20">
                                <Plus className="mr-2 h-4 w-4" /> Добавить команду
                            </Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader>
                                <DialogTitle>{editingTeam ? 'Редактировать команду' : 'Новая команда'}</DialogTitle>
                                <DialogDescription className="sr-only">
                                    Форма создания или редактирования команды (название, филиал, руководитель)
                                </DialogDescription>
                            </DialogHeader>
                            <form onSubmit={handleSubmit} className="space-y-4 pt-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Название</label>
                                    <Input
                                        required
                                        value={formData.name}
                                        onChange={e => setFormData({ ...formData, name: e.target.value })}
                                        placeholder="Например: Отдел продаж №1"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Филиал</label>
                                    <Select
                                        value={formData.branch_id}
                                        onValueChange={(val) => {
                                            // Clear leader if branch changes
                                            setFormData({ ...formData, branch_id: val, leader_id: '' });
                                        }}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Выберите филиал" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {branches?.map((b: any) => (
                                                <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Руководитель команды (МОП/РОП)</label>
                                    <Select
                                        value={formData.leader_id}
                                        onValueChange={(val) => setFormData({ ...formData, leader_id: val })}
                                        disabled={!formData.branch_id}
                                    >
                                        <SelectTrigger className={cn(!formData.branch_id && "opacity-50 cursor-not-allowed")}>
                                            <SelectValue placeholder={formData.branch_id ? "Выберите руководителя" : "Сначала выберите филиал"} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {employees
                                                ?.filter((e: any) => {
                                                    // Comprehensive active check
                                                    const isActive = e.is_active === 1 || e.is_active === true || e.is_active === '1' || e.is_active === 'true';
                                                    if (!isActive) return false;

                                                    // roles: Только Коммерческий, РОП и МОП могут быть лидерами
                                                    // positions (Cyrillic ROP/MOP)
                                                    const posName = String(e.position_name || '').toLowerCase().trim();
                                                    const isLeaderPos = posName === 'роп' || posName === 'моп' || posName.includes('коммерческ') || posName.includes('директор');

                                                    const isLeaderCandidate = isLeaderPos;

                                                    // branch comparison
                                                    const empBranchId = normalizeId(e.branch_id);
                                                    const targetBranchId = normalizeId(formData.branch_id);

                                                    // Logic: If employee has a branch, it must match. If it's a global role (no branch), allow them everywhere.
                                                    const sameBranch = !empBranchId || empBranchId === targetBranchId;

                                                    // Debug logging (will show in console)
                                                    if (isLeaderCandidate && import.meta.env.DEV) {
                                                        console.log(`Filter Check for ${e.full_name}: role=${e.role}, pos=${e.position_name}, empBranch=${empBranchId}, target=${targetBranchId}, match=${sameBranch}`);
                                                    }

                                                    return isLeaderCandidate && sameBranch;
                                                })
                                                .map((e: any) => (
                                                    <SelectItem key={e.id} value={e.id}>
                                                        <div className="flex flex-col">
                                                            <span className="font-medium">{e.full_name}</span>
                                                            <span className="text-[10px] text-muted-foreground uppercase">{e.position_name || ''}</span>
                                                        </div>
                                                    </SelectItem>
                                                ))}
                                            {employees?.filter(e => {
                                                const isActive = e.is_active === 1 || e.is_active === true || e.is_active === '1' || e.is_active === 'true';
                                                const empAccessLevel = e.position?.access_level ?? 0;
                                                const isLeaderByLevel = empAccessLevel >= 50;
                                                const posName = String(e.position_name || '').toLowerCase().trim();
                                                const isLeaderPos = posName === 'роп' || posName === 'моп';
                                                const isLeaderCandidate = isLeaderByLevel || isLeaderPos;
                                                const empBranchId = normalizeId(e.branch_id);
                                                const targetBranchId = normalizeId(formData.branch_id);
                                                const sameBranch = !empBranchId || empBranchId === targetBranchId;
                                                return isActive && isLeaderCandidate && sameBranch;
                                            }).length === 0 && (
                                                    <div className="p-4 text-center text-xs text-muted-foreground">
                                                        В этом филиале нет подходящих руководителей (РОП/МОП)
                                                    </div>
                                                )}
                                        </SelectContent>
                                    </Select>
                                    {!formData.branch_id && (
                                        <p className="text-[10px] text-amber-500 font-medium animate-pulse">
                                            * Необходимо выбрать филиал для выбора руководителя
                                        </p>
                                    )}
                                </div>
                                <Button type="submit" className="w-full" disabled={createMutation.isPending || updateMutation.isPending}>
                                    {editingTeam ? 'Сохранить изменения' : 'Создать команду'}
                                </Button>
                            </form>
                        </DialogContent>
                    </Dialog>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {teams?.map((team: any) => (
                        <div key={team.id} className="group relative overflow-hidden rounded-2xl border border-border/50 bg-card/50 hover:bg-card/80 transition-all hover:shadow-lg flex flex-col">
                            <div className="p-6 flex-1">
                                <div className="h-12 w-12 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500 mb-4">
                                    <Users className="h-6 w-6" />
                                </div>

                                <h3 className="text-xl font-bold mb-1">{team.name}</h3>
                                <div className="space-y-2 mt-4">
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                        <Building2 className="h-4 w-4 opacity-70" />
                                        <span>{team.branch_name || 'Без филиала'}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-sm text-foreground font-medium">
                                        <User className="h-4 w-4 text-primary" />
                                        <span>{team.leader_name || 'Нет руководителя'}</span>
                                    </div>
                                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                        <Users className="h-4 w-4 opacity-70" />
                                        <span>
                                            {employees
                                                ? `${employees.filter((e: any) => String(e.team_id || e.team?.id) === String(team.id)).length} участн.`
                                                : '...'}
                                        </span>
                                    </div>
                                </div>

                                <Button
                                    className="w-full mt-6 bg-secondary/50 hover:bg-primary/10 hover:text-primary border border-white/5"
                                    variant="outline"
                                    onClick={() => handleManageMembers(team)}
                                >
                                    <UserCog className="mr-2 h-4 w-4" /> Состав команды
                                </Button>
                            </div>

                            <div className="p-4 bg-black/20 border-t border-white/5 flex gap-3">
                                <Button
                                    variant="outline"
                                    className="flex-1 hover:bg-primary/10 hover:text-primary hover:border-primary/20"
                                    onClick={() => handleEdit(team)}
                                >
                                    <Pencil className="h-4 w-4 mr-2" /> Редактировать
                                </Button>
                                <Button
                                    variant="outline"
                                    className="flex-1 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/20 text-destructive"
                                    onClick={() => setDeleteId(team.id)}
                                >
                                    <Trash2 className="h-4 w-4 mr-2" /> Удалить
                                </Button>
                            </div>
                        </div>
                    ))}
                </div>

                <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
                    <AlertDialogContent>
                        <AlertDialogHeader>
                            <AlertDialogTitle>Удалить команду?</AlertDialogTitle>
                            <AlertDialogDescription>
                                Это действие нельзя отменить. Все данные команды будут удалены.
                                Сотрудники будут отвязаны от команды.
                            </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                            <AlertDialogCancel>Отмена</AlertDialogCancel>
                            <AlertDialogAction
                                onClick={() => deleteId && deleteMutation.mutate(deleteId)}
                                className="bg-destructive hover:bg-destructive/90 text-white shadow-md border-0"
                            >
                                Удалить
                            </AlertDialogAction>
                        </AlertDialogFooter>
                    </AlertDialogContent>
                </AlertDialog>

                <TeamMembersDialog
                    team={membersDialogTeam}
                    open={isMembersDialogOpen}
                    onOpenChange={setIsMembersDialogOpen}
                />
            </div>
        </MainLayout>
    );
}
