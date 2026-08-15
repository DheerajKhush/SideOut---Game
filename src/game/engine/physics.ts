import type { PolygonGeometry, PolygonWall, Vec2 } from "./polygon";

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface GameState {
  ball: Ball;

  /**
   * Paddle center offset along each active wall's
   * local tangent. Array index = current wall index.
   */
  paddleOffsets: number[];

  /**
   * Stable player id of the last player who successfully
   * hit the ball. This is a player id, not a current wall index.
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

  paddleLength: number;
  paddleThickness: number;

  initialBallSpeed: number;
  maxBallSpeed: number;

  botMaxSpeed: number;
  botReactionDeadZone: number;

  /**
   * Additional angle applied based on
   * where the ball hits the paddle.
   */
  maxBounceAngle: number;
}

export interface PhysicsResult {
  state: GameState;

  /** Current wall index that was missed. */
  missedWall: number | null;

  /** Stable player id that owns the missed wall. */
  missedPlayerId: number | null;
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

  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;

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

/** Standard vector reflection: v' = v - 2(v.n)n. */
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
): WallCollision | null => {
  "worklet";

  const current = { x: ball.x, y: ball.y };
  const next = {
    x: ball.x + ball.vx * dt,
    y: ball.y + ball.vy * dt,
  };

  let earliest: WallCollision | null = null;

  for (let i = 0; i < geometry.walls.length; i++) {
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

    /**
     * Collision occurs only when the ball crosses the wall's collision
     * plane from inside the arena to outside it.
     *
     * The strict direction of this test is important: after a reflection
     * the ball is placed slightly inside the wall and is moving away from
     * it, so the same wall must not immediately collide again.
     */
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
      earliest = { wall, time, point };
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

  const movingTowardWall = dot({ x: ball.vx, y: ball.vy }, wall.outward) > 0;

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

  const speed = clamp(
    magnitude(reflected.x, reflected.y),
    1,
    config.maxBallSpeed,
  );

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
    { x: -wall.outward.x, y: -wall.outward.y },
    relativeAngle,
  );

  return {
    x: collisionPoint.x - wall.outward.x * (config.ballRadius + 0.5),
    y: collisionPoint.y - wall.outward.y * (config.ballRadius + 0.5),
    vx: finalDirection.x * speed,
    vy: finalDirection.y * speed,
  };
};

/**
 * Pure physics step.
 *
 * Geometry is canonical. The renderer is responsible for viewer rotation.
 */
export const updatePhysics = (
  state: GameState,
  deltaTime: number,
  localPlayerId: number,
  localPaddleOffset: number,
  config: PhysicsConfig,
): PhysicsResult => {
  "worklet";

  const dt = clamp(deltaTime, 0, 0.033);
  const paddleOffsets = [...state.paddleOffsets];

  const localWallIndex = findActiveWallIndex(
    localPlayerId,
    config.activePlayerIds,
  );

  if (localWallIndex >= 0) {
    const localWall = config.geometry.walls[localWallIndex];
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

  // Only active player walls have paddles. In the 2-player rectangle,
  // walls 2 and 3 are passive side boundaries and must never get a bot paddle.
  for (let i = 0; i < config.activePlayerIds.length; i++) {
    if (i === localWallIndex) continue;

    paddleOffsets[i] = updateBotPaddle(
      paddleOffsets[i] ?? 0,
      config.geometry.walls[i],
      state.ball,
      dt,
      config,
    );
  }

  const collision = findEarliestCollision(
    state.ball,
    dt,
    config.geometry,
    config.ballRadius,
  );

  if (collision === null) {
    return {
      state: {
        ball: {
          x: state.ball.x + state.ball.vx * dt,
          y: state.ball.y + state.ball.vy * dt,
          vx: state.ball.vx,
          vy: state.ball.vy,
        },
        paddleOffsets,
        lastHitter: state.lastHitter,
      },
      missedWall: null,
      missedPlayerId: null,
    };
  }

  const wall = collision.wall;

  /**
   * In the 2-player rectangle, walls 2 and 3 are passive side boundaries.
   * They reflect the ball completely and never cost a life.
   */
  if (wall.slot >= config.activePlayerIds.length) {
    const reflected = reflectVelocity(
      state.ball.vx,
      state.ball.vy,
      wall.outward.x,
      wall.outward.y,
    );

    /**
     * A perfectly horizontal trajectory would mathematically bounce between
     * the two vertical reflectors forever without ever reaching a player.
     *
     * Keep the reflector collision physically reflective, but enforce a
     * small minimum vertical component so the ball always returns toward the
     * top/bottom player walls. Speed is preserved.
     */
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
          : state.ball.y < config.geometry.center.y
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

    return {
      state: {
        ball: {
          x: collision.point.x - wall.outward.x * (config.ballRadius + 0.5),
          y: collision.point.y - wall.outward.y * (config.ballRadius + 0.5),
          vx: reflectedVx,
          vy: reflectedVy,
        },
        paddleOffsets,
        lastHitter: state.lastHitter,
      },
      missedWall: null,
      missedPlayerId: null,
    };
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
    onWallSegment && Math.abs(ballPositionOnWall - paddleOffset) <= paddleHalf;

  if (!paddleHit) {
    return {
      state: {
        ...state,
        paddleOffsets,
      },
      missedWall: wall.slot,
      missedPlayerId: config.activePlayerIds[wall.slot] ?? null,
    };
  }

  const bouncedBall = bounceFromPaddle(
    state.ball,
    wall,
    paddleOffset,
    collision.point,
    config,
  );

  return {
    state: {
      ball: bouncedBall,
      paddleOffsets,
      lastHitter: config.activePlayerIds[wall.slot] ?? null,
    },
    missedWall: null,
    missedPlayerId: null,
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
  };
};

export const createInitialState = (
  geometry: PolygonGeometry,
  speed: number,
  angle: number,
): GameState => {
  "worklet";

  return {
    ball: createBall(geometry, speed, angle),
    paddleOffsets: new Array(geometry.n).fill(0),
    lastHitter: null,
  };
};
