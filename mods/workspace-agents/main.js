// Agents in grouped or priority views; parents take their most urgent sub-agent's place.

import { View, div, image, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { agents, terminals, panes, focused, spaces, run, theme, shared, setShared, setAgentOrder, openOverlay, closeOverlay, props, window, layout, hc, notify, home, readTextFile } from "herdr";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// The sidebar's rail goes by its width, not a flag: dragging its edge narrows it too.
const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;

// To the rail (on macOS wide enough for the traffic lights), or back to the width it had.
function toggleSidebar() {
  const width = find(layout(), "sidebar")?.size?.px;
  if (!narrow()) setShared("sidebar.width", width);
  // Mods edited before the rail went by width still read the flag.
  setShared("sidebar.collapsed", !narrow());
  run("layout.resize", { id: "sidebar", px: narrow() ? (shared("sidebar.width") ?? 268) : window()?.platform === "macos" ? 76 : 44 });
}

// Drops what an agent puts before its title: a status glyph or spinner and the separator
// after it ("✦  Working", "⠋ - Thinking"), and Codex's blinking "[ ! ] " / "[ . ] " mark.
// Stops at an opening bracket or quote, so a title that starts with one ("[web] login") keeps it.
const clean = (s) => (s ?? "").replace(/^[^\p{L}\p{N}\p{Ps}\p{Pi}]+/u, "").replace(/^\[ [!.] \] /, "").trim();

function leadPanes(all) {
  const leads = new Map();
  for (const p of all) {
    if (!p.terminal) continue;
    const current = leads.get(p.tab);
    // First agent, else first focused terminal, else first terminal in the tab.
    if (!current || (!current.program?.agent && (p.program?.agent || (!current.focused && p.focused)))) leads.set(p.tab, p);
  }
  return leads;
}

function title(tab, l) {
  const prog = l?.program?.name;
  const live = clean(l?.title);
  // clean() would strip a path's leading ~ or /: test the title with only its status glyph gone.
  const path = /^[~/]|^[A-Za-z]:\\/.test((l?.title ?? "").replace(/^[^\p{L}\p{N}~/]+/u, ""));
  const telling = live && live !== (l?.terminal ?? l?.address) && live !== prog && !path && !live.includes("@") && live.toLowerCase() !== l?.program?.key;
  return (tab.name === prog || !tab.named) && telling ? live : tab.name;
}
const RANK = { blocked: 4, done: 3, working: 2, idle: 1 };
// A sub-agent without a pane isn't in agents(): its raw word, error counting as
// blocked. It's never done: it reports to its parent, and the parent's done is the news.
const kidStatus = (k, listed) => {
  const s = listed.get(k.address) ?? k.status;
  return s === "error" ? "blocked" : s === "done" ? "idle" : s;
};
const SORTS = [
  { id: "priority", label: "Priority", icon: "clock" },
  { id: "grouped", label: "Grouped by space", icon: "layers" },
];
const sortOf = () => SORTS.find((s) => s.id === shared("agents.sort")) ?? SORTS[0];
const SECTION = { 4: "Needs you", 3: "Done", 2: "Working", 1: "Idle" };
const SECTION_STATUS = { 4: "blocked", 3: "done", 2: "working" };

function duration(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 1) return "<1m";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

// The agent's icon from the app's program table: a one-color glyph or a picture.
function icon(p, size, color) {
  if (!p?.icon) return null;
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}

function isAgent(agent, term) {
  if (!agent) return false;
  if (agent.program?.agent) return true;
  if (agent.program?.shell) return false;
  const app = (agent.app || agent.program?.key || agent.program?.name || "").toLowerCase();
  if (app === "shell" || app === "powershell" || app === "pwsh" || app === "cmd" || app === "bash" || app === "zsh") {
    return false;
  }
  if (term?.status?.app) return true;
  return false;
}

function findLastMatchingJsonl(text, keyName, matchVal, targetField) {
  if (!text) return null;
  const chunk = text.length > 80000 ? text.slice(-80000) : text;
  const lines = chunk.split("\n");
  const normMatch = matchVal ? matchVal.toLowerCase().replace(/\\/g, "/").replace(/\/+$/, "") : "";
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    try {
      const obj = JSON.parse(line);
      const val = obj[keyName];
      if (val) {
        const normVal = String(val).toLowerCase().replace(/\\/g, "/").replace(/\/+$/, "");
        if (normVal === normMatch || normVal.endsWith(normMatch) || normMatch.endsWith(normVal)) {
          return obj[targetField] || null;
        }
      }
    } catch {}
  }
  return null;
}

