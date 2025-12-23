import { test, expect } from '@playwright/test';

test.describe('Navigation Bug Reproduction', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Wait for the application to load
    await page.waitForSelector('.main-application', { timeout: 10000 });
  });

  test('should reproduce the navigation bug when switching seasons', async ({ page }) => {
    console.log('=== PLAYWRIGHT TEST: Navigation Bug Reproduction ===');
    
    // Step 1: Wait for initial load and verify navigation works
    console.log('Step 1: Verifying initial state...');
    
    // Check if there are any seasons available
    const seasonsTab = page.locator('[data-tab="seasons"]');
    await expect(seasonsTab).toBeVisible();
    
    // Click on seasons tab to make sure we're on the right tab
    await seasonsTab.click();
    
    // Look for season cards or create a season if none exist
    const seasonCards = page.locator('.season-card');
    const seasonCount = await seasonCards.count();
    
    console.log(`Found ${seasonCount} existing seasons`);
    
    if (seasonCount === 0) {
      console.log('No seasons found, creating test seasons...');
      
      // Create first season
      await page.click('button:has-text("Create New Season")');
      await page.fill('[name="name"]', 'Test Season 1');
      await page.fill('[name="startDate"]', '2024-01-01');
      await page.fill('[name="endDate"]', '2024-03-31');
      await page.click('button[type="submit"]');
      
      // Wait for season to be created and activated
      await page.waitForSelector('.season-card.active', { timeout: 5000 });
      
      // Create second season
      await page.click('button:has-text("Create New Season")');
      await page.fill('[name="name"]', 'Test Season 2');
      await page.fill('[name="startDate"]', '2024-04-01');
      await page.fill('[name="endDate"]', '2024-06-30');
      await page.click('button[type="submit"]');
      
      // Wait for second season to be created
      await page.waitForSelector('.season-card:nth-child(2)', { timeout: 5000 });
    }
    
    // Step 2: Verify initial navigation works
    console.log('Step 2: Testing initial navigation...');
    
    const playersTab = page.locator('[data-tab="players"]');
    const scheduleTab = page.locator('[data-tab="schedule"]');
    
    // Check if buttons are enabled (should be if there's an active season)
    const playersDisabled = await playersTab.getAttribute('disabled');
    const scheduleDisabled = await scheduleTab.getAttribute('disabled');
    
    console.log(`Players button disabled: ${playersDisabled !== null}`);
    console.log(`Schedule button disabled: ${scheduleDisabled !== null}`);
    
    if (playersDisabled === null) {
      // Test clicking players button
      console.log('Clicking players button initially...');
      await playersTab.click();
      
      // Verify we switched to players tab
      await expect(playersTab).toHaveClass(/active/);
      console.log('Initial players click worked!');
      
      // Switch back to seasons
      await seasonsTab.click();
      await expect(seasonsTab).toHaveClass(/active/);
    }
    
    // Step 3: Switch to a different season (this is where the bug occurs)
    console.log('Step 3: Switching to different season...');
    
    // Find all season cards that are not currently active
    const inactiveSeasons = page.locator('.season-card:not(.active)');
    const inactiveCount = await inactiveSeasons.count();
    
    if (inactiveCount > 0) {
      // Click the activate button on the first inactive season
      const activateButton = inactiveSeasons.first().locator('button:has-text("Activate")');
      await activateButton.click();
      
      // Wait for the season to become active
      await page.waitForTimeout(1000); // Give time for the change to process
      
      console.log('Season switch completed');
    } else {
      console.log('No inactive seasons found, skipping season switch test');
      return;
    }
    
    // Step 4: Test navigation after season switch (this should work but currently fails)
    console.log('Step 4: Testing navigation after season switch...');
    
    // Re-query the navigation buttons (they might have been recreated)
    const playersTabAfter = page.locator('[data-tab="players"]');
    const scheduleTabAfter = page.locator('[data-tab="schedule"]');
    
    // Check if buttons are still enabled
    const playersDisabledAfter = await playersTabAfter.getAttribute('disabled');
    const scheduleDisabledAfter = await scheduleTabAfter.getAttribute('disabled');
    
    console.log(`Players button disabled after switch: ${playersDisabledAfter !== null}`);
    console.log(`Schedule button disabled after switch: ${scheduleDisabledAfter !== null}`);
    
    // The critical test: try to click the players button after season switch
    if (playersDisabledAfter === null) {
      console.log('Attempting to click players button after season switch...');
      
      // This is the click that should work but currently fails
      await playersTabAfter.click();
      
      // Wait a moment for any potential tab switch
      await page.waitForTimeout(500);
      
      // Check if the tab actually switched
      const hasActiveClass = await playersTabAfter.getAttribute('class');
      const isActive = hasActiveClass?.includes('active') || false;
      
      console.log(`Players tab active after click: ${isActive}`);
      console.log(`Players tab classes: ${hasActiveClass}`);
      
      // This assertion should pass but will likely fail due to the bug
      await expect(playersTabAfter).toHaveClass(/active/);
      
      console.log('SUCCESS: Navigation works after season switch!');
    } else {
      console.log('Players button is disabled after season switch - this might be expected');
    }
    
    // Additional debugging: try schedule button too
    if (scheduleDisabledAfter === null) {
      console.log('Testing schedule button after season switch...');
      await scheduleTabAfter.click();
      await page.waitForTimeout(500);
      
      const scheduleHasActiveClass = await scheduleTabAfter.getAttribute('class');
      const scheduleIsActive = scheduleHasActiveClass?.includes('active') || false;
      
      console.log(`Schedule tab active after click: ${scheduleIsActive}`);
      console.log(`Schedule tab classes: ${scheduleHasActiveClass}`);
      
      await expect(scheduleTabAfter).toHaveClass(/active/);
      console.log('SUCCESS: Schedule navigation also works!');
    }
  });

  test('should capture console logs and errors', async ({ page }) => {
    // Capture console logs
    page.on('console', msg => {
      if (msg.type() === 'error') {
        console.log(`BROWSER ERROR: ${msg.text()}`);
      } else if (msg.type() === 'log') {
        console.log(`BROWSER LOG: ${msg.text()}`);
      }
    });

    // Capture JavaScript errors
    page.on('pageerror', error => {
      console.log(`JAVASCRIPT ERROR: ${error.message}`);
    });

    await page.goto('/');
    await page.waitForSelector('.main-application', { timeout: 10000 });
    
    // Perform the same season switch scenario but focus on capturing errors
    const seasonsTab = page.locator('[data-tab="seasons"]');
    await seasonsTab.click();
    
    const seasonCards = page.locator('.season-card');
    const seasonCount = await seasonCards.count();
    
    if (seasonCount >= 2) {
      const inactiveSeasons = page.locator('.season-card:not(.active)');
      const inactiveCount = await inactiveSeasons.count();
      
      if (inactiveCount > 0) {
        const activateButton = inactiveSeasons.first().locator('button:has-text("Activate")');
        await activateButton.click();
        await page.waitForTimeout(1000);
        
        // Try clicking navigation
        const playersTab = page.locator('[data-tab="players"]');
        const playersDisabled = await playersTab.getAttribute('disabled');
        
        if (playersDisabled === null) {
          await playersTab.click();
          await page.waitForTimeout(500);
        }
      }
    }
  });

  test('should inspect DOM structure after season switch', async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('.main-application', { timeout: 10000 });
    
    // Get initial DOM structure
    const initialNavigation = await page.locator('.app-navigation').innerHTML();
    console.log('Initial navigation HTML:', initialNavigation);
    
    // Check for event listener setup attribute
    const initialListenerSetup = await page.locator('.app-navigation').getAttribute('data-listener-setup');
    console.log('Initial listener setup attribute:', initialListenerSetup);
    
    // Switch season if possible
    const seasonsTab = page.locator('[data-tab="seasons"]');
    await seasonsTab.click();
    
    const inactiveSeasons = page.locator('.season-card:not(.active)');
    const inactiveCount = await inactiveSeasons.count();
    
    if (inactiveCount > 0) {
      const activateButton = inactiveSeasons.first().locator('button:has-text("Activate")');
      await activateButton.click();
      await page.waitForTimeout(1000);
      
      // Get DOM structure after season switch
      const afterNavigation = await page.locator('.app-navigation').innerHTML();
      console.log('Navigation HTML after season switch:', afterNavigation);
      
      const afterListenerSetup = await page.locator('.app-navigation').getAttribute('data-listener-setup');
      console.log('Listener setup attribute after switch:', afterListenerSetup);
      
      // Compare structures
      const structureChanged = initialNavigation !== afterNavigation;
      console.log('Navigation structure changed:', structureChanged);
      
      // Check if main application structure still exists
      const mainAppExists = await page.locator('.main-application').count();
      console.log('Main application elements after switch:', mainAppExists);
    }
  });
});