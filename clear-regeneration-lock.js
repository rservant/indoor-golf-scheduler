/**
 * Clear Regeneration Lock Script
 * 
 * This script helps clear stuck regeneration operations that are preventing
 * new regeneration attempts from proceeding.
 */

// Function to clear regeneration locks from localStorage
function clearRegenerationLocks() {
  console.log('Clearing regeneration locks...');
  
  // Clear any regeneration status data that might be stored
  const keysToRemove = [];
  
  // Check all localStorage keys for regeneration-related data
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (
      key.includes('regeneration') || 
      key.includes('operation') || 
      key.includes('lock') ||
      key.includes('status')
    )) {
      keysToRemove.push(key);
    }
  }
  
  // Remove regeneration-related keys
  keysToRemove.forEach(key => {
    console.log(`Removing key: ${key}`);
    localStorage.removeItem(key);
  });
  
  console.log(`Cleared ${keysToRemove.length} regeneration-related keys`);
  
  // Also clear any in-memory state if the application is loaded
  if (typeof window !== 'undefined') {
    try {
      // Try to access the scheduleManager through the main app instance
      let scheduleManager = null;
      
      if (window.golfSchedulerApp) {
        scheduleManager = window.golfSchedulerApp.getServices().scheduleManager;
      } else if (window.scheduleManager) {
        scheduleManager = window.scheduleManager;
      }
      
      if (scheduleManager && typeof scheduleManager.forceCleanupAllRegenerationStatuses === 'function') {
        scheduleManager.forceCleanupAllRegenerationStatuses();
        console.log('Cleared in-memory regeneration statuses');
      } else {
        console.log('ScheduleManager not found or method not available');
      }
    } catch (error) {
      console.log('Could not clear in-memory state:', error.message);
    }
  }
  
  console.log('Regeneration lock clearing complete!');
  console.log('You should now be able to regenerate schedules.');
}

// Function to check current regeneration status
function checkRegenerationStatus() {
  console.log('Checking regeneration status...');
  
  // Look for regeneration-related data in localStorage
  const regenerationKeys = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && (
      key.includes('regeneration') || 
      key.includes('operation') || 
      key.includes('lock') ||
      key.includes('status')
    )) {
      regenerationKeys.push({
        key: key,
        value: localStorage.getItem(key)
      });
    }
  }
  
  if (regenerationKeys.length === 0) {
    console.log('No regeneration locks found in localStorage');
  } else {
    console.log('Found regeneration-related data:');
    regenerationKeys.forEach(item => {
      console.log(`  ${item.key}: ${item.value}`);
    });
  }
  
  // Check in-memory state if available
  if (typeof window !== 'undefined') {
    try {
      let scheduleManager = null;
      
      if (window.golfSchedulerApp) {
        scheduleManager = window.golfSchedulerApp.getServices().scheduleManager;
        console.log('ScheduleManager is available through golfSchedulerApp');
      } else if (window.scheduleManager) {
        scheduleManager = window.scheduleManager;
        console.log('ScheduleManager is available directly on window');
      } else {
        console.log('ScheduleManager not found on window object');
      }
      
      // Try to get regeneration status for debugging
      if (scheduleManager && typeof scheduleManager.getRegenerationStatus === 'function') {
        // We'd need a week ID to check specific status
        console.log('ScheduleManager regeneration methods are available');
      }
    } catch (error) {
      console.log('Could not check in-memory state:', error.message);
    }
  }
}

// Export functions for use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    clearRegenerationLocks,
    checkRegenerationStatus
  };
}

// If running in browser, make functions available globally
if (typeof window !== 'undefined') {
  window.clearRegenerationLocks = clearRegenerationLocks;
  window.checkRegenerationStatus = checkRegenerationStatus;
  
  console.log('Regeneration lock utilities loaded!');
  console.log('Available functions:');
  console.log('  - clearRegenerationLocks(): Clear all regeneration locks');
  console.log('  - checkRegenerationStatus(): Check current regeneration status');
  console.log('');
  console.log('To fix the regeneration issue, run: clearRegenerationLocks()');
}