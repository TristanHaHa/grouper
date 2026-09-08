import * as THREE from 'three';
import type { GroupData, NPCData, QueueType, TrackType } from '../types';
import { QUEUE_DRAIN_SECONDS, queueUrgency, type QueuePressure } from './queueService';

type Mood = ReturnType<typeof queueUrgency>;

export type GuestReactionEvent =
  | { type: 'warning'; queue: QueueType; track?: TrackType; groupId: string; leaderId: string }
  | { type: 'departure'; queue: QueueType; track?: TrackType; groupId: string; leaderId: string };

type Guest = {
  npc: NPCData;
  mesh: THREE.Group;
  faces: Record<Mood, THREE.Group>;
  leftArm?: THREE.Object3D;
  rightArm?: THREE.Object3D;
  leftLeg?: THREE.Object3D;
  rightLeg?: THREE.Object3D;
  waiting: boolean;
  phase: number;
  shakePhase: number;
  skin?: THREE.MeshStandardMaterial;
  baseSkin?: THREE.Color;
  boardingWave: number;
  splitReactionUntil: number;
  splitChat: boolean;
};

type QueueReactionState = {
  leader: string | null;
  warningElapsed: number;
  warningEmitted: boolean;
  departureEmitted: boolean;
};

// Each position back in line gets a meaningful patience buffer.
const GROUP_PATIENCE_STAGGER_SECONDS = 12;

/** Guest reactions share the gameplay pressure thresholds and never change rewards. */
export class GuestReactions {
  private guests = new Map<string, Guest>();
  private floatingSymbols = new Map<string, THREE.Sprite>();
  private groupBars = new Map<string, THREE.Sprite>();
  private time = 0;
  private ink = new THREE.MeshBasicMaterial({ color: '#241c22' });
  private eyeGeometry = new THREE.SphereGeometry(0.014, 8, 6);
  private browGeometry = new THREE.BoxGeometry(0.047, 0.009, 0.009);
  private mouths = Object.fromEntries((['green', 'amber', 'red'] as const).map(mood => {
    const curve = new THREE.QuadraticBezierCurve3(
      new THREE.Vector3(-0.05, -0.045, 0.145),
      new THREE.Vector3(0, mood === 'green' ? -0.1 : mood === 'amber' ? -0.045 : 0.005, 0.155),
      new THREE.Vector3(0.05, -0.045, 0.145),
    );
    return [mood, new THREE.TubeGeometry(curve, 12, 0.007, 5, false)];
  })) as Record<Mood, THREE.TubeGeometry>;
  private symbolTextures = new Map<string, THREE.CanvasTexture>();
  private queueState: Record<QueueType | 'outside', QueueReactionState> = {
    main: this.createQueueState(),
    outside: this.createQueueState(),
    single: this.createQueueState(),
  };

  private createQueueState(): QueueReactionState {
    return {
      leader: null,
      warningElapsed: 0,
      warningEmitted: false,
      departureEmitted: false,
    };
  }

  public register(npc: NPCData, mesh: THREE.Group) {
    if (this.guests.has(npc.id)) return;
    const faces = {} as Record<Mood, THREE.Group>;
    for (const mood of ['green', 'amber', 'red'] as const) {
      const face = new THREE.Group();
      face.name = `expression_${mood}`;
      face.position.y = 1.18 * (npc.height || 1);
      face.visible = mood === 'green';
      for (const side of [-1, 1]) {
        const eye = new THREE.Mesh(this.eyeGeometry, this.ink);
        eye.position.set(side * 0.05, 0.025, 0.145);
        face.add(eye);
        const brow = new THREE.Mesh(this.browGeometry, this.ink);
        brow.position.set(side * 0.05, 0.062, 0.14);
        brow.rotation.z = side * (mood === 'red' ? 0.4 : mood === 'amber' ? -0.25 : -0.08);
        face.add(brow);
      }
      face.add(new THREE.Mesh(this.mouths[mood], this.ink));
      mesh.add(face);
      faces[mood] = face;
    }
    const head = mesh.getObjectByName('head') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> | undefined;
    this.guests.set(npc.id, {
      skin: head?.material, baseSkin: head?.material.color.clone(), boardingWave: 0,
      splitReactionUntil: 0,
      splitChat: false,
      npc,
      mesh,
      faces,
      leftArm: mesh.getObjectByName('leftArm') ?? undefined,
      rightArm: mesh.getObjectByName('rightArm') ?? undefined,
      leftLeg: mesh.getObjectByName('leftLeg') ?? undefined,
      rightLeg: mesh.getObjectByName('rightLeg') ?? undefined,
      waiting: false,
      phase: [...npc.id].reduce((sum, char) => sum + char.charCodeAt(0), 0) * 0.71,
      shakePhase: [...npc.id].reduce((sum, char) => sum + char.charCodeAt(0), 0) * 0.33,
    });
  }

