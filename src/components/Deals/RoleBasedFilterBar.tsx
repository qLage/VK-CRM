import { useState } from 'react';
import { Filter, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { INPUT_WITH_LEADING_ICON } from '@/lib/inputClassNames';
import { DealStatusFilter } from './DealStatusFilter';

interface RoleBasedFilterBarProps {
  accessLevel: number;
  filters: {
    year: number;
    month: number;
    searchQuery: string;
    dealStatus?: 'all' | 'pending' | 'approved' | 'rejected';
    minAmount?: number;
    maxAmount?: number;
  };
  onFiltersChange: (filters: any) => void;
  currentYear: number;
  currentLevel?: 'company' | 'branch' | 'team' | 'employee';
}

const MONTH_NAMES = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'
];

export function RoleBasedFilterBar({
  accessLevel,
  filters,
  onFiltersChange,
  currentYear,
  currentLevel = 'company',
  mode = 'sidebar'
}: RoleBasedFilterBarProps & { mode?: 'header' | 'sidebar' }) {
  const [tempFilters, setTempFilters] = useState(filters);

  const isDirector = accessLevel >= 90;

  const getSearchPlaceholder = () => {
    switch (currentLevel) {
      case 'company':
        return 'Поиск по филиалу...';
      case 'branch':
        return 'Поиск по команде...';
      case 'team':
        return 'Поиск по агенту...';
      case 'employee':
        return 'Поиск по агенту...';
      default:
        return 'Поиск...';
    }
  };

  const handleApplyFilters = () => {
    onFiltersChange(tempFilters);
  };

  const handleResetFilters = () => {
    const resetFilters: any = {
      year: currentYear,
      month: 0,
      searchQuery: '',
      dealStatus: 'all',
      minAmount: undefined,
      maxAmount: undefined,
    };
    setTempFilters(resetFilters);
    onFiltersChange(resetFilters);
  };

  if (mode === 'header') {
    return (
      <div className="min-w-0 flex-1">
        <div className="relative group">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3.5 top-1/2 z-0 h-4 w-4 -translate-y-1/2 text-white/25 group-focus-within:text-primary/80"
          />
          <Input
            placeholder={getSearchPlaceholder()}
            value={filters.searchQuery}
            onChange={(e) =>
              onFiltersChange({ ...filters, searchQuery: e.target.value })
            }
            className={cn(
              INPUT_WITH_LEADING_ICON,
              'h-10 md:h-11 bg-zinc-900/60 border-white/10 text-white placeholder:text-white/30 pr-3 focus:ring-primary/20 transition-all rounded-xl',
            )}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 flex flex-col h-full bg-zinc-950/20 backdrop-blur-3xl p-1">
      <div className="space-y-4 flex-1">
        {/* Period Section */}
        <div className="space-y-3 p-4 rounded-2xl bg-white/[0.03] border border-white/5">
          <label className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] px-1">
            Период
          </label>
          <div className="grid grid-cols-2 gap-2">
            <Select
              value={tempFilters.year.toString()}
              onValueChange={(val) =>
                setTempFilters({ ...tempFilters, year: parseInt(val) })
              }
            >
              <SelectTrigger className="bg-zinc-900/60 border-white/10 text-white rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {[2024, 2025, 2026].map((year) => (
                  <SelectItem key={year} value={year.toString()}>
                    {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={tempFilters.month.toString()}
              onValueChange={(val) =>
                setTempFilters({ ...tempFilters, month: parseInt(val) })
              }
            >
              <SelectTrigger className="bg-zinc-900/60 border-white/10 text-white rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="0">Все месяцы</SelectItem>
                {MONTH_NAMES.map((name, idx) => (
                  <SelectItem key={idx + 1} value={(idx + 1).toString()}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Status Section */}
        <div className="space-y-3 p-4 rounded-2xl bg-white/[0.03] border border-white/5">
          <label className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] px-1">
            Статус сделки
          </label>
          <DealStatusFilter
            accessLevel={accessLevel}
            selectedStatus={tempFilters.dealStatus || 'all'}
            onStatusChange={(status) => setTempFilters({ ...tempFilters, dealStatus: status })}
          />
        </div>

        {/* Amount Range Filter - For Directors only */}
        {isDirector && (
          <div className="space-y-3 p-4 rounded-2xl bg-white/[0.03] border border-white/5">
            <label className="text-[10px] font-black text-white/40 uppercase tracking-[0.2em] px-1">
              Фильтр по сумме (₽)
            </label>
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="number"
                placeholder="От"
                value={tempFilters.minAmount || ''}
                onChange={(e) =>
                  setTempFilters({
                    ...tempFilters,
                    minAmount: e.target.value
                      ? parseInt(e.target.value)
                      : undefined,
                  })
                }
                className="bg-zinc-900/60 border-white/10 text-white placeholder:text-white/30 rounded-xl"
              />
              <Input
                type="number"
                placeholder="До"
                value={tempFilters.maxAmount || ''}
                onChange={(e) =>
                  setTempFilters({
                    ...tempFilters,
                    maxAmount: e.target.value
                      ? parseInt(e.target.value)
                      : undefined,
                  })
                }
                className="bg-zinc-900/60 border-white/10 text-white placeholder:text-white/30 rounded-xl"
              />
            </div>
          </div>
        )}
      </div>

      {/* Action Buttons at the bottom of sidebar */}
      <div className="pt-6 space-y-2 mt-auto">
        <Button
          onClick={handleApplyFilters}
          className="w-full bg-primary hover:bg-primary/90 text-white font-black uppercase tracking-tighter py-6 rounded-2xl shadow-xl shadow-primary/20"
        >
          Применить фильтры
        </Button>
        <Button
          variant="ghost"
          onClick={handleResetFilters}
          className="w-full text-white/40 hover:text-white font-bold uppercase tracking-wider text-[10px]"
        >
          Сбросить все
        </Button>
      </div>
    </div>
  );
}
