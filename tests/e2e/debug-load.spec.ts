import { test, expect } from '@playwright/test';

test('debug application loading', async ({ page }) => {
  // Capture all console messages
  page.on('console', msg => {
    console.log(`BROWSER ${msg.type().toUpperCase()}: ${msg.text()}`);
  });

  // Capture all network requests
  page.on('request', request => {
    console.log(`REQUEST: ${request.method()} ${request.url()}`);
  });

  // Capture all network responses
  page.on('response', response => {
    console.log(`RESPONSE: ${response.status()} ${response.url()}`);
  });

  // Capture JavaScript errors
  page.on('pageerror', error => {
    console.log(`JAVASCRIPT ERROR: ${error.message}`);
    console.log(`STACK: ${error.stack}`);
  });

  console.log('Navigating to http://localhost:3000...');
  await page.goto('http://localhost:3000');
  
  console.log('Waiting for page to load...');
  await page.waitForLoadState('networkidle');
  
  console.log('Waiting 5 seconds to see what happens...');
  await page.waitForTimeout(5000);
  
  console.log('Getting final page state...');
  const appContainer = page.locator('#golf-scheduler-app');
  const content = await appContainer.innerHTML();
  console.log(`Final app content: ${content}`);
  
  // Check if the MainApplicationUI loaded
  const mainApp = page.locator('.main-application');
  const mainAppCount = await mainApp.count();
  console.log(`Main application elements: ${mainAppCount}`);
  
  if (mainAppCount > 0) {
    console.log('SUCCESS: MainApplicationUI loaded!');
    const navButtons = page.locator('.nav-tab');
    const navCount = await navButtons.count();
    console.log(`Navigation buttons found: ${navCount}`);
  } else {
    console.log('MainApplicationUI did not load');
  }
});