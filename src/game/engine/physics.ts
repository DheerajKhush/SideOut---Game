import type { PolygonGeometry, PolygonWall, Vec2 } from "./polygon";

/**
 * Phase 4 — difficulty escalation
 *
 * The ball gains this much speed after every successful paddle hit.
 */
export const SPEED_INCREMENT = 12;

/**
 * Absolute maximum ball speed.
 *
 * Keep this as a module-level constant so the speed ceiling is explicit
 * and cannot become an inline magic number.
 */
export const MAX_BALL_SPEED = 650;

/**
 * A sub-step is considered safe when the ball travels no more than this
 * fraction of the paddle length in one collision step.
 *
 * This is intentionally derived from paddle size rather than being a
 * hardcoded pixel distance.
 */
const SUBSTEP_DISTANCE_FRACTION = 1 / 3;

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

  /**
   * Kept for compatibility with the existing GameScreen config.
   * Phase 4 uses MAX_BALL_SPEED as the authoritative ceiling.
   */
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

/**
 * Find the earliest collision during this small physics step.
 *
 * The important part for Phase 4 is that this function is called for every
 * sub-step rather than once for the entire frame.
 */
const findEarliestCollision = (
  ball: Ball,
  dt: number,
  geometry: PolygonGeometry,
  radius: number,
  ignoredWallSlot: number = -1,
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
    // During a shatter transition the removed wall is physically gone.
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

    /**
     * Collision only occurs when the ball crosses the collision plane
     * from inside the arena to outside.
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

/**
 * Calculates how many collision-safe sub-steps are required.
 *
 * The threshold is NOT a hardcoded pixel value.
 *
 * Example with the current game:
 *
 *   paddleLength = 58
 *   threshold    = 58 / 3 = 19.33 px
 *
 * If the ball would travel more than 19.33 px during this tick,
 * the tick is split into multiple collision checks.
 *
 * MAX_BALL_SPEED is also used when determining the theoretical maximum
 * number of sub-steps required, keeping the calculation bounded by the
 * configured maximum speed.
 */
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

  const requiredSubsteps = Math.ceil(travelDistance / maxDistancePerSubstep);

  /**
   * Bound the number of sub-steps using the actual maximum ball speed.
   *
   * This prevents an unexpected velocity from producing an unbounded
   * number of iterations.
   */
  const maximumSubsteps = Math.ceil(
    (MAX_BALL_SPEED * dt) / maxDistancePerSubstep,
  );

  return Math.max(1, Math.min(requiredSubsteps, maximumSubsteps));
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

  /**
   * Phase 4 speed escalation.
   *
   * Increase speed only after a successful paddle collision.
   * Never allow it to exceed MAX_BALL_SPEED.
   */
  const currentSpeed = magnitude(reflected.x, reflected.y);

  const nextSpeed = Math.min(currentSpeed + SPEED_INCREMENT, MAX_BALL_SPEED);

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

  return {
    x: collisionPoint.x - wall.outward.x * (config.ballRadius + 0.5),

    y: collisionPoint.y - wall.outward.y * (config.ballRadius + 0.5),

    vx: finalDirection.x * nextSpeed,
    vy: finalDirection.y * nextSpeed,
  };
};

/**
 * Process one small physics step.
 *
 * This function intentionally processes only one collision at a time.
 * updatePhysics() repeatedly invokes it when sub-stepping is required.
 */
