/**
 * Playwright Adapter - Browser automation using Playwright
 */

import { chromium, firefox, webkit, type Browser, type BrowserContext, type Page, type LaunchOptions } from 'playwright';

export interface PlaywrightConfig {
  browser: 'chromium' | 'firefox' | 'webkit';
  headless: boolean;
  viewport: {
    width: number;
    height: number;
  };
  userAgent?: string;
  locale?: string;
  timezoneId?: string;
  geolocation?: {
    latitude: number;
    longitude: number;
  };
  permissions?: string[];
  proxy?: {
    server: string;
    bypass?: string;
    username?: string;
    password?: string;
  };
}

const DEFAULT_CONFIG: PlaywrightConfig = {
  browser: 'chromium',
  headless: true,
  viewport: { width: 1280, height: 720 },
};

/**
 * Create and manage Playwright browser instances
 */
export class PlaywrightAdapter {
  private config: PlaywrightConfig;
  private browser: Browser | null = null;
  private contexts: Map<string, BrowserContext> = new Map();

  constructor(config: Partial<PlaywrightConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Launch browser
   */
  async launch(): Promise<Browser> {
    if (this.browser) {
      return this.browser;
    }

    const launchOptions: LaunchOptions = {
      headless: this.config.headless,
    };

    switch (this.config.browser) {
      case 'chromium':
        this.browser = await chromium.launch(launchOptions);
        break;
      case 'firefox':
        this.browser = await firefox.launch(launchOptions);
        break;
      case 'webkit':
        this.browser = await webkit.launch(launchOptions);
        break;
    }

    return this.browser!;
  }

  /**
   * Close browser
   */
  async close(): Promise<void> {
    // Close all contexts first
    for (const context of this.contexts.values()) {
      await context.close();
    }
    this.contexts.clear();

    // Close browser
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * Create a new browser context
   */
  async createContext(contextId?: string): Promise<BrowserContext> {
    const browser = await this.launch();

    const contextOptions: Parameters<Browser['newContext']>[0] = {
      viewport: this.config.viewport,
      userAgent: this.config.userAgent,
      locale: this.config.locale || 'en-US',
      timezoneId: this.config.timezoneId,
      geolocation: this.config.geolocation,
      permissions: this.config.permissions,
      proxy: this.config.proxy,
      ignoreHTTPSErrors: true,
    };

    const context = await browser.newContext(contextOptions);
    const id = contextId || crypto.randomUUID();
    this.contexts.set(id, context);

    return context;
  }

  /**
   * Get context by ID
   */
  getContext(contextId: string): BrowserContext | null {
    return this.contexts.get(contextId) || null;
  }

  /**
   * Close context by ID
   */
  async closeContext(contextId: string): Promise<void> {
    const context = this.contexts.get(contextId);
    if (context) {
      await context.close();
      this.contexts.delete(contextId);
    }
  }

  /**
   * Get all context IDs
   */
  getContextIds(): string[] {
    return Array.from(this.contexts.keys());
  }

  /**
   * Check if browser is launched
   */
  isLaunched(): boolean {
    return this.browser !== null;
  }

  /**
   * Get browser instance
   */
  getBrowser(): Browser | null {
    return this.browser;
  }
}

/**
 * Create a quick page for testing
 */
export async function createQuickPage(config?: Partial<PlaywrightConfig>): Promise<{
  page: Page;
  browser: Browser;
  cleanup: () => Promise<void>;
}> {
  const adapter = new PlaywrightAdapter(config);
  const browser = await adapter.launch();
  const context = await adapter.createContext();
  const page = await context.newPage();

  const cleanup = async () => {
    await context.close();
    await adapter.close();
  };

  return { page, browser, cleanup };
}

/**
 * Navigate to URL
 */
export async function navigateTo(
  page: Page,
  url: string,
  options?: {
    waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
    timeout?: number;
  }
): Promise<void> {
  await page.goto(url, {
    waitUntil: options?.waitUntil || 'domcontentloaded',
    timeout: options?.timeout || 30000,
  });
}

/**
 * Wait for selector
 */
export async function waitForSelector(
  page: Page,
  selector: string,
  options?: {
    state?: 'attached' | 'detached' | 'visible' | 'hidden';
    timeout?: number;
  }
): Promise<void> {
  await page.waitForSelector(selector, {
    state: options?.state || 'visible',
    timeout: options?.timeout || 30000,
  });
}

/**
 * Take screenshot
 */
export async function takeScreenshot(
  page: Page,
  options?: {
    fullPage?: boolean;
    path?: string;
  }
): Promise<Buffer> {
  return page.screenshot({
    fullPage: options?.fullPage ?? true,
    path: options?.path,
  });
}

/**
 * Get page title
 */
export async function getPageTitle(page: Page): Promise<string> {
  return page.title();
}

/**
 * Get page URL
 */
export function getPageUrl(page: Page): string {
  return page.url();
}

/**
 * Execute JavaScript in page context
 */
export async function executeScript<T = unknown>(
  page: Page,
  script: string | ((...args: unknown[]) => T),
  ...args: unknown[]
): Promise<T> {
  return page.evaluate(script, ...args);
}

/**
 * Get element bounding box
 */
export async function getElementBounds(
  page: Page,
  selector: string
): Promise<{
  x: number;
  y: number;
  width: number;
  height: number;
} | null> {
  const element = page.locator(selector);
  if (await element.count() === 0) {
    return null;
  }
  return element.boundingBox();
}

/**
 * Check if element is visible
 */
export async function isElementVisible(
  page: Page,
  selector: string
): Promise<boolean> {
  const element = page.locator(selector);
  return element.isVisible();
}

/**
 * Get element text
 */
export async function getElementText(
  page: Page,
  selector: string
): Promise<string | null> {
  const element = page.locator(selector);
  if (await element.count() === 0) {
    return null;
  }
  return element.textContent();
}

/**
 * Get element attribute
 */
export async function getElementAttribute(
  page: Page,
  selector: string,
  attribute: string
): Promise<string | null> {
  const element = page.locator(selector);
  if (await element.count() === 0) {
    return null;
  }
  return element.getAttribute(attribute);
}

/**
 * Fill input field
 */
export async function fillInput(
  page: Page,
  selector: string,
  value: string
): Promise<void> {
  const element = page.locator(selector);
  await element.fill(value);
}

/**
 * Click element
 */
export async function clickElement(
  page: Page,
  selector: string,
  options?: {
    button?: 'left' | 'right' | 'middle';
    clickCount?: number;
    force?: boolean;
  }
): Promise<void> {
  const element = page.locator(selector);
  await element.click(options);
}

/**
 * Press key
 */
export async function pressKey(
  page: Page,
  key: string,
  options?: {
    modifiers?: ('Control' | 'Shift' | 'Alt' | 'Meta')[];
  }
): Promise<void> {
  if (options?.modifiers) {
    const keys = options.modifiers;
    for (const modifier of keys) {
      await page.keyboard.down(modifier);
    }
    try {
      await page.keyboard.press(key);
    } finally {
      for (const modifier of [...keys].reverse()) {
        await page.keyboard.up(modifier);
      }
    }
  } else {
    await page.keyboard.press(key);
  }
}

/**
 * Type text
 */
export async function typeText(
  page: Page,
  text: string,
  options?: {
    delay?: number;
  }
): Promise<void> {
  await page.keyboard.type(text, { delay: options?.delay || 0 });
}

/**
 * Wait for navigation
 */
export async function waitForNavigation(
  page: Page,
  options?: {
    waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
    timeout?: number;
  }
): Promise<void> {
  await page.waitForLoadState(options?.waitUntil || 'domcontentloaded', {
    timeout: options?.timeout,
  });
}

/**
 * Wait for network idle
 */
export async function waitForNetworkIdle(
  page: Page,
  timeout?: number
): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout });
}
