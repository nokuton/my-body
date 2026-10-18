/* 端末内(localStorage)への保存。プライベートモードなどで使えない場合も落ちないようにする。 */
(function (root) {
  'use strict';
  const P = 'mbp.v1.';
  const K = { settings: P + 'settings', history: P + 'history', snapshot: P + 'snapshot', lock: P + 'lock' };
  const LOCK_STALE_MS = 8000;
  const HISTORY_MAX = 500;

  function get(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }
  function set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }
  function remove(key) {
    try { localStorage.removeItem(key); } catch (e) { /* 使えない環境では何もしない */ }
  }

  const DEFAULT_SETTINGS = {
    voice: true, voiceStyle: 'voice', voiceRate: 'slow', voiceName: 'auto',
    vibrate: true, theme: 'system', fontSize: 'normal',
  };

  const Store = {
    KEYS: K,

    loadSettings() {
      return Object.assign({}, DEFAULT_SETTINGS, get(K.settings, {}));
    },
    saveSettings(s) {
      return set(K.settings, s);
    },

    loadHistory() {
      const h = get(K.history, []);
      return Array.isArray(h) ? h : [];
    },
    // 同じIDの記録があれば保存しない(二重保存の防止)
    saveRecord(record) {
      const h = Store.loadHistory();
      if (h.some((r) => r.id === record.id)) return 'duplicate';
      h.unshift(record);
      return set(K.history, h.slice(0, HISTORY_MAX)) ? 'saved' : 'error';
    },
    updateRecord(id, patch) {
      const h = Store.loadHistory();
      const i = h.findIndex((r) => r.id === id);
      if (i < 0) return false;
      h[i] = Object.assign({}, h[i], patch);
      return set(K.history, h);
    },

    saveSnapshot(session) {
      return set(K.snapshot, { savedAt: Date.now(), session });
    },
    loadSnapshot() {
      return get(K.snapshot, null);
    },
    clearSnapshot() {
      remove(K.snapshot);
    },

    // ---- 二重起動ロック(タブをまたいで1つのセッションだけ動かす) ----
    readLock() {
      return get(K.lock, null);
    },
    // ほかのタブが動いているセッションを持っているか
    otherActive(tabId, now) {
      const l = Store.readLock();
      return !!l && l.tabId !== tabId && now - l.at < LOCK_STALE_MS;
    },
    writeLock(tabId, sessionId, now) {
      return set(K.lock, { tabId, sessionId, at: now });
    },
    releaseLock(tabId) {
      const l = Store.readLock();
      if (l && l.tabId === tabId) remove(K.lock);
    },
  };

  root.MBP = Object.assign(root.MBP || {}, { Store });
})(typeof self !== 'undefined' ? self : this);
