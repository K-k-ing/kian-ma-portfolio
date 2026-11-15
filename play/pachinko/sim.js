// Pachinko playfield physics (Rapier 3D). Shared by the browser game and the offline bake for Blender.
// Coordinates = machine-local Blender coords: x right, z up, y into the cabinet. Metres.

export class PachinkoSim {
  constructor(RAPIER, L, opts = {}) {
    this.R = RAPIER; this.L = L;
    this.dt = opts.dt || 1 / 960;
    this.tilt = opts.tilt ?? 0.35;                 // gravity component pressing balls onto the board
    this.world = new RAPIER.World({ x: 0, y: this.tilt, z: -9.81 });
    this.world.timestep = this.dt;
    this.world.integrationParameters.numSolverIterations = 8;
    this.time = 0; this.balls = new Map(); this.nextId = 1; this.events = [];
    this.attackerOpen = false;
    this.rand = opts.rand || Math.random;
    this.YC = (L.BOARD_Y + L.GLASS_Y) / 2; this.YH = (L.BOARD_Y - L.GLASS_Y) / 2;
    this._build();
  }

  _qy(phi) { return { x: 0, y: Math.sin(phi / 2), z: 0, w: Math.cos(phi / 2) }; }
  _polar(aDeg, r) { const a = aDeg * Math.PI / 180; return [this.L.C[0] + r * Math.cos(a), this.L.C[1] + r * Math.sin(a)]; }

  _fixed(desc, rest, fric) {
    const R = this.R;
    desc.setRestitution(rest).setFriction(fric)
      .setRestitutionCombineRule(R.CoefficientCombineRule.Min)
      .setFrictionCombineRule(R.CoefficientCombineRule.Max);
    return this.world.createCollider(desc);
  }

  _seg(p0, p1, t, rest, fric, grow = 0) {
    const R = this.R;
    const cx = (p0[0] + p1[0]) / 2, cz = (p0[1] + p1[1]) / 2;
    const dx = p1[0] - p0[0], dz = p1[1] - p0[1];
    const len = Math.hypot(dx, dz) / 2 + grow;
    const phi = Math.atan2(-dz, dx);
    return this._fixed(R.ColliderDesc.cuboid(len, this.YH, t / 2).setTranslation(cx, this.YC, cz).setRotation(this._qy(phi)), rest, fric);
  }

  _build() {
    const R = this.R, L = this.L, YC = this.YC, YH = this.YH;
    // board and glass
    this._fixed(R.ColliderDesc.cuboid(0.25, 0.005, 0.25).setTranslation(0, L.BOARD_Y + 0.005, 0.47), 0.3, 0.12);
    this._fixed(R.ColliderDesc.cuboid(0.25, 0.005, 0.25).setTranslation(0, L.GLASS_Y - 0.005, 0.47), 0.3, 0.05);
    // outer rail + inner launch rail are handled analytically in _rails() (exact arcs, no polygon seams).
    const ir = L.inner_rail;
    for (const p of [ir[0], ir[ir.length - 1]])
      this._fixed(R.ColliderDesc.cylinder(YH, L.RAIL_T / 2).setTranslation(p[0], YC, p[1]), 0.35, 0.08);
    this.railR = Math.hypot(ir[0][0] - L.C[0], ir[0][1] - L.C[1]);
    // centre feature: one convex hull (outline is convex) -> no internal edges
    const pts = [];
    for (const [x, z] of L.yaku) { pts.push(x, YC - YH, z, x, YC + YH, z); }
    this._fixed(R.ColliderDesc.convexHull(new Float32Array(pts)), 0.45, 0.1);
    // pockets (U cups)
    for (const p of [...L.pockets, L.start]) {
      const { x, z, w, h, t } = p;
      this._seg([x - w / 2 - t / 2, z], [x - w / 2 - t / 2, z - h - t], t, 0.35, 0.1);
      this._seg([x + w / 2 + t / 2, z], [x + w / 2 + t / 2, z - h - t], t, 0.35, 0.1);
      this._seg([x - w / 2 - t, z - h - t / 2], [x + w / 2 + t, z - h - t / 2], t, 0.2, 0.1);
    }
    // rubber bumper
    const b = L.bumper, bp = this._polar(b.a, L.R - b.t / 2);
    this._fixed(R.ColliderDesc.cuboid(b.w / 2, YH, b.t / 2).setTranslation(bp[0], YC, bp[1]).setRotation(this._qy((90 - b.a) * Math.PI / 180)), 0.75, 0.3);
    // pins
    for (const [x, z] of L.pins)
      this._fixed(R.ColliderDesc.cylinder(YH, L.PIN_R).setTranslation(x, YC, z), 0.62, 0.08);
    // windmills (free spinning)
    this.windmills = [];
    const anchor = this.world.createRigidBody(R.RigidBodyDesc.fixed());
    for (const w of L.windmills) {
      const body = this.world.createRigidBody(R.RigidBodyDesc.dynamic().setTranslation(w.x, YC, w.z).setAngularDamping(1.2).setCanSleep(false));
      for (const [hx, hz] of [[w.r, 0.0011], [0.0011, w.r]])
        this.world.createCollider(R.ColliderDesc.cuboid(hx, 0.005, hz).setDensity(1400).setRestitution(0.5).setFriction(0.15), body);
      const jd = R.JointData.revolute({ x: w.x, y: YC, z: w.z }, { x: 0, y: 0, z: 0 }, { x: 0, y: 1, z: 0 });
      this.world.createImpulseJoint(jd, anchor, body, true);
      this.windmills.push(body);
    }
  }

