// import { create } from "zustand";

// interface GameStore {
//   playerScore: number;
//   botScore: number;

//   addPoint: (player: "player" | "bot") => void;

//   resetScore: () => void;
// }

// export const useGameStore = create<GameStore>()((set) => ({
//   playerScore: 0,
//   botScore: 0,

//   addPoint: (player) =>
//     set((state) => ({
//       playerScore:
//         player === "player"
//           ? state.playerScore + 1
//           : state.playerScore,

//       botScore:
//         player === "bot"
//           ? state.botScore + 1
//           : state.botScore,
//     })),

//   resetScore: () =>
//     set({
//       playerScore: 0,
//       botScore: 0,
//     }),
// }));

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
