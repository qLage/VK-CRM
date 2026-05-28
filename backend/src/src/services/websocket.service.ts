import WebSocket from 'ws';
import { Server as HTTPServer } from 'http';
import jwt from 'jsonwebtoken';
import Redis from 'ioredis';
import { IncomingMessage } from 'http';
import pushService from './push.service';

const STREAM_NAME = 'crm:ws:events';
const CONSUMER_GROUP = 'ws_nodes';
const CONSUMER_NAME = `node_${process.pid}`; // Unique identifier for each process instance

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
  redisStream: Redis | null;
  redisPub: Redis | null;
  streamActive: boolean;

  constructor() {
    this.wss = null;
    this.connections = new Map(); // userId -> Set of WebSocket connections
    this.eventBatcher = new Map(); // userId -> Array of events
    this.batchInterval = 1000; // 1 second for faster real-time updates
    this.redisStream = null;
    this.redisPub = null;
    this.streamActive = false;
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

    // Initialize Redis Streams (if enabled)
    if (process.env.REDIS_URL) {
      try {
        const redisOptions = {
          maxRetriesPerRequest: null,
          enableReadyCheck: false,
          retryStrategy: () => null,
          tls: { rejectUnauthorized: false } // Allow self-signed certs (Selectel)
        };
        this.redisStream = new Redis(process.env.REDIS_URL, redisOptions);
        this.redisPub = new Redis(process.env.REDIS_URL, redisOptions);

        // Suppress error logs
        this.redisStream.on('error', () => {});
        this.redisPub.on('error', () => {});

        // Create consumer group
        try {
          await this.redisStream.xgroup('CREATE', STREAM_NAME, CONSUMER_GROUP, '$', 'MKSTREAM');
        } catch (err: any) {
          if (!err.message.includes('BUSYGROUP')) console.error('Redis Stream Group Error:', err);
        }

        this.streamActive = true;
        this.readStreamLoop();
        console.log('✅ Redis Streams initialized for WebSockets');
      } catch (e) {
        console.log('⚠️ Redis Streams unavailable - using local mode');
        this.redisStream = null;
        this.redisPub = null;
      }
    } else {
      console.log('⚠️ Running WebSockets without Redis Streams');
    }

    console.log('✅ WebSocket server initialized on /ws');
  }

  handleConnection(ws: WebSocket, _req: IncomingMessage): void {
    let userId: string | null = null;

    ws.on('message', async (message: WebSocket.Data) => {
      try {
        const data: WebSocketMessage = JSON.parse(message.toString());

        if (data.type === 'auth') {
          // Authenticate connection
          const token = data.token;
          try {
            const decoded = jwt.verify(token!, process.env.JWT_SECRET!) as JWTPayload;
            userId = decoded.id;

            // Store connection
            if (!this.connections.has(userId)) {
              this.connections.set(userId, new Set());
            }
            this.connections.get(userId)!.add(ws);

            ws.send(JSON.stringify({
              type: 'auth_success',
              userId,
              timestamp: Date.now()
            }));

            console.log(`[WS] SUCCESS: User ${userId} authenticated and connection stored. Connections count for user: ${this.connections.get(userId)?.size}`);
          } catch (error: any) {
            ws.send(JSON.stringify({
              type: 'auth_error',
              message: 'Invalid token'
            }));
            console.error(`[WS] ERROR: Auth failed for token: ${token?.substring(0, 10)}... (Error: ${error.message})`);
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
    console.log(`[WebSocket] handleRedisEvent: ${type}`, { userId, userIds: userIds?.length, hasData: !!data });

    // Logic for Single User
    if (userId) {
      const connections = this.connections.get(userId);
      const isOnline = connections && connections.size > 0;
      console.log(`[WebSocket] User ${userId} online: ${isOnline}`);

      // Send WebSocket event if online
      if (isOnline) {
        this.sendToUser(userId, { type, data, timestamp: Date.now() });
        console.log(`[WebSocket] Event queued for user ${userId}`);
      }

      // Potentially send Push Notification (if offline or specific types)
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
    }
    // Logic for Multiple Users
    else if (userIds && Array.isArray(userIds)) {
      userIds.forEach(uid => {
        const connections = this.connections.get(uid);
        const isOnline = connections && connections.size > 0;

        if (isOnline) {
          this.sendToUser(uid, { type, data, timestamp: Date.now() });
          console.log(`[WebSocket] Event queued for user ${uid}`);
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
    }
    // Broadcast
    else {
      console.log(`[WebSocket] Broadcasting event ${type}`);
      this.broadcast({ type, data, timestamp: Date.now() });
    }
  }

  sendToUser(userId: string, message: BatchedMessage): void {
    const connections = this.connections.get(userId);
    if (!connections || connections.size === 0) return;

    // Add to batch instead of sending immediately
    if (!this.eventBatcher.has(userId)) {
      this.eventBatcher.set(userId, []);
    }
    this.eventBatcher.get(userId)!.push(message);
    console.log(`[WS] Event queued in batch for user ${userId}. Queue size: ${this.eventBatcher.get(userId)?.length}`);
  }

  processBatches(): void {
    for (const [userId, events] of this.eventBatcher.entries()) {
      if (events.length === 0) continue;

      const connections = this.connections.get(userId);
      if (!connections || connections.size === 0) {
        this.eventBatcher.delete(userId);
        continue;
      }

      // Send batched events
      const batchMessage = JSON.stringify({
        type: 'batch',
        events,
        count: events.length,
        timestamp: Date.now()
      });

      console.log(`[WebSocket] Sending batch to user ${userId}: ${events.length} events`);
      connections.forEach(ws => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(batchMessage);
        }
      });

      // Clear batch
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

  // Redis Streams Reader Loop
  async readStreamLoop(): Promise<void> {
    while (this.streamActive && this.redisStream) {
      try {
        // Читаем новые сообщения (> означает сообщения, которые еще не были доставлены этой группе)
        const result = await this.redisStream.xreadgroup(
          'GROUP', CONSUMER_GROUP, CONSUMER_NAME,
          'BLOCK', 5000,
          'STREAMS', STREAM_NAME, '>'
        );

        if (result && Array.isArray(result) && result.length > 0) {
          const streamData = result[0] as any;
          const streamRecords = streamData[1] as any[];
          for (let record of streamRecords) {
            const messageId = record[0] as string;
            const fields = record[1] as string[];
            // fields: ['payload', '{"type":"...","data":{...}}']

            const payloadIndex = fields.indexOf('payload');

            if (payloadIndex !== -1) {
              const payloadStr = fields[payloadIndex + 1] as string;
              try {
                const event: RedisEvent = JSON.parse(payloadStr);
                this.handleRedisEvent(event);
              } catch (e) { /* ignore parse error */ }
            }

            // Acknowledge the message
            await this.redisStream!.xack(STREAM_NAME, CONSUMER_GROUP, messageId);
          }
        }
      } catch (err) {
        console.error('Redis Stream read error', err);
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }

  // Emit event to Redis (will be distributed to Consumer Groups)
  async emitEvent(type: string, data?: any, userId: string | null = null, userIds: string[] | null = null): Promise<void> {
    if (this.redisPub) {
      await this.redisPub.xadd(STREAM_NAME, '*', 'payload', JSON.stringify({
        type,
        data,
        userId,
        userIds,
        timestamp: Date.now()
      }));
      console.log(`[WebSocket] Event emitted to Redis: ${type}`, { data, userId, userIds });
    } else {
      // Fallback Local Broadcast
      console.log(`[WebSocket] Event emitted (local mode): ${type}`, { data, userId, userIds });
      this.handleRedisEvent({ type, data, userId, userIds });
    }
  }

  async disconnect(): Promise<void> {
    this.streamActive = false;
    if (this.redisStream) await this.redisStream.quit();
    if (this.redisPub) await this.redisPub.quit();
    if (this.wss) this.wss.close();
  }
}

const websocketService = new WebSocketService();

export default websocketService;
