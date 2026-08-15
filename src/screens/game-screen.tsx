import { useMemo, useState } from "react";

import {
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";

import {
  runOnJS,
  useFrameCallback,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import {
  createBall,
  createInitialState,
  INITIAL_SPAWN_DELAY_MS,
  MAX_BALL_COUNT,
  MAX_BALL_SPEED,
  MIN_ARENA_RADIUS,
  SHRINK_RATE,
  SHRINK_START_MS,
  SPAWN_INTERVAL_MS,
  updatePhysics,
  type PhysicsConfig,
} from "@/game/engine/physics";

import {
  createPolygonGeometry,
  createTwoPlayerRectangleGeometry,
  createWinnerGeometry,
  type PolygonGeometry,
} from "@/game/engine/polygon";

import { useGameStore } from "@/store/game-store";

import { BACKGROUND_OUTER } from "@/constants/game-colors";
import BackgroundGrid from "@/render/backgroundGrid";
import { GameRenderer } from "@/render/game-renderer";

const PLAYER_COUNT = 8;
const INITIAL_LIVES = 2;
const SHATTER_TRANSITION_MS = 500;

const createPlayerIds = () =>
  Array.from(
    {
      length: PLAYER_COUNT,
    },
    (_, index) => index,
  );

const randomLaunchAngle = () => {
  "worklet";

  return Math.random() * Math.PI * 2;
};

interface GeometryTransition {
  oldGeometry: PolygonGeometry;
  oldActivePlayerIds: number[];
  oldLocalWallAngle: number;
}

export default function GameScreen() {
  const { width, height } = useWindowDimensions();

  /**
   * Original radius.
   *
   * Wall-count geometry is generated from this.
   * Continuous shrinking is layered on top separately.
   */
  const baseRadius = Math.min(width, height) * 0.5;

  const [activePlayers, setActivePlayers] = useState<number[]>(createPlayerIds);

  const [localPlayerId, setLocalPlayerId] = useState(0);

  const [lives, setLives] = useState<number[]>(() =>
    new Array(PLAYER_COUNT).fill(INITIAL_LIVES),
  );

  /**
   * Phase 3b visual transition.
   */
  const [geometryTransition, setGeometryTransition] =
    useState<GeometryTransition | null>(null);

  /**
   * Phase 3b geometry.
   *
   * This changes ONLY when activePlayers changes.
   */
  const geometry = useMemo(
    () =>
      activePlayers.length === 2
        ? createTwoPlayerRectangleGeometry(baseRadius, width / 2, height / 2)
        : activePlayers.length === 1
          ? createWinnerGeometry(baseRadius, width / 2, height / 2)
          : createPolygonGeometry(
              activePlayers.length,
              baseRadius,
              width / 2,
              height / 2,
            ),
    [activePlayers.length, baseRadius, width, height],
  );

  const CONFIG: PhysicsConfig = useMemo(
    () => ({
      geometry,
      activePlayerIds: activePlayers,

      ballRadius: 8,

      paddleLength: 58,
      paddleThickness: 12,

      initialBallSpeed: 280,
      maxBallSpeed: MAX_BALL_SPEED,

      botMaxSpeed: 145,
      botReactionDeadZone: 12,

      maxBounceAngle: Math.PI / 3,
    }),
    [geometry, activePlayers],
  );

  const playerPaddleOffset = useSharedValue(0);

  const gameState = useSharedValue(
    createInitialState(geometry, CONFIG.initialBallSpeed, randomLaunchAngle()),
  );

  const localPlayerIdShared = useSharedValue(0);

  /**
   * Phase 3b transition state.
   */
  const transitionActiveShared = useSharedValue(false);

  const transitionProgress = useSharedValue(1);

  const transitionOldGeometryShared = useSharedValue<PolygonGeometry | null>(
    null,
  );

  const transitionOldActivePlayerIdsShared = useSharedValue<number[]>([]);

  const transitionNewGeometryShared = useSharedValue<PolygonGeometry | null>(
    null,
  );

  const transitionNewActivePlayerIdsShared = useSharedValue<number[]>([]);

  const transitionRemovedWallSlotShared = useSharedValue(-1);

  /**
   * Phase 5 continuous shrink.
   */
  const shrinkElapsedMs = useSharedValue(0);

  const arenaRadiusShared = useSharedValue(baseRadius);

  const arenaScaleShared = useSharedValue(1);

  const gameOverShared = useSharedValue(false);

  /**
   * Phase 4b spawn timer.
   */
  const spawnElapsedMs = useSharedValue(0);

  const nextSpawnAtMs = useSharedValue(INITIAL_SPAWN_DELAY_MS);

  const missPendingShared = useSharedValue(false);

  const addPoint = (playerId: number) => {
    useGameStore.getState().addPoint(playerId);
  };

  /**
   * =========================================================
   * PHASE 3b TRANSITION
   * =========================================================
   */
  const startGeometryTransition = (
    oldGeometry: PolygonGeometry,
    oldActivePlayerIds: number[],
    nextGeometry: PolygonGeometry,
    nextActivePlayerIds: number[],
    removedPlayerId: number,
    oldLocalWallAngle: number,
  ) => {
    const removedWallSlot = oldActivePlayerIds.indexOf(removedPlayerId);

    transitionOldGeometryShared.value = oldGeometry;

    transitionOldActivePlayerIdsShared.value = [...oldActivePlayerIds];

    transitionNewGeometryShared.value = nextGeometry;

    transitionNewActivePlayerIdsShared.value = [...nextActivePlayerIds];

    transitionRemovedWallSlotShared.value = removedWallSlot;

    transitionActiveShared.value = true;

    transitionProgress.value = 0;

    setGeometryTransition({
      oldGeometry,
      oldActivePlayerIds: [...oldActivePlayerIds],
      oldLocalWallAngle,
    });

    transitionProgress.value = withTiming(
      1,
      {
        duration: SHATTER_TRANSITION_MS,
      },
      (finished) => {
        if (!finished) {
          return;
        }

        const oldState = gameState.value;

        const oldIds = transitionOldActivePlayerIdsShared.value;

        const newIds = transitionNewActivePlayerIdsShared.value;

        const oldOffsets = oldState.paddleOffsets;

        const mappedOffsets = new Array(newIds.length).fill(0);

        for (let newIndex = 0; newIndex < newIds.length; newIndex++) {
          const playerId = newIds[newIndex];

          let oldIndex = -1;

          for (let i = 0; i < oldIds.length; i++) {
            if (oldIds[i] === playerId) {
              oldIndex = i;
              break;
            }
          }

          if (oldIndex >= 0) {
            mappedOffsets[newIndex] = oldOffsets[oldIndex] ?? 0;
          }
        }

        const newGeometry = transitionNewGeometryShared.value;

        /**
         * Safety recovery if the ball crossed
         * the removed/open edge.
         */
        const handoffBalls = [...oldState.balls];

        for (let ballIndex = 0; ballIndex < handoffBalls.length; ballIndex++) {
          const ball = handoffBalls[ballIndex];

          let outsideNewGeometry = false;

          const wallCount = newGeometry ? newGeometry.walls.length : 0;

          for (let i = 0; i < wallCount; i++) {
            const wall = newGeometry!.walls[i];

            const relativeX = ball.x - wall.start.x;

            const relativeY = ball.y - wall.start.y;

            const distance =
              relativeX * wall.outward.x + relativeY * wall.outward.y;

            if (distance < -CONFIG.ballRadius) {
              outsideNewGeometry = true;
              break;
            }
          }

          if (outsideNewGeometry && newGeometry) {
            const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);

            const safeSpeed = Math.max(1, Math.min(speed, MAX_BALL_SPEED));

            const directionLength = Math.sqrt(
              ball.vx * ball.vx + ball.vy * ball.vy,
            );

            const directionX =
              directionLength > 0.0001 ? ball.vx / directionLength : 1;

            const directionY =
              directionLength > 0.0001 ? ball.vy / directionLength : 0;

            handoffBalls[ballIndex] = {
              x: newGeometry.center.x,

              y: newGeometry.center.y,

              vx: directionX * safeSpeed,

              vy: directionY * safeSpeed,

              /**
               * Preserve trail ownership.
               */
              lastHitBySlot: ball.lastHitBySlot,
            };
          }
        }

        gameState.value = {
          ...oldState,
          balls: handoffBalls,
          paddleOffsets: mappedOffsets,
        };

        transitionActiveShared.value = false;

        transitionRemovedWallSlotShared.value = -1;

        transitionOldGeometryShared.value = null;

        transitionOldActivePlayerIdsShared.value = [];

        transitionNewGeometryShared.value = null;

        transitionNewActivePlayerIdsShared.value = [];

        missPendingShared.value = false;
      },
    );
  };

  /**
   * =========================================================
   * MISS / ELIMINATION
   * =========================================================
   */
  const handleMiss = (playerId: number, missedBallIndex: number) => {
    if (gameOverShared.value || !missPendingShared.value) {
      return;
    }

    if (!activePlayers.includes(playerId)) {
      missPendingShared.value = false;

      return;
    }

    const oldGeometry = CONFIG.geometry;

    const oldActivePlayerIds = [...activePlayers];

    const oldLocalPlayerId = localPlayerIdShared.value;

    const oldLocalWallIndex = oldActivePlayerIds.indexOf(oldLocalPlayerId);

    const oldLocalWallAngle = oldGeometry.walls[oldLocalWallIndex]?.angle ?? 0;

    const nextLives = [...lives];

    nextLives[playerId] = Math.max(0, nextLives[playerId] - 1);

    setLives(nextLives);

    /**
     * Player still has a life.
     *
     * This is not a wall-count resize.
     *
     * The relaunch starts neutral.
     */
    if (nextLives[playerId] > 0) {
      const balls = [...gameState.value.balls];

      if (balls[missedBallIndex]) {
        balls[missedBallIndex] = createBall(
          CONFIG.geometry,
          CONFIG.initialBallSpeed,
          randomLaunchAngle(),
        );
      }

      gameState.value = {
        ...gameState.value,
        balls,
        lastHitter: null,
      };

      missPendingShared.value = false;

      return;
    }

    /**
     * Phase 3b:
     * wall count changes here.
     */
    const nextPlayers = activePlayers.filter((id) => id !== playerId);

    console.log(
      `[ELIMINATION] P${playerId} shattered. ${nextPlayers.length} walls remain.`,
    );

    if (nextPlayers.length === 2) {
      console.log(
        "[GAME STATE] 2 walls remain — entering playable rectangle phase.",
      );
    } else if (nextPlayers.length === 1) {
      console.log(
        `[GAME END] P${nextPlayers[0]} is the winner — 1 wall remains.`,
      );

      gameOverShared.value = true;
    }

    if (playerId === localPlayerIdShared.value && nextPlayers.length > 0) {
      const nextLocalPlayer = nextPlayers[0];

      localPlayerIdShared.value = nextLocalPlayer;

      setLocalPlayerId(nextLocalPlayer);

      playerPaddleOffset.value = 0;

      gestureStartOffset.value = 0;
    }

    /**
     * Generate new wall-count geometry at BASE radius.
     *
     * The current arenaScale is deliberately NOT reset.
     */
    const nextGeometry =
      nextPlayers.length === 2
        ? createTwoPlayerRectangleGeometry(baseRadius, width / 2, height / 2)
        : nextPlayers.length === 1
          ? createWinnerGeometry(baseRadius, width / 2, height / 2)
          : createPolygonGeometry(
              nextPlayers.length,
              baseRadius,
              width / 2,
              height / 2,
            );

    startGeometryTransition(
      oldGeometry,
      oldActivePlayerIds,
      nextGeometry,
      nextPlayers,
      playerId,
      oldLocalWallAngle,
    );

    setActivePlayers(nextPlayers);
  };

  const cycleLocalPlayer = () => {
    if (activePlayers.length === 0) {
      return;
    }

    setLocalPlayerId((current) => {
      const currentIndex = activePlayers.indexOf(current);

      const next =
        activePlayers[
          (currentIndex + 1 + activePlayers.length) % activePlayers.length
        ];

      localPlayerIdShared.value = next;

      playerPaddleOffset.value = 0;

      gestureStartOffset.value = 0;

      return next;
    });
  };

  const gestureStartOffset = useSharedValue(0);

  /**
   * =========================================================
   * INPUT
   * =========================================================
   */
  const panGesture = Gesture.Pan()
    .onBegin(() => {
      gestureStartOffset.value = playerPaddleOffset.value;
    })
    .onUpdate((event) => {
      let localWallIndex = -1;

      let activeIds = CONFIG.activePlayerIds;

      let geometryForInput = CONFIG.geometry;

      if (
        transitionActiveShared.value &&
        transitionOldGeometryShared.value !== null
      ) {
        activeIds = transitionOldActivePlayerIdsShared.value;

        geometryForInput = transitionOldGeometryShared.value;
      }

      for (let i = 0; i < activeIds.length; i++) {
        if (activeIds[i] === localPlayerIdShared.value) {
          localWallIndex = i;
          break;
        }
      }

      if (localWallIndex < 0) {
        return;
      }

      const wall = geometryForInput.walls[localWallIndex];

      const currentScale = arenaScaleShared.value;

      const currentPaddleLength = CONFIG.paddleLength * currentScale;

      const currentWallLength = wall.length * currentScale;

      const maxOffset = Math.max(
        0,
        currentWallLength / 2 - currentPaddleLength / 2,
      );

      const nextOffset = gestureStartOffset.value + event.translationX;

      playerPaddleOffset.value = Math.max(
        -maxOffset,
        Math.min(maxOffset, nextOffset),
      );
    });

  /**
   * =========================================================
   * GAME LOOP
   * =========================================================
   */
  useFrameCallback((frameInfo) => {
    if (gameOverShared.value) {
      return;
    }

    const delta = frameInfo.timeSincePreviousFrame;

    if (delta == null) {
      return;
    }

    /**
     * =====================================================
     * PHASE 5 — CONTINUOUS SHRINK
     * =====================================================
     *
     * This NEVER changes wall count.
     */
    shrinkElapsedMs.value += delta;

    if (shrinkElapsedMs.value > SHRINK_START_MS) {
      const elapsedAfterStart = shrinkElapsedMs.value - SHRINK_START_MS;

      const shrinkDistance = (elapsedAfterStart / 1000) * SHRINK_RATE;

      const currentRadius = Math.max(
        MIN_ARENA_RADIUS,
        baseRadius - shrinkDistance,
      );

      const currentScale = baseRadius > 0 ? currentRadius / baseRadius : 1;

      arenaRadiusShared.value = currentRadius;

      arenaScaleShared.value = currentScale;
    } else {
      arenaRadiusShared.value = baseRadius;

      arenaScaleShared.value = 1;
    }

    /**
     * =====================================================
     * PHASE 4b — MULTI-BALL
     * =====================================================
     */
    spawnElapsedMs.value += delta;

    if (
      !transitionActiveShared.value &&
      gameState.value.balls.length < MAX_BALL_COUNT &&
      spawnElapsedMs.value >= nextSpawnAtMs.value
    ) {
      const balls = [...gameState.value.balls];

      while (
        balls.length < MAX_BALL_COUNT &&
        spawnElapsedMs.value >= nextSpawnAtMs.value
      ) {
        balls.push(
          createBall(
            CONFIG.geometry,
            CONFIG.initialBallSpeed,
            randomLaunchAngle(),
          ),
        );

        nextSpawnAtMs.value += SPAWN_INTERVAL_MS;
      }

      gameState.value = {
        ...gameState.value,
        balls,
      };
    }

    /**
     * =====================================================
     * PHASE 3b TRANSITION PHYSICS
     * =====================================================
     */
    let physicsGeometry = CONFIG.geometry;

    let physicsActivePlayerIds = CONFIG.activePlayerIds;

    let ignoredWallSlot = -1;

    if (
      transitionActiveShared.value &&
      transitionOldGeometryShared.value !== null
    ) {
      physicsGeometry = transitionOldGeometryShared.value;

      physicsActivePlayerIds = transitionOldActivePlayerIdsShared.value;

      ignoredWallSlot = transitionRemovedWallSlotShared.value;
    }

    /**
     * Current arenaScale is passed EVERY tick.
     */
    const result = updatePhysics(
      gameState.value,

      delta / 1000,

      localPlayerIdShared.value,

      playerPaddleOffset.value,

      CONFIG,

      physicsGeometry,

      physicsActivePlayerIds,

      ignoredWallSlot,

      arenaScaleShared.value,
    );

    if (
      result.missedWall !== null &&
      result.missedPlayerId !== null &&
      !missPendingShared.value
    ) {
      missPendingShared.value = true;

      if (result.state.lastHitter !== null) {
        runOnJS(addPoint)(result.state.lastHitter);
      }

      /**
       * Relaunch only the missed ball.
       *
       * createBall() resets its trail to neutral.
       */
      const nextBalls = [...result.state.balls];

      const missedBallIndex = result.missedBallIndex ?? 0;

      if (nextBalls[missedBallIndex]) {
        nextBalls[missedBallIndex] = createBall(
          physicsGeometry,
          CONFIG.initialBallSpeed,
          randomLaunchAngle(),
        );
      }

      gameState.value = {
        ...result.state,
        balls: nextBalls,
        lastHitter: null,
      };

      runOnJS(handleMiss)(result.missedPlayerId, missedBallIndex);

      return;
    }

    gameState.value = result.state;
  });

  const scores = useGameStore((state) => state.scores);

  return (
    <GestureHandlerRootView style={styles.root}>
      <View style={styles.container}>
        <Pressable style={styles.debugButton} onPress={cycleLocalPlayer}>
          <Text style={styles.debugButtonText}>
            LOCAL: P{localPlayerId} · ROTATE
          </Text>
        </Pressable>

        <Text style={styles.score}>
          P{localPlayerId}: {scores[localPlayerId] ?? 0}
        </Text>

        <GestureDetector gesture={panGesture}>
          <View style={{ height, width }}>
            <BackgroundGrid width={width} height={height} />

            <GameRenderer
              state={gameState}
              playerPaddleOffset={playerPaddleOffset}
              config={CONFIG}
              localSlot={localPlayerId}
              lives={lives}
              transition={geometryTransition}
              transitionProgress={transitionProgress}
              arenaScale={arenaScaleShared}
            />
          </View>
        </GestureDetector>
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BACKGROUND_OUTER
  },

  container: {
    flex: 1,
  },

  debugButton: {
    position: "absolute",
    top: 50,
    right: 16,
    zIndex: 100,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: "rgba(30,40,60,0.9)",
  },

  debugButtonText: {
    color: "#8CC8FF",
    fontSize: 11,
    fontWeight: "700",
  },

  score: {
    position: "absolute",
    top: 52,
    left: 16,
    zIndex: 100,
    color: "#63FF9A",
    fontSize: 18,
    fontWeight: "800",
  },
});
