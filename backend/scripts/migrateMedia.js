import { mediaService } from '../services/MediaService.js';
import prisma from '../config/db.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  const isDryRun = process.argv.includes('--dry-run');
  console.log(`--- Starting ZivoHotels Media Migration to GCS ${isDryRun ? '[DRY-RUN MODE]' : ''} ---`);
  
  // 1. Rollback Mechanism - Backup original DB URLs
  if (!isDryRun) {
    console.log('Creating rollback backup of current Media URLs in database...');
    const allImages = await prisma.hotelImage.findMany();
    const backupPath = path.join(__dirname, 'media_url_rollback_backup.json');
    fs.writeFileSync(backupPath, JSON.stringify(allImages, null, 2));
    console.log(`Rollback backup created at: ${backupPath}`);
  }
  
  const uploadDir = path.join(__dirname, '../../public/uploads');
  if (!fs.existsSync(uploadDir)) {
    console.log('No local uploads directory found. Migration complete.');
    return;
  }

  const files = fs.readdirSync(uploadDir);
  
  let metrics = {
    discovered: files.length,
    uploaded: 0,
    dbUpdated: 0,
    skipped: 0,
    failed: 0,
    checksumMismatches: 0
  };

  const manifest = {
    migrationId: crypto.randomUUID(),
    startedAt: new Date().toISOString(),
    completedAt: null,
    bucket: process.env.GCS_BUCKET_NAME || 'zivohotels-media-staging',
    files: []
  };

  for (const filename of files) {
    const filePath = path.join(uploadDir, filename);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      metrics.discovered--;
      continue;
    }

    try {
      // 1. Find the DB record using this file
      const oldUrl = `/uploads/${filename}`;
      const hotelImage = await prisma.hotelImage.findFirst({ where: { url: { contains: filename } } });
      
      if (!hotelImage) {
        console.warn(`⚠️ Warning: No DB record found for ${filename}. Skipping to avoid orphan files.`);
        metrics.skipped++;
        manifest.files.push({ oldPath: oldUrl, status: 'SKIPPED_NO_DB_RECORD' });
        continue;
      }

      // Idempotency check: If URL already points to GCS, skip
      if (hotelImage.url.includes('storage.googleapis.com')) {
        console.log(`⏩ Skipped: ${filename} (Already migrated)`);
        metrics.skipped++;
        manifest.files.push({ oldPath: oldUrl, newPath: hotelImage.url, status: 'SKIPPED_ALREADY_MIGRATED' });
        continue;
      }

      // 2. Read file and calculate checksum
      const buffer = fs.readFileSync(filePath);
      const originalChecksum = crypto.createHash('md5').update(buffer).digest('hex');
      const extension = filename.split('.').pop();
      const mimeType = `image/${extension === 'jpg' ? 'jpeg' : extension}`;

      if (isDryRun) {
        console.log(`🔍 [DRY-RUN] Would upload: ${filename} (Checksum: ${originalChecksum})`);
        metrics.uploaded++;
        metrics.dbUpdated++;
        manifest.files.push({ oldPath: oldUrl, checksum: originalChecksum, status: 'DRY_RUN_SUCCESS' });
        continue;
      }

      // 3. Upload via MediaService orchestration
      const newUrl = await mediaService.uploadHotelImage(
        buffer, 
        mimeType, 
        hotelImage.hotelId, 
        hotelImage.isPrimary
      );
      
      metrics.uploaded++;

      // 4. Update Database
      await prisma.hotelImage.update({
        where: { id: hotelImage.id },
        data: { url: newUrl }
      });
      
      metrics.dbUpdated++;

      console.log(`✅ Migrated: ${filename} -> ${newUrl}`);
      manifest.files.push({ oldPath: oldUrl, newPath: newUrl, checksum: originalChecksum, status: 'SUCCESS' });
    } catch (err) {
      console.error(`❌ Failed to migrate ${filename}:`, err.message);
      metrics.failed++;
      manifest.files.push({ oldPath: `/uploads/${filename}`, error: err.message, status: 'FAILED' });
    }
  }

  manifest.completedAt = new Date().toISOString();
  
  if (!isDryRun) {
    const manifestPath = path.join(__dirname, 'migration-manifest.json');
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`\n📄 Migration manifest written to: ${manifestPath}`);
  }

  console.log('\n--- Final Migration Summary ---');
  console.log(`Files discovered:        ${metrics.discovered}`);
  console.log(`Uploaded:                ${metrics.uploaded}`);
  console.log(`Database updated:        ${metrics.dbUpdated}`);
  console.log(`Skipped:                 ${metrics.skipped}`);
  console.log(`Failed:                  ${metrics.failed}`);
  console.log(`Checksum mismatches:     ${metrics.checksumMismatches}`);
  
  if (metrics.failed > 0 || metrics.checksumMismatches > 0) {
    console.log(`\n❌ Media Migration ${isDryRun ? 'Dry-Run' : ''}: FAILED`);
  } else {
    console.log(`\n✅ Media Migration ${isDryRun ? 'Dry-Run' : ''}: PASS`);
  }
}

// Execute if run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runMigration()
    .then(() => process.exit(0))
    .catch(e => {
      console.error('Fatal Migration Error:', e);
      process.exit(1);
    });
}
