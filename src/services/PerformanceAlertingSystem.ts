/**
 * Performance Alerting System
 * 
 * Provides alerting and notification capabilities for performance monitoring.
 */

import { PerformanceMetrics, PerformanceThresholds } from './PerformanceMonitor';

export interface AlertRule {
  id: string;
  name: string;
  operationPattern: string; // Regex pattern to match operation names
  condition: AlertCondition;
  severity: AlertSeverity;
  enabled: boolean;
  cooldownMs: number; // Minimum time between alerts for the same rule
}

export interface AlertCondition {
  type: 'threshold' | 'trend' | 'anomaly';
  thresholds?: PerformanceThresholds;
  trendConfig?: TrendConfig;
  anomalyConfig?: AnomalyConfig;
}

export interface TrendConfig {
  windowSize: number; // Number of recent measurements to consider
  degradationThreshold: number; // Percentage increase that triggers alert
  minimumSamples: number; // Minimum samples needed before trend analysis
}

export interface AnomalyConfig {
  baselineWindow: number; // Number of measurements for baseline
  deviationMultiplier: number; // Standard deviations from baseline
  minimumBaseline: number; // Minimum baseline samples needed
}

export enum AlertSeverity {
  INFO = 'info',
  WARNING = 'warning',
  CRITICAL = 'critical'
}

export interface Alert {
  id: string;
  ruleId: string;
  ruleName: string;
  severity: AlertSeverity;
  message: string;
  operationName: string;
  metrics: PerformanceMetrics;
  timestamp: number;
  acknowledged: boolean;
}

export type AlertHandler = (alert: Alert) => void;

/**
 * Performance Alerting System
 * 
 * Monitors performance metrics and generates alerts based on configurable rules.
 */
export class PerformanceAlertingSystem {
  private rules: Map<string, AlertRule> = new Map();
  private alerts: Alert[] = [];
  private alertHandlers: AlertHandler[] = [];
  private lastAlertTimes: Map<string, number> = new Map();
  private metricsHistory: PerformanceMetrics[] = [];
  private maxHistorySize = 1000;

  /**
   * Add an alert rule
   */
  addRule(rule: AlertRule): void {
    this.rules.set(rule.id, rule);
  }

  /**
   * Remove an alert rule
   */
  removeRule(ruleId: string): void {
    this.rules.delete(ruleId);
  }

  /**
   * Update an existing alert rule
   */
  updateRule(rule: AlertRule): void {
    if (this.rules.has(rule.id)) {
      this.rules.set(rule.id, rule);
    }
  }

  /**
   * Get all alert rules
   */
  getRules(): AlertRule[] {
    return Array.from(this.rules.values());
  }

  /**
   * Enable or disable a rule
   */
  setRuleEnabled(ruleId: string, enabled: boolean): void {
    const rule = this.rules.get(ruleId);
    if (rule) {
      rule.enabled = enabled;
    }
  }

  /**
   * Process performance metrics and check for alerts
   */
  processMetrics(metrics: PerformanceMetrics): void {
    // Store metrics for trend analysis
    this.storeMetrics(metrics);

    // Check all enabled rules
    for (const rule of this.rules.values()) {
      if (!rule.enabled) continue;

      if (this.matchesOperationPattern(metrics.operationName, rule.operationPattern)) {
        this.checkRule(rule, metrics);
      }
    }
  }

  /**
   * Register an alert handler
   */
  onAlert(handler: AlertHandler): void {
    this.alertHandlers.push(handler);
  }

  /**
   * Get all alerts
   */
  getAlerts(): Alert[] {
    return [...this.alerts];
  }

  /**
   * Get unacknowledged alerts
   */
  getUnacknowledgedAlerts(): Alert[] {
    return this.alerts.filter(alert => !alert.acknowledged);
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId: string): void {
    const alert = this.alerts.find(a => a.id === alertId);
    if (alert) {
      alert.acknowledged = true;
    }
  }

  /**
   * Clear all alerts
   */
  clearAlerts(): void {
    this.alerts = [];
  }

  /**
   * Create default alert rules for common performance issues
   */
  createDefaultRules(): void {
    // Schedule generation performance rule
    this.addRule({
      id: 'schedule-generation-slow',
      name: 'Schedule Generation Performance',
      operationPattern: 'ScheduleGenerator\\..*',
      condition: {
        type: 'threshold',
        thresholds: {
          warning: 2000,
          critical: 5000,
          timeout: 10000
        }
      },
      severity: AlertSeverity.WARNING,
      enabled: true,
      cooldownMs: 30000 // 30 seconds
    });

    // UI responsiveness rule
    this.addRule({
      id: 'ui-responsiveness',
      name: 'UI Responsiveness',
      operationPattern: '.*UI\\..*',
      condition: {
        type: 'threshold',
        thresholds: {
          warning: 100,
          critical: 500,
          timeout: 1000
        }
      },
      severity: AlertSeverity.WARNING,
      enabled: true,
      cooldownMs: 10000 // 10 seconds
    });

    // Data operation performance rule
    this.addRule({
      id: 'data-operation-slow',
      name: 'Data Operation Performance',
      operationPattern: '.*Repository\\..*',
      condition: {
        type: 'threshold',
        thresholds: {
          warning: 500,
          critical: 2000,
          timeout: 5000
        }
      },
      severity: AlertSeverity.WARNING,
      enabled: true,
      cooldownMs: 15000 // 15 seconds
    });

    // Performance degradation trend rule
    this.addRule({
      id: 'performance-degradation',
      name: 'Performance Degradation Trend',
      operationPattern: '.*',
      condition: {
        type: 'trend',
        trendConfig: {
          windowSize: 10,
          degradationThreshold: 50, // 50% increase
          minimumSamples: 5
        }
      },
      severity: AlertSeverity.INFO,
      enabled: true,
      cooldownMs: 60000 // 1 minute
    });
  }

