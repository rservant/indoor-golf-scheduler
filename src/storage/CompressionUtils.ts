/**
 * Compression utilities for CI storage optimization
 */
export class CompressionUtils {
  private static readonly COMPRESSION_MARKER = 'COMPRESSED:';
  private static readonly MIN_COMPRESSION_SIZE = 100;

  /**
   * Compress data if it meets size threshold
   */
  public static compressData(data: string): string {
    if (!this.shouldCompress(data)) {
      return data;
    }

    try {
      const compressed = this.performCompression(data);
      return `${this.COMPRESSION_MARKER}${compressed}`;
    } catch (error) {
      console.warn('Compression failed, storing uncompressed:', error);
      return data;
    }
  }

  /**
   * Decompress data if it's compressed
   */
  public static decompressData(data: string): string {
    if (!this.isCompressed(data)) {
      return data;
    }

    try {
      const compressedData = data.substring(this.COMPRESSION_MARKER.length);
      return this.performDecompression(compressedData);
    } catch (error) {
      console.warn('Decompression failed, returning as-is:', error);
      return data;
    }
  }

  /**
   * Check if data should be compressed
   */
  public static shouldCompress(data: string): boolean {
    return data.length > this.MIN_COMPRESSION_SIZE;
  }

  /**
   * Check if data is compressed
   */
  public static isCompressed(data: string): boolean {
    return data.startsWith(this.COMPRESSION_MARKER);
  }

  /**
   * Get compression ratio estimate
   */
  public static getCompressionRatio(originalData: string): number {
    if (!this.shouldCompress(originalData)) {
      return 1.0;
    }

    const compressed = this.compressData(originalData);
    return compressed.length / originalData.length;
  }

  /**
   * Perform actual compression using simple base64 encoding with run-length encoding
   */
  private static performCompression(data: string): string {
    // Simple run-length encoding for repeated characters
    let compressed = '';
    let i = 0;
    
    while (i < data.length) {
      let count = 1;
      const char = data[i];
      
      // Count consecutive identical characters (max 255 for single byte)
      while (i + count < data.length && data[i + count] === char && count < 255) {
        count++;
      }
      
      if (count >= 4 && char !== '\x00') { // Don't compress null characters
        // Use compression for runs of 4 or more identical characters
        // Use null character as separator to avoid conflicts
        compressed += `\x00${count.toString(16).padStart(2, '0')}${char}`;
      } else {
        // Store as-is for short runs
        compressed += data.substring(i, i + count);
      }
      
      i += count;
    }
    
    // Base64 encode the result for safe storage
    return btoa(compressed);
  }

  /**
   * Perform decompression
   */
  private static performDecompression(compressed: string): string {
    try {
      // Base64 decode first
      const decoded = atob(compressed);
      let decompressed = '';
      let i = 0;
      
      while (i < decoded.length) {
        if (decoded[i] === '\x00' && i + 3 < decoded.length) {
          // Parse run-length encoded sequence
          const countHex = decoded.substring(i + 1, i + 3);
          const count = parseInt(countHex, 16);
          const char = decoded[i + 3];
          
          if (!isNaN(count) && count > 0 && count <= 255) {
            // Repeat character
            decompressed += char.repeat(count);
            i += 4; // Skip null, count (2 chars), and character
          } else {
            // Invalid encoding, treat as literal
            decompressed += decoded[i];
            i++;
          }
        } else {
          decompressed += decoded[i];
          i++;
        }
      }
      
      return decompressed;
    } catch (error) {
      throw new Error(`Decompression failed: ${error}`);
    }
  }
}