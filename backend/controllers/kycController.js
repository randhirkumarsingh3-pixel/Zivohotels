import { asyncHandler } from '../middleware/asyncHandler.js';
import prisma from '../config/db.js';
import { detectFileType, saveKycFile, readKycFile, KYC_MAX_BYTES } from '../services/kycStorage.js';

const DOCUMENT_TYPES = ['GST', 'PAN', 'TRADE_LICENSE', 'OWNERSHIP_PROOF', 'BANK_PROOF', 'FIRE_SAFETY'];

/** Admins may access any hotel's documents; owners only their own hotels'. */
const canAccessHotel = (user, hotel) => user.role === 'ADMIN' || hotel.ownerId === user.id;

/**
 * Never send the private storage key to the browser. Expose only what the UI needs;
 * the file itself is fetched through GET /kyc/documents/:id/file.
 */
const toClientDocument = (doc) => {
  const { documentUrl, ocrMetadata, ...rest } = doc;
  const file = ocrMetadata?.file || {};
  return {
    ...rest,
    hasFile: Boolean(documentUrl) && !/^https?:\/\//.test(documentUrl),
    fileName: file.originalName || null,
    fileSize: file.size || null,
    fileType: file.mimeType || null,
  };
};

export const getPropertyDocuments = asyncHandler(async (req, res) => {
  const { hotelId } = req.params;

  const hotel = await prisma.hotel.findUnique({ where: { id: hotelId } });
  if (!hotel) return res.status(404).json({ success: false, message: 'Hotel not found' });

  if (!canAccessHotel(req.user, hotel)) {
    return res.status(403).json({ success: false, message: 'Not authorized to view documents for this property' });
  }

  const documents = await prisma.kYCRecord.findMany({
    where: { hotelId },
    orderBy: { documentType: 'asc' }
  });

  res.json({ success: true, data: documents.map(toClientDocument) });
});

/**
 * POST /api/v1/kyc/:hotelId/upload
 * Body: { documentType, file: "data:<mime>;base64,<...>", fileName? }
 * The file is validated by its real content (PDF, JPG or PNG; max 10 MB) and stored privately.
 */
export const uploadDocument = asyncHandler(async (req, res) => {
  const { hotelId } = req.params;
  const { documentType, file, fileName } = req.body || {};

  if (!DOCUMENT_TYPES.includes(documentType)) {
    return res.status(400).json({ success: false, message: `documentType must be one of: ${DOCUMENT_TYPES.join(', ')}` });
  }

  const match = typeof file === 'string' ? file.match(/^data:[^;,]*;base64,(.+)$/s) : null;
  if (!match) {
    return res.status(400).json({ success: false, message: 'Attach the document file (PDF, JPG or PNG).' });
  }

  const buffer = Buffer.from(match[1], 'base64');
  if (buffer.length === 0) {
    return res.status(400).json({ success: false, message: 'The file is empty.' });
  }
  if (buffer.length > KYC_MAX_BYTES) {
    return res.status(413).json({ success: false, message: 'The file is larger than 10 MB.' });
  }

  const fileType = detectFileType(buffer);
  if (!fileType) {
    return res.status(415).json({ success: false, message: 'Only PDF, JPG and PNG files are accepted.' });
  }

  const hotel = await prisma.hotel.findUnique({ where: { id: hotelId } });
  if (!hotel || hotel.isDeleted) return res.status(404).json({ success: false, message: 'Hotel not found' });

  if (!canAccessHotel(req.user, hotel)) {
    return res.status(403).json({ success: false, message: 'Not authorized to upload documents for this property' });
  }

  const storageKey = await saveKycFile(buffer, fileType, hotelId);
  const fileInfo = {
    originalName: typeof fileName === 'string' ? fileName.slice(0, 200) : null,
    size: buffer.length,
    mimeType: fileType.mimeType,
    uploadedBy: req.user.id,
    uploadedAt: new Date().toISOString(),
  };

  // One record per document type; replacing a file resets it to PENDING review.
  const existing = await prisma.kYCRecord.findFirst({ where: { hotelId, documentType } });

  const record = existing
    ? await prisma.kYCRecord.update({
        where: { id: existing.id },
        data: {
          documentUrl: storageKey,
          documentStatus: 'PENDING',
          rejectionReason: null,
          verifiedBy: null,
          verifiedAt: null,
          version: existing.version + 1,
          ocrMetadata: { ...(existing.ocrMetadata || {}), file: fileInfo },
        }
      })
    : await prisma.kYCRecord.create({
        data: { hotelId, documentType, documentUrl: storageKey, documentStatus: 'PENDING', ocrMetadata: { file: fileInfo } }
      });

  // Compliance score: 20 points per document type on file, capped at 100
  const docCount = await prisma.kYCRecord.count({ where: { hotelId } });
  await prisma.hotel.update({
    where: { id: hotelId },
    data: { complianceScore: Math.min(docCount * 20, 100) }
  });

  await prisma.auditLog.create({
    data: {
      action: existing ? 'KYC_DOCUMENT_REPLACED' : 'KYC_DOCUMENT_UPLOADED',
      entityType: 'KYC_RECORD',
      entityId: record.id,
      userId: req.user.id,
      requestId: req.id,
      details: { hotelId, documentType, version: record.version, size: buffer.length, mimeType: fileType.mimeType }
    }
  }).catch(err => console.error('Failed to write KYC audit log:', err));

  res.status(existing ? 200 : 201).json({ success: true, data: toClientDocument(record) });
});

