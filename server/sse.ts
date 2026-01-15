import { Request, Response } from 'express';
import { getRequestId } from './_core/requestContext';


// SSE connection types
type SSEScope = 'board' | 'staff' | 'ticket';

interface SSEClient {
  id: string;
  res: Response;
  scope: SSEScope;
  storeId: number;
  storeSlug?: string;
  ticketToken?: string;
  requestId?: string;
}


// Store active SSE connections
const clients: Map<string, SSEClient> = new Map();

// Generate unique client ID
function generateClientId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Send SSE message to a client
function sendSSEMessage(client: SSEClient, event: string, data: any) {
  try {
    client.res.write(`event: ${event}\n`);
    client.res.write(`data: ${JSON.stringify(data)}\n\n`);
  } catch (error) {
    console.error('SSE send error:', {
      storeId: client.storeId,
      storeSlug: client.storeSlug,
      ticketToken: client.ticketToken,
      requestId: client.requestId,
    }, error);
    clients.delete(client.id);
  }

}

// Broadcast to all clients of a specific scope and store
export function broadcastToStore(storeId: number, scope: SSEScope, event: string, data: any) {
  clients.forEach((client) => {
    if (client.storeId === storeId && client.scope === scope) {
      sendSSEMessage(client, event, data);
    }
  });
}

// Send to a specific ticket
export function sendToTicket(ticketToken: string, event: string, data: any) {
  clients.forEach((client) => {
    if (client.ticketToken === ticketToken) {
      sendSSEMessage(client, event, data);
    }
  });
}

// Broadcast queue update to all relevant clients
export function broadcastQueueUpdate(storeId: number, data: {
  currentNumber: number;
  waitingCount: number;
  calledTicket?: { number: number; ticketToken: string };
}) {
  // Broadcast to board
  broadcastToStore(storeId, 'board', 'queue-update', data);
  
  // Broadcast to staff
  broadcastToStore(storeId, 'staff', 'queue-update', data);
  
  // Notify specific ticket if called
  if (data.calledTicket) {
    sendToTicket(data.calledTicket.ticketToken, 'called', {
      number: data.calledTicket.number,
      currentNumber: data.currentNumber,
    });
  }
}

// Broadcast ticket status change
export function broadcastTicketUpdate(storeId: number, ticketToken: string, data: {
  status: string;
  number: number;
  groupsAhead?: number;
}) {
  // Send to the specific ticket holder
  sendToTicket(ticketToken, 'ticket-update', data);
  
  // Also update staff view
  broadcastToStore(storeId, 'staff', 'ticket-update', { ticketToken, ...data });
}

// Broadcast intake status change
export function broadcastIntakeStatus(storeId: number, status: 'open' | 'paused') {
  broadcastToStore(storeId, 'board', 'intake-status', { status });
  broadcastToStore(storeId, 'staff', 'intake-status', { status });
}

// SSE endpoint handler
export function handleSSE(req: Request, res: Response) {
  const { scope, storeId, ticketToken, storeSlug } = req.query;
  const requestId = getRequestId();
  const storeSlugValue = Array.isArray(storeSlug) ? storeSlug[0] : storeSlug;
  
  if (!scope || !storeId) {

    res.status(400).json({ error: 'Missing scope or storeId' });
    return;
  }
  
  const validScopes: SSEScope[] = ['board', 'staff', 'ticket'];
  if (!validScopes.includes(scope as SSEScope)) {
    res.status(400).json({ error: 'Invalid scope' });
    return;
  }

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  // Create client
  const clientId = generateClientId();
  const client: SSEClient = {
    id: clientId,
    res,
    scope: scope as SSEScope,
    storeId: parseInt(storeId as string, 10),
    storeSlug: typeof storeSlugValue === 'string' ? storeSlugValue : undefined,
    ticketToken: ticketToken as string | undefined,
    requestId,
  };


  clients.set(clientId, client);

  // Send initial connection message
  sendSSEMessage(client, 'connected', { clientId });

  // Keep-alive ping every 30 seconds
  const pingInterval = setInterval(() => {
    sendSSEMessage(client, 'ping', { timestamp: Date.now() });
  }, 30000);

  // Clean up on disconnect
  req.on('close', () => {
    clearInterval(pingInterval);
    clients.delete(clientId);
    console.info('[SSE] Connection closed', {
      storeId: client.storeId,
      storeSlug: client.storeSlug,
      ticketToken: client.ticketToken,
      requestId: client.requestId,
    });
  });

}

// Get connected client count for monitoring
export function getClientCount(storeId?: number, scope?: SSEScope): number {
  if (!storeId && !scope) {
    return clients.size;
  }
  
  let count = 0;
  clients.forEach((client) => {
    if ((!storeId || client.storeId === storeId) && (!scope || client.scope === scope)) {
      count++;
    }
  });
  return count;
}
