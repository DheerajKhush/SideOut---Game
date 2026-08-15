// export type Player = "player" | "bot";

// export interface Ball {
//   x: number;
//   y: number;
//   vx: number;
//   vy: number;
// }

// export interface GameState {
//   ball: Ball;
//   botPaddleX: number;
//   lastScoredBy: Player | null;
// }

// export interface PhysicsConfig {
//   arenaWidth: number;
//   arenaHeight: number;

//   paddleWidth: number;
//   paddleHeight: number;
//   paddleMargin: number;

//   ballRadius: number;

//   initialBallSpeed: number;
//   maxBallSpeed: number;

//   botMaxSpeed: number;

//   // Maximum amount the outgoing angle can be changed
//   // based on where the ball hits the paddle.
//   maxBounceAngle: number;
// }

// const clamp = (value: number, min: number, max: number): number => {
//   "worklet";

//   return Math.max(min, Math.min(value, max));
// };

// const magnitude = (x: number, y: number): number => {
//   "worklet";

//   return Math.sqrt(x * x + y * y);
// };

// const normalize = (x: number, y: number): { x: number; y: number } => {
//   "worklet";

//   const length = magnitude(x, y);

//   if (length === 0) {
//     return { x: 0, y: 1 };
//   }

//   return {
//     x: x / length,
//     y: y / length,
//   };
// };

// /**
//  * Reflect velocity against a surface normal.
//  *
//  * v' = v - 2(v · n)n
//  */
// export const reflectVelocity = (
//   vx: number,
//   vy: number,
//   normalX: number,
//   normalY: number,
// ): { vx: number; vy: number } => {
//   "worklet";

//   const dot = vx * normalX + vy * normalY;

//   return {
//     vx: vx - 2 * dot * normalX,
//     vy: vy - 2 * dot * normalY,
//   };
// };

// /**
//  * Apply an off-center paddle hit.
//  *
//  * First perform normal reflection.
//  * Then rotate the reflected velocity based on the
//  * horizontal distance from the paddle center.
//  */
// export const reflectFromPaddle = (
//   ball: Ball,
//   paddleX: number,
//   paddleY: number,
//   paddleWidth: number,
//   paddleHeight: number,
//   ballRadius: number,
//   normalY: number,
//   maxBounceAngle: number,
//   maxBallSpeed: number
// ): Ball => {
//   "worklet";

//   const halfWidth = paddleWidth / 2;

//   // -1 = far left edge
//   //  0 = center
//   // +1 = far right edge
//   const hitOffset = clamp(
//     (ball.x - paddleX) / halfWidth,
//     -1,
//     1
//   );

//   const speed = Math.min(
//     magnitude(ball.vx, ball.vy),
//     maxBallSpeed
//   );

//   /*
//    * Instead of reflecting the existing angle and then
//    * adding another angle, explicitly construct the
//    * outgoing direction.
//    *
//    * This gives predictable Pong behavior:
//    *
//    * center hit
//    *       ↑
//    *
//    * left edge
//    *      ↖
//    *
//    * right edge
//    *       ↗
//    */

//   const angleFromVertical =
//     hitOffset * maxBounceAngle;

//   // X direction comes from hit position.
//   const vx =
//     Math.sin(angleFromVertical) * speed;

//   // Y direction depends on which paddle was hit.
//   const vy =
//     normalY * Math.cos(angleFromVertical) * speed;

//   return {
//     x: ball.x,

//     y:
//       normalY > 0
//         ? paddleY +
//           paddleHeight / 2 +
//           ballRadius +
//           0.5
//         : paddleY -
//           paddleHeight / 2 -
//           ballRadius -
//           0.5,

//     vx,
//     vy,
//   };
// };

// export const createBall = (
//   arenaWidth: number,
//   arenaHeight: number,
//   speed: number,
//   launchAngle: number,
// ): Ball => {
//   "worklet";

//   return {
//     x: arenaWidth / 2,
//     y: arenaHeight / 2,
//     vx: Math.cos(launchAngle) * speed,
//     vy: Math.sin(launchAngle) * speed,
//   };
// };

// export const createInitialState = (
//   config: PhysicsConfig,
//   launchAngle: number,
// ): GameState => {
//   "worklet";

