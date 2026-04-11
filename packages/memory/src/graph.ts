/**
 * Memory Graph - Graph-based flow representation
 */

import { createFlow, type Flow, type SerializedFlow, serializeFlow, deserializeFlow } from '@flowmind/core';
import { createStartNode, createScreenNode, createActionNode, createEndNode, createDecisionNode, type FlowNode, type NodeType } from '@flowmind/core';
import { createEdge, createConditionalEdge, findOutgoingEdges, findIncomingEdges, type FlowEdge } from '@flowmind/core';

export interface GraphState {
  flow: Flow;
  currentNodeId: string | null;
}

/**
 * Create a new empty flow graph
 */
export function createFlowGraph(params: {
  name: string;
  description?: string;
  appUrl?: string;
}): GraphState {
  const flow = createFlow({
    name: params.name,
    description: params.description,
    appUrl: params.appUrl,
  });

  // Create initial start node
  const startNode = createStartNode();
  flow.nodes.push(startNode);
  flow.startNodeId = startNode.id;

  return {
    flow,
    currentNodeId: startNode.id,
  };
}

/**
 * Add a node to the graph
 */
export function addNode(state: GraphState, node: FlowNode): GraphState {
  return {
    ...state,
    flow: {
      ...state.flow,
      nodes: [...state.flow.nodes, node],
      updatedAt: new Date(),
    },
    currentNodeId: node.id,
  };
}

/**
 * Add a screen node (representing a page state)
 */
export function addScreenNode(state: GraphState, params: {
  label: string;
  url?: string;
  title?: string;
}): GraphState {
  const lastNode = state.currentNodeId 
    ? state.flow.nodes.find(n => n.id === state.currentNodeId)
    : undefined;

  // Create screen node
  const screenNode = createScreenNode({
    label: params.label,
    url: params.url,
    title: params.title,
    position: { x: 0, y: 0 },
  });

  // If there's a previous node, connect them
  if (lastNode) {
    const edge = createEdge({
      source: lastNode.id,
      target: screenNode.id,
      label: 'navigate',
      action: params.url ? { type: 'navigate', selector: params.url } : undefined,
    });

    return {
      flow: {
        ...state.flow,
        nodes: [...state.flow.nodes, screenNode],
        edges: [...state.flow.edges, edge],
        updatedAt: new Date(),
      },
      currentNodeId: screenNode.id,
    };
  }

  return addNode(state, screenNode);
}

/**
 * Add an action node
 */
export function addActionNode(state: GraphState, params: {
  label: string;
  action: 'click' | 'type' | 'fill' | 'select' | 'wait' | 'navigate';
  selector?: string;
  selectorType?: 'css' | 'xpath' | 'text' | 'role';
  value?: string;
  slotId?: string;
}): GraphState {
  const lastNode = state.currentNodeId 
    ? state.flow.nodes.find(n => n.id === state.currentNodeId)
    : undefined;

  const actionNode = createActionNode({
    label: params.label,
    action: params.action,
    targetSelector: params.selector ? {
      type: params.selectorType || 'css',
      value: params.selector,
      priority: 1,
    } : undefined,
    inputValue: params.value,
    slotId: params.slotId,
    position: { x: 0, y: 0 },
  });

  // Connect to previous node
  if (lastNode) {
    const edge = createEdge({
      source: lastNode.id,
      target: actionNode.id,
      label: params.action,
      action: {
        type: params.action,
        selector: params.selector,
        value: params.value,
      },
    });

    return {
      flow: {
        ...state.flow,
        nodes: [...state.flow.nodes, actionNode],
        edges: [...state.flow.edges, edge],
        updatedAt: new Date(),
      },
      currentNodeId: actionNode.id,
    };
  }

  return addNode(state, actionNode);
}

/**
 * Add an end node
 */
export function addEndNode(state: GraphState, params: {
  label: string;
  endType: 'success' | 'failure' | 'aborted';
  message?: string;
}): GraphState {
  const lastNode = state.currentNodeId 
    ? state.flow.nodes.find(n => n.id === state.currentNodeId)
    : undefined;

  const endNode = createEndNode({
    label: params.label,
    endType: params.endType,
    exitMessage: params.message,
    position: { x: 0, y: 0 },
  });

  // Connect to previous node
  if (lastNode) {
    const edge = createEdge({
      source: lastNode.id,
      target: endNode.id,
      label: params.endType,
    });

    return {
      flow: {
        ...state.flow,
        nodes: [...state.flow.nodes, endNode],
        edges: [...state.flow.edges, edge],
        endNodeIds: [...state.flow.endNodeIds, endNode.id],
        updatedAt: new Date(),
      },
      currentNodeId: endNode.id,
    };
  }

  return addNode(state, endNode);
}

/**
 * Find node by ID
 */
export function findNode(graph: GraphState, nodeId: string): FlowNode | undefined {
  return graph.flow.nodes.find(n => n.id === nodeId);
}

