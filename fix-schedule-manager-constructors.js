const fs = require('fs');
const path = require('path');

const filesToFix = [
  'src/dependency-injection.test.ts',
  'src/feature-parity.test.ts', 
  'src/integration-final-simple.test.ts',
  'src/integration.test.ts',
  'src/ui-component-service-access.test.ts'
];

filesToFix.forEach(filePath => {
  console.log(`Fixing ${filePath}...`);
  
  let content = fs.readFileSync(filePath, 'utf8');
  
  // Add import if not present
  if (!content.includes('LocalScheduleBackupService')) {
    // Find the import section and add the backup service import
    const importRegex = /import.*from.*ScheduleBackupService.*;\s*$/m;
    if (!importRegex.test(content)) {
      // Find a good place to add the import - after other service imports
      const scheduleManagerImportMatch = content.match(/import.*ScheduleManager.*from.*;\s*$/m);
      if (scheduleManagerImportMatch) {
        const insertIndex = scheduleManagerImportMatch.index + scheduleManagerImportMatch[0].length;
        const newImport = `\nimport { LocalScheduleBackupService } from './services/ScheduleBackupService';`;
        content = content.slice(0, insertIndex) + newImport + content.slice(insertIndex);
      }
    }
  }
  
  // Add backup service variable declaration
  if (!content.includes('backupService: LocalScheduleBackupService')) {
    // Find where other services are declared and add backup service
    const serviceDeclarationMatch = content.match(/let\s+scheduleManager:\s*ScheduleManager;/);
    if (serviceDeclarationMatch) {
      const insertIndex = serviceDeclarationMatch.index + serviceDeclarationMatch[0].length;
      const newDeclaration = `\n  let backupService: LocalScheduleBackupService;`;
      content = content.slice(0, insertIndex) + newDeclaration + content.slice(insertIndex);
    }
  }
  
  // Add backup service initialization
  if (!content.includes('backupService = new LocalScheduleBackupService()')) {
    // Find where services are initialized and add backup service
    const scheduleGeneratorMatch = content.match(/scheduleGenerator = new ScheduleGenerator\([^)]*\);/);
    if (scheduleGeneratorMatch) {
      const insertIndex = scheduleGeneratorMatch.index + scheduleGeneratorMatch[0].length;
      const newInit = `\n    backupService = new LocalScheduleBackupService();`;
      content = content.slice(0, insertIndex) + newInit + content.slice(insertIndex);
    }
  }
  
  // Fix ScheduleManager constructor calls - add backupService as 6th parameter
  content = content.replace(
    /new ScheduleManager\(\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^,]+),\s*([^)]+)\s*\)/g,
    'new ScheduleManager(\n      $1,\n      $2,\n      $3,\n      $4,\n      $5,\n      backupService\n    )'
  );
  
  fs.writeFileSync(filePath, content);
  console.log(`Fixed ${filePath}`);
});

console.log('All files fixed!');