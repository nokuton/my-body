/* 音声ガイド(ブラウザの読み上げ機能)と、声のかわりに使えるやわらかいチャイム音。
 * 使えない端末では何もしない。 */
(function (root) {
  'use strict';
  const synth = typeof speechSynthesis !== 'undefined' ? speechSynthesis : null;
  const RATES = { slow: 0.85, normal: 0.95 };

  // 自然に聞こえやすい声から順に選ぶ。低く機械的な声(Ichiro など)は後回し。
  const PREFERRED = [/Nanami/i, /Keita/i, /Google/i, /Kyoko/i, /O-?ren/i, /Otoya/i, /Hattori/i, /Haruka/i, /Sayaka/i, /Ayumi/i];

  let enabled = true;
  let style = 'voice';   // voice | chime
  let rate = RATES.slow;
  let wantName = 'auto';
  let voice = null;
  let audioCtx = null;
  const listeners = [];

  function jaVoices() {
    if (!synth) return [];
    return synth.getVoices().filter((v) => /^ja/i.test(v.lang));
  }
  function autoPick(vs) {
    for (const re of PREFERRED) {
      const v = vs.find((x) => re.test(x.name));
      if (v) return v;
    }
    return vs[0] || null;
  }
  function pickVoice() {
    const vs = jaVoices();
    voice = (wantName !== 'auto' && vs.find((v) => v.name === wantName)) || autoPick(vs);
  }
  if (synth) {
    pickVoice();
    if ('onvoiceschanged' in synth) {
      synth.onvoiceschanged = () => {
        pickVoice();
        listeners.forEach((f) => f());
      };
    }
  }

  // ---- チャイム(Web Audio で小さくやわらかい音を鳴らす) ----
  function ctx() {
    if (!audioCtx) {
      const AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      audioCtx = new AC();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }
  function tone(freq, at, dur, vol) {
    const c = ctx();
    if (!c) return;
    const t = c.currentTime + at;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + dur + 0.05);
  }
  const CHIMES = {
    tick: () => tone(660, 0, 0.35, 0.08),
    start: () => { tone(523, 0, 0.6, 0.12); tone(784, 0.18, 0.9, 0.12); },
    rest: () => { tone(784, 0, 0.6, 0.1); tone(587, 0.2, 0.9, 0.1); },
    next: () => { tone(587, 0, 0.5, 0.1); tone(698, 0.16, 0.5, 0.1); tone(880, 0.32, 1.0, 0.1); },
    done: () => { tone(523, 0, 0.7, 0.1); tone(659, 0.2, 0.7, 0.1); tone(784, 0.4, 0.7, 0.1); tone(1047, 0.6, 1.4, 0.1); },
  };

  const Voice = {
    supported: !!synth,
    get enabled() { return enabled; },
    get style() { return style; },
    get currentName() { return voice ? voice.name : ''; },
    voices: () => jaVoices().map((v) => v.name),
    onVoicesChanged(f) { listeners.push(f); },
    configure(o) {
      enabled = !!o.enabled;
      style = o.style === 'chime' ? 'chime' : 'voice';
      rate = RATES[o.rate] || RATES.slow;
      wantName = o.name || 'auto';
      pickVoice();
      if (!enabled && synth) synth.cancel();
    },
    // iPhone などはボタン操作の中で一度鳴らさないと、その後の音が出ない
    unlock() {
      if (!enabled) return;
      ctx();
      if (!synth) return;
      try {
        const u = new SpeechSynthesisUtterance(' ');
        u.volume = 0;
        synth.speak(u);
      } catch (e) { /* 何もしない */ }
    },
    // 話し中の声は途中で切らずに続けて読む。interrupt: true のときだけ切り替える
    say(text, interrupt) {
      if (!synth || !enabled || !text) return;
      try {
        if (interrupt) synth.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'ja-JP';
        if (voice) u.voice = voice;
        u.rate = rate;
        u.pitch = 1;
        u.volume = 0.9;
        synth.speak(u);
      } catch (e) { /* 何もしない */ }
    },
    chime(kind) {
      if (!enabled || !CHIMES[kind]) return;
      try { CHIMES[kind](); } catch (e) { /* 何もしない */ }
    },
    // 設定の音で知らせる(声なら text、チャイムなら kind)
    cue(text, kind, interrupt) {
      if (style === 'chime') Voice.chime(kind);
      else Voice.say(text, interrupt);
    },
    stop() {
      if (synth) synth.cancel();
    },
  };

  root.MBP = Object.assign(root.MBP || {}, { Voice });
})(typeof self !== 'undefined' ? self : this);
