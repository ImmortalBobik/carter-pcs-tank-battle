/**
 * White CarterPCs: Tank Battle - 2D Physics & Swept Collision Engine
 * Tank-wall sliding, tank-tank separation, swept bullet ricochet & laser raytracing
 */
window.CarterTanks = window.CarterTanks || {};

(function () {
  'use strict';

  const TANK_RADIUS = 22;
  const BULLET_RADIUS = 4;
  const WALL_THICKNESS = 10;
  const WALL_HALF_THICK = WALL_THICKNESS / 2;

  const Physics = {
    TANK_RADIUS: TANK_RADIUS,
    BULLET_RADIUS: BULLET_RADIUS,
    WALL_THICKNESS: WALL_THICKNESS,

    /**
     * Resolves tank collision against all maze walls using circle-vs-segment capsule checks
     * Iterative relaxation enables smooth sliding along walls and corner funnels
     */
    resolveTankWalls: function (tank, maze, iterations) {
      iterations = iterations || 3;
      const minDistance = TANK_RADIUS + WALL_HALF_THICK;
      const arenaW = maze.width;
      const arenaH = maze.height;

      for (let it = 0; it < iterations; it++) {
        // 1. Clamp to Arena Outer Boundaries
        const boundMinX = TANK_RADIUS + WALL_HALF_THICK + 2;
        const boundMaxX = arenaW - (TANK_RADIUS + WALL_HALF_THICK + 2);
        const boundMinY = TANK_RADIUS + WALL_HALF_THICK + 2;
        const boundMaxY = arenaH - (TANK_RADIUS + WALL_HALF_THICK + 2);

        if (tank.x < boundMinX) tank.x = boundMinX;
        if (tank.x > boundMaxX) tank.x = boundMaxX;
        if (tank.y < boundMinY) tank.y = boundMinY;
        if (tank.y > boundMaxY) tank.y = boundMaxY;

        // 2. Resolve against interior wall segments
        for (let i = 0; i < maze.segments.length; i++) {
          const seg = maze.segments[i];
          if (seg.isOuter) continue; // Boundary already clamped above

          const closest = closestPointOnSegment(tank.x, tank.y, seg.x1, seg.y1, seg.x2, seg.y2);
          const dx = tank.x - closest.x;
          const dy = tank.y - closest.y;
          const distSq = dx * dx + dy * dy;

          if (distSq < minDistance * minDistance) {
            const dist = Math.sqrt(distSq);
            let nx = 0;
            let ny = 0;

            if (dist > 0.0001) {
              nx = dx / dist;
              ny = dy / dist;
            } else {
              // Exact center overlap fallback
              if (seg.dir === 'v') {
                nx = tank.x >= seg.x1 ? 1 : -1;
              } else {
                ny = tank.y >= seg.y1 ? 1 : -1;
              }
            }

            const penetration = minDistance - dist;
            tank.x += nx * penetration;
            tank.y += ny * penetration;
          }
        }
      }
    },

    /**
     * Circle-circle elastic separation between two tanks
     */
    resolveTankTank: function (tank1, tank2) {
      const minDistance = TANK_RADIUS * 2;
      const dx = tank2.x - tank1.x;
      const dy = tank2.y - tank1.y;
      const distSq = dx * dx + dy * dy;

      if (distSq < minDistance * minDistance && distSq > 0.0001) {
        const dist = Math.sqrt(distSq);
        const overlap = (minDistance - dist) * 0.5;
        const nx = dx / dist;
        const ny = dy / dist;

        tank1.x -= nx * overlap;
        tank1.y -= ny * overlap;
        tank2.x += nx * overlap;
        tank2.y += ny * overlap;
        return true;
      }
      return false;
    },

    /**
     * Updates bullet with sub-stepped swept collision detection against maze walls.
     * Prevents tunneling at high speed and computes exact normal reflections.
     * Returns: { bounced: boolean, expired: boolean, hitNormal?: {x, y} }
     */
    updateBullet: function (bullet, dt, maze, onBounce) {
      bullet.age = (bullet.age || 0) + dt;

      const speed = Math.hypot(bullet.vx, bullet.vy);
      if (speed <= 0.0001) {
        return { bounced: false, expired: true };
      }

      // Sub-step so travel per sub-step is <= 4 pixels
      const totalDist = speed * dt;
      const steps = Math.max(1, Math.ceil(totalDist / 4));
      const stepDt = dt / steps;

      for (let s = 0; s < steps; s++) {
        const startX = bullet.x;
        const startY = bullet.y;
        const endX = startX + bullet.vx * stepDt;
        const endY = startY + bullet.vy * stepDt;

        let earliestHit = null;

        // Check swept line against all wall segments expanded by BULLET_RADIUS
        for (let i = 0; i < maze.segments.length; i++) {
          const seg = maze.segments[i];
          const hit = sweepSegmentAgainstWall(startX, startY, endX, endY, seg, BULLET_RADIUS);
          if (hit && (!earliestHit || hit.t < earliestHit.t)) {
            earliestHit = hit;
          }
        }

        if (earliestHit) {
          // Move bullet to collision point
          bullet.x = earliestHit.x;
          bullet.y = earliestHit.y;

          // Compute reflection vector: v' = v - 2 * (v . n) * n
          const dot = bullet.vx * earliestHit.nx + bullet.vy * earliestHit.ny;
          bullet.vx = bullet.vx - 2 * dot * earliestHit.nx;
          bullet.vy = bullet.vy - 2 * dot * earliestHit.ny;

          // Nudge position slightly away along normal to prevent re-collision
          bullet.x += earliestHit.nx * 1.0;
          bullet.y += earliestHit.ny * 1.0;

          bullet.bouncesLeft--;
          bullet.hasBounced = true;

          if (typeof onBounce === 'function') {
            onBounce(bullet.x, bullet.y, earliestHit.nx, earliestHit.ny);
          }

          if (bullet.bouncesLeft <= 0) {
            return { bounced: true, expired: true, hitNormal: { x: earliestHit.nx, y: earliestHit.ny } };
          }

          return { bounced: true, expired: false, hitNormal: { x: earliestHit.nx, y: earliestHit.ny } };
        } else {
          bullet.x = endX;
          bullet.y = endY;
        }
      }

      // Extended bullet lifetime (~24s) for long-range precision & geometry ricochets
      if (bullet.age > 24.0) {
        return { bounced: false, expired: true };
      }

      return { bounced: false, expired: false };
    },

    /**
     * Checks if bullet hits a tank
     * Self-hit rule: Cannot hit shooter during first 0.22s unless bounced
     * Shield rule: Absorbs bullet and grants brief invulnerability
     */
    checkBulletTankHit: function (bullet, tank) {
      if (!tank.alive) return null;

      // Tank invincible / spawning
      if (tank.invulnerableTimer && tank.invulnerableTimer > 0) {
        return null;
      }

      // Self-hit delay
      if (bullet.shooterId === tank.id && !bullet.hasBounced && bullet.age < 0.22) {
        return null;
      }

      const dx = bullet.x - tank.x;
      const dy = bullet.y - tank.y;
      const hitRadius = TANK_RADIUS + BULLET_RADIUS;

      if (dx * dx + dy * dy <= hitRadius * hitRadius) {
        // Tank hit! Check Vegetable Oil Shield
        if (tank.oilShield && tank.oilShield > 0) {
          tank.oilShield--;
          tank.invulnerableTimer = 0.5; // 0.5s shield cooldown
          return { hit: true, shielded: true, tank: tank };
        }
        return { hit: true, shielded: false, tank: tank };
      }

      return null;
    },

    /**
     * Traces laser aim trajectory up to maxBounces against walls
     * Returns array of points: [{ x, y }, ...]
     */
    traceAimRay: function (startX, startY, angle, maxBounces, maze) {
      const points = [{ x: startX, y: startY }];
      let curX = startX;
      let curY = startY;
      let curVx = Math.cos(angle);
      let curVy = Math.sin(angle);
      const maxDistPerSegment = 1400;

      for (let b = 0; b <= maxBounces; b++) {
        let bestT = Infinity;
        let bestNormal = null;

        const targetX = curX + curVx * maxDistPerSegment;
        const targetY = curY + curVy * maxDistPerSegment;

        for (let i = 0; i < maze.segments.length; i++) {
          const seg = maze.segments[i];
          const hit = sweepSegmentAgainstWall(curX, curY, targetX, targetY, seg, 1.0);
          if (hit && hit.t > 0.001 && hit.t < bestT) {
            bestT = hit.t;
            bestNormal = hit;
          }
        }

        if (bestNormal && bestT < 1.0) {
          curX = bestNormal.x;
          curY = bestNormal.y;
          points.push({ x: curX, y: curY });

          // Reflect vector
          const dot = curVx * bestNormal.nx + curVy * bestNormal.ny;
          curVx = curVx - 2 * dot * bestNormal.nx;
          curVy = curVy - 2 * dot * bestNormal.ny;

          // Offset slightly
          curX += bestNormal.nx * 0.5;
          curY += bestNormal.y * 0.5;
        } else {
          // Reached max distance without wall collision
          points.push({ x: curX + curVx * 100, y: curY + curVy * 100 });
          break;
        }
      }

      return points;
    },

    /**
     * Resolves point-blank muzzle spawning against maze walls.
     * Sweeps from tank center to barrel tip to prevent bullets from spawning inside or past walls.
     */
    resolveMuzzleSpawn: function (tankX, tankY, angle, barrelLen, bulletVx, bulletVy, maze) {
      const targetX = tankX + Math.cos(angle) * barrelLen;
      const targetY = tankY + Math.sin(angle) * barrelLen;

      let earliestHit = null;
      for (let i = 0; i < maze.segments.length; i++) {
        const seg = maze.segments[i];
        const hit = sweepSegmentAgainstWall(tankX, tankY, targetX, targetY, seg, BULLET_RADIUS);
        if (hit && (!earliestHit || hit.t < earliestHit.t)) {
          earliestHit = hit;
        }
      }

      if (earliestHit) {
        // Wall was hit between tank center and barrel tip!
        const dot = bulletVx * earliestHit.nx + bulletVy * earliestHit.ny;
        const refVx = bulletVx - 2 * dot * earliestHit.nx;
        const refVy = bulletVy - 2 * dot * earliestHit.ny;
        const spawnX = earliestHit.x + earliestHit.nx * 1.5;
        const spawnY = earliestHit.y + earliestHit.ny * 1.5;

        return {
          x: spawnX,
          y: spawnY,
          vx: refVx,
          vy: refVy,
          bounced: true,
          hitNormal: { x: earliestHit.nx, y: earliestHit.ny },
          hitPoint: { x: earliestHit.x, y: earliestHit.y }
        };
      }

      return {
        x: targetX,
        y: targetY,
        vx: bulletVx,
        vy: bulletVy,
        bounced: false
      };
    }
  };

  /**
   * Helper: Closest point on line segment (x1, y1) -> (x2, y2) to point (px, py)
   */
  function closestPointOnSegment(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;

    if (lenSq < 0.00001) {
      return { x: x1, y: y1 };
    }

    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));

    return {
      x: x1 + t * dx,
      y: y1 + t * dy
    };
  }

  /**
   * Helper: Swept ray against wall segment with capsule / box thickness
   */
  function sweepSegmentAgainstWall(x1, y1, x2, y2, wall, radius) {
    const ht = WALL_HALF_THICK + radius;

    let minX, maxX, minY, maxY;
    if (wall.dir === 'h' || wall.y1 === wall.y2) {
      minX = Math.min(wall.x1, wall.x2) - ht;
      maxX = Math.max(wall.x1, wall.x2) + ht;
      minY = wall.y1 - ht;
      maxY = wall.y1 + ht;
    } else {
      minX = wall.x1 - ht;
      maxX = wall.x1 + ht;
      minY = Math.min(wall.y1, wall.y2) - ht;
      maxY = Math.max(wall.y1, wall.y2) + ht;
    }

    // Ray vs AABB intersection test
    const dx = x2 - x1;
    const dy = y2 - y1;

    let tMin = 0.0;
    let tMax = 1.0;
    let normalX = 0;
    let normalY = 0;

    // X axis
    if (Math.abs(dx) < 0.000001) {
      if (x1 < minX || x1 > maxX) return null;
    } else {
      const invDx = 1.0 / dx;
      let tx1 = (minX - x1) * invDx;
      let tx2 = (maxX - x1) * invDx;
      let nx1 = -1;
      let nx2 = 1;

      if (tx1 > tx2) {
        let tmp = tx1; tx1 = tx2; tx2 = tmp;
        nx1 = 1; nx2 = -1;
      }

      if (tx1 > tMin) {
        tMin = tx1;
        normalX = nx1;
        normalY = 0;
      }
      tMax = Math.min(tMax, tx2);
      if (tMin > tMax) return null;
    }

    // Y axis
    if (Math.abs(dy) < 0.000001) {
      if (y1 < minY || y1 > maxY) return null;
    } else {
      const invDy = 1.0 / dy;
      let ty1 = (minY - y1) * invDy;
      let ty2 = (maxY - y1) * invDy;
      let ny1 = -1;
      let ny2 = 1;

      if (ty1 > ty2) {
        let tmp = ty1; ty1 = ty2; ty2 = tmp;
        ny1 = 1; ny2 = -1;
      }

      if (ty1 > tMin) {
        tMin = ty1;
        normalX = 0;
        normalY = ny1;
      }
      tMax = Math.min(tMax, ty2);
      if (tMin > tMax) return null;
    }

    if (tMin >= 0.0 && tMin <= 1.0) {
      return {
        t: tMin,
        x: x1 + dx * tMin,
        y: y1 + dy * tMin,
        nx: normalX,
        ny: normalY
      };
    }

    return null;
  }

  window.CarterTanks.Physics = Physics;
})();
