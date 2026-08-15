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
  useSharedValue
} from "react-native-reanimated";

import {
  createBall,
  createInitialState,
  updatePhysics,
  type PhysicsConfig,
} from "@/game/engine/physics";

import { createPolygonGeometry } from "@/game/engine/polygon";

import { useGameStore } from "@/store/game-store";

import { GameRenderer } from "@/render/game-renderer";

const PLAYER_COUNT = 8;

const randomLaunchAngle = () => {
  "worklet";

  return Math.random() * Math.PI * 2;
};

export default function GameScreen() {
  const { width, height } = useWindowDimensions();

  const [localSlot, setLocalSlot] = useState(0);

  /**
   * Keep a reasonable margin around
   * the polygon.
   */
  const radius = Math.min(width, height) * 0.42;

  const geometry = useMemo(
    () => createPolygonGeometry(PLAYER_COUNT, radius, width / 2, height / 2),
    [width, height, radius],
  );

  const CONFIG: PhysicsConfig = useMemo(
    () => ({
      geometry,

      ballRadius: 8,

      paddleLength: 58,
      paddleThickness: 12,

      initialBallSpeed: 280,
      maxBallSpeed: 650,

      /**
       * Deliberately slower than
       * the ball.
       */
      botMaxSpeed: 145,

      botReactionDeadZone: 12,

      /**
       * Noticeable off-center
       * paddle influence.
       */
      maxBounceAngle: Math.PI / 3,
    }),
    [geometry],
  );

  /**
   * Player paddle position along
   * the local wall.
   *
   * This is canonical wall-local
   * distance, NOT screen X.
   */
  const playerPaddleOffset = useSharedValue(0);

  /**
   * Physics state remains canonical.
   */
  const gameState = useSharedValue(
    createInitialState(geometry, CONFIG.initialBallSpeed, randomLaunchAngle()),
  );

  /**
   * Keep local slot on UI thread too.
   */
  const localSlotShared = useSharedValue(0);
  const renderRotation = useSharedValue(Math.PI / 2 - geometry.walls[0].angle);
  /**
   * ------------------------------------------
   * SCORE
   * ------------------------------------------
   */

  const addPoint = (slot: number) => {
    useGameStore.getState().addPoint(slot);
  };

  /**
   * ------------------------------------------
   * DEBUG: CHANGE LOCAL PLAYER
   * ------------------------------------------
   */
  const cycleLocalPlayer = () => {
    setLocalSlot((current) => {
      const next = (current + 1) % PLAYER_COUNT;

      /*
       * Physics/debug state.
       */
      localSlotShared.value = next;

      /*
       * New canonical rotation required
       * to bring this wall to the bottom.
       */
      const targetRotation = Math.PI / 2 - geometry.walls[next].angle;

      /*
       * Find the shortest path from the
       * current rotation to the target.
       */
      const currentRotation = renderRotation.value;

      const delta = normalizeAngle(targetRotation - currentRotation);

      /*
       * Put the new local paddle at
       * the center of its wall.
       */
      playerPaddleOffset.value = 0;

      gestureStartOffset.value = 0;

      return next;
    });
  };

  const normalizeAngle = (angle: number) => {
    "worklet";

    while (angle > Math.PI) {
      angle -= Math.PI * 2;
    }

    while (angle < -Math.PI) {
      angle += Math.PI * 2;
    }

    return angle;
  };

  /**
   * ------------------------------------------
   * PLAYER GESTURE
   * ------------------------------------------
   *
   * Because the renderer rotates the polygon
   * so the local wall is horizontal at the
   * bottom, screen X maps directly to the
   * local wall tangent.
   */

  const gestureStartOffset = useSharedValue(0);

  const panGesture = Gesture.Pan()
    .onBegin(() => {
      gestureStartOffset.value = playerPaddleOffset.value;
    })
    .onUpdate((event) => {
      const wall = geometry.walls[localSlotShared.value];

      const maxOffset = wall.length / 2 - CONFIG.paddleLength / 2;

      const nextOffset = gestureStartOffset.value + event.translationX;

      playerPaddleOffset.value = Math.max(
        -maxOffset,
        Math.min(maxOffset, nextOffset),
      );
    });

  /**
   * ------------------------------------------
   * PHYSICS
   * ------------------------------------------
   */
  useFrameCallback((frameInfo) => {
    const delta = frameInfo.timeSincePreviousFrame;

    if (delta == null) {
      return;
    }

    const result = updatePhysics(
      gameState.value,
      delta / 1000,
      localSlotShared.value,
      playerPaddleOffset.value,
      CONFIG,
    );

    /**
     * Someone missed.
     */
    if (result.missedWall !== null) {
      /**
       * Award the point to the
       * last successful hitter.
       */
      if (result.state.lastHitter !== null) {
        runOnJS(addPoint)(result.state.lastHitter);
      }

      /**
       * IMPORTANT:
       *
       * Randomness happens here on
       * the UI thread.
       *
       * Physics itself remains pure.
       */
      const newBall = createBall(
        geometry,
        CONFIG.initialBallSpeed,
        randomLaunchAngle(),
      );

      gameState.value = {
        ...result.state,

        ball: newBall,

        lastHitter: null,
      };

      return;
    }

    gameState.value = result.state;
  });

  const scores = useGameStore((state) => state.scores);

  return (
    <GestureHandlerRootView style={styles.root}>
      <View style={styles.container}>
        {/* Debug control */}
        <Pressable style={styles.debugButton} onPress={cycleLocalPlayer}>
          <Text style={styles.debugButtonText}>
            LOCAL: P{localSlot} · ROTATE
          </Text>
        </Pressable>

        {/* Local score */}
        <Text style={styles.score}>
          P{localSlot}: {scores[localSlot] ?? 0}
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
              localSlot={localSlot}
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
// import { StyleSheet, Text, View } from "react-native";

// import {
//   Gesture,
//   GestureDetector,
//   GestureHandlerRootView,
// } from "react-native-gesture-handler";

// import {
//   runOnJS,
//   useFrameCallback,
//   useSharedValue,
// } from "react-native-reanimated";

// import {
//   createBall,
//   createInitialState,
//   updatePhysics,
//   type PhysicsConfig,
// } from "@/game/engine/physics";

// import { GameRenderer } from "@/render/game-renderer";
// import { useGameStore } from "@/store/game-store";

// const CONFIG: PhysicsConfig = {
//   arenaWidth: 360,
//   arenaHeight: 640,

//   paddleWidth: 90,
//   paddleHeight: 14,
//   paddleMargin: 28,

//   ballRadius: 8,

//   initialBallSpeed: 280,
//   maxBallSpeed: 650,

//   botMaxSpeed: 220,

//   maxBounceAngle: Math.PI / 4,
// };

// const randomLaunchAngle = () => {
//   "worklet";

//   const angle = Math.random() * (Math.PI * 0.8) + Math.PI * 0.1;

//   return Math.random() < 0.5 ? angle : angle + Math.PI;
// };

// export default function GameScreen() {
//   const playerPaddleX = useSharedValue(CONFIG.arenaWidth / 2);

//   const gameState = useSharedValue(
//     createInitialState(CONFIG, randomLaunchAngle()),
//   );

//   const scorePoint = (player: "player" | "bot") => {
//     useGameStore.getState().addPoint(player);
//   };

//   /**
//    * Player paddle gesture.
//    *
//    * Instead of accumulating event.changeX,
//    * directly position the paddle at the finger.
//    */
//   const panGesture = Gesture.Pan().onUpdate((event) => {
//     const halfPaddle = CONFIG.paddleWidth / 2;

//     const minX = halfPaddle;
//     const maxX = CONFIG.arenaWidth - halfPaddle;

//     // event.x is relative to the GestureDetector.
//     const nextX = Math.max(minX, Math.min(maxX, event.x));

//     playerPaddleX.value = nextX;
//   });

//   /**
//    * Physics loop.
//    *
//    * This runs on the UI thread.
//    */
//   useFrameCallback((frameInfo) => {
//     const deltaTime = frameInfo.timeSincePreviousFrame;

//     if (deltaTime == null) {
//       return;
//     }

//     const nextState = updatePhysics(
//       gameState.value,
//       deltaTime / 1000,
//       playerPaddleX.value,
//       0,
//       CONFIG,
//     );

//     /**
//      * A player or bot missed.
//      */
//     if (nextState.lastScoredBy !== null) {
//       const launchAngle = randomLaunchAngle();

//       const resetBall = createBall(
//         CONFIG.arenaWidth,
//         CONFIG.arenaHeight,
//         CONFIG.initialBallSpeed,
//         launchAngle,
//       );

//       // Update score on JS thread.
//       runOnJS(scorePoint)(nextState.lastScoredBy);

//       // Reset ball and clear scoring event.
//       gameState.value = {
//         ...nextState,
//         ball: resetBall,
//         lastScoredBy: null,
//       };

//       return;
//     }

//     gameState.value = nextState;
//   });

//   const playerScore = useGameStore((state) => state.playerScore);

//   const botScore = useGameStore((state) => state.botScore);

//   return (
//     <GestureHandlerRootView style={styles.root}>
//       <View style={styles.container}>
//         <Text style={styles.score}>
//           {botScore} : {playerScore}
//         </Text>

//         <GestureDetector gesture={panGesture}>
//           {/*
//             IMPORTANT:
//             Give the gesture surface the exact
//             dimensions of the arena.
//           */}
//           <View
//             style={{
//               width: CONFIG.arenaWidth,
//               height: CONFIG.arenaHeight,
//             }}
//           >
//             <GameRenderer
//               state={gameState}
//               playerPaddleX={playerPaddleX}
//               config={CONFIG}
//             />
//           </View>
//         </GestureDetector>
//       </View>
//     </GestureHandlerRootView>
//   );
// }

// const styles = StyleSheet.create({
//   root: {
//     flex: 1,
//   },

//   container: {
//     flex: 1,
//     alignItems: "center",
//     justifyContent: "center",
//     backgroundColor: "#111",
//   },

//   score: {
//     position: "absolute",
//     top: 40,
//     zIndex: 10,
//     color: "white",
//     fontSize: 28,
//     fontWeight: "700",
//   },
// });
