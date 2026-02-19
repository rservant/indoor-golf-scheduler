/**
 * Performance Analytics Service
 * 
 * Provides data processing and analysis for the Performance Analytics Dashboard.
 * Handles historical data aggregation, trend analysis, and recommendation generation.
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
 */

import { performanceMonitor, PerformanceMetrics, AggregatedMetrics } from './PerformanceMonitor';
import { performanceBenchmark, BenchmarkResult, PerformanceBaseline } from './PerformanceBenchmark';
import { uiPerformanceMonitor, UIPerformanceMetrics } from './UIPerformanceMonitor';

export interface AnalyticsConfig {
  dataRetentionPeriod: number; // milliseconds
  trendAnalysisWindow: number; // milliseconds
  recommendationThresholds: RecommendationThresholds;
}

export interface RecommendationThresholds {
  memoryWarning: number; // bytes
  memoryCritical: number; // bytes
  responseTimeWarning: number; // milliseconds
  responseTimeCritical: number; // milliseconds
  frameDropWarning: number; // count
  frameDropCritical: number; // count
}

export interface PerformanceInsight {
  id: string;
  type: 'trend' | 'anomaly' | 'threshold' | 'pattern';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  data: any;
  timestamp: number;
  affectedOperations: string[];
}

export interface AnalyticsReport {
  generatedAt: number;
  timeRange: { start: number; end: number };
  summary: {
    totalOperations: number;
    averageResponseTime: number;
    memoryEfficiency: number;
    performanceScore: number;
  };
  insights: PerformanceInsight[];
  recommendations: Array<{
    id: string;
    priority: 'high' | 'medium' | 'low';
    category: string;
    title: string;
    description: string;
    expectedImpact: string;
    implementationEffort: 'low' | 'medium' | 'high';
  }>;
  trends: Array<{
    operation: string;
    direction: 'improving' | 'degrading' | 'stable';
    confidence: number;
    changeRate: number;
  }>;
}

/**
 * Performance Analytics Service
 * 
 * Processes performance data to generate insights, trends, and recommendations
 * for the Performance Analytics Dashboard.
 */
export class PerformanceAnalyticsService {
  private config: AnalyticsConfig;
  private historicalData: Map<string, PerformanceMetrics[]> = new Map();
  private insights: PerformanceInsight[] = [];
  private lastAnalysisTime = 0;

  constructor(config: Partial<AnalyticsConfig> = {}, initializeDataCollection = true) {
    this.config = {
      dataRetentionPeriod: 24 * 60 * 60 * 1000, // 24 hours
      trendAnalysisWindow: 60 * 60 * 1000, // 1 hour
      recommendationThresholds: {
        memoryWarning: 100 * 1024 * 1024, // 100MB
        memoryCritical: 200 * 1024 * 1024, // 200MB
        responseTimeWarning: 1000, // 1 second
        responseTimeCritical: 5000, // 5 seconds
        frameDropWarning: 10,
        frameDropCritical: 50
      },
      ...config
    };

    if (initializeDataCollection) {
      this.initializeDataCollection();
    }
  }

  /**
   * Generate comprehensive analytics report
   */
  async generateReport(timeRange?: { start: number; end: number }): Promise<AnalyticsReport> {
    const range = timeRange || {
      start: Date.now() - this.config.trendAnalysisWindow,
      end: Date.now()
    };

    const metrics = this.getMetricsInRange(range);
    const uiMetrics = uiPerformanceMonitor.getCurrentMetrics();

    // Perform analysis
    const insights = await this.analyzeMetrics(metrics, uiMetrics);
    const recommendations = this.generateRecommendations(metrics, uiMetrics, insights);
    const trends = this.analyzeTrends(metrics);
    const summary = this.generateSummary(metrics, uiMetrics);

    return {
      generatedAt: Date.now(),
      timeRange: range,
      summary,
      insights,
      recommendations,
      trends
    };
  }

