import { CircuitBreakerState, RequestProcessingOptions, RetryConfig, ValidationResult } from './ScheduleManager';

/**
 * Handles request processing infrastructure: circuit breaker, timeouts, retries, and cleanup.
 * Extracted from ScheduleManager to separate cross-cutting concerns from domain logic.
 */
export class RequestProcessingService {
    private circuitBreakerStates: Map<string, CircuitBreakerState> = new Map();
    private readonly circuitBreakerConfig = {
        failureThreshold: 5,
        recoveryTimeMs: 30000,
        halfOpenMaxAttempts: 3
    };
    private cleanupTimer: ReturnType<typeof setInterval> | null = null;
    private regenerationStatuses: Map<string, any>;

    constructor(regenerationStatuses: Map<string, any>) {
        this.regenerationStatuses = regenerationStatuses;
    }

    /**
     * Comprehensive request processing with timeout, retry logic, and circuit breaker
     */
    async processRequest<T>(
        requestType: string,
        weekId: string,
        operation: () => Promise<T>,
        options: RequestProcessingOptions = {},
        validatePreconditionsFn?: (weekId: string) => Promise<{ isValid: boolean; checks: Array<{ passed: boolean; message: string }> }>
    ): Promise<T> {
        const startTime = Date.now();
        const {
            timeout = 30000,
            retryAttempts = 3,
            retryDelayMs = 1000,
            validatePreconditions = true,
            enableCircuitBreaker = true
        } = options;

        if (!requestType || requestType.trim().length === 0) {
            throw new Error('Request type is required and cannot be empty');
        }

        if (!weekId || weekId.trim().length === 0) {
            throw new Error('Week ID is required and cannot be empty');
        }

        if (typeof operation !== 'function') {
            throw new Error('Operation must be a function');
        }

        // Circuit breaker check
        if (enableCircuitBreaker) {
            const circuitBreakerKey = `${requestType}-${weekId}`;
            const canProceed = this.checkCircuitBreaker(circuitBreakerKey);
            if (!canProceed) {
                throw new Error(`Circuit breaker is open for ${requestType} on week ${weekId}. Service temporarily unavailable.`);
            }
        }

        // Precondition validation
        if (validatePreconditions && validatePreconditionsFn) {
            try {
                const preconditionCheck = await validatePreconditionsFn(weekId);
                if (!preconditionCheck.isValid) {
                    const errors = preconditionCheck.checks.filter(c => !c.passed).map(c => c.message);
                    const error = `Precondition validation failed: ${errors.join(', ')}`;
                    this.recordCircuitBreakerFailure(`${requestType}-${weekId}`, error);
                    throw new Error(error);
                }
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown precondition validation error';
                this.recordCircuitBreakerFailure(`${requestType}-${weekId}`, errorMessage);
                throw new Error(`Precondition validation error: ${errorMessage}`);
            }
        }

        let lastError: Error | null = null;
        let attempts = 0;

        while (attempts < retryAttempts) {
            attempts++;

            try {
                const timeoutPromise = new Promise<never>((_, reject) => {
                    setTimeout(() => {
                        reject(new Error(`Request timeout after ${timeout}ms for ${requestType} on week ${weekId}`));
                    }, timeout);
                });

                const result = await Promise.race([
                    operation(),
                    timeoutPromise
                ]);

                if (enableCircuitBreaker) {
                    this.recordCircuitBreakerSuccess(`${requestType}-${weekId}`);
                }

                const duration = Date.now() - startTime;
                console.log(`[RequestProcessing] Request ${requestType} completed successfully for week ${weekId} in ${duration}ms (attempt ${attempts})`);

                return result;

            } catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                const duration = Date.now() - startTime;

                console.warn(`[RequestProcessing] Request ${requestType} failed for week ${weekId} (attempt ${attempts}/${retryAttempts}) after ${duration}ms:`, lastError.message);

                if (enableCircuitBreaker) {
                    this.recordCircuitBreakerFailure(`${requestType}-${weekId}`, lastError.message);
                }

                if (attempts >= retryAttempts) break;

                if (!this.isRetryableRequestError(lastError)) {
                    console.log(`[RequestProcessing] Non-retryable error for ${requestType} on week ${weekId}, aborting retries`);
                    break;
                }

                const delay = Math.min(retryDelayMs * Math.pow(2, attempts - 1), 8000);
                console.log(`[RequestProcessing] Retrying ${requestType} for week ${weekId} in ${delay}ms`);

                await this.delay(delay);
            }
        }