async function resolveRealSessionId(progKey, cwd, title) {
  const key = (progKey || "").toLowerCase();
  const h = home();
  try {
    if (key === "antigravity" || key === "agy") {
      const text = await readTextFile(`${h}/.gemini/antigravity-cli/history.jsonl`).catch(() => null);
      const id = findLastMatchingJsonl(text, "workspace", cwd, "conversationId");
      if (id) return id;
    }
    if (key === "claude" || key === "claude-code") {
      const text = await readTextFile(`${h}/.claude/history.jsonl`).catch(() => null);
      const id = findLastMatchingJsonl(text, "project", cwd, "sessionId");
      if (id) return id;
    }
    if (key === "codex") {
      const text = await readTextFile(`${h}/.codex/session_index.jsonl`).catch(() => null);
      if (text) {
        const chunk = text.length > 50000 ? text.slice(-50000) : text;
        const lines = chunk.trim().split("\n");
        const normTitle = title ? title.toLowerCase() : "";
        let newestId = null;
        for (let i = lines.length - 1; i >= 0; i--) {
          try {
            const obj = JSON.parse(lines[i]);
            if (obj.id) {
              if (!newestId) newestId = obj.id;
              if (normTitle && obj.thread_name && normTitle.includes(obj.thread_name.toLowerCase())) {
                return obj.id;
              }
            }
          } catch {}
        }
        if (newestId) return newestId;
      }
    }
  } catch {}
  return null;
}

function buildAgentLaunch(program, session, mode = "resume") {
  const key = (program?.key || "").toLowerCase();
  let baseCmd = key || "claude";
  if (key === "antigravity") baseCmd = "agy";
  else if (key === "claude-code") baseCmd = "claude";

  if (mode === "new") {
    if (baseCmd === "codex") return { cmd: "codex --no-daemon", argv: ["codex", "--no-daemon"] };
    return { cmd: baseCmd, argv: [baseCmd] };
  }

  const sid = session?.sessionId;
  const isRealId = sid && (sid.includes("-") || sid.length >= 16);

  if (baseCmd === "claude") {
    if (isRealId) return { cmd: `claude --resume ${sid}`, argv: ["claude", "--resume", sid] };
    return { cmd: "claude --continue", argv: ["claude", "--continue"] };
  }
  if (baseCmd === "agy") {
    if (isRealId) return { cmd: `agy --conversation ${sid}`, argv: ["agy", "--conversation", sid] };
    return { cmd: "agy --continue", argv: ["agy", "--continue"] };
  }
  if (baseCmd === "codex") {
    if (isRealId) return { cmd: `codex --no-daemon resume ${sid}`, argv: ["codex", "--no-daemon", "resume", sid] };
    return { cmd: "codex --no-daemon resume --last", argv: ["codex", "--no-daemon", "resume", "--last"] };
  }
  if (baseCmd === "opencode") {
    if (isRealId) return { cmd: `opencode --session ${sid}`, argv: ["opencode", "--session", sid] };
    return { cmd: "opencode --continue", argv: ["opencode", "--continue"] };
  }
  if (baseCmd === "pi") {
    if (isRealId) return { cmd: `pi --session ${sid}`, argv: ["pi", "--session", sid] };
    return { cmd: "pi", argv: ["pi"] };
  }
  return { cmd: `${baseCmd} --continue`, argv: [baseCmd, "--continue"] };
}

function resolveAgentCli(program, term) {
  if (term?.argv?.length) {
    const first = term.argv[0].toLowerCase().replace(/\.exe$/, "").split(/[\\/]/).pop();
    if (!["pwsh", "powershell", "cmd", "bash", "zsh", "sh"].includes(first)) {
      return { cmd: first, argv: term.argv };
    }
  }
  const key = (program?.key || "").toLowerCase();
  let cmd = key || "claude";
  if (key === "antigravity") cmd = "agy";
  else if (key === "claude-code") cmd = "claude";
  return { cmd, argv: [cmd] };
}

function extractSessionId(agent, terminal) {
  if (terminal?.report?.session_id) return String(terminal.report.session_id);
  if (terminal?.report?.id) return String(terminal.report.id);
  const uuidMatch = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.exec(agent.title ?? "");
  if (uuidMatch) return uuidMatch[0];
  if (terminal?.labels?.session) return String(terminal.labels.session);
  if (terminal?.labels?.sessionId) return String(terminal.labels.sessionId);
  if (terminal?.labels?.["herdr.tab"]) return String(terminal.labels["herdr.tab"]).slice(2, 8);
  if (terminal?.address) return String(terminal.address);
  return agent.tab ? String(agent.tab).slice(0, 6) : "ag";
}

export default class Agents extends View {
  init(_props, cx) {
    if (props()?.sortMenu || props()?.sessionMenu) return;
    this.folded = new Set();
    // Each agent's last state and when it changed (ms), kept across restarts.
    try { this.changed = JSON.parse(localStorage.getItem("changed") ?? "{}"); } catch { this.changed = {}; }
    if (!this.changed || typeof this.changed !== "object" || Array.isArray(this.changed)) this.changed = {};
    try { this.pendingPins = JSON.parse(localStorage.getItem("pins") ?? "[]"); } catch { this.pendingPins = []; }
    if (!Array.isArray(this.pendingPins)) this.pendingPins = [];
    if (!this.pendingPins.length) localStorage.removeItem("pins");
    this.migratingPins = new Set();
    this.realSessionIds = new Map();
    this.seenLiveKeys = new Set();
    this.hoveredDormant = null;
    this.lastActionSeq = shared("workspace-agents.session_action")?.seq ?? null;
    this.cachedSessions = this.loadSessions();
    setShared("workspace.dormant_sessions", this.cachedSessions);
    this.resolveAllSessions(cx);
    cx.timer.every(10000, (cx) => this.resolveAllSessions(cx));
    cx.timer.every(30000, (cx) => cx.notify());
  }

