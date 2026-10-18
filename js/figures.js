/* 動作見本。種目データの animation で描き方を切り替える。
 *   { kind: 'builtin', ref: 'squat' }   内蔵の簡易アニメ(下の BUILTIN)
 *   { kind: 'image', src, alt }         画像・GIF に差し替え
 *   { kind: 'video', src, alt }         動画に差し替え(無音ループ)
 * 内蔵アニメは仮の棒人間。動きは style.css の .m-<ref> で付けている。 */
(function (root) {
  'use strict';

  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  // ---- 部品 ----
  const ground = '<line class="ground" x1="30" y1="174" x2="170" y2="174"/>';
  const chair = (x) => `<g class="prop">
    <line x1="${x}" y1="122" x2="${x + 34}" y2="122"/><line x1="${x}" y1="122" x2="${x}" y2="80"/>
    <line x1="${x + 2}" y1="122" x2="${x + 2}" y2="172"/><line x1="${x + 32}" y1="122" x2="${x + 32}" y2="172"/></g>`;

  // 立ち姿(前向き)。腕・脚はそれぞれ関節で回るグループにしてある。
  function arm(side, base) {
    return `<g class="p-arm p-arm-${side}"><g transform="rotate(${base} 100 62)">
      <line x1="100" y1="62" x2="100" y2="88"/>
      <g class="p-fore p-fore-${side}"><line x1="100" y1="88" x2="100" y2="112"/></g></g></g>`;
  }
  function leg(side, base) {
    return `<g class="p-leg p-leg-${side}"><g transform="rotate(${base} 100 112)">
      <line x1="100" y1="112" x2="100" y2="142"/>
      <g class="p-shin p-shin-${side}"><line x1="100" y1="142" x2="100" y2="172"/></g></g></g>`;
  }
  // armBase: 左腕の角度(右腕は左右対称)。armBaseR を渡すと右腕だけ別の角度にできる。
  function standing(armBase, legBase, armBaseR) {
    const a = armBase == null ? 18 : armBase;
    const aR = armBaseR == null ? -a : armBaseR;
    const l = legBase == null ? 6 : legBase;
    return `<g class="p-all">
      ${leg('l', l)}${leg('r', -l)}
      <g class="p-upper">
        <line x1="100" y1="54" x2="100" y2="112"/>
        <g class="p-head"><circle class="head" cx="100" cy="38" r="13"/></g>
        <g class="p-arms">${arm('l', a)}${arm('r', aR)}</g>
      </g></g>`;
  }

  // 座り姿(横向き)。腰 (90,120)、ひざ (122,120)
  function seated(legPart) {
    return `${chair(66)}<g class="p-all">
      <line x1="90" y1="120" x2="90" y2="68"/>
      <circle class="head" cx="92" cy="52" r="13"/>
      <g class="p-arm p-arm-l"><line x1="90" y1="74" x2="104" y2="98"/><line x1="104" y1="98" x2="118" y2="104"/></g>
      ${legPart}</g>`;
  }
  const seatedLeg = (cls, extra) => `<g class="p-thigh ${cls}"><line x1="90" y1="120" x2="122" y2="120"/>
      <g class="p-shin ${cls}-shin"><line x1="122" y1="120" x2="122" y2="168"/>${extra || ''}</g></g>`;

  const BUILTIN = {
    neck: () => standing(22),
    shoulder: () => standing(22),
    chest: () => standing(30),
    sideBend: () => standing(22),
    armCircle: () => standing(80),
    march: () => standing(20, 4),
    calf: () => `<g class="prop"><line x1="150" y1="100" x2="150" y2="172"/><line x1="138" y1="100" x2="162" y2="100"/></g>${standing(20, 4)}`,
    squat: () => `${chair(42)}${standing(20, 4)}`,
    wallPush: () => `<g class="prop"><line x1="168" y1="30" x2="168" y2="174"/></g>${standing(-70, 4, -70)}`,
    seatedLegRaise: () => seated(seatedLeg('p-leg-far') + seatedLeg('p-leg-near')),
    seatedMarch: () => seated(seatedLeg('p-leg-far') + seatedLeg('p-leg-near')),
    ankle: () => seated(seatedLeg('p-leg-far') +
      seatedLeg('p-leg-near', '<g class="p-foot"><line x1="122" y1="168" x2="138" y2="168"/></g>')),
    // あお向けのヒップリフト。腰の高さを SMIL で動かす
    bridge: () => `<g class="p-all">
      <circle class="head" cx="42" cy="158" r="12"/>
      <polyline points="56,162 100,162 126,130 142,170">
        <animate attributeName="points" dur="4s" repeatCount="indefinite"
          values="56,162 100,162 126,130 142,170;56,162 100,138 130,126 142,170;56,162 100,162 126,130 142,170"
          keyTimes="0;0.5;1" calcMode="spline" keySplines=".45 0 .55 1;.45 0 .55 1"/>
      </polyline>
      <line x1="58" y1="164" x2="96" y2="168"/></g>`,
  };

  function render(animation) {
    const a = animation || {};
    const alt = esc(a.alt || '動作見本');
    if (a.kind === 'image' && a.src) {
      return `<img class="fig-media" src="${esc(a.src)}" alt="${alt}">`;
    }
    if (a.kind === 'video' && a.src) {
      return `<video class="fig-media" src="${esc(a.src)}" autoplay muted loop playsinline aria-label="${alt}"></video>`;
    }
    const draw = BUILTIN[a.ref];
    if (!draw) return `<div class="fig-missing">見本は準備中です</div>`;
    return `<svg class="fig m-${esc(a.ref)}" viewBox="0 0 200 190" role="img" aria-label="${alt}">
      ${ground}${draw()}</svg>`;
  }

  root.MBP = Object.assign(root.MBP || {}, { Figures: { render, BUILTIN } });
})(typeof self !== 'undefined' ? self : this);
