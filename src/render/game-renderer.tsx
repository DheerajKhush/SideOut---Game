import {
  Canvas,
  Circle,
  Group,
  Line,
  Rect,
  Text,
  matchFont,
} from "@shopify/react-native-skia";

import { SharedValue, useDerivedValue } from "react-native-reanimated";

import type { GameState, PhysicsConfig } from "@/game/engine/physics";

import type { PolygonWall } from "@/game/engine/polygon";

interface Props {
  state: SharedValue<GameState>;

  playerPaddleOffset: SharedValue<number>;

  config: PhysicsConfig;

  localSlot: number;
}

const labelFont = matchFont({
  fontFamily: "sans-serif",
  fontSize: 10,
  fontWeight: "700",
});

/* =========================================================
 * WALL / PADDLE
 * ======================================================= */

interface WallVisualProps {
  wall: PolygonWall;
  paddleOffset: SharedValue<number>;
  paddleLength: number;
  paddleThickness: number;
  isLocal: boolean;
  label: string;
  localWallAngle: number;
}
const WallVisual = ({
  wall,
  paddleOffset,
  paddleLength,
  paddleThickness,
  isLocal,
  label,
  localWallAngle,
}: WallVisualProps) => {
  /*
   * =============================================
   * PADDLE CENTER
   * =============================================
   */

  const paddleCenterX = useDerivedValue(
    () => wall.center.x + wall.tangent.x * paddleOffset.value,
  );

  const paddleCenterY = useDerivedValue(
    () => wall.center.y + wall.tangent.y * paddleOffset.value,
  );

  /*
   * =============================================
   * PADDLE ENDPOINTS
   * =============================================
   */

  const paddleStart = useDerivedValue(() => ({
    x: paddleCenterX.value - wall.tangent.x * (paddleLength / 2),

    y: paddleCenterY.value - wall.tangent.y * (paddleLength / 2),
  }));

  const paddleEnd = useDerivedValue(() => ({
    x: paddleCenterX.value + wall.tangent.x * (paddleLength / 2),

    y: paddleCenterY.value + wall.tangent.y * (paddleLength / 2),
  }));

  /*
   * =============================================
   * LABEL POSITION
   * =============================================
   *
   * IMPORTANT:
   *
   * Label uses wall.center, NOT paddle position.
   * Therefore the label stays fixed while the
   * paddle moves.
   */

  const labelX = useDerivedValue(() => wall.center.x + wall.outward.x * 24);

  const labelY = useDerivedValue(() => wall.center.y + wall.outward.y * 24);

  /*
   * =============================================
   * LABEL ROTATION
   * =============================================
   */

  const labelRotation = wall.angle - localWallAngle;

  /*
   * =============================================
   * COLORS
   * =============================================
   */

  const primaryColor = isLocal ? "#67FFD1" : "#FF4D8D";

  const secondaryColor = isLocal ? "#18CFA5" : "#D92768";

  const wallColor = isLocal ? "#35FFD0" : "#32435C";

  /*
   * =============================================
   * RENDER
   * =============================================
   */

  return (
    <>
      {/* =========================================
       * WALL
       * ======================================= */}

      <Line
        p1={wall.start}
        p2={wall.end}
        color={wallColor}
        strokeWidth={5}
        opacity={isLocal ? 0.16 : 0.08}
      />

      <Line
        p1={wall.start}
        p2={wall.end}
        color={wallColor}
        strokeWidth={1}
        opacity={isLocal ? 0.8 : 0.45}
      />

      {/* =========================================
       * PADDLE GLOW
       * ======================================= */}

      <Line
        p1={paddleStart}
        p2={paddleEnd}
        color={secondaryColor}
        strokeWidth={paddleThickness + 14}
        opacity={0.035}
        strokeCap="round"
      />

      <Line
        p1={paddleStart}
        p2={paddleEnd}
        color={secondaryColor}
        strokeWidth={paddleThickness + 7}
        opacity={0.09}
        strokeCap="round"
      />

      {/* =========================================
       * PADDLE
       * ======================================= */}

      <Line
        p1={paddleStart}
        p2={paddleEnd}
        color={primaryColor}
        strokeWidth={paddleThickness}
        strokeCap="round"
      />

      <Line
        p1={paddleStart}
        p2={paddleEnd}
        color={isLocal ? "#D8FFF4" : "#FFD5E4"}
        strokeWidth={3}
        opacity={0.9}
        strokeCap="round"
      />

      {/* =========================================
       * LOCAL PLAYER INDICATOR
       * ======================================= */}

      {isLocal && (
        <>
          <Circle
            cx={paddleCenterX}
            cy={paddleCenterY}
            r={15}
            color="#67FFD1"
            opacity={0.06}
          />

          <Circle cx={paddleCenterX} cy={paddleCenterY} r={3} color="#FFFFFF" />
        </>
      )}

      {/* =========================================
       * PLAYER LABEL
       * ======================================= */}

      <Group
        origin={wall.center}
        transform={[
          {
            // Cancel the rotation applied to
            // the entire polygon.
            rotate: -(Math.PI / 2 - localWallAngle),
          },
        ]}
      >
        <Text
          x={labelX}
          y={labelY}
          text={label}
          font={labelFont}
          color={primaryColor}
        />
      </Group>
    </>
  );
};

