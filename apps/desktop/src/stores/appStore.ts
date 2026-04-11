import { create } from 'zustand';

interface AppState {
  view: 'flows' | 'runs' | 'editor' | 'recording';
  selectedFlowId: string | null;
  selectedRunId: string | null;
  isRecording: boolean;
  isRunning: boolean;
  
  setView: (view: AppState['view']) => void;
  setSelectedFlowId: (id: string | null) => void;
  setSelectedRunId: (id: string | null) => void;
  setIsRecording: (recording: boolean) => void;
  setIsRunning: (running: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  view: 'flows',
  selectedFlowId: null,
  selectedRunId: null,
  isRecording: false,
  isRunning: false,
  
  setView: (view) => set({ view }),
  setSelectedFlowId: (id) => set({ selectedFlowId: id, view: id ? 'editor' : 'flows' }),
  setSelectedRunId: (id) => set({ selectedRunId: id }),
  setIsRecording: (recording) => set({ isRecording: recording }),
  setIsRunning: (running) => set({ isRunning: running }),
}));