  private setExpression(guest: Guest, mood: Mood) {
    for (const value of ['green', 'amber', 'red'] as const) guest.faces[value].visible = value === mood;
    if (guest.skin && guest.baseSkin) guest.skin.color.copy(guest.baseSkin).lerp(new THREE.Color('#e34242'), mood === 'red' ? 0.48 : mood === 'amber' ? 0.22 : 0);
  }

  private relax(guest: Guest) {
    this.setExpression(guest, 'green');
    guest.mesh.rotation.x = guest.mesh.rotation.z = 0;
    guest.mesh.position.y = 0;
    for (const limb of [guest.leftArm, guest.rightArm, guest.leftLeg, guest.rightLeg]) {
      if (limb) limb.rotation.set(0, 0, 0);
    }
    guest.waiting = false;
  }

  private createSymbolTexture(text: string) {
    const key = `symbol:${text}`;
    let texture = this.symbolTextures.get(key);
    if (!texture) {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 128;
      const ctx = canvas.getContext('2d')!;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.font = 'bold 56px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 10;
      ctx.strokeStyle = '#111111';
      ctx.fillStyle = '#f8fafc';
      ctx.strokeText(text, 128, 64, 220);
      ctx.fillText(text, 128, 64, 220);
      texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      this.symbolTextures.set(key, texture);
    }
    return texture;
  }

