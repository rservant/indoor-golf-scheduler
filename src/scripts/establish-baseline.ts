#!/usr/bin/env ts-node

/**
 * Establish Performance Baseline Script
 * 
 * This script runs the complete performance benchmark suite and establishes
 * baseline metrics for regression detection.
 */

import { benchmarkRunner } from '../services/BenchmarkRunner';

async function main() {
  console.log('🎯 Establishing Performance Baseline for Indoor Golf Scheduler');
  console.log('=' .repeat(60));

  try {
    // Get version from package.json or environment
    const version = process.env.npm_package_version || 'development';
    const environment = process.env.NODE_ENV || 'development';

    console.log(`Environment: ${environment}`);
    console.log(`Version: ${version}`);
    console.log('');

    // Run the complete benchmark suite
    const result = await benchmarkRunner.establishBaseline(
      environment,
      version,
      'Initial performance baseline establishment'
    );

    if (result.success) {
      console.log('✅ Performance baseline established successfully!');
      
      if (result.report) {
        console.log('\n📊 Performance Report:');
        console.log(result.report);
      }

      if (result.baselineRecord) {
        console.log(`\n📝 Baseline Record ID: ${result.baselineRecord.id}`);
        console.log(`📅 Timestamp: ${new Date(result.baselineRecord.timestamp).toISOString()}`);
      }

      // Show performance targets status
      const baseline = result.suiteResult.baseline;
      console.log('\n🎯 Performance Targets Status:');
      
      const targets = [
        { name: 'Schedule Generation (50 players)', value: baseline.scheduleGeneration.players50, target: 2000, unit: 'ms' },
        { name: 'Schedule Generation (100 players)', value: baseline.scheduleGeneration.players100, target: 5000, unit: 'ms' },
        { name: 'Schedule Generation (200 players)', value: baseline.scheduleGeneration.players200, target: 10000, unit: 'ms' },
        { name: 'Player Query', value: baseline.dataOperations.playerQuery, target: 100, unit: 'ms' },
        { name: 'Schedule Save', value: baseline.dataOperations.scheduleSave, target: 500, unit: 'ms' },
        { name: 'Week Query', value: baseline.dataOperations.weekQuery, target: 100, unit: 'ms' },
        { name: 'Max Memory Usage', value: baseline.memoryOperations.maxMemoryUsage / 1024 / 1024, target: 200, unit: 'MB' }
      ];

      targets.forEach(target => {
        const status = target.value <= target.target ? '✅' : '❌';
        console.log(`${status} ${target.name}: ${target.value.toFixed(2)}${target.unit} (Target: ≤${target.target}${target.unit})`);
      });

    } else {
      console.error('❌ Failed to establish performance baseline');
      if (result.error) {
        console.error(`Error: ${result.error}`);
      }
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ Unexpected error:', error);
    process.exit(1);
  }
}

// Run the script if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { main as establishBaseline };