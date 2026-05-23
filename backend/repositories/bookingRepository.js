import prisma from '../config/db.js';

export const bookingRepository = {

  /**
   * Finds an existing booking by requestId (Idempotency)
   * 
   * @param {String} requestId 
   */
  findByRequestId: async (requestId) => {
    if (!requestId) return null;
    return await prisma.booking.findUnique({ where: { requestId } });
  },

  /**
   * Creates a new booking record inside a transaction
   * 
   * @param {Object} tx - Prisma transaction client
   * @param {Object} data - Booking payload
   */
  create: async (tx, data) => {
    return await tx.booking.create({ data });
  },

  /**
   * Finds a single booking by ID
   * 
   * @param {String} id 
   */
  findById: async (id) => {
    return await prisma.booking.findUnique({ where: { id } });
  },

  /**
   * Updates a booking record (status, payment, etc) inside a transaction
   * 
   * @param {Object} tx 
   * @param {String} id 
   * @param {Object} data 
   */
  update: async (tx, id, data) => {
    return await tx.booking.update({
      where: { id },
      data
    });
  },

  /**
   * Audit log helper for bookings
   * 
   * @param {Object} tx 
   * @param {Object} data 
   */
  logAudit: async (tx, data) => {
    return await tx.auditLog.create({ data });
  }

};

export default bookingRepository;
