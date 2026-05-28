import React, { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Landmark, Wallet } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { localAPI } from '@/integrations/localAPI';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

type PayrollPaid = {
  advance?: boolean;
  remainder?: boolean;
  ndfl_budget_1?: boolean;
  ndfl_budget_2?: boolean;
  insurance_contributions?: boolean;
  self_employed_tax?: boolean;
};

type PayrollAmounts = {
  oklad_brutto: number;
  advance_brutto: number;
  ndfl_on_advance: number;
  net_advance_to_employee: number;
  remainder_brutto: number;
  ndfl_on_remainder: number;
  net_remainder_to_employee: number;
  self_employed_tax_amount: number;
  ndfl_budget_1_from_advance: number;
  ndfl_budget_2_from_remainder: number;
  insurance_company_cost: number;
};

/** Строгий порядок отображения и проведений (совпадает с backend PAYROLL_PAYOUT_SEQUENCE). */
const ACTIONS = [
  { key: 'advance', title: 'Аванс' },
  { key: 'ndfl_budget_1', title: 'НДФЛ 1' },
  { key: 'remainder', title: 'Остаток зарплаты' },
  { key: 'self_employed_tax', title: 'Налог самозанятого' },
  { key: 'ndfl_budget_2', title: 'НДФЛ 2' },
  { key: 'insurance_contributions', title: 'Страховые взносы' },
] as const;

type ActionKey = (typeof ACTIONS)[number]['key'];

type PayrollOrg = {
  ndfl_percent: number;
  advance_percent: number;
  insurance_percent: number;
  self_employed_tax_percent: number;
  base_salary_sales_manager: number;
  base_salary_head_sales: number;
  base_salary_commercial: number;
};

type PayrollPreview = {
  period_label?: string;
  payroll_year: number;
  payroll_month: number;
  oklad_effective?: number;
  payroll_org?: PayrollOrg;
  amounts: PayrollAmounts;
  paid: PayrollPaid;
  step_done?: PayrollPaid;
  next_allowed_action?: string | null;
  sequence_locked?: Partial<Record<ActionKey, string>>;
  hints?: { ndfl_budget_1_subtitle?: string; ndfl_budget_2_subtitle?: string };
  accrual_period?: { year: number; month: number };
};

function fmtRub(n: number) {
  return `${Math.round(Number(n) || 0).toLocaleString('ru-RU')} ₽`;
}

function debitRub(key: ActionKey, amt: PayrollAmounts): number {
  switch (key) {
    case 'advance':
      return amt.net_advance_to_employee;
    case 'remainder':
      return amt.net_remainder_to_employee;
    case 'self_employed_tax':
      return amt.self_employed_tax_amount;
    case 'ndfl_budget_1':
      return amt.ndfl_budget_1_from_advance;
    case 'ndfl_budget_2':
      return amt.ndfl_budget_2_from_remainder;
    case 'insurance_contributions':
      return amt.insurance_company_cost;
    default:
      return 0;
  }
}

function breakdownLine(key: ActionKey, amt: PayrollAmounts): string {
  switch (key) {
    case 'advance':
      return `На руки ${fmtRub(amt.net_advance_to_employee)} · брутто ${fmtRub(amt.advance_brutto)} · НДФЛ ${fmtRub(amt.ndfl_on_advance)}`;
    case 'remainder':
      return `На руки ${fmtRub(amt.net_remainder_to_employee)} · брутто ${fmtRub(amt.remainder_brutto)} · НДФЛ ${fmtRub(amt.ndfl_on_remainder)}`;
    case 'self_employed_tax':
      return `Удержание с остатка зарплаты (${fmtRub(amt.self_employed_tax_amount)})`;
    case 'ndfl_budget_1':
      return `НДФЛ, удержанный с аванса (${fmtRub(amt.ndfl_budget_1_from_advance)})`;
    case 'ndfl_budget_2':
      return `НДФЛ с остатка оклада (${fmtRub(amt.ndfl_budget_2_from_remainder)})`;
    case 'insurance_contributions':
      return `От брутто-оклада ${fmtRub(amt.oklad_brutto)}`;
    default:
      return '';
  }
}

function PayrollActionSkeleton() {
  return (
    <div className="min-h-[120px] rounded-xl border border-white/10 bg-white/[0.04] p-4 flex flex-col gap-3 animate-pulse">
      <div className="h-4 w-40 bg-white/10 rounded" />
      <div className="h-8 w-48 bg-white/10 rounded tabular-nums" />
      <div className="h-4 w-full max-w-sm bg-white/5 rounded" />
      <div className="mt-auto h-11 w-full bg-white/10 rounded-xl" />
    </div>
  );
}

export interface SalaryPayrollFlowDialogProps {
  userId: string;
  employeeName: string;
  payrollYear: number;
  payrollMonth: number;
  okladDisplayed: number;
  trigger?: React.ReactNode;
}

