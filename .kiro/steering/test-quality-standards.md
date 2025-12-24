# Test Quality Standards

## Zero Tolerance Policy for Failing Tests

**ABSOLUTE REQUIREMENT**: All tests must pass without exception. No task is complete until all tests pass.

## Universal Test Standards

### Core Principles

1. **All Tests Must Pass**: Every test in the codebase must pass before any task is considered complete
2. **No Acceptable Failures**: There are no circumstances where failing tests are acceptable
3. **Infrastructure Responsibility**: If tests fail due to missing services, those services must be started
4. **Comprehensive Validation**: All test types must be executed and verified

### Test Categories

All of the following test categories must pass:

#### Unit Tests
- **Command**: `npm test` or `jest`
- **Requirement**: 100% pass rate
- **Scope**: Individual functions, classes, and modules
- **Failure Action**: Fix code or test logic immediately

#### Integration Tests  
- **Command**: `npm test -- --testPathPattern="integration"`
- **Requirement**: 100% pass rate
- **Scope**: Component interactions and data flow
- **Failure Action**: Fix integration issues and data dependencies

#### Property-Based Tests
- **Command**: `npm test -- --testPathPattern="property"`
- **Requirement**: 100% pass rate or proper failure analysis
- **Scope**: Universal properties across input ranges
- **Failure Action**: Fix implementation or refine property definition

#### End-to-End Tests (Playwright)
- **Command**: `npx playwright test --reporter=line`
- **Requirement**: 100% pass rate with all infrastructure running
- **Scope**: Complete user workflows and system behavior
- **Failure Action**: Start required services and fix workflow issues

#### Type Checking
- **Command**: `npx tsc --noEmit`
- **Requirement**: Zero TypeScript errors
- **Scope**: Type safety across entire codebase
- **Failure Action**: Fix type errors, never suppress without justification

#### Linting (if configured)
- **Command**: `npm run lint`
- **Requirement**: Zero linting errors
- **Scope**: Code style and quality standards
- **Failure Action**: Fix code style issues

## Infrastructure Requirements

### For Playwright Tests

Before running Playwright tests, ensure:

1. **Development Server Running**: 
   ```bash
   npm run dev &
   # Wait for server to start (usually localhost:3000 or similar)
   ```

2. **Database Available**: Ensure database is running and accessible

3. **Environment Variables Set**: All required environment variables configured

4. **Clean Test State**: Tests start from predictable, clean state

### For Integration Tests

Before running integration tests, ensure:

1. **Test Database**: Separate test database or in-memory storage
2. **Mock Services**: External service mocks properly configured
3. **Test Data**: Required test data available and consistent

## Failure Resolution Protocol

### When Tests Fail

1. **STOP**: Do not proceed with other work until tests pass
2. **Identify**: Determine the root cause of test failures
3. **Categorize**: Is it a code bug, infrastructure issue, or test problem?
4. **Fix**: Address the underlying issue, not just symptoms
5. **Verify**: Re-run tests to confirm they now pass
6. **Document**: Note what was fixed for future reference

### Common Failure Scenarios

#### "Server Not Running" for Playwright Tests
- **Problem**: Playwright tests fail because development server isn't running
- **Solution**: Start the development server before running tests
- **Prevention**: Always check server status before test execution

#### "Database Connection" for Integration Tests
- **Problem**: Tests fail due to database connectivity issues
- **Solution**: Ensure test database is running and accessible
- **Prevention**: Include database startup in test preparation

#### "Timeout" Errors
- **Problem**: Tests fail due to timing issues
- **Solution**: Fix race conditions, increase timeouts only if necessary
- **Prevention**: Write deterministic tests with proper waiting

#### "Property Test Failures"
- **Problem**: Property-based tests find counterexamples
- **Solution**: Fix implementation bugs or refine property definitions
- **Prevention**: Write robust properties and handle edge cases

## Success Criteria

A task is only complete when:

- ✅ All unit tests pass (`npm test`)
- ✅ All integration tests pass
- ✅ All property-based tests pass or are properly addressed
- ✅ All Playwright tests pass with infrastructure running
- ✅ TypeScript compilation succeeds (`npx tsc --noEmit`)
- ✅ Linting passes (if configured)
- ✅ All required services are documented and accessible

## Enforcement

### For Developers

- Never commit code with failing tests
- Always run the full test suite before considering work complete
- Fix infrastructure issues that cause test failures
- Document any special setup requirements for tests

### For Code Review

- Failing tests block code review approval
- Infrastructure setup must be documented
- Test reliability improvements are always welcome
- New features must include comprehensive tests

### For CI/CD

- All tests must pass for deployment
- Infrastructure dependencies must be properly configured
- Test failures block the entire pipeline
- No exceptions or workarounds for failing tests

## Test Maintenance

### Regular Practices

1. **Keep Tests Updated**: Update tests when functionality changes
2. **Remove Obsolete Tests**: Delete tests for removed functionality
3. **Improve Test Reliability**: Fix flaky or unreliable tests immediately
4. **Document Dependencies**: Clearly document what services tests need
5. **Monitor Test Performance**: Keep test execution times reasonable

### Quality Metrics

- **Pass Rate**: Must be 100% for all test categories
- **Execution Time**: Tests should complete in reasonable time
- **Reliability**: Tests should pass consistently across environments
- **Coverage**: Tests should cover critical functionality comprehensively

This document establishes the non-negotiable standards for test quality in this workspace. All development work must adhere to these standards without exception.