/* =========================================================
 * MAIN RENDERER
 * ======================================================= */

export const GameRenderer = ({
  state,
  playerPaddleOffset,
  config,
  localSlot,
}: Props) => {
  const geometry = config.geometry;

  const localWall = geometry.walls[localSlot];

  /*
   * -------------------------------------------------------
   * VIEW ROTATION
   * -------------------------------------------------------
   *
   * Physics remains completely canonical.
   *
   * Only this renderer rotates the polygon.
   *
   * We rotate the local wall so it becomes
   * the bottom wall of the screen.
   */

  const renderRotation = Math.PI / 2 - localWall.angle;

  /*
   * -------------------------------------------------------
   * BALL
   * -------------------------------------------------------
   */
  const ballX = useDerivedValue(() => state.value.ball.x);

  const ballY = useDerivedValue(() => state.value.ball.y);

  const ballPosition = useDerivedValue(() => ({
    x: ballX.value,
    y: ballY.value,
  }));
  /*
   * Ball direction.
   *
   * Used for the energy trail.
   */

  const ballDirection = useDerivedValue(() => {
    const { vx, vy } = state.value.ball;

    const speed = Math.sqrt(vx * vx + vy * vy);

    if (speed < 0.001) {
      return {
        x: 0,
        y: 0,
      };
    }

    return {
      x: vx / speed,
      y: vy / speed,
    };
  });

  const ballTail = useDerivedValue(() => {
    const direction = ballDirection.value;

    const length = 42;

    return {
      x: ballPosition.value.x - direction.x * length,

      y: ballPosition.value.y - direction.y * length,
    };
  });

  /*
   * -------------------------------------------------------
   * CANVAS
   * -------------------------------------------------------
   */

  const canvasWidth = geometry.center.x * 2;

  const canvasHeight = geometry.center.y * 2;

  return (
    <Canvas
      style={{
        width: canvasWidth,
        height: canvasHeight,
      }}
    >
      {/* =================================================
       * BACKGROUND
       * ================================================= */}

      <Rect
        x={0}
        y={0}
        width={canvasWidth}
        height={canvasHeight}
        color="#03070D"
      />

      {/* Subtle inner field */}
      <Rect
        x={8}
        y={8}
        width={canvasWidth - 16}
        height={canvasHeight - 16}
        color="#050B14"
        opacity={0.75}
      />

      {/* =================================================
       * VERY SUBTLE GRID
       * ================================================= */}

      <Group opacity={0.055}>
        {Array.from({
          length: 9,
        }).map((_, index) => {
          const x = (canvasWidth / 8) * index;

          return (
            <Line
              key={`grid-v-${index}`}
              p1={{
                x,
                y: 0,
              }}
              p2={{
                x,
                y: canvasHeight,
              }}
              color="#6B8CAA"
              strokeWidth={1}
            />
          );
        })}

        {Array.from({
          length: 11,
        }).map((_, index) => {
          const y = (canvasHeight / 10) * index;

          return (
            <Line
              key={`grid-h-${index}`}
              p1={{
                x: 0,
                y,
              }}
              p2={{
                x: canvasWidth,
                y,
              }}
              color="#6B8CAA"
              strokeWidth={1}
            />
          );
        })}
      </Group>

      {/* =================================================
       * POLYGON
       *
       * Everything below this point rotates.
       * Physics does NOT.
       * ================================================= */}

      <Group
        origin={geometry.center}
        transform={[
          {
            rotate: renderRotation,
          },
        ]}
      >
        {/* ===============================================
         * POLYGON WALLS + PADDLES
         * ============================================= */}

        {geometry.walls.map((wall) => {
          /*
           * Every bot gets its own derived value.
           *
           * The local player uses the dedicated
           * player SharedValue.
           */
          const offset =
            wall.slot === localSlot
              ? playerPaddleOffset
              : useDerivedValue(() => state.value.paddleOffsets[wall.slot]);

          return (
            <WallVisual
              key={`wall-${wall.slot}`}
              wall={wall}
              paddleOffset={offset}
              paddleLength={config.paddleLength}
              paddleThickness={config.paddleThickness}
              isLocal={wall.slot === localSlot}
              label={wall.slot === localSlot ? "YOU" : `BOT ${wall.slot}`}
              localWallAngle={localWall.angle}
            />
          );
        })}

        {/* ===============================================
         * CENTER CORE
         * ============================================= */}

        <Circle
          cx={geometry.center.x}
          cy={geometry.center.y}
          r={22}
          color="#152338"
          opacity={0.18}
        />

        <Circle
          cx={geometry.center.x}
          cy={geometry.center.y}
          r={10}
          color="#0A111C"
        />

        <Circle
          cx={geometry.center.x}
          cy={geometry.center.y}
          r={7}
          color="#5B7896"
          style="stroke"
          strokeWidth={1}
          opacity={0.75}
        />

        {/* ===============================================
         * BALL ENERGY TRAIL
         * ============================================= */}

        <Line
          p1={ballTail}
          p2={ballPosition}
          color="#48BFFF"
          strokeWidth={18}
          opacity={0.025}
          strokeCap="round"
        />

        <Line
          p1={ballTail}
          p2={ballPosition}
          color="#48BFFF"
          strokeWidth={10}
          opacity={0.055}
          strokeCap="round"
        />

        <Line
          p1={ballTail}
          p2={ballPosition}
          color="#8BD8FF"
          strokeWidth={4}
          opacity={0.16}
          strokeCap="round"
        />

        {/* ===============================================
         * BALL BLOOM
         * ============================================= */}

        <Circle cx={ballX} cy={ballY} r={26} color="#43BFFF" opacity={0.025} />

        <Circle cx={ballX} cy={ballY} r={17} color="#55C7FF" opacity={0.07} />

        <Circle cx={ballX} cy={ballY} r={11} color="#A8E5FF" opacity={0.18} />

        {/* ===============================================
         * BALL CORE
         * ============================================= */}

        <Circle cx={ballX} cy={ballY} r={config.ballRadius} color="#DDF7FF" />

        <Circle
          cx={ballX}
          cy={ballY}
          r={config.ballRadius * 0.5}
          color="#FFFFFF"
        />
      </Group>
    </Canvas>
  );
};
// import React from "react";

