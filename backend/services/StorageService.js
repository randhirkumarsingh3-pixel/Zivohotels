/**
 * StorageService is an abstract interface for storage operations.
 * It prevents the rest of the application from being tightly coupled
 * to a specific storage provider (like GCS, AWS S3, or Local Disk).
 */
export class StorageService {
  /**
   * Uploads a file to storage.
   * @param {Buffer} buffer - The file buffer.
   * @param {string} destinationPath - The path/key in the storage bucket.
   * @param {string} mimeType - The file's MIME type.
   * @param {boolean} isPrivate - Whether the file should be private (requires signed URL to view).
   * @returns {Promise<string>} The URL or relative path to access the file.
   */
  async uploadFile(buffer, destinationPath, mimeType, isPrivate = false) {
    throw new Error('Method not implemented.');
  }

  /**
   * Deletes a file from storage.
   * @param {string} filePath - The path/key to delete.
   * @returns {Promise<void>}
   */
  async deleteFile(filePath) {
    throw new Error('Method not implemented.');
  }

  /**
   * Generates a signed URL for a private file.
   * @param {string} filePath - The path/key of the file.
   * @param {number} expiresInMinutes - Expiry time in minutes.
   * @returns {Promise<string>} The signed URL.
   */
  async generateSignedUrl(filePath, expiresInMinutes = 60) {
    throw new Error('Method not implemented.');
  }
}
