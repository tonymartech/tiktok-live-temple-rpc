/**
 * ChapelAudioEngine
 * - Ambient music: original synthesized soft pad (no samples, no licensed hymns) that auto-ducks
 *   while a voice line is being read.
 * - Sound effects: church bell, soft "amen" tap, candle chime, page turn — all Web Audio synthesis.
 * - Voice: the browser's Web Speech API (en-US). Free, no API key, no server round-trip.
 *   Lines are queued so only one is read at a time.
 */
class ChapelAudioEngine {
  constructor() {
    this.ctx = null;
    this.unlocked = false;
    this.sfxEnabled = true;
    this.bgMusicEnabled = true;
    this.ttsEnabled = true;

    const savedMusicVol = parseFloat(this.readStore('chapel_music_vol'));
    const savedTtsVol = parseFloat(this.readStore('chapel_tts_vol'));
    this.bgBaseVolume = Number.isFinite(savedMusicVol) ? Math.max(0, Math.min(1, savedMusicVol)) : 0.65;
    this.ttsVolume = Number.isFinite(savedTtsVol) ? Math.max(0, Math.min(1, savedTtsVol)) : 0.95;

    this.synthBgTimer = null;
    this.ttsQueue = [];
    this.ttsPlaying = false;
    this.onTtsStateChange = null;
  }

  readStore(key) {
    try {
      return localStorage.getItem(key);
    } catch (_) {
      return null;
    }
  }

  writeStore(key, value) {
    try {
      localStorage.setItem(key, String(value));
    } catch (_) {}
  }

  ensureContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    this.unlocked = true;
    if (this.bgMusicEnabled) {
      this.startZenAmbience();
    }
    return this.ctx;
  }

  // --------------------------------------------------------------------------
  // 1. AMBIENT PAD (soft C-major arpeggio, ducked while the voice speaks)
  // --------------------------------------------------------------------------
  getDuckedVolume() {
    return Math.max(0.08, +(this.bgBaseVolume * 0.35).toFixed(2));
  }

  setMusicVolume(vol) {
    const v = Math.max(0, Math.min(1, Number(vol)));
    if (!Number.isFinite(v)) return;
    this.bgBaseVolume = v;
    this.writeStore('chapel_music_vol', v);
  }

  setTtsVolume(vol) {
    const v = Math.max(0, Math.min(1, Number(vol)));
    if (!Number.isFinite(v)) return;
    this.ttsVolume = v;
    this.writeStore('chapel_tts_vol', v);
  }

  startZenAmbience() {
    if (!this.bgMusicEnabled || this.synthBgTimer || !this.ctx) return;
    const NOTES = [261.63, 329.63, 392.0, 523.25, 392.0, 329.63, 293.66, 349.23];
    let step = 0;
    const playNote = () => {
      if (!this.bgMusicEnabled || !this.ctx) return;
      try {
        const now = this.ctx.currentTime;
        const freq = NOTES[step % NOTES.length];
        step++;
        const vol = (this.ttsPlaying ? this.getDuckedVolume() : this.bgBaseVolume) * 0.18;
        if (vol <= 0.002) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(vol, now + 0.8);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 4.6);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.onended = () => {
          osc.disconnect();
          gain.disconnect();
        };
        osc.start(now);
        osc.stop(now + 4.7);
      } catch (_) {}
    };
    playNote();
    this.synthBgTimer = setInterval(playNote, 2800);
  }

  stopZenAmbience() {
    if (this.synthBgTimer) {
      clearInterval(this.synthBgTimer);
      this.synthBgTimer = null;
    }
  }

  // --------------------------------------------------------------------------
  // 2. SOUND EFFECTS
  // --------------------------------------------------------------------------
  // Soft "amen" tap: short warm sine pluck
  playAmenTap(pitchMultiplier = 1.0) {
    if (!this.sfxEnabled) return;
    try {
      const ctx = this.ensureContext();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const freq = 523.25 * pitchMultiplier * (0.99 + Math.random() * 0.02);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.16, now + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.45);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.onended = () => {
        osc.disconnect();
        gain.disconnect();
      };
      osc.start(now);
      osc.stop(now + 0.5);
    } catch (_) {}
  }

  // Church bell: hum / prime / minor-third tierce / quint / nominal partials
  playChurchBell(intensity = 1.0) {
    if (!this.sfxEnabled) return;
    try {
      const ctx = this.ensureContext();
      const now = ctx.currentTime;
      const base = 220;
      const partials = [
        { ratio: 0.5, amp: 0.2, decay: 5.0 },
        { ratio: 1.0, amp: 0.34, decay: 4.2 },
        { ratio: 1.2, amp: 0.18, decay: 3.2 },
        { ratio: 1.5, amp: 0.14, decay: 2.6 },
        { ratio: 2.0, amp: 0.16, decay: 2.0 }
      ];

      const master = ctx.createGain();
      master.gain.setValueAtTime(0.28 * Math.min(1.0, intensity), now);
      master.connect(ctx.destination);

      partials.forEach((p, idx) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(base * p.ratio, now);
        g.gain.setValueAtTime(0.0001, now);
        g.gain.linearRampToValueAtTime(p.amp, now + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, now + p.decay);
        osc.connect(g);
        g.connect(master);
        osc.onended = () => {
          osc.disconnect();
          g.disconnect();
          if (idx === 0) master.disconnect();
        };
        osc.start(now);
        osc.stop(now + p.decay + 0.05);
      });
    } catch (_) {}
  }

  // Two-note chime for candles, prayers and gifts
  playCandleChime() {
    if (!this.sfxEnabled) return;
    try {
      const ctx = this.ensureContext();
      const now = ctx.currentTime;
      [523.25, 659.25].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.1);
        gain.gain.setValueAtTime(0.0001, now + idx * 0.1);
        gain.gain.linearRampToValueAtTime(0.1, now + idx * 0.1 + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.1 + 1.2);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.onended = () => {
          osc.disconnect();
          gain.disconnect();
        };
        osc.start(now + idx * 0.1);
        osc.stop(now + idx * 0.1 + 1.25);
      });
    } catch (_) {}
  }

  // Page turn: short band-passed noise burst (replaces the old fortune-stick shaker)
  playPageTurn() {
    if (!this.sfxEnabled) return;
    try {
      const ctx = this.ensureContext();
      const now = ctx.currentTime;
      const len = Math.floor(ctx.sampleRate * 0.28);
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      }
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(2400, now);
      filter.Q.setValueAtTime(0.8, now);
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.12, now);
      src.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      src.onended = () => {
        src.disconnect();
        filter.disconnect();
        gain.disconnect();
      };
      src.start(now);
    } catch (_) {}
  }

  // --------------------------------------------------------------------------
  // 3. VOICE QUEUE (Web Speech API, en-US)
  // --------------------------------------------------------------------------
  enqueueTts(text, options = {}) {
    const onStart = typeof options.onStart === 'function' ? options.onStart : null;
    const onEnd = typeof options.onEnd === 'function' ? options.onEnd : null;
    const clean = String(text || '').trim();

    if (!this.ttsEnabled || !clean || !('speechSynthesis' in window)) {
      if (onStart) onStart();
      if (onEnd) setTimeout(onEnd, 5500);
      return;
    }

    if (this.ttsQueue.length >= 6) {
      const dropped = this.ttsQueue.shift();
      if (dropped?.onStart) dropped.onStart();
      if (dropped?.onEnd) dropped.onEnd();
    }

    this.ttsQueue.push({ text: clean, onStart, onEnd });
    this.processTtsQueue();
  }

  pickVoice() {
    const voices = window.speechSynthesis.getVoices().filter((v) => /^en[-_]US/i.test(v.lang));
    if (!voices.length) return null;
    const preferred = ['Samantha', 'Google US English', 'Aria', 'Jenny', 'Natural', 'Alex'];
    for (const name of preferred) {
      const hit = voices.find((v) => v.name.includes(name));
      if (hit) return hit;
    }
    return voices[0];
  }

  async processTtsQueue() {
    if (this.ttsPlaying || this.ttsQueue.length === 0) return;
    this.ttsPlaying = true;
    const item = this.ttsQueue.shift();

    try {
      if (this.onTtsStateChange) {
        this.onTtsStateChange({ speaking: true, text: item.text });
      }
      if (item.onStart) item.onStart();
      await this.speak(item.text);
      if (item.onEnd) item.onEnd();
    } catch (err) {
      console.warn('[Voice Warning]', err);
      if (item.onEnd) item.onEnd();
    } finally {
      this.ttsPlaying = false;
      if (this.ttsQueue.length === 0) {
        if (this.onTtsStateChange) {
          this.onTtsStateChange({ speaking: false, text: '' });
        }
      } else {
        setTimeout(() => this.processTtsQueue(), 250);
      }
    }
  }

  speak(text) {
    return new Promise((resolve) => {
      // Safety net: some browsers (and some OBS builds) never fire onend
      const estimateMs = Math.min(30000, 2500 + text.length * 75);
      let finished = false;
      const done = () => {
        if (finished) return;
        finished = true;
        clearTimeout(safety);
        resolve();
      };
      const safety = setTimeout(() => {
        try {
          window.speechSynthesis.cancel();
        } catch (_) {}
        done();
      }, estimateMs + 4000);

      try {
        const utter = new SpeechSynthesisUtterance(text);
        utter.lang = 'en-US';
        utter.rate = 0.95;
        utter.pitch = 1.0;
        utter.volume = this.ttsVolume;
        const voice = this.pickVoice();
        if (voice) utter.voice = voice;
        utter.onend = done;
        utter.onerror = done;
        window.speechSynthesis.speak(utter);
      } catch (_) {
        setTimeout(done, estimateMs);
      }
    });
  }
}

window.ChapelAudioEngine = ChapelAudioEngine;