// import {
//   Canvas,
//   Circle,
//   Group,
//   Line,
//   Rect,
//   RoundedRect,
// } from "@shopify/react-native-skia";

// import {
//   SharedValue,
//   useDerivedValue,
// } from "react-native-reanimated";

// import type {
//   GameState,
//   PhysicsConfig,
// } from "@/game/engine/physics";

// interface Props {
//   state: SharedValue<GameState>;
//   playerPaddleX: SharedValue<number>;
//   config: PhysicsConfig;
// }

// export const GameRenderer = ({
//   state,
//   playerPaddleX,
//   config,
// }: Props) => {
//   // ---------------------------------------------
//   // BALL
//   // ---------------------------------------------

//   const ballX = useDerivedValue(
//     () => state.value.ball.x
//   );

//   const ballY = useDerivedValue(
//     () => state.value.ball.y
//   );

//   // ---------------------------------------------
//   // PADDLES
//   // ---------------------------------------------

//   const botPaddleX = useDerivedValue(
//     () => state.value.botPaddleX
//   );

//   const playerPaddleLeft = useDerivedValue(
//     () =>
//       playerPaddleX.value -
//       config.paddleWidth / 2
//   );

//   const botPaddleLeft = useDerivedValue(
//     () =>
//       botPaddleX.value -
//       config.paddleWidth / 2
//   );

