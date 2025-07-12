import { EventEmitter } from 'events';
import {
  PerformanceMetrics,
  HealthStatus,
  ComponentHealth,
  Agent,
  SwarmException
} from '../types';
import { Logger } from '../utils/Logger';

/**
 * PerformanceMonitor - Monitors swarm performance and health
 */
export class PerformanceMonitor extends EventEmitter {
  private monitoringIntervals: Map<string, NodeJS.Timeout> = new Map();
  private metrics: Map<string, PerformanceMetrics> = new Map();
  private healthStatus: Map<string, HealthStatus> = new Map();
  private logger: Logger;

  constructor() {
    super();
    this.logger = new Logger('PerformanceMonitor');
  }

  /**
   * Start monitoring a swarm session
   */
  public async startMonitoring(sessionId: string): Promise<void> {
    this.logger.info('Starting performance monitoring', { sessionId });

    // Initialize metrics
    const initialMetrics: PerformanceMetrics = {
      swarmId: sessionId,
      timestamp: new Date(),
      overallEfficiency: 100,
      taskThroughput: 0,
      resourceUtilization: 0,
      communicationLatency: 0,
      errorRate: 0,
      scalabilityIndex: 100
    };

    this.metrics.set(sessionId, initialMetrics);

    // Start monitoring interval
    const interval = setInterval(() => {
      this.collectMetrics(sessionId);
    }, 30000); // Collect metrics every 30 seconds

    this.monitoringIntervals.set(sessionId, interval);

    // Initialize health status
    await this.updateHealthStatus(sessionId);

    this.logger.info('Performance monitoring started', { sessionId });
  }

  /**
   * Stop monitoring a swarm session
   */
  public async stopMonitoring(sessionId: string): Promise<void> {
    this.logger.info('Stopping performance monitoring', { sessionId });

    const interval = this.monitoringIntervals.get(sessionId);
    if (interval) {
      clearInterval(interval);
      this.monitoringIntervals.delete(sessionId);
    }

    // Keep final metrics for a while before cleanup
    setTimeout(() => {
      this.metrics.delete(sessionId);
      this.healthStatus.delete(sessionId);
    }, 300000); // Keep for 5 minutes

    this.logger.info('Performance monitoring stopped', { sessionId });
  }

  /**
   * Get current performance metrics
   */
  public async getMetrics(sessionId: string): Promise<PerformanceMetrics> {
    const metrics = this.metrics.get(sessionId);
    if (!metrics) {
      throw new SwarmException('METRICS_NOT_FOUND', `Metrics for session ${sessionId} not found`);
    }

    return { ...metrics };
  }

  /**
   * Get health status
   */
  public async getHealthStatus(sessionId: string): Promise<HealthStatus> {
    const health = this.healthStatus.get(sessionId);
    if (!health) {
      throw new SwarmException('HEALTH_STATUS_NOT_FOUND', `Health status for session ${sessionId} not found`);
    }

    return { ...health };
  }

  /**
   * Record task completion metrics
   */
  public async recordTaskCompletion(
    sessionId: string,
    executionTime: number,
    success: boolean,
    resourceUsage: any
  ): Promise<void> {
    const metrics = this.metrics.get(sessionId);
    if (!metrics) return;

    // Update throughput (tasks per minute)
    const now = new Date();
    const timeDiff = (now.getTime() - metrics.timestamp.getTime()) / 60000; // minutes
    if (timeDiff > 0) {
      metrics.taskThroughput = (metrics.taskThroughput + (1 / timeDiff)) / 2;
    }

    // Update error rate
    if (!success) {
      metrics.errorRate = Math.min(100, metrics.errorRate + 5);
    } else {
      metrics.errorRate = Math.max(0, metrics.errorRate - 1);
    }

    // Update efficiency based on execution time vs expected time
    const expectedTime = 120; // 2 minutes baseline
    const efficiency = Math.max(0, Math.min(100, (expectedTime / executionTime) * 100));
    metrics.overallEfficiency = (metrics.overallEfficiency + efficiency) / 2;

    // Update resource utilization
    if (resourceUsage) {
      const avgUtilization = (
        resourceUsage.cpuUsage + 
        resourceUsage.memoryUsage + 
        resourceUsage.networkUsage
      ) / 3;
      metrics.resourceUtilization = (metrics.resourceUtilization + avgUtilization) / 2;
    }

    metrics.timestamp = now;

    this.logger.debug('Task completion metrics recorded', {
      sessionId,
      executionTime,
      success,
      efficiency,
      throughput: metrics.taskThroughput
    });
  }

