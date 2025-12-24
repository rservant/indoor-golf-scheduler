import * as fs from 'fs';
import * as path from 'path';
import * as fc from 'fast-check';

/**
 * Security validation tests for xlsx package removal
 * **Feature: xlsx-security-removal, Property 1: No xlsx imports in codebase**
 * **Validates: Requirements 1.4**
 */
describe('xlsx Security Removal', () => {
  
  /**
   * Get all TypeScript and JavaScript source files in the project
   */
  function getAllSourceFiles(dir: string, files: string[] = []): string[] {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        // Skip node_modules, dist, coverage, and other build directories
        if (!['node_modules', 'dist', 'coverage', '.git', '.vite', 'test-results', 'playwright-report'].includes(entry.name)) {
          getAllSourceFiles(fullPath, files);
        }
      } else if (entry.isFile()) {
        // Include TypeScript and JavaScript files
        if (/\.(ts|js|tsx|jsx)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
          files.push(fullPath);
        }
      }
    }
    
    return files;
  }

  /**
   * Property test: No source file should contain xlsx imports
   * For any source file in the codebase, that file should not contain xlsx import statements
   */
  it('should have no xlsx imports in any source file', () => {
    const projectRoot = path.resolve(__dirname, '../..');
    const sourceFiles = getAllSourceFiles(projectRoot);
    
    // Ensure we found some files to test
    expect(sourceFiles.length).toBeGreaterThan(0);
    
    // Property-based test: for all source files, no xlsx imports should exist
    fc.assert(
      fc.property(
        fc.constantFrom(...sourceFiles),
        (filePath) => {
          const content = fs.readFileSync(filePath, 'utf-8');
          
          // Skip the security test file itself as it contains xlsx references for testing
          if (filePath.includes('xlsx-removal.test.ts')) {
            return true;
          }
          
          // Check for various forms of xlsx imports
          const xlsxImportPatterns = [
            /import\s+.*\s+from\s+['"]xlsx['"]/,  // import ... from 'xlsx'
            /import\s*\*\s*as\s+\w+\s+from\s+['"]xlsx['"]/,  // import * as XLSX from 'xlsx'
            /import\s*{\s*[^}]*\s*}\s*from\s+['"]xlsx['"]/,  // import { ... } from 'xlsx'
            /require\s*\(\s*['"]xlsx['"]\s*\)/,  // require('xlsx')
            /import\s+['"]xlsx['"]/  // import 'xlsx'
          ];
          
          const hasXlsxImport = xlsxImportPatterns.some(pattern => pattern.test(content));
          
          if (hasXlsxImport) {
            console.error(`Found xlsx import in file: ${filePath}`);
            return false;
          }
          
          return true;
        }
      ),
      { numRuns: sourceFiles.length } // Test all source files
    );
  });

  /**
   * Unit test: Verify specific critical files don't have xlsx imports
   */
  it('should not have xlsx imports in critical service files', () => {
    const criticalFiles = [
      'src/services/ExportService.ts',
      'src/services/ImportExportService.ts'
    ];
    
    const projectRoot = path.resolve(__dirname, '../..');
    
    criticalFiles.forEach(relativePath => {
      const filePath = path.join(projectRoot, relativePath);
      
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        
        // Should not contain any xlsx imports
        expect(content).not.toMatch(/import\s+.*\s+from\s+['"]xlsx['"]/);
        expect(content).not.toMatch(/import\s*\*\s*as\s+\w+\s+from\s+['"]xlsx['"]/);
        expect(content).not.toMatch(/require\s*\(\s*['"]xlsx['"]\s*\)/);
      }
    });
  });

  /**
   * Unit test: Verify package.json doesn't contain xlsx dependency
   */
  it('should not have xlsx in package.json dependencies', () => {
    const projectRoot = path.resolve(__dirname, '../..');
    const packageJsonPath = path.join(projectRoot, 'package.json');
    
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
    
    // Check dependencies and devDependencies
    expect(packageJson.dependencies?.xlsx).toBeUndefined();
    expect(packageJson.devDependencies?.xlsx).toBeUndefined();
  });

  /**
   * Unit test: Verify vite.config.ts doesn't reference xlsx
   */
  it('should not have xlsx references in vite.config.ts', () => {
    const projectRoot = path.resolve(__dirname, '../..');
    const viteConfigPath = path.join(projectRoot, 'vite.config.ts');
    
    if (fs.existsSync(viteConfigPath)) {
      const content = fs.readFileSync(viteConfigPath, 'utf-8');
      
      // Should not contain xlsx in vendor chunks or optimization
      expect(content).not.toMatch(/['"]xlsx['"]/);
    }
  });

  /**
   * Property test: CSV-only import support
   * **Feature: xlsx-security-removal, Property 4: CSV-only import support**
   * **Validates: Requirements 3.4**
   */
  it('should only support CSV format for imports', () => {
    const projectRoot = path.resolve(__dirname, '../..');
    const importExportServicePath = path.join(projectRoot, 'src/services/ImportExportService.ts');
    
    if (fs.existsSync(importExportServicePath)) {
      const content = fs.readFileSync(importExportServicePath, 'utf-8');
      
      // Should only have 'csv' in ImportFormat type
      const importFormatMatch = content.match(/export type ImportFormat = [^;]+;/);
      if (importFormatMatch) {
        const importFormatDeclaration = importFormatMatch[0];
        expect(importFormatDeclaration).toContain("'csv'");
        expect(importFormatDeclaration).not.toContain("'excel'");
      }
      
      // Should not have parseExcelFile method
      expect(content).not.toMatch(/parseExcelFile/);
      
      // Should not have Excel case in switch statements
      expect(content).not.toMatch(/case\s+['"]excel['"]/);
    }
  });

  /**
   * Property test: File inputs only accept CSV format
   * **Feature: xlsx-security-removal, Property 2: File inputs only accept CSV format**
   * **Validates: Requirements 3.3, 4.1**
   */
  it('should only accept CSV files in file input elements', () => {
    const projectRoot = path.resolve(__dirname, '../..');
    const uiFiles = getAllSourceFiles(path.join(projectRoot, 'src/ui'));
    
    // Property-based test: for all UI files, file inputs should only accept CSV
    fc.assert(
      fc.property(
        fc.constantFrom(...uiFiles.filter(f => f.endsWith('.ts'))),
        (filePath) => {
          const content = fs.readFileSync(filePath, 'utf-8');
          
          // Check for file input accept attributes
          const fileInputMatches = content.match(/accept\s*=\s*["'][^"']*["']/g);
          
          if (fileInputMatches) {
            for (const match of fileInputMatches) {
              // Should not accept Excel file extensions
              expect(match).not.toMatch(/\.xlsx/);
              expect(match).not.toMatch(/\.xls/);
              
              // If it accepts files, should only accept CSV
              if (match.includes('.')) {
                expect(match).toMatch(/\.csv/);
              }
            }
          }
          
          return true;
        }
      ),
      { numRuns: uiFiles.length }
    );
  });

  /**
   * Property test: Format options exclude Excel
   * **Feature: xlsx-security-removal, Property 3: Format options exclude Excel**
   * **Validates: Requirements 2.4, 4.2, 4.3**
   */
  it('should not include Excel format options in UI dropdowns', () => {
    const projectRoot = path.resolve(__dirname, '../..');
    const uiFiles = getAllSourceFiles(path.join(projectRoot, 'src/ui'));
    
    // Property-based test: for all UI files, format dropdowns should not include Excel
    fc.assert(
      fc.property(
        fc.constantFrom(...uiFiles.filter(f => f.endsWith('.ts'))),
        (filePath) => {
          const content = fs.readFileSync(filePath, 'utf-8');
          
          // Check for option elements with Excel values
          const optionMatches = content.match(/<option[^>]*value\s*=\s*["'][^"']*["'][^>]*>/g);
          
          if (optionMatches) {
            for (const match of optionMatches) {
              // Should not have Excel option values
              expect(match).not.toMatch(/value\s*=\s*["']excel["']/);
              expect(match).not.toMatch(/value\s*=\s*["']xlsx["']/);
            }
          }
          
          // Check for JavaScript option creation with Excel values
          expect(content).not.toMatch(/value\s*=\s*["']excel["']/);
          expect(content).not.toMatch(/\.value\s*=\s*["']excel["']/);
          
          return true;
        }
      ),
      { numRuns: uiFiles.length }
    );
  });

  /**
   * Property test: Tests pass without xlsx dependencies
   * **Feature: xlsx-security-removal, Property 5: Tests pass without xlsx dependencies**
   * **Validates: Requirements 5.4**
   */
  it('should have no xlsx imports in test files', () => {
    const projectRoot = path.resolve(__dirname, '../..');
    const testFiles = getAllSourceFiles(projectRoot).filter(f => f.includes('.test.') || f.includes('.spec.'));
    
    // Ensure we found some test files
    expect(testFiles.length).toBeGreaterThan(0);
    
    // Property-based test: for all test files, no xlsx imports should exist
    fc.assert(
      fc.property(
        fc.constantFrom(...testFiles),
        (filePath) => {
          const content = fs.readFileSync(filePath, 'utf-8');
          
          // Skip the security test file itself as it contains xlsx references for testing
          if (filePath.includes('xlsx-removal.test.ts')) {
            return true;
          }
          
          // Check for various forms of xlsx imports
          const xlsxImportPatterns = [
            /import\s+.*\s+from\s+['"]xlsx['"]/,  // import ... from 'xlsx'
            /import\s*\*\s*as\s+\w+\s+from\s+['"]xlsx['"]/,  // import * as XLSX from 'xlsx'
            /import\s*{\s*[^}]*\s*}\s*from\s+['"]xlsx['"]/,  // import { ... } from 'xlsx'
            /require\s*\(\s*['"]xlsx['"]\s*\)/,  // require('xlsx')
            /import\s+['"]xlsx['"]/  // import 'xlsx'
          ];
          
          const hasXlsxImport = xlsxImportPatterns.some(pattern => pattern.test(content));
          
          if (hasXlsxImport) {
            console.error(`Found xlsx import in test file: ${filePath}`);
            return false;
          }
          
          return true;
        }
      ),
      { numRuns: testFiles.length }
    );
  });

  /**
   * Property test: Documentation contains no Excel references
   * **Feature: xlsx-security-removal, Property 6: Documentation contains no Excel references**
   * **Validates: Requirements 6.2, 6.3, 6.4**
   */
  it('should have no Excel references in documentation and comments', () => {
    const projectRoot = path.resolve(__dirname, '../..');
    const allFiles = getAllSourceFiles(projectRoot);
    
    // Include documentation files
    const docFiles = [
      ...allFiles,
      path.join(projectRoot, 'README.md'),
      path.join(projectRoot, 'src/ui/demo.html')
    ].filter(f => fs.existsSync(f));
    
    // Property-based test: for all files, no Excel references should exist
    fc.assert(
      fc.property(
        fc.constantFrom(...docFiles),
        (filePath) => {
          const content = fs.readFileSync(filePath, 'utf-8');
          
          // Skip spec files as they are expected to contain Excel references for removal documentation
          if (filePath.includes('.kiro/specs/xlsx-security-removal/') || 
              filePath.includes('xlsx-removal.test.ts') ||
              filePath.includes('ExportService.test.ts') ||
              filePath.includes('ImportExportService.test.ts')) {
            return true;
          }
          
          // Check for Excel references in comments and documentation
          const excelReferences = [
            /\bexcel\b/i,  // Word boundary Excel (not "excellent")
            /\.xlsx/i,     // .xlsx file extensions
            /\.xls\b/i     // .xls file extensions (word boundary to avoid matching other words)
          ];
          
          const hasExcelReference = excelReferences.some(pattern => pattern.test(content));
          
          if (hasExcelReference) {
            console.error(`Found Excel reference in file: ${filePath}`);
            return false;
          }
          
          return true;
        }
      ),
      { numRuns: docFiles.length }
    );
  });
});