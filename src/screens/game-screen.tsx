import { useMemo, useState } from "react";

import {
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
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

  /** Stable player ids. Wall indices are allowed to change after shatter. */
  const [activePlayers, setActivePlayers] = useState<number[]>(createPlayerIds);
  const [localPlayerId, setLocalPlayerId] = useState(0);
  const [lives, setLives] = useState<number[]>(() =>
    new Array(PLAYER_COUNT).fill(INITIAL_LIVES),
  );

  /** Renderer-side snapshot used to morph old walls into new walls. */
  const [geometryTransition, setGeometryTransition] =
    useState<GeometryTransition | null>(null);

  const radius = Math.min(width, height) * 0.42;

  /**
   * Normal elimination uses the regular polygon: 8 -> 7 -> ... -> 3.
   *
   * Two players are a terminal state and are NOT represented as a 2-gon.
   * They become the top and bottom walls of an explicit rectangle.
   */
  const geometry = useMemo(
    () =>
      activePlayers.length === 2
        ? createTwoPlayerRectangleGeometry(radius, width / 2, height / 2)
        : activePlayers.length === 1
          ? createWinnerGeometry(radius, width / 2, height / 2)
          : createPolygonGeometry(
              activePlayers.length,
              radius,
              width / 2,
              height / 2,
            ),
    [activePlayers.length, radius, width, height],
  );

  const CONFIG: PhysicsConfig = useMemo(
    () => ({
      geometry,
      activePlayerIds: activePlayers,

      ballRadius: 8,

      paddleLength: 58,
      paddleThickness: 12,

      initialBallSpeed: 280,
      maxBallSpeed: 650,

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

  /** Shared transition state consumed by the UI-thread physics loop. */
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

  const gameOverShared = useSharedValue(false);

  /** Blocks duplicate miss events while JS applies the elimination. */
  const missPendingShared = useSharedValue(false);

  const addPoint = (playerId: number) => {
    useGameStore.getState().addPoint(playerId);
  };

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
      { duration: SHATTER_TRANSITION_MS },
      (finished) => {
        if (!finished) return;

        /**
         * Physics has been using the old wall indices throughout the
         * transition. Preserve each surviving player's paddle offset when
         * switching the state array to the new wall indices.
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

        // The shattered wall is intentionally open during the transition, so
        // the ball may have crossed that old edge. Before handing physics to
        // the smaller arena, guarantee the ball is valid in the new geometry.
        // Normal transitions keep the ball inside; this is only a safety
        // recovery for the open-edge case.
        let handoffBall = oldState.ball;

        if (newGeometry !== null) {
          let outsideNewGeometry = false;

          for (let i = 0; i < newGeometry.walls.length; i++) {
            const wall = newGeometry.walls[i];
            const relativeX = handoffBall.x - wall.start.x;
            const relativeY = handoffBall.y - wall.start.y;
            const distance =
              relativeX * wall.outward.x + relativeY * wall.outward.y;

            if (distance < -CONFIG.ballRadius) {
              outsideNewGeometry = true;
              break;
            }
          }

          if (outsideNewGeometry) {
            const speed = Math.sqrt(
              handoffBall.vx * handoffBall.vx + handoffBall.vy * handoffBall.vy,
            );
            const safeSpeed = Math.max(1, Math.min(speed, CONFIG.maxBallSpeed));
            const directionLength = Math.sqrt(
              handoffBall.vx * handoffBall.vx + handoffBall.vy * handoffBall.vy,
            );

            const directionX =
              directionLength > 0.0001 ? handoffBall.vx / directionLength : 1;
            const directionY =
              directionLength > 0.0001 ? handoffBall.vy / directionLength : 0;

            handoffBall = {
              x: newGeometry.center.x,
              y: newGeometry.center.y,
              vx: directionX * safeSpeed,
              vy: directionY * safeSpeed,
            };
          }
        }

        gameState.value = {
          ...oldState,
          ball: handoffBall,
          paddleOffsets: mappedOffsets,
        };

        transitionActiveShared.value = false;
        transitionRemovedWallSlotShared.value = -1;
        transitionOldGeometryShared.value = null;
        transitionOldActivePlayerIdsShared.value = [];
        transitionNewGeometryShared.value = null;
        transitionNewActivePlayerIdsShared.value = [];

        // The next miss is allowed only after the current shatter transition
        // has completely handed physics to the new geometry.
        missPendingShared.value = false;
      },
    );
  };

  /**
   * Apply a miss on the JS thread.
   *
   * The existing Phase 3a lives/shatter/win decisions are intentionally kept
   * unchanged. The only addition is that the old geometry is retained for a
   * 500 ms visual/physics handoff before the new geometry becomes physical.
   */
  const handleMiss = (playerId: number) => {
    // A terminal state or an already queued miss must never fire twice.
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

    if (nextLives[playerId] > 0) {
      missPendingShared.value = false;
      return;
    }

    const nextPlayers = activePlayers.filter((id) => id !== playerId);

    console.log(
      `[ELIMINATION] P${playerId} shattered. ${nextPlayers.length} walls remain.`,
    );

    if (nextPlayers.length === 2) {
      console.log(
        "[GAME STATE] 2 walls remain — entering playable rectangle phase.",
      );
      // IMPORTANT: this is NOT game over. The two remaining players continue
      // playing between the top/bottom walls while left/right reflect.
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

    const nextGeometry =
      nextPlayers.length === 2
        ? createTwoPlayerRectangleGeometry(radius, width / 2, height / 2)
        : nextPlayers.length === 1
          ? createWinnerGeometry(radius, width / 2, height / 2)
          : createPolygonGeometry(
              nextPlayers.length,
              radius,
              width / 2,
              height / 2,
            );

    /**
     * Keep the existing Phase 3a center relaunch. Importantly, it is created
     * against the old geometry because physics remains on that geometry until
     * the 500 ms handoff completes. All generated geometries share a center.
     */
    if (nextPlayers.length > 1) {
      gameState.value = createInitialState(
        oldGeometry,
        CONFIG.initialBallSpeed,
        randomLaunchAngle(),
      );
    }

    startGeometryTransition(
      oldGeometry,
      oldActivePlayerIds,
      nextGeometry,
      nextPlayers,
      playerId,
      oldLocalWallAngle,
    );

    setActivePlayers(nextPlayers);

    // Keep missPendingShared locked until the 500 ms transition finishes.
    // This prevents a second shatter from starting while the first geometry
    // handoff is still in flight. The 2-player rectangle remains playable
    // immediately after that handoff.
  };

  /**
   * Debug: switch the local player, but only among players that are still
   * active. This keeps player identity separate from the current wall index.
   */
  const cycleLocalPlayer = () => {
    if (activePlayers.length === 0) return;

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

      if (localWallIndex < 0) return;

      const wall = geometryForInput.walls[localWallIndex];
      const maxOffset = Math.max(0, wall.length / 2 - CONFIG.paddleLength / 2);

      const nextOffset = gestureStartOffset.value + event.translationX;

      playerPaddleOffset.value = Math.max(
        -maxOffset,
        Math.min(maxOffset, nextOffset),
      );
    });

  useFrameCallback((frameInfo) => {
    if (gameOverShared.value) return;

    const delta = frameInfo.timeSincePreviousFrame;

    if (delta == null) return;

    let physicsGeometry = CONFIG.geometry;
    let physicsActivePlayerIds = CONFIG.activePlayerIds;
    let ignoredWallSlot = -1;

    /**
     * During the visual morph, the smaller polygon is deliberately NOT used
     * by physics. We continue simulating against the old polygon, except the
     * wall that just shattered is skipped completely (open boundary).
     */
    if (
      transitionActiveShared.value &&
      transitionOldGeometryShared.value !== null
    ) {
      physicsGeometry = transitionOldGeometryShared.value;
      physicsActivePlayerIds = transitionOldActivePlayerIdsShared.value;
      ignoredWallSlot = transitionRemovedWallSlotShared.value;
    }

    const result = updatePhysics(
      gameState.value,
      delta / 1000,
      localPlayerIdShared.value,
      playerPaddleOffset.value,
      CONFIG,
      physicsGeometry,
      physicsActivePlayerIds,
      ignoredWallSlot,
    );

    if (
      result.missedWall !== null &&
      result.missedPlayerId !== null &&
      !missPendingShared.value
    ) {
      // Lock immediately on the UI thread so multiple frames cannot queue
      // the same elimination before the JS state update arrives.
      missPendingShared.value = true;
      if (result.state.lastHitter !== null) {
        runOnJS(addPoint)(result.state.lastHitter);
      }

      /**
       * Preserve the Phase 3a center relaunch. The ball is now running from
       * the shared center while the old boundary remains physical for the
       * transition. The removed wall is already an open boundary.
       */
      const newBall = createBall(
        physicsGeometry,
        CONFIG.initialBallSpeed,
        randomLaunchAngle(),
      );

      gameState.value = {
        ...result.state,
        ball: newBall,
        lastHitter: null,
      };

      runOnJS(handleMiss)(result.missedPlayerId);
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
          <View style={{ width, height }}>
            <GameRenderer
              state={gameState}
              playerPaddleOffset={playerPaddleOffset}
              config={CONFIG}
              localSlot={localPlayerId}
              lives={lives}
              transition={geometryTransition}
              transitionProgress={transitionProgress}
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
    fontSize: 18,
    fontWeight: "800",
  },
});
