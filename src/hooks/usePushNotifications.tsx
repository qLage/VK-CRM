import { useCallback, useEffect, useMemo, useState } from 'react';
import { localAPI } from '@/integrations/localAPI';

export function usePushNotifications() {
  const [isLoading, setIsLoading] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');

  const isSupported = useMemo(() => {
    return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;
  }, []);

  const refreshSubscriptionState = useCallback(async () => {
    if (!isSupported) return;
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setIsSubscribed(!!sub);
      setPermission(Notification.permission);
    } catch {
      setIsSubscribed(false);
      setPermission(Notification.permission);
    }
  }, [isSupported]);

  useEffect(() => {
    refreshSubscriptionState();
  }, [refreshSubscriptionState]);

  const subscribe = useCallback(async (): Promise<{ ok: boolean; message?: string }> => {
    if (!isSupported) return { ok: false, message: 'Push не поддерживается' };

    setIsLoading(true);
    try {
      console.log('[Push] Starting subscription...');

      // Rule #2: do NOT auto-request permission on login. Request only on button click.
      console.log('[Push] Requesting notification permission...');
      const permission = await Notification.requestPermission();
      console.log('[Push] Permission result:', permission);

      if (permission !== 'granted') {
        setPermission(permission);
        return { ok: false, message: 'Разрешение на уведомления не выдано' };
      }

      const vapidPublic = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
      console.log('[Push] VAPID key available:', !!vapidPublic);

      if (!vapidPublic) {
        return { ok: false, message: 'VAPID ключ не настроен (VITE_VAPID_PUBLIC_KEY)' };
      }

      console.log('[Push] Waiting for service worker...');
      const reg = await navigator.serviceWorker.ready;
      console.log('[Push] Service worker ready:', reg);

      console.log('[Push] Subscribing to push manager...');
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublic),
      });
      console.log('[Push] Push subscription created:', sub);

      const json = sub.toJSON();
      const endpoint = json.endpoint;
      const keys = json.keys;

      if (!endpoint || !keys?.p256dh || !keys?.auth) {
        return { ok: false, message: 'Некорректная подписка браузера' };
      }

      console.log('[Push] Sending subscription to backend...');
      const { error } = await localAPI.request('/push/subscribe', {
        method: 'POST',
        body: { endpoint, keys },
      });

      if (error) {
        console.error('[Push] Backend error:', error);
        return { ok: false, message: String(error?.message || error) };
      }

      console.log('[Push] ✅ Subscription successful!');
      setIsSubscribed(true);
      setPermission('granted');
      return { ok: true };
    } catch (e: any) {
      console.error('[Push] Subscription error:', e);
      return { ok: false, message: e?.message || 'Ошибка подписки' };
    } finally {
      setIsLoading(false);
    }
  }, [isSupported]);

  const unsubscribe = useCallback(async (): Promise<{ ok: boolean; message?: string }> => {
    if (!isSupported) return { ok: false, message: 'Push не поддерживается' };

    setIsLoading(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (!sub) {
        setIsSubscribed(false);
        return { ok: true };
      }

      const endpoint = sub.endpoint;

      try {
        await sub.unsubscribe();
      } catch {
        // ignore
      }

      await localAPI.request('/push/unsubscribe', {
        method: 'POST',
        body: { endpoint },
      });

      setIsSubscribed(false);
      return { ok: true };
    } catch (e: any) {
      return { ok: false, message: e?.message || 'Ошибка отписки' };
    } finally {
      setIsLoading(false);
    }
  }, [isSupported]);

  return {
    isSupported,
    isSubscribed,
    isLoading,
    permission,
    subscribe,
    unsubscribe,
  };
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}
