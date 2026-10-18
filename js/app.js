/* 画面の描画と操作。状態の変化は Session の関数だけで行い、ここでは表示・保存・音声をつなぐ。 */
(function () {
  'use strict';
  const { Data, Session, Store, Voice, Figures } = window.MBP;
  const P = Session.PHASE;
  const EX = Data.EXERCISES;
  const $app = document.getElementById('app');

  const TAB_ID = Math.random().toString(36).slice(2, 10);
  const RESTORE_MAX_AGE_MS = 30 * 60 * 1000;
  const TAP_GUARD_MS = 600;
  const RING_C = 2 * Math.PI * 48;

  const ui = {
    screen: 'home',          // home | precheck | player | result | history | settings
    mode: null,
    session: null,
    sheet: null,             // null | 'symptom' | 'abort'
    precheck: new Set(),
    symptoms: new Set(),
    lastRecord: null,
    saveStatus: null,
    restoreOffer: null,
    conflict: false,
    lastCueKey: '',
    infoOpen: { desc: true, caution: true },
    renderedIndex: -1,
    guide: null,             // 動作見本のプレイヤー { key, ctl }
  };
  let settings = Store.loadSettings();
  let loopId = null;
  let lastLockAt = 0;
  let wakeLock = null;
  const lastTap = {};

  // ---- 小物 ----
  const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  function fmt(ms) {
    const sec = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  }
  function fmtSec(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m ? `${m}分${s ? s + '秒' : ''}` : `${s}秒`;
  }
  function fmtDate(t) {
    const d = new Date(t);
    const w = '日月火水木金土'[d.getDay()];
    return `${d.getMonth() + 1}/${d.getDate()}(${w}) ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  const exOf = (s) => EX[s.plan[Math.min(s.index, s.plan.length - 1)].exerciseId];
  function toast(msg) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3200);
  }
  function vibrate(ms) {
    if (settings.vibrate && navigator.vibrate && document.visibilityState === 'visible') {
      try { navigator.vibrate(ms); } catch (e) { /* 何もしない */ }
    }
  }

  function applySettings() {
    const root = document.documentElement;
    if (settings.theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', settings.theme);
    if (settings.fontSize === 'normal') root.removeAttribute('data-font');
    else root.setAttribute('data-font', settings.fontSize);
    Voice.configure({ enabled: settings.voice, style: settings.voiceStyle, rate: settings.voiceRate, name: settings.voiceName });
  }
  function updateSettings(patch) {
    settings = Object.assign({}, settings, patch);
    Store.saveSettings(settings);
    applySettings();
    render();
  }

  // ---- 画面を起こしたままにする(対応端末のみ) ----
  async function keepAwake(on) {
    try {
      if (on && 'wakeLock' in navigator && document.visibilityState === 'visible' && !wakeLock) {
        wakeLock = await navigator.wakeLock.request('screen');
        wakeLock.addEventListener('release', () => { wakeLock = null; });
      } else if (!on && wakeLock) {
        await wakeLock.release();
        wakeLock = null;
      }
    } catch (e) { /* 使えない端末では何もしない */ }
  }

  // ---- 状態の更新 ----
  // 操作は必ずここを通す。連打は無視し、Session 側でも許されない操作は無視される。
  function act(name, fn) {
    const now = Date.now();
    if (now - (lastTap[name] || 0) < TAP_GUARD_MS) return;
    lastTap[name] = now;
    if (!ui.session) return;
    const next = fn(ui.session, now);
    if (next !== ui.session) commit(next, now);
  }

  function commit(s, now) {
    const prev = ui.session;
    ui.session = s;
    if (prev && prev.phase !== s.phase) {
      if (s.phase === P.ACTIVE || s.phase === P.REST) vibrate(150);
      if (s.phase === P.READY && prev.index !== s.index) vibrate([120, 80, 120]);
    }
    if (Session.isTerminal(s)) {
      finish(s, now);
      return;
    }
    Store.saveSnapshot(s);
    if (!ui.conflict) { Store.writeLock(TAB_ID, s.id, now); lastLockAt = now; }
    speakCue(s, now);
    render();
  }

  // 終端に着いたとき: 保存は1回だけ。ロック・スナップショット・ループを片付ける。
  function finish(s, now) {
    stopLoop();
    keepAwake(false);
    Store.clearSnapshot();
    Store.releaseLock(TAB_ID);
    ui.sheet = null;
    ui.conflict = false;
    if (Session.shouldSave(s)) {
      const record = Session.toRecord(s, EX, now);
      ui.saveStatus = Store.saveRecord(record);
      ui.session = Object.assign({}, s, { saved: true });
      ui.lastRecord = record;
      ui.screen = 'result';
      if (s.phase === P.COMPLETED) Voice.cue('おつかれさまでした。今日の運動は、これでおしまいです。', 'done', true);
      else Voice.stop();
    } else {
      // 一度も始めていない中止は記録しない
      ui.session = null;
      ui.screen = 'home';
      Voice.stop();
      toast(s.phase === P.COMPLETED ? '実施した種目がないため、記録せずに戻りました' : '中止しました');
    }
    render();
  }

  function startLoop() {
    stopLoop();
    loopId = setInterval(onTick, 250);
  }
  function stopLoop() {
    if (loopId) clearInterval(loopId);
    loopId = null;
  }

  function onTick() {
    const s = ui.session;
    if (!s || Session.isTerminal(s)) return;
    const now = Date.now();
    if (checkConflict(now)) return;
    if (!ui.conflict && now - lastLockAt > 2000) { Store.writeLock(TAB_ID, s.id, now); lastLockAt = now; }
    const n = Session.tick(s, now);
    if (n !== s) commit(n, now);
    else { speakCue(s, now); updateLive(now); }
  }

  // ほかのタブで新しく運動が始まったら、こちらは一時停止してロックを手放す
  function checkConflict(now) {
    const s = ui.session;
    if (!s || ui.conflict || !Store.otherActive(TAB_ID, now)) return false;
    ui.conflict = true;
    const paused = Session.pause(s, now);
    if (paused !== s) commit(paused, now);
    else render();
    toast('別の画面で運動が始まったため一時停止しました');
    return true;
  }

  // ---- 音声ガイド ----
  function cueFor(s, now) {
    const v = Session.view(s, now);
    const ex = exOf(s);
    const step = v.step;
    const tag = `${s.id}|${s.index}|${s.set}|`;
    const sec = Math.ceil(v.remainingMs / 1000);
    // text: 声で読む言葉(null なら声では何も言わない) / chime: チャイム方式で鳴らす音
    // 命令口調や早口のカウントダウンは避け、やわらかい言い方にしている。
    switch (s.phase) {
      case P.READY: {
        const first = step.setLabels ? `${step.setLabels[0]}からです。` : '';
        const lead = s.index > 0 ? 'おつかれさまです。次は、' : 'まずは、';
        return { key: tag + 'ready', chime: s.index > 0 ? 'next' : null,
          text: `${lead}${ex.name}です。${first}準備ができたら、開始を押してください。` };
      }
      case P.COUNTDOWN:
        if (sec === 3) return { key: tag + 'cd', text: 'では、はじめます。', chime: 'tick' };
        return sec >= 1 && sec <= 2 ? { key: tag + 'cd' + sec, text: null, chime: 'tick' } : null;
      case P.ACTIVE:
        if (v.elapsedMs < 1000) return { key: tag + 'go', text: 'はじめましょう。', chime: 'start' };
        if (step.measure === 'reps') {
          return v.reps >= 1 ? { key: tag + 'rep' + v.reps, text: String(v.reps), chime: 'tick' } : null;
        }
        if (sec === 10 && step.workMs >= 20000) return { key: tag + 'a10', text: 'あと10秒です。', chime: null };
        return null;
      case P.REST:
        if (v.elapsedMs < 1000) {
          const nextLabel = v.setLabel ? `次は${v.setLabel}です。` : '';
          return { key: tag + 'rest', text: `ひと休みしましょう。${nextLabel}`, chime: 'rest' };
        }
        return null;
      default:
        return null;
    }
  }
  function speakCue(s, now) {
    const c = cueFor(s, now);
    if (!c || c.key === ui.lastCueKey) return;
    ui.lastCueKey = c.key;
    Voice.cue(c.text, c.chime);
  }

  // ---- 開始・復元 ----
  function beginSession(mode) {
    const now = Date.now();
    if (ui.session && !Session.isTerminal(ui.session)) {
      ui.screen = 'player';
      render();
      return; // すでに動いているセッションがあれば新しく作らない
    }
    if (Store.otherActive(TAB_ID, now)) {
      toast('別の画面で運動中です。そちらを終えてから始めてください');
      return;
    }
    const id = `s_${now.toString(36)}_${TAB_ID}`;
    const s = Session.create({ id, mode, menu: Data.menuFor(mode), exercises: EX, now });
    ui.conflict = false;
    ui.lastCueKey = '';
    ui.restoreOffer = null;
    Store.clearSnapshot();
    ui.screen = 'player';
    Voice.unlock();
    keepAwake(true);
    startLoop();
    commit(s, now);
  }

  function restoreSession() {
    const now = Date.now();
    const snap = ui.restoreOffer;
    if (!snap) return;
    if (Store.otherActive(TAB_ID, now)) {
      toast('別の画面で運動中です');
      return;
    }
    ui.restoreOffer = null;
    ui.conflict = false;
    ui.lastCueKey = '';
    ui.screen = 'player';
    Voice.unlock();
    keepAwake(true);
    startLoop();
    commit(Session.restore(snap, now), now);
    if (ui.session && !Session.isTerminal(ui.session)) toast('一時停止の状態で戻しました。準備ができたら「再開」を押してください');
  }

  function discardRestore() {
    const snap = ui.restoreOffer;
    ui.restoreOffer = null;
    Store.clearSnapshot();
    if (snap && snap.startedAt) {
      // 途中までの分は「中止」として残す
      const now = Date.now();
      const s = Session.abort(snap, now, 'discarded');
      if (Session.shouldSave(s)) Store.saveRecord(Session.toRecord(s, EX, now));
    }
    render();
  }

  // ---- 描画 ----
  function render() {
    const stage = document.getElementById('stage');
    const keepScroll = stage && ui.session && ui.renderedIndex === ui.session.index ? stage.scrollTop : 0;
    const views = { home: viewHome, precheck: viewPrecheck, player: viewPlayer, result: viewResult, history: viewHistory, settings: viewSettings };
    $app.innerHTML = (views[ui.screen] || viewHome)();
    if (ui.screen === 'player' && ui.session && !Session.isTerminal(ui.session)) {
      ui.renderedIndex = ui.session.index;
      mountGuide();
      const st = document.getElementById('stage');
      if (st) st.scrollTop = keepScroll;
      updateLive(Date.now());
    } else {
      unmountGuide();
    }
  }

  // ---- 動作見本 ----
  // 画面を描き直しても見本(動画など)は作り直さず、同じ種目なら付け替えるだけにする
  function mountGuide() {
    const box = document.getElementById('figBox');
    if (!box) return;
    const s = ui.session;
    const ex = exOf(s);
    const key = `${s.id}|${s.index}|${ex.id}`;
    if (ui.guide && ui.guide.key === key) {
      ui.guide.ctl.attach(box);
      return;
    }
    unmountGuide();
    ui.guide = { key, ctl: Figures.mount(box, ex, { clock: guideClock }) };
  }
  function unmountGuide() {
    if (ui.guide) ui.guide.ctl.destroy();
    ui.guide = null;
  }
  // 見本の動きを、運動中はタイマー(音声のカウント)とそろえる
  function guideClock() {
    const s = ui.session;
    if (!s) return { sync: null, sessionPaused: true };
    const paused = s.phase === P.PAUSED || !!ui.sheet;
    if (s.phase !== P.ACTIVE) return { sync: null, sessionPaused: paused };
    const step = s.plan[s.index];
    if (step.measure !== 'reps') return { sync: null, sessionPaused: paused };
    const el = Session.elapsedMs(s.timer, Date.now());
    return { sync: (el % step.msPerRep) / step.msPerRep, sessionPaused: paused };
  }

  function viewHome() {
    const now = Date.now();
    const busy = Store.otherActive(TAB_ID, now);
    const cards = ['work', 'home'].map((mode) => {
      const menu = Data.menuFor(mode);
      const min = Math.max(1, Math.round(Session.estimateSec(menu, EX) / 60));
      return `<button class="card mode-card" data-action="choose" data-mode="${mode}" ${busy ? 'disabled' : ''}>
        <span class="mode-name">${esc(Data.MODES[mode].label)}</span>
        <span>${esc(menu.note)}</span>
        <span class="meta"><span>${menu.items.length}種目</span><span>目安 約${min}分</span></span>
        <span class="btn btn-primary go">このモードで始める</span>
      </button>`;
    }).join('');
    const r = ui.restoreOffer;
    const restore = r ? `<div class="banner banner-info stack">
        <div><b>途中の運動があります</b><br>${esc(Data.MODES[r.mode].label)}・${r.index + 1}/${r.plan.length}種目目</div>
        <div class="row"><button class="btn btn-primary" data-action="restore">続きから</button>
        <button class="btn" data-action="discard-restore">やめる</button></div></div>` : '';
    return `<section class="screen">
      <div class="brand"><h1>MY BODY PROJECT</h1>
        <button class="btn btn-ghost" data-action="go" data-to="settings" aria-label="設定">⚙ 設定</button></div>
      ${busy ? '<div class="banner banner-warn">別の画面(タブ)で運動中です。同時に2つは始められません。</div>' : ''}
      ${restore}
      ${cards}
      <div class="banner banner-warn small">胸の痛み・強い息切れ・めまい・痛みが出たら、すぐに中止してください。
        持病のある方・通院中の方は、医師に相談のうえ行ってください。</div>
      <div class="spacer"></div>
      <button class="btn" data-action="go" data-to="history">これまでの記録</button>
    </section>`;
  }

  function viewPrecheck() {
    const anyChecked = ui.precheck.size > 0;
    const note = ui.mode === 'work'
      ? '周りの人や物にぶつからないか確認してください。キャスター付きのイスは使わないでください。'
      : '床がすべらないか、周りに物がないか確認してください。水分も用意しましょう。';
    const items = Data.PRECHECK.map((t, i) => `<label class="check">
        <input type="checkbox" data-check="precheck" value="${i}" ${ui.precheck.has(i) ? 'checked' : ''}>
        <span>${esc(t)}</span></label>`).join('');
    return `<section class="screen">
      <div><button class="btn btn-ghost" data-action="go" data-to="home">← 戻る</button></div>
      <h1 class="screen-title">始める前に体調を確認しましょう</h1>
      <p class="muted">今の体調で、当てはまるものはありますか?</p>
      <div class="check-list">${items}</div>
      ${anyChecked ? `<div class="banner banner-danger"><b>今日は運動を控えましょう。</b><br>
        症状が続くとき・気になるときは、医療機関に相談してください。</div>` : ''}
      <div class="banner banner-info small">${esc(note)}</div>
      <div class="spacer"></div>
      <button class="btn btn-primary btn-big" data-action="begin" ${anyChecked ? 'disabled' : ''}>当てはまらないので始める</button>
    </section>`;
  }

  function viewPlayer() {
    const s = ui.session;
    if (!s) return viewHome();
    const ex = exOf(s);
    const step = s.plan[s.index];
    const base = Session.basePhase(s);
    const paused = s.phase === P.PAUSED;
    const v = Session.view(s, Date.now());
    const dots = s.plan.map((_, i) => `<i class="${i < s.index ? 'done' : i === s.index ? 'now' : ''}"></i>`).join('');

    let alts = '';
    if (s.phase === P.READY) {
      const orig = step.originalId;
      const choices = [EX[orig], ...Data.alternativesFor(orig)]
        .filter((e, i, a) => e && e.id !== ex.id && a.findIndex((x) => x.id === e.id) === i);
      if (choices.length) {
        alts = `<div class="stack"><div class="small muted">この種目がやりにくいときは、ほかの種目に替えられます</div>
          <div class="alt-list">${choices.map((c) => `<button class="btn" data-action="replace" data-id="${c.id}">
            ${c.id === orig ? '元に戻す: ' : '替える: '}${esc(c.name)}</button>`).join('')}</div></div>`;
      }
    }

    const lastSetOfLast = s.index === s.plan.length - 1 && s.set === step.sets;
    let secondary;
    if (base === P.READY) secondary = `<button class="btn" data-action="skip">スキップ</button>`;
    else if (base === P.COUNTDOWN) secondary = `<button class="btn" data-action="skip">スキップ</button><button class="btn" data-action="next">すぐ始める</button>`;
    else if (base === P.REST) secondary = `<button class="btn" data-action="skip">スキップ</button><button class="btn" data-action="next">休憩を飛ばす</button>`;
    else secondary = `<button class="btn" data-action="skip">スキップ</button><button class="btn" data-action="next">${lastSetOfLast ? '完了' : 'セット完了'}</button>`;

    const primary = s.phase === P.READY
      ? `<button class="btn btn-primary btn-big" data-action="start">開始</button>`
      : paused
        ? `<button class="btn btn-primary btn-big" data-action="resume">再開</button>`
        : `<button class="btn btn-big" data-action="pause">一時停止</button>`;

    return `<section class="screen player phase-${s.phase === P.PAUSED ? 'paused' : s.phase} ${paused ? 'is-paused' : ''}">
      <header class="topbar">
        <button class="btn btn-ghost" data-action="ask-abort">✕ 中止</button>
        <div class="progress">${s.index + 1} / ${s.plan.length} 種目<div class="dots">${dots}</div></div>
        <button class="btn btn-ghost" data-action="toggle-voice" aria-pressed="${settings.voice}" aria-label="音声ガイド">
          ${settings.voice ? '🔊 音声' : '🔇 音声'}</button>
      </header>
      <div class="stage" id="stage">
        ${ui.conflict ? '<div class="banner banner-warn">別の画面で運動が始まったため一時停止しています。</div>' : ''}
        <div class="figure-box" id="figBox"></div>
        <div class="ex-head">
          <h1 class="ex-name">${esc(ex.name)}</h1>
          <span class="set-badge">セット <b>${s.set}</b>/${step.sets}${v.setLabel ? `・<b>${esc(v.setLabel)}</b>` : ''}</span>
        </div>
        <div class="clock">
          <svg class="ring" viewBox="0 0 112 112" aria-hidden="true">
            <circle class="track" cx="56" cy="56" r="48"/>
            <circle class="bar" id="ringBar" cx="56" cy="56" r="48" stroke-dasharray="${RING_C}" stroke-dashoffset="${RING_C}"/>
          </svg>
          <div class="clock-main">
            <div class="phase-label" id="phaseLabel" aria-live="polite"></div>
            <div class="clock-num" id="clockNum"></div>
            <div class="next-up" id="subLabel"></div>
          </div>
        </div>
        ${alts}
        <details class="info" data-k="desc" ${ui.infoOpen.desc ? 'open' : ''}><summary>やり方</summary>
          <ol>${ex.description.map((d) => `<li>${esc(d)}</li>`).join('')}</ol></details>
        <details class="info caution" data-k="caution" ${ui.infoOpen.caution ? 'open' : ''}><summary>⚠ 注意</summary>
          <ul>${ex.cautions.map((d) => `<li>${esc(d)}</li>`).join('')}
            <li>痛みや体調の異変を感じたら、無理に続けず「痛み・体調の異変」を押してください。</li></ul></details>
      </div>
      <footer class="controls">
        <button class="btn btn-danger-outline" data-action="symptom">⚠ 痛み・体調の異変</button>
        <div class="row">${secondary}</div>
        ${primary}
      </footer>
      ${ui.sheet === 'symptom' ? viewSymptomSheet() : ''}
      ${ui.sheet === 'abort' ? viewAbortSheet() : ''}
    </section>`;
  }

  // タイマーなど、毎回変わる部分だけを書き換える
  function updateLive(now) {
    const s = ui.session;
    if (ui.screen !== 'player' || !s || Session.isTerminal(s)) return;
    const v = Session.view(s, now);
    const step = v.step;
    const $num = document.getElementById('clockNum');
    const $label = document.getElementById('phaseLabel');
    const $sub = document.getElementById('subLabel');
    const $bar = document.getElementById('ringBar');
    if (!$num) return;
    let label = '';
    let num = '';
    let sub = '';
    let progress = v.progress;
    const repsText = (n) => `${n}<small> / ${step.reps}回</small>`;
    switch (v.base) {
      case P.READY:
        label = '準備';
        num = step.measure === 'reps' ? `${step.reps}<small>回</small>` : fmt(step.workMs);
        sub = step.measure === 'reps' ? `1回 約${step.msPerRep / 1000}秒のペース` : '準備ができたら「開始」';
        progress = 0;
        break;
      case P.COUNTDOWN:
        label = 'まもなく開始';
        num = String(Math.max(1, Math.ceil(v.remainingMs / 1000)));
        sub = v.setLabel ? `${v.setLabel}から` : '';
        break;
      case P.ACTIVE:
        label = '運動中';
        if (step.measure === 'reps') { num = repsText(v.reps); sub = `残り ${fmt(v.remainingMs)}`; }
        else num = fmt(v.remainingMs);
        break;
      case P.REST:
        label = '休憩';
        num = fmt(v.remainingMs);
        sub = `次: セット${s.set}${v.setLabel ? '・' + v.setLabel : ''}`;
        break;
      default:
        break;
    }
    if (s.phase === P.PAUSED) label = '一時停止中';
    if ($label.textContent !== label) $label.textContent = label;
    if ($num.innerHTML !== num) $num.innerHTML = num;
    if ($sub.textContent !== sub) $sub.textContent = sub;
    $bar.setAttribute('stroke-dashoffset', String(RING_C * (1 - progress)));
  }

  function viewSymptomSheet() {
    const sel = ui.symptoms;
    const danger = Data.SYMPTOMS.some((x) => x.danger && sel.has(x.id));
    const items = Data.SYMPTOMS.map((x) => `<label class="check">
        <input type="checkbox" data-check="symptom" value="${x.id}" ${sel.has(x.id) ? 'checked' : ''}>
        <span>${esc(x.label)}</span></label>`).join('');
    return `<div class="sheet-backdrop"><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="symTitle">
      <h2 id="symTitle">どんな症状ですか?</h2>
      <p class="muted">タイマーは止めました。当てはまるものを選んで、運動を中止してください。</p>
      <div class="check-list">${items}</div>
      ${danger ? `<div class="banner banner-danger"><b>すぐに運動をやめて、座るか横になって休んでください。</b>
        おさまらないときは、ためらわず119番に連絡してください。</div>` : ''}
      <button class="btn btn-danger btn-big" data-action="symptom-stop">運動を中止する</button>
      <button class="btn btn-ghost" data-action="close-sheet">まちがえて押した(一時停止のまま戻る)</button>
    </div></div>`;
  }

  function viewAbortSheet() {
    const started = ui.session && ui.session.startedAt;
    return `<div class="sheet-backdrop"><div class="sheet" role="dialog" aria-modal="true" aria-labelledby="abTitle">
      <h2 id="abTitle">運動を中止しますか?</h2>
      <p class="muted">${started ? 'ここまでの記録は保存されます。' : 'まだ始めていないので、記録は残りません。'}</p>
      <button class="btn btn-danger btn-big" data-action="abort">中止する</button>
      <button class="btn" data-action="close-sheet">続ける(一時停止のまま戻る)</button>
    </div></div>`;
  }

  function guidanceHtml(symptoms) {
    const danger = Data.SYMPTOMS.some((x) => x.danger && symptoms.includes(x.id));
    const pain = symptoms.includes('joint_pain');
    if (danger) {
      return `<div class="banner banner-danger stack">
        <b>すぐに運動をやめて、安静にしてください</b>
        <ul style="margin:0;padding-left:1.2em">
          <li>座るか横になり、楽な姿勢で休んでください。</li>
          <li>近くに人がいれば、体調が悪いことを伝えてください。</li>
          <li>胸の痛みが続く、息苦しさがおさまらない、気が遠くなるなどのときは、ためらわず119番に連絡してください。</li>
          <li>症状がおさまっても、今日は運動を再開しないでください。気になる症状は医療機関に相談してください。</li>
        </ul>
        <a class="btn btn-danger" href="tel:119">📞 119番に電話する</a></div>`;
    }
    if (pain) {
      return `<div class="banner banner-warn stack">
        <b>痛みが出た運動はやめましょう</b>
        <ul style="margin:0;padding-left:1.2em">
          <li>痛みが出た動きは続けないでください。</li>
          <li>痛む部分を休ませてください。</li>
          <li>痛みが続く・腫れる・しびれるときは、医療機関(整形外科など)に相談してください。</li>
          <li>次に運動するときも、痛みのある部位を使う種目は行わないでください。</li>
        </ul></div>`;
    }
    return `<div class="banner banner-warn stack"><b>無理をせず休みましょう</b>
      <span>違和感が続くとき・強くなるときは、医療機関に相談してください。</span></div>`;
  }

  const STATUS_TAG = {
    done: ['tag-done', '完了'], partial: ['tag-abort', '途中まで'], skipped: ['tag-skip', 'スキップ'],
    not_done: ['tag-skip', '未実施'], pending: ['tag-skip', '未実施'], in_progress: ['tag-abort', '途中まで'],
  };
  const RECORD_TAG = {
    completed: ['tag-done', '完了'], aborted: ['tag-abort', '中止'], symptom_stop: ['tag-stop', '体調により中止'],
  };

  function viewResult() {
    const r = ui.lastRecord;
    if (!r) return viewHome();
    const doneCount = r.items.filter((i) => i.status === 'done').length;
    const title = r.status === 'completed' ? 'おつかれさまでした!' : r.status === 'symptom_stop' ? '運動を中止しました' : '運動を中止しました';
    const icon = r.status === 'completed' ? '🎉' : r.status === 'symptom_stop' ? '🛑' : '⏹';
    const saved = ui.saveStatus === 'saved' ? '<p class="muted small">記録を保存しました。</p>'
      : ui.saveStatus === 'duplicate' ? '<p class="muted small">この記録は保存済みです。</p>'
        : '<div class="banner banner-warn small">この端末に記録を保存できませんでした(ブラウザの設定で保存が無効になっている可能性があります)。</div>';
    const items = r.items.map((it) => {
      const [cls, label] = STATUS_TAG[it.status] || STATUS_TAG.not_done;
      return `<li><span>${esc(it.name)}${it.replacedFromName ? `<br><span class="small muted">(${esc(it.replacedFromName)}から変更)</span>` : ''}</span>
        <span class="tag ${cls}">${label}${it.setsDone ? ` ${it.setsDone}/${it.plannedSets}` : ''}</span></li>`;
    }).join('');
    const rpe = r.status === 'completed' ? `<div class="stack"><div class="setting label">きつさはどうでしたか?(1 楽 〜 5 きつい)</div>
      <div class="rpe">${[1, 2, 3, 4, 5].map((n) => `<button class="btn" data-action="rpe" data-v="${n}" aria-pressed="${r.rpe === n}">${n}</button>`).join('')}</div>
      ${r.rpe >= 5 ? '<p class="small muted">きつすぎるときは、次回は回数やセット数を減らしましょう。</p>' : ''}</div>` : '';
    return `<section class="screen">
      ${r.status === 'symptom_stop' ? guidanceHtml(r.symptoms) : ''}
      <div class="result-icon" aria-hidden="true">${icon}</div>
      <h1 class="screen-title" style="text-align:center">${title}</h1>
      <div class="stats">
        <div class="stat"><div class="v">${fmtSec(r.activeSec)}</div><div class="k">運動した時間</div></div>
        <div class="stat"><div class="v">${doneCount}/${r.items.length}</div><div class="k">完了した種目</div></div>
      </div>
      ${rpe}
      <div class="card"><ul class="item-list">${items}</ul></div>
      ${saved}
      <div class="spacer"></div>
      <button class="btn btn-primary btn-big" data-action="go" data-to="home">ホームへ</button>
    </section>`;
  }

  function viewHistory() {
    const h = Store.loadHistory();
    const list = h.length ? h.map((r) => {
      const [cls, label] = RECORD_TAG[r.status] || RECORD_TAG.aborted;
      const done = r.items.filter((i) => i.status === 'done').length;
      return `<div class="card history-item">
        <div class="top"><b>${esc(fmtDate(r.startedAt))}</b><span class="tag ${cls}">${label}</span></div>
        <div>${esc((Data.MODES[r.mode] || {}).label || r.mode)}</div>
        <div class="small muted">運動 ${fmtSec(r.activeSec)}・種目 ${done}/${r.items.length}${r.rpe ? `・きつさ ${r.rpe}` : ''}</div>
      </div>`;
    }).join('') : '<p class="empty">まだ記録はありません。</p>';
    return `<section class="screen">
      <div><button class="btn btn-ghost" data-action="go" data-to="home">← 戻る</button></div>
      <h1 class="screen-title">これまでの記録</h1>
      <div class="stack">${list}</div>
    </section>`;
  }

  function viewSettings() {
    const seg = (key, opts) => `<div class="seg">${opts.map(([val, label]) =>
      `<button class="btn" data-action="setting" data-key="${key}" data-v="${val}" aria-pressed="${String(settings[key]) === String(val)}">${label}</button>`).join('')}</div>`;
    return `<section class="screen">
      <div><button class="btn btn-ghost" data-action="go" data-to="home">← 戻る</button></div>
      <h1 class="screen-title">設定</h1>
      <div class="setting"><span class="label">音声ガイド</span>${seg('voice', [[true, 'ON'], [false, 'OFF']])}</div>
      <div class="setting"><span class="label">知らせ方</span>${seg('voiceStyle', [['voice', '声で案内'], ['chime', 'チャイム音だけ']])}
        <span class="small muted">声が苦手なときは「チャイム音だけ」にすると、やわらかい音で区切りを知らせます。</span></div>
      ${settings.voiceStyle === 'voice' ? viewVoiceChoice(seg) : ''}
      <button class="btn" data-action="preview-voice">♪ 試しに聞く</button>
      <div class="setting"><span class="label">振動</span>${seg('vibrate', [[true, 'ON'], [false, 'OFF']])}</div>
      <div class="setting"><span class="label">テーマ</span>${seg('theme', [['system', '端末に合わせる'], ['light', 'ライト'], ['dark', 'ダーク']])}</div>
      <div class="setting"><span class="label">文字の大きさ</span>${seg('fontSize', [['normal', '標準'], ['large', '大きめ'], ['xlarge', '特大']])}</div>
    </section>`;
  }

  function viewVoiceChoice(seg) {
    if (!Voice.supported) return '<p class="small muted">この端末では声の読み上げが使えません。「チャイム音だけ」をお使いください。</p>';
    const names = Voice.voices();
    const opts = [['auto', `おまかせ(${Voice.currentName ? shortName(Voice.currentName) : '自動'})`]]
      .concat(names.map((n) => [n, shortName(n)]));
    const choice = names.length > 1 ? `<div class="setting"><span class="label">声の種類</span>
      <div class="stack">${opts.map(([val, label]) => `<button class="btn" data-action="setting" data-key="voiceName" data-v="${esc(val)}"
        aria-pressed="${settings.voiceName === val}">${esc(label)}</button>`).join('')}</div>
      <span class="small muted">端末に入っている声から選べます。iPhone・Android の声のほうが自然なことが多いです。</span></div>` : '';
    return `${choice}<div class="setting"><span class="label">話す速さ</span>${seg('voiceRate', [['slow', 'ゆっくり'], ['normal', 'ふつう']])}</div>`;
  }
  // "Microsoft Haruka - Japanese (Japan)" → "Haruka"
  const shortName = (n) => n.replace(/^Microsoft\s+/i, '').replace(/\s*[-(].*$/, '').replace(/\s+Online.*$/i, '').trim() || n;

  // ---- 操作 ----
  const handlers = {
    'preview-voice'() {
      Voice.unlock();
      if (Voice.style === 'chime') {
        Voice.chime('start');
        setTimeout(() => Voice.chime('rest'), 1200);
        return;
      }
      Voice.say('こんにちは。この声で案内します。準備ができたら、開始を押してください。', true);
    },
    go(el) {
      ui.screen = el.dataset.to;
      if (ui.screen === 'home') { ui.lastRecord = null; if (ui.session && Session.isTerminal(ui.session)) ui.session = null; }
      render();
      window.scrollTo(0, 0);
    },
    choose(el) {
      ui.mode = el.dataset.mode;
      ui.precheck = new Set();
      ui.screen = 'precheck';
      render();
    },
    begin() {
      if (ui.precheck.size > 0) return;
      beginSession(ui.mode);
    },
    restore: restoreSession,
    'discard-restore': discardRestore,
    start() {
      if (Store.otherActive(TAB_ID, Date.now())) {
        toast('別の画面で運動中です。そちらを終えてから始めてください');
        return;
      }
      Voice.unlock();
      ui.conflict = false;
      act('start', Session.start);
    },
    pause() {
      act('pause', Session.pause);
      if (Voice.style === 'voice') Voice.say('一時停止します。', true);
    },
    resume() {
      if (Store.otherActive(TAB_ID, Date.now())) {
        toast('別の画面で運動中です。そちらを終えてから再開してください');
        return;
      }
      ui.conflict = false;
      if (Voice.style === 'voice') Voice.say('再開します。', true);
      act('resume', Session.resume);
    },
    next() { act('next', Session.next); },
    skip() { act('skip', Session.skip); },
    replace(el) {
      act('replace', (s, now) => Session.replace(s, el.dataset.id, EX, now));
    },
    symptom() {
      // 押した瞬間にタイマーを止める
      ui.symptoms = new Set();
      ui.sheet = 'symptom';
      const now = Date.now();
      const p = Session.pause(ui.session, now);
      if (p !== ui.session) commit(p, now); else render();
      Voice.stop();
    },
    'symptom-stop'() {
      const list = Array.from(ui.symptoms);
      act('symptom-stop', (s, now) => Session.symptomStop(s, now, list));
    },
    'ask-abort'() {
      ui.sheet = 'abort';
      const now = Date.now();
      const p = Session.pause(ui.session, now);
      if (p !== ui.session) commit(p, now); else render();
    },
    abort() { act('abort', (s, now) => Session.abort(s, now, 'user')); },
    'close-sheet'() {
      // 閉じても自動では再開しない
      ui.sheet = null;
      render();
    },
    'toggle-voice'() { updateSettings({ voice: !settings.voice }); },
    setting(el) {
      const key = el.dataset.key;
      let v = el.dataset.v;
      if (v === 'true') v = true;
      else if (v === 'false') v = false;
      updateSettings({ [key]: v });
    },
    rpe(el) {
      const n = Number(el.dataset.v);
      if (!ui.lastRecord) return;
      ui.lastRecord = Object.assign({}, ui.lastRecord, { rpe: n });
      Store.updateRecord(ui.lastRecord.id, { rpe: n });
      render();
    },
  };

  $app.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    const h = handlers[el.dataset.action];
    if (h) h(el);
  });
  $app.addEventListener('change', (e) => {
    const el = e.target;
    if (!el.dataset || !el.dataset.check) return;
    const set = el.dataset.check === 'precheck' ? ui.precheck : ui.symptoms;
    const val = el.dataset.check === 'precheck' ? Number(el.value) : el.value;
    if (el.checked) set.add(val); else set.delete(val);
    render();
  });
  $app.addEventListener('toggle', (e) => {
    const el = e.target;
    if (el.tagName === 'DETAILS' && el.dataset.k) ui.infoOpen[el.dataset.k] = el.open;
  }, true);

  // ---- バックグラウンド復帰・別タブ ----
  document.addEventListener('visibilitychange', () => {
    const s = ui.session;
    if (document.visibilityState !== 'visible' || !s || Session.isTerminal(s)) return;
    const now = Date.now();
    keepAwake(true);
    if (checkConflict(now)) return;
    const n = Session.tick(s, now);
    if (n !== s) {
      const moved = n.phase !== s.phase || n.index !== s.index || n.set !== s.set;
      commit(n, now);
      if (moved && !Session.isTerminal(n)) toast('画面を離れている間の時間を反映しました');
    } else {
      updateLive(now);
    }
  });
  window.addEventListener('storage', (e) => {
    if (e.key === Store.KEYS.lock) checkConflict(Date.now());
  });
  window.addEventListener('pagehide', () => { Store.releaseLock(TAB_ID); });
  window.addEventListener('beforeunload', (e) => {
    const s = ui.session;
    if (s && Session.isTimed(s)) { e.preventDefault(); e.returnValue = ''; }
  });

  // ---- 起動 ----
  function boot() {
    applySettings();
    Voice.onVoicesChanged(() => { if (ui.screen === 'settings') render(); });
    const snap = Store.loadSnapshot();
    if (snap && snap.session) {
      const s = snap.session;
      const fresh = Date.now() - (snap.savedAt || 0) <= RESTORE_MAX_AGE_MS;
      if (fresh && !Session.isTerminal(s) && s.v === 1) ui.restoreOffer = s;
      else Store.clearSnapshot();
    }
    render();
  }
  boot();
})();