  deduplicateSessions(sessions) {
    if (!sessions || typeof sessions !== "object") return {};
    const entries = Object.values(sessions).sort((a, b) => (b.lastSeen ?? 0) - (a.lastSeen ?? 0));
    const clean = {};
    const seen = new Set();
    for (const s of entries) {
      if (!s?.key) continue;
      const idKey = s.sessionId && (s.sessionId.includes("-") || s.sessionId.length >= 16)
        ? `sid::${s.sessionId}`
        : `${s.space}::${(s.cwd || "").toLowerCase()}::${s.program?.key || ""}`;
      if (seen.has(idKey)) continue;
      seen.add(idKey);
      clean[s.key] = s;
    }
    return clean;
  }

  loadSessions() {
    try {
      const raw = JSON.parse(localStorage.getItem("agent_sessions_v2") ?? "{}");
      return this.deduplicateSessions(raw);
    } catch {
      return {};
    }
  }

  saveSessions(sessions) {
    try {
      localStorage.setItem("agent_sessions_v2", JSON.stringify(sessions));
      setShared("workspace.dormant_sessions", sessions);
    } catch {}
  }

  deleteSession(key, cx) {
    const sessions = this.loadSessions();
    delete sessions[key];
    this.saveSessions(sessions);
    if (this.cachedSessions) delete this.cachedSessions[key];
    if (cx) cx.notify();
  }

  resolveAllSessions(cx) {
    cx.spawn(async (cx) => {
      const sessions = this.loadSessions();
      let dirty = false;
      for (const s of Object.values(sessions)) {
        if (!s.sessionId || (!s.sessionId.includes("-") && s.sessionId.length < 16)) {
          const realId = await resolveRealSessionId(s.program?.key, s.cwd, s.displayName || s.title);
          if (realId) {
            s.sessionId = realId;
            s.shortTag = realId.slice(0, 7);
            if (s.cwd) this.realSessionIds.set(s.cwd, realId);
            dirty = true;
          }
        } else if (s.cwd && s.sessionId) {
          this.realSessionIds.set(s.cwd, s.sessionId);
        }
      }
      if (dirty) {
        this.cachedSessions = sessions;
        this.saveSessions(sessions);
        cx.notify();
      }
    });
  }

  syncSessions(liveAgents, allTerminals, tabsMap, leadsMap, now) {
    const sessions = this.loadSessions();
    const terminalMap = new Map((allTerminals ?? []).map((t) => [t.address, t]));
    const currentLiveKeys = new Set();
    let dirty = false;

    for (const a of liveAgents ?? []) {
      const term = terminalMap.get(a.address);
      if (!isAgent(a, term)) continue;

      let sessionId = extractSessionId(a, term);
      if ((!sessionId.includes("-") && sessionId.length < 16) && term?.cwd) {
        const cached = this.realSessionIds?.get(term.cwd);
        if (cached) sessionId = cached;
      }
      const hasRealUuid = sessionId && (sessionId.includes("-") || sessionId.length >= 16);
      const shortTag = hasRealUuid ? sessionId.slice(0, 7) : "";
      const key = `${a.space}::${a.tab}`;
      currentLiveKeys.add(key);
      this.seenLiveKeys?.add(key);

      const tabInfo = tabsMap.get(a.tab);
      const displayName = tabInfo ? title(tabInfo, leadsMap.get(a.tab) ?? a) : (clean(a.title) || a.program?.name || "Agent");
      const cli = resolveAgentCli(a.program, term);
      const next = {
        key,
        sessionId,
        shortTag,
        program: a.program,
        displayName,
        tabName: tabInfo?.name ?? a.tab_name ?? null,
        title: clean(a.title || a.program?.name),
        space: a.space,
        space_name: a.space_name,
        tab: a.tab,
        address: a.address,
        cwd: term?.cwd ?? null,
        launchCmd: cli.cmd,
        launchArgv: cli.argv,
        lastSeen: now,
      };
      const prev = sessions[key];
      if (
        !prev ||
        prev.sessionId !== next.sessionId ||
        prev.displayName !== next.displayName ||
        prev.tabName !== next.tabName ||
        prev.cwd !== next.cwd ||
        prev.address !== next.address ||
        prev.program?.key !== next.program?.key ||
        now - (prev.lastSeen ?? 0) > 60000
      ) {
        sessions[key] = next;
        dirty = true;
      }

      // Merge/remove obsolete dormant session if this live agent is continuing it
      for (const [k, prevS] of Object.entries(sessions)) {
        if (k === key) continue;
        const sameSessionId = next.sessionId && prevS.sessionId && next.sessionId === prevS.sessionId;
        const sameWorkspace = next.space === prevS.space && next.cwd && prevS.cwd && next.cwd.toLowerCase() === prevS.cwd.toLowerCase() && next.program?.key === prevS.program?.key;
        if (sameSessionId || sameWorkspace) {
          delete sessions[k];
          dirty = true;
        }
      }
    }

    // Keep sessions as history! Prune only if exceeding 60 entries or older than 30 days
    const entries = Object.entries(sessions);
    if (entries.length > 60) {
      entries.sort((a, b) => (b[1].lastSeen ?? 0) - (a[1].lastSeen ?? 0));
      for (let i = 60; i < entries.length; i++) {
        delete sessions[entries[i][0]];
        dirty = true;
      }
    }
    for (const [k, s] of Object.entries(sessions)) {
      if (now - (s.lastSeen ?? 0) > 30 * 86400000) {
        delete sessions[k];
        dirty = true;
      }
    }

    if (dirty) this.saveSessions(sessions);
    return sessions;
  }

