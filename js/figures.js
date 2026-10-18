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

  // 内蔵の簡易アニメ(棒人間)を文字列で返す。人体モデルや動画がない種目で使う
  function render(animation) {
    const a = animation || {};
    const alt = esc(a.alt || '動作見本');
    const draw = BUILTIN[a.ref];
    if (!draw) return `<div class="fig-missing">見本は準備中です</div>`;
    return `<svg class="fig m-${esc(a.ref)}" viewBox="0 0 200 190" role="img" aria-label="${alt}">
      ${ground}${draw()}</svg>`;
  }

  /* ---- 見本プレイヤー ----
   * 表示の優先順位: ex.media(動画・画像の本素材)→ ex.animation(人体モデル pose / 簡易アニメ builtin)
   * 本素材が読み込めないとき(オフラインで未保存、ファイルがない等)は、自動で次の候補に切り替える。
   *
   * ex.media の書き方(種目データ exercises.js):
   *   { kind: 'video',
   *     sources: [{ src: 'media/chair_squat.webm', type: 'video/webm' }, { src: 'media/chair_squat.mp4', type: 'video/mp4' }],
   *     poster: 'media/chair_squat.jpg',                 // 読み込み中に出す静止画(任意)
   *     keyPoses: [{ src: 'media/chair_squat_1.jpg', label: '開始姿勢' }, ...],   // 任意
   *     credit: { author, source, url, license },        // 出典・ライセンス(必須)
   *     reviewed: false }                                 // フォームを専門家が確認済みなら true
   *   { kind: 'image', src: 'media/xxx.gif', alt, credit, reviewed }
   *
   * opts.clock() → { sync: 0〜1 または null, sessionPaused: true/false }
   *   sync はタイマーと合わせた動作の位置(回数の種目で、音声のカウントと動きをそろえる) */
  const NOTE = {
    pose: '仮の見本です(人体モデルで関節の動きを計算)。フォームは運動指導の専門家による確認前です。',
    builtin: '簡易的な見本です。動きの目安としてご覧ください。',
    unreviewed: '素材のフォームは、専門家による確認前です。',
    fallback: '動画を読み込めなかったため、代わりの見本を表示しています。',
  };

  function candidates(ex) {
    const list = [];
    if (ex.media && (ex.media.kind === 'video' || ex.media.kind === 'image')) list.push(ex.media);
    const a = ex.animation || {};
    if (a.kind === 'pose' && root.MBP.Poses && root.MBP.Poses.has(a.ref)) list.push(a);
    if (a.kind === 'pose' && a.fallback) list.push({ kind: 'builtin', ref: a.fallback });
    if (a.kind === 'builtin') list.push(a);
    if (a.kind === 'image' || a.kind === 'video') list.push(a); // 旧形式の参照もそのまま使える
    return list;
  }

  function creditText(c) {
    if (!c) return '';
    const parts = [c.author && `作成: ${c.author}`, c.source && `出典: ${c.source}`, c.license && `ライセンス: ${c.license}`].filter(Boolean);
    return parts.join(' / ');
  }

  function mount(box, ex, opts) {
    const o = opts || {};
    const clock = o.clock || (() => ({ sync: null, sessionPaused: false }));
    const rootEl = document.createElement('div');
    rootEl.className = 'guide';
    rootEl.innerHTML = `<div class="guide-stage"></div>
      <div class="guide-phase" aria-live="polite"></div>
      <div class="guide-ctrl">
        <button type="button" class="guide-btn" data-g="play" aria-label="見本を一時停止">⏸</button>
        <button type="button" class="guide-btn" data-g="loop" aria-pressed="true">🔁 くり返し</button>
      </div>
      <div class="guide-keys"></div>
      <p class="guide-note"></p>`;
    const $stage = rootEl.querySelector('.guide-stage');
    const $phase = rootEl.querySelector('.guide-phase');
    const $play = rootEl.querySelector('[data-g=play]');
    const $loop = rootEl.querySelector('[data-g=loop]');
    const $keys = rootEl.querySelector('.guide-keys');
    const $note = rootEl.querySelector('.guide-note');

    const st = { localPaused: false, loop: true, ft: 0, lastT: 0, last: 0, raf: 0, alive: true, fellBack: false };
    let cur = null; // { kind, video, pose, svg, period }
    const list = candidates(ex);
    let idx = -1;

    function setNote() {
      if (!cur) return;
      const lines = [];
      if (st.fellBack) lines.push(NOTE.fallback);
      if (cur.kind === 'pose') lines.push(NOTE.pose);
      else if (cur.kind === 'builtin') lines.push(NOTE.builtin);
      else {
        if (!cur.src.reviewed) lines.push(NOTE.unreviewed);
        const c = creditText(cur.src.credit);
        if (c) lines.push(c);
      }
      $note.textContent = lines.join(' ');
    }

    function setKeys(items, onPick) {
      $keys.innerHTML = '';
      items.forEach((it, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'guide-key';
        b.appendChild(it.node);
        const cap = document.createElement('span');
        cap.textContent = `${i + 1}. ${it.label}`;
        b.appendChild(cap);
        b.addEventListener('click', () => onPick(it, i));
        $keys.appendChild(b);
      });
      $keys.hidden = items.length === 0;
    }

    // 次の候補を表示する(失敗したら、さらに次へ)
    function next() {
      teardownCurrent();
      idx += 1;
      const src = list[idx];
      if (!src) {
        $stage.innerHTML = '<div class="fig-missing">見本は準備中です</div>';
        cur = { kind: 'none' };
        $phase.textContent = '';
        $keys.hidden = true;
        rootEl.querySelector('.guide-ctrl').hidden = true;
        return;
      }
      rootEl.querySelector('.guide-ctrl').hidden = false;
      if (src.kind === 'video') return showVideo(src);
      if (src.kind === 'image') return showImage(src);
      if (src.kind === 'pose') return showPose(src);
      return showBuiltin(src);
    }
    // 読み込み失敗の知らせは1つの候補につき1回だけ受け取る(動画は source と video の両方から届くため)
    function failer() {
      const mine = idx;
      return () => {
        if (!st.alive || idx !== mine) return;
        st.fellBack = true;
        next();
      };
    }
    function teardownCurrent() {
      if (cur && cur.video) {
        try { cur.video.pause(); cur.video.removeAttribute('src'); cur.video.load(); } catch (e) { /* 何もしない */ }
      }
      $stage.innerHTML = '';
    }

    function showVideo(src) {
      const failCurrent = failer();
      const v = document.createElement('video');
      v.className = 'fig-media';
      v.muted = true;
      v.defaultMuted = true;
      v.playsInline = true;
      v.setAttribute('playsinline', '');
      v.setAttribute('muted', '');
      v.preload = 'auto';
      v.loop = st.loop;
      if (src.poster) v.poster = src.poster;
      v.setAttribute('aria-label', ex.name + 'の見本動画');
      const sources = src.sources || (src.src ? [{ src: src.src }] : []);
      sources.forEach((s, i) => {
        const se = document.createElement('source');
        se.src = s.src;
        if (s.type) se.type = s.type;
        if (i === sources.length - 1) se.addEventListener('error', failCurrent); // 最後の候補も読めなかった
        v.appendChild(se);
      });
      v.addEventListener('error', failCurrent);
      v.addEventListener('ended', () => { if (!st.loop) { st.localPaused = true; syncButtons(); } });
      $stage.appendChild(v);
      cur = { kind: 'video', video: v, src };
      $phase.textContent = '';
      const keys = (src.keyPoses || []).map((k) => {
        const img = document.createElement('img');
        img.src = k.src;
        img.alt = k.label;
        img.loading = 'lazy';
        return { node: img, label: k.label, time: k.time };
      });
      setKeys(keys, (k) => {
        if (k.time != null) { v.currentTime = k.time; st.localPaused = true; syncButtons(); }
      });
      setNote();
      if (!sources.length) failCurrent();
    }

    function showImage(src) {
      const failCurrent = failer();
      const img = document.createElement('img');
      img.className = 'fig-media';
      img.alt = src.alt || ex.name + 'の見本';
      img.addEventListener('error', failCurrent);
      img.src = src.src;
      $stage.appendChild(img);
      cur = { kind: 'image', src };
      $phase.textContent = '';
      setKeys([], () => {});
      setNote();
    }

    function showPose(src) {
      const P = root.MBP.Poses;
      const m = P.create(src.ref, {});
      $stage.appendChild(m.svg);
      cur = { kind: 'pose', src, pose: m, period: m.def.periodMs };
      const keys = m.def.keyPoses.map((k) => ({ node: P.create(src.ref, { t: k.t, thumb: true }).svg, label: k.label, t: k.t }));
      setKeys(keys, (k) => {
        // その姿勢で止めて確認できるようにする
        st.localPaused = true;
        st.lastT = k.t;
        st.ft = k.t * cur.period;
        m.update(k.t);
        $phase.textContent = P.phaseLabel(src.ref, k.t);
        syncButtons();
      });
      setNote();
    }

    function showBuiltin(src) {
      $stage.innerHTML = render(src);
      cur = { kind: 'builtin', src, svg: $stage.querySelector('svg') };
      $phase.textContent = '';
      setKeys([], () => {});
      setNote();
    }

    function syncButtons() {
      $play.textContent = st.localPaused ? '▶' : '⏸';
      $play.setAttribute('aria-label', st.localPaused ? '見本を再生' : '見本を一時停止');
      $loop.setAttribute('aria-pressed', String(st.loop));
      $loop.textContent = st.loop ? '🔁 くり返し' : '1回だけ';
    }

    $play.addEventListener('click', () => {
      st.localPaused = !st.localPaused;
      if (!st.localPaused && cur && cur.kind === 'video' && cur.video.ended) cur.video.currentTime = 0;
      if (!st.localPaused && cur && cur.kind === 'pose' && !st.loop && st.ft >= cur.period) st.ft = 0;
      syncButtons();
    });
    $loop.addEventListener('click', () => {
      st.loop = !st.loop;
      if (cur && cur.video) cur.video.loop = st.loop;
      if (cur && cur.kind === 'pose') st.ft = st.lastT * cur.period; // 今の位置から続ける
      syncButtons();
    });

    // 毎フレーム: 再生/停止の反映と、人体モデルの姿勢の更新
    function frame(now) {
      if (!st.alive) return;
      const dt = st.last ? Math.min(100, now - st.last) : 0;
      st.last = now;
      const c = clock();
      const playing = !c.sessionPaused && !st.localPaused && !document.hidden;
      if (cur && cur.kind === 'video') {
        const v = cur.video;
        if (playing && v.paused && !v.ended) {
          const p = v.play();
          if (p && p.catch) p.catch(() => { st.localPaused = true; syncButtons(); }); // 自動再生できない端末はボタンで再生
        } else if (!playing && !v.paused) v.pause();
      } else if (cur && cur.kind === 'pose') {
        let t = st.lastT;
        if (playing) {
          if (st.loop && c.sync != null) {
            t = c.sync;
            st.ft = t * cur.period;
          } else {
            st.ft += dt;
            if (!st.loop && st.ft >= cur.period) {
              st.ft = cur.period;
              st.localPaused = true;
              syncButtons();
              t = 0;
            } else t = (st.ft % cur.period) / cur.period;
          }
        }
        if (t !== st.lastT || !st.drawn) {
          cur.pose.update(t);
          st.drawn = true;
          const label = root.MBP.Poses.phaseLabel(cur.src.ref, t);
          if ($phase.textContent !== label) $phase.textContent = label;
        }
        st.lastT = t;
      } else if (cur && cur.kind === 'builtin' && cur.svg) {
        const stop = !playing;
        cur.svg.classList.toggle('is-stopped', stop);
        if (cur.svg.pauseAnimations) { if (stop) cur.svg.pauseAnimations(); else cur.svg.unpauseAnimations(); }
      }
      st.raf = requestAnimationFrame(frame);
    }

    function attach(target) {
      target.appendChild(rootEl);
      if (!st.raf && st.alive) st.raf = requestAnimationFrame(frame);
    }
    function destroy() {
      st.alive = false;
      cancelAnimationFrame(st.raf);
      st.raf = 0;
      teardownCurrent();
      rootEl.remove();
    }

    next();
    syncButtons();
    attach(box);
    return {
      attach,
      destroy,
      get kind() { return cur ? cur.kind : 'none'; },
      get state() { return { localPaused: st.localPaused, loop: st.loop, t: st.lastT, fellBack: st.fellBack }; },
    };
  }

  root.MBP = Object.assign(root.MBP || {}, { Figures: { render, mount, BUILTIN } });
})(typeof self !== 'undefined' ? self : this);
