"use client";

import { useEffect } from "react";

const runtimeVersion = "20260831-phase1c-audio-vad-diagnostics";
const demoRuntimeScripts = ["/fixtures/oz-demo-v1.js", "/app.js"];
const coreRuntimeScripts = ["/oz-latency-metrics.js", "/oz-network.js", "/oz-workspace.js", "/live-oz.js"];
const runtimeLoads = new Map<string, Promise<void>>();

type OzRuntimeWindow = Window & {
  OZ_LATENCY?: { initialized?: boolean };
  OZ_NETWORK?: { initialized?: boolean };
  OZ_WORKSPACE?: { initialized?: boolean };
  OZ_LIVE?: { initialized?: boolean };
};

function runtimeInitialized(src: string) {
  const runtimeWindow = window as OzRuntimeWindow;
  if (src === "/oz-latency-metrics.js") return runtimeWindow.OZ_LATENCY?.initialized === true;
  if (src === "/oz-network.js") return runtimeWindow.OZ_NETWORK?.initialized === true;
  if (src === "/oz-workspace.js") return runtimeWindow.OZ_WORKSPACE?.initialized === true;
  if (src === "/live-oz.js") return runtimeWindow.OZ_LIVE?.initialized === true;
  return false;
}

function loadRuntimeScript(src: string) {
  if (runtimeInitialized(src)) return Promise.resolve();

  const versionedSrc = `${src}?v=${runtimeVersion}`;
  const activeLoad = runtimeLoads.get(versionedSrc);
  if (activeLoad) return activeLoad;

  const load = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = versionedSrc;
    script.async = false;
    script.dataset.ozRuntime = "true";
    script.dataset.ozRuntimeSource = src;
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error(`Runtime unavailable: ${src}`)), { once: true });
    document.body.appendChild(script);
  });

  runtimeLoads.set(versionedSrc, load);
  void load.catch(() => runtimeLoads.delete(versionedSrc));
  return load;
}

export default function OzScripts({ includeLocalDemo = false }: { includeLocalDemo?: boolean }) {
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const path = window.location.pathname.replace(/\/+$/, "") || "/";
      const localDemoRoute = includeLocalDemo
        && ["localhost", "127.0.0.1"].includes(window.location.hostname)
        && path === "/demo";
      const runtimeScripts = [...(localDemoRoute ? demoRuntimeScripts : []), ...coreRuntimeScripts];

      for (const src of runtimeScripts) {
        if (cancelled) return;
        try {
          await loadRuntimeScript(src);
        } catch {
          console.error(`OZ runtime failed to load: ${src}`);
        }
      }
    };

    void load();
    return () => { cancelled = true; };
  }, [includeLocalDemo]);

  return null;
}
