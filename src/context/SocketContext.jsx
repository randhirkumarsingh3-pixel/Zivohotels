import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

export const SocketProvider = ({ children }) => {
  const { token } = useAuth();
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState(null);
  const eventBuffer = useRef([]);

  const connectingRef = useRef(false);

  const connectSocket = useCallback(() => {
    if (!token || connectingRef.current) return;
    connectingRef.current = true;

    // Extract the base domain (origin) so Socket.io doesn't treat /api/v1 as a namespace
    const apiUrl = import.meta.env.VITE_API_URL || 'http://127.0.0.1:5000';
    const socketUrl = apiUrl.startsWith('http') ? new URL(apiUrl).origin : window.location.origin;

    const newSocket = io(socketUrl, {
      auth: { token },
      transports: ['websocket'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    newSocket.on('connect', () => {
      console.log('[Socket] Connected to server');
      setIsConnected(true);
      connectingRef.current = false;
      
      // Replay buffered events or acknowledge presence
      if (eventBuffer.current.length > 0) {
        console.log(`[Socket] Replaying ${eventBuffer.current.length} buffered events`);
        eventBuffer.current = [];
      }
    });

    newSocket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected:', reason);
      setIsConnected(false);
      connectingRef.current = false;
    });

    newSocket.on('connect_error', (err) => {
      console.error('[Socket] Connection error:', err.message);
      connectingRef.current = false;
      if (err.message.includes('Authentication error')) {
        newSocket.close(); // Don't keep retrying with an invalid token
      }
    });

    // Unified operational event listener
    newSocket.on('operational_event', (event) => {
      console.log('[Socket] Operational Event:', event);
      setLastEvent(event);
    });

    newSocket.on('governance_event', (event) => {
      console.log('[Socket] Governance Event:', event);
      setLastEvent(event);
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
      connectingRef.current = false;
    };
  }, [token]);

  useEffect(() => {
    const cleanup = connectSocket();
    return () => cleanup && cleanup();
  }, [connectSocket]);

  return (
    <SocketContext.Provider value={{ socket, isConnected, lastEvent }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) throw new Error('useSocket must be used within a SocketProvider');
  return context;
};

/**
 * Custom hook to listen for specific socket events with filtering.
 */
export const useSocketEvent = (eventName, callback) => {
  const { lastEvent } = useSocket();

  useEffect(() => {
    if (lastEvent && (lastEvent.event === eventName || eventName === '*')) {
      callback(lastEvent);
    }
  }, [lastEvent, eventName, callback]);
};
