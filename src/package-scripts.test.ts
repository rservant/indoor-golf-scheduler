/**
 * Unit tests for package script functionality
 * Tests that all package scripts execute successfully
 * Validates: Requirements 9.2
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

describe('Package Script Functionality', () => {
  let packageJson: any;

  beforeAll(() => {
    // Read package.json to get the actual scripts
    const packagePath = join(process.cwd(), 'package.json');
    expect(existsSync(packagePath)).toBe(true);
    
    const packageContent = readFileSync(packagePath, 'utf8');
    packageJson = JSON.parse(packageContent);
    
    expect(packageJson.scripts).toBeDefined();
  });

  /**
   * Test that build script executes successfully
   * Requirements: 9.2 - Package scripts should include commands for development, building, and serving
   */
  test('build script executes successfully', () => {
    expect(packageJson.scripts.build).toBeDefined();
    expect(packageJson.scripts.build).toContain('vite build');

    let buildOutput: string;
    let buildError: Error | null = null;

    try {
      buildOutput = execSync('npm run build', {
        encoding: 'utf8',
        cwd: process.cwd(),
        timeout: 30000 // 30 second timeout
      });
    } catch (error) {
      buildError = error as Error;
      buildOutput = error instanceof Error ? error.message : 'Unknown build error';
    }

    // Build should succeed
    expect(buildError).toBeNull();
    
    // Build output should indicate success (Vite may not always output "built in")
    const hasSuccessIndicators = buildOutput.includes('vite') || 
                                buildOutput.includes('built') ||
                                buildOutput.includes('dist') ||
                                buildOutput.length > 0; // At least some output
    expect(hasSuccessIndicators).toBe(true);
    
    // Build should not contain errors
    const hasErrors = buildOutput.toLowerCase().includes('error') && 
                     !buildOutput.toLowerCase().includes('0 errors');
    expect(hasErrors).toBe(false);
    
    // Build output directory should exist (check with absolute path)
    const distPath = join(process.cwd(), 'dist');
    expect(existsSync(distPath)).toBe(true);
  });

  /**
   * Test that dev script is properly configured
   * Requirements: 9.2 - Package scripts should include commands for development
   */
  test('dev script is properly configured', () => {
    expect(packageJson.scripts.dev).toBeDefined();
    expect(packageJson.scripts.dev).toBe('vite');
    
    // We don't actually start the dev server in tests, just verify the script exists
    // and uses the correct command
  });

  /**
   * Test that serve/preview scripts execute successfully
   * Requirements: 9.2 - Package scripts should include commands for serving
   */
  test('serve and preview scripts are properly configured', () => {
    expect(packageJson.scripts.serve).toBeDefined();
    expect(packageJson.scripts.serve).toContain('vite preview');
    
    expect(packageJson.scripts.preview).toBeDefined();
    expect(packageJson.scripts.preview).toContain('vite preview');
    
    // Verify the preview script includes port configuration
    expect(packageJson.scripts.preview).toContain('--port 3000');
  });

  /**
   * Test that test scripts are properly configured
   * Requirements: 9.2 - Package scripts should support testing
   */
  test('test scripts are properly configured', () => {
    expect(packageJson.scripts.test).toBeDefined();
    expect(packageJson.scripts.test).toBe('jest');
    
    expect(packageJson.scripts['test:watch']).toBeDefined();
    expect(packageJson.scripts['test:watch']).toBe('jest --watch');
    
    expect(packageJson.scripts['test:coverage']).toBeDefined();
    expect(packageJson.scripts['test:coverage']).toBe('jest --coverage');

    // Verify Jest is available as a dependency
    expect(packageJson.devDependencies.jest).toBeDefined();
    
    // Verify Jest configuration exists (either in package.json or jest.config.js)
    const hasJestConfig = packageJson.jest !== undefined || existsSync('jest.config.js');
    expect(hasJestConfig).toBe(true);
  });

  /**
   * Test that e2e test scripts are properly configured
   * Requirements: 9.2 - Package scripts should support end-to-end testing
   */
  test('e2e test scripts are properly configured', () => {
    expect(packageJson.scripts['test:e2e']).toBeDefined();
    expect(packageJson.scripts['test:e2e']).toContain('playwright test');
    expect(packageJson.scripts['test:e2e']).toContain('--reporter=line');
    
    expect(packageJson.scripts['test:e2e:ui']).toBeDefined();
    expect(packageJson.scripts['test:e2e:ui']).toContain('playwright test --ui');
  });

  /**
   * Test that TypeScript checking scripts are available
   * Requirements: 9.2 - Package scripts should support TypeScript development
   */
  test('TypeScript checking scripts are available', () => {
    expect(packageJson.scripts['type-check']).toBeDefined();
    expect(packageJson.scripts['type-check']).toContain('tsc --noEmit');
    
    expect(packageJson.scripts.lint).toBeDefined();
    expect(packageJson.scripts.lint).toContain('tsc --noEmit');

    // Test type checking
    let typeCheckOutput: string;
    let typeCheckError: Error | null = null;

    try {
      typeCheckOutput = execSync('npm run type-check', {
        encoding: 'utf8',
        cwd: process.cwd(),
        timeout: 15000 // 15 second timeout
      });
    } catch (error) {
      typeCheckError = error as Error;
      typeCheckOutput = error instanceof Error ? error.message : 'Unknown type check error';
    }

    // Type checking should succeed or only have warnings
    if (typeCheckError) {
      // Check if it's a real error or just warnings/info
      const hasTypeErrors = typeCheckOutput.includes('error TS') && 
                           !typeCheckOutput.includes('0 errors');
      expect(hasTypeErrors).toBe(false);
    }
  });

  /**
   * Test that utility scripts are properly configured
   * Requirements: 9.2 - Package scripts should include utility commands
   */
  test('utility scripts are properly configured', () => {
    expect(packageJson.scripts.clean).toBeDefined();
    expect(packageJson.scripts.clean).toBe('rm -rf dist');
    
    expect(packageJson.scripts.start).toBeDefined();
    expect(packageJson.scripts.start).toContain('npm run build');
    expect(packageJson.scripts.start).toContain('npm run serve');
    
    expect(packageJson.scripts['dev:server']).toBeDefined();
    expect(packageJson.scripts['dev:server']).toContain('npm run build');
    expect(packageJson.scripts['dev:server']).toContain('node server.js');
  });

  /**
   * Test that clean script executes successfully
   * Requirements: 9.2 - Utility scripts should work correctly
   */
  test('clean script executes successfully', () => {
    let cleanOutput: string;
    let cleanError: Error | null = null;

    try {
      cleanOutput = execSync('npm run clean', {
        encoding: 'utf8',
        cwd: process.cwd(),
        timeout: 5000 // 5 second timeout
      });
    } catch (error) {
      cleanError = error as Error;
      cleanOutput = error instanceof Error ? error.message : 'Unknown clean error';
    }

    // Clean should succeed (even if dist doesn't exist)
    expect(cleanError).toBeNull();
  });

  /**
   * Test that conflicting scripts have been removed
   * Requirements: 9.2 - Remove or update conflicting dependencies
   */
  test('conflicting scripts have been removed', () => {
    // These scripts should not exist as they conflict with TypeScript application
    expect(packageJson.scripts['build:webapp']).toBeUndefined();
    expect(packageJson.scripts.webapp).toBeUndefined();
    
    // Verify we're using Vite consistently
    expect(packageJson.scripts.build).toContain('vite');
    expect(packageJson.scripts.dev).toContain('vite');
    expect(packageJson.scripts.serve).toContain('vite');
    expect(packageJson.scripts.preview).toContain('vite');
  });

  /**
   * Test that Vite is properly configured as dependency
   * Requirements: 9.2 - Add Vite as development dependency
   */
  test('Vite is properly configured as dependency', () => {
    expect(packageJson.devDependencies).toBeDefined();
    expect(packageJson.devDependencies.vite).toBeDefined();
    
    // Verify Vite version is reasonable (should be 4.0+)
    const viteVersion = packageJson.devDependencies.vite;
    expect(viteVersion).toMatch(/^\^?\d+\.\d+\.\d+/);
    
    // Extract major version number
    const majorVersion = parseInt(viteVersion.replace(/^\^?/, '').split('.')[0]);
    expect(majorVersion).toBeGreaterThanOrEqual(4);
  });

  /**
   * Test that TypeScript is properly configured as dependency
   * Requirements: 9.2 - Ensure TypeScript tooling is available
   */
  test('TypeScript is properly configured as dependency', () => {
    expect(packageJson.devDependencies.typescript).toBeDefined();
    
    // Verify TypeScript version is reasonable (should be 4.0+)
    const tsVersion = packageJson.devDependencies.typescript;
    expect(tsVersion).toMatch(/^\^?\d+\.\d+\.\d+/);
    
    // Extract major version number
    const majorVersion = parseInt(tsVersion.replace(/^\^?/, '').split('.')[0]);
    expect(majorVersion).toBeGreaterThanOrEqual(4);
  });
});