const updatePhysicsStep = (
  state: GameState,
  dt: number,
  localPlayerId: number,
  localPaddleOffset: number,
  config: PhysicsConfig,
  physicsGeometry: PolygonGeometry,
  physicsActivePlayerIds: number[],
  ignoredWallSlot: number,
): PhysicsResult => {
  "worklet";

  const paddleOffsets = [...state.paddleOffsets];

  const localWallIndex = findActiveWallIndex(
    localPlayerId,
    physicsActivePlayerIds,
  );

  if (localWallIndex >= 0) {
    const localWall = physicsGeometry.walls[localWallIndex];

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

  /**
   * Update bot paddles for this sub-step rather than once for the
   * entire frame. This keeps paddle movement synchronized with the
   * smaller collision timestep.
   */
  for (let i = 0; i < physicsActivePlayerIds.length; i++) {
    if (i === localWallIndex) {
      continue;
    }

    paddleOffsets[i] = updateBotPaddle(
      paddleOffsets[i] ?? 0,
      physicsGeometry.walls[i],
      state.ball,
      dt,
      config,
    );
  }

  const collision = findEarliestCollision(
    state.ball,
    dt,
    physicsGeometry,
    config.ballRadius,
    ignoredWallSlot,
  );

  /**
   * No collision during this sub-step.
   */
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
   * In the 2-player rectangle, walls 2 and 3 are passive side
   * boundaries. They reflect the ball but never cost a life.
   */
  if (wall.slot >= physicsActivePlayerIds.length) {
    const reflected = reflectVelocity(
      state.ball.vx,
      state.ball.vy,
      wall.outward.x,
      wall.outward.y,
    );

    /**
     * Prevent a perfectly horizontal trajectory from getting trapped
     * between the two passive side walls.
     *
     * Speed is preserved.
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

  /**
   * Ball crossed a player wall but did not hit its paddle.
   */
  if (!paddleHit) {
    return {
      state: {
        ...state,
        paddleOffsets,
      },
      missedWall: wall.slot,
      missedPlayerId: physicsActivePlayerIds[wall.slot] ?? null,
    };
  }

  /**
   * Successful paddle hit.
   *
   * bounceFromPaddle() applies SPEED_INCREMENT here.
   */
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
      lastHitter: physicsActivePlayerIds[wall.slot] ?? null,
    },
    missedWall: null,
    missedPlayerId: null,
  };
};

/**
 * Pure physics step.
 *
 * Phase 4:
 *
 * 1. Calculate how far the ball would travel during this frame.
 * 2. Compare that distance with a threshold derived from paddle length.
 * 3. Split the frame into smaller steps when necessary.
 * 4. Run collision detection after EVERY sub-step.
 *
 * This prevents a fast ball from jumping completely through a paddle
 * between two collision checks.
 */
export const updatePhysics = (
  state: GameState,
  deltaTime: number,
  localPlayerId: number,
  localPaddleOffset: number,
  config: PhysicsConfig,
  physicsGeometry: PolygonGeometry = config.geometry,
  physicsActivePlayerIds: number[] = config.activePlayerIds,
  ignoredWallSlot: number = -1,
): PhysicsResult => {
  "worklet";

  /**
   * Preserve the existing frame-time safety clamp.
   */
  const dt = clamp(deltaTime, 0, 0.033);

  if (dt <= 0) {
    return {
      state,
      missedWall: null,
      missedPlayerId: null,
    };
  }

  const speed = magnitude(state.ball.vx, state.ball.vy);

  /**
   * The number of collision checks is based on:
   *
   *     ball travel distance
   *     --------------------
   *     paddleLength / 3
   *
   * Therefore the threshold automatically follows paddle size.
   */
  const substeps = getSubstepCount(speed, dt, config.paddleLength);

  const substepDt = dt / substeps;

  let currentState = state;

  /**
   * Run collision detection after every sub-step.
   *
   * This also allows the ball to hit more than one wall during a
   * single rendered frame if it is travelling fast enough.
   */
  for (let step = 0; step < substeps; step++) {
    const result = updatePhysicsStep(
      currentState,
      substepDt,
      localPlayerId,
      localPaddleOffset,
      config,
      physicsGeometry,
      physicsActivePlayerIds,
      ignoredWallSlot,
    );

    if (result.missedWall !== null || result.missedPlayerId !== null) {
      return result;
    }

    currentState = result.state;
  }

  return {
    state: currentState,
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
