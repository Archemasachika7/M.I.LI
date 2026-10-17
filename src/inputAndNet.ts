import Peer, { DataConnection } from 'peerjs';

export interface InputSnapshot {
  moveX: number;
  jetpack: boolean;
  crouch: boolean;
  aimAngle: number;
  shoot: boolean;
  throwGrenade: boolean;
  dropBomb: boolean;
  useMedkit: boolean;
  switchWeapon: boolean;
  reload: boolean;
  deviceLabel: string;
}

export class MultiInputController {
  public state: InputSnapshot = {
    moveX: 0,
    jetpack: false,
    crouch: false,
    aimAngle: 0,
    shoot: false,
    throwGrenade: false,
    dropBomb: false,
    useMedkit: false,
    switchWeapon: false,
    reload: false,
    deviceLabel: 'KB + Mouse'
  };

  private keys: Record<string, boolean> = {};
  private mouse = { x: 600, y: 400, left: false };
  private prevPadBtns: Record<number, boolean> = {};

  public isTouchActive = false;
  public leftStick = { id: -1, sx: 115, sy: 0, cx: 115, cy: 0, dx: 0, dy: 0, r: 64 };
  public rightStick = { id: -1, sx: 0, sy: 0, cx: 0, cy: 0, dx: 0, dy: 0, r: 70, fireRing: 0.62 };

  constructor(private canvas: HTMLCanvasElement) {
    this.isTouchActive = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    this.bindListeners();
  }

