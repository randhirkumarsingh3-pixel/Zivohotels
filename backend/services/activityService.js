import prisma from '../config/db.js';

export const logActivity = async ({ hotelId, userId, action, entityType, entityId, details, before = null, after = null }) => {
  try {
    // We log to AuditLog for general audit trail
    await prisma.auditLog.create({
      data: {
        action,
        entityType,
        entityId,
        userId,
        details: {
          hotelId,
          ...details,
          before,
          after
        }
      }
    });

    // Optionally emit event if we set up an event emitter later
  } catch (error) {
    console.error('Failed to log activity:', error);
  }
};

export const getHotelActivity = async (hotelId, limit = 50) => {
  try {
    const logs = await prisma.auditLog.findMany({
      where: {
        details: {
          path: ['hotelId'],
          equals: hotelId
        }
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        // Unfortunately AuditLog doesn't relate directly to User in schema currently for include, 
        // but we have userId to resolve if needed later.
      }
    });
    return logs;
  } catch (error) {
    console.error('Failed to fetch activity:', error);
    return [];
  }
};
