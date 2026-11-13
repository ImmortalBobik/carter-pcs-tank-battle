/**
 * White CarterPCs: Tank Battle - Main Game Controller
 * Game loop, input handling, power-ups, scoring, round flow & dialog management
 */
window.CarterTanks = window.CarterTanks || {};

(function () {
  'use strict';

  const TARGET_SCORE = 5;

  const QUIPS = [
    'No snooze fest!',
    'All-white build diff!',
    'Veg oil cooled!',
    '4090 diff!',
    'Bank shot!',
    'Clean cable management!',
    'Thermal paste applied!',
    'Peak RGB!',
    'Submerged PC tank!',
    'Cable combs aligned!'
  ];

  function Game() {
    this.canvas = document.getElementById('game-canvas');
    this.renderer = new window.CarterTanks.Renderer(this.canvas);
    this.maze = new window.CarterTanks.Maze({ cols: 10, rows: 7, cellSize: 80, wallThickness: 10 });
    this.audio = window.CarterTanks.Audio;

    this.mode = '1p'; // '1p' or '2p'
    this.difficulty = 'normal'; // 'easy', 'normal', 'chaos'
    this.botAI = new window.CarterTanks.AI(this.difficulty);

    this.state = 'MENU'; // 'MENU', 'PLAYING', 'ROUND_OVER', 'GAME_OVER', 'PAUSED'
    this.p1Score = 0;
    this.p2Score = 0;
    this.roundNumber = 1;
    this.roundOverTimer = 0;
    this.bannerTimer = 0;
    this.roundWinner = null;
    this.totalBouncesThisMatch = 0;
    this.totalBankKills = 0;

    this.bullets = [];
    this.powerups = [];
    this.powerupTimer = 6.0; // Spawns first powerup after 6s
    this.gameTime = 0;

    this.keys = {};
    this.touchInput = { up: false, down: false, left: false, right: false, fire: false };

    this.p1 = null;
    this.p2 = null;

    this.lastTimestamp = 0;

    this.initDOM();
    this.initInputs();
    this.initDialogs();
    this.resetMatch();
  }

  Game.prototype.initDOM = function () {
    this.dom = {
      p1Score: document.getElementById('p1-score'),
      p2Score: document.getElementById('p2-score'),
      p1Powerup: document.getElementById('p1-powerup'),
      p2Powerup: document.getElementById('p2-powerup'),
      p2NameLabel: document.getElementById('p2-name-label'),
      roundIndicator: document.getElementById('round-indicator'),
      roundBanner: document.getElementById('round-banner'),
      startOverlay: document.getElementById('start-overlay'),
      btnStartBattle: document.getElementById('btn-start-battle'),
      optMode1p: document.getElementById('opt-mode-1p'),
      optMode2p: document.getElementById('opt-mode-2p'),
      selectMode: document.getElementById('select-mode'),
      selectDiff: document.getElementById('select-diff'),
      btnMute: document.getElementById('btn-mute'),
      muteIcon: document.getElementById('mute-icon'),
      btnTouchToggle: document.getElementById('btn-touch-toggle'),
      touchControls: document.getElementById('touch-controls'),
      btnHelp: document.getElementById('btn-help'),
      btnRestart: document.getElementById('btn-restart'),
      helpDialog: document.getElementById('help-dialog'),
      gameoverDialog: document.getElementById('gameover-dialog'),
      gameoverWinner: document.getElementById('gameover-winner-text'),
      gameoverQuip: document.getElementById('gameover-quip-text'),
      statFinalScore: document.getElementById('stat-final-score'),
      statTotalRounds: document.getElementById('stat-total-rounds'),
      statBounceKills: document.getElementById('stat-bounce-kills'),
      hudP1Card: document.getElementById('hud-p1-card'),
      hudP2Card: document.getElementById('hud-p2-card'),
      p1Pips: document.querySelectorAll('#p1-pips .pip'),
      p2Pips: document.querySelectorAll('#p2-pips .pip')
    };

    // Update initial mute icon
    this.updateMuteUI();
  };

  Game.prototype.updateMuteUI = function () {
    if (this.dom.muteIcon) {
      this.dom.muteIcon.textContent = this.audio.isMuted() ? 'MUTE' : 'ON';
    }
  };

  Game.prototype.initInputs = function () {
    const self = this;

    window.addEventListener('keydown', function (e) {
      // Do not handle gameplay keys when modal dialog is open
      if ((self.dom.helpDialog && self.dom.helpDialog.open) || (self.dom.gameoverDialog && self.dom.gameoverDialog.open)) {
        return;
      }

      // Prevent scrolling or unintended button activation during gameplay
      const targetTag = e.target ? e.target.tagName : '';
      const isGameControlKey = (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'ArrowDown' || e.code === 'ArrowLeft' || e.code === 'ArrowRight');
      if (self.state === 'PLAYING' && isGameControlKey && targetTag !== 'SELECT' && targetTag !== 'INPUT') {
        e.preventDefault();
      }

      self.keys[e.code] = true;

      // Handle Pause
      if (e.code === 'KeyP' || e.code === 'Escape') {
        if (self.state === 'PLAYING') {
          self.state = 'PAUSED';
          if (self.dom.roundBanner) {
            self.dom.roundBanner.textContent = '⏸️ MATCH PAUSED (Press P or Esc to resume)';
            self.dom.roundBanner.className = 'round-banner visible';
          }
        } else if (self.state === 'PAUSED') {
          self.state = 'PLAYING';
          if (self.dom.roundBanner) {
            self.dom.roundBanner.className = 'round-banner';
          }
        }
        return;
      }

      // Handle Quick Restart
      if (e.code === 'KeyR' && (self.state === 'PLAYING' || self.state === 'ROUND_OVER')) {
        self.resetMatch();
        self.startRound();
        return;
      }

      // Space or Enter advances round immediately during ROUND_OVER
      if ((e.code === 'Space' || e.code === 'Enter') && self.state === 'ROUND_OVER') {
        self.roundOverTimer = 0;
      }
    });

    window.addEventListener('keyup', function (e) {
      self.keys[e.code] = false;
    });

    // Start Overlay selection
    this.dom.optMode1p.addEventListener('click', function () {
      self.setMode('1p');
    });
    this.dom.optMode2p.addEventListener('click', function () {
      self.setMode('2p');
    });

    this.dom.btnStartBattle.addEventListener('click', function () {
      self.audio.playButton();
      self.dom.startOverlay.classList.add('hidden');
      self.startMatch();
    });

    // Top Header Selectors
    this.dom.selectMode.addEventListener('change', function (e) {
      self.setMode(e.target.value);
      self.resetMatch();
      self.startRound();
    });

    this.dom.selectDiff.addEventListener('change', function (e) {
      self.setDifficulty(e.target.value);
    });

    this.dom.btnMute.addEventListener('click', function () {
      self.audio.toggleMute();
      self.updateMuteUI();
    });

    this.dom.btnTouchToggle.addEventListener('click', function () {
      self.audio.playButton();
      self.dom.touchControls.classList.toggle('active');
    });

    this.dom.btnHelp.addEventListener('click', function () {
      self.audio.playButton();
      if (typeof self.dom.helpDialog.showModal === 'function') {
        self.dom.helpDialog.showModal();
      }
    });

    this.dom.btnRestart.addEventListener('click', function () {
      self.audio.playButton();
      self.resetMatch();
      self.startRound();
    });

    // Touch controls bindings
    const bindTouch = (id, key) => {
      const el = document.getElementById(id);
      if (!el) return;
      const start = (e) => { e.preventDefault(); self.touchInput[key] = true; };
      const end = (e) => { e.preventDefault(); self.touchInput[key] = false; };
      el.addEventListener('touchstart', start, { passive: false });
      el.addEventListener('touchend', end, { passive: false });
      el.addEventListener('mousedown', start);
      el.addEventListener('mouseup', end);
      el.addEventListener('mouseleave', end);
    };

    bindTouch('tbtn-up', 'up');
    bindTouch('tbtn-down', 'down');
    bindTouch('tbtn-left', 'left');
    bindTouch('tbtn-right', 'right');
    bindTouch('tbtn-fire', 'fire');

    // Auto-show touch controls on touch-capable devices
    if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
      this.dom.touchControls.classList.add('active');
    }

    // Window resize handler for canvas crispness
    window.addEventListener('resize', function () {
      self.renderer.setupResolution();
    });
  };

  Game.prototype.initDialogs = function () {
    const helpDialog = this.dom.helpDialog;
    const gameoverDialog = this.dom.gameoverDialog;

    // Reset returnValue on close
    helpDialog.addEventListener('close', function () {
      helpDialog.returnValue = '';
    });
    gameoverDialog.addEventListener('close', function () {
      gameoverDialog.returnValue = '';
    });

    // Outside-click light dismiss fallback for browsers without native 'closedby'
    const setupLightDismiss = (dialog) => {
      let clickedInside = false;
      dialog.addEventListener('pointerdown', (e) => {
        const rect = dialog.getBoundingClientRect();
        clickedInside = (
          e.clientX >= rect.left && e.clientX <= rect.right &&
          e.clientY >= rect.top && e.clientY <= rect.bottom
        );
      });
      dialog.addEventListener('pointerup', (e) => {
        if (!clickedInside && dialog.open) {
          const rect = dialog.getBoundingClientRect();
          const isOutside = (
            e.clientX < rect.left || e.clientX > rect.right ||
            e.clientY < rect.top || e.clientY > rect.bottom
          );
          if (isOutside) {
            dialog.close();
          }
        }
        clickedInside = false;
      });
    };

    if (!('closedBy' in HTMLDialogElement.prototype)) {
      setupLightDismiss(helpDialog);
      setupLightDismiss(gameoverDialog);
    }

    const self = this;
    const playAgainBtn = document.getElementById('btn-gameover-playagain');
    if (playAgainBtn) {
      playAgainBtn.addEventListener('click', function () {
        self.audio.playButton();
        self.resetMatch();
        self.startRound();
      });
    }
  };

  Game.prototype.setMode = function (mode) {
    this.mode = mode;
    this.dom.selectMode.value = mode;

    if (mode === '1p') {
      this.dom.optMode1p.classList.add('selected');
      this.dom.optMode2p.classList.remove('selected');
      this.dom.p2NameLabel.textContent = 'WHITE BOT';
      this.dom.selectDiff.hidden = false;
    } else {
      this.dom.optMode2p.classList.add('selected');
      this.dom.optMode1p.classList.remove('selected');
      this.dom.p2NameLabel.textContent = 'WHITE CARTER';
      this.dom.selectDiff.hidden = true;
    }
  };

  Game.prototype.setDifficulty = function (diff) {
    this.difficulty = diff;
    this.dom.selectDiff.value = diff;
    this.botAI.setDifficulty(diff);
  };

  Game.prototype.resetMatch = function () {
    this.p1Score = 0;
    this.p2Score = 0;
    this.roundNumber = 1;
    this.totalBouncesThisMatch = 0;
    this.totalBankKills = 0;
    this.updateHUD();
    this.setupRound();
  };

  Game.prototype.startMatch = function () {
    this.resetMatch();
    this.state = 'PLAYING';
    this.startRound();
  };

  Game.prototype.setupRound = function () {
    this.maze.generate();
    this.bullets = [];
    this.powerups = [];
    this.powerupTimer = 5.0;

    const s = this.maze.spawns;

    this.p1 = {
      id: 'p1',
      name: 'CarterPCs',
      x: s.p1.x,
      y: s.p1.y,
      bodyAngle: s.p1.angle,
      turretAngle: s.p1.angle,
      speed: 0,
      treadDist: 0,
      recoil: 0,
      alive: true,
      fireCooldown: 0,
      maxBullets: 24,
      activeBullets: 0,
      oilShield: 0,
      invulnerableTimer: 0,
      powerup: null,
      powerupTimer: 0,
      burstShotsLeft: 0
    };

    this.p2 = {
      id: 'p2',
      name: this.mode === '1p' ? 'White Carter Bot' : 'White CarterPCs',
      x: s.p2.x,
      y: s.p2.y,
      bodyAngle: s.p2.angle,
      turretAngle: s.p2.angle,
      speed: 0,
      treadDist: 0,
      recoil: 0,
      alive: true,
      fireCooldown: 0,
      maxBullets: 24,
      activeBullets: 0,
      oilShield: 0,
      invulnerableTimer: 0,
      powerup: null,
      powerupTimer: 0,
      burstShotsLeft: 0
    };

    this.updateHUD();
  };

  Game.prototype.startRound = function (keepBanner) {
    this.setupRound();
    this.state = 'PLAYING';
    if (!keepBanner && this.dom.roundBanner) {
      this.dom.roundBanner.className = 'round-banner';
      this.bannerTimer = 0;
    }
  };

  Game.prototype.updateHUD = function () {
    if (this.dom.p1Score) this.dom.p1Score.textContent = this.p1Score;
    if (this.dom.p2Score) this.dom.p2Score.textContent = this.p2Score;

    if (this.dom.p1Pips) {
      for (let i = 0; i < this.dom.p1Pips.length; i++) {
        this.dom.p1Pips[i].classList.toggle('lit', i < this.p1Score);
      }
    }
    if (this.dom.p2Pips) {
      for (let i = 0; i < this.dom.p2Pips.length; i++) {
        this.dom.p2Pips[i].classList.toggle('lit', i < this.p2Score);
      }
    }

    if (this.dom.roundIndicator) {
      this.dom.roundIndicator.textContent = `R${String(this.roundNumber).padStart(2, '0')} · FT${TARGET_SCORE}`;
    }

    // Powerup badges (only shown when an active power-up is held)
    const getBadge = (tank) => {
      if (!tank) return { text: 'STD', active: false };
      if (tank.oilShield > 0) return { text: 'SHIELD', active: true };
      if (tank.powerup === 'burst') return { text: `BURST ×${tank.burstShotsLeft || 3}`, active: true };
      if (tank.powerup === 'laser') return { text: 'LASER', active: true };
      if (tank.powerup === 'nitro') return { text: 'NITRO', active: true };
      return { text: 'STD', active: false };
    };

    const b1 = getBadge(this.p1);
    const b2 = getBadge(this.p2);

    if (this.dom.p1Powerup) {
      this.dom.p1Powerup.textContent = b1.text;
      this.dom.p1Powerup.hidden = !b1.active;
      this.dom.p1Powerup.className = b1.active ? 'powerup-tag active' : 'powerup-tag';
    }

    if (this.dom.p2Powerup) {
      this.dom.p2Powerup.textContent = b2.text;
      this.dom.p2Powerup.hidden = !b2.active;
      this.dom.p2Powerup.className = b2.active ? 'powerup-tag active' : 'powerup-tag';
    }
  };

  /**
   * Main game tick
   */
  Game.prototype.tick = function (timestamp) {
    if (!this.lastTimestamp) this.lastTimestamp = timestamp;
    const rawDt = (timestamp - this.lastTimestamp) / 1000;
    this.lastTimestamp = timestamp;

    // Clamped dt to prevent physics tunneling during tab switches
    const dt = Math.min(rawDt, 0.05);

    this.gameTime += dt;

    if (this.state === 'PLAYING') {
      this.update(dt);
    } else if (this.state === 'ROUND_OVER') {
      this.updateRoundOver(dt);
    }

    // Always render (enables live animations on background canvas during menu/pause)
    this.renderer.render({
      maze: this.maze,
      p1: this.p1,
      p2: this.p2,
      bullets: this.bullets,
      powerups: this.powerups,
      time: this.gameTime
    }, dt);

    requestAnimationFrame(this.tick.bind(this));
  };

  Game.prototype.update = function (dt) {
    // 1. Process Tank Controls & Movement
    this.updateP1Input(dt);
    this.updateP2Input(dt);

    // 2. Physics Tank-Wall & Tank-Tank Separation
    window.CarterTanks.Physics.resolveTankWalls(this.p1, this.maze);
    window.CarterTanks.Physics.resolveTankWalls(this.p2, this.maze);
    window.CarterTanks.Physics.resolveTankTank(this.p1, this.p2);

    // 3. Update Active Bullets & Wall Bounces
    this.updateBullets(dt);

    // 4. Update Power-ups
    this.updatePowerups(dt);

    // 5. Check Bullet-Tank Collisions
    this.checkHits();

    // 6. Update Timers & Badges
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0 && this.dom.roundBanner) {
        this.dom.roundBanner.className = 'round-banner';
      }
    }
    this.updateHUD();
  };

  Game.prototype.updateP1Input = function (dt) {
    const p1 = this.p1;
    if (!p1.alive) return;

    p1.fireCooldown = Math.max(0, p1.fireCooldown - dt);
    p1.invulnerableTimer = Math.max(0, p1.invulnerableTimer - dt);
    p1.recoil = Math.max(0, p1.recoil - dt * 28);

    if (p1.powerupTimer > 0) {
      p1.powerupTimer -= dt;
      if (p1.powerupTimer <= 0) {
        p1.powerup = null;
      }
    }

    // Input checks (WASD + Touch + In 1P Mode Arrows can also control P1)
    let moveFwd = 0;
    let turn = 0;
    let fire = false;

    if (this.keys['KeyW']) moveFwd += 1;
    if (this.keys['KeyS']) moveFwd -= 1;
    if (this.keys['KeyA']) turn -= 1;
    if (this.keys['KeyD']) turn += 1;
    if (this.keys['Space'] || this.keys['KeyF']) fire = true;

    // In 1P Mode, Arrow keys & Enter also seamlessly control P1!
    if (this.mode === '1p') {
      if (this.keys['ArrowUp']) moveFwd += 1;
      if (this.keys['ArrowDown']) moveFwd -= 1;
      if (this.keys['ArrowLeft']) turn -= 1;
      if (this.keys['ArrowRight']) turn += 1;
      if (this.keys['Enter']) fire = true;
    }

    // Touch inputs
    if (this.touchInput.up) moveFwd += 1;
    if (this.touchInput.down) moveFwd -= 1;
    if (this.touchInput.left) turn -= 1;
    if (this.touchInput.right) turn += 1;
    if (this.touchInput.fire) fire = true;

    // Movement rates
    const turnRate = 3.4;
    const baseSpeed = p1.powerup === 'nitro' ? 280 : 160;

    if (turn !== 0) {
      p1.bodyAngle += turn * turnRate * dt;
      p1.turretAngle = p1.bodyAngle;
    }

    if (moveFwd !== 0) {
      const speed = moveFwd * baseSpeed;
      p1.x += Math.cos(p1.bodyAngle) * speed * dt;
      p1.y += Math.sin(p1.bodyAngle) * speed * dt;
      p1.treadDist += Math.abs(speed * dt);

      // Periodically leave tread marks
      if (Math.random() < 0.25) {
        this.renderer.addTreadMark(p1.x, p1.y, p1.bodyAngle);
      }
    }

    if (fire && p1.fireCooldown <= 0) {
      this.fireBullet(p1);
    }
  };

  Game.prototype.updateP2Input = function (dt) {
    const p2 = this.p2;
    if (!p2.alive) return;

    p2.fireCooldown = Math.max(0, p2.fireCooldown - dt);
    p2.invulnerableTimer = Math.max(0, p2.invulnerableTimer - dt);
    p2.recoil = Math.max(0, p2.recoil - dt * 28);

    if (p2.powerupTimer > 0) {
      p2.powerupTimer -= dt;
      if (p2.powerupTimer <= 0) {
        p2.powerup = null;
      }
    }

    let moveFwd = 0;
    let turn = 0;
    let fire = false;

    if (this.mode === '1p') {
      // White Carter Bot AI Control
      const decision = this.botAI.update(p2, this.p1, this.maze, this.bullets, this.powerups, dt);
      moveFwd = decision.forward;
      turn = decision.rotate;
      fire = decision.fire;
      if (typeof decision.aimAngle === 'number') {
        // Smoothly rotate turret toward target angle
        let diff = decision.aimAngle - p2.turretAngle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const turretSpeed = (this.botAI && this.botAI.config && this.botAI.config.turretSpeed) || 6.5;
        const maxStep = turretSpeed * dt;
        if (Math.abs(diff) <= maxStep) {
          p2.turretAngle = decision.aimAngle;
        } else {
          p2.turretAngle += Math.sign(diff) * maxStep;
        }
      }
    } else {
      // Player 2 Local Keyboard Duel (Arrow Keys + Enter / Slash / M)
      if (this.keys['ArrowUp']) moveFwd += 1;
      if (this.keys['ArrowDown']) moveFwd -= 1;
      if (this.keys['ArrowLeft']) turn -= 1;
      if (this.keys['ArrowRight']) turn += 1;
      if (this.keys['Enter'] || this.keys['Slash'] || this.keys['KeyM']) fire = true;

      p2.turretAngle = p2.bodyAngle;
    }

    const turnRate = (this.mode === '1p' && this.botAI && this.botAI.config) ? this.botAI.config.turnRate : 3.4;
    const baseSpeed = p2.powerup === 'nitro' ? 280 : 160;

    if (turn !== 0) {
      p2.bodyAngle += turn * turnRate * dt;
      if (this.mode === '2p') {
        p2.turretAngle = p2.bodyAngle;
      }
    }

    if (moveFwd !== 0) {
      const speed = moveFwd * baseSpeed;
      p2.x += Math.cos(p2.bodyAngle) * speed * dt;
      p2.y += Math.sin(p2.bodyAngle) * speed * dt;
      p2.treadDist += Math.abs(speed * dt);

      if (Math.random() < 0.25) {
        this.renderer.addTreadMark(p2.x, p2.y, p2.bodyAngle);
      }
    }

    if (fire && p2.fireCooldown <= 0) {
      this.fireBullet(p2);
    }
  };

  Game.prototype.fireBullet = function (tank) {
    // Check max active bullets
    let active = 0;
    for (let i = 0; i < this.bullets.length; i++) {
      if (this.bullets[i].shooterId === tank.id) active++;
    }
    if (active >= tank.maxBullets) return;

    tank.recoil = 6.0;

    const isLaser = (tank.powerup === 'laser');
    const isBurst = (tank.powerup === 'burst');

    const baseSpeed = isLaser ? 520 : 380;
    const baseAngle = tank.turretAngle;

    const spawnBullet = (ang) => {
      const barrelLen = 30;
      const initialVx = Math.cos(ang) * baseSpeed;
      const initialVy = Math.sin(ang) * baseSpeed;

      const muzzle = window.CarterTanks.Physics.resolveMuzzleSpawn(
        tank.x,
        tank.y,
        ang,
        barrelLen,
        initialVx,
        initialVy,
        this.maze
      );

      this.bullets.push({
        id: Math.random().toString(36).substr(2, 9),
        shooterId: tank.id,
        x: muzzle.x,
        y: muzzle.y,
        vx: muzzle.vx,
        vy: muzzle.vy,
        bouncesLeft: muzzle.bounced ? 17 : 18,
        bouncesDone: muzzle.bounced ? 1 : 0,
        age: 0,
        hasBounced: muzzle.bounced,
        radius: isLaser ? 5 : 4
      });

      if (muzzle.bounced) {
        this.audio.playBounce();
        this.renderer.addSpark(muzzle.hitPoint.x, muzzle.hitPoint.y, muzzle.hitNormal.x, muzzle.hitNormal.y, tank.id === 'p1' ? '#22d3ee' : '#f472b6');
        this.totalBouncesThisMatch++;
      }
    };

    if (isBurst) {
      // 3-way spread burst
      spawnBullet(baseAngle - 0.22);
      spawnBullet(baseAngle);
      spawnBullet(baseAngle + 0.22);

      tank.burstShotsLeft = (tank.burstShotsLeft || 3) - 1;
      if (tank.burstShotsLeft <= 0) {
        tank.powerup = null;
      }
      tank.fireCooldown = 0.14;
    } else {
      spawnBullet(baseAngle);
      tank.fireCooldown = isLaser ? 0.04 : 0.05;
    }

    this.audio.playShoot(isLaser);
  };

  Game.prototype.updateBullets = function (dt) {
    const self = this;
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];

      const res = window.CarterTanks.Physics.updateBullet(b, dt, this.maze, function (x, y, nx, ny) {
        self.audio.playBounce();
        self.renderer.addSpark(x, y, nx, ny, b.shooterId === 'p1' ? '#22d3ee' : '#f472b6');
        self.totalBouncesThisMatch++;
        b.bouncesDone = (b.bouncesDone || 0) + 1;
      });

      if (res.expired) {
        this.bullets.splice(i, 1);
      }
    }
  };

  Game.prototype.updatePowerups = function (dt) {
    this.powerupTimer -= dt;

    // Spawn power-up every ~8-12 seconds if fewer than 2 on field
    if (this.powerupTimer <= 0) {
      this.powerupTimer = 8.0 + Math.random() * 4.0;

      let activeCount = 0;
      for (let i = 0; i < this.powerups.length; i++) {
        if (!this.powerups[i].collected) activeCount++;
      }

      if (activeCount < 2) {
        const types = [
          { type: 'burst', label: 'RTX Burst', color: '#10b981' },
          { type: 'shield', label: 'Veg-Oil Shield', color: '#f59e0b' },
          { type: 'laser', label: 'Laser Sight', color: '#06b6d4' },
          { type: 'nitro', label: 'RGB Nitro', color: '#ec4899' }
        ];
        const pick = types[Math.floor(Math.random() * types.length)];
        const cell = this.maze.getRandomOpenCell([
          this.maze.getCellAt(this.p1.x, this.p1.y),
          this.maze.getCellAt(this.p2.x, this.p2.y)
        ]);

        const px = (cell.col + 0.5) * this.maze.cellSize;
        const py = (cell.row + 0.5) * this.maze.cellSize;

        this.powerups.push({
          x: px,
          y: py,
          type: pick.type,
          label: pick.label,
          color: pick.color,
          seed: Math.random() * 10,
          collected: false
        });
      }
    }

    // Powerup pickup collision against tanks
    const tanks = [this.p1, this.p2];
    for (let pIdx = 0; pIdx < this.powerups.length; pIdx++) {
      const pow = this.powerups[pIdx];
      if (pow.collected) continue;

      for (let tIdx = 0; tIdx < tanks.length; tIdx++) {
        const tank = tanks[tIdx];
        if (!tank || !tank.alive) continue;

        const dist = Math.hypot(tank.x - pow.x, tank.y - pow.y);
        if (dist < 32) {
          pow.collected = true;
          this.audio.playPickup();

          if (pow.type === 'shield') {
            tank.oilShield = 1;
            this.renderer.addFloatingQuip('Veg-Oil Shield Equipped!', tank.x, tank.y, '#f59e0b');
          } else if (pow.type === 'burst') {
            tank.powerup = 'burst';
            tank.burstShotsLeft = 3;
            tank.powerupTimer = 12.0;
            this.renderer.addFloatingQuip('RTX Burst Online!', tank.x, tank.y, '#10b981');
          } else if (pow.type === 'laser') {
            tank.powerup = 'laser';
            tank.powerupTimer = 14.0;
            this.renderer.addFloatingQuip('Water-Cooled Laser Active!', tank.x, tank.y, '#06b6d4');
          } else if (pow.type === 'nitro') {
            tank.powerup = 'nitro';
            tank.powerupTimer = 8.0;
            this.renderer.addFloatingQuip('RGB Nitro Overclocked!', tank.x, tank.y, '#ec4899');
          }

          break;
        }
      }
    }

    // Remove collected powerups
    this.powerups = this.powerups.filter(p => !p.collected);
  };

  Game.prototype.checkHits = function () {
    const tanks = [this.p1, this.p2];

    for (let bIdx = this.bullets.length - 1; bIdx >= 0; bIdx--) {
      const bullet = this.bullets[bIdx];

      for (let tIdx = 0; tIdx < tanks.length; tIdx++) {
        const tank = tanks[tIdx];
        const res = window.CarterTanks.Physics.checkBulletTankHit(bullet, tank);

        if (res && res.hit) {
          this.bullets.splice(bIdx, 1);

          if (res.shielded) {
            // Vegetable Oil Shield absorbed the lethal round!
            this.audio.playShieldPop();
            this.renderer.addOilSplash(tank.x, tank.y);
            this.renderer.addFloatingQuip('Shield Absorbed Hit! 🛡️', tank.x, tank.y, '#f59e0b');
            break; // Continue processing remaining bullets
          } else {
            // Tank Destroyed!
            tank.alive = false;
            this.audio.playHit();
            this.renderer.addExplosion(tank.x, tank.y, tank.id === 'p1' ? '#06b6d4' : '#ec4899');

            // Determine round winner
            const winner = (tank.id === 'p1') ? this.p2 : this.p1;
            const isBankKill = (bullet.bouncesDone > 0);
            if (isBankKill) this.totalBankKills++;

            const quip = isBankKill ? 'Bank Shot Diff! 🎯' : QUIPS[Math.floor(Math.random() * QUIPS.length)];
            this.renderer.addFloatingQuip(quip, tank.x, tank.y, winner.id === 'p1' ? '#22d3ee' : '#f472b6');

            this.onRoundFinished(winner, quip);
            return;
          }
        }
      }
    }
  };

  Game.prototype.onRoundFinished = function (winner, quip) {
    this.roundWinner = winner;

    if (winner.id === 'p1') {
      this.p1Score++;
    } else {
      this.p2Score++;
    }

    this.audio.playRoundWin();
    this.updateHUD();

    // Show non-blocking round victory toast banner
    if (this.dom.roundBanner) {
      const bannerClass = winner.id === 'p1' ? 'round-banner visible cyan' : 'round-banner visible magenta';
      this.dom.roundBanner.textContent = `${winner.name} Wins Round ${this.roundNumber}! (${this.p1Score} - ${this.p2Score})`;
      this.dom.roundBanner.className = bannerClass;
      this.bannerTimer = 1.4;
    }

    // Check Match Victory
    if (this.p1Score >= TARGET_SCORE || this.p2Score >= TARGET_SCORE) {
      const matchWinner = (this.p1Score >= TARGET_SCORE) ? this.p1 : this.p2;
      this.onMatchVictory(matchWinner, quip);
    } else {
      // Zero delay between rounds: jump immediately into the next maze!
      this.roundNumber++;
      this.startRound(true);
    }
  };

  Game.prototype.updateRoundOver = function (dt) {
    this.roundOverTimer -= dt;
    if (this.roundOverTimer <= 0) {
      this.roundNumber++;
      this.startRound();
    }
  };

  Game.prototype.onMatchVictory = function (winner, quip) {
    this.state = 'GAME_OVER';

    if (this.dom.gameoverWinner) {
      this.dom.gameoverWinner.textContent = `${winner.name} Wins!`;
      this.dom.gameoverWinner.style.color = (winner.id === 'p1') ? 'var(--cyan)' : 'var(--magenta)';
    }

    if (this.dom.gameoverQuip) {
      this.dom.gameoverQuip.textContent = `"${quip || 'No snooze fest! All-white build supreme!'}"`;
    }

    if (this.dom.statFinalScore) {
      this.dom.statFinalScore.textContent = `${this.p1Score} - ${this.p2Score}`;
    }

    if (this.dom.statTotalRounds) {
      this.dom.statTotalRounds.textContent = this.roundNumber;
    }

    if (this.dom.statBounceKills) {
      this.dom.statBounceKills.textContent = this.totalBankKills;
    }

    if (typeof this.dom.gameoverDialog.showModal === 'function') {
      this.dom.gameoverDialog.showModal();
    }
  };

  // Launch on window load
  window.addEventListener('DOMContentLoaded', function () {
    window.CarterTanks.instance = new Game();
    requestAnimationFrame(window.CarterTanks.instance.tick.bind(window.CarterTanks.instance));
  });

  window.CarterTanks.Game = Game;
})();
