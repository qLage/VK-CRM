import { useState } from 'react';
import { useAuth } from './useAuth';
import { toast } from 'sonner';

interface PointsConfig {
  deposit: number;
  deal: number;
  object: number;
  showing: number;
  sale: number;
  purchase: number;
  meeting: number;
  booking: number;
  early_checkin: number;
}

interface WorkSchedule {
  work_days: number;
  early_checkin_time: string;
}

// Local settings stored in memory (persisted via localStorage)
const STORAGE_KEY = 'crm_system_settings';

function loadSettings(): Record<string, Record<string, unknown>> {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
}

function saveSettings(settings: Record<string, Record<string, unknown>>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

export function useSystemSettings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState(loadSettings());
  const [isUpdating, setIsUpdating] = useState(false);

  const getSetting = <T,>(key: string, defaultValue: T): T => {
    return (settings[key] as T) || defaultValue;
  };

  const pointsConfig = getSetting<PointsConfig>('points_config', {
    deposit: 10,
    deal: 50,
    object: 5,
    showing: 5,
    sale: 30,
    purchase: 30,
    meeting: 3,
    booking: 15,
    early_checkin: 2,
  });

  const workSchedule = getSetting<WorkSchedule>('work_schedule', {
    work_days: 22,
    early_checkin_time: '09:30',
  });

  const ratingAutoCalculate = getSetting<{ enabled: boolean; interval_hours: number }>('rating_auto_calculate', {
    enabled: true,
    interval_hours: 24,
  });

  const emailNotifications = getSetting<{ enabled: boolean; daily_summary: boolean }>('email_notifications', {
    enabled: true,
    daily_summary: true,
  });

  const updateSetting = ({ key, value }: { key: string; value: Record<string, unknown> }) => {
    setIsUpdating(true);
    try {
      const updated = { ...settings, [key]: value };
      setSettings(updated);
      saveSettings(updated);
      toast.success('Настройки сохранены');
    } catch (error) {
      console.error('Settings update error:', error);
      toast.error('Ошибка при сохранении настроек');
    } finally {
      setIsUpdating(false);
    }
  };

  return {
    settings: Object.entries(settings).map(([key, value]) => ({ key, value })),
    isLoading: false,
    pointsConfig,
    workSchedule,
    ratingAutoCalculate,
    emailNotifications,
    updateSetting,
    isUpdating,
  };
}