  private bindListeners() {
    window.addEventListener('keydown', (e) => {
      this.state.deviceLabel = 'KB + Mouse';
      this.keys[e.code] = true;
      if (e.code === 'KeyG') this.state.throwGrenade = true;
      if (e.code === 'KeyB') this.state.dropBomb = true;
      if (e.code === 'KeyH') this.state.useMedkit = true;
      if (e.code === 'KeyQ' || e.code === 'KeyE') this.state.switchWeapon = true;
      if (e.code === 'KeyR') this.state.reload = true;
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });

    this.canvas.addEventListener('mousemove', (e) => {
      this.state.deviceLabel = 'KB + Mouse';
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
    });

    this.canvas.addEventListener('mousedown', (e) => {
      this.state.deviceLabel = 'KB + Mouse';
      if (e.button === 0) this.mouse.left = true;
      if (e.button === 2) this.state.throwGrenade = true;
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.left = false;
    });

    window.addEventListener('contextmenu', (e) => e.preventDefault());

    // Android / Tablet Dual Virtual Joysticks
    this.canvas.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        this.isTouchActive = true;
        this.state.deviceLabel = 'Android Touch';
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          if (t.clientX < window.innerWidth * 0.48 && this.leftStick.id === -1) {
            this.leftStick.id = t.identifier;
            this.leftStick.sx = this.leftStick.cx = t.clientX;
            this.leftStick.sy = this.leftStick.cy = t.clientY;
          } else if (t.clientX >= window.innerWidth * 0.48 && this.rightStick.id === -1) {
            this.rightStick.id = t.identifier;
            this.rightStick.sx = this.rightStick.cx = t.clientX;
            this.rightStick.sy = this.rightStick.cy = t.clientY;
          }
        }
      },
      { passive: false }
    );

    this.canvas.addEventListener(
      'touchmove',
      (e) => {
        e.preventDefault();
        for (let i = 0; i < e.changedTouches.length; i++) {
          const t = e.changedTouches[i];
          if (t.identifier === this.leftStick.id) {
            this.updateStickMath(this.leftStick, t.clientX, t.clientY);
          } else if (t.identifier === this.rightStick.id) {
            this.updateStickMath(this.rightStick, t.clientX, t.clientY);
          }
        }
      },
      { passive: false }
    );

    const endTouch = (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === this.leftStick.id) {
          this.leftStick.id = -1;
          this.leftStick.dx = this.leftStick.dy = 0;
        } else if (t.identifier === this.rightStick.id) {
          this.rightStick.id = -1;
          this.rightStick.dx = this.rightStick.dy = 0;
        }
      }
    };
    this.canvas.addEventListener('touchend', endTouch);
    this.canvas.addEventListener('touchcancel', endTouch);
  }

  private updateStickMath(
    stick: { sx: number; sy: number; cx: number; cy: number; dx: number; dy: number; r: number },
    x: number,
    y: number
  ) {
    const rdx = x - stick.sx;
    const rdy = y - stick.sy;
    const dist = Math.hypot(rdx, rdy);
    const clamped = Math.min(dist, stick.r);
    const ang = Math.atan2(rdy, rdx);
    stick.cx = stick.sx + Math.cos(ang) * clamped;
    stick.cy = stick.sy + Math.sin(ang) * clamped;
    stick.dx = (clamped / stick.r) * Math.cos(ang);
    stick.dy = (clamped / stick.r) * Math.sin(ang);
  }

  public poll(playerScreenX: number, playerScreenY: number): InputSnapshot {
    let moveX = 0;
    let jet = false;
    let crouch = false;
    let shoot = false;

    // 1. Keyboard + Mouse
    if (this.keys['KeyA'] || this.keys['ArrowLeft']) moveX -= 1;
    if (this.keys['KeyD'] || this.keys['ArrowRight']) moveX += 1;
    if (this.keys['KeyW'] || this.keys['Space'] || this.keys['ArrowUp']) jet = true;
    if (this.keys['KeyS'] || this.keys['ArrowDown']) crouch = true;
    if (this.mouse.left) shoot = true;

    if (this.state.deviceLabel === 'KB + Mouse') {
      this.state.aimAngle = Math.atan2(this.mouse.y - playerScreenY, this.mouse.x - playerScreenX);
    }

    // 2. Xbox Controller (HTML5 Gamepad API)
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = pads[0];
    if (gp) {
      const lx = gp.axes[0] || 0;
      const ly = gp.axes[1] || 0;
      const rx = gp.axes[2] || 0;
      const ry = gp.axes[3] || 0;

      if (Math.hypot(lx, ly) > 0.18) {
        this.state.deviceLabel = 'Xbox Controller';
        moveX = lx;
        if (ly < -0.42) jet = true;
        if (ly > 0.48) crouch = true;
      }
      if (Math.hypot(rx, ry) > 0.2) {
        this.state.deviceLabel = 'Xbox Controller';
        this.state.aimAngle = Math.atan2(ry, rx);
      }

      const rt = gp.buttons[7]?.pressed || (gp.buttons[7]?.value || 0) > 0.25;
      const lt = gp.buttons[6]?.pressed || (gp.buttons[6]?.value || 0) > 0.25;
      const btnA = gp.buttons[0]?.pressed;
      const btnX = gp.buttons[2]?.pressed;
      const btnY = gp.buttons[3]?.pressed;
      const lb = gp.buttons[4]?.pressed;
      const rb = gp.buttons[5]?.pressed;
      const dpadUp = gp.buttons[12]?.pressed;

      if (rt) {
        shoot = true;
        this.state.deviceLabel = 'Xbox Controller';
      }
      if (lt || btnA) jet = true;
      if (rb && !this.prevPadBtns[5]) this.state.throwGrenade = true;
      if (lb && !this.prevPadBtns[4]) this.state.dropBomb = true;
      if (dpadUp && !this.prevPadBtns[12]) this.state.useMedkit = true;
      if (btnY && !this.prevPadBtns[3]) this.state.switchWeapon = true;
      if (btnX && !this.prevPadBtns[2]) this.state.reload = true;

      this.prevPadBtns[5] = !!rb;
      this.prevPadBtns[4] = !!lb;
      this.prevPadBtns[12] = !!dpadUp;
      this.prevPadBtns[3] = !!btnY;
      this.prevPadBtns[2] = !!btnX;
    }

    // 3. Android Dual-Zone Touch Joysticks
    if (this.leftStick.id !== -1) {
      moveX = this.leftStick.dx;
      if (this.leftStick.dy < -0.35) jet = true;
      if (this.leftStick.dy > 0.45) crouch = true;
    }
    if (this.rightStick.id !== -1) {
      const mag = Math.hypot(this.rightStick.dx, this.rightStick.dy);
      if (mag > 0.12) {
        this.state.aimAngle = Math.atan2(this.rightStick.dy, this.rightStick.dx);
      }
      if (mag >= this.rightStick.fireRing) {
        shoot = true;
      }
    }

    this.state.moveX = Math.max(-1, Math.min(1, moveX));
    this.state.jetpack = jet;
    this.state.crouch = crouch;
    this.state.shoot = shoot;
    return this.state;
  }

  public drawTouchSticks(ctx: CanvasRenderingContext2D) {
    if (!this.isTouchActive && this.state.deviceLabel !== 'Android Touch') return;

    ctx.save();
    const h = window.innerHeight;
    const w = window.innerWidth;

    const lx = this.leftStick.id !== -1 ? this.leftStick.sx : 115;
    const ly = this.leftStick.id !== -1 ? this.leftStick.sy : h - 115;
    const lkx = this.leftStick.id !== -1 ? this.leftStick.cx : lx;
    const lky = this.leftStick.id !== -1 ? this.leftStick.cy : ly;

    ctx.beginPath();
    ctx.arc(lx, ly, this.leftStick.r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(lkx, lky, 26, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(56, 189, 248, 0.65)';
    ctx.fill();

    const rx = this.rightStick.id !== -1 ? this.rightStick.sx : w - 115;
    const ry = this.rightStick.id !== -1 ? this.rightStick.sy : h - 115;
    const rkx = this.rightStick.id !== -1 ? this.rightStick.cx : rx;
    const rky = this.rightStick.id !== -1 ? this.rightStick.cy : ry;

    // Outer Red Auto-Fire Ring
    ctx.beginPath();
    ctx.arc(rx, ry, this.rightStick.r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Inner Aim Ring
    ctx.beginPath();
    ctx.arc(rx, ry, this.rightStick.r * this.rightStick.fireRing, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(rkx, rky, 26, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(239, 68, 68, 0.75)';
    ctx.fill();
    ctx.restore();
  }
}

// ==================== PEERJS + LAN BROADCAST MULTIPLAYER MANAGER ====================
export class LobbyNetworkManager {
  public peerId: string;
  private peer: Peer | null = null;
  private connections: DataConnection[] = [];
  private bc: BroadcastChannel | null = null;
  public onPacket: ((pkt: any) => void) | null = null;
  public onPeerCountChange: ((count: number) => void) | null = null;

  constructor() {
    this.peerId = 'MILI-' + Math.floor(1000 + Math.random() * 9000);
    try {
      this.bc = new BroadcastChannel('mili_lan_channel');
      this.bc.onmessage = (ev) => {
        if (this.onPacket) this.onPacket(ev.data);
      };
    } catch (_) {}
  }

  public openHostRoom(customCode: string, onReady: (id: string) => void) {
    this.peerId = customCode;
    this.peer = new Peer(customCode);
    this.peer.on('open', (id) => onReady(id));
    this.peer.on('connection', (conn) => {
      this.connections.push(conn);
      if (this.onPeerCountChange) this.onPeerCountChange(this.connections.length);
      conn.on('data', (data) => {
        if (this.onPacket) this.onPacket(data);
      });
    });
  }

  public joinRoomById(hostCode: string, onConnected: () => void) {
    this.peer = new Peer();
    this.peer.on('open', () => {
      if (!this.peer) return;
      const conn = this.peer.connect(hostCode.trim().toUpperCase());
      conn.on('open', () => {
        this.connections.push(conn);
        onConnected();
      });
      conn.on('data', (data) => {
        if (this.onPacket) this.onPacket(data);
      });
    });
  }

  public broadcast(packet: any) {
    if (this.bc) this.bc.postMessage(packet);
    for (const c of this.connections) {
      if (c.open) c.send(packet);
    }
  }
}