//   const playerPaddleY =
//     config.arenaHeight -
//     config.paddleMargin -
//     config.paddleHeight / 2;

//   const botPaddleY =
//     config.paddleMargin -
//     config.paddleHeight / 2;

//   return (
//     <Canvas
//       style={{
//         width: config.arenaWidth,
//         height: config.arenaHeight,
//       }}
//     >
//       {/* ================================================= */}
//       {/* BACKGROUND                                        */}
//       {/* ================================================= */}

//       <Rect
//         x={0}
//         y={0}
//         width={config.arenaWidth}
//         height={config.arenaHeight}
//         color="#050811"
//       />

//       {/* Subtle inner arena */}
//       <Rect
//         x={2}
//         y={2}
//         width={config.arenaWidth - 4}
//         height={config.arenaHeight - 4}
//         color="#070B16"
//       />

//       {/* ================================================= */}
//       {/* SUBTLE ARENA GRID                                 */}
//       {/* ================================================= */}

//       <Group opacity={0.12}>
//         {Array.from({ length: 7 }).map(
//           (_, index) => {
//             const x =
//               (config.arenaWidth / 6) *
//               index;

//             return (
//               <Line
//                 key={`vertical-${index}`}
//                 p1={{
//                   x,
//                   y: 0,
//                 }}
//                 p2={{
//                   x,
//                   y: config.arenaHeight,
//                 }}
//                 color="#31506F"
//                 strokeWidth={1}
//               />
//             );
//           }
//         )}

//         {Array.from({ length: 9 }).map(
//           (_, index) => {
//             const y =
//               (config.arenaHeight / 8) *
//               index;

//             return (
//               <Line
//                 key={`horizontal-${index}`}
//                 p1={{
//                   x: 0,
//                   y,
//                 }}
//                 p2={{
//                   x: config.arenaWidth,
//                   y,
//                 }}
//                 color="#31506F"
//                 strokeWidth={1}
//               />
//             );
//           }
//         )}
//       </Group>

//       {/* ================================================= */}
//       {/* CENTER LINE                                       */}
//       {/* ================================================= */}

//       <Group opacity={0.45}>
//         <Line
//           p1={{
//             y: config.arenaHeight / 2,
//            x: 0,
//           }}
//           p2={{
//             y: config.arenaHeight / 2,
//             x: config.arenaWidth,
//           }}
//           color="#718096"
//           strokeWidth={1}
//         />
//       </Group>

//       {/* ================================================= */}
//       {/* CENTER CIRCLE                                     */}
//       {/* ================================================= */}

//       <Circle
//         cx={config.arenaWidth / 2}
//         cy={config.arenaHeight / 2}
//         r={9}
//         color="#0A101C"
//         style="fill"
//       />

