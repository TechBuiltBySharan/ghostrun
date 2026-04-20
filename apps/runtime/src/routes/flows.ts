/**
 * Flow routes - API endpoints for flow management
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createGraphStorage, type GraphState, createFlowGraph, addScreenNode, addActionNode, addEndNode } from '@ghostrun/memory';

export async function flowRoutes(
  app: FastifyInstance,
  options: { storage: ReturnType<typeof createGraphStorage> }
) {
  const { storage } = options;

  // List all flows
  app.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    const flows = await storage.listGraphs();
    return flows;
  });

  // Get a flow by ID
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const { id } = request.params;
    const graph = await storage.loadGraph(id);
    
    if (!graph) {
      reply.status(404);
      return { error: 'Flow not found' };
    }
    
    return graph.flow;
  });

  // Create a new flow
  app.post<{ Body: { name: string; description?: string; appUrl?: string } }>(
    '/',
    async (request, reply) => {
      const { name, description, appUrl } = request.body;
      
      if (!name) {
        reply.status(400);
        return { error: 'Name is required' };
      }

      const state = createFlowGraph({ name, description, appUrl });
      await storage.saveGraph(state);
      
      reply.status(201);
      return state.flow;
    }
  );

  // Update a flow
  app.put<{ Params: { id: string }; Body: Partial<{ name: string; description: string; appUrl: string }> }>(
    '/:id',
    async (request, reply) => {
      const { id } = request.params;
      const updates = request.body;
      
      const graph = await storage.loadGraph(id);
      if (!graph) {
        reply.status(404);
        return { error: 'Flow not found' };
      }

      // Apply updates
      if (updates.name) graph.flow.name = updates.name;
      if (updates.description !== undefined) graph.flow.description = updates.description;
      if (updates.appUrl !== undefined) graph.flow.metadata.appUrl = updates.appUrl;
      graph.flow.updatedAt = new Date();

      await storage.saveGraph(graph);
      return graph.flow;
    }
  );

  // Delete a flow
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const { id } = request.params;
    const deleted = await storage.deleteGraph(id);
    
    if (!deleted) {
      reply.status(404);
      return { error: 'Flow not found' };
    }
    
    return { success: true };
  });

  // Add a node to a flow
  app.post<{ Params: { id: string }; Body: { type: 'screen' | 'action' | 'end'; data: Record<string, unknown> } }>(
    '/:id/nodes',
    async (request, reply) => {
      const { id } = request.params;
      const { type, data } = request.body;
      
      const graph = await storage.loadGraph(id);
      if (!graph) {
        reply.status(404);
        return { error: 'Flow not found' };
      }

      let updatedGraph = graph;

      if (type === 'screen') {
        updatedGraph = addScreenNode(graph, {
          label: data.label as string || 'Screen',
          url: data.url as string,
          title: data.title as string,
        });
      } else if (type === 'action') {
        updatedGraph = addActionNode(graph, {
          label: data.label as string || 'Action',
          action: data.action as 'click' | 'type' | 'fill' | 'select' | 'wait' | 'navigate',
          selector: data.selector as string,
          selectorType: data.selectorType as 'css' | 'xpath' | 'text' | 'role',
          value: data.value as string,
          slotId: data.slotId as string,
        });
      } else if (type === 'end') {
        updatedGraph = addEndNode(graph, {
          label: data.label as string || 'End',
          endType: data.endType as 'success' | 'failure' | 'aborted',
          message: data.message as string,
        });
      }

      await storage.saveGraph(updatedGraph);
      return updatedGraph.flow;
    }
  );

  // Export a flow
  app.get<{ Params: { id: string } }>('/:id/export', async (request, reply) => {
    const { id } = request.params;
    const graph = await storage.loadGraph(id);
    
    if (!graph) {
      reply.status(404);
      return { error: 'Flow not found' };
    }

    const { exportForVisualization } = await import('@ghostrun/memory');
    const data = exportForVisualization(graph);
    
    reply.header('Content-Type', 'application/json');
    return data;
  });
}
