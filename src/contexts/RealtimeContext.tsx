import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '../hooks/useAuth';

// Простой хук WebSocket вынесен прямо сюда для простоты и контроля,
// так как вся логика теперь завязана на React Query
const WS_URL = (import.meta.env.VITE_WS_URL || (
  window.location.protocol === 'https:'
    ? `wss://${window.location.host}/ws`
    : `ws://127.0.0.1:5000/ws`
)).replace('localhost', '127.0.0.1').replace('0.0.0.0', '127.0.0.1');


interface RealtimeContextType {
    isConnected: boolean;
    playNotificationSound: () => void;
    forcedNotification: any;
    setForcedNotification: (notif: any) => void;
}

const RealtimeContext = createContext<RealtimeContextType | null>(null);

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const [isConnected, setIsConnected] = useState(false);
    const [forcedNotification, setForcedNotification] = useState<any>(null);
    const processedNotifications = useRef<Set<string>>(new Set());
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const isAudioUnlocked = useRef(false);

    const LS_SOUND_KEY = 'crm_notification_sound_enabled';
    const SOUND_PATH = '/notification.mp3';

    // Initialize audio element and set up unlock mechanism
    useEffect(() => {
        const initAudio = () => {
            try {
                audioRef.current = new Audio(SOUND_PATH);
                audioRef.current.volume = 0.5;
                audioRef.current.load();
                
                audioRef.current.addEventListener('error', (e) => {
                    console.warn('[Realtime] Sound file error:', e);
                    audioRef.current = null;
                });
            } catch (error) {
                console.warn('[Realtime] Failed to init audio:', error);
            }
        };

        const unlockAudio = () => {
            if (isAudioUnlocked.current) return;
            
            // 1. Unlock Web Audio API
            try {
                const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
                if (AudioCtx) {
                    audioContextRef.current = new AudioCtx();
                    if (audioContextRef.current.state === 'suspended') {
                        audioContextRef.current.resume();
                    }
                }
            } catch (e) {
                console.warn('[Realtime] Failed to unlock AudioContext:', e);
            }
            // 2. Unlock HTML5 Audio
            if (audioRef.current) {
                audioRef.current.play()
                    .then(() => {
                        audioRef.current!.pause();
                        audioRef.current!.currentTime = 0;
                        isAudioUnlocked.current = true;
                        console.log('[Realtime] 🔊 Audio unlocked successfully');
                        cleanup();
                    })
                    .catch(() => {
                        // Silent fail if blocked
                    });
            }
        };

        const cleanup = () => {
            window.removeEventListener('click', unlockAudio);
            window.removeEventListener('keydown', unlockAudio);
            window.removeEventListener('touchstart', unlockAudio);
        };

        initAudio();
        window.addEventListener('click', unlockAudio, { once: true });
        window.addEventListener('keydown', unlockAudio, { once: true });
        window.addEventListener('touchstart', unlockAudio, { once: true });

        return cleanup;
    }, []);

    const playNotificationSound = () => {
        try {
            // Check if sound is enabled
            const soundEnabled = localStorage.getItem(LS_SOUND_KEY) !== 'false';
            if (!soundEnabled) return;

            if (audioRef.current && isAudioUnlocked.current) {
                audioRef.current.currentTime = 0;
                audioRef.current.play().catch(err => {
                    console.warn('[Realtime] MP3 Play failed, using premium chime fallback:', err);
                    playStandardChime();
                });
            } else {
                // If not unlocked or MP3 missing, play premium chime
                playStandardChime();
            }
        } catch (error) {
            console.error('[Realtime] Error playing sound:', error);
            playStandardChime();
        }
    };

    const playStandardChime = () => {
        try {
            const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
            if (!AudioCtx) return;
            
            const audioContext = new AudioCtx();
            const now = audioContext.currentTime;

            // Generate a soft chord (C5 + E5 + G5) for a premium "ting" sound
            const createTone = (freq: number, volume: number, length: number) => {
                const osc = audioContext.createOscillator();
                const gain = audioContext.createGain();

                osc.connect(gain);
                gain.connect(audioContext.destination);

                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, now);

                gain.gain.setValueAtTime(0, now);
                gain.gain.linearRampToValueAtTime(volume, now + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.001, now + length);

                osc.start(now);
                osc.stop(now + length);
            };

            // Play C Major chord: C5(523), E5(659), G5(783.99)
            createTone(523.25, 0.1, 0.6);
            createTone(659.25, 0.08, 0.6);
            createTone(783.99, 0.1, 0.6);
        } catch (error) {
            console.error('Standard chime failed:', error);
        }
    };

    useEffect(() => {
        let ws: WebSocket;
        let eventSource: EventSource;
        let reconnectTimer: NodeJS.Timeout;
        let pingInterval: NodeJS.Timeout;

        // Unified notification processor for both SSE and WebSocket
        const processIncomingNotification = (data: any) => {
            const notification = data.notification || data;
            const notificationId = notification?.id;

            // Simple deduplication logic to prevent dual processing from WS and SSE
            if (notificationId) {
                if (processedNotifications.current.has(notificationId)) {
                    return;
                }
                processedNotifications.current.add(notificationId);
                // Clear from memory after 1 minute
                setTimeout(() => {
                    processedNotifications.current.delete(notificationId);
                }, 60000);
            }

            console.log('🔔 [Realtime] Processing incoming notification:', data);

            // Invalidate notification queries with high priority
            console.info('🔄 [Realtime] Invalidating notifications list and unread count...');
            queryClient.invalidateQueries({ 
                queryKey: ['notifications'],
                refetchType: 'all'
            });
            queryClient.invalidateQueries({ 
                queryKey: ['notifications', 'unread'],
                refetchType: 'all'
            });

            // Force refetch after a small delay to ensure DB consistency
            setTimeout(() => {
                queryClient.invalidateQueries({ queryKey: ['notifications'], refetchType: 'all' });
            }, 500);

            // Play notification sound
            playNotificationSound();

            // Truncate long messages
            const truncate = (text: string, limit: number = 200) => {
                if (!text) return '';
                return text.length > limit ? text.substring(0, limit) + '...' : text;
            };

            const title = notification.title || 'Уведомление';
            const message = truncate(notification.message || notification.body || (data.title ? '' : (data.message || '')), 200);
            const type = notification.type || 'info';

            // Show toast with proper icon and truncated description
            const toastMap: Record<string, any> = {
                success: toast.success,
                warning: toast.warning,
                error: toast.error,
                info: toast.info,
            };

            const toastFn = toastMap[type] || toast.info;
            toastFn(title, {
                description: message,
            });

            // Handle forced notification
            if (notification.is_forced || data.is_forced) {
                console.info('🚀 [Realtime] Forced notification detected! Triggering modal...');
                setForcedNotification(notification);
            }
        };

        const connect = () => {
            // Stop if user is not logged in
            if (!user) {
                if (import.meta.env.DEV) console.log('ℹ️ [Realtime] No user session, skipping connection');
                setIsConnected(false);
                return;
            }

            const token = localStorage.getItem('auth_token') || localStorage.getItem('token');
            if (!token) {
                if (import.meta.env.DEV) console.warn('⚠️ [Realtime] No auth token found, skipping connection');
                setIsConnected(false);
                return;
            }

            // 1. WebSocket Connection
            try {
                ws = new WebSocket(WS_URL);
                ws.onopen = () => {
                    setIsConnected(true);
                    console.log('✅ [Realtime] WebSocket connected');
                    ws.send(JSON.stringify({ type: 'auth', token }));
                    pingInterval = setInterval(() => {
                        if (ws.readyState === WebSocket.OPEN) {
                            ws.send(JSON.stringify({ type: 'ping' }));
                        }
                    }, 30000);
                };
                ws.onmessage = (event) => {
                    try {
                        const message = JSON.parse(event.data);
                        handleRealtimeEvent(message);
                    } catch (e) {
                        console.error('[Realtime] Failed to parse WS message:', e);
                    }
                };
                ws.onclose = () => {
                    setIsConnected(false);
                    console.log('🔴 [Realtime] WebSocket disconnected, reconnecting...');
                    clearInterval(pingInterval);
                    reconnectTimer = setTimeout(connect, 5000);
                };
                ws.onerror = (error) => {
                    console.error('[Realtime] WebSocket error:', error);
                    ws.close();
                };
            } catch (err) {
                console.error('[Realtime] Failed to connect to WS:', err);
                reconnectTimer = setTimeout(connect, 5000);
            }

            // 2. SSE Connection (EventSource)
            try {
                const rawApiBaseUrl = import.meta.env.PROD ? '/api' : (import.meta.env.VITE_API_URL || 'http://127.0.0.1:5000/api');
                const apiBaseUrl = rawApiBaseUrl.replace('localhost', '127.0.0.1');
                const sseUrl = `${apiBaseUrl}/notifications/stream?token=${token}`;
                console.log('🔌 [Realtime] Connecting to SSE:', sseUrl);

                eventSource = new EventSource(sseUrl, {
                    withCredentials: true
                });

                eventSource.onopen = () => {
                    console.log('✅ [Realtime] SSE Connection opened');
                };

                eventSource.onmessage = (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        if (data.type === 'NOTIFICATION_RECEIVED') {
                            processIncomingNotification(data);
                        } else if (data.type) {
                            handleRealtimeEvent(data);
                        }
                    } catch (e) {
                        console.error('[Realtime] ❌ SSE Error parsing:', e);
                    }
                };

                eventSource.onerror = (err) => {
                    console.error('[Realtime] ❌ SSE Connection Error:', err);
                    eventSource.close();
                    // Reconnection handled automatically by browser for EventSource
                };
            } catch (err) {
                console.error('[Realtime] ❌ Failed to connect to SSE:', err);
            }
        };

        connect();

        // Функция обработки событий из Redis -> Node.js -> WebSocket
        const handleRealtimeEvent = (message: any) => {
            const { type, data } = message;

            if (type === 'pong' || type === 'auth_success' || type === 'auth_error') return;

            // Обработка батчей (оптимизация Node.js бэкенда)
            if (type === 'batch' && message.events) {
                message.events.forEach((msg: any) => handleRealtimeEvent(msg));
                return;
            }

            if (import.meta.env.DEV) {
                console.info('🔌 [Realtime] Handle event:', type);
            }

            // Handle NOTIFICATION_RECEIVED from WS too
            if (type === 'NOTIFICATION_RECEIVED') {
                processIncomingNotification(data || message);
                return;
            }

            switch (type) {
                // ПЛАНЫ И KPI - ИНВАЛИДАЦИЯ КЭША
                case 'plan:distributed':
                case 'plan:updated':
                    // Invalidate all plan-related queries (including those with dynamic parameters)
                    queryClient.invalidateQueries({
                        predicate: (query) => {
                            const key = query.queryKey[0];
                            const planKeys = ['quarterly-plan', 'plan-allocations', 'all-branch-plans',
                                'rating-all-user-plans', 'team-user-plans', 'analytics-targets', 'dashboard-stats'];
                            return planKeys.includes(key as string);
                        }
                    });
                    break;

                case 'kpi:updated':
                case 'kpi:settings_updated':
                    // Immediately update cache with new KPI values from the event
                    // This ensures UI updates instantly without waiting for refetch
                    if (data?.employeeId && (data.personal_kpi_current !== undefined || data.management_kpi_current !== undefined)) {
                        if (import.meta.env.DEV) {
                            console.log('[kpi:updated] Updating cache with event data:', data);
                        }

                        // Update dual-kpi query cache if it exists
                        queryClient.setQueryData(['dual-kpi', data.employeeId], (oldData: any) => {
                            if (!oldData) return oldData;
                            return {
                                ...oldData,
                                personal: data.personal_kpi_current !== undefined
                                    ? { ...oldData.personal, tierPercent: parseFloat(data.personal_kpi_current) }
                                    : oldData.personal,
                                management: data.management_kpi_current !== undefined
                                    ? { ...oldData.management, managementPercent: parseFloat(data.management_kpi_current) }
                                    : oldData.management,
                                totalIncome: data.personal_kpi_current !== undefined || data.management_kpi_current !== undefined
                                    ? (oldData.totalIncome || 0) // Recalculate if needed
                                    : oldData.totalIncome,
                            };
                        });

                        // Update my-kpi-stats-detailed query cache
                        queryClient.setQueryData(['my-kpi-stats-detailed', data.employeeId], (oldData: any) => {
                            if (!oldData) return oldData;
                            return {
                                ...oldData,
                                personal_kpi_current: data.personal_kpi_current ?? oldData.personal_kpi_current,
                                management_kpi_current: data.management_kpi_current ?? oldData.management_kpi_current,
                            };
                        });

                        // Update kpi-stats-realtor query cache (used by KPIStats widget)
                        // This is critical for immediate UI updates in the dashboard KPI widget
                        queryClient.setQueryData(['kpi-stats-realtor', 'quarter', 'v17'], (oldData: any) => {
                            if (!oldData) return oldData;
                            return {
                                ...oldData,
                                metrics: {
                                    ...oldData.metrics,
                                    // Update currentPercent if personal_kpi_current changed
                                    currentPercent: data.personal_kpi_current !== undefined
                                        ? parseFloat(data.personal_kpi_current)
                                        : oldData.metrics.currentPercent,
                                },
                            };
                        });

                        // Update kpi-stats-realtor-income query cache
                        queryClient.setQueryData(['kpi-stats-realtor-income', 'quarter'], (oldData: any) => {
                            if (!oldData) return oldData;
                            return {
                                ...oldData,
                                metrics: {
                                    ...oldData.metrics,
                                    currentPercent: data.personal_kpi_current !== undefined
                                        ? parseFloat(data.personal_kpi_current)
                                        : oldData.metrics.currentPercent,
                                },
                            };
                        });

                        // Update kpi-stats-realtor-income query cache for month period
                        queryClient.setQueryData(['kpi-stats-realtor-income', 'month'], (oldData: any) => {
                            if (!oldData) return oldData;
                            return {
                                ...oldData,
                                metrics: {
                                    ...oldData.metrics,
                                    currentPercent: data.personal_kpi_current !== undefined
                                        ? parseFloat(data.personal_kpi_current)
                                        : oldData.metrics.currentPercent,
                                },
                            };
                        });
                    }

                    // Invalidate all KPI-related queries to trigger refetch
                    // Using predicate to match all query keys that start with these prefixes
                    if (import.meta.env.DEV) {
                        console.log('[kpi:updated] Invalidating KPI queries, event data:', data);
                        console.log('[kpi:updated] All active query keys:', queryClient.getQueryCache().getAll().map(q => q.queryKey));
                    }
                    queryClient.invalidateQueries({
                        predicate: (query) => {
                            const key = query.queryKey[0];
                            const kpiKeys = ['kpi-stats-realtor', 'kpi-stats-realtor-income', 'dual-kpi-stats',
                                'dashboard-kpi-stats', 'my-kpi-stats-detailed', 'kpi', 'dual-kpi',
                                'employees', 'employee', 'employee-deal-stats'];
                            const matches = kpiKeys.includes(key as string);
                            if (import.meta.env.DEV) {
                                console.log(`[kpi:updated] Checking query:`, query.queryKey, '-> matches:', matches);
                            }
                            return matches;
                        },
                        // Force refetch even for queries within staleTime
                        refetchType: 'active',
                    });
                    break;

                // УВЕДОМЛЕНИЯ О ГОТОВНОСТИ ОТЧЕТОВ / ТЯЖЕЛЫХ ФАЙЛОВ
                case 'REPORT_READY':
                    playNotificationSound(); // Play sound for reports too
                    toast.success(data?.payload?.message || 'Отчет готов!', {
                        action: data?.payload?.result?.url ? {
                            label: 'Скачать',
                            onClick: () => window.open(data.payload.result.url, '_blank')
                        } : undefined,
                        duration: 10000
                    });
                    break;

                case 'ERROR':
                    toast.error(data?.payload?.message || 'Произошла ошибка в фоновой задаче');
                    break;

                // ИНВАЛИДАЦИЯ КЭША REACT QUERY И АТОМАРНЫЕ ОБНОВЛЕНИЯ
                case 'deal:created':
                case 'deal:updated':
                case 'deal:deleted':
                    // Атомарно обновляем конкретную сделку в кэше листа сделок,
                    // не делая новый API запрос на backend!
                    if (type === 'deal:updated' && data?.id) {
                        queryClient.setQueryData(['deals'], (oldData: any) => {
                            if (!Array.isArray(oldData)) return oldData;
                            return oldData.map((d: any) => d.id === data.id ? { ...d, ...data } : d);
                        });
                        // Also atomically update all drill-down-detailed caches (used by Deals page)
                        queryClient.setQueriesData(
                            { queryKey: ['drill-down-detailed'] },
                            (oldData: any) => {
                                if (!oldData || !Array.isArray(oldData.rows)) return oldData;
                                return {
                                    ...oldData,
                                    rows: oldData.rows.map((d: any) => d.id === data.id ? { ...d, ...data } : d)
                                };
                            }
                        );
                    }

                    if (type === 'deal:deleted' && data?.id) {
                        // Remove deleted deal from all drill-down-detailed caches
                        queryClient.setQueriesData(
                            { queryKey: ['drill-down-detailed'] },
                            (oldData: any) => {
                                if (!oldData || !Array.isArray(oldData.rows)) return oldData;
                                return {
                                    ...oldData,
                                    rows: oldData.rows.filter((d: any) => d.id !== data.id)
                                };
                            }
                        );
                    }

                    // Invalidate all deal-related queries (including those with dynamic parameters)
                    queryClient.invalidateQueries({
                        predicate: (query) => {
                            const key = query.queryKey[0];
                            const dealKeys = ['role-based-deals', 'role-based-totals', 'my-deals', 'my-deals-totals',
                                'team-deals', 'team-deals-totals', 'branch-deals', 'branch-deals-totals',
                                'company-deals', 'company-deals-totals', 'drill-down-grouped', 'drill-down-detailed',
                                'drill-down-totals', 'grouped-deals', 'deals', 'deals-pending-count',
                                'deal-teams-summary', 'employee-deal-stats'];
                            return dealKeys.includes(key as string);
                        },
                        refetchType: 'all',
                    });

                    // Deal updates also affect finance widgets and counters.
                    queryClient.invalidateQueries({ queryKey: ['finance-stats'] });
                    queryClient.invalidateQueries({ queryKey: ['finance-analytics'] });

                    // Также инвалидируем аналитику и KPI
                    // Важно: deal mutations affect ALL KPI queries, not just ['kpi'] and ['dual-kpi']
                    queryClient.invalidateQueries({
                        predicate: (query) => {
                            const key = query.queryKey[0];
                            // Full list of KPI query keys that depend on deal data
                            const kpiKeys = ['analytics', 'kpi', 'dual-kpi',
                                'kpi-stats-realtor', 'kpi-stats-realtor-income',
                                'dual-kpi-stats', 'my-kpi-stats-detailed',
                                'dashboard-kpi-stats'];
                            return kpiKeys.includes(key as string);
                        }
                    });
                    break;

                case 'lead:created':
                case 'lead:updated':
                case 'lead:deleted':
                    queryClient.invalidateQueries({ queryKey: ['leads'] });
                    break;

                // ОБЪЕКТЫ (PROPERTIES) - инвалидация в реальном времени
                case 'property:created':
                case 'property:updated':
                case 'property:deleted':
                case 'property:status_changed':
                    queryClient.invalidateQueries({
                        predicate: (query) => {
                            const key = query.queryKey[0];
                            const propKeys = [
                                'properties',
                                'property-detail',
                                'properties-pending-count',
                                'my-properties-widget',
                                'property-stats',
                                'service-requests-pending-count',
                                'notifications',
                            ];
                            return propKeys.includes(key as string);
                        },
                        refetchType: 'all',
                    });
                    break;

                // ПРОФИЛЬ / АВАТАР - заставляем обновиться картинку и связанные списки
                case 'profile:avatar_updated':
                case 'profile:updated':
                    queryClient.invalidateQueries({
                        predicate: (query) => {
                            const key = query.queryKey[0];
                            const profileKeys = [
                                'employees',
                                'employee',
                                'profile',
                                'profiles',
                                'team-members',
                                'properties',         // owner_avatar в карточках
                                'property-detail',
                                'service-requests',   // author_avatar
                                'reports',
                            ];
                            return profileKeys.includes(key as string);
                        }
                    });

                    // Принудительно обновляем все <img> с аватаром этого пользователя:
                    // меняем src, добавляя свежий cache-buster.
                    if (data?.id) {
                        try {
                            const userId = data.id;
                            const newVer = data.version || Date.now();
                            const imgs = document.querySelectorAll<HTMLImageElement>('img');
                            imgs.forEach((img) => {
                                const src = img.getAttribute('src') || '';
                                if (src.includes(`/api/profiles/${userId}/avatar`)) {
                                    const base = src.split('?')[0];
                                    img.setAttribute('src', `${base}?v=${newVer}`);
                                }
                            });
                        } catch (e) {
                            // ignore
                        }
                    }

                    // If current user's profile/position changed, force auth context refresh
                    // to recalculate access level and permissions immediately.
                    if (data?.id && user?.id && String(data.id) === String(user.id)) {
                        window.dispatchEvent(new Event('auth:refresh'));
                    }
                    break;

                case 'notification':
                    // Инвалидируем только не прочитанные
                    queryClient.invalidateQueries({ queryKey: ['notifications', 'unread'] });
                    break;

                case 'client-access-changed':
                    queryClient.invalidateQueries({ queryKey: ['client-access-check'] });
                    queryClient.invalidateQueries({ queryKey: ['client-restrictions'] });
                    break;

                case 'audit:created':
                    console.log('[Realtime] audit:created received, invalidating audit queries');
                    queryClient.invalidateQueries({ queryKey: ['audit'], refetchType: 'all' });
                    toast.info('Новая запись в аудите', { description: 'Таблица обновлена' });
                    break;

                default:
                    if (import.meta.env.DEV) {
                        console.log('Unhandled realtime event:', type, data);
                    }
            }
        };

        return () => {
            clearTimeout(reconnectTimer);
            clearInterval(pingInterval);
            if (ws) ws.close();
            if (eventSource) eventSource.close();
        };
    }, [queryClient, user]);

    const value = {
        isConnected,
        playNotificationSound,
        forcedNotification,
        setForcedNotification
    };

    return (
        <RealtimeContext.Provider value={value}>
            {children}
        </RealtimeContext.Provider>
    );
}

export function useRealtime() {
    const context = useContext(RealtimeContext);
    if (!context) {
        throw new Error('useRealtime must be used within RealtimeProvider');
    }
    return context;
}
