import { CompressionUtils } from './CompressionUtils';

describe('CompressionUtils', () => {
  describe('Basic compression functionality', () => {
    it('should compress and decompress data correctly', () => {
      const testData = 'This is a test string with some repeated characters: AAAAAAAAAA BBBBBBBBBB CCCCCCCCCC';
      
      const compressed = CompressionUtils.compressData(testData);
      const decompressed = CompressionUtils.decompressData(compressed);
      
      expect(decompressed).toBe(testData);
    });

    it('should not compress small data', () => {
      const smallData = 'small';
      const result = CompressionUtils.compressData(smallData);
      
      expect(result).toBe(smallData);
      expect(CompressionUtils.isCompressed(result)).toBe(false);
    });

    it('should handle JSON data correctly', () => {
      const jsonData = JSON.stringify({
        field1: 'AAAAAAAAAA'.repeat(10),
        field2: 'BBBBBBBBBB'.repeat(10),
        array: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
      });
      
      const compressed = CompressionUtils.compressData(jsonData);
      const decompressed = CompressionUtils.decompressData(compressed);
      
      expect(decompressed).toBe(jsonData);
    });

    it('should handle empty strings', () => {
      const empty = '';
      const result = CompressionUtils.compressData(empty);
      
      expect(result).toBe(empty);
      expect(CompressionUtils.decompressData(result)).toBe(empty);
    });

    it('should handle special characters', () => {
      const specialChars = 'Special chars: !@#$%^&*()_+-=[]{}|;:,.<>?`~"\'\\';
      const repeated = specialChars.repeat(10);
      
      const compressed = CompressionUtils.compressData(repeated);
      const decompressed = CompressionUtils.decompressData(repeated);
      
      expect(decompressed).toBe(repeated);
    });
  });

  describe('Compression detection', () => {
    it('should detect compressed data', () => {
      const data = 'A'.repeat(200);
      const compressed = CompressionUtils.compressData(data);
      
      expect(CompressionUtils.isCompressed(compressed)).toBe(true);
      expect(CompressionUtils.isCompressed(data)).toBe(false);
    });

    it('should determine when to compress', () => {
      expect(CompressionUtils.shouldCompress('small')).toBe(false);
      expect(CompressionUtils.shouldCompress('A'.repeat(200))).toBe(true);
    });
  });
});