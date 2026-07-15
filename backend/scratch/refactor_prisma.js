import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FILES_TO_REFACTOR = [
  { file: '../controllers/extranet/financeController.js', importPath: '../../config/db.js' },
  { file: '../middleware/gatekeeper.js', importPath: '../config/db.js' },
  { file: '../services/anomalyEnforcer.js', importPath: '../config/db.js' },
  { file: '../services/auditService.js', importPath: '../config/db.js' },
  { file: '../services/decisionLogger.js', importPath: '../config/db.js' },
  { file: '../services/decisionOrchestrator.js', importPath: '../config/db.js' },
  { file: '../services/eventBus.js', importPath: '../config/db.js' },
  { file: '../services/governanceMemoryService.js', importPath: '../config/db.js' },
  { file: '../services/ledgerService.js', importPath: '../config/db.js' },
  { file: '../services/orchestrationService.js', importPath: '../config/db.js' },
  { file: '../services/payoutStateMachine.js', importPath: '../config/db.js' },
  { file: '../services/queueService.js', importPath: '../config/db.js' },
  { file: '../services/settlementService.js', importPath: '../config/db.js' }
];

function refactor() {
  for (const item of FILES_TO_REFACTOR) {
    const fullPath = path.resolve(__dirname, item.file);
    if (!fs.existsSync(fullPath)) {
      console.warn(`File not found: ${fullPath}`);
      continue;
    }

    let content = fs.readFileSync(fullPath, 'utf8');
    
    // Check if it has PrismaClient imports
    if (content.includes("import { PrismaClient } from '@prisma/client';") || content.includes('import {PrismaClient} from "@prisma/client";')) {
      // Replace import
      content = content.replace(/import\s*\{\s*PrismaClient\s*\}\s*from\s*['"]@prisma\/client['"];?/g, `import prisma from '${item.importPath}';`);
      // Replace instantiation
      content = content.replace(/const\s+prisma\s*=\s*new\s+PrismaClient\(\s*\);?/g, '');
      
      fs.writeFileSync(fullPath, content, 'utf8');
      console.log(`Successfully refactored: ${item.file}`);
    } else {
      console.log(`Skipped (already refactored or different import): ${item.file}`);
    }
  }
}

refactor();
