import type { PolygonGeometry, PolygonWall, Vec2 } from "./polygon";

/** Phase 4b — multi-ball spawning. */
export const SPAWN_INTERVAL_MS = 60_000;
export const MAX_BALL_COUNT = 3;

/** First additional ball appears after this delay into the round. */
export const INITIAL_SPAWN_DELAY_MS = 60_000;

/** Phase 4a speed escalation. */
export const SPEED_INCREMENT = 12;
export const MAX_BALL_SPEED = 650;

/**
 * Phase 5 — continuous arena shrink.
 *
 * SHRINK_RATE is pixels per second.
 */
export const SHRINK_START_MS = 60_000;
export const SHRINK_RATE = 6;
export const MIN_ARENA_RADIUS = 120;

/** Collision sub-step threshold as a fraction of paddle length. */
const SUBSTEP_DISTANCE_FRACTION = 0.25;

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;

  /**
   * Stable player id of the last player who hit this ball.
   *
   * null = freshly spawned/relaunched ball that has not
   * been hit by a paddle yet.
   */
  lastHitBySlot: number | null;
}

export interface GameState {
  balls: Ball[];

  /**
   * Paddle center offset along each active wall's
   * local tangent. Array index = current wall index.
   */
  paddleOffsets: number[];

  /**
   * Stable player id of the last player who successfully
   * hit any ball.
   *
   * This remains for scoring/gameplay.
   *
   * Per-ball trail ownership is stored on Ball.lastHitBySlot.
   */
  lastHitter: number | null;
}

export interface PhysicsConfig {
  geometry: PolygonGeometry;

  /**
   * Stable player ids represented by geometry.walls.
   * activePlayerIds[wall.slot] = player id.
   */
  activePlayerIds: number[];

  ballRadius: number;

  /** BASE paddle dimensions. */
  paddleLength: number;
  paddleThickness: number;

  initialBallSpeed: number;
  maxBallSpeed: number;

  botMaxSpeed: number;
  botReactionDeadZone: number;

  maxBounceAngle: number;
}

export interface PhysicsResult {
  state: GameState;

  /** Number of successful paddle collisions during this physics step. */
  paddleHitCount: number;

  /** Current wall index that was missed. */
  missedWall: number | null;

  /** Stable player id that owns the missed wall. */
  missedPlayerId: number | null;

  /** Index of the ball that caused the miss. */
  missedBallIndex: number | null;
}

const clamp = (value: number, min: number, max: number): number => {
  "worklet";

  return Math.max(min, Math.min(value, max));
};

const dot = (a: Vec2, b: Vec2): number => {
  "worklet";

  return a.x * b.x + a.y * b.y;
};

const magnitude = (x: number, y: number): number => {
  "worklet";

  return Math.sqrt(x * x + y * y);
};

const normalizeAngle = (angle: number): number => {
  "worklet";

  while (angle > Math.PI) {
    angle -= Math.PI * 2;
  }

  while (angle < -Math.PI) {
    angle += Math.PI * 2;
  }

  return angle;
};

const findActiveWallIndex = (
  playerId: number,
  activePlayerIds: number[],
): number => {
  "worklet";

  for (let i = 0; i < activePlayerIds.length; i++) {
    if (activePlayerIds[i] === playerId) {
      return i;
    }
  }

  return -1;
};

/**
 * Scale a geometry around its fixed center.
 *
 * This changes radius/size only.
 * It does NOT change vertex count.
 */
export const scalePolygonGeometry = (
  geometry: PolygonGeometry,
  scale: number,
): PolygonGeometry => {
  "worklet";

  const safeScale = Math.max(0.01, scale);

  const center = geometry.center;

  const scalePoint = (point: Vec2): Vec2 => ({
    x: center.x + (point.x - center.x) * safeScale,

    y: center.y + (point.y - center.y) * safeScale,
  });

  const walls: PolygonWall[] = geometry.walls.map((wall) => ({
    ...wall,
    start: scalePoint(wall.start),
    end: scalePoint(wall.end),
    center: scalePoint(wall.center),
    length: wall.length * safeScale,
  }));

  return {
    ...geometry,
    radius: geometry.radius * safeScale,
    walls,
  };
};

