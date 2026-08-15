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

import {
  MAX_BALL_COUNT,
  type GameState,
  type PhysicsConfig,
} from "@/game/engine/physics";

import type { PolygonGeometry, PolygonWall, Vec2 } from "@/game/engine/polygon";

interface GeometryTransition {
  oldGeometry: PolygonGeometry;
  oldActivePlayerIds: number[];

  /** Angle of the player's wall before the shatter. */
  oldLocalWallAngle: number;
}

interface Props {
  state: SharedValue<GameState>;
  playerPaddleOffset: SharedValue<number>;
  config: PhysicsConfig;

  /** Stable player id, not the current wall index. */
  localSlot: number;

  /** Lives indexed by stable player id. */
  lives: number[];

  /**
   * Present while/after a shatter.
   *
   * The transition still represents ONLY the wall-count change.
   * arenaScale independently applies the continuous radius shrink.
   */
  transition: GeometryTransition | null;

  transitionProgress: SharedValue<number>;

  /**
   * Current continuous arena radius scale.
   *
   * 1 = original radius.
   * <1 = shrink-reduced radius.
   */
  arenaScale: SharedValue<number>;
}

const labelFont = matchFont({
  fontFamily: "sans-serif",
  fontSize: 10,
  fontWeight: "700",
});

const lerp = (a: number, b: number, t: number) => {
  "worklet";

  return a + (b - a) * t;
};

const lerpVec = (a: Vec2, b: Vec2, t: number): Vec2 => {
  "worklet";

  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t),
  };
};

const scalePoint = (point: Vec2, center: Vec2, scale: number): Vec2 => {
  "worklet";

  return {
    x: center.x + (point.x - center.x) * scale,

    y: center.y + (point.y - center.y) * scale,
  };
};

const normalizeVec = (v: Vec2): Vec2 => {
  "worklet";

  const length = Math.sqrt(v.x * v.x + v.y * v.y);

  if (length < 0.000001) {
    return {
      x: 0,
      y: 0,
    };
  }

  return {
    x: v.x / length,
    y: v.y / length,
  };
};

const normalizeAngle = (angle: number) => {
  "worklet";

  let value = angle;

  while (value > Math.PI) {
    value -= Math.PI * 2;
  }

  while (value < -Math.PI) {
    value += Math.PI * 2;
  }

  return value;
};

const lerpAngle = (a: number, b: number, t: number) => {
  "worklet";

  return a + normalizeAngle(b - a) * t;
};

/* =========================================================
 * PASSIVE BOUNDARY
 * ======================================================= */

interface BoundaryVisualProps {
  wall: PolygonWall;
  arenaCenter: Vec2;
  arenaScale: SharedValue<number>;
}

const BoundaryVisual = ({
  wall,
  arenaCenter,
  arenaScale,
}: BoundaryVisualProps) => {
  const start = useDerivedValue(() =>
    scalePoint(wall.start, arenaCenter, arenaScale.value),
  );

  const end = useDerivedValue(() =>
    scalePoint(wall.end, arenaCenter, arenaScale.value),
  );

  return (
    <Line
      p1={start}
      p2={end}
      color="#32435C"
      strokeWidth={1.5}
      opacity={0.55}
    />
  );
};

/* =========================================================
 * WALL / PADDLE
 * ======================================================= */

interface WallVisualProps {
  wall: PolygonWall;
  oldWall: PolygonWall | null;

  state: SharedValue<GameState>;
  playerPaddleOffset: SharedValue<number>;

  paddleLength: number;
  paddleThickness: number;

  isLocal: boolean;
  label: string;
  lives: number;

  transitionProgress: SharedValue<number>;
  arenaScale: SharedValue<number>;

  arenaCenter: Vec2;
}

