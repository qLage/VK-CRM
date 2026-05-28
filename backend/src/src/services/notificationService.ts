import { Response } from 'express';

const clients = new Map<string, Response[]>();

interface NotificationData {
  [key: string]: any;
}

/**
 * Add a new SSE client
 * @param userId - User ID
 * @param res - Express response object
 */
function addClient(userId: string, res: Response): void {
  if (!clients.has(userId)) {
    clients.set(userId, []);
  }
  clients.get(userId)!.push(res);

  console.log(`✅ SSE Client connected: userId=${userId}, total clients for user: ${clients.get(userId)!.length}`);
  console.log(`📊 Total users with SSE connections: ${clients.size}`);

  // Remove client on connection close
  res.on('close', () => {
    const userClients = clients.get(userId) || [];
    const index = userClients.indexOf(res);
    if (index !== -1) {
      userClients.splice(index, 1);
    }
    if (userClients.length === 0) {
      clients.delete(userId);
    }
    console.log(`❌ SSE Client disconnected: userId=${userId}`);
  });
}

/**
 * Send notification to a specific user via SSE
 * @param userId - User ID
 * @param data - Notification data
 */
function sendToUser(userId: string, data: NotificationData): void {
  console.log(`📤 Attempting to send SSE to userId=${userId}`);
  const userClients = clients.get(userId);

  if (userClients) {
    console.log(`✅ Found ${userClients.length} SSE client(s) for userId=${userId}`);
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    userClients.forEach(res => {
      try {
        res.write(payload);
        console.log(`✅ SSE message sent to userId=${userId}`);
      } catch (error: any) {
        console.error(`❌ Error sending SSE to userId=${userId}:`, error.message);
      }
    });
  } else {
    console.log(`⚠️ No SSE clients found for userId=${userId}`);
    console.log(`📊 Currently connected users: ${Array.from(clients.keys()).join(', ')}`);
  }
}

/**
 * Send notification to all connected users
 * @param data - Notification data
 */
function sendToAll(data: NotificationData): void {
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  clients.forEach(userClients => {
    userClients.forEach(res => res.write(payload));
  });
}

export {
  addClient,
  sendToUser,
  sendToAll
};
