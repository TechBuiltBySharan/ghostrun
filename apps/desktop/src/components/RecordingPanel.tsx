import { useState } from 'react';
import { useAppStore } from '../stores/appStore';

export function RecordingPanel() {
  const { isRecording, setIsRecording, setView } = useAppStore();
  const [targetUrl, setTargetUrl] = useState('');
  const [recordedActions, setRecordedActions] = useState<Array<{ id: string; type: string; label: string }>>([]);

  const handleStartRecording = () => {
    if (!targetUrl) {
      alert('Please enter a target URL');
      return;
    }
    setIsRecording(true);
    // In production, this would start the browser recording session
  };

  const handleStopRecording = () => {
    setIsRecording(false);
    // In production, this would stop recording and show summary
  };

  const handleSaveFlow = () => {
    console.log('Saving flow with', recordedActions.length, 'actions');
    setView('flows');
  };

  return (
    <div className="h-full flex flex-col p-6">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold">Learn Mode</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Record user actions to create automated flows
        </p>
      </div>

      {/* Recording Controls */}
      <div className="bg-card border rounded-lg p-6 mb-6">
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium mb-2">Target URL</label>
            <input
              type="url"
              placeholder="https://example.com"
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              disabled={isRecording}
              className="w-full px-4 py-2 border rounded-lg bg-background"
            />
          </div>

          {!isRecording ? (
            <button
              onClick={handleStartRecording}
              className="px-6 py-2 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 transition-colors flex items-center gap-2"
            >
              <span className="w-3 h-3 rounded-full bg-white" />
              Start Recording
            </button>
          ) : (
            <button
              onClick={handleStopRecording}
              className="px-6 py-2 bg-gray-600 text-white rounded-lg font-medium hover:bg-gray-700 transition-colors"
            >
              Stop Recording
            </button>
          )}
        </div>
      </div>

      {/* Recording Status */}
      {isRecording && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex items-center gap-3">
          <span className="relative flex h-4 w-4">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500"></span>
          </span>
          <div>
            <p className="font-medium text-red-700">Recording in progress...</p>
            <p className="text-sm text-red-600">
              Click on elements in the browser to capture actions
            </p>
          </div>
        </div>
      )}

      {/* Recorded Actions */}
      <div className="flex-1 bg-card border rounded-lg flex flex-col">
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="font-semibold">Recorded Actions ({recordedActions.length})</h3>
          {recordedActions.length > 0 && (
            <button
              onClick={() => setRecordedActions([])}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          )}
        </div>

        <div className="flex-1 overflow-auto p-4">
          {recordedActions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <span className="text-4xl mb-2">🎬</span>
              <p>No actions recorded yet</p>
              <p className="text-sm mt-1">Start recording to capture user actions</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recordedActions.map((action, i) => (
                <div
                  key={action.id}
                  className="flex items-center gap-3 p-2 bg-muted/50 rounded"
                >
                  <span className="w-6 h-6 bg-primary/10 text-primary text-xs font-medium rounded flex items-center justify-center">
                    {i + 1}
                  </span>
                  <span className="flex-1">{action.label}</span>
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                    {action.type}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {recordedActions.length > 0 && (
          <div className="p-4 border-t flex gap-3">
            <button
              onClick={() => setRecordedActions([])}
              className="flex-1 px-4 py-2 border rounded-lg font-medium hover:bg-muted transition-colors"
            >
              Discard
            </button>
            <button
              onClick={handleSaveFlow}
              className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
            >
              Save Flow
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
