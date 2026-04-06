import { definePlugin, callable, toaster, Field, DialogButton, Toggle } from "@steambrew/client";
import React, { useState, useEffect } from "react";

const loadVersions = callable<[], string>("load_versions_ipc");
const saveVersions = callable<[{ payload: string }], number>("save_versions_ipc");
const logTracking = callable<[{ payload: string }], number>("log_tracking");
const loadIgnored = callable<[], string>("load_ignored_ipc");
const saveIgnored = callable<[{ payload: string }], number>("save_ignored_ipc");
const loadSettings = callable<[], string>("load_settings_ipc");
const saveSettings = callable<[{ payload: string }], number>("save_settings_ipc");

let ignoredIds: Set<number> = new Set();
let trackUninstalled: boolean = false;

function getGameIconUrl(appId: number): string {
  try {
    const overview = (window as any).appStore?.GetAppOverviewByAppID?.(appId);
    const hash = overview?.icon_hash || overview?.m_strIconHash;
    if (hash) return `https://cdn.akamai.steamstatic.com/steamcommunity/public/images/apps/${appId}/${hash}.jpg`;
  } catch {}
  return `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`;
}

function showNotification(gameName: string, appId?: number): void {
  const logoUrl = appId ? getGameIconUrl(appId) : undefined;
  toaster.toast({
    title: `${gameName} Updated`,
    body: "A new update is available!",
    onClick: appId ? () => {
      (window as any).SteamClient.Apps.ShowStore(appId, 0);
    } : undefined,
    logo: logoUrl
      ? React.createElement("img", {
          src: logoUrl,
          style: { width: "32px", height: "32px", display: "block", borderRadius: "4px", marginTop: "4px", marginLeft: "8px" },
        })
      : undefined,
    duration: 7000,
    sound: 1,
    playSound: true,
    showToast: true,
  });
}

