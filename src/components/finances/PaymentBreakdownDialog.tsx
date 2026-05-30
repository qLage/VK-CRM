import React, { useState, useEffect, useRef } from 'react';
import { Wallet, Loader2, CreditCard, Pencil, Check, X, CheckCircle2, List } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { useFinances } from '@/hooks/useFinances';
import { SalaryPayrollFlowDialog } from './SalaryPayrollFlowDialog';
import { PersonalIncomeDetailDialog } from './PersonalIncomeDetailDialog';
import { formatInteger } from '@/utils/formatters';

interface SalaryComponent {
  id: string;
  label: string;
  amount: number;
  color: string;
}

interface PaymentBreakdownDialogProps {
  employee: {
    id: string;
    full_name: string;
    base_salary: number;
    personal_income: number;
    mortgage_income?: number;
    mortgage_agent_income?: number;
    mortgage_broker_income?: number;
    team_revenue: number;
    department_revenue: number;
    total_salary: number;
    commission: number;
    /** false = lump «оклад» (salary expense); true = stepped payroll dialog */
    uses_official_payroll?: boolean;
  };
  payrollYear?: number;
  payrollMonth?: number;
  onPaymentComplete: (data: any) => void;
  isProcessing: boolean;
  trigger?: React.ReactNode;
}

