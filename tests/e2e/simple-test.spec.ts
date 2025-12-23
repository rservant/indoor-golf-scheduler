import { test, expect } from '@playwright/test';

test('simple page load test', async ({ page }) => {
  // Capture console logs and errors
  page.on('console', msg => {
    console.log(`BROWSER ${msg.type().toUpperCase()}: ${msg.text()}`);
  });

  page.on('pageerror', error => {
    console.log(`JAVASCRIPT ERROR: ${error.message}`);
  });

  console.log('Navigating to http://localhost:3000...');
  await page.goto('http://localhost:3000');
  
  console.log('Waiting for page to load...');
  await page.waitForLoadState('networkidle');
  
  console.log('Taking screenshot...');
  await page.screenshot({ path: 'test-results/page-load.png' });
  
  console.log('Getting page title...');
  const title = await page.title();
  console.log(`Page title: ${title}`);
  
  console.log('Looking for app container...');
  const appContainer = page.locator('#golf-scheduler-app');
  await expect(appContainer).toBeVisible();
  
  console.log('Getting app container content...');
  const appContent = await appContainer.innerHTML();
  console.log(`App content length: ${appContent.length}`);
  console.log(`App content preview: ${appContent.substring(0, 200)}...`);
  
  // Wait a bit for any async loading
  await page.waitForTimeout(2000);
  
  console.log('Looking for main application...');
  const mainApp = page.locator('.main-application');
  const mainAppCount = await mainApp.count();
  console.log(`Main application elements found: ${mainAppCount}`);
  
  if (mainAppCount > 0) {
    console.log('Main application found!');
    const mainAppContent = await mainApp.innerHTML();
    console.log(`Main app content preview: ${mainAppContent.substring(0, 300)}...`);
  } else {
    console.log('Main application not found, checking for loading state...');
    const loadingElement = page.locator('.app-loading');
    const loadingCount = await loadingElement.count();
    console.log(`Loading elements found: ${loadingCount}`);
    
    if (loadingCount > 0) {
      console.log('App is still loading, waiting longer...');
      await page.waitForTimeout(5000);
      
      const mainAppAfterWait = page.locator('.main-application');
      const mainAppCountAfterWait = await mainAppAfterWait.count();
      console.log(`Main application elements after wait: ${mainAppCountAfterWait}`);
    }
  }
});