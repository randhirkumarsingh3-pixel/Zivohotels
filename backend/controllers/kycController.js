import { asyncHandler } from '../middleware/asyncHandler.js';
import prisma from '../config/db.js';

export const getPropertyDocuments = asyncHandler(async (req, res) => {
  const { hotelId } = req.params;
  
  const hotel = await prisma.hotel.findUnique({ where: { id: hotelId } });
  if (!hotel) return res.status(404).json({ success: false, message: 'Hotel not found' });
  
  if (req.user.role === 'OWNER' && hotel.ownerId !== req.user.id) {
    return res.status(403).json({ success: false, message: 'Not authorized to view documents for this property' });
  }

  const documents = await prisma.kYCRecord.findMany({
    where: { hotelId }
  });

  res.json({ success: true, data: documents });
});

export const uploadDocument = asyncHandler(async (req, res) => {
  const { hotelId } = req.params;
  const { documentType, documentUrl } = req.body;
  
  if (!documentType || !documentUrl) {
    return res.status(400).json({ success: false, message: 'documentType and documentUrl are required' });
  }

  const hotel = await prisma.hotel.findUnique({ where: { id: hotelId } });
  if (!hotel) return res.status(404).json({ success: false, message: 'Hotel not found' });
  
  if (req.user.role === 'OWNER' && hotel.ownerId !== req.user.id) {
    return res.status(403).json({ success: false, message: 'Not authorized to upload documents for this property' });
  }

  // Upsert the KYC record for this document type
  const existing = await prisma.kYCRecord.findFirst({
    where: { hotelId, documentType }
  });

  let record;
  if (existing) {
    record = await prisma.kYCRecord.update({
      where: { id: existing.id },
      data: {
        documentUrl,
        documentStatus: 'PENDING',
        rejectionReason: null,
        version: existing.version + 1
      }
    });
  } else {
    record = await prisma.kYCRecord.create({
      data: {
        hotelId,
        documentType,
        documentUrl,
        documentStatus: 'PENDING'
      }
    });
  }

  // Update compliance score (simple logic: +20 points per uploaded doc)
  const docs = await prisma.kYCRecord.findMany({ where: { hotelId } });
  let complianceScore = Math.min(docs.length * 20, 100);
  await prisma.hotel.update({
    where: { id: hotelId },
    data: { complianceScore }
  });

  res.json({ success: true, data: record });
});

export const verifyDocument = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, reason } = req.body;
  
  if (!['VERIFIED', 'REJECTED'].includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid status. Must be VERIFIED or REJECTED' });
  }

  const record = await prisma.kYCRecord.findUnique({ where: { id } });
  if (!record) return res.status(404).json({ success: false, message: 'Document not found' });

  const updated = await prisma.kYCRecord.update({
    where: { id },
    data: {
      documentStatus: status,
      rejectionReason: status === 'REJECTED' ? reason : null,
      verifiedBy: req.user.id,
      verifiedAt: new Date()
    }
  });

  res.json({ success: true, data: updated });
});
