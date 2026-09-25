// Browser save (storage injected) + save codes. Pure except for btoa/atob (present in Node 24 and browsers).
// Encoding: TextEncoder/TextDecoder + btoa/atob (avoids the deprecated escape/unescape trick).
const KEY = 'tarekmon.save', VERSION = 1;

export function createSave(storage) {
  return {
    save(state) {
      try { storage.setItem(KEY, JSON.stringify({ version: VERSION, state })); } catch (e) { console.warn('save failed', e); }
    },
    load() {
      try { const d = JSON.parse(storage.getItem(KEY)); return d?.version === VERSION ? d.state : null; } catch { return null; }
    },
    clear() {
      try { storage.removeItem(KEY); } catch {}
    },
    autosave(state) { this.save(state); },
  };
}

export function toSaveCode(state) {
  const json = JSON.stringify({ version: VERSION, state });
  const bytes = new TextEncoder().encode(json);
  return btoa(String.fromCharCode(...bytes));
}

export function fromSaveCode(code) {
  try {
    const binary = atob(String(code).trim());
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    const d = JSON.parse(new TextDecoder().decode(bytes));
    return d?.version === VERSION ? d.state : null;
  } catch { return null; }
}