  /**
   * Record communication latency
   */
  public async recordCommunicationLatency(sessionId: string, latency: number): Promise<void> {
    const metrics = this.metrics.get(sessionId);
    if (!metrics) return;

    // Update communication latency (rolling average)
    metrics.communicationLatency = (metrics.communicationLatency + latency) / 2;

    // Check for performance alerts
    if (latency > 1000) { // Alert if latency > 1 second
      this.emit('performanceAlert', {
        sessionId,
        type: 'high_latency',
        value: latency,
        threshold: 1000,
        message: 'Communication latency is above threshold'
      });
    }
  }

  /**
   * Record agent performance
   */
  public async recordAgentPerformance(
    sessionId: string,
    agent: Agent,
    performanceData: any
  ): Promise<void> {
    const metrics = this.metrics.get(sessionId);
    if (!metrics) return;

    // Update scalability index based on agent performance
    const agentEfficiency = (
      performanceData.successRate + 
      performanceData.qualityScore
    ) / 2;

    metrics.scalabilityIndex = (metrics.scalabilityIndex + agentEfficiency) / 2;

    // Check for agent performance issues
    if (agentEfficiency < 50) {
      this.emit('performanceAlert', {
        sessionId,
        type: 'low_agent_performance',
        agentId: agent.id,
        value: agentEfficiency,
        threshold: 50,
        message: `Agent ${agent.name} performance is below threshold`
      });
    }
  }

  /**
   * Generate performance report
   */
  public async generateReport(sessionId: string): Promise<any> {
    const metrics = this.getMetrics(sessionId);
    const health = this.getHealthStatus(sessionId);

    return {
      sessionId,
      generatedAt: new Date(),
      metrics: await metrics,
      health: await health,
      summary: {
        overall: await this.calculateOverallScore(sessionId),
        recommendations: await this.generateRecommendations(sessionId)
      }
    };
  }

  // Private methods

  private async collectMetrics(sessionId: string): Promise<void> {
    try {
      const metrics = this.metrics.get(sessionId);
      if (!metrics) return;

      // Simulate metric collection
      // In a real implementation, this would collect from various sources

      // Update timestamp
      metrics.timestamp = new Date();

      // Check for alerts
      await this.checkPerformanceAlerts(sessionId, metrics);

      // Update health status
      await this.updateHealthStatus(sessionId);

      this.logger.debug('Metrics collected', { sessionId, metrics });
    } catch (error) {
      this.logger.error('Error collecting metrics', error);
    }
  }

  private async checkPerformanceAlerts(
    sessionId: string, 
    metrics: PerformanceMetrics
  ): Promise<void> {
    const alerts = [];

    // Check efficiency threshold
    if (metrics.overallEfficiency < 60) {
      alerts.push({
        type: 'low_efficiency',
        value: metrics.overallEfficiency,
        threshold: 60,
        message: 'Overall efficiency is below acceptable threshold'
      });
    }

    // Check error rate threshold
    if (metrics.errorRate > 20) {
      alerts.push({
        type: 'high_error_rate',
        value: metrics.errorRate,
        threshold: 20,
        message: 'Error rate is above acceptable threshold'
      });
    }

    // Check resource utilization
    if (metrics.resourceUtilization > 90) {
      alerts.push({
        type: 'high_resource_usage',
        value: metrics.resourceUtilization,
        threshold: 90,
        message: 'Resource utilization is critically high'
      });
    }

    // Emit alerts
    alerts.forEach(alert => {
      this.emit('performanceAlert', { sessionId, ...alert });
    });
  }

