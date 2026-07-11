import prisma from '../config/db.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { queueService } from '../services/queueService.js';

// Helper to log timeline
const logTimeline = async (hotelId, userId, action, reason = null) => {
  await prisma.auditLog.create({
    data: {
      action,
      entityType: 'HOTEL',
      entityId: hotelId,
      userId,
      details: { reason }
    }
  });
};

export const getReviewQueue = asyncHandler(async (req, res) => {
  const properties = await prisma.hotel.findMany({
    where: {
      status: { notIn: ['DRAFT', 'DELETED'] }
    },
    include: {
      owner: { select: { id: true, name: true, email: true, phone: true } },
      media: true,
      roomTypes: true
    },
    orderBy: { updatedAt: 'desc' }
  });
  res.json({ success: true, data: properties });
});

export const submitForReview = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const hotel = await prisma.hotel.findUnique({ where: { id } });
  
  if (!hotel) return res.status(404).json({ success: false, message: 'Hotel not found' });
  if (!['DRAFT', 'INFORMATION_REQUESTED'].includes(hotel.status)) {
    return res.status(400).json({ success: false, message: 'Invalid status transition' });
  }

  const updated = await prisma.hotel.update({
    where: { id },
    data: { status: 'SUBMITTED', updatedBy: req.user.id }
  });
  
  await logTimeline(id, req.user.id, 'STATUS_SUBMITTED');
  res.json({ success: true, data: updated });
});

export const startReview = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const hotel = await prisma.hotel.update({
    where: { id },
    data: { status: 'IN_REVIEW', reviewedBy: req.user.id }
  });
  await logTimeline(id, req.user.id, 'STATUS_IN_REVIEW');
  res.json({ success: true, data: hotel });
});

