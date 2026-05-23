import prisma from '../config/db.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { z } from 'zod';

// --- ZOD SCHEMAS ---

const agreementCreateSchema = z.object({
  hotelId: z.string().uuid('Invalid hotel ID'),
  commissionRate: z.number().min(0).max(100).optional().default(15.0)
});

// ─── GET /api/v1/agreements ───────────────────────────────────────────────────
export const getAgreements = asyncHandler(async (req, res) => {
    const { status, search } = req.query;

    const filter = {};
    if (status) filter.status = status;

    // 1. Fetch Agreements directly (without 'include' to avoid client-sync errors)
    const rawAgreements = await prisma.agreement.findMany({
      where: filter,
      orderBy: { createdAt: 'desc' },
    });

    // 2. Manually fetch associated Hotels and Owners
    const hotelIds = [...new Set(rawAgreements.map(a => a.hotelId))];
    const hotels = await prisma.hotel.findMany({
      where: { id: { in: hotelIds } },
      select: {
        id: true, name: true, city: true, status: true,
        owner: { select: { id: true, name: true, email: true } },
      },
    });

    // 3. Combine them in-memory
    const agreements = rawAgreements.map(a => ({
      ...a,
      hotel: hotels.find(h => h.id === a.hotelId) || null
    }));

    // Apply search filter on hotel name / owner name
    const filtered = search
      ? agreements.filter(a =>
          (a.hotel?.name || '').toLowerCase().includes(search.toLowerCase()) ||
          (a.hotel?.owner?.name || '').toLowerCase().includes(search.toLowerCase()) ||
          (a.hotel?.owner?.email || '').toLowerCase().includes(search.toLowerCase())
        )
      : agreements;

    // Summary counts
    const counts = {
      total:     filtered.length,
      draft:     filtered.filter(a => a.status === 'DRAFT').length,
      pending:   filtered.filter(a => a.status === 'PENDING_SIGNATURE').length,
      signed:    filtered.filter(a => a.status === 'SIGNED').length,
      expired:   filtered.filter(a => a.status === 'EXPIRED').length,
    };

    res.status(200).json({ success: true, data: filtered, counts, requestId: req.id });
});

export const createAgreement = asyncHandler(async (req, res) => {
  const validation = agreementCreateSchema.safeParse(req.body);
  if (!validation.success) {
    return res.status(422).json({ 
      success: false, 
      message: 'Validation failed', 
      errors: validation.error.format(), 
      requestId: req.id 
    });
  }

  const { hotelId, commissionRate } = validation.data;

    if (!hotelId) {
      return res.status(422).json({ success: false, message: 'hotelId is required' });
    }

    const hotel = await prisma.hotel.findUnique({ where: { id: hotelId } });
    if (!hotel) return res.status(404).json({ success: false, message: 'Hotel not found' });

    // Upsert: create if none exists, update to DRAFT if re-generating
    const agreement = await prisma.agreement.upsert({
      where: { hotelId },
      create: {
        hotelId,
        ownerId:       hotel.ownerId,
        commissionRate: parseFloat(commissionRate),
        status:        'DRAFT',
      },
      update: {
        status:        'DRAFT',
        commissionRate: parseFloat(commissionRate),
        sentAt:        null,
        signedAt:      null,
      },
    });

    res.status(201).json({ success: true, data: agreement, requestId: req.id });
});

export const sendAgreement = asyncHandler(async (req, res) => {
  const { id } = req.params;

    const agreement = await prisma.agreement.update({
      where: { id },
      data:  { status: 'PENDING_SIGNATURE', sentAt: new Date() },
    });

    await prisma.auditLog.create({
      data: { action: 'SEND_AGREEMENT', entityType: 'AGREEMENT', entityId: id, userId: req.user.id },
    });

    res.status(200).json({ success: true, data: agreement, message: 'Agreement marked as sent.', requestId: req.id });
});

export const signAgreement = asyncHandler(async (req, res) => {
  const { id } = req.params;

    const agreement = await prisma.agreement.findUnique({ where: { id } });
    if (!agreement) return res.status(404).json({ success: false, message: 'Agreement not found' });

    const expiryAt = new Date();
    expiryAt.setFullYear(expiryAt.getFullYear() + 1); // 12 months

    // Transaction: sign agreement + activate property
    const [updated] = await prisma.$transaction([
      prisma.agreement.update({
        where: { id },
        data:  { status: 'SIGNED', signedAt: new Date(), expiryAt },
      }),
      // ✅ ACTIVATION GUARD — property goes ACTIVE only when agreement is SIGNED
      prisma.hotel.update({
        where: { id: agreement.hotelId },
        data:  { status: 'ACTIVE' },
      }),
    ]);

    await prisma.auditLog.create({
      data: {
        action: 'SIGN_AGREEMENT_ACTIVATE_PROPERTY',
        entityType: 'AGREEMENT', entityId: id,
        details: { hotelId: agreement.hotelId },
        userId: req.user.id,
      },
    });

    res.status(200).json({
      success: true,
      data: updated,
      message: 'Agreement signed. Property is now ACTIVE.',
      requestId: req.id
    });
});

export const cancelAgreement = asyncHandler(async (req, res) => {
  const { id } = req.params;

    const agreement = await prisma.agreement.findUnique({ where: { id } });
    if (!agreement) return res.status(404).json({ success: false, message: 'Agreement not found' });

    // If agreement was SIGNED, revert hotel to PENDING
    if (agreement.status === 'SIGNED') {
      await prisma.hotel.update({
        where: { id: agreement.hotelId },
        data:  { status: 'PENDING' },
      });
    }

    await prisma.agreement.delete({ where: { id } });

    await prisma.auditLog.create({
      data: { action: 'CANCEL_AGREEMENT', entityType: 'AGREEMENT', entityId: id, userId: req.user.id },
    });

    res.status(200).json({ success: true, message: 'Agreement cancelled.', requestId: req.id });
});
