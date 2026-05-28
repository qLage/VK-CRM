import { useRealtime } from '@/contexts/RealtimeContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Bell, Trophy, FileCheck, AlertCircle, CheckCircle, XCircle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ru } from 'date-fns/locale';
import { parseUTCDate } from '@/lib/date-utils';
import { useNotifications } from '@/hooks/useNotifications';
import { useNavigate } from 'react-router-dom';

const iconMap: Record<string, { icon: any; bgColor: string; iconColor: string }> = {
  success: { icon: CheckCircle, bgColor: 'bg-success/15', iconColor: 'text-success' },
  warning: { icon: AlertCircle, bgColor: 'bg-warning/15', iconColor: 'text-warning' },
  error: { icon: XCircle, bgColor: 'bg-destructive/15', iconColor: 'text-destructive' },
  info: { icon: Bell, bgColor: 'bg-primary/15', iconColor: 'text-primary' },
  rating: { icon: Trophy, bgColor: 'bg-primary/15', iconColor: 'text-primary' },
  report: { icon: FileCheck, bgColor: 'bg-success/15', iconColor: 'text-success' },
};

export function ForcedNotificationDisplay() {
  const { forcedNotification, setForcedNotification } = useRealtime();
  const { markAsRead } = useNotifications();
  const navigate = useNavigate();

  if (!forcedNotification) return null;

  const handleClose = () => {
    if (!forcedNotification.is_read) {
        markAsRead(forcedNotification.id);
    }
    setForcedNotification(null);
  };

  const handleViewRequest = () => {
    if (forcedNotification.entity_id && forcedNotification.entity_type === 'service_request') {
      navigate(`/service-requests?id=${forcedNotification.entity_id}`);
      handleClose();
    }
  };

  const config = iconMap[forcedNotification.type] || iconMap.info;
  const Icon = config.icon;

  return (
    <Dialog open={!!forcedNotification} onOpenChange={(open) => !open && handleClose()}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden rounded-t-[2rem] sm:rounded-[2rem] shadow-2xl bg-zinc-900/90 backdrop-blur-3xl border-white/10">
        <div className="p-6 md:p-8 space-y-6">
          <div className="flex items-center gap-4">
            <div className={cn(
              "p-3 rounded-2xl border bg-white/5",
              config.iconColor
            )}>
              <Icon className="h-6 w-6 md:h-8 md:w-8" />
            </div>
            <div className="space-y-1 flex-1 min-w-0">
              <h3 className="text-lg md:text-xl font-black text-white uppercase tracking-tight break-words">
                {forcedNotification.title || 'Важное уведомление'}
              </h3>
              <div className="flex items-center gap-2 opacity-30">
                <Clock className="h-3 w-3" />
                <span className="text-[10px] font-black uppercase tracking-widest">
                  {formatDistanceToNow(parseUTCDate(forcedNotification.created_at), { addSuffix: true, locale: ru })}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white/[0.03] p-5 md:p-6 rounded-[1.5rem] border border-white/5 max-h-[50vh] overflow-y-auto">
            <p className="text-sm md:text-base text-white/90 leading-relaxed font-medium break-words whitespace-pre-wrap">
              {forcedNotification.message}
            </p>
          </div>

          <div className={cn(
            "grid gap-3",
            forcedNotification.entity_id && forcedNotification.entity_type === 'service_request'
              ? "grid-cols-1 sm:grid-cols-2"
              : "grid-cols-1"
          )}>
            {forcedNotification.entity_id && forcedNotification.entity_type === 'service_request' && (
              <Button
                className="w-full h-12 md:h-14 rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-500 text-white hover:opacity-90 font-black uppercase tracking-widest text-xs shadow-xl shadow-emerald-900/40 transition-all active:scale-[0.98] border border-emerald-400/20"
                onClick={handleViewRequest}
              >
                Показать служебку
              </Button>
            )}
            <Button
              variant="ghost"
              className="w-full h-12 md:h-14 rounded-2xl text-white/30 hover:text-white hover:bg-white/5 font-black uppercase tracking-widest text-[10px] transition-all"
              onClick={handleClose}
            >
              Закрыть
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
