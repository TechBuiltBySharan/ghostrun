/**
 * Event Capture - Capture browser events during recording
 */

import type { RecordedAction, ActionType, ActionTarget, ElementSelector, ElementSnapshot } from '@ghostrun/core';

export interface EventCaptureConfig {
  captureClicks?: boolean;
  captureInputs?: boolean;
  captureNavigation?: boolean;
  captureConsole?: boolean;
  captureNetwork?: boolean;
  captureScreenshots?: boolean;
  minInterval?: number; // ms between captures
}

const DEFAULT_CONFIG: Required<EventCaptureConfig> = {
  captureClicks: true,
  captureInputs: true,
  captureNavigation: true,
  captureConsole: true,
  captureNetwork: true,
  captureScreenshots: true,
  minInterval: 100,
};

/**
 * Event handler interface
 */
export interface EventHandlers {
  onAction?: (action: RecordedAction) => void;
  onNavigation?: (url: string, title: string) => void;
  onConsole?: (type: string, message: string) => void;
  onNetwork?: (request: NetworkRequest) => void;
  onScreenshot?: (dataUrl: string) => void;
  onError?: (error: Error) => void;
}

/**
 * Network request data
 */
export interface NetworkRequest {
  id: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  body?: string;
  timestamp: number;
}

/**
 * Event capture state
 */
export interface EventCaptureState {
  isRecording: boolean;
  isPaused: boolean;
  actions: RecordedAction[];
  lastCaptureTime: number;
}

/**
 * Event capture class
 */
export class EventCapture {
  private config: Required<EventCaptureConfig>;
  private handlers: EventHandlers;
  private state: EventCaptureState;
  private boundHandlers: Record<string, EventListener>;

  constructor(config: EventCaptureConfig = {}, handlers: EventHandlers = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.handlers = handlers;
    this.state = {
      isRecording: false,
      isPaused: false,
      actions: [],
      lastCaptureTime: 0,
    };
    this.boundHandlers = {};
  }

  /**
   * Start recording
   */
  start(): void {
    if (this.state.isRecording) return;

    this.state.isRecording = true;
    this.state.isPaused = false;
    this.state.actions = [];
    this.state.lastCaptureTime = 0;

    this.attachListeners();
  }

  /**
   * Stop recording
   */
  stop(): RecordedAction[] {
    if (!this.state.isRecording) return [];

    this.state.isRecording = false;
    this.detachListeners();

    return [...this.state.actions];
  }

  /**
   * Pause recording
   */
  pause(): void {
    this.state.isPaused = true;
  }

  /**
   * Resume recording
   */
  resume(): void {
    this.state.isPaused = false;
  }

  /**
   * Get current state
   */
  getState(): EventCaptureState {
    return { ...this.state };
  }

  /**
   * Get all captured actions
   */
  getActions(): RecordedAction[] {
    return [...this.state.actions];
  }

  /**
   * Clear captured actions
   */
  clear(): void {
    this.state.actions = [];
  }

  /**
   * Attach event listeners
   */
  private attachListeners(): void {
    if (typeof document === 'undefined') return;

    // Click events
    if (this.config.captureClicks) {
      const clickHandler = this.handleClick.bind(this);
      this.boundHandlers.click = clickHandler;
      document.addEventListener('click', clickHandler, true);
      document.addEventListener('dblclick', clickHandler, true);
      document.addEventListener('contextmenu', clickHandler, true);
    }

    // Input events
    if (this.config.captureInputs) {
      const inputHandler = this.handleInput.bind(this);
      this.boundHandlers.input = inputHandler;
      document.addEventListener('input', inputHandler, true);
      document.addEventListener('change', inputHandler, true);
    }

    // Keyboard events
    const keyHandler = this.handleKeydown.bind(this);
    this.boundHandlers.keydown = keyHandler;
    document.addEventListener('keydown', keyHandler, true);

    // Navigation events
    if (this.config.captureNavigation) {
      const popstateHandler = this.handlePopstate.bind(this);
      const hashchangeHandler = this.handleHashchange.bind(this);
      this.boundHandlers.popstate = popstateHandler;
      this.boundHandlers.hashchange = hashchangeHandler;
      window.addEventListener('popstate', popstateHandler);
      window.addEventListener('hashchange', hashchangeHandler);
    }

    // Console events (requires injected script)
    if (this.config.captureConsole) {
      this.injectConsoleCapture();
    }

    // Network events (requires CDP)
    if (this.config.captureNetwork) {
      this.injectNetworkCapture();
    }
  }

