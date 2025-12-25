/**
 * Property-Based Tests for Task 8: Optimize Schedule Display Rendering
 * 
 * Tests the schedule display consistency under load and rendering performance
 * characteristics for Task 8 requirements.
 * 
 * Requirements: 2.1, 2.2, 2.4, 2.5
 */

import * as fc from 'fast-check';
import { OptimizedScheduleRenderer } from './OptimizedScheduleRenderer';
import { Schedule } from '../models/Schedule';
import { Foursome } from '../models/Foursome';
import { Player } from '../models/Player';

// Mock DOM APIs
Object.defineProperty(window, 'innerWidth', {
  writable: true,
  configurable: true,
  value: 1024,
});

Object.defineProperty(window, 'ResizeObserver', {
  writable: true,
  configurable: true,
  value: class MockResizeObserver {
    observe() {}
    disconnect() {}
  },
});

Object.defineProperty(window, 'IntersectionObserver', {
  writable: true,
  configurable: true,
  value: class MockIntersectionObserver {
    observe() {}
    disconnect() {}
  },
});

Object.defineProperty(window, 'requestAnimationFrame', {
  writable: true,
  configurable: true,
  value: (callback: FrameRequestCallback) => setTimeout(callback, 1),
});

Object.defineProperty(window, 'cancelAnimationFrame', {
  writable: true,
  configurable: true,
  value: (id: number) => clearTimeout(id),
});

Object.defineProperty(window, 'performance', {
  writable: true,
  configurable: true,
  value: {
    now: () => Date.now(),
  },
});

