# Playwright Testing Guidelines

## Command Line Output Configuration

When running Playwright tests, configure the reporter to output results to the command line for processing rather than serving HTML reports.

### Issue
By default, Playwright may serve HTML reports at URLs like `http://localhost:50443` which requires manual browser interaction and doesn't provide processable command line output.

### Solution
Use command line reporters that provide text output that can be processed programmatically:

```bash
# Use list reporter for detailed command line output
npx playwright test --reporter=list

# Use line reporter for concise output
npx playwright test --reporter=line

# Use dot reporter for minimal output
npx playwright test --reporter=dot

# Combine reporters (HTML for detailed review + line for CLI processing)
npx playwright test --reporter=line,html
```

### Configuration
Update `playwright.config.ts` to use appropriate reporters:

```typescript
export default defineConfig({
  // Use line reporter by default for CLI processing
  reporter: process.env.CI ? 'line' : [['line'], ['html']],
  // ... other config
});
```

### Best Practices
- Use `line` or `list` reporter when you need to process test results programmatically
- Reserve HTML reporter for detailed debugging and manual review
- In CI environments, always use text-based reporters
- When debugging test failures, combine multiple reporters for both CLI output and detailed HTML reports

### Example Usage
```bash
# Run specific test with line output
npx playwright test tests/e2e/getting-started-workflow.spec.ts --reporter=line

# Run all tests with detailed list output
npx playwright test --reporter=list

# Generate both CLI and HTML reports
npx playwright test --reporter=line,html
```

This ensures test results are available for command line processing while still maintaining the option for detailed HTML reports when needed.