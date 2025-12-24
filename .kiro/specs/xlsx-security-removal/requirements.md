# Requirements Document

## Introduction

Remove the vulnerable xlsx package (SheetJS) from the indoor golf scheduler application to eliminate the prototype pollution security vulnerability (CVE-2023-30533). This involves removing Excel import/export functionality and updating all related code, tests, and documentation.

## Glossary

- **xlsx Package**: The SheetJS library used for Excel file processing
- **Excel Support**: Functionality to import/export .xlsx and .xls files
- **Import_Export_Service**: Service handling file import/export operations
- **Export_Service**: Service handling data export operations
- **Security_Vulnerability**: The prototype pollution issue in xlsx < 0.19.3

## Requirements

### Requirement 1: Remove xlsx Package Dependency

**User Story:** As a system administrator, I want to remove the vulnerable xlsx package, so that the application is secure from prototype pollution attacks.

#### Acceptance Criteria

1. THE System SHALL remove xlsx package from package.json dependencies
2. THE System SHALL remove xlsx package from package-lock.json
3. THE System SHALL remove xlsx from vite.config.ts vendor chunks and optimization includes
4. THE System SHALL ensure no xlsx imports remain in the codebase

### Requirement 2: Remove Excel Export Functionality

**User Story:** As a developer, I want Excel export functionality removed, so that no xlsx-dependent code remains in the system.

#### Acceptance Criteria

1. THE Export_Service SHALL remove exportToExcel method
2. THE Export_Service SHALL remove exportPlayersToExcel method
3. THE Import_Export_Service SHALL remove Excel template generation functionality
4. WHEN export format options are displayed, THE System SHALL not include Excel formats

### Requirement 3: Remove Excel Import Functionality

**User Story:** As a developer, I want Excel import functionality removed, so that the system only supports secure file formats.

#### Acceptance Criteria

1. THE Import_Export_Service SHALL remove parseExcelFile method
2. THE Import_Export_Service SHALL remove Excel file processing from importPlayers method
3. WHEN file upload interfaces are displayed, THE System SHALL not accept .xlsx or .xls files
4. THE System SHALL only support CSV format for player imports

### Requirement 4: Update User Interface

**User Story:** As a user, I want the interface to reflect that Excel support is no longer available, so that I understand the supported file formats.

#### Acceptance Criteria

1. WHEN file input elements are displayed, THE System SHALL only accept .csv files
2. WHEN export format options are shown, THE System SHALL only display CSV and PDF options
3. WHEN import format dropdowns are displayed, THE System SHALL only show CSV option
4. THE System SHALL update any help text or labels that reference Excel support

### Requirement 5: Update Tests

**User Story:** As a developer, I want all tests updated to reflect the removal of Excel functionality, so that the test suite passes without xlsx dependencies.

#### Acceptance Criteria

1. THE System SHALL remove all Excel-related test cases from ImportExportService tests
2. THE System SHALL remove all Excel-related test cases from ExportService tests
3. THE System SHALL update any integration tests that relied on Excel functionality
4. WHEN tests are run, THE System SHALL pass all tests without xlsx imports

### Requirement 6: Update Documentation

**User Story:** As a developer, I want documentation updated to reflect the removal of Excel support, so that the codebase documentation is accurate.

#### Acceptance Criteria

1. THE System SHALL update README.md to remove Excel export examples
2. THE System SHALL update any code comments that reference Excel functionality
3. THE System SHALL update any JSDoc comments that mention Excel formats
4. THE System SHALL ensure no references to .xlsx files remain in documentation