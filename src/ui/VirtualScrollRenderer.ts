/**
 * Virtual Scrolling Renderer for Large Lists
 * Optimizes DOM manipulation and rendering cycles for performance
 */

export interface VirtualScrollConfig {
  itemHeight: number;
  containerHeight: number;
  overscan: number;
  buffer?: number;
}

export interface VirtualScrollItem {
  id: string;
  data: any;
}

export interface VisibleRange {
  start: number;
  end: number;
}

export interface RenderContext {
  index: number;
  item: VirtualScrollItem;
  isVisible: boolean;
}

export type ItemRenderer<T = any> = (context: RenderContext & { item: VirtualScrollItem & { data: T } }) => HTMLElement;

export class VirtualScrollRenderer<T = any> {
  private config: VirtualScrollConfig;
  private container: HTMLElement;
  private scrollContainer!: HTMLElement;
  private contentContainer!: HTMLElement;
  private items: VirtualScrollItem[] = [];
  private visibleRange: VisibleRange = { start: 0, end: 0 };
  private renderedElements: Map<string, HTMLElement> = new Map();
  private itemRenderer: ItemRenderer<T>;
  private isInitialized = false;

  constructor(
    container: HTMLElement,
    config: VirtualScrollConfig,
    itemRenderer: ItemRenderer<T>
  ) {
    this.container = container;
    this.config = {
      ...config,
      buffer: config.buffer || 5
    };
    this.itemRenderer = itemRenderer;
    
    this.initialize();
  }

  /**
   * Initialize the virtual scroll container structure
   */
  private initialize(): void {
    if (this.isInitialized) return;

    // Create scroll container
    this.scrollContainer = document.createElement('div');
    this.scrollContainer.className = 'virtual-scroll-container';
    this.scrollContainer.style.cssText = `
      height: ${this.config.containerHeight}px;
      overflow-y: auto;
      position: relative;
    `;

    // Create content container
    this.contentContainer = document.createElement('div');
    this.contentContainer.className = 'virtual-scroll-content';
    this.contentContainer.style.cssText = `
      position: relative;
      width: 100%;
    `;

    this.scrollContainer.appendChild(this.contentContainer);
    this.container.appendChild(this.scrollContainer);

    // Add scroll event listener
    this.scrollContainer.addEventListener('scroll', this.handleScroll.bind(this));

    this.isInitialized = true;
  }

  /**
   * Set items to be rendered
   */
  setItems(items: VirtualScrollItem[]): void {
    this.items = items;
    this.updateContentHeight();
    this.updateVisibleRange();
    this.render();
  }

  /**
   * Update the total content height based on item count
   */
  private updateContentHeight(): void {
    const totalHeight = this.items.length * this.config.itemHeight;
    this.contentContainer.style.height = `${totalHeight}px`;
  }

  /**
   * Handle scroll events and update visible range
   */
  private handleScroll(): void {
    this.updateVisibleRange();
    this.render();
  }

  /**
   * Calculate which items should be visible based on scroll position
   */
  private updateVisibleRange(): void {
    const scrollTop = this.scrollContainer.scrollTop;
    const containerHeight = this.config.containerHeight;
    const itemHeight = this.config.itemHeight;
    const buffer = this.config.buffer || 0;

    // Calculate visible range with buffer
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - buffer);
    const endIndex = Math.min(
      this.items.length - 1,
      Math.ceil((scrollTop + containerHeight) / itemHeight) + buffer
    );

    this.visibleRange = { start: startIndex, end: endIndex };
  }

  /**
   * Render only the visible items
   */
  private render(): void {
    const { start, end } = this.visibleRange;
    const newRenderedElements = new Map<string, HTMLElement>();

    // Remove items that are no longer visible
    for (const [itemId, element] of this.renderedElements) {
      const itemIndex = this.items.findIndex(item => item.id === itemId);
      if (itemIndex < start || itemIndex > end) {
        if (element.parentNode) {
          element.parentNode.removeChild(element);
        }
      } else {
        newRenderedElements.set(itemId, element);
      }
    }

    // Render visible items
    for (let i = start; i <= end; i++) {
      const item = this.items[i];
      if (!item) continue;

      let element = this.renderedElements.get(item.id);
      
      if (!element) {
        // Create new element
        element = this.itemRenderer({
          index: i,
          item: item as VirtualScrollItem & { data: T },
          isVisible: true
        });
        
        // Position the element
        element.style.position = 'absolute';
        element.style.top = `${i * this.config.itemHeight}px`;
        element.style.width = '100%';
        element.style.height = `${this.config.itemHeight}px`;
        
        this.contentContainer.appendChild(element);
      } else {
        // Update position if needed
        const expectedTop = i * this.config.itemHeight;
        const currentTop = parseInt(element.style.top) || 0;
        if (currentTop !== expectedTop) {
          element.style.top = `${expectedTop}px`;
        }
      }

      newRenderedElements.set(item.id, element);
    }

    this.renderedElements = newRenderedElements;
  }

  /**
   * Scroll to a specific item by index
   */
  scrollToItem(index: number): void {
    if (index < 0 || index >= this.items.length) return;

    const targetScrollTop = index * this.config.itemHeight;
    this.scrollContainer.scrollTop = targetScrollTop;
  }

  /**
   * Scroll to a specific item by ID
   */
  scrollToItemById(itemId: string): void {
    const index = this.items.findIndex(item => item.id === itemId);
    if (index !== -1) {
      this.scrollToItem(index);
    }
  }

  /**
   * Get the current visible range
   */
  getVisibleRange(): VisibleRange {
    return { ...this.visibleRange };
  }

  /**
   * Get the total number of items
   */
  getItemCount(): number {
    return this.items.length;
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<VirtualScrollConfig>): void {
    this.config = { ...this.config, ...newConfig };
    
    if (newConfig.containerHeight) {
      this.scrollContainer.style.height = `${this.config.containerHeight}px`;
    }
    
    this.updateContentHeight();
    this.updateVisibleRange();
    this.render();
  }

  /**
   * Refresh the display (useful when item data changes)
   */
  refresh(): void {
    // Clear all rendered elements to force re-render
    this.renderedElements.clear();
    this.contentContainer.innerHTML = '';
    this.render();
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): {
    totalItems: number;
    renderedItems: number;
    visibleRange: VisibleRange;
    renderRatio: number;
  } {
    const totalItems = this.items.length;
    const renderedItems = this.renderedElements.size;
    const renderRatio = totalItems > 0 ? renderedItems / totalItems : 0;

    return {
      totalItems,
      renderedItems,
      visibleRange: this.getVisibleRange(),
      renderRatio
    };
  }

  /**
   * Destroy the virtual scroll renderer and clean up resources
   */
  destroy(): void {
    if (this.scrollContainer) {
      this.scrollContainer.removeEventListener('scroll', this.handleScroll.bind(this));
      if (this.scrollContainer.parentNode) {
        this.scrollContainer.parentNode.removeChild(this.scrollContainer);
      }
    }
    
    this.renderedElements.clear();
    this.items = [];
    this.isInitialized = false;
  }
}