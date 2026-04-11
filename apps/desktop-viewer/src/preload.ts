/**
 * Preload script - exposes safe APIs to renderer
 */

import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods to renderer
contextBridge.exposeInMainWorld('flowmind', {
  // High-level wrapper functions
  getStats: async () => {
    const flows = await ipcRenderer.invoke('db:getFlows');
    const runs = await ipcRenderer.invoke('db:getRuns');
    return {
      flowCount: flows.length,
      totalRuns: runs.length,
      passed: runs.filter((r: any) => r.status === 'passed').length,
      failed: runs.filter((r: any) => r.status === 'failed').length,
    };
  },

  getFlows: async () => {
    const flows = await ipcRenderer.invoke('db:getFlows');
    // Add node count for each flow
    return Promise.all(flows.map(async (flow: any) => {
      const graph = await ipcRenderer.invoke('db:getFlowGraph', flow.id);
      return {
        ...flow,
        nodeCount: graph?.data?.nodes?.length || 0,
      };
    }));
  },

  getFlow: async (id: string) => {
    const flows = await ipcRenderer.invoke('db:getFlows');
    const flow = flows.find((f: any) => f.id === id);
    if (!flow) return null;
    const graph = await ipcRenderer.invoke('db:getFlowGraph', id);
    return {
      ...flow,
      graph: graph?.data || { nodes: [], edges: [] },
      nodeCount: graph?.data?.nodes?.length || 0,
    };
  },

  getRuns: async (flowId: string | null, limit: number = 50) => {
    const runs = await ipcRenderer.invoke('db:getRuns', flowId);
    return runs.slice(0, limit);
  },

  getRun: async (id: string) => {
    const runs = await ipcRenderer.invoke('db:getRuns');
    const run = runs.find((r: any) => r.id === id);
    if (!run) return null;
    const steps = await ipcRenderer.invoke('db:getSteps', id);
    return { ...run, steps };
  },

  getScreenshots: async (runId: string) => {
    const screenshotsPath = await ipcRenderer.invoke('path:getScreenshots');
    // Return array of screenshot paths for this run
    const run = (await ipcRenderer.invoke('db:getRuns')).find((r: any) => r.id === runId);
    if (!run) return [];
    // Get screenshots from the screenshots folder
    try {
      const path = `${screenshotsPath}/${runId}`;
      const files = await ipcRenderer.invoke('fs:readDir', path);
      return files
        .filter((f: string) => f.endsWith('.png'))
        .map((f: string) => `${path}/${f}`);
    } catch {
      return [];
    }
  },

  getDataPath: async () => {
    return ipcRenderer.invoke('path:getData');
  },

  runFlow: async (flowId: string) => {
    return ipcRenderer.invoke('cli:spawn', 'run', [flowId]);
  },

  // CLI commands (spawn mode for real-time output)
  cli: {
    run: (command: string, args: string[]) => ipcRenderer.invoke('cli:run', command, args),
    spawn: (command: string, args: string[]) => ipcRenderer.invoke('cli:spawn', command, args),
    kill: () => ipcRenderer.invoke('cli:kill'),
    onOutput: (callback: (data: string) => void) => {
      ipcRenderer.on('cli:output', (_, data) => callback(data));
    },
    onError: (callback: (data: string) => void) => {
      ipcRenderer.on('cli:error', (_, data) => callback(data));
    },
  },

  // File system
  fs: {
    readDir: (path: string) => ipcRenderer.invoke('fs:readDir', path),
    readFile: (path: string) => ipcRenderer.invoke('fs:readFile', path),
    exists: (path: string) => ipcRenderer.invoke('fs:exists', path),
  },

  // Database
  db: {
    getFlows: () => ipcRenderer.invoke('db:getFlows'),
    getRuns: (flowId?: string) => ipcRenderer.invoke('db:getRuns', flowId),
    getSteps: (runId: string) => ipcRenderer.invoke('db:getSteps', runId),
    getFlowGraph: (flowId: string) => ipcRenderer.invoke('db:getFlowGraph', flowId),
  },

  // Paths
  path: {
    getData: () => ipcRenderer.invoke('path:getData'),
    getScreenshots: () => ipcRenderer.invoke('path:getScreenshots'),
  },

  // Shell
  shell: {
    openExternal: (url: string) => ipcRenderer.invoke('shell:openExternal', url),
  },
});

// Also expose as 'api' for backward compatibility with existing HTML
contextBridge.exposeInMainWorld('api', {
  getStats: () => (window as any).flowmind.getStats(),
  getFlows: () => (window as any).flowmind.getFlows(),
  getFlow: (id: string) => (window as any).flowmind.getFlow(id),
  getRuns: (flowId: string | null, limit: number) => (window as any).flowmind.getRuns(flowId, limit),
  getRun: (id: string) => (window as any).flowmind.getRun(id),
  getScreenshots: (runId: string) => (window as any).flowmind.getScreenshots(runId),
  getDataPath: () => (window as any).flowmind.getDataPath(),
  runFlow: (flowId: string) => (window as any).flowmind.runFlow(flowId),
});
