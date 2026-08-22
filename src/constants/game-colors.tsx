export const GAME_COLORS = {
  backgroundOuter: "#03070D",
  backgroundInner: "#050B14",
  grid: "#6B8CAA",

  local: "#67FFD1",
  localSecondary: "#18CFA5",

  bot: "#FF4D8D",
  botSecondary: "#D92768",

  ball: "#DDF7FF",
} as const;

export const BACKGROUND_INNER = "#050B14";
export const GRID_COLOR = "#6B8CAA";
export const BACKGROUND_OUTER = "#03070D";

/**
 * Single persistent player color system.
 *
 * Stable player id -> stable color.
 *
 * This is reused by:
 * - paddle/wall visuals
 * - ball trails
 */
export const PLAYER_SLOT_COLORS = [
  "#67FFD1",
  "#FF4D8D",
  "#FFD166",
  "#8B7CFF",
  "#4DD9FF",
  "#FF8A5B",
  "#B8FF5A",
  "#D98BFF",
] as const;

export const NEUTRAL_TRAIL_COLOR = "#8BD8FF";
