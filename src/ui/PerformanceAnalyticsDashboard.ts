/**
 * Performance Analytics Dashboard
 * 
 * Provides real-time performance metrics display, historical trend analysis,
 * and performance optimization recommendations.
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
 */

import { performanceMonitor, PerformanceMetrics, AggregatedMetrics } from '../services/PerformanceMonitor';
import { performanceBenchmark, BenchmarkResult, PerformanceBaseline } from '../services/PerformanceBenchmark';
import { uiPerformanceMonitor, UIPerformanceMetrics } from '../services/UIPerformanceMonitor';

export interface DashboardConfig {
  refreshInterval: number;
  historyRetention: number;
  showRecommendations: boolean;
  enableRealTimeUpdates: boolean;
}

export interface PerformanceTrend {
  operation: string;
  timestamps: number[];
  durations: number[];
  memoryUsage: number[];
  trend: 'improving' | 'degrading' | 'stable';
  changeRate: number; // percentage change per hour
}

export interface OptimizationRecommendation {
  id: string;
  priority: 'high' | 'medium' | 'low';
  category: 'memory' | 'cpu' | 'ui' | 'data';
  title: string;
  description: string;
  impact: string;
  effort: 'low' | 'medium' | 'high';
  actionItems: string[];
}

export interface DashboardData {
  realTimeMetrics: {
    currentOperations: number;
    averageResponseTime: number;
    memoryUsage: number;
    errorRate: number;
    throughput: number;
  };
  trends: PerformanceTrend[];
  recommendations: OptimizationRecommendation[];
  baseline: PerformanceBaseline;
  alerts: {
    critical: number;
    warnings: number;
    recent: Array<{
      timestamp: number;
      severity: 'critical' | 'warning';
      message: string;
      operation: string;
    }>;
  };
}

/**
 * Performance Analytics Dashboard
 * 
 * Displays comprehensive performance analytics with real-time updates,
 * historical trends, and optimization recommendations.
 */
export class PerformanceAnalyticsDashboard {
  private container: HTMLElement;
  private config: DashboardConfig;
  private dashboardElement: HTMLElement | null = null;
  private refreshTimer: number | null = null;
  private isVisible = false;
  private historicalData: Map<string, PerformanceMetrics[]> = new Map();

  constructor(container: HTMLElement, config: Partial<DashboardConfig> = {}) {
    this.container = container;
    this.config = {
      refreshInterval: 5000, // 5 seconds
      historyRetention: 3600000, // 1 hour
      showRecommendations: true,
      enableRealTimeUpdates: true,
      ...config
    };

    this.initializeDashboard();
    this.startDataCollection();
  }

  /**
   * Show the dashboard
   */
  show(): void {
    if (!this.dashboardElement) {
      this.createDashboardElement();
    }

    this.dashboardElement!.style.display = 'block';
    this.isVisible = true;

    if (this.config.enableRealTimeUpdates) {
      this.startRealTimeUpdates();
    }

    this.refreshDashboard();
  }

  /**
   * Hide the dashboard
   */
  hide(): void {
    if (this.dashboardElement) {
      this.dashboardElement.style.display = 'none';
    }
    this.isVisible = false;
    this.stopRealTimeUpdates();
  }

