/**
 * Report Storage - Store and retrieve reports
 */

import type { FlowRun, FlowRunSummary } from '@ghostrun/core';
import { serializeFlowRun, deserializeFlowRun, type SerializedFlowRun } from '@ghostrun/core';
import * as fs from 'fs';
import * as path from 'path';

export interface ReportStorageConfig {
  basePath: string;
}

const DEFAULT_BASE_PATH = path.join(process.env.HOME || '.', '.flowmind', 'runs');

/**
 * Create report storage
 */
export function createReportStorage(config: Partial<ReportStorageConfig> = {}): ReportStorage {
  return new ReportStorage(config.basePath || DEFAULT_BASE_PATH);
}

/**
 * Report storage class
 */
export class ReportStorage {
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
   * Get run directory path
   */
  private getRunDir(runId: string): string {
    return path.join(this.basePath, runId);
  }

  /**
   * Save a run
   */
  async save(run: FlowRun): Promise<void> {
    const runDir = this.getRunDir(run.id);
    
    if (!fs.existsSync(runDir)) {
      fs.mkdirSync(runDir, { recursive: true });
    }

    const serialized = serializeFlowRun(run);
    await fs.promises.writeFile(
      path.join(runDir, 'run.json'),
      JSON.stringify(serialized, null, 2)
    );
  }

  /**
   * Load a run by ID
   */
  async load(runId: string): Promise<FlowRun | null> {
    const runPath = path.join(this.getRunDir(runId), 'run.json');
    
    if (!fs.existsSync(runPath)) {
      return null;
    }

    const content = await fs.promises.readFile(runPath, 'utf-8');
    return deserializeFlowRun(JSON.parse(content) as SerializedFlowRun);
  }

  /**
   * Delete a run
   */
  async delete(runId: string): Promise<boolean> {
    const runDir = this.getRunDir(runId);
    
    if (!fs.existsSync(runDir)) {
      return false;
    }

    // Delete all files in directory
    const files = await fs.promises.readdir(runDir);
    for (const file of files) {
      await fs.promises.unlink(path.join(runDir, file));
    }
    
    // Delete directory
    await fs.promises.rmdir(runDir);
    return true;
  }

  /**
   * List all runs
   */
  async list(filter?: {
    flowId?: string;
    status?: string;
    limit?: number;
  }): Promise<FlowRunSummary[]> {
    this.ensureDirectory();
    
    const entries = await fs.promises.readdir(this.basePath);
    const runs: FlowRunSummary[] = [];

    for (const entry of entries) {
      const runPath = path.join(this.basePath, entry, 'run.json');
      
      if (!fs.existsSync(runPath)) continue;

      try {
        const content = await fs.promises.readFile(runPath, 'utf-8');
        const run = deserializeFlowRun(JSON.parse(content) as SerializedFlowRun);
        
        // Apply filters
        if (filter?.flowId && run.flowId !== filter.flowId) continue;
        if (filter?.status && run.status !== filter.status) continue;
        
        runs.push({
          id: run.id,
          flowId: run.flowId,
          flowName: run.flowId, // Will be enriched by caller if needed
          status: run.status,
          startedAt: run.startedAt,
          duration: run.duration,
          passedSteps: run.summary.passedSteps,
          failedSteps: run.summary.failedSteps,
        });
      } catch {
        // Skip invalid files
      }
    }

    // Sort by date descending
    runs.sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());

    // Apply limit
    if (filter?.limit) {
      return runs.slice(0, filter.limit);
    }

    return runs;
  }

  /**
   * Get runs for a specific flow
   */
  async getRunsForFlow(flowId: string): Promise<FlowRunSummary[]> {
    return this.list({ flowId });
  }

  /**
   * Get latest run for a flow
   */
  async getLatestRunForFlow(flowId: string): Promise<FlowRun | null> {
    const runs = await this.getRunsForFlow(flowId);
    if (runs.length === 0) return null;
    return this.load(runs[0].id);
  }

  /**
   * Get run statistics for a flow
   */
  async getRunStats(flowId: string): Promise<{
    totalRuns: number;
    passedRuns: number;
    failedRuns: number;
    averageDuration: number;
    lastRunAt?: Date;
  }> {
    const runs = await this.getRunsForFlow(flowId);
    
    if (runs.length === 0) {
      return {
        totalRuns: 0,
        passedRuns: 0,
        failedRuns: 0,
        averageDuration: 0,
      };
    }

    let passedRuns = 0;
    let failedRuns = 0;
    let totalDuration = 0;

    for (const run of runs) {
      if (run.status === 'passed') passedRuns++;
      else if (run.status === 'failed') failedRuns++;
      if (run.duration) totalDuration += run.duration;
    }

    return {
      totalRuns: runs.length,
      passedRuns,
      failedRuns,
      averageDuration: totalDuration / runs.length,
      lastRunAt: runs[0].startedAt,
    };
  }

  /**
   * Export runs as JSON
   */
  async exportRuns(flowId?: string): Promise<string> {
    const runs = await this.list({ flowId });
    const runData = await Promise.all(
      runs.map(async r => {
        const run = await this.load(r.id);
        return run ? serializeFlowRun(run) : null;
      })
    );
    return JSON.stringify(runData.filter(Boolean), null, 2);
  }

  /**
   * Import runs from JSON
   */
  async importRuns(json: string): Promise<number> {
    const data = JSON.parse(json) as SerializedFlowRun[];
    let imported = 0;

    for (const serialized of data) {
      const run = deserializeFlowRun(serialized);
      await this.save(run);
      imported++;
    }

    return imported;
  }

  /**
   * Get storage size in bytes
   */
  async getStorageSize(): Promise<number> {
    let totalSize = 0;

    const calculateDirSize = async (dir: string): Promise<number> => {
      let size = 0;
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          size += await calculateDirSize(fullPath);
        } else {
          const stats = await fs.promises.stat(fullPath);
          size += stats.size;
        }
      }

      return size;
    };

    totalSize = await calculateDirSize(this.basePath);
    return totalSize;
  }

  /**
   * Clean old runs (keep last N runs per flow)
   */
  async cleanOldRuns(keepLast: number = 10): Promise<number> {
    const runs = await this.list();
    
    // Group by flow
    const byFlow = new Map<string, FlowRunSummary[]>();
    for (const run of runs) {
      const existing = byFlow.get(run.flowId) || [];
      existing.push(run);
      byFlow.set(run.flowId, existing);
    }

    let deleted = 0;

    // Delete old runs
    for (const [, flowRuns] of byFlow) {
      const toDelete = flowRuns.slice(keepLast);
      for (const run of toDelete) {
        const success = await this.delete(run.id);
        if (success) deleted++;
      }
    }

    return deleted;
  }
}
