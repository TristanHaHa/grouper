/**
 * High-fidelity Web Audio API Procedural Sound Engine for Ride Grouper Simulation.
 * Synthesizes all theme park audio cues, hydraulic sounds, crowd murmurs, and alerts.
 */

class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private ambientGain: GainNode | null = null;
  private crowdOscs: OscillatorNode[] = [];
  private isInitialized = false;
  private muted = false;

  public init() {
    if (this.isInitialized && this.ctx) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      return;
    }

    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
      
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.8, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);

      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.setValueAtTime(0.85, this.ctx.currentTime);
      this.sfxGain.connect(this.masterGain);

      this.ambientGain = this.ctx.createGain();
      this.ambientGain.gain.setValueAtTime(0.12, this.ctx.currentTime);
      this.ambientGain.connect(this.masterGain);

      this.startAmbientMurmur();
      this.isInitialized = true;
    } catch (e) {
      console.warn('AudioContext failed to initialize:', e);
    }
  }

  public setMuted(muted: boolean) {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.8, this.ctx.currentTime, 0.05);
    }
  }

  public setVolume(sfx: number, ambient: number) {
    if (!this.ctx) return;
    if (this.sfxGain) {
      this.sfxGain.gain.setTargetAtTime(sfx, this.ctx.currentTime, 0.05);
    }
    if (this.ambientGain) {
      this.ambientGain.gain.setTargetAtTime(ambient * 0.15, this.ctx.currentTime, 0.05);
    }
  }

  // Soft theme park queue murmur & mechanical hum
  private startAmbientMurmur() {
    if (!this.ctx || !this.ambientGain) return;
    try {
      // Noise filter for crowd and distant ride rumble
      const bufferSize = this.ctx.sampleRate * 2;
      const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1;
      }

      const whiteNoise = this.ctx.createBufferSource();
      whiteNoise.buffer = noiseBuffer;
      whiteNoise.loop = true;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(240, this.ctx.currentTime);

      const filter2 = this.ctx.createBiquadFilter();
      filter2.type = 'bandpass';
      filter2.frequency.setValueAtTime(140, this.ctx.currentTime);
      filter2.Q.setValueAtTime(1.5, this.ctx.currentTime);

      whiteNoise.connect(filter);
      filter.connect(this.ambientGain);
      whiteNoise.start();
    } catch {
      // Ignore background noise failures
    }
  }

  // When player selects a group at front of queue
  public playSelectGroup(size: number) {
    if (this.muted || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const baseFreq = 440 + size * 40;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.3, now + 0.08);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.12);
  }

  // When player assigns a group to gates
  public playAssignSuccess(isFullGate: boolean) {
    if (this.muted || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;

    const notes = isFullGate ? [523.25, 659.25, 783.99] : [523.25, 659.25]; // C5, E5, G5
    notes.forEach((freq, idx) => {
      if (!this.ctx || !this.sfxGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.04);

      gain.gain.setValueAtTime(0.25, now + idx * 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.04 + 0.15);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(now + idx * 0.04);
      osc.stop(now + idx * 0.04 + 0.15);
    });
  }

  // Error/invalid gate assignment sound
  public playError() {
    if (this.muted || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.setValueAtTime(120, now + 0.08);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.22);
  }

  // Deselect current group
  public playDeselect() {
    if (this.muted || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.exponentialRampToValueAtTime(250, now + 0.08);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 0.09);
  }

  // Push big red dispatch button
  public playDispatchButton() {
    if (this.muted || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;

    // Heavy mechanical click
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(60, now + 0.06);

    gain.gain.setValueAtTime(0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.08);

    // Station dispatch double-chime (airport / theme park "ding-dong")
    setTimeout(() => {
      if (!this.ctx || !this.sfxGain || this.muted) return;
      const t = this.ctx.currentTime;
      [880, 587.33].forEach((f, i) => {
        const o = this.ctx!.createOscillator();
        const g = this.ctx!.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(f, t + i * 0.16);
        g.gain.setValueAtTime(0.35, t + i * 0.16);
        g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.16 + 0.45);
        o.connect(g);
        g.connect(this.sfxGain!);
        o.start(t + i * 0.16);
        o.stop(t + i * 0.16 + 0.45);
      });
    }, 100);
  }

  // Lap bars locking down
  public playLapBarsLock() {
    if (this.muted || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;

    // Hydraulic whoosh + double metallic ratchet
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(100, now + 0.25);

    gain.gain.setValueAtTime(0.25, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.3);

    // Clack-clack
    [0.2, 0.28].forEach(delay => {
      const click = this.ctx!.createOscillator();
      const clickGain = this.ctx!.createGain();
      click.type = 'square';
      click.frequency.setValueAtTime(900, now + delay);
      click.frequency.exponentialRampToValueAtTime(200, now + delay + 0.04);
      clickGain.gain.setValueAtTime(0.35, now + delay);
      clickGain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.05);
      click.connect(clickGain);
      clickGain.connect(this.sfxGain!);
      click.start(now + delay);
      click.stop(now + delay + 0.05);
    });
  }

  // Train dispatch launch roar & coaster track rumble
  public playCoasterLaunch() {
    if (this.muted || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;

    // Sub rumble & pitch increase (coaster motor / magnetic launch)
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(65, now);
    osc.frequency.exponentialRampToValueAtTime(260, now + 1.8);

    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.4, now + 0.3);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 2.4);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(300, now);
    filter.frequency.linearRampToValueAtTime(1200, now + 1.5);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    osc.start(now);
    osc.stop(now + 2.4);
  }

  // Incoming empty train air brakes
  public playTrainBrakes() {
    if (this.muted || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;

    // Pneumatic brake hiss
    const bufferSize = this.ctx.sampleRate * 0.8;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = (Math.random() * 2 - 1) * Math.exp(-i / (this.ctx.sampleRate * 0.3));
    }

    const whiteNoise = this.ctx.createBufferSource();
    whiteNoise.buffer = noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1800, now);
    filter.Q.setValueAtTime(3.0, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.75);

    whiteNoise.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxGain);

    whiteNoise.start(now);
  }

  // Perfect train bonus fanfare
  public playPerfectTrainFanfare() {
    if (this.muted || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6

    notes.forEach((freq, idx) => {
      if (!this.ctx || !this.sfxGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now + idx * 0.08);

      gain.gain.setValueAtTime(0.35, now + idx * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.35);

      osc.connect(gain);
      gain.connect(this.sfxGain);

      osc.start(now + idx * 0.08);
      osc.stop(now + idx * 0.08 + 0.35);
    });
  }

  // Low patience warning alarm pulse
  public playPatienceAlert() {
    if (this.muted || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.setValueAtTime(740, now + 0.07);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  // Jump sound
  public playJump() {
    if (this.muted || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(180, now);
    osc.frequency.exponentialRampToValueAtTime(360, now + 0.12);

    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.14);
  }

  // Toggle/Select Gate in Grouping Stage
  public playGateToggle(gateNum: number) {
    if (this.muted || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;

    const baseNotes = [329.63, 369.99, 392.00, 440.00, 493.88, 523.25, 587.33, 659.25];
    const freq = baseNotes[gateNum % baseNotes.length];

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.05, now + 0.08);

    gain.gain.setValueAtTime(0.28, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.12);
  }

  // Deselect a gate number
  public playGateDeselect() {
    if (this.muted || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(200, now + 0.09);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  // Hover over a gate (intermediate pre-selection stage)
  public playGateHover(gateNum?: number) {
    if (this.muted || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    const freq = gateNum ? 420 + (gateNum % 8) * 30 : 540;
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 0.9, now + 0.04);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

    osc.connect(gain);
    gain.connect(this.sfxGain);
    osc.start(now);
    osc.stop(now + 0.04);
  }

  // Group Confirmation & Send to Gates
  public playGroupConfirm() {
    if (this.muted || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;

    [523.25, 659.25, 783.99, 1046.50].forEach((freq, idx) => {
      if (!this.ctx || !this.sfxGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.04);

      gain.gain.setValueAtTime(0.25, now + idx * 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.04 + 0.18);

      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now + idx * 0.04);
      osc.stop(now + idx * 0.04 + 0.18);
    });
  }

  // Game over buzzer
  public playGameOver() {
    if (this.muted || !this.ctx || !this.sfxGain) return;
    const now = this.ctx.currentTime;

    [349.23, 311.13, 277.18, 220.00].forEach((freq, idx) => {
      if (!this.ctx || !this.sfxGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now + idx * 0.18);

      gain.gain.setValueAtTime(0.35, now + idx * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.18 + 0.4);

      osc.connect(gain);
      gain.connect(this.sfxGain);
      osc.start(now + idx * 0.18);
      osc.stop(now + idx * 0.18 + 0.4);
    });
  }
}

export const soundEngine = new SoundEngine();
