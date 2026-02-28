import { Request, Response } from 'express';
import { getRequestId } from './_core/requestContext';
import * as db from './db';


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
  ip?: string;
}

// Connection limits
const MAX_CONNECTIONS_PER_STORE = 100;
const MAX_CONNECTIONS_PER_IP = 10;

// Store active SSE connections
const clients: Map<string, SSEClient> = new Map();

// Generate unique client ID
function generateClientId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Get client IP from request
function getClientIP(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

// Count connections by store
function getConnectionCountByStore(storeId: number): number {
  let count = 0;
  clients.forEach((client) => {
    if (client.storeId === storeId) count++;
  });
  return count;
}

// Count connections by IP
function getConnectionCountByIP(ip: string): number {
  let count = 0;
  clients.forEach((client) => {
    if (client.ip === ip) count++;
  });
  return count;
}

// Validate store exists
async function validateStoreId(storeId: number): Promise<boolean> {
  try {
    const store = await db.getStoreById(storeId);
    return !!store;
  } catch {
    return false;
  }
}

// Validate staff session token
async function validateStaffSession(sessionToken: string, storeId: number): Promise<boolean> {
  try {
    const session = await db.getStaffSession(sessionToken);
    return !!session && session.storeId === storeId;
  } catch {
    return false;
  }
}

// Validate ticket token
async function validateTicketToken(ticketToken: string): Promise<boolean> {
  try {
    const ticket = await db.getTicketByToken(ticketToken);
    return !!ticket;
  } catch {
    return false;
  }
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
export async function handleSSE(req: Request, res: Response) {
  const { scope, storeId, ticketToken, storeSlug, sessionToken } = req.query;
  const requestId = getRequestId();
  const storeSlugValue = Array.isArray(storeSlug) ? storeSlug[0] : storeSlug;
  const clientIP = getClientIP(req);
  
  if (!scope || !storeId) {
    res.status(400).json({ error: 'Missing scope or storeId' });
    return;
  }
  
  const validScopes: SSEScope[] = ['board', 'staff', 'ticket'];
  if (!validScopes.includes(scope as SSEScope)) {
    res.status(400).json({ error: 'Invalid scope' });
    return;
  }

  const parsedStoreId = parseInt(storeId as string, 10);
  if (isNaN(parsedStoreId) || parsedStoreId <= 0) {
    res.status(400).json({ error: 'Invalid storeId' });
    return;
  }

  // --- Authentication checks per scope ---

  // Validate store exists for all scopes
  const storeExists = await validateStoreId(parsedStoreId);
  if (!storeExists) {
    res.status(404).json({ error: 'Store not found' });
    return;
  }

  // Staff scope: require valid sessionToken
  if (scope === 'staff') {
    const token = sessionToken as string | undefined;
    if (!token) {
      res.status(401).json({ error: 'Authentication required for staff SSE' });
      return;
    }
    const validSession = await validateStaffSession(token, parsedStoreId);
    if (!validSession) {
      res.status(401).json({ error: 'Invalid or expired staff session' });
      return;
    }
  }

  // Ticket scope: require valid ticketToken
  if (scope === 'ticket') {
    const token = ticketToken as string | undefined;
    if (!token) {
      res.status(401).json({ error: 'Ticket token required' });
      return;
    }
    const validTicket = await validateTicketToken(token);
    if (!validTicket) {
      res.status(401).json({ error: 'Invalid ticket token' });
      return;
    }
  }

  // --- Connection limits ---

  // Check per-store limit
  const storeConnectionCount = getConnectionCountByStore(parsedStoreId);
  if (storeConnectionCount >= MAX_CONNECTIONS_PER_STORE) {
    res.status(429).json({ error: 'Too many connections for this store' });
    return;
  }

  // Check per-IP limit
  const ipConnectionCount = getConnectionCountByIP(clientIP);
  if (ipConnectionCount >= MAX_CONNECTIONS_PER_IP) {
    res.status(429).json({ error: 'Too many connections from this IP' });
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
    storeId: parsedStoreId,
    storeSlug: typeof storeSlugValue === 'string' ? storeSlugValue : undefined,
    ticketToken: ticketToken as string | undefined,
    requestId,
    ip: clientIP,
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
