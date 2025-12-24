# Playwright Testing Guidelines

## Zero Failing Tests Policy

**CRITICAL**: All Playwright tests must pass without exception. Failing tests are not acceptable under any circumstances.

### Absolute Requirements

1. **No Failing Tests**: All Playwright tests must pass completely before any task is considered complete
2. **Server Dependency**: Playwright tests that require a running server must have that server properly started and accessible
3. **Environment Setup**: All necessary services, databases, and dependencies must be running before executing Playwright tests
4. **Test Reliability**: Tests must be reliable and not fail due to timing issues, race conditions, or environmental factors

### Unacceptable Scenarios

- ❌ Accepting failed Playwright tests because "the server isn't running"
- ❌ Ignoring test failures due to missing dependencies
- ❌ Marking tasks complete when Playwright tests are failing
- ❌ Assuming test failures are "expected" or "acceptable"

### Required Actions for Test Failures

When Playwright tests fail, you MUST:

1. **Identify Root Cause**: Determine why the test is failing
2. **Fix Infrastructure**: Ensure all required services are running
3. **Fix Code Issues**: Address any bugs or implementation problems
4. **Verify Fix**: Re-run tests until they pass completely
5. **Document Resolution**: Note what was fixed to prevent future issues

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

## Test Execution Standards

### Pre-Test Requirements

Before running Playwright tests, ensure:

1. **Development Server**: Start the development server (`npm run dev` or equivalent)
2. **Database**: Ensure database is running and accessible
3. **Dependencies**: All required services and external dependencies are available
4. **Environment Variables**: All necessary environment variables are set
5. **Clean State**: Tests start from a clean, predictable state

### Test Execution Process

```bash
# 1. Start required services first
npm run dev &  # Start development server
# Wait for server to be ready

# 2. Run Playwright tests with proper reporter
npx playwright test --reporter=line

# 3. Verify all tests pass (exit code 0)
# If any tests fail, investigate and fix before proceeding
```

### Failure Resolution Protocol

When Playwright tests fail:

1. **Check Server Status**: Verify development server is running and accessible
2. **Review Test Output**: Examine detailed error messages and stack traces
3. **Check Dependencies**: Ensure all required services are running
4. **Debug Systematically**: Use Playwright's debugging tools if needed
5. **Fix Root Cause**: Address the underlying issue, not just symptoms
6. **Re-run Tests**: Verify fix by running tests again until they pass

### Success Criteria

A task is only complete when:
- ✅ All Playwright tests pass (exit code 0)
- ✅ No test failures or errors in output
- ✅ Tests run consistently and reliably
- ✅ All required infrastructure is properly configured