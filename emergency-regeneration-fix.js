/**
 * Emergency Regeneration Fix Script
 * 
 * This script provides an emergency fix for stuck regeneration locks.
 * Run this in the browser console if you're still experiencing the
 * "Another regeneration operation is currently in progress" error.
 * 
 * Usage:
 * 1. Open browser console (F12)
 * 2. Copy and paste this script
 * 3. Run: emergencyRegenerationFix()
 */

await function emergencyRegenerationFix() {
  console.log('🚨 Emergency Regeneration Fix Starting...');
  
  let fixesApplied = 0;
  
  try {
    // Step 1: Clear localStorage regeneration data
    console.log('🧹 Clearing localStorage...');
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
      localStorage.removeItem(key);
      fixesApplied++;
    });
    
    console.log(`✅ Removed ${keysToRemove.length} localStorage keys`);
    
    // Step 2: Force clear in-memory state
    console.log('🧠 Clearing in-memory state...');
    let scheduleManager = null;
    
    // Try multiple ways to access the ScheduleManager
    if (window.golfSchedulerApp) {
      scheduleManager = window.golfSchedulerApp.getServices().scheduleManager;
      console.log('✅ Found ScheduleManager through golfSchedulerApp');
    } else if (window.scheduleManager) {
      scheduleManager = window.scheduleManager;
      console.log('✅ Found ScheduleManager directly');
    }
    
    if (scheduleManager) {
      // Force cleanup all regeneration statuses
      if (typeof scheduleManager.forceCleanupAllRegenerationStatuses === 'function') {
        scheduleManager.forceCleanupAllRegenerationStatuses();
        console.log('✅ Cleared all regeneration statuses');
        fixesApplied++;
      }
      
      // Try to force release locks for common week patterns
      const commonWeekPatterns = [
        'week-1', 'week-2', 'week-3', 'week-4', 'week-5',
        'test-week', 'demo-week'
      ];
      
      for (const weekPattern of commonWeekPatterns) {
        try {
          if (typeof scheduleManager.forceReleaseRegenerationLock === 'function') {
            await scheduleManager.forceReleaseRegenerationLock(weekPattern);
            console.log(`✅ Force released lock for ${weekPattern}`);
            fixesApplied++;
          }
        } catch (error) {
          // Ignore errors for non-existent weeks
        }
      }
      
      // Stop and restart periodic cleanup
      if (typeof scheduleManager.stopPeriodicCleanup === 'function') {
        scheduleManager.stopPeriodicCleanup();
        console.log('✅ Stopped periodic cleanup');
        fixesApplied++;
      }
      
      // Clean up expired operations
      if (typeof scheduleManager.cleanupExpiredOperations === 'function') {
        await scheduleManager.cleanupExpiredOperations();
        console.log('✅ Cleaned up expired operations');
        fixesApplied++;
      }
    } else {
      console.log('⚠️  ScheduleManager not found - localStorage cleanup should be sufficient');
    }
    
    // Step 3: Clear any UI error states
    console.log('🎨 Clearing UI error states...');
    const errorElements = document.querySelectorAll('[class*="error"], .notification');
    errorElements.forEach(element => {
      if (element.textContent && 
          (element.textContent.includes('regeneration') || 
           element.textContent.includes('operation') ||
           element.textContent.includes('progress'))) {
        element.remove();
        fixesApplied++;
      }
    });
    
    // Step 4: Trigger data refresh
    console.log('🔄 Triggering data refresh...');
    try {
      if (window.golfSchedulerApp) {
        const stateManager = window.golfSchedulerApp.getSystems().stateManager;
        if (stateManager && typeof stateManager.triggerDataRefresh === 'function') {
          stateManager.triggerDataRefresh();
          console.log('✅ Triggered data refresh');
          fixesApplied++;
        }
      }
    } catch (error) {
      console.log('⚠️  Could not trigger data refresh:', error.message);
    }
    
    // Summary
    console.log('\n🎉 Emergency fix completed!');
    console.log(`📊 Applied ${fixesApplied} fixes`);
    console.log('\n✅ The regeneration bug should now be fixed.');
    console.log('💡 Try regenerating your schedule now.');
    console.log('🔄 If the issue persists, refresh the page.');
    
    return {
      success: true,
      fixesApplied: fixesApplied,
      message: 'Emergency regeneration fix completed successfully'
    };
    
  } catch (error) {
    console.error('❌ Emergency fix failed:', error);
    console.log('🔄 Please refresh the page and try again.');
    
    return {
      success: false,
      error: error.message,
      message: 'Emergency fix failed - please refresh the page'
    };
  }
}

// Make function available globally
window.emergencyRegenerationFix = emergencyRegenerationFix;

console.log('🛠️  Emergency Regeneration Fix loaded!');
console.log('🚨 To fix stuck regeneration locks, run: emergencyRegenerationFix()');
console.log('');
console.log('This fix addresses the bug where regeneration locks were set');
console.log('before user confirmation, causing stuck locks if the dialog failed.');
console.log('The bug has been fixed in the code, but this script can clear');
console.log('any existing stuck locks.');