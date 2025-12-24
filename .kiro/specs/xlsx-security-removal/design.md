# Design Document: xlsx Security Removal

## Overview

This design outlines the systematic removal of the vulnerable xlsx package (SheetJS) from the indoor golf scheduler application. The removal addresses the prototype pollution security vulnerability (CVE-2023-30533) by eliminating Excel import/export functionality and ensuring the application only supports secure file formats (CSV and PDF).

## Architecture

The removal affects multiple layers of the application:

### Service Layer Changes
- **ExportService**: Remove Excel export methods, maintain CSV and PDF export
- **ImportExportService**: Remove Excel import/template methods, maintain CSV functionality
- **File Processing**: Eliminate xlsx-based file parsing, retain Papa Parse for CSV

### UI Layer Changes
- **ImportExportUI**: Update file input acceptance and format options
- **Export Controls**: Remove Excel format options from dropdowns
- **User Feedback**: Update labels and help text to reflect CSV-only import support

### Configuration Changes
- **Package Management**: Remove xlsx from dependencies and lock file
- **Build Configuration**: Remove xlsx from Vite vendor chunks and optimization
- **Type Definitions**: Remove xlsx type imports

## Components and Interfaces

### Modified Services

#### ExportService
```typescript
class ExportService {
  // REMOVED: exportToExcel(data, options, weekId): ExportResult
  // REMOVED: exportPlayersToExcel(players): Buffer
  
  // RETAINED: exportToPDF(data, options, weekId): ExportResult
  // RETAINED: exportToCSV(data, options, weekId): ExportResult
}
```

#### ImportExportService
```typescript
class ImportExportService {
  // REMOVED: parseExcelFile(excelData): PlayerImportData[]
  // REMOVED: Excel template generation in generateImportTemplate()
  
  // MODIFIED: importPlayers() - remove Excel format support
  // RETAINED: CSV parsing functionality
}
```

### Updated UI Components

#### File Input Elements
```typescript
// BEFORE: accept=".csv,.xlsx,.xls"
// AFTER:  accept=".csv"

// BEFORE: <option value="excel">Excel</option>
// AFTER:  Option removed from format dropdowns
```

### Configuration Updates

#### Package.json
```json
{
  "devDependencies": {
    // REMOVED: "xlsx": "^0.18.5"
    // RETAINED: All other dependencies
  }
}
```

#### Vite Configuration
```typescript
// REMOVED from manualChunks.vendor: 'xlsx'
// REMOVED from optimizeDeps.include: 'xlsx'
```

## Data Models

No changes to core data models are required. The removal only affects:
- File format support (Excel → CSV only)
- Export/import method signatures
- UI form validation rules

## Error Handling

### File Upload Validation
- **Before**: Accept .csv, .xlsx, .xls files
- **After**: Accept only .csv files, reject Excel files with clear error message

### Export Format Validation
- **Before**: Support CSV, PDF, Excel formats
- **After**: Support only CSV and PDF formats

### Import Error Messages
- Update error messages to guide users toward CSV format
- Remove references to Excel file troubleshooting

## Testing Strategy

### Unit Testing Approach
- **Remove**: All Excel-specific test cases in ExportService.test.ts
- **Remove**: All Excel-specific test cases in ImportExportService.test.ts
- **Update**: File validation tests to expect CSV-only acceptance
- **Retain**: All CSV and PDF functionality tests

### Property-Based Testing
Property-based tests will focus on the remaining file format functionality:
- CSV parsing correctness
- PDF export integrity
- File validation behavior

### Integration Testing
- **Update**: End-to-end tests that previously used Excel files
- **Verify**: Complete removal of xlsx dependencies
- **Test**: Error handling for unsupported file formats

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: No xlsx imports in codebase
*For any* source code file in the project, that file should not contain any import statements referencing the xlsx package
**Validates: Requirements 1.4**

### Property 2: File inputs only accept CSV format
*For any* file input element in the user interface, that element should only accept .csv files and reject .xlsx or .xls files
**Validates: Requirements 3.3, 4.1**

### Property 3: Format options exclude Excel
*For any* format selection interface (export or import), the available options should only include CSV and PDF formats and should not include any Excel-related formats
**Validates: Requirements 2.4, 4.2, 4.3**

### Property 4: CSV-only import support
*For any* player import operation, the system should only accept CSV format and reject Excel formats
**Validates: Requirements 3.4**

### Property 5: Tests pass without xlsx dependencies
*For any* test execution, all tests should pass successfully and no test file should import or reference the xlsx package
**Validates: Requirements 5.4**

### Property 6: Documentation contains no Excel references
*For any* documentation file or code comment, there should be no references to Excel functionality, .xlsx files, or Excel-related features
**Validates: Requirements 6.2, 6.3, 6.4**