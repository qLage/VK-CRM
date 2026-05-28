import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { localAPI } from '@/integrations/localAPI';
import { useAuth } from '@/hooks/useAuth';
import { useClientRestrictions, useRestrictClientAccess, useRemoveClientRestriction } from '@/hooks/useClients';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { UserX, UserCheck, Building2, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Member {
  id: string;
  full_name: string;
  team_id: string | null;
  team_name?: string | null;
  branch_id: string | null;
  branch_name?: string | null;
}

export function ClientAccessSettings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { accessLevel, user } = useAuth();
  const { data: restrictions = [], isLoading: loadingRestrictions } = useClientRestrictions();
  const restrictMutation = useRestrictClientAccess();
  const removeMutation = useRemoveClientRestriction();

  // Get employees
  const { data: membersRaw = [], isLoading: loadingMembers } = useQuery({
    queryKey: ['team-members-for-access'],
    queryFn: async () => {
      const { data } = await localAPI.request('/employees?limit=200');
      if (data?.data && Array.isArray(data.data)) return data.data;
      if (Array.isArray(data)) return data;
      if (data?.employees && Array.isArray(data.employees)) return data.employees;
      return [];
    },
  });

  const members: Member[] = (Array.isArray(membersRaw) ? membersRaw : []).map((m: any) => ({
    id: m.id,
    full_name: m.full_name,
    team_id: m.team_id || m.team?.id || null,
    team_name: m.team_name || m.team?.name || null,
    branch_id: m.branch_id || m.branch?.id || null,
    branch_name: m.branch_name || m.branch?.name || null,
  }));

  // Filter: only show subordinates
  const filteredMembers = useMemo(() => members.filter((m: any) => {
    if (m.id === user?.id) return false;
    // Managers see only their team
    if (accessLevel < 90) return m.team_id === user?.team_id;
    // Commercial director sees their branch
    if (accessLevel < 100) return m.branch_id === user?.branch_id;
    // Admin/Director sees all
    return true;
  }), [members, user, accessLevel]);

  // Group by branch → team
  const grouped = useMemo(() => {
    const map = new Map<string, { branchName: string; teams: Map<string, { teamName: string; members: Member[] }> }>();

    for (const m of filteredMembers) {
      const branchKey = m.branch_id || '_no_branch';
      const branchName = (m as any).branch_name || 'Без филиала';
      const teamKey = m.team_id || '_no_team';
      const teamName = (m as any).team_name || 'Без команды';

      if (!map.has(branchKey)) {
        map.set(branchKey, { branchName, teams: new Map() });
      }
      const branch = map.get(branchKey)!;
      if (!branch.teams.has(teamKey)) {
        branch.teams.set(teamKey, { teamName, members: [] });
      }
      branch.teams.get(teamKey)!.members.push(m);
    }

    return map;
  }, [filteredMembers]);

  const restrictedIds = useMemo(() => new Set(restrictions.map((r: any) => r.user_id)), [restrictions]);

  const toggleRestriction = async (userId: string) => {
    if (restrictedIds.has(userId)) {
      await removeMutation.mutateAsync(userId);
    } else {
      await restrictMutation.mutateAsync(userId);
    }
  };

  const isLoading = loadingRestrictions || loadingMembers;
  const showBranches = accessLevel >= 100; // Director sees branches
  const showTeams = accessLevel >= 90; // Commercial director sees teams

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[80vh] rounded-2xl bg-zinc-950 border-white/10 p-0 overflow-hidden flex flex-col">
        <DialogHeader className="p-6 pb-4 border-b border-white/5 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-violet-500/10 rounded-xl border border-violet-500/10">
              <UserCheck className="h-4 w-4 text-violet-400" />
            </div>
            <div>
              <DialogTitle className="text-white font-black uppercase tracking-widest text-sm">
                Управление доступом
              </DialogTitle>
              <p className="text-[10px] text-white/30 font-bold uppercase tracking-widest mt-0.5">
                Скрытие раздела «Клиенты» для сотрудников
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          ) : filteredMembers.length === 0 ? (
            <p className="text-sm text-white/30 text-center py-8 font-bold uppercase tracking-widest">Нет сотрудников для управления</p>
          ) : (
            Array.from(grouped.entries()).map(([branchKey, branch]) => (
              <div key={branchKey} className="space-y-3">
                {/* Branch header (only for director) */}
                {showBranches && grouped.size > 1 && (
                  <div className="flex items-center gap-2 pt-2">
                    <Building2 className="w-3.5 h-3.5 text-white/20" />
                    <span className="text-[10px] font-black text-white/30 uppercase tracking-widest">{branch.branchName}</span>
                  </div>
                )}

                {Array.from(branch.teams.entries()).map(([teamKey, team]) => (
                  <div key={teamKey} className="space-y-2">
                    {/* Team header (for commercial director+) */}
                    {showTeams && branch.teams.size > 1 && (
                      <div className="flex items-center gap-2 ml-2">
                        <Users className="w-3 h-3 text-white/15" />
                        <span className="text-[9px] font-black text-white/20 uppercase tracking-widest">{team.teamName}</span>
                      </div>
                    )}

                    {team.members.map((m) => {
                      const isRestricted = restrictedIds.has(m.id);
                      const isPending = restrictMutation.isPending || removeMutation.isPending;
                      return (
                        <div
                          key={m.id}
                          className={cn(
                            "flex items-center justify-between p-3 rounded-xl border transition-all",
                            isRestricted
                              ? "bg-red-500/5 border-red-500/15"
                              : "bg-zinc-900/40 border-white/5"
                          )}
                        >
                          <div className="flex items-center gap-2.5">
                            {isRestricted ? (
                              <UserX className="w-4 h-4 text-red-400/70" />
                            ) : (
                              <UserCheck className="w-4 h-4 text-emerald-400/70" />
                            )}
                            <span className="text-sm font-medium text-white/80">{m.full_name}</span>
                          </div>
                          <div className="flex items-center gap-2.5">
                            <span className={cn(
                              "text-[9px] font-black uppercase tracking-widest",
                              isRestricted ? "text-red-400/60" : "text-emerald-400/60"
                            )}>
                              {isRestricted ? 'Скрыт' : 'Доступен'}
                            </span>
                            <Switch
                              checked={!isRestricted}
                              onCheckedChange={() => toggleRestriction(m.id)}
                              disabled={isPending}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
