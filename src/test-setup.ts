// Test setup and configuration for Jest
// This file is run before each test file

import { StorageManager } from './storage/StorageManager';
import { initializeCIMetricsReporting, reportFinalCIMetrics } from './storage/CIMetricsReporter';

// Initialize CI metrics reporting if in CI environment
const ciMetricsReporter = initializeCIMetricsReporting();

// Initialize optimized storage manager for tests
const storageManager = StorageManager.getInstance();

// Mock localStorage if not available, but integrate with storage manager
if (typeof localStorage === 'undefined') {
  const localStorageMock = {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn(),
    length: 0,
    key: jest.fn()
  };
  
  Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
    writable: true
  });
  
  // Also define it globally for Node.js environment
  (global as any).localStorage = localStorageMock;
}

// Create optimized localStorage wrapper that uses storage manager
const optimizedLocalStorage = {
  async setItem(key: string, value: string): Promise<void> {
    return storageManager.setItem(key, value);
  },
  
  async getItem(key: string): Promise<string | null> {
    return storageManager.getItem(key);
  },
  
  async removeItem(key: string): Promise<void> {
    return storageManager.removeItem(key);
  },
  
  async clear(): Promise<void> {
    return storageManager.clear();
  },
  
  // Synchronous methods for backward compatibility
  setItemSync(key: string, value: string): void {
    // For synchronous calls, we'll use the underlying localStorage directly
    // This maintains compatibility with existing test patterns
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(key, value);
    }
  },
  
  getItemSync(key: string): string | null {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem(key);
    }
    return null;
  },
  
  removeItemSync(key: string): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(key);
    }
  },
  
  clearSync(): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.clear();
    }
  },
  
  get length(): number {
    return typeof localStorage !== 'undefined' ? localStorage.length : 0;
  },
  
  key(index: number): string | null {
    return typeof localStorage !== 'undefined' ? localStorage.key(index) : null;
  }
};

// Make optimized storage available globally for tests
(global as any).optimizedLocalStorage = optimizedLocalStorage;
(global as any).storageManager = storageManager;

// Setup cleanup after each test
afterEach(async () => {
  // Clean up storage after each test to prevent interference
  await storageManager.clear();
  
  // Also cleanup isolation if enabled
  await storageManager.cleanupIsolation();
});

// Report final metrics when all tests complete (in CI environment)
if (typeof process !== 'undefined' && process.env.CI_STORAGE_METRICS_REPORTING === 'true') {
  // Use process exit handler to ensure metrics are reported
  process.on('exit', () => {
    reportFinalCIMetrics();
  });
  
  // Also handle unexpected exits
  process.on('SIGINT', () => {
    reportFinalCIMetrics();
    process.exit(0);
  });
  
  process.on('SIGTERM', () => {
    reportFinalCIMetrics();
    process.exit(0);
  });
}