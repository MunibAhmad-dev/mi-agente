/*
 * WebSocket Client Hook
 * ===================
 * Hook para datos en tiempo real
 */

import { useEffect, useRef, useState, useCallback } from 'react';

interface UseWebSocketOptions {
  url?: string;
  reconnect?: boolean;
  reconnectInterval?: number;
}

interface WebSocketMessage {
  type: string;
  symbol?: string;
  data: any;
  timestamp: string;
}

export const useWebSocket = (options: UseWebSocketOptions = {}) => {
  const {
    url = 'ws://localhost:8765',
    reconnect = true,
    reconnectInterval = 3000,
  } = options;

  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<WebSocketMessage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);

  const connect = useCallback(() => {
    try {
      const ws = new WebSocket(url);

      ws.onopen = () => {
        setConnected(true);
        setError(null);
        console.log('🔌 WebSocket connected');
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as WebSocketMessage;
          setLastMessage(message);
        } catch (e) {
          console.error('Failed to parse message:', e);
        }
      };

      ws.onerror = (event) => {
        console.error('WebSocket error:', event);
        setError('Connection error');
      };

      ws.onclose = () => {
        setConnected(false);
        console.log('🔌 WebSocket disconnected');

        // Auto reconnect
        if (reconnect) {
          reconnectTimerRef.current = setTimeout(() => {
            console.log('🔄 Reconnecting...');
            connect();
          }, reconnectInterval);
        }
      };

      wsRef.current = ws;
    } catch (e) {
      setError('Failed to connect');
    }
  }, [url, reconnect, reconnectInterval]);

  const disconnect = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
    }
    if (wsRef.current) {
      wsRef.current.close();
    }
  }, []);

  const send = useCallback((message: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  const subscribe = useCallback((symbols: string[]) => {
    send({ type: 'subscribe', symbols });
  }, [send]);

  const unsubscribe = useCallback((symbols: string[]) => {
    send({ type: 'unsubscribe', symbols });
  }, [send]);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return {
    connected,
    lastMessage,
    error,
    send,
    subscribe,
    unsubscribe,
    disconnect,
  };
};

// Hook para market data en tiempo real
export const useMarketTicker = (symbol: string) => {
  const { lastMessage, subscribe, unsubscribe } = useWebSocket();
  const [ticker, setTicker] = useState<any>(null);

  useEffect(() => {
    if (symbol) {
      subscribe([symbol]);
    }
    return () => unsubscribe([symbol]);
  }, [symbol, subscribe, unsubscribe]);

  useEffect(() => {
    if (lastMessage?.type === 'ticker' && lastMessage?.symbol === symbol) {
      setTicker(lastMessage.data);
    }
  }, [lastMessage, symbol]);

  return ticker;
};

// Hook para trades en tiempo real
export const useLiveTrades = () => {
  const { lastMessage } = useWebSocket();
  const [trades, setTrades] = useState<any[]>([]);

  useEffect(() => {
    if (lastMessage?.type === 'trade') {
      setTrades(prev => [lastMessage.data, ...prev].slice(0, 50));
    }
  }, [lastMessage]);

  return trades;
};

export default useWebSocket;