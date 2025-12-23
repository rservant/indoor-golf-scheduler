import { test, expect } from '@playwright/test';

test.describe('Navigation Bug Fix Test', () => {
  test('should reproduce and verify the navigation bug fix', async ({ page }) => {
    // Capture console logs
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log(`BROWSER ERROR: ${msg.text()}`);
      }
    });

    console.log('=== NAVIGATION BUG FIX TEST ===');
    
    // Step 1: Load the application
    console.log('Step 1: Loading application...');
    await page.goto('http://localhost:3000');
    await page.waitForLoadState('networkidle');
    
    // Wait for the app to load
    await page.waitForSelector('.app-loaded', { timeout: 5000 });
    console.log('Application loaded successfully');
    
    // Step 2: Create test seasons (since there are none initially)
    console.log('Step 2: Creating test seasons...');
    
    // Ensure the create form is visible
    const createButton = page.locator('button:has-text("Create New Season")');
    const createButtonCount = await createButton.count();
    if (createButtonCount > 0) {
      await createButton.click();
      await page.waitForTimeout(300);
    }
    
    // Create first season
    await page.waitForSelector('#season-name', { timeout: 5000 });
    await page.fill('#season-name', 'Test Season 1');
    await page.fill('#start-date', '2025-01-01');
    await page.fill('#end-date', '2025-06-30');
    await page.click('#add-season');
    await page.waitForTimeout(500);
    
    // Show form again for second season
    const createButtonAgain = page.locator('button:has-text("Create New Season")');
    const createButtonAgainCount = await createButtonAgain.count();
    if (createButtonAgainCount > 0) {
      await createButtonAgain.click();
      await page.waitForTimeout(300);
    }
    
    // Create second season  
    await page.waitForSelector('#season-name', { timeout: 5000 });
    await page.fill('#season-name', 'Test Season 2');
    await page.fill('#start-date', '2025-07-01');
    await page.fill('#end-date', '2025-12-31');
    await page.click('#add-season');
    await page.waitForTimeout(500);
    
    // Verify seasons were created
    const seasonItems = page.locator('.seasons-list .season-card');
    const seasonCount = await seasonItems.count();
    console.log(`Created ${seasonCount} seasons`);
    expect(seasonCount).toBeGreaterThanOrEqual(2);
    
    // Step 3: Check if there's already an active season, if not activate the first one
    console.log('Step 3: Checking for active season...');
    
    const activeSeasonInfo = page.locator('.active-season .season-info');
    let activeSeasonText = await activeSeasonInfo.textContent();
    console.log(`Current active season: ${activeSeasonText}`);
    
    if (activeSeasonText?.includes('No season selected')) {
      console.log('No active season, activating first season...');
      const firstActivateButton = seasonItems.first().locator('button:has-text("Activate")');
      await firstActivateButton.click();
      await page.waitForTimeout(500);
      
      activeSeasonText = await activeSeasonInfo.textContent();
      console.log(`Activated season: ${activeSeasonText}`);
    } else {
      console.log('Active season already exists');
    }
    
    // Step 4: Test initial navigation (should work)
    console.log('Step 4: Testing initial navigation...');
    
    const playersTab = page.locator('[data-tab="players"]');
    const scheduleTab = page.locator('[data-tab="schedule"]');
    
    // Click players tab
    await playersTab.click();
    await page.waitForTimeout(200);
    
    // Verify players tab is active
    await expect(playersTab).toHaveClass(/active/);
    await expect(page.locator('[data-tab-content="players"]')).toHaveClass(/active/);
    console.log('Initial players tab click worked!');
    
    // Click schedule tab
    await scheduleTab.click();
    await page.waitForTimeout(200);
    
    // Verify schedule tab is active
    await expect(scheduleTab).toHaveClass(/active/);
    await expect(page.locator('[data-tab-content="schedule"]')).toHaveClass(/active/);
    console.log('Initial schedule tab click worked!');
    
    // Go back to seasons tab
    const seasonsTab = page.locator('[data-tab="seasons"]');
    await seasonsTab.click();
    await page.waitForTimeout(200);
    await expect(seasonsTab).toHaveClass(/active/);
    
    // Step 5: Switch to different season (this is where the bug would occur)
    console.log('Step 5: Switching to different season...');
    
    // Find an inactive season to activate
    const inactiveSeasons = page.locator('.seasons-list .season-card:not(.active)');
    const inactiveCount = await inactiveSeasons.count();
    console.log(`Found ${inactiveCount} inactive seasons`);
    
    if (inactiveCount > 0) {
      // Activate the first inactive season
      const inactiveActivateButton = inactiveSeasons.first().locator('button:has-text("Activate")');
      await inactiveActivateButton.click();
      await page.waitForTimeout(500);
      
      // Verify a different season is now active
      const newActiveSeasonText = await activeSeasonInfo.textContent();
      console.log(`New active season: ${newActiveSeasonText}`);
      expect(newActiveSeasonText).not.toBe(activeSeasonText);
    } else {
      console.log('No inactive seasons found, skipping season switch test');
      return;
    }
    
    // Step 6: Test navigation after season switch (this would fail before the fix)
    console.log('Step 6: Testing navigation after season switch...');
    
    // Try clicking players tab after season switch
    console.log('Clicking players tab after season switch...');
    await playersTab.click();
    await page.waitForTimeout(200);
    
    // This should work with the fix
    await expect(playersTab).toHaveClass(/active/);
    await expect(page.locator('[data-tab-content="players"]')).toHaveClass(/active/);
    console.log('SUCCESS: Players tab click worked after season switch!');
    
    // Try clicking schedule tab after season switch
    console.log('Clicking schedule tab after season switch...');
    await scheduleTab.click();
    await page.waitForTimeout(200);
    
    // This should also work with the fix
    await expect(scheduleTab).toHaveClass(/active/);
    await expect(page.locator('[data-tab-content="schedule"]')).toHaveClass(/active/);
    console.log('SUCCESS: Schedule tab click worked after season switch!');
    
    // Step 7: Test multiple season switches
    console.log('Step 7: Testing multiple season switches...');
    
    // Go back to seasons tab
    await seasonsTab.click();
    await page.waitForTimeout(200);
    
    // Find another inactive season if available
    const inactiveSeasonsAgain = page.locator('.seasons-list .season-card:not(.active)');
    const inactiveCountAgain = await inactiveSeasonsAgain.count();
    
    if (inactiveCountAgain > 0) {
      // Switch to another season
      const anotherActivateButton = inactiveSeasonsAgain.first().locator('button:has-text("Activate")');
      await anotherActivateButton.click();
      await page.waitForTimeout(500);
      
      // Test navigation still works
      await playersTab.click();
      await page.waitForTimeout(200);
      await expect(playersTab).toHaveClass(/active/);
      console.log('SUCCESS: Navigation still works after multiple season switches!');
    } else {
      console.log('No more inactive seasons for multiple switch test');
    }
    
    console.log('=== ALL TESTS PASSED: Navigation bug is fixed! ===');
  });

  test('should verify event listeners persist through DOM changes', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.waitForSelector('.app-loaded', { timeout: 5000 });
    
    // Create a season to trigger DOM changes
    await page.fill('#season-name', 'Event Test Season');
    await page.fill('#start-date', '2025-01-01');
    await page.fill('#end-date', '2025-12-31');
    await page.click('#add-season');
    await page.waitForTimeout(500);
    
    // Find an inactive season to activate (this triggers a DOM re-render)
    const inactiveSeasons = page.locator('.seasons-list .season-card:not(.active)');
    const inactiveCount = await inactiveSeasons.count();
    
    if (inactiveCount > 0) {
      const activateButton = inactiveSeasons.first().locator('button:has-text("Activate")');
      await activateButton.click();
      await page.waitForTimeout(500);
      
      // Test that tab navigation still works after DOM re-render
      const playersTab = page.locator('[data-tab="players"]');
      await playersTab.click();
      await page.waitForTimeout(200);
      
      await expect(playersTab).toHaveClass(/active/);
      console.log('Event listeners persisted through DOM changes!');
    } else {
      console.log('No inactive seasons to test with');
    }
  });
});