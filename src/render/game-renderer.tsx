import {
  Canvas,
  Circle,
  Group,
  Line
} from "@shopify/react-native-skia";

import { SharedValue, useDerivedValue } from "react-native-reanimated";

import {
  MAX_BALL_COUNT,
  type GameState,
  type PhysicsConfig,
} from "@/game/engine/physics";

import { NEUTRAL_TRAIL_COLOR, PLAYER_SLOT_COLORS } from "@/constants/game-colors";
import type { PolygonGeometry, PolygonWall, Vec2 } from "@/game/engine/polygon";
import { useMemo } from "react";



const getPlayerSlotColor = (slot: number | null): string => {
  "worklet";

  if (slot === null || slot < 0) {
    return NEUTRAL_TRAIL_COLOR;
  }

  return (
    PLAYER_SLOT_COLORS[slot % PLAYER_SLOT_COLORS.length] ?? NEUTRAL_TRAIL_COLOR
  );
};

interface GeometryTransition {
  oldGeometry: PolygonGeometry;
  oldActivePlayerIds: number[];
  oldLocalWallAngle: number;
}

interface Props {
  state: SharedValue<GameState>;
  playerPaddleOffset: SharedValue<number>;
  config: PhysicsConfig;
  localSlot: number;
  lives: number[];

  transition: GeometryTransition | null;

  transitionProgress: SharedValue<number>;

  arenaScale: SharedValue<number>;
  paddleFlashWallSlot?: SharedValue<number>;
  paddleFlashProgress?: SharedValue<number>;
  wallShatterProgress?: SharedValue<number>;
}

// const labelFont = matchFont({
//   fontFamily: "sans-serif",
//   fontSize: 10,
//   fontWeight: "700",
// });

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

  playerId: number;

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
  paddleFlashWallSlot?: SharedValue<number>;
  paddleFlashProgress?: SharedValue<number>;
}

const WallVisual = ({
  wall,
  oldWall,
  playerId,
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
  paddleFlashWallSlot,
  paddleFlashProgress,
}: WallVisualProps) => {
  /**
   * Phase 3b:
   * old wall -> new wall.
   */
  const wallStart = useDerivedValue(() => {
    const t = transitionProgress.value;

    const interpolated = lerpVec(oldWall?.start ?? wall.start, wall.start, t);

    return scalePoint(interpolated, arenaCenter, arenaScale.value);
  });

  const wallEnd = useDerivedValue(() => {
    const t = transitionProgress.value;

    const interpolated = lerpVec(oldWall?.end ?? wall.end, wall.end, t);

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
      lerpVec(oldWall?.tangent ?? wall.tangent, wall.tangent, t),
    );
  });

  const wallOutward = useDerivedValue(() => {
    const t = transitionProgress.value;

    return normalizeVec(
      lerpVec(oldWall?.outward ?? wall.outward, wall.outward, t),
    );
  });

  const wallAngle = useDerivedValue(() => {
    const t = transitionProgress.value;

    return lerpAngle(oldWall?.angle ?? wall.angle, wall.angle, t);
  });

  /**
   * Paddle offset remains in current arena coordinates.
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

  const paddleStart = useDerivedValue(() => {
    const half = currentPaddleLength.value / 2;

    return {
      x: paddleCenter.value.x - wallTangent.value.x * half,

      y: paddleCenter.value.y - wallTangent.value.y * half,
    };
  });

  const paddleEnd = useDerivedValue(() => {
    const half = currentPaddleLength.value / 2;

    return {
      x: paddleCenter.value.x + wallTangent.value.x * half,

      y: paddleCenter.value.y + wallTangent.value.y * half,
    };
  });

  const paddleFlash = useDerivedValue(() => {
    if (
      !paddleFlashWallSlot ||
      !paddleFlashProgress ||
      paddleFlashWallSlot.value !== wall.slot
    ) {
      return 0;
    }

    return paddleFlashProgress.value;
  });

  const labelTransform = useDerivedValue(() => [
    {
      rotate: -(Math.PI / 2 - wallAngle.value),
    },
  ]);


  /**
   * SAME persistent color system used by ball trails.
   */
  const primaryColor = getPlayerSlotColor(playerId);

  const secondaryColor = primaryColor;

  const wallColor = primaryColor;

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
      {/* Short contact glow — same color as the paddle */}
      <Line
        p1={paddleStart}
        p2={paddleEnd}
        color={primaryColor}
        strokeWidth={paddleThickness + 16}
        opacity={0}
        strokeCap="round"
      />


      <Line
        p1={paddleStart}
        p2={paddleEnd}
        color={primaryColor}
        strokeWidth={paddleThickness}
        strokeCap="round"
      />

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

  /**
   * Each ball independently reads its own
   * lastHitBySlot.
   */
  const trailColor = useDerivedValue(() => {
    const ball = state.value.balls[ballIndex];

    return getPlayerSlotColor(ball?.lastHitBySlot ?? null);
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
        color={trailColor}
        strokeWidth={18}
        opacity={0.025}
        strokeCap="round"
      />

      <Line
        p1={ballTail}
        p2={ballPosition}
        color={trailColor}
        strokeWidth={10}
        opacity={0.055}
        strokeCap="round"
      />

      <Line
        p1={ballTail}
        p2={ballPosition}
        color={trailColor}
        strokeWidth={4}
        opacity={0.16}
        strokeCap="round"
      />

      <Circle cx={ballX} cy={ballY} r={26} color={trailColor} opacity={0.025} />

      <Circle cx={ballX} cy={ballY} r={17} color={trailColor} opacity={0.07} />

      <Circle cx={ballX} cy={ballY} r={11} color={trailColor} opacity={0.18} />

      <Circle cx={ballX} cy={ballY} r={ballRadius} color="#DDF7FF" />

      <Circle cx={ballX} cy={ballY} r={ballRadius * 0.5} color="#FFFFFF" />
    </Group>
  );
};

