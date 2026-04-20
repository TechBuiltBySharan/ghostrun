/**
 * Keychain Integration - OS-level secure storage
 */

export interface Keychain {
  /**
   * Get a password from keychain
   */
  getPassword(service: string, account?: string): Promise<string | null>;
  
  /**
   * Set a password in keychain
   */
  setPassword(service: string, account: string, password: string): Promise<void>;
  
  /**
   * Delete a password from keychain
   */
  deletePassword(service: string, account: string): Promise<boolean>;
  
  /**
   * Find passwords in keychain
   */
  findPasswords(service: string): Promise<Array<{ account: string; password: string }>>;
}

/**
 * Get keychain for current platform
 */
export function getKeychain(service: string): Keychain {
  // Use dynamic import to check for keytar
  return new NodeKeychain(service);
}

/**
 * Node.js keychain implementation using native modules
 */
class NodeKeychain implements Keychain {
  private service: string;
  private useNative: boolean = false;
  private keytar: typeof import('keytar') | null = null;

  constructor(service: string) {
    this.service = service;
    this.tryLoadKeytar();
  }

  /**
   * Try to load keytar
   */
  private async tryLoadKeytar(): Promise<void> {
    try {
      // Dynamic import
      this.keytar = await import('keytar');
      this.useNative = true;
    } catch {
      console.warn('keytar not available, using in-memory storage');
      this.useNative = false;
    }
  }

  /**
   * Get a password from keychain
   */
  async getPassword(service: string, account?: string): Promise<string | null> {
    if (this.useNative && this.keytar) {
      return this.keytar.getPassword(service, account || this.service);
    }
    
    // Fallback to memory
    return this.getFromMemory(service, account);
  }

  /**
   * Set a password in keychain
   */
  async setPassword(service: string, account: string, password: string): Promise<void> {
    if (this.useNative && this.keytar) {
      await this.keytar.setPassword(service, account, password);
      return;
    }
    
    // Fallback to memory
    this.setInMemory(service, account, password);
  }

  /**
   * Delete a password from keychain
   */
  async deletePassword(service: string, account: string): Promise<boolean> {
    if (this.useNative && this.keytar) {
      return this.keytar.deletePassword(service, account);
    }
    
    // Fallback to memory
    return this.deleteFromMemory(service, account);
  }

  /**
   * Find passwords in keychain
   */
  async findPasswords(service: string): Promise<Array<{ account: string; password: string }>> {
    if (this.useNative && this.keytar) {
      const credentials = await this.keytar.findCredentials(service);
      return credentials;
    }
    
    // Fallback to memory
    return this.findFromMemory(service);
  }

  // In-memory fallback storage
  private memory: Map<string, string> = new Map();

  private getMemoryKey(service: string, account: string): string {
    return `${service}:${account}`;
  }

  private getFromMemory(service: string, account?: string): string | null {
    const key = this.getMemoryKey(service, account || this.service);
    return this.memory.get(key) || null;
  }

  private setInMemory(service: string, account: string, password: string): void {
    const key = this.getMemoryKey(service, account);
    this.memory.set(key, password);
  }

  private deleteFromMemory(service: string, account: string): boolean {
    const key = this.getMemoryKey(service, account);
    return this.memory.delete(key);
  }

  private findFromMemory(service: string): Array<{ account: string; password: string }> {
    const results: Array<{ account: string; password: string }> = [];
    const prefix = `${service}:`;

    for (const [key, password] of this.memory.entries()) {
      if (key.startsWith(prefix)) {
        const account = key.slice(prefix.length);
        results.push({ account, password });
      }
    }

    return results;
  }
}

/**
 * Environment-based keychain (for CI/headless environments)
 */
class EnvKeychain implements Keychain {
  private prefix: string;

  constructor(prefix: string = 'GHOSTRUN_') {
    this.prefix = prefix;
  }

  async getPassword(service: string, account?: string): Promise<string | null> {
    const key = this.getEnvKey(service, account);
    return process.env[key] || null;
  }

  async setPassword(service: string, account: string, password: string): Promise<void> {
    const key = this.getEnvKey(service, account);
    process.env[key] = password;
  }

  async deletePassword(service: string, account: string): Promise<boolean> {
    const key = this.getEnvKey(service, account);
    if (process.env[key]) {
      delete process.env[key];
      return true;
    }
    return false;
  }

  async findPasswords(service: string): Promise<Array<{ account: string; password: string }>> {
    const results: Array<{ account: string; password: string }> = [];
    const prefix = `${this.prefix}${service.toUpperCase()}_`;

    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith(prefix) && value) {
        const account = key.slice(prefix.length).toLowerCase();
        results.push({ account, password: value });
      }
    }

    return results;
  }

  private getEnvKey(service: string, account?: string): string {
    const servicePart = service.toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    const accountPart = account?.toUpperCase().replace(/[^A-Z0-9_]/g, '_') || 'DEFAULT';
    return `${this.prefix}${servicePart}_${accountPart}`;
  }
}

/**
 * Create keychain for environment
 */
export function createKeychain(): Keychain {
  // Check if we're in CI/headless environment
  if (process.env.CI || process.env.GHOSTRUN_USE_ENV === 'true') {
    return new EnvKeychain();
  }

  // Try native keychain first
  try {
    return new NodeKeychain('ghostrun');
  } catch {
    // Fall back to environment
    return new EnvKeychain();
  }
}
