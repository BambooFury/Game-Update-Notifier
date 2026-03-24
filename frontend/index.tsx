import { definePlugin, callable, toaster } from "@steambrew/client";
import React from "react";

const loadVersions = callable<[], string>("load_versions_ipc");
const saveVersions = callable<[{ payload: string }], number>("save_versions_ipc");
const logTracking = callable<[{ payload: string }], number>("log_tracking");

function getGameIconUrl(appId: number): string {
  try {
    const overview = (window as any).appStore?.GetAppOverviewByAppID?.(appId);
    const hash = overview?.icon_hash || overview?.m_strIconHash;
    if (hash) return `https://cdn.akamai.steamstatic.com/steamcommunity/public/images/apps/${appId}/${hash}.jpg`;
  } catch {}
  return `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/library_600x900.jpg`;
}

function showNotification(gameName: string, appId?: number): void {
  toaster.toast({
    title: `${gameName} Updated`,
    body: "A new update is available!",
    logo: appId
      ? React.createElement("img", {
          src: getGameIconUrl(appId),
          style: { width: "40px", height: "40px", borderRadius: "6px", objectFit: "cover", objectPosition: "center center", display: "block", marginTop: "3px" },
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
    return games;
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

  await logTracking({ payload: `Tracking ${games.length} installed game(s) for updates` });

  async function checkOnStartup() {
    const updates: { name: string; id: number }[] = [];
    for (const game of games) {
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
    }
  }

  async function pollBuilds() {
    for (const game of games) {
      const key = String(game.id);
      const buildId = await fetchBuildId(game.id);
      if (!buildId) continue;
      const prev = lastBuilds[key];
      if (prev && prev !== buildId) {
        lastBuilds[key] = buildId;
        saveVersions({ payload: JSON.stringify(lastBuilds) });
        showNotification(game.name, game.id);
        logTracking({ payload: `Update detected for ${game.name} (build: ${buildId})` });
      } else if (!prev) {
        lastBuilds[key] = buildId;
        saveVersions({ payload: JSON.stringify(lastBuilds) });
      }
    }
  }

  await checkOnStartup();
  setInterval(pollBuilds, 2 * 60 * 1000);
}

export default definePlugin(() => {
  startTracking();
  const plugin: any = { title: "Game Update Notifier", content: React.createElement("div") };
  return plugin;
});
