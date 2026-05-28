import { sendSmartPush } from '../services/push.service';

interface KpiData {
  deals: number;
  calls: number;
  meetings: number;
}

/**
 * Send push notification when a deal is assigned to a user
 */
async function notifyDealAssigned(userId: string, dealId: string, dealTitle: string): Promise<void> {
  await sendSmartPush(userId, {
    title: 'Новая сделка',
    body: `Вам назначена сделка: ${dealTitle}`,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    url: `/deals/${dealId}`,
    tag: `deal-${dealId}`,
    entityId: `deal-${dealId}`,
  });
}

/**
 * Send push notification when a report is approved/rejected
 */
async function notifyReportStatus(userId: string, reportId: string, status: string, comment?: string): Promise<void> {
  const isApproved = status === 'approved';
  await sendSmartPush(userId, {
    title: isApproved ? 'Служебка одобрена' : 'Служебка отклонена',
    body: isApproved
      ? 'Ваша служебная записка была одобрена'
      : `Причина: ${comment || 'Не указана'}`,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    url: '/finances',
    tag: `report-${reportId}`,
    entityId: `report-${reportId}`,
  });
}

/**
 * Send push notification for upcoming meeting/event
 */
async function notifyUpcomingEvent(userId: string, eventTitle: string, _eventTime: string, eventId: string): Promise<void> {
  await sendSmartPush(userId, {
    title: 'Напоминание о встрече',
    body: `${eventTitle} начнется через 30 минут`,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    url: `/calendar`,
    tag: `event-${eventId}`,
    entityId: `event-${eventId}`,
    requireInteraction: true, // Keep notification visible
  });
}

/**
 * Send push notification when someone comments on a deal
 */
async function notifyNewComment(userId: string, dealId: string, dealTitle: string, authorName: string, commentPreview: string): Promise<void> {
  await sendSmartPush(userId, {
    title: `${authorName} оставил комментарий`,
    body: `${dealTitle}: ${commentPreview}`,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    url: `/deals/${dealId}`,
    tag: `comment-deal-${dealId}`,
    entityId: `comment-deal-${dealId}`,
  });
}

/**
 * Send push notification for daily KPI summary
 */
async function notifyDailyKPI(userId: string, kpiData: KpiData): Promise<void> {
  await sendSmartPush(userId, {
    title: 'Итоги дня',
    body: `Сделок: ${kpiData.deals} | Звонков: ${kpiData.calls} | Встреч: ${kpiData.meetings}`,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    url: '/',
    tag: 'daily-kpi',
    entityId: `daily-kpi-${new Date().toISOString().split('T')[0]}`,
  });
}

/**
 * Send push notification when a payment is received
 */
async function notifyPaymentReceived(userId: string, dealId: string, amount: number, dealTitle: string): Promise<void> {
  await sendSmartPush(userId, {
    title: 'Получен платеж',
    body: `${dealTitle}: ${amount.toLocaleString('ru-RU')} ₽`,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    url: `/deals/${dealId}`,
    tag: `payment-${dealId}`,
    entityId: `payment-${dealId}`,
  });
}

export {
  notifyDealAssigned,
  notifyReportStatus,
  notifyUpcomingEvent,
  notifyNewComment,
  notifyDailyKPI,
  notifyPaymentReceived,
};