function getInstalledGames(): { id: number; name: string }[] {
  try {
    const appStore = (window as any).appStore;
    if (!appStore?.m_mapApps) return [];
    const games: { id: number; name: string }[] = [];
    appStore.m_mapApps.forEach((_: any, key: any): void => {
      const id = Number(key);
      if (id <= 0) return;
      const overview = appStore.GetAppOverviewByAppID?.(id);
      if (!overview) return;
      if (overview.app_type !== 1 && overview.app_type !== 2) return;
      if (!overview.local_per_client_data?.installed) return;
      const name = overview.display_name || `AppID ${id}`;
      games.push({ id, name });
    });
    return games.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

function getAllTrackedGames(): { id: number; name: string; installed: boolean }[] {
  try {
    const appStore = (window as any).appStore;
    if (!appStore?.m_mapApps) return [];
    const games: { id: number; name: string; installed: boolean }[] = [];
    appStore.m_mapApps.forEach((_: any, key: any): void => {
      const id = Number(key);
      if (id <= 0) return;
      const overview = appStore.GetAppOverviewByAppID?.(id);
      if (!overview) return;
      if (overview.app_type !== 1 && overview.app_type !== 2) return;
      const installed = !!overview.local_per_client_data?.installed;
      const name = overview.display_name || `AppID ${id}`;
      games.push({ id, name, installed });
    });
    return games.sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

async function fetchBuildId(appId: number): Promise<string | null> {
  try {
    const res = await fetch(`https://api.steamcmd.net/v1/info/${appId}`);
    const json = await res.json();
    return json?.data?.[String(appId)]?.depots?.branches?.public?.buildid ?? null;
  } catch {
    return null;
  }
}

const SettingsPanel = () => {
  const [games, setGames] = useState<{ id: number; name: string; installed: boolean }[]>([]);
  const [ignored, setIgnored] = useState<Set<number>>(new Set());
  const [search, setSearch] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [trackUninstalledSetting, setTrackUninstalledSetting] = useState(false);

  const refreshGames = (uninstalled: boolean) => {
    if (uninstalled) {
      setGames(getAllTrackedGames());
    } else {
      setGames(getInstalledGames().map(g => ({ ...g, installed: true })));
    }
  };

  useEffect(() => {
    const tryLoad = () => {
      Promise.all([
        loadIgnored().catch(() => "[]"),
        loadSettings().catch(() => "{}"),
      ]).then(([ignoredRaw, settingsRaw]) => {
        try {
          const ids: number[] = JSON.parse(ignoredRaw || "[]");
          const s = new Set<number>(ids);
          setIgnored(s);
          ignoredIds = s;
        } catch {}
        let uninstalled = false;
        try {
          const settings = JSON.parse(settingsRaw || "{}");
          uninstalled = settings.trackUninstalled === true;
          setTrackUninstalledSetting(uninstalled);
          trackUninstalled = uninstalled;
        } catch {}
        refreshGames(uninstalled);
        setLoaded(true);
      }).catch(() => {
        setTimeout(tryLoad, 2000);
      });
    };
    setTimeout(tryLoad, 1000);
  }, []);

  const toggle = (id: number) => {
    setIgnored((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      ignoredIds = next;
      saveIgnored({ payload: JSON.stringify([...next]) });
      return next;
    });
  };

  const toggleTrackUninstalled = (val: boolean) => {
    setTrackUninstalledSetting(val);
    trackUninstalled = val;
    refreshGames(val);
    saveSettings({ payload: JSON.stringify({ trackUninstalled: val }) });
  };

  const filtered = games.filter((g) =>
    g.name.toLowerCase().includes(search.toLowerCase())
  );

  if (!loaded) {
    return React.createElement("div", { style: { padding: "12px", color: "#8b929a" } }, "Loading...");
  }

  return React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: "4px" } },
    React.createElement(Field as any, {
      label: "Notify for uninstalled games",
      description: "When enabled, you'll receive update notifications even for games that are not currently installed",
      bottomSeparator: "standard",
    },
      React.createElement(Toggle as any, {
        value: trackUninstalledSetting,
        onChange: toggleTrackUninstalled,
      })
    ),
    React.createElement("div", { style: { padding: "8px 16px" } },
      React.createElement("input", {
        type: "text",
        placeholder: "Search games...",
        value: search,
        onChange: (e: any) => setSearch(e.target.value),
        style: {
          width: "100%", padding: "6px 10px", borderRadius: "4px",
          background: "#1a2130", border: "1px solid #3d4450",
          color: "#c6d4df", fontSize: "13px", boxSizing: "border-box",
        },
      })
    ),
    React.createElement("div", { style: { padding: "4px 16px 8px 16px", display: "flex", justifyContent: "space-between", gap: "8px" } },
      React.createElement("button", {
        onClick: () => {
          const next = new Set<number>(filtered.map(g => g.id));
          setIgnored(prev => {
            const merged = new Set([...prev, ...next]);
            ignoredIds = merged;
            saveIgnored({ payload: JSON.stringify([...merged]) });
            return merged;
          });
        },
        style: {
          flex: 1, padding: "5px 0", borderRadius: "4px", cursor: "pointer",
          background: "transparent", border: "1px solid #6b3030",
          color: "#c06060", fontSize: "12px", fontWeight: "500", letterSpacing: "0.3px",
        },
      }, "✕  Ignore all"),
      React.createElement("button", {
        onClick: () => {
          const toRemove = new Set<number>(filtered.map(g => g.id));
          setIgnored(prev => {
            const next = new Set([...prev].filter(id => !toRemove.has(id)));
            ignoredIds = next;
            saveIgnored({ payload: JSON.stringify([...next]) });
            return next;
          });
        },
        style: {
          flex: 1, padding: "5px 0", borderRadius: "4px", cursor: "pointer",
          background: "transparent", border: "1px solid #2d5a2d",
          color: "#60a060", fontSize: "12px", fontWeight: "500", letterSpacing: "0.3px",
        },
      }, "✓  Track all"),
    ),
    ...filtered.map((game) =>
      React.createElement(Field as any, {
        key: game.id,
        label: game.installed ? game.name : `${game.name} (not installed)`,
        icon: React.createElement("img", {
          src: getGameIconUrl(game.id),
          style: { width: "20px", height: "20px", borderRadius: "3px", opacity: game.installed ? 1 : 0.5 },
        }),
        bottomSeparator: "standard",
      },
        React.createElement(DialogButton as any, {
          onClick: () => toggle(game.id),
          style: {
            minWidth: "90px", fontSize: "12px", fontWeight: "500",
            background: ignored.has(game.id) ? "#6b2a1e" : "#2a4a1e",
            border: ignored.has(game.id) ? "1px solid #8b3a2a" : "1px solid #3a6a2a",
            color: ignored.has(game.id) ? "#e07060" : "#70c060",
            borderRadius: "4px",
          },
        }, ignored.has(game.id) ? "Ignored" : "Tracking")
      )
    )
  );
};

async function startTracking(): Promise<void> {
  let games: { id: number; name: string }[] = [];
  for (let i = 0; i < 120; i++) {
    games = getInstalledGames();
    if (games.length > 0) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  if (games.length === 0) return;

  let raw = "";
  try { raw = await loadVersions(); } catch {}
  let lastBuilds: Record<string, string> = {};
  try { lastBuilds = JSON.parse(raw || "{}"); } catch {}

  try {
    const ignoredRaw = await loadIgnored();
    ignoredIds = new Set(JSON.parse(ignoredRaw || "[]"));
  } catch {}

  await logTracking({ payload: `Tracking ${games.length} installed game(s) for updates` });

  function getActiveGames(): { id: number; name: string }[] {
    const all = getAllTrackedGames();
    return all.filter((g) => {
      if (ignoredIds.has(g.id)) return false;
      if (!trackUninstalled && !g.installed) return false;
      return true;
    });
  }

  async function checkOnStartup() {
    const activeGames = getActiveGames();
    const updates: { name: string; id: number }[] = [];
    for (const game of activeGames) {
      const key = String(game.id);
      const buildId = await fetchBuildId(game.id);
      if (!buildId) continue;
      const prev = lastBuilds[key];
      if (prev && prev !== buildId) {
        updates.push(game);
        logTracking({ payload: `Missed update detected for ${game.name} (build: ${buildId})` });
      }
      lastBuilds[key] = buildId;
    }
    saveVersions({ payload: JSON.stringify(lastBuilds) });
    for (const game of updates) {
      showNotification(game.name, game.id);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }

  async function pollBuilds() {
    const activeGames = getActiveGames();
    await logTracking({ payload: `Polling ${activeGames.length} game(s)...` });
    for (const game of activeGames) {
      const key = String(game.id);
      const buildId = await fetchBuildId(game.id);
      if (!buildId) continue;
      const prev = lastBuilds[key];
      if (prev && prev !== buildId) {
        lastBuilds[key] = buildId;
        saveVersions({ payload: JSON.stringify(lastBuilds) });
        showNotification(game.name, game.id);
        logTracking({ payload: `Update detected for ${game.name} (build: ${buildId})` });
        await new Promise((r) => setTimeout(r, 3000));
      } else if (!prev) {
        lastBuilds[key] = buildId;
        saveVersions({ payload: JSON.stringify(lastBuilds) });
      }
    }
  }

  try {
    const settingsRaw = await loadSettings();
    const settings = JSON.parse(settingsRaw || "{}");
    trackUninstalled = settings.trackUninstalled === true;
  } catch {}

  await checkOnStartup();
  logTracking({ payload: `Poll interval started (every 1 min)` });
  setInterval(pollBuilds, 60 * 1000);
}

export default definePlugin(() => {
  startTracking();
  return {
    title: "Game Update Notifier",
    icon: React.createElement("span", null, "🔔"),
    content: React.createElement(SettingsPanel),
  };
});
