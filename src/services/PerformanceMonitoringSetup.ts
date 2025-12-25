/**
 * Performance Monitoring Setup
 * 
 * Configures and initializes the performance monitoring infrastructure
 * with default settings and integrations.
 */

import { performanceMonitor, PerformanceThresholds } from './PerformanceMonitor';
import { performanceAlertingSystem, AlertSeverity } from './PerformanceAlertingSystem';

/**
 * Default performance thresholds for different operation types
 */
export const DEFAULT_THRESHOLDS = {
  // Schedule generation operations
  SCHEDULE_GENERATION: {
    warning: 2000,    // 2 seconds
    critical: 5000,   // 5 seconds
    timeout: 10000    // 10 seconds
  } as PerformanceThresholds,

  // UI operations
  UI_OPERATIONS: {
    warning: 100,     // 100ms
    critical: 500,    // 500ms
    timeout: 1000     // 1 second
  } as PerformanceThresholds,

  // Data operations
  DATA_OPERATIONS: {
    warning: 500,     // 500ms
    critical: 2000,   // 2 seconds
    timeout: 5000     // 5 seconds
  } as PerformanceThresholds,

  // General operations
  GENERAL: {
    warning: 1000,    // 1 second
    critical: 3000,   // 3 seconds
    timeout: 8000     // 8 seconds
  } as PerformanceThresholds
};

/**
 * Initialize performance monitoring with default configuration
 */
export function initializePerformanceMonitoring(): void {
  console.log('Initializing performance monitoring infrastructure...');

  // Set up default thresholds for known operations
  setupDefaultThresholds();

  // Configure alerting system
  setupAlertingSystem();

  // Set up default alert handlers
  setupDefaultAlertHandlers();

  console.log('Performance monitoring infrastructure initialized successfully');
}

/**
 * Set up default performance thresholds for common operations
 */
function setupDefaultThresholds(): void {
  // Schedule generation operations
  performanceMonitor.setThresholds('ScheduleGenerator.generateSchedule', DEFAULT_THRESHOLDS.SCHEDULE_GENERATION);
  performanceMonitor.setThresholds('ScheduleGenerator.generateScheduleWithLogging', DEFAULT_THRESHOLDS.SCHEDULE_GENERATION);
  performanceMonitor.setThresholds('ScheduleGenerator.createFoursomes', DEFAULT_THRESHOLDS.SCHEDULE_GENERATION);

  // Schedule management operations
  performanceMonitor.setThresholds('ScheduleManager.regenerateSchedule', DEFAULT_THRESHOLDS.SCHEDULE_GENERATION);
  performanceMonitor.setThresholds('ScheduleManager.editSchedule', DEFAULT_THRESHOLDS.DATA_OPERATIONS);
  performanceMonitor.setThresholds('ScheduleManager.validateSchedule', DEFAULT_THRESHOLDS.DATA_OPERATIONS);

  // UI operations
  performanceMonitor.setThresholds('ScheduleDisplayUI.displaySchedule', DEFAULT_THRESHOLDS.UI_OPERATIONS);
  performanceMonitor.setThresholds('PlayerManagementUI.updatePlayerList', DEFAULT_THRESHOLDS.UI_OPERATIONS);
  performanceMonitor.setThresholds('SeasonManagementUI.renderSeasonView', DEFAULT_THRESHOLDS.UI_OPERATIONS);

  // Repository operations
  performanceMonitor.setThresholds('PlayerRepository.findBySeasonId', DEFAULT_THRESHOLDS.DATA_OPERATIONS);
  performanceMonitor.setThresholds('ScheduleRepository.save', DEFAULT_THRESHOLDS.DATA_OPERATIONS);
  performanceMonitor.setThresholds('WeekRepository.findBySeasonId', DEFAULT_THRESHOLDS.DATA_OPERATIONS);

  console.log('Default performance thresholds configured');
}

/**
 * Set up the alerting system with default rules
 */
function setupAlertingSystem(): void {
  // Create default alert rules
  performanceAlertingSystem.createDefaultRules();

  // Subscribe to performance metrics
  performanceMonitor.onThresholdExceeded((metrics) => {
    performanceAlertingSystem.processMetrics(metrics);
  });

  console.log('Performance alerting system configured');
}

/**
 * Set up default alert handlers
 */
function setupDefaultAlertHandlers(): void {
  // Console logging handler
  performanceAlertingSystem.onAlert((alert) => {
    const timestamp = new Date(alert.timestamp).toISOString();
    const message = `[${timestamp}] ${alert.severity.toUpperCase()}: ${alert.message}`;
    
    switch (alert.severity) {
      case AlertSeverity.CRITICAL:
        console.error(message);
        break;
      case AlertSeverity.WARNING:
        console.warn(message);
        break;
      case AlertSeverity.INFO:
        console.info(message);
        break;
    }
  });

  // Performance statistics logging (every 5 minutes)
  setInterval(() => {
    const stats = performanceMonitor.getPerformanceStats();
    console.log('Performance Statistics:', {
      totalOperations: stats.totalOperations,
      activeOperations: stats.activeOperations,
      averageOperationTime: Math.round(stats.averageOperationTime * 100) / 100,
      memoryUsage: {
        used: Math.round(stats.memoryUsage.usedJSHeapSize / 1024 / 1024 * 100) / 100,
        total: Math.round(stats.memoryUsage.totalJSHeapSize / 1024 / 1024 * 100) / 100
      }
    });
  }, 5 * 60 * 1000); // 5 minutes

  console.log('Default alert handlers configured');
}

/**
 * Get performance monitoring status
 */
export function getPerformanceMonitoringStatus(): {
  isInitialized: boolean;
  totalMetrics: number;
  activeOperations: number;
  alertRules: number;
  unacknowledgedAlerts: number;
} {
  const stats = performanceMonitor.getPerformanceStats();
  const rules = performanceAlertingSystem.getRules();
  const unacknowledgedAlerts = performanceAlertingSystem.getUnacknowledgedAlerts();

  return {
    isInitialized: true,
    totalMetrics: stats.totalOperations,
    activeOperations: stats.activeOperations,
    alertRules: rules.length,
    unacknowledgedAlerts: unacknowledgedAlerts.length
  };
}

/**
 * Clean up performance monitoring (useful for testing)
 */
export function cleanupPerformanceMonitoring(): void {
  performanceMonitor.clearMetrics();
  performanceAlertingSystem.clearAlerts();
  console.log('Performance monitoring data cleared');
}