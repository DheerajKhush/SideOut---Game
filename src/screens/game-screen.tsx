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
} from "@/game/engine/polygon";

import { useGameStore } from "@/store/game-store";

import { GameRenderer } from "@/render/game-renderer";

const PLAYER_COUNT = 8;
const INITIAL_LIVES = 2;
const createPlayerIds = () =>
  Array.from({ length: PLAYER_COUNT }, (_, index) => index);

const randomLaunchAngle = () => {
  "worklet";

  return Math.random() * Math.PI * 2;
};

export default function GameScreen() {
  const { width, height } = useWindowDimensions();

  /** Stable player ids. Wall indices are allowed to change after shatter. */
  const [activePlayers, setActivePlayers] = useState<number[]>(createPlayerIds);
  const [localPlayerId, setLocalPlayerId] = useState(0);
  const [lives, setLives] = useState<number[]>(() =>
    new Array(PLAYER_COUNT).fill(INITIAL_LIVES),
  );

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

  /** No resize animation in this phase. */
  const gameOverShared = useSharedValue(false);

  /** Blocks duplicate miss events while JS applies the elimination. */
  const missPendingShared = useSharedValue(false);

  const addPoint = (playerId: number) => {
    useGameStore.getState().addPoint(playerId);
  };

  /**
   * Apply a miss on the JS thread.
   *
   * The physics worklet has already relaunched the ball at the old polygon's
   * center, so there is never a frame where the ball is left outside the new
   * polygon. The old and new polygons share the same center.
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

    /**
     * Phase 3 intentionally chooses the simplest safe re-clamp strategy:
     * restart the single in-flight ball at the polygon center.
     *
     * Every generated polygon has the same center, so the ball is guaranteed
     * to be valid in the new arena without any edge projection logic.
     */
    if (nextPlayers.length > 1) {
      const nextGeometry =
        nextPlayers.length === 2
          ? createTwoPlayerRectangleGeometry(radius, width / 2, height / 2)
          : createPolygonGeometry(
              nextPlayers.length,
              radius,
              width / 2,
              height / 2,
            );

      gameState.value = createInitialState(
        nextGeometry,
        CONFIG.initialBallSpeed,
        randomLaunchAngle(),
      );
    }

    setActivePlayers(nextPlayers);

    // Only the 1-player winner state locks the game. The 2-player rectangle
    // remains fully playable, so misses must continue to be accepted.
    if (nextPlayers.length > 1) {
      missPendingShared.value = false;
    }
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

      for (let i = 0; i < CONFIG.activePlayerIds.length; i++) {
        if (CONFIG.activePlayerIds[i] === localPlayerIdShared.value) {
          localWallIndex = i;
          break;
        }
      }

      if (localWallIndex < 0) return;

      const wall = CONFIG.geometry.walls[localWallIndex];
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

    const result = updatePhysics(
      gameState.value,
      delta / 1000,
      localPlayerIdShared.value,
      playerPaddleOffset.value,
      CONFIG,
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
       * Immediately clear the collision condition on the UI thread.
       * Center-relaunch is deliberately chosen for shatter safety: the center
       * is shared by every polygon size, so it is guaranteed to be inside the
       * new arena once the React state snaps to N-1 sides.
       */
      const newBall = createBall(
        CONFIG.geometry,
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
