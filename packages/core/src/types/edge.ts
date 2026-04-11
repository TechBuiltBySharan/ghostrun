import { z } from 'zod';

/**
 * Represents an edge (transition) between nodes in the flow graph
 */
export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  guard?: TransitionGuard;
  metadata?: EdgeMetadata;
}

/**
 * Condition that must be met for the transition to occur
 */
export interface TransitionGuard {
  type: 'condition' | 'timeout' | 'fallback';
  condition?: EdgeCondition;
  timeout?: number; // ms
  priority: number;
}

/**
 * Condition for edge traversal
 */
export interface EdgeCondition {
  type: 'url' | 'selector' | 'text' | 'element' | 'count';
  operator: 'equals' | 'notEquals' | 'contains' | 'matches' | 'exists' | 'notExists' | 'greaterThan' | 'lessThan';
  target: string;
  value?: string | number;
  caseSensitive?: boolean;
}

/**
 * Additional metadata for the edge
 */
export interface EdgeMetadata {
  action?: {
    type: 'click' | 'type' | 'navigate' | 'wait' | 'select';
    selector?: string;
    value?: string;
  };
  expectedResult?: {
    urlPattern?: string;
    selector?: string;
    text?: string;
    timeout?: number;
  };
  retry?: {
    maxAttempts: number;
    delayMs: number;
  };
}

/**
 * Zod schema for FlowEdge validation
 */
export const FlowEdgeSchema = z.object({
  id: z.string(),
  source: z.string(),
  target: z.string(),
  label: z.string().optional(),
  guard: z.object({
    type: z.enum(['condition', 'timeout', 'fallback']),
    condition: z.object({
      type: z.enum(['url', 'selector', 'text', 'element', 'count']),
      operator: z.enum(['equals', 'notEquals', 'contains', 'matches', 'exists', 'notExists', 'greaterThan', 'lessThan']),
      target: z.string(),
      value: z.union([z.string(), z.number()]).optional(),
      caseSensitive: z.boolean().optional(),
    }).optional(),
    timeout: z.number().optional(),
    priority: z.number().default(0),
  }).optional(),
  metadata: z.record(z.any()).optional(),
});

/**
 * Create a new edge between nodes
 */
export function createEdge(params: {
  source: string;
  target: string;
  label?: string;
  action?: EdgeMetadata['action'];
}): FlowEdge {
  return {
    id: crypto.randomUUID(),
    source: params.source,
    target: params.target,
    label: params.label,
    metadata: params.action ? { action: params.action } : undefined,
  };
}

/**
 * Create a conditional edge
 */
export function createConditionalEdge(params: {
  source: string;
  target: string;
  condition: EdgeCondition;
  label?: string;
}): FlowEdge {
  return {
    id: crypto.randomUUID(),
    source: params.source,
    target: params.target,
    label: params.label,
    guard: {
      type: 'condition',
      condition: params.condition,
      priority: 0,
    },
  };
}

/**
 * Find edges outgoing from a node
 */
export function findOutgoingEdges(edges: FlowEdge[], nodeId: string): FlowEdge[] {
  return edges.filter(e => e.source === nodeId);
}

/**
 * Find edges incoming to a node
 */
export function findIncomingEdges(edges: FlowEdge[], nodeId: string): FlowEdge[] {
  return edges.filter(e => e.target === nodeId);
}

/**
 * Check if an edge's condition is met
 */
export function evaluateEdgeCondition(
  condition: EdgeCondition,
  context: {
    currentUrl?: string;
    elementText?: string;
    elementExists?: boolean;
    selectorCount?: number;
  }
): boolean {
  const { operator, target, value, caseSensitive = false } = condition;
  
  let actualValue: string | number | boolean | undefined;
  
  switch (condition.type) {
    case 'url':
      actualValue = context.currentUrl;
      break;
    case 'text':
      actualValue = context.elementText;
      break;
    case 'element':
      actualValue = context.elementExists;
      break;
    case 'count':
      actualValue = context.selectorCount;
      break;
  }
  
  // Handle boolean values
  if (typeof actualValue === 'boolean') {
    if (operator === 'exists') return actualValue === true;
    if (operator === 'notExists') return actualValue === false;
  }
  
  // Handle string comparisons
  if (typeof actualValue === 'string' && typeof value === 'string') {
    const actual = caseSensitive ? actualValue : actualValue.toLowerCase();
    const expected = caseSensitive ? value : value.toLowerCase();
    
    switch (operator) {
      case 'equals':
        return actual === expected;
      case 'notEquals':
        return actual !== expected;
      case 'contains':
        return actual.includes(expected);
      case 'matches':
        return new RegExp(value).test(actualValue);
    }
  }
  
  // Handle numeric comparisons
  if (typeof actualValue === 'number' && typeof value === 'number') {
    switch (operator) {
      case 'equals':
        return actualValue === value;
      case 'greaterThan':
        return actualValue > value;
      case 'lessThan':
        return actualValue < value;
    }
  }
  
  return false;
}
