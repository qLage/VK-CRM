import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useNotifications } from '@/hooks/useNotifications';
import { formatDistanceToNow } from 'date-fns';
import { ru } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { parseUTCDate } from '@/lib/date-utils';

const typeConfig = {
  success: { color: 'bg-success/15 text-success' },
  warning: { color: 'bg-warning/15 text-warning' },
  error: { color: 'bg-destructive/15 text-destructive' },
  info: { color: 'bg-primary/15 text-primary' },
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const { notifications, unreadCount, isLoading, markAsRead, markAllAsRead } = useNotifications();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute -top-0.5 -right-0.5 w-5 h-5 bg-primary rounded-full flex items-center justify-center"
            >
              <span className="text-[10px] font-bold text-primary-foreground">{unreadCount > 9 ? '9+' : unreadCount}</span>
            </motion.span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader className="pb-4 border-b border-border/50">
          <div className="flex items-center justify-between">
            <SheetTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" />
              Уведомления
            </SheetTitle>
            {unreadCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => markAllAsRead()}
                className="text-xs"
              >
                <Check className="h-3 w-3 mr-1" />
                Прочитать все
              </Button>
            )}
          </div>
        </SheetHeader>

        <div className="mt-4 space-y-2 max-h-[calc(100vh-150px)] overflow-y-auto pr-2">
          {isLoading ? (
            <>
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-20 rounded-xl" />
              ))}
            </>
          ) : notifications.length === 0 ? (
            <div className="text-center py-12">
              <Bell className="h-12 w-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground">Нет уведомлений</p>
            </div>
          ) : (
            <AnimatePresence>
              {notifications.map((notification, index) => {
                const config = typeConfig[notification.type as keyof typeof typeConfig] || typeConfig.info;
                const timeAgo = formatDistanceToNow(parseUTCDate(notification.created_at), {
                  addSuffix: true,
                  locale: ru
                });

                return (
                  <motion.div
                    key={notification.id}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    onClick={() => !notification.is_read && markAsRead(notification.id)}
                    className={cn(
                      'p-4 rounded-xl cursor-pointer transition-colors',
                      notification.is_read
                        ? 'bg-secondary/30 hover:bg-secondary/50'
                        : 'bg-primary/5 hover:bg-primary/10 border border-primary/20'
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className={cn('p-2 rounded-lg shrink-0', config.color)}>
                        <Bell className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className={cn('text-sm', !notification.is_read && 'font-semibold')}>
                            {notification.title}
                          </p>
                          {!notification.is_read && (
                            <div className="w-2 h-2 rounded-full bg-primary shrink-0" />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {notification.message}
                        </p>
                        <p className="text-[10px] text-muted-foreground mt-2">
                          {timeAgo}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
