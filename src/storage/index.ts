// Storage optimization components for CI environments
export * from './interfaces';
export { EnvironmentDetector } from './EnvironmentDetector';
export { StorageManager } from './StorageManager';
export { PersistenceFallback } from './PersistenceFallback';
export { InMemoryStorageProvider } from './InMemoryStorageProvider';
export { MockStorageProvider } from './MockStorageProvider';
export { TestStorageOptimizer } from './TestStorageOptimizer';
export { CompressionUtils } from './CompressionUtils';
export { StorageQuotaMonitor } from './StorageQuotaMonitor';
export { CleanupUtilities } from './CleanupUtilities';
export { LoggingManager, LogLevel, StorageOperation } from './LoggingManager';
export { CIConfigurationManager } from './CIConfigurationManager';
export { LightweightTestFixtures } from './LightweightTestFixtures';
export { OptimizedTestSetup, setupOptimizedTest, cleanupOptimizedTest } from './OptimizedTestSetup';
export { StorageIsolationManager, IsolatedLocalStorage } from './StorageIsolationManager';