//   return {
//     ball: createBall(
//       config.arenaWidth,
//       config.arenaHeight,
//       config.initialBallSpeed,
//       launchAngle,
//     ),

//     botPaddleX: config.arenaWidth / 2,

//     lastScoredBy: null,
//   };
// };

// /**
//  * Advance one physics tick.
//  *
//  * Pure:
//  *   input state + inputs -> output state
//  *
//  * No React.
//  * No Zustand.
//  * No SharedValue.
//  * No rendering.
//  */
// export const updatePhysics = (
//   state: GameState,
//   deltaTime: number,
//   playerPaddleX: number,
//   launchAngle: number,
//   config: PhysicsConfig,
// ): GameState => {
//   "worklet";

//   // Prevent huge physics steps when the app is paused/backgrounded.
//   const dt = clamp(deltaTime, 0, 0.033);

//   let ball = {
//     ...state.ball,
//   };

//   // --------------------------------------------------
//   // BOT PADDLE
//   // --------------------------------------------------

//   // Bot paddle ONLY moves on X.
//   // Its Y position is fixed by the renderer.

//   let botPaddleX = state.botPaddleX;

//   // Only actively track the ball when it is moving
//   // toward the bot.
//   //
//   // Top paddle is the bot.
//   // Ball moving upward => vy < 0.
//   if (ball.vy < 0) {
//     const targetX = ball.x;

//     const distance = targetX - botPaddleX;

//     // Dead zone prevents pixel-perfect tracking.
//     // If the ball is already close enough, don't move.
//     const reactionDeadZone = 10;

//     if (Math.abs(distance) > reactionDeadZone) {
//       const maxMovement = config.botMaxSpeed * dt;

//       const movement = clamp(distance, -maxMovement, maxMovement);

//       botPaddleX += movement;
//     }
//   } else {
//     // When the ball is moving away from the bot,
//     // slowly return toward the center.
//     const centerX = config.arenaWidth / 2;

//     const distance = centerX - botPaddleX;

//     const returnSpeed = config.botMaxSpeed * 0.35;

//     const maxMovement = returnSpeed * dt;

//     botPaddleX += clamp(distance, -maxMovement, maxMovement);
//   }

//   // Never allow the bot paddle to leave the arena.
//   botPaddleX = clamp(
//     botPaddleX,
//     config.paddleWidth / 2,
//     config.arenaWidth - config.paddleWidth / 2,
//   );

//   // --------------------------------------------------
//   // BALL MOVEMENT
//   // --------------------------------------------------

//   ball.x += ball.vx * dt;
//   ball.y += ball.vy * dt;

//   // --------------------------------------------------
//   // SIDE WALLS
//   // --------------------------------------------------

//   if (ball.x - config.ballRadius <= 0 && ball.vx < 0) {
//     ball.x = config.ballRadius;

//     const reflected = reflectVelocity(ball.vx, ball.vy, 1, 0);

//     ball.vx = reflected.vx;
//     ball.vy = reflected.vy;
//   }

//   if (ball.x + config.ballRadius >= config.arenaWidth && ball.vx > 0) {
//     ball.x = config.arenaWidth - config.ballRadius;

//     const reflected = reflectVelocity(ball.vx, ball.vy, -1, 0);

//     ball.vx = reflected.vx;
//     ball.vy = reflected.vy;
//   }

//   // --------------------------------------------------
//   // PADDLE POSITIONS
//   // --------------------------------------------------

//   const paddleYBottom = config.arenaHeight - config.paddleMargin;

//   const paddleYTop = config.paddleMargin;

//   // --------------------------------------------------
//   // LOCAL PLAYER PADDLE
//   // --------------------------------------------------

//   const playerHit =
//     ball.vy > 0 &&
//     ball.y + config.ballRadius >= paddleYBottom - config.paddleHeight / 2 &&
//     ball.y - config.ballRadius <= paddleYBottom + config.paddleHeight / 2 &&
//     ball.x >= playerPaddleX - config.paddleWidth / 2 &&
//     ball.x <= playerPaddleX + config.paddleWidth / 2;

