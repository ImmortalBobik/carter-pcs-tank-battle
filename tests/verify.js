/**
 * Verification test suite for White CarterPCs: Tank Battle
 * Tests syntax, maze connectivity, spawn separation, physics sliding,
 * swept bullet reflection, and AI decision loops.
 */

// Mock window and browser globals for Node test environment
global.window = global;
global.window.addEventListener = () => {};
global.window.removeEventListener = () => {};
global.window.matchMedia = () => ({ matches: false });
global.window.devicePixelRatio = 1;
global.localStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {}
};
global.document = {
  getElementById: () => ({
    getContext: () => ({
      resetTransform: () => {},
      scale: () => {},
      createLinearGradient: () => ({ addColorStop: () => {} }),
      beginPath: () => {},
      moveTo: () => {},
      lineTo: () => {},
      stroke: () => {},
      fill: () => {},
      arc: () => {},
      ellipse: () => {},
      save: () => {},
      restore: () => {},
      translate: () => {},
      rotate: () => {},
      fillRect: () => {},
      strokeRect: () => {},
      fillText: () => {},
      closePath: () => {},
      setLineDash: () => {},
      quadraticCurveTo: () => {}
    }),
    addEventListener: () => {},
    classList: { add: () => {}, remove: () => {}, toggle: () => {} },
    style: {}
  })
};

// Load game modules
require('../js/audio.js');
require('../js/maze.js');
require('../js/physics.js');
require('../js/ai.js');
require('../js/renderer.js');

let failures = 0;
function assert(cond, msg) {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    failures++;
  } else {
    console.log(`PASS: ${msg}`);
  }
}

console.log('=== 1. Testing Maze Generation & Connectivity (20 Seeds) ===');
const MazeClass = window.CarterTanks.Maze;

for (let seed = 1; seed <= 20; seed++) {
  const maze = new MazeClass({ cols: 10, rows: 7, cellSize: 80 });
  maze.generate(seed * 1337);

  // Check segments generated
  assert(maze.segments.length > 20, `Seed ${seed}: Segments populated (${maze.segments.length})`);

  // Check spawns defined
  assert(maze.spawns.p1 && maze.spawns.p2, `Seed ${seed}: P1 and P2 spawns created`);

  // Check BFS connectivity between spawns
  const path = maze.findPath(maze.spawns.p1, maze.spawns.p2);
  assert(path.length >= 8, `Seed ${seed}: BFS path length ${path.length} (>= 8 nodes, distance >= 7)`);

  // Check all 4 boundary outer walls exist
  const outer = maze.segments.filter(s => s.isOuter);
  assert(outer.length === 4, `Seed ${seed}: Exactly 4 outer wall segments`);
}

console.log('\n=== 2. Testing Tank-vs-Wall Collision & Boundary Clamping ===');
const Physics = window.CarterTanks.Physics;
const testMaze = new MazeClass({ cols: 10, rows: 7, cellSize: 80 });
testMaze.generate(42);

// Test outer boundary pushback
const outTank = { x: -50, y: -50 };
Physics.resolveTankWalls(outTank, testMaze);
assert(outTank.x >= Physics.TANK_RADIUS, `Tank pushed inside left boundary (${outTank.x} >= ${Physics.TANK_RADIUS})`);
assert(outTank.y >= Physics.TANK_RADIUS, `Tank pushed inside top boundary (${outTank.y} >= ${Physics.TANK_RADIUS})`);

// Test wall sliding: tank positioned right next to an interior wall
let slidePassed = true;
for (let i = 0; i < testMaze.segments.length; i++) {
  const seg = testMaze.segments[i];
  if (seg.isOuter) continue;

  const testX = seg.x1;
  const testY = seg.y1;
  const tank = { x: testX, y: testY };
  Physics.resolveTankWalls(tank, testMaze);

  const dx = tank.x - testX;
  const dy = tank.y - testY;
  const dist = Math.hypot(dx, dy);
  if (dist < Physics.TANK_RADIUS - 1) {
    slidePassed = false;
  }
}
assert(slidePassed, 'Tank pushed out from interior walls without clipping');

console.log('\n=== 3. Testing Bullet Ricochet & Swept Reflection (100 Random Angles/Speeds) ===');
let ricochetPassed = true;
let tunnels = 0;