/**
 * Find node by type
 */
export function findNodesByType(graph: GraphState, type: NodeType): FlowNode[] {
  return graph.flow.nodes.filter(n => n.type === type);
}

/**
 * Get path from start to a specific node
 */
export function getPathToNode(graph: GraphState, targetNodeId: string): FlowNode[] {
  const visited = new Set<string>();
  const path: FlowNode[] = [];

  function traverse(nodeId: string): boolean {
    if (visited.has(nodeId)) return false;
    visited.add(nodeId);

    const node = findNode(graph, nodeId);
    if (!node) return false;

    path.push(node);

    if (nodeId === targetNodeId) return true;

    const outgoing = findOutgoingEdges(graph.flow.edges, nodeId);
    for (const edge of outgoing) {
      if (traverse(edge.target)) return true;
    }

    path.pop();
    return false;
  }

  if (graph.flow.startNodeId) {
    traverse(graph.flow.startNodeId);
  }

  return path;
}

/**
 * Get all paths from start to end nodes
 */
export function getAllPaths(graph: GraphState): FlowNode[][] {
  const paths: FlowNode[][] = [];

  function traverse(nodeId: string, currentPath: FlowNode[]): void {
    const node = findNode(graph, nodeId);
    if (!node) return;

    const newPath = [...currentPath, node];

    if (node.type === 'end') {
      paths.push(newPath);
      return;
    }

    const outgoing = findOutgoingEdges(graph.flow.edges, nodeId);
    for (const edge of outgoing) {
      traverse(edge.target, newPath);
    }
  }

  if (graph.flow.startNodeId) {
    traverse(graph.flow.startNodeId, []);
  }

  return paths;
}

/**
 * Get node statistics
 */
export function getGraphStats(graph: GraphState): {
  totalNodes: number;
  nodeCounts: Record<NodeType, number>;
  totalEdges: number;
  depth: number;
  hasCycle: boolean;
} {
  const nodeCounts: Record<NodeType, number> = {
    start: 0,
    screen: 0,
    action: 0,
    decision: 0,
    end: 0,
    error: 0,
  };

  for (const node of graph.flow.nodes) {
    nodeCounts[node.type]++;
  }

  // Calculate depth (longest path)
  const depths = new Map<string, number>();

  function getDepth(nodeId: string): number {
    if (depths.has(nodeId)) return depths.get(nodeId)!;

    const node = findNode(graph, nodeId);
    if (!node || node.type === 'start') {
      depths.set(nodeId, 0);
      return 0;
    }

    const incoming = findIncomingEdges(graph.flow.edges, nodeId);
    let maxPrevDepth = -1;

    for (const edge of incoming) {
      maxPrevDepth = Math.max(maxPrevDepth, getDepth(edge.source));
    }

    const depth = maxPrevDepth + 1;
    depths.set(nodeId, depth);
    return depth;
  }

  let maxDepth = 0;
  for (const node of graph.flow.nodes) {
    maxDepth = Math.max(maxDepth, getDepth(node.id));
  }

  // Check for cycles (simple DFS)
  const visited = new Set<string>();
  const recursionStack = new Set<string>();

  function hasCycleDFS(nodeId: string): boolean {
    visited.add(nodeId);
    recursionStack.add(nodeId);

    const outgoing = findOutgoingEdges(graph.flow.edges, nodeId);
    for (const edge of outgoing) {
      if (!visited.has(edge.target)) {
        if (hasCycleDFS(edge.target)) return true;
      } else if (recursionStack.has(edge.target)) {
        return true;
      }
    }

    recursionStack.delete(nodeId);
    return false;
  }

  const hasCycle = graph.flow.startNodeId ? hasCycleDFS(graph.flow.startNodeId) : false;

  return {
    totalNodes: graph.flow.nodes.length,
    nodeCounts,
    totalEdges: graph.flow.edges.length,
    depth: maxDepth,
    hasCycle,
  };
}

/**
 * Serialize graph to JSON
 */
export function serializeGraph(state: GraphState): string {
  return JSON.stringify(serializeFlow(state.flow), null, 2);
}

/**
 * Deserialize graph from JSON
 */
export function deserializeGraph(json: string): GraphState {
  const flow = deserializeFlow(JSON.parse(json) as SerializedFlow);
  return {
    flow,
    currentNodeId: null,
  };
}

/**
 * Export graph for visualization (simplified format)
 */
export function exportForVisualization(graph: GraphState): {
  nodes: Array<{ id: string; type: string; label: string; data: unknown }>;
  edges: Array<{ id: string; source: string; target: string; label?: string }>;
} {
  return {
    nodes: graph.flow.nodes.map(n => ({
      id: n.id,
      type: n.type,
      label: n.label,
      data: n.data,
    })),
    edges: graph.flow.edges.map(e => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
    })),
  };
}
