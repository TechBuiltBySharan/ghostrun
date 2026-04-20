/**
 * Flow Storage - File-based storage for flow graphs
 */

import { type SerializedFlow, serializeFlow, deserializeFlow, type Flow } from '@ghostrun/core';
import { serializeGraph, deserializeGraph, type GraphState } from './graph';
import * as fs from 'fs';
import * as path from 'path';

export interface StorageConfig {
  basePath: string;
}

const DEFAULT_BASE_PATH = path.join(process.env.HOME || '.', '.flowmind', 'flows');

/**
 * Create storage instance
 */
export function createStorage(config: Partial<StorageConfig> = {}): Storage {
  return new Storage(config.basePath || DEFAULT_BASE_PATH);
}

/**
 * File-based flow storage
 */
export class Storage {
  private basePath: string;

  constructor(basePath: string) {
    this.basePath = basePath;
    this.ensureDirectory();
  }

  /**
   * Ensure storage directory exists
   */
  private ensureDirectory(): void {
    if (!fs.existsSync(this.basePath)) {
      fs.mkdirSync(this.basePath, { recursive: true });
    }
  }

  /**
   * Get flow file path
   */
  private getFlowPath(flowId: string): string {
    return path.join(this.basePath, `${flowId}.json`);
  }

  /**
   * Save a flow
   */
  async save(flow: Flow): Promise<void> {
    const serialized = serializeFlow(flow);
    const filePath = this.getFlowPath(flow.id);
    await fs.promises.writeFile(filePath, JSON.stringify(serialized, null, 2), 'utf-8');
  }

  /**
   * Load a flow by ID
   */
  async load(flowId: string): Promise<Flow | null> {
    const filePath = this.getFlowPath(flowId);
    
    if (!fs.existsSync(filePath)) {
      return null;
    }

    const content = await fs.promises.readFile(filePath, 'utf-8');
    return deserializeFlow(JSON.parse(content) as SerializedFlow);
  }

  /**
   * Delete a flow
   */
  async delete(flowId: string): Promise<boolean> {
    const filePath = this.getFlowPath(flowId);
    
    if (!fs.existsSync(filePath)) {
      return false;
    }

    await fs.promises.unlink(filePath);
    return true;
  }

  /**
   * List all flows
   */
  async list(): Promise<Array<{
    id: string;
    name: string;
    version: string;
    updatedAt: Date;
    nodeCount: number;
    edgeCount: number;
  }>> {
    this.ensureDirectory();
    
    const files = await fs.promises.readdir(this.basePath);
    const flows: Array<{
      id: string;
      name: string;
      version: string;
      updatedAt: Date;
      nodeCount: number;
      edgeCount: number;
    }> = [];

    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      const filePath = path.join(this.basePath, file);
      const content = await fs.promises.readFile(filePath, 'utf-8');
      
      try {
        const data = JSON.parse(content) as SerializedFlow;
        flows.push({
          id: data.id,
          name: data.name,
          version: data.version,
          updatedAt: new Date(data.updatedAt),
          nodeCount: data.nodes.length,
          edgeCount: data.edges.length,
        });
      } catch {
        // Skip invalid files
      }
    }

    return flows.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }

  /**
   * Check if flow exists
   */
  async exists(flowId: string): Promise<boolean> {
    return fs.existsSync(this.getFlowPath(flowId));
  }

  /**
   * Export all flows
   */
  async exportAll(): Promise<string> {
    const flows = await this.list();
    const data = await Promise.all(
      flows.map(async f => {
        const flow = await this.load(f.id);
        return flow;
      })
    );
    return JSON.stringify(data.filter(Boolean).map(f => serializeFlow(f!)), null, 2);
  }

  /**
   * Import flows from export
   */
  async importAll(json: string): Promise<number> {
    const data = JSON.parse(json) as SerializedFlow[];
    let imported = 0;

    for (const serialized of data) {
      const flow = deserializeFlow(serialized);
      await this.save(flow);
      imported++;
    }

    return imported;
  }
}

/**
 * Create graph storage with auto-save
 */
export function createGraphStorage(config: Partial<StorageConfig> = {}): {
  storage: Storage;
  saveGraph: (state: GraphState) => Promise<void>;
  loadGraph: (flowId: string) => Promise<GraphState | null>;
  deleteGraph: (flowId: string) => Promise<boolean>;
  listGraphs: () => Promise<ReturnType<Storage['list']>>;
} {
  const storage = createStorage(config);

  return {
    storage,
    
    async saveGraph(state: GraphState): Promise<void> {
      await storage.save(state.flow);
    },
    
    async loadGraph(flowId: string): Promise<GraphState | null> {
      const flow = await storage.load(flowId);
      if (!flow) return null;
      return { flow, currentNodeId: null };
    },
    
    async deleteGraph(flowId: string): Promise<boolean> {
      return storage.delete(flowId);
    },
    
    async listGraphs(): Promise<ReturnType<Storage['list']>> {
      return storage.list();
    },
  };
}
