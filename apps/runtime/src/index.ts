/**
 * GhostRun Runtime - Local API server and runtime engine
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import { flowRoutes } from './routes/flows';
import { runRoutes } from './routes/runs';
import { configRoutes } from './routes/config';
import { createGraphStorage } from '@ghostrun/memory';
import { createReportStorage } from '@ghostrun/reporting';
import { PlaywrightAdapter } from '@ghostrun/adapters-web';
import { executeFlow, type ExecutionConfig } from '@ghostrun/executor';

export interface RuntimeConfig {
  port: number;
  host: string;
  storagePath: string;
}

const DEFAULT_CONFIG: RuntimeConfig = {
  port: 3030,
  host: 'localhost',
  storagePath: './.ghostrun',
};

export class GhostRunRuntime {
  private config: RuntimeConfig;
  private app: ReturnType<typeof Fastify>;
  private storage: ReturnType<typeof createGraphStorage>;
  private reportStorage: ReturnType<typeof createReportStorage>;
  private browser: PlaywrightAdapter | null = null;
  private isRunning = false;

  constructor(config: Partial<RuntimeConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.app = Fastify({ logger: true });
    this.storage = createGraphStorage({ basePath: `${this.config.storagePath}/flows` });
    this.reportStorage = createReportStorage({ basePath: `${this.config.storagePath}/runs` });
  }

  /**
   * Initialize the runtime
   */
  async initialize(): Promise<void> {
    // Register plugins
    await this.app.register(cors, {
      origin: true,
    });

    // Register routes
    await this.app.register(flowRoutes, { prefix: '/api/flows', storage: this.storage });
    await this.app.register(runRoutes, { prefix: '/api/runs', reportStorage: this.reportStorage });
    await this.app.register(configRoutes, { prefix: '/api/config' });

    // Health check
    this.app.get('/health', async () => ({
      status: 'ok',
      version: '0.1.0',
      timestamp: new Date().toISOString(),
    }));

    // Initialize browser
    this.browser = new PlaywrightAdapter({ headless: true });
    await this.browser.launch();
  }

  /**
   * Start the server
   */
  async start(): Promise<void> {
    if (this.isRunning) return;

    await this.initialize();

    try {
      await this.app.listen({ port: this.config.port, host: this.config.host });
      this.isRunning = true;
      console.log(`GhostRun Runtime running at http://${this.config.host}:${this.config.port}`);
    } catch (error) {
      this.app.log.error(error);
      throw error;
    }
  }

  /**
   * Stop the server
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    await this.app.close();
    
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }

    this.isRunning = false;
  }

  /**
   * Execute a flow
   */
  async executeFlow(flowId: string, config?: Partial<ExecutionConfig>) {
    if (!this.browser) {
      throw new Error('Runtime not initialized');
    }

    const flow = await this.storage.loadGraph(flowId);
    if (!flow) {
      throw new Error(`Flow not found: ${flowId}`);
    }

    const browserInstance = await this.browser.launch();
    return executeFlow(flow.flow, browserInstance, config);
  }

  /**
   * Get storage instance
   */
  getStorage() {
    return this.storage;
  }

  /**
   * Get report storage instance
   */
  getReportStorage() {
    return this.reportStorage;
  }

  /**
   * Get browser instance
   */
  getBrowser() {
    return this.browser;
  }
}

// CLI entry point
async function main() {
  const runtime = new GhostRunRuntime({
    port: parseInt(process.env.PORT || '3030'),
    host: process.env.HOST || 'localhost',
  });

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down...');
    await runtime.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await runtime.stop();
    process.exit(0);
  });

  await runtime.start();
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { main };
