// Debug script to test actual availability persistence
// This will help us understand what's really happening

// Import the actual components
import { LocalSeasonRepository } from './src/repositories/SeasonRepository.js';
import { LocalPlayerRepository } from './src/repositories/PlayerRepository.js';
import { LocalWeekRepository } from './src/repositories/WeekRepository.js';
import { PlayerManagerService } from './src/services/PlayerManager.js';
import { AvailabilityManagementUI } from './src/ui/AvailabilityManagementUI.js';

async function debugAvailabilityIssue() {
  console.log('=== DEBUGGING AVAILABILITY PERSISTENCE ISSUE ===');
  
  // Clear localStorage to start fresh
  localStorage.clear();
  console.log('1. Cleared localStorage');
  
  // Create repositories
  const seasonRepo = new LocalSeasonRepository();
  const playerRepo = new LocalPlayerRepository();
  const weekRepo = new LocalWeekRepository();
  const playerManager = new PlayerManagerService(playerRepo, seasonRepo, weekRepo);
  
  console.log('2. Created repositories and services');
  
  // Create a test season
  const season = await seasonRepo.create({
    name: 'Debug Test Season',
    startDate: new Date('2025-01-01'),
    endDate: new Date('2025-12-31'),
    playerIds: []
  });
  console.log('3. Created season:', season.name);
  
  // Create test players
  const player1 = await playerManager.addPlayer({
    firstName: 'Test',
    lastName: 'Player1',
    handedness: 'right',
    timePreference: 'AM'
  }, season.id);
  
  const player2 = await playerManager.addPlayer({
    firstName: 'Test',
    lastName: 'Player2', 
    handedness: 'left',
    timePreference: 'PM'
  }, season.id);
  
  console.log('4. Created players:', player1.firstName, player2.firstName);
  
  // Create a test week
  const week = await weekRepo.create({
    seasonId: season.id,
    weekNumber: 1,
    date: new Date('2025-01-07')
  });
  console.log('5. Created week:', week.weekNumber);
  
  // Create UI container
  const container = document.createElement('div');
  document.body.appendChild(container);
  
  // Create AvailabilityManagementUI
  const availabilityUI = new AvailabilityManagementUI(playerManager, weekRepo, container);
  await availabilityUI.initialize(season);
  console.log('6. Initialized AvailabilityManagementUI');
  
  // Check initial availability
  const initialP1 = await playerManager.getPlayerAvailability(player1.id, week.id);
  const initialP2 = await playerManager.getPlayerAvailability(player2.id, week.id);
  console.log('7. Initial availability - Player1:', initialP1, 'Player2:', initialP2);
  
  // Simulate clicking "Mark All Available"
  console.log('8. Simulating "Mark All Available" click...');
  
  // Find the button and click it
  const markAllAvailableBtn = container.querySelector('[data-action="mark-all-available"]');
  if (markAllAvailableBtn) {
    markAllAvailableBtn.click();
    console.log('   Clicked Mark All Available button');
    
    // Wait a bit for async operations
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Check availability after click
    const afterClickP1 = await playerManager.getPlayerAvailability(player1.id, week.id);
    const afterClickP2 = await playerManager.getPlayerAvailability(player2.id, week.id);
    console.log('9. After click availability - Player1:', afterClickP1, 'Player2:', afterClickP2);
    
    // Check localStorage directly
    const weekData = localStorage.getItem(`week_${week.id}`);
    console.log('10. Raw localStorage data:', weekData);
    
    if (weekData) {
      const parsedWeek = JSON.parse(weekData);
      console.log('11. Parsed week availability:', parsedWeek.playerAvailability);
    }
    
    // Simulate navigation away and back
    console.log('12. Simulating navigation away and back...');
    
    // Create new UI instance (simulates navigation)
    const newContainer = document.createElement('div');
    document.body.appendChild(newContainer);
    const newAvailabilityUI = new AvailabilityManagementUI(playerManager, weekRepo, newContainer);
    await newAvailabilityUI.initialize(season);
    
    // Check if data persisted after "navigation"
    const afterNavP1 = await playerManager.getPlayerAvailability(player1.id, week.id);
    const afterNavP2 = await playerManager.getPlayerAvailability(player2.id, week.id);
    console.log('13. After navigation availability - Player1:', afterNavP1, 'Player2:', afterNavP2);
    
    // Check if UI shows correct state
    const player1Checkbox = newContainer.querySelector(`[data-player-id="${player1.id}"]`);
    const player2Checkbox = newContainer.querySelector(`[data-player-id="${player2.id}"]`);
    
    if (player1Checkbox && player2Checkbox) {
      console.log('14. UI checkbox states - Player1:', player1Checkbox.checked, 'Player2:', player2Checkbox.checked);
    } else {
      console.log('14. Could not find player checkboxes in UI');
    }
    
  } else {
    console.log('   ERROR: Could not find Mark All Available button');
    console.log('   Available buttons:', Array.from(container.querySelectorAll('button')).map(b => b.textContent));
  }
  
  console.log('=== DEBUG COMPLETE ===');
}

// Run the debug when page loads
if (typeof window !== 'undefined') {
  window.addEventListener('load', debugAvailabilityIssue);
} else {
  debugAvailabilityIssue();
}