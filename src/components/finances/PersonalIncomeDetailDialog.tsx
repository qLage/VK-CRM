import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { useQuery } from '@tanstack/react-query';
import { localAPI } from '@/integrations/localAPI';
import { Wallet, CheckCircle2, Home, User, Briefcase, Percent, Pencil, Check, X } from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

interface DealItem {
  id: string;
  property_name: string;
  commission_seller_fact: string | number;
  commission_buyer_fact: string | number;
  mortgage_deduction: string | number;
  amount: number;
  agent_percent_seller: string | number;
  agent_percent_buyer: string | number;
  deal_date: string;
  payment_date: string;
  created_at: string;
  role_type: string;
  role_label: string;
  subcontractor_id: string | null;
  subcontractor_amount: string | number;
}

interface PersonalIncomeDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userName: string;
  year: number;
  month: number;
  onPayDeal: (deals: { id: string; amount: number; label: string }[], totalAmount: number) => void;
}

export function PersonalIncomeDetailDialog({
  open,
  onOpenChange,
  userId,
  userName,
  year,
  month,
  onPayDeal,
}: PersonalIncomeDetailDialogProps) {
  const [editedAmounts, setEditedAmounts] = useState<Record<string, number>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [tempValue, setTempValue] = useState<string>('');
  const [paidIds, setPaidIds] = useState<Set<string>>(new Set());
  const [applySelfEmployedTax, setApplySelfEmployedTax] = useState(true);

  const { data: payrollSettings } = useQuery({
    queryKey: ['payroll-org-settings'],
    queryFn: async () => {
      const { data, error } = await localAPI.request('/finances/payroll-org-settings');
      if (error) throw error;
      return data as { self_employed_tax_percent?: number };
    },
    enabled: open,
    staleTime: 300000,
  });
  const taxPercent = payrollSettings?.self_employed_tax_percent ?? 6;

  const { data: deals = [], isLoading } = useQuery({
    queryKey: ['salary-deals', userId, year, month],
    queryFn: async () => {
      const { data, error } = await localAPI.request(`/finances/salaries/deals/${userId}?year=${year}&month=${month}`);
      if (error) throw error;
      return Array.isArray(data?.data) ? data.data : (Array.isArray(data) ? data : []);
    },
    enabled: open,
    staleTime: 30000,
  });

  const getDealAmount = (deal: DealItem) => {
    const raw = editedAmounts[deal.id] ?? deal.amount;
    if (!applySelfEmployedTax) return raw;
    return Math.round(raw * (1 - taxPercent / 100));
  };

  const totalAmount = deals.reduce((sum: number, d: DealItem) => sum + (paidIds.has(d.id) ? 0 : getDealAmount(d)), 0);
  const unpaidCount = deals.filter((d: DealItem) => !paidIds.has(d.id)).length;

  const handleStartEdit = (deal: DealItem) => {
    setEditingId(`${deal.id}-${deal.role_type}`);
    setTempValue(String(getDealAmount(deal)));
  };

  const handleSaveEdit = () => {
    const num = Number(tempValue.replace(/\D/g, '')) || 0;
    if (editingId) {
      setEditedAmounts(prev => ({ ...prev, [editingId]: num }));
    }
    setEditingId(null);
    setTempValue('');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setTempValue('');
  };

  const handlePayDeal = (deal: DealItem) => {
    const amount = getDealAmount(deal);
    const dealKey = `${deal.id}-${deal.role_type}`;
    onPayDeal([{ id: deal.id, amount, label: `${deal.role_label}: ${deal.property_name}` }], amount);
    setPaidIds(prev => new Set(prev).add(dealKey));
  };

  const handlePayAll = () => {
    const unpaidDeals = deals.filter((d: DealItem) => !paidIds.has(`${d.id}-${d.role_type}`));
    const items = unpaidDeals.map((d: DealItem) => ({
      id: d.id,
      amount: getDealAmount(d),
      label: `${d.role_label}: ${d.property_name}`,
    }));
    const total = items.reduce((sum, i) => sum + i.amount, 0);
    onPayDeal(items, total);
    onOpenChange(false);
  };

  const getRoleIcon = (roleType: string) => {
    switch (roleType) {
      case 'agent': return <User className="h-4 w-4 text-emerald-400" />;
      case 'subcontractor': return <Briefcase className="h-4 w-4 text-amber-400" />;
      case 'mortgage_agent':
      case 'mortgage_broker': return <Percent className="h-4 w-4 text-sky-400" />;
      default: return <Home className="h-4 w-4 text-white/40" />;
    }
  };

  const getRoleBadgeColor = (roleType: string) => {
    switch (roleType) {
      case 'agent': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'subcontractor': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'mortgage_agent':
      case 'mortgage_broker': return 'bg-sky-500/10 text-sky-400 border-sky-500/20';
      default: return 'bg-white/5 text-white/40 border-white/10';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:rounded-[28px] max-w-[95vw] sm:max-w-4xl w-full mx-4 p-0 overflow-hidden shadow-2xl shadow-black/60 border border-white/10 bg-gradient-to-br from-zinc-950 via-zinc-950 to-zinc-900 max-h-[90vh] flex flex-col" style={{ '--dialog-content-max-width': '56rem' } as React.CSSProperties}>
        <div className="p-6 md:p-8 space-y-6 flex-1 overflow-hidden flex flex-col">
          <DialogHeader className="space-y-1 shrink-0">
            <DialogTitle className="text-xl md:text-2xl font-bold text-white tracking-tight">Личный доход</DialogTitle>
            <p className="text-sm text-muted-foreground flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/60" />
              {userName}
            </p>
          </DialogHeader>

          <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 shrink-0">
            <Checkbox
              id="apply-self-employed-tax-personal"
              checked={applySelfEmployedTax}
              onCheckedChange={(v) => setApplySelfEmployedTax(v === true)}
            />
            <Label htmlFor="apply-self-employed-tax-personal" className="text-sm text-white/80 font-medium cursor-pointer">
              Удержать налог самозанятого ({taxPercent}%)
            </Label>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : deals.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Wallet className="h-12 w-12 mb-4 opacity-20" />
              <p className="text-sm">Нет сделок за период</p>
            </div>
          ) : (
            <div className="space-y-3 overflow-y-auto pr-1 flex-1">
              {deals.map((deal: DealItem, index: number) => {
                const isEditing = editingId === `${deal.id}-${deal.role_type}`;
                const amount = getDealAmount(deal);
                const isPaid = paidIds.has(`${deal.id}-${deal.role_type}`);
                const dealKey = `${deal.id}-${deal.role_type}`;

                return (
                  <div
                    key={dealKey}
                    className={`group relative flex flex-col gap-2.5 p-4 rounded-2xl border transition-all ${
                      isPaid ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-white/[0.03] border-white/10 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      {/* Left: icon + info */}
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <div className={`h-10 w-10 rounded-xl border flex items-center justify-center flex-shrink-0 mt-0.5 ${getRoleBadgeColor(deal.role_type)}`}>
                          {getRoleIcon(deal.role_type)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-white truncate">{deal.property_name}</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {deal.payment_date 
                              ? `Поступление: ${format(new Date(deal.payment_date), 'dd MMM yyyy', { locale: ru })}` 
                              : 'Дата поступления не задана'}
                          </p>
                          {/* Deal details row */}
                          <div className="flex items-center gap-2 flex-wrap mt-2">
                            <span className={`px-2 py-0.5 rounded-md border text-[10px] ${getRoleBadgeColor(deal.role_type)}`}>
                              {deal.role_label}
                            </span>
                            {deal.role_type === 'agent' && (
                              <>
                                <span className="text-[10px] text-white/30">Продавец: {Number(deal.commission_seller_fact || 0).toLocaleString('ru-RU')} ₽</span>
                                <span className="text-[10px] text-white/30">Покупатель: {Number(deal.commission_buyer_fact || 0).toLocaleString('ru-RU')} ₽</span>
                                {Number(deal.mortgage_deduction || 0) > 0 && (
                                  <span className="text-[10px] text-white/30">Ипотечный вычет: {Number(deal.mortgage_deduction).toLocaleString('ru-RU')} ₽</span>
                                )}
                              </>
                            )}
                            {deal.role_type === 'subcontractor' && (
                              <span className="text-[10px] text-white/30">Сумма сдельщика: {Number(deal.subcontractor_amount || 0).toLocaleString('ru-RU')} ₽</span>
                            )}
                            {(deal.role_type === 'mortgage_agent' || deal.role_type === 'mortgage_broker') && (
                              <span className="text-[10px] text-white/30">Ипотечная услуга</span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right: amount + actions */}
                      <div className="flex flex-col items-end gap-2 flex-shrink-0">
                        {isEditing ? (
                          <div className="flex items-center gap-1.5">
                            <Input
                              type="text"
                              inputMode="numeric"
                              value={tempValue}
                              onChange={(e) => setTempValue(e.target.value.replace(/\D/g, ''))}
                              className="h-8 w-28 bg-zinc-950 border-white/10 rounded-xl text-sm tabular-nums"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveEdit();
                                if (e.key === 'Escape') handleCancelEdit();
                              }}
                            />
                            <Button size="sm" className="h-8 w-8 p-0 bg-emerald-500 hover:bg-emerald-600 rounded-lg" onClick={handleSaveEdit}>
                              <Check className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="sm" className="h-8 w-8 p-0 bg-zinc-800 hover:bg-zinc-700 rounded-lg" onClick={handleCancelEdit}>
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <div className="flex flex-col items-end gap-0.5">
                              {applySelfEmployedTax && (
                                <span className="text-xs text-white/30 line-through tabular-nums">
                                  {(editedAmounts[deal.id] ?? deal.amount).toLocaleString('ru-RU')} ₽
                                </span>
                              )}
                              <span className="text-xl font-mono font-bold text-white tabular-nums">
                                {amount.toLocaleString('ru-RU')}
                                <span className="text-white/30 text-xs font-normal ml-1">₽</span>
                              </span>
                            </div>
                            {!isPaid && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0 rounded-lg bg-white/5 text-muted-foreground hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={() => handleStartEdit(deal)}
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        )}

                        {/* Pay button per deal */}
                        {!isPaid && !isEditing && (
                          <Button
                            size="sm"
                            className="h-9 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-900/30 border-none"
                            onClick={() => handlePayDeal(deal)}
                          >
                            <Wallet className="h-3.5 w-3.5 mr-1.5" />
                            Выплатить
                          </Button>
                        )}

                        {isPaid && (
                          <div className="h-9 px-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-1.5">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                            <span className="text-emerald-500 font-bold text-xs">Выплачено</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 md:p-8 border-t border-white/10 bg-black/20 shrink-0">
          <div className="flex items-center justify-between mb-6">
            <div className="space-y-1">
              <span className="text-sm font-bold uppercase tracking-wide text-muted-foreground/80 block">Итого к выплате</span>
              <p className="flex items-baseline gap-2 text-3xl md:text-4xl font-bold tabular-nums text-white tracking-tight">
                <span>{totalAmount.toLocaleString('ru-RU')}</span>
                <span className="text-xl font-semibold text-white/35 leading-none">₽</span>
              </p>
            </div>
            <div className="text-right">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Осталось</p>
              <p className="text-xl font-bold text-white">{unpaidCount} <span className="text-sm text-white/40 font-normal">/ {deals.length}</span></p>
            </div>
          </div>

          <div className="flex gap-4">
            <Button
              variant="outline"
              className="flex-1 h-12 rounded-2xl border-white/20 bg-white/[0.02] hover:bg-white/[0.06]"
              onClick={() => onOpenChange(false)}
            >
              Отмена
            </Button>
            <Button
              className="flex-[1.5] h-12 rounded-2xl gradient-accent text-primary-foreground font-bold shadow-lg shadow-primary/20"
              onClick={handlePayAll}
              disabled={isLoading || unpaidCount === 0 || totalAmount <= 0}
            >
              <Wallet className="h-5 w-5 mr-2" />
              Выплатить всё
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
