export function RunView() {
  return (
    <div className="h-full flex flex-col p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold">Runs</h2>
        <p className="text-sm text-muted-foreground mt-1">
          View test execution results and reports
        </p>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
          <span className="text-6xl mb-4">📊</span>
          <p className="text-lg font-medium">No runs yet</p>
          <p className="text-sm mt-1">Run a flow to see results here</p>
        </div>
      </div>
    </div>
  );
}
