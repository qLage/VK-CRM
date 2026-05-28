import { useState } from 'react';
import { Filter, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';

interface FilterState {
  positionId: string;
  status: string;
  hasSalary: string;
  branchId: string;
  teamId: string;
}

interface EmployeeFiltersProps {
  positions: { id: string; name: string }[];
  branches: { id: string; name: string }[];
  teams: { id: string; name: string; branch_id: string }[];
  filters: FilterState;
  onFiltersChange: (filters: FilterState) => void;
}

const defaultFilters: FilterState = {
  positionId: 'all',
  status: 'all',
  hasSalary: 'all',
  branchId: 'all',
  teamId: 'all',
};

export function EmployeeFilters({ positions, branches, teams, filters, onFiltersChange }: EmployeeFiltersProps) {
  const [open, setOpen] = useState(false);
  const [localFilters, setLocalFilters] = useState<FilterState>(filters);

  const activeFilterCount = Object.entries(filters).filter(([key, v]) => v !== 'all' && key !== 'branchId' && key !== 'teamId').length
    + (filters.branchId !== 'all' ? 1 : 0)
    + (filters.teamId !== 'all' ? 1 : 0);

  const handleApply = () => {
    onFiltersChange(localFilters);
    setOpen(false);
  };

  const handleReset = () => {
    setLocalFilters(defaultFilters);
    onFiltersChange(defaultFilters);
    setOpen(false);
  };

  // Filter teams based on selected branch
  const teamsArray = Array.isArray(teams) ? teams : [];
  const availableTeams = localFilters.branchId === 'all'
    ? []
    : teamsArray.filter((t: any) => t?.branch_id === localFilters.branchId);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-1.5 md:gap-2 rounded-lg md:rounded-xl relative text-xs md:text-sm h-9 md:h-10">
          <Filter className="h-3.5 w-3.5 md:h-4 md:w-4" />
          Фильтры
          {activeFilterCount > 0 && (
            <Badge className="h-4 min-w-[16px] md:h-5 md:min-w-[20px] px-0.5 md:px-1 bg-primary text-primary-foreground text-[9px] md:text-[10px] absolute -top-1.5 md:-top-2 -right-1.5 md:-right-2">
              {activeFilterCount}
            </Badge>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-[90vw] sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base md:text-lg">
            <Filter className="h-4 w-4 md:h-5 md:w-5" />
            Фильтры сотрудников
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 md:space-y-5 pt-3 md:pt-4">
          {/* Branch filter */}
          <div className="space-y-1.5 md:space-y-2">
            <Label className="text-xs md:text-sm font-medium">Филиал</Label>
            <Select
              value={localFilters.branchId}
              onValueChange={(v) => setLocalFilters({ ...localFilters, branchId: v, teamId: 'all' })}
            >
              <SelectTrigger className="h-9 md:h-10 text-xs md:text-sm">
                <SelectValue placeholder="Все филиалы" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все филиалы</SelectItem>
                {(Array.isArray(branches) ? branches : []).map((b: any) => (
                  <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Team filter (Dependent on Branch) */}
          {localFilters.branchId !== 'all' && (
            <div className="space-y-1.5 md:space-y-2 animate-fade-in-up">
              <Label className="text-xs md:text-sm font-medium">Команда</Label>
              <Select
                value={localFilters.teamId}
                onValueChange={(v) => setLocalFilters({ ...localFilters, teamId: v })}
                disabled={availableTeams.length === 0}
              >
                <SelectTrigger className="h-9 md:h-10 text-xs md:text-sm">
                  <SelectValue placeholder={availableTeams.length === 0 ? "Нет команд" : "Все команды"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Все команды</SelectItem>
                  {availableTeams.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Position filter */}
          <div className="space-y-1.5 md:space-y-2">
            <Label className="text-xs md:text-sm font-medium">Должность</Label>
            <Select value={localFilters.positionId} onValueChange={(v) => setLocalFilters({ ...localFilters, positionId: v })}>
              <SelectTrigger className="h-9 md:h-10 text-xs md:text-sm">
                <SelectValue placeholder="Все должности" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все должности</SelectItem>
                <SelectItem value="none">Без должности</SelectItem>
                {(Array.isArray(positions) ? positions : []).map(pos => (
                  <SelectItem key={pos.id} value={pos.id}>{pos.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Status filter */}
          <div className="space-y-1.5 md:space-y-2">
            <Label className="text-xs md:text-sm font-medium">Статус</Label>
            <Select value={localFilters.status} onValueChange={(v) => setLocalFilters({ ...localFilters, status: v })}>
              <SelectTrigger className="h-9 md:h-10 text-xs md:text-sm">
                <SelectValue placeholder="Все статусы" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все</SelectItem>
                <SelectItem value="active">Активные</SelectItem>
                <SelectItem value="inactive">Неактивные</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Actions */}
          <div className="flex gap-2 md:gap-3 pt-1 md:pt-2">
            <Button variant="outline" className="flex-1 h-9 md:h-10 text-xs md:text-sm" onClick={handleReset}>
              <X className="h-3.5 w-3.5 md:h-4 md:w-4 mr-1" />
              Сбросить
            </Button>
            <Button className="flex-1 gradient-accent text-primary-foreground h-9 md:h-10 text-xs md:text-sm" onClick={handleApply}>
              Применить
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { defaultFilters };
export type { FilterState };