export function SalaryPayrollFlowDialog({
  userId,
  employeeName,
  payrollYear,
  payrollMonth,
  okladDisplayed,
  trigger,
}: SalaryPayrollFlowDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [accountType, setAccountType] = React.useState<'cash' | 'account'>('cash');
  const [applySelfEmployedTax, setApplySelfEmployedTax] = React.useState(true);
  const queryClient = useQueryClient();

  const { data: preview, isLoading, isError, refetch } = useQuery({
    queryKey: ['payroll-preview', userId, payrollYear, payrollMonth, applySelfEmployedTax],
    enabled: open,
    queryFn: async (): Promise<PayrollPreview | null> => {
      const { data, error } = await localAPI.request(
        `/finances/payroll-preview?user_id=${encodeURIComponent(userId)}&year=${payrollYear}&month=${payrollMonth}&apply_self_employed_tax=${applySelfEmployedTax}`,
      );
      if (error) throw error;
      return data as PayrollPreview;
    },
  });

  const amt = preview?.amounts;
  const pk = preview?.step_done ?? preview?.paid;

  const mutation = useMutation({
    mutationFn: async (action: string) => {
      const { error } = await localAPI.request('/finances/payroll-payout', {
        method: 'POST',
        body: {
          user_id: userId,
          payroll_year: payrollYear,
          payroll_month: payrollMonth,
          account_type: accountType,
          action,
          apply_self_employed_tax: applySelfEmployedTax,
        },
      });
      if (error) throw error as Error;
    },
    onSuccess: () => {
      toast.success('Проводка создана');
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['finance-stats'] });
      queryClient.invalidateQueries({ queryKey: ['payroll-preview', userId, payrollYear, payrollMonth] });
      queryClient.invalidateQueries({ queryKey: ['salaried-employees-list'] });
    },
    onError: (e: unknown) => {
      const msg =
        typeof e === 'object' &&
        e &&
        typeof (e as Error).message === 'string'
          ? (e as Error).message
          : 'Не удалось создать проводку';
      toast.error(msg);
    },
  });

  const blockReason = useMemo(() => {
    if (!amt) return null;
    const zeroOklad = (preview?.oklad_effective ?? amt.oklad_brutto) <= 0;
    if (zeroOklad) return 'Нет действующего оклада за период — проверьте должность и настройки зарплат.';
    return null;
  }, [amt, preview?.oklad_effective]);

  const allPaid =
    !!pk &&
    !!pk.advance &&
    !!pk.remainder &&
    !!pk.ndfl_budget_1 &&
    !!pk.ndfl_budget_2 &&
    !!pk.insurance_contributions &&
    !!pk.self_employed_tax;

  function resolveRow(key: ActionKey): { disabled: boolean; reason: string | null } {
    if (mutation.isPending) return { disabled: true, reason: null };
    const paid = !!pk?.[key as keyof PayrollPaid];
    if (paid) return { disabled: false, reason: null };

    if (!amt) {
      return { disabled: true, reason: isError ? 'Не удалось загрузить расчёт.' : 'Загрузка расчёта…' };
    }

    if (blockReason) return { disabled: true, reason: blockReason };

    const seqReason = preview?.sequence_locked?.[key];
    if (seqReason) return { disabled: true, reason: seqReason };

    const rubAmt = debitRub(key, amt);

    if (rubAmt <= 0) {
      if (key === 'advance') return { disabled: true, reason: 'Сумма аванса «на руки» не положительна — проверьте % аванса и оклад.' };
      if (key === 'remainder') return { disabled: true, reason: 'Остаток «на руки» не положителен — возможно, не хватает данных по авансу.' };
      if (key === 'ndfl_budget_1') return { disabled: true, reason: 'НДФЛ с аванса не положителен — проверьте оклад и ставку НДФЛ.' };
      if (key === 'ndfl_budget_2') return { disabled: true, reason: 'НДФЛ с остатка не положителен.' };
      if (key === 'self_employed_tax') return { disabled: true, reason: 'Налог самозанятого не положителен — проверьте % в Настройки → Зарплаты.' };
      if (key === 'insurance_contributions') return { disabled: true, reason: 'Проверьте % страховых взносов в Настройки → Зарплаты.' };
    }

    return { disabled: false, reason: null };
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:rounded-[28px] max-w-[92vw] sm:max-w-lg border-white/10 bg-gradient-to-br from-zinc-950 to-zinc-900">
        <DialogHeader className="space-y-1">
          <DialogTitle className="text-xl font-black text-white tracking-tight">Выплатить оклад</DialogTitle>
          <DialogDescription className="text-white/70 text-sm leading-relaxed space-y-1">
            <span className="block font-semibold text-white text-base">{employeeName}</span>
            <span className="block text-sm text-white/55">
              Период{' '}
              <span className="tabular-nums font-medium text-white/80">{preview?.period_label || `${payrollMonth}.${payrollYear}`}</span>
              {' · '}оклад по графику{' '}
              <span className="tabular-nums font-semibold text-white">{fmtRub(okladDisplayed)}</span>
            </span>
            {amt && preview?.oklad_effective != null && preview.oklad_effective !== okladDisplayed && (
              <span className="block text-sm text-amber-200/90">
                Расчёт по фактическому окладу: <span className="tabular-nums font-semibold">{fmtRub(preview.oklad_effective)}</span>
              </span>
            )}
            <p className="text-xs text-amber-200/85 leading-snug rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2 mt-2">
              Один расчётный месяц: аванс (на руки) → бюджетный НДФЛ 1 (удержано с выплаченного аванса) → остаток на руки → налог самозанятого → НДФЛ 2 (с остатка) → страховые взносы.
              Дальнейшие шаги недоступны, пока не проведены предыдущие.
            </p>
            {allPaid && (
              <Badge className="mt-2 bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">Всё выплачено</Badge>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <Tabs value={accountType} onValueChange={(v) => setAccountType(v as 'cash' | 'account')}>
            <TabsList className="h-11 bg-white/5 border border-white/10 rounded-xl p-1 w-full justify-start gap-1">
              <TabsTrigger value="cash" className="rounded-lg data-[state=active]:bg-primary font-bold text-sm">
                Наличные
              </TabsTrigger>
              <TabsTrigger value="account" className="rounded-lg data-[state=active]:bg-primary font-bold flex items-center gap-1 text-sm">
                <Landmark className="h-3.5 w-3.5" /> Р/счёт
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
            <Checkbox
              id="apply-self-employed-tax"
              checked={applySelfEmployedTax}
              onCheckedChange={(v) => setApplySelfEmployedTax(v === true)}
            />
            <Label htmlFor="apply-self-employed-tax" className="text-sm text-white/80 font-medium cursor-pointer">
              Удержать налог самозанятого ({preview?.payroll_org?.self_employed_tax_percent ?? 6}%)
            </Label>
          </div>

          <p className="text-sm text-white/55 leading-snug">
            Суммы ниже — списание с выбранного счёта по проводке (как в финансовом учёте). Личный доход сотрудника по авансу и остатку —
            суммы «на руки».
          </p>

          {isError && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100 flex flex-col sm:flex-row sm:items-center gap-3">
              <span>Не удалось получить расчёт выплат за период.</span>
              <Button type="button" size="sm" variant="secondary" className="shrink-0" onClick={() => refetch()}>
                Повторить
              </Button>
            </div>
          )}

          <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
            {isLoading ? (
              <>
                <PayrollActionSkeleton />
                <PayrollActionSkeleton />
                <PayrollActionSkeleton />
                <PayrollActionSkeleton />
                <PayrollActionSkeleton />
                <PayrollActionSkeleton />
              </>
            ) : (
              ACTIONS.map(({ key, title }) => {
                const paid = !!pk?.[key as keyof PayrollPaid];
                const subtitle =
                  key === 'ndfl_budget_1'
                    ? preview?.hints?.ndfl_budget_1_subtitle
                    : key === 'ndfl_budget_2'
                      ? preview?.hints?.ndfl_budget_2_subtitle
                      : undefined;

                const { disabled, reason } = resolveRow(key);
                const rubAmt = amt ? debitRub(key, amt) : 0;
                const showAmount = !!amt;
                const actionButtonLabel = paid ? 'Готово' : 'ВЫПЛАТИТЬ';
                const payBlocked = !paid && disabled;

                return (
                  <div
                    key={key}
                    className={`flex min-h-[120px] flex-col gap-3 rounded-xl border p-4 ${
                      paid ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-white/10 bg-white/[0.04]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 space-y-1">
                        <p className={`text-base font-bold tracking-tight ${paid ? 'text-emerald-300' : 'text-white'}`}>
                          {title}
                          {paid && (
                            <span className="ml-2 text-xs font-semibold uppercase tracking-wide text-emerald-400/90">Выплачено</span>
                          )}
                        </p>
                        {subtitle && <p className="text-sm text-white/50 leading-snug">{subtitle}</p>}
                      </div>
                    </div>

                    {showAmount && (
                      <div className="space-y-1">
                        <p className="text-2xl font-bold tabular-nums tracking-tight text-white leading-none">{fmtRub(rubAmt)}</p>
                        <p className="text-sm text-white/50 leading-snug">{breakdownLine(key, amt!)}</p>
                      </div>
                    )}

                    {payBlocked && reason && (
                      <p className="text-sm text-amber-200/90 leading-snug rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2">
                        {reason}
                      </p>
                    )}

                    <div className="mt-auto">
                      <Button
                        size="sm"
                        type="button"
                        disabled={payBlocked || (mutation.isPending && !paid)}
                        onClick={() => {
                          if (paid) return;
                          if (!payBlocked) mutation.mutate(key);
                        }}
                        className={
                          paid
                            ? 'w-full justify-center rounded-xl font-black uppercase tracking-wide gap-2 h-11 shrink-0 text-[10px] border border-emerald-500/25 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15 hover:text-emerald-200 shadow-none cursor-default'
                            : 'w-full justify-center rounded-xl font-black uppercase tracking-wide gap-2 h-11 shrink-0 text-[10px] border-none bg-emerald-600 text-white hover:bg-emerald-500 shadow-md shadow-emerald-950/35'
                        }
                      >
                        {!paid && <Wallet className="h-3.5 w-3.5 shrink-0 opacity-95" />}
                        <span className="truncate">{actionButtonLabel}</span>
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
