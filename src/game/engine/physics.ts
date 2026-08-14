export type Player = "player" | "bot";

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface GameState {
  ball: Ball;
  botPaddleX: number;
  lastScoredBy: Player | null;
}

export interface PhysicsConfig {
  arenaWidth: number;
  arenaHeight: number;

  paddleWidth: number;
  paddleHeight: number;
  paddleMargin: number;

  ballRadius: number;

  initialBallSpeed: number;
  maxBallSpeed: number;

  botMaxSpeed: number;

  // Maximum amount the outgoing angle can be changed
  // based on where the ball hits the paddle.
  maxBounceAngle: number;
}

const clamp = (value: number, min: number, max: number): number => {
  "worklet";

  return Math.max(min, Math.min(value, max));
};

const magnitude = (x: number, y: number): number => {
  "worklet";

  return Math.sqrt(x * x + y * y);
};

const normalize = (x: number, y: number): { x: number; y: number } => {
  "worklet";

  const length = magnitude(x, y);

  if (length === 0) {
    return { x: 0, y: 1 };
  }

  return {
    x: x / length,
    y: y / length,
  };
};

/**
 * Reflect velocity against a surface normal.
 *
 * v' = v - 2(v · n)n
 */
export const reflectVelocity = (
  vx: number,
  vy: number,
  normalX: number,
  normalY: number,
): { vx: number; vy: number } => {
  "worklet";

  const dot = vx * normalX + vy * normalY;

  return {
    vx: vx - 2 * dot * normalX,
    vy: vy - 2 * dot * normalY,
  };
};

/**
 * Apply an off-center paddle hit.
 *
 * First perform normal reflection.
 * Then rotate the reflected velocity based on the
 * horizontal distance from the paddle center.
 */
export const reflectFromPaddle = (
  ball: Ball,
  paddleX: number,
  paddleY: number,
  paddleWidth: number,
  paddleHeight: number,
  ballRadius: number,
  normalY: number,
  maxBounceAngle: number,
  maxBallSpeed: number
): Ball => {
  "worklet";

  const halfWidth = paddleWidth / 2;

  // -1 = far left edge
  //  0 = center
  // +1 = far right edge
  const hitOffset = clamp(
    (ball.x - paddleX) / halfWidth,
    -1,
    1
  );

  const speed = Math.min(
    magnitude(ball.vx, ball.vy),
    maxBallSpeed
  );

  /*
   * Instead of reflecting the existing angle and then
   * adding another angle, explicitly construct the
   * outgoing direction.
   *
   * This gives predictable Pong behavior:
   *
   * center hit
   *       ↑
   *
   * left edge
   *      ↖
   *
   * right edge
   *       ↗
   */

  const angleFromVertical =
    hitOffset * maxBounceAngle;

  // X direction comes from hit position.
  const vx =
    Math.sin(angleFromVertical) * speed;

  // Y direction depends on which paddle was hit.
  const vy =
    normalY * Math.cos(angleFromVertical) * speed;

  return {
    x: ball.x,

    y:
      normalY > 0
        ? paddleY +
          paddleHeight / 2 +
          ballRadius +
          0.5
        : paddleY -
          paddleHeight / 2 -
          ballRadius -
          0.5,

    vx,
    vy,
  };
};

export const createBall = (
  arenaWidth: number,
  arenaHeight: number,
  speed: number,
  launchAngle: number,
): Ball => {
  "worklet";

  return {
    x: arenaWidth / 2,
    y: arenaHeight / 2,
    vx: Math.cos(launchAngle) * speed,
    vy: Math.sin(launchAngle) * speed,
  };
};

export const createInitialState = (
  config: PhysicsConfig,
  launchAngle: number,
): GameState => {
  "worklet";

  return {
    ball: createBall(
      config.arenaWidth,
      config.arenaHeight,
      config.initialBallSpeed,
      launchAngle,
    ),

    botPaddleX: config.arenaWidth / 2,

    lastScoredBy: null,
  };
};

/**
 * Advance one physics tick.
 *
 * Pure:
 *   input state + inputs -> output state
 *
 * No React.
 * No Zustand.
 * No SharedValue.
 * No rendering.
 */
