import { asyncHandler } from '../middleware/asyncHandler.js';
import eventBus from '../events/eventBus.js';
import prisma from '../config/db.js';

/**
 * @desc    Handle Resend Webhooks
 * @route   POST /api/v1/webhooks/resend
 * @access  Public
 */
export const handleResendWebhook = asyncHandler(async (req, res) => {
  const payload = req.body;
  const eventType = payload.type; // e.g. email.delivered, email.bounced

  if (!eventType) {
    return res.status(400).json({ success: false, message: 'Invalid payload' });
  }

  // Log delivery events
  await prisma.auditLog.create({
    data: {
      action: `RESEND_WEBHOOK_${eventType.toUpperCase().replace('.', '_')}`,
      entityType: 'EMAIL',
      entityId: payload.data?.email_id || 'UNKNOWN',
      userId: 'SYSTEM',
      details: payload
    }
  });

  // Emit to EventBus for analytics
  eventBus.emitEvent('EMAIL_DELIVERY_EVENT', payload);

  res.status(200).json({ success: true, message: 'Webhook received' });
});
