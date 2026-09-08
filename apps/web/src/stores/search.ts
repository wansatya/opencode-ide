import { create } from "zustand";
import { api } from "../lib/api";
import { useRepo } from "./repository";

export type SearchMatchItem = {
  line: number;
  column: number;
  text: string;
  matchLength: number;
};

export type SearchFileGroup = {
  path: string;
  matches: SearchMatchItem[];
};

export type JumpTarget = {
  path: string;
  line: number;
  column: number;
  matchLength: number;
  ts: number;
};

type SearchStore = {
  query: string;
  matchCase: boolean;
  useRegex: boolean;
  isSearching: boolean;
  totalMatches: number;
  filesCount: number;
  truncated: boolean;
  results: SearchFileGroup[];
  error: string | null;
  jumpTarget: JumpTarget | null;

  setQuery: (q: string) => void;
  setMatchCase: (b: boolean | ((prev: boolean) => boolean)) => void;
  setUseRegex: (b: boolean | ((prev: boolean) => boolean)) => void;
  executeSearch: (overrideQuery?: string) => Promise<void>;
  clearSearch: () => void;
  jumpTo: (path: string, line: number, column: number, matchLength?: number) => void;
  clearJumpTarget: () => void;
};

export const useSearch = create<SearchStore>((set, get) => ({
  query: "",
  matchCase: false,
  useRegex: false,
  isSearching: false,
  totalMatches: 0,
  filesCount: 0,
  truncated: false,
  results: [],
  error: null,
  jumpTarget: null,

  setQuery: (q) => set({ query: q }),
  setMatchCase: (b) =>
    set((s) => ({
      matchCase: typeof b === "function" ? b(s.matchCase) : b,
    })),
  setUseRegex: (b) =>
    set((s) => ({
      useRegex: typeof b === "function" ? b(s.useRegex) : b,
    })),

  executeSearch: async (overrideQuery?: string) => {
    const q = overrideQuery !== undefined ? overrideQuery : get().query;
    const trimmed = q.trim();
    if (!trimmed) {
      set({
        query: "",
        isSearching: false,
        totalMatches: 0,
        filesCount: 0,
        results: [],
        error: null,
      });
      return;
    }

    set({ isSearching: true, error: null });
    try {
      const res = await api.search(trimmed, {
        matchCase: get().matchCase,
        useRegex: get().useRegex,
      });
      set({
        query: trimmed,
        totalMatches: res.totalMatches,
        filesCount: res.filesCount,
        results: res.results,
        truncated: res.truncated,
        isSearching: false,
      });
    } catch (err: any) {
      set({
        error: err.message ?? "Search failed",
        isSearching: false,
        results: [],
        totalMatches: 0,
        filesCount: 0,
      });
    }
  },

  clearSearch: () =>
    set({
      query: "",
      isSearching: false,
      totalMatches: 0,
      filesCount: 0,
      results: [],
      error: null,
    }),

  jumpTo: (path: string, line: number, column: number, matchLength = 0) => {
    useRepo.getState().select(path);
    set({
      jumpTarget: {
        path,
        line,
        column,
        matchLength,
        ts: Date.now(),
      },
    });
  },

  clearJumpTarget: () => set({ jumpTarget: null }),
}));
