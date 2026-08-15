import { create } from "zustand";

interface GameStore {
  scores: number[];

  addPoint: (slot: number) => void;

  resetScores: (playerCount: number) => void;
}

export const useGameStore = create<GameStore>()((set) => ({
  scores: new Array(8).fill(0),

  addPoint: (slot) =>
    set((state) => {
      const scores = [...state.scores];

      scores[slot] += 1;

      return {
        scores,
      };
    }),

  resetScores: (playerCount) =>
    set({
      scores: new Array(playerCount).fill(0),
    }),
}));