/**
 * GET /api/v1/kyc/documents/:id/file — streams the document to an admin or the hotel's owner.
 */
export const downloadDocument = asyncHandler(async (req, res) => {
  const record = await prisma.kYCRecord.findUnique({
    where: { id: req.params.id },
    include: { hotel: { select: { ownerId: true } } }
  });
  if (!record) return res.status(404).json({ success: false, message: 'Document not found' });

  if (!canAccessHotel(req.user, record.hotel)) {
    return res.status(403).json({ success: false, message: 'Not authorized to view this document' });
  }

  const contents = await readKycFile(record.documentUrl);
  if (!contents) {
    return res.status(404).json({ success: false, message: 'The file for this document is not available. Please upload it again.' });
  }

  const fileType = detectFileType(contents);
  res.set({
    'Content-Type': fileType ? fileType.mimeType : 'application/octet-stream',
    'Content-Disposition': `inline; filename="${record.documentType.toLowerCase()}.${fileType ? fileType.ext : 'bin'}"`,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.locals.skipFormat = true;
  res.send(contents);
});

export const verifyDocument = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { status, reason } = req.body;

  if (!['VERIFIED', 'REJECTED'].includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid status. Must be VERIFIED or REJECTED' });
  }
  if (status === 'REJECTED' && !(typeof reason === 'string' && reason.trim())) {
    return res.status(400).json({ success: false, message: 'A rejection reason is required' });
  }

  const record = await prisma.kYCRecord.findUnique({ where: { id } });
  if (!record) return res.status(404).json({ success: false, message: 'Document not found' });

  const updated = await prisma.kYCRecord.update({
    where: { id },
    data: {
      documentStatus: status,
      rejectionReason: status === 'REJECTED' ? reason.trim() : null,
      verifiedBy: req.user.id,
      verifiedAt: new Date()
    }
  });

  await prisma.auditLog.create({
    data: {
      action: `KYC_DOCUMENT_${status}`,
      entityType: 'KYC_RECORD',
      entityId: id,
      userId: req.user.id,
      requestId: req.id,
      details: { hotelId: record.hotelId, documentType: record.documentType, reason: status === 'REJECTED' ? reason.trim() : undefined }
    }
  }).catch(err => console.error('Failed to write KYC audit log:', err));

  res.json({ success: true, data: toClientDocument(updated) });
});
