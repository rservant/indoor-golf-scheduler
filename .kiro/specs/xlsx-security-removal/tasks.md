# Implementation Plan: xlsx Security Removal

## Overview

Systematic removal of the vulnerable xlsx package to eliminate the prototype pollution security vulnerability. This involves removing Excel import/export functionality while maintaining CSV and PDF support.

## Tasks

- [x] 1. Remove xlsx package dependency
  - Remove xlsx from package.json devDependencies
  - Remove xlsx from package-lock.json (will be handled by npm install)
  - Remove xlsx from vite.config.ts vendor chunks and optimization includes
  - _Requirements: 1.1, 1.2, 1.3_

- [x] 1.1 Write property test for no xlsx imports
  - **Property 1: No xlsx imports in codebase**
  - **Validates: Requirements 1.4**

- [x] 2. Remove Excel functionality from ExportService
  - Remove exportToExcel method from ExportService class
  - Remove exportPlayersToExcel method from ExportService class
  - Remove xlsx import statement from ExportService.ts
  - _Requirements: 2.1, 2.2_

- [x] 2.1 Write unit tests for ExportService Excel removal
  - Verify exportToExcel method no longer exists
  - Verify exportPlayersToExcel method no longer exists
  - _Requirements: 2.1, 2.2_

- [x] 3. Remove Excel functionality from ImportExportService
  - Remove parseExcelFile method from ImportExportService class
  - Remove Excel format handling from importPlayers method
  - Remove Excel template generation from generateImportTemplate method
  - Remove xlsx import statement from ImportExportService.ts
  - _Requirements: 3.1, 3.2, 2.3_

- [x] 3.1 Write property test for CSV-only import support
  - **Property 4: CSV-only import support**
  - **Validates: Requirements 3.4**

- [x] 4. Update user interface components
  - Update ImportExportUI file input to accept only .csv files
  - Remove Excel format options from export format dropdowns
  - Remove Excel format options from import format dropdowns
  - Update any help text or labels that reference Excel support
  - _Requirements: 4.1, 4.2, 4.3, 4.4_

- [x] 4.1 Write property test for file input validation
  - **Property 2: File inputs only accept CSV format**
  - **Validates: Requirements 3.3, 4.1**

- [x] 4.2 Write property test for format options
  - **Property 3: Format options exclude Excel**
  - **Validates: Requirements 2.4, 4.2, 4.3**

- [x] 5. Update test files
  - Remove Excel-related test cases from ImportExportService.test.ts
  - Remove Excel-related test cases from ExportService.test.ts
  - Update any integration tests that relied on Excel functionality
  - _Requirements: 5.1, 5.2, 5.3_

- [x] 5.1 Write property test for test suite xlsx independence
  - **Property 5: Tests pass without xlsx dependencies**
  - **Validates: Requirements 5.4**

- [x] 6. Update documentation and comments
  - Update README.md to remove Excel export examples
  - Update code comments that reference Excel functionality
  - Update JSDoc comments that mention Excel formats
  - Remove references to .xlsx files in documentation
  - _Requirements: 6.1, 6.2, 6.3, 6.4_

- [x] 6.1 Write property test for documentation cleanup
  - **Property 6: Documentation contains no Excel references**
  - **Validates: Requirements 6.2, 6.3, 6.4**

- [x] 7. Checkpoint - Verify removal and run tests
  - Run TypeScript compilation to ensure no xlsx import errors
  - Run full test suite to verify all tests pass
  - Verify no xlsx references remain in codebase
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- All tasks are required for comprehensive xlsx removal and security compliance
- Each task references specific requirements for traceability
- The checkpoint ensures complete removal verification
- Property tests validate universal correctness properties
- Unit tests validate specific removal examples and edge cases