  /**
   * Toggle dashboard visibility
   */
  toggle(): void {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Get current dashboard data
   */
  async getDashboardData(): Promise<DashboardData> {
    const stats = performanceMonitor.getPerformanceStats();
    const uiMetrics = uiPerformanceMonitor.getCurrentMetrics();
    
    // Get recent metrics for trend analysis
    const recentMetrics = performanceMonitor.getMetrics({
      start: Date.now() - this.config.historyRetention,
      end: Date.now()
    });

    // Calculate trends
    const trends = this.calculateTrends(recentMetrics);

    // Generate recommendations
    const recommendations = this.generateRecommendations(recentMetrics, uiMetrics);

    // Get baseline data
    const baseline = await this.getBaselineData();

    return {
      realTimeMetrics: {
        currentOperations: stats.activeOperations,
        averageResponseTime: stats.averageOperationTime,
        memoryUsage: stats.memoryUsage.usedJSHeapSize,
        errorRate: 0, // TODO: Implement error tracking
        throughput: this.calculateThroughput(recentMetrics)
      },
      trends,
      recommendations,
      baseline,
      alerts: {
        critical: 0, // TODO: Implement alert tracking
        warnings: 0,
        recent: []
      }
    };
  }

  /**
   * Refresh dashboard display
   */
  async refreshDashboard(): Promise<void> {
    if (!this.isVisible || !this.dashboardElement) return;

    try {
      const data = await this.getDashboardData();
      this.updateDashboardDisplay(data);
    } catch (error) {
      console.error('Error refreshing dashboard:', error);
    }
  }

  /**
   * Destroy the dashboard
   */
  destroy(): void {
    this.hide();
    this.stopRealTimeUpdates();
    
    if (this.dashboardElement) {
      this.dashboardElement.remove();
      this.dashboardElement = null;
    }

    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  /**
   * Initialize dashboard
   */
  private initializeDashboard(): void {
    // Set up performance monitoring callbacks
    performanceMonitor.onThresholdExceeded((metrics) => {
      this.recordMetrics(metrics);
      if (this.isVisible) {
        this.refreshDashboard();
      }
    });
  }

  /**
   * Start collecting historical data
   */
  private startDataCollection(): void {
    // Collect metrics every minute for historical analysis
    this.refreshTimer = window.setInterval(() => {
      const currentMetrics = performanceMonitor.getMetrics({
        start: Date.now() - 60000, // Last minute
        end: Date.now()
      });

      currentMetrics.forEach(metric => this.recordMetrics(metric));
      this.cleanupOldData();
    }, 60000);
  }

  /**
   * Start real-time updates
   */
  private startRealTimeUpdates(): void {
    if (this.refreshTimer) return;

    this.refreshTimer = window.setInterval(() => {
      this.refreshDashboard();
    }, this.config.refreshInterval);
  }

  /**
   * Stop real-time updates
   */
  private stopRealTimeUpdates(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }

  /**
   * Create dashboard DOM element
   */
  private createDashboardElement(): void {
    this.dashboardElement = document.createElement('div');
    this.dashboardElement.className = 'performance-analytics-dashboard';
    this.dashboardElement.innerHTML = `
      <div class="dashboard-header">
        <h2>Performance Analytics Dashboard</h2>
        <div class="dashboard-controls">
          <button class="refresh-btn" title="Refresh Data">🔄</button>
          <button class="close-btn" title="Close Dashboard">✕</button>
        </div>
      </div>
      
      <div class="dashboard-content">
        <div class="metrics-grid">
          <div class="metric-card real-time-metrics">
            <h3>Real-Time Metrics</h3>
            <div class="metrics-content"></div>
          </div>
          
          <div class="metric-card performance-trends">
            <h3>Performance Trends</h3>
            <div class="trends-content"></div>
          </div>
          
          <div class="metric-card recommendations">
            <h3>Optimization Recommendations</h3>
            <div class="recommendations-content"></div>
          </div>
          
          <div class="metric-card baseline-comparison">
            <h3>Baseline Comparison</h3>
            <div class="baseline-content"></div>
          </div>
        </div>
      </div>
    `;

    // Add event listeners
    const refreshBtn = this.dashboardElement.querySelector('.refresh-btn');
    const closeBtn = this.dashboardElement.querySelector('.close-btn');

    refreshBtn?.addEventListener('click', () => this.refreshDashboard());
    closeBtn?.addEventListener('click', () => this.hide());

    // Add styles
    this.addDashboardStyles();

    this.container.appendChild(this.dashboardElement);
  }

  /**
   * Update dashboard display with new data
   */
  private updateDashboardDisplay(data: DashboardData): void {
    if (!this.dashboardElement) return;

    // Update real-time metrics
    this.updateRealTimeMetrics(data.realTimeMetrics);

    // Update trends
    this.updateTrendsDisplay(data.trends);

    // Update recommendations
    this.updateRecommendationsDisplay(data.recommendations);

    // Update baseline comparison
    this.updateBaselineDisplay(data.baseline);
  }

  /**
   * Update real-time metrics display
   */
  private updateRealTimeMetrics(metrics: DashboardData['realTimeMetrics']): void {
    const container = this.dashboardElement?.querySelector('.real-time-metrics .metrics-content');
    if (!container) return;

    container.innerHTML = `
      <div class="metric-item">
        <span class="metric-label">Active Operations:</span>
        <span class="metric-value">${metrics.currentOperations}</span>
      </div>
      <div class="metric-item">
        <span class="metric-label">Avg Response Time:</span>
        <span class="metric-value">${metrics.averageResponseTime.toFixed(2)}ms</span>
      </div>
      <div class="metric-item">
        <span class="metric-label">Memory Usage:</span>
        <span class="metric-value">${(metrics.memoryUsage / 1024 / 1024).toFixed(2)}MB</span>
      </div>
      <div class="metric-item">
        <span class="metric-label">Throughput:</span>
        <span class="metric-value">${metrics.throughput.toFixed(2)} ops/sec</span>
      </div>
    `;
  }

  /**
   * Update trends display
   */
  private updateTrendsDisplay(trends: PerformanceTrend[]): void {
    const container = this.dashboardElement?.querySelector('.trends-content');
    if (!container) return;

    if (trends.length === 0) {
      container.innerHTML = '<p class="no-data">No trend data available</p>';
      return;
    }

    const trendsHtml = trends.slice(0, 5).map(trend => `
      <div class="trend-item ${trend.trend}">
        <div class="trend-header">
          <span class="trend-operation">${trend.operation}</span>
          <span class="trend-indicator ${trend.trend}">
            ${trend.trend === 'improving' ? '📈' : trend.trend === 'degrading' ? '📉' : '➡️'}
          </span>
        </div>
        <div class="trend-details">
          <span class="trend-change">${trend.changeRate > 0 ? '+' : ''}${trend.changeRate.toFixed(1)}%/hr</span>
        </div>
      </div>
    `).join('');

    container.innerHTML = trendsHtml;
  }

  /**
   * Update recommendations display
   */
  private updateRecommendationsDisplay(recommendations: OptimizationRecommendation[]): void {
    const container = this.dashboardElement?.querySelector('.recommendations-content');
    if (!container) return;

    if (recommendations.length === 0) {
      container.innerHTML = '<p class="no-data">No recommendations available</p>';
      return;
    }

    const recommendationsHtml = recommendations.slice(0, 3).map(rec => `
      <div class="recommendation-item priority-${rec.priority}">
        <div class="recommendation-header">
          <span class="recommendation-title">${rec.title}</span>
          <span class="recommendation-priority ${rec.priority}">${rec.priority.toUpperCase()}</span>
        </div>
        <div class="recommendation-description">${rec.description}</div>
        <div class="recommendation-impact">Impact: ${rec.impact}</div>
      </div>
    `).join('');

    container.innerHTML = recommendationsHtml;
  }

  /**
   * Update baseline comparison display
   */
  private updateBaselineDisplay(baseline: PerformanceBaseline): void {
    const container = this.dashboardElement?.querySelector('.baseline-content');
    if (!container) return;

    container.innerHTML = `
      <div class="baseline-section">
        <h4>Schedule Generation</h4>
        <div class="baseline-metrics">
          <div class="baseline-item">
            <span>50 Players:</span>
            <span class="${baseline.scheduleGeneration.players50 <= 2000 ? 'good' : 'warning'}">${baseline.scheduleGeneration.players50.toFixed(0)}ms</span>
          </div>
          <div class="baseline-item">
            <span>100 Players:</span>
            <span class="${baseline.scheduleGeneration.players100 <= 5000 ? 'good' : 'warning'}">${baseline.scheduleGeneration.players100.toFixed(0)}ms</span>
          </div>
          <div class="baseline-item">
            <span>200 Players:</span>
            <span class="${baseline.scheduleGeneration.players200 <= 10000 ? 'good' : 'warning'}">${baseline.scheduleGeneration.players200.toFixed(0)}ms</span>
          </div>
        </div>
      </div>
      
      <div class="baseline-section">
        <h4>Data Operations</h4>
        <div class="baseline-metrics">
          <div class="baseline-item">
            <span>Player Query:</span>
            <span class="${baseline.dataOperations.playerQuery <= 100 ? 'good' : 'warning'}">${baseline.dataOperations.playerQuery.toFixed(0)}ms</span>
          </div>
          <div class="baseline-item">
            <span>Schedule Save:</span>
            <span class="${baseline.dataOperations.scheduleSave <= 500 ? 'good' : 'warning'}">${baseline.dataOperations.scheduleSave.toFixed(0)}ms</span>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * Calculate performance trends from historical data
   */
  private calculateTrends(metrics: PerformanceMetrics[]): PerformanceTrend[] {
    const operationGroups = new Map<string, PerformanceMetrics[]>();
    
    // Group metrics by operation
    metrics.forEach(metric => {
      const existing = operationGroups.get(metric.operationName) || [];
      existing.push(metric);
      operationGroups.set(metric.operationName, existing);
    });

    const trends: PerformanceTrend[] = [];

    operationGroups.forEach((operationMetrics, operation) => {
      if (operationMetrics.length < 2) return;

      // Sort by timestamp
      operationMetrics.sort((a, b) => a.startTime - b.startTime);

      const timestamps = operationMetrics.map(m => m.startTime);
      const durations = operationMetrics.map(m => m.duration);
      const memoryUsage = operationMetrics.map(m => m.memoryUsage.usedJSHeapSize);

      // Calculate trend
      const changeRate = this.calculateChangeRate(durations, timestamps);
      const trend = changeRate > 5 ? 'degrading' : changeRate < -5 ? 'improving' : 'stable';

      trends.push({
        operation,
        timestamps,
        durations,
        memoryUsage,
        trend,
        changeRate
      });
    });

    return trends.sort((a, b) => Math.abs(b.changeRate) - Math.abs(a.changeRate));
  }

  /**
   * Generate optimization recommendations based on metrics
   */
  private generateRecommendations(metrics: PerformanceMetrics[], uiMetrics: UIPerformanceMetrics): OptimizationRecommendation[] {
    const recommendations: OptimizationRecommendation[] = [];

    // Analyze memory usage patterns
    const memoryUsages = metrics.map(m => m.memoryUsage.usedJSHeapSize);
    const avgMemory = memoryUsages.reduce((sum, mem) => sum + mem, 0) / memoryUsages.length;
    
    if (avgMemory > 100 * 1024 * 1024) { // 100MB
      recommendations.push({
        id: 'high-memory-usage',
        priority: 'high',
        category: 'memory',
        title: 'High Memory Usage Detected',
        description: 'Average memory usage exceeds 100MB. Consider implementing memory optimization strategies.',
        impact: 'Reduced memory usage and improved stability',
        effort: 'medium',
        actionItems: [
          'Implement object pooling for frequently created objects',
          'Add garbage collection hints after large operations',
          'Review data structures for memory efficiency'
        ]
      });
    }

    // Analyze slow operations
    const slowOperations = metrics.filter(m => m.duration > 1000);
    if (slowOperations.length > metrics.length * 0.1) { // More than 10% slow
      recommendations.push({
        id: 'slow-operations',
        priority: 'medium',
        category: 'cpu',
        title: 'Slow Operations Detected',
        description: 'Multiple operations are taking longer than expected. Consider performance optimizations.',
        impact: 'Faster response times and better user experience',
        effort: 'medium',
        actionItems: [
          'Profile slow operations to identify bottlenecks',
          'Implement caching for frequently accessed data',
          'Consider parallel processing for CPU-intensive tasks'
        ]
      });
    }

    // Analyze UI performance
    if (uiMetrics.droppedFrames > 10) {
      recommendations.push({
        id: 'ui-frame-drops',
        priority: 'medium',
        category: 'ui',
        title: 'UI Frame Drops Detected',
        description: 'UI is experiencing frame drops that may affect user experience.',
        impact: 'Smoother animations and better responsiveness',
        effort: 'low',
        actionItems: [
          'Optimize DOM manipulation operations',
          'Implement virtual scrolling for large lists',
          'Use requestAnimationFrame for animations'
        ]
      });
    }

    return recommendations.sort((a, b) => {
      const priorityOrder = { high: 3, medium: 2, low: 1 };
      return priorityOrder[b.priority] - priorityOrder[a.priority];
    });
  }

  /**
   * Get baseline performance data
   */
  private async getBaselineData(): Promise<PerformanceBaseline> {
    // Try to get cached baseline data first
    const cachedBaseline = localStorage.getItem('performance-baseline');
    if (cachedBaseline) {
      try {
        return JSON.parse(cachedBaseline);
      } catch (error) {
        console.warn('Failed to parse cached baseline data:', error);
      }
    }

    // Generate new baseline if not cached
    const benchmarkResult = await performanceBenchmark.runSuite();
    const baseline = benchmarkResult.baseline;

    // Cache the baseline data
    localStorage.setItem('performance-baseline', JSON.stringify(baseline));

    return baseline;
  }

  /**
   * Calculate throughput from recent metrics
   */
  private calculateThroughput(metrics: PerformanceMetrics[]): number {
    if (metrics.length === 0) return 0;

    const timeSpan = Math.max(1000, Date.now() - Math.min(...metrics.map(m => m.startTime)));
    return (metrics.length * 1000) / timeSpan; // operations per second
  }

  /**
   * Calculate change rate for trend analysis
   */
  private calculateChangeRate(values: number[], timestamps: number[]): number {
    if (values.length < 2) return 0;

    const firstValue = values[0];
    const lastValue = values[values.length - 1];
    const timeSpan = timestamps[timestamps.length - 1] - timestamps[0];

    if (timeSpan === 0 || firstValue === 0) return 0;

    const percentageChange = ((lastValue - firstValue) / firstValue) * 100;
    const hoursSpan = timeSpan / (1000 * 60 * 60);

    return hoursSpan > 0 ? percentageChange / hoursSpan : 0;
  }

  /**
   * Record metrics for historical analysis
   */
  private recordMetrics(metrics: PerformanceMetrics): void {
    const existing = this.historicalData.get(metrics.operationName) || [];
    existing.push(metrics);
    
    // Keep only recent data
    const cutoff = Date.now() - this.config.historyRetention;
    const filtered = existing.filter(m => m.startTime >= cutoff);
    
    this.historicalData.set(metrics.operationName, filtered);
  }

  /**
   * Clean up old historical data
   */
  private cleanupOldData(): void {
    const cutoff = Date.now() - this.config.historyRetention;
    
    this.historicalData.forEach((metrics, operation) => {
      const filtered = metrics.filter(m => m.startTime >= cutoff);
      this.historicalData.set(operation, filtered);
    });
  }

  /**
   * Add dashboard styles
   */
  private addDashboardStyles(): void {
    const styleId = 'performance-analytics-dashboard-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .performance-analytics-dashboard {
        position: fixed;
        top: 20px;
        right: 20px;
        width: 800px;
        max-height: 80vh;
        background: white;
        border: 1px solid #ddd;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        z-index: 10000;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        overflow: hidden;
        display: none;
      }

      .dashboard-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px 20px;
        background: #f8f9fa;
        border-bottom: 1px solid #ddd;
      }

      .dashboard-header h2 {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
        color: #333;
      }

      .dashboard-controls {
        display: flex;
        gap: 8px;
      }

      .dashboard-controls button {
        background: none;
        border: 1px solid #ddd;
        border-radius: 4px;
        padding: 6px 8px;
        cursor: pointer;
        font-size: 14px;
      }

      .dashboard-controls button:hover {
        background: #f0f0f0;
      }

      .dashboard-content {
        padding: 20px;
        max-height: calc(80vh - 80px);
        overflow-y: auto;
      }

      .metrics-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 16px;
      }

      .metric-card {
        background: #f8f9fa;
        border: 1px solid #e9ecef;
        border-radius: 6px;
        padding: 16px;
      }

      .metric-card h3 {
        margin: 0 0 12px 0;
        font-size: 16px;
        font-weight: 600;
        color: #495057;
      }

      .metric-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 0;
        border-bottom: 1px solid #e9ecef;
      }

      .metric-item:last-child {
        border-bottom: none;
      }

      .metric-label {
        font-weight: 500;
        color: #6c757d;
      }

      .metric-value {
        font-weight: 600;
        color: #495057;
      }

      .trend-item {
        padding: 8px 0;
        border-bottom: 1px solid #e9ecef;
      }

      .trend-item:last-child {
        border-bottom: none;
      }

      .trend-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 4px;
      }

      .trend-operation {
        font-weight: 500;
        color: #495057;
      }

      .trend-change {
        font-size: 12px;
        color: #6c757d;
      }

      .trend-item.improving .trend-change {
        color: #28a745;
      }

      .trend-item.degrading .trend-change {
        color: #dc3545;
      }

      .recommendation-item {
        padding: 12px 0;
        border-bottom: 1px solid #e9ecef;
      }

      .recommendation-item:last-child {
        border-bottom: none;
      }

      .recommendation-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 6px;
      }

      .recommendation-title {
        font-weight: 600;
        color: #495057;
      }

      .recommendation-priority {
        font-size: 11px;
        padding: 2px 6px;
        border-radius: 3px;
        font-weight: 600;
      }

      .recommendation-priority.high {
        background: #dc3545;
        color: white;
      }

      .recommendation-priority.medium {
        background: #ffc107;
        color: #212529;
      }

      .recommendation-priority.low {
        background: #28a745;
        color: white;
      }

      .recommendation-description {
        font-size: 13px;
        color: #6c757d;
        margin-bottom: 4px;
      }

      .recommendation-impact {
        font-size: 12px;
        color: #28a745;
        font-style: italic;
      }

      .baseline-section {
        margin-bottom: 16px;
      }

      .baseline-section h4 {
        margin: 0 0 8px 0;
        font-size: 14px;
        font-weight: 600;
        color: #495057;
      }

      .baseline-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 4px 0;
        font-size: 13px;
      }

      .baseline-item span:last-child {
        font-weight: 600;
      }

      .baseline-item .good {
        color: #28a745;
      }

      .baseline-item .warning {
        color: #dc3545;
      }

      .no-data {
        text-align: center;
        color: #6c757d;
        font-style: italic;
        margin: 20px 0;
      }
    `;

    document.head.appendChild(style);
  }
}