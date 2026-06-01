/**
 * Unit tests for GhostRun database functionality
 *
 * Uses the real DatabaseManager from packages/database/src/manager.ts.
 * Sets HOME to a /tmp path so the manager does not write to ~/.ghostrun.
 */

import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

// --- temp home dir setup ---
const TEST_HOME = `/tmp/ghostrun-test-${process.pid}`;

let DatabaseManager: typeof import('../../packages/database/src/manager').DatabaseManager;

beforeAll(async () => {
  // Point HOME to a temp dir before the module is loaded so DATA_PATH resolves there.
  process.env.HOME = TEST_HOME;
  fs.mkdirSync(path.join(TEST_HOME, '.ghostrun', 'data'), { recursive: true });
  fs.mkdirSync(path.join(TEST_HOME, '.ghostrun', 'screenshots'), { recursive: true });
  fs.mkdirSync(path.join(TEST_HOME, '.ghostrun', 'sessions'), { recursive: true });
  // Dynamic import after env is set, so the module-level DATA_PATH picks up TEST_HOME.
  const mod = await import('../../packages/database/src/manager');
  DatabaseManager = mod.DatabaseManager;
});

afterAll(() => {
  fs.rmSync(TEST_HOME, { recursive: true, force: true });
});

describe('Database', () => {
  let manager: InstanceType<typeof DatabaseManager>;

  beforeEach(() => {
    manager = new DatabaseManager();
  });

  afterEach(() => {
    manager.close();
    // Remove the DB file so each test starts with an empty database.
    const dbPath = path.join(TEST_HOME, '.ghostrun', 'data', 'ghostrun.db');
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
  });

  describe('Flow CRUD', () => {
    it('should create and retrieve a flow', () => {
      const flow = manager.createFlow({ name: 'Test Flow', description: 'A test flow' });

      expect(flow).toBeDefined();
      expect(flow.id).toBeTruthy();
      expect(flow.name).toBe('Test Flow');
      expect(flow.description).toBe('A test flow');

      const retrieved = manager.getFlow(flow.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.name).toBe('Test Flow');
    });

    it('should update an existing flow', () => {
      const flow = manager.createFlow({ name: 'Original Name', description: 'Original desc' });

      manager.updateFlow(flow.id, { name: 'Updated Name' });

      const updated = manager.getFlow(flow.id);
      expect(updated!.name).toBe('Updated Name');
      expect(updated!.description).toBe('Original desc');
    });

    it('should delete a flow', () => {
      const flow = manager.createFlow({ name: 'To Delete' });
      const deleted = manager.deleteFlow(flow.id);

      expect(deleted).toBe(true);
      expect(manager.getFlow(flow.id)).toBeNull();
    });

    it('should list all flows', () => {
      manager.createFlow({ name: 'Flow A' });
      manager.createFlow({ name: 'Flow B' });

      const flows = manager.listFlows();
      expect(flows.length).toBe(2);
    });
  });

  describe('Run Tracking', () => {
    it('should create a run for a flow and track status', () => {
      const flow = manager.createFlow({ name: 'Run Test Flow' });
      const run = manager.createRun(flow.id);

      expect(run).toBeDefined();
      expect(run.flowId).toBe(flow.id);
      expect(run.status).toBe('running');

      manager.updateRun(run.id, {
        status: 'passed',
        completedAt: new Date(),
        duration: 1234,
      });

      const updated = manager.getRun(run.id);
      expect(updated!.status).toBe('passed');
      expect(updated!.duration).toBe(1234);
    });

    it('should list runs for a flow', () => {
      const flow = manager.createFlow({ name: 'Multi-run Flow' });
      manager.createRun(flow.id);
      manager.createRun(flow.id);

      const runs = manager.listRuns(flow.id);
      expect(runs.length).toBe(2);
      runs.forEach(r => expect(r.flowId).toBe(flow.id));
    });

    it('should track flow stats (pass rate)', () => {
      const flow = manager.createFlow({ name: 'Stats Flow' });

      const run1 = manager.createRun(flow.id);
      manager.updateRun(run1.id, { status: 'passed' });

      const run2 = manager.createRun(flow.id);
      manager.updateRun(run2.id, { status: 'failed' });

      const stats = manager.getFlowStats(flow.id);
      expect(stats.totalRuns).toBe(2);
      expect(stats.passRate).toBe(0.5);
      expect(stats.lastRunStatus).toBeTruthy();
    });
  });
});
