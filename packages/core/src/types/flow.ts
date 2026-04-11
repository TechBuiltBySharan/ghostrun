import { z } from 'zod';
import type { FlowNode } from './node';
import type { FlowEdge } from './edge';

/**
 * Represents a complete user flow as a directed graph
 */
export interface Flow {
  id: string;
  name: string;
  description?: string;
  version: string;
  createdAt: Date;
  updatedAt: Date;
  startNodeId: string;
  endNodeIds: string[];
  nodes: FlowNode[];
  edges: FlowEdge[];
  metadata: FlowMetadata;
}

/**
 * Flow metadata for tracking and organization
 */
export interface FlowMetadata {
  appUrl?: string;
  tags: string[];
  author?: string;
  estimatedDuration?: number; // seconds
  slotDefinitions: SlotDefinition[];
}

/**
 * Definition for a dynamic input field (slot) in the flow
 */
export interface SlotDefinition {
  id: string;
  name: string;
  type: SlotType;
  description?: string;
  defaultValue?: string;
  required: boolean;
  placeholder?: string;
  selector?: string;
}

/**
 * Slot types for dynamic values
 */
export type SlotType = 
  | 'text'
  | 'email'
  | 'password'
  | 'number'
  | 'url'
  | 'select'
  | 'username';

/**
 * Zod schema for Flow validation
 */
export const FlowSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  createdAt: z.date(),
  updatedAt: z.date(),
  startNodeId: z.string(),
  endNodeIds: z.array(z.string()),
  nodes: z.array(z.any()),
  edges: z.array(z.any()),
  metadata: z.object({
    appUrl: z.string().url().optional(),
    tags: z.array(z.string()).default([]),
    author: z.string().optional(),
    estimatedDuration: z.number().optional(),
    slotDefinitions: z.array(z.any()).default([]),
  }),
});

/**
 * Serialized flow for storage
 */
export interface SerializedFlow extends Omit<Flow, 'createdAt' | 'updatedAt'> {
  createdAt: string;
  updatedAt: string;
}

/**
 * Flow summary for listing
 */
export interface FlowSummary {
  id: string;
  name: string;
  description?: string;
  nodeCount: number;
  edgeCount: number;
  tags: string[];
  lastRunAt?: Date;
  lastRunStatus?: 'passed' | 'failed' | 'pending';
}

/**
 * Create a new empty flow
 */
export function createFlow(params: {
  name: string;
  description?: string;
  appUrl?: string;
}): Flow {
  const now = new Date();
  return {
    id: crypto.randomUUID(),
    name: params.name,
    description: params.description,
    version: '0.1.0',
    createdAt: now,
    updatedAt: now,
    startNodeId: '',
    endNodeIds: [],
    nodes: [],
    edges: [],
    metadata: {
      appUrl: params.appUrl,
      tags: [],
      slotDefinitions: [],
    },
  };
}

/**
 * Serialize flow for storage
 */
export function serializeFlow(flow: Flow): SerializedFlow {
  return {
    ...flow,
    createdAt: flow.createdAt.toISOString(),
    updatedAt: flow.updatedAt.toISOString(),
  };
}

/**
 * Deserialize flow from storage
 */
export function deserializeFlow(data: SerializedFlow): Flow {
  return {
    ...data,
    createdAt: new Date(data.createdAt),
    updatedAt: new Date(data.updatedAt),
  };
}
