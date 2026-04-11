import { useAppStore } from '../stores/appStore';

export function Sidebar() {
  const { view, setView, isRecording, isRunning } = useAppStore();

  const navItems = [
    { id: 'flows' as const, label: 'Flows', icon: '📋' },
    { id: 'runs' as const, label: 'Runs', icon: '▶️' },
    { id: 'recording' as const, label: 'Record', icon: '🎬', disabled: isRunning },
  ];

  return (
    <aside className="w-56 border-r bg-card flex flex-col">
      {/* Logo */}
      <div className="h-14 border-b flex items-center px-4">
        <span className="text-xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
          Flowmind
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2">
        <ul className="space-y-1">
          {navItems.map((item) => (
            <li key={item.id}>
              <button
                onClick={() => !item.disabled && setView(item.id)}
                disabled={item.disabled}
                className={`
                  w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium
                  transition-colors
                  ${
                    view === item.id
                      ? 'bg-primary text-primary-foreground'
                      : item.disabled
                      ? 'text-muted-foreground cursor-not-allowed'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                  }
                `}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
                {item.id === 'recording' && isRecording && (
                  <span className="ml-auto w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                )}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* Footer */}
      <div className="p-4 border-t text-xs text-muted-foreground">
        <p>Flowmind v0.1.0</p>
        <p className="mt-1">Local-first automation</p>
      </div>
    </aside>
  );
}
