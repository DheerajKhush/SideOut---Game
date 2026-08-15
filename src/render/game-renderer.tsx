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
  /** Stable player id, not the current wall index. */
  localSlot: number;
  /** Lives indexed by stable player id. */
  lives: number[];
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
  state: SharedValue<GameState>;
  playerPaddleOffset: SharedValue<number>;
  paddleLength: number;
  paddleThickness: number;
  isLocal: boolean;
  label: string;
  lives: number;
  localWallAngle: number;
}

const WallVisual = ({
  wall,
  state,
  playerPaddleOffset,
  paddleLength,
  paddleThickness,
  isLocal,
  label,
  lives,
  localWallAngle,
}: WallVisualProps) => {
  /**
   * Always create this hook inside the child component. The parent can now
   * change the number of walls without changing its hook count.
   */
  const paddleOffset = useDerivedValue(() =>
    isLocal
      ? playerPaddleOffset.value
      : (state.value.paddleOffsets[wall.slot] ?? 0),
  );

  const paddleCenterX = useDerivedValue(
    () => wall.center.x + wall.tangent.x * paddleOffset.value,
  );

  const paddleCenterY = useDerivedValue(
    () => wall.center.y + wall.tangent.y * paddleOffset.value,
  );

  const paddleStart = useDerivedValue(() => ({
    x: paddleCenterX.value - wall.tangent.x * (paddleLength / 2),
    y: paddleCenterY.value - wall.tangent.y * (paddleLength / 2),
  }));

  const paddleEnd = useDerivedValue(() => ({
    x: paddleCenterX.value + wall.tangent.x * (paddleLength / 2),
    y: paddleCenterY.value + wall.tangent.y * (paddleLength / 2),
  }));

  const labelX = useDerivedValue(() => wall.center.x + wall.outward.x * 24);
  const labelY = useDerivedValue(() => wall.center.y + wall.outward.y * 24);

  const primaryColor = isLocal ? "#67FFD1" : "#FF4D8D";
  const secondaryColor = isLocal ? "#18CFA5" : "#D92768";
  const wallColor = isLocal ? "#35FFD0" : "#32435C";

  /**
   * Pips are placed along the wall tangent so they remain beside the label
   * after the entire polygon is rotated for the local player.
   */
  const pipOneX = useDerivedValue(
    () => wall.center.x + wall.outward.x * 24 + wall.tangent.x * 34,
  );
  const pipOneY = useDerivedValue(
    () => wall.center.y + wall.outward.y * 24 + wall.tangent.y * 34,
  );
  const pipTwoX = useDerivedValue(
    () => wall.center.x + wall.outward.x * 24 + wall.tangent.x * 42,
  );
  const pipTwoY = useDerivedValue(
    () => wall.center.y + wall.outward.y * 24 + wall.tangent.y * 42,
  );

  return (
    <>
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

      <Group
        origin={wall.center}
        transform={[
          {
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

        <Circle
          cx={pipOneX}
          cy={pipOneY}
          r={2.5}
          color="#A8B8CA"
          opacity={lives >= 1 ? 0.95 : 0.15}
        />

        <Circle
          cx={pipTwoX}
          cy={pipTwoY}
          r={2.5}
          color="#A8B8CA"
          opacity={lives >= 2 ? 0.95 : 0.15}
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
  lives,
}: Props) => {
  const geometry = config.geometry;

  /** localSlot is a stable player id; translate it to the current wall index. */
  let localWallIndex = 0;

  for (let i = 0; i < config.activePlayerIds.length; i++) {
    if (config.activePlayerIds[i] === localSlot) {
      localWallIndex = i;
      break;
    }
  }

  const localWall = geometry.walls[localWallIndex];
  const renderRotation = Math.PI / 2 - localWall.angle;

  const ballX = useDerivedValue(() => state.value.ball.x);
  const ballY = useDerivedValue(() => state.value.ball.y);

  const ballPosition = useDerivedValue(() => ({
    x: ballX.value,
    y: ballY.value,
  }));

  const ballDirection = useDerivedValue(() => {
    const { vx, vy } = state.value.ball;
    const speed = Math.sqrt(vx * vx + vy * vy);

    if (speed < 0.001) return { x: 0, y: 0 };

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

  const canvasWidth = geometry.center.x * 2;
  const canvasHeight = geometry.center.y * 2;

  return (
    <Canvas
      style={{
        width: canvasWidth,
        height: canvasHeight,
      }}
    >
      <Rect
        x={0}
        y={0}
        width={canvasWidth}
        height={canvasHeight}
        color="#03070D"
      />

      <Rect
        x={8}
        y={8}
        width={canvasWidth - 16}
        height={canvasHeight - 16}
        color="#050B14"
        opacity={0.75}
      />

      <Group opacity={0.055}>
        {Array.from({ length: 9 }).map((_, index) => {
          const x = (canvasWidth / 8) * index;

          return (
            <Line
              key={`grid-v-${index}`}
              p1={{ x, y: 0 }}
              p2={{ x, y: canvasHeight }}
              color="#6B8CAA"
              strokeWidth={1}
            />
          );
        })}

        {Array.from({ length: 11 }).map((_, index) => {
          const y = (canvasHeight / 10) * index;

          return (
            <Line
              key={`grid-h-${index}`}
              p1={{ x: 0, y }}
              p2={{ x: canvasWidth, y }}
              color="#6B8CAA"
              strokeWidth={1}
            />
          );
        })}
      </Group>

      <Group origin={geometry.center} transform={[{ rotate: renderRotation }]}>
        {geometry.walls.map((wall) => {
          const playerId = config.activePlayerIds[wall.slot];

          // In the 2-player rectangle, slots 2 and 3 are passive side
          // boundaries. They are fully reflecting in physics and are rendered
          // as ordinary arena edges, not as player walls.
          if (playerId == null) {
            return (
              <Line
                key={`boundary-${wall.slot}`}
                p1={wall.start}
                p2={wall.end}
                color="#32435C"
                strokeWidth={1.5}
                opacity={0.55}
              />
            );
          }

          const isLocal = playerId === localSlot;

          return (
            <WallVisual
              key={`wall-${playerId}`}
              wall={wall}
              state={state}
              playerPaddleOffset={playerPaddleOffset}
              paddleLength={config.paddleLength}
              paddleThickness={config.paddleThickness}
              isLocal={isLocal}
              label={isLocal ? "YOU" : `BOT ${playerId}`}
              lives={lives[playerId] ?? 0}
              localWallAngle={localWall.angle}
            />
          );
        })}

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

        <Circle cx={ballX} cy={ballY} r={26} color="#43BFFF" opacity={0.025} />
        <Circle cx={ballX} cy={ballY} r={17} color="#55C7FF" opacity={0.07} />
        <Circle cx={ballX} cy={ballY} r={11} color="#A8E5FF" opacity={0.18} />
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