const WallVisual = ({
  wall,
  oldWall,
  state,
  playerPaddleOffset,
  paddleLength,
  paddleThickness,
  isLocal,
  label,
  lives,
  transitionProgress,
  arenaScale,
  arenaCenter,
}: WallVisualProps) => {
  /**
   * The child owns these hooks so the parent can change
   * the number of walls after a shatter without changing
   * the parent's hook count.
   */

  /**
   * FIRST mechanism:
   *
   * oldWall -> wall is the Phase 3b wall-count transition.
   */
  const wallStart = useDerivedValue(() => {
    const t = transitionProgress.value;

    const interpolated = lerpVec(
      oldWall?.start ?? wall.start,

      wall.start,
      t,
    );

    /**
     * SECOND mechanism:
     *
     * Continuous radius shrink.
     *
     * The already-interpolated wall is scaled around
     * the arena center.
     */
    return scalePoint(interpolated, arenaCenter, arenaScale.value);
  });

  const wallEnd = useDerivedValue(() => {
    const t = transitionProgress.value;

    const interpolated = lerpVec(
      oldWall?.end ?? wall.end,

      wall.end,
      t,
    );

    return scalePoint(interpolated, arenaCenter, arenaScale.value);
  });

  const wallCenter = useDerivedValue(() => {
    const t = transitionProgress.value;

    const interpolated = lerpVec(
      oldWall?.center ?? wall.center,

      wall.center,
      t,
    );

    return scalePoint(interpolated, arenaCenter, arenaScale.value);
  });

  const wallTangent = useDerivedValue(() => {
    const t = transitionProgress.value;

    return normalizeVec(
      lerpVec(
        oldWall?.tangent ?? wall.tangent,

        wall.tangent,
        t,
      ),
    );
  });

  const wallOutward = useDerivedValue(() => {
    const t = transitionProgress.value;

    return normalizeVec(
      lerpVec(
        oldWall?.outward ?? wall.outward,

        wall.outward,
        t,
      ),
    );
  });

  const wallAngle = useDerivedValue(() => {
    const t = transitionProgress.value;

    return lerpAngle(
      oldWall?.angle ?? wall.angle,

      wall.angle,
      t,
    );
  });

  /**
   * Paddle offsets are already expressed in CURRENT
   * physics units because physics scales paddle length
   * and wall length on every tick.
   *
   * Therefore we do NOT multiply paddleOffset by arenaScale
   * again here.
   */
  const paddleOffset = useDerivedValue(() => {
    if (isLocal) {
      return playerPaddleOffset.value;
    }

    const t = transitionProgress.value;

    const oldOffset = oldWall
      ? (state.value.paddleOffsets[oldWall.slot] ?? 0)
      : (state.value.paddleOffsets[wall.slot] ?? 0);

    const newOffset = state.value.paddleOffsets[wall.slot] ?? oldOffset;

    return t < 0.999999 ? oldOffset : newOffset;
  });

  const currentPaddleLength = useDerivedValue(
    () => paddleLength * arenaScale.value,
  );

  const paddleCenter = useDerivedValue(() => ({
    x: wallCenter.value.x + wallTangent.value.x * paddleOffset.value,

    y: wallCenter.value.y + wallTangent.value.y * paddleOffset.value,
  }));

  const paddleCenterX = useDerivedValue(() => paddleCenter.value.x);

  const paddleCenterY = useDerivedValue(() => paddleCenter.value.y);

  const paddleStart = useDerivedValue(() => {
    const half = currentPaddleLength.value / 2;

    return {
      x: paddleCenterX.value - wallTangent.value.x * half,

      y: paddleCenterY.value - wallTangent.value.y * half,
    };
  });

  const paddleEnd = useDerivedValue(() => {
    const half = currentPaddleLength.value / 2;

    return {
      x: paddleCenterX.value + wallTangent.value.x * half,

      y: paddleCenterY.value + wallTangent.value.y * half,
    };
  });

  const labelX = useDerivedValue(
    () => wallCenter.value.x + wallOutward.value.x * (24 * arenaScale.value),
  );

  const labelY = useDerivedValue(
    () => wallCenter.value.y + wallOutward.value.y * (24 * arenaScale.value),
  );

  /**
   * Skia's Group transform prop expects the transform array itself
   * to be animated, rather than a DerivedValue nested inside the array.
   */
  const labelTransform = useDerivedValue(() => [
    {
      rotate: -(Math.PI / 2 - wallAngle.value),
    },
  ]);

  const pipOneX = useDerivedValue(
    () =>
      wallCenter.value.x +
      wallOutward.value.x * (24 * arenaScale.value) +
      wallTangent.value.x * (34 * arenaScale.value),
  );

  const pipOneY = useDerivedValue(
    () =>
      wallCenter.value.y +
      wallOutward.value.y * (24 * arenaScale.value) +
      wallTangent.value.y * (34 * arenaScale.value),
  );

  const pipTwoX = useDerivedValue(
    () =>
      wallCenter.value.x +
      wallOutward.value.x * (24 * arenaScale.value) +
      wallTangent.value.x * (42 * arenaScale.value),
  );

  const pipTwoY = useDerivedValue(
    () =>
      wallCenter.value.y +
      wallOutward.value.y * (24 * arenaScale.value) +
      wallTangent.value.y * (42 * arenaScale.value),
  );

  const primaryColor = isLocal ? "#67FFD1" : "#FF4D8D";

  const secondaryColor = isLocal ? "#18CFA5" : "#D92768";

  const wallColor = isLocal ? "#35FFD0" : "#32435C";

  return (
    <>
      <Line
        p1={wallStart}
        p2={wallEnd}
        color={wallColor}
        strokeWidth={5}
        opacity={isLocal ? 0.16 : 0.08}
      />

      <Line
        p1={wallStart}
        p2={wallEnd}
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

      <Group origin={wallCenter} transform={labelTransform}>
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
 * BALL
 * ======================================================= */

interface BallVisualProps {
  state: SharedValue<GameState>;
  ballIndex: number;
  ballRadius: number;
}

const BallVisual = ({ state, ballIndex, ballRadius }: BallVisualProps) => {
  const ballX = useDerivedValue(() => state.value.balls[ballIndex]?.x ?? 0);

  const ballY = useDerivedValue(() => state.value.balls[ballIndex]?.y ?? 0);

  const ballPosition = useDerivedValue(() => ({
    x: ballX.value,
    y: ballY.value,
  }));

  const ballDirection = useDerivedValue(() => {
    const ball = state.value.balls[ballIndex];

    if (!ball) {
      return {
        x: 0,
        y: 0,
      };
    }

    const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);

    if (speed < 0.001) {
      return {
        x: 0,
        y: 0,
      };
    }

    return {
      x: ball.vx / speed,
      y: ball.vy / speed,
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

  const opacity = useDerivedValue(() => (state.value.balls[ballIndex] ? 1 : 0));

  return (
    <Group opacity={opacity}>
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

      <Circle cx={ballX} cy={ballY} r={ballRadius} color="#DDF7FF" />

      <Circle cx={ballX} cy={ballY} r={ballRadius * 0.5} color="#FFFFFF" />
    </Group>
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
  transition,
  transitionProgress,
  arenaScale,
}: Props) => {
  const geometry = config.geometry;

  /** Stable player id -> current wall index. */
  let localWallIndex = 0;

  for (let i = 0; i < config.activePlayerIds.length; i++) {
    if (config.activePlayerIds[i] === localSlot) {
      localWallIndex = i;
      break;
    }
  }

  const localWall = geometry.walls[localWallIndex];

  const oldLocalWall = transition
    ? transition.oldGeometry.walls[
        transition.oldActivePlayerIds.indexOf(localSlot)
      ]
    : null;

  /**
   * Rotation belongs to the wall-count transition.
   *
   * Continuous shrinking does NOT alter rotation.
   */
  const renderTransform = useDerivedValue(() => {
    const currentAngle = localWall?.angle ?? 0;

    if (!transition || !oldLocalWall) {
      return [
        {
          rotate: Math.PI / 2 - currentAngle,
        },
      ];
    }

    const angle = lerpAngle(
      transition.oldLocalWallAngle,
      currentAngle,
      transitionProgress.value,
    );

    return [
      {
        rotate: Math.PI / 2 - angle,
      },
    ];
  });

  const canvasWidth = geometry.center.x * 2;

  const canvasHeight = geometry.center.y * 2;

  /**
   * Paddle size is based on the BASE config.
   *
   * WallVisual applies arenaScale to it.
   */
  const basePaddleLength = config.paddleLength;
  const centerOuterRadius = useDerivedValue(() => 22 * arenaScale.value);

  const centerMiddleRadius = useDerivedValue(() => 10 * arenaScale.value);

  const centerInnerRadius = useDerivedValue(() => 7 * arenaScale.value);
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

      <Group origin={geometry.center} transform={renderTransform}>
        {geometry.walls.map((wall) => {
          const playerId = config.activePlayerIds[wall.slot];

          if (playerId == null) {
            return (
              <BoundaryVisual
                key={`boundary-${wall.slot}`}
                wall={wall}
                arenaCenter={geometry.center}
                arenaScale={arenaScale}
              />
            );
          }

          const isLocal = playerId === localSlot;

          let oldWall: PolygonWall | null = null;

          if (transition) {
            const oldSlot = transition.oldActivePlayerIds.indexOf(playerId);

            if (oldSlot >= 0) {
              oldWall = transition.oldGeometry.walls[oldSlot] ?? null;
            }
          }

          return (
            <WallVisual
              key={`wall-${playerId}`}
              wall={wall}
              oldWall={oldWall}
              state={state}
              playerPaddleOffset={playerPaddleOffset}
              paddleLength={basePaddleLength}
              paddleThickness={config.paddleThickness}
              isLocal={isLocal}
              label={isLocal ? "YOU" : `BOT ${playerId}`}
              lives={lives[playerId] ?? 0}
              transitionProgress={transitionProgress}
              arenaScale={arenaScale}
              arenaCenter={geometry.center}
            />
          );
        })}
        <Circle
          cx={geometry.center.x}
          cy={geometry.center.y}
          r={centerOuterRadius}
          color="#152338"
          opacity={0.18}
        />
        <Circle
          cx={geometry.center.x}
          cy={geometry.center.y}
          r={centerMiddleRadius}
          color="#0A111C"
        />
        <Circle
          cx={geometry.center.x}
          cy={geometry.center.y}
          r={centerInnerRadius}
          color="#5B7896"
          style="stroke"
          strokeWidth={1}
          opacity={0.75}
        />

        {Array.from({
          length: MAX_BALL_COUNT,
        }).map((_, ballIndex) => (
          <BallVisual
            key={`ball-${ballIndex}`}
            state={state}
            ballIndex={ballIndex}
            ballRadius={config.ballRadius}
          />
        ))}
      </Group>
    </Canvas>
  );
};
