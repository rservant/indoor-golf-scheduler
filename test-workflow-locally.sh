#!/bin/bash

echo "=== Testing CI/CD Pipeline Locally ==="

echo "1. Installing dependencies..."
npm ci

echo "2. Running Jest tests..."
npm test
JEST_EXIT_CODE=$?

echo "3. Building the project..."
npm run build
BUILD_EXIT_CODE=$?

echo "4. Starting development server in background..."
npm run dev &
DEV_SERVER_PID=$!

# Wait for server to start
echo "5. Waiting for server to start..."
sleep 5

echo "6. Installing Playwright browsers..."
npx playwright install --with-deps

echo "7. Running Playwright tests..."
npm run test:e2e
PLAYWRIGHT_EXIT_CODE=$?

echo "8. Stopping development server..."
kill $DEV_SERVER_PID

echo "9. Running type check (informational)..."
npm run type-check || echo "Type check failed but build succeeded"

echo "=== Results ==="
echo "Jest tests: $([ $JEST_EXIT_CODE -eq 0 ] && echo "PASSED" || echo "FAILED")"
echo "Build: $([ $BUILD_EXIT_CODE -eq 0 ] && echo "PASSED" || echo "FAILED")"
echo "Playwright tests: $([ $PLAYWRIGHT_EXIT_CODE -eq 0 ] && echo "PASSED" || echo "FAILED")"

if [ $JEST_EXIT_CODE -eq 0 ] && [ $BUILD_EXIT_CODE -eq 0 ] && [ $PLAYWRIGHT_EXIT_CODE -eq 0 ]; then
    echo "✅ All workflow steps passed!"
    exit 0
else
    echo "❌ Some workflow steps failed"
    exit 1
fi