  windmillAngle(i) {
    const q = this.windmills[i].rotation();
    return 2 * Math.atan2(q.y, q.w);         // rotation about +y
  }

  /** power 0..1 -> launch speed. Returns ball id. */
  launch(power) {
    const R = this.R, L = this.L;
    const v = (2.2 + 1.4 * Math.max(0, Math.min(1, power))) * (1 + (this.rand() - 0.5) * 0.012);
    const a = L.LAUNCH_A * Math.PI / 180;
    const tx = Math.sin(a), tz = -Math.cos(a);
    const body = this.world.createRigidBody(R.RigidBodyDesc.dynamic()
      .setTranslation(L.launch[0], L.BOARD_Y - L.BALL_R - 0.0004, L.launch[1])
      .setLinvel(v * tx, 0, v * tz).setCcdEnabled(true).setCanSleep(false).setLinearDamping(0.02).setAngularDamping(0.05));
    this.world.createCollider(R.ColliderDesc.ball(L.BALL_R).setDensity(7800).setRestitution(0.62).setFriction(0.1)
      .setRestitutionCombineRule(R.CoefficientCombineRule.Min).setFrictionCombineRule(R.CoefficientCombineRule.Max), body);
    const id = this.nextId++;
    this.balls.set(id, { id, body, born: this.time, still: 0, peak: 0, inChannel: true });
    return id;
  }

  _remove(ball, type, extra) {
    this.world.removeRigidBody(ball.body);
    this.balls.delete(ball.id);
    this.events.push({ type, id: ball.id, t: this.time, ...extra });
  }