  private storeMetrics(metrics: PerformanceMetrics): void {
    this.metricsHistory.push(metrics);
    
    // Limit history size
    if (this.metricsHistory.length > this.maxHistorySize) {
      this.metricsHistory = this.metricsHistory.slice(-this.maxHistorySize);
    }
  }

  private matchesOperationPattern(operationName: string, pattern: string): boolean {
    try {
      const regex = new RegExp(pattern);
      return regex.test(operationName);
    } catch (error) {
      console.error(`Invalid regex pattern: ${pattern}`, error);
      return false;
    }
  }

  private checkRule(rule: AlertRule, metrics: PerformanceMetrics): void {
    // Check cooldown
    const lastAlertTime = this.lastAlertTimes.get(rule.id) || 0;
    if (Date.now() - lastAlertTime < rule.cooldownMs) {
      return;
    }

    let shouldAlert = false;
    let alertMessage = '';

    switch (rule.condition.type) {
      case 'threshold':
        const result = this.checkThresholdCondition(rule.condition.thresholds!, metrics);
        shouldAlert = result.shouldAlert;
        alertMessage = result.message;
        break;

      case 'trend':
        const trendResult = this.checkTrendCondition(rule.condition.trendConfig!, metrics);
        shouldAlert = trendResult.shouldAlert;
        alertMessage = trendResult.message;
        break;

      case 'anomaly':
        const anomalyResult = this.checkAnomalyCondition(rule.condition.anomalyConfig!, metrics);
        shouldAlert = anomalyResult.shouldAlert;
        alertMessage = anomalyResult.message;
        break;
    }

    if (shouldAlert) {
      this.createAlert(rule, metrics, alertMessage);
      this.lastAlertTimes.set(rule.id, Date.now());
    }
  }

  private checkThresholdCondition(
    thresholds: PerformanceThresholds, 
    metrics: PerformanceMetrics
  ): { shouldAlert: boolean; message: string } {
    if (metrics.duration >= thresholds.critical) {
      return {
        shouldAlert: true,
        message: `Critical: Operation took ${metrics.duration.toFixed(2)}ms (threshold: ${thresholds.critical}ms)`
      };
    } else if (metrics.duration >= thresholds.warning) {
      return {
        shouldAlert: true,
        message: `Warning: Operation took ${metrics.duration.toFixed(2)}ms (threshold: ${thresholds.warning}ms)`
      };
    }

    return { shouldAlert: false, message: '' };
  }

  private checkTrendCondition(
    config: TrendConfig, 
    metrics: PerformanceMetrics
  ): { shouldAlert: boolean; message: string } {
    const recentMetrics = this.metricsHistory
      .filter(m => m.operationName === metrics.operationName)
      .slice(-config.windowSize);

    if (recentMetrics.length < config.minimumSamples) {
      return { shouldAlert: false, message: '' };
    }

    const oldAverage = recentMetrics.slice(0, Math.floor(recentMetrics.length / 2))
      .reduce((sum, m) => sum + m.duration, 0) / Math.floor(recentMetrics.length / 2);

    const newAverage = recentMetrics.slice(Math.floor(recentMetrics.length / 2))
      .reduce((sum, m) => sum + m.duration, 0) / Math.ceil(recentMetrics.length / 2);

    const degradationPercent = ((newAverage - oldAverage) / oldAverage) * 100;

    if (degradationPercent >= config.degradationThreshold) {
      return {
        shouldAlert: true,
        message: `Performance degradation detected: ${degradationPercent.toFixed(1)}% increase in average duration`
      };
    }

    return { shouldAlert: false, message: '' };
  }

  private checkAnomalyCondition(
    config: AnomalyConfig, 
    metrics: PerformanceMetrics
  ): { shouldAlert: boolean; message: string } {
    const historicalMetrics = this.metricsHistory
      .filter(m => m.operationName === metrics.operationName)
      .slice(-config.baselineWindow);

    if (historicalMetrics.length < config.minimumBaseline) {
      return { shouldAlert: false, message: '' };
    }

    const durations = historicalMetrics.map(m => m.duration);
    const mean = durations.reduce((sum, d) => sum + d, 0) / durations.length;
    const variance = durations.reduce((sum, d) => sum + Math.pow(d - mean, 2), 0) / durations.length;
    const stdDev = Math.sqrt(variance);

    const deviationFromMean = Math.abs(metrics.duration - mean);
    const deviationMultiplier = deviationFromMean / stdDev;

    if (deviationMultiplier >= config.deviationMultiplier) {
      return {
        shouldAlert: true,
        message: `Anomaly detected: Duration ${metrics.duration.toFixed(2)}ms is ${deviationMultiplier.toFixed(1)} standard deviations from baseline`
      };
    }

    return { shouldAlert: false, message: '' };
  }

  private createAlert(rule: AlertRule, metrics: PerformanceMetrics, message: string): void {
    const alert: Alert = {
      id: this.generateAlertId(),
      ruleId: rule.id,
      ruleName: rule.name,
      severity: rule.severity,
      message,
      operationName: metrics.operationName,
      metrics,
      timestamp: Date.now(),
      acknowledged: false
    };

    this.alerts.push(alert);
    this.notifyHandlers(alert);
  }

  private generateAlertId(): string {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private notifyHandlers(alert: Alert): void {
    this.alertHandlers.forEach(handler => {
      try {
        handler(alert);
      } catch (error) {
        console.error('Error in alert handler:', error);
      }
    });
  }
}

// Global alerting system instance
export const performanceAlertingSystem = new PerformanceAlertingSystem();