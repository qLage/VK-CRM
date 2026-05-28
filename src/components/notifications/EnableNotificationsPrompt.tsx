import { useMemo, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';

const LS_PUSH_PROMPT_DISMISSED = 'push_prompt_dismissed_v1';
const LS_SOUND_ENABLED = 'crm_notification_sound_enabled';

export function EnableNotificationsPrompt() {
  const { user } = useAuth();
  const { isSupported, isLoading, subscribe } = usePushNotifications();
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(LS_PUSH_PROMPT_DISMISSED) === 'true');

  const shouldShow = useMemo(() => {
    if (!user) return false;
    if (dismissed) return false;
    return true;
  }, [user, dismissed]);

  if (!shouldShow) return null;

  const enableSound = async () => {
    localStorage.setItem(LS_SOUND_ENABLED, 'true');
    // Try a short preview sound (best-effort; may be blocked until gesture)
    try {
      const audio = new Audio('/notification.mp3');
      audio.volume = 0.8;

      // Wait for audio to load before playing
      await new Promise((resolve, reject) => {
        audio.addEventListener('canplaythrough', resolve, { once: true });
        audio.addEventListener('error', reject, { once: true });
        audio.load();
      });

      await audio.play();
      toast.success('Звук включен');
    } catch (error) {
      console.warn('Notification sound error:', error);
      toast.info('Звук включен (файл звука отсутствует или браузер заблокировал)');
    }
  };

  const onEnablePush = async () => {
    if (!isSupported) {
      toast.error('Push уведомления не поддерживаются в этом браузере');
      return;
    }

    const res = await subscribe();
    if (res.ok) {
      toast.success('Уведомления включены');
      localStorage.setItem(LS_PUSH_PROMPT_DISMISSED, 'true');
      setDismissed(true);
    } else {
      toast.error(res.message || 'Не удалось включить уведомления');
    }
  };

  const dismiss = () => {
    localStorage.setItem(LS_PUSH_PROMPT_DISMISSED, 'true');
    setDismissed(true);
  };

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto max-w-xl">
      <Card className="border border-border/60 bg-background/95 p-4 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/80">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="text-sm font-semibold">Уведомления</div>
            <div className="text-xs text-muted-foreground">
              Включи push на телефон/ПК и звук внутри сайта (по желанию).
            </div>
          </div>

          <div className="flex flex-wrap gap-2 sm:justify-end">
            <Button variant="secondary" size="sm" onClick={enableSound}>
              Включить звук
            </Button>
            <Button size="sm" onClick={onEnablePush} disabled={isLoading}>
              {isLoading ? 'Подключаю…' : 'Включить уведомления'}
            </Button>
            <Button variant="ghost" size="sm" onClick={dismiss}>
              Позже
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}