  /**
   * Get real-time performance insights
   */
  getRealTimeInsights(): PerformanceInsight[] {
    const recentInsights = this.insights.filter(
      insight => Date.now() - insight.timestamp < 5 * 60 * 1000 // Last 5 minutes
    );

    return recentInsights.sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * Analyze performance anomalies
   */
  detectAnomalies(operation: string, timeWindow: number = 60000): PerformanceInsight[] {
    const operationMetrics = this.historicalData.get(operation) || [];
    const recentMetrics = operationMetrics.filter(
      m => Date.now() - m.startTime <= timeWindow
    );

    if (recentMetrics.length < 10) return []; // Need sufficient data

    const anomalies: PerformanceInsight[] = [];
    const durations = recentMetrics.map(m => m.duration);
    const mean = durations.reduce((sum, d) => sum + d, 0) / durations.length;
    const stdDev = Math.sqrt(
      durations.reduce((sum, d) => sum + Math.pow(d - mean, 2), 0) / durations.length
    );

    // Detect outliers (values beyond 2 standard deviations)
    recentMetrics.forEach(metric => {
      if (Math.abs(metric.duration - mean) > 2 * stdDev) {
        anomalies.push({
          id: `anomaly-${metric.operationName}-${metric.startTime}`,
          type: 'anomaly',
          severity: metric.duration > mean + 2 * stdDev ? 'warning' : 'info',
          title: `Performance Anomaly Detected`,
          description: `Operation ${operation} took ${metric.duration.toFixed(2)}ms, which is ${((metric.duration - mean) / mean * 100).toFixed(1)}% ${metric.duration > mean ? 'slower' : 'faster'} than average`,
          data: { metric, mean, stdDev },
          timestamp: metric.startTime,
          affectedOperations: [operation]
        });
      }
    });

    return anomalies;
  }

  /**
   * Calculate performance score (0-100)
   */
  calculatePerformanceScore(metrics: PerformanceMetrics[], uiMetrics: UIPerformanceMetrics): number {
    let score = 100;

    // Response time score (40% weight)
    const avgResponseTime = metrics.reduce((sum, m) => sum + m.duration, 0) / metrics.length || 0;
    const responseTimeScore = Math.max(0, 100 - (avgResponseTime / 50)); // Penalty for each 50ms
    score -= (100 - responseTimeScore) * 0.4;

    // Memory efficiency score (30% weight)
    const avgMemory = metrics.reduce((sum, m) => sum + m.memoryUsage.usedJSHeapSize, 0) / metrics.length || 0;
    const memoryScore = Math.max(0, 100 - (avgMemory / (1024 * 1024))); // Penalty for each MB
    score -= (100 - memoryScore) * 0.3;

    // UI performance score (20% weight)
    const frameDropScore = Math.max(0, 100 - (uiMetrics.droppedFrames * 2)); // Penalty for frame drops
    score -= (100 - frameDropScore) * 0.2;

    // Error rate score (10% weight)
    // TODO: Implement error tracking
    const errorScore = 100; // Placeholder
    score -= (100 - errorScore) * 0.1;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Get performance trends for specific operations
   */
  getOperationTrends(operations: string[], timeWindow: number = 3600000): Map<string, any> {
    const trends = new Map();

    operations.forEach(operation => {
      const metrics = this.historicalData.get(operation) || [];
      const recentMetrics = metrics.filter(
        m => Date.now() - m.startTime <= timeWindow
      );

      if (recentMetrics.length < 2) {
        trends.set(operation, { trend: 'insufficient-data', confidence: 0 });
        return;
      }

      // Sort by time
      recentMetrics.sort((a, b) => a.startTime - b.startTime);

      // Calculate trend using linear regression
      const n = recentMetrics.length;
      const sumX = recentMetrics.reduce((sum, _, i) => sum + i, 0);
      const sumY = recentMetrics.reduce((sum, m) => sum + m.duration, 0);
      const sumXY = recentMetrics.reduce((sum, m, i) => sum + i * m.duration, 0);
      const sumXX = recentMetrics.reduce((sum, _, i) => sum + i * i, 0);

      const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
      const intercept = (sumY - slope * sumX) / n;

      // Calculate correlation coefficient for confidence
      const meanX = sumX / n;
      const meanY = sumY / n;
      const numerator = recentMetrics.reduce((sum, m, i) => sum + (i - meanX) * (m.duration - meanY), 0);
      const denomX = Math.sqrt(recentMetrics.reduce((sum, _, i) => sum + Math.pow(i - meanX, 2), 0));
      const denomY = Math.sqrt(recentMetrics.reduce((sum, m) => sum + Math.pow(m.duration - meanY, 2), 0));
      const correlation = denomX * denomY > 0 ? numerator / (denomX * denomY) : 0;

      trends.set(operation, {
        slope,
        intercept,
        correlation,
        confidence: Math.abs(correlation),
        trend: slope > 0.1 ? 'degrading' : slope < -0.1 ? 'improving' : 'stable',
        changeRate: (slope / meanY) * 100 // percentage change per time unit
      });
    });

    return trends;
  }

  /**
   * Clear old data to manage memory usage
   */
  cleanup(): void {
    const cutoff = Date.now() - this.config.dataRetentionPeriod;

    // Clean historical data
    this.historicalData.forEach((metrics, operation) => {
      const filtered = metrics.filter(m => m.startTime >= cutoff);
      this.historicalData.set(operation, filtered);
    });

    // Clean insights
    this.insights = this.insights.filter(insight => insight.timestamp >= cutoff);
  }

  /**
   * Clear all data (for testing purposes)
   */
  clearAllData(): void {
    this.historicalData.clear();
    this.insights = [];
  }

  /**
   * Initialize data collection
   */
  private initializeDataCollection(): void {
    // Subscribe to performance metrics
    performanceMonitor.onThresholdExceeded((metrics) => {
      this.recordMetrics(metrics);
      this.analyzeRealTime(metrics);
    });

    // Periodic cleanup
    setInterval(() => {
      this.cleanup();
    }, 60 * 60 * 1000); // Every hour
  }

  /**
   * Record metrics for historical analysis
   */
  private recordMetrics(metrics: PerformanceMetrics): void {
    const existing = this.historicalData.get(metrics.operationName) || [];
    existing.push(metrics);
    this.historicalData.set(metrics.operationName, existing);
  }

  /**
   * Analyze metrics in real-time
   */
  private analyzeRealTime(metrics: PerformanceMetrics): void {
    // Check for immediate issues
    if (metrics.duration > this.config.recommendationThresholds.responseTimeCritical) {
      this.insights.push({
        id: `critical-response-time-${Date.now()}`,
        type: 'threshold',
        severity: 'critical',
        title: 'Critical Response Time',
        description: `Operation ${metrics.operationName} took ${metrics.duration.toFixed(2)}ms, exceeding critical threshold`,
        data: metrics,
        timestamp: Date.now(),
        affectedOperations: [metrics.operationName]
      });
    }

    if (metrics.memoryUsage.usedJSHeapSize > this.config.recommendationThresholds.memoryCritical) {
      this.insights.push({
        id: `critical-memory-usage-${Date.now()}`,
        type: 'threshold',
        severity: 'critical',
        title: 'Critical Memory Usage',
        description: `Memory usage reached ${(metrics.memoryUsage.usedJSHeapSize / 1024 / 1024).toFixed(2)}MB during ${metrics.operationName}`,
        data: metrics,
        timestamp: Date.now(),
        affectedOperations: [metrics.operationName]
      });
    }
  }

  /**
   * Get metrics within time range
   */
  private getMetricsInRange(range: { start: number; end: number }): PerformanceMetrics[] {
    const allMetrics: PerformanceMetrics[] = [];
    
    this.historicalData.forEach(metrics => {
      const filtered = metrics.filter(
        m => m.startTime >= range.start && m.startTime <= range.end
      );
      allMetrics.push(...filtered);
    });

    return allMetrics.sort((a, b) => a.startTime - b.startTime);
  }

  /**
   * Analyze metrics to generate insights
   */
  private async analyzeMetrics(metrics: PerformanceMetrics[], uiMetrics: UIPerformanceMetrics): Promise<PerformanceInsight[]> {
    const insights: PerformanceInsight[] = [];

    // Analyze response time patterns
    const responseTimeInsights = this.analyzeResponseTimePatterns(metrics);
    insights.push(...responseTimeInsights);

    // Analyze memory usage patterns
    const memoryInsights = this.analyzeMemoryPatterns(metrics);
    insights.push(...memoryInsights);

    // Analyze UI performance
    const uiInsights = this.analyzeUIPerformance(uiMetrics);
    insights.push(...uiInsights);

    return insights;
  }

  /**
   * Analyze response time patterns
   */
  private analyzeResponseTimePatterns(metrics: PerformanceMetrics[]): PerformanceInsight[] {
    const insights: PerformanceInsight[] = [];

    if (metrics.length === 0) return insights;

    const durations = metrics.map(m => m.duration);
    const avgDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length;
    const maxDuration = Math.max(...durations);

    // Check for consistently slow operations
    if (avgDuration > this.config.recommendationThresholds.responseTimeWarning) {
      insights.push({
        id: `slow-average-response-${Date.now()}`,
        type: 'pattern',
        severity: avgDuration > this.config.recommendationThresholds.responseTimeCritical ? 'critical' : 'warning',
        title: 'Slow Average Response Time',
        description: `Average response time is ${avgDuration.toFixed(2)}ms, which may impact user experience`,
        data: { avgDuration, maxDuration, sampleSize: metrics.length },
        timestamp: Date.now(),
        affectedOperations: Array.from(new Set(metrics.map(m => m.operationName)))
      });
    }

    return insights;
  }

  /**
   * Analyze memory usage patterns
   */
  private analyzeMemoryPatterns(metrics: PerformanceMetrics[]): PerformanceInsight[] {
    const insights: PerformanceInsight[] = [];

    if (metrics.length === 0) return insights;

    const memoryUsages = metrics.map(m => m.memoryUsage.usedJSHeapSize);
    const avgMemory = memoryUsages.reduce((sum, m) => sum + m, 0) / memoryUsages.length;
    const maxMemory = Math.max(...memoryUsages);

    // Check for memory growth trend
    if (memoryUsages.length > 10) {
      const firstHalf = memoryUsages.slice(0, Math.floor(memoryUsages.length / 2));
      const secondHalf = memoryUsages.slice(Math.floor(memoryUsages.length / 2));
      
      const firstAvg = firstHalf.reduce((sum, m) => sum + m, 0) / firstHalf.length;
      const secondAvg = secondHalf.reduce((sum, m) => sum + m, 0) / secondHalf.length;
      
      const growthRate = ((secondAvg - firstAvg) / firstAvg) * 100;

      if (growthRate > 20) { // 20% growth
        insights.push({
          id: `memory-growth-trend-${Date.now()}`,
          type: 'trend',
          severity: growthRate > 50 ? 'critical' : 'warning',
          title: 'Memory Usage Growth Detected',
          description: `Memory usage increased by ${growthRate.toFixed(1)}% during the analysis period`,
          data: { growthRate, firstAvg, secondAvg, maxMemory },
          timestamp: Date.now(),
          affectedOperations: Array.from(new Set(metrics.map(m => m.operationName)))
        });
      }
    }

    return insights;
  }

  /**
   * Analyze UI performance
   */
  private analyzeUIPerformance(uiMetrics: UIPerformanceMetrics): PerformanceInsight[] {
    const insights: PerformanceInsight[] = [];

    if (uiMetrics.droppedFrames > this.config.recommendationThresholds.frameDropWarning) {
      insights.push({
        id: `ui-frame-drops-${Date.now()}`,
        type: 'threshold',
        severity: uiMetrics.droppedFrames > this.config.recommendationThresholds.frameDropCritical ? 'critical' : 'warning',
        title: 'UI Frame Drops Detected',
        description: `${uiMetrics.droppedFrames} frame drops detected, which may cause stuttering animations`,
        data: uiMetrics,
        timestamp: Date.now(),
        affectedOperations: ['UI rendering']
      });
    }

    if (uiMetrics.averageFrameTime > 16.67) { // 60fps threshold
      insights.push({
        id: `ui-slow-frames-${Date.now()}`,
        type: 'threshold',
        severity: uiMetrics.averageFrameTime > 33.33 ? 'critical' : 'warning', // 30fps threshold
        title: 'Slow UI Frame Rate',
        description: `Average frame time is ${uiMetrics.averageFrameTime.toFixed(2)}ms, below 60fps target`,
        data: uiMetrics,
        timestamp: Date.now(),
        affectedOperations: ['UI rendering']
      });
    }

    return insights;
  }

  /**
   * Generate recommendations based on analysis
   */
  private generateRecommendations(
    metrics: PerformanceMetrics[], 
    uiMetrics: UIPerformanceMetrics, 
    insights: PerformanceInsight[]
  ): AnalyticsReport['recommendations'] {
    const recommendations: AnalyticsReport['recommendations'] = [];

    // Memory-based recommendations
    const memoryInsights = insights.filter(i => i.title.toLowerCase().includes('memory'));
    if (memoryInsights.length > 0) {
      recommendations.push({
        id: 'optimize-memory-usage',
        priority: 'high',
        category: 'memory',
        title: 'Optimize Memory Usage',
        description: 'High memory usage detected. Implement memory optimization strategies.',
        expectedImpact: 'Reduced memory footprint and improved stability',
        implementationEffort: 'medium'
      });
    }

    // Performance-based recommendations
    const performanceInsights = insights.filter(i => i.title.toLowerCase().includes('response'));
    if (performanceInsights.length > 0) {
      recommendations.push({
        id: 'optimize-response-times',
        priority: 'medium',
        category: 'performance',
        title: 'Optimize Response Times',
        description: 'Slow response times detected. Consider caching and algorithm optimizations.',
        expectedImpact: 'Faster user interactions and better experience',
        implementationEffort: 'medium'
      });
    }

    // UI-based recommendations
    const uiInsights = insights.filter(i => i.title.toLowerCase().includes('ui') || i.title.toLowerCase().includes('frame'));
    if (uiInsights.length > 0) {
      recommendations.push({
        id: 'optimize-ui-performance',
        priority: 'medium',
        category: 'ui',
        title: 'Optimize UI Performance',
        description: 'UI performance issues detected. Implement virtual scrolling and optimize rendering.',
        expectedImpact: 'Smoother animations and better responsiveness',
        implementationEffort: 'low'
      });
    }

    return recommendations.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  /**
   * Analyze trends from metrics
   */
  private analyzeTrends(metrics: PerformanceMetrics[]): AnalyticsReport['trends'] {
    const operationGroups = new Map<string, PerformanceMetrics[]>();
    
    // Group by operation
    metrics.forEach(metric => {
      const existing = operationGroups.get(metric.operationName) || [];
      existing.push(metric);
      operationGroups.set(metric.operationName, existing);
    });

    const trends: AnalyticsReport['trends'] = [];

    operationGroups.forEach((operationMetrics, operation) => {
      if (operationMetrics.length < 3) return; // Need sufficient data

      operationMetrics.sort((a, b) => a.startTime - b.startTime);
      
      const durations = operationMetrics.map(m => m.duration);
      const firstThird = durations.slice(0, Math.floor(durations.length / 3));
      const lastThird = durations.slice(-Math.floor(durations.length / 3));

      const firstAvg = firstThird.reduce((sum, d) => sum + d, 0) / firstThird.length;
      const lastAvg = lastThird.reduce((sum, d) => sum + d, 0) / lastThird.length;

      const changeRate = ((lastAvg - firstAvg) / firstAvg) * 100;
      const direction = changeRate > 5 ? 'degrading' : changeRate < -5 ? 'improving' : 'stable';
      
      // Calculate confidence based on consistency
      const variance = durations.reduce((sum, d) => sum + Math.pow(d - (durations.reduce((s, x) => s + x, 0) / durations.length), 2), 0) / durations.length;
      const confidence = Math.max(0, Math.min(1, 1 - (variance / (firstAvg * firstAvg))));

      trends.push({
        operation,
        direction,
        confidence,
        changeRate
      });
    });

    return trends.sort((a, b) => Math.abs(b.changeRate) - Math.abs(a.changeRate));
  }

  /**
   * Generate performance summary
   */
  private generateSummary(metrics: PerformanceMetrics[], uiMetrics: UIPerformanceMetrics): AnalyticsReport['summary'] {
    const totalOperations = metrics.length;
    const averageResponseTime = metrics.length > 0 
      ? metrics.reduce((sum, m) => sum + m.duration, 0) / metrics.length 
      : 0;

    const memoryUsages = metrics.map(m => m.memoryUsage.usedJSHeapSize);
    const avgMemory = memoryUsages.length > 0 
      ? memoryUsages.reduce((sum, m) => sum + m, 0) / memoryUsages.length 
      : 0;
    
    const memoryEfficiency = Math.max(0, 100 - (avgMemory / (200 * 1024 * 1024)) * 100); // Based on 200MB target
    const performanceScore = this.calculatePerformanceScore(metrics, uiMetrics);

    return {
      totalOperations,
      averageResponseTime,
      memoryEfficiency,
      performanceScore
    };
  }
}

// Global analytics service instance
export const performanceAnalyticsService = new PerformanceAnalyticsService();