for (let i = 0; i < 100; i++) {
  const angle = (i / 100) * Math.PI * 2;
  const speed = 200 + (i % 5) * 60; // 200 - 440 px/s
  const dt = 0.0166; // 60fps frame

  // Start at center of 800x560 arena
  const bullet = {
    x: 400,
    y: 280,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    bouncesLeft: 18,
    age: 0,
    hasBounced: false
  };

  // Run bullet for 360 frames (6s) or until expired
  let bounces = 0;
  for (let frame = 0; frame < 360; frame++) {
    const res = Physics.updateBullet(bullet, dt, testMaze, () => {
      bounces++;
    });

    // Check bounds: bullet should NEVER exit arena [0, 800, 0, 560]
    if (bullet.x < -10 || bullet.x > 810 || bullet.y < -10 || bullet.y > 570) {
      tunnels++;
      ricochetPassed = false;
      break;
    }

    if (res.expired) break;
  }
}
assert(ricochetPassed && tunnels === 0, `All 100 bullets reflected cleanly with 0 wall tunnels (Tunnels: ${tunnels})`);

console.log('\n=== 4. Testing Laser Aim Raycast ===');
const rayPoints = Physics.traceAimRay(400, 280, 0.5, 5, testMaze);
assert(rayPoints.length >= 2, `Aim raycast produced ${rayPoints.length} reflection points (>= 2)`);
assert(typeof rayPoints[0].x === 'number' && typeof rayPoints[0].y === 'number', 'Ray points are valid coords');

console.log('\n=== 5. Testing Bot AI Decision Logic across Difficulties ===');
const botTank = {
  id: 'p2',
  x: testMaze.spawns.p2.x,
  y: testMaze.spawns.p2.y,
  bodyAngle: testMaze.spawns.p2.angle,
  turretAngle: testMaze.spawns.p2.angle,
  alive: true
};
const enemyTank = {
  id: 'p1',
  x: testMaze.spawns.p1.x,
  y: testMaze.spawns.p1.y,
  bodyAngle: testMaze.spawns.p1.angle,
  turretAngle: testMaze.spawns.p1.angle,
  alive: true
};

const difficulties = ['easy', 'normal', 'chaos'];
difficulties.forEach(diff => {
  const ai = new window.CarterTanks.AI(diff);
  const decision = ai.update(botTank, enemyTank, testMaze, [], [], 0.016);
  assert(
    typeof decision.forward === 'number' &&
    typeof decision.rotate === 'number' &&
    typeof decision.fire === 'boolean',
    `Bot AI (${diff}) generates valid decision: forward=${decision.forward}, rotate=${decision.rotate}, fire=${decision.fire}`
  );
});

console.log('\n=== 6. Testing Point-Blank Muzzle Wall Collision Resolution ===');
// Tank pressed against left wall (x = 27), aiming left into the wall (angle = PI)
const muzzleLeft = Physics.resolveMuzzleSpawn(27, 200, Math.PI, 30, -340, 0, testMaze);
assert(muzzleLeft.bounced === true, 'Muzzle spawn detects point-blank wall collision');
assert(muzzleLeft.vx > 0, `Muzzle velocity reflected backward to right (vx = ${muzzleLeft.vx} > 0)`);
assert(muzzleLeft.x >= 5, `Muzzle bullet placed safely inside arena boundary (x = ${muzzleLeft.x})`);

// Step bullet to confirm it travels cleanly away from wall without tunneling
const testPointBlankBullet = {
  x: muzzleLeft.x,
  y: muzzleLeft.y,
  vx: muzzleLeft.vx,
  vy: muzzleLeft.vy,
  bouncesLeft: 4,
  age: 0,
  hasBounced: true
};
for (let f = 0; f < 30; f++) {
  Physics.updateBullet(testPointBlankBullet, 0.016, testMaze);
}
assert(testPointBlankBullet.x > 27, `Point-blank bullet travelled away from wall into arena (x = ${testPointBlankBullet.x.toFixed(1)})`);

// Tank pressed against top wall (y = 27), aiming straight up (angle = -PI/2)
const muzzleTop = Physics.resolveMuzzleSpawn(200, 27, -Math.PI / 2, 30, 0, -340, testMaze);
assert(muzzleTop.bounced === true, 'Muzzle spawn detects top wall point-blank collision');
assert(muzzleTop.vy > 0, `Muzzle velocity reflected downward into arena (vy = ${muzzleTop.vy} > 0)`);

console.log('\n=== 7. Testing Smart Bot Bullet Dodging & Bank-Shot Aiming ===');
// Open arena with single divider wall between (200,120) and (200,280) to test bank-shot off top wall (y=0)
const bankMaze = new MazeClass({ cols: 6, rows: 4, cellSize: 80 });
bankMaze.vWalls = Array.from({ length: 4 }, () => Array(5).fill(false));
bankMaze.hWalls = Array.from({ length: 3 }, () => Array(6).fill(false));
bankMaze.vWalls[1][1] = true; // Wall at x=160, y=80..160 blocking direct LOS between (120,120) and (200,120)
bankMaze.buildSegments();

const smartAI = new window.CarterTanks.AI('chaos');
const smartBot = { id: 'p2', x: 120, y: 120, bodyAngle: 0, turretAngle: 0, alive: true };
const smartTarget = { id: 'p1', x: 200, y: 120, bodyAngle: Math.PI, turretAngle: Math.PI, alive: true };

