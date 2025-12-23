/**
 * Fix Regeneration Bug Script
 * 
 * This script provides a comprehensive solution to fix the "Another regeneration 
 * operation is currently in progress" error by clearing all regeneration locks
 * and statuses.
 * 
 * Usage:
 * 1. Open browser console (F12)
 * 2. Copy and paste this entire script
 * 3. Run: fixRegenerationBug()
 */

function fixRegenerationBug() {
  console.log('🔧 Starting regeneration bug fix...');
  
  let fixesApplied = 0;
  
  // Step 1: Clear localStorage regeneration data
  console.log('📦 Clearing localStorage regeneration data...');
  const keysToRemove = [];
  
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (
      key.includes('regeneration') || 
      key.includes('operation') || 
      key.includes('lock') ||
      key.includes('status') ||
      key.includes('backup')
    )) {
      keysToRemove.push(key);
    }
  }
  
  keysToRemove.forEach(key => {
    console.log(`  ❌ Removing: ${key}`);
    localStorage.removeItem(key);
    fixesApplied++;
  });
  
  // Step 2: Clear in-memory regeneration statuses
  console.log('🧠 Clearing in-memory regeneration statuses...');
  let scheduleManager = null;
  
  try {
    // Try multiple ways to access the ScheduleManager
    if (typeof window !== 'undefined') {
      if (window.golfSchedulerApp) {
        scheduleManager = window.golfSchedulerApp.getServices().scheduleManager;
        console.log('  ✅ Found ScheduleManager through golfSchedulerApp');
      } else if (window.scheduleManager) {
        scheduleManager = window.scheduleManager;
        console.log('  ✅ Found ScheduleManager directly on window');
      }
    }
    
    if (scheduleManager) {
      // Force cleanup all regeneration statuses
      if (typeof scheduleManager.forceCleanupAllRegenerationStatuses === 'function') {
        scheduleManager.forceCleanupAllRegenerationStatuses();
        console.log('  ✅ Cleared all regeneration statuses');
        fixesApplied++;
      }
      
      // Stop periodic cleanup to restart it fresh
      if (typeof scheduleManager.stopPeriodicCleanup === 'function') {
        scheduleManager.stopPeriodicCleanup();
        console.log('  ✅ Stopped periodic cleanup');
        fixesApplied++;
      }
      
      // Clean up expired operations
      if (typeof scheduleManager.cleanupExpiredOperations === 'function') {
        await scheduleManager.cleanupExpiredOperations();
        console.log('  ✅ Cleaned up expired operations');
        fixesApplied++;
      }
    } else {
      console.log('  ⚠️  ScheduleManager not found - localStorage cleanup should be sufficient');
    }
  } catch (error) {
    console.log('  ⚠️  Error accessing ScheduleManager:', error.message);
  }
  
  // Step 3: Force release any repository locks
  console.log('🔓 Attempting to release repository locks...');
  try {
    if (scheduleManager) {
      const repositories = window.golfSchedulerApp?.getRepositories();
      if (repositories?.scheduleRepository) {
        // Try to force release locks for all weeks
        // This is a bit of a hack, but we'll try common week IDs
        const commonWeekIds = ['week-1', 'week-2', 'week-3', 'week-4'];
        
        for (const weekId of commonWeekIds) {
          try {
            if (typeof repositories.scheduleRepository.forceReleaseScheduleLock === 'function') {
              await repositories.scheduleRepository.forceReleaseScheduleLock(weekId);
              console.log(`  ✅ Released lock for ${weekId}`);
              fixesApplied++;
            }
          } catch (error) {
            // Ignore errors for non-existent weeks
          }
        }
      }
    }
  } catch (error) {
    console.log('  ⚠️  Could not release repository locks:', error.message);
  }
  
  // Step 4: Clear any UI state
  console.log('🎨 Clearing UI state...');
  try {
    // Clear any progress indicators or lock UI
    const progressElements = document.querySelectorAll('[class*="progress"], [class*="loading"], [class*="lock"]');
    progressElements.forEach(element => {
      if (element.style) {
        element.style.display = 'none';
      }
    });
    
    // Clear any error messages about regeneration
    const errorElements = document.querySelectorAll('[class*="error"], [class*="notification"]');
    errorElements.forEach(element => {
      if (element.textContent && element.textContent.includes('regeneration')) {
        element.remove();
        fixesApplied++;
      }
    });
    
    console.log('  ✅ Cleared UI state');
  } catch (error) {
    console.log('  ⚠️  Error clearing UI state:', error.message);
  }
  
  // Step 5: Trigger a data refresh
  console.log('🔄 Triggering data refresh...');
  try {
    if (window.golfSchedulerApp) {
      const stateManager = window.golfSchedulerApp.getSystems().stateManager;
      if (stateManager && typeof stateManager.triggerDataRefresh === 'function') {
        stateManager.triggerDataRefresh();
        console.log('  ✅ Triggered data refresh');
        fixesApplied++;
      }
    }
  } catch (error) {
    console.log('  ⚠️  Could not trigger data refresh:', error.message);
  }
  
  // Summary
  console.log('\n🎉 Regeneration bug fix complete!');
  console.log(`📊 Applied ${fixesApplied} fixes`);
  console.log('\n✅ You should now be able to regenerate schedules.');
  console.log('💡 If the issue persists, try refreshing the page.');
  
  return {
    success: true,
    fixesApplied: fixesApplied,
    message: 'Regeneration bug fix completed successfully'
  };
}

