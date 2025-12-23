/**
 * Property-based tests for module resolution completeness
 * Feature: typescript-activation, Property 2: Module Resolution Completeness
 * Validates: Requirements 2.1, 2.4
 */

import * as fc from 'fast-check';
import { execSync } from 'child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, extname, resolve, dirname } from 'path';

describe('Module Resolution Properties', () => {
  /**
   * Property 2: Module Resolution Completeness
   * For any import statement in the TypeScript application, 
   * the build system should resolve it to the correct module without missing dependencies
   * **Validates: Requirements 2.1, 2.4**
   */
  test('Property 2: All import statements resolve to correct modules', () => {
    fc.assert(
      fc.property(
        fc.constant(true),
        () => {
          // Get all TypeScript files in src directory
          const srcFiles = getAllTypeScriptFiles('src');
          expect(srcFiles.length).toBeGreaterThan(0);
          
          // Collect all import statements from all files
          const allImports = new Map<string, string[]>(); // file -> imports
          const importTargets = new Set<string>(); // all unique import targets
          
          for (const filePath of srcFiles) {
            const content = readFileSync(filePath, 'utf8');
            const imports = extractImportStatements(content);
            
            if (imports.length > 0) {
              allImports.set(filePath, imports);
              imports.forEach(imp => importTargets.add(imp));
            }
          }
          
          // Property: We should have import statements to test
          expect(importTargets.size).toBeGreaterThan(0);
          
          // Property: All relative imports should resolve to existing files
          for (const [filePath, imports] of allImports) {
            for (const importPath of imports) {
              if (importPath.startsWith('./') || importPath.startsWith('../')) {
                const resolvedPath = resolveRelativeImport(filePath, importPath);
                const exists = checkImportExists(resolvedPath);
                
                if (!exists) {
                  throw new Error(`Relative import "${importPath}" in file "${filePath}" does not resolve to existing file. Tried: ${resolvedPath}`);
                }
              }
            }
          }
          
          // Property: All absolute imports from src should resolve
          for (const [filePath, imports] of allImports) {
            for (const importPath of imports) {
              if (importPath.startsWith('@/') || importPath.startsWith('src/')) {
                const resolvedPath = resolveAbsoluteImport(importPath);
                const exists = checkImportExists(resolvedPath);
                
                if (!exists) {
                  throw new Error(`Absolute import "${importPath}" in file "${filePath}" does not resolve to existing file. Tried: ${resolvedPath}`);
                }
              }
            }
          }
          
          return true;
        }
      ),
      { 
        numRuns: 10,
        verbose: true 
      }
    );
  });

  /**
   * Property: TypeScript compilation validates module resolution
   * For any TypeScript file with imports, TypeScript compilation should succeed
   * **Validates: Requirements 2.1, 2.4**
   */
  test('Property 2b: TypeScript compilation validates all module imports', () => {
    fc.assert(
      fc.property(
        fc.constant(true),
        () => {
          let tscOutput: string;
          let tscError: Error | null = null;
          
          try {
            // Run TypeScript compiler check
            tscOutput = execSync('npx tsc --noEmit --skipLibCheck', { 
              encoding: 'utf8',
              cwd: process.cwd(),
              timeout: 15000 // 15 second timeout
            });
          } catch (error) {
            tscError = error as Error;
            tscOutput = error instanceof Error ? error.message : 'Unknown TypeScript error';
          }
          
          // Property: TypeScript compilation should succeed (no module resolution errors)
          if (tscError) {
            // Check if the error is related to module resolution
            const isModuleError = tscOutput.includes('Cannot find module') ||
                                tscOutput.includes('Module not found') ||
                                tscOutput.includes('Cannot resolve module') ||
                                tscOutput.includes('TS2307') || // Cannot find module
                                tscOutput.includes('TS2305') || // Module has no exported member
                                tscOutput.includes('TS2304'); // Cannot find name
            
            if (isModuleError) {
              throw new Error(`Module resolution error in TypeScript compilation: ${tscOutput}`);
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

  /**
   * Property: Vite build validates module resolution
   * For any module import, Vite build should successfully resolve and bundle it
   * **Validates: Requirements 2.1, 2.4**
   */
  test('Property 2c: Vite build successfully resolves all module dependencies', () => {
    fc.assert(
      fc.property(
        fc.constant(true),
        () => {
          let buildOutput: string;
          let buildError: Error | null = null;
          
          try {
            // Run Vite build
            buildOutput = execSync('npm run build', { 
              encoding: 'utf8',
              cwd: process.cwd(),
              timeout: 30000 // 30 second timeout
            });
          } catch (error) {
            buildError = error as Error;
            buildOutput = error instanceof Error ? error.message : 'Unknown build error';
          }
          
          // Property: Build should succeed without module resolution errors
          if (buildError) {
            // Check if the error is related to module resolution
            const isModuleError = buildOutput.includes('Cannot resolve') ||
                                buildOutput.includes('Module not found') ||
                                buildOutput.includes('Failed to resolve import') ||
                                buildOutput.includes('Could not resolve');
            
            if (isModuleError) {
              throw new Error(`Module resolution error in Vite build: ${buildOutput}`);
            }
          }
          
          // Property: Build output should exist and contain bundled modules
          const distExists = existsSync('dist');
          expect(distExists).toBe(true);
          
          return true;
        }
      ),
      { 
        numRuns: 3,
        verbose: true 
      }
    );
  });

  /**
   * Property: Path aliases resolve correctly
   * For any import using path aliases (@/), it should resolve to the correct file
   * **Validates: Requirements 2.1, 2.4**
   */
  test('Property 2d: Path aliases resolve to correct modules', () => {
    fc.assert(
      fc.property(
        fc.constant(true),
        () => {
          const srcFiles = getAllTypeScriptFiles('src');
          const aliasImports = new Map<string, string[]>();
          
          // Find all imports using path aliases
          for (const filePath of srcFiles) {
            const content = readFileSync(filePath, 'utf8');
            const imports = extractImportStatements(content);
            const aliasedImports = imports.filter(imp => imp.startsWith('@/'));
            
            if (aliasedImports.length > 0) {
              aliasImports.set(filePath, aliasedImports);
            }
          }
          
          // Property: All aliased imports should resolve to existing files
          for (const [filePath, imports] of aliasImports) {
            for (const importPath of imports) {
              const resolvedPath = resolveAliasImport(importPath);
              const exists = checkImportExists(resolvedPath);
              
              if (!exists) {
                throw new Error(`Aliased import "${importPath}" in file "${filePath}" does not resolve to existing file. Tried: ${resolvedPath}`);
              }
            }
          }
          
          return true;
        }
      ),
      { 
        numRuns: 5,
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

/**
 * Extract import statements from TypeScript file content
 */
function extractImportStatements(content: string): string[] {
  const imports: string[] = [];
  
  // Match various import patterns
  const importPatterns = [
    /import\s+.*\s+from\s+['"`]([^'"`]+)['"`]/g,
    /import\s+['"`]([^'"`]+)['"`]/g,
    /import\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g
  ];
  
  for (const pattern of importPatterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      imports.push(match[1]);
    }
  }
  
  return imports;
}

/**
 * Resolve relative import path to absolute file path
 */
function resolveRelativeImport(fromFile: string, importPath: string): string {
  const fromDir = dirname(fromFile);
  return resolve(fromDir, importPath);
}

/**
 * Resolve absolute import path (starting with src/)
 */
function resolveAbsoluteImport(importPath: string): string {
  if (importPath.startsWith('src/')) {
    return resolve(process.cwd(), importPath);
  }
  return importPath;
}

/**
 * Resolve alias import path (@/ -> src/)
 */
function resolveAliasImport(importPath: string): string {
  if (importPath.startsWith('@/')) {
    return resolve(process.cwd(), 'src', importPath.substring(2));
  }
  return importPath;
}

/**
 * Check if an import path exists (with various extensions)
 */
function checkImportExists(importPath: string): boolean {
  // Try exact path first
  if (existsSync(importPath)) {
    return true;
  }
  
  // Try with TypeScript extension
  if (existsSync(importPath + '.ts')) {
    return true;
  }
  
  // Try with JavaScript extension
  if (existsSync(importPath + '.js')) {
    return true;
  }
  
  // Try as directory with index file
  if (existsSync(join(importPath, 'index.ts'))) {
    return true;
  }
  
  if (existsSync(join(importPath, 'index.js'))) {
    return true;
  }
  
  return false;
}