export const updatePhysics = (
  state: GameState,
  deltaTime: number,
  playerPaddleX: number,
  launchAngle: number,
  config: PhysicsConfig,
): GameState => {
  "worklet";

  // Prevent huge physics steps when the app is paused/backgrounded.
  const dt = clamp(deltaTime, 0, 0.033);

  let ball = {
    ...state.ball,
  };

  // --------------------------------------------------
  // BOT PADDLE
  // --------------------------------------------------

  // Bot paddle ONLY moves on X.
  // Its Y position is fixed by the renderer.

  let botPaddleX = state.botPaddleX;

  // Only actively track the ball when it is moving
  // toward the bot.
  //
  // Top paddle is the bot.
  // Ball moving upward => vy < 0.
  if (ball.vy < 0) {
    const targetX = ball.x;

    const distance = targetX - botPaddleX;

    // Dead zone prevents pixel-perfect tracking.
    // If the ball is already close enough, don't move.
    const reactionDeadZone = 10;

    if (Math.abs(distance) > reactionDeadZone) {
      const maxMovement = config.botMaxSpeed * dt;

      const movement = clamp(distance, -maxMovement, maxMovement);

      botPaddleX += movement;
    }
  } else {
    // When the ball is moving away from the bot,
    // slowly return toward the center.
    const centerX = config.arenaWidth / 2;

    const distance = centerX - botPaddleX;

    const returnSpeed = config.botMaxSpeed * 0.35;

    const maxMovement = returnSpeed * dt;

    botPaddleX += clamp(distance, -maxMovement, maxMovement);
  }

  // Never allow the bot paddle to leave the arena.
  botPaddleX = clamp(
    botPaddleX,
    config.paddleWidth / 2,
    config.arenaWidth - config.paddleWidth / 2,
  );

  // --------------------------------------------------
  // BALL MOVEMENT
  // --------------------------------------------------

  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;

  // --------------------------------------------------
  // SIDE WALLS
  // --------------------------------------------------

  if (ball.x - config.ballRadius <= 0 && ball.vx < 0) {
    ball.x = config.ballRadius;

    const reflected = reflectVelocity(ball.vx, ball.vy, 1, 0);

    ball.vx = reflected.vx;
    ball.vy = reflected.vy;
  }

  if (ball.x + config.ballRadius >= config.arenaWidth && ball.vx > 0) {
    ball.x = config.arenaWidth - config.ballRadius;

    const reflected = reflectVelocity(ball.vx, ball.vy, -1, 0);

    ball.vx = reflected.vx;
    ball.vy = reflected.vy;
  }

  // --------------------------------------------------
  // PADDLE POSITIONS
  // --------------------------------------------------

  const paddleYBottom = config.arenaHeight - config.paddleMargin;

  const paddleYTop = config.paddleMargin;

  // --------------------------------------------------
  // LOCAL PLAYER PADDLE
  // --------------------------------------------------

  const playerHit =
    ball.vy > 0 &&
    ball.y + config.ballRadius >= paddleYBottom - config.paddleHeight / 2 &&
    ball.y - config.ballRadius <= paddleYBottom + config.paddleHeight / 2 &&
    ball.x >= playerPaddleX - config.paddleWidth / 2 &&
    ball.x <= playerPaddleX + config.paddleWidth / 2;

  if (playerHit) {
    ball = reflectFromPaddle(
      ball,
      playerPaddleX,
      paddleYBottom,
      config.paddleWidth,
      config.paddleHeight,
      config.ballRadius,
      -1,
      config.maxBounceAngle,
      config.maxBallSpeed,
    );
  }

  // --------------------------------------------------
  // BOT PADDLE
  // --------------------------------------------------

  const botHit =
    ball.vy < 0 &&
    ball.y - config.ballRadius <= paddleYTop + config.paddleHeight / 2 &&
    ball.y + config.ballRadius >= paddleYTop - config.paddleHeight / 2 &&
    ball.x >= botPaddleX - config.paddleWidth / 2 &&
    ball.x <= botPaddleX + config.paddleWidth / 2;

  if (botHit) {
    ball = reflectFromPaddle(
      ball,
      botPaddleX,
      paddleYTop,
      config.paddleWidth,
      config.paddleHeight,
      config.ballRadius,
      1,
      config.maxBounceAngle,
      config.maxBallSpeed,
    );
  }

  // --------------------------------------------------
  // MISSES / SCORING
  // --------------------------------------------------

  if (ball.y - config.ballRadius > config.arenaHeight) {
    return {
      ball: createBall(
        config.arenaWidth,
        config.arenaHeight,
        config.initialBallSpeed,
        launchAngle,
      ),
      botPaddleX,
      lastScoredBy: "player",
    };
  }

  if (ball.y + config.ballRadius < 0) {
    return {
      ball: createBall(
        config.arenaWidth,
        config.arenaHeight,
        config.initialBallSpeed,
        launchAngle,
      ),
      botPaddleX,
      lastScoredBy: "bot",
    };
  }

  return {
    ball,
    botPaddleX,
    lastScoredBy: null,
  };
};
