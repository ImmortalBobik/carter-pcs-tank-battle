/**
 * White CarterPCs: Tank Battle - High-DPI Canvas 2D Renderer
 * All-white custom PC tanks, chibi Carter face badges, PCB floor traces,
 * hardware explosions, and floating battle quips
 */
window.CarterTanks = window.CarterTanks || {};

(function () {
  'use strict';

  function Renderer(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.dpr = window.devicePixelRatio || 1;

    this.width = 800;
    this.height = 560;

    this.treadMarks = [];
    this.particles = [];
    this.floatingQuips = [];
    this.screenShake = 0;

    // Check reduced motion preference
    this.reducedMotion = false;
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      this.reducedMotion = true;
    }

    // Load real CarterPCs & White CarterPCs portraits for tank turrets
    this.avatarImages = {
      p1: this.loadAvatarImage('assets/carter-normal.jpg'),
      p2: this.loadAvatarImage('assets/carter-white.jpg')
    };

    this.setupResolution();
    this.generatePcbTraces();
  }

  Renderer.prototype.loadAvatarImage = function (src) {
    const img = new Image();
    img.loaded = false;
    img.onload = function () {
      img.loaded = true;
    };
    img.src = src;
    return img;
  };

  Renderer.prototype.setupResolution = function () {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.dpr = dpr;

    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;

    this.ctx.resetTransform();
    this.ctx.scale(dpr, dpr);
  };

  /**
   * Pre-generates decorative PCB copper circuit traces on the arena floor
   */
  Renderer.prototype.generatePcbTraces = function () {
    this.pcbTraces = [];
    // A few circuit trace polylines traversing floor tiles
    const traces = [
      [{x: 160, y: 80}, {x: 240, y: 80}, {x: 280, y: 120}, {x: 280, y: 200}],
      [{x: 880, y: 80}, {x: 800, y: 80}, {x: 760, y: 120}, {x: 760, y: 240}],
      [{x: 160, y: 640}, {x: 240, y: 640}, {x: 280, y: 600}, {x: 280, y: 520}],
      [{x: 880, y: 640}, {x: 800, y: 640}, {x: 760, y: 600}, {x: 760, y: 480}],
      [{x: 480, y: 240}, {x: 520, y: 280}, {x: 600, y: 280}],
      [{x: 440, y: 440}, {x: 520, y: 440}, {x: 560, y: 480}],
      [{x: 360, y: 360}, {x: 400, y: 320}, {x: 640, y: 320}, {x: 680, y: 360}]
    ];
    this.pcbTraces = traces;
  };

  Renderer.prototype.addTreadMark = function (x, y, angle) {
    if (this.treadMarks.length > 140) {
      this.treadMarks.shift();
    }
    this.treadMarks.push({
      x: x,
      y: y,
      angle: angle,
      alpha: 0.35
    });
  };

  Renderer.prototype.addSpark = function (x, y, nx, ny, color) {
    if (this.reducedMotion) return;
    const count = 5 + Math.floor(Math.random() * 4);
    for (let i = 0; i < count; i++) {
      const spread = (Math.random() - 0.5) * 1.6;
      const speed = 70 + Math.random() * 140;
      const vx = (nx + spread * -ny) * speed;
      const vy = (ny + spread * nx) * speed;

      this.particles.push({
        x: x,
        y: y,
        vx: vx,
        vy: vy,
        color: color || '#fef08a',
        size: 2 + Math.random() * 2,
        life: 0.25 + Math.random() * 0.2,
        maxLife: 0.45,
        type: 'spark'
      });
    }
  };

  Renderer.prototype.addExplosion = function (x, y, color) {
    if (!this.reducedMotion) {
      this.screenShake = 10;
    }

    // Hardware fragments (fans, ram sticks, capacitors)
    const hardwareTypes = ['fan', 'ram', 'capacitor', 'chip', 'confetti'];
    const count = this.reducedMotion ? 8 : 28;

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 60 + Math.random() * 260;
      const hwType = hardwareTypes[i % hardwareTypes.length];

      this.particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        rot: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 12,
        color: color || (Math.random() > 0.5 ? '#06b6d4' : '#ffffff'),
        size: 4 + Math.random() * 5,
        life: 0.7 + Math.random() * 0.6,
        maxLife: 1.3,
        type: hwType
      });
    }
  };

  Renderer.prototype.addOilSplash = function (x, y) {
    const count = this.reducedMotion ? 6 : 18;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 40 + Math.random() * 160;
      this.particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color: '#f59e0b',
        size: 3 + Math.random() * 4,
        life: 0.4 + Math.random() * 0.3,
        maxLife: 0.7,
        type: 'oil'
      });
    }
  };

  Renderer.prototype.addFloatingQuip = function (text, x, y, color) {
    this.floatingQuips.push({
      text: text,
      x: x,
      y: y - 20,
      vy: -35,
      life: 1.8,
      maxLife: 1.8,
      color: color || '#38bdf8'
    });
  };

  /**
   * Main render method
   */
  Renderer.prototype.render = function (state, dt) {
    const ctx = this.ctx;
    ctx.save();

    // 1. Camera Shake
    if (this.screenShake > 0) {
      const shakeAmt = this.screenShake;
      const ox = (Math.random() - 0.5) * shakeAmt;
      const oy = (Math.random() - 0.5) * shakeAmt;
      ctx.translate(ox, oy);
      this.screenShake = Math.max(0, this.screenShake - dt * 25);
    }

    // 2. Anodized White PC Floor Background
    this.renderFloor(state);

    // 3. Persistent Tread Marks
    this.renderTreadMarks(dt);

    // 4. Power-ups on Floor
    this.renderPowerups(state.powerups, state.time);

    // 5. Maze Walls
    this.renderMazeWalls(state.maze);

    // 6. Laser Aim Sight (if Water-Cooled Laser active)
    this.renderLaserSights(state);

    // 7. Bullets
    this.renderBullets(state.bullets);

    // 8. Tanks (Cobalt P1 and Crimson P2/Bot)
    if (state.p1 && state.p1.alive) {
      this.renderTank(state.p1, '#0284c7', '#38bdf8', state.time);
    }
    if (state.p2 && state.p2.alive) {
      this.renderTank(state.p2, '#e11d48', '#fb7185', state.time);
    }

    // 9. Particles (Sparks & hardware debris)
    this.renderParticles(dt);

    // 10. Floating Quips
    this.renderFloatingQuips(dt);

    ctx.restore();
  };

  Renderer.prototype.renderFloor = function (state) {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    // Warm matte drafting-bench ivory surface
    ctx.fillStyle = '#faf9f5';
    ctx.fillRect(0, 0, w, h);

    // Architectural drafting registration crosshairs at every 80px cell corner
    ctx.strokeStyle = 'rgba(168, 162, 158, 0.42)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 80; x < w; x += 80) {
      for (let y = 80; y < h; y += 80) {
        ctx.moveTo(x - 4, y);
        ctx.lineTo(x + 4, y);
        ctx.moveTo(x, y - 4);
        ctx.lineTo(x, y + 4);
      }
    }
    ctx.stroke();
  };

  Renderer.prototype.renderTreadMarks = function (dt) {
    const ctx = this.ctx;
    for (let i = this.treadMarks.length - 1; i >= 0; i--) {
      const t = this.treadMarks[i];
      t.alpha -= dt * 0.025;
      if (t.alpha <= 0) {
        this.treadMarks.splice(i, 1);
        continue;
      }

      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.rotate(t.angle);
      ctx.fillStyle = `rgba(100, 116, 139, ${t.alpha})`;
      // Left tread track
      ctx.fillRect(-6, -14, 12, 4);
      // Right tread track
      ctx.fillRect(-6, 10, 12, 4);
      ctx.restore();
    }
  };

  Renderer.prototype.renderMazeWalls = function (maze) {
    if (!maze) return;
    const ctx = this.ctx;
    const th = maze.wallThickness;
    const halfTh = th / 2;

    for (let i = 0; i < maze.segments.length; i++) {
      const seg = maze.segments[i];

      let rx, ry, rw, rh;
      if (seg.dir === 'h' || seg.y1 === seg.y2) {
        rx = Math.min(seg.x1, seg.x2) - halfTh;
        ry = seg.y1 - halfTh;
        rw = Math.abs(seg.x2 - seg.x1) + th;
        rh = th;
      } else {
        rx = seg.x1 - halfTh;
        ry = Math.min(seg.y1, seg.y2) - halfTh;
        rw = th;
        rh = Math.abs(seg.y2 - seg.y1) + th;
      }

      // Crisp hard-offset architectural shadow
      ctx.fillStyle = 'rgba(24, 24, 27, 0.14)';
      ctx.fillRect(rx + 2, ry + 2.5, rw, rh);

      // Matte graphite maze wall
      ctx.fillStyle = '#18181b';
      ctx.fillRect(rx, ry, rw, rh);
    }
  };

  Renderer.prototype.renderLaserSights = function (state) {
    const tanks = [state.p1, state.p2];
    for (let i = 0; i < tanks.length; i++) {
      const tank = tanks[i];
      if (tank && tank.alive && tank.powerup === 'laser') {
        const points = window.CarterTanks.Physics.traceAimRay(
          tank.x,
          tank.y,
          tank.turretAngle,
          5,
          state.maze
        );

        if (points && points.length > 1) {
          const ctx = this.ctx;
          ctx.save();
          ctx.setLineDash([6, 6]);
          ctx.strokeStyle = tank.id === 'p1' ? 'rgba(6, 182, 212, 0.75)' : 'rgba(236, 72, 153, 0.75)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(points[0].x, points[0].y);
          for (let p = 1; p < points.length; p++) {
            ctx.lineTo(points[p].x, points[p].y);
          }
          ctx.stroke();
          ctx.restore();
        }
      }
    }
  };

  Renderer.prototype.renderBullets = function (bullets) {
    if (!bullets) return;
    const ctx = this.ctx;

    for (let i = 0; i < bullets.length; i++) {
      const b = bullets[i];
      ctx.save();
      ctx.translate(b.x, b.y);

      // Glowing bullet head (high contrast on light floor)
      const isCyan = (b.shooterId === 'p1');
      const glowColor = isCyan ? '#0891b2' : '#db2777';

      ctx.shadowColor = glowColor;
      ctx.shadowBlur = 8;
      ctx.fillStyle = glowColor;

      ctx.beginPath();
      ctx.arc(0, 0, (b.radius || 4) + 0.5, 0, Math.PI * 2);
      ctx.fill();

      // Bright inner core
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, Math.max(1.8, (b.radius || 4) * 0.45), 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
    ctx.shadowBlur = 0;
  };

  /**
   * Renders White Carter Tank with chibi Carter face badge, rolling treads, and hardware window
   */
  Renderer.prototype.renderTank = function (tank, rgbColor, rgbBright, time) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(tank.x, tank.y);

    // 1. Neon Underglow Glow
    ctx.save();
    ctx.shadowColor = rgbColor;
    ctx.shadowBlur = 16;
    ctx.fillStyle = rgbColor;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    ctx.ellipse(0, 0, 24, 22, tank.bodyAngle, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 2. Tank Body & Treads (oriented to bodyAngle)
    ctx.save();
    ctx.rotate(tank.bodyAngle);

    // Treads (Left and Right)
    ctx.fillStyle = '#1e293b'; // Black/slate rubber tread
    // Left tread
    roundRect(ctx, -20, -22, 40, 9, 3);
    ctx.fill();
    // Right tread
    roundRect(ctx, -20, 13, 40, 9, 3);
    ctx.fill();

    // Tread links (animates along tank movement)
    ctx.fillStyle = rgbColor;
    const treadOffset = (tank.treadDist || 0) % 8;
    for (let tx = -18 + treadOffset; tx < 18; tx += 8) {
      ctx.fillRect(tx, -21, 2, 7);
      ctx.fillRect(tx, 14, 2, 7);
    }

    // Glossy White PC Chassis
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.2)';
    ctx.shadowBlur = 4;
    roundRect(ctx, -18, -14, 36, 28, 5);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Bevel border (crisp slate-300 outline so white chassis pops on white studio floor)
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Rear PC Glass Window (showing mini GPU fans and RAM heatsinks)
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    roundRect(ctx, -15, -10, 11, 20, 2);
    ctx.fill();

    // Miniature twin spinning cooling fans in the window
    const fanRot = time * 12;
    drawMiniFan(ctx, -9.5, -4.5, fanRot, rgbBright);
    drawMiniFan(ctx, -9.5, 4.5, -fanRot, rgbBright);

    // RGB RAM stick next to fans
    ctx.fillStyle = rgbBright;
    ctx.fillRect(-14, -8, 2, 7);
    ctx.fillRect(-14, 1, 2, 7);

    ctx.restore(); // end bodyAngle

    // 3. Rotating Turret with Gun Barrel (oriented to turretAngle)
    ctx.save();
    ctx.rotate(tank.turretAngle);

    // Gun Barrel with recoil kick
    const recoil = tank.recoil || 0;
    ctx.fillStyle = '#e2e8f0';
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.2;
    ctx.fillRect(8 - recoil, -3.5, 22, 7);
    ctx.strokeRect(8 - recoil, -3.5, 22, 7);

    // Muzzle brake tip
    ctx.fillStyle = rgbColor;
    ctx.fillRect(28 - recoil, -4.5, 4, 9);

    // Turret Base (glossy white cylinder)
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(15, 23, 42, 0.25)';
    ctx.shadowBlur = 5;
    ctx.beginPath();
    ctx.arc(0, 0, 15, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.restore(); // end turretAngle

    // Real CarterPCs / White CarterPCs Portrait on Turret Hatch (always upright!)
    const avatarImg = this.avatarImages ? this.avatarImages[tank.id] : null;
    if (avatarImg && avatarImg.loaded && avatarImg.naturalWidth > 0) {
      this.drawPortraitHatch(ctx, avatarImg, tank.id, rgbColor);
    } else {
      drawChibiCarter(ctx, 0, 0, rgbColor);
    }

    // Crisp micro nameplate below tank so both fighters are unmistakably clear
    ctx.save();
    ctx.font = '700 9px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const tagText = tank.id === 'p1' ? 'CARTER' : 'WHITE CARTER';
    const tagW = ctx.measureText(tagText).width + 8;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
    roundRect(ctx, -tagW / 2, 23, tagW, 12, 4);
    ctx.fill();
    ctx.strokeStyle = rgbColor;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#0f172a';
    ctx.fillText(tagText, 0, 24.5);
    ctx.restore();

    // 4. Vegetable-Oil Cooling Bubble Shield (if equipped)
    if (tank.oilShield && tank.oilShield > 0) {
      ctx.save();
      const pulse = Math.sin(time * 5) * 2;
      ctx.shadowColor = '#f59e0b';
      ctx.shadowBlur = 12;
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.9)';
      ctx.lineWidth = 2.5;

      ctx.fillStyle = 'rgba(251, 191, 36, 0.2)';
      ctx.beginPath();
      ctx.arc(0, 0, 26 + pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Little floating oil droplets
      ctx.fillStyle = '#f59e0b';
      for (let i = 0; i < 3; i++) {
        const da = time * 3 + (i * Math.PI * 2) / 3;
        const ox = Math.cos(da) * (26 + pulse);
        const oy = Math.sin(da) * (26 + pulse);
        ctx.beginPath();
        ctx.arc(ox, oy, 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // 5. RGB Nitro Exhaust Flames (if equipped)
    if (tank.powerup === 'nitro') {
      ctx.save();
      ctx.rotate(tank.bodyAngle);
      const hue = (time * 360) % 360;
      ctx.fillStyle = `hsl(${hue}, 100%, 60%)`;
      ctx.shadowColor = `hsl(${hue}, 100%, 50%)`;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.moveTo(-18, -6);
      ctx.lineTo(-28 - Math.random() * 8, 0);
      ctx.lineTo(-18, 6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  };

  /**
   * Draws real CarterPCs / White CarterPCs portrait cropped into the circular tank turret hatch
   */
  Renderer.prototype.drawPortraitHatch = function (ctx, img, tankId, rgbColor) {
    const r = 13.5;
    ctx.save();

    // Crisp white backing circle
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    // Clip to circle and draw face crop
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.clip();

    const iw = img.naturalWidth;
    const ih = img.naturalHeight;

    if (tankId === 'p2') {
      // Uploaded White CarterPCs portrait (415x739): crop tightly onto his face & hair
      const cropSize = Math.min(iw * 0.60, ih * 0.36);
      const sx = iw * 0.47 - cropSize * 0.5;
      const sy = ih * 0.47 - cropSize * 0.5;
      ctx.drawImage(img, sx, sy, cropSize, cropSize, -r, -r, r * 2, r * 2);
    } else {
      // Normal CarterPCs square YouTube avatar: zoom slightly onto face
      const cropSize = Math.min(iw, ih) * 0.86;
      const sx = (iw - cropSize) * 0.5;
      const sy = (ih - cropSize) * 0.42;
      ctx.drawImage(img, sx, sy, cropSize, cropSize, -r, -r, r * 2, r * 2);
    }

    ctx.restore();

    // Team-colored RGB border ring around portrait
    ctx.save();
    ctx.strokeStyle = rgbColor;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  };

  /**
   * Draws distinct floating PC-part power-up crates on the floor
   */
  Renderer.prototype.renderPowerups = function (powerups, time) {
    if (!powerups) return;
    const ctx = this.ctx;

    for (let i = 0; i < powerups.length; i++) {
      const p = powerups[i];
      if (p.collected) continue;

      ctx.save();
      const bob = Math.sin(time * 4 + p.seed) * 3;
      ctx.translate(p.x, p.y + bob);

      // Pulsing floor halo ring
      const ringPulse = 16 + Math.sin(time * 3 + p.seed) * 3;
      ctx.strokeStyle = p.color || '#06b6d4';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, -bob, ringPulse, 0, Math.PI * 2);
      ctx.stroke();

      // Power-up crate chassis (snow white)
      ctx.shadowColor = p.color || '#06b6d4';
      ctx.shadowBlur = 12;
      ctx.fillStyle = '#ffffff';
      roundRect(ctx, -14, -14, 28, 28, 6);
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.strokeStyle = p.color || '#06b6d4';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Icon graphic inside
      if (p.type === 'burst') {
        // RTX GPU icon with mini RGB fan
        ctx.fillStyle = '#10b981';
        roundRect(ctx, -9, -6, 18, 12, 2);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(0, 0, 3, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.type === 'shield') {
        // Veg-oil cooling droplet
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.arc(0, 2, 6, 0, Math.PI * 2);
        ctx.moveTo(0, -7);
        ctx.lineTo(-6, 2);
        ctx.lineTo(6, 2);
        ctx.closePath();
        ctx.fill();
      } else if (p.type === 'laser') {
        // Water cooler laser reticle
        ctx.strokeStyle = '#06b6d4';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, 7, 0, Math.PI * 2);
        ctx.moveTo(-9, 0); ctx.lineTo(9, 0);
        ctx.moveTo(0, -9); ctx.lineTo(0, 9);
        ctx.stroke();
      } else if (p.type === 'nitro') {
        // Rainbow Nitro RAM stick
        const grad = ctx.createLinearGradient(-8, 0, 8, 0);
        grad.addColorStop(0, '#ec4899');
        grad.addColorStop(0.5, '#06b6d4');
        grad.addColorStop(1, '#eab308');
        ctx.fillStyle = grad;
        roundRect(ctx, -9, -5, 18, 10, 2);
        ctx.fill();
      }

      // Small label banner
      ctx.font = 'bold 9px monospace';
      ctx.fillStyle = '#0f172a';
      ctx.textAlign = 'center';
      ctx.fillText(p.label, 0, 21);

      ctx.restore();
    }
  };

  Renderer.prototype.renderParticles = function (dt) {
    const ctx = this.ctx;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot = (p.rot || 0) + (p.vRot || 0) * dt;

      // Friction
      p.vx *= 0.96;
      p.vy *= 0.96;

      const alpha = Math.max(0, p.life / p.maxLife);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot || 0);
      ctx.globalAlpha = alpha;

      if (p.type === 'fan') {
        // Micro GPU fan blade
        ctx.fillStyle = '#cbd5e1';
        ctx.beginPath();
        ctx.arc(0, 0, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#0f172a';
        ctx.stroke();
      } else if (p.type === 'ram') {
        // Flying white RAM heatsink
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(-p.size, -p.size * 0.4, p.size * 2, p.size * 0.8);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size, -p.size * 0.4, p.size * 2, 2);
      } else if (p.type === 'oil') {
        // Golden oil splash droplet
        ctx.fillStyle = '#f59e0b';
        ctx.beginPath();
        ctx.arc(0, 0, p.size * alpha, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Spark / confetti
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size * 0.5, -p.size * 0.5, p.size, p.size);
      }

      ctx.restore();
    }
  };

  Renderer.prototype.renderFloatingQuips = function (dt) {
    const ctx = this.ctx;
    for (let i = this.floatingQuips.length - 1; i >= 0; i--) {
      const q = this.floatingQuips[i];
      q.life -= dt;
      if (q.life <= 0) {
        this.floatingQuips.splice(i, 1);
        continue;
      }

      q.y += q.vy * dt;
      const alpha = Math.max(0, q.life / q.maxLife);

      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = '900 13px system-ui, sans-serif';
      ctx.textAlign = 'center';

      // Drop shadow for legibility
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillText(q.text, q.x + 1, q.y + 1);

      ctx.fillStyle = q.color;
      ctx.fillText(q.text, q.x, q.y);
      ctx.restore();
    }
  };

  /**
   * Helper: Miniature spinning PC fan
   */
  function drawMiniFan(ctx, cx, cy, rot, color) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
    ctx.fill();
    // 3 blades
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = '#ffffff';
    for (let b = 0; b < 3; b++) {
      ctx.rotate((Math.PI * 2) / 3);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(3.2, 1);
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * Helper: Cute Chibi CarterPCs Face on the Turret Hatch
   * Swept brown hair, cheerful cartoon smile/eyes, and RGB gamer headset
   */
  function drawChibiCarter(ctx, cx, cy, rgbColor) {
    ctx.save();
    ctx.translate(cx, cy);

    // Peach skin face
    ctx.fillStyle = '#fed7aa';
    ctx.beginPath();
    ctx.arc(0, 0, 9, 0, Math.PI * 2);
    ctx.fill();

    // Stylized swept brown hair
    ctx.fillStyle = '#78350f';
    ctx.beginPath();
    ctx.arc(0, -3, 8.5, Math.PI * 0.9, Math.PI * 2.1);
    ctx.fill();
    // Front fringe swoosh
    ctx.beginPath();
    ctx.moveTo(-6, -4);
    ctx.quadraticCurveTo(0, -2, 5, -5);
    ctx.lineTo(2, -8);
    ctx.closePath();
    ctx.fill();

    // Cheerful dark eyes
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(-2.5, 1, 1.2, 0, Math.PI * 2);
    ctx.arc(2.5, 1, 1.2, 0, Math.PI * 2);
    ctx.fill();

    // Catchlight white gleam in eyes
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(-2.8, 0.7, 0.5, 0, Math.PI * 2);
    ctx.arc(2.2, 0.7, 0.5, 0, Math.PI * 2);
    ctx.fill();

    // Friendly grin
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(0, 2.5, 2.5, 0.2, Math.PI - 0.2);
    ctx.stroke();

    // RGB Gamer Headset (Earcups + Boom Mic)
    ctx.fillStyle = rgbColor;
    // Left earcup
    roundRect(ctx, -10.5, -2, 2.5, 5, 1);
    ctx.fill();
    // Right earcup
    roundRect(ctx, 8, -2, 2.5, 5, 1);
    ctx.fill();

    // Headband over top
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(0, -2, 9, Math.PI * 1.05, Math.PI * 1.95);
    ctx.stroke();

    // Little microphone boom on the right
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(8.5, 2);
    ctx.lineTo(4, 5.5);
    ctx.stroke();
    ctx.fillStyle = rgbColor;
    ctx.beginPath();
    ctx.arc(4, 5.5, 1, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  window.CarterTanks.Renderer = Renderer;
})();
