/**
 * White CarterPCs: Tank Battle - Smart Geometric & Simulation Bot AI
 * - Full-physics lookahead bullet dodging across multiple incoming & ricocheting bullets
 * - Multi-bounce 360° geometric bank-shot solver with fine angular refinement
 * - BFS maze navigation & power-up pursuit
 */
window.CarterTanks = window.CarterTanks || {};

(function () {
  'use strict';

  function BotAI(difficulty) {
    this.setDifficulty(difficulty || 'normal');
    this.path = [];
    this.pathTimer = 0;
    this.fireTimer = 0;
    this.aimSearchTimer = 0;
    this.cachedBankAngle = null;
    this.targetAimAngle = 0;
    this.lastDodgeKey = null;
  }

  const PRESETS = {
    easy: {
      turnRate: 2.8,
      turretSpeed: 4.8,
      aimTolerance: 0.18,
      dodgeHorizon: 0.36,
      simSteps: 4,
      maxSearchBounces: 2,
      bankShots: true,
      fireDelay: 0.30,
      aimRefresh: 0.15
    },
    normal: {
      turnRate: 3.6,
      turretSpeed: 6.8,
      aimTolerance: 0.10,
      dodgeHorizon: 0.56,
      simSteps: 6,
      maxSearchBounces: 3,
      bankShots: true,
      fireDelay: 0.14,
      aimRefresh: 0.08
    },
    chaos: {
      turnRate: 4.5,
      turretSpeed: 9.5,
      aimTolerance: 0.055,
      dodgeHorizon: 0.72,
      simSteps: 7,
      maxSearchBounces: 4,
      bankShots: true,
      fireDelay: 0.07,
      aimRefresh: 0.045
    }
  };

  BotAI.prototype.setDifficulty = function (diff) {
    this.difficulty = PRESETS[diff] ? diff : 'normal';
    this.config = PRESETS[this.difficulty];
  };

  /**
   * Main AI update loop - generates tank drive, turret aim, and fire commands
   */
  BotAI.prototype.update = function (botTank, enemyTank, maze, bullets, powerups, dt) {
    if (!botTank || !botTank.alive || !enemyTank) {
      return { forward: 0, rotate: 0, fire: false };
    }

    this.pathTimer -= dt;
    this.fireTimer -= dt;
    this.aimSearchTimer -= dt;

    let forward = 0;
    let rotate = 0;
    let fire = false;

    // 1. Geometric Combat / Multi-Bounce Aiming (runs even while dodging)
    let shootAngle = null;
    const hasLOS = maze.hasLineOfSight(botTank.x, botTank.y, enemyTank.x, enemyTank.y);

    if (hasLOS) {
      shootAngle = Math.atan2(enemyTank.y - botTank.y, enemyTank.x - botTank.x);
      this.cachedBankAngle = null;
    } else if (this.config.bankShots) {
      if (this.aimSearchTimer <= 0 || this.cachedBankAngle === null) {
        this.aimSearchTimer = this.config.aimRefresh;
        this.cachedBankAngle = this.findBankShot(botTank, enemyTank, maze);
      }
      shootAngle = this.cachedBankAngle;
    }

    if (shootAngle !== null) {
      this.targetAimAngle = shootAngle;
      const aimDiff = normalizeAngle(shootAngle - botTank.turretAngle);

      if (Math.abs(aimDiff) < this.config.aimTolerance && this.fireTimer <= 0) {
        if (this.isShotSafe(botTank, shootAngle, maze)) {
          fire = true;
          this.fireTimer = this.config.fireDelay + Math.random() * 0.05;
        }
      }
    }

    // 2. Physics-Simulated Multi-Bullet Lookahead Dodging
    const threatBullets = this.getThreatTrajectories(botTank, bullets, maze);
    if (threatBullets.length > 0) {
      const evade = this.simulateBestEvade(botTank, threatBullets, maze);
      if (shootAngle === null) {
        this.targetAimAngle = botTank.bodyAngle;
      }
      return {
        forward: evade.forward,
        rotate: evade.rotate,
        fire: fire,
        aimAngle: this.targetAimAngle
      };
    }

    this.lastDodgeKey = null;

    // 3. Goal Selection (Power-up or Enemy Tank)
    let targetX = enemyTank.x;
    let targetY = enemyTank.y;

    if (powerups && powerups.length > 0 && !botTank.powerup && !botTank.oilShield) {
      let nearestPow = null;
      let nearestDist = Infinity;
      for (let i = 0; i < powerups.length; i++) {
        const p = powerups[i];
        if (p.collected) continue;
        const dist = Math.hypot(p.x - botTank.x, p.y - botTank.y);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestPow = p;
        }
      }

      if (nearestPow && nearestDist < 420) {
        targetX = nearestPow.x;
        targetY = nearestPow.y;
      }
    }

    // 4. BFS Maze Pathfinding
    if (this.pathTimer <= 0 || this.path.length === 0) {
      this.pathTimer = 0.25;
      const botCell = maze.getCellAt(botTank.x, botTank.y);
      const targetCell = maze.getCellAt(targetX, targetY);
      this.path = maze.findPath(botCell, targetCell);
    }

    let moveTargetX = targetX;
    let moveTargetY = targetY;

    if (this.path && this.path.length > 1) {
      const nextCell = this.path[1];
      const nextCellX = (nextCell.col + 0.5) * maze.cellSize;
      const nextCellY = (nextCell.row + 0.5) * maze.cellSize;

      if (Math.hypot(botTank.x - nextCellX, botTank.y - nextCellY) < 34) {
        this.path.shift();
      }

      if (this.path.length > 1) {
        moveTargetX = (this.path[1].col + 0.5) * maze.cellSize;
        moveTargetY = (this.path[1].row + 0.5) * maze.cellSize;
      }
    }

    const desiredMoveAngle = Math.atan2(moveTargetY - botTank.y, moveTargetX - botTank.x);
    const angleDiff = normalizeAngle(desiredMoveAngle - botTank.bodyAngle);

    if (Math.abs(angleDiff) > 0.1) {
      rotate = Math.sign(angleDiff);
    }

    if (Math.cos(angleDiff) > 0.35) {
      forward = 1;
    } else if (Math.cos(angleDiff) < -0.55) {
      forward = -0.6;
    }

    if (shootAngle === null) {
      this.targetAimAngle = botTank.bodyAngle;
    }

    return {
      forward: forward,
      rotate: rotate,
      fire: fire,
      aimAngle: this.targetAimAngle
    };
  };

  /**
   * Builds traced future trajectories (up to 2 wall bounces) for all nearby bullets
   * that threaten the bot within dodgeHorizon seconds.
   */
  BotAI.prototype.getThreatTrajectories = function (botTank, bullets, maze) {
    if (!bullets || bullets.length === 0) return [];

    const Physics = window.CarterTanks.Physics;
    const botRadius = Physics.TANK_RADIUS || 22;
    const dangerZone = botRadius + 38;
    const horizon = this.config.dodgeHorizon || 0.56;

    const trajectories = [];
    let anyImminentHit = false;

    for (let i = 0; i < bullets.length; i++) {
      const b = bullets[i];
      if (b.shooterId === botTank.id && !b.hasBounced && (b.age || 0) < 0.25) {
        continue;
      }

      const speed = Math.hypot(b.vx, b.vy);
      if (speed <= 0.001) continue;

      const roughDist = Math.hypot(botTank.x - b.x, botTank.y - b.y);
      if (roughDist > speed * horizon + 90) continue;

      const bAngle = Math.atan2(b.vy, b.vx);
      const pts = Physics.traceAimRay(b.x, b.y, bAngle, 2, maze);

      const segs = [];
      let tAccum = 0;
      let bulletNearBot = false;

      for (let s = 0; s < pts.length - 1; s++) {
        const p1 = pts[s];
        const p2 = pts[s + 1];
        const segLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        if (segLen < 0.001) continue;

        const segDuration = segLen / speed;
        const tStart = tAccum;
        const tEnd = tAccum + segDuration;

        segs.push({
          x1: p1.x,
          y1: p1.y,
          x2: p2.x,
          y2: p2.y,
          vx: ((p2.x - p1.x) / segLen) * speed,
          vy: ((p2.y - p1.y) / segLen) * speed,
          tStart: tStart,
          tEnd: tEnd
        });

        const distToPath = distToSegment(botTank.x, botTank.y, p1.x, p1.y, p2.x, p2.y);
        if (distToPath < dangerZone) {
          bulletNearBot = true;
          if (distToPath < botRadius + 24) {
            anyImminentHit = true;
          }
        }

        tAccum = tEnd;
        if (tAccum >= horizon) break;
      }

      if (bulletNearBot && segs.length > 0) {
        trajectories.push({ segs: segs, speed: speed });
      }
    }

    return anyImminentHit ? trajectories : [];
  };

  /**
   * Simulates candidate (forward, rotate) tank maneuvers against real wall collisions
   * and all predicted bullet positions over time, picking the safest escape action.
   */
  BotAI.prototype.simulateBestEvade = function (botTank, threatBullets, maze) {
    const Physics = window.CarterTanks.Physics;
    const botRadius = Physics.TANK_RADIUS || 22;
    const hitRadius = botRadius + (Physics.BULLET_RADIUS || 4) + 3;
    const moveSpeed = botTank.powerup === 'nitro' ? 280 : 160;
    const turnRate = this.config.turnRate || 3.6;
    const steps = this.config.simSteps || 6;
    const stepDt = 0.065;

    const candidates = [
      { key: 'fwd', forward: 1, rotate: 0 },
      { key: 'rev', forward: -1, rotate: 0 },
      { key: 'fwd_r', forward: 1, rotate: 1 },
      { key: 'fwd_l', forward: 1, rotate: -1 },
      { key: 'rev_r', forward: -1, rotate: 1 },
      { key: 'rev_l', forward: -1, rotate: -1 },
      { key: 'spin_r', forward: 0, rotate: 1 },
      { key: 'spin_l', forward: 0, rotate: -1 },
      { key: 'hold', forward: 0, rotate: 0 }
    ];

    let bestAction = candidates[0];
    let bestScore = -Infinity;

    for (let c = 0; c < candidates.length; c++) {
      const cand = candidates[c];
      const sim = {
        x: botTank.x,
        y: botTank.y,
        bodyAngle: botTank.bodyAngle
      };

      let minBulletDist = Infinity;
      let collidedAtTime = null;
      let totalClearance = 0;

      for (let s = 1; s <= steps; s++) {
        const t = s * stepDt;

        // Advance tank using exact game movement & wall sliding
        if (cand.rotate !== 0) {
          sim.bodyAngle += cand.rotate * turnRate * stepDt;
        }
        if (cand.forward !== 0) {
          sim.x += Math.cos(sim.bodyAngle) * cand.forward * moveSpeed * stepDt;
          sim.y += Math.sin(sim.bodyAngle) * cand.forward * moveSpeed * stepDt;
        }
        Physics.resolveTankWalls(sim, maze, 2);

        // Evaluate distance to every threatening bullet at exact timestamp t
        for (let bIdx = 0; bIdx < threatBullets.length; bIdx++) {
          const pos = sampleTrajectoryAt(threatBullets[bIdx].segs, t);
          if (!pos) continue;

          const d = Math.hypot(sim.x - pos.x, sim.y - pos.y);
          if (d < minBulletDist) minBulletDist = d;
          if (d <= hitRadius && collidedAtTime === null) {
            collidedAtTime = t;
          }
          totalClearance += Math.min(d, 90);
        }
      }

      // Compute final perpendicular clearance from bullet path lines
      let endRayClearance = 0;
      for (let bIdx = 0; bIdx < threatBullets.length; bIdx++) {
        const segs = threatBullets[bIdx].segs;
        let minSegD = Infinity;
        for (let k = 0; k < segs.length; k++) {
          const d = distToSegment(sim.x, sim.y, segs[k].x1, segs[k].y1, segs[k].x2, segs[k].y2);
          if (d < minSegD) minSegD = d;
        }
        endRayClearance += Math.min(minSegD, 80);
      }

      const movedDist = Math.hypot(sim.x - botTank.x, sim.y - botTank.y);
      let score = 0;

      if (collidedAtTime !== null) {
        // Predicted hit: heavily penalize, preferring delayed hit over instant hit
        score = -10000 + collidedAtTime * 1500 + minBulletDist * 10;
      } else {
        score = minBulletDist * 18 + endRayClearance * 4 + (totalClearance / steps) * 1.5 + movedDist * 0.25;
      }

      // Gentle hysteresis to avoid frame-to-frame flip-flopping on symmetric escapes
      if (this.lastDodgeKey === cand.key) {
        score += 10;
      }

      if (score > bestScore) {
        bestScore = score;
        bestAction = cand;
      }
    }

    this.lastDodgeKey = bestAction.key;
    return { forward: bestAction.forward, rotate: bestAction.rotate };
  };

  /**
   * Compatibility helper: returns the earliest threatening bullet if any
   */
  BotAI.prototype.findThreateningBullet = function (botTank, bullets, maze) {
    const threats = this.getThreatTrajectories(botTank, bullets, maze || this.lastMaze);
    return threats.length > 0 ? threats[0] : null;
  };

  /**
   * Multi-bounce geometric bank-shot solver:
   * Scans full 360° with up to maxSearchBounces wall reflections,
   * then refines the best hit angle to lock dead-center on the enemy.
   */
  BotAI.prototype.findBankShot = function (botTank, enemyTank, maze) {
    const Physics = window.CarterTanks.Physics;
    const enemyRadius = Physics.TANK_RADIUS || 22;
    const botRadius = Physics.TANK_RADIUS || 22;
    const maxBounces = this.config.maxSearchBounces || 3;

    const coarseSteps = 72; // Every 5 degrees around 360°
    let bestCandidate = null;
    let bestScore = Infinity;

    for (let i = 0; i < coarseSteps; i++) {
      const testA = (i / coarseSteps) * Math.PI * 2;
      const evalRes = evaluateBounceRay(botTank, enemyTank, testA, maxBounces, maze, enemyRadius, botRadius);
      if (evalRes && evalRes.score < bestScore) {
        bestScore = evalRes.score;
        bestCandidate = { angle: testA, evalRes: evalRes };
      }
    }

    if (!bestCandidate) return null;

    // Fine-tune within ±4 degrees (0.8° increments) to hit dead-center
    let refinedAngle = bestCandidate.angle;
    let refinedBestDist = bestCandidate.evalRes.hitDist;

    for (let step = -5; step <= 5; step++) {
      if (step === 0) continue;
      const fineA = bestCandidate.angle + step * (Math.PI / 225);
      const evalRes = evaluateBounceRay(botTank, enemyTank, fineA, maxBounces, maze, enemyRadius, botRadius);
      if (evalRes && evalRes.bounces <= bestCandidate.evalRes.bounces && evalRes.hitDist < refinedBestDist) {
        refinedBestDist = evalRes.hitDist;
        refinedAngle = fineA;
      }
    }

    return refinedAngle;
  };

  function evaluateBounceRay(botTank, enemyTank, angle, maxBounces, maze, enemyRadius, botRadius) {
    const points = window.CarterTanks.Physics.traceAimRay(botTank.x, botTank.y, angle, maxBounces, maze);
    if (!points || points.length < 2) return null;

    const firstSegLen = Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
    if (firstSegLen < 38) return null;

    let totalPathLen = firstSegLen;

    for (let segIdx = 1; segIdx < points.length - 1; segIdx++) {
      const p1 = points[segIdx];
      const p2 = points[segIdx + 1];
      const segLen = Math.hypot(p2.x - p1.x, p2.y - p1.y);

      if (segIdx === 1) {
        const selfDist = distToSegment(botTank.x, botTank.y, p1.x, p1.y, p2.x, p2.y);
        if (selfDist < botRadius + 6) return null;
      }

      const d = distToSegment(enemyTank.x, enemyTank.y, p1.x, p1.y, p2.x, p2.y);
      if (d < enemyRadius + 4) {
        const hitLen = totalPathLen + segLen * 0.5;
        const score = segIdx * 240 + hitLen + d * 4;
        return { bounces: segIdx, hitDist: d, score: score };
      }

      totalPathLen += segLen;
    }

    return null;
  }

  function sampleTrajectoryAt(segs, t) {
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      if (t >= s.tStart && t <= s.tEnd) {
        const dt = t - s.tStart;
        return {
          x: s.x1 + s.vx * dt,
          y: s.y1 + s.vy * dt
        };
      }
    }
    return null;
  }

  /**
   * Checks if shot will bounce directly back into shooter at point-blank range
   */
  BotAI.prototype.isShotSafe = function (botTank, angle, maze) {
    const points = window.CarterTanks.Physics.traceAimRay(botTank.x, botTank.y, angle, 1, maze);
    if (points.length >= 2) {
      const distToFirstWall = Math.hypot(points[1].x - botTank.x, points[1].y - botTank.y);
      if (distToFirstWall < 38) {
        return false;
      }
    }
    return true;
  };

  function normalizeAngle(a) {
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    return a;
  }

  function distToSegment(px, py, x1, y1, x2, y2) {
    const l2 = (x2 - x1) * (x2 - x1) + (y2 - y1) * (y2 - y1);
    if (l2 === 0) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1)));
  }

  window.CarterTanks.AI = BotAI;
})();
