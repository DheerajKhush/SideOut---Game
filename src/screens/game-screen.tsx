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

import { GameRenderer } from "@/render/game-renderer";

const PLAYER_COUNT = 8;
const INITIAL_LIVES = 2;
const SHATTER_TRANSITION_MS = 500;

const createPlayerIds = () =>
  Array.from({ length: PLAYER_COUNT }, (_, index) => index);

const randomLaunchAngle = () => {
  "worklet";

  return Math.random() * Math.PI * 2;
};

interface GeometryTransition {
  oldGeometry: PolygonGeometry;
  oldActivePlayerIds: number[];

  /** Angle of the local player's wall immediately before the shatter. */
  oldLocalWallAngle: number;
}

export default function GameScreen() {
  const { width, height } = useWindowDimensions();

  /**
   * This is the ORIGINAL radius.
   *
   * Wall-count geometry is still generated from this radius.
   *
   * Continuous shrink is layered on top through arenaScaleShared.
   */
  const baseRadius = Math.min(width, height) * 0.5;

  /** Stable player ids. */
  const [activePlayers, setActivePlayers] = useState<number[]>(createPlayerIds);

  const [localPlayerId, setLocalPlayerId] = useState(0);

  const [lives, setLives] = useState<number[]>(() =>
    new Array(PLAYER_COUNT).fill(INITIAL_LIVES),
  );

  /**
   * Renderer-side snapshot used ONLY for
   * the Phase 3b wall-count morph.
   */
  const [geometryTransition, setGeometryTransition] =
    useState<GeometryTransition | null>(null);

  /**
   * =========================================================
   * PHASE 3b — WALL COUNT GEOMETRY
   * =========================================================
   *
   * This geometry is always created at baseRadius.
   *
   * It changes because players are eliminated.
   *
   * It does NOT contain the continuous shrink state.
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

      /**
       * BASE paddle dimensions.
       *
       * updatePhysics scales paddleLength using
       * the current arena scale every tick.
       */
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

  /** Stable player id used by the UI-thread physics loop. */
  const localPlayerIdShared = useSharedValue(0);

  /**
   * =========================================================
   * PHASE 3b — WALL COUNT TRANSITION STATE
   * =========================================================
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
   * =========================================================
   * PHASE 5 — CONTINUOUS RADIUS SHRINK
   * =========================================================
   *
   * This mechanism NEVER changes activePlayers.
   *
   * It NEVER creates/removes walls.
   *
   * It only changes arenaScaleShared.
   */
  const shrinkElapsedMs = useSharedValue(0);

  const arenaRadiusShared = useSharedValue(baseRadius);

  const arenaScaleShared = useSharedValue(1);

  const gameOverShared = useSharedValue(false);

  /**
   * Round-time accumulator used for additional-ball spawning.
   */
  const spawnElapsedMs = useSharedValue(0);

  const nextSpawnAtMs = useSharedValue(INITIAL_SPAWN_DELAY_MS);

  /**
   * Blocks duplicate miss events while JS applies elimination.
   */
  const missPendingShared = useSharedValue(false);

  const addPoint = (playerId: number) => {
    useGameStore.getState().addPoint(playerId);
  };

  /**
   * =========================================================
   * PHASE 3b — WALL COUNT TRANSITION
   * =========================================================
   *
   * Notice that this function does NOT modify the shrink timer
   * or shrink scale.
   *
   * Therefore a shatter during continuous shrink automatically
   * inherits the current shrink scale.
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

        /**
         * Physics has been using old wall indices throughout
         * the transition.
         *
         * Preserve paddle offsets when changing wall indices.
         */
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
         * The removed wall was open during the transition.
         *
         * If a ball escaped through it, recover it safely.
         *
         * IMPORTANT:
         * The current arena scale remains untouched.
         * The new geometry will be scaled by the current
         * shrink value on the next physics tick.
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

          if (outsideNewGeometry && newGeometry !== null) {
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

    /**
     * This is the CURRENT wall-count geometry at BASE radius.
     *
     * Continuous shrink is NOT stored here.
     *
     * Renderer + physics apply arenaScaleShared separately.
     */
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
     * This is NOT a wall-count resize.
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
     * =======================================================
     * PHASE 3b
     * =======================================================
     *
     * This is the ONLY place where wall COUNT changes.
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
     * IMPORTANT:
     *
     * This geometry is generated using BASE radius.
     *
     * The current shrink scale is NOT reset.
     *
     * Example:
     *
     * base radius = 350
     * current scale = 0.72
     *
     * old geometry and new geometry are both subsequently
     * rendered/simulated at 72% of their radius.
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

    /**
     * Keep missPendingShared locked until the transition finishes.
     */
  };

  /**
   * Debug: switch the local player.
   */
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

  const panGesture = Gesture.Pan()
    .onBegin(() => {
      gestureStartOffset.value = playerPaddleOffset.value;
    })
    .onUpdate((event) => {
      let localWallIndex = -1;

      let activeIds = CONFIG.activePlayerIds;

      let geometryForInput = CONFIG.geometry;

      /**
       * During Phase 3b transition, input remains
       * attached to the old wall.
       */
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

      /**
       * IMPORTANT:
       *
       * Gesture coordinates are BASE geometry coordinates.
       *
       * Convert the current local movement limits using
       * the CURRENT shrink scale.
       */
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
   * UI THREAD GAME LOOP
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
     * This runs independently of wall-count elimination.
     *
     * No geometry vertex count changes here.
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
     * PHASE 4b — MULTI-BALL SPAWNING
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
     * PHASE 3b PHYSICS TRANSITION
     * =====================================================
     *
     * During wall-count morph:
     *
     * - use OLD wall-count geometry
     * - ignore removed wall
     * - apply CURRENT arenaScale inside updatePhysics
     *
     * This is what lets the two mechanisms compose.
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
     * CURRENT shrink scale is passed on EVERY physics tick.
     *
     * updatePhysics then:
     *
     * 1. scales wall geometry
     * 2. scales paddle length
     * 3. runs collision detection
     * 4. runs bot movement
     * 5. runs multi-ball
     * 6. runs speed escalation
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
      /**
       * Lock immediately on UI thread.
       */
      missPendingShared.value = true;

      if (result.state.lastHitter !== null) {
        runOnJS(addPoint)(result.state.lastHitter);
      }

      /**
       * Relaunch ONLY the ball that missed.
       *
       * Other balls keep their trajectories.
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
          <View
            style={{
              width,
              height,
            }}
          >
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
  },

  container: {
    flex: 1,
    backgroundColor: "#050811",
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
    fontWeight: "800",
    fontSize: 18,
  },
});