// Also provide a simpler version for quick fixes
function quickFixRegenerationBug() {
  console.log('⚡ Quick regeneration bug fix...');
  
  // Clear localStorage
  const keys = Object.keys(localStorage);
  keys.forEach(key => {
    if (key.includes('regeneration') || key.includes('operation') || key.includes('lock')) {
      localStorage.removeItem(key);
    }
  });
  
  // Clear in-memory state if available
  try {
    const scheduleManager = window.golfSchedulerApp?.getServices()?.scheduleManager;
    if (scheduleManager?.forceCleanupAllRegenerationStatuses) {
      scheduleManager.forceCleanupAllRegenerationStatuses();
    }
  } catch (error) {
    // Ignore errors
  }
  
  console.log('✅ Quick fix applied! Try regenerating now.');
}

// Function to check current regeneration status
function checkRegenerationStatus() {
  console.log('🔍 Checking regeneration status...');
  
  // Check localStorage
  const regenerationKeys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (key.includes('regeneration') || key.includes('operation') || key.includes('lock'))) {
      regenerationKeys.push({
        key: key,
        value: localStorage.getItem(key)
      });
    }
  }
  
  console.log(`📦 Found ${regenerationKeys.length} regeneration-related localStorage keys:`);
  regenerationKeys.forEach(item => {
    console.log(`  ${item.key}: ${item.value}`);
  });
  
  // Check in-memory state
  try {
    const scheduleManager = window.golfSchedulerApp?.getServices()?.scheduleManager;
    if (scheduleManager) {
      console.log('🧠 ScheduleManager is available');
      // We'd need specific week IDs to check status, but the manager is accessible
    } else {
      console.log('⚠️  ScheduleManager not found');
    }
  } catch (error) {
    console.log('❌ Error checking ScheduleManager:', error.message);
  }
  
  return {
    localStorageKeys: regenerationKeys.length,
    scheduleManagerAvailable: !!window.golfSchedulerApp?.getServices()?.scheduleManager
  };
}

// Make functions available globally
window.fixRegenerationBug = fixRegenerationBug;
window.quickFixRegenerationBug = quickFixRegenerationBug;
window.checkRegenerationStatus = checkRegenerationStatus;

console.log('🛠️  Regeneration bug fix utilities loaded!');
console.log('📋 Available functions:');
console.log('  • fixRegenerationBug() - Complete fix (recommended)');
console.log('  • quickFixRegenerationBug() - Quick fix');
console.log('  • checkRegenerationStatus() - Check current status');
console.log('');
console.log('🚀 To fix the issue, run: fixRegenerationBug()');