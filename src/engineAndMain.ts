import {
  MAPS,
  MaskId,
  MatchModeId,
  MountainMap,
  PHYS,
  PickupKind,
  ROLES,
  RoleId,
  WEAPONS,
  WEATHERS,
  WeatherSpec
} from './typesAndMaps';
import { LobbyNetworkManager, MultiInputController } from './inputAndNet';

interface Soldier {
  id: string;
  name: string;
  username: string;
  team: 'mili' | 'bandits';
  mask: MaskId;
  role: RoleId;
  isBot: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
  overhealHp: number; // Extra HP boost bar
  fuel: number;
  maxFuel: number;
  aimAngle: number;
  jetpacking: boolean;
  onGround: boolean;
  crouching: boolean;
  stomping: boolean; // held-D super dive
  slidingTicks: number;
  invulnTicks: number; // spawn protection
  weaponIdx: number;
  mag: number;
  reserve: number;
  reloadTicks: number;
  fireCooldown: number;
  grenades: number;
  bombs: number;
  medkits: number;
  walkPhase: number;
}

interface Bullet {
  x: number;
  y: number;
  px: number; // previous position for swept collision (anti tunneling)
  py: number;
  vx: number;
  vy: number;
  dmg: number;
  team: 'mili' | 'bandits';
  ownerName: string;
  ownerWeapon: string;
  color: string;
  explosive: boolean;
  life: number;
}

interface ThrowableEntity {
  x: number;
  y: number;
  vx: number;
  vy: number;
  team: 'mili' | 'bandits';
  ownerName: string;
  isClusterBomb: boolean;
  fuse: number;
  bounces: number;
}

class MiliGameEngine {
  private canvas = document.getElementById('gameCanvas') as HTMLCanvasElement;
  private ctx = this.canvas.getContext('2d')!;
  private previewCanvas = document.getElementById('avatarPreviewCanvas') as HTMLCanvasElement;
  private previewCtx = this.previewCanvas.getContext('2d')!;

  private input = new MultiInputController(this.canvas);
  private net = new LobbyNetworkManager();

  // Onboarding Selections
  private fullName = 'Archishman';
  private username = 'SOLOLEVELLER';
  private playerPhotoImg: HTMLImageElement | null = null;
  private selectedMask: MaskId = 'GAS_MASK';
  private selectedRole: RoleId = 'RAIDER';
  private selectedMapId = 'map_outpost';
  private selectedMode: MatchModeId = '4V4_WITHOUT_RULES';

  // Match State
  private isPlaying = false;
  private currentMap: MountainMap = MAPS.map_outpost;
  private matchSeconds = 300; // 5:00 Timer
  private tickCount = 0;
  private scoreMili = 0;
  private scoreBandits = 0;

  private player!: Soldier;
  private soldiers: Soldier[] = [];
  private remotePeers: Record<string, any> = {};
  private bullets: Bullet[] = [];
  private throwables: ThrowableEntity[] = [];
  private particles: Array<{ x: number; y: number; vx: number; vy: number; color: string; life: number; size: number }> = [];
  private floatTexts: Array<{ x: number; y: number; text: string; color: string; life: number }> = [];
  private weatherDrops: Array<{ x: number; y: number; v: number; drift: number }> = [];
  private weather: WeatherSpec = WEATHERS.CLEAR;
  private shakeTicks = 0;
  private shakeMag = 0;
  private activePickups: Array<{ id: string; x: number; y: number; kind: PickupKind; active: boolean; timer: number }> = [];
  private camera = { x: 0, y: 0 };

  constructor() {
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.setupOnboardingUI();
    this.drawAvatarPreview();

    setInterval(() => {
      if (this.isPlaying && this.matchSeconds > 0) {
        this.matchSeconds--;
        const m = String(Math.floor(this.matchSeconds / 60)).padStart(2, '0');
        const s = String(this.matchSeconds % 60).padStart(2, '0');
        document.getElementById('hudMatchTimer')!.textContent = `${m}:${s}`;
        if (this.matchSeconds === 0) {
          this.pushKillfeed('MATCH OVER', '5:00 ELAPSED', `MILI ${this.scoreMili} - ${this.scoreBandits} BANDITS`);
        }
      }
    }, 1000);

    this.net.onPacket = (pkt) => {
      if (pkt.type === 'START_MATCH' && !this.isPlaying) {
        this.selectedMapId = pkt.mapId;
        this.selectedMode = pkt.mode;
        this.startMatch(pkt.mode);
      } else if (pkt.type === 'STATE' && pkt.id !== this.player?.id) {
        this.remotePeers[pkt.id] = pkt;
      }
    };
  }