//       <Circle
//         cx={config.arenaWidth / 2}
//         cy={config.arenaHeight / 2}
//         r={8}
//         color="#1C2B3D"
//         style="stroke"
//         strokeWidth={2}
//       />

//       <Circle
//         cx={config.arenaWidth / 2}
//         cy={config.arenaHeight / 2}
//         r={5}
//         color="#73849A"
//       />

//       {/* ================================================= */}
//       {/* BOT PADDLE GLOW                                   */}
//       {/* ================================================= */}

//       <Group opacity={0.08}>
//         <RoundedRect
//           x={botPaddleLeft}
//           y={botPaddleY - 12}
//           width={config.paddleWidth}
//           height={config.paddleHeight + 24}
//           r={8}
//           color="#FF1744"
//         />
//       </Group>

//       <Group opacity={0.14}>
//         <RoundedRect
//           x={botPaddleLeft}
//           y={botPaddleY - 7}
//           width={config.paddleWidth}
//           height={config.paddleHeight + 14}
//           r={6}
//           color="#FF1744"
//         />
//       </Group>

//       {/* ================================================= */}
//       {/* BOT PADDLE                                        */}
//       {/* ================================================= */}

//       <RoundedRect
//         x={botPaddleLeft}
//         y={botPaddleY}
//         width={config.paddleWidth}
//         height={config.paddleHeight}
//         r={4}
//         color="#FF3158"
//       />

//       <RoundedRect
//         x={botPaddleLeft}
//         y={botPaddleY}
//         width={config.paddleWidth}
//         height={config.paddleHeight / 2}
//         r={4}
//         color="#FF8297"
//       />

//       {/* ================================================= */}
//       {/* PLAYER PADDLE GLOW                                */}
//       {/* ================================================= */}

//       <Group opacity={0.08}>
//         <RoundedRect
//           x={playerPaddleLeft}
//           y={playerPaddleY - 12}
//           width={config.paddleWidth}
//           height={config.paddleHeight + 24}
//           r={8}
//           color="#39FF88"
//         />
//       </Group>

//       <Group opacity={0.14}>
//         <RoundedRect
//           x={playerPaddleLeft}
//           y={playerPaddleY - 7}
//           width={config.paddleWidth}
//           height={config.paddleHeight + 14}
//           r={6}
//           color="#39FF88"
//         />
//       </Group>

//       {/* ================================================= */}
//       {/* PLAYER PADDLE                                     */}
//       {/* ================================================= */}

//       <RoundedRect
//         x={playerPaddleLeft}
//         y={playerPaddleY}
//         width={config.paddleWidth}
//         height={config.paddleHeight}
//         r={4}
//         color="#6CFF9E"
//       />

//       <RoundedRect
//         x={playerPaddleLeft}
//         y={playerPaddleY}
//         width={config.paddleWidth}
//         height={config.paddleHeight / 2}
//         r={4}
//         color="#D7FFE4"
//       />

//       {/* ================================================= */}
//       {/* BALL GLOW                                         */}
//       {/* ================================================= */}

//       <Circle
//         cx={ballX}
//         cy={ballY}
//         r={24}
//         color="#58A6FF"
//         opacity={0.04}
//       />

//       <Circle
//         cx={ballX}
//         cy={ballY}
//         r={18}
//         color="#58A6FF"
//         opacity={0.08}
//       />

//       <Circle
//         cx={ballX}
//         cy={ballY}
//         r={13}
//         color="#8CC8FF"
//         opacity={0.15}
//       />

//       {/* ================================================= */}
//       {/* BALL                                               */}
//       {/* ================================================= */}

//       <Circle
//         cx={ballX}
//         cy={ballY}
//         r={config.ballRadius}
//         color="#EAF6FF"
//       />

//       <Circle
//         cx={ballX}
//         cy={ballY}
//         r={config.ballRadius * 0.55}
//         color="#FFFFFF"
//       />
//     </Canvas>
//   );
// };
