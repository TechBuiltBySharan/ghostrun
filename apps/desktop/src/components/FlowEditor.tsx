import { useState, useEffect } from 'react';

interface FlowEditorProps {
  flowId: string;
}

export function FlowEditor({ flowId }: FlowEditorProps) {
  const [flowName, setFlowName] = useState('');
  const [nodes, setNodes] = useState<Array<{ id: string; label: string; type: string }>>([]);

  useEffect(() => {
    // Load flow data
    // In production, this would fetch from API
    setFlowName('Login Flow');
    setNodes([
      { id: '1', label: 'Start', type: 'start' },
      { id: '2', label: 'Enter credentials', type: 'action' },
      { id: '3', label: 'Dashboard', type: 'screen' },
      { id: '4', label: 'End', type: 'end' },
    ]);
  }, [flowId]);

  return (
    <div className="h-full flex">
      {/* Canvas */}
      <div className="flex-1 bg-muted/30 flex items-center justify-center">
        <div className="text-center text-muted-foreground">
          <span className="text-6xl mb-4 block">🎯</span>
          <p className="text-lg font-medium">Flow Graph</p>
          <p className="text-sm mt-1">Visualize and edit your flow</p>
          
          {/* Node visualization */}
          <div className="mt-8 flex flex-col items-center gap-2">
            {nodes.map((node, i) => (
              <div key={node.id} className="flex items-center gap-4">
                <div
                  className={`
                    px-4 py-2 rounded-lg border-2 font-medium
                    ${node.type === 'start' ? 'bg-green-100 border-green-500 text-green-700' : ''}
                    ${node.type === 'end' ? 'bg-red-100 border-red-500 text-red-700' : ''}
                    ${node.type === 'action' ? 'bg-blue-100 border-blue-500 text-blue-700' : ''}
                    ${node.type === 'screen' ? 'bg-purple-100 border-purple-500 text-purple-700' : ''}
                  `}
                >
                  {node.label}
                </div>
                {i < nodes.length - 1 && (
                  <div className="w-8 h-0.5 bg-border" />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Properties Panel */}
      <div className="w-80 border-l bg-card flex flex-col">
        <div className="p-4 border-b">
          <h3 className="font-semibold">Properties</h3>
        </div>
        
        <div className="flex-1 overflow-auto p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input
              type="text"
              value={flowName}
              onChange={(e) => setFlowName(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg bg-background"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Nodes</label>
            <div className="space-y-2">
              {nodes.map((node) => (
                <div
                  key={node.id}
                  className="flex items-center gap-2 p-2 border rounded bg-muted/50"
                >
                  <span
                    className={`
                      w-2 h-2 rounded-full
                      ${node.type === 'start' ? 'bg-green-500' : ''}
                      ${node.type === 'end' ? 'bg-red-500' : ''}
                      ${node.type === 'action' ? 'bg-blue-500' : ''}
                      ${node.type === 'screen' ? 'bg-purple-500' : ''}
                    `}
                  />
                  <span className="text-sm">{node.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="p-4 border-t flex gap-2">
          <button className="flex-1 px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium">
            Save
          </button>
          <button className="flex-1 px-4 py-2 bg-secondary rounded-lg font-medium">
            Run
          </button>
        </div>
      </div>
    </div>
  );
}
