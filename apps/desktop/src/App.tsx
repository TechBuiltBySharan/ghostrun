import { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { FlowList } from './components/FlowList';
import { FlowEditor } from './components/FlowEditor';
import { RunView } from './components/RunView';
import { RecordingPanel } from './components/RecordingPanel';
import { useAppStore } from './stores/appStore';

function App() {
  const { view, setView, selectedFlowId, selectedRunId, isRecording } = useAppStore();

  return (
    <div className="flex h-screen bg-background">
      <Sidebar />
      
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className="h-14 border-b bg-card flex items-center px-4 justify-between">
          <h1 className="text-lg font-semibold">
            {view === 'flows' && 'Flows'}
            {view === 'runs' && 'Runs'}
            {view === 'editor' && 'Flow Editor'}
            {view === 'recording' && 'Recording'}
          </h1>
          
          {isRecording && (
            <div className="flex items-center gap-2 text-red-500">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
              </span>
              <span className="text-sm font-medium">Recording</span>
            </div>
          )}
        </header>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {view === 'flows' && <FlowList />}
          {view === 'runs' && <RunView />}
          {view === 'editor' && selectedFlowId && <FlowEditor flowId={selectedFlowId} />}
          {view === 'recording' && <RecordingPanel />}
        </div>
      </main>
    </div>
  );
}

export default App;
