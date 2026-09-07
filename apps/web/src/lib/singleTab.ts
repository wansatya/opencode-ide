// Single-tab enforcement for the cockpit UI.
//
// `cockpit start` relaunches the servers on the same URL and (unless the
// launcher managed to reuse the tab OS-side) the browser opens the cockpit
// URL in a *new* tab. Without this guard every restart would pile up another
// live tab — each one holding websocket/PTY sessions and auto-starting
// competing opencode processes.
//
// Rule: the oldest live tab wins. A freshly loaded tab announces itself; if
// an older cockpit tab answers, the newcomer does NOT mount the app. It asks
// the existing tab to focus + refresh itself (the servers are already back
// up by the time the launcher opens the browser) and then gets out of the
// way. Same-origin scoping (BroadcastChannel + localStorage) keeps the dev
// server (:5173) and the prod bridge (:3101) independent.

export type TabRole = "primary" | "duplicate";

export type TabClaim =
  | { role: "primary"; id: string; at: number }
  | { role: "duplicate"; id: string; at: number };

const CHANNEL = "opencode-cockpit-tabs";
const HEARTBEAT_KEY = "cockpit:tab-heartbeat";
const HEARTBEAT_MS = 1000;
const STALE_AFTER_MS = 2500;
const HELLO_WAIT_MS = 350;

type HelloMsg = { kind: "cockpit:hello"; id: string; at: number };
type HereMsg = { kind: "cockpit:here"; id: string; at: number };
type FocusMsg = { kind: "cockpit:focus-request"; id: string };
type BusMsg = HelloMsg | HereMsg | FocusMsg;

function newId(): string {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  } catch { /* fall through */ }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function readHeartbeat(): { id: string; at: number } | null {
  try {
    const raw = localStorage.getItem(HEARTBEAT_KEY);
    if (!raw) return null;
    const hb = JSON.parse(raw) as { id?: unknown; at?: unknown };
    if (typeof hb.id === "string" && typeof hb.at === "number") return { id: hb.id, at: hb.at };
    return null;
  } catch {
    return null;
  }
}

function openBus(): BroadcastChannel | null {
  try {
    if (typeof BroadcastChannel === "undefined") return null;
    return new BroadcastChannel(CHANNEL);
  } catch {
    return null;
  }
}

// Runs in the winning tab: keeps the heartbeat fresh, answers latecomers so
// they yield, and refreshes this tab when a newcomer asks us to take focus
// (i.e. right after `cockpit start`).
function startPrimaryPresence(id: string, at: number): void {
  const bus = openBus();
  const beat = () => {
    try {
      localStorage.setItem(HEARTBEAT_KEY, JSON.stringify({ id, at }));
    } catch { /* storage unavailable — dedup silently disabled */ }
  };
  beat();
  const timer = window.setInterval(beat, HEARTBEAT_MS);

  const onMsg = (e: MessageEvent<BusMsg>) => {
    const m = e.data;
    if (!m || typeof m !== "object") return;
    if (m.kind === "cockpit:hello" && m.id !== id) {
      try {
        bus?.postMessage({ kind: "cockpit:here", id, at } satisfies HereMsg);
      } catch { /* ignore */ }
    } else if (m.kind === "cockpit:focus-request" && m.id !== id) {
      void focusAndRefresh();
    }
  };
  bus?.addEventListener("message", onMsg);

  const release = () => {
    try {
      const cur = readHeartbeat();
      if (cur && cur.id === id) localStorage.removeItem(HEARTBEAT_KEY);
    } catch { /* ignore */ }
    window.clearInterval(timer);
    try {
      bus?.removeEventListener("message", onMsg);
      bus?.close();
    } catch { /* ignore */ }
  };
  window.addEventListener("pagehide", release, { once: true });
}

// The servers are back up by the time the launcher opens the browser, so a
// refresh lands on the fresh instance. If the refresh target is unreachable
// (e.g. the user duplicated the tab during an outage) just focus instead of
// navigating into an error page.
async function focusAndRefresh(): Promise<void> {
  try {
    const r = await fetch(location.href, { method: "HEAD", cache: "no-store" });
    if (r.ok) {
      window.focus();
      location.reload();
      return;
    }
  } catch { /* fall through to focus-only */ }
  try {
    window.focus();
  } catch { /* ignore */ }
}

// Ask the already-live tab to take over, then report our role. Never throws:
// on any failure (no BroadcastChannel, no storage) we become primary, which
// is exactly the pre-guard behavior.
export async function claimTab(): Promise<TabClaim> {
  const id = newId();
  const at = Date.now();
  try {
    const hb = readHeartbeat();
    const fresh = hb && hb.id !== id && Date.now() - hb.at < STALE_AFTER_MS;
    const bus = openBus();
    // Fast path: nobody has ever claimed this origin — no need to wait.
    if (!fresh && !bus) {
      startPrimaryPresence(id, at);
      return { role: "primary", id, at };
    }
    if (!bus) {
      // Heartbeat says someone is live but we cannot talk to them; trust it
      // only while it keeps updating, otherwise take over (stale residue
      // from a crashed tab must not park this one forever).
      if (fresh) return { role: "duplicate", id, at };
      startPrimaryPresence(id, at);
      return { role: "primary", id, at };
    }

    const others: HereMsg[] = [];
    const onMsg = (e: MessageEvent<BusMsg>) => {
      const m = e.data;
      if (m && typeof m === "object" && m.kind === "cockpit:here" && m.id !== id) others.push(m);
    };
    bus.addEventListener("message", onMsg);
    try {
      bus.postMessage({ kind: "cockpit:hello", id, at } satisfies HelloMsg);
    } catch { /* ignore */ }
    await new Promise((res) => window.setTimeout(res, HELLO_WAIT_MS));
    bus.removeEventListener("message", onMsg);

    // Yield to any tab that claimed this origin before us. Simultaneous
    // opens tie-break on id so exactly one tab wins.
    const elder = others.some((o) => o.at < at || (o.at === at && o.id < id));
    if ((fresh || elder) && !(hb && hb.id === id)) {
      try {
        bus.postMessage({ kind: "cockpit:focus-request", id } satisfies FocusMsg);
      } catch { /* the live tab will reconnect on its own anyway */ }
      try {
        bus.close();
      } catch { /* ignore */ }
      return { role: "duplicate", id, at };
    }
    try {
      bus.close();
    } catch { /* ignore */ }
    startPrimaryPresence(id, at);
    return { role: "primary", id, at };
  } catch {
    try {
      startPrimaryPresence(id, at);
    } catch { /* last resort: run unguarded */ }
    return { role: "primary", id, at };
  }
}
