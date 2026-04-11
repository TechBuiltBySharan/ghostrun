import { z } from 'zod';

/**
 * Types of actions that can be recorded and replayed
 */
export type ActionType =
  | 'click'
  | 'dblclick'
  | 'rightclick'
  | 'type'
  | 'fill'
  | 'select'
  | 'check'
  | 'uncheck'
  | 'hover'
  | 'press'
  | 'scroll'
  | 'screenshot'
  | 'wait'
  | 'navigate'
  | 'goback'
  | 'goforward'
  | 'refresh'
  | 'drag'
  | 'upload';

/**
 * Represents a single user action captured during recording
 */
export interface RecordedAction {
  id: string;
  type: ActionType;
  timestamp: number;
  target: ActionTarget;
  value?: string;
  modifiers?: KeyModifier[];
  duration?: number; // For long-duration actions
  success?: boolean;
}

/**
 * Keyboard modifiers
 */
export type KeyModifier = 'Control' | 'Shift' | 'Alt' | 'Meta' | 'ControlOrMeta';

/**
 * Target element information
 */
export interface ActionTarget {
  selector: ElementSelector;
  element?: ElementSnapshot;
  coordinates?: {
    x: number;
    y: number;
    offsetX?: number;
    offsetY?: number;
  };
}

/**
 * Selector types for element targeting
 */
export type SelectorType = 'css' | 'xpath' | 'text' | 'role' | 'testid' | 'label' | 'placeholder';

/**
 * Element selector with multiple strategies
 */
export interface ElementSelector {
  strategies: SelectorStrategy[];
  bestMatch: number; // 0-1 confidence score
  originalEvent?: string;
}

/**
 * Individual selector strategy
 */
export interface SelectorStrategy {
  type: SelectorType;
  value: string;
  priority: number;
  reliability?: number;
}

/**
 * Snapshot of element at time of capture
 */
export interface ElementSnapshot {
  tag: string;
  id?: string;
  classes?: string[];
  name?: string;
  type?: string;
  role?: string;
  label?: string;
  placeholder?: string;
  text?: string;
  innerHTML?: string;
  attributes: Record<string, string>;
  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  isVisible: boolean;
  isEnabled: boolean;
  isEditable: boolean;
}

/**
 * Route change information
 */
export interface RouteChange {
  id: string;
  timestamp: number;
  from: string;
  to: string;
  method: 'pushState' | 'replaceState' | 'popstate' | 'hashchange' | 'load';
  state?: Record<string, unknown>;
  title?: string;
}

/**
 * Navigation event
 */
export interface NavigationEvent {
  id: string;
  timestamp: number;
  type: 'before navigate' | 'commit' | 'domcontentloaded' | 'load' | 'networkidle';
  url: string;
  referrer?: string;
 Initiator?: 'click' | 'address bar' | 'form submit' | 'script' | 'reload';
}

/**
 * Zod schema for RecordedAction
 */
export const RecordedActionSchema = z.object({
  id: z.string(),
  type: z.enum([
    'click', 'dblclick', 'rightclick', 'type', 'fill', 'select',
    'check', 'uncheck', 'hover', 'press', 'scroll', 'screenshot',
    'wait', 'navigate', 'goback', 'goforward', 'refresh', 'drag', 'upload'
  ]),
  timestamp: z.number(),
  target: z.object({
    selector: z.object({
      strategies: z.array(z.object({
        type: z.enum(['css', 'xpath', 'text', 'role', 'testid', 'label', 'placeholder']),
        value: z.string(),
        priority: z.number(),
        reliability: z.number().optional(),
      })),
      bestMatch: z.number(),
      originalEvent: z.string().optional(),
    }),
    element: z.object({
      tag: z.string(),
      id: z.string().optional(),
      classes: z.array(z.string()).optional(),
      name: z.string().optional(),
      type: z.string().optional(),
      role: z.string().optional(),
      label: z.string().optional(),
      placeholder: z.string().optional(),
      text: z.string().optional(),
      innerHTML: z.string().optional(),
      attributes: z.record(z.string()),
      rect: z.object({
        x: z.number(),
        y: z.number(),
        width: z.number(),
        height: z.number(),
      }),
      isVisible: z.boolean(),
      isEnabled: z.boolean(),
      isEditable: z.boolean(),
    }).optional(),
    coordinates: z.object({
      x: z.number(),
      y: z.number(),
      offsetX: z.number().optional(),
      offsetY: z.number().optional(),
    }).optional(),
  }),
  value: z.string().optional(),
  modifiers: z.array(z.enum(['Control', 'Shift', 'Alt', 'Meta', 'ControlOrMeta'])).optional(),
  duration: z.number().optional(),
  success: z.boolean().optional(),
});

/**
 * Create a recorded action from raw event data
 */
export function createRecordedAction(params: {
  type: ActionType;
  target: ActionTarget;
  value?: string;
  modifiers?: KeyModifier[];
}): RecordedAction {
  return {
    id: crypto.randomUUID(),
    type: params.type,
    timestamp: Date.now(),
    target: params.target,
    value: params.value,
    modifiers: params.modifiers,
  };
}

/**
 * Create an element selector from multiple strategies
 */
export function createElementSelector(strategies: SelectorStrategy[]): ElementSelector {
  return {
    strategies: strategies.sort((a, b) => a.priority - b.priority),
    bestMatch: strategies.length > 0 ? Math.max(...strategies.map(s => s.reliability ?? 0.5)) : 0,
  };
}

/**
 * Create element snapshot from DOM
 */
export function createElementSnapshot(element: HTMLElement): ElementSnapshot {
  const rect = element.getBoundingClientRect();
  return {
    tag: element.tagName.toLowerCase(),
    id: element.id || undefined,
    classes: Array.from(element.classList),
    name: (element as HTMLInputElement).name || undefined,
    type: (element as HTMLInputElement).type || undefined,
    role: element.getAttribute('role') || undefined,
    label: (element as HTMLLabelElement).label || element.getAttribute('aria-label') || undefined,
    placeholder: (element as HTMLInputElement).placeholder || undefined,
    text: element.textContent?.trim() || undefined,
    innerHTML: element.innerHTML,
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
    isVisible: rect.width > 0 && rect.height > 0,
    isEnabled: !element.hasAttribute('disabled'),
    isEditable: element.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(element.tagName),
  };
}
