import { StorageService } from '../StorageService.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class LocalDiskProvider extends StorageService {
  constructor() {
    super();
    this.uploadDir = path.join(__dirname, '../../../public/uploads');
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  async uploadFile(buffer, destinationPath, mimeType, isPrivate = false) {
    // Flatten path to avoid creating subdirectories locally for simplicity
    const filename = destinationPath.replace(/\//g, '_');
    const filePath = path.join(this.uploadDir, filename);
    
    fs.writeFileSync(filePath, buffer);
    
    return `/uploads/${filename}`;
  }

  async deleteFile(filePath) {
    const filename = filePath.replace('/uploads/', '');
    const fullPath = path.join(this.uploadDir, filename);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  }

  async generateSignedUrl(filePath, expiresInMinutes = 60) {
    // Local disk doesn't support signed URLs natively, just return the path
    return filePath;
  }
}