  wakeDormantSession(s, mode = "resume", cx) {
    cx.spawn(async (cx) => {
      if (s.space) run("space.select", { id: s.space });

      if (mode === "resume" && (!s.sessionId || (!s.sessionId.includes("-") && s.sessionId.length < 16))) {
        const realId = await resolveRealSessionId(s.program?.key, s.cwd, s.displayName || s.title);
        if (realId) {
          s.sessionId = realId;
          s.shortTag = realId.slice(0, 7);
          const sessions = this.loadSessions();
          if (sessions[s.key]) {
            sessions[s.key].sessionId = realId;
            sessions[s.key].shortTag = s.shortTag;
            this.cachedSessions = sessions;
            this.saveSessions(sessions);
          }
        }
      }

      const launch = buildAgentLaunch(s.program, s, mode);
      const allPanes = panes() ?? [];
      const pane = allPanes.find((p) => p.tab === s.tab && p.terminal);

      if (pane?.terminal) {
        if (s.tab) run("tab.select", { id: s.tab });
        run("pane.focus", { pane: pane.pane });
        const term = (terminals() ?? []).find((t) => t.address === pane.terminal);
        if (term && (!term.status || term.status.state !== "working")) {
          notify({ title: `接續 ${s.program?.name || "Session"}`, body: "正在載入歷史對話..." });
          await hc(["send", term.address, launch.cmd]).catch(() => {});
        }
      } else {
        notify({ title: `接續 ${s.program?.name || "Session"}`, body: "開啟新分頁並接續對話..." });
        this.deleteSession(s.key, cx);
        run("tab.new", {
          space: s.space,
          name: s.displayName || s.tabName || s.program?.name || "Session",
          folder: s.cwd || undefined,
          argv: launch.argv,
        });
      }
      cx.notify();
    });
  }

  sessionMenu(t) {
    const s = props()?.session;
    const items = [
      { id: "ses-resume", label: "接續對話 (Resume)", icon: "play", mode: "resume" },
      { id: "ses-new", label: "開立新對話 (New)", icon: "plus", mode: "new" },
      { id: "ses-dismiss", label: "移除紀錄 (Dismiss)", icon: "x", mode: "dismiss", danger: true },
    ];
    return v_flex()
      .w_full()
      .p(5)
      .bg(t.popover)
      .text_size(12.5)
      .child(div().px(8).pt(4).pb(6).text_size(11).text_color(t.dim).truncate().child(s?.displayName || s?.program?.name || "Session"))
      .children(items.map((item) => h_flex()
        .id(item.id)
        .h(30)
        .px(8)
        .gap(9)
        .rounded(7)
        .items_center()
        .cursor_pointer()
        .text_color(item.danger ? t.ansi1 : t.foreground)
        .hover((el) => el.bg(t.hover))
        .on_click(() => {
          setShared("workspace-agents.session_action", { seq: Date.now(), mode: item.mode, session: s });
          closeOverlay(props().overlay);
        })
        .child(svg(`mods/workspace-chrome/${item.icon}.svg`).size(13).flex_none().text_color(item.danger ? t.ansi1 : t.muted))
        .child(div().flex_1().child(item.label))));
  }

  dormantRow(s, t, now, collapsed, index, cx) {
    const pic = icon(s.program, 16, t.dim) || svg("mods/workspace-chrome/terminal.svg").size(15).flex_none().text_color(t.dim);
    const labelText = s.displayName || s.tabName || s.title || s.program?.name || "Session";
    const hovered = this.hoveredDormant === s.key;
    if (collapsed) {
      return h_flex()
        .id(`dormant-${s.key}`)
        .h(26)
        .px(8)
        .flex_none()
        .items_center()
        .gap(4)
        .cursor_pointer()
        .hover((el) => el.bg(t.hover))
        .tooltip(`${labelText} (點擊接續對話)`)
        .on_click((_e, cx) => this.wakeDormantSession(s, "resume", cx))
        .child(div().flex_1().min_w(0).whitespace_nowrap().text_right().text_color(t.dim).child(String(index + 1)))
        .child(h_flex().w(14).flex_none().items_center().justify_center()
          .child(div().size(7).rounded(4).border(1.5).border_color(t.dim)));
    }
    return h_flex()
      .id(`dormant-${s.key}`)
      .px(8)
      .h(30)
      .flex_none()
      .rounded(8)
      .items_center()
      .gap(9)
      .cursor_pointer()
      .hover((el) => el.bg(t.hover))
      .on_hover((on, cx) => {
        if (on) this.hoveredDormant = s.key;
        else if (this.hoveredDormant === s.key) this.hoveredDormant = null;
        cx.notify();
      })
      .on_click((_e, cx) => this.wakeDormantSession(s, "resume", cx))
      .on_mouse_down("right", (_e, cx) => {
        cx.stop_propagation();
        openOverlay({
          mod: "workspace-agents",
          kind: "popup",
          width: 210,
          height: 126,
          props: { sessionMenu: true, session: s },
        });
      })
      .child(pic)
      .child(div().flex_1().min_w(0).truncate().text_color(t.dim).child(labelText))
      .when(hovered, (el) => el.child(
        div()
          .id(`del-${s.key}`)
          .flex_none()
          .p(2)
          .rounded(4)
          .text_color(t.dim)
          .cursor_pointer()
          .hover((el) => el.bg(t.raised).text_color(t.foreground))
          .tooltip("移除紀錄")
          .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
          .on_click((_e, cx) => {
            cx.stop_propagation();
            this.deleteSession(s.key, cx);
          })
          .child(svg("mods/workspace-chrome/x.svg").size(13))
      ))
      .when(!hovered && Boolean(s.lastSeen), (el) => el.child(
        div().flex_none().text_size(11).text_color(t.dim).child(duration(now - s.lastSeen)),
      ))
      .child(div().size(7).mx(3).flex_none().rounded(4).border(1.5).border_color(t.dim));
  }