/** Standard vector reflection. */
export const reflectVelocity = (
  vx: number,
  vy: number,
  normalX: number,
  normalY: number,
): Vec2 => {
  "worklet";

  const projection = vx * normalX + vy * normalY;

  return {
    x: vx - 2 * projection * normalX,

    y: vy - 2 * projection * normalY,
  };
};

const rotateVector = (vector: Vec2, angle: number): Vec2 => {
  "worklet";

  const cos = Math.cos(angle);

  const sin = Math.sin(angle);

  return {
    x: vector.x * cos - vector.y * sin,

    y: vector.x * sin + vector.y * cos,
  };
};

interface WallCollision {
  wall: PolygonWall;
  time: number;
  point: Vec2;
}

const findEarliestCollision = (
  ball: Ball,
  dt: number,
  geometry: PolygonGeometry,
  radius: number,
  ignoredWallSlot = -1,
): WallCollision | null => {
  "worklet";

  const current = {
    x: ball.x,
    y: ball.y,
  };

  const next = {
    x: ball.x + ball.vx * dt,

    y: ball.y + ball.vy * dt,
  };

  let earliest: WallCollision | null = null;

  for (let i = 0; i < geometry.walls.length; i++) {
    if (i === ignoredWallSlot) {
      continue;
    }

    const wall = geometry.walls[i];

    const currentRelative = {
      x: current.x - wall.start.x,

      y: current.y - wall.start.y,
    };

    const nextRelative = {
      x: next.x - wall.start.x,

      y: next.y - wall.start.y,
    };

    const currentDistance = dot(currentRelative, wall.outward);

    const nextDistance = dot(nextRelative, wall.outward);

    const collisionDistance = -radius;

    if (
      currentDistance >= collisionDistance ||
      nextDistance < collisionDistance
    ) {
      continue;
    }

    const denominator = nextDistance - currentDistance;

    if (Math.abs(denominator) < 0.000001) {
      continue;
    }

    const time = (collisionDistance - currentDistance) / denominator;

    if (time < 0 || time > 1) {
      continue;
    }

    const point = {
      x: current.x + (next.x - current.x) * time,

      y: current.y + (next.y - current.y) * time,
    };

    if (earliest === null || time < earliest.time) {
      earliest = {
        wall,
        time,
        point,
      };
    }
  }

  return earliest;
};

const updateBotPaddle = (
  currentOffset: number,
  wall: PolygonWall,
  ball: Ball,
  dt: number,
  config: PhysicsConfig,
): number => {
  "worklet";

  const maxOffset = Math.max(0, wall.length / 2 - config.paddleLength / 2);

  const movingTowardWall =
    dot(
      {
        x: ball.vx,
        y: ball.vy,
      },
      wall.outward,
    ) > 0;

  let target = 0;

  if (movingTowardWall) {
    const ballRelative = {
      x: ball.x - wall.center.x,

      y: ball.y - wall.center.y,
    };

    target = clamp(dot(ballRelative, wall.tangent), -maxOffset, maxOffset);
  }

  const distance = target - currentOffset;

  if (Math.abs(distance) <= config.botReactionDeadZone) {
    return currentOffset;
  }

  const maxMovement = config.botMaxSpeed * dt;

  const movement = clamp(distance, -maxMovement, maxMovement);

  return clamp(currentOffset + movement, -maxOffset, maxOffset);
};

