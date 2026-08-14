import React from "react";

import {
  Canvas,
  Circle,
  Group,
  Line,
  Rect,
  RoundedRect,
} from "@shopify/react-native-skia";

import {
  SharedValue,
  useDerivedValue,
} from "react-native-reanimated";

import type {
  GameState,
  PhysicsConfig,
} from "@/game/engine/physics";

interface Props {
  state: SharedValue<GameState>;
  playerPaddleX: SharedValue<number>;
  config: PhysicsConfig;
}

export const GameRenderer = ({
  state,
  playerPaddleX,
  config,
}: Props) => {
  // ---------------------------------------------
  // BALL
  // ---------------------------------------------

  const ballX = useDerivedValue(
    () => state.value.ball.x
  );

  const ballY = useDerivedValue(
    () => state.value.ball.y
  );

  // ---------------------------------------------
  // PADDLES
  // ---------------------------------------------

  const botPaddleX = useDerivedValue(
    () => state.value.botPaddleX
  );

  const playerPaddleLeft = useDerivedValue(
    () =>
      playerPaddleX.value -
      config.paddleWidth / 2
  );

  const botPaddleLeft = useDerivedValue(
    () =>
      botPaddleX.value -
      config.paddleWidth / 2
  );

  const playerPaddleY =
    config.arenaHeight -
    config.paddleMargin -
    config.paddleHeight / 2;

  const botPaddleY =
    config.paddleMargin -
    config.paddleHeight / 2;

  return (
    <Canvas
      style={{
        width: config.arenaWidth,
        height: config.arenaHeight,
      }}
    >
      {/* ================================================= */}
      {/* BACKGROUND                                        */}
      {/* ================================================= */}

      <Rect
        x={0}
        y={0}
        width={config.arenaWidth}
        height={config.arenaHeight}
        color="#050811"
      />

      {/* Subtle inner arena */}
      <Rect
        x={2}
        y={2}
        width={config.arenaWidth - 4}
        height={config.arenaHeight - 4}
        color="#070B16"
      />

      {/* ================================================= */}
      {/* SUBTLE ARENA GRID                                 */}
      {/* ================================================= */}

      <Group opacity={0.12}>
        {Array.from({ length: 7 }).map(
          (_, index) => {
            const x =
              (config.arenaWidth / 6) *
              index;

            return (
              <Line
                key={`vertical-${index}`}
                p1={{
                  x,
                  y: 0,
                }}
                p2={{
                  x,
                  y: config.arenaHeight,
                }}
                color="#31506F"
                strokeWidth={1}
              />
            );
          }
        )}

        {Array.from({ length: 9 }).map(
          (_, index) => {
            const y =
              (config.arenaHeight / 8) *
              index;

            return (
              <Line
                key={`horizontal-${index}`}
                p1={{
                  x: 0,
                  y,
                }}
                p2={{
                  x: config.arenaWidth,
                  y,
                }}
                color="#31506F"
                strokeWidth={1}
              />
            );
          }
        )}
      </Group>

      {/* ================================================= */}
      {/* CENTER LINE                                       */}
      {/* ================================================= */}

      <Group opacity={0.45}>
        <Line
          p1={{
            y: config.arenaHeight / 2,
           x: 0,
          }}
          p2={{
            y: config.arenaHeight / 2,
            x: config.arenaWidth,
          }}
          color="#718096"
          strokeWidth={1}
        />
      </Group>

      {/* ================================================= */}
      {/* CENTER CIRCLE                                     */}
      {/* ================================================= */}

      <Circle
        cx={config.arenaWidth / 2}
        cy={config.arenaHeight / 2}
        r={9}
        color="#0A101C"
        style="fill"
      />

      <Circle
        cx={config.arenaWidth / 2}
        cy={config.arenaHeight / 2}
        r={8}
        color="#1C2B3D"
        style="stroke"
        strokeWidth={2}
      />

      <Circle
        cx={config.arenaWidth / 2}
        cy={config.arenaHeight / 2}
        r={5}
        color="#73849A"
      />

      {/* ================================================= */}
      {/* BOT PADDLE GLOW                                   */}
      {/* ================================================= */}

      <Group opacity={0.08}>
        <RoundedRect
          x={botPaddleLeft}
          y={botPaddleY - 12}
          width={config.paddleWidth}
          height={config.paddleHeight + 24}
          r={8}
          color="#FF1744"
        />
      </Group>

      <Group opacity={0.14}>
        <RoundedRect
          x={botPaddleLeft}
          y={botPaddleY - 7}
          width={config.paddleWidth}
          height={config.paddleHeight + 14}
          r={6}
          color="#FF1744"
        />
      </Group>

      {/* ================================================= */}
      {/* BOT PADDLE                                        */}
      {/* ================================================= */}

      <RoundedRect
        x={botPaddleLeft}
        y={botPaddleY}
        width={config.paddleWidth}
        height={config.paddleHeight}
        r={4}
        color="#FF3158"
      />

      <RoundedRect
        x={botPaddleLeft}
        y={botPaddleY}
        width={config.paddleWidth}
        height={config.paddleHeight / 2}
        r={4}
        color="#FF8297"
      />

      {/* ================================================= */}
      {/* PLAYER PADDLE GLOW                                */}
      {/* ================================================= */}

      <Group opacity={0.08}>
        <RoundedRect
          x={playerPaddleLeft}
          y={playerPaddleY - 12}
          width={config.paddleWidth}
          height={config.paddleHeight + 24}
          r={8}
          color="#39FF88"
        />
      </Group>

      <Group opacity={0.14}>
        <RoundedRect
          x={playerPaddleLeft}
          y={playerPaddleY - 7}
          width={config.paddleWidth}
          height={config.paddleHeight + 14}
          r={6}
          color="#39FF88"
        />
      </Group>

      {/* ================================================= */}
      {/* PLAYER PADDLE                                     */}
      {/* ================================================= */}

      <RoundedRect
        x={playerPaddleLeft}
        y={playerPaddleY}
        width={config.paddleWidth}
        height={config.paddleHeight}
        r={4}
        color="#6CFF9E"
      />

      <RoundedRect
        x={playerPaddleLeft}
        y={playerPaddleY}
        width={config.paddleWidth}
        height={config.paddleHeight / 2}
        r={4}
        color="#D7FFE4"
      />

      {/* ================================================= */}
      {/* BALL GLOW                                         */}
      {/* ================================================= */}

      <Circle
        cx={ballX}
        cy={ballY}
        r={24}
        color="#58A6FF"
        opacity={0.04}
      />

      <Circle
        cx={ballX}
        cy={ballY}
        r={18}
        color="#58A6FF"
        opacity={0.08}
      />

      <Circle
        cx={ballX}
        cy={ballY}
        r={13}
        color="#8CC8FF"
        opacity={0.15}
      />

      {/* ================================================= */}
      {/* BALL                                               */}
      {/* ================================================= */}

      <Circle
        cx={ballX}
        cy={ballY}
        r={config.ballRadius}
        color="#EAF6FF"
      />

      <Circle
        cx={ballX}
        cy={ballY}
        r={config.ballRadius * 0.55}
        color="#FFFFFF"
      />
    </Canvas>
  );
};