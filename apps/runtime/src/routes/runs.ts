/**
 * Run routes - API endpoints for run management
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createReportStorage, createReporter } from '@ghostrun/reporting';
import type { ExecutionConfig } from '@ghostrun/executor';
import { createGraphStorage } from '@ghostrun/memory';

export async function runRoutes(
  app: FastifyInstance,
  options: { reportStorage: ReturnType<typeof createReportStorage> }
) {
  const { reportStorage } = options;
  const reporter = createReporter({});

  // List all runs
  app.get('/', async (request: FastifyRequest<{ Querystring: { flowId?: string; limit?: string } }>, reply: FastifyReply) => {
    const { flowId, limit } = request.query;
    const runs = await reportStorage.list({
      flowId,
      limit: limit ? parseInt(limit) : undefined,
    });
    return runs;
  });

  // Get a run by ID
  app.get<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const { id } = request.params;
    const run = await reportStorage.load(id);
    
    if (!run) {
      reply.status(404);
      return { error: 'Run not found' };
    }
    
    return run;
  });

  // Get run report
  app.get<{ Params: { id: string }; Querystring: { format?: 'json' | 'html' | 'md' } }>(
    '/:id/report',
    async (request, reply) => {
      const { id } = request.params;
      const { format = 'json' } = request.query;
      
      const run = await reportStorage.load(id);
      if (!run) {
        reply.status(404);
        return { error: 'Run not found' };
      }

      const report = await reporter.generateReport(run, run.flowId);
      
      if (format === 'html') {
        const html = reporter.generateHtmlReport(report);
        reply.header('Content-Type', 'text/html');
        return html;
      }
      
      if (format === 'md') {
        const md = reporter.generateMarkdownReport(report);
        return { markdown: md };
      }
      
      return report;
    }
  );

  // Get run statistics
  app.get<{ Params: { flowId: string } }>('/stats/:flowId', async (request, reply) => {
    const { flowId } = request.params;
    const stats = await reportStorage.getRunStats(flowId);
    return stats;
  });

  // Delete a run
  app.delete<{ Params: { id: string } }>('/:id', async (request, reply) => {
    const { id } = request.params;
    const deleted = await reportStorage.delete(id);
    
    if (!deleted) {
      reply.status(404);
      return { error: 'Run not found' };
    }
    
    return { success: true };
  });

  // Export runs
  app.get<{ Querystring: { flowId?: string } }>('/export', async (request, reply) => {
    const { flowId } = request.query;
    const data = await reportStorage.exportRuns(flowId);
    
    reply.header('Content-Type', 'application/json');
    reply.header('Content-Disposition', `attachment; filename="runs${flowId ? `-${flowId}` : ''}.json"`);
    return data;
  });

  // Get latest runs for flow
  app.get<{ Params: { flowId: string } }>('/latest/:flowId', async (request, reply) => {
    const { flowId } = request.params;
    const run = await reportStorage.getLatestRunForFlow(flowId);
    
    if (!run) {
      reply.status(404);
      return { error: 'No runs found for this flow' };
    }
    
    return run;
  });
}
