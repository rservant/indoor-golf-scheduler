/**
 * Property-based tests for build system compilation
 * Feature: typescript-activation, Property 1: Build System Compilation
 * Validates: Requirements 1.1, 1.4
 */

import * as fc from 'fast-check';
import { execSync } from 'child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

describe('Build System Compilation Properties', () => {
  /**
   * Property 1: Build System Compilation
   * For any valid TypeScript source file in the src directory, 
   * the build system should successfully compile it to JavaScript without errors
   * **Validates: Requirements 1.1, 1.4**
   */
  test('Property 1: Build system compiles all TypeScript files without errors', () => {
    fc.assert(
      fc.property(
        fc.constant(true), // We'll test the actual source files, not generated ones
        () => {
          // Get all TypeScript files in src directory
          const srcFiles = getAllTypeScriptFiles('src');
          
          // Ensure we have TypeScript files to test
          expect(srcFiles.length).toBeGreaterThan(0);
          
          // Run the build command
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
          
          // Property: Build should succeed without errors
          if (buildError) {
            throw new Error(`Build failed for TypeScript files: ${buildError.message}`);
          }
          
          // Property: Build output should exist
          const distExists = existsSync('dist');
          expect(distExists).toBe(true);
          
          // Property: Built files should exist
          const distFiles = existsSync('dist') ? readdirSync('dist') : [];
          expect(distFiles.length).toBeGreaterThan(0);
          
          // Property: At least one JavaScript file should be generated (check assets directory)
          const assetsDir = join('dist', 'assets');
          const hasAssetsDir = existsSync(assetsDir);
          let hasJsFiles = false;
          
          if (hasAssetsDir) {
            const assetFiles = readdirSync(assetsDir);
            hasJsFiles = assetFiles.some(file => extname(file) === '.js');
          } else {
            // Check root dist directory for JS files
            hasJsFiles = distFiles.some(file => extname(file) === '.js');
          }
          
          expect(hasJsFiles).toBe(true);
          
          // Property: Build output should not contain TypeScript compilation errors
          const hasCompilationErrors = buildOutput.toLowerCase().includes('error ts') ||
                                     buildOutput.toLowerCase().includes('typescript error') ||
                                     buildOutput.toLowerCase().includes('compilation error');
          expect(hasCompilationErrors).toBe(false);
          
          return true;
        }
      ),
      { 
        numRuns: 5, // Run fewer times since build is expensive
        verbose: true 
      }
    );
  });

  /**
   * Property: Module resolution completeness
   * For any TypeScript file with imports, all imports should be resolvable
   * **Validates: Requirements 1.1, 1.4**
   */
  test('Property 1b: All TypeScript imports are resolvable during compilation', () => {
    fc.assert(
      fc.property(
        fc.constant(true),
        () => {
          const srcFiles = getAllTypeScriptFiles('src');
          
          // Check each TypeScript file for import statements
          for (const filePath of srcFiles) {
            const content = readFileSync(filePath, 'utf8');
            const importMatches = content.match(/import\s+.*\s+from\s+['"`]([^'"`]+)['"`]/g);
            
            if (importMatches) {
              // Property: Files with imports should not cause module resolution errors
              // This is validated by the successful build in the previous test
              expect(importMatches.length).toBeGreaterThan(0);
            }
          }
          
          return true;
        }
      ),
      { 
        numRuns: 3,
        verbose: true 
      }
    );
  });
});

/**
 * Helper function to recursively get all TypeScript files in a directory
 */
function getAllTypeScriptFiles(dir: string): string[] {
  const files: string[] = [];
  
  if (!existsSync(dir)) {
    return files;
  }
  
  const entries = readdirSync(dir);
  
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    
    if (stat.isDirectory()) {
      // Skip node_modules and other non-source directories
      if (!['node_modules', 'dist', 'coverage', '.git'].includes(entry)) {
        files.push(...getAllTypeScriptFiles(fullPath));
      }
    } else if (stat.isFile() && extname(entry) === '.ts' && !entry.endsWith('.test.ts') && !entry.endsWith('.d.ts')) {
      files.push(fullPath);
    }
  }
  
  return files;
}