  private async updateHealthStatus(sessionId: string): Promise<void> {
    const metrics = this.metrics.get(sessionId);
    if (!metrics) return;

    const componentHealth: ComponentHealth[] = [
      {
        component: 'coordinator',
        status: this.determineComponentHealth(metrics.overallEfficiency),
        metrics: { efficiency: metrics.overallEfficiency },
        issues: metrics.overallEfficiency < 60 ? ['Low efficiency detected'] : []
      },
      {
        component: 'communication',
        status: this.determineComponentHealth(100 - (metrics.communicationLatency / 10)),
        metrics: { latency: metrics.communicationLatency },
        issues: metrics.communicationLatency > 1000 ? ['High latency detected'] : []
      },
      {
        component: 'resources',
        status: this.determineComponentHealth(100 - metrics.resourceUtilization),
        metrics: { utilization: metrics.resourceUtilization },
        issues: metrics.resourceUtilization > 90 ? ['High resource usage'] : []
      },
      {
        component: 'tasks',
        status: this.determineComponentHealth(100 - metrics.errorRate),
        metrics: { 
          throughput: metrics.taskThroughput,
          errorRate: metrics.errorRate 
        },
        issues: metrics.errorRate > 20 ? ['High error rate'] : []
      }
    ];

    const overallHealth = this.calculateOverallHealth(componentHealth);
    const recommendations = this.generateHealthRecommendations(componentHealth);

    const healthStatus: HealthStatus = {
      swarmId: sessionId,
      overall: overallHealth,
      components: componentHealth,
      lastCheck: new Date(),
      recommendations
    };

    this.healthStatus.set(sessionId, healthStatus);
  }

  private determineComponentHealth(score: number): ComponentHealth['status'] {
    if (score >= 80) return 'healthy';
    if (score >= 60) return 'warning';
    return 'critical';
  }

  private calculateOverallHealth(components: ComponentHealth[]): HealthStatus['overall'] {
    const criticalCount = components.filter(c => c.status === 'critical').length;
    const warningCount = components.filter(c => c.status === 'warning').length;

    if (criticalCount > 0) return 'critical';
    if (warningCount > 1) return 'degraded';
    return 'healthy';
  }

  private generateHealthRecommendations(components: ComponentHealth[]): string[] {
    const recommendations: string[] = [];

    components.forEach(component => {
      if (component.status === 'critical') {
        switch (component.component) {
          case 'coordinator':
            recommendations.push('Consider restarting coordinator or scaling resources');
            break;
          case 'communication':
            recommendations.push('Check network connectivity and reduce communication overhead');
            break;
          case 'resources':
            recommendations.push('Scale up resources or optimize resource usage');
            break;
          case 'tasks':
            recommendations.push('Review task distribution and error handling');
            break;
        }
      }
    });

    return recommendations;
  }

  private async calculateOverallScore(sessionId: string): Promise<number> {
    const metrics = await this.getMetrics(sessionId);
    
    // Weighted average of key metrics
    const weights = {
      efficiency: 0.3,
      throughput: 0.2,
      errorRate: 0.2,
      resourceUtilization: 0.15,
      scalabilityIndex: 0.15
    };

    const score = (
      metrics.overallEfficiency * weights.efficiency +
      Math.min(100, metrics.taskThroughput * 10) * weights.throughput +
      (100 - metrics.errorRate) * weights.errorRate +
      (100 - metrics.resourceUtilization) * weights.resourceUtilization +
      metrics.scalabilityIndex * weights.scalabilityIndex
    );

    return Math.round(score);
  }

  private async generateRecommendations(sessionId: string): Promise<string[]> {
    const metrics = await this.getMetrics(sessionId);
    const recommendations: string[] = [];

    if (metrics.overallEfficiency < 70) {
      recommendations.push('Optimize task distribution algorithm');
    }

    if (metrics.taskThroughput < 0.5) {
      recommendations.push('Consider scaling up the number of agents');
    }

    if (metrics.errorRate > 15) {
      recommendations.push('Improve error handling and retry mechanisms');
    }

    if (metrics.resourceUtilization > 85) {
      recommendations.push('Scale infrastructure or optimize resource usage');
    }

    if (metrics.communicationLatency > 500) {
      recommendations.push('Optimize inter-agent communication protocols');
    }

    return recommendations;
  }
}