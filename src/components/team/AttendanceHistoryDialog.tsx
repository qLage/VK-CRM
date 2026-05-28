import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useQuery } from '@tanstack/react-query';
import { localAPI } from '@/integrations/localAPI';
import { Skeleton } from '@/components/ui/skeleton';
import { parseUTCDate } from '@/lib/date-utils';
import { CheckCircle, XCircle, Clock, MapPin } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AttendanceHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employeeId: string | number;
  employeeName: string;
}

export function AttendanceHistoryDialog({ open, onOpenChange, employeeId, employeeName }: AttendanceHistoryDialogProps) {
  // Get current quarter dates
  const getQuarterDates = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    const quarter = Math.floor(month / 3);

    const startMonth = quarter * 3;
    const endMonth = startMonth + 2;

    const startDate = new Date(year, startMonth, 1);
    const endDate = new Date(year, endMonth + 1, 0); // Last day of end month

    return {
      start: startDate.toISOString().split('T')[0],
      end: endDate.toISOString().split('T')[0],
      quarterNum: quarter + 1
    };
  };

  const { start, end, quarterNum } = getQuarterDates();

  const { data: attendance, isLoading } = useQuery({
    queryKey: ['attendance-history', employeeId, start, end],
    queryFn: async () => {
      const { data, error } = await localAPI.request(
        `/attendance?user_id=${employeeId}&start_date=${start}&end_date=${end}`
      );
      if (error) throw error;
      return Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
    },
    enabled: open,
    staleTime: 60000,
  });

  const getStatusInfo = (record: any) => {
    const isInFields = record?.is_in_fields === true || record?.is_in_fields === 1 ||
      record?.is_in_fields === 'true' || record?.is_in_fields === '1';

    if (record?.check_out) {
      return {
        label: 'Полный день',
        icon: CheckCircle,
        color: 'text-emerald-400',
        bg: 'bg-emerald-500/10',
        border: 'border-emerald-500/20'
      };
    }
    if (isInFields) {
      return {
        label: 'В полях',
        icon: MapPin,
        color: 'text-amber-400',
        bg: 'bg-amber-500/10',
        border: 'border-amber-500/20'
      };
    }
    if (record?.check_in) {
      return {
        label: 'В офисе',
        icon: Clock,
        color: 'text-blue-400',
        bg: 'bg-blue-500/10',
        border: 'border-blue-500/20'
      };
    }
    return {
      label: 'Отсутствие',
      icon: XCircle,
      color: 'text-rose-400',
      bg: 'bg-rose-500/10',
      border: 'border-rose-500/20'
    };
  };

  // Calculate statistics
  const stats = attendance ? {
    total: attendance.length,
    fullDays: attendance.filter((a: any) => a.check_out).length,
    inFields: attendance.filter((a: any) => !a.check_out && (a.is_in_fields === true || a.is_in_fields === 1)).length,
    inOffice: attendance.filter((a: any) => a.check_in && !a.check_out && !(a.is_in_fields === true || a.is_in_fields === 1)).length,
  } : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl w-[calc(100%-2rem)] max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-lg md:text-xl font-black text-white">
            История посещаемости: {employeeName}
          </DialogTitle>
          <p className="text-xs text-white/40 font-bold uppercase tracking-wider">
            {quarterNum} квартал {new Date().getFullYear()} года
          </p>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-3 py-4">
            {[1, 2, 3, 4, 5].map(i => (
              <Skeleton key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            {/* Statistics */}
            {stats && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 mb-4">
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                  <div className="text-2xl font-black text-emerald-400 tabular-nums">{stats.fullDays}</div>
                  <div className="text-[9px] font-bold text-emerald-400/60 uppercase tracking-wider">Полных дней</div>
                </div>
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
                  <div className="text-2xl font-black text-amber-400 tabular-nums">{stats.inFields}</div>
                  <div className="text-[9px] font-bold text-amber-400/60 uppercase tracking-wider">В полях</div>
                </div>
                <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
                  <div className="text-2xl font-black text-blue-400 tabular-nums">{stats.inOffice}</div>
                  <div className="text-[9px] font-bold text-blue-400/60 uppercase tracking-wider">В офисе</div>
                </div>
                <div className="p-3 rounded-xl bg-white/5 border border-white/10">
                  <div className="text-2xl font-black text-white tabular-nums">{stats.total}</div>
                  <div className="text-[9px] font-bold text-white/40 uppercase tracking-wider">Всего записей</div>
                </div>
              </div>
            )}

            {/* Attendance List */}
            <div className="space-y-2">
              {attendance && attendance.length > 0 ? (
                attendance.map((record: any) => {
                  const status = getStatusInfo(record);
                  const StatusIcon = status.icon;
                  const date = parseUTCDate(record.date);

                  return (
                    <div
                      key={record.id}
                      className="p-3 md:p-4 rounded-xl bg-zinc-900/40 border border-white/5 hover:bg-zinc-900/60 transition-all"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 flex-1">
                          <div className={cn(
                            "h-10 w-10 rounded-lg flex items-center justify-center border",
                            status.bg, status.border
                          )}>
                            <StatusIcon className={cn("h-5 w-5", status.color)} />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-white">
                                {date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
                              </span>
                              <span className={cn(
                                "px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider",
                                status.bg, status.border, status.color
                              )}>
                                {status.label}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 mt-1">
                              <span className="text-xs text-white/40 font-mono tabular-nums">
                                Приход: {record.check_in ? parseUTCDate(record.check_in).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                              </span>
                              <span className="text-white/20">•</span>
                              <span className="text-xs text-white/40 font-mono tabular-nums">
                                Уход: {record.check_out ? parseUTCDate(record.check_out).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="text-center py-12 text-white/40">
                  <Clock className="h-12 w-12 mx-auto mb-3 opacity-20" />
                  <p className="text-sm font-bold">Нет записей за этот квартал</p>
                </div>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
