import { useState } from 'react';
import { motion } from 'framer-motion';
import { Bell, Trophy, FileCheck, AlertCircle, ChevronRight, Clock, CheckCircle, XCircle, Check, Trash2, Eye, Building2, ArrowRightLeft, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNotifications } from '@/hooks/useNotifications';
import { useAuth } from '@/hooks/useAuth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { localAPI } from '@/integrations/localAPI';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Skeleton } from '@/components/ui/skeleton';
import { parseUTCDate } from '@/lib/date-utils';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

const iconMap: Record<string, { icon: typeof Trophy; bgColor: string; iconColor: string }> = {
  success: { icon: CheckCircle, bgColor: 'bg-success/15', iconColor: 'text-success' },
  warning: { icon: AlertCircle, bgColor: 'bg-warning/15', iconColor: 'text-warning' },
  error: { icon: XCircle, bgColor: 'bg-destructive/15', iconColor: 'text-destructive' },
  info: { icon: Bell, bgColor: 'bg-primary/15', iconColor: 'text-primary' },
  rating: { icon: Trophy, bgColor: 'bg-primary/15', iconColor: 'text-primary' },
  report: { icon: FileCheck, bgColor: 'bg-success/15', iconColor: 'text-success' },
};

export function NotificationsCard({ className }: { className?: string }) {
  const { notifications, unreadCount, isLoading, markAsRead, markAllAsRead, deleteAllNotifications } = useNotifications();
  const [selectedNotification, setSelectedNotification] = useState<any>(null);
  const navigate = useNavigate();

  const handleNotificationClick = (notification: any) => {
    setSelectedNotification(notification);
    if (!notification.is_read) {
      markAsRead(notification.id);
    }
  };

  const getEntityButtonLabel = (notification: any): string => {
    if (!notification?.entity_type) return '';
    if (notification.entity_type === 'service_request') return 'Показать служебку';
    if (notification.entity_type === 'property') return 'Показать объект';
    if (notification.entity_type === 'deal') return 'Показать сделку';
    return '';
  };

  const handleOpenEntity = (notification: any) => {
    const entityId = notification?.entity_id;
    if (!entityId) return;

    if (notification.entity_type === 'service_request') {
      navigate(`/service-requests?id=${entityId}`);
      setSelectedNotification(null);
      return;
    }
    if (notification.entity_type === 'property') {
      navigate(`/properties?id=${entityId}`);
      setSelectedNotification(null);
      return;
    }
    if (notification.entity_type === 'deal') {
      navigate(`/deals?id=${entityId}`);
      setSelectedNotification(null);
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-xl md:rounded-[1.5rem] lg:rounded-[2rem] bg-zinc-900/40 border border-white/5 backdrop-blur-3xl overflow-hidden">
        <div className="p-4 md:p-5 lg:p-6">
          <Skeleton className="h-5 md:h-6 w-32 md:w-40" />
        </div>
        <div className="space-y-2 md:space-y-3 px-4 md:px-5 lg:px-6 pb-4 md:pb-5 lg:pb-6">
          {[1, 2, 3].map(i => (
            <div key={i} className="p-3 md:p-4 rounded-xl md:rounded-[1.5rem] bg-white/[0.02] border border-white/5">
              <Skeleton className="h-10 md:h-12 w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Show placeholder if no notifications
  if (notifications.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.35 }}
        className="rounded-xl md:rounded-[1.5rem] lg:rounded-[2rem] bg-zinc-900/40 border border-white/5 backdrop-blur-3xl overflow-hidden"
      >
        <div className="p-4 md:p-5 lg:p-6 border-b border-white/5 flex items-center gap-3">
          <div className="p-2 md:p-2.5 rounded-xl md:rounded-[1.5rem] bg-primary/10 border border-primary/10">
            <Bell className="h-4 w-4 md:h-5 md:w-5 text-primary" />
          </div>
          <span className="font-black text-sm md:text-base text-white uppercase tracking-tight">Уведомления</span>
        </div>
        <div className="p-8 md:p-10 lg:p-12 text-center">
          <Bell className="h-12 w-12 md:h-16 md:w-16 mx-auto text-white/5 mb-4" />
          <p className="text-[10px] md:text-[11px] font-black text-white/20 uppercase tracking-[0.2em]">Нет новых уведомлений</p>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "rounded-xl md:rounded-[1.5rem] lg:rounded-[2rem] bg-zinc-900/40 backdrop-blur-3xl border border-white/5 p-4 md:p-5 lg:p-6 flex flex-col group relative overflow-hidden shadow-2xl transition-all duration-700 hover:bg-zinc-900/60 hover:border-white/10",
        className
      )}
    >
      {/* Background Glow */}
      <div className="absolute top-0 right-0 w-36 md:w-40 lg:w-48 h-36 md:h-40 lg:h-48 bg-primary/10 blur-[80px] rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none group-hover:bg-primary/20 transition-all duration-1000" />

      {/* Header */}
      <div className="relative z-10 flex items-center justify-between mb-4 md:mb-5 shrink-0">
        <div className="flex items-center gap-2.5 md:gap-3">
          <div className="p-2 md:p-2.5 rounded-xl md:rounded-[1.5rem] bg-primary/10 border border-primary/10 transition-all duration-500">
            <Bell className="h-4 w-4 md:h-5 md:w-5 text-primary" />
          </div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm md:text-base font-black tracking-tighter text-white uppercase">
              УВЕДОМЛЕНИЯ
            </h3>
            {unreadCount > 0 && (
              <div className="px-1.5 py-0.5 rounded-full bg-primary/20 border border-primary/30 text-[9px] font-black text-primary">
                {unreadCount}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 md:gap-3">
          {unreadCount > 0 && (
            <button
              onClick={() => markAllAsRead()}
              className="text-[8px] md:text-[9px] font-black uppercase tracking-widest text-white/40 hover:text-primary transition-colors flex items-center gap-1 md:gap-1.5"
            >
              <Check className="h-2.5 w-2.5 md:h-3 md:w-3" />
              <span className="hidden md:inline">ВСЕ</span>
            </button>
          )}

          {notifications.length > 0 && (
            <DeleteAllButton onDelete={deleteAllNotifications} />
          )}
        </div>
      </div>

      {/* Notifications list */}
      <div className="relative z-10 flex-1 overflow-y-auto space-y-2 md:space-y-2.5 pr-0.5 scrollbar-hide">
        {notifications.map((notification, index) => {
          const config = iconMap[notification.type] || iconMap.info;
          const Icon = config.icon;

          return (
            <motion.div
              key={notification.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.08 }}
              className={cn(
                'group/item flex gap-3 md:gap-4 p-3 md:p-4 rounded-xl md:rounded-[1.5rem] transition-all duration-500 cursor-pointer border relative overflow-hidden',
                notification.is_read
                  ? 'bg-white/[0.02] border-white/5 hover:bg-white/[0.04] hover:border-white/10'
                  : 'bg-primary/[0.05] border-primary/20 hover:bg-primary/[0.08] hover:border-primary/30'
              )}
              onClick={() => handleNotificationClick(notification)}
            >
              {/* Subtle unread glow indicator */}
              {!notification.is_read && (
                <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 blur-3xl rounded-full pointer-events-none -mr-16 -mt-16" />
              )}

              <div className={cn('p-2 md:p-2.5 rounded-xl md:rounded-[1.5rem] h-fit shrink-0 border transition-all duration-500 group-hover/item:scale-105 shadow-lg relative z-10',
                config.bgColor.replace('/15', '/10'),
                config.iconColor.replace('text-', 'border-').replace('text-', '') + '/20'
              )}>
                <Icon className={cn('h-4 w-4 md:h-5 md:w-5', config.iconColor)} />
              </div>

              <div className="min-w-0 flex-1 relative z-10">
                <div className="flex flex-col gap-0.5">
                  <h4 className={cn('text-xs md:text-sm font-bold tracking-tight',
                    notification.is_read ? 'text-white/30' : 'text-primary'
                  )}>
                    {notification.title || 'Уведомление'}
                  </h4>
                  <p className={cn('text-[10px] md:text-[11px] font-medium tracking-tight leading-snug line-clamp-2',
                    notification.is_read ? 'text-white/40' : 'text-white/80'
                  )}>
                    {notification.message}
                  </p>
                </div>
                <div className="flex items-center gap-1 md:gap-1.5 mt-1.5 opacity-20 group-hover/item:opacity-40 transition-opacity">
                  <Clock className="h-2 w-2 md:h-2.5 md:w-2.5" />
                  <p className="text-[8px] md:text-[9px] font-bold uppercase tracking-wider">
                    {formatDistanceToNow(parseUTCDate(notification.created_at), { addSuffix: true, locale: ru })}
                  </p>
                </div>
              </div>

              {!notification.is_read && (
                <div className="relative mt-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_15px_rgba(var(--primary),1)]" />
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      <Dialog open={!!selectedNotification} onOpenChange={(open) => !open && setSelectedNotification(null)}>
        <DialogContent className="sm:max-w-md p-0 overflow-hidden rounded-t-[2rem] sm:rounded-[2rem] shadow-2xl">
          <div className="p-5 md:p-6 lg:p-8 space-y-4 md:space-y-5 lg:space-y-6">
            <div className="flex items-center gap-3 md:gap-4 shrink-0">
              <div className={cn(
                "p-2.5 md:p-3 rounded-xl md:rounded-[1.5rem] border bg-white/5 shrink-0",
                selectedNotification && iconMap[selectedNotification.type]?.iconColor
              )}>
                {selectedNotification && (
                  (() => {
                    const ConfigIcon = iconMap[selectedNotification.type]?.icon || Bell;
                    return <ConfigIcon className="h-5 w-5 md:h-6 md:w-6" />;
                  })()
                )}
              </div>
              <div className="space-y-0.5 md:space-y-1 min-w-0 flex-1">
                <h3 className="text-base md:text-lg font-black text-white uppercase tracking-tight break-words">
                  {selectedNotification?.title || 'Уведомление'}
                </h3>
                <div className="flex items-center gap-1.5 md:gap-2 opacity-30">
                  <Clock className="h-2.5 w-2.5 md:h-3 md:w-3" />
                  <span className="text-[9px] md:text-[10px] font-black uppercase tracking-widest">
                    {selectedNotification && formatDistanceToNow(parseUTCDate(selectedNotification.created_at), { addSuffix: true, locale: ru })}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-white/[0.03] p-4 md:p-5 lg:p-6 rounded-xl md:rounded-[1.5rem] border border-white/5 max-h-[40vh] overflow-y-auto">
              <p className="text-xs md:text-sm text-white/80 leading-relaxed font-medium break-words">
                {selectedNotification?.message}
              </p>
            </div>

            {/* Property transfer actions inline */}
            {selectedNotification?.entity_type === 'property' && (
              <PropertyTransferActions
                propertyId={selectedNotification.entity_id}
                onDone={() => setSelectedNotification(null)}
              />
            )}

            <div className={cn(
              "grid gap-2 md:gap-3",
              selectedNotification?.entity_id && getEntityButtonLabel(selectedNotification) ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1"
            )}>
              {selectedNotification?.entity_id && getEntityButtonLabel(selectedNotification) && (
                <Button
                  className="w-full h-11 md:h-12 lg:h-14 rounded-xl md:rounded-[1.5rem] bg-gradient-to-r from-emerald-600 to-teal-500 text-white hover:opacity-90 font-black uppercase tracking-widest text-xs"
                  onClick={() => handleOpenEntity(selectedNotification)}
                >
                  {getEntityButtonLabel(selectedNotification)}
                </Button>
              )}
              <Button
                className="w-full h-11 md:h-12 lg:h-14 rounded-xl md:rounded-[1.5rem] bg-primary hover:bg-primary/90 text-white font-black uppercase tracking-widest text-xs"
                onClick={() => setSelectedNotification(null)}
              >
                Закрыть
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}

function PropertyTransferActions({ propertyId, onDone }: { propertyId: string; onDone: () => void }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Fetch property to find pending transfer for current user
  const { data: property, isLoading } = useQuery({
    queryKey: ['property-transfer-check', propertyId],
    queryFn: async () => {
      const { data } = await localAPI.request(`/properties/${propertyId}`);
      return data as any;
    },
    enabled: !!propertyId,
  });

  const pendingTransfer = property?.transfers?.find((t: any) => t.status === 'pending');

  const actMut = useMutation({
    mutationFn: async (action: 'accept' | 'reject' | 'cancel') => {
      const { error } = await localAPI.request(`/properties/transfers/${pendingTransfer.id}`, {
        method: 'PATCH',
        body: { action },
      });
      if (error) throw error;
      return action;
    },
    onSuccess: (action) => {
      const msgs = { accept: 'Объект принят', reject: 'Передача отклонена', cancel: 'Передача отменена' } as const;
      toast.success(msgs[action]);
      queryClient.invalidateQueries({ queryKey: ['properties'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      onDone();
    },
    onError: () => toast.error('Ошибка'),
  });

  if (isLoading || !pendingTransfer) return null;

  const isRecipient = pendingTransfer.to_user_id === user?.id;
  const isSender = pendingTransfer.from_user_id === user?.id;

  if (!isRecipient && !isSender) return null;

  return (
    <div className="p-4 rounded-xl bg-violet-500/10 border border-violet-500/20 space-y-3">
      <div className="flex items-center gap-2">
        <ArrowRightLeft className="h-4 w-4 text-violet-300" />
        <span className="text-[10px] font-black text-violet-200 uppercase tracking-widest">
          Передача объекта
        </span>
      </div>
      <div className="text-xs text-white/70">
        <p><span className="text-white/40">От:</span> {pendingTransfer.from_name}</p>
        <p><span className="text-white/40">Кому:</span> {pendingTransfer.to_name}</p>
        {property?.address && <p className="mt-1"><span className="text-white/40">Объект:</span> {property.address}</p>}
      </div>

      {isRecipient ? (
        <div className="grid grid-cols-2 gap-2">
          <Button
            disabled={actMut.isPending}
            onClick={() => actMut.mutate('reject')}
            variant="outline"
            className="h-10 rounded-xl border-red-500/30 text-red-300 hover:bg-red-500/10 gap-1.5 text-[10px] font-black uppercase tracking-widest"
          >
            <X className="h-3.5 w-3.5" /> Отклонить
          </Button>
          <Button
            disabled={actMut.isPending}
            onClick={() => actMut.mutate('accept')}
            className="h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 text-[10px] font-black uppercase tracking-widest"
          >
            <Check className="h-3.5 w-3.5" /> Принять
          </Button>
        </div>
      ) : (
        <Button
          disabled={actMut.isPending}
          onClick={() => actMut.mutate('cancel')}
          variant="outline"
          className="w-full h-10 rounded-xl border-white/10 text-white/70 hover:text-white gap-1.5 text-[10px] font-black uppercase tracking-widest"
        >
          <X className="h-3.5 w-3.5" /> Отменить передачу
        </Button>
      )}
    </div>
  );
}

function DeleteAllButton({ onDelete }: { onDelete: () => void }) {  const [confirm, setConfirm] = useState(false);

  if (confirm) {
    return (
      <div className="flex items-center gap-1.5 md:gap-2 bg-destructive/10 rounded-xl md:rounded-[1.5rem] px-2 md:px-3 h-7 md:h-8 animate-in fade-in slide-in-from-right-5 duration-200 shrink-0 border border-destructive/20">
        <span className="text-[9px] md:text-[10px] text-destructive font-bold whitespace-nowrap">Удалить?</span>
        <button
          onClick={() => { onDelete(); setConfirm(false); }}
          className="w-5 h-5 md:w-6 md:h-6 min-w-[20px] min-h-[20px] md:min-w-[24px] md:min-h-[24px] aspect-square flex items-center justify-center rounded-lg md:rounded-[1.5rem] bg-destructive text-white hover:bg-destructive/90 transition-colors shrink-0 p-0 border-none outline-none focus:ring-0 shadow-sm"
          title="Подтвердить"
        >
          <Check className="h-3 w-3 md:h-4 md:w-4" />
        </button>
        <button
          onClick={() => setConfirm(false)}
          className="w-5 h-5 md:w-6 md:h-6 min-w-[20px] min-h-[20px] md:min-w-[24px] md:min-h-[24px] aspect-square flex items-center justify-center rounded-lg md:rounded-[1.5rem] text-white/40 hover:bg-white/5 transition-colors shrink-0 p-0 border-none outline-none focus:ring-0"
          title="Отмена"
        >
          <XCircle className="h-3 w-3 md:h-4 md:w-4" />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirm(true)}
      className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-white/40 hover:text-destructive transition-all flex items-center gap-1 md:gap-1.5 px-2 md:px-3 py-1 md:py-1.5 rounded-xl md:rounded-[1.5rem] hover:bg-destructive/10 border border-transparent"
    >
      <Trash2 className="h-3 w-3 md:h-3.5 md:w-3.5" />
      <span className="hidden sm:inline">ВСЕ</span>
    </button>
  );
}
