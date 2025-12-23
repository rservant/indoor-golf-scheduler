# TypeScript Compliance Guidelines

## Zero TypeScript Errors Policy

All code in this workspace must maintain strict TypeScript compliance with zero compilation errors.

### Requirements

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
1. Run `npx tsc --noEmit` to check for TypeScript errors
2. Ensure all imports and exports are properly typed
3. Verify that all function signatures match their implementations
4. Check that all object properties are correctly typed

### Common Patterns

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

**No exceptions**: TypeScript errors must be resolved, not ignored or suppressed without proper justification and type safety verification.