const bounceFromPaddle = (
  ball: Ball,
  wall: PolygonWall,
  paddleOffset: number,
  collisionPoint: Vec2,
  config: PhysicsConfig,
): Ball => {
  "worklet";

  const reflected = reflectVelocity(
    ball.vx,
    ball.vy,
    wall.outward.x,
    wall.outward.y,
  );

  const currentSpeed = clamp(
    magnitude(reflected.x, reflected.y),
    1,
    MAX_BALL_SPEED,
  );

  const speed = Math.min(currentSpeed + SPEED_INCREMENT, MAX_BALL_SPEED);

  const relative = {
    x: collisionPoint.x - wall.center.x,

    y: collisionPoint.y - wall.center.y,
  };

  const hitPosition = dot(relative, wall.tangent);

  const hitOffset = clamp(
    (hitPosition - paddleOffset) / (config.paddleLength / 2),
    -1,
    1,
  );

  const reflectedAngle = Math.atan2(reflected.y, reflected.x);

  const inwardAngle = Math.atan2(-wall.outward.y, -wall.outward.x);

  let relativeAngle = normalizeAngle(reflectedAngle - inwardAngle);

  relativeAngle += hitOffset * config.maxBounceAngle;

  const maxAngleFromNormal = Math.PI * 0.44;

  relativeAngle = clamp(relativeAngle, -maxAngleFromNormal, maxAngleFromNormal);

  const finalDirection = rotateVector(
    {
      x: -wall.outward.x,
      y: -wall.outward.y,
    },
    relativeAngle,
  );

  /**
   * Preserve lastHitBySlot here.
   *
   * The caller updates it after a successful hit.
   */
  return {
    x: collisionPoint.x - wall.outward.x * (config.ballRadius + 0.5),

    y: collisionPoint.y - wall.outward.y * (config.ballRadius + 0.5),

    vx: finalDirection.x * speed,

    vy: finalDirection.y * speed,

    lastHitBySlot: ball.lastHitBySlot,
  };
};

const getSubstepCount = (
  speed: number,
  dt: number,
  paddleLength: number,
): number => {
  "worklet";

  if (speed <= 0 || dt <= 0 || paddleLength <= 0) {
    return 1;
  }

  const maxDistancePerSubstep = paddleLength * SUBSTEP_DISTANCE_FRACTION;

  const travelDistance = speed * dt;

  if (travelDistance <= maxDistancePerSubstep) {
    return 1;
  }

  const required = Math.ceil(travelDistance / maxDistancePerSubstep);

  const maximum = Math.ceil((MAX_BALL_SPEED * dt) / maxDistancePerSubstep);

  return Math.max(1, Math.min(required, maximum));
};

