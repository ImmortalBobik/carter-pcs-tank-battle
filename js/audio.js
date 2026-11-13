/**
 * White CarterPCs: Tank Battle - Web Audio Synthesizer
 * Procedural retro/tech sound effects using Web Audio API
 */
window.CarterTanks = window.CarterTanks || {};

(function () {
  'use strict';

  let audioCtx = null;
  let masterGain = null;
  let muted = false;

  // Safe localStorage read for mute preference
  try {
    const saved = localStorage.getItem('carter_tanks_muted');
    if (saved !== null) {
      muted = (saved === 'true');
    }
  } catch (e) {
    // Ignore error in restricted file:// or iframe sandbox contexts
    muted = false;
  }

  function initContext() {
    if (audioCtx) {
      if (audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }
      return audioCtx;
    }

    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) return null;
      audioCtx = new AudioContextClass();

      masterGain = audioCtx.createGain();
      masterGain.gain.setValueAtTime(muted ? 0 : 0.35, audioCtx.currentTime);
      masterGain.connect(audioCtx.destination);
    } catch (e) {
      console.warn('AudioContext initialization failed:', e);
      return null;
    }

    return audioCtx;
  }

  function ensureContext() {
    return initContext();
  }

  const Audio = {
    init: function () {
      initContext();
    },

    isMuted: function () {
      return muted;
    },

    toggleMute: function () {
      muted = !muted;
      try {
        localStorage.setItem('carter_tanks_muted', String(muted));
      } catch (e) {}

      if (masterGain && audioCtx) {
        masterGain.gain.setValueAtTime(muted ? 0 : 0.35, audioCtx.currentTime);
      }
      return muted;
    },

    /**
     * Tank cannon shot sound
     */
    playShoot: function (isLaser) {
      if (muted) return;
      const ctx = ensureContext();
      if (!ctx || ctx.state !== 'running') return;

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      if (isLaser) {
        // High-tech laser sweep
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(1100, now);
        osc.frequency.exponentialRampToValueAtTime(140, now + 0.12);

        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(now);
        osc.stop(now + 0.13);
      } else {
        // Crisp punchy mechanical tank pop
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(60, now + 0.16);

        gain.gain.setValueAtTime(0.4, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

        // Noise burst layer for mechanical recoil punch
        const bufferSize = ctx.sampleRate * 0.05;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.random() * 2 - 1;
        }

        const noise = ctx.createBufferSource();
        noise.buffer = buffer;

        const noiseFilter = ctx.createBiquadFilter();
        noiseFilter.type = 'lowpass';
        noiseFilter.frequency.setValueAtTime(1200, now);

        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0.25, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);

        noise.connect(noiseFilter);
        noiseFilter.connect(noiseGain);
        noiseGain.connect(masterGain);

        osc.connect(gain);
        gain.connect(masterGain);

        osc.start(now);
        noise.start(now);
        osc.stop(now + 0.17);
        noise.stop(now + 0.06);
      }
    },

    /**
     * Bullet ricochets off wall (metallic aluminum ping)
     */
    playBounce: function () {
      if (muted) return;
      const ctx = ensureContext();
      if (!ctx || ctx.state !== 'running') return;

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      // Slight pitch variation for organic ricochet feel
      const pitch = 950 + Math.random() * 300;
      osc.frequency.setValueAtTime(pitch, now);
      osc.frequency.exponentialRampToValueAtTime(pitch * 0.7, now + 0.06);

      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

      osc.connect(gain);
      gain.connect(masterGain);

      osc.start(now);
      osc.stop(now + 0.07);
    },

    /**
     * Tank explosion / destruction
     */
    playHit: function () {
      if (muted) return;
      const ctx = ensureContext();
      if (!ctx || ctx.state !== 'running') return;

      const now = ctx.currentTime;

      // 1. Low sub-bass drop
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.exponentialRampToValueAtTime(30, now + 0.45);

      oscGain.gain.setValueAtTime(0.5, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

      // 2. White noise shatter
      const bufferSize = ctx.sampleRate * 0.4;
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const noiseFilter = ctx.createBiquadFilter();
      noiseFilter.type = 'bandpass';
      noiseFilter.frequency.setValueAtTime(800, now);
      noiseFilter.frequency.linearRampToValueAtTime(200, now + 0.35);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.45, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

      osc.connect(oscGain);
      oscGain.connect(masterGain);

      noise.connect(noiseFilter);
      noiseFilter.connect(noiseGain);
      noiseGain.connect(masterGain);

      osc.start(now);
      noise.start(now);
      osc.stop(now + 0.46);
      noise.stop(now + 0.42);
    },

    /**
     * Vegetable oil shield breaks / absorbs a bullet
     */
    playShieldPop: function () {
      if (muted) return;
      const ctx = ensureContext();
      if (!ctx || ctx.state !== 'running') return;

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.linearRampToValueAtTime(600, now + 0.08);
      osc.frequency.linearRampToValueAtTime(180, now + 0.18);

      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

      osc.connect(gain);
      gain.connect(masterGain);

      osc.start(now);
      osc.stop(now + 0.21);
    },

    /**
     * Picked up PC Hardware Power-up (Upbeat RGB chime)
     */
    playPickup: function () {
      if (muted) return;
      const ctx = ensureContext();
      if (!ctx || ctx.state !== 'running') return;

      const notes = [523.25, 659.25, 783.99]; // C5, E5, G5
      notes.forEach((freq, idx) => {
        const now = ctx.currentTime + idx * 0.06;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

        osc.connect(gain);
        gain.connect(masterGain);

        osc.start(now);
        osc.stop(now + 0.13);
      });
    },

    /**
     * Round / Match Victory Fanfare
     */
    playRoundWin: function () {
      if (muted) return;
      const ctx = ensureContext();
      if (!ctx || ctx.state !== 'running') return;

      const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
      const durations = [0.1, 0.1, 0.1, 0.35];

      let t = ctx.currentTime;
      notes.forEach((freq, i) => {
        const dur = durations[i];
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, t);

        gain.gain.setValueAtTime(0.3, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + dur);

        osc.connect(gain);
        gain.connect(masterGain);

        osc.start(t);
        osc.stop(t + dur + 0.02);

        t += dur * 0.85;
      });
    },

    /**
     * Mechanical keyboard keypress / UI button click
     */
    playButton: function () {
      if (muted) return;
      const ctx = ensureContext();
      if (!ctx || ctx.state !== 'running') return;

      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(700, now);
      osc.frequency.exponentialRampToValueAtTime(220, now + 0.03);

      gain.gain.setValueAtTime(0.15, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);

      osc.connect(gain);
      gain.connect(masterGain);

      osc.start(now);
      osc.stop(now + 0.04);
    }
  };

  // Auto-init on first document interaction
  const triggerInit = function () {
    initContext();
    if (typeof window.removeEventListener === 'function') {
      window.removeEventListener('pointerdown', triggerInit);
      window.removeEventListener('keydown', triggerInit);
    }
  };
  if (typeof window.addEventListener === 'function') {
    window.addEventListener('pointerdown', triggerInit, { once: true });
    window.addEventListener('keydown', triggerInit, { once: true });
  }

  window.CarterTanks.Audio = Audio;
})();
