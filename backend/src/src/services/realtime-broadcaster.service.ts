import websocketService from './websocket.service';

/**
 * Realtime Broadcaster Service
 *
 * Centralized WebSocket event emission for cross-user real-time updates.
 * Wraps websocketService.emitEvent() with convenient methods for common events.
 *
 * Event types:
 * - deal:created, deal:updated, deal:deleted
 * - plan:distributed, plan:updated
 * - kpi:updated
 */

interface DealEventData {
  id: string;
  [key: string]: any;
}

interface PlanEventData {
  branchId?: string;
  quarter?: number;
  year?: number;
  employeeIds?: string[];
  planId?: string;
  [key: string]: any;
}

interface KpiEventData {
  userId?: string;
  ruleId?: string;
  [key: string]: any;
}

/**
 * Emit deal-related events to all connected users
 * @param action - The action performed (created, updated, deleted)
 * @param dealData - Deal data to broadcast
 * @param userId - Optional specific user ID (for targeted updates). If omitted, broadcasts to all.
 */
export function emitDealEvent(action: 'created' | 'updated' | 'deleted', dealData: DealEventData, userId?: string): void {
  try {
    const eventType = `deal:${action}`;
    websocketService.emitEvent(eventType, dealData, userId || null);
    console.log(`[RealtimeBroadcaster] Deal event emitted: ${eventType}`, dealData);
  } catch (error) {
    console.warn(`Failed to emit deal event (${action}):`, error);
  }
}

/**
 * Emit plan-related events to specified users or all users
 * @param action - The action performed (distributed, updated)
 * @param planData - Plan data to broadcast
 * @param userIds - Optional array of user IDs for targeted updates. If omitted, broadcasts to all.
 */
export function emitPlanEvent(action: 'distributed' | 'updated', planData: PlanEventData, userIds?: string[]): void {
  try {
    const eventType = `plan:${action}`;
    // For plan events, we typically want to target specific users
    // If userIds provided, send to those users; otherwise broadcast to all
    websocketService.emitEvent(eventType, planData, null, userIds || null);
  } catch (error) {
    console.warn(`Failed to emit plan event (${action}):`, error);
  }
}

/**
 * Emit KPI-related events to specified users or all users
 * @param action - The action performed (updated, settings_updated)
 * @param kpiData - KPI data to broadcast
 * @param userIds - Optional array of user IDs for targeted updates. If omitted, broadcasts to all.
 */
export function emitKpiEvent(action: 'updated' | 'settings_updated', kpiData: KpiEventData, userIds?: string[]): void {
  try {
    const eventType = `kpi:${action}`;
    websocketService.emitEvent(eventType, kpiData, null, userIds || null);
    console.log(`[RealtimeBroadcaster] KPI event emitted: ${eventType}`, kpiData);
  } catch (error) {
    console.warn(`Failed to emit KPI event (${action}):`, error);
  }
}

/**
 * Check if WebSocket service is available
 * @returns true if WebSocket is initialized and ready
 */
export function isWebSocketAvailable(): boolean {
  try {
    return websocketService.wss !== null;
  } catch {
    return false;
  }
}

export default {
  emitDealEvent,
  emitPlanEvent,
  emitKpiEvent,
  isWebSocketAvailable
};
