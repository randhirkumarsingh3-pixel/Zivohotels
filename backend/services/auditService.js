import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

/**
 * AuditService
 * Records sensitive admin and partner actions to the database.
 */

export const recordAction = async ({
  userId,
  action,
  entity,
  entityId,
  before = null,
  after = null,
  req = null
}) => {
  try {
    const log = await prisma.adminActionLog.create({
      data: {
        userId,
        action,
        entity,
        entityId,
        before: before ? JSON.parse(JSON.stringify(before)) : null,
        after: after ? JSON.parse(JSON.stringify(after)) : null,
        ipAddress: req?.ip || req?.headers['x-forwarded-for'],
        userAgent: req?.headers['user-agent']
      }
    });
    return log;
  } catch (error) {
    console.error('Audit Log Error:', error);
    // We don't throw here to prevent blocking the main operation if logging fails,
    // though in a strict fintech environment, you might want to.
    return null;
  }
};

export const getAuditHistory = async (entity, entityId) => {
  return await prisma.adminActionLog.findMany({
    where: { entity, entityId },
    orderBy: { timestamp: 'desc' }
  });
};
