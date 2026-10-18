/* 人体モデルの運動見本(仮)。
 * 身長186cmの体の比率(一般的な人体計測値)で関節の位置を計算し、横から見た姿で描く。
 * 足・手など「動かない点」を決めて、ひざ・ひじは逆運動学(2本の骨の長さから関節位置を求める計算)で解く。
 * 動画などの本素材が用意できるまでの仮の見本。フォームは運動指導の専門家による確認前。 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MBP = Object.assign(root.MBP || {}, { Poses: api });
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // 身長186cmの体の長さ(cm)。足首の高さ+すね+もも=股関節の高さ約99cm、肩の高さ約153cm、頭頂約186cm
  const L = { ankleH: 7, foot: 26, shank: 46, thigh: 46, trunk: 54, neck: 9.5, headR: 11.5, upper: 34, fore: 27, hand: 9 };
  const GROUND = 200; // SVG 上の床の y 座標(ここから上が体)
  const rad = (d) => (d * Math.PI) / 180;
  const deg = (r) => (r * 180) / Math.PI;
  const lerp = (a, b, u) => a + (b - a) * u;
  const ease = (u) => u * u * (3 - 2 * u); // ゆっくり動き出して、ゆっくり止まる

  // 2本の骨(長さ l1, l2)で、根元 a から目標 t へ届く関節位置を求める。choose で曲がる向きを選ぶ
  function ik(a, t, l1, l2, choose) {
    const dx = t.x - a.x;
    const dy = t.y - a.y;
    let d = Math.hypot(dx, dy);
    d = Math.min(Math.max(d, Math.abs(l1 - l2) + 0.01), l1 + l2 - 0.01);
    const base = Math.atan2(dy, dx);
    const off = Math.acos((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d));
    const j1 = { x: a.x + l1 * Math.cos(base + off), y: a.y + l1 * Math.sin(base + off) };
    const j2 = { x: a.x + l1 * Math.cos(base - off), y: a.y + l1 * Math.sin(base - off) };
    const joint = choose(j1, j2);
    const ex = t.x - joint.x;
    const ey = t.y - joint.y;
    const e = Math.hypot(ex, ey) || 1;
    return { joint, end: { x: joint.x + (ex / e) * l2, y: joint.y + (ey / e) * l2 } };
  }

  // 3点 a-b-c の b での角度(度)。180 = まっすぐ
  function angleAt(a, b, c) {
    const v1 = Math.atan2(a.y - b.y, a.x - b.x);
    const v2 = Math.atan2(c.y - b.y, c.x - b.x);
    let d = Math.abs(deg(v1 - v2));
    if (d > 180) d = 360 - d;
    return d;
  }

  /* 姿勢パラメータ(y は床からの高さ、x は前が +):
   *   ankleX     足首の位置
   *   hipX,hipY  股関節の位置(ひざは自動計算)
   *   trunk      胴体の前傾(度。0=まっすぐ、+=前へ傾く)
   *   neck       首の角度(胴体に対して)
   *   shDx,shDy  肩の移動(肩回し用。胴体に対して前/上が +)
   *   handX,handY 手首の目標位置(あればひじは自動計算)
   *   upperArm, foreArm 腕の角度(真下=0、前=+)。handX がないときに使う
   *   handUp     手のひらを壁につける(指先を上に向ける) */
  function solve(p) {
    const ankle = { x: p.ankleX || 0, y: L.ankleH };
    const hip = { x: p.hipX, y: p.hipY };
    const leg = ik(hip, ankle, L.thigh, L.shank, (a, b) => (a.x > b.x ? a : b)); // ひざは前
    const tr = rad(p.trunk || 0);
    const up = { x: Math.sin(tr), y: Math.cos(tr) };
    const fwd = { x: Math.cos(tr), y: -Math.sin(tr) };
    const shDx = p.shDx || 0;
    const shDy = p.shDy || 0;
    const shoulder = {
      x: hip.x + up.x * L.trunk + fwd.x * shDx + up.x * shDy,
      y: hip.y + up.y * L.trunk + fwd.y * shDx + up.y * shDy,
    };
    const neckTop = { x: hip.x + up.x * L.trunk, y: hip.y + up.y * L.trunk }; // 首の付け根は肩が動いても胴体についたまま
    const nr = rad((p.trunk || 0) + (p.neck || 0));
    const headC = { x: neckTop.x + Math.sin(nr) * (L.neck + L.headR), y: neckTop.y + Math.cos(nr) * (L.neck + L.headR) };
    let elbow;
    let wrist;
    if (p.handX != null) {
      const arm = ik(shoulder, { x: p.handX, y: p.handY }, L.upper, L.fore, (a, b) => (a.y < b.y ? a : b)); // ひじは下
      elbow = arm.joint;
      wrist = arm.end;
    } else {
      const ua = rad(p.upperArm || 0);
      const fa = rad(p.foreArm || 0);
      elbow = { x: shoulder.x + Math.sin(ua) * L.upper, y: shoulder.y - Math.cos(ua) * L.upper };
      wrist = { x: elbow.x + Math.sin(fa) * L.fore, y: elbow.y - Math.cos(fa) * L.fore };
    }
    let hv;
    if (p.handUp) hv = { x: 0.2, y: 0.98 };
    else {
      const fx = wrist.x - elbow.x;
      const fy = wrist.y - elbow.y;
      const f = Math.hypot(fx, fy) || 1;
      hv = { x: fx / f, y: fy / f };
    }
    const hand = { x: wrist.x + hv.x * L.hand, y: wrist.y + hv.y * L.hand };
    return {
      ankle, knee: leg.joint, hip, shoulder, neckTop, headC, elbow, wrist, hand, trunk: p.trunk || 0, neck: p.neck || 0,
      toe: { x: ankle.x + L.foot - 6, y: 2 }, heel: { x: ankle.x - 6, y: 2 },
    };
  }

  // キーフレーム(t: 0〜1)の間をなめらかにつなぐ
  function frameAt(frames, t) {
    let i = 0;
    while (i < frames.length - 2 && t > frames[i + 1].t) i++;
    const a = frames[i];
    const b = frames[i + 1];
    const u = b.t === a.t ? 0 : ease(Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))));
    const out = {};
    for (const k of Object.keys(a.p)) {
      const va = a.p[k];
      const vb = b.p[k];
      out[k] = typeof va === 'number' && typeof vb === 'number' ? lerp(va, vb, u) : va;
    }
    return out;
  }

  // ---- 種目ごとの見本 ----
  const SEAT_Y = 47;      // イスの座面の高さ(cm)
  const WALL_X = 96;      // 壁の位置
  // 壁腕立て: 体をまっすぐ保ったまま、足首を中心に前へ傾ける
  function plank(leanDeg) {
    const a = rad(leanDeg);
    const legLen = L.shank + L.thigh;
    return { hipX: Math.sin(a) * legLen, hipY: L.ankleH + Math.cos(a) * legLen, trunk: leanDeg, neck: 0 };
  }

  const DEFS = {
    chair_squat: {
      label: 'イススクワット(横から見た図)',
      view: { minX: -78, width: 190 },
      props: 'chair',
      periodMs: 4000,
      frames: [
        { t: 0.00, p: { hipX: -2, hipY: 99, trunk: 2, neck: -2, upperArm: 8, foreArm: 12 } },
        { t: 0.10, p: { hipX: -2, hipY: 99, trunk: 2, neck: -2, upperArm: 8, foreArm: 12 } },
        { t: 0.30, p: { hipX: -16, hipY: 80, trunk: 24, neck: -14, upperArm: 62, foreArm: 66 } },
        { t: 0.50, p: { hipX: -30, hipY: 59, trunk: 36, neck: -22, upperArm: 80, foreArm: 82 } },
        { t: 0.60, p: { hipX: -30, hipY: 59, trunk: 36, neck: -22, upperArm: 80, foreArm: 82 } },
        { t: 0.80, p: { hipX: -15, hipY: 82, trunk: 22, neck: -12, upperArm: 55, foreArm: 60 } },
        { t: 1.00, p: { hipX: -2, hipY: 99, trunk: 2, neck: -2, upperArm: 8, foreArm: 12 } },
      ],
      phases: [
        { to: 0.10, label: '① 開始姿勢: 足を肩幅にして立つ' },
        { to: 0.50, label: '② お尻を後ろへ引いて、ゆっくり下ろす' },
        { to: 0.60, label: '③ お尻がイスに軽くふれる' },
        { to: 1.00, label: '④ 息をはきながら立ち上がる' },
      ],
      keyPoses: [
        { t: 0.0, label: '開始姿勢' },
        { t: 0.3, label: 'お尻を後ろへ' },
        { t: 0.55, label: 'イスにふれる' },
      ],
    },
    wall_pushup: {
      label: '壁うで立て(横から見た図)',
      view: { minX: -40, width: 160 },
      props: 'wall',
      periodMs: 3000,
      frames: [
        { t: 0.00, p: Object.assign(plank(14), { handX: WALL_X - 4, handY: 136, handUp: true }) },
        { t: 0.10, p: Object.assign(plank(14), { handX: WALL_X - 4, handY: 136, handUp: true }) },
        { t: 0.50, p: Object.assign(plank(22), { handX: WALL_X - 4, handY: 136, handUp: true }) },
        { t: 0.60, p: Object.assign(plank(22), { handX: WALL_X - 4, handY: 136, handUp: true }) },
        { t: 1.00, p: Object.assign(plank(14), { handX: WALL_X - 4, handY: 136, handUp: true }) },
      ],
      phases: [
        { to: 0.10, label: '① 開始姿勢: 胸の高さで壁に手をつく' },
        { to: 0.50, label: '② ひじを曲げて、胸を壁に近づける' },
        { to: 0.60, label: '③ 楽にできるところで止める' },
        { to: 1.00, label: '④ 壁を押して、ゆっくり戻る' },
      ],
      keyPoses: [
        { t: 0.0, label: '開始姿勢' },
        { t: 0.3, label: 'ひじを曲げる' },
        { t: 0.55, label: '胸を近づける' },
      ],
    },
    shoulder_roll: {
      label: '肩回し(横から見た図・座って行う)',
      view: { minX: -78, width: 170 },
      props: 'chair',
      periodMs: 2000,
      // 肩を「上げる → 後ろへ引く → 下ろす → 前へ戻す」の円で動かす(後ろ回し)
      at(t) {
        const a = 2 * Math.PI * t;
        const shDx = 5 * Math.cos(a) - 1;
        const shDy = 6 * Math.sin(a) + 3;
        return { hipX: -30, hipY: 59, trunk: 0, neck: 0, ankleX: 18, upperArm: 4, foreArm: 14, shDx, shDy };
      },
      phases: [
        { to: 0.25, label: '① 肩を耳に近づけるように上げる' },
        { to: 0.50, label: '② 肩甲骨をよせるように後ろへ引く' },
        { to: 0.75, label: '③ ストンと下ろす' },
        { to: 1.00, label: '④ 前から上へ、また回す' },
      ],
      keyPoses: [
        { t: 0.0, label: '開始姿勢' },
        { t: 0.25, label: '上げる' },
        { t: 0.5, label: '後ろへ引く' },
      ],
      hint: 'shoulderCircle',
    },
  };

  function poseAt(ref, t) {
    const def = DEFS[ref];
    const tt = ((t % 1) + 1) % 1;
    return solve(def.at ? def.at(tt) : frameAt(def.frames, tt));
  }
  function phaseLabel(ref, t) {
    const ph = DEFS[ref].phases;
    return (ph.find((p) => t <= p.to) || ph[ph.length - 1]).label;
  }

  // ---- SVG で描く ----
  const NS = 'http://www.w3.org/2000/svg';
  const X = (p) => p.x;
  const Y = (p) => GROUND - p.y;
  function el(name, attrs) {
    const e = (typeof document !== 'undefined') ? document.createElementNS(NS, name) : null;
    if (e && attrs) for (const k of Object.keys(attrs)) e.setAttribute(k, attrs[k]);
    return e;
  }

  function propsSvg(kind, view) {
    const floor = `<line class="pm-floor" x1="${view.minX}" y1="${GROUND}" x2="${view.minX + view.width}" y2="${GROUND}"/>`;
    if (kind === 'chair') {
      const sx1 = -66;
      const sx2 = -14;
      const sy = GROUND - SEAT_Y;
      return `${floor}<g class="pm-prop">
        <rect x="${sx1}" y="${sy - 5}" width="${sx2 - sx1}" height="7" rx="2"/>
        <rect x="${sx1 - 2}" y="${GROUND - 98}" width="6" height="${98 - SEAT_Y + 2}" rx="2"/>
        <rect x="${sx1}" y="${sy}" width="4" height="${SEAT_Y}"/><rect x="${sx2 - 4}" y="${sy}" width="4" height="${SEAT_Y}"/></g>`;
    }
    if (kind === 'wall') {
      return `${floor}<g class="pm-prop"><rect x="${WALL_X}" y="0" width="14" height="${GROUND}"/></g>`;
    }
    return floor;
  }

  // 胴体(おなか・背中のふくらみをつけた形)
  function trunkPath(s) {
    const tr = rad(s.trunk);
    const up = { x: Math.sin(tr), y: Math.cos(tr) };
    const fw = { x: Math.cos(tr), y: -Math.sin(tr) };
    const at = (f, w) => ({ x: s.hip.x + up.x * L.trunk * f + fw.x * w, y: s.hip.y + up.y * L.trunk * f + fw.y * w });
    const sh = s.shoulder;
    const shF = { x: sh.x + fw.x * 9, y: sh.y + fw.y * 9 };
    const shB = { x: sh.x - fw.x * 9, y: sh.y - fw.y * 9 };
    const pts = {
      hipF: at(0, 12), belly: at(0.42, 17), chest: at(0.78, 14),
      backTop: at(0.82, -12), back: at(0.45, -13), seat: at(0.02, -15),
    };
    const p = (q) => `${X(q).toFixed(1)} ${Y(q).toFixed(1)}`;
    return `M ${p(pts.hipF)} Q ${p(pts.belly)} ${p(pts.chest)} L ${p(shF)} Q ${p({ x: sh.x + up.x * 6, y: sh.y + up.y * 6 })} ${p(shB)}
      L ${p(pts.backTop)} Q ${p(pts.back)} ${p(pts.seat)} Q ${p(at(-0.1, -2))} ${p(pts.hipF)} Z`;
  }

  // 見本を描く SVG を作る。update(t) で姿勢を変える
  function create(ref, opts) {
    const def = DEFS[ref];
    if (!def) return null;
    const o = opts || {};
    const v = def.view;
    const svg = el('svg', { viewBox: `${v.minX} 0 ${v.width} 210`, class: 'pm' + (o.thumb ? ' pm-thumb' : ''), role: 'img', 'aria-label': def.label });
    svg.innerHTML = propsSvg(def.props, v);
    const shadow = el('ellipse', { class: 'pm-shadow', ry: 3 });
    svg.appendChild(shadow);
    const mk = (cls, w) => {
      const e = el('line', { class: cls, 'stroke-width': w });
      return e;
    };
    // 奥側の腕・脚(少し薄い色)→ 胴体 → 手前の脚 → 手前の腕 → 頭 の順に重ねる
    const parts = {
      farThigh: mk('pm-far', 17), farShank: mk('pm-far', 13), farFoot: mk('pm-far', 8),
      farUpper: mk('pm-far', 12), farFore: mk('pm-far', 10), farHand: mk('pm-far', 8),
      trunk: el('path', { class: 'pm-body' }),
      neck: mk('pm-body pm-neck', 11),
      thigh: mk('pm-near', 18), shank: mk('pm-near', 13.5), foot: mk('pm-near', 8.5),
      upper: mk('pm-near pm-arm', 12.5), fore: mk('pm-near pm-arm', 10.5), hand: mk('pm-near pm-arm', 8.5),
      head: el('circle', { class: 'pm-body', r: L.headR }),
      nose: el('circle', { class: 'pm-body', r: 3.2 }),
    };
    const order = ['farThigh', 'farShank', 'farFoot', 'farUpper', 'farFore', 'farHand', 'trunk', 'neck', 'thigh', 'shank', 'foot', 'head', 'nose', 'upper', 'fore', 'hand'];
    for (const k of order) svg.appendChild(parts[k]);
    let hint = null;
    if (def.hint === 'shoulderCircle' && !o.thumb) {
      hint = el('g', { class: 'pm-hint' });
      svg.appendChild(hint);
    }
    const line = (e, a, b, off) => {
      const d = off || 0;
      e.setAttribute('x1', (X(a) + d).toFixed(1)); e.setAttribute('y1', Y(a).toFixed(1));
      e.setAttribute('x2', (X(b) + d).toFixed(1)); e.setAttribute('y2', Y(b).toFixed(1));
    };
    function update(t) {
      const s = poseAt(ref, t);
      const far = -3; // 奥側の手足は少しずらして奥行きを出す
      line(parts.farThigh, s.hip, s.knee, far); line(parts.farShank, s.knee, s.ankle, far); line(parts.farFoot, s.heel, s.toe, far);
      line(parts.farUpper, s.shoulder, s.elbow, far); line(parts.farFore, s.elbow, s.wrist, far); line(parts.farHand, s.wrist, s.hand, far);
      parts.trunk.setAttribute('d', trunkPath(s));
      line(parts.neck, s.neckTop, { x: s.neckTop.x + (s.headC.x - s.neckTop.x) * 0.6, y: s.neckTop.y + (s.headC.y - s.neckTop.y) * 0.6 });
      line(parts.thigh, s.hip, s.knee); line(parts.shank, s.knee, s.ankle); line(parts.foot, s.heel, s.toe);
      line(parts.upper, s.shoulder, s.elbow); line(parts.fore, s.elbow, s.wrist); line(parts.hand, s.wrist, s.hand);
      parts.head.setAttribute('cx', X(s.headC).toFixed(1)); parts.head.setAttribute('cy', Y(s.headC).toFixed(1));
      const nr = rad(s.trunk + s.neck);
      parts.nose.setAttribute('cx', (X(s.headC) + Math.cos(nr) * L.headR * 0.95).toFixed(1));
      parts.nose.setAttribute('cy', (Y(s.headC) + Math.sin(nr) * L.headR * 0.95 + 1).toFixed(1));
      shadow.setAttribute('cx', (s.ankle.x + 6).toFixed(1)); shadow.setAttribute('cy', GROUND + 2); shadow.setAttribute('rx', 24);
      if (hint && !hint.firstChild) {
        // 肩の動く向き(後ろ回し)を示す円の矢印。肩の軌道の中心に置く
        const c0 = poseAt(ref, 0);
        const cx = X(c0.shoulder) - 5;
        const cy = Y(c0.shoulder);
        hint.innerHTML = `<circle cx="${cx}" cy="${cy}" r="15" class="pm-hint-ring"/>
          <path d="M ${cx + 13} ${cy - 8} l 4 -6 l 2 7 z" class="pm-hint-head"/>`;
      }
    }
    update(o.t || 0);
    return { svg, update, def };
  }

  return { L, DEFS, solve, poseAt, phaseLabel, create, angleAt, has: (ref) => !!DEFS[ref] };
});
