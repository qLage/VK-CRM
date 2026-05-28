import { useEffect, useState } from 'react';
import { Save, Wallet, Percent } from 'lucide-react';
import { localAPI } from '@/integrations/localAPI';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { formatInteger } from '@/utils/formatters';
import { RolePayrollManagementDialog, type PayrollAssignmentRole } from './RolePayrollManagementDialog';

const pctFields = [
  ['ndfl_percent', '% НДФЛ (удержание)', 'например 13'],
  ['advance_percent', '% аванса от оклада (брутто)', 'доля месячного оклада'],
  ['insurance_percent', '% страховых взносов (от оклада)', 'расход компании'],
  ['self_employed_tax_percent', '% налога самозанятого', 'например 6'],
] as const;

/** Поля запроса (ключи только в теле PATCH); подписи в интерфейсе — по-русски. */
const okladByRoleRows = [
  ['base_salary_sales_manager', 'МОП', 'sales_manager'],
  ['base_salary_head_sales', 'РОП', 'head_sales'],
  ['base_salary_commercial', 'КОММЕРЧЕСКИЙ ДИРЕКТОР', 'commercial'],
] as const;

export function SalariesSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [manageRole, setManageRole] = useState<PayrollAssignmentRole | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [form, setForm] = useState({
    ndfl_percent: 13,
    advance_percent: 40,
    insurance_percent: 30,
    self_employed_tax_percent: 6,
    base_salary_sales_manager: 0,
    base_salary_head_sales: 0,
    base_salary_commercial: 0,
  });

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data, error } = await localAPI.request('/finances/payroll-org-settings');
        if (error) throw error;
        if (data && typeof data === 'object') {
          const d = data as Record<string, unknown>;
          const cat = d.role_base_display as
            | { base_salary_sales_manager?: number; base_salary_head_sales?: number; base_salary_commercial?: number }
            | undefined;
          const num = (v: unknown): number | undefined => {
            if (typeof v === 'number' && Number.isFinite(v)) return v;
            if (typeof v === 'string' && v.trim() !== '') {
              const x = parseFloat(v.replace(',', '.'));
              return Number.isFinite(x) ? x : undefined;
            }
            return undefined;
          };
          setForm((prev) => ({
            ...prev,
            ndfl_percent: num(d.ndfl_percent) ?? prev.ndfl_percent,
            advance_percent: num(d.advance_percent) ?? prev.advance_percent,
            insurance_percent: num(d.insurance_percent) ?? prev.insurance_percent,
            self_employed_tax_percent: num(d.self_employed_tax_percent) ?? prev.self_employed_tax_percent,
            base_salary_sales_manager:
              num(d.base_salary_sales_manager) ??
              (cat?.base_salary_sales_manager != null ? cat.base_salary_sales_manager : prev.base_salary_sales_manager),
            base_salary_head_sales:
              num(d.base_salary_head_sales) ??
              (cat?.base_salary_head_sales != null ? cat.base_salary_head_sales : prev.base_salary_head_sales),
            base_salary_commercial:
              num(d.base_salary_commercial) ??
              (cat?.base_salary_commercial != null ? cat.base_salary_commercial : prev.base_salary_commercial),
          }));
        }
      } catch {
        toast.error('Не удалось загрузить настройки зарплат');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const { error } = await localAPI.request('/finances/payroll-org-settings', {
        method: 'PATCH',
        body: {
          ndfl_percent: form.ndfl_percent,
          advance_percent: form.advance_percent,
          insurance_percent: form.insurance_percent,
          self_employed_tax_percent: form.self_employed_tax_percent,
          base_salary_sales_manager: form.base_salary_sales_manager,
          base_salary_head_sales: form.base_salary_head_sales,
          base_salary_commercial: form.base_salary_commercial,
        },
      });
      if (error) throw error;
      toast.success('Зарплаты: настройки сохранены');
    } catch {
      toast.error('Ошибка сохранения');
    } finally {
      setSaving(false);
    }
  };

  const introCard = (
    <div className="flex items-start gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-6">
      <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3">
        <Wallet className="h-7 w-7 text-amber-400" />
      </div>
      <div>
        <h3 className="text-lg font-black text-white uppercase tracking-tight">Организация — удержания</h3>
        <p className="text-xs font-bold uppercase tracking-wide text-white/40 flex items-center gap-2 mt-1">
          <Percent className="h-3 w-3" /> Проценты для выплат по окладу (Финансы → расчёт)
        </p>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="space-y-8 max-w-4xl xl:max-w-5xl min-h-[520px]" aria-busy="true">
        <div className="flex items-start gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-6 animate-pulse">
          <Skeleton className="h-[52px] w-[52px] rounded-xl shrink-0" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-x-8 gap-y-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-2 flex flex-col min-h-[88px]">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-10 w-full rounded-md" />
              <Skeleton className="h-3 w-full max-w-[12rem]" />
            </div>
          ))}
        </div>
        <div className="h-px bg-white/5" />
        <div className="space-y-5 min-h-[200px]">
          <Skeleton className="h-3 w-48" />
          <Skeleton className="h-3 w-full max-w-lg" />
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-2 min-h-[72px]">
              <Skeleton className="h-3 w-40" />
              <Skeleton className="h-10 w-full rounded-md" />
            </div>
          ))}
        </div>
        <Skeleton className="h-11 w-40 rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-4xl xl:max-w-5xl min-h-[520px]">
      <RolePayrollManagementDialog
        role={manageRole}
        open={manageOpen}
        onOpenChange={(v) => {
          setManageOpen(v);
          if (!v) setManageRole(null);
        }}
      />
      {introCard}

      <div className="space-y-5">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-x-8 gap-y-6 items-start [grid-template-columns:repeat(auto-fit,minmax(13rem,1fr))]">
          {pctFields.map(([key, title, hint]) => (
            <div
              key={key}
              className="grid grid-rows-[auto_auto_minmax(2.5rem,auto)] gap-2 w-full min-w-0"
            >
              <Label className="text-[10px] sm:text-[11px] font-black uppercase tracking-tight text-white/35 leading-none self-start whitespace-nowrap">
                {title}
              </Label>
              <Input
                type="number"
                min={0}
                max={100}
                step={0.01}
                className="bg-zinc-950 border-white/10 w-full"
                value={form[key as keyof typeof form] as unknown as number}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    [key]: parseFloat(e.target.value.replace(',', '.')) || 0,
                  }))
                }
              />
              <p className="text-xs text-white/35 leading-snug self-start">{hint}</p>
            </div>
          ))}
        </div>

        <div className="h-px bg-white/5 shrink-0" />

        <div className="space-y-5">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-white/30">Базовый месячный оклад по роли</p>
            <p className="text-xs text-white/35 mt-2 leading-snug">
              Значение в рублях для каждой руководящей позиции. Если указано{' '}
              <span className="text-white/55 tabular-nums">0</span>, используется оклад из справочника должностей.
            </p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-x-8 gap-y-6 items-start [grid-template-columns:repeat(auto-fit,minmax(12rem,1fr))]">
            {okladByRoleRows.map(([key, title, payrollRole]) => (
              <div key={key} className="flex flex-col gap-2 min-w-0">
                <Label className="text-[10px] sm:text-[11px] font-black uppercase tracking-tight text-white/35 min-h-[1.25rem] flex items-center leading-none whitespace-nowrap">
                  {title}
                </Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  placeholder="40 000"
                  className="bg-zinc-950 border-white/10 w-full tabular-nums"
                  value={
                    (form[key as keyof typeof form] as number)
                      ? formatInteger(form[key as keyof typeof form] as number)
                      : ''
                  }
                  onChange={(e) => {
                    const raw = e.target.value.replace(/[^0-9]/g, '');
                    setForm((f) => ({
                      ...f,
                      [key]: Number(raw) || 0,
                    }));
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  className="w-full rounded-xl border-white/15 bg-white/[0.02] text-white text-[10px] font-black uppercase tracking-wide h-9 hover:bg-white/[0.06]"
                  onClick={() => {
                    setManageRole(payrollRole);
                    setManageOpen(true);
                  }}
                >
                  Управление
                </Button>
              </div>
            ))}
          </div>
        </div>

        <Button
          disabled={saving}
          className="w-fit rounded-2xl h-11 px-8 font-black uppercase tracking-wide gradient-accent shadow-lg shadow-primary/20"
          onClick={() => save()}
        >
          <Save className="h-4 w-4 mr-2" /> Сохранить
        </Button>
      </div>
    </div>
  );
}
