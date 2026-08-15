import { useEffect, useMemo } from "react";
import { useFrameCallback, useSharedValue } from "react-native-reanimated";

import {
  createBall,
  createInitialState,
  MAX_BALL_SPEED,
  SPEED_INCREMENT,
  updatePhysics,
  type GameState,
  type PhysicsConfig,
} from "@/game/engine/physics";

import { createPolygonGeometry } from "@/game/engine/polygon";

import { GameRenderer } from "@/render/game-renderer";

interface ArenaPreviewProps {
  /**
   * The preview is intentionally square.
   *
   * GameRenderer derives its canvas size from geometry.center,
   * so width and height must not be independently stretched.
   */
  size: number;
}

/**
 * Same persistent player-color ordering used by the game.
 *
 * P0 = local player
 * P1+ = bots
 */
const PLAYER_COLORS = [
  "#67FFD1",
  "#FF4D8D",
  "#FFC857",
  "#8B7CFF",
  "#49D8FF",
  "#FF7A45",
  "#B8FF5A",
  "#D56CFF",
];

const PREVIEW_PLAYER_IDS = [0, 1, 2, 3, 4];

const PREVIEW_BALL_COUNT = 1;

const randomLaunchAngle = () => {
  "worklet";

  return Math.random() * Math.PI * 2;
};

export function ArenaPreview({ size }: ArenaPreviewProps) {
  /*
   * Keep the preview square.
   */
  const radius = size * 0.4;

  const geometry = useMemo(
    () => createPolygonGeometry(5, radius, size / 2, size / 2),
    [radius, size],
  );

  const config = useMemo<PhysicsConfig>(
    () => ({
      geometry,

      activePlayerIds: PREVIEW_PLAYER_IDS,

      ballRadius: 8,

      paddleLength: 58,
      paddleThickness: 12,

      initialBallSpeed: 280,

      maxBallSpeed: MAX_BALL_SPEED,

      ballSpeedIncrement: SPEED_INCREMENT,

      botMaxSpeed: 145,

      botReactionDeadZone: 12,

      maxBounceAngle: Math.PI / 3,

      /*
       * Reuse the same persistent
       * player-color model as the game.
       */
      playerColors: PLAYER_COLORS,

      /*
       * The preview doesn't need
       * extra collision substeps.
       */
      maxSubstepDistance: 14,

      maxSubsteps: 64,

      /*
       * IMPORTANT:
       *
       * GameRenderer renders one BallVisual
       * for every maxBallCount slot.
       *
       * The Home preview only has one ball.
       */
      maxBallCount: PREVIEW_BALL_COUNT,
    }),
    [geometry],
  );

  /*
   * Completely isolated preview state.
   *
   * Nothing here is connected to GameScreen.
   */
  const gameState = useSharedValue<GameState>(
    createInitialState(geometry, config.initialBallSpeed, randomLaunchAngle()),
  );

  /*
   * Local player's paddle.
   *
   * No GestureDetector is attached to this
   * component, therefore this stays centered.
   */
  const playerPaddleOffset = useSharedValue(0);

  /*
   * Home preview doesn't perform
   * wall-count transitions.
   */
  const transitionProgress = useSharedValue(1);

  /*
   * No arena shrinking in this phase.
   */
  const arenaScale = useSharedValue(1);

  useEffect(() => {
    gameState.value = createInitialState(
      geometry,
      config.initialBallSpeed,
      randomLaunchAngle(),
    );

    playerPaddleOffset.value = 0;
    transitionProgress.value = 1;
    arenaScale.value = 1;
  }, [
    geometry,
    config.initialBallSpeed,
    gameState,
    playerPaddleOffset,
    transitionProgress,
    arenaScale,
  ]);

  /*
   * REAL GAME PHYSICS.
   *
   * This is the same updatePhysics()
   * used by GameScreen.
   *
   * The preview simply has:
   *
   * - no touch input
   * - fixed local paddle
   * - no wall elimination
   * - no arena shrinking
   */
  useFrameCallback((frameInfo) => {
    const delta = frameInfo.timeSincePreviousFrame;

    if (delta == null) {
      return;
    }

    const result = updatePhysics(
      gameState.value,

      delta / 1000,

      /*
       * Local player.
       */
      0,

      /*
       * Fixed centered paddle.
       */
      playerPaddleOffset.value,

      config,

      config.geometry,

      config.activePlayerIds,

      -1,

      /*
       * No arena shrink.
       */
      arenaScale.value,
    );

    /*
     * A Home preview should never enter
     * a "game over" state.
     *
     * If the ball escapes a wall, simply
     * respawn it.
     */
    if (result.missedBallIndex !== null) {
      const balls = [...result.state.balls];

      const index = result.missedBallIndex;

      balls[index] = createBall(
        config.geometry,
        config.initialBallSpeed,
        randomLaunchAngle(),
      );

      gameState.value = {
        ...result.state,
        balls,
        lastHitter: null,
      };

      return;
    }

    gameState.value = result.state;
  });

  /*
   * SAME renderer used by GameScreen.
   *
   * No duplicate polygon/paddle/ball
   * rendering exists in the preview.
   */
  return (
    <GameRenderer
      state={gameState}
      playerPaddleOffset={playerPaddleOffset}
      config={config}
      localSlot={0}
      lives={[2, 2, 2, 2, 2, 2, 2, 2]}
      transition={null}
      transitionProgress={transitionProgress}
      arenaScale={arenaScale}
    />
  );
}