interface ShatterBurstProps {
  center: Vec2;
  color: string;
  progress: SharedValue<number>;
  arenaScale: SharedValue<number>;
}

const ShatterBurst = ({
  center,
  color,
  progress,
  arenaScale,
}: ShatterBurstProps) => {
  const PARTICLE_COUNT = 20;

  return (
    <Group>
      {/* Central bloom */}
      <Circle
        cx={useDerivedValue(() => center.x)}
        cy={useDerivedValue(() => center.y)}
        r={useDerivedValue(() => {
          const t = progress.value;
          return 3 + t * 18;
        })}
        color={color}
        opacity={useDerivedValue(() => {
          const t = progress.value;

          if (t >= 1) {
            return 0;
          }

          return 0.22 * (1 - t) * (1 - t);
        })}
      />

      {Array.from({ length: PARTICLE_COUNT }).map((_, index) => {
        const angle =
          (Math.PI * 2 * index) / PARTICLE_COUNT;

        // Deterministic variation so every spark isn't identical.
        const distance =
          60 + (index % 3) * 15;

        const x = useDerivedValue(() => {
          const t = progress.value;

          return (
            center.x +
            Math.cos(angle) *
            distance *
            t *
            arenaScale.value
          );
        });

        const y = useDerivedValue(() => {
          const t = progress.value;

          return (
            center.y +
            Math.sin(angle) *
            distance *
            t *
            arenaScale.value
          );
        });

        const opacity = useDerivedValue(() => {
          const t = progress.value;

          if (t >= 1) {
            return 0;
          }

          // Fast quadratic fade.
          const fade = 1 - t;

          return 0.9 * fade * fade;
        });

        const radius = useDerivedValue(() => {
          const t = progress.value;

          return 2.4 - t * 1.4;
        });

        return (
          <Circle
            key={`shatter-spark-${index}`}
            cx={x}
            cy={y}
            r={radius}
            color={color}
            opacity={opacity}
          />
        );
      })}
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
  paddleFlashWallSlot,
  paddleFlashProgress,
  wallShatterProgress
}: Props) => {
  const geometry = config.geometry;

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

  const shatteredWall = useMemo(() => {
    if (!transition) {
      return null;
    }

    for (let i = 0; i < transition.oldActivePlayerIds.length; i++) {
      const playerId = transition.oldActivePlayerIds[i];

      if (!config.activePlayerIds.includes(playerId)) {
        return {
          wall: transition.oldGeometry.walls[i] ?? null,
          playerId,
        };
      }
    }

    return null;
  }, [transition, config.activePlayerIds]);

  const arenaTransform = useDerivedValue(() => {
    const progress = wallShatterProgress?.value ?? 1;

    const currentAngle = localWall?.angle ?? 0;

    let angle = currentAngle;

    if (transition && oldLocalWall) {
      angle = lerpAngle(
        transition.oldLocalWallAngle,
        currentAngle,
        transitionProgress.value,
      );
    }

    // Wall-shatter impact:
    // strong enough to notice, but decays very quickly.
    let shakeX = 0;
    let shakeY = 0;

    if (progress < 1) {
      const envelope = 1 - progress;

      // 3 quick oscillations over 120ms.
      const phase = progress * Math.PI * 6;

      shakeX = Math.sin(phase) * 20 * envelope;
      shakeY = Math.cos(phase * 0.9) * 5 * envelope;
    }

    return [
      {
        rotate: Math.PI / 2 - angle,
      },
      {
        translateX: shakeX,
      },
      {
        translateY: shakeY,
      },
    ];
  });
  // const renderTransform = useDerivedValue(() => {
  //   const currentAngle = localWall?.angle ?? 0;

  //   if (!transition || !oldLocalWall) {
  //     return [
  //       {
  //         rotate: Math.PI / 2 - currentAngle,
  //       },
  //     ];
  //   }

  //   const angle = lerpAngle(
  //     transition.oldLocalWallAngle,
  //     currentAngle,
  //     transitionProgress.value,
  //   );

  //   return [
  //     {
  //       rotate: Math.PI / 2 - angle,
  //     }, {
  //       translateX: shatterOffset.value.x,
  //     }, {
  //       translateY: shatterOffset.value.y,
  //     }
  //   ];
  // }, [shatterOffset]);

  const canvasWidth = geometry.center.x * 2;

  const canvasHeight = geometry.center.y * 2;

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
      <Group origin={geometry.center}
        transform={arenaTransform}>

        {shatteredWall?.wall && (
          <ShatterBurst
            center={shatteredWall.wall.center}
            color={getPlayerSlotColor(shatteredWall.playerId)}
            progress={wallShatterProgress!}
            arenaScale={arenaScale}
          />
        )}

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
              playerId={playerId}
              state={state}
              playerPaddleOffset={playerPaddleOffset}
              paddleLength={config.paddleLength}
              paddleThickness={config.paddleThickness}
              isLocal={isLocal}
              label={isLocal ? "YOU" : `BOT ${playerId}`}
              lives={lives[playerId] ?? 0}
              transitionProgress={transitionProgress}
              arenaScale={arenaScale}
              arenaCenter={geometry.center}
              paddleFlashWallSlot={paddleFlashWallSlot}
              paddleFlashProgress={paddleFlashProgress}
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
