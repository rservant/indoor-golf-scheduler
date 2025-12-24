/**
 * Core interfaces for CI storage optimization system
 */

export interface EnvironmentDetector {
  isCIEnvironment(): boolean;
  isGitHubActions(): boolean;
  getEnvironmentType(): 'local' | 'ci' | 'github-actions';
  getCIConfiguration(): CIConfiguration;
}

export interface CIConfiguration {
  maxStorageSize: number;
  compressionEnabled: boolean;
  aggressiveCleanup: boolean;
  reducedIterations: boolean;
  fallbackEnabled: boolean;
}

export interface StorageManager {
  setItem(key: string, value: string, operationType?: string): Promise<void>;
  getItem(key: string): Promise<string | null>;
  removeItem(key: string): Promise<void>;
  clear(): Promise<void>;
  getStorageInfo(): StorageInfo;
  enableOptimization(config: CIConfiguration): void;
}

export interface StorageInfo {
  usedBytes: number;
  availableBytes: number;
  totalBytes: number;
  compressionRatio: number;
  fallbackActive: boolean;
}

export interface TestStorageOptimizer {
  optimizeTestData<T>(data: T): T;
  compressData(data: string): string;
  decompressData(compressed: string): string;
  reduceDataset<T>(dataset: T[], maxSize: number): T[];
  getOptimizedIterationCount(baseCount: number): number;
}

export interface PersistenceFallback {
  activate(reason: FallbackReason): void;
  isActive(): boolean;
  getActiveStorage(): StorageProvider;
  getFallbackChain(): StorageProvider[];
}

export type FallbackReason = 'quota_exceeded' | 'permission_denied' | 'storage_unavailable';

export interface StorageProvider {
  setItem(key: string, value: string): Promise<void>;
  getItem(key: string): Promise<string | null>;
  removeItem(key: string): Promise<void>;
  clear(): Promise<void>;
  getCapacity(): number;
}

export interface StorageQuotaMonitor {
  getCurrentUsage(): Promise<StorageUsage>;
  checkQuotaStatus(): Promise<QuotaStatus>;
  registerCleanupTrigger(threshold: number, callback: () => void): void;
  startMonitoring(interval: number): void;
  stopMonitoring(): void;
}

export interface StorageUsage {
  used: number;
  available: number;
  percentage: number;
}

export interface QuotaStatus {
  withinLimits: boolean;
  nearLimit: boolean;
  exceeded: boolean;
  recommendedAction: 'none' | 'cleanup' | 'fallback';
}

export interface CIConfigurationModel {
  environment: 'local' | 'ci' | 'github-actions';
  storageOptimization: {
    enabled: boolean;
    maxStorageSize: number;
    compressionLevel: number;
    aggressiveCleanup: boolean;
  };
  testOptimization: {
    reducedIterations: boolean;
    maxIterationCount: number;
    minimalDatasets: boolean;
    maxDatasetSize: number;
  };
  fallbackConfiguration: {
    enabled: boolean;
    fallbackChain: StorageType[];
    gracefulDegradation: boolean;
  };
}

export type StorageType = 'localStorage' | 'inMemory' | 'mock';

export interface StorageMetricsModel {
  timestamp: Date;
  environment: string;
  totalUsage: number;
  peakUsage: number;
  compressionSavings: number;
  fallbackActivations: number;
  cleanupOperations: number;
  testExecutionTime: number;
  errorCount: number;
}