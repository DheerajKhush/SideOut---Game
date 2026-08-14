import React from "react";
import {
  StyleSheet,
  Text,
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
} from "react-native-reanimated";

import {
  createBall,
  createInitialState,
  updatePhysics,
  type PhysicsConfig,
} from "@/game/engine/physics";

import { useGameStore } from "@/store/game-store";
import { GameRenderer } from "@/render/game-renderer";

const CONFIG: PhysicsConfig = {
  arenaWidth: 360,
  arenaHeight: 640,

  paddleWidth: 90,
  paddleHeight: 14,
  paddleMargin: 28,

  ballRadius: 8,

  initialBallSpeed: 280,
  maxBallSpeed: 650,

  botMaxSpeed: 220,

  maxBounceAngle: Math.PI / 4,
};

const randomLaunchAngle = () => {
  "worklet";

  const angle =
    Math.random() * (Math.PI * 0.8) +
    Math.PI * 0.1;

  return Math.random() < 0.5
    ? angle
    : angle + Math.PI;
};

export default function GameScreen() {
  const playerPaddleX = useSharedValue(
    CONFIG.arenaWidth / 2
  );

  const gameState = useSharedValue(
    createInitialState(
      CONFIG,
      randomLaunchAngle()
    )
  );

  const scorePoint = (
    player: "player" | "bot"
  ) => {
    useGameStore
      .getState()
      .addPoint(player);
  };

  /**
   * Player paddle gesture.
   *
   * Instead of accumulating event.changeX,
   * directly position the paddle at the finger.
   */
  const panGesture = Gesture.Pan()
    .onUpdate((event) => {
      const halfPaddle =
        CONFIG.paddleWidth / 2;

      const minX = halfPaddle;
      const maxX =
        CONFIG.arenaWidth - halfPaddle;

      // event.x is relative to the GestureDetector.
      const nextX = Math.max(
        minX,
        Math.min(maxX, event.x)
      );

      playerPaddleX.value = nextX;
    });

  /**
   * Physics loop.
   *
   * This runs on the UI thread.
   */
  useFrameCallback((frameInfo) => {
    const deltaTime =
      frameInfo.timeSincePreviousFrame;

    if (deltaTime == null) {
      return;
    }

    const nextState = updatePhysics(
      gameState.value,
      deltaTime / 1000,
      playerPaddleX.value,
      0,
      CONFIG
    );

    /**
     * A player or bot missed.
     */
    if (nextState.lastScoredBy !== null) {
      const launchAngle =
        randomLaunchAngle();

      const resetBall = createBall(
        CONFIG.arenaWidth,
        CONFIG.arenaHeight,
        CONFIG.initialBallSpeed,
        launchAngle
      );

      // Update score on JS thread.
      runOnJS(scorePoint)(
        nextState.lastScoredBy
      );

      // Reset ball and clear scoring event.
      gameState.value = {
        ...nextState,
        ball: resetBall,
        lastScoredBy: null,
      };

      return;
    }

    gameState.value = nextState;
  });

  const playerScore = useGameStore(
    (state) => state.playerScore
  );

  const botScore = useGameStore(
    (state) => state.botScore
  );

  return (
    <GestureHandlerRootView
      style={styles.root}
    >
      <View style={styles.container}>
        <Text style={styles.score}>
          {botScore} : {playerScore}
        </Text>

        <GestureDetector
          gesture={panGesture}
        >
          {/*
            IMPORTANT:
            Give the gesture surface the exact
            dimensions of the arena.
          */}
          <View
            style={{
              width: CONFIG.arenaWidth,
              height: CONFIG.arenaHeight,
            }}
          >
            <GameRenderer
              state={gameState}
              playerPaddleX={
                playerPaddleX
              }
              config={CONFIG}
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
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#111",
  },

  score: {
    position: "absolute",
    top: 40,
    zIndex: 10,
    color: "white",
    fontSize: 28,
    fontWeight: "700",
  },
});