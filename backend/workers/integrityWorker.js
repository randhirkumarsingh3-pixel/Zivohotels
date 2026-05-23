import prisma from '../config/db.js';
import systemCache from '../utils/systemCache.js';

/**
 * integrityWorker.js
 * Runs background scans for data inconsistencies.
 */
export const runIntegrityScan = async () => {
  const issues = [];
  
  try {
    console.log('--- Starting System Integrity Scan ---');

    // 1. Check for duplicate room codes within same hotel
    // (Handled by schema unique constraint, but good to verify legacy data)
    const roomTypes = await prisma.roomType.findMany({
      select: { id: true, code: true, hotelId: true }
    });
    const codeMap = new Map();
    roomTypes.forEach(rt => {
      const key = `${rt.hotelId}-${rt.code}`;
      if (codeMap.has(key)) {
        issues.push({ type: 'DUPLICATE_ROOM_CODE', severity: 'HIGH', message: `Duplicate code "${rt.code}" in hotel ${rt.hotelId}`, id: rt.id });
      }
      codeMap.set(key, true);
    });

    // 2. Inventory vs Bookings mismatch
    // (Check if availableRooms + bookedRooms === totalRooms for today)
    const today = new Date();
    today.setHours(0,0,0,0);
    const inventories = await prisma.inventory.findMany({
      where: { date: today },
      select: { id: true, totalRooms: true, bookedRooms: true, availableRooms: true, roomTypeId: true }
    });
    
    inventories.forEach(inv => {
      if ((inv.bookedRooms || 0) + inv.availableRooms !== inv.totalRooms) {
        issues.push({ 
          type: 'INVENTORY_MISMATCH', 
          severity: 'CRITICAL', 
          message: `Inventory sum mismatch for roomType ${inv.roomTypeId} on ${today.toISOString().split('T')[0]}`,
          id: inv.id 
        });
      }
    });

    // 3. Bookings without payments (ORPHANS)
    // PENDING bookings older than 2 hours that haven't been cancelled by cron yet
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const orphans = await prisma.booking.findMany({
      where: { status: 'PENDING', createdAt: { lt: twoHoursAgo } },
      select: { id: true, bookingRef: true }
    });
    
    orphans.forEach(b => {
      issues.push({ type: 'ORPHAN_BOOKING', severity: 'MEDIUM', message: `Stale pending booking: ${b.bookingRef}`, id: b.id });
    });

    // Save to Cache
    systemCache.setIntegrityResult({ issues });
    console.log(`--- Integrity Scan Completed: ${issues.length} issues found ---`);

  } catch (error) {
    console.error('Integrity Scan Error:', error);
  }
};

// Start the worker (Every 10 minutes)
export const startIntegrityWorker = () => {
  // Initial run
  runIntegrityScan();
  // Schedule
  setInterval(runIntegrityScan, 10 * 60 * 1000);
};