//   if (playerHit) {
//     ball = reflectFromPaddle(
//       ball,
//       playerPaddleX,
//       paddleYBottom,
//       config.paddleWidth,
//       config.paddleHeight,
//       config.ballRadius,
//       -1,
//       config.maxBounceAngle,
//       config.maxBallSpeed,
//     );
//   }

//   // --------------------------------------------------
//   // BOT PADDLE
//   // --------------------------------------------------

//   const botHit =
//     ball.vy < 0 &&
//     ball.y - config.ballRadius <= paddleYTop + config.paddleHeight / 2 &&
//     ball.y + config.ballRadius >= paddleYTop - config.paddleHeight / 2 &&
//     ball.x >= botPaddleX - config.paddleWidth / 2 &&
//     ball.x <= botPaddleX + config.paddleWidth / 2;

//   if (botHit) {
//     ball = reflectFromPaddle(
//       ball,
//       botPaddleX,
//       paddleYTop,
//       config.paddleWidth,
//       config.paddleHeight,
//       config.ballRadius,
//       1,
//       config.maxBounceAngle,
//       config.maxBallSpeed,
//     );
//   }

//   // --------------------------------------------------
//   // MISSES / SCORING
//   // --------------------------------------------------

//   if (ball.y - config.ballRadius > config.arenaHeight) {
//     return {
//       ball: createBall(
//         config.arenaWidth,
//         config.arenaHeight,
//         config.initialBallSpeed,
//         launchAngle,
//       ),
//       botPaddleX,
//       lastScoredBy: "player",
//     };
//   }

//   if (ball.y + config.ballRadius < 0) {
//     return {
//       ball: createBall(
//         config.arenaWidth,
//         config.arenaHeight,
//         config.initialBallSpeed,
//         launchAngle,
//       ),
//       botPaddleX,
//       lastScoredBy: "bot",
//     };
//   }

//   return {
//     ball,
//     botPaddleX,
//     lastScoredBy: null,
//   };
// };

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
   * Paddle center offset along each wall's
   * local tangent.
   *
   * One value per player slot.
   */
  paddleOffsets: number[];

  /**
   * Last player who successfully hit the ball.
   */
  lastHitter: number | null;
}

export interface PhysicsConfig {
  geometry: PolygonGeometry;

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

  /**
   * Which wall was missed.
   */
  missedWall: number | null;
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

/**
 * Standard vector reflection:
 *
 * v' = v - 2(v.n)n
 */
export const reflectVelocity = (
  vx: number,
  vy: number,
  normalX: number,
  normalY: number,
): Vec2 => {
  "worklet";

  const velocity = {
    x: vx,
    y: vy,
  };

  const normal = {
    x: normalX,
    y: normalY,
  };

  const projection = dot(velocity, normal);

  return {
    x: velocity.x - 2 * projection * normal.x,

    y: velocity.y - 2 * projection * normal.y,
  };
};

/**
 * Rotate a vector.
 */
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
 * Find the first polygon edge crossed by the ball.
 *
 * The polygon interior is on the negative side
 * of each wall's outward normal.
 */
const findEarliestCollision = (
  ball: Ball,
  dt: number,
  geometry: PolygonGeometry,
  radius: number,
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

    /*
     * The polygon interior is behind the outward
     * normal.
     *
     * Ball center reaches the wall when it is
     * one radius away.
     */
    const collisionDistance = -radius;

    /*
     * We only care about crossing from inside
     * toward/out through the wall.
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

    /*
     * Exact point where the ball center reaches
     * the wall's collision plane.
     */
    const point = {
      x: current.x + (next.x - current.x) * time,

      y: current.y + (next.y - current.y) * time,
    };

    /*
     * We deliberately DO NOT reject the wall
     * if this point is outside its segment.
     *
     * This allows us to correctly detect
     * corner/endpoint misses.
     */
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

/**
 * Move a bot paddle along its wall.
 */
const updateBotPaddle = (
  currentOffset: number,
  wall: PolygonWall,
  ball: Ball,
  dt: number,
  config: PhysicsConfig,
): number => {
  "worklet";

  const maxOffset = wall.length / 2 - config.paddleLength / 2;

  /**
   * Is the ball travelling toward this wall?
   */
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

  /**
   * Deliberately imperfect.
   */
  if (Math.abs(distance) <= config.botReactionDeadZone) {
    return currentOffset;
  }

  const maxMovement = config.botMaxSpeed * dt;

  const movement = clamp(distance, -maxMovement, maxMovement);

  return clamp(currentOffset + movement, -maxOffset, maxOffset);
};

/**
 * Reflect the ball from a paddle.
 *
 * 1. Standard angle-of-incidence reflection.
 * 2. Add extra angle based on where on the
 *    paddle the ball hit.
 */
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

  /**
   * Position along wall.
   */
  const relative = {
    x: collisionPoint.x - wall.center.x,

    y: collisionPoint.y - wall.center.y,
  };

  const hitPosition = dot(relative, wall.tangent);

  /**
   * -1 = left edge of paddle
   *  0 = center
   * +1 = right edge of paddle
   */
  const hitOffset = clamp(
    (hitPosition - paddleOffset) / (config.paddleLength / 2),
    -1,
    1,
  );

  /**
   * Standard reflection angle.
   */
  const reflectedAngle = Math.atan2(reflected.y, reflected.x);

  /**
   * Direction pointing back into the polygon.
   */
  const inwardAngle = Math.atan2(-wall.outward.y, -wall.outward.x);

  let relativeAngle = normalizeAngle(reflectedAngle - inwardAngle);

  /**
   * Add "spin" from the paddle hit.
   */
  relativeAngle += hitOffset * config.maxBounceAngle;

  /**
   * Never allow a paddle hit to send the
   * ball back outside the polygon.
   */
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

    vx: finalDirection.x * speed,

    vy: finalDirection.y * speed,
  };
};

