import { Bell, BellOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export function NotificationToggle() {
  const { isSupported, isSubscribed, isLoading, permission, subscribe, unsubscribe } = usePushNotifications();

  const handleToggle = async () => {
    try {
      if (isSubscribed) {
        await unsubscribe();
        toast.success('Уведомления отключены');
      } else {
        await subscribe();
        toast.success('Уведомления включены');
      }
    } catch (error: any) {
      // Handle permission denied specifically
      if (error.message?.includes('permission denied') || error.message?.includes('Permission denied')) {
        toast.error('Вы запретили уведомления. Разрешите их в настройках браузера.', {
          duration: 5000,
        });
      } else {
        toast.error(error.message || 'Ошибка при изменении настроек уведомлений');
      }
    }
  };

  if (!isSupported) {
    return null;
  }

  // Show a message if permission is denied
  if (permission === 'denied') {
    return (
      <div className="relative group">
        <Button
          variant="outline"
          size="icon"
          disabled
          className="h-9 w-9 md:h-10 md:w-10 lg:h-12 lg:w-12 rounded-xl md:rounded-2xl border-red-500/20 bg-red-500/10 text-red-500 opacity-50 cursor-not-allowed"
          title="Уведомления заблокированы в браузере"
        >
          <BellOff className="h-3.5 w-3.5 md:h-4 md:w-4" />
        </Button>
        <div className="absolute right-0 bottom-full mb-2 w-64 p-3 bg-zinc-900 border border-red-500/20 rounded-xl text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50 shadow-xl">
          <p className="font-bold text-red-400 mb-1">Уведомления заблокированы</p>
          <p className="text-zinc-400">Разрешите уведомления в настройках браузера, затем обновите страницу</p>
        </div>
      </div>
    );
  }

  return (
    <Button
      variant="outline"
      size="icon"
      onClick={handleToggle}
      disabled={isLoading || permission === 'denied'}
      className={cn(
        "h-9 w-9 md:h-10 md:w-10 lg:h-12 lg:w-12 rounded-xl md:rounded-2xl transition-all duration-300",
        isSubscribed
          ? "border-emerald-500/20 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-500"
          : "border-white/5 bg-white/5 hover:bg-white/10 text-white/40"
      )}
      title={isSubscribed ? 'Отключить уведомления' : 'Включить уведомления'}
    >
      {isLoading ? (
        <div className="h-3.5 w-3.5 md:h-4 md:w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : isSubscribed ? (
        <Bell className="h-3.5 w-3.5 md:h-4 md:w-4" />
      ) : (
        <BellOff className="h-3.5 w-3.5 md:h-4 md:w-4" />
      )}
    </Button>
  );
}
