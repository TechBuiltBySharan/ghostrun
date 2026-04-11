import type { SerializedFlow } from './flow';
import type { StepResult } from './result';

/**
 * Represents a single execution run of a flow
 */
export interface FlowRun {
  id: string;
  flowId: string;
  flowVersion: string;
  status: RunStatus;
  startedAt: Date;
  completedAt?: Date;
  duration?: number; // ms
  steps: StepResult[];
  slots: SlotValues;
  summary: RunSummary;
  error?: RunError;
}

/**
 * Run status
 */
export type RunStatus = 'pending' | 'running' | 'passed' | 'failed' | 'aborted' | 'skipped';

/**
 * Slot values for parameterized execution
 */
export interface SlotValues {
  [slotId: string]: string;
}

/**
 * Run summary statistics
 */
export interface RunSummary {
  totalSteps: number;
  passedSteps: number;
  failedSteps: number;
  skippedSteps: number;
  totalDuration: number;
  screenshots: string[];
  networkLogs: string[];
  consoleLogs: string[];
}

/**
 * Run error information
 */
export interface RunError {
  stepId: string;
  nodeId: string;
  type: RunErrorType;
  message: string;
  expected?: string;
  actual?: string;
  stack?: string;
  screenshot?: string;
  networkError?: string;
}

/**
 * Error types during run
 */
export type RunErrorType =
  | 'navigation'
  | 'selector_not_found'
  | 'action_failed'
  | 'timeout'
  | 'assertion_failed'
  | 'network_error'
  | 'unexpected_state'
  | 'slot_missing'
  | 'internal';

/**
 * Serialized flow run for storage
 */
export interface SerializedFlowRun extends Omit<FlowRun, 'startedAt' | 'completedAt'> {
  startedAt: string;
  completedAt?: string;
}

/**
 * Flow run summary for listing
 */
export interface FlowRunSummary {
  id: string;
  flowId: string;
  flowName: string;
  status: RunStatus;
  startedAt: Date;
  duration?: number;
  passedSteps: number;
  failedSteps: number;
}

/**
 * Create a new flow run
 */
export function createFlowRun(params: {
  flowId: string;
  flowVersion: string;
  slots?: SlotValues;
}): FlowRun {
  const now = new Date();
  return {
    id: crypto.randomUUID(),
    flowId: params.flowId,
    flowVersion: params.flowVersion,
    status: 'pending',
    startedAt: now,
    steps: [],
    slots: params.slots ?? {},
    summary: {
      totalSteps: 0,
      passedSteps: 0,
      failedSteps: 0,
      skippedSteps: 0,
      totalDuration: 0,
      screenshots: [],
      networkLogs: [],
      consoleLogs: [],
    },
  };
}

/**
 * Serialize flow run for storage
 */
export function serializeFlowRun(run: FlowRun): SerializedFlowRun {
  return {
    ...run,
    startedAt: run.startedAt.toISOString(),
    completedAt: run.completedAt?.toISOString(),
  };
}

/**
 * Deserialize flow run from storage
 */
export function deserializeFlowRun(data: SerializedFlowRun): FlowRun {
  return {
    ...data,
    startedAt: new Date(data.startedAt),
    completedAt: data.completedAt ? new Date(data.completedAt) : undefined,
  };
}
