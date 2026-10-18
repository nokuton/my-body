/* セッションの状態遷移とタイマー。画面には依存しない(テスト可能な純粋関数)。
 * どの関数も元のセッションを書き換えず、変化があれば新しいオブジェクトを返す。
 * 許されない操作は何もせず、元のセッションをそのまま返す。 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MBP = Object.assign(root.MBP || {}, { Session: api });
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const PHASE = Object.freeze({
    READY: 'ready',
    COUNTDOWN: 'countdown',
    ACTIVE: 'active',
    REST: 'rest',
    PAUSED: 'paused',
    COMPLETED: 'completed',
    ABORTED: 'aborted',
    SYMPTOM_STOP: 'symptom_stop',
  });
  const TIMED = [PHASE.COUNTDOWN, PHASE.ACTIVE, PHASE.REST];
  const TERMINAL = [PHASE.COMPLETED, PHASE.ABORTED, PHASE.SYMPTOM_STOP];
  const COUNTDOWN_MS = 3000;
  const MAX_CATCHUP_STEPS = 500;

  const clone = (s) => JSON.parse(JSON.stringify(s));
  const isTimed = (s) => TIMED.includes(s.phase);
  const isTerminal = (s) => TERMINAL.includes(s.phase);
  // 一時停止中も含めた「いま中身として何をしているか」
  const basePhase = (s) => (s.phase === PHASE.PAUSED ? s.pausedPhase : s.phase);

  // ---- タイマー(時刻の差で計算する) ----
  function newTimer(durationMs, since) {
    return { durationMs, accMs: 0, since };
  }
  function elapsedMs(timer, now) {
    if (!timer) return 0;
    const running = timer.since != null ? Math.max(0, now - timer.since) : 0;
    return timer.accMs + running;
  }
  function remainingMs(s, now) {
    if (!s.timer) return 0;
    return Math.max(0, s.timer.durationMs - elapsedMs(s.timer, now));
  }

  // ---- 作成 ----
  function buildStep(ex, overrides) {
    const o = Object.assign({}, ex, overrides || {});
    const isReps = o.measure === 'reps';
    const msPerRep = isReps ? Math.round(o.secPerRep * 1000) : null;
    return {
      exerciseId: ex.id,
      measure: o.measure,
      sets: Math.max(1, o.sets || 1),
      workMs: isReps ? o.reps * msPerRep : o.durationSec * 1000,
      reps: isReps ? o.reps : null,
      msPerRep,
      restMs: (o.restSec || 0) * 1000,
      setLabels: o.setLabels || null,
    };
  }

  function create({ id, mode, menu, exercises, now }) {
    const plan = [];
    for (const it of menu.items) {
      const ex = exercises[it.exerciseId];
      if (!ex) throw new Error('未登録の種目: ' + it.exerciseId);
      if (ex.impact === 'high') continue; // 高衝撃はメニューに入れない
      plan.push(Object.assign(buildStep(ex, it.overrides), { originalId: ex.id }));
    }
    if (!plan.length) throw new Error('メニューに種目がありません');
    return {
      v: 1, id, mode, menuId: menu.id, menuName: menu.name,
      createdAt: now, startedAt: null, endedAt: null, updatedAt: now,
      phase: PHASE.READY, pausedPhase: null, index: 0, set: 1,
      timer: null, activeMs: 0,
      plan,
      items: plan.map((p) => ({
        exerciseId: p.exerciseId, plannedSets: p.sets, setsDone: 0,
        activeMs: 0, status: 'pending', replacedFrom: null,
      })),
      endReason: null, symptoms: [], saved: false,
    };
  }

  // ---- 内部の遷移(n は複製済みのセッション) ----
  function enter(n, phase, durationMs, since) {
    n.phase = phase;
    n.pausedPhase = null;
    n.timer = durationMs != null ? newTimer(durationMs, since) : null;
  }

  const didSome = (item) => item.setsDone > 0 || item.activeMs > 0;

  function addActive(n, ms) {
    n.activeMs += ms;
    n.items[n.index].activeMs += ms;
  }

  function finishExercise(n, status, at) {
    n.items[n.index].status = status;
    if (n.index + 1 < n.plan.length) {
      n.index += 1;
      n.set = 1;
      enter(n, PHASE.READY, null);
    } else {
      endSession(n, PHASE.COMPLETED, 'completed', at);
    }
  }

  function completeSet(n, at) {
    const step = n.plan[n.index];
    const item = n.items[n.index];
    item.setsDone += 1;
    if (item.setsDone < step.sets) {
      n.set = item.setsDone + 1;
      if (step.restMs > 0) enter(n, PHASE.REST, step.restMs, at);
      else enter(n, PHASE.ACTIVE, step.workMs, at);
    } else {
      finishExercise(n, 'done', at);
    }
  }

  function endSession(n, phase, reason, at) {
    n.phase = phase;
    n.pausedPhase = null;
    n.timer = null;
    n.endedAt = at;
    n.endReason = reason;
    for (const it of n.items) {
      if (it.status === 'in_progress') it.status = didSome(it) ? 'partial' : 'skipped';
      else if (it.status === 'pending') it.status = 'not_done';
    }
  }

  function onTimerEnd(n, endAt) {
    const step = n.plan[n.index];
    if (n.phase === PHASE.COUNTDOWN) {
      enter(n, PHASE.ACTIVE, step.workMs, endAt);
    } else if (n.phase === PHASE.ACTIVE) {
      addActive(n, n.timer.durationMs);
      completeSet(n, endAt);
    } else if (n.phase === PHASE.REST) {
      enter(n, PHASE.ACTIVE, step.workMs, endAt);
    }
  }

  // 運動中の経過分を記録に足して、タイマーを止めた状態にする
  function settleActive(n, now) {
    if (basePhase(n) === PHASE.ACTIVE && n.timer) addActive(n, Math.min(n.timer.durationMs, elapsedMs(n.timer, now)));
  }

  function pauseInPlace(n, now) {
    n.timer.accMs = elapsedMs(n.timer, now);
    n.timer.since = null;
    n.pausedPhase = n.phase;
    n.phase = PHASE.PAUSED;
  }

  // ---- 公開する操作 ----

  // 時間を進める。時間切れの状態は「本来終わった時刻」を起点に次へ進み、
  // ready か終端に着くまでくり返す(バックグラウンド復帰の補正もこれで行う)。
  function tick(s, now) {
    if (!isTimed(s)) return s;
    let n = null;
    for (let i = 0; i < MAX_CATCHUP_STEPS; i++) {
      const cur = n || s;
      if (!isTimed(cur)) break;
      const el = elapsedMs(cur.timer, now);
      if (el < cur.timer.durationMs) break;
      if (!n) n = clone(s);
      onTimerEnd(n, now - (el - n.timer.durationMs));
    }
    if (n) n.updatedAt = now;
    return n || s;
  }

  function start(s, now) {
    s = tick(s, now);
    if (s.phase !== PHASE.READY) return s;
    const n = clone(s);
    if (!n.startedAt) n.startedAt = now;
    n.items[n.index].status = 'in_progress';
    enter(n, PHASE.COUNTDOWN, COUNTDOWN_MS, now);
    n.updatedAt = now;
    return n;
  }

  function pause(s, now) {
    s = tick(s, now);
    if (!isTimed(s)) return s;
    const n = clone(s);
    pauseInPlace(n, now);
    n.updatedAt = now;
    return n;
  }

  function resume(s, now) {
    if (s.phase !== PHASE.PAUSED) return s;
    const n = clone(s);
    n.phase = n.pausedPhase;
    n.pausedPhase = null;
    n.timer.since = now;
    n.updatedAt = now;
    return n;
  }

  // 「次へ」: カウントダウンを飛ばす / セットを早めに完了 / 休憩を飛ばす。
  // 一時停止中に押した場合、次の状態も一時停止のまま入る。
  function next(s, now) {
    s = tick(s, now);
    const base = basePhase(s);
    if (!TIMED.includes(base) || isTerminal(s)) return s;
    const wasPaused = s.phase === PHASE.PAUSED;
    const n = clone(s);
    const step = n.plan[n.index];
    if (base === PHASE.ACTIVE) {
      settleActive(n, now);
      n.phase = PHASE.ACTIVE; // completeSet が次の状態を決める
      completeSet(n, now);
    } else {
      enter(n, PHASE.ACTIVE, step.workMs, now);
    }
    if (wasPaused && isTimed(n)) pauseInPlace(n, now);
    n.updatedAt = now;
    return n;
  }

  // 種目をスキップして次の種目の準備へ
  function skip(s, now) {
    s = tick(s, now);
    if (isTerminal(s)) return s;
    const n = clone(s);
    settleActive(n, now);
    const item = n.items[n.index];
    finishExercise(n, didSome(item) ? 'partial' : 'skipped', now);
    n.updatedAt = now;
    return n;
  }

  // 代替種目に替える(準備中のみ)
  function replace(s, altId, exercises, now) {
    if (s.phase !== PHASE.READY) return s;
    const alt = exercises[altId];
    if (!alt || alt.impact === 'high') return s;
    const n = clone(s);
    const cur = n.plan[n.index];
    n.plan[n.index] = Object.assign(buildStep(alt), { originalId: cur.originalId });
    const item = n.items[n.index];
    item.replacedFrom = item.replacedFrom || cur.exerciseId;
    item.exerciseId = alt.id;
    item.plannedSets = n.plan[n.index].sets;
    n.set = 1;
    n.updatedAt = now;
    return n;
  }

  function abort(s, now, reason) {
    s = tick(s, now);
    if (isTerminal(s)) return s;
    const n = clone(s);
    settleActive(n, now);
    endSession(n, PHASE.ABORTED, reason || 'user', now);
    n.updatedAt = now;
    return n;
  }

  // 体調異変による中止。ここからは二度と再開できない。
  function symptomStop(s, now, symptoms) {
    s = tick(s, now);
    if (isTerminal(s)) return s;
    const n = clone(s);
    settleActive(n, now);
    endSession(n, PHASE.SYMPTOM_STOP, 'symptom', now);
    n.symptoms = (symptoms || []).slice();
    n.updatedAt = now;
    return n;
  }

  // アプリが落ちた後の復元: 経過時間を補正したうえで、一時停止状態で戻す
  function restore(s, now) {
    return pause(tick(s, now), now);
  }

  // 画面表示用の値
  function view(s, now) {
    const step = s.plan[Math.min(s.index, s.plan.length - 1)];
    const base = basePhase(s);
    const el = elapsedMs(s.timer, now);
    const rem = remainingMs(s, now);
    const v = {
      phase: s.phase, base, step,
      elapsedMs: el, remainingMs: rem,
      durationMs: s.timer ? s.timer.durationMs : 0,
      progress: s.timer && s.timer.durationMs ? Math.min(1, el / s.timer.durationMs) : 0,
      reps: null,
      setLabel: step && step.setLabels ? step.setLabels[s.set - 1] || '' : '',
    };
    if (base === PHASE.ACTIVE && step.measure === 'reps') {
      v.reps = Math.min(step.reps, Math.floor(el / step.msPerRep));
    }
    return v;
  }

  function toRecord(s, exercises, now) {
    const name = (id) => (exercises[id] ? exercises[id].name : id);
    const startedAt = s.startedAt || s.createdAt;
    const endedAt = s.endedAt || now;
    return {
      id: s.id, mode: s.mode, menuId: s.menuId, menuName: s.menuName,
      status: s.phase, endReason: s.endReason, symptoms: s.symptoms.slice(),
      startedAt, endedAt,
      activeSec: Math.round(s.activeMs / 1000),
      totalSec: Math.max(0, Math.round((endedAt - startedAt) / 1000)),
      items: s.items.map((it) => ({
        exerciseId: it.exerciseId, name: name(it.exerciseId), status: it.status,
        setsDone: it.setsDone, plannedSets: it.plannedSets,
        replacedFrom: it.replacedFrom, replacedFromName: it.replacedFrom ? name(it.replacedFrom) : null,
      })),
      rpe: null, savedAt: now,
    };
  }

  // 一度も開始していない中止は記録しない。体調異変は必ず記録する。
  function shouldSave(s) {
    if (!isTerminal(s) || s.saved) return false;
    return s.phase === PHASE.SYMPTOM_STOP || s.startedAt != null;
  }

  function estimateSec(menu, exercises) {
    let ms = 0;
    for (const it of menu.items) {
      const ex = exercises[it.exerciseId];
      if (!ex || ex.impact === 'high') continue;
      const st = buildStep(ex, it.overrides);
      ms += COUNTDOWN_MS + st.sets * st.workMs + (st.sets - 1) * st.restMs;
    }
    return Math.round(ms / 1000);
  }

  return {
    PHASE, COUNTDOWN_MS, isTimed, isTerminal, basePhase,
    create, tick, start, pause, resume, next, skip, replace, abort, symptomStop, restore,
    view, elapsedMs, remainingMs, toRecord, shouldSave, estimateSec,
  };
});