  /**
   * Detach event listeners
   */
  private detachListeners(): void {
    if (typeof document === 'undefined') return;

    // Remove document listeners
    document.removeEventListener('click', this.boundHandlers.click);
    document.removeEventListener('dblclick', this.boundHandlers.click);
    document.removeEventListener('contextmenu', this.boundHandlers.click);
    document.removeEventListener('input', this.boundHandlers.input);
    document.removeEventListener('change', this.boundHandlers.input);
    document.removeEventListener('keydown', this.boundHandlers.keydown);

    // Remove window listeners
    window.removeEventListener('popstate', this.boundHandlers.popstate);
    window.removeEventListener('hashchange', this.boundHandlers.hashchange);

    // Clean up injected scripts
    this.cleanupInjectedScripts();
  }

  /**
   * Handle click event
   */
  private handleClick(event: MouseEvent): void {
    if (this.state.isPaused) return;
    if (!this.shouldCapture()) return;

    const target = event.target as HTMLElement;
    if (!target) return;

    const actionType = this.getClickActionType(event);
    const action = this.createAction(actionType, target, undefined, {
      x: event.clientX,
      y: event.clientY,
    });

    this.recordAction(action);
  }

  /**
   * Handle input event
   */
  private handleInput(event: Event): void {
    if (this.state.isPaused) return;
    if (!this.shouldCapture()) return;

    const target = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
    if (!target) return;

    let actionType: ActionType = 'type';
    let value: string | undefined;

    if (target instanceof HTMLSelectElement) {
      actionType = 'select';
      value = target.value;
    } else if (target.type === 'checkbox' || target.type === 'radio') {
      actionType = target.checked ? 'check' : 'uncheck';
    } else {
      value = target.value;
    }

    const action = this.createAction(actionType, target, value);

    this.recordAction(action);
  }

  /**
   * Handle keydown event
   */
  private handleKeydown(event: KeyboardEvent): void {
    if (this.state.isPaused) return;
    if (!this.shouldCapture()) return;

    // Only capture specific keys
    const specialKeys = ['Enter', 'Tab', 'Escape', 'ArrowDown', 'ArrowUp'];
    if (!specialKeys.includes(event.key)) return;

    const target = event.target as HTMLElement;
    if (!target) return;

    const action = this.createAction('press', target, event.key, undefined, [this.getKeyModifier(event)]);

    this.recordAction(action);
  }

  /**
   * Handle popstate event
   */
  private handlePopstate(): void {
    if (this.state.isPaused) return;
    if (!this.config.captureNavigation) return;

    setTimeout(() => {
      this.handlers.onNavigation?.(window.location.href, document.title);
    }, 100);
  }

  /**
   * Handle hashchange event
   */
  private handleHashchange(): void {
    if (this.state.isPaused) return;
    if (!this.config.captureNavigation) return;

    this.handlers.onNavigation?.(window.location.href, document.title);
  }

  /**
   * Create an action from target element
   */
  private createAction(
    type: ActionType,
    target: HTMLElement,
    value?: string,
    coordinates?: { x: number; y: number },
    modifiers?: string[]
  ): RecordedAction {
    const selector = this.generateSelector(target);
    const element = this.captureElementSnapshot(target);

    return {
      id: crypto.randomUUID(),
      type,
      timestamp: Date.now(),
      target: {
        selector,
        element,
        coordinates,
      },
      value,
      modifiers: modifiers as ActionType[],
    };
  }

