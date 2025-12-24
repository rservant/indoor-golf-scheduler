# TypeScript Compliance Guidelines

## Zero TypeScript Errors Policy

All code in this workspace must maintain strict TypeScript compliance with zero compilation errors.

## Zero Failing Tests Policy

**CRITICAL**: All tests of any kind must pass without exception. Failing tests indicate broken functionality and are not acceptable.

### Universal Test Requirements

1. **All Tests Must Pass**: Unit tests, integration tests, property-based tests, and end-to-end tests must all pass
2. **No Exceptions**: There are no acceptable reasons for failing tests in a completed task
3. **Infrastructure Dependency**: Tests that require running services must have those services properly configured
4. **Comprehensive Coverage**: All test types must be executed and verified before task completion

### Test Categories That Must Pass

- **Unit Tests**: All Jest/Vitest unit tests must pass
- **Integration Tests**: All integration tests must pass
- **Property-Based Tests**: All property-based tests must pass or be properly addressed
- **End-to-End Tests**: All Playwright/Cypress tests must pass
- **Type Checking**: TypeScript compilation must succeed without errors
- **Linting**: All linting rules must pass

### Unacceptable Test States

- ❌ Any failing unit tests
- ❌ Any failing integration tests  
- ❌ Any failing property-based tests
- ❌ Any failing Playwright tests
- ❌ TypeScript compilation errors
- ❌ Linting errors that prevent clean builds

## TypeScript Requirements

1. **No TypeScript Errors**: All code must compile without TypeScript errors
2. **Type Safety**: Use proper TypeScript types for all variables, function parameters, and return values
3. **Strict Mode**: Follow TypeScript strict mode requirements
4. **Error Resolution**: Any TypeScript errors must be resolved before code completion

### Implementation Guidelines

#### Type Definitions
- Always provide explicit types for function parameters and return values
- Use proper interface definitions for complex objects
- Avoid `any` type unless absolutely necessary with proper justification
- Use union types and generics appropriately

#### Error Handling
- When TypeScript errors occur, fix the underlying type issues rather than suppressing them
- Use type assertions (`as Type`) only when you have verified the type safety
- Prefer type guards and proper type narrowing over type assertions

#### Code Quality
- Use `strict: true` in tsconfig.json
- Enable all recommended TypeScript compiler options
- Use ESLint with TypeScript rules for additional type safety

### Verification Process

Before completing any task:
1. **Run All Tests**: Execute the complete test suite and verify all tests pass
2. **Check TypeScript**: Run `npx tsc --noEmit` to check for TypeScript errors
3. **Verify Infrastructure**: Ensure all required services are running for tests
4. **Review Test Output**: Confirm no failures, errors, or warnings in test output
5. **Validate Functionality**: Ensure all features work as expected

### Test Execution Commands

```bash
# Run all unit and integration tests
npm test

# Run Playwright tests (ensure server is running first)
npx playwright test --reporter=line

# Check TypeScript compilation
npx tsc --noEmit

# Run linting (if configured)
npm run lint
```

### Failure Resolution Protocol

When any tests fail:

1. **Stop Development**: Do not proceed with other tasks until tests pass
2. **Identify Root Cause**: Determine why tests are failing
3. **Fix Issues**: Address bugs, missing dependencies, or configuration problems
4. **Verify Fix**: Re-run tests to confirm they now pass
5. **Document Changes**: Note what was fixed to prevent future issues

## TypeScript Implementation Guidelines

#### Proper Function Typing
```typescript
// Good
function processData(input: string[]): ProcessedData {
  // implementation
}

// Avoid
function processData(input: any): any {
  // implementation
}
```

#### Interface Usage
```typescript
// Good
interface PlayerData {
  id: string;
  name: string;
  availability: boolean[];
}

// Use the interface
function updatePlayer(player: PlayerData): void {
  // implementation
}
```

#### Error Handling with Types
```typescript
// Good
type Result<T> = { success: true; data: T } | { success: false; error: string };

function safeOperation(): Result<PlayerData> {
  // implementation
}
```

### Tools and Commands

- **Type Check**: `npx tsc --noEmit`
- **Build Check**: `npm run build`
- **Lint Check**: `npm run lint` (if configured)

### Enforcement

This directive applies to:
- All new code written
- All modifications to existing code
- All test files
- All configuration files that use TypeScript
- All test execution and validation

**No exceptions**: 
- TypeScript errors must be resolved, not ignored or suppressed without proper justification and type safety verification
- All tests must pass before any task is considered complete
- Infrastructure issues that cause test failures must be resolved, not ignored