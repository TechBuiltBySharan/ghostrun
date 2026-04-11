/**
 * Flowmind CLI - Database Integration
 * 
 * Bridges the CLI commands with SQLite database operations.
 */

import { initDatabase, getDatabase, type FlowRecord, type RunRecord, type StepRecord } from '@flowmind/database';
import * as path from 'path';
import * as fs from 'fs';

// Data path
const HOME_DIR = process.env.HOME || process.env.USERPROFILE || '.';
const DATA_PATH = path.join(HOME_DIR, '.flowmind');
const DB_PATH = path.join(DATA_PATH, 'data');

// Ensure directories exist
export function ensureDataDir() {
  fs.mkdirSync(DB_PATH, { recursive: true });
  fs.mkdirSync(path.join(DATA_PATH, 'screenshots'), { recursive: true });
  fs.mkdirSync(path.join(DATA_PATH, 'reports'), { recursive: true });
  return DATA_PATH;
}

// Initialize database
export function initDB() {
  ensureDataDir();
  return initDatabase(DATA_PATH);
}

// Get database instance
export function getDB() {
  return getDatabase();
}

// Flow operations
export function listFlows() {
  const db = getDB();
  const flows = db.listFlows();
  return flows.map(f => ({
    id: f.id,
    name: f.name,
    description: f.description,
    appUrl: f.appUrl,
    nodeCount: countGraphNodes(f.graph),
    edgeCount: countGraphEdges(f.graph),
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
  }));
}

export function getFlow(id: string) {
  const db = getDB();
  return db.getFlow(id);
}

export function createFlow(name: string, options: { description?: string; appUrl?: string } = {}) {
  const db = getDB();
  return db.createFlow({
    name,
    description: options.description,
    appUrl: options.appUrl,
    graph: {
      nodes: [{ id: 'start', type: 'start', label: 'Start' }],
      edges: [],
    },
  });
}

export function updateFlowGraph(id: string, graph: object) {
  const db = getDB();
  return db.updateFlow(id, { graph });
}

export function deleteFlow(id: string) {
  const db = getDB();
  return db.deleteFlow(id);
}

// Run operations
export function listRuns(flowId?: string, limit = 50) {
  const db = getDB();
  return db.listRuns(flowId, limit);
}

export function getRun(id: string) {
  const db = getDB();
  return db.getRun(id);
}

export function createRun(flowId: string) {
  const db = getDB();
  return db.createRun(flowId);
}

export function updateRun(id: string, data: Partial<{ status: string; completedAt: Date; duration: number; errorMessage: string }>) {
  const db = getDB();
  return db.updateRun(id, data);
}

export function deleteRun(id: string) {
  const db = getDB();
  return db.deleteRun(id);
}

// Step operations
export function listSteps(runId: string) {
  const db = getDB();
  return db.listSteps(runId);
}

export function createStep(data: { runId: string; stepNumber: number; name: string; action: string; selector?: string; value?: string }) {
  const db = getDB();
  return db.createStep(data);
}

export function updateStep(id: string, data: Partial<{ status: string; duration: number; errorMessage: string; screenshotPath: string }>) {
  const db = getDB();
  return db.updateStep(id, data);
}

// Artifact operations
export function createArtifact(data: { runId: string; stepNumber?: number; type: string; path: string }) {
  const db = getDB();
  return db.createArtifact(data);
}

export function getScreenshotsPath(runId: string) {
  const db = getDB();
  return db.getScreenshotsPath(runId);
}

// Utility functions
function countGraphNodes(graphJson: string): number {
  try {
    const graph = JSON.parse(graphJson);
    return graph.nodes?.length || 0;
  } catch {
    return 0;
  }
}

function countGraphEdges(graphJson: string): number {
  try {
    const graph = JSON.parse(graphJson);
    return graph.edges?.length || 0;
  } catch {
    return 0;
  }
}

// Export paths
export { DATA_PATH, DB_PATH };