  step() {
    const L = this.L;
    this.world.step();
    this.time += this.dt;
    const S = L.start, A = L.attacker, O = L.out;
    for (const ball of [...this.balls.values()]) {
      this._rails(ball);
      const p = ball.body.translation(), v = ball.body.linvel();
      const x = p.x, z = p.z;
      if (Math.abs(x - S.x) < S.w / 2 && z < S.z - 0.007 && z > S.z - S.h) { this._remove(ball, 'start'); continue; }
      let hit = false;
      for (const pk of L.pockets)
        if (Math.abs(x - pk.x) < pk.w / 2 && z < pk.z - 0.007 && z > pk.z - pk.h) { this._remove(ball, 'pocket', { name: pk.name, pay: pk.pay }); hit = true; break; }
      if (hit) continue;
      if (this.attackerOpen && Math.abs(x - A.x) < A.w / 2 + 0.014 && z < A.z + 0.004 && z > A.z - A.h) { this._remove(ball, 'attacker'); continue; }
      if (z < O.z + 0.0045 && Math.abs(x - O.x) < O.w / 2) { this._remove(ball, 'out'); continue; }
      // foul: fell back down the launch channel
      const dx = x - L.C[0], dz = z - L.C[1], r = Math.hypot(dx, dz);
      let ang = Math.atan2(dz, dx) * 180 / Math.PI; if (ang < 0) ang += 360;
      ball.peak = Math.max(ball.peak, z);
      if (this.time - ball.born > 0.15 && r > L.R - L.CH_W - L.RAIL_T && ang > L.CH_A0 - 3 && ang < L.CH_A0 + 6 && v.z < 0 && ball.peak < L.C[1] + L.R * 0.75) { this._remove(ball, 'foul'); continue; }
      if (z < 0.2 || Math.abs(x) > 0.3 || p.y < L.GLASS_Y - 0.02 || p.y > L.BOARD_Y + 0.02) { this._remove(ball, 'out'); continue; }
      // anti-stuck
      const sp = Math.hypot(v.x, v.z);
      ball.still = sp < 0.004 ? ball.still + this.dt : 0;
      if (ball.still > 1.5) { ball.body.applyImpulse({ x: (this.rand() - 0.5) * 2e-5, y: 0, z: 1e-5 }, true); ball.still = 0; ball.nudges = (ball.nudges || 0) + 1; if (ball.nudges > 3) this._remove(ball, 'out'); }
    }
  }

  /** Exact circular outer rail + inner launch-rail arc. */
  _rails(ball) {
    const L = this.L, br = L.BALL_R, body = ball.body;
    const p = body.translation(), v = body.linvel();
    let dx = p.x - L.C[0], dz = p.z - L.C[1];
    const r = Math.hypot(dx, dz) || 1e-9, nx = dx / r, nz = dz / r;
    let ang = Math.atan2(dz, dx) * 180 / Math.PI; if (ang < 0) ang += 360;
    // one-way valve at the channel exit (top-left): balls that left the channel cannot roll back into it
    if (ball.inChannel) { if (ang < L.CH_A1 - 1) ball.inChannel = false; }
    else if (r > this.railR && ang > L.CH_A1 && ang < L.CH_A1 + 25) {
      const a1 = L.CH_A1 * Math.PI / 180, c = Math.cos(a1), s_ = Math.sin(a1);
      const tx = -s_, tz = c;                    // CCW tangent at the valve
      const vt = v.x * tx + v.z * tz;
      const vx = v.x - (vt > 0 ? 1.3 * vt * tx : 0), vz = v.z - (vt > 0 ? 1.3 * vt * tz : 0);
      body.setLinvel({ x: vx, y: v.y, z: vz }, true);
      body.setTranslation({ x: L.C[0] + r * c, y: p.y, z: L.C[1] + r * s_ }, true);
      return;
    }
    let push = 0, dir = 0;                     // dir: +1 surface normal points outward (ball must move outward), -1 inward
    if (r + br > L.R) { push = r + br - L.R; dir = -1; }
    else if (ang >= L.CH_A1 && ang <= L.CH_A0) {
      const ro = this.railR + L.RAIL_T / 2, ri = this.railR - L.RAIL_T / 2;
      if (r >= this.railR && r - br < ro) { push = ro - (r - br); dir = 1; }
      else if (r < this.railR && r + br > ri) { push = r + br - ri; dir = -1; }
    }
    if (!dir) return;
    const vn = v.x * nx + v.z * nz;            // radial velocity
    let vx = v.x, vz = v.z;
    if (vn * dir < 0) {                        // moving into the surface
      const e = Math.abs(vn) < 0.08 ? 0 : 0.3;
      const jn = -(1 + e) * vn;                // normal impulse per unit mass
      vx += jn * nx; vz += jn * nz;
      const tx = -nz, tz = nx, vt = vx * tx + vz * tz;
      const jt = Math.min(Math.abs(vt), 0.04 * Math.abs(jn)) * Math.sign(vt);
      vx -= jt * tx; vz -= jt * tz;
      body.setLinvel({ x: vx, y: v.y, z: vz }, true);
    }
    body.setTranslation({ x: p.x + dir * push * nx, y: p.y, z: p.z + dir * push * nz }, true);
  }

  drainEvents() { const e = this.events; this.events = []; return e; }
}
