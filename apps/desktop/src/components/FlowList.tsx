import { useState } from 'react';
import { useAppStore } from '../stores/appStore';

interface FlowSummary {
  id: string;
  name: string;
  version: string;
  nodeCount: number;
  edgeCount: number;
  updatedAt: Date;
}

// Mock data - in production this would come from the API
const mockFlows: FlowSummary[] = [
  {
    id: '1',
    name: 'Login Flow',
    version: '1.0.0',
    nodeCount: 5,
    edgeCount: 4,
    updatedAt: new Date(),
  },
  {
    id: '2',
    name: 'Checkout Flow',
    version: '1.0.0',
    nodeCount: 12,
    edgeCount: 11,
    updatedAt: new Date(Date.now() - 86400000),
  },
];

export function FlowList() {
  const { setSelectedFlowId } = useAppStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [flows] = useState<FlowSummary[]>(mockFlows);

  const filteredFlows = flows.filter((flow) =>
    flow.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleRunFlow = (flowId: string) => {
    console.log('Running flow:', flowId);
  };

  return (
    <div className="h-full flex flex-col p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold">Flows</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Manage and run your automated flows
          </p>
        </div>
        <button
          onClick={() => console.log('Create new flow')}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
        >
          New Flow
        </button>
      </div>

      {/* Search */}
      <div className="mb-6">
        <input
          type="text"
          placeholder="Search flows..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-4 py-2 border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>

      {/* Flow Grid */}
      <div className="flex-1 overflow-auto">
        {filteredFlows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
            <span className="text-4xl mb-4">📋</span>
            <p>No flows found</p>
            <p className="text-sm mt-1">Create a new flow to get started</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredFlows.map((flow) => (
              <div
                key={flow.id}
                className="border rounded-lg p-4 bg-card hover:border-primary/50 transition-colors cursor-pointer"
                onClick={() => setSelectedFlowId(flow.id)}
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-semibold text-lg">{flow.name}</h3>
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                    v{flow.version}
                  </span>
                </div>
                
                <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
                  <span>{flow.nodeCount} nodes</span>
                  <span>{flow.edgeCount} edges</span>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    Updated {flow.updatedAt.toLocaleDateString()}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleRunFlow(flow.id);
                    }}
                    className="px-3 py-1 text-sm bg-secondary rounded hover:bg-secondary/80 transition-colors"
                  >
                    Run
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
