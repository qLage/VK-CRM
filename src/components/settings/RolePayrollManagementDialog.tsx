import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronRight, Users } from 'lucide-react';
import { localAPI } from '@/integrations/localAPI';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export type PayrollAssignmentRole = 'sales_manager' | 'head_sales' | 'commercial';

type AssignmentRow = {
  user_id: string;
  name: string;
  branch_name: string;
  applies_official_payroll: boolean;
};

const roleTitles: Record<PayrollAssignmentRole, string> = {
  sales_manager: 'МОП',
  head_sales: 'РОП',
  commercial: 'Коммерческий директор',
};

function employeesWord(n: number): string {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return 'сотрудник';
  if (n10 >= 2 && n10 <= 4 && (n100 < 10 || n100 >= 20)) return 'сотрудника';
  return 'сотрудников';
}

export function RolePayrollManagementDialog({
  role,
  open,
  onOpenChange,
}: {
  role: PayrollAssignmentRole | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const queryClient = useQueryClient();
  const activeRole = open && role ? role : null;
  const title = activeRole ? roleTitles[activeRole] : '';

  const { data, isLoading, isError, refetch, dataUpdatedAt } = useQuery({
    queryKey: ['payroll-role-assignments', activeRole],
    enabled: !!activeRole,
    queryFn: async (): Promise<AssignmentRow[]> => {
      const { data: payload, error } = await localAPI.request(
        `/finances/payroll-role-assignments?role=${encodeURIComponent(activeRole!)}`,
      );
      if (error) throw error;
      const list = Array.isArray(payload)
        ? payload
        : Array.isArray((payload as { data?: unknown })?.data)
          ? (payload as { data: AssignmentRow[] }).data
          : [];
      return list as AssignmentRow[];
    },
  });

  const rows = useMemo<AssignmentRow[]>(
    () => (Array.isArray(data) ? data : []),
    [data],
  );

  const [local, setLocal] = useState<Record<string, boolean>>({});
  const [viewStep, setViewStep] = useState<'branches' | 'employees'>('branches');
  const [selectedBranchKey, setSelectedBranchKey] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !activeRole) return;
    setViewStep('branches');
    setSelectedBranchKey(null);
  }, [open, activeRole]);

  useEffect(() => {
    if (!open || !activeRole) return;

    setLocal((prev) => {
      if (!rows.length) {
        return Object.keys(prev).length === 0 ? prev : {};
      }
      const next: Record<string, boolean> = {};
      for (const r of rows) {
        next[r.user_id] = r.applies_official_payroll;
      }
      const nk = Object.keys(next);
      if (Object.keys(prev).length !== nk.length) return next;
      for (const id of nk) {
        if (prev[id] !== next[id]) return next;
      }
      return prev;
    });
  }, [open, activeRole, rows, dataUpdatedAt]);

  const patch = useMutation({
    mutationFn: async (payload: { user_id: string; uses_official_payroll: boolean }) => {
      const { error } = await localAPI.request('/finances/payroll-role-assignments', {
        method: 'PATCH',
        body: payload,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['payroll-role-assignments'] });
      await queryClient.invalidateQueries({ queryKey: ['salaried-employees-list'] });
    },
    onError: () => {
      toast.error('Не удалось сохранить');
    },
  });

  const dirtyUsers = useMemo(() => {
    const out: string[] = [];
    for (const r of rows) {
      const was = r.applies_official_payroll;
      const now = local[r.user_id];
      if (now !== undefined && now !== was) out.push(r.user_id);
    }
    return out;
  }, [rows, local]);

  /** API не отдаёт branch_id — группируем по названию филиала (как на бэкенде в ORDER BY). */
  const groupedByBranch = useMemo(() => {
    const byKey = new Map<string, { branchKey: string; branchLabel: string; rows: AssignmentRow[] }>();
    for (const r of rows) {
      const label = String(r.branch_name ?? '').trim() || '—';
      const key = label.toLocaleLowerCase('ru-RU');
      let bucket = byKey.get(key);
      if (!bucket) {
        bucket = { branchKey: key, branchLabel: label, rows: [] };
        byKey.set(key, bucket);
      }
      bucket.rows.push(r);
    }
    const branches = [...byKey.values()].sort((a, b) =>
      a.branchLabel.localeCompare(b.branchLabel, 'ru-RU', { sensitivity: 'base' }),
    );
    for (const b of branches) {
      b.rows.sort((x, y) =>
        String(x.name ?? '').localeCompare(String(y.name ?? ''), 'ru-RU', { sensitivity: 'base' }),
      );
    }
    return branches;
  }, [rows]);

  const selectedBranchGroup = useMemo(() => {
    if (!selectedBranchKey) return null;
    return groupedByBranch.find((g) => g.branchKey === selectedBranchKey) ?? null;
  }, [groupedByBranch, selectedBranchKey]);

  /** Сошлись на шаг списка сотрудников, если ключ устарел после обновления данных. */
  useEffect(() => {
    if (viewStep !== 'employees' || !selectedBranchKey) return;
    if (!groupedByBranch.some((g) => g.branchKey === selectedBranchKey)) {
      setViewStep('branches');
      setSelectedBranchKey(null);
    }
  }, [viewStep, selectedBranchKey, groupedByBranch]);

  const discardLocalEdits = useCallback(() => {
    if (!rows.length) {
      setLocal({});
      return;
    }
    const next: Record<string, boolean> = {};
    for (const r of rows) {
      next[r.user_id] = r.applies_official_payroll;
    }
    setLocal(next);
  }, [rows]);

  const handleDialogOpenChange = (v: boolean) => {
    if (!v) {
      discardLocalEdits();
      void refetch();
    }
    onOpenChange(v);
  };

  const [saving, setSaving] = useState(false);

  const saveAll = async () => {
    if (!activeRole || !dirtyUsers.length) return;
    setSaving(true);
    try {
      for (const uid of dirtyUsers) {
        await patch.mutateAsync({ user_id: uid, uses_official_payroll: !!local[uid] });
      }
      toast.success('Сохранено');
      handleDialogOpenChange(false);
    } catch {
      // toast in mutation
    } finally {
      setSaving(false);
    }
  };

  const saveDisabled =
    saving || patch.isPending || dirtyUsers.length === 0 || isLoading || isError || rows.length === 0;

  return (
    <Dialog open={open} onOpenChange={handleDialogOpenChange}>
      <DialogContent
        aria-describedby={undefined}
        className="sm:max-w-lg gap-2 border-white/10 bg-zinc-950 text-white md:gap-2"
      >
        <DialogHeader className="space-y-0 pb-0">
          <DialogTitle className="flex items-center gap-2 text-lg font-black tracking-tight">
            <Users className="h-5 w-5 text-emerald-500" />
            Управление: {title}
          </DialogTitle>
        </DialogHeader>

        {isError && (
          <p className="text-sm text-red-400">Не удалось загрузить список. Проверьте права и сеть.</p>
        )}

        {isLoading ? (
          <div className="space-y-2 py-1">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-14 w-full rounded-xl bg-white/5" />
            ))}
          </div>
        ) : rows.length === 0 || groupedByBranch.length === 0 ? (
          <p className="text-sm text-white/40 py-2 text-center">
            Нет активных сотрудников с этой ролью — филиалы для выбора отсутствуют.
          </p>
        ) : viewStep === 'branches' ? (
          <ScrollArea className="max-h-[min(52vh,420px)] pr-3 -mr-1">
            <div className="space-y-2.5 pb-1">
              {groupedByBranch.map(({ branchKey, branchLabel, rows: branchRows }) => {
                const n = branchRows.length;
                return (
                  <button
                    key={branchKey}
                    type="button"
                    aria-label={`${branchLabel}, ${n} ${employeesWord(n)}`}
                    onClick={() => {
                      setSelectedBranchKey(branchKey);
                      setViewStep('employees');
                    }}
                    className="w-full flex items-center gap-3 rounded-xl border border-white/[0.08] bg-zinc-900/40 hover:bg-zinc-900/60 hover:border-white/15 transition-colors text-left px-3.5 py-3.5 min-h-[3rem] active:scale-[0.99]"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{branchLabel}</p>
                    </div>
                    <span
                      className="shrink-0 inline-flex items-center justify-center min-w-7 h-7 rounded-full bg-white/[0.06] border border-white/10 text-[11px] font-black text-white/80"
                      title={`${n} ${employeesWord(n)}`}
                    >
                      {n}
                    </span>
                    <ChevronRight className="h-4 w-4 text-white/35 shrink-0" aria-hidden />
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        ) : (
          <>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3 -mt-1">
              <Button
                type="button"
                variant="ghost"
                className="w-full sm:w-auto justify-start px-2 -ml-2 h-10 text-white/70 hover:text-white hover:bg-white/5 font-semibold"
                onClick={() => {
                  setViewStep('branches');
                  setSelectedBranchKey(null);
                }}
              >
                ← Филиалы
              </Button>
              {selectedBranchGroup ? (
                <p className="text-sm font-black text-white truncate sm:text-right sm:max-w-[60%]">
                  {selectedBranchGroup.branchLabel}
                </p>
              ) : null}
            </div>
            <ScrollArea className="max-h-[min(48vh,380px)] pr-3 -mr-1">
              {selectedBranchGroup && selectedBranchGroup.rows.length > 0 ? (
                <ul className="space-y-2 pt-1">
                  {selectedBranchGroup.rows.map((r) => {
                    const checked = local[r.user_id] ?? r.applies_official_payroll;
                    return (
                      <li
                        key={r.user_id}
                        className="flex gap-3 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2.5 items-start"
                      >
                        <Checkbox
                          id={`official-${r.user_id}`}
                          checked={checked}
                          onCheckedChange={(v) => {
                            setLocal((prev) => ({ ...prev, [r.user_id]: v === true }));
                          }}
                          className="mt-0.5 border-white/25 data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
                        />
                        <Label
                          htmlFor={`official-${r.user_id}`}
                          className="min-w-0 flex-1 text-sm font-medium text-white cursor-pointer leading-snug"
                        >
                          {r.name}
                        </Label>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-white/40 py-8 text-center">
                  В этом филиале нет сотрудников с этой ролью.
                </p>
              )}
            </ScrollArea>
          </>
        )}

        <div className="pt-2 flex gap-3">
          <Button
            type="button"
            variant="ghost"
            className="flex-1 border border-white/10 hover:bg-white/5 text-white font-black uppercase tracking-wider text-xs h-11"
            disabled={saving || patch.isPending}
            onClick={() => handleDialogOpenChange(false)}
          >
            Отмена
          </Button>
          <Button
            type="button"
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-500/20 font-black uppercase tracking-wider text-xs h-11 disabled:opacity-50"
            disabled={saveDisabled}
            onClick={() => void saveAll()}
          >
            {saving || patch.isPending ? 'Сохранение…' : 'Сохранить'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
