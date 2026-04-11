/**
 * DOM Tracker - Track DOM changes and state
 */

export interface DOMSnapshot {
  id: string;
  timestamp: number;
  url: string;
  title: string;
  elements: TrackedElement[];
  viewport: ViewportInfo;
}

export interface TrackedElement {
  selector: string;
  selectorType: 'css' | 'xpath' | 'text' | 'role' | 'testid';
  tag: string;
  text?: string;
  attributes: Record<string, string>;
  rect: DOMRect;
  isVisible: boolean;
  isInteractive: boolean;
}

export interface ViewportInfo {
  width: number;
  height: number;
  scrollX: number;
  scrollY: number;
}

export interface DOMRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Track DOM changes
 */
export class DOMTracker {
  private snapshots: DOMSnapshot[] = [];
  private isTracking = false;
  private observer: MutationObserver | null = null;
  private lastSnapshot: DOMSnapshot | null = null;

  /**
   * Start tracking
   */
  start(): void {
    if (this.isTracking) return;
    this.isTracking = true;
    this.snapshots = [];

    // Capture initial snapshot
    this.captureSnapshot();

    // Set up mutation observer
    if (typeof MutationObserver !== 'undefined') {
      this.observer = new MutationObserver((mutations) => {
        // Only capture if there are significant changes
        const hasSignificantChange = mutations.some(m => 
          m.type === 'childList' && m.addedNodes.length > 0 ||
          m.type === 'attributes'
        );
        
        if (hasSignificantChange) {
          this.captureSnapshot();
        }
      });

      this.observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style', 'disabled', 'value'],
      });
    }
  }

  /**
   * Stop tracking
   */
  stop(): DOMSnapshot[] {
    this.isTracking = false;
    
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }

    return [...this.snapshots];
  }

  /**
   * Capture current DOM state
   */
  captureSnapshot(): DOMSnapshot {
    const snapshot: DOMSnapshot = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      url: typeof window !== 'undefined' ? window.location.href : '',
      title: typeof document !== 'undefined' ? document.title : '',
      elements: this.captureElements(),
      viewport: this.captureViewport(),
    };

    this.snapshots.push(snapshot);
    this.lastSnapshot = snapshot;

    return snapshot;
  }

  /**
   * Capture interactive elements
   */
  private captureElements(): TrackedElement[] {
    if (typeof document === 'undefined') return [];

    const elements: TrackedElement[] = [];
    const seen = new Set<Element>();

    // Find all interactive elements
    const selectors = [
      'a[href]',
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[role="button"]',
      '[role="link"]',
      '[role="textbox"]',
      '[role="combobox"]',
      '[tabindex]:not([tabindex="-1"])',
    ];

    for (const selector of selectors) {
      try {
        const found = document.querySelectorAll(selector);
        for (const el of found) {
          if (seen.has(el)) continue;
          seen.add(el);

          const tracked = this.trackElement(el);
          if (tracked) {
            elements.push(tracked);
          }
        }
      } catch {
        // Invalid selector, skip
      }
    }

    return elements;
  }

  /**
   * Track a single element
   */
  private trackElement(el: Element): TrackedElement | null {
    const rect = el.getBoundingClientRect();
    
    // Skip invisible elements
    if (rect.width === 0 || rect.height === 0) return null;

    // Check visibility
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return null;

    return {
      selector: this.generateSelector(el),
      selectorType: this.getSelectorType(el),
      tag: el.tagName.toLowerCase(),
      text: el.textContent?.trim().slice(0, 100),
      attributes: this.getRelevantAttributes(el),
      rect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      },
      isVisible: rect.width > 0 && rect.height > 0,
      isInteractive: this.isInteractive(el),
    };
  }

  /**
   * Generate unique selector for element
   */
  private generateSelector(el: Element): string {
    // Try to build a unique selector
    if (el.id) {
      return `#${CSS.escape(el.id)}`;
    }

    const parts: string[] = [];
    let current: Element | null = el;

    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();

      if (current.id) {
        selector = `#${CSS.escape(current.id)}`;
        parts.unshift(selector);
        break;
      }

      // Add classes
      const classes = Array.from(current.classList)
        .filter(c => !c.includes(':') && !c.startsWith('.'))
        .slice(0, 2);
      
      if (classes.length > 0) {
        selector += '.' + classes.map(c => CSS.escape(c)).join('.');
      }

      // Add nth-child
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(c => c.tagName === current!.tagName);
        if (siblings.length > 1) {
          const index = siblings.indexOf(current as HTMLElement) + 1;
          selector += `:nth-of-type(${index})`;
        }
      }

      parts.unshift(selector);
      current = current.parentElement;
    }

    return parts.join(' > ');
  }

  /**
   * Get selector type based on element attributes
   */
  private getSelectorType(el: Element): TrackedElement['selectorType'] {
    if (el.id) return 'css';
    if (el.getAttribute('data-testid') || el.getAttribute('data-test-id')) return 'testid';
    if (el.getAttribute('role')) return 'role';
    if (el.textContent && el.textContent.trim().length < 50) return 'text';
    return 'css';
  }

  /**
   * Get relevant attributes for element
   */
  private getRelevantAttributes(el: Element): Record<string, string> {
    const attrs: Record<string, string> = {};
    const relevantAttrs = ['type', 'name', 'placeholder', 'value', 'href', 'src', 'alt', 'title', 'role', 'aria-label', 'data-testid'];

    for (const attr of relevantAttrs) {
      const value = el.getAttribute(attr);
      if (value) {
        attrs[attr] = value.slice(0, 100);
      }
    }

    return attrs;
  }

  /**
   * Check if element is interactive
   */
  private isInteractive(el: Element): boolean {
    const tag = el.tagName.toLowerCase();
    const elWithAttrs = el as HTMLElement;
    
    if (['a', 'button', 'input', 'select', 'textarea'].includes(tag)) {
      return !el.hasAttribute('disabled');
    }

    if (el.getAttribute('role') === 'button' || el.getAttribute('role') === 'link') {
      return true;
    }

    if (elWithAttrs.tabIndex !== null && elWithAttrs.tabIndex >= 0) {
      return true;
    }

    return false;
  }

  /**
   * Capture viewport info
   */
  private captureViewport(): ViewportInfo {
    return {
      width: typeof window !== 'undefined' ? window.innerWidth : 0,
      height: typeof window !== 'undefined' ? window.innerHeight : 0,
      scrollX: typeof window !== 'undefined' ? window.scrollX : 0,
      scrollY: typeof window !== 'undefined' ? window.scrollY : 0,
    };
  }

  /**
   * Get all snapshots
   */
  getSnapshots(): DOMSnapshot[] {
    return [...this.snapshots];
  }

  /**
   * Get last snapshot
   */
  getLastSnapshot(): DOMSnapshot | null {
    return this.lastSnapshot;
  }

  /**
   * Find element by selector in last snapshot
   */
  findElementInLastSnapshot(selector: string, type: TrackedElement['selectorType'] = 'css'): TrackedElement | null {
    if (!this.lastSnapshot) return null;
    
    return this.lastSnapshot.elements.find(el => {
      if (el.selectorType !== type) return false;
      
      switch (type) {
        case 'css':
          return el.selector === selector || el.selector.includes(selector);
        case 'text':
          return el.text?.includes(selector);
        case 'role':
          return el.attributes['role'] === selector;
        case 'testid':
          return el.attributes['data-testid'] === selector;
        default:
          return el.selector === selector;
      }
    }) || null;
  }

  /**
   * Compare two snapshots
   */
  diffSnapshots(before: DOMSnapshot, after: DOMSnapshot): {
    added: TrackedElement[];
    removed: TrackedElement[];
    changed: Array<{ before: TrackedElement; after: TrackedElement }>;
  } {
    const added: TrackedElement[] = [];
    const removed: TrackedElement[] = [];
    const changed: Array<{ before: TrackedElement; after: TrackedElement }> = [];

    const beforeMap = new Map(before.elements.map(e => [e.selector, e]));
    const afterMap = new Map(after.elements.map(e => [e.selector, e]));

    // Find added elements
    for (const [selector, el] of afterMap) {
      if (!beforeMap.has(selector)) {
        added.push(el);
      }
    }

    // Find removed elements
    for (const [selector, el] of beforeMap) {
      if (!afterMap.has(selector)) {
        removed.push(el);
      }
    }

    // Find changed elements
    for (const [selector, beforeEl] of beforeMap) {
      const afterEl = afterMap.get(selector);
      if (afterEl && this.hasChanged(beforeEl, afterEl)) {
        changed.push({ before: beforeEl, after: afterEl });
      }
    }

    return { added, removed, changed };
  }

  /**
   * Check if element has changed
   */
  private hasChanged(a: TrackedElement, b: TrackedElement): boolean {
    return (
      a.text !== b.text ||
      a.rect.x !== b.rect.x ||
      a.rect.y !== b.rect.y ||
      a.isVisible !== b.isVisible ||
      a.isInteractive !== b.isInteractive ||
      JSON.stringify(a.attributes) !== JSON.stringify(b.attributes)
    );
  }
}
