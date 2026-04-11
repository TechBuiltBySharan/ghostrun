/**
 * Browser Context - Context management for multi-session testing
 */

import type { BrowserContext, Page } from 'playwright';

export interface ContextConfig {
  id?: string;
  viewport?: {
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
  storageState?: string | {
    cookies?: Array<{
      name: string;
      value: string;
      domain: string;
      path: string;
      expires: number;
      httpOnly: boolean;
      secure: boolean;
      sameSite?: 'Strict' | 'Lax' | 'None';
    }>;
    origins?: Array<{
      origin: string;
      localStorage: Array<{
        name: string;
        value: string;
      }>;
    }>;
  };
}

export interface ContextSession {
  id: string;
  pages: Map<string, Page>;
  createdAt: Date;
  metadata: Record<string, unknown>;
}

/**
 * Context manager for browser sessions
 */
export class BrowserContextManager {
  private sessions: Map<string, ContextSession> = new Map();
  private defaultContext: BrowserContext | null = null;

  /**
   * Set the default browser context
   */
  setDefaultContext(context: BrowserContext): void {
    this.defaultContext = context;
  }

  /**
   * Create a new session
   */
  createSession(config?: ContextConfig): string {
    const id = config?.id || crypto.randomUUID();
    
    const session: ContextSession = {
      id,
      pages: new Map(),
      createdAt: new Date(),
      metadata: {},
    };

    this.sessions.set(id, session);
    return id;
  }

  /**
   * Get a session
   */
  getSession(id: string): ContextSession | null {
    return this.sessions.get(id) || null;
  }

  /**
   * Add a page to a session
   */
  addPageToSession(sessionId: string, page: Page, pageId?: string): string {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const id = pageId || crypto.randomUUID();
    session.pages.set(id, page);
    return id;
  }

  /**
   * Get a page from a session
   */
  getPage(sessionId: string, pageId: string): Page | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    return session.pages.get(pageId) || null;
  }

  /**
   * Get all pages in a session
   */
  getSessionPages(sessionId: string): Page[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];
    return Array.from(session.pages.values());
  }

  /**
   * Close a page
   */
  async closePage(sessionId: string, pageId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    const page = session.pages.get(pageId);
    if (!page) return false;

    await page.close();
    session.pages.delete(pageId);
    return true;
  }

  /**
   * Close a session and all its pages
   */
  async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Close all pages
    for (const page of session.pages.values()) {
      await page.close();
    }

    session.pages.clear();
    this.sessions.delete(sessionId);
  }

  /**
   * Close all sessions
   */
  async closeAllSessions(): Promise<void> {
    for (const sessionId of this.sessions.keys()) {
      await this.closeSession(sessionId);
    }
  }

  /**
   * Get session IDs
   */
  getSessionIds(): string[] {
    return Array.from(this.sessions.keys());
  }

  /**
   * Get session count
   */
  getSessionCount(): number {
    return this.sessions.size;
  }

  /**
   * Set session metadata
   */
  setSessionMetadata(sessionId: string, key: string, value: unknown): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.metadata[key] = value;
    }
  }

  /**
   * Get session metadata
   */
  getSessionMetadata(sessionId: string, key: string): unknown {
    const session = this.sessions.get(sessionId);
    return session?.metadata[key];
  }

  /**
   * Cookie management helpers
   */
  
  /**
   * Get cookies from a page
   */
  async getCookies(page: Page): Promise<Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite?: 'Strict' | 'Lax' | 'None';
  }>> {
    return page.context().cookies();
  }

  /**
   * Set cookies for a page
   */
  async setCookies(
    page: Page,
    cookies: Array<{
      name: string;
      value: string;
      domain: string;
      path?: string;
      expires?: number;
      httpOnly?: boolean;
      secure?: boolean;
      sameSite?: 'Strict' | 'Lax' | 'None';
    }>
  ): Promise<void> {
    await page.context().addCookies(cookies);
  }

  /**
   * Clear all cookies from a page
   */
  async clearCookies(page: Page): Promise<void> {
    await page.context().clearCookies();
  }

  /**
   * Storage state helpers
   */

  /**
   * Get storage state from a page
   */
  async getStorageState(page: Page): Promise<{
    cookies: Array<{
      name: string;
      value: string;
      domain: string;
      path: string;
      expires: number;
      httpOnly: boolean;
      secure: boolean;
      sameSite?: 'Strict' | 'Lax' | 'None';
    }>;
    origins: Array<{
      origin: string;
      localStorage: Array<{ name: string; value: string }>;
    }>;
  }> {
    return page.context().storageState();
  }

  /**
   * Apply storage state to a context
   */
  async applyStorageState(
    context: BrowserContext,
    storageState: {
      cookies?: Array<{
        name: string;
        value: string;
        domain: string;
        path: string;
        expires: number;
        httpOnly: boolean;
        secure: boolean;
        sameSite?: 'Strict' | 'Lax' | 'None';
      }>;
      origins?: Array<{
        origin: string;
        localStorage: Array<{ name: string; value: string }>;
      }>;
    }
  ): Promise<void> {
    if (storageState.cookies) {
      await context.addCookies(storageState.cookies);
    }

    if (storageState.origins) {
      // Create a temporary page to set localStorage
      const page = await context.newPage();
      for (const origin of storageState.origins) {
        await page.goto(origin.origin);
        for (const { name, value } of origin.localStorage) {
          await page.evaluate(
            (item) => localStorage.setItem(item.name, item.value),
            { name, value }
          );
        }
      }
      await page.close();
    }
  }

  /**
   * Local storage helpers
   */

  /**
   * Get local storage from a page
   */
  async getLocalStorage(page: Page): Promise<Record<string, string>> {
    return page.evaluate(() => {
      const items: Record<string, string> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key) {
          items[key] = localStorage.getItem(key) || '';
        }
      }
      return items;
    });
  }

  /**
   * Set local storage for a page
   */
  async setLocalStorage(page: Page, items: Record<string, string>): Promise<void> {
    await page.evaluate(
      (items) => {
        for (const [key, value] of Object.entries(items)) {
          localStorage.setItem(key, value);
        }
      },
      items
    );
  }

  /**
   * Clear local storage
   */
  async clearLocalStorage(page: Page): Promise<void> {
    await page.evaluate(() => localStorage.clear());
  }

  /**
   * Session storage helpers
   */

  /**
   * Get session storage from a page
   */
  async getSessionStorage(page: Page): Promise<Record<string, string>> {
    return page.evaluate(() => {
      const items: Record<string, string> = {};
      for (let i = 0; i < sessionStorage.length; i++) {
        const key = sessionStorage.key(i);
        if (key) {
          items[key] = sessionStorage.getItem(key) || '';
        }
      }
      return items;
    });
  }

  /**
   * Clear session storage
   */
  async clearSessionStorage(page: Page): Promise<void> {
    await page.evaluate(() => sessionStorage.clear());
  }
}

/**
 * Create a browser context manager
 */
export function createContextManager(): BrowserContextManager {
  return new BrowserContextManager();
}
