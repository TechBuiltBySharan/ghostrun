'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('flowmind', {
  getStatus:     ()          => ipcRenderer.invoke('app:status'),
  listFlows:     ()          => ipcRenderer.invoke('flows:list'),
  deleteFlow:    (id)        => ipcRenderer.invoke('flows:delete', id),
  listRuns:      ()          => ipcRenderer.invoke('runs:list'),
  getSteps:      (runId)     => ipcRenderer.invoke('runs:get-steps', runId),
  getScreenshot: (filePath)  => ipcRenderer.invoke('runs:get-screenshot', filePath),
  runFlow:       (flowId)    => ipcRenderer.invoke('flow:run', flowId),
  openFile:      (filePath)  => ipcRenderer.invoke('shell:open', filePath),
  onRunProgress: (cb)        => {
    ipcRenderer.on('run:progress', (_, data) => cb(data));
    return () => ipcRenderer.removeAllListeners('run:progress');
  },
});
