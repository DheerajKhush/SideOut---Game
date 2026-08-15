export interface Vec2 {
  x: number;
  y: number;
}

export interface PolygonWall {
  slot: number;

  start: Vec2;
  end: Vec2;

  center: Vec2;

  /**
   * Points outward from the polygon.
   */
  outward: Vec2;

  /**
   * Local axis of the wall.
   *
   * Positive direction is chosen so that after
   * viewer rotation, the local player's wall
   * runs left -> right on screen.
   */
  tangent: Vec2;

  /**
   * Wall's outward angle in canonical space.
   */
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

/**
 * Compute N vertices of a regular polygon.
 *
 * Radius = circumradius.
 *
 * Slot 0's wall is centered at the top.
 */
export const computeRegularPolygonVertices = (
  n: number,
  radius: number,
  centerX: number,
  centerY: number,
): Vec2[] => {
  const vertices: Vec2[] = [];

  const angleStep = (Math.PI * 2) / n;

  /**
   * Vertex 0 is half an edge before wall 0.
   *
   * Wall 0 therefore has its midpoint at -PI/2
   * (top of the canonical coordinate system).
   */
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

  if (length === 0) {
    return {
      x: 0,
      y: 0,
    };
  }

  return {
    x: x / length,
    y: y / length,
  };
};

/**
 * Build all polygon walls from the vertices.
 */
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

    /**
     * Wall midpoint.
     */
    const center = {
      x: (start.x + end.x) / 2,
      y: (start.y + end.y) / 2,
    };

    /**
     * For our construction, wall i's outward
     * normal is located at:
     *
     * -PI/2 + i * 2PI/N
     */
    const angle = -Math.PI / 2 + i * ((Math.PI * 2) / n);

    const outward = {
      x: Math.cos(angle),
      y: Math.sin(angle),
    };

    /**
     * Local tangent.
     *
     * This is intentionally the opposite of the
     * start -> end direction.
     *
     * That makes the local player's tangent point
     * toward screen-right after viewer rotation.
     */
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
    center: {
      x: centerX,
      y: centerY,
    },
    vertices,
    walls,
  };
};
