import { z } from 'zod';

/**
 * Node types in the flow graph
 */
export type NodeType = 
  | 'start'      // Flow entry point
  | 'screen'     // Represents a page/screen state
  | 'action'     // User action (click, input)
  | 'decision'   // Branching logic
  | 'end'        // Flow exit point
  | 'error';     // Error state

/**
 * Represents a node in the flow graph
 */
export interface FlowNode {
  id: string;
  type: NodeType;
  label: string;
  description?: string;
  position: NodePosition;
  data: NodeData;
  children?: string[]; // For nested flows
}

/**
 * Position in the flow graph for visualization
 */
export interface NodePosition {
  x: number;
  y: number;
}

/**
 * Node-specific data based on type
 */
export interface NodeData {
  // Screen nodes
  url?: string;
  urlPattern?: string;
  title?: string;
  selectors?: Selector[];
  
  // Action nodes
  action?: ActionType;
  targetSelector?: string;
  inputValue?: string;
  slotId?: string;
  
  // Decision nodes
  condition?: Condition;
  
  // End nodes
  endType?: 'success' | 'failure' | 'aborted';
  exitMessage?: string;
  
  // General
  metadata?: Record<string, unknown>;
  screenshotId?: string;
}

/**
 * CSS/DOM selector for element targeting
 */
export interface Selector {
  type: 'css' | 'xpath' | 'text' | 'role' | 'testid';
  value: string;
  confidence?: number;
  priority: number;
}

/**
 * Action types that can be performed
 */
export type ActionType = 
  | 'click'
  | 'dblclick'
  | 'rightClick'
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
  | 'goBack'
  | 'goForward'
  | 'refresh';

/**
 * Condition for decision nodes
 */
export interface Condition {
  type: 'url' | 'selector' | 'text' | 'count' | 'custom';
  operator: 'equals' | 'contains' | 'matches' | 'exists' | 'notExists' | 'greaterThan' | 'lessThan';
  target: string;
  value?: string | number;
  caseSensitive?: boolean;
}

/**
 * Zod schema for FlowNode validation
 */
export const FlowNodeSchema = z.object({
  id: z.string(),
  type: z.enum(['start', 'screen', 'action', 'decision', 'end', 'error']),
  label: z.string().min(1),
  description: z.string().optional(),
  position: z.object({
    x: z.number(),
    y: z.number(),
  }),
  data: z.record(z.any()),
});

/**
 * Create a new screen node
 */
export function createScreenNode(params: {
  label: string;
  url?: string;
  title?: string;
  position?: NodePosition;
}): FlowNode {
  return {
    id: crypto.randomUUID(),
    type: 'screen',
    label: params.label,
    position: params.position ?? { x: 0, y: 0 },
    data: {
      url: params.url,
      title: params.title,
      selectors: [],
    },
  };
}

/**
 * Create a new action node
 */
export function createActionNode(params: {
  label: string;
  action: ActionType;
  targetSelector?: Selector;
  inputValue?: string;
  slotId?: string;
  position?: NodePosition;
}): FlowNode {
  return {
    id: crypto.randomUUID(),
    type: 'action',
    label: params.label,
    position: params.position ?? { x: 0, y: 0 },
    data: {
      action: params.action,
      targetSelector: params.targetSelector,
      inputValue: params.inputValue,
      slotId: params.slotId,
    },
  };
}

/**
 * Create a decision node
 */
export function createDecisionNode(params: {
  label: string;
  condition: Condition;
  position?: NodePosition;
}): FlowNode {
  return {
    id: crypto.randomUUID(),
    type: 'decision',
    label: params.label,
    position: params.position ?? { x: 0, y: 0 },
    data: {
      condition: params.condition,
    },
  };
}

/**
 * Create an end node
 */
export function createEndNode(params: {
  label: string;
  endType: 'success' | 'failure' | 'aborted';
  exitMessage?: string;
  position?: NodePosition;
}): FlowNode {
  return {
    id: crypto.randomUUID(),
    type: 'end',
    label: params.label,
    position: params.position ?? { x: 0, y: 0 },
    data: {
      endType: params.endType,
      exitMessage: params.exitMessage,
    },
  };
}

/**
 * Create a start node
 */
export function createStartNode(params?: { position?: NodePosition }): FlowNode {
  return {
    id: crypto.randomUUID(),
    type: 'start',
    label: 'Start',
    position: params?.position ?? { x: 0, y: 0 },
    data: {},
  };
}