  /**
   * Generate selector for element
   */
  private generateSelector(target: HTMLElement): ElementSelector {
    const strategies: Array<{ type: string; value: string; priority: number }> = [];

    // Test ID
    if (target.id) {
      strategies.push({ type: 'css', value: `#${CSS.escape(target.id)}`, priority: 1 });
    }

    // Role + accessible name
    const role = target.getAttribute('role');
    const ariaLabel = target.getAttribute('aria-label');
    if (role && ariaLabel) {
      strategies.push({ type: 'role', value: `[role="${role}"][aria-label="${ariaLabel}"]`, priority: 2 });
    }

    // Data test ID
    const testId = target.getAttribute('data-testid') || target.getAttribute('data-test-id');
    if (testId) {
      strategies.push({ type: 'testid', value: `[data-testid="${testId}"]`, priority: 1 });
    }

    // Text content (for buttons, links)
    const text = target.textContent?.trim();
    if (text && text.length < 50) {
      strategies.push({ type: 'text', value: text, priority: 3 });
    }

    // Label (for inputs)
    const label = target.getAttribute('placeholder') || target.getAttribute('aria-label');
    if (label) {
      strategies.push({ type: 'label', value: `[placeholder="${label}"]`, priority: 2 });
    }

    // CSS path
    const path = this.getCSSPath(target);
    if (path) {
      strategies.push({ type: 'css', value: path, priority: 5 });
    }

    return {
      strategies: strategies.map(s => ({ ...s, reliability: 1 - s.priority * 0.15 })),
      bestMatch: strategies.length > 0 ? 1 - strategies[0].priority * 0.15 : 0,
    };
  }

  /**
   * Get CSS path to element
   */
  private getCSSPath(element: HTMLElement): string {
    const path: string[] = [];
    let current: HTMLElement | null = element;

    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();

      if (current.id) {
        selector = `#${CSS.escape(current.id)}`;
        path.unshift(selector);
        break;
      }

      if (current.className && typeof current.className === 'string') {
        const classes = current.className.trim().split(/\s+/).slice(0, 2);
        if (classes.length > 0 && classes[0]) {
          selector += '.' + classes.slice(0, 2).map(c => CSS.escape(c)).join('.');
        }
      }

      // Add nth-child if needed
      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(c => c.tagName === current!.tagName);
        if (siblings.length > 1) {
          const index = siblings.indexOf(current) + 1;
          selector += `:nth-child(${index})`;
        }
      }

      path.unshift(selector);
      current = current.parentElement;
    }

    return path.join(' > ');
  }

  /**
   * Capture element snapshot
   */
  private captureElementSnapshot(element: HTMLElement): ElementSnapshot | undefined {
    const rect = element.getBoundingClientRect();
    const inputEl = element as HTMLInputElement;

    return {
      tag: element.tagName.toLowerCase(),
      id: element.id || undefined,
      classes: Array.from(element.classList),
      name: inputEl.name || undefined,
      type: inputEl.type || undefined,
      role: element.getAttribute('role') || undefined,
      label: element.getAttribute('aria-label') || undefined,
      placeholder: inputEl.placeholder || undefined,
      text: element.textContent?.trim(),
      innerHTML: element.innerHTML.slice(0, 200),
      attributes: Array.from(element.attributes).reduce((acc, attr) => {
        acc[attr.name] = attr.value;
        return acc;
      }, {} as Record<string, string>),
      rect: {
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
      },
      isVisible: rect.width > 0 && rect.height > 0 && getComputedStyle(element).display !== 'none',
      isEnabled: !element.hasAttribute('disabled'),
      isEditable: element.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName),
    };
  }

  /**
   * Check if should capture (rate limiting)
   */
  private shouldCapture(): boolean {
    const now = Date.now();
    if (now - this.state.lastCaptureTime < this.config.minInterval) {
      return false;
    }
    this.state.lastCaptureTime = now;
    return true;
  }

  /**
   * Record action
   */
  private recordAction(action: RecordedAction): void {
    this.state.actions.push(action);
    this.handlers.onAction?.(action);
  }

  /**
   * Get click action type
   */
  private getClickActionType(event: MouseEvent): ActionType {
    if (event.type === 'dblclick') return 'dblclick';
    if (event.type === 'contextmenu') return 'rightclick';
    return 'click';
  }

  /**
   * Get key modifier
   */
  private getKeyModifier(event: KeyboardEvent): string {
    if (event.ctrlKey || event.metaKey) return 'ControlOrMeta';
    if (event.shiftKey) return 'Shift';
    if (event.altKey) return 'Alt';
    if (event.metaKey) return 'Meta';
    return 'Control';
  }

  /**
   * Inject console capture script
   */
  private injectConsoleCapture(): void {
    // This would inject a script into the page
    // For now, we use the CDP approach in the executor
  }

  /**
   * Inject network capture script
   */
  private injectNetworkCapture(): void {
    // This would inject a script into the page
    // For now, we use the CDP approach in the executor
  }

  /**
   * Cleanup injected scripts
   */
  private cleanupInjectedScripts(): void {
    // Remove injected script elements if any
  }
}

// Re-export types
export type { ElementSnapshot } from '@ghostrun/core';
