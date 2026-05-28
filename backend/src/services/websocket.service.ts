import WebSocket from 'ws';
import { Server as HTTPServer } from 'http';
import jwt from 'jsonwebtoken';
import { IncomingMessage } from 'http';
import pushService from './push.service';

interface WebSocketMessage {
  type: string;
  token?: string;
  [key: string]: any;
}

interface RedisEvent {
  type: string;
  data?: any;
  userId?: string | null;
  userIds?: string[] | null;
  timestamp?: number;
}

interface BatchedMessage {
  type: string;
  data?: any;
  timestamp: number;
}

interface JWTPayload {
  userId: string;
  role: string;
  [key: string]: any;
}

class WebSocketService {
  wss: WebSocket.Server | null;
  connections: Map<string, Set<WebSocket>>;
  eventBatcher: Map<string, BatchedMessage[]>;
  batchInterval: number;

  constructor() {
    this.wss = null;
    this.connections = new Map();
    this.eventBatcher = new Map();
    this.batchInterval = 1000;
  }

  async initialize(server: HTTPServer): Promise<void> {
    this.wss = new WebSocket.Server({
      server,
      path: '/ws'
    });

    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      this.handleConnection(ws, req);
    });

    // Start batch processor
    setInterval(() => this.processBatches(), this.batchInterval);

    console.log('✅ WebSocket server initialized on /ws (local mode, no Redis Streams)');
  }

  handleConnection(ws: WebSocket, _req: IncomingMessage): void {
    let userId: string | null = null;

    ws.on('message', async (message: WebSocket.Data) => {
      try {
        const data: WebSocketMessage = JSON.parse(message.toString());

        if (data.type === 'auth') {
          const token = data.token;
          try {
            const decoded = jwt.verify(token!, process.env.JWT_SECRET!) as JWTPayload;
            userId = decoded.id;

            if (!this.connections.has(userId)) {
              this.connections.set(userId, new Set());
            }
            this.connections.get(userId)!.add(ws);

            ws.send(JSON.stringify({
              type: 'auth_success',
              userId,
              timestamp: Date.now()
            }));

            console.log(`[WS] SUCCESS: User ${userId} authenticated. Connections: ${this.connections.get(userId)?.size}`);
          } catch (error: any) {
            ws.send(JSON.stringify({
              type: 'auth_error',
              message: 'Invalid token'
            }));
            ws.close();
          }
        } else if (data.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    });

    ws.on('close', () => {
      if (userId && this.connections.has(userId)) {
        this.connections.get(userId)!.delete(ws);
        if (this.connections.get(userId)!.size === 0) {
          this.connections.delete(userId);
        }
        console.log(`WebSocket disconnected: user ${userId}`);
      }
    });

    ws.on('error', (error: Error) => {
      console.error('WebSocket error:', error);
    });
  }

  handleRedisEvent(event: RedisEvent): void {
    const { type, userId, userIds, data } = event;

    if (userId) {
      const connections = this.connections.get(userId);
      const isOnline = connections && connections.size > 0;

      if (isOnline) {
        this.sendToUser(userId, { type, data, timestamp: Date.now() });
      }

      const shouldPush = !isOnline || ['NEW_DEAL', 'NEW_REPORT', 'STATUS_CHANGED', 'URGENT'].includes(type);
      if (shouldPush) {
        pushService.sendSmartPush(userId, {
          title: 'Ваша Крыша CRM',
          body: data?.message || `Новое уведомление: ${type}`,
          type,
          entityId: data?.id || data?.dealId,
          data
        });
      }
    } else if (userIds && Array.isArray(userIds)) {
      userIds.forEach(uid => {
        const connections = this.connections.get(uid);
        const isOnline = connections && connections.size > 0;

        if (isOnline) {
          this.sendToUser(uid, { type, data, timestamp: Date.now() });
        }

        const shouldPush = !isOnline || ['NEW_DEAL', 'NEW_REPORT'].includes(type);
        if (shouldPush) {
          pushService.sendSmartPush(uid, {
            title: 'CRM Update',
            body: data?.message || type,
            type,
            entityId: data?.id,
            data
          });
        }
      });
    } else {
      this.broadcast({ type, data, timestamp: Date.now() });
    }
  }

  sendToUser(userId: string, message: BatchedMessage): void {
    const connections = this.connections.get(userId);
    if (!connections || connections.size === 0) return;

    if (!this.eventBatcher.has(userId)) {
      this.eventBatcher.set(userId, []);
    }
    this.eventBatcher.get(userId)!.push(message);
  }

  processBatches(): void {
    for (const [userId, events] of this.eventBatcher.entries()) {
      if (events.length === 0) continue;

      const connections = this.connections.get(userId);
      if (!connections || connections.size === 0) {
        this.eventBatcher.delete(userId);
        continue;
      }

      const batchMessage = JSON.stringify({
        type: 'batch',
        events,
        count: events.length,
        timestamp: Date.now()
      });

      connections.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(batchMessage);
        }
      });

      this.eventBatcher.set(userId, []);
    }
  }

  broadcast(message: any): void {
    const messageStr = JSON.stringify(message);
    this.wss?.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(messageStr);
      }
    });
  }

  /**
   * Emit event directly (local mode, no Redis Streams)
   */
  async emitEvent(type: string, data?: any, userId: string | null = null, userIds: string[] | null = null): Promise<void> {
    console.log(`[WebSocket] Event emitted (local): ${type}`, { userId, userIds });
    this.handleRedisEvent({ type, data, userId, userIds, timestamp: Date.now() });
  }

  async disconnect(): Promise<void> {
    if (this.wss) this.wss.close();
  }
}

const websocketService = new WebSocketService();

export default websocketService;
