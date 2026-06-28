import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { eventBus } from './eventBus.js';

class SocketService {
  constructor() {
    this.io = null;
    this.presence = new Map(); // roomId -> Set of userId
  }

  /**
   * Initializes the Socket.io server.
   */
  init(server) {
    this.io = new Server(server, {
      cors: {
        origin: process.env.NODE_ENV === 'production' 
          ? ['https://zivohotels.com', 'https://admin.zivohotels.com'] 
          : ['http://localhost:5173', 'http://127.0.0.1:5173'],
        credentials: true,
        methods: ['GET', 'POST']
      },
      // Allow both transports — polling as a fallback for CDN proxies (Render, Cloudflare)
      transports: ['polling', 'websocket'],
      pingTimeout: 60000,
      pingInterval: 25000,
      upgradeTimeout: 30000,
      allowUpgrades: true,
    });

    // Authentication Middleware
    this.io.use((socket, next) => {
      const token = socket.handshake.auth.token;
      if (!token) return next(new Error('Authentication error: Token missing'));

      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.user = decoded;
        next();
      } catch (err) {
        next(new Error('Authentication error: Invalid token'));
      }
    });

    this.io.on('connection', (socket) => {
      console.log(`[Socket] User connected: ${socket.user.id} (${socket.id})`);
      
      // Connection Fingerprinting
      socket.fingerprint = {
        userId: socket.user.id,
        ip: socket.handshake.address,
        userAgent: socket.handshake.headers['user-agent'],
        connectedAt: new Date()
      };

      // Property-Scoped Rooms
      if (socket.user.hotelId) {
        const roomId = `hotel_${socket.user.hotelId}`;
        socket.join(roomId);
        this.updatePresence(roomId, socket.user, true);
        console.log(`[Socket] User joined room: ${roomId}`);
      }

      // Admin/Global Rooms
      if (socket.user.role === 'ADMIN') {
        const roomId = 'admin_global';
        socket.join(roomId);
        this.updatePresence(roomId, socket.user, true);
        socket.join('finance_ops');
        console.log(`[Socket] Admin joined global rooms`);
      }

      socket.on('disconnect', () => {
        console.log(`[Socket] User disconnected: ${socket.id}`);
        if (socket.user.hotelId) {
          this.updatePresence(`hotel_${socket.user.hotelId}`, socket.user, false);
        }
        if (socket.user.role === 'ADMIN') {
          this.updatePresence('admin_global', socket.user, false);
        }
      });

      // Event Acknowledgement Handler (Future)
      socket.on('event_acknowledged', (data) => {
        console.log(`[Socket] Event acknowledged by ${socket.user.id}:`, data);
      });

      // Operational Intent Tracking
      socket.on('update_intent', (data) => {
        const { intent, target } = data; // e.g., intent: 'EDITING', target: 'Room Rates'
        this.updatePresence(`hotel_${socket.user.hotelId}`, socket.user, true, { intent, target });
      });
    });

    // Listen to EventBus and broadcast
    eventBus.on('*', (eventPayload) => {
      this.broadcastEvent(eventPayload);
    });

    console.log('🚀 Socket.io Server Initialized');
  }

  /**
   * Broadcasts an event to the appropriate rooms.
   */
  broadcastEvent(event) {
    if (!this.io) return;

    const { hotelId, severity } = event;

    // 1. Broadcast to specific hotel room if applicable
    if (hotelId) {
      this.io.to(`hotel_${hotelId}`).emit('operational_event', event);
    }

    // 2. Critical events always go to admin global
    if (severity === 'CRITICAL' || severity === 'WARNING') {
      this.io.to('admin_global').emit('governance_event', event);
    }

    // Finance events go to finance ops
    if (event.event.startsWith('PAYOUT') || event.event === 'SETTLEMENT_CREATED') {
      this.io.to('finance_ops').emit('financial_event', event);
    }
  }

  /**
   * Updates and broadcasts presence information for a room.
   */
  updatePresence(roomId, user, isJoining, metadata = {}) {
    if (!this.presence.has(roomId)) {
      this.presence.set(roomId, new Map());
    }

    const roomPresence = this.presence.get(roomId);
    if (isJoining) {
      const existing = roomPresence.get(user.id) || {};
      roomPresence.set(user.id, {
        id: user.id,
        name: user.name,
        role: user.role,
        lastSeen: new Date(),
        intent: metadata.intent || existing.intent || 'IDLE',
        target: metadata.target || existing.target || null
      });
    } else {
      roomPresence.delete(user.id);
    }

    // Broadcast current presence to the room
    this.io.to(roomId).emit('USER_PRESENCE_UPDATED', {
      roomId,
      activeUsers: Array.from(roomPresence.values())
    });
  }
}

export default new SocketService();
