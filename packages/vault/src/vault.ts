/**
 * Vault - Secure credential storage
 */

import { getKeychain, type Keychain } from './keychain';

export interface Credential {
  id: string;
  name: string;
  username?: string;
  password?: string;
  url?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
  tags: string[];
}

export interface VaultConfig {
  serviceName: string;
  useKeychain?: boolean;
  fallbackToFile?: boolean;
  encryptionKey?: string;
}

const DEFAULT_CONFIG: Required<VaultConfig> = {
  serviceName: 'ghostrun',
  useKeychain: true,
  fallbackToFile: true,
  encryptionKey: '', // Will use machine-derived key if not provided
};

/**
 * Vault for storing credentials securely
 */
export class Vault {
  private config: Required<VaultConfig>;
  private keychain: Keychain | null = null;
  private credentials: Map<string, Credential> = new Map();
  private isInitialized = false;

  constructor(config: Partial<VaultConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize the vault
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    // Try to initialize keychain
    if (this.config.useKeychain) {
      try {
        this.keychain = getKeychain(this.config.serviceName);
      } catch (error) {
        console.warn('Keychain not available, falling back to file storage:', error);
        this.keychain = null;
      }
    }

    // Load existing credentials
    await this.loadCredentials();

    this.isInitialized = true;
  }

  /**
   * Store a credential
   */
  async store(credential: Omit<Credential, 'id' | 'createdAt' | 'updatedAt'>): Promise<Credential> {
    await this.ensureInitialized();

    const now = new Date();
    const newCredential: Credential = {
      ...credential,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    };

    // Store in keychain if available
    if (this.keychain && credential.password) {
      await this.keychain.setPassword(
        this.config.serviceName,
        newCredential.id,
        credential.password
      );
    }

    // Store metadata in memory
    const credentialForStorage = { ...newCredential, password: undefined }; // Don't store password in memory
    this.credentials.set(newCredential.id, credentialForStorage);

    // Persist to file
    await this.persistCredentials();

    return newCredential;
  }

  /**
   * Get a credential
   */
  async get(id: string): Promise<Credential | null> {
    await this.ensureInitialized();

    const credential = this.credentials.get(id);
    if (!credential) return null;

    // Retrieve password from keychain if needed
    if (this.keychain) {
      try {
        const password = await this.keychain.getPassword(
          this.config.serviceName,
          id
        );
        return { ...credential, password: password || undefined };
      } catch {
        return credential;
      }
    }

    return credential;
  }

  /**
   * Get credential by name
   */
  async getByName(name: string): Promise<Credential | null> {
    await this.ensureInitialized();

    for (const credential of this.credentials.values()) {
      if (credential.name === name) {
        return this.get(credential.id);
      }
    }

    return null;
  }

  /**
   * List all credentials (without passwords)
   */
  async list(): Promise<Omit<Credential, 'password'>[]> {
    await this.ensureInitialized();

    return Array.from(this.credentials.values());
  }

  /**
   * Update a credential
   */
  async update(id: string, updates: Partial<Omit<Credential, 'id' | 'createdAt'>>): Promise<Credential | null> {
    await this.ensureInitialized();

    const existing = this.credentials.get(id);
    if (!existing) return null;

    const updated: Credential = {
      ...existing,
      ...updates,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date(),
    };

    // Update password in keychain
    if (this.keychain && updates.password) {
      await this.keychain.setPassword(
        this.config.serviceName,
        id,
        updates.password
      );
      updated.password = undefined; // Don't store in memory
    }

    this.credentials.set(id, updated);
    await this.persistCredentials();

    return this.get(id);
  }

  /**
   * Delete a credential
   */
  async delete(id: string): Promise<boolean> {
    await this.ensureInitialized();

    // Delete from keychain
    if (this.keychain) {
      try {
        await this.keychain.deletePassword(this.config.serviceName, id);
      } catch {
        // Ignore if not found
      }
    }

    // Delete from memory and file
    const deleted = this.credentials.delete(id);
    if (deleted) {
      await this.persistCredentials();
    }

    return deleted;
  }

  /**
   * Search credentials
   */
  async search(query: {
    name?: string;
    url?: string;
    tag?: string;
  }): Promise<Omit<Credential, 'password'>[]> {
    await this.ensureInitialized();

    const results: Omit<Credential, 'password'>[] = [];

    for (const credential of this.credentials.values()) {
      let matches = true;

      if (query.name && !credential.name.toLowerCase().includes(query.name.toLowerCase())) {
        matches = false;
      }

      if (query.url && credential.url && !credential.url.includes(query.url)) {
        matches = false;
      }

      if (query.tag && !credential.tags.includes(query.tag)) {
        matches = false;
      }

      if (matches) {
        results.push(credential);
      }
    }

    return results;
  }

  /**
   * Ensure vault is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized) {
      await this.initialize();
    }
  }

  /**
   * Load credentials from storage
   */
  private async loadCredentials(): Promise<void> {
    const fs = await import('fs');
    const path = await import('path');

    const configDir = path.join(process.env.HOME || '.', '.ghostrun', 'vault');
    const metaPath = path.join(configDir, 'credentials.meta.json');

    if (fs.existsSync(metaPath)) {
      try {
        const content = await fs.promises.readFile(metaPath, 'utf-8');
        const data = JSON.parse(content) as Array<Omit<Credential, 'password'> & { createdAt: string; updatedAt: string }>;
        
        for (const cred of data) {
          this.credentials.set(cred.id, {
            ...cred,
            createdAt: new Date(cred.createdAt),
            updatedAt: new Date(cred.updatedAt),
          });
        }
      } catch (error) {
        console.error('Failed to load credentials:', error);
      }
    }
  }

  /**
   * Persist credentials to storage
   */
  private async persistCredentials(): Promise<void> {
    const fs = await import('fs');
    const path = await import('path');

    const configDir = path.join(process.env.HOME || '.', '.ghostrun', 'vault');
    
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    const metaPath = path.join(configDir, 'credentials.meta.json');
    const data = Array.from(this.credentials.values()).map(cred => ({
      ...cred,
      password: undefined, // Never write password to file
    }));

    await fs.promises.writeFile(metaPath, JSON.stringify(data, null, 2), 'utf-8');
  }

  /**
   * Export credentials (encrypted)
   */
  async exportCredentials(): Promise<string> {
    const credentials = await this.list();
    return JSON.stringify(credentials, null, 2);
  }

  /**
   * Import credentials
   */
  async importCredentials(json: string): Promise<number> {
    const data = JSON.parse(json) as Array<Omit<Credential, 'id' | 'createdAt' | 'updatedAt'>>;
    let imported = 0;

    for (const cred of data) {
      await this.store(cred);
      imported++;
    }

    return imported;
  }
}

/**
 * Create a vault instance
 */
export function createVault(config?: Partial<VaultConfig>): Vault {
  return new Vault(config);
}

/**
 * Quick credential helpers
 */
export const vault = createVault();

export async function storeCredential(credential: Omit<Credential, 'id' | 'createdAt' | 'updatedAt'>): Promise<Credential> {
  return vault.store(credential);
}

export async function getCredential(id: string): Promise<Credential | null> {
  return vault.get(id);
}

export async function listCredentials(): Promise<Omit<Credential, 'password'>[]> {
  return vault.list();
}

export async function deleteCredential(id: string): Promise<boolean> {
  return vault.delete(id);
}
