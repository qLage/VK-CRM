import { useState } from 'react';
import { Bell, BellOff, Volume2, VolumeX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useRealtime } from '@/contexts/RealtimeContext';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export function PushNotificationSettings() {
  const { isSupported, isSubscribed, isLoading, permission, subscribe, unsubscribe } = usePushNotifications();
  const { playNotificationSound } = useRealtime();
  const LS_SOUND_KEY = 'crm_notification_sound_enabled';
  const [soundEnabled, setSoundEnabled] = useState(
    localStorage.getItem(LS_SOUND_KEY) !== 'false'
  );

  const handleToggleSubscription = async () => {
    try {
      if (isSubscribed) {
        await unsubscribe();
        toast.success('Уведомления отключены');
      } else {
        await subscribe();
        toast.success('Уведомления включены');
      }
    } catch (error: any) {
      toast.error(error.message || 'Ошибка при изменении настроек уведомлений');
    }
  };

  const handleToggleSound = (enabled: boolean) => {
    setSoundEnabled(enabled);
    localStorage.setItem(LS_SOUND_KEY, enabled.toString());
    if (enabled) {
      playNotificationSound();
      toast.success('Звук уведомлений включен');
    } else {
      toast.success('Звук уведомлений отключен');
    }
  };

  const handleTestSound = () => {
    playNotificationSound();
    toast.info('Тестовый звук');
  };

  if (!isSupported) {
    return (
      <div className="bg-[#111] border border-white/5 rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="h-12 w-12 rounded-xl bg-zinc-900 border border-white/5 flex items-center justify-center">
            <BellOff className="h-6 w-6 text-zinc-600" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Push-уведомления</h3>
            <p className="text-xs text-zinc-500">Не поддерживаются вашим браузером</p>
          </div>
        </div>
        <p className="text-sm text-zinc-400">
          Ваш браузер не поддерживает push-уведомления. Попробуйте использовать современный браузер (Chrome, Firefox, Edge).
        </p>
      </div>
    );
  }

  return (
    <div className="bg-[#111] border border-white/5 rounded-2xl p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={cn(
            "h-12 w-12 rounded-xl border flex items-center justify-center transition-colors",
            isSubscribed ? "bg-emerald-500/10 border-emerald-500/20" : "bg-zinc-900 border-white/5"
          )}>
            <Bell className={cn("h-6 w-6", isSubscribed ? "text-emerald-500" : "text-zinc-600")} />
          </div>
          <div>
            <h3 className="text-lg font-bold text-white">Push-уведомления</h3>
            <p className="text-xs text-zinc-500">
              {isSubscribed ? 'Включены' : 'Отключены'}
            </p>
          </div>
        </div>
      </div>

      {/* Permission Status */}
      {permission === 'denied' && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
          <p className="text-sm text-red-400">
            Вы запретили уведомления для этого сайта. Чтобы включить их, измените настройки браузера.
          </p>
        </div>
      )}

      {/* Subscribe/Unsubscribe Button */}
      <div className="flex items-center justify-between p-4 bg-zinc-900/50 rounded-xl border border-white/5">
        <div>
          <p className="text-sm font-medium text-white">Получать уведомления на устройство</p>
          <p className="text-xs text-zinc-500 mt-1">
            Уведомления будут приходить даже когда приложение закрыто
          </p>
        </div>
        <Button
          onClick={handleToggleSubscription}
          disabled={isLoading || permission === 'denied'}
          className={cn(
            "min-w-[120px] font-medium transition-all",
            isSubscribed
              ? "bg-zinc-800 hover:bg-zinc-700 text-white"
              : "bg-emerald-600 hover:bg-emerald-500 text-white"
          )}
        >
          {isLoading ? (
            <span className="animate-pulse">Загрузка...</span>
          ) : isSubscribed ? (
            <>
              <BellOff className="h-4 w-4 mr-2" />
              Отключить
            </>
          ) : (
            <>
              <Bell className="h-4 w-4 mr-2" />
              Включить
            </>
          )}
        </Button>
      </div>

      {/* Sound Settings */}
      <div className="space-y-3">
        <div className="flex items-center justify-between p-4 bg-zinc-900/50 rounded-xl border border-white/5">
          <div className="flex items-center gap-3">
            {soundEnabled ? (
              <Volume2 className="h-5 w-5 text-emerald-500" />
            ) : (
              <VolumeX className="h-5 w-5 text-zinc-600" />
            )}
            <div>
              <p className="text-sm font-medium text-white">Звук уведомлений</p>
              <p className="text-xs text-zinc-500 mt-1">
                Воспроизводить звук при получении уведомления
              </p>
            </div>
          </div>
          <Switch
            checked={soundEnabled}
            onCheckedChange={handleToggleSound}
          />
        </div>

        {soundEnabled && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleTestSound}
            className="w-full bg-zinc-900 border-white/5 hover:bg-zinc-800 text-white"
          >
            <Volume2 className="h-4 w-4 mr-2" />
            Проверить звук
          </Button>
        )}
      </div>

      {/* Info */}
      <div className="text-xs text-zinc-500 space-y-1">
        <p>• Уведомления работают на телефонах и компьютерах</p>
        <p>• Требуется разрешение браузера на показ уведомлений</p>
        <p>• Звук работает только когда приложение открыто</p>
      </div>
    </div>
  );
}