const updateSingleBall = (
  ball: Ball,
  ballIndex: number,
  state: GameState,
  deltaTime: number,
  localPlayerId: number,
  localPaddleOffset: number,
  config: PhysicsConfig,
  physicsGeometry: PolygonGeometry,
  physicsActivePlayerIds: number[],
  ignoredWallSlot: number,
): PhysicsResult => {
  "worklet";

  const dt = clamp(deltaTime, 0, 0.033);

  const paddleOffsets = [...state.paddleOffsets];

  const nextBalls = [...state.balls];

  let currentLastHitter = state.lastHitter;
  let paddleHitCount = 0;

  const localWallIndex = findActiveWallIndex(
    localPlayerId,
    physicsActivePlayerIds,
  );

  if (localWallIndex >= 0) {
    const localWall = physicsGeometry.walls[localWallIndex];

    if (localWall) {
      const localMaxOffset = Math.max(
        0,
        localWall.length / 2 - config.paddleLength / 2,
      );

      paddleOffsets[localWallIndex] = clamp(
        localPaddleOffset,
        -localMaxOffset,
        localMaxOffset,
      );
    }
  }

  const substeps = getSubstepCount(
    magnitude(ball.vx, ball.vy),
    dt,
    config.paddleLength,
  );

  const substepDt = dt / substeps;

  let currentBall = ball;

  for (let step = 0; step < substeps; step++) {
    const collision = findEarliestCollision(
      currentBall,
      substepDt,
      physicsGeometry,
      config.ballRadius,
      ignoredWallSlot,
    );

    if (collision === null) {
      currentBall = {
        x: currentBall.x + currentBall.vx * substepDt,

        y: currentBall.y + currentBall.vy * substepDt,

        vx: currentBall.vx,

        vy: currentBall.vy,

        lastHitBySlot: currentBall.lastHitBySlot,
      };

      continue;
    }

    const wall = collision.wall;

    /**
     * Passive boundaries in the 2-player rectangle.
     */
    if (wall.slot >= physicsActivePlayerIds.length) {
      const reflected = reflectVelocity(
        currentBall.vx,
        currentBall.vy,
        wall.outward.x,
        wall.outward.y,
      );

      const reflectedSpeed = magnitude(reflected.x, reflected.y);

      const minimumVerticalRatio = 0.3;

      const minimumVerticalSpeed = reflectedSpeed * minimumVerticalRatio;

      let reflectedVx = reflected.x;

      let reflectedVy = reflected.y;

      if (Math.abs(reflectedVy) < minimumVerticalSpeed) {
        const verticalSign =
          Math.abs(reflectedVy) > 0.0001
            ? reflectedVy > 0
              ? 1
              : -1
            : currentBall.y < physicsGeometry.center.y
              ? 1
              : -1;

        reflectedVy = verticalSign * minimumVerticalSpeed;

        reflectedVx =
          Math.sign(reflectedVx || 1) *
          Math.sqrt(
            Math.max(
              0,
              reflectedSpeed * reflectedSpeed - reflectedVy * reflectedVy,
            ),
          );
      }

      currentBall = {
        x: collision.point.x - wall.outward.x * (config.ballRadius + 0.5),

        y: collision.point.y - wall.outward.y * (config.ballRadius + 0.5),

        vx: reflectedVx,
        vy: reflectedVy,

        lastHitBySlot: currentBall.lastHitBySlot,
      };

      continue;
    }

    const paddleOffset = paddleOffsets[wall.slot] ?? 0;

    const relativeToCenter = {
      x: collision.point.x - wall.center.x,

      y: collision.point.y - wall.center.y,
    };

    const ballPositionOnWall = dot(relativeToCenter, wall.tangent);

    const paddleHalf = config.paddleLength / 2;

    const onWallSegment = Math.abs(ballPositionOnWall) <= wall.length / 2;

    const paddleHit =
      onWallSegment &&
      Math.abs(ballPositionOnWall - paddleOffset) <= paddleHalf;

    if (!paddleHit) {
      nextBalls[ballIndex] = currentBall;

      return {
        state: {
          balls: nextBalls,
          paddleOffsets,
          lastHitter: currentLastHitter,
        },

        paddleHitCount,
        missedWall: wall.slot,

        missedPlayerId: physicsActivePlayerIds[wall.slot] ?? null,

        missedBallIndex: ballIndex,
      };
    }

    currentBall = bounceFromPaddle(
      currentBall,
      wall,
      paddleOffset,
      collision.point,
      config,
    );

    paddleHitCount++;

    /**
     * IMPORTANT:
     *
     * This is the only place that changes the ball's
     * last-hit slot.
     *
     * The metadata belongs to THIS ball.
     */
    currentBall = {
      ...currentBall,
      lastHitBySlot: physicsActivePlayerIds[wall.slot] ?? null,
    };

    /**
     * Existing global lastHitter remains for scoring/gameplay.
     */
    currentLastHitter = physicsActivePlayerIds[wall.slot] ?? null;
  }

  nextBalls[ballIndex] = currentBall;

  return {
    state: {
      balls: nextBalls,
      paddleOffsets,
      lastHitter: currentLastHitter,
    },

    paddleHitCount,
    missedWall: null,
    missedPlayerId: null,
    missedBallIndex: null,
  };
};

/**
 * Pure multi-ball physics step.
 *
 * arenaScale is the CURRENT continuous-shrink scale.
 */