  private getSymbol(guest: Guest) {
    let symbol = this.floatingSymbols.get(guest.npc.id);
    if (!symbol) {
      symbol = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthWrite: false, toneMapped: false }));
      symbol.name = 'guestSymbol';
      symbol.scale.set(1.4, 0.7, 1);
      symbol.visible = false;
      guest.mesh.add(symbol);
      this.floatingSymbols.set(guest.npc.id, symbol);
    }
    return symbol;
  }

  public showSplitDisappointment(group: GroupData) {
    const until = this.time + 2.2;
    group.members.forEach((npc, index) => {
      const guest = this.guests.get(npc.id);
      if (!guest) return;
      guest.splitReactionUntil = until;
      guest.splitChat = index === 0;
      this.setExpression(guest, 'red');
      if (guest.leftArm) guest.leftArm.rotation.z = -0.8;
      if (guest.rightArm) guest.rightArm.rotation.z = 1.15;
      if (index === 0) {
        const symbol = this.getSymbol(guest);
        symbol.visible = true;
        symbol.position.set(0, 1.85 * (guest.npc.height || 1), 0.06);
        symbol.material.map = this.createSymbolTexture('We wanted to ride together!');
        symbol.material.opacity = 1;
        symbol.scale.set(2.5, 0.6, 1);
      }
    });
  }

  private updateGroupPatienceBar(group: GroupData, patience: number) {
    const leader = this.guests.get(group.members[0]?.id);
    if (!leader) return;
    let bar = this.groupBars.get(group.id);
    if (!bar) {
      const canvas = document.createElement('canvas');
      canvas.width = 160;
      canvas.height = 24;
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      bar = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }));
      bar.name = 'groupPatienceBar';
      bar.scale.set(0.72, 0.11, 1);
      leader.mesh.add(bar);
      this.groupBars.set(group.id, bar);
    }
    // Keep the bar clear of faces and reaction symbols while still visibly tied to its group.
    bar.position.set(0, 1.58 * (leader.npc.height || 1), 0.08);
    const canvas = (bar.material.map!.image as HTMLCanvasElement);
    const ctx = canvas.getContext('2d')!;
    // Lightweight test canvases intentionally omit drawing APIs.
    if (typeof ctx.save !== 'function') return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(8, 15, 28, 0.9)';
    ctx.roundRect(0, 0, 160, 24, 10);
    ctx.fill();
    const fill = Math.max(0, Math.min(1, patience / 100));
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(2, 2, Math.max(0, 156 * fill), 20, 8);
    ctx.clip();
    // One solid hue per group: green at 100, yellow mid-way, red at zero.
    ctx.fillStyle = `hsl(${Math.round(patience * 1.2)}, 85%, 52%)`;
    ctx.fillRect(2, 2, 156, 20);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.lineWidth = 1;
    ctx.roundRect(0.5, 0.5, 159, 23, 10);
    ctx.stroke();
    bar.material.map!.needsUpdate = true;
  }

  public update(delta: number, main: GroupData[], single: GroupData[], pressure: QueuePressure, zenMode: boolean, canShowSymbols: boolean, outside?: { queue: GroupData[]; pressure: QueuePressure; loading: boolean }): GuestReactionEvent[] {
    this.time += delta;
    const events: GuestReactionEvent[] = [];
    const active = new Map<string, Mood>();
    for (const symbol of this.floatingSymbols.values()) symbol.visible = false;

    const queues = [
      { type: 'main' as const, queue: main, wait: pressure.main, loading: canShowSymbols, track: 'inside' as TrackType },
      { type: 'single' as const, queue: single, wait: pressure.single, loading: canShowSymbols || !!outside?.loading, track: canShowSymbols ? 'inside' as TrackType : 'outside' as TrackType },
      ...(outside ? [{ type: 'outside' as const, queue: outside.queue, wait: outside.pressure.main, loading: outside.loading, track: 'outside' as TrackType }] : []),
    ];
    for (const { type, queue, wait, loading, track } of queues) {
      queue.slice(0, 5).forEach((group, index) => {
        const patienceWait = Math.max(0, wait.waitSeconds - index * GROUP_PATIENCE_STAGGER_SECONDS);
        const groupWait = patienceWait * 2;
        const mood = zenMode ? 'green' : queueUrgency(groupWait);
        group.members.forEach(npc => active.set(npc.id, mood));
        this.updateGroupPatienceBar(group, zenMode ? 100 : 100 - Math.min(100, patienceWait / 0.6));
      });
      const state = this.queueState[type];
      const leader = queue[0]?.members[0]?.id ?? null;
      const leaderChanged = leader !== state.leader;

      if (leaderChanged) {
        state.warningElapsed = 0;
        state.warningEmitted = false;
        state.departureEmitted = false;
      }

      const frontGuest = leader ? this.guests.get(leader) : undefined;
      const eligible = !zenMode && wait.groupId === queue[0]?.id
        && wait.waitSeconds >= QUEUE_DRAIN_SECONDS && frontGuest
        && !frontGuest.npc.isWalking && !frontGuest.mesh.userData.isRider;
      if (!eligible) {
        state.warningElapsed = 0;
        state.warningEmitted = false;
        state.departureEmitted = false;
      } else if (loading) {
        if (!state.warningEmitted) {
          events.push({ type: 'warning', queue: type === 'outside' ? 'main' : type, track, groupId: frontGuest.npc.groupId, leaderId: frontGuest.npc.id });
          state.warningEmitted = true;
        }
        // The bar reaches zero at the exact departure threshold. Do not leave a
        // second invisible countdown between an empty bar and the group leaving.
        if (!state.departureEmitted) {
          events.push({ type: 'departure', queue: type === 'outside' ? 'main' : type, track, groupId: frontGuest.npc.groupId, leaderId: frontGuest.npc.id });
          state.departureEmitted = true;
        }
        const symbol = this.getSymbol(frontGuest);
        symbol.visible = false;
        symbol.position.set(Math.sin((this.time + frontGuest.shakePhase) * 20) * 0.055,
          1.95 * (frontGuest.npc.height || 1), 0.06);
        symbol.material.map = this.createSymbolTexture('@#%!');
        symbol.material.opacity = 0;
      }

      state.leader = leader;
    }

    for (const [id, guest] of this.guests) {
      const mood = active.get(id);
      if (guest.splitReactionUntil > this.time) {
        this.setExpression(guest, 'red');
        guest.mesh.rotation.z = Math.sin((this.time + guest.phase) * 8) * 0.05;
        if (guest.leftArm) guest.leftArm.rotation.z = -0.8;
        if (guest.rightArm) guest.rightArm.rotation.z = 1.15 + Math.sin(this.time * 6) * 0.25;
        if (guest.splitChat) {
          const symbol = this.getSymbol(guest);
          symbol.visible = true;
          symbol.position.set(0, 1.85 * (guest.npc.height || 1), 0.06);
          symbol.material.map = this.createSymbolTexture('We wanted to ride together!');
          symbol.material.opacity = 1;
          symbol.scale.set(2.5, 0.6, 1);
        }
        continue;
      }
      guest.splitChat = false;
      if (!mood || guest.npc.isWalking || guest.mesh.userData.isRider) {
        if (guest.waiting) {
          this.relax(guest);
          if (guest.npc.isWalking && !guest.mesh.userData.isDeparting) guest.boardingWave = 1.2;
        }
        if (guest.boardingWave > 0) {
          guest.boardingWave = Math.max(0, guest.boardingWave - delta);
          if (guest.rightArm) guest.rightArm.rotation.z = guest.boardingWave > 0 ? 2.2 + Math.sin(this.time * 12) * 0.25 : 0;
        }
        continue;
      }

      guest.waiting = true;
      this.setExpression(guest, mood);
      const phase = this.time + guest.phase;
      guest.mesh.rotation.z = Math.sin(phase * 1.7) * (mood === 'green' ? 0.012 : 0.025);
      guest.mesh.rotation.x = mood === 'red' ? 0.04 : 0;
      guest.mesh.position.y = mood === 'green'
        ? Math.max(0, Math.sin(phase * 3)) * 0.03
        : mood === 'amber'
          ? Math.max(0, Math.sin(phase * 6)) * 0.02
          : Math.max(0, Math.sin(phase * 8)) * 0.01;
      if (guest.leftArm) guest.leftArm.rotation.z = mood === 'green' ? 0.03 : mood === 'amber' ? -0.3 : -0.5;
      if (guest.rightArm) {
        guest.rightArm.rotation.z = mood === 'red' ? 1.45 + Math.sin(phase * 4) * 0.35 : mood === 'amber' ? 0.45 : -0.03;
        guest.rightArm.rotation.x = mood === 'amber' ? -0.65 : 0;
      }
      if (guest.leftLeg) guest.leftLeg.rotation.x = mood === 'green' ? 0 : Math.max(0, Math.sin(phase * 7)) * 0.15;
      if (guest.rightLeg) guest.rightLeg.rotation.x = mood === 'green' ? 0 : Math.max(0, Math.sin(phase * 7 + 1)) * 0.2;
    }

    return events;
  }

  public forget(id: string) {
    const guest = this.guests.get(id);
    if (!guest) return;
    this.relax(guest);
    for (const face of Object.values(guest.faces)) face.removeFromParent();
    const symbol = this.floatingSymbols.get(id);
    if (symbol) {
      symbol.removeFromParent();
      symbol.material.dispose();
      this.floatingSymbols.delete(id);
    }
    const bar = this.groupBars.get(guest.npc.groupId);
    if (bar?.parent === guest.mesh) {
      bar.removeFromParent();
      bar.material.map?.dispose();
      bar.material.dispose();
      this.groupBars.delete(guest.npc.groupId);
    }
    this.guests.delete(id);
  }

  public reset() {
    for (const id of [...this.guests.keys()]) this.forget(id);
    for (const state of Object.values(this.queueState)) {
      state.leader = null;
      state.warningElapsed = 0;
      state.warningEmitted = false;
      state.departureEmitted = false;
    }
    this.time = 0;
  }

  public dispose() {
    this.reset();
    this.ink.dispose();
    this.eyeGeometry.dispose();
    this.browGeometry.dispose();
    Object.values(this.mouths).forEach(geometry => geometry.dispose());
    this.symbolTextures.forEach(texture => texture.dispose());
    this.symbolTextures.clear();
    this.floatingSymbols.clear();
  }
}
