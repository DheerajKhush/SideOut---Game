import { create } from "zustand";

interface GameStore {
  playerScore: number;
  botScore: number;

  addPoint: (player: "player" | "bot") => void;

  resetScore: () => void;
}

export const useGameStore = create<GameStore>()((set) => ({
  playerScore: 0,
  botScore: 0,

  addPoint: (player) =>
    set((state) => ({
      playerScore:
        player === "player"
          ? state.playerScore + 1
          : state.playerScore,

      botScore:
        player === "bot"
          ? state.botScore + 1
          : state.botScore,
    })),

  resetScore: () =>
    set({
      playerScore: 0,
      botScore: 0,
    }),
}));