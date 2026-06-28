import { GoogleStorageProvider } from './providers/GoogleStorageProvider.js';
import { LocalDiskProvider } from './providers/LocalDiskProvider.js';
import crypto from 'crypto';

export class MediaService {
  constructor() {
    // Factory: Use local disk if we're missing GCP credentials and not in prod
    if (process.env.NODE_ENV !== 'production' && !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      console.log('MediaService initialized with LocalDiskProvider');
      this.storage = new LocalDiskProvider();
    } else {
      console.log('MediaService initialized with GoogleStorageProvider');
      this.storage = new GoogleStorageProvider();
    }
  }

  /**
   * Orchestrates the upload of a hotel image, ensuring correct directory structure.
   */
  async uploadHotelImage(buffer, mimeType, hotelId, isPrimary = false) {
    this._validateMimeType(mimeType, ['image/jpeg', 'image/png', 'image/webp']);
    
    const extension = mimeType.split('/')[1];
    const hash = crypto.createHash('md5').update(buffer).digest('hex').substring(0, 8);
    const filename = `${isPrimary ? 'primary' : 'img'}-${Date.now()}-${hash}.${extension}`;
    
    // Structure: properties/{hotelId}/{filename}
    const destinationPath = `properties/${hotelId}/${filename}`;
    
    return await this.storage.uploadFile(buffer, destinationPath, mimeType, false);
  }

  /**
   * Uploads a private document (e.g. KYC, Invoice)
   */
  async uploadPrivateDocument(buffer, mimeType, userId, documentType) {
    this._validateMimeType(mimeType, ['application/pdf', 'image/jpeg', 'image/png']);
    
    const extension = mimeType.split('/')[1] || 'pdf';
    const filename = `${documentType}-${Date.now()}.${extension}`;
    
    // Structure: users/{userId}/documents/{filename}
    const destinationPath = `users/${userId}/documents/${filename}`;
    
    return await this.storage.uploadFile(buffer, destinationPath, mimeType, true);
  }

  async deleteMedia(url) {
    await this.storage.deleteFile(url);
  }

  async getSignedUrl(url, expiresInMinutes = 60) {
    return await this.storage.generateSignedUrl(url, expiresInMinutes);
  }

  _validateMimeType(mimeType, allowedTypes) {
    if (!allowedTypes.includes(mimeType)) {
      throw new Error(`Invalid file type. Allowed: ${allowedTypes.join(', ')}`);
    }
  }
}

// Export a singleton instance
export const mediaService = new MediaService();