describe('Task 8: Optimize Schedule Display Rendering - Property Tests', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (container.parentNode) {
      document.body.removeChild(container);
    }
  });

  describe('Property 8: Schedule display consistency under load', () => {
    test('Schedule display should maintain consistency with valid schedules', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            foursomeCount: fc.integer({ min: 1, max: 8 }),
            playersPerFoursome: fc.integer({ min: 2, max: 4 }),
            enableAnimations: fc.boolean()
          }),
          async (testData) => {
            const renderer = new OptimizedScheduleRenderer(
              { duration: 10, easing: 'ease-out', stagger: 1 }, // Very fast for testing
              {},
              { chunkSize: 4, renderDelay: 1, prioritizeVisible: true, enableVirtualization: false }
            );

            try {
              // Create test schedule with valid data
              const foursomes: Foursome[] = [];
              for (let i = 0; i < testData.foursomeCount; i++) {
                const players: Player[] = [];
                for (let j = 0; j < testData.playersPerFoursome; j++) {
                  players.push({
                    id: `player_${i}_${j}`,
                    firstName: `Player${j}`,
                    lastName: `Group${i}`,
                    handedness: j % 2 === 0 ? 'right' : 'left',
                    timePreference: ['AM', 'PM', 'Either'][j % 3] as 'AM' | 'PM' | 'Either'
                  } as Player);
                }
                foursomes.push({
                  id: `foursome_${i}`,
                  players
                } as Foursome);
              }

              const schedule: Schedule = {
                id: 'test_schedule',
                weekId: 'test_week',
                timeSlots: {
                  morning: foursomes.slice(0, Math.ceil(foursomes.length / 2)),
                  afternoon: foursomes.slice(Math.ceil(foursomes.length / 2))
                }
              } as Schedule;

              const startTime = performance.now();
              const metrics = await renderer.renderSchedule(schedule, container, {
                showAnimations: testData.enableAnimations
              });
              const renderTime = performance.now() - startTime;

              // Basic validation
              expect(metrics.renderTime).toBeGreaterThanOrEqual(0);
              expect(metrics.elementsRendered).toBeGreaterThanOrEqual(0);
              expect(renderTime).toBeLessThan(2000); // Should complete within 2 seconds

              // DOM structure validation
              const scheduleGrid = container.querySelector('.schedule-grid.optimized');
              expect(scheduleGrid).toBeTruthy();

              const timeSlots = container.querySelectorAll('.time-slot.optimized');
              expect(timeSlots.length).toBe(2); // Morning and afternoon

              const renderedFoursomes = container.querySelectorAll('.foursome.optimized');
              expect(renderedFoursomes.length).toBe(testData.foursomeCount);

              const renderedPlayers = container.querySelectorAll('.player-slot.filled.optimized');
              expect(renderedPlayers.length).toBe(testData.foursomeCount * testData.playersPerFoursome);

              renderer.destroy();
              return true;
            } catch (error) {
              renderer.destroy();
              throw error;
            }
          }
        ),
        { 
          numRuns: 10,
          timeout: 8000
        }
      );
    });
  });

  describe('Property 9: Rendering performance characteristics', () => {
    test('Rendering performance should scale reasonably with content size', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            smallFoursomes: fc.integer({ min: 1, max: 3 }),
            largeFoursomes: fc.integer({ min: 4, max: 8 }),
            playersPerFoursome: fc.constantFrom(2, 3, 4)
          }),
          async (testData) => {
            const renderer = new OptimizedScheduleRenderer(
              { duration: 5, easing: 'ease-out', stagger: 1 }
            );

            try {
              // Create small schedule
              const createSchedule = (foursomeCount: number): Schedule => {
                const foursomes: Foursome[] = [];
                for (let i = 0; i < foursomeCount; i++) {
                  const players: Player[] = [];
                  for (let j = 0; j < testData.playersPerFoursome; j++) {
                    players.push({
                      id: `player_${i}_${j}`,
                      firstName: `Player${j}`,
                      lastName: `Group${i}`,
                      handedness: 'right',
                      timePreference: 'AM'
                    } as Player);
                  }
                  foursomes.push({
                    id: `foursome_${i}`,
                    players
                  } as Foursome);
                }

                return {
                  id: `schedule_${foursomeCount}`,
                  weekId: 'test_week',
                  timeSlots: {
                    morning: foursomes.slice(0, Math.ceil(foursomes.length / 2)),
                    afternoon: foursomes.slice(Math.ceil(foursomes.length / 2))
                  }
                } as Schedule;
              };

              const smallSchedule = createSchedule(testData.smallFoursomes);
              const largeSchedule = createSchedule(testData.largeFoursomes);

              // Render small schedule
              container.innerHTML = '';
              const smallStart = performance.now();
              const smallMetrics = await renderer.renderSchedule(smallSchedule, container);
              const smallTime = performance.now() - smallStart;

              // Render large schedule
              container.innerHTML = '';
              const largeStart = performance.now();
              const largeMetrics = await renderer.renderSchedule(largeSchedule, container);
              const largeTime = performance.now() - largeStart;

              // Performance should scale reasonably
              expect(smallMetrics.renderTime).toBeGreaterThanOrEqual(0);
              expect(largeMetrics.renderTime).toBeGreaterThanOrEqual(0);
              expect(smallTime).toBeLessThan(1000);
              expect(largeTime).toBeLessThan(2000);

              // Larger schedule should have more elements
              expect(largeMetrics.elementsRendered).toBeGreaterThanOrEqual(smallMetrics.elementsRendered);

              renderer.destroy();
              return true;
            } catch (error) {
              renderer.destroy();
              throw error;
            }
          }
        ),
        { 
          numRuns: 8,
          timeout: 6000
        }
      );
    });
  });

  describe('Property 10: Responsive layout consistency', () => {
    test('Layout should be consistent across different viewport sizes', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            foursomeCount: fc.integer({ min: 2, max: 6 }),
            viewportWidth: fc.integer({ min: 320, max: 1920 })
          }),
          async (testData) => {
            // Mock viewport
            Object.defineProperty(window, 'innerWidth', { 
              value: testData.viewportWidth,
              configurable: true 
            });

            const renderer = new OptimizedScheduleRenderer();

            try {
              // Create test schedule
              const foursomes: Foursome[] = [];
              for (let i = 0; i < testData.foursomeCount; i++) {
                foursomes.push({
                  id: `foursome_${i}`,
                  players: [{
                    id: `player_${i}`,
                    firstName: 'Test',
                    lastName: 'Player',
                    handedness: 'right',
                    timePreference: 'AM'
                  } as Player]
                } as Foursome);
              }

              const schedule: Schedule = {
                id: 'test_schedule',
                weekId: 'test_week',
                timeSlots: {
                  morning: foursomes.slice(0, Math.ceil(foursomes.length / 2)),
                  afternoon: foursomes.slice(Math.ceil(foursomes.length / 2))
                }
              } as Schedule;

              await renderer.renderSchedule(schedule, container);

              // Validate basic structure
              const scheduleGrid = container.querySelector('.schedule-grid.optimized');
              expect(scheduleGrid).toBeTruthy();

              // Should have appropriate viewport class
              const hasMobile = scheduleGrid?.classList.contains('mobile');
              const hasTablet = scheduleGrid?.classList.contains('tablet');
              const hasDesktop = scheduleGrid?.classList.contains('desktop');
              expect(hasMobile || hasTablet || hasDesktop).toBe(true);

              // Should have foursomes rendered
              const renderedFoursomes = container.querySelectorAll('.foursome.optimized');
              expect(renderedFoursomes.length).toBe(testData.foursomeCount);

              renderer.destroy();
              return true;
            } catch (error) {
              renderer.destroy();
              throw error;
            }
          }
        ),
        { 
          numRuns: 8,
          timeout: 5000
        }
      );
    });
  });
});