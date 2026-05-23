import { PrismaClient } from '@prisma/client';
import { EventEmitter } from 'events';

const prisma = new PrismaClient();

/**
 * ZivoHotels Event Bus
 * Centralized, versioned event orchestrator for internal reactive workflows.
 */
class ZivoEventBus extends EventEmitter {
  constructor() {
    super();
    this.schemaRegistry = {
      // BOOKING
      BOOKING_UPDATED: { version: 1, severity: 'INFO' },
      BOOKING_CANCELLED: { version: 1, severity: 'WARNING' },
      
      // FINANCE
      SETTLEMENT_CREATED: { version: 1, severity: 'INFO' },
      PAYOUT_PROCESSING: { version: 1, severity: 'INFO' },
      PAYOUT_PAID: { version: 1, severity: 'SUCCESS' },
      PAYOUT_FAILED: { version: 1, severity: 'CRITICAL' },
      
      // SYSTEM
      SAFE_MODE_TOGGLED: { version: 1, severity: 'CRITICAL' },
      INCIDENT_REPORTED: { version: 1, severity: 'WARNING' },
      
      // RISK
      FRAUD_ALERT: { version: 1, severity: 'CRITICAL' }
    };
  }

  /**
   * Emits a versioned, schema-compliant event.
   */
  async emitEvent(eventName, payload, metadata = {}) {
    const registryEntry = this.schemaRegistry[eventName];
    
    const eventPayload = {
      event: eventName,
      version: registryEntry?.version || 1,
      severity: registryEntry?.severity || 'INFO',
      source: metadata.source || 'SYSTEM',
      timestamp: new Date().toISOString(),
      traceId: metadata.traceId || null,
      hotelId: metadata.hotelId || payload.hotelId || null,
      data: payload
    };

    // 1. Persist critical events (Financial, Risk, Incident) to AuditLog or dedicated Event table
    // For now, we use AuditLog for persistence to maintain audit trail
    try {
      if (['SUCCESS', 'WARNING', 'CRITICAL'].includes(eventPayload.severity)) {
        await prisma.auditLog.create({
          data: {
            action: eventName,
            entityType: 'EVENT',
            entityId: metadata.entityId || 'SYSTEM',
            details: eventPayload,
            userId: metadata.userId || 'SYSTEM',
            traceId: eventPayload.traceId
          }
        });
      }
    } catch (err) {
      console.error('[EventBus] Persistence failed:', err);
    }

    // 2. Trigger Async Listeners
    super.emit(eventName, eventPayload);
    
    // Also emit a catch-all for the SocketService
    super.emit('*', eventPayload);

    console.log(`[EventBus] ${eventName} broadcasted (Severity: ${eventPayload.severity})`);
    return eventPayload;
  }
}

export const eventBus = new ZivoEventBus();

export const EVENTS = {
  BOOKING_UPDATED: 'BOOKING_UPDATED',
  BOOKING_CANCELLED: 'BOOKING_CANCELLED',
  SETTLEMENT_CREATED: 'SETTLEMENT_CREATED',
  PAYOUT_PROCESSING: 'PAYOUT_PROCESSING',
  PAYOUT_PAID: 'PAYOUT_PAID',
  PAYOUT_FAILED: 'PAYOUT_FAILED',
  SAFE_MODE_TOGGLED: 'SAFE_MODE_TOGGLED',
  INCIDENT_REPORTED: 'INCIDENT_REPORTED',
  FRAUD_ALERT: 'FRAUD_ALERT'
};
