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
    
    return await this.storage.uploadFile(buffer, destinationPath, mimeType, true);
  }

  /**
   * Helper to sign all GCS (gs://) URLs inside a single hotel object (for both hotel media and room type images)
   */
  async signHotelUrls(hotel) {
    if (!hotel) return hotel;
    const signedHotel = { ...hotel };
    
    if (signedHotel.media && Array.isArray(signedHotel.media)) {
      signedHotel.media = await Promise.all(signedHotel.media.map(async (m) => {
        if (m.url && m.url.startsWith('gs://')) {
          return { ...m, url: await this.getSignedUrl(m.url) };
        }
        return m;
      }));
    }

    if (signedHotel.roomTypes && Array.isArray(signedHotel.roomTypes)) {
      signedHotel.roomTypes = await Promise.all(signedHotel.roomTypes.map(async (rt) => {
        const signedRt = { ...rt };
        if (signedRt.images && Array.isArray(signedRt.images)) {
          signedRt.images = await Promise.all(signedRt.images.map(async (imgLink) => {
            if (imgLink.image && imgLink.image.url && imgLink.image.url.startsWith('gs://')) {
              return {
                ...imgLink,
                image: {
                  ...imgLink.image,
                  url: await this.getSignedUrl(imgLink.image.url)
                }
              };
            }
            return imgLink;
          }));
        }
        return signedRt;
      }));
    }

    return signedHotel;
  }

  /**
   * Helper to sign GCS URLs across an array of hotel objects
   */
  async signHotelsUrls(hotels) {
    if (!hotels || !Array.isArray(hotels)) return hotels;
    return await Promise.all(hotels.map(h => this.signHotelUrls(h)));
  }

  /**
   * Helper to sign GCS (gs://) URLs inside an array of RoomType objects
   */
  async signRoomTypesUrls(roomTypes) {
    if (!roomTypes || !Array.isArray(roomTypes)) return roomTypes;
    return await Promise.all(roomTypes.map(async (rt) => {
      const signedRt = { ...rt };
      if (signedRt.images && Array.isArray(signedRt.images)) {
        signedRt.images = await Promise.all(signedRt.images.map(async (imgLink) => {
          if (imgLink.image && imgLink.image.url && imgLink.image.url.startsWith('gs://')) {
            return {
              ...imgLink,
              image: {
                ...imgLink.image,
                url: await this.getSignedUrl(imgLink.image.url)
              }
            };
          }
          return imgLink;
        }));
      }
      return signedRt;
    }));
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
