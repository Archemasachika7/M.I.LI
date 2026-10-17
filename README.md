# 🎮 Mini Militia — Study Clone (Web)

An **educational, from-scratch reimplementation** of the classic *Mini Militia* 2D jetpack arena shooter, built as a playable study project. **No original game assets, code, or trademarks are used** — every soldier, map, weapon and effect is drawn procedurally on an HTML5 Canvas with hand-written TypeScript.

> Purpose: learn how a real-time arcade shooter is structured — physics integration, swept collision detection, netcode for casual P2P play, input abstraction across keyboard/gamepad/touch, and canvas character animation.

---

## ✨ Features

### Gameplay
- **3 mountain arenas** — Outpost Ridge (🌧 rain), Highcliff Peaks (❄ snow), Red Rock Crag (🌋 ashfall)
- **4 match formats** — 1v1 Solo, 2v2 Duo, 4v4 With Rules, 4v4 Without Rules (team bases + role healing auras), plus instant **Solo vs Bots**
- **4 roles** (Medic / Survivor / Raider / Scout) with distinct HP, speed, fuel and starting gear
- **3 weapons** (AK-47 Assault, Sniper, RPG) with magazines, reserves, reloads, spread and recoil; laser sights per weapon
- **Throwables**: frag grenades (arc + bounce), cluster bombs (main blast + 5 damaging fragments), medkits, nitro cells
- **Pickups**: guns, ammo, EXTRA_HP overheal shield bar, NITRO_CELL jetpack refuel
- **Smart bots**: velocity-leading aim, acceleration-based movement, storm-influenced accuracy
- Killfeed, floating damage numbers, 5-minute match timer, spawn protection shimmer

### Multiplayer & Lobby
- **PeerJS WebRTC rooms** — host shares a Room ID (`MILI-####`), others join from phone/tablet/laptop
- **BroadcastChannel LAN fallback** — two tabs on one machine act as two devices for classroom testing
- 🔒 **Room Lock (new)** — the host's **DEPLOY button stays disabled until at least one other player actually joins the room**. A live LAN heartbeat (`LAN_HELLO`/`LAN_HERE` probes with 3-second peer expiry) detects peers even without the signalling server, unlocks DEPLOY when someone arrives, and **re-locks it if everyone leaves**. Joiners no longer self-start; they wait for the host to deploy the match.

### Physics Engine ("better physics" pass)
- **Acceleration/friction movement model** instead of instant velocity: separate ground accel, weaker air control, air drag, ground friction
- **Squash & stretch** tied to vertical velocity, run-speed lean, walk bob
- **Sprint → slide boost** (crouch while running fast; slippery weather slides further)
- **Held-crouch super dive** in air → **SUPER STOMP landing**: radial shockwave that damages and launches nearby enemies
- **Fall damage** scaled by impact speed (jet-braking reduces it)
- **Swept segment-vs-rect bullet collision** — fast sniper/RPG rounds can't tunnel through thin platforms
- **Bullet knockback**: momentum transfer along the projectile vector
- **Explosion impulses**: proper radial vectors + proximity-scaled screen shake + expanding shockwave rings
- **Recoil as real impulse**: much stronger pushback while airborne (jetpack-free aiming tradeoff)
- **Weather effects on physics**: rain/snow reduce platform grip (slippery), wind drifts throwables and slow projectiles, fog reduces visibility

### Character Design & Motion (this iteration)
The chibi soldier was rebuilt as a small **procedural motion rig**:
- Animated **two-leg gait** synced to a `walkPhase`, boot tread accents
- **Head lag** (secondary animation) so the head trails body turns
- **Crouch pose**: compressed torso, raised knees, gun held higher
- **Slide pose**: directional body tilt + trailing dust puffs
- Jetpack flame is now a **flickering twin-cone** (orange mantle + blue core)
- Richer kit detail: tank valve, chest strap + pouches, helmet highlight + chin strap, two-handed gun grip with barrel, muzzle brake, foregrip and red dot sight
- Per-mask personality: gas mask filter canister, visor glare streak, NVG glow pupils, bare-face fallback

---

## 🕹 Controls

| Action | KB + Mouse | Xbox Controller | Touch |
|---|---|---|---|
| Move | A / D or ← → | Left stick | Left thumbstick |
| Jetpack | W / Space / ↑ | LT or A | Flick left stick up |
| Crouch / Slide / Super-dive | S / ↓ | Right stick down | Flick left stick down |
| Aim | Mouse | Right stick | Right thumbstick |
| Shoot | Left Click | RT | Push right stick past red ring |
| Grenade | G / Right Click | RB | HUD 💣 button |
| Cluster Bomb | B | LB | HUD 🧨 button |
| Medkit | H | D-Pad Up | HUD ➕ button |
| Switch Weapon | Q / E | Y | Tap weapon card |
| Reload | R | X | — |

---

## 🏗 Project Structure

```
index.html              # UI shell: onboarding, lobby, HUD (all inline CSS, no asset files)
src/typesAndMaps.ts     # Roles, weapons, PHYS constants, weather specs, 3 maps
src/inputAndNet.ts      # MultiInputController (KB/pad/touch) + LobbyNetworkManager (PeerJS + BroadcastChannel, room lock)
src/engineAndMain.ts    # Game engine: physics step, combat, bots, procedural rendering, motion rig
```

## 🚀 Run It

```bash
npm install
npm run dev        # local dev server
npm run build      # type-check + production bundle (dist/)
```

Test multiplayer locally: open two browser tabs, click **OPEN ROOM** in one, enter its Room ID in the other — DEPLOY unlocks only after the second tab is detected.

## ⚖ Educational Disclaimer

This is a fan-study prototype for learning purposes only. It contains **no code, art, audio or branding** from the original Mini Militia game; all visuals are generated at runtime via Canvas APIs. Not affiliated with, or endorsed by, the original developers.
