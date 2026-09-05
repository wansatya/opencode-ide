import { create } from "zustand";
import type { OpenCodeState } from "../types";
type S = {
  state: OpenCodeState;
  error: string | null;
  found: boolean | null;
  bin: string | null;
  set: (s: OpenCodeState, error?: string | null) => void;
  setCheck: (found: boolean | null, bin?: string | null) => void;
};
export const useTerm = create<S>((set) => ({
  state: "disconnected",
  error: null,
  found: null,
  bin: null,
  set: (state, error = null) => set({ state, error }),
  setCheck: (found, bin = null) => set({ found, bin }),
}));
