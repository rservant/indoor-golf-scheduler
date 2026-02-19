/**
 * Web Worker Pool for CPU-intensive operations
 * 
 * Provides a pool of Web Workers for parallel processing of schedule generation
 * and other computationally intensive tasks.
 * 
 * Validates Requirements 1.1, 1.4, 1.5
 */

export interface WorkerTask<T = any, R = any> {
  id: string;
  type: string;
  data: T;
  resolve: (result: R) => void;
  reject: (error: Error) => void;
  startTime: number;
  timeout?: number;
}

export interface WorkerPoolOptions {
  maxWorkers?: number;
  workerScript?: string;
  taskTimeout?: number;
  enableLogging?: boolean;
}

export interface WorkerPoolStats {
  totalWorkers: number;
  activeWorkers: number;
  idleWorkers: number;
  queuedTasks: number;
  completedTasks: number;
  failedTasks: number;
  averageTaskTime: number;
}

export class WorkerPool {
  private workers: Worker[] = [];
  private availableWorkers: Worker[] = [];
  private busyWorkers: Set<Worker> = new Set();
  private taskQueue: WorkerTask[] = [];
  private activeTasks: Map<string, WorkerTask> = new Map();
  private options: Required<WorkerPoolOptions>;
  private stats: WorkerPoolStats;
  private isInitialized = false;

  constructor(options: WorkerPoolOptions = {}) {
    this.options = {
      maxWorkers: options.maxWorkers || Math.max(2, Math.min(navigator.hardwareConcurrency || 4, 8)),
      workerScript: options.workerScript || '/schedule-worker.js',
      taskTimeout: options.taskTimeout || 30000, // 30 seconds
      enableLogging: options.enableLogging || false
    };

    this.stats = {
      totalWorkers: 0,
      activeWorkers: 0,
      idleWorkers: 0,
      queuedTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      averageTaskTime: 0
    };
  }

