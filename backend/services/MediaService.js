import { isLocalStorageDriver } from '../config/storage.js';
import { sanitizeImage } from './imageVariants.js';
import { GoogleStorageProvider } from './providers/GoogleStorageProvider.js';
import { LocalDiskProvider } from './providers/LocalDiskProvider.js';
import crypto from 'crypto';

export class MediaService {
  constructor() {
    // Factory: Use local disk if we're missing GCP credentials and not in prod
    // Local disk or Google Cloud Storage: see config/storage.js (STORAGE_DRIVER)
    if (isLocalStorageDriver()) {
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
  async uploadHotelImage(buffer, _declaredType, hotelId, isPrimary = false) {
    // What the browser says the file is doesn't count: the photo must really decode, and it is
    // re-made (no SVG, no hidden scripts or data, no camera location). See sanitizeImage().
    const safe = await sanitizeImage(buffer);
    const hash = crypto.createHash('md5').update(safe.buffer).digest('hex').substring(0, 8);
    const filename = `${isPrimary ? 'primary' : 'img'}-${Date.now()}-${hash}.${safe.ext}`;
    // Hotel ids only (no path tricks)
    const folder = String(hotelId || '').replace(/[^A-Za-z0-9-]/g, '') || 'unassigned';
    const destinationPath = `properties/${folder}/${filename}`;
    return await this.storage.uploadFile(safe.buffer, destinationPath, safe.mimeType, true);
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