assert(bankMaze.hasLineOfSight(smartBot.x, smartBot.y, smartTarget.x, smartTarget.y) === false, 'Direct LOS blocked by interior wall');
const bankAngle = smartAI.findBankShot(smartBot, smartTarget, bankMaze);
assert(typeof bankAngle === 'number', `Bot found bank-shot angle around wall (${bankAngle !== null ? (bankAngle * 180 / Math.PI).toFixed(1) + '°' : 'null'})`);

// Verify the chosen bankAngle actually hits smartTarget after >= 1 bounce
const verifyRay = Physics.traceAimRay(smartBot.x, smartBot.y, bankAngle, 4, bankMaze);
let bankHitsTarget = false;
for (let k = 1; k < verifyRay.length - 1; k++) {
  const pA = verifyRay[k];
  const pB = verifyRay[k + 1];
  const l2 = (pB.x - pA.x) ** 2 + (pB.y - pA.y) ** 2;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((smartTarget.x - pA.x) * (pB.x - pA.x) + (smartTarget.y - pA.y) * (pB.y - pA.y)) / l2)) : 0;
  const dist = Math.hypot(smartTarget.x - (pA.x + t * (pB.x - pA.x)), smartTarget.y - (pA.y + t * (pB.y - pA.y)));
  if (dist < Physics.TANK_RADIUS + 4) {
    bankHitsTarget = true;
    break;
  }
}
assert(bankHitsTarget, 'Bank-shot ray accurately reflects off wall and intersects target tank');

// Bullet dodge test: threat bullet incoming vs wall-blocked bullet
const blockedBullet = { shooterId: 'p1', x: 200, y: 120, vx: -380, vy: 0, age: 0.5, hasBounced: false };
const realThreatBullet = { shooterId: 'p1', x: 120, y: 240, vx: 0, vy: -380, age: 0.5, hasBounced: false };
assert(smartAI.findThreateningBullet(smartBot, [blockedBullet], bankMaze) === null, 'Bot ignores bullet blocked behind wall');
const detectedThreat = smartAI.findThreateningBullet(smartBot, [realThreatBullet], bankMaze);
assert(detectedThreat !== null, 'Bot detects imminent unblocked incoming bullet');
const dodgeDecision = smartAI.update(smartBot, smartTarget, bankMaze, [realThreatBullet], [], 0.016);
assert(dodgeDecision.forward !== 0 || dodgeDecision.rotate !== 0, `Bot initiates active dodge movement (forward=${dodgeDecision.forward}, rotate=${dodgeDecision.rotate})`);

// Full 45-frame multi-bullet dodge survival simulation
const dodgeSimTank = { id: 'p2', x: 200, y: 200, bodyAngle: 0, turretAngle: 0, alive: true };
const dodgeSimEnemy = { id: 'p1', x: 400, y: 200, bodyAngle: Math.PI, turretAngle: Math.PI, alive: true };
const incomingVolley = [
  { shooterId: 'p1', x: 380, y: 200, vx: -380, vy: 0, age: 0.3, hasBounced: false, bouncesLeft: 10 },
  { shooterId: 'p1', x: 400, y: 200, vx: -380, vy: 0, age: 0.25, hasBounced: false, bouncesLeft: 10 }
];
const dodgeAI = new window.CarterTanks.AI('normal');
let survivedVolley = true;
for (let f = 0; f < 45; f++) {
  const dec = dodgeAI.update(dodgeSimTank, dodgeSimEnemy, bankMaze, incomingVolley, [], 0.016);
  dodgeSimTank.bodyAngle += dec.rotate * dodgeAI.config.turnRate * 0.016;
  dodgeSimTank.x += Math.cos(dodgeSimTank.bodyAngle) * dec.forward * 160 * 0.016;
  dodgeSimTank.y += Math.sin(dodgeSimTank.bodyAngle) * dec.forward * 160 * 0.016;
  Physics.resolveTankWalls(dodgeSimTank, bankMaze);
  for (let b = 0; b < incomingVolley.length; b++) {
    Physics.updateBullet(incomingVolley[b], 0.016, bankMaze);
    if (Physics.checkBulletTankHit(incomingVolley[b], dodgeSimTank)) {
      survivedVolley = false;
    }
  }
}
assert(survivedVolley, `Bot actively dodged and survived incoming 2-bullet volley (final pos: ${dodgeSimTank.x.toFixed(0)}, ${dodgeSimTank.y.toFixed(0)})`);

console.log(`\n=== Verification Result: ${failures === 0 ? 'ALL TESTS PASSED ✅' : `${failures} FAILURES ❌`} ===`);
process.exit(failures === 0 ? 0 : 1);
