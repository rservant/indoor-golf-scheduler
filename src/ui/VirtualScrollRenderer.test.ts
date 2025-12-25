/**
 * Unit tests for VirtualScrollRenderer
 * Tests basic functionality and integration
 * 
 * @jest-environment jsdom
 */

import { VirtualScrollRenderer, VirtualScrollItem, ItemRenderer } from './VirtualScrollRenderer';

describe('VirtualScrollRenderer', () => {
  let container: HTMLElement;
  let virtualScrollRenderer: VirtualScrollRenderer;

  beforeEach(() => {
    // Create DOM container
    container = document.createElement('div');
    container.style.height = '400px';
    container.style.width = '600px';
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (virtualScrollRenderer) {
      virtualScrollRenderer.destroy();
    }
    if (container.parentNode) {
      document.body.removeChild(container);
    }
  });

  it('should create virtual scroll structure', () => {
    const itemRenderer: ItemRenderer = ({ item, index }) => {
      const element = document.createElement('div');
      element.textContent = `Item ${index}: ${item.data.name}`;
      return element;
    };

    virtualScrollRenderer = new VirtualScrollRenderer(
      container,
      {
        itemHeight: 50,
        containerHeight: 300,
        overscan: 3
      },
      itemRenderer
    );

    // Check that scroll container was created
    const scrollContainer = container.querySelector('.virtual-scroll-container');
    expect(scrollContainer).toBeTruthy();
    expect((scrollContainer as HTMLElement)?.style.height).toBe('300px');

    // Check that content container was created
    const contentContainer = container.querySelector('.virtual-scroll-content');
    expect(contentContainer).toBeTruthy();
  });

  it('should render items correctly', () => {
    const items: VirtualScrollItem[] = [];
    for (let i = 0; i < 20; i++) {
      items.push({
        id: `item-${i}`,
        data: { name: `Test Item ${i}` }
      });
    }

    const itemRenderer: ItemRenderer = ({ item, index }) => {
      const element = document.createElement('div');
      element.className = 'test-item';
      element.textContent = `Item ${index}: ${item.data.name}`;
      return element;
    };

    virtualScrollRenderer = new VirtualScrollRenderer(
      container,
      {
        itemHeight: 50,
        containerHeight: 300,
        overscan: 2
      },
      itemRenderer
    );

    virtualScrollRenderer.setItems(items);

    // Check that content height is set correctly
    const contentContainer = container.querySelector('.virtual-scroll-content') as HTMLElement;
    expect(contentContainer.style.height).toBe('1000px'); // 20 items * 50px

    // Check that some items are rendered (visible + overscan)
    const renderedItems = container.querySelectorAll('.test-item');
    expect(renderedItems.length).toBeGreaterThan(0);
    expect(renderedItems.length).toBeLessThanOrEqual(15); // Should not render all items (visible + overscan)

    // Check that first item is positioned correctly
    const firstItem = renderedItems[0] as HTMLElement;
    expect(firstItem.style.position).toBe('absolute');
    expect(firstItem.style.top).toBe('0px');
    expect(firstItem.style.height).toBe('50px');
  });

  it('should update visible range on scroll', () => {
    const items: VirtualScrollItem[] = [];
    for (let i = 0; i < 50; i++) {
      items.push({
        id: `item-${i}`,
        data: { name: `Test Item ${i}` }
      });
    }

    const itemRenderer: ItemRenderer = ({ item, index }) => {
      const element = document.createElement('div');
      element.className = 'scroll-test-item';
      element.textContent = `Item ${index}`;
      return element;
    };

    virtualScrollRenderer = new VirtualScrollRenderer(
      container,
      {
        itemHeight: 50,
        containerHeight: 300,
        overscan: 2
      },
      itemRenderer
    );

    virtualScrollRenderer.setItems(items);

    // Get initial visible range
    const initialRange = virtualScrollRenderer.getVisibleRange();
    expect(initialRange.start).toBe(0);

    // Simulate scroll
    const scrollContainer = container.querySelector('.virtual-scroll-container') as HTMLElement;
    scrollContainer.scrollTop = 500; // Scroll down
    scrollContainer.dispatchEvent(new Event('scroll'));

    // Check that visible range updated
    const newRange = virtualScrollRenderer.getVisibleRange();
    expect(newRange.start).toBeGreaterThan(initialRange.start);
  });

  it('should provide performance metrics', () => {
    const items: VirtualScrollItem[] = [];
    for (let i = 0; i < 100; i++) {
      items.push({
        id: `item-${i}`,
        data: { name: `Test Item ${i}` }
      });
    }

    const itemRenderer: ItemRenderer = ({ item }) => {
      const element = document.createElement('div');
      element.textContent = item.data.name;
      return element;
    };

    virtualScrollRenderer = new VirtualScrollRenderer(
      container,
      {
        itemHeight: 50,
        containerHeight: 300,
        overscan: 2
      },
      itemRenderer
    );

    virtualScrollRenderer.setItems(items);

    const metrics = virtualScrollRenderer.getPerformanceMetrics();
    
    expect(metrics.totalItems).toBe(100);
    expect(metrics.renderedItems).toBeGreaterThan(0);
    expect(metrics.renderedItems).toBeLessThan(100); // Should not render all items
    expect(metrics.renderRatio).toBeGreaterThan(0);
    expect(metrics.renderRatio).toBeLessThan(1);
    expect(metrics.visibleRange).toBeDefined();
  });

  it('should scroll to specific item', () => {
    const items: VirtualScrollItem[] = [];
    for (let i = 0; i < 50; i++) {
      items.push({
        id: `item-${i}`,
        data: { name: `Test Item ${i}` }
      });
    }

    const itemRenderer: ItemRenderer = ({ item }) => {
      const element = document.createElement('div');
      element.textContent = item.data.name;
      return element;
    };

    virtualScrollRenderer = new VirtualScrollRenderer(
      container,
      {
        itemHeight: 50,
        containerHeight: 300,
        overscan: 2
      },
      itemRenderer
    );

    virtualScrollRenderer.setItems(items);

    // Scroll to item 20
    virtualScrollRenderer.scrollToItem(20);

    const scrollContainer = container.querySelector('.virtual-scroll-container') as HTMLElement;
    expect(scrollContainer.scrollTop).toBe(1000); // 20 * 50px

    // Test scroll to item by ID
    virtualScrollRenderer.scrollToItemById('item-10');
    expect(scrollContainer.scrollTop).toBe(500); // 10 * 50px
  });

  it('should handle configuration updates', () => {
    const items: VirtualScrollItem[] = [];
    for (let i = 0; i < 20; i++) {
      items.push({
        id: `item-${i}`,
        data: { name: `Test Item ${i}` }
      });
    }

    const itemRenderer: ItemRenderer = ({ item }) => {
      const element = document.createElement('div');
      element.textContent = item.data.name;
      return element;
    };

    virtualScrollRenderer = new VirtualScrollRenderer(
      container,
      {
        itemHeight: 50,
        containerHeight: 300,
        overscan: 2
      },
      itemRenderer
    );

    virtualScrollRenderer.setItems(items);

    // Update configuration
    virtualScrollRenderer.updateConfig({
      containerHeight: 400,
      itemHeight: 60
    });

    const scrollContainer = container.querySelector('.virtual-scroll-container') as HTMLElement;
    expect(scrollContainer.style.height).toBe('400px');

    const contentContainer = container.querySelector('.virtual-scroll-content') as HTMLElement;
    expect(contentContainer.style.height).toBe('1200px'); // 20 items * 60px
  });

  it('should clean up resources on destroy', () => {
    const items: VirtualScrollItem[] = [];
    for (let i = 0; i < 10; i++) {
      items.push({
        id: `item-${i}`,
        data: { name: `Test Item ${i}` }
      });
    }

    const itemRenderer: ItemRenderer = ({ item }) => {
      const element = document.createElement('div');
      element.textContent = item.data.name;
      return element;
    };

    virtualScrollRenderer = new VirtualScrollRenderer(
      container,
      {
        itemHeight: 50,
        containerHeight: 300,
        overscan: 2
      },
      itemRenderer
    );

    virtualScrollRenderer.setItems(items);

    // Verify elements exist
    expect(container.querySelector('.virtual-scroll-container')).toBeTruthy();

    // Destroy
    virtualScrollRenderer.destroy();

    // Verify cleanup
    expect(container.querySelector('.virtual-scroll-container')).toBeFalsy();
    expect(virtualScrollRenderer.getItemCount()).toBe(0);
  });
});