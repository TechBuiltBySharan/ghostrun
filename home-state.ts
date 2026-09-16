export interface HomeActionState {
  globalReady: boolean;
  projectReady: boolean;
  hasFlows: boolean;
  hasProfiles: boolean;
  openRepairs: number;
  lastFailedRun: { id: string; flowName: string } | null;
}

export function suggestHomeActions(state: HomeActionState): string[] {
  const actions: string[] = [];
  if (!state.globalReady) actions.push("setup-global");
  if (!state.projectReady) actions.push("setup-project");
  if (!state.hasFlows) actions.push("record-first-flow");
  if (state.hasFlows && !state.hasProfiles) actions.push("create-profile");
  if (state.lastFailedRun) actions.push("review-failure");
  if (state.openRepairs > 0) actions.push("review-repairs");
  if (state.hasFlows && state.hasProfiles) actions.push("run-flow");
  return actions;
}
