import { useEffect, useRef, useCallback, useState } from 'react';

type SSEScope = 'board' | 'staff' | 'ticket';

interface UseSSEOptions {
  scope: SSEScope;
  storeId: number;
  storeSlug?: string;
  ticketToken?: string;
  sessionToken?: string;
  onMessage?: (event: string, data: any) => void;
  onQueueUpdate?: (data: { currentNumber: number; waitingCount: number; nextNumbers?: number[] }) => void;
  onTicketUpdate?: (data: { status: string; number: number; groupsAhead?: number }) => void;
  onCalled?: (data: { number: number; currentNumber: number }) => void;
  onIntakeStatus?: (data: { status: 'open' | 'paused' }) => void;
  enabled?: boolean;
}


export function useSSE({
  scope,
  storeId,
  storeSlug,
  ticketToken,
  sessionToken,
  onMessage,
  onQueueUpdate,
  onTicketUpdate,
  onCalled,
  onIntakeStatus,
  enabled = true,
}: UseSSEOptions) {

  const eventSourceRef = useRef<EventSource | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const [usePolling, setUsePolling] = useState(false);

  // Polling fallback function
  const startPolling = useCallback(() => {
    if (!enabled || !storeId || scope !== 'board') return;

    // Clear existing polling interval
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
    }

    setUsePolling(true);
    setError(null);

    // Poll every 10 seconds
    pollingIntervalRef.current = setInterval(async () => {
      try {
        // Trigger queue refetch via onQueueUpdate callback
        // This assumes the parent component will handle the refetch
        onMessage?.('polling-active', { timestamp: Date.now() });
      } catch (e) {
        console.error('Polling error:', e);
      }
    }, 10000);
  }, [enabled, storeId, scope, onMessage]);

  const connect = useCallback(() => {
    if (!enabled || !storeId) return;

    // Build URL with query params
    const params = new URLSearchParams({
      scope,
      storeId: storeId.toString(),
    });
    if (storeSlug) {
      params.set('storeSlug', storeSlug);
    }
    if (ticketToken) {
      params.set('ticketToken', ticketToken);
    }
    if (sessionToken) {
      params.set('sessionToken', sessionToken);
    }


    const url = `/api/sse?${params.toString()}`;
    
    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {
      setIsConnected(true);
      setError(null);
      reconnectAttempts.current = 0;
    };

    eventSource.onerror = () => {
      setIsConnected(false);
      eventSource.close();
      
      // Attempt reconnection with exponential backoff
      if (reconnectAttempts.current < maxReconnectAttempts) {
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectAttempts.current++;
          connect();
        }, delay);
      } else {
        // After max attempts, fall back to polling for board scope
        if (scope === 'board') {
          setError('Using polling mode');
          startPolling();
        } else {
          setError('Connection lost. Please refresh the page.');
        }
      }
    };

    // Handle different event types
    eventSource.addEventListener('connected', (e) => {
      const data = JSON.parse(e.data);
      onMessage?.('connected', data);
    });

    eventSource.addEventListener('queue-update', (e) => {
      const data = JSON.parse(e.data);
      onMessage?.('queue-update', data);
      onQueueUpdate?.(data);
    });

    eventSource.addEventListener('ticket-update', (e) => {
      const data = JSON.parse(e.data);
      onMessage?.('ticket-update', data);
      onTicketUpdate?.(data);
    });

    eventSource.addEventListener('called', (e) => {
      const data = JSON.parse(e.data);
      onMessage?.('called', data);
      onCalled?.(data);
    });

    eventSource.addEventListener('intake-status', (e) => {
      const data = JSON.parse(e.data);
      onMessage?.('intake-status', data);
      onIntakeStatus?.(data);
    });

    eventSource.addEventListener('ping', () => {
      // Keep-alive, no action needed
    });
  }, [enabled, storeId, scope, storeSlug, ticketToken, sessionToken, onMessage, onQueueUpdate, onTicketUpdate, onCalled, onIntakeStatus]);


  useEffect(() => {
    connect();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [connect]);

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }
    setIsConnected(false);
  }, []);

  const reconnect = useCallback(() => {
    reconnectAttempts.current = 0;
    connect();
  }, [connect]);

  return {
    isConnected,
    error,
    disconnect,
    reconnect,
    usePolling,
  };
}