  // Stamps agents whose state changed. Done and idle count as one: looking at a
  // finished agent turns done into idle, and looking isn't the agent doing anything.
  track(list, now) {
    let dirty = false;
    for (const a of list) {
      const s = a.status === "done" ? "idle" : a.status;
      if (this.changed[a.address]?.s === s) continue;
      this.changed[a.address] = { s, at: now };
      dirty = true;
    }
    if (!dirty) return;
    // Gone and old: the list alone is empty right after a start.
    const listed = new Set(list.map((a) => a.address));
    for (const [k, c] of Object.entries(this.changed)) if (!listed.has(k) && now - c.at > 30 * 86400000) delete this.changed[k];
    localStorage.setItem("changed", JSON.stringify(this.changed));
  }

  // Keep offline pins until their terminal returns, and keep each pending until
  // core echoes the label so a failed write doesn't erase the old pin.
  migratePins(all) {
    const listed = new Map(all.filter((t) => t.state === "live").map((t) => [t.address, t]));
    const pending = this.pendingPins.filter((address) => {
      const terminal = listed.get(address);
      if (!terminal) return true;
      if (terminal.labels?.["herdr.pinned"]) return false;
      if (!this.migratingPins.has(address)) {
        this.migratingPins.add(address);
        run("terminal.pin", { terminal: address, pinned: true });
      }
      return true;
    });
    if (pending.length === this.pendingPins.length) return;
    this.pendingPins = pending;
    if (pending.length) localStorage.setItem("pins", JSON.stringify(pending));
    else localStorage.removeItem("pins");
  }

  since(a) {
    return this.changed[a.address]?.at ?? 0;
  }

  rank(a) {
    return RANK[a.status] ?? 0;
  }

  sortMenu(t) {
    const on = sortOf().id;
    return v_flex()
      .w_full()
      .p(5)
      .bg(t.popover)
      .text_size(12.8)
      .child(div().px(8).pt(4).pb(6).text_size(11).text_color(t.dim).child("Sort agents"))
      .children(SORTS.map((s) => h_flex()
        .id(`sort-${s.id}`)
        .h(31)
        .px(8)
        .gap(9)
        .rounded(7)
        .items_center()
        .text_color(t.foreground)
        .hover((el) => el.bg(t.hover))
        .on_click(() => {
          setShared("agents.sort", s.id);
          closeOverlay(props().overlay);
        })
        .child(svg(`mods/workspace-chrome/${s.icon}.svg`).size(14).flex_none().text_color(t.muted))
        .child(div().flex_1().child(s.label))
        .when(s.id === on, (el) => el.child(svg("mods/workspace-chrome/check.svg").size(14).flex_none().text_color(t.foreground)))));
  }

  peek(addr) {
    run("terminal.peek", { terminal: addr });
  }

  // Live sub-agents of `addr`, depth first, each with the tree lines in front of it.
  tree(all, addr, lead = []) {
    const kids = all.filter((k) => k.parent === addr && k.state === "live");
    return kids.flatMap((k, i) => {
      const last = i === kids.length - 1;
      return [
        { t: k, lines: [...lead, last ? "└" : "├"] },
        ...this.tree(all, k.address, [...lead, last ? "" : "│"]),
      ];
    });
  }

  subRow(t, s, shown, compact) {
    const k = s.t;
    const st = kidStatus(k, this.listed);
    const pic = icon(k.program, 14, t.foreground);
    const on = k.address === shown;
    return h_flex()
      .id(`sub-${k.address}`)
      .pl(39)
      .pr(8)
      .rounded(8)
      .h(26)
      .flex_none()
      .gap(0)
      .items_center()
      .text_size(12.5)
      .when(on, (el) => el.bg(t.raised))
      .hover((s) => s.bg(t.hover))
      .on_click(() => (this.listed.has(k.address) ? run("pane.focus", { terminal: k.address }) : this.peek(k.address)))
      .children(s.lines.map(l => div().self_start().mt(-4).w(9).h(17).mr(4).flex_none()
        .when(Boolean(l), el => el.border_l(1.5).border_color(t.input))
        .when(l === "└" || l === "├", el => el.border_b(1.5).rounded_bl(6))))
      .when(Boolean(pic), el => el.child(div().mr(8).child(pic)))
      .child(div().flex_1().truncate().text_color(on ? t.foreground : t.muted).child(k.name || k.template || k.program?.name || k.address))
      .child(this.status(t, { status: st }, compact));
  }