        const totalDuration = Date.now() - startTime;
        throw new Error(
            `Request ${requestType} failed for week ${weekId} after ${attempts} attempts in ${totalDuration}ms. Last error: ${lastError?.message || 'Unknown error'}`
        );
    }

    /**
     * Check if an error is retryable for request processing
     */
    isRetryableRequestError(error: Error): boolean {
        const message = error.message.toLowerCase();

        if (message.includes('already exists') ||
            message.includes('not found') ||
            message.includes('invalid') ||
            message.includes('insufficient players') ||
            message.includes('validation failed') ||
            message.includes('precondition') ||
            message.includes('circuit breaker')) {
            return false;
        }

        if (message.includes('timeout') ||
            message.includes('temporary') ||
            message.includes('connection') ||
            message.includes('network') ||
            message.includes('storage')) {
            return true;
        }

        return true;
    }

    /**
     * Circuit breaker check
     */
    checkCircuitBreaker(key: string): boolean {
        const state = this.circuitBreakerStates.get(key);

        if (!state) {
            this.circuitBreakerStates.set(key, {
                failures: 0,
                lastFailureTime: null,
                state: 'closed',
                nextAttemptTime: null
            });
            return true;
        }

        const now = new Date();

        switch (state.state) {
            case 'closed':
                return true;

            case 'open':
                if (state.nextAttemptTime && now >= state.nextAttemptTime) {
                    state.state = 'half-open';
                    state.failures = 0;
                    console.log(`[RequestProcessing] Circuit breaker ${key} moved to half-open state`);
                    return true;
                }
                return false;

            case 'half-open':
                return state.failures < this.circuitBreakerConfig.halfOpenMaxAttempts;

            default:
                return true;
        }
    }

    /**
     * Record a circuit breaker failure
     */
    recordCircuitBreakerFailure(key: string, _error: string): void {
        let state = this.circuitBreakerStates.get(key);

        if (!state) {
            state = {
                failures: 0,
                lastFailureTime: null,
                state: 'closed',
                nextAttemptTime: null
            };
            this.circuitBreakerStates.set(key, state);
        }

        state.failures++;
        state.lastFailureTime = new Date();

        if (state.state === 'closed' && state.failures >= this.circuitBreakerConfig.failureThreshold) {
            state.state = 'open';
            state.nextAttemptTime = new Date(Date.now() + this.circuitBreakerConfig.recoveryTimeMs);
            console.warn(`[RequestProcessing] Circuit breaker ${key} tripped after ${state.failures} failures. Next attempt at ${state.nextAttemptTime}`);
        } else if (state.state === 'half-open') {
            state.state = 'open';
            state.nextAttemptTime = new Date(Date.now() + this.circuitBreakerConfig.recoveryTimeMs);
            console.warn(`[RequestProcessing] Circuit breaker ${key} failed in half-open state, returning to open`);
        }
    }

    /**
     * Record a circuit breaker success
     */
    recordCircuitBreakerSuccess(key: string): void {
        const state = this.circuitBreakerStates.get(key);

        if (!state) return;

        if (state.state === 'half-open') {
            state.state = 'closed';
            state.failures = 0;
            state.lastFailureTime = null;
            state.nextAttemptTime = null;
            console.log(`[RequestProcessing] Circuit breaker ${key} closed after successful recovery`);
        } else if (state.state === 'closed') {
            state.failures = Math.max(0, state.failures - 1);
        }
    }

    /**
     * Get circuit breaker status for monitoring
     */
    getCircuitBreakerStatus(requestType?: string, weekId?: string): Map<string, CircuitBreakerState> | CircuitBreakerState | null {
        if (requestType && weekId) {
            const key = `${requestType}-${weekId}`;
            return this.circuitBreakerStates.get(key) || null;
        }

        return new Map(this.circuitBreakerStates);
    }

    /**
     * Reset circuit breaker state
     */
    resetCircuitBreaker(key?: string): void {
        if (key) {
            this.circuitBreakerStates.delete(key);
            console.log(`[RequestProcessing] Circuit breaker ${key} reset`);
        } else {
            this.circuitBreakerStates.clear();
            console.log(`[RequestProcessing] All circuit breakers reset`);
        }
    }

    /**
     * Start periodic cleanup of expired operations and locks
     */
    startPeriodicCleanup(): void {
        const CLEANUP_INTERVAL_MS = 2 * 60 * 1000;

        this.cleanupTimer = setInterval(async () => {
            try {
                await this.cleanupExpiredOperations();
            } catch (error) {
                console.error('Periodic cleanup failed:', error);
            }
        }, CLEANUP_INTERVAL_MS);
    }

    /**
     * Clean up expired operations and circuit breaker states
     */
    async cleanupExpiredOperations(): Promise<void> {
        const now = new Date();
        const expiredKeys: string[] = [];

        for (const [key, state] of this.circuitBreakerStates.entries()) {
            if (state.lastFailureTime &&
                (now.getTime() - state.lastFailureTime.getTime()) > (24 * 60 * 60 * 1000)) {
                expiredKeys.push(key);
            }
        }

        expiredKeys.forEach(key => {
            this.circuitBreakerStates.delete(key);
        });

        if (expiredKeys.length > 0) {
            console.log(`[RequestProcessing] Cleaned up ${expiredKeys.length} expired circuit breaker states`);
        }

        // Clean up expired regeneration statuses
        const expiredStatusKeys: string[] = [];
        for (const [weekId, status] of this.regenerationStatuses.entries()) {
            if (status.completedAt &&
                (now.getTime() - status.completedAt.getTime()) > (2 * 60 * 60 * 1000)) {
                expiredStatusKeys.push(weekId);
            }
        }

        expiredStatusKeys.forEach(weekId => {
            this.regenerationStatuses.delete(weekId);
        });

        if (expiredStatusKeys.length > 0) {
            console.log(`[RequestProcessing] Cleaned up ${expiredStatusKeys.length} expired regeneration statuses`);
        }
    }

    /**
     * Stop periodic cleanup
     */
    stopPeriodicCleanup(): void {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
    }

    /**
     * Utility method for delays
     */
    delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
