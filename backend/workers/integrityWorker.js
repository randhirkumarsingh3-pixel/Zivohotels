import { queueService } from '../services/queueService.js';
import prisma from '../config/db.js';
import systemCache from '../utils/systemCache.js';
import os from 'os';

const workerId = `integrity-worker-${os.hostname()}-${process.pid}`;
let isRunning = true;

const shutdown = async () => {
  console.log(`\n[${workerId}] Received termination signal. Shutting down gracefully...`);
  isRunning = false;
  await queueService.unlockJobsForWorker(workerId);
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

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

// Start the worker
export const startIntegrityWorker = async () => {
  console.log(`[${workerId}] Started polling for 'integrity' queue...`);
  
  while (isRunning) {
    try {
      const job = await queueService.fetchAndLock('integrity', workerId);
      
      if (job) {
        console.log(`[${workerId}] Processing job: ${job.id}`);
        await runIntegrityScan();
        
        // Enqueue the next run for 10 minutes from now
        await queueService.enqueue('integrity', 'INTEGRITY_SCAN', {}, { runAt: new Date(Date.now() + 10 * 60 * 1000) });
        
        // Mark complete
        await queueService.complete(job.id);
      } else {
        await new Promise(res => setTimeout(res, 60000)); // Sleep for 1 min if no jobs
      }
    } catch (err) {
      console.error(`[${workerId}] Polling error:`, err.message);
      await new Promise(res => setTimeout(res, 5000));
    }
  }
};

if (process.argv[1] && process.argv[1].endsWith('integrityWorker.js')) {
  startIntegrityWorker();
}