  private resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  private setupOnboardingUI() {
    const roomCode = this.net.peerId;
    document.getElementById('hostRoomIdText')!.textContent = roomCode;

    // Name & Username
    document.getElementById('inpFullName')!.addEventListener('input', (e) => {
      this.fullName = (e.target as HTMLInputElement).value || 'Soldier';
      this.drawAvatarPreview();
    });
    document.getElementById('inpUsername')!.addEventListener('input', (e) => {
      this.username = ((e.target as HTMLInputElement).value || 'MILI').toUpperCase();
      this.drawAvatarPreview();
    });

    // Optional Player Photograph Upload
    document.getElementById('inpPhotoFile')!.addEventListener('change', (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const img = new Image();
        img.onload = () => {
          this.playerPhotoImg = img;
          this.drawAvatarPreview();
        };
        img.src = ev.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
    document.getElementById('btnClearPhoto')!.addEventListener('click', () => {
      this.playerPhotoImg = null;
      this.drawAvatarPreview();
    });

    // Mask selection
    document.querySelectorAll('#maskButtonsRow button').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#maskButtonsRow button').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedMask = (btn as HTMLElement).dataset.mask as MaskId;
        this.drawAvatarPreview();
      });
    });

    // Role selection
    document.querySelectorAll('#roleButtonsRow button').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#roleButtonsRow button').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedRole = (btn as HTMLElement).dataset.role as RoleId;
        const r = ROLES[this.selectedRole];
        document.getElementById('roleBadgeText')!.textContent = `ROLE: ${r.title}`;
        document.getElementById('rolePerkLabel')!.textContent = r.perkText;
        this.drawAvatarPreview();
      });
    });

    // 3 Mountain Maps
    document.querySelectorAll('#mapCardsRow .map-card').forEach((card) => {
      card.addEventListener('click', () => {
        document.querySelectorAll('#mapCardsRow .map-card').forEach((c) => c.classList.remove('active'));
        card.classList.add('active');
        this.selectedMapId = (card as HTMLElement).dataset.map!;
      });
    });

    // Game Modes (1v1, 2v2, 4v4 With Rules, 4v4 Without Rules)
    document.querySelectorAll('#modeButtonsGrid button').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('#modeButtonsGrid button').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        this.selectedMode = (btn as HTMLElement).dataset.mode as MatchModeId;
      });
    });

    // Create vs Join Tabs
    const tabCreate = document.getElementById('tabCreateLobby')!;
    const tabJoin = document.getElementById('tabJoinLobby')!;
    const paneCreate = document.getElementById('createLobbyPane')!;
    const paneJoin = document.getElementById('joinLobbyPane')!;

    tabCreate.addEventListener('click', () => {
      tabCreate.classList.add('active');
      tabJoin.classList.remove('active');
      paneCreate.style.display = 'flex';
      paneJoin.style.display = 'none';
    });
    tabJoin.addEventListener('click', () => {
      tabJoin.classList.add('active');
      tabCreate.classList.remove('active');
      paneJoin.style.display = 'flex';
      paneCreate.style.display = 'none';
    });

    // Open Host Room — room stays LOCKED (DEPLOY disabled) until another player joins
    const btnDeploy = document.getElementById('btnDeployLobbyMatch') as HTMLButtonElement;
    const lockNotice = document.getElementById('roomLockNotice')!;
    let roomOpen = false;
    let peerCount = 0;

    const refreshRoomLock = () => {
      const locked = roomOpen && peerCount === 0;
      btnDeploy.disabled = locked;
      btnDeploy.style.opacity = locked ? '0.45' : '1';
      btnDeploy.style.cursor = locked ? 'not-allowed' : 'pointer';
      lockNotice.style.display = locked ? 'block' : 'none';
    };
    // Locked from the very start: you cannot deploy a lobby match with an empty room
    btnDeploy.disabled = true;
    btnDeploy.style.opacity = '0.45';
    btnDeploy.style.cursor = 'not-allowed';

    document.getElementById('btnHostStartRoom')!.addEventListener('click', () => {
      this.net.openHostRoom(roomCode, (id) => {
        roomOpen = true;
        refreshRoomLock();
        document.getElementById('lobbyPlayersList')!.textContent =
          `Room ${id} LIVE! 🔒 Waiting for at least one player to join before DEPLOY unlocks...`;
      });
      this.net.onPeerCountChange = (cnt) => {
        peerCount = cnt;
        refreshRoomLock();
        document.getElementById('lobbyPlayersList')!.textContent =
          cnt > 0
            ? `${cnt + 1} Players Connected in Room ${roomCode}! Click DEPLOY to start.`
            : `Room ${roomCode} is LIVE but EMPTY — DEPLOY stays locked until someone joins.`;
      };
      // Also unlock if a LAN BroadcastChannel tab answers our HELLO probe
      this.net.onLanPeerSeen = () => {
        peerCount = Math.max(peerCount, 1);
        refreshRoomLock();
        document.getElementById('lobbyPlayersList')!.textContent =
          `LAN peer detected near Room ${roomCode}! Click DEPLOY to start.`;
      };
      this.net.startLanDiscovery();
    });

    // Join Room by ID
    document.getElementById('btnConnectPeer')!.addEventListener('click', () => {
      const code = (document.getElementById('inpJoinRoomId') as HTMLInputElement).value;
      if (!code) return;
      document.getElementById('joinStatusText')!.textContent = `Connecting to ${code}...`;
      this.net.joinRoomById(code, () => {
        document.getElementById('joinStatusText')!.textContent =
          `Connected to ${code}! Waiting for the Host to DEPLOY...`;
      });
    });

    // CTA 1: SOLO PLAY VS BOTS (Instant Launch)
    document.getElementById('btnSoloPlayBots')!.addEventListener('click', () => {
      this.startMatch('SOLO_BOTS');
    });

    // CTA 2: DEPLOY LOBBY MATCH (host only — button is locked until peers join)
    document.getElementById('btnDeployLobbyMatch')!.addEventListener('click', () => {
      if (btnDeploy.disabled) return;
      this.net.broadcast({
        type: 'START_MATCH',
        mapId: this.selectedMapId,
        mode: this.selectedMode
      });
      this.startMatch(this.selectedMode);
    });

    // HUD Interactive Buttons
    document.getElementById('hudWeaponSwitchBox')!.addEventListener('click', () => {
      this.input.state.switchWeapon = true;
    });
    document.getElementById('btnHudGrenade')!.addEventListener('click', () => {
      this.input.state.throwGrenade = true;
    });
    document.getElementById('btnHudBomb')!.addEventListener('click', () => {
      this.input.state.dropBomb = true;
    });
    document.getElementById('btnHudMedkit')!.addEventListener('click', () => {
      this.input.state.useMedkit = true;
    });
    document.getElementById('btnHudExit')!.addEventListener('click', () => {
      this.isPlaying = false;
      document.getElementById('gameHud')!.style.display = 'none';
      document.getElementById('onboardingScreen')!.style.display = 'flex';
    });
  }

  private drawAvatarPreview() {
    const ctx = this.previewCtx;
    ctx.clearRect(0, 0, 96, 110);
    const roleSpec = ROLES[this.selectedRole];
    this.drawChibiSoldier(
      ctx,
      48,
      78,
      1,
      0,
      roleSpec.uniformColor,
      this.selectedMask,
      this.username,
      false,
      true
    );
  }

  private createSoldier(
    id: string,
    username: string,
    team: 'mili' | 'bandits',
    role: RoleId,
    mask: MaskId,
    x: number,
    y: number,
    isBot: boolean
  ): Soldier {
    const r = ROLES[role];
    const w = WEAPONS[r.startWeapon];
    return {
      id,
      name: this.fullName,
      username,
      team,
      mask,
      role,
      isBot,
      x,
      y,
      vx: 0,
      vy: 0,
      hp: r.baseHp,
      maxHp: r.baseHp,
      overhealHp: 0,
      fuel: r.fuelMax,
      maxFuel: r.fuelMax,
      aimAngle: team === 'mili' ? 0 : Math.PI,
      jetpacking: false,
      onGround: false,
      crouching: false,
      stomping: false,
      slidingTicks: 0,
      invulnTicks: 90, // 1.5s spawn protection
      weaponIdx: r.startWeapon,
      mag: w.magSize,
      reserve: w.reserveMax,
      reloadTicks: 0,
      fireCooldown: 0,
      grenades: 3,
      bombs: r.startBombs,
      medkits: r.startMedkits,
      walkPhase: 0
    };
  }

  public startMatch(mode: MatchModeId) {
    this.selectedMode = mode;
    this.currentMap = MAPS[this.selectedMapId] || MAPS.map_outpost;
    this.weather = WEATHERS[this.currentMap.weather] || WEATHERS.CLEAR;
    this.initWeatherDrops();
    this.matchSeconds = 300; // 5 Minutes
    this.scoreMili = 0;
    this.scoreBandits = 0;
    this.bullets = [];
    this.throwables = [];
    this.particles = [];
    this.floatTexts = [];
    this.shakeTicks = 0;
    this.activePickups = this.currentMap.pickups.map((p) => ({ ...p, active: true, timer: 0 }));

    document.getElementById('onboardingScreen')!.style.display = 'none';
    document.getElementById('gameHud')!.style.display = 'block';
    document.getElementById('hudModeTitle')!.textContent = mode.replace(/_/g, ' ');
    document.getElementById('hudRoleSmall')!.textContent = this.selectedRole;
    document.getElementById('hudWeatherBadge')!.textContent = `WEATHER: ${this.weather.label}`;

    this.player = this.createSoldier(
      'PLAYER_' + Math.floor(Math.random() * 9999),
      this.username,
      'mili',
      this.selectedRole,
      this.selectedMask,
      220,
      360,
      false
    );

    this.soldiers = [this.player];

    // Determine Squad Sizes for 1v1, 2v2, 4v4, or Solo Play vs Bots
    const teamCount =
      mode === '1V1_SOLO' ? 1 : mode === '2V2_DUO' ? 2 : mode === 'SOLO_BOTS' ? 4 : 4;

    const rolesList: RoleId[] = ['MEDIC', 'SURVIVOR', 'RAIDER', 'SCOUT'];
    const masksList: MaskId[] = ['GAS_MASK', 'VISOR', 'SKULL', 'NVG'];

    // Allied Bots
    for (let i = 1; i < teamCount; i++) {
      const r = rolesList[i % 4];
      this.soldiers.push(
        this.createSoldier(
          `ALLY_${i}`,
          `MILI_${r}`,
          'mili',
          r,
          masksList[i % 4],
          140 + i * 95,
          360,
          true
        )
      );
    }

    // Enemy Bots
    for (let i = 0; i < teamCount; i++) {
      const r = rolesList[i % 4];
      this.soldiers.push(
        this.createSoldier(
          `BOT_${i}`,
          `BND_${r}`,
          'bandits',
          r,
          masksList[(i + 1) % 4],
          this.currentMap.worldW - 220 - i * 85,
          320,
          true
        )
      );
    }

    this.isPlaying = true;
  }

  private pushKillfeed(killer: string, action: string, victim: string) {
    const box = document.getElementById('killfeedBox')!;
    const item = document.createElement('div');
    item.style.cssText =
      'background:rgba(0,0,0,0.72); border:1px solid #4a5d43; padding:3px 9px; border-radius:4px; font-size:11px; font-weight:800; color:#fff;';
    item.innerHTML = `<span style="color:#4ade80">${killer}</span> <span style="color:#facc15">${action}</span> <span style="color:#f87171">${victim}</span>`;
    box.prepend(item);
    setTimeout(() => item.remove(), 4000);
  }

  public update() {
    if (!this.isPlaying || this.matchSeconds <= 0) return;
    this.tickCount++;

    const pScreenX = this.player.x - this.camera.x;
    const pScreenY = this.player.y - 24 - this.camera.y;
    const ctrl = this.input.poll(pScreenX, pScreenY);

    this.applySoldierControls(this.player, ctrl);

    for (const s of this.soldiers) {
      if (s.isBot) this.updateBotBrain(s);
      this.stepSoldierPhysics(s);
    }

    // Broadcast Multiplayer State
    if (this.tickCount % 3 === 0) {
      this.net.broadcast({
        type: 'STATE',
        id: this.player.id,
        username: this.player.username,
        team: this.player.team,
        mask: this.player.mask,
        role: this.player.role,
        x: this.player.x,
        y: this.player.y,
        aimAngle: this.player.aimAngle,
        hp: this.player.hp,
        maxHp: this.player.maxHp,
        jetpacking: this.player.jetpacking
      });
    }

    // Update Pickups (Guns, Bombs, Grenades, Medkits, Extra HP Overheal, Nitro Cells)
    for (const pk of this.activePickups) {
      if (!pk.active) {
        pk.timer--;
        if (pk.timer <= 0) pk.active = true;
        continue;
      }
      for (const s of this.soldiers) {
        if (Math.hypot(s.x - pk.x, s.y - 24 - pk.y) < 38) {
          pk.active = false;
          pk.timer = 420;
          if (pk.kind === 'MEDKIT') {
            s.medkits++;
            s.hp = Math.min(s.maxHp, s.hp + 45);
          } else if (pk.kind === 'EXTRA_HP') {
            s.overhealHp = 60; // +60 Cyan Extra HP Shield
          } else if (pk.kind === 'GRENADE') {
            s.grenades += 2;
          } else if (pk.kind === 'BOMB') {
            s.bombs += 2;
          } else if (pk.kind === 'NITRO_CELL') {
            s.fuel = s.maxFuel;
            this.addFloatText(s.x, s.y - 60, '+NITRO', '#38bdf8');
          } else if (pk.kind === 'GUN_RPG') {
            s.weaponIdx = 2;
            s.mag = WEAPONS[2].magSize;
            s.reserve = WEAPONS[2].reserveMax;
          } else if (pk.kind === 'GUN_SNIPER') {
            s.weaponIdx = 1;
            s.mag = WEAPONS[1].magSize;
            s.reserve = WEAPONS[1].reserveMax;
          }
        }
      }
    }

    // Update Bullets — swept segment collision (anti-tunneling for fast rounds)
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.px = b.x;
      b.py = b.y;
      // wind affects slower/explosive projectiles slightly
      if (b.explosive) b.vx += this.weather.wind * 0.004;
      b.x += b.vx;
      b.y += b.vy;
      b.life--;

      let remove = b.life <= 0 || b.x < 0 || b.x > this.currentMap.worldW || b.y < 0 || b.y > this.currentMap.worldH;

      if (!remove) {
        for (const plat of this.currentMap.platforms) {
          if (plat.oneWay) continue;
          if (this.segmentIntersectsRect(b.px, b.py, b.x, b.y, plat.x, plat.y, plat.w, plat.h)) {
            remove = true;
            this.spawnSparks(b.x, b.y, '#cbd5e1', 4);
            if (b.explosive) this.detonateExplosion(b.x, b.y, 135, b.dmg, b.ownerName);
            break;
          }
        }
      }

      if (!remove) {
        for (const s of this.soldiers) {
          if (s.team === b.team) continue;
          const hitH = s.crouching ? 34 : 52;
          if (
            s.invulnTicks <= 0 &&
            this.pointInSoldierBox(b.x, b.y, s.x, s.y, hitH) ||
            this.segmentIntersectsRect(b.px, b.py, b.x, b.y, s.x - 16, s.y - hitH, 32, hitH)
          ) {
            remove = true;
            if (b.explosive) {
              this.detonateExplosion(b.x, b.y, 135, b.dmg, b.ownerName);
            } else {
              // momentum transfer: bullet knockback along its travel vector
              const kb = b.dmg * PHYS.KNOCKBACK_SCALE;
              const mag = Math.hypot(b.vx, b.vy) || 1;
              s.vx += (b.vx / mag) * kb;
              s.vy += (b.vy / mag) * kb * 0.7;
              this.damageSoldier(s, b.dmg, b.ownerName, b.ownerWeapon);
              this.spawnSparks(b.x, b.y, '#ef4444', 6);
            }
            break;
          }
        }
      }

      if (remove) this.bullets.splice(i, 1);
    }

    // Update Throwables (Frag Grenades & Cluster Bombs) — bounce physics with friction
    for (let i = this.throwables.length - 1; i >= 0; i--) {
      const t = this.throwables[i];
      t.vy += PHYS.GRAVITY * 0.95;
      t.vx += this.weather.wind * 0.008;
      t.x += t.vx;
      t.y += t.vy;
      t.fuse--;

      for (const plat of this.currentMap.platforms) {
        if (t.x >= plat.x && t.x <= plat.x + plat.w && t.y >= plat.y - 7 && t.y <= plat.y + 16 && t.vy > 0) {
          t.y = plat.y - 7;
          t.vy *= -0.5 * this.weather.gripMult;
          t.vx *= 0.78 * this.weather.gripMult;
          t.bounces++;
          if (Math.abs(t.vy) < 0.8) t.vy = 0;
        }
      }
      // world bounds bounce
      if (t.x < 8 || t.x > this.currentMap.worldW - 8) {
        t.vx *= -0.6;
        t.x = Math.max(8, Math.min(this.currentMap.worldW - 8, t.x));
      }

      if (t.fuse <= 0) {
        this.detonateExplosion(
          t.x,
          t.y,
          t.isClusterBomb ? 185 : 140,
          t.isClusterBomb ? 120 : 90,
          t.ownerName
        );
        if (t.isClusterBomb) {
          // cluster bomb fragments scatter after the main blast
          for (let f = 0; f < 5; f++) {
            const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
            const spd = 5 + Math.random() * 5;
            this.bullets.push({
              x: t.x, y: t.y - 6, px: t.x, py: t.y - 6,
              vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
              dmg: 12, team: t.team, ownerName: t.ownerName, ownerWeapon: 'CLUSTER FRAG',
              color: '#fb923c', explosive: false, life: 30
            });
          }
        }
        this.throwables.splice(i, 1);
      }
    }

    // Update Particles (with light gravity for debris)
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const pt = this.particles[i];
      pt.vy += 0.06;
      pt.x += pt.vx;
      pt.y += pt.vy;
      pt.life--;
      if (pt.life <= 0) this.particles.splice(i, 1);
    }

    // Update Floating Damage Texts
    for (let i = this.floatTexts.length - 1; i >= 0; i--) {
      const ft = this.floatTexts[i];
      ft.y -= 0.9;
      ft.life--;
      if (ft.life <= 0) this.floatTexts.splice(i, 1);
    }

    // Update Weather particles (screen-space, camera independent)
    this.updateWeatherDrops();

    // Decay screen shake
    if (this.shakeTicks > 0) this.shakeTicks--;

    // Smooth Camera with Look-Ahead
    const targetCamX = this.player.x + Math.cos(this.player.aimAngle) * 110 - this.canvas.width / 2;
    const targetCamY = this.player.y + Math.sin(this.player.aimAngle) * 70 - this.canvas.height / 2;
    this.camera.x += (targetCamX - this.camera.x) * 0.14;
    this.camera.y += (targetCamY - this.camera.y) * 0.14;
    this.camera.x = Math.max(0, Math.min(this.currentMap.worldW - this.canvas.width, this.camera.x));
    this.camera.y = Math.max(0, Math.min(this.currentMap.worldH - this.canvas.height, this.camera.y));

    this.syncHudDOM();
  }

  private applySoldierControls(s: Soldier, ctrl: typeof this.input.state) {
    const r = ROLES[s.role];
    s.aimAngle = ctrl.aimAngle;
    s.crouching = ctrl.crouch;

    // ---- Horizontal movement with acceleration / friction (mass-based feel) ----
    const crouchMult = ctrl.crouch ? PHYS.CROUCH_SPEED_MULT : 1;
    const targetVx = ctrl.moveX * r.speed * crouchMult;
    const accel = s.onGround ? 0.85 : 0.42; // air control is weaker
    s.vx += (targetVx - s.vx) * accel;

    // Sprint -> slide: crouching while moving fast gives a momentum boost burst
    if (ctrl.crouch && s.onGround && Math.abs(s.vx) > r.speed * 0.9 && s.slidingTicks <= 0) {
      s.slidingTicks = 22;
      s.vx *= PHYS.SLIDE_BOOST;
    }
    if (s.slidingTicks > 0) s.slidingTicks--;

    // Ground friction when no input (slippery in rain/snow weather)
    if (ctrl.moveX === 0 && s.onGround) {
      s.vx *= PHYS.GROUND_FRICTION * this.weather.gripMult + (1 - this.weather.gripMult) * 0.97;
    }
    if (!s.onGround) s.vx *= PHYS.AIR_DRAG_X;

    // ---- Jetpack thrust (thrust vs gravity, fuel burn scales with role) ----
    if (ctrl.jetpack && s.fuel > 0) {
      s.jetpacking = true;
      s.vy = Math.max(-PHYS.JET_MAX_UP, s.vy - PHYS.JET_THRUST);
      s.fuel = Math.max(0, s.fuel - 0.52);
      this.particles.push({
        x: s.x - (Math.cos(s.aimAngle) >= 0 ? 12 : -12),
        y: s.y - 12,
        vx: (Math.random() - 0.5) * 1.8,
        vy: 2.8 + Math.random() * 2,
        color: Math.random() > 0.4 ? '#38bdf8' : '#facc15',
        life: 10,
        size: 3.5
      });
    } else {
      s.jetpacking = false;
      s.fuel = Math.min(s.maxFuel, s.fuel + (s.onGround ? 0.65 : 0.2));
    }

    // ---- Held-down super dive (Mini Militia style D-pad down in air) ----
    s.stomping = ctrl.crouch && !s.onGround;
    if (s.stomping) {
      s.vy = Math.min(PHYS.TERMINAL_DROP, s.vy + PHYS.GRAVITY * 1.6);
    }

    if (ctrl.switchWeapon) {
      ctrl.switchWeapon = false;
      s.weaponIdx = (s.weaponIdx + 1) % WEAPONS.length;
      s.mag = WEAPONS[s.weaponIdx].magSize;
      s.reserve = WEAPONS[s.weaponIdx].reserveMax;
    }

    if (ctrl.reload && s.reloadTicks <= 0 && s.mag < WEAPONS[s.weaponIdx].magSize) {
      ctrl.reload = false;
      s.reloadTicks = WEAPONS[s.weaponIdx].reloadTicks;
    }

    if (ctrl.shoot) {
      this.fireWeapon(s);
    }

    if (ctrl.throwGrenade) {
      ctrl.throwGrenade = false;
      if (s.grenades > 0) {
        s.grenades--;
        this.throwables.push({
          x: s.x,
          y: s.y - 26,
          vx: Math.cos(s.aimAngle) * 12,
          vy: Math.sin(s.aimAngle) * 12 - 2.5,
          team: s.team,
          ownerName: s.username,
          isClusterBomb: false,
          fuse: 95,
          bounces: 0
        });
      }
    }

    if (ctrl.dropBomb) {
      ctrl.dropBomb = false;
      if (s.bombs > 0) {
        s.bombs--;
        this.throwables.push({
          x: s.x,
          y: s.y - 20,
          vx: Math.cos(s.aimAngle) * 8,
          vy: -3,
          team: s.team,
          ownerName: s.username,
          isClusterBomb: true,
          fuse: 75,
          bounces: 0
        });
      }
    }

    if (ctrl.useMedkit) {
      ctrl.useMedkit = false;
      if (s.medkits > 0 && s.hp < s.maxHp) {
        s.medkits--;
        s.hp = Math.min(s.maxHp, s.hp + 60);
        this.addFloatText(s.x, s.y - 60, '+60', '#4ade80');
      }
    }
  }

  private updateBotBrain(bot: Soldier) {
    let target: Soldier | null = null;
    let bestD = 99999;
    for (const other of this.soldiers) {
      if (other.team === bot.team) continue;
      const d = Math.hypot(other.x - bot.x, other.y - bot.y);
      if (d < bestD) {
        bestD = d;
        target = other;
      }
    }
    if (!target) return;

    const dx = target.x - bot.x;
    const dy = target.y - bot.y;
    // lead the target slightly based on relative velocity (bots aim smarter)
    const lead = Math.min(bestD / WEAPONS[bot.weaponIdx].speed, 12);
    const lx = target.x + target.vx * lead - bot.x;
    const ly = target.y + target.vy * lead * 0.5 - 26 - bot.y;
    bot.aimAngle = Math.atan2(ly, lx) + Math.sin(this.tickCount * 0.05) * 0.05;

    // bots use acceleration-based movement too
    const desiredVx = Math.abs(dx) > 170 ? Math.sign(dx) * (ROLES[bot.role].speed * 0.72) : 0;
    bot.vx += (desiredVx - bot.vx) * (bot.onGround ? 0.6 : 0.3);
    bot.crouching = false;
    bot.stomping = false;

    if ((dy < -75 && bot.fuel > 25) || bot.y > this.currentMap.worldH - 120) {
      bot.jetpacking = true;
      bot.vy = Math.max(-PHYS.JET_MAX_UP * 0.85, bot.vy - PHYS.JET_THRUST * 0.9);
      bot.fuel = Math.max(0, bot.fuel - 0.45);
    } else {
      bot.jetpacking = false;
      bot.fuel = Math.min(bot.maxFuel, bot.fuel + 0.5);
    }

    // accuracy gated by distance; wind/weather makes bots miss more in storms
    const accNoise = this.weather.particleCount > 0 ? 0.1 : 0.04;
    if (bestD < 640 && Math.random() < 0.12 && Math.abs(bot.aimAngle) < Math.PI) {
      bot.aimAngle += (Math.random() - 0.5) * accNoise;
      this.fireWeapon(bot);
    }
  }

  private stepSoldierPhysics(s: Soldier) {
    if (s.fireCooldown > 0) s.fireCooldown--;
    if (s.invulnTicks > 0) s.invulnTicks--;
    if (s.reloadTicks > 0) {
      s.reloadTicks--;
      if (s.reloadTicks === 0) {
        const w = WEAPONS[s.weaponIdx];
        const needed = w.magSize - s.mag;
        const take = Math.min(needed, s.reserve);
        s.mag += take;
        s.reserve -= take;
      }
    }

    const prevY = s.y;
    const wasAirborne = !s.onGround;
    s.vy = Math.min(s.stomping ? PHYS.TERMINAL_DROP : PHYS.MAX_FALL, s.vy + PHYS.GRAVITY);
    s.x = Math.max(24, Math.min(this.currentMap.worldW - 24, s.x + s.vx));
    s.y += s.vy;
    if (Math.abs(s.vx) > 0.2) s.walkPhase += 0.22;

    s.onGround = false;
    for (const plat of this.currentMap.platforms) {
      if (s.x + 15 > plat.x && s.x - 15 < plat.x + plat.w) {
        if (s.vy >= 0 && prevY <= plat.y + 10 && s.y >= plat.y) {
          // ---- Landing resolution: stomp slam, fall damage, or soft landing ----
          const impact = s.vy;
          s.y = plat.y;
          s.onGround = true;

          if (wasAirborne && s.stomping && impact > 8) {
            // SUPER STOMP: bounce up a little, shockwave damages & launches nearby enemies
            s.vy = -PHYS.STOMP_BOUNCE * 0.45;
            this.detonateExplosion(s.x, s.y, 110, 30 + impact * 3, s.username);
            this.requestShake(14, 8);
            this.spawnSparks(s.x, s.y, '#fde047', 14);
          } else if (wasAirborne && impact > PHYS.FALL_DMG_MIN) {
            // hard fall damage scaled by impact speed (mitigated by jet braking)
            const dmg = Math.round((impact - PHYS.FALL_DMG_MIN) * PHYS.FALL_DMG_SCALE);
            this.damageSoldier(s, dmg, 'GRAVITY', 'FALL DAMAGE');
            this.requestShake(8, 5);
            this.spawnSparks(s.x, s.y, '#a8a29e', 8);
            s.vy = 0;
          } else {
            s.vy = 0;
            if (wasAirborne && impact > 6) this.spawnSparks(s.x, s.y, '#d6d3d1', 4);
          }
          s.stomping = false;
        }
      }
    }

    // 4v4 WITHOUT RULES: Team Bases & Role Healing Aura
    if (this.selectedMode === '4V4_WITHOUT_RULES' && this.tickCount % 60 === 0) {
      for (const b of this.currentMap.bases) {
        if (b.team === s.team && s.x >= b.x && s.x <= b.x + b.w && s.y >= b.y && s.y <= b.y + b.h) {
          s.hp = Math.min(s.maxHp, s.hp + 8);
        }
      }
      if (s.role === 'MEDIC') {
        for (const ally of this.soldiers) {
          if (ally.team === s.team && Math.hypot(ally.x - s.x, ally.y - s.y) < 160) {
            ally.hp = Math.min(ally.maxHp, ally.hp + 5);
          }
        }
      }
    }
  }

  private fireWeapon(s: Soldier) {
    if (s.fireCooldown > 0 || s.reloadTicks > 0) return;
    const w = WEAPONS[s.weaponIdx];
    if (s.mag <= 0) {
      s.reloadTicks = w.reloadTicks;
      return;
    }

    s.mag--;
    s.fireCooldown = w.fireRate;

    // ---- Recoil physics: free-body soldiers are pushed back by every shot ----
    const inAir = !s.onGround;
    const recoilMult = inAir ? 0.5 : 0.18;
    s.vx -= Math.cos(s.aimAngle) * w.recoil * recoilMult;
    if (inAir) s.vy -= Math.sin(s.aimAngle) * w.recoil * 0.4;
    // ground weapons climb a bit (visual aim kick only for the player's feel)
    if (!inAir && w.fireRate < 12) s.aimAngle += (Math.random() - 0.3) * 0.012 * w.recoil;

    // muzzle flash particles at barrel tip
    const mx = s.x + Math.cos(s.aimAngle) * 30;
    const my = s.y - 26 + Math.sin(s.aimAngle) * 30;
    this.particles.push({
      x: mx, y: my,
      vx: Math.cos(s.aimAngle) * 2, vy: Math.sin(s.aimAngle) * 2 - 0.5,
      color: '#fde68a', life: 5, size: 5
    });

    for (let i = 0; i < w.pellets; i++) {
      const ang = s.aimAngle + (Math.random() - 0.5) * w.spread;
      const bx = s.x + Math.cos(s.aimAngle) * 28;
      const by = s.y - 26 + Math.sin(s.aimAngle) * 28;
      this.bullets.push({
        x: bx,
        y: by,
        px: bx,
        py: by,
        vx: Math.cos(ang) * w.speed,
        vy: Math.sin(ang) * w.speed,
        dmg: w.damage,
        team: s.team,
        ownerName: s.username,
        ownerWeapon: w.name,
        color: w.color,
        explosive: w.explosive,
        life: 65
      });
    }
  }

  private detonateExplosion(x: number, y: number, radius: number, maxDmg: number, ownerName: string) {
    // screen shake proportional to blast size, stronger when close to player
    const distToPlayer = Math.hypot(this.player.x - x, this.player.y - 24 - y);
    const proximity = Math.max(0, 1 - distToPlayer / 700);
    this.requestShake(Math.round(radius * 0.09), 6 + proximity * 10);

    for (let i = 0; i < 28; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 1 + Math.random() * 6;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * spd,
        vy: Math.sin(a) * spd - 1,
        color: i % 2 === 0 ? '#f97316' : '#fde047',
        life: 22,
        size: 3 + Math.random() * 3
      });
    }
    // shockwave ring
    this.particles.push({ x, y, vx: 0, vy: 0, color: 'ring', life: 12, size: radius });

    for (const s of this.soldiers) {
      const d = Math.hypot(s.x - x, s.y - 24 - y);
      if (d < radius) {
        const falloff = 1 - d / radius;
        // proper radial impulse: direction away from blast center
        const nx = (s.x - x) / (d || 1);
        const ny = (s.y - 24 - y) / (d || 1);
        s.vx += nx * 10 * falloff;
        s.vy -= (4 + 6 * falloff) * Math.max(0.3, 1 - ny < 0 ? 0 : 1) * falloff + 3 * falloff;
        this.damageSoldier(s, Math.round(maxDmg * falloff), ownerName, 'EXPLOSION');
      }
    }
  }

  private damageSoldier(victim: Soldier, amount: number, attacker: string, weaponLabel: string) {
    if (victim.invulnTicks > 0 && weaponLabel !== 'FALL DAMAGE') return;

    let rem = amount;
    if (victim.overhealHp > 0) {
      const absorbed = Math.min(victim.overhealHp, rem);
      victim.overhealHp -= absorbed;
      rem -= absorbed;
    }
    victim.hp -= rem;
    this.addFloatText(victim.x, victim.y - 66, `-${Math.round(amount)}`, victim === this.player ? '#f87171' : '#fbbf24');

    if (victim.hp <= 0) {
      if (victim.team === 'bandits') this.scoreMili++;
      else this.scoreBandits++;

      this.pushKillfeed(attacker, `[${weaponLabel}]`, victim.username);

      // death burst
      for (let i = 0; i < 16; i++) {
        const a = Math.random() * Math.PI * 2;
        this.particles.push({
          x: victim.x, y: victim.y - 30,
          vx: Math.cos(a) * (1 + Math.random() * 4), vy: Math.sin(a) * (1 + Math.random() * 4) - 2,
          color: victim.team === 'mili' ? '#4ade80' : '#ef4444', life: 20, size: 3
        });
      }

      victim.hp = victim.maxHp;
      victim.overhealHp = 0;
      victim.fuel = victim.maxFuel;
      victim.invulnTicks = 90; // respawn spawn-protection
      victim.x = victim.team === 'mili' ? 180 + Math.random() * 220 : this.currentMap.worldW - 220 - Math.random() * 220;
      victim.y = 260;
      victim.vx = 0;
      victim.vy = 0;
    }
  }

  // ==================== NEW FEATURE HELPERS ====================

  private requestShake(ticks: number, mag: number) {
    this.shakeTicks = Math.max(this.shakeTicks, ticks);
    this.shakeMag = Math.max(this.shakeMag, mag);
  }

  private spawnSparks(x: number, y: number, color: string, count: number) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const spd = 1 + Math.random() * 3;
      this.particles.push({ x, y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd - 1, color, life: 12, size: 2.5 });
    }
  }

  private addFloatText(x: number, y: number, text: string, color: string) {
    if (this.floatTexts.length > 40) this.floatTexts.shift();
    this.floatTexts.push({ x, y, text, color, life: 45 });
  }

  private initWeatherDrops() {
    this.weatherDrops = [];
    for (let i = 0; i < this.weather.particleCount; i++) {
      this.weatherDrops.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        v: this.weather.particleSpeed * (0.7 + Math.random() * 0.6),
        drift: (Math.random() - 0.5) * 1.5
      });
    }
  }

  private updateWeatherDrops() {
    if (this.weatherDrops.length === 0) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    for (const d of this.weatherDrops) {
      d.y += d.v;
      d.x += this.weather.wind + d.drift;
      if (d.y > h) { d.y = -10; d.x = Math.random() * w; }
      if (d.x > w + 20) d.x = -20;
      if (d.x < -20) d.x = w + 20;
    }
  }

  // swept collision: does segment (x1,y1)-(x2,y2) cross rectangle?
  private segmentIntersectsRect(x1: number, y1: number, x2: number, y2: number, rx: number, ry: number, rw: number, rh: number): boolean {
    if (this.pointInRect(x1, y1, rx, ry, rw, rh) || this.pointInRect(x2, y2, rx, ry, rw, rh)) return true;
    return (
      this.segmentsCross(x1, y1, x2, y2, rx, ry, rx + rw, ry) ||
      this.segmentsCross(x1, y1, x2, y2, rx + rw, ry, rx + rw, ry + rh) ||
      this.segmentsCross(x1, y1, x2, y2, rx + rw, ry + rh, rx, ry + rh) ||
      this.segmentsCross(x1, y1, x2, y2, rx, ry + rh, rx, ry)
    );
  }

  private pointInRect(px: number, py: number, rx: number, ry: number, rw: number, rh: number): boolean {
    return px >= rx && px <= rx + rw && py >= ry && py <= ry + rh;
  }

  private pointInSoldierBox(px: number, py: number, sx: number, sy: number, hitH: number): boolean {
    return Math.abs(px - sx) < 18 && py >= sy - hitH && py <= sy;
  }

  private segmentsCross(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): boolean {
    const d1 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    const d2 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
    const d3 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
    const d4 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  }

  private syncHudDOM() {
    const p = this.player;
    const w = WEAPONS[p.weaponIdx];
    document.getElementById('hudScoreMili')!.textContent = String(this.scoreMili);
    document.getElementById('hudScoreBandits')!.textContent = String(this.scoreBandits);
    document.getElementById('hudHpNumbers')!.textContent = `${Math.ceil(p.hp)}/${p.maxHp}`;
    document.getElementById('hudHpFill')!.style.width = `${(p.hp / p.maxHp) * 100}%`;
    document.getElementById('hudOverhealFill')!.style.width = `${(p.overhealHp / 60) * 100}%`;
    document.getElementById('hudOverhealTag')!.style.display = p.overhealHp > 0 ? 'inline' : 'none';
    document.getElementById('hudJetFill')!.style.width = `${(p.fuel / p.maxFuel) * 100}%`;
    document.getElementById('hudGunName')!.textContent = w.name;
    document.getElementById('hudAmmoText')!.textContent =
      p.reloadTicks > 0 ? 'RELOADING...' : `${p.mag} / ${p.reserve}`;
    document.getElementById('hudNadeCount')!.textContent = String(p.grenades);
    document.getElementById('hudBombCount')!.textContent = String(p.bombs);
    document.getElementById('hudMedCount')!.textContent = String(p.medkits);
    document.getElementById('hudInputBadge')!.textContent = `INPUT: ${this.input.state.deviceLabel.toUpperCase()}`;
  }

  public render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (!this.isPlaying) return;

    const m = this.currentMap;
    ctx.save();
    // screen shake offset (decays with shakeTicks)
    const shX = this.shakeTicks > 0 ? (Math.random() - 0.5) * this.shakeMag : 0;
    const shY = this.shakeTicks > 0 ? (Math.random() - 0.5) * this.shakeMag : 0;
    ctx.translate(-this.camera.x + shX, -this.camera.y + shY);

    // 1. Sky Gradient
    const sky = ctx.createLinearGradient(0, 0, 0, m.worldH);
    sky.addColorStop(0, m.skyTop);
    sky.addColorStop(1, m.skyBottom);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, m.worldW, m.worldH);

    // 2. Jagged Mountain Ridges (All 3 Maps)
    ctx.fillStyle = m.mountainFar;
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, m.worldH);
    for (const [px, py] of m.peaks) {
      ctx.lineTo(px, py);
    }
    ctx.lineTo(m.worldW, m.worldH);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Mid-Layer Mountain Foothills
    ctx.fillStyle = m.mountainMid;
    ctx.beginPath();
    ctx.moveTo(0, m.worldH);
    for (const [px, py] of m.peaks) {
      ctx.lineTo(px, py + 155);
    }
    ctx.lineTo(m.worldW, m.worldH);
    ctx.closePath();
    ctx.fill();

    // 3. Team Bases (Visible in 4v4 Without Rules: Bases & Roles)
    if (this.selectedMode === '4V4_WITHOUT_RULES') {
      for (const base of m.bases) {
        ctx.fillStyle =
          base.team === 'mili' ? 'rgba(34, 197, 94, 0.14)' : 'rgba(239, 68, 68, 0.14)';
        ctx.strokeStyle = base.team === 'mili' ? '#4ade80' : '#f87171';
        ctx.lineWidth = 2.5;
        ctx.fillRect(base.x, base.y, base.w, base.h);
        ctx.strokeRect(base.x, base.y, base.w, base.h);

        ctx.fillStyle = '#fff';
        ctx.font = "800 13px 'Black Ops One', sans-serif";
        ctx.textAlign = 'center';
        ctx.fillText(base.label, base.x + base.w / 2, base.y + 20);
      }
    }

    // 4. Platforms
    for (const p of m.platforms) {
      ctx.fillStyle = p.color;
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 3;
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.strokeRect(p.x, p.y, p.w, p.h);

      ctx.fillStyle = p.grassColor;
      ctx.fillRect(p.x, p.y, p.w, 8);
    }

    // 5. Pickups (Guns, Bombs, Grenades, Medkits, Extra HP, Nitro Cells)
    for (const pk of this.activePickups) {
      if (!pk.active) continue;
      ctx.save();
      ctx.translate(pk.x, pk.y + Math.sin(this.tickCount * 0.08) * 4);
      ctx.fillStyle =
        pk.kind === 'EXTRA_HP' || pk.kind === 'NITRO_CELL'
          ? '#38bdf8'
          : pk.kind === 'MEDKIT'
          ? '#4ade80'
          : '#facc15';
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2.5;
      ctx.fillRect(-14, -14, 28, 28);
      ctx.strokeRect(-14, -14, 28, 28);
      ctx.fillStyle = '#000';
      ctx.font = '900 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(pk.kind.replace('GUN_', '').replace('_CELL', ''), 0, 4);
      ctx.restore();
    }

    // 6. Soldiers
    for (const s of this.soldiers) {
      this.drawSoldierInWorld(ctx, s);
    }
    for (const rp of Object.values(this.remotePeers)) {
      this.drawChibiSoldier(
        ctx,
        rp.x,
        rp.y,
        Math.cos(rp.aimAngle) >= 0 ? 1 : -1,
        rp.aimAngle,
        '#4d7c0f',
        rp.mask || 'GAS_MASK',
        rp.username || 'PEER',
        rp.jetpacking,
        false
      );
    }

    // 7. Bullets & Throwables
    for (const b of this.bullets) {
      ctx.strokeStyle = b.color;
      ctx.lineWidth = b.explosive ? 5 : 3;
      ctx.beginPath();
      ctx.moveTo(b.x, b.y);
      ctx.lineTo(b.x - b.vx * 0.7, b.y - b.vy * 0.7);
      ctx.stroke();
    }

    for (const t of this.throwables) {
      ctx.fillStyle = t.isClusterBomb ? '#ea580c' : '#15803d';
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.isClusterBomb ? 9 : 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    for (const pt of this.particles) {
      if (pt.color === 'ring') {
        // expanding shockwave ring
        ctx.strokeStyle = `rgba(249, 115, 22, ${pt.life / 12})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size * (1 - pt.life / 12), 0, Math.PI * 2);
        ctx.stroke();
        continue;
      }
      ctx.fillStyle = pt.color;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, pt.size || 3.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Floating damage / pickup numbers
    ctx.font = '900 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#000';
    for (const ft of this.floatTexts) {
      ctx.globalAlpha = Math.min(1, ft.life / 20);
      ctx.strokeText(ft.text, ft.x, ft.y);
      ctx.fillStyle = ft.color;
      ctx.fillText(ft.text, ft.x, ft.y);
    }
    ctx.globalAlpha = 1;

    ctx.restore();

    // ==================== SCREEN-SPACE POST FX ====================
    // Weather particles + visibility overlay (drawn over the world, under HUD sticks)
    if (this.weatherDrops.length > 0) {
      ctx.save();
      ctx.strokeStyle = this.weather.particleColor;
      ctx.lineWidth = this.weather.id === 'RAIN' ? 1.6 : 2.4;
      ctx.beginPath();
      for (const d of this.weatherDrops) {
        if (this.weather.id === 'RAIN') {
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(d.x - this.weather.wind * 1.6, d.y - d.v * 1.4);
        } else {
          ctx.moveTo(d.x, d.y);
          ctx.lineTo(d.x + d.drift, d.y + 2);
        }
      }
      ctx.stroke();
      ctx.restore();
    }
    if (this.weather.visibilityOverlay !== 'rgba(0,0,0,0)') {
      ctx.fillStyle = this.weather.visibilityOverlay;
      ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    // Crosshair for KB+Mouse
    if (!this.input.isTouchActive && this.input.state.deviceLabel === 'KB + Mouse') {
      const cxp = this.player.x - this.camera.x;
      const cyp = this.player.y - 24 - this.camera.y;
      const tx = this.input.mouseAimX ?? cxp;
      const ty = this.input.mouseAimY ?? cyp;
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(tx, ty, 9, 0, Math.PI * 2);
      ctx.moveTo(tx - 14, ty); ctx.lineTo(tx - 5, ty);
      ctx.moveTo(tx + 5, ty); ctx.lineTo(tx + 14, ty);
      ctx.moveTo(tx, ty - 14); ctx.lineTo(tx, ty - 5);
      ctx.moveTo(tx, ty + 5); ctx.lineTo(tx, ty + 14);
      ctx.stroke();
      ctx.restore();
    }

    // 8. Android Touch Thumbsticks Overlay
    this.input.drawTouchSticks(ctx);
  }

  private drawSoldierInWorld(ctx: CanvasRenderingContext2D, s: Soldier) {
    const facing = Math.cos(s.aimAngle) >= 0 ? 1 : -1;
    const w = WEAPONS[s.weaponIdx];

    // Spawn protection shimmer ring
    if (s.invulnTicks > 0) {
      ctx.save();
      ctx.strokeStyle = `rgba(56, 189, 248, ${0.3 + 0.3 * Math.sin(this.tickCount * 0.3)})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(s.x, s.y - 28, 34, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Laser Sight
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(s.x + Math.cos(s.aimAngle) * 26, s.y - 26 + Math.sin(s.aimAngle) * 26);
    ctx.lineTo(
      s.x + Math.cos(s.aimAngle) * w.laserLen,
      s.y - 26 + Math.sin(s.aimAngle) * w.laserLen
    );
    ctx.strokeStyle = w.laserColor;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    this.drawChibiSoldier(
      ctx,
      s.x,
      s.y,
      facing,
      s.aimAngle,
      s.team === 'mili' ? ROLES[s.role].uniformColor : '#7f1d1d',
      s.mask,
      `${s.username} [${s.role[0]}]`,
      s.jetpacking,
      s === this.player,
      s.crouching,
      s.slidingTicks > 0,
      s.walkPhase,
      s.vx,
      s.vy,
      s.onGround
    );

    // Overhead Health & Overheal Bar
    ctx.save();
    ctx.translate(s.x, s.y - 72);
    ctx.fillStyle = '#000';
    ctx.fillRect(-23, 0, 46, 6);
    ctx.fillStyle = s.team === 'mili' ? '#4ade80' : '#ef4444';
    ctx.fillRect(-22, 1, 44 * (s.hp / s.maxHp), 4);
    if (s.overhealHp > 0) {
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(-22, -3, 44 * (s.overhealHp / 60), 3);
    }
    ctx.restore();
  }

  private drawChibiSoldier(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    facing: number,
    aimAngle: number,
    uniformColor: string,
    mask: MaskId,
    label: string,
    jetpacking: boolean,
    usePhoto: boolean,
    crouching = false,
    sliding = false,
    walkPhase = 0,
    vx = 0,
    vy = 0,
    onGround = true
  ) {
    ctx.save();
    ctx.translate(x, y);

    // ==================== MOTION RIG ====================
    // squash & stretch from vertical velocity (stretch when fast in air, squash on hard landings)
    let sqX = 1;
    let sqY = 1;
    if (!onGround) {
      const st = Math.min(0.16, Math.abs(vy) * 0.012);
      sqX = 1 - st;
      sqY = 1 + st;
    }
    // crouch pose: compressed torso, raised knees
    if (crouching) {
      sqX *= 1.14;
      sqY *= 0.78;
    }
    // slide lean: tilt the whole body in travel direction, slight forward stretch
    if (sliding) {
      ctx.rotate(facing * 0.28);
      sqX *= 1.1;
      sqY *= 0.9;
    }
    // speed lean while running
    const lean = Math.max(-0.16, Math.min(0.16, vx * 0.018)) * (crouching ? 0.4 : 1);
    ctx.rotate(lean);
    ctx.scale(sqX, sqY);

    // walking bob (subtle vertical bounce synced to gait)
    const bob = onGround && Math.abs(vx) > 0.6 && !crouching ? Math.sin(walkPhase * 2) * 1.6 : 0;
    ctx.translate(0, -bob);

    // swing amplitudes for limbs / gun arm
    const swing = onGround && Math.abs(vx) > 0.6 ? Math.sin(walkPhase) : 0;

    // ==================== JETPACK TANK & ROCKET BOOTS ====================
    ctx.fillStyle = '#52525b';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2.5;
    ctx.fillRect(-facing * 16 - 5, -38, 10, 22);
    ctx.strokeRect(-facing * 16 - 5, -38, 10, 22);
    // tank valve detail
    ctx.fillStyle = '#a1a1aa';
    ctx.fillRect(-facing * 16 - 3, -41, 6, 4);

    if (jetpacking) {
      // flickering twin-cone flame (outer orange + inner blue core)
      const flick = 0.75 + Math.random() * 0.5;
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.moveTo(-facing * 16 - 5, -16);
      ctx.lineTo(-facing * 16 + 5, -16);
      ctx.lineTo(-facing * 16, 2 + 12 * flick);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#7dd3fc';
      ctx.beginPath();
      ctx.moveTo(-facing * 16 - 2.5, -16);
      ctx.lineTo(-facing * 16 + 2.5, -16);
      ctx.lineTo(-facing * 16, -4 + 7 * flick);
      ctx.closePath();
      ctx.fill();
    }

    // ==================== LEGS (animated two-leg gait) ====================
    const kneeUp = crouching ? 5 : 0;
    const legLift = sliding ? 0 : swing * 3;
    ctx.fillStyle = '#1c1917';
    // back leg
    ctx.save();
    ctx.translate(-6, -13 + kneeUp);
    ctx.fillRect(0, 0 - Math.max(0, legLift), 8, 13 - kneeUp + Math.max(0, legLift) * 0);
    ctx.strokeRect(0, 0, 8, 13 - kneeUp);
    ctx.restore();
    // front leg
    ctx.save();
    ctx.translate(2, -13 + kneeUp);
    ctx.fillRect(0, 0 - Math.max(0, -legLift), 8, 13 - kneeUp);
    ctx.strokeRect(0, 0, 8, 13 - kneeUp);
    ctx.restore();
    // boot soles (red tread accent)
    ctx.fillStyle = '#7f1d1d';
    ctx.fillRect(-6, -2, 8, 2);
    ctx.fillRect(2, -2, 8, 2);

    // ==================== TORSO ====================
    ctx.fillStyle = uniformColor;
    ctx.fillRect(-12, -36, 24, 24);
    ctx.strokeRect(-12, -36, 24, 24);
    // chest strap + pouches for military detail
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-facing * 11, -33);
    ctx.lineTo(facing * 11, -16);
    ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(-9, -20, 7, 6);
    ctx.fillRect(2, -20, 7, 6);
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2.5;

    // ==================== HEAD (big chibi cranium) ====================
    ctx.save();
    // head lags a touch behind body motion for secondary-animation feel
    ctx.translate(-lean * 26 + swing * 1.2, -48);
    ctx.beginPath();
    ctx.arc(0, 0, 14, 0, Math.PI * 2);
    ctx.fillStyle = '#e0b187';
    ctx.fill();
    ctx.stroke();

    // Optional Player Photograph Clipped Inside Head
    if (usePhoto && this.playerPhotoImg) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, 13, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(this.playerPhotoImg, -14, -14, 28, 28);
      ctx.restore();
    }

    // Tactical Mask Overlay (follows facing)
    ctx.scale(facing, 1);
    if (mask === 'GAS_MASK') {
      ctx.fillStyle = '#27272a';
      ctx.beginPath();
      ctx.arc(3, 2, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#84cc16';
      ctx.beginPath();
      ctx.arc(5, -1, 3.5, 0, Math.PI * 2);
      ctx.fill();
      // filter canister
      ctx.fillStyle = '#3f3f46';
      ctx.beginPath();
      ctx.arc(9, 6, 3, 0, Math.PI * 2);
      ctx.fill();
    } else if (mask === 'VISOR') {
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(-2, -6, 14, 6);
      ctx.strokeRect(-2, -6, 14, 6);
      // visor glare streak
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillRect(0, -5, 4, 1.6);
    } else if (mask === 'SKULL') {
      ctx.fillStyle = '#18181b';
      ctx.fillRect(-4, -2, 15, 10);
      ctx.fillStyle = '#facc15';
      ctx.fillRect(2, 1, 7, 4);
    } else if (mask === 'NVG') {
      ctx.fillStyle = '#22c55e';
      ctx.beginPath();
      ctx.arc(3, -3, 3.5, 0, Math.PI * 2);
      ctx.arc(9, -3, 3.5, 0, Math.PI * 2);
      ctx.fill();
      // green glow pupils
      ctx.fillStyle = '#bbf7d0';
      ctx.beginPath();
      ctx.arc(3.5, -3.5, 1.2, 0, Math.PI * 2);
      ctx.arc(9.5, -3.5, 1.2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // NO_MASK fallback: determined little eye + mouth so the face is never blank
      ctx.fillStyle = '#18181b';
      ctx.beginPath();
      ctx.arc(5, -2, 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(2, 5, 8, 1.6);
    }

    // Helmet Dome + rim + strap
    ctx.fillStyle = uniformColor;
    ctx.beginPath();
    ctx.arc(0, -3, 14.5, Math.PI, 0);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.arc(-3, -8, 5, Math.PI, 0);
    ctx.fill();
    ctx.strokeStyle = '#1c1917';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-10, -2);
    ctx.quadraticCurveTo(-12, 8, -6, 11);
    ctx.stroke();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2.5;
    ctx.restore();

    // ==================== GUN & ARMS (two-handed grip, sway with gait) ====================
    ctx.save();
    ctx.translate(swing * 1.5, -26 + (crouching ? 6 : 0));
    ctx.rotate(aimAngle);
    if (Math.cos(aimAngle) < 0) ctx.scale(1, -1);
    // arms (skin/uniform sleeves reaching to the foregrip)
    ctx.fillStyle = uniformColor;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.fillRect(6, -2, 10, 5);
    ctx.strokeRect(6, -2, 10, 5);
    ctx.fillRect(16, 1, 8, 4);
    ctx.strokeRect(16, 1, 8, 4);
    // receiver
    ctx.fillStyle = '#18181b';
    ctx.fillRect(4, -4, 26, 7);
    ctx.strokeRect(4, -4, 26, 7);
    // barrel + muzzle brake + foregrip details
    ctx.fillRect(30, -2, 8, 3);
    ctx.strokeRect(30, -2, 8, 3);
    ctx.fillRect(14, 3, 4, 6);
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(28, -3.4, 2, 1.6);
    ctx.restore();

    // ==================== SLIDE DUST PUFFS ====================
    if (sliding) {
      ctx.fillStyle = 'rgba(214, 211, 209, 0.5)';
      for (let d = 0; d < 3; d++) {
        ctx.beginPath();
        ctx.arc(-facing * (16 + d * 9), -4 - d * 2, 5 - d, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Nameplate
    ctx.fillStyle = '#fff';
    ctx.font = '800 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.strokeText(label, 0, -76);
    ctx.fillText(label, 0, -76);

    ctx.restore();
  }
}

const engine = new MiliGameEngine();
function animate() {
  engine.update();
  engine.render();
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