  // compact: a ! for blocked where a header already says "Needs you".
  status(t, a, compact = false) {
    const color = t[a.status] ?? t.dim;
    if (a.status === "working") return svg("mods/workspace-chrome/spinner.svg").size(12).mx(1).flex_none().text_color(t.working).spin(900);
    if (a.status === "blocked" && compact) return div().size(14).flex_none().rounded(4).bg(t.blocked + "26").text_size(10.5).font_bold().text_color(t.blocked).flex().items_center().justify_center().child("!");
    if (a.status === "blocked") return div().flex_none().px(6).h(18).rounded(5).bg(t.blocked + "26").text_size(10.5).font_semibold().text_color(t.blocked).flex().items_center().child("Needs you");
    // Idle: a ring; done: a dot.
    if (a.status === "idle") return div().size(7).mx(3).flex_none().rounded(4).border(1.5).border_color(t.idle ?? t.dim);
    return div().size(7).mx(3).flex_none().rounded(4).bg(a.status === "done" ? color : t.dim + "00");
  }

  render(cx) {
    const t = theme();
    if (props()?.sortMenu) return this.sortMenu(t);
    if (props()?.sessionMenu) return this.sessionMenu(t);
    const pendingAction = shared("workspace-agents.session_action");
    if (pendingAction?.seq && pendingAction.seq !== this.lastActionSeq) {
      this.lastActionSeq = pendingAction.seq;
      if (pendingAction.session) {
        if (pendingAction.mode === "dismiss") this.deleteSession(pendingAction.session.key);
        else this.wakeDormantSession(pendingAction.session, pendingAction.mode || "resume", cx);
      }
    }
    const collapsed = narrow();
    const sort = sortOf();
    let list = agents();
    this.listed = new Map(list.map((a) => [a.address, a.status]));
    const all = terminals();
    this.migratePins(all);
    const shown = focused()?.agent;
    const now = Date.now();
    this.track(list, now);
    const leads = leadPanes(panes());
    const allSpaces = spaces() ?? [];
    const tabs = new Map(allSpaces.flatMap((s) => s.tabs).map((tab) => [tab.id, tab]));
    this.cachedSessions = this.syncSessions(list, all, tabs, leads, now);
    const activeSpace = allSpaces.find((s) => s.active)?.id ?? focused()?.space ?? null;
    if (activeSpace) list = list.filter((a) => a.space === activeSpace);
    // A kept sub-agent (one with a pane) is in agents() too: where a tree shows
    // it, it gets no row of its own, unless it's pinned.
    const nested = new Set(collapsed ? [] : list.flatMap((a) => this.tree(all, a.address).map((s) => s.t.address)));
    list = list.filter((a) => a.pinned || !nested.has(a.address));
    const tabCounts = new Map();
    for (const a of list) tabCounts.set(a.tab, (tabCounts.get(a.tab) ?? 0) + 1);
    const byPriority = sort.id === "priority";
    const urgency = new Map(list.map((a) => [a.address, Math.max(this.rank(a), ...this.tree(all, a.address).map((s) => RANK[kidStatus(s.t, this.listed)] ?? 0))]));
    const rankOf = (a) => urgency.get(a.address);
    if (byPriority) list = [...list].sort((x, y) => rankOf(y) - rankOf(x) || this.since(y) - this.since(x) || y.seq - x.seq);
    const pinned = list.filter((a) => a.pinned);
    const rest = list.filter((a) => !a.pinned);
    list = [...pinned, ...rest];
    setAgentOrder(list.map((a) => a.address));

    const liveTabKeys = new Set(list.map((a) => `${a.space}::${a.tab}`));
    const liveSessionIds = new Set();
    const liveWorkspaces = new Set();
    for (const a of list) {
      const term = all.find((t) => t.address === a.address);
      const sid = extractSessionId(a, term);
      if (sid && (sid.includes("-") || sid.length >= 16)) liveSessionIds.add(sid);
      if (term?.cwd) liveWorkspaces.add(`${a.space}::${(term.cwd).toLowerCase()}::${a.program?.key || ""}`);
    }

    const dormantMap = new Map();
    const sortedDormant = Object.values(this.cachedSessions ?? {})
      .filter((s) => {
        if (activeSpace && s.space !== activeSpace) return false;
        if (liveTabKeys.has(s.key)) return false;
        if (s.sessionId && liveSessionIds.has(s.sessionId)) return false;
        if (s.cwd && liveWorkspaces.has(`${s.space}::${(s.cwd).toLowerCase()}::${s.program?.key || ""}`)) return false;
        return true;
      })
      .sort((x, y) => (y.lastSeen ?? 0) - (x.lastSeen ?? 0));

    for (const s of sortedDormant) {
      const dedupKey = s.sessionId && (s.sessionId.includes("-") || s.sessionId.length >= 16)
        ? `sid::${s.sessionId}`
        : `${s.space}::${(s.cwd || "").toLowerCase()}::${s.program?.key || ""}`;
      if (!dormantMap.has(dedupKey)) {
        dormantMap.set(dedupKey, s);
      }
    }
    const dormant = Array.from(dormantMap.values());

    const withKids = (a, i) => {
      const subs = collapsed ? [] : this.tree(all, a.address);
      const r = row(a, i, subs);
      if (this.folded.has(a.address)) return [r];
      return [r, ...subs.map((s) => this.subRow(t, s, shown, byPriority))];
    };

    // The fold chevron; folded, the count too, colored by the most urgent one.
    const fold = (a, subs) => {
      const sts = subs.map((s) => kidStatus(s.t, this.listed));
      const top = sts.reduce((m, s) => ((RANK[s] ?? 0) > (RANK[m] ?? 0) ? s : m), null);
      const open = !this.folded.has(a.address);
      return div()
        .id(`fold-${a.address}`)
        .h(18)
        .px(3)
        .gap(3)
        .flex()
        .items_center()
        .rounded(4)
        .text_size(11)
        .text_color(open ? t.dim : (t[top] ?? t.dim))
        .cursor_pointer()
        .hover((s) => s.bg(t.hover).text_color(t.foreground))
        .on_click((_e, cx) => {
          cx.stop_propagation();
          open ? this.folded.add(a.address) : this.folded.delete(a.address);
          cx.notify();
        })
        .child(svg(`mods/workspace-chrome/chevron-${open ? "down" : "right"}.svg`).size(11).flex_none())
        .when(!open, (el) => el.child(String(subs.length)));
    };

    // A row reads "space \u00b7 detail": the detail is a tab someone named or the
    // agent's own title, never an automatic tab number unless two rows would
    // otherwise read the same.
    // Read the pane snapshot once: every host read copies the whole list into JS.
    const labels = new Map(list.map(a => {
      const tab = tabs.get(a.tab);
      const many = tabCounts.get(a.tab) > 1;
      return [a.address, tab ? title(many ? { ...tab, named: false } : tab, many ? a : leads.get(a.tab)) : (a.title || a.program?.name || "")];
    }));
    const label = (a) => labels.get(a.address);
    const detail = new Map(list.map(a => [a.address, /^\d+$/.test(label(a)) ? null : label(a)]));
    const seen = {};
    for (const a of list) { const k = `${a.space_name}\u0000${detail.get(a.address) ?? ""}`; seen[k] = (seen[k] ?? 0) + 1; }
    for (const a of list) {
      if (detail.get(a.address) == null && seen[`${a.space_name}\u0000`] > 1) detail.set(a.address, label(a));
    }

    const row = (a, i, subs = []) => {
      const pic = icon(a.program, 16, t.foreground);
      const more = detail.get(a.address);
      // An agent on another machine (`vps/t7`) says which.
      const machine = a.address.includes("/") ? a.address.split("/")[0] : null;
      if (collapsed) {
        return h_flex()
          .id(`ag-${a.address}`)
          .h(26)
          .px(8)
          .flex_none()
          .items_center()
          .gap(4)
          .hover((s) => s.bg(t.hover))
          .on_click(() => run("pane.focus", { pane: a.pane }))
          .child(div().flex_1().min_w(0).whitespace_nowrap().text_right().text_color(t.muted).child(String(i + 1)))
          .child(h_flex().w(14).flex_none().items_center().justify_center().child(this.status(t, a, true)));
      }
      const when = this.since(a);
      const idle = a.status === "idle" && !a.focused;
      const isPinned = a.pinned;
      const pin = div()
        .id(`pin-${a.address}`)
        .flex_none()
        .p(2)
        .rounded(4)
        .text_color(t.dim)
        .cursor_pointer()
        .hover((s) => s.bg(t.hover).text_color(t.foreground))
        .tooltip(isPinned ? "Unpin" : "Pin to the top")
        .on_click((_e, cx) => {
          cx.stop_propagation();
          run("terminal.pin", { terminal: a.address, pinned: !isPinned });
          // The row moves away from under the pointer, and no hover-out comes.
          this.hovered = null;
          cx.notify();
        })
        .child(svg(`mods/workspace-chrome/${isPinned ? "pin-off" : "pin"}.svg`).size(13));
      // Under a space header the space goes without saying; an automatic tab number says nothing.
      // Without a space header above (priority, pinned) the row names its space.
      const full = byPriority || isPinned;
      const name = full ? a.space_name || label(a) : more ?? (/^\d+$/.test(label(a)) ? a.program?.name || label(a) : label(a));
      return h_flex()
        .id(`ag-${a.address}`)
        .px(8)
        .h(30)
        .flex_none()
        .rounded(8)
        .items_center()
        .gap(9)
        .when(a.focused, (el) => el.bg(t.selected))
        .cursor_pointer()
        .hover((s) => s.bg(t.hover))
        .on_hover((on, cx) => {
          if (on) this.hovered = a.address;
          else if (this.hovered === a.address) this.hovered = null;
          cx.notify();
        })
        .on_click(() => run("pane.focus", { pane: a.pane }))
        .when(Boolean(pic), el => el.child(div().id(`agent-fold-${a.address}`)
          .when(subs.length > 0, el => el.on_click((_e, cx) => {
            cx.stop_propagation();
            this.folded.has(a.address) ? this.folded.delete(a.address) : this.folded.add(a.address);
            cx.notify();
          })).child(pic)))
        .child(h_flex().flex_1().min_w(0).gap(5).items_center()
          .child(div().min_w(0).max_w(full && more ? 120 : 200).truncate().text_color(idle ? t.muted : t.foreground).child(name))
          .when(full && Boolean(more), el => el.child(div().flex_1().min_w(0).truncate().text_color(t.dim).child(`\u00b7 ${more}`))))
        .when(Boolean(machine), el => el.child(div().text_size(10).text_color(t.dim).child(machine)))
        .when(subs.length > 0, el => el.child(fold(a, subs)))
        .when(this.hovered === a.address, el => el.child(pin))
        .when(this.hovered !== a.address && Boolean(when), el => el.child(div().flex_none().text_size(11).text_color(t.dim).child(duration(now - when))))
        .child(this.status(t, a, byPriority && !isPinned));
    };

    // Groups in list order: spaces (grouped) or priority sections. Agents of a
    // space are next to each other in agents(), so neighbours make a group.
    const groups = pinned.length ? [{ id: "pinned", label: "Pinned", status: null, members: pinned }] : [];
    for (const a of rest) {
      const r = rankOf(a) || RANK.idle;
      const id = byPriority ? `sec-${r}` : `sp-${a.space}`;
      if (groups.at(-1)?.id === id) groups.at(-1).members.push(a);
      else groups.push({ id, label: byPriority ? SECTION[r] : a.space_name || "", status: byPriority ? SECTION_STATUS[r] : null, members: [a] });
    }

    // A group's header; it folds the group. Folded, it says how many and the most urgent state.
    const header = (g) => {
      const open = !this.folded.has(g.id);
      const top = g.members.reduce((m, a) => ((RANK[a.status] ?? 0) > (RANK[m] ?? 0) ? a.status : m), null);
      return h_flex()
        .id(g.id)
        .px(8)
        .pt(8)
        .h(30)
        .flex_none()
        .gap(6)
        .items_center()
        .text_size(11)
        .font_medium()
        .cursor_pointer()
        .hover((s) => s.text_color(t.foreground))
        .on_click((_e, cx) => {
          open ? this.folded.add(g.id) : this.folded.delete(g.id);
          cx.notify();
        })
        .child(div().truncate().text_color(t[g.status] ?? t.dim).child(g.label))
        .when(byPriority || !open, (el) => el.child(div().text_color(t.dim).child(String(g.members.length))))
        .child(div().flex_1())
        .when(!open, (el) => el
          .when(!byPriority && top && top !== "idle", (el) => el.child(this.status(t, { status: top }, true)))
          .child(svg("mods/workspace-chrome/chevron-right.svg").size(11).flex_none().text_color(t.dim)));
    };
    const dormantRows = dormant.map((s, idx) => this.dormantRow(s, t, now, collapsed, list.length + idx, cx));
    const rows = [
      ...(collapsed
        ? list.flatMap(withKids)
        : groups.flatMap((g) => (g.id.startsWith("sp-") ? g.members.flatMap(withKids) : [header(g), ...(this.folded.has(g.id) ? [] : g.members.flatMap(withKids))]))),
      ...dormantRows,
    ];

    return v_flex()
      .size_full()
      .min_h(0)
      .bg(t.chrome)
      .border_t(1)
      .border_color(t.border)
      .text_size(13)
      .when(!collapsed, (el) =>
        el.child(
          h_flex()
            .px(16)
            .h(41)
            .pt(14)
            .pb(5)
            .flex_none()
            .items_center()
            .justify_between()
            .child(div().text_size(11.5).font_medium().text_color(t.dim).child("Sessions"))
            .child(
              div()
                .id("ag-sort")
                .text_size(11)
                .text_color(t.dim)
                .hover((s) => s.text_color(t.foreground))
                .on_click(() => openOverlay({ mod: "workspace-agents", kind: "popup", width: 200, height: 140, props: { sortMenu: true } }))
                .tooltip(`Sort sessions: ${sort.label}`)
                .child(svg(`mods/workspace-chrome/${sort.icon}.svg`).size(14)),
            ),
        ),
      )
      .when(list.length === 0 && dormant.length === 0 && !collapsed, (el) =>
        el.child(div().px(12).text_size(12).text_color(t.dim).child("No active or saved sessions yet.")),
      )
      .child(v_flex().id("ag-list").flex_1().min_h(0).px(collapsed ? 0 : 8).overflow_y_scrollbar().mode("always").children(rows))
      .when(collapsed, (el) =>
        el.child(
          h_flex()
            .h(28)
            .items_center()
            .justify_center()
            .child(
              div()
                .id("collapse")
                .text_size(13)
                .text_color(t.dim)
                .hover((s) => s.text_color(t.foreground))
                .on_click(toggleSidebar)
                .child("»"),
            ),
        ),
      );
  }
}