export const updatePhysics = (
  state: GameState,
  deltaTime: number,
  localPlayerId: number,
  localPaddleOffset: number,
  config: PhysicsConfig,
  physicsGeometry: PolygonGeometry = config.geometry,
  physicsActivePlayerIds: number[] = config.activePlayerIds,
  ignoredWallSlot = -1,
  arenaScale = 1,
): PhysicsResult => {
  "worklet";

  const dt = clamp(deltaTime, 0, 0.033);

  const safeArenaScale = Math.max(0.01, arenaScale);

  /**
   * Current shrinking geometry.
   *
   * Vertex count comes from physicsGeometry.
   * Radius comes from safeArenaScale.
   */
  const currentGeometry = scalePolygonGeometry(physicsGeometry, safeArenaScale);

  /**
   * Paddle length shrinks proportionally with wall length.
   */
  const currentPaddleLength = config.paddleLength * safeArenaScale;

  const currentConfig: PhysicsConfig = {
    ...config,
    geometry: currentGeometry,
    paddleLength: currentPaddleLength,
  };

  let paddleOffsets = [...state.paddleOffsets];

  let nextBalls = [...state.balls];

  let paddleHitCount = 0;

  /**
   * Update each bot once per physics tick.
   */
  for (
    let wallIndex = 0;
    wallIndex < physicsActivePlayerIds.length;
    wallIndex++
  ) {
    if (
      wallIndex === findActiveWallIndex(localPlayerId, physicsActivePlayerIds)
    ) {
      continue;
    }

    const wall = currentGeometry.walls[wallIndex];

    if (!wall) {
      continue;
    }

    let targetBall = nextBalls[0];

    let bestDistance = Number.POSITIVE_INFINITY;

    for (let i = 0; i < nextBalls.length; i++) {
      const candidate = nextBalls[i];

      const relative = {
        x: candidate.x - wall.center.x,

        y: candidate.y - wall.center.y,
      };

      const distance = dot(relative, wall.outward);

      const movingTowardWall =
        dot(
          {
            x: candidate.vx,
            y: candidate.vy,
          },
          wall.outward,
        ) > 0;

      if (movingTowardWall && distance < bestDistance) {
        bestDistance = distance;

        targetBall = candidate;
      }
    }

    paddleOffsets[wallIndex] = updateBotPaddle(
      paddleOffsets[wallIndex] ?? 0,

      wall,
      targetBall,
      dt,
      currentConfig,
    );
  }

  const localWallIndex = findActiveWallIndex(
    localPlayerId,
    physicsActivePlayerIds,
  );

  if (localWallIndex >= 0) {
    const localWall = currentGeometry.walls[localWallIndex];

    if (localWall) {
      const localMaxOffset = Math.max(
        0,
        localWall.length / 2 - currentConfig.paddleLength / 2,
      );

      paddleOffsets[localWallIndex] = clamp(
        localPaddleOffset,
        -localMaxOffset,
        localMaxOffset,
      );
    }
  }

  for (let ballIndex = 0; ballIndex < nextBalls.length; ballIndex++) {
    const ballState: GameState = {
      balls: nextBalls,
      paddleOffsets,
      lastHitter: state.lastHitter,
    };

    const result = updateSingleBall(
      nextBalls[ballIndex],

      ballIndex,
      ballState,
      dt,
      localPlayerId,
      localPaddleOffset,
      currentConfig,
      currentGeometry,
      physicsActivePlayerIds,
      ignoredWallSlot,
    );

    nextBalls = result.state.balls;

    paddleOffsets = result.state.paddleOffsets;

    paddleHitCount += result.paddleHitCount;

    state = {
      ...state,
      lastHitter: result.state.lastHitter,
    };

    if (result.missedWall !== null || result.missedPlayerId !== null) {
      return {
        state: {
          balls: nextBalls,
          paddleOffsets,
          lastHitter: result.state.lastHitter,
        },

        paddleHitCount,
        missedWall: result.missedWall,

        missedPlayerId: result.missedPlayerId,

        missedBallIndex: result.missedBallIndex,
      };
    }
  }

  return {
    state: {
      balls: nextBalls,
      paddleOffsets,
      lastHitter: state.lastHitter,
    },

    paddleHitCount,

    missedWall: null,
    missedPlayerId: null,
    missedBallIndex: null,
  };
};

export const createBall = (
  geometry: PolygonGeometry,
  speed: number,
  angle: number,
): Ball => {
  "worklet";

  return {
    x: geometry.center.x,
    y: geometry.center.y,

    vx: Math.cos(angle) * speed,

    vy: Math.sin(angle) * speed,

    /**
     * Fresh ball = neutral trail.
     */
    lastHitBySlot: null,
  };
};

export const createInitialState = (
  geometry: PolygonGeometry,
  speed: number,
  angle: number,
): GameState => {
  "worklet";

  return {
    balls: [createBall(geometry, speed, angle)],

    paddleOffsets: new Array(geometry.n).fill(0),

    lastHitter: null,
  };
};
