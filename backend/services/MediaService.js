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
   * Accepts all common image MIME types including HEIC from iPhones.
   */
  async uploadHotelImage(buffer, mimeType, hotelId, isPrimary = false) {
    const ALLOWED_IMAGE_TYPES = [
      'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
      'image/gif', 'image/avif', 'image/bmp', 'image/tiff',
      'image/heic', 'image/heif', 'image/svg+xml'
    ];
    this._validateMimeType(mimeType, ALLOWED_IMAGE_TYPES);

    // Normalize extension — HEIC files stored as jpg so browsers can display them
    const MIME_TO_EXT = {
      'image/jpeg': 'jpg', 'image/jpg': 'jpg',
      'image/png': 'png', 'image/webp': 'webp',
      'image/gif': 'gif', 'image/avif': 'avif',
      'image/bmp': 'bmp', 'image/tiff': 'tiff',
      'image/heic': 'jpg', 'image/heif': 'jpg',
      'image/svg+xml': 'svg'
    };
    const extension = MIME_TO_EXT[mimeType] || mimeType.split('/')[1] || 'jpg';
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
