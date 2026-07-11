import prisma from '../config/db.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { queueService } from '../services/queueService.js';
import { mediaService } from '../services/MediaService.js';

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
      status: { notIn: ['DELETED'] }
    },
    include: {
      owner: { select: { id: true, name: true, email: true, phone: true } },
      media: true,
      roomTypes: true
    },
    orderBy: { updatedAt: 'desc' }
  });
  
  const signedProperties = await mediaService.signHotelsUrls(properties);
  res.json({ success: true, data: signedProperties });
});

export const submitForReview = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const hotel = await prisma.hotel.findUnique({ where: { id }, include: { owner: true } });
  
  if (!hotel) return res.status(404).json({ success: false, message: 'Hotel not found' });
  if (!['DRAFT', 'INFORMATION_REQUESTED'].includes(hotel.status)) {
    return res.status(400).json({ success: false, message: 'Invalid status transition' });
  }

  const updated = await prisma.hotel.update({
    where: { id },
    data: { status: 'SUBMITTED', updatedBy: req.user.id }
  });
  
  await logTimeline(id, req.user.id, 'STATUS_SUBMITTED');

  // Send submission confirmation email to owner
  if (hotel.owner?.email) {
    await queueService.enqueue('email', 'SEND_PROPERTY_SUBMITTED', {
      to: hotel.owner.email,
      subject: `Property Submitted Successfully — ${hotel.name}`,
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 640px; margin: 0 auto; padding: 0; background: #ffffff;">
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
            <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">ZivoHotels</h1>
            <p style="color: #a0aec0; margin: 8px 0 0; font-size: 14px;">Property Lifecycle Management</p>
          </div>
          
          <!-- Body -->
          <div style="padding: 40px 30px;">
            <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 20px; margin-bottom: 24px; text-align: center;">
              <span style="font-size: 40px;">✅</span>
              <h2 style="color: #166534; margin: 12px 0 4px; font-size: 22px;">Property Submitted Successfully!</h2>
              <p style="color: #15803d; margin: 0; font-size: 14px;">Your property is now in the review queue</p>
            </div>
            
            <p style="color: #374151; font-size: 15px; line-height: 1.6;">Dear <strong>${hotel.owner.name || 'Property Owner'}</strong>,</p>
            <p style="color: #374151; font-size: 15px; line-height: 1.6;">Your property <strong>${hotel.name}</strong> has been successfully submitted for review. Our team will thoroughly evaluate your property listing within <strong>24-48 hours</strong>.</p>
            
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 20px; margin: 24px 0;">
              <h3 style="color: #1e293b; margin: 0 0 16px; font-size: 16px;">📋 Property Details</h3>
              <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 8px 0; color: #64748b; font-size: 13px;">Property Name</td><td style="padding: 8px 0; color: #1e293b; font-weight: 600; font-size: 13px; text-align: right;">${hotel.name}</td></tr>
                <tr><td style="padding: 8px 0; color: #64748b; font-size: 13px; border-top: 1px solid #f1f5f9;">Location</td><td style="padding: 8px 0; color: #1e293b; font-weight: 600; font-size: 13px; text-align: right; border-top: 1px solid #f1f5f9;">${hotel.city || 'N/A'}</td></tr>
                <tr><td style="padding: 8px 0; color: #64748b; font-size: 13px; border-top: 1px solid #f1f5f9;">Status</td><td style="padding: 8px 0; font-weight: 600; font-size: 13px; text-align: right; border-top: 1px solid #f1f5f9;"><span style="background: #dbeafe; color: #1e40af; padding: 2px 10px; border-radius: 20px; font-size: 12px;">UNDER REVIEW</span></td></tr>
              </table>
            </div>

            <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; padding: 16px 20px; margin: 24px 0;">
              <h4 style="color: #92400e; margin: 0 0 8px; font-size: 14px;">⏳ What Happens Next?</h4>
              <ol style="color: #78350f; font-size: 13px; line-height: 1.8; margin: 0; padding-left: 16px;">
                <li>Our team will review your property details and documents</li>
                <li>Upon approval, you'll receive a Listing Agreement to sign digitally</li>
                <li>Once the agreement is signed, your property will be ready to go live!</li>
              </ol>
            </div>

            <p style="color: #6b7280; font-size: 13px; line-height: 1.6;">If you need to make any changes or have questions, please log in to your <a href="https://zivohotels.com/extranet" style="color: #2563eb;">Extranet Dashboard</a>.</p>
          </div>
          
          <!-- Footer -->
          <div style="background: #f8fafc; padding: 24px 30px; text-align: center; border-top: 1px solid #e2e8f0; border-radius: 0 0 12px 12px;">
            <p style="color: #9ca3af; font-size: 12px; margin: 0;">© ${new Date().getFullYear()} ZivoHotels. All rights reserved.</p>
            <p style="color: #9ca3af; font-size: 11px; margin: 8px 0 0;">This is an automated notification. Please do not reply to this email.</p>
          </div>
        </div>
      `
    }, { priority: 2 });
  }

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
  if (hotel.gstin) {
    const duplicate = await prisma.hotel.findFirst({
      where: { gstin: hotel.gstin, id: { not: id }, status: { in: ['LIVE', 'APPROVED', 'READY_FOR_GO_LIVE'] } }
    });
    if (duplicate) return res.status(400).json({ success: false, message: 'Another approved property already uses this GSTIN.' });
  }

  if (hotel.complianceScore == null || hotel.complianceScore < 0) {
    return res.status(400).json({ success: false, message: 'Property must have a compliance score calculated to be approved.' });
  }

  if (hotel.pan) {
    const duplicate = await prisma.hotel.findFirst({
      where: { pan: hotel.pan, id: { not: id }, status: { in: ['LIVE', 'APPROVED', 'READY_FOR_GO_LIVE'] } }
    });
    if (duplicate) return res.status(400).json({ success: false, message: 'Another approved property already uses this PAN.' });
  }

  const intSettings = typeof hotel.integrationSettings === 'string' 
    ? JSON.parse(hotel.integrationSettings) 
    : (hotel.integrationSettings || {});
    
  const hasBank = intSettings.commercials && intSettings.commercials.bankAccount;

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
      subject: `🎉 Congratulations! Your Property "${hotel.name}" Has Been Approved`,
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 640px; margin: 0 auto; padding: 0; background: #ffffff;">
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
            <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">ZivoHotels</h1>
            <p style="color: #a0aec0; margin: 8px 0 0; font-size: 14px;">Property Lifecycle Management</p>
          </div>
          
          <!-- Body -->
          <div style="padding: 40px 30px;">
            <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 20px; margin-bottom: 24px; text-align: center;">
              <span style="font-size: 40px;">🎉</span>
              <h2 style="color: #166534; margin: 12px 0 4px; font-size: 22px;">Congratulations! Property Approved!</h2>
              <p style="color: #15803d; margin: 0; font-size: 14px;">Your property validation is complete</p>
            </div>
            
            <p style="color: #374151; font-size: 15px; line-height: 1.6;">Dear <strong>${hotel.owner.name || 'Property Owner'}</strong>,</p>
            <p style="color: #374151; font-size: 15px; line-height: 1.6;">We are pleased to inform you that your property <strong>${hotel.name}</strong> has been <strong>successfully validated and approved</strong> for listing on ZivoHotels.</p>
            
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 20px; margin: 24px 0;">
              <h3 style="color: #1e293b; margin: 0 0 16px; font-size: 16px;">📋 Property Details</h3>
              <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 8px 0; color: #64748b; font-size: 13px;">Property Name</td><td style="padding: 8px 0; color: #1e293b; font-weight: 600; font-size: 13px; text-align: right;">${hotel.name}</td></tr>
                <tr><td style="padding: 8px 0; color: #64748b; font-size: 13px; border-top: 1px solid #f1f5f9;">Location</td><td style="padding: 8px 0; color: #1e293b; font-weight: 600; font-size: 13px; text-align: right; border-top: 1px solid #f1f5f9;">${hotel.city || 'N/A'}</td></tr>
                <tr><td style="padding: 8px 0; color: #64748b; font-size: 13px; border-top: 1px solid #f1f5f9;">Status</td><td style="padding: 8px 0; font-weight: 600; font-size: 13px; text-align: right; border-top: 1px solid #f1f5f9;"><span style="background: #dcfce7; color: #166534; padding: 2px 10px; border-radius: 20px; font-size: 12px;">APPROVED</span></td></tr>
              </table>
            </div>

            <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; padding: 16px 20px; margin: 24px 0;">
              <h4 style="color: #1e40af; margin: 0 0 8px; font-size: 14px;">📝 Next Step: Sign the Listing Agreement</h4>
              <p style="color: #1e3a5f; font-size: 13px; line-height: 1.6; margin: 0;">To complete your listing, please log in to your <a href="https://zivohotels.com/extranet" style="color: #2563eb; font-weight: 600;">Extranet Dashboard</a> and digitally sign the Listing Agreement. Once signed, your property will be ready to go live on ZivoHotels!</p>
            </div>

            <p style="color: #6b7280; font-size: 13px; line-height: 1.6;">Thank you for choosing ZivoHotels as your distribution partner. We look forward to a successful collaboration!</p>
          </div>
          
          <!-- Footer -->
          <div style="background: #f8fafc; padding: 24px 30px; text-align: center; border-top: 1px solid #e2e8f0; border-radius: 0 0 12px 12px;">
            <p style="color: #9ca3af; font-size: 12px; margin: 0;">© ${new Date().getFullYear()} ZivoHotels. All rights reserved.</p>
            <p style="color: #9ca3af; font-size: 11px; margin: 8px 0 0;">This is an automated notification. Please do not reply to this email.</p>
          </div>
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
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 640px; margin: 0 auto; padding: 0; background: #ffffff;">
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 40px 30px; text-align: center; border-radius: 12px 12px 0 0;">
            <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">ZivoHotels</h1>
            <p style="color: #a0aec0; margin: 8px 0 0; font-size: 14px;">Property Lifecycle Management</p>
          </div>
          
          <!-- Body -->
          <div style="padding: 40px 30px;">
            <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 12px; padding: 20px; margin-bottom: 24px; text-align: center;">
              <span style="font-size: 40px;">⚠️</span>
              <h2 style="color: #991b1b; margin: 12px 0 4px; font-size: 22px;">Action Required</h2>
              <p style="color: #b91c1c; margin: 0; font-size: 14px;">Your property review needs attention</p>
            </div>
            
            <p style="color: #374151; font-size: 15px; line-height: 1.6;">Dear <strong>${hotel.owner.name || 'Property Owner'}</strong>,</p>
            <p style="color: #374151; font-size: 15px; line-height: 1.6;">We reviewed your property <strong>${hotel.name}</strong> and need a few updates before we can approve it for listing.</p>
            
            <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 10px; padding: 20px; margin: 24px 0;">
              <h3 style="color: #991b1b; margin: 0 0 12px; font-size: 16px;">📌 Reviewer's Note</h3>
              <p style="color: #7f1d1d; font-size: 14px; line-height: 1.6; margin: 0; white-space: pre-wrap;">${reason}</p>
            </div>

            <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; padding: 16px 20px; margin: 24px 0;">
              <h4 style="color: #92400e; margin: 0 0 8px; font-size: 14px;">📝 How to Resolve</h4>
              <ol style="color: #78350f; font-size: 13px; line-height: 1.8; margin: 0; padding-left: 16px;">
                <li>Log in to your <a href="https://zivohotels.com/extranet" style="color: #2563eb;">Extranet Dashboard</a></li>
                <li>Update the requested information or upload the pending documents</li>
                <li>Re-submit your property for review</li>
              </ol>
            </div>

            <p style="color: #6b7280; font-size: 13px; line-height: 1.6;">If you have any questions, feel free to reach out to our support team.</p>
          </div>
          
          <!-- Footer -->
          <div style="background: #f8fafc; padding: 24px 30px; text-align: center; border-top: 1px solid #e2e8f0; border-radius: 0 0 12px 12px;">
            <p style="color: #9ca3af; font-size: 12px; margin: 0;">© ${new Date().getFullYear()} ZivoHotels. All rights reserved.</p>
            <p style="color: #9ca3af; font-size: 11px; margin: 8px 0 0;">This is an automated notification. Please do not reply to this email.</p>
          </div>
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
