/**
 * Represents a captured screen state in the flow
 */
export interface ScreenCapture {
  id: string;
  flowId: string;
  nodeId?: string;
  timestamp: number;
  url: string;
  title: string;
  viewport: ViewportInfo;
  elements: ElementInfo[];
  screenshotPath?: string;
}

/**
 * Viewport/window information
 */
export interface ViewportInfo {
  width: number;
  height: number;
  devicePixelRatio: number;
  scrollX?: number;
  scrollY?: number;
}

/**
 * Simplified element information for matching
 */
export interface ElementInfo {
  selector: string;
  selectorType: 'css' | 'xpath' | 'text' | 'role' | 'testid';
  tag: string;
  text?: string;
  isInteractive: boolean;
  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

/**
 * Screen classification types
 */
export type ScreenType =
  | 'login'
  | 'register'
  | 'dashboard'
  | 'form'
  | 'detail'
  | 'list'
  | 'search'
  | 'settings'
  | 'error'
  | 'loading'
  | 'unknown';

/**
 * Classified screen information
 */
export interface ClassifiedScreen {
  capture: ScreenCapture;
  type: ScreenType;
  confidence: number;
  suggestedLabel: string;
  suggestedSlotFields: SlotField[];
  suggestedSuccessCondition?: SuccessCondition;
}

/**
 * Slot field candidates (input fields that may need parameterization)
 */
export interface SlotField {
  selector: string;
  selectorType: 'css' | 'xpath' | 'label' | 'placeholder';
  fieldType: 'text' | 'email' | 'password' | 'number' | 'tel' | 'url' | 'search' | 'username';
  label?: string;
  placeholder?: string;
  isRequired: boolean;
}

/**
 * Success condition for a screen
 */
export interface SuccessCondition {
  type: 'url' | 'selector' | 'text' | 'element';
  target: string;
  operator: 'equals' | 'contains' | 'matches' | 'exists' | 'notExists';
  value?: string;
}

/**
 * Create a basic screen capture
 */
export function createScreenCapture(params: {
  flowId: string;
  url: string;
  title: string;
  viewport: ViewportInfo;
  elements: ElementInfo[];
}): ScreenCapture {
  return {
    id: crypto.randomUUID(),
    flowId: params.flowId,
    timestamp: Date.now(),
    url: params.url,
    title: params.title,
    viewport: params.viewport,
    elements: params.elements,
  };
}