export function PaymentBreakdownDialog({
  employee,
  payrollYear,
  payrollMonth,
  onPaymentComplete,
  isProcessing,
  trigger
}: PaymentBreakdownDialogProps) {
  const py = payrollYear ?? new Date().getFullYear();
  const pm = payrollMonth ?? (new Date().getMonth() + 1);
  const usesOfficialPayroll = employee.uses_official_payroll === true;
  const [open, setOpen] = useState(false);
  const [accountType, setAccountType] = useState<'cash' | 'account'>('cash');
  const [components, setComponents] = useState<SalaryComponent[]>([]);
  const [editedAmounts, setEditedAmounts] = useState<Record<string, number>>({});
  const [editingComponent, setEditingComponent] = useState<string | null>(null);
  const [tempEditValue, setTempEditValue] = useState<string>('');
  const [paidComponents, setPaidComponents] = useState<Set<string>>(new Set());
  const [personalIncomeOpen, setPersonalIncomeOpen] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);
  const [departmentOpen, setDepartmentOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { transactions } = useFinances();

  const payrollBracket = `[payroll:${py}-${String(pm).padStart(2, '0')}`;
  const employeeExpenseTx = transactions.filter(
    (tx) => tx.user_id === employee.id && tx.type === 'expense'
  );

  useEffect(() => {
    const initialComponents: SalaryComponent[] = [];

    if (employee.base_salary > 0) {
      initialComponents.push({
        id: 'base_salary',
        label: 'ОКЛАД',
        amount: employee.base_salary,
        color: 'text-cyan-400',
      });
    }

    // Always show personal income (even 0) so user sees what is credited
    initialComponents.push({
      id: 'personal_income',
      label: 'Личный доход',
      amount: employee.personal_income || 0,
      color: 'text-emerald-400'
    });

    if (employee.team_revenue > 0) {
      initialComponents.push({
        id: 'team_revenue',
        label: 'Команда (МОП)',
        amount: employee.team_revenue,
        color: 'text-blue-400',
      });
    }

    if (employee.department_revenue > 0) {
      initialComponents.push({
        id: 'department_revenue',
        label: 'РОП / филиал',
        amount: employee.department_revenue,
        color: 'text-purple-400',
      });
    }

    setComponents(initialComponents);
  }, [employee]);

  useEffect(() => {
    if (open) {
      setEditedAmounts({});
      setEditingComponent(null);

      const periodMonthName = format(new Date(py, pm - 1, 1), 'LLLL', { locale: ru });

      // Check which components have already been paid this month
      const employeeExpenseTx = transactions.filter(
        (tx) =>
          tx.user_id === employee.id &&
          tx.type === 'expense'
      );

      const employeeTransactions = employeeExpenseTx.filter(
        (tx) => tx.category === 'salary' && tx.description.includes(periodMonthName)
      );

      const paid = new Set<string>();
      const paidAmounts: Record<string, number> = {};

      const parseAmountFromDesc = (desc: string, label: string): number => {
        const regex = new RegExp(`${label}:\\s*([\\d\\s]+)\\s*₽`);
        const match = desc.match(regex);
        if (match) {
          return parseInt(match[1].replace(/\s/g, ''), 10) || 0;
        }
        return 0;
      };

      employeeTransactions.forEach(tx => {
        const labels = [
          { label: 'Оклад', id: 'base_salary' },
          { label: 'Личный доход', id: 'personal_income' },
          { label: 'Ипотечная услуга', id: 'mortgage_income' },
          { label: 'Команда (МОП)', id: 'team_revenue' },
          { label: 'РОП / филиал', id: 'department_revenue' },
          { label: 'Комиссия команды', id: 'department_revenue' },
          { label: 'Комиссия', id: 'commission' },
          { label: 'Ипотека', id: 'team_revenue' },
        ];
        labels.forEach(({ label, id }) => {
          if (tx.description.includes(`${label}:`)) {
            const amount = parseAmountFromDesc(tx.description, label);
            if (amount > 0) {
              paidAmounts[id] = (paidAmounts[id] || 0) + amount;
            }
          }
        });
      });

      const componentAmounts: Record<string, number> = {
        base_salary: employee.base_salary,
        personal_income: employee.personal_income,
        mortgage_income: (employee.mortgage_income ?? 0),
        team_revenue: employee.team_revenue,
        department_revenue: employee.department_revenue,
        commission: employee.commission,
      };

      Object.entries(paidAmounts).forEach(([id, paidAmt]) => {
        const target = editedAmounts[id] ?? componentAmounts[id] ?? 0;
        if (paidAmt >= target && target > 0) {
          paid.add(id);
        }
      });

      let okladAdvanceRecorded = false;
      let okladRemainderRecorded = false;
      employeeExpenseTx.forEach((tx) => {
        if (!tx.description?.includes(payrollBracket)) return;
        if (tx.category === 'salary_advance_net') okladAdvanceRecorded = true;
        if (tx.category === 'salary_remainder_net') okladRemainderRecorded = true;
      });
      if (usesOfficialPayroll && okladAdvanceRecorded && okladRemainderRecorded) {
        paid.add('base_salary');
      }

      setPaidComponents(paid);
    }
  }, [open, transactions, employee.id, py, pm, usesOfficialPayroll, editedAmounts]);

  useEffect(() => {
    if (editingComponent && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingComponent]);

  const getComponentAmount = (component: SalaryComponent) => {
    return editedAmounts[component.id] ?? component.amount;
  };

  const handleStartEdit = (componentId: string) => {
    const component = components.find((c) => c.id === componentId);
    if (component) {
      setEditingComponent(componentId);
      const rounded = Math.round(Math.max(0, getComponentAmount(component)));
      setTempEditValue(rounded === 0 ? '' : String(rounded));
    }
  };

  const handleSaveEdit = (componentId: string) => {
    const numValue = Number(tempEditValue.replace(/[^0-9]/g, '')) || 0;
    if (numValue >= 0) {
      setEditedAmounts(prev => ({ ...prev, [componentId]: numValue }));
    }
    setEditingComponent(null);
    setTempEditValue('');
  };

  const handleCancelEdit = () => {
    setEditingComponent(null);
    setTempEditValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent, componentId: string) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveEdit(componentId);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancelEdit();
    }
  };

  const handlePayFlatOklad = () => {
    const base = components.find((c) => c.id === 'base_salary');
    if (!base) return;
    const amount = getComponentAmount(base);
    if (amount <= 0 || paidComponents.has('base_salary')) return;

    const periodMonthName = format(new Date(py, pm - 1, 1), 'LLLL', { locale: ru });
    const description = `Выплата за ${periodMonthName} — ${employee.full_name} (ОКЛАД: ${amount.toLocaleString('ru-RU')} ₽)`;

    onPaymentComplete({
      type: 'expense',
      category: 'salary',
      description,
      amount,
      account_type: accountType,
      related_user_id: employee.id,
    });

    setPaidComponents((prev) => new Set(prev).add('base_salary'));
  };

  const handlePayComponent = (component: SalaryComponent) => {
    const amount = getComponentAmount(component);
    if (amount <= 0 || paidComponents.has(component.id) || component.id === 'base_salary') return;

    const currentMonthName = format(new Date(), 'LLLL', { locale: ru });
    const description = `Выплата за ${currentMonthName} — ${employee.full_name} (${component.label}: ${amount.toLocaleString('ru-RU')} ₽)`;

    onPaymentComplete({
      type: 'expense',
      category: 'salary',
      description,
      amount,
      account_type: accountType,
      related_user_id: employee.id,
    });

    // Mark component as paid
    setPaidComponents(prev => new Set(prev).add(component.id));
    setOpen(false);
  };

  const calculateTotal = () => {
    return components
      .filter((c) => !paidComponents.has(c.id) && c.id !== 'base_salary')
      .reduce((sum, c) => sum + getComponentAmount(c), 0);
  };

  const handlePayAll = () => {
    const unpaidComponents = components.filter((c) => !paidComponents.has(c.id) && c.id !== 'base_salary');
    if (unpaidComponents.length === 0) {
      setOpen(false);
      return;
    }

    const totalValue = calculateTotal();
    if (totalValue <= 0) {
      setOpen(false);
      return;
    }

    const allDetails = unpaidComponents
      .map(c => `${c.label}: ${getComponentAmount(c).toLocaleString('ru-RU')} ₽`)
      .join(', ');

    const currentMonthName = format(new Date(), 'LLLL', { locale: ru });
    const description = `Выплата за ${currentMonthName} — ${employee.full_name} (${allDetails})`;

    onPaymentComplete({
      type: 'expense',
      category: 'salary',
      description,
      amount: totalValue,
      account_type: accountType,
      related_user_id: employee.id,
    });

    // Mark all unpaid components as paid
    setPaidComponents(prev => {
      const newSet = new Set(prev);
      unpaidComponents.forEach(c => newSet.add(c.id));
      return newSet;
    });

    setOpen(false);
  };

  const totalValue = calculateTotal();

  return (
    <>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger}
      </DialogTrigger>
      <DialogContent className="sm:rounded-[32px] max-w-[95vw] sm:max-w-5xl w-full mx-4 p-0 overflow-hidden shadow-2xl shadow-black/60 border border-white/10 bg-gradient-to-br from-zinc-950 via-zinc-950 to-zinc-900" style={{ '--dialog-content-max-width': '64rem' } as React.CSSProperties}>
        <div className="p-6 md:p-8 space-y-6">
          <DialogHeader className="space-y-1">
            <DialogTitle className="text-xl md:text-2xl font-bold text-white tracking-tight">Выплата зарплаты</DialogTitle>
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary/60" />
              {employee.full_name}
            </p>
          </DialogHeader>

          <div className="space-y-6">
            <div className="space-y-3">
              <Label className="text-base font-bold uppercase tracking-wide text-muted-foreground ml-1">Выберите счёт</Label>
              <Tabs value={accountType} onValueChange={(v: string) => setAccountType(v as 'cash' | 'account')} className="w-full">
                <TabsList className="flex items-center gap-2 h-12 bg-white/5 border border-white/10 rounded-2xl p-1 w-fit">
                  <TabsTrigger
                    value="cash"
                    className="flex-1 min-w-[120px] rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all font-bold text-xs h-full"
                  >
                    <Wallet className="h-4 w-4 mr-2" /> Наличные
                  </TabsTrigger>
                  <TabsTrigger
                    value="account"
                    className="flex-1 min-w-[120px] rounded-xl data-[state=active]:bg-primary data-[state=active]:text-primary-foreground transition-all font-bold text-xs h-full"
                  >
                    <CreditCard className="h-4 w-4 mr-2" /> Р/Счет
                  </TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <div className="space-y-4">
              <Label className="text-base font-bold uppercase tracking-wide text-muted-foreground ml-1">Детализация</Label>
              <div className="space-y-2.5 max-h-[46vh] overflow-y-auto pr-1">
                {components.map((component) => {
                  const isEditing = editingComponent === component.id;
                  const amount = getComponentAmount(component);
                  const isPaid = paidComponents.has(component.id);

                  if (component.id === 'base_salary') {
                    return (
                      <div
                        key={component.id}
                        className={`group relative flex items-center gap-3 py-2 px-3 sm:py-2.5 sm:px-3.5 rounded-2xl border transition-all duration-200 ${
                          isPaid ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-white/5 border-white/10 hover:border-white/20'
                        }`}
                      >
                        {isPaid && (
                          <div className="h-8 w-8 flex items-center justify-center flex-shrink-0">
                            <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <Label className={`text-[10px] font-bold uppercase tracking-wider mb-0.5 block ${component.color}`}>
                            {component.label}
                          </Label>
                          <span className="text-lg font-mono font-bold text-white inline-flex items-baseline gap-1 tabular-nums">
                            {amount.toLocaleString('ru-RU')}{' '}
                            <span className="text-white/35 text-xs font-normal leading-none">₽</span>
                          </span>
                          {isPaid && (
                            <p className="text-[10px] text-emerald-400/80 mt-1 leading-snug">
                              {usesOfficialPayroll
                                ? 'Оклад за период отмечен (аванс / остаток по графику).'
                                : 'Оклад за период отмечен единой выплатой.'}
                            </p>
                          )}
                        </div>
                        {isPaid ? (
                          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto shrink-0">
                            <div className="h-9 px-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                              <span className="text-emerald-500 font-bold text-[10px] uppercase tracking-wide">Выплачено</span>
                            </div>
                            {usesOfficialPayroll && (
                              <SalaryPayrollFlowDialog
                                userId={employee.id}
                                employeeName={employee.full_name}
                                payrollYear={py}
                                payrollMonth={pm}
                                okladDisplayed={amount}
                                trigger={
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="h-9 px-4 rounded-xl font-bold text-[10px] uppercase tracking-wide border-white/20 bg-white/[0.04] text-white hover:bg-white/[0.08]"
                                  >
                                    Открыть
                                  </Button>
                                }
                              />
                            )}
                          </div>
                        ) : usesOfficialPayroll ? (
                          <SalaryPayrollFlowDialog
                            userId={employee.id}
                            employeeName={employee.full_name}
                            payrollYear={py}
                            payrollMonth={pm}
                            okladDisplayed={amount}
                            trigger={
                              <Button
                                type="button"
                                size="sm"
                                className="h-9 px-4 rounded-xl font-black text-[10px] uppercase tracking-wide flex-shrink-0 w-full sm:w-auto bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-900/30 border-none"
                              >
                                <Wallet className="h-3.5 w-3.5 mr-2" />
                                ВЫПЛАТИТЬ
                              </Button>
                            }
                          />
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            className="h-9 px-4 rounded-xl font-black text-[10px] uppercase tracking-wide flex-shrink-0 w-full sm:w-auto bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-900/30 border-none"
                            disabled={amount <= 0}
                            onClick={() => handlePayFlatOklad()}
                          >
                            <Wallet className="h-3.5 w-3.5 mr-2" />
                            Выплатить оклад
                          </Button>
                        )}
                      </div>
                    );
                  }

                  const isEditableRow = component.id !== 'personal_income';
                  const rowPad = isEditableRow ? 'py-4 pr-4 pl-10' : 'p-4';
                  const rowMargin = isEditableRow ? 'ml-10' : '';
                  return (
                    <div
                      key={component.id}
                      className={`group relative flex items-center gap-3 ${rowPad} ${rowMargin} rounded-2xl border transition-all duration-200 ${isPaid
                          ? 'bg-emerald-500/5 border-emerald-500/20'
                          : 'bg-white/5 border-white/10 hover:border-white/20'
                        }`}
                    >
                      {!isEditing && !isPaid && isEditableRow && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="absolute -left-10 top-1/2 -translate-y-1/2 h-8 w-8 p-0 rounded-xl bg-white/5 text-muted-foreground hover:text-white"
                          onClick={() => handleStartEdit(component.id)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}

                      {isPaid && isEditableRow && (
                        <div className="absolute -left-10 top-1/2 -translate-y-1/2 h-8 w-8 flex items-center justify-center">
                          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                        </div>
                      )}

                      {isPaid && !isEditableRow && (
                        <div className="h-8 w-8 flex items-center justify-center flex-shrink-0">
                          <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                        </div>
                      )}

                      {isEditing && isEditableRow && (
                        <div className="absolute -left-10 top-1/2 -translate-y-1/2 flex gap-1.5">
                          <Button
                            size="sm"
                            className="h-8 w-8 p-0 bg-emerald-500 hover:bg-emerald-600"
                            onClick={() => handleSaveEdit(component.id)}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            className="h-8 w-8 p-0 bg-zinc-800"
                            onClick={handleCancelEdit}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <Label
                          className={`text-[10px] font-bold uppercase tracking-wider mb-1 block ${component.color}`}
                        >
                          {component.label}
                        </Label>

                        {isEditing ? (
                          <Input
                            ref={inputRef}
                            type="text"
                            inputMode="numeric"
                            value={
                              tempEditValue.replace(/\D/g, '')
                                ? formatInteger(Number(tempEditValue.replace(/\D/g, '')))
                                : ''
                            }
                            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                              setTempEditValue(e.target.value.replace(/\D/g, ''))
                            }
                            onKeyDown={(e: React.KeyboardEvent) => handleKeyDown(e, component.id)}
                            className="h-9 bg-zinc-950 border-white/10 rounded-xl text-sm mt-1 tabular-nums"
                          />
                        ) : (
                          <span className="text-lg font-mono font-bold text-white">
                            {amount.toLocaleString('ru-RU')} <span className="text-white/30 text-xs font-normal">₽</span>
                          </span>
                        )}
                      </div>

                      {!isEditing && !isPaid && (
                        <div className="flex items-center gap-2">
                          {(component.id === 'personal_income' || component.id === 'team_revenue' || component.id === 'department_revenue') && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-9 px-3 rounded-xl bg-white/5 text-muted-foreground hover:text-white flex-shrink-0"
                              onClick={() => {
                                if (component.id === 'personal_income') setPersonalIncomeOpen(true);
                                if (component.id === 'team_revenue') setTeamOpen(true);
                                if (component.id === 'department_revenue') setDepartmentOpen(true);
                                // bonus detail removed
                              }}
                            >
                              <List className="h-3.5 w-3.5 mr-1.5" />
                              Детали
                            </Button>
                          )}
                          <Button
                            size="sm"
                            className="h-9 px-4 rounded-xl gradient-accent text-primary-foreground font-bold text-xs flex-shrink-0"
                            onClick={() => handlePayComponent(component)}
                            disabled={isProcessing || amount <= 0}
                          >
                            <Wallet className="h-3.5 w-3.5 mr-1.5" />
                            Выплатить
                          </Button>
                        </div>
                      )}

                      {isPaid && (
                        <div className="flex items-center gap-2">
                          {/* bonus details removed */}
                          <div className="h-9 px-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0">
                            <span className="text-emerald-500 font-bold text-xs">Выплачено</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 md:p-8 border-t border-white/10 mt-auto bg-black/20">
          <div className="flex items-center justify-between mb-6">
            <div className="space-y-1">
              <span className="text-sm font-bold uppercase tracking-wide text-muted-foreground/80 block">Итого к выплате</span>
              <p className="flex items-baseline gap-2 text-3xl md:text-4xl font-bold tabular-nums text-white tracking-tight">
                <span>{totalValue.toLocaleString('ru-RU')}</span>
                <span className="text-xl font-semibold text-white/35 leading-none">₽</span>
              </p>
            </div>
          </div>

          <div className="flex gap-4">
            <Button
              variant="outline"
              className="flex-1 h-12 rounded-2xl border-white/20 bg-white/[0.02] hover:bg-white/[0.06]"
              onClick={() => setOpen(false)}
            >
              Отмена
            </Button>
            <Button
              className="flex-[1.5] h-12 rounded-2xl gradient-accent text-primary-foreground font-bold shadow-lg shadow-primary/20"
              onClick={handlePayAll}
              disabled={isProcessing || totalValue <= 0}
            >
              {isProcessing ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <Wallet className="h-5 w-5 mr-2" />
                  Выплатить всё
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    <PersonalIncomeDetailDialog
        open={personalIncomeOpen}
        onOpenChange={setPersonalIncomeOpen}
        userId={employee.id}
        userName={employee.full_name}
        year={py}
        month={pm}
        role="agent"
        onPayDeal={(deals, total) => {
          const currentMonthName = format(new Date(), 'LLLL', { locale: ru });
          const dealDetails = deals.map(d => d.label).join(', ');
          const description = `Выплата за ${currentMonthName} — ${employee.full_name} (Личный доход: ${total.toLocaleString('ru-RU')} ₽ — ${dealDetails})`;

          onPaymentComplete({
            type: 'expense',
            category: 'salary',
            description,
            amount: total,
            account_type: accountType,
            related_user_id: employee.id,
          });

          setPaidComponents(prev => new Set(prev).add('personal_income'));
          setPersonalIncomeOpen(false);
          setOpen(false);
        }}
      />

    <PersonalIncomeDetailDialog
        open={teamOpen}
        onOpenChange={setTeamOpen}
        userId={employee.id}
        userName={employee.full_name}
        year={py}
        month={pm}
        role="mop"
        onPayDeal={(deals, total) => {
          const currentMonthName = format(new Date(), 'LLLL', { locale: ru });
          const dealDetails = deals.map(d => d.label).join(', ');
          const description = `Выплата за ${currentMonthName} — ${employee.full_name} (Команда (МОП): ${total.toLocaleString('ru-RU')} ₽ — ${dealDetails})`;

          onPaymentComplete({
            type: 'expense',
            category: 'salary',
            description,
            amount: total,
            account_type: accountType,
            related_user_id: employee.id,
          });

          setPaidComponents(prev => new Set(prev).add('team_revenue'));
          setTeamOpen(false);
          setOpen(false);
        }}
      />

    <PersonalIncomeDetailDialog
        open={departmentOpen}
        onOpenChange={setDepartmentOpen}
        userId={employee.id}
        userName={employee.full_name}
        year={py}
        month={pm}
        role="rop"
        onPayDeal={(deals, total) => {
          const currentMonthName = format(new Date(), 'LLLL', { locale: ru });
          const dealDetails = deals.map(d => d.label).join(', ');
          const description = `Выплата за ${currentMonthName} — ${employee.full_name} (РОП / филиал: ${total.toLocaleString('ru-RU')} ₽ — ${dealDetails})`;

          onPaymentComplete({
            type: 'expense',
            category: 'salary',
            description,
            amount: total,
            account_type: accountType,
            related_user_id: employee.id,
          });

          setPaidComponents(prev => new Set(prev).add('department_revenue'));
          setDepartmentOpen(false);
          setOpen(false);
        }}
      />

      {/* bonus detail dialog removed */}
    </>
  );
}