/**
 * Pure physics step.
 *
 * There is NO rendering rotation here.
 * There is NO React.
 * There is NO Zustand.
 */
export const updatePhysics = (
  state: GameState,
  deltaTime: number,
  localSlot: number,
  localPaddleOffset: number,
  config: PhysicsConfig,
): PhysicsResult => {
  "worklet";

  const dt = clamp(deltaTime, 0, 0.033);

  const paddleOffsets = [...state.paddleOffsets];

  const localWall = config.geometry.walls[localSlot];

  const localMaxOffset = localWall.length / 2 - config.paddleLength / 2;

  /**
   * Update human paddle.
   */
  paddleOffsets[localSlot] = clamp(
    localPaddleOffset,
    -localMaxOffset,
    localMaxOffset,
  );

  /**
   * Update every bot.
   */
  for (let i = 0; i < config.geometry.walls.length; i++) {
    if (i === localSlot) {
      continue;
    }

    paddleOffsets[i] = updateBotPaddle(
      paddleOffsets[i],
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

  /**
   * No collision this frame.
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
    };
  }

  const wall = collision.wall;

  const paddleOffset = paddleOffsets[wall.slot];

  const relativeToCenter = {
    x: collision.point.x - wall.center.x,

    y: collision.point.y - wall.center.y,
  };

  const ballPositionOnWall = dot(relativeToCenter, wall.tangent);

  const paddleHalf = config.paddleLength / 2;

  /*
   * The collision must actually be on the
   * physical wall segment.
   */
  const onWallSegment = Math.abs(ballPositionOnWall) <= wall.length / 2;

  /*
   * Ball must be inside the paddle.
   *
   * Use a tiny safety margin so an exact edge
   * contact doesn't become a lucky save.
   */
  const paddleSafetyMargin = 1;

  const paddleHit =
    onWallSegment &&
    Math.abs(ballPositionOnWall - paddleOffset) <
      paddleHalf - paddleSafetyMargin;

  /**
   * Ball hit the wall outside the paddle.
   *
   * This wall missed.
   */
  if (!paddleHit) {
    /*
     * The wall was reached but the paddle
     * wasn't covering the impact point.
     *
     * This is a miss.
     */
    return {
      state: {
        ...state,
        paddleOffsets,
      },

      missedWall: wall.slot,
    };
  }

  /**
   * Paddle successfully blocked it.
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

      lastHitter: wall.slot,
    },

    missedWall: null,
  };
};

/**
 * Create a new ball at the polygon center.
 */
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
