import { Storage } from '@google-cloud/storage';
import { StorageService } from '../StorageService.js';
import dotenv from 'dotenv';
dotenv.config();

export class GoogleStorageProvider extends StorageService {
  constructor() {
    super();
    // In production (Cloud Run), this automatically uses Workload Identity / default service account.
    // Locally, it expects GOOGLE_APPLICATION_CREDENTIALS to be set.
    this.storage = new Storage();
    
    // We use the environment to determine the bucket name. Fallback to dev if not set.
    const env = process.env.NODE_ENV === 'production' ? 'prod' : 
               (process.env.NODE_ENV === 'staging' ? 'staging' : 'dev');
    this.bucketName = `zivohotels-media-${env}`;
    this.bucket = this.storage.bucket(this.bucketName);
  }

  async uploadFile(buffer, destinationPath, mimeType, isPrivate = false) {
    const file = this.bucket.file(destinationPath);
    
    await file.save(buffer, {
      metadata: {
        contentType: mimeType,
        cacheControl: 'public, max-age=31536000',
      },
      // If it's public, we could set public access, but our bucket has uniform bucket level access 
      // with public read enabled for all files. If it's private, we rely on signed URLs.
    });

    // If private, return the internal path so we can generate signed URLs later.
    // If public, return the public GCS/CDN URL.
    if (isPrivate) {
      return `gs://${this.bucketName}/${destinationPath}`;
    }

    return `https://storage.googleapis.com/${this.bucketName}/${destinationPath}`;
  }

  async deleteFile(filePath) {
    try {
      // Extract just the path if a full URL was passed
      const path = filePath.replace(`https://storage.googleapis.com/${this.bucketName}/`, '')
                           .replace(`gs://${this.bucketName}/`, '');
      const file = this.bucket.file(path);
      await file.delete();
    } catch (error) {
      console.error(`Failed to delete file from GCS: ${filePath}`, error);
      // We don't throw here to avoid failing operations if the file is already gone
    }
  }

  async generateSignedUrl(filePath, expiresInMinutes = 60) {
    const path = filePath.replace(`https://storage.googleapis.com/${this.bucketName}/`, '')
                         .replace(`gs://${this.bucketName}/`, '');
    const file = this.bucket.file(path);
    
    const [url] = await file.getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + expiresInMinutes * 60 * 1000,
    });
    
    return url;
  }
}