  /**
   * Initialize the worker pool
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    // Check if Web Workers are supported
    if (typeof Worker === 'undefined') {
      throw new Error('Web Workers are not supported in this environment');
    }

    try {
      // Create workers
      for (let i = 0; i < this.options.maxWorkers; i++) {
        const worker = await this.createWorker();
        this.workers.push(worker);
        this.availableWorkers.push(worker);
      }

      this.stats.totalWorkers = this.workers.length;
      this.stats.idleWorkers = this.availableWorkers.length;
      this.isInitialized = true;

      if (this.options.enableLogging) {
        console.log(`[WorkerPool] Initialized with ${this.workers.length} workers`);
      }
    } catch (error) {
      throw new Error(`Failed to initialize worker pool: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create a single worker
   */
  private async createWorker(): Promise<Worker> {
    return new Promise((resolve, reject) => {
      try {
        const worker = new Worker(this.options.workerScript);
        
        // Set up worker message handling
        worker.onmessage = (event) => {
          this.handleWorkerMessage(worker, event);
        };

        worker.onerror = (error) => {
          this.handleWorkerError(worker, error);
        };

        // Test worker with a ping
        const testTaskId = `test-${Date.now()}`;
        const testTask: WorkerTask = {
          id: testTaskId,
          type: 'ping',
          data: {},
          resolve: () => resolve(worker),
          reject: (error) => reject(error),
          startTime: Date.now(),
          timeout: 5000
        };

        this.activeTasks.set(testTaskId, testTask);
        worker.postMessage({
          id: testTaskId,
          type: 'ping',
          data: {}
        });

        // Timeout for worker initialization
        setTimeout(() => {
          if (this.activeTasks.has(testTaskId)) {
            this.activeTasks.delete(testTaskId);
            reject(new Error('Worker initialization timeout'));
          }
        }, 5000);

      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Execute a task using the worker pool
   */
  async executeTask<T, R>(type: string, data: T, timeout?: number): Promise<R> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    return new Promise<R>((resolve, reject) => {
      const taskId = `task-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const task: WorkerTask<T, R> = {
        id: taskId,
        type,
        data,
        resolve,
        reject,
        startTime: Date.now(),
        timeout: timeout || this.options.taskTimeout
      };

      // Add to queue
      this.taskQueue.push(task);
      this.stats.queuedTasks = this.taskQueue.length;

      // Try to process immediately
      this.processQueue();

      // Set up timeout
      if (task.timeout) {
        setTimeout(() => {
          if (this.activeTasks.has(taskId)) {
            this.activeTasks.delete(taskId);
            this.stats.failedTasks++;
            task.reject(new Error(`Task ${taskId} timed out after ${task.timeout}ms`));
          }
        }, task.timeout);
      }
    });
  }

  /**
   * Process the task queue
   */
  private processQueue(): void {
    while (this.taskQueue.length > 0 && this.availableWorkers.length > 0) {
      const task = this.taskQueue.shift()!;
      const worker = this.availableWorkers.shift()!;

      // Move worker to busy set
      this.busyWorkers.add(worker);
      this.activeTasks.set(task.id, task);

      // Update stats
      this.stats.queuedTasks = this.taskQueue.length;
      this.stats.activeWorkers = this.busyWorkers.size;
      this.stats.idleWorkers = this.availableWorkers.length;

      // Send task to worker
      worker.postMessage({
        id: task.id,
        type: task.type,
        data: task.data
      });

      if (this.options.enableLogging) {
        console.log(`[WorkerPool] Assigned task ${task.id} to worker`);
      }
    }
  }

  /**
   * Handle worker message
   */
  private handleWorkerMessage(worker: Worker, event: MessageEvent): void {
    const { id, result, error } = event.data;
    const task = this.activeTasks.get(id);

    if (!task) {
      if (this.options.enableLogging) {
        console.warn(`[WorkerPool] Received message for unknown task ${id}`);
      }
      return;
    }

    // Remove task from active tasks
    this.activeTasks.delete(id);

    // Move worker back to available pool
    this.busyWorkers.delete(worker);
    this.availableWorkers.push(worker);

    // Update stats
    const taskTime = Date.now() - task.startTime;
    this.stats.activeWorkers = this.busyWorkers.size;
    this.stats.idleWorkers = this.availableWorkers.length;

    if (error) {
      this.stats.failedTasks++;
      task.reject(new Error(error));
    } else {
      this.stats.completedTasks++;
      this.updateAverageTaskTime(taskTime);
      task.resolve(result);
    }

    if (this.options.enableLogging) {
      console.log(`[WorkerPool] Task ${id} completed in ${taskTime}ms`);
    }

    // Process next task in queue
    this.processQueue();
  }

  /**
   * Handle worker error
   */
  private handleWorkerError(worker: Worker, error: ErrorEvent): void {
    if (this.options.enableLogging) {
      console.error(`[WorkerPool] Worker error:`, error);
    }

    // Find and reject any active tasks for this worker
    for (const [taskId, task] of this.activeTasks.entries()) {
      // We can't directly associate tasks with workers, so we'll reject all active tasks
      // In a production system, we'd maintain a worker-to-task mapping
      this.activeTasks.delete(taskId);
      this.stats.failedTasks++;
      task.reject(new Error(`Worker error: ${error.message}`));
    }

    // Remove worker from pools
    this.busyWorkers.delete(worker);
    const availableIndex = this.availableWorkers.indexOf(worker);
    if (availableIndex !== -1) {
      this.availableWorkers.splice(availableIndex, 1);
    }

    // Update stats
    this.stats.activeWorkers = this.busyWorkers.size;
    this.stats.idleWorkers = this.availableWorkers.length;

    // Try to create a replacement worker
    this.createWorker()
      .then(newWorker => {
        this.availableWorkers.push(newWorker);
        this.stats.idleWorkers = this.availableWorkers.length;
        this.processQueue();
      })
      .catch(err => {
        if (this.options.enableLogging) {
          console.error(`[WorkerPool] Failed to create replacement worker:`, err);
        }
      });
  }

  /**
   * Update average task time
   */
  private updateAverageTaskTime(taskTime: number): void {
    const totalTasks = this.stats.completedTasks;
    this.stats.averageTaskTime = 
      ((this.stats.averageTaskTime * (totalTasks - 1)) + taskTime) / totalTasks;
  }

  /**
   * Get worker pool statistics
   */
  getStats(): WorkerPoolStats {
    return { ...this.stats };
  }

  /**
   * Terminate all workers and clean up
   */
  async terminate(): Promise<void> {
    // Reject all pending tasks
    for (const [taskId, task] of this.activeTasks.entries()) {
      task.reject(new Error('Worker pool is terminating'));
    }
    this.activeTasks.clear();

    // Clear task queue
    for (const task of this.taskQueue) {
      task.reject(new Error('Worker pool is terminating'));
    }
    this.taskQueue.length = 0;

    // Terminate all workers
    for (const worker of this.workers) {
      worker.terminate();
    }

    // Reset state
    this.workers.length = 0;
    this.availableWorkers.length = 0;
    this.busyWorkers.clear();
    this.isInitialized = false;

    // Reset stats
    this.stats = {
      totalWorkers: 0,
      activeWorkers: 0,
      idleWorkers: 0,
      queuedTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      averageTaskTime: 0
    };

    if (this.options.enableLogging) {
      console.log(`[WorkerPool] Terminated`);
    }
  }

  /**
   * Check if the pool is ready to accept tasks
   */
  isReady(): boolean {
    return this.isInitialized && this.workers.length > 0;
  }

  /**
   * Get the number of available workers
   */
  getAvailableWorkerCount(): number {
    return this.availableWorkers.length;
  }

  /**
   * Get the total number of workers
   */
  getTotalWorkerCount(): number {
    return this.workers.length;
  }
}