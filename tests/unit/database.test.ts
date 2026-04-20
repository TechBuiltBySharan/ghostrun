/**
 * Unit tests for GhostRun database functionality
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

describe('Database', () => {
  const testDbPath = path.join(__dirname, '../.tmp/test-db.db');
  let db: Database.Database;

  beforeEach(() => {
    // Ensure test directory exists
    const tmpDir = path.dirname(testDbPath);
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
    // Clean up any existing test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  afterEach(() => {
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('Flow CRUD', () => {
    it('should create and retrieve a flow', () => {
      db = new Database(testDbPath);
      
      // Create tables manually for testing
      db.exec(`
        CREATE TABLE IF NOT EXISTS flows (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          graph TEXT,
          created_at INTEGER,
          updated_at INTEGER
        )
      `);

      const flowId = 'test-flow-1';
      const flowName = 'Test Flow';
      const flowData = {
        id: flowId,
        name: flowName,
        description: 'A test flow',
        graph: JSON.stringify({ nodes: [], edges: [] }),
        created_at: Date.now(),
        updated_at: Date.now(),
      };

      db.prepare(`
        INSERT INTO flows (id, name, description, graph, created_at, updated_at)
        VALUES (@id, @name, @description, @graph, @created_at, @updated_at)
      `).run(flowData);

      const result = db.prepare('SELECT * FROM flows WHERE id = ?').get(flowId) as any;

      expect(result).toBeDefined();
      expect(result.name).toBe(flowName);
      expect(result.id).toBe(flowId);

      db.close();
    });

    it('should update an existing flow', () => {
      db = new Database(testDbPath);
      
      db.exec(`
        CREATE TABLE IF NOT EXISTS flows (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          graph TEXT,
          created_at INTEGER,
          updated_at INTEGER
        )
      `);

      const flowId = 'test-flow-2';
      db.prepare(`
        INSERT INTO flows (id, name, description, graph, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(flowId, 'Original Name', 'Original desc', '{}', Date.now(), Date.now());

      const newName = 'Updated Name';
      db.prepare('UPDATE flows SET name = ?, updated_at = ? WHERE id = ?')
        .run(newName, Date.now(), flowId);

      const result = db.prepare('SELECT name FROM flows WHERE id = ?').get(flowId) as any;
      expect(result.name).toBe(newName);

      db.close();
    });

    it('should delete a flow', () => {
      db = new Database(testDbPath);
      
      db.exec(`
        CREATE TABLE IF NOT EXISTS flows (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT,
          graph TEXT,
          created_at INTEGER,
          updated_at INTEGER
        )
      `);

      const flowId = 'test-flow-3';
      db.prepare(`
        INSERT INTO flows (id, name, description, graph, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(flowId, 'To Delete', 'Will be deleted', '{}', Date.now(), Date.now());

      db.prepare('DELETE FROM flows WHERE id = ?').run(flowId);
      const result = db.prepare('SELECT * FROM flows WHERE id = ?').get(flowId);

      expect(result).toBeUndefined();

      db.close();
    });
  });

  describe('Run Tracking', () => {
    it('should track run history', () => {
      db = new Database(testDbPath);
      
      db.exec(`
        CREATE TABLE IF NOT EXISTS flows (id TEXT PRIMARY KEY, name TEXT, created_at INTEGER);
        CREATE TABLE IF NOT EXISTS runs (
          id TEXT PRIMARY KEY,
          flow_id TEXT,
          status TEXT,
          started_at INTEGER,
          ended_at INTEGER,
          error TEXT,
          passed INTEGER,
          FOREIGN KEY (flow_id) REFERENCES flows(id)
        )
      `);

      const flowId = 'test-flow-runs';
      const runId = 'test-run-1';
      
      db.prepare('INSERT INTO flows (id, name, created_at) VALUES (?, ?, ?)')
        .run(flowId, 'Run Test Flow', Date.now());

      db.prepare(`
        INSERT INTO runs (id, flow_id, status, started_at, ended_at, error, passed)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(runId, flowId, 'passed', Date.now() - 5000, Date.now(), null, 1);

      const result = db.prepare('SELECT * FROM runs WHERE flow_id = ?').get(flowId) as any;

      expect(result).toBeDefined();
      expect(result.status).toBe('passed');
      expect(result.passed).toBe(1);

      db.close();
    });
  });
});
