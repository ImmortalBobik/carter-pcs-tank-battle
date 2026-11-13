/**
 * White CarterPCs: Tank Battle - Procedural Maze Generator
 * Spanning-tree DFS maze with loop carving, BFS pathfinding & LOS checks
 */
window.CarterTanks = window.CarterTanks || {};

(function () {
  'use strict';

  function Maze(options) {
    options = options || {};
    this.cols = options.cols || 10;
    this.rows = options.rows || 7;
    this.cellSize = options.cellSize || 80;
    this.wallThickness = options.wallThickness || 10;
    this.width = this.cols * this.cellSize;
    this.height = this.rows * this.cellSize;

    // Walls representation:
    // vWalls[r][c] is true if there is a vertical wall between cell (c, r) and (c+1, r) (for c from 0 to cols-2)
    // hWalls[r][c] is true if there is a horizontal wall between cell (c, r) and (c, r+1) (for r from 0 to rows-2)
    this.vWalls = [];
    this.hWalls = [];
    this.segments = []; // Array of { x1, y1, x2, y2, thickness, isOuter, dir }

    this.spawns = {
      p1: { col: 1, row: 1, x: 120, y: 120, angle: 0 },
      p2: { col: this.cols - 2, row: this.rows - 2, x: (this.cols - 1.5) * this.cellSize, y: (this.rows - 1.5) * this.cellSize, angle: Math.PI }
    };
  }

  Maze.prototype.generate = function (seed) {
    const cols = this.cols;
    const rows = this.rows;

    // Initialize all interior walls as solid (true)
    this.vWalls = [];
    for (let r = 0; r < rows; r++) {
      this.vWalls[r] = [];
      for (let c = 0; c < cols - 1; c++) {
        this.vWalls[r][c] = true;
      }
    }

    this.hWalls = [];
    for (let r = 0; r < rows - 1; r++) {
      this.hWalls[r] = [];
      for (let c = 0; c < cols; c++) {
        this.hWalls[r][c] = true;
      }
    }

    // Pseudo-random helper if seed given, otherwise Math.random
    let rng = Math.random;
    if (typeof seed === 'number') {
      let s = seed % 2147483647;
      if (s <= 0) s += 2147483646;
      rng = function () {
        s = (s * 16807) % 2147483647;
        return (s - 1) / 2147483646;
      };
    }

    // 1. Spanning Tree with Randomized DFS (Recursive Backtracker)
    const visited = [];
    for (let r = 0; r < rows; r++) {
      visited[r] = new Uint8Array(cols);
    }

    const startC = Math.floor(rng() * cols);
    const startR = Math.floor(rng() * rows);
    const stack = [{ c: startC, r: startR }];
    visited[startR][startC] = 1;

    const neighbors = [
      { dc: 0, dr: -1, type: 'h', wallR: -1, wallC: 0 }, // North
      { dc: 1, dr: 0, type: 'v', wallR: 0, wallC: 0 },   // East
      { dc: 0, dr: 1, type: 'h', wallR: 0, wallC: 0 },   // South
      { dc: -1, dr: 0, type: 'v', wallR: 0, wallC: -1 }  // West
    ];

    while (stack.length > 0) {
      const current = stack[stack.length - 1];
      const valid = [];

      for (let i = 0; i < neighbors.length; i++) {
        const n = neighbors[i];
        const nc = current.c + n.dc;
        const nr = current.r + n.dr;

        if (nc >= 0 && nc < cols && nr >= 0 && nr < rows && !visited[nr][nc]) {
          valid.push({ c: nc, r: nr, nIndex: i });
        }
      }

      if (valid.length > 0) {
        // Pick random unvisited neighbor
        const pick = valid[Math.floor(rng() * valid.length)];
        const n = neighbors[pick.nIndex];

        // Carve wall between current and neighbor
        if (n.type === 'v') {
          const wr = current.r;
          const wc = n.dc === 1 ? current.c : pick.c;
          this.vWalls[wr][wc] = false;
        } else {
          const wr = n.dr === 1 ? current.r : pick.r;
          const wc = current.c;
          this.hWalls[wr][wc] = false;
        }

        visited[pick.r][pick.c] = 1;
        stack.push({ c: pick.c, r: pick.r });
      } else {
        stack.pop();
      }
    }

    // 2. Remove ~18% of remaining interior walls to create tactical loops & flanking routes
    const remainingVWalls = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols - 1; c++) {
        if (this.vWalls[r][c]) {
          remainingVWalls.push({ type: 'v', r: r, c: c });
        }
      }
    }

    const remainingHWalls = [];
    for (let r = 0; r < rows - 1; r++) {
      for (let c = 0; c < cols; c++) {
        if (this.hWalls[r][c]) {
          remainingHWalls.push({ type: 'h', r: r, c: c });
        }
      }
    }

    const removeVCount = Math.floor(remainingVWalls.length * 0.18);
    for (let i = 0; i < removeVCount; i++) {
      const idx = Math.floor(rng() * remainingVWalls.length);
      const w = remainingVWalls.splice(idx, 1)[0];
      this.vWalls[w.r][w.c] = false;
    }

    const removeHCount = Math.floor(remainingHWalls.length * 0.18);
    for (let i = 0; i < removeHCount; i++) {
      const idx = Math.floor(rng() * remainingHWalls.length);
      const w = remainingHWalls.splice(idx, 1)[0];
      this.hWalls[w.r][w.c] = false;
    }

    // 3. Compile Wall Segments
    this.buildSegments();

    // 4. Guarantee Safe Spawns with BFS distance >= 7
    this.selectSpawns(rng);

    return this;
  };

  Maze.prototype.buildSegments = function () {
    const cs = this.cellSize;
    const th = this.wallThickness;
    const segments = [];

    // Outer Boundary (4 solid border segments)
    segments.push({ x1: 0, y1: 0, x2: this.width, y2: 0, thickness: th, isOuter: true, dir: 'h' });
    segments.push({ x1: 0, y1: this.height, x2: this.width, y2: this.height, thickness: th, isOuter: true, dir: 'h' });
    segments.push({ x1: 0, y1: 0, x2: 0, y2: this.height, thickness: th, isOuter: true, dir: 'v' });
    segments.push({ x1: this.width, y1: 0, x2: this.width, y2: this.height, thickness: th, isOuter: true, dir: 'v' });

    // Interior Vertical Walls
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols - 1; c++) {
        if (this.vWalls[r][c]) {
          const x = (c + 1) * cs;
          const y1 = r * cs;
          const y2 = (r + 1) * cs;
          segments.push({ x1: x, y1: y1, x2: x, y2: y2, thickness: th, isOuter: false, dir: 'v' });
        }
      }
    }

    // Interior Horizontal Walls
    for (let r = 0; r < this.rows - 1; r++) {
      for (let c = 0; c < this.cols; c++) {
        if (this.hWalls[r][c]) {
          const y = (r + 1) * cs;
          const x1 = c * cs;
          const x2 = (c + 1) * cs;
          segments.push({ x1: x1, y1: y, x2: x2, y2: y, thickness: th, isOuter: false, dir: 'h' });
        }
      }
    }

    this.segments = segments;
  };

  /**
   * BFS Shortest Path between cell A and cell B
   * Returns array of cell objects [{ col, row }] or empty array if unreachable
   */
  Maze.prototype.findPath = function (start, end) {
    if (!start || !end) return [];
    if (start.col === end.col && start.row === end.row) {
      return [{ col: start.col, row: start.row }];
    }

    const cols = this.cols;
    const rows = this.rows;
    const visited = [];
    const parent = [];

    for (let r = 0; r < rows; r++) {
      visited[r] = new Uint8Array(cols);
      parent[r] = new Array(cols);
    }

    const queue = [{ col: start.col, row: start.row }];
    visited[start.row][start.col] = 1;

    let found = false;

    while (queue.length > 0) {
      const cur = queue.shift();
      if (cur.col === end.col && cur.row === end.row) {
        found = true;
        break;
      }

      // Check 4 adjacent directions:
      // North
      if (cur.row > 0 && !this.hWalls[cur.row - 1][cur.col] && !visited[cur.row - 1][cur.col]) {
        visited[cur.row - 1][cur.col] = 1;
        parent[cur.row - 1][cur.col] = cur;
        queue.push({ col: cur.col, row: cur.row - 1 });
      }
      // South
      if (cur.row < rows - 1 && !this.hWalls[cur.row][cur.col] && !visited[cur.row + 1][cur.col]) {
        visited[cur.row + 1][cur.col] = 1;
        parent[cur.row + 1][cur.col] = cur;
        queue.push({ col: cur.col, row: cur.row + 1 });
      }
      // West
      if (cur.col > 0 && !this.vWalls[cur.row][cur.col - 1] && !visited[cur.row][cur.col - 1]) {
        visited[cur.row][cur.col - 1] = 1;
        parent[cur.row][cur.col - 1] = cur;
        queue.push({ col: cur.col - 1, row: cur.row });
      }
      // East
      if (cur.col < cols - 1 && !this.vWalls[cur.row][cur.col] && !visited[cur.row][cur.col + 1]) {
        visited[cur.row][cur.col + 1] = 1;
        parent[cur.row][cur.col + 1] = cur;
        queue.push({ col: cur.col + 1, row: cur.row });
      }
    }

    if (!found) return [];

    // Reconstruct path
    const path = [];
    let curr = { col: end.col, row: end.row };
    while (curr) {
      path.unshift(curr);
      if (curr.col === start.col && curr.row === start.row) break;
      curr = parent[curr.row][curr.col];
    }

    return path;
  };

  /**
   * Raycast / Line of Sight Check between point (x1, y1) and (x2, y2)
   * Returns true if clear path exists, false if blocked by any wall
   */
  Maze.prototype.hasLineOfSight = function (x1, y1, x2, y2) {
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);

    for (let i = 0; i < this.segments.length; i++) {
      const seg = this.segments[i];
      const sMinX = Math.min(seg.x1, seg.x2);
      const sMaxX = Math.max(seg.x1, seg.x2);
      const sMinY = Math.min(seg.y1, seg.y2);
      const sMaxY = Math.max(seg.y1, seg.y2);

      // Fast bounding box rejection
      if (maxX < sMinX || minX > sMaxX || maxY < sMinY || minY > sMaxY) {
        continue;
      }

      if (segmentsIntersect(x1, y1, x2, y2, seg.x1, seg.y1, seg.x2, seg.y2)) {
        return false;
      }
    }

    return true;
  };

  function ccw(ax, ay, bx, by, cx, cy) {
    return (cy - ay) * (bx - ax) > (by - ay) * (cx - ax);
  }

  function segmentsIntersect(p1x, p1y, p2x, p2y, p3x, p3y, p4x, p4y) {
    return (
      ccw(p1x, p1y, p3x, p3y, p4x, p4y) !== ccw(p2x, p2y, p3x, p3y, p4x, p4y) &&
      ccw(p1x, p1y, p2x, p2y, p3x, p3y) !== ccw(p1x, p1y, p2x, p2y, p4x, p4y)
    );
  }

  /**
   * Selects well-separated spawn cells (BFS distance >= 7 cells)
   */
  Maze.prototype.selectSpawns = function (rng) {
    rng = rng || Math.random;
    const cols = this.cols;
    const rows = this.rows;
    const cs = this.cellSize;

    // Corner / Quadrant candidate pairs
    const pairs = [
      { p1: { col: 1, row: 1 }, p2: { col: cols - 2, row: rows - 2 }, a1: 0, a2: Math.PI },
      { p1: { col: 1, row: rows - 2 }, p2: { col: cols - 2, row: 1 }, a1: 0, a2: Math.PI },
      { p1: { col: 0, row: 0 }, p2: { col: cols - 1, row: rows - 1 }, a1: Math.PI / 4, a2: -Math.PI * 0.75 },
      { p1: { col: 0, row: rows - 1 }, p2: { col: cols - 1, row: 0 }, a1: -Math.PI / 4, a2: Math.PI * 0.75 }
    ];

    // Shuffle pairs
    for (let i = pairs.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = pairs[i];
      pairs[i] = pairs[j];
      pairs[j] = tmp;
    }

    let chosen = null;
    for (let i = 0; i < pairs.length; i++) {
      const p = pairs[i];
      const path = this.findPath(p.p1, p.p2);
      if (path && path.length >= 8) { // 8 waypoints = 7 steps/distance >= 7
        chosen = p;
        break;
      }
    }

    // Fallback: search furthest open cells
    if (!chosen) {
      let maxDist = 0;
      let bestPair = null;
      for (let r1 = 0; r1 < 3; r1++) {
        for (let c1 = 0; c1 < 3; c1++) {
          const p1 = { col: c1, row: r1 };
          for (let r2 = rows - 3; r2 < rows; r2++) {
            for (let c2 = cols - 3; c2 < cols; c2++) {
              const p2 = { col: c2, row: r2 };
              const path = this.findPath(p1, p2);
              if (path.length > maxDist) {
                maxDist = path.length;
                bestPair = { p1: p1, p2: p2, a1: 0, a2: Math.PI };
              }
            }
          }
        }
      }
      chosen = bestPair || pairs[0];
    }

    this.spawns = {
      p1: {
        col: chosen.p1.col,
        row: chosen.p1.row,
        x: (chosen.p1.col + 0.5) * cs,
        y: (chosen.p1.row + 0.5) * cs,
        angle: chosen.a1
      },
      p2: {
        col: chosen.p2.col,
        row: chosen.p2.row,
        x: (chosen.p2.col + 0.5) * cs,
        y: (chosen.p2.row + 0.5) * cs,
        angle: chosen.a2
      }
    };
  };

  /**
   * Convert pixel coordinates to grid cell
   */
  Maze.prototype.getCellAt = function (x, y) {
    const col = Math.floor(x / this.cellSize);
    const row = Math.floor(y / this.cellSize);
    return {
      col: Math.max(0, Math.min(this.cols - 1, col)),
      row: Math.max(0, Math.min(this.rows - 1, row))
    };
  };

  /**
   * Get random open cell not close to spawns (for power-up placement)
   */
  Maze.prototype.getRandomOpenCell = function (excludeCells, rng) {
    rng = rng || Math.random;
    excludeCells = excludeCells || [];

    const candidates = [];
    for (let r = 1; r < this.rows - 1; r++) {
      for (let c = 1; c < this.cols - 1; c++) {
        let isExcluded = false;
        for (let i = 0; i < excludeCells.length; i++) {
          const ex = excludeCells[i];
          if (ex && ex.col === c && ex.row === r) {
            isExcluded = true;
            break;
          }
        }
        if (!isExcluded) {
          candidates.push({ col: c, row: r });
        }
      }
    }

    if (candidates.length === 0) {
      return { col: Math.floor(this.cols / 2), row: Math.floor(this.rows / 2) };
    }

    return candidates[Math.floor(rng() * candidates.length)];
  };

  window.CarterTanks.Maze = Maze;
})();
