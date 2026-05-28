import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn, getAvatarUrl } from '@/lib/utils';
import { INPUT_WITH_LEADING_ICON } from '@/lib/inputClassNames';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { localAPI } from '@/integrations/localAPI';
import { Search, UserPlus, UserMinus, X, Loader2, User } from 'lucide-react';
import { toast } from 'sonner';
import { Checkbox } from '@/components/ui/checkbox';


interface TeamMembersDialogProps {
    team: {
        id: string;
        name: string;
        branch_id: string;
    } | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

export function TeamMembersDialog({ team, open, onOpenChange }: TeamMembersDialogProps) {
    const queryClient = useQueryClient();
    const [searchQuery, setSearchQuery] = useState('');
    const [showAll, setShowAll] = useState(false);

    // Fetch all employees to filter locally (since we might not have specific endpoints)
    const { data: employees, isLoading } = useQuery({
        queryKey: ['all-employees-for-management'],
        queryFn: async () => {
            const { data } = await localAPI.request('/employees');
            if (Array.isArray(data?.data)) return data.data;
            if (Array.isArray(data)) return data;
            return [];
        },
        enabled: open,
    });

    const updateMemberMutation = useMutation({
        mutationFn: async ({ userId, teamId }: { userId: string, teamId: string | null }) => {
            // Using /employees/:id endpoint which usually handles profile updates
            const body: any = { team_id: teamId };
            // If adding to a team, also ensure they are in the team's branch
            if (teamId && team?.branch_id) {
                body.branch_id = team.branch_id;
            }

            const { error } = await localAPI.request(`/employees/${userId}`, {
                method: 'PATCH',
                body
            });

            if (error) throw error;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['all-employees-for-management'] });
            queryClient.invalidateQueries({ queryKey: ['teams-list'] }); // Update counts if any
            toast.success('Состав команды обновлен');
        },
        onError: () => {
            toast.error('Не удалось обновить состав команды');
        }
    });

    // Helper for ID comparison
    const normalizeId = (id: any) => id ? String(id).toLowerCase().trim() : null;

    if (!team) return null;

    // Получаем team_id сотрудника с учётом обоих форматов ответа API
    const getEmpTeamId = (e: any) => normalizeId(e.team_id) || normalizeId(e.team?.id);

    // Filter members of this team
    const employeesArray = Array.isArray(employees) ? employees : [];
    const currentMembers = employeesArray.filter((e: any) => getEmpTeamId(e) === normalizeId(team.id));

    // Filter potential new members:
    const availableEmployees = employeesArray.filter((e: any) => {
        // 1. Check branch
        const teamBranchId = normalizeId(team.branch_id);
        const empBranchId = normalizeId(e.branch_id) || normalizeId(e.branch?.id);

        const inSameBranch = !teamBranchId || !empBranchId || (empBranchId === teamBranchId);
        const isVisible = showAll || inSameBranch;

        // 2. Not in THIS team
        const notInThisTeam = getEmpTeamId(e) !== normalizeId(team.id);

        // 3. Search
        const matchesSearch = (e.full_name || '').toLowerCase().includes(String(searchQuery || '').toLowerCase());

        // 4. Active check (handle 0/1 or true/false)
        const isActive = e.is_active === 1 || e.is_active === true || e.is_active === '1' || e.is_active === 'true';

        return isVisible && notInThisTeam && matchesSearch && isActive;
    });

    // Sort: those with team_id (already in another team) go to the bottom
    const sortedAvailable = [...availableEmployees].sort((a, b) => {
        const aHasTeam = getEmpTeamId(a) ? 1 : 0;
        const bHasTeam = getEmpTeamId(b) ? 1 : 0;
        return aHasTeam - bHasTeam;
    });

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="w-[min(96vw,72rem)] max-w-[min(96vw,72rem)] md:!max-w-[min(96vw,72rem)] sm:rounded-3xl h-[80vh] max-h-[90vh] flex flex-col p-0 overflow-hidden">
                <DialogHeader className="p-6 pb-2 border-b border-white/10">
                    <DialogTitle className="text-xl font-bold flex items-center gap-2">
                        <UserPlus className="h-5 w-5 text-primary" />
                        Состав команды: {team.name}
                    </DialogTitle>
                    <DialogDescription className="text-xs text-muted-foreground">
                        Управление составом команды: добавление и удаление сотрудников
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
                    {/* Current Members Column */}
                    <div className="flex-1 border-b md:border-b-0 md:border-r border-white/10 flex flex-col min-h-0 bg-white/5">
                        <div className="p-4 border-b border-white/5 bg-white/5">
                            <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">
                                Участники ({currentMembers.length})
                            </h3>
                        </div>
                        <ScrollArea className="flex-1 p-2">
                            <div className="space-y-2">
                                {currentMembers.map((member: any) => (
                                    <div key={member.id} className="flex items-center justify-between gap-3 min-w-0 p-2 rounded-xl bg-zinc-900/50 border border-white/5 hover:border-white/10 transition-colors group">
                                        <div className="flex items-center gap-3 min-w-0 flex-1">
                                            <Avatar className="h-9 w-9 shrink-0 aspect-square rounded-full border border-white/10">
                                                <AvatarImage src={getAvatarUrl(member.avatar_url)} className="object-cover" />
                                                <AvatarFallback className="bg-primary/20 text-primary text-xs">
                                                    {member.full_name?.charAt(0)}
                                                </AvatarFallback>
                                            </Avatar>
                                            <div className="flex flex-col min-w-0">
                                                <span className="text-sm font-medium leading-none">{member.full_name}</span>
                                                <span className="text-xs text-muted-foreground">{member.position?.name || member.position_name || 'Должность не указана'}</span>
                                            </div>
                                        </div>
                                        {normalizeId(member.id) !== normalizeId((team as any)?.leader_id) ? (
                                            <Button
                                                size="icon"
                                                variant="ghost"
                                                className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-all"
                                                onClick={() => updateMemberMutation.mutate({ userId: member.id, teamId: null })}
                                                disabled={updateMemberMutation.isPending}
                                            >
                                                <UserMinus className="h-4 w-4" />
                                            </Button>
                                        ) : (
                                            <div className="px-2 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-[10px] font-bold text-amber-500 uppercase tracking-widest whitespace-nowrap flex-shrink-0">
                                                Лидер
                                            </div>
                                        )}
                                    </div>
                                ))}
                                {currentMembers.length === 0 && (
                                    <div className="p-8 text-center text-muted-foreground text-sm">
                                        В команде пока нет сотрудников
                                    </div>
                                )}
                            </div>
                        </ScrollArea>
                    </div>

                    {/* Available Employees Column */}
                    <div className="flex-1 flex flex-col min-h-0">
                        <div className="p-4 border-b border-white/5 space-y-3">
                            <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wider">
                                Добавить сотрудника
                            </h3>
                            <div className="flex flex-col gap-2">
                                <div className="relative">
                                    <Search className="pointer-events-none absolute left-3.5 top-1/2 z-0 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                                    <Input
                                        placeholder="Поиск по имени..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        className={cn(INPUT_WITH_LEADING_ICON, 'bg-zinc-900/50 border-white/10 h-9 text-sm')}
                                    />
                                </div>
                                <div className="pt-2">
                                    <label
                                        htmlFor="showAll"
                                        className="flex items-center gap-3 p-3 rounded-xl bg-zinc-900/50 border border-white/5 hover:border-white/10 cursor-pointer transition-all group/checkbox"
                                    >
                                        <Checkbox
                                            id="showAll"
                                            checked={showAll}
                                            onCheckedChange={(checked) => setShowAll(!!checked)}
                                            className="border-white/20 data-[state=checked]:border-primary data-[state=checked]:bg-primary transition-all group-hover/checkbox:border-primary/50"
                                        />
                                        <span className="text-sm text-muted-foreground group-hover/checkbox:text-foreground transition-colors select-none">
                                            Показать сотрудников других филиалов
                                        </span>
                                    </label>
                                </div>
                            </div>
                        </div>
                        <ScrollArea className="flex-1 p-2">
                            {isLoading ? (
                                <div className="flex items-center justify-center h-full">
                                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    {sortedAvailable.map((employee: any) => {
                                        const hasOtherTeam = getEmpTeamId(employee) && getEmpTeamId(employee) !== normalizeId(team.id);

                                        return (
                                            <div key={employee.id} className={cn(
                                                "flex items-center justify-between gap-3 min-w-0 p-2 rounded-xl border border-transparent transition-all group hover:bg-zinc-900/50 hover:border-white/5",
                                                hasOtherTeam && "bg-amber-500/5 border-amber-500/10"
                                            )}>
                                                <div className="flex items-center gap-3 min-w-0 flex-1">
                                                    <Avatar className="h-9 w-9 shrink-0 aspect-square rounded-full border border-white/10">
                                                        <AvatarImage src={getAvatarUrl(employee.avatar_url)} className="object-cover" />
                                                        <AvatarFallback className="bg-primary/20 text-primary text-xs">
                                                            {employee.full_name?.charAt(0)}
                                                        </AvatarFallback>
                                                    </Avatar>
                                                    <div className="flex flex-col min-w-0">
                                                        <span className="text-sm font-medium leading-none">{employee.full_name}</span>
                                                        <div className="flex gap-2 text-xs text-muted-foreground">
                                                            <span>{employee.position?.name || employee.position_name || 'Должность не указана'}</span>
                                                            {hasOtherTeam && <span className="text-amber-500/80">• В другой команде</span>}
                                                        </div>
                                                    </div>
                                                </div>
                                                <Button
                                                    size="sm"
                                                    variant={hasOtherTeam ? "outline" : "secondary"}
                                                    className={cn(
                                                        "h-9 shrink-0 px-3 gap-1.5 transition-colors whitespace-nowrap",
                                                        hasOtherTeam ? "border-amber-500/20 text-amber-500 hover:bg-amber-500 hover:text-white" : "hover:bg-primary hover:text-primary-foreground"
                                                    )}
                                                    onClick={() => updateMemberMutation.mutate({ userId: employee.id, teamId: team.id })}
                                                    disabled={updateMemberMutation.isPending}
                                                >
                                                    <Plus className="h-3.5 w-3.5" />
                                                    <span className="sr-only sm:not-sr-only sm:text-xs">{hasOtherTeam ? 'Перевести' : 'Добавить'}</span>
                                                </Button>
                                            </div>
                                        );
                                    })}
                                    {availableEmployees.length === 0 && (
                                        <div className="p-8 text-center text-muted-foreground text-sm">
                                            Сотрудники не найдены
                                        </div>
                                    )}
                                </div>
                            )}
                        </ScrollArea>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}

function Plus({ className }: { className?: string }) {
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={className}
        >
            <path d="M5 12h14" />
            <path d="M12 5v14" />
        </svg>
    )
}
