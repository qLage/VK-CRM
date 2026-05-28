import { useState, useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { localAPI } from '@/integrations/localAPI';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Download, User, Users, Building2 } from 'lucide-react';
import { MainLayout } from '@/components/layout/MainLayout';
import { AddDealRowDialog } from '@/components/Deals/AddDealRowDialog';
import { MetricsPanel } from '@/components/Deals/MetricsPanel';
import { useRoleBasedDeals, type DealViewMode } from '@/hooks/useRoleBasedDeals';
import { cn } from '@/lib/utils';

const MONTH_NAMES = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
];

export default function DealTable() {
  const queryClient = useQueryClient();
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const [viewMode, setViewMode] = useState<DealViewMode>('personal');
  const [filters, setFilters] = useState({
    year: currentYear,
    month: null as number | null, // null = all months
    viewMode: 'personal' as DealViewMode
  });

  const parentRef = useRef<HTMLDivElement>(null);

  const [editingCell, setEditingCell] = useState<{ rowId: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);

  // Use role-based hook with view mode
  const { deals, totals, isLoading, title, availableViewModes, refetch } = useRoleBasedDeals({
    ...filters,
    viewMode
  });

  // Update filters when view mode changes
  const handleViewModeChange = (mode: DealViewMode) => {
    setViewMode(mode);
    setFilters(prev => ({ ...prev, viewMode: mode }));
  };

  // Виртуализация строк для больших объемов данных
  const rowVirtualizer = useVirtualizer({
    count: deals?.length || 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 40, // Примерная высота строки (px)
    overscan: 10 // Количество строк для предварительного рендера вне зоны видимости
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, field, value }: { id: string; field: string; value: any }) => {
      const row = deals.find(r => r.id === id);
      if (!row) return;

      let coerced = value;
      const numericFields = new Set([
        'month',
        'year',
        'commission_seller_plan',
        'commission_buyer_plan',
        'commission_seller_fact',
        'commission_buyer_fact',
        'agent_percent_seller',
        'agent_percent_buyer',
        'mop_percent',
        'rop_percent',
        'mortgage_deduction',
        'mortgage',
        'deal_amount',
        'agent_manual_bonus',
        'rop_manual_bonus',
        'other_expenses',
      ]);
      if (numericFields.has(field)) {
        const n = parseFloat(String(value).replace(',', '.'));
        coerced = Number.isFinite(n) ? n : 0;
      }

      const { error } = await localAPI.request(`/deal-table/${id}`, {
        method: 'PUT',
        body: { [field]: coerced },
      });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['role-based-deals'] });
      queryClient.invalidateQueries({ queryKey: ['role-based-totals'] });
      queryClient.invalidateQueries({ queryKey: ['drill-down-detailed'] });
      queryClient.invalidateQueries({ queryKey: ['drill-down-totals'] });
      toast.success('Сохранено');
    },
    onError: (error: any) => {
      toast.error('Ошибка при сохранении');
      console.error(error);
    }
  });

  const handleCellEdit = (rowId: string, field: string, value: any) => {
    setEditingCell({ rowId, field });
    setEditValue(value);
  };

  const handleCellBlur = () => {
    if (editingCell) {
      const { rowId, field } = editingCell;
      updateMutation.mutate({ id: rowId, field, value: editValue });
      setEditingCell(null);
    }
  };

  const handleCellKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCellBlur();
    } else if (e.key === 'Escape') {
      setEditingCell(null);
    }
  };

  const renderCell = (row: any, field: string, isEditable = true) => {
    const isEditing = editingCell?.rowId === row.id && editingCell?.field === field;
    const value = row[field] || '';

    if (!isEditable) {
      return (
        <div className="px-2 py-1 text-sm text-white/60">
          {typeof value === 'number' ? parseFloat(value).toFixed(2) : value}
        </div>
      );
    }

    if (isEditing) {
      return (
        <Input
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleCellBlur}
          onKeyDown={handleCellKeyDown}
          autoFocus
          className="h-8 text-sm"
        />
      );
    }

    return (
      <div
        className="px-2 py-1 text-sm cursor-pointer hover:bg-white/5 rounded"
        onClick={() => handleCellEdit(row.id, field, value)}
      >
        {typeof value === 'number' ? parseFloat(value).toFixed(2) : value || '—'}
      </div>
    );
  };

  return (
    <MainLayout>
      <div className="space-y-6 p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-black text-white uppercase tracking-tighter">
              {title}
            </h1>
            <p className="text-xs font-black text-white/20 uppercase tracking-widest mt-2">
              Финансовая таблица сделок
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => setShowAddDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Добавить сделку
            </Button>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Экспорт
            </Button>
          </div>
        </div>

        {/* View Mode Toggle */}
        {availableViewModes.length > 1 && (
          <div className="flex gap-2 p-1 bg-zinc-900/60 backdrop-blur-xl border border-white/10 rounded-lg w-fit">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleViewModeChange('personal')}
              className={cn(
                "gap-2 transition-all",
                viewMode === 'personal'
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "text-white/60 hover:text-white hover:bg-white/5"
              )}
            >
              <User className="h-4 w-4" />
              Мои сделки
            </Button>

            {availableViewModes.includes('team') && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleViewModeChange('team')}
                className={cn(
                  "gap-2 transition-all",
                  viewMode === 'team'
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "text-white/60 hover:text-white hover:bg-white/5"
                )}
              >
                <Users className="h-4 w-4" />
                Сделки команды
              </Button>
            )}

            {availableViewModes.includes('branch') && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleViewModeChange('branch')}
                className={cn(
                  "gap-2 transition-all",
                  viewMode === 'branch'
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "text-white/60 hover:text-white hover:bg-white/5"
                )}
              >
                <Building2 className="h-4 w-4" />
                Сделки филиала
              </Button>
            )}
          </div>
        )}

        {/* Metrics Panel */}
        <MetricsPanel totals={totals} isLoading={isLoading} />

        {/* Filters */}
        <div className="flex gap-4 flex-wrap">
          <Select value={filters.year?.toString()} onValueChange={(v) => setFilters({ ...filters, year: parseInt(v) })}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Год" />
            </SelectTrigger>
            <SelectContent>
              {[2024, 2025, 2026].map(y => (
                <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filters.month?.toString() || 'all'} onValueChange={(v) => setFilters({ ...filters, month: v === 'all' ? null : parseInt(v) })}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Месяц" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Все месяцы</SelectItem>
              {MONTH_NAMES.map((name, idx) => (
                <SelectItem key={idx + 1} value={(idx + 1).toString()}>{name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Table */}
        {/* Table container with virtualizer ref */}
        <div
          ref={parentRef}
          className="overflow-x-auto bg-zinc-900/40 backdrop-blur-3xl border border-white/5 rounded-xl block max-h-[70vh] relative"
        >
          <table className="w-full text-sm block">
            <thead className="bg-zinc-900/60 sticky top-0 z-20 block w-full">
              <tr className="table w-full table-fixed">
                <th className="px-2 py-3 text-left text-xs font-black text-white/40 uppercase whitespace-nowrap">Месяц</th>
                <th className="px-2 py-3 text-left text-xs font-black text-white/40 uppercase whitespace-nowrap">Объект</th>
                <th className="px-2 py-3 text-left text-xs font-black text-white/40 uppercase whitespace-nowrap">Документ</th>
                <th className="px-2 py-3 text-left text-xs font-black text-white/40 uppercase whitespace-nowrap">Агент</th>
                <th className="px-2 py-3 text-left text-xs font-black text-white/40 uppercase whitespace-nowrap">РОП/МОП</th>
                <th className="px-2 py-3 text-right text-xs font-black text-white/40 uppercase whitespace-nowrap">План прод</th>
                <th className="px-2 py-3 text-right text-xs font-black text-white/40 uppercase whitespace-nowrap">План пок</th>
                <th className="px-2 py-3 text-right text-xs font-black text-white/40 uppercase whitespace-nowrap">Факт прод</th>
                <th className="px-2 py-3 text-right text-xs font-black text-white/40 uppercase whitespace-nowrap">Факт пок</th>
                <th className="px-2 py-3 text-right text-xs font-black text-white/40 uppercase whitespace-nowrap">% агента (прод)</th>
                <th className="px-2 py-3 text-right text-xs font-black text-white/40 uppercase whitespace-nowrap bg-primary/10">Комиссия</th>
                <th className="px-2 py-3 text-right text-xs font-black text-white/40 uppercase whitespace-nowrap bg-primary/10">Доход агента</th>
                <th className="px-2 py-3 text-right text-xs font-black text-white/40 uppercase whitespace-nowrap bg-primary/10">Выручка АН</th>
              </tr>
            </thead>
            <tbody
              className="block relative w-full"
              style={{ height: `${rowVirtualizer.getTotalSize()}px` }}
            >
              {isLoading ? (
                <tr className="absolute w-full flex justify-center mt-8">
                  <td className="text-white/40">Загрузка...</td>
                </tr>
              ) : deals.length === 0 ? (
                <tr className="absolute w-full flex justify-center mt-8">
                  <td className="text-white/40">Нет данных</td>
                </tr>
              ) : (
                rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const row = deals[virtualRow.index];
                  return (
                    <tr
                      key={row.id}
                      className="absolute top-0 left-0 w-full table table-fixed border-t border-white/5 hover:bg-white/5"
                      style={{
                        height: `${virtualRow.size}px`,
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                    >
                      <td className="px-2 py-2 truncate">{renderCell(row, 'month')}</td>
                      <td className="px-2 py-2 truncate">{renderCell(row, 'property_name')}</td>
                      <td className="px-2 py-2 truncate">{renderCell(row, 'document_type')}</td>
                      <td className="px-2 py-2 truncate">{renderCell(row, 'agent_name')}</td>
                      <td className="px-2 py-2 truncate">{renderCell(row, 'rop_name')}</td>
                      <td className="px-2 py-2 text-right truncate">{renderCell(row, 'commission_seller_plan')}</td>
                      <td className="px-2 py-2 text-right truncate">{renderCell(row, 'commission_buyer_plan')}</td>
                      <td className="px-2 py-2 text-right truncate">{renderCell(row, 'commission_seller_fact')}</td>
                      <td className="px-2 py-2 text-right truncate">{renderCell(row, 'commission_buyer_fact')}</td>
                      <td className="px-2 py-2 text-right truncate">{renderCell(row, 'agent_percent_seller')}</td>
                      <td className="px-2 py-2 text-right bg-primary/5 truncate">{renderCell(row, 'commission_total_fact', false)}</td>
                      <td className="px-2 py-2 text-right bg-primary/5 truncate">{renderCell(row, 'agent_income', false)}</td>
                      <td className="px-2 py-2 text-right bg-primary/5 truncate">{renderCell(row, 'company_revenue', false)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
            {/* Totals Row */}
            {totals && (
              <tfoot className="bg-primary/10 border-t-2 border-primary/30 sticky bottom-0 z-20 block w-full mt-auto">
                <tr className="table w-full table-fixed">
                  <td colSpan={10} className="px-2 py-3 text-sm font-black text-white uppercase">
                    Итого ({totals.total_deals} сделок)
                  </td>
                  <td className="px-2 py-3 text-right text-sm font-black text-white">
                    {parseFloat(totals.total_commission_fact || 0).toFixed(2)}
                  </td>
                  <td className="px-2 py-3 text-right text-sm font-black text-white">
                    {parseFloat(totals.total_agent_income || 0).toFixed(2)}
                  </td>
                  <td className="px-2 py-3 text-right text-sm font-black text-white">
                    {parseFloat(totals.total_company_revenue || 0).toFixed(2)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <AddDealRowDialog open={showAddDialog} onOpenChange={setShowAddDialog} />
    </MainLayout>
  );
}
