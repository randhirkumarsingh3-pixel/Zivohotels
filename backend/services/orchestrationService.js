import { eventBus, EVENTS } from './eventBus.js';
import policyEngine from './policyEngine.js';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

class OrchestrationService {
  constructor() {
    this.activeCooldowns = new Map();
    this.operationalMetrics = new Map(); // hotelId -> metrics
    this.incidents = new Map(); // traceId -> { status, events, createdAt }
  }

  init() {
    console.log('🧠 Orchestration Service Initialized (Autonomous Governance Active)');
    
    // Listen to all events to update metrics and detect patterns
    eventBus.on('*', (event) => {
      this.handleEvent(event);
    });
  }

  async handleEvent(event) {
    const { event: eventName, hotelId, traceId } = event;

    // 1. Update Metrics
    this.updateMetrics(event);

    // 2. Evaluate Policies based on event type
    if (eventName === EVENTS.PAYOUT_FAILED) {
      await this.evaluatePolicy('PAYOUT_PROTECTION', hotelId, traceId);
    }

    if (eventName === EVENTS.INCIDENT_REPORTED && event.severity === 'CRITICAL') {
      // Logic for critical incident auto-escalation
    }
  }

  updateMetrics(event) {
    const hotelId = event.hotelId || 'GLOBAL';
    if (!this.operationalMetrics.has(hotelId)) {
      this.operationalMetrics.set(hotelId, { payoutFailures: 0, lastCheck: Date.now() });
    }

    const metrics = this.operationalMetrics.get(hotelId);
    if (event.event === EVENTS.PAYOUT_FAILED) {
      metrics.payoutFailures++;
    }

    // Reset metrics window every hour
    if (Date.now() - metrics.lastCheck > 3600000) {
      metrics.payoutFailures = 0;
      metrics.lastCheck = Date.now();
    }
  }

  async evaluatePolicy(policyId, hotelId, traceId) {
    const metrics = this.operationalMetrics.get(hotelId || 'GLOBAL');
    const { match, policy, confidence } = policyEngine.evaluate(policyId, {
      ...metrics,
      timeWindow: '1h'
    });

    if (match) {
      await this.executeAutonomousAction(policy, hotelId, confidence, traceId);
    }
  }

  async executeAutonomousAction(policy, hotelId, confidence, traceId) {
    const cooldownKey = `${policy.id}_${hotelId}`;
    if (this.activeCooldowns.has(cooldownKey)) {
      if (Date.now() < this.activeCooldowns.get(cooldownKey)) return;
    }

    console.log(`[Autonomous] Action Triggered: ${policy.action} for ${hotelId} (Confidence: ${confidence})`);

    // 1. Set Cooldown
    if (policy.cooldown > 0) {
      this.activeCooldowns.set(cooldownKey, Date.now() + policy.cooldown);
    }

    // 2. Execute Action (e.g., Update AppState or Hotel Throttling)
    try {
      if (policy.action === 'TRIGGER_SAFE_MODE') {
        await prisma.appState.update({
          where: { id: 'singleton' },
          data: { systemMode: 'SAFE_MODE' }
        });

        // Broadcast the escalation
        eventBus.emitEvent(EVENTS.SAFE_MODE_TOGGLED, {
          isSafeMode: true,
          reason: `Autonomous escalation: ${policy.description}`,
          confidence
        }, { traceId, source: 'ORCHESTRATION_SERVICE' });
      }

      // 3. Log Autonomous Decision
      await prisma.auditLog.create({
        data: {
          action: 'AUTONOMOUS_DECISION',
          entityType: 'POLICY',
          entityId: policy.id,
          userId: 'ORCHESTRATION_SERVICE',
          details: { 
            policy: policy.description, 
            action: policy.action, 
            hotelId, 
            confidence,
            impact: 'System wide Safe Mode enabled'
          },
          traceId
        }
      });

    } catch (err) {
      console.error('[Orchestration] Autonomous action failed:', err);
    }
  }

  /**
   * Records a manual override by an operator.
   */
  async recordOverride(userId, action, reason, details) {
    console.log(`[Autonomous] Human Override by ${userId}: ${action}`);
    
    await prisma.auditLog.create({
      data: {
        action: 'HUMAN_OVERRIDE',
        entityType: 'AUTONOMOUS_ACTION',
        entityId: details.policyId || 'SYSTEM',
        userId,
        details: {
          originalAction: details.originalAction,
          overriddenAction: action,
          reason,
          duration: details.duration
        }
      }
    });

    eventBus.emitEvent('OVERRIDE_JOURNAL_UPDATED', {
      userId,
      action,
      reason
    }, { severity: 'WARNING', source: 'ORCHESTRATION_SERVICE' });
  }
}

export default new OrchestrationService();
