export interface Vec2 {
  x: number;
  y: number;
}

export interface PolygonWall {
  slot: number;
  start: Vec2;
  end: Vec2;
  center: Vec2;
  outward: Vec2;
  tangent: Vec2;
  angle: number;
  length: number;
}

export interface PolygonGeometry {
  n: number;
  radius: number;
  center: Vec2;
  vertices: Vec2[];
  walls: PolygonWall[];
}

export const computeRegularPolygonVertices = (
  n: number,
  radius: number,
  centerX: number,
  centerY: number,
): Vec2[] => {
  const vertices: Vec2[] = [];
  const angleStep = (Math.PI * 2) / n;
  const startAngle = -Math.PI / 2 - Math.PI / n;

  for (let i = 0; i < n; i++) {
    const angle = startAngle + i * angleStep;
    vertices.push({
      x: centerX + Math.cos(angle) * radius,
      y: centerY + Math.sin(angle) * radius,
    });
  }

  return vertices;
};

const normalize = (x: number, y: number): Vec2 => {
  const length = Math.sqrt(x * x + y * y);
  if (length === 0) return { x: 0, y: 0 };
  return { x: x / length, y: y / length };
};

export const createPolygonGeometry = (
  n: number,
  radius: number,
  centerX: number,
  centerY: number,
): PolygonGeometry => {
  if (n < 3) {
    throw new Error("A polygon requires at least 3 sides");
  }

  const vertices = computeRegularPolygonVertices(n, radius, centerX, centerY);
  const walls: PolygonWall[] = [];

  for (let i = 0; i < n; i++) {
    const start = vertices[i];
    const end = vertices[(i + 1) % n];
    const center = {
      x: (start.x + end.x) / 2,
      y: (start.y + end.y) / 2,
    };
    const angle = -Math.PI / 2 + i * ((Math.PI * 2) / n);
    const outward = { x: Math.cos(angle), y: Math.sin(angle) };
    const tangent = normalize(Math.sin(angle), -Math.cos(angle));
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.sqrt(dx * dx + dy * dy);

    walls.push({
      slot: i,
      start,
      end,
      center,
      outward,
      tangent,
      angle,
      length,
    });
  }

  return {
    n,
    radius,
    center: { x: centerX, y: centerY },
    vertices,
    walls,
  };
};

/**
 * Terminal 2-player arena.
 *
 * This is deliberately NOT a 2-gon. The two surviving players occupy
 * horizontal top/bottom walls. The renderer adds the two non-player side
 * boundaries to make the arena visibly rectangular. Physics is stopped when
 * this geometry becomes active, so those side boundaries are not playable.
 */
export const createTwoPlayerRectangleGeometry = (
  radius: number,
  centerX: number,
  centerY: number,
): PolygonGeometry => {
  const halfWidth = radius;
  const halfHeight = radius;

  const topLeft = { x: centerX - halfWidth, y: centerY - halfHeight };
  const topRight = { x: centerX + halfWidth, y: centerY - halfHeight };
  const bottomRight = { x: centerX + halfWidth, y: centerY + halfHeight };
  const bottomLeft = { x: centerX - halfWidth, y: centerY + halfHeight };

  // Slots 0 and 1 are the two playable player walls.
  // Slots 2 and 3 are non-player reflecting side boundaries.
  const top: PolygonWall = {
    slot: 0,
    start: topLeft,
    end: topRight,
    center: { x: centerX, y: centerY - halfHeight },
    outward: { x: 0, y: -1 },
    tangent: { x: -1, y: 0 },
    angle: -Math.PI / 2,
    length: halfWidth * 2,
  };

  const bottom: PolygonWall = {
    slot: 1,
    start: bottomRight,
    end: bottomLeft,
    center: { x: centerX, y: centerY + halfHeight },
    outward: { x: 0, y: 1 },
    tangent: { x: 1, y: 0 },
    angle: Math.PI / 2,
    length: halfWidth * 2,
  };

  const left: PolygonWall = {
    slot: 2,
    start: bottomLeft,
    end: topLeft,
    center: { x: centerX - halfWidth, y: centerY },
    outward: { x: -1, y: 0 },
    tangent: { x: 0, y: -1 },
    angle: Math.PI,
    length: halfHeight * 2,
  };

  const right: PolygonWall = {
    slot: 3,
    start: topRight,
    end: bottomRight,
    center: { x: centerX + halfWidth, y: centerY },
    outward: { x: 1, y: 0 },
    tangent: { x: 0, y: 1 },
    angle: 0,
    length: halfHeight * 2,
  };

  return {
    n: 4,
    radius,
    center: { x: centerX, y: centerY },
    vertices: [topLeft, topRight, bottomRight, bottomLeft],
    walls: [top, bottom, left, right],
  };
};

/**
 * Terminal 1-player winner state.
 *
 * There is no playable physics after this state; the remaining wall is
 * rendered as the winner's wall and the game loop is stopped.
 */
export const createWinnerGeometry = (
  radius: number,
  centerX: number,
  centerY: number,
): PolygonGeometry => {
  const y = centerY + radius;
  const start = { x: centerX - radius, y };
  const end = { x: centerX + radius, y };

  const winnerWall: PolygonWall = {
    slot: 0,
    start,
    end,
    center: { x: centerX, y },
    outward: { x: 0, y: 1 },
    tangent: { x: 1, y: 0 },
    angle: Math.PI / 2,
    length: radius * 2,
  };

  return {
    n: 1,
    radius,
    center: { x: centerX, y: centerY },
    vertices: [start, end],
    walls: [winnerWall],
  };
};
