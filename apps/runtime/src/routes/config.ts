/**
 * Config routes - API endpoints for configuration
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

interface AppConfig {
  browser: 'chromium' | 'firefox' | 'webkit';
  headless: boolean;
  viewport: { width: number; height: number };
  timeout: number;
  screenshotOnFailure: boolean;
  captureConsole: boolean;
  captureNetwork: boolean;
}

const config: AppConfig = {
  browser: 'chromium',
  headless: true,
  viewport: { width: 1280, height: 720 },
  timeout: 30000,
  screenshotOnFailure: true,
  captureConsole: true,
  captureNetwork: true,
};

export async function configRoutes(app: FastifyInstance) {
  // Get current config
  app.get('/', async () => {
    return config;
  });

  // Update config
  app.put<{ Body: Partial<AppConfig> }>('/', async (request, reply) => {
    const updates = request.body;
    
    // Validate viewport
    if (updates.viewport) {
      if (updates.viewport.width < 100 || updates.viewport.height < 100) {
        reply.status(400);
        return { error: 'Viewport dimensions must be at least 100x100' };
      }
    }

    // Apply updates
    Object.assign(config, updates);
    
    return config;
  });

  // Get browser options
  app.get('/browsers', async () => {
    return ['chromium', 'firefox', 'webkit'];
  });

  // Reset to defaults
  app.post('/reset', async () => {
    config.browser = 'chromium';
    config.headless = true;
    config.viewport = { width: 1280, height: 720 };
    config.timeout = 30000;
    config.screenshotOnFailure = true;
    config.captureConsole = true;
    config.captureNetwork = true;
    return config;
  });
}