export const approveProperty = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const hotel = await prisma.hotel.findUnique({ where: { id }, include: { owner: true } });
  
  if (!hotel) return res.status(404).json({ success: false, message: 'Hotel not found' });
  if (hotel.status !== 'IN_REVIEW') return res.status(400).json({ success: false, message: 'Property must be in review' });

  // Tier 2: Validation Engine
  if (hotel.complianceScore < 80) {
    return res.status(400).json({ success: false, message: 'Property compliance score must be at least 80% to be approved.' });
  }

  if (hotel.gstin) {
    const duplicate = await prisma.hotel.findFirst({
      where: { gstin: hotel.gstin, id: { not: id }, status: { in: ['LIVE', 'APPROVED', 'READY_FOR_GO_LIVE'] } }
    });
    if (duplicate) return res.status(400).json({ success: false, message: 'Another approved property already uses this GSTIN.' });
  }

  if (hotel.pan) {
    const duplicate = await prisma.hotel.findFirst({
      where: { pan: hotel.pan, id: { not: id }, status: { in: ['LIVE', 'APPROVED', 'READY_FOR_GO_LIVE'] } }
    });
    if (duplicate) return res.status(400).json({ success: false, message: 'Another approved property already uses this PAN.' });
  }

  const bank = await prisma.bankDetail.findUnique({ where: { hotelId: id } });
  if (!bank) {
    return res.status(400).json({ success: false, message: 'Property must have bank details configured before approval.' });
  }

  const updated = await prisma.hotel.update({
    where: { id },
    data: { 
      status: 'PENDING_AGREEMENT', 
      approvedBy: req.user.id,
      reviewNote: 'Approved by admin'
    }
  });
  
  await logTimeline(id, req.user.id, 'STATUS_APPROVED');
  await logTimeline(id, req.user.id, 'STATUS_PENDING_AGREEMENT');

  // Create Agreement Record
  await prisma.agreement.upsert({
    where: { hotelId: id },
    update: { status: 'DRAFT', sentAt: new Date() },
    create: {
      hotelId: id,
      ownerId: hotel.ownerId,
      status: 'DRAFT',
      commissionRate: 15.0,
      sentAt: new Date()
    }
  });

  // Trigger Approval Email
  if (hotel.owner?.email) {
    await queueService.enqueue('email', 'SEND_PROPERTY_APPROVED', {
      to: hotel.owner.email,
      subject: `🎉 Congratulations! Your Property Has Been Approved`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2>Congratulations!</h2>
          <p>Your property <strong>${hotel.name}</strong> has been successfully validated and approved by our team.</p>
          <p><strong>Next Step:</strong> Please log in to your dashboard to sign the Listing Agreement. Once signed, your property will be ready to go live!</p>
        </div>
      `
    }, { priority: 2 });
  }

  res.json({ success: true, data: updated });
});

export const requestInformation = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  
  if (!reason) return res.status(400).json({ success: false, message: 'Reason is required' });

  const hotel = await prisma.hotel.findUnique({ where: { id }, include: { owner: true } });
  if (!hotel) return res.status(404).json({ success: false, message: 'Hotel not found' });

  const updated = await prisma.hotel.update({
    where: { id },
    data: { 
      status: 'INFORMATION_REQUESTED',
      reviewNote: reason,
      reviewedBy: req.user.id
    }
  });
  
  await logTimeline(id, req.user.id, 'STATUS_INFORMATION_REQUESTED', reason);

  // Trigger Email
  if (hotel.owner?.email) {
    await queueService.enqueue('email', 'SEND_PROPERTY_INFO_REQUESTED', {
      to: hotel.owner.email,
      subject: `Action Required: Review Update for ${hotel.name}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2>Information Requested</h2>
          <p>We reviewed your property <strong>${hotel.name}</strong> and need a few updates before we can approve it.</p>
          <div style="background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; padding: 15px; border-radius: 8px;">
            <strong>Reviewer Note:</strong><br/>
            ${reason}
          </div>
          <p>Please log in and update the requested information.</p>
        </div>
      `
    }, { priority: 2 });
  }

  res.json({ success: true, data: updated });
});

export const markAgreementSigned = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const hotel = await prisma.hotel.findUnique({ where: { id } });
  
  if (!hotel) return res.status(404).json({ success: false, message: 'Hotel not found' });
  if (hotel.status !== 'PENDING_AGREEMENT') return res.status(400).json({ success: false, message: 'Hotel not pending agreement' });

  const updated = await prisma.hotel.update({
    where: { id },
    data: { status: 'READY_FOR_GO_LIVE' }
  });
  
  await prisma.agreement.update({
    where: { hotelId: id },
    data: { status: 'SIGNED', signedAt: new Date() }
  });
  
  await logTimeline(id, req.user.id, 'STATUS_AGREEMENT_SIGNED');
  await logTimeline(id, req.user.id, 'STATUS_READY_FOR_GO_LIVE');
  
  res.json({ success: true, data: updated });
});

export const goLive = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const hotel = await prisma.hotel.findUnique({ where: { id } });
  
  if (!hotel) return res.status(404).json({ success: false, message: 'Hotel not found' });
  if (!['READY_FOR_GO_LIVE', 'PAUSED'].includes(hotel.status)) {
    return res.status(400).json({ success: false, message: 'Cannot go live from current status' });
  }

  const updated = await prisma.hotel.update({
    where: { id },
    data: { status: 'LIVE', updatedBy: req.user.id }
  });
  
  await logTimeline(id, req.user.id, 'STATUS_LIVE');
  res.json({ success: true, data: updated });
});

export const unlistProperty = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const hotel = await prisma.hotel.findUnique({ where: { id } });
  
  if (!hotel) return res.status(404).json({ success: false, message: 'Hotel not found' });
  if (hotel.status !== 'LIVE') return res.status(400).json({ success: false, message: 'Only live properties can be unlisted' });

  const updated = await prisma.hotel.update({
    where: { id },
    data: { status: 'PAUSED', updatedBy: req.user.id }
  });
  
  await logTimeline(id, req.user.id, 'STATUS_PAUSED');
  res.json({ success: true, data: updated });
});
