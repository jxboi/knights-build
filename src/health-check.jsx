import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Activity, Box, Check, Clock3, Cpu, Gauge, HardDrive, RefreshCw, Smartphone, Zap } from "lucide-react";
import "./health-check.css";

const bytesToLabel = (bytes, emptyLabel = "—") => {
  if (!Number.isFinite(bytes) || bytes <= 0) return emptyLabel;
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
};

const msToLabel = (value) =>
  Number.isFinite(value) && value >= 0 ? `${Math.round(value)} ms` : "—";

const metricState = (value, suffix = "") =>
  Number.isFinite(value) ? `${Math.round(value * 10) / 10}${suffix}` : "—";

function classifyResource(entry) {
  const path = new URL(entry.name).pathname.toLowerCase();
  if (path.endsWith(".glb")) return "models";
  if (path.endsWith(".js") || path.endsWith(".jsx")) return "javascript";
  if (path.endsWith(".css")) return "styles";
  if (/\.(woff2?|ttf|otf)$/.test(path)) return "fonts";
  if (/\.(png|jpe?g|gif|webp|svg)$/.test(path)) return "images";
  return "other";
}

function summarizeResources(resources) {
  const summary = {
    total: { requests: 0, encoded: 0, transfer: 0, decoded: 0 },
    javascript: { requests: 0, encoded: 0, transfer: 0, decoded: 0 },
    styles: { requests: 0, encoded: 0, transfer: 0, decoded: 0 },
    models: { requests: 0, encoded: 0, transfer: 0, decoded: 0 },
    fonts: { requests: 0, encoded: 0, transfer: 0, decoded: 0 },
    images: { requests: 0, encoded: 0, transfer: 0, decoded: 0 },
    other: { requests: 0, encoded: 0, transfer: 0, decoded: 0 },
  };
  const list = resources
    .filter((entry) => entry && entry.name && !entry.name.includes("favicon"))
    .map((entry) => {
      const category = classifyResource(entry);
      const item = {
        name: new URL(entry.name).pathname.split("/").pop() || entry.name,
        category,
        duration: entry.duration,
        encoded: entry.encodedBodySize || 0,
        transfer: entry.transferSize || 0,
        decoded: entry.decodedBodySize || 0,
      };
      for (const key of ["encoded", "transfer", "decoded"]) {
        summary[category][key] += item[key];
        summary.total[key] += item[key];
      }
      summary[category].requests += 1;
      summary.total.requests += 1;
      return item;
    })
    .sort((a, b) => b.encoded - a.encoded);
  return { summary, list };
}

function getChildMetrics(frame) {
  const childWindow = frame?.contentWindow;
  if (!childWindow) return null;
  const performanceApi = childWindow.performance;
  const navigation = performanceApi?.getEntriesByType("navigation")?.[0];
  const paints = performanceApi?.getEntriesByType("paint") || [];
  const resources = performanceApi?.getEntriesByType("resource") || [];
  const { summary, list } = summarizeResources(resources);
  let webgl = "Detected in game frame";
  try {
    const canvas = childWindow.document.querySelector("canvas");
    const context = canvas?.getContext("webgl2") || canvas?.getContext("webgl");
    const debugInfo = context?.getExtension("WEBGL_debug_renderer_info");
    webgl = context
      ? context.getParameter(debugInfo?.UNMASKED_RENDERER_WEBGL || context.RENDERER)
      : "Unavailable";
  } catch {}
  return {
    navigation: {
      domContentLoaded: navigation?.domContentLoadedEventEnd,
      load: navigation?.loadEventEnd,
      response: navigation?.responseEnd,
      transfer: navigation?.transferSize,
    },
    firstPaint: paints.find((entry) => entry.name === "first-paint")?.startTime,
    firstContentfulPaint: paints.find((entry) => entry.name === "first-contentful-paint")?.startTime,
    webgl,
    summary,
    resources: list,
    generatedAt: Date.now(),
  };
}

function HealthCheck() {
  const frameRef = useRef(null);
  const [run, setRun] = useState(0);
  const [status, setStatus] = useState("loading");
  const [metrics, setMetrics] = useState(null);
  const [runtime, setRuntime] = useState(null);
  const [lastError, setLastError] = useState("");

  useEffect(() => {
    const onMessage = (event) => {
      if (event.origin !== window.location.origin || event.source !== frameRef.current?.contentWindow) return;
      if (event.data?.type === "hearth-hamlet-health-ready") {
        const nextMetrics = getChildMetrics(frameRef.current);
        setMetrics({ ...nextMetrics, ready: event.data.readyAt });
        setStatus("ready");
        setLastError("");
      }
      if (event.data?.type === "hearth-hamlet-health-runtime") {
        setRuntime(event.data);
      }
      if (event.data?.type === "hearth-hamlet-health-error") {
        setStatus("error");
        setLastError(event.data.message || "The game could not complete its startup check.");
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [run]);

  useEffect(() => {
    setStatus("loading");
    setMetrics(null);
    setRuntime(null);
    setLastError("");
  }, [run]);

  const categories = useMemo(() => {
    if (!metrics?.summary) return [];
    return [
      ["3D models", "models", Box],
      ["JavaScript", "javascript", Zap],
      ["Styles", "styles", Activity],
      ["Fonts & images", "fontsImages", HardDrive],
    ].map(([label, key, Icon]) => {
      if (key === "fontsImages") {
        const fonts = metrics.summary.fonts;
        const images = metrics.summary.images;
        return [label, key, Icon, fonts.requests + images.requests, fonts.encoded + images.encoded];
      }
      const item = metrics.summary[key];
      return [label, key, Icon, item.requests, item.encoded];
    });
  }, [metrics]);

  const rerun = () => {
    frameRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    setRun((value) => value + 1);
  };
  const totalEncoded = metrics?.summary?.total?.encoded || 0;
  const frameRate = runtime?.fps;
  const longTasks = runtime?.longTasks;
  const statusLabel = status === "ready" ? "Ready" : status === "error" ? "Needs attention" : "Running startup check";

  return (
    <main className="health-shell">
      <header className="health-header">
        <a className="health-back" href="/" aria-label="Back to Hearth & Hamlet">
          <ArrowLeft size={17} /> <span>Back to village</span>
        </a>
        <div className="health-brand">
          <span className="health-brand-mark">✦</span>
          <span>Hearth & Hamlet</span>
        </div>
        <button className="health-rerun" type="button" onClick={rerun}>
          <RefreshCw size={15} /> Run again
        </button>
      </header>

      <section className="health-hero">
        <div>
          <p className="health-kicker">PERFORMANCE HEALTH CHECK</p>
          <h1>Know how the village feels on a phone.</h1>
          <p className="health-lede">
            This page loads a real game instance and reads the browser’s timing, payload, WebGL, and runtime signals. Use it after adding assets or interactions.
          </p>
        </div>
        <div className={`health-status ${status}`} role="status">
          <span className="status-dot" />
          <strong>{statusLabel}</strong>
          <span>{status === "ready" ? "Game startup complete" : status === "error" ? lastError : "Loading the 3D world…"}</span>
        </div>
      </section>

      <section className="health-grid health-grid-primary" aria-label="Key performance metrics">
        <MetricCard icon={HardDrive} label="Game payload" value={bytesToLabel(totalEncoded)} detail="Compressed bytes requested by the game" tone="terra" />
        <MetricCard icon={Clock3} label="Ready to play" value={msToLabel(metrics?.ready)} detail="Document start → 3D world ready" tone="green" />
        <MetricCard icon={Gauge} label="Frame rate" value={metricState(frameRate, " fps")} detail="Live 5-second requestAnimationFrame sample" tone="blue" />
        <MetricCard icon={Cpu} label="Long tasks" value={metricState(longTasks, " tasks")} detail="Main-thread tasks over 50 ms during sample" tone="gold" />
      </section>

      <section className="health-grid health-grid-secondary">
        <article className="health-panel timing-panel">
          <PanelHeading icon={Clock3} title="Startup timeline" note="Measured inside the game frame" />
          <div className="timeline-list">
            <TimelineRow label="Server response" value={msToLabel(metrics?.navigation?.response)} />
            <TimelineRow label="DOM ready" value={msToLabel(metrics?.navigation?.domContentLoaded)} />
            <TimelineRow label="Window loaded" value={msToLabel(metrics?.navigation?.load)} />
            <TimelineRow label="First contentful paint" value={msToLabel(metrics?.firstContentfulPaint)} />
            <TimelineRow label="3D world ready" value={msToLabel(metrics?.ready)} highlight />
          </div>
        </article>

        <article className="health-panel payload-panel">
          <PanelHeading icon={Box} title="Where the payload goes" note={`${metrics?.summary?.total?.requests || 0} resources observed`} />
          <div className="payload-list">
            {categories.map(([label, key, Icon, requests, bytes]) => (
              <div className="payload-row" key={key}>
                <span className="payload-icon"><Icon size={15} /></span>
                <span className="payload-name">{label}<small>{requests} {requests === 1 ? "request" : "requests"}</small></span>
                <strong>{bytesToLabel(bytes, "cached")}</strong>
                <div className="payload-bar"><i style={{ width: `${totalEncoded ? Math.max(4, (bytes / totalEncoded) * 100) : 0}%` }} /></div>
              </div>
            ))}
          </div>
          <p className="health-footnote">Payload uses encoded body size. A warm browser cache can make transfer size appear lower.</p>
        </article>
      </section>

      <section className="health-grid health-grid-tertiary">
        <article className="health-panel device-panel">
          <PanelHeading icon={Smartphone} title="This device & browser" note="What the game can see" />
          <div className="device-list">
            <TimelineRow label="Viewport" value={`${window.innerWidth} × ${window.innerHeight}`} />
            <TimelineRow label="Pixel ratio" value={`${window.devicePixelRatio || 1}×`} />
            <TimelineRow label="CPU cores reported" value={navigator.hardwareConcurrency ? `${navigator.hardwareConcurrency}` : "—"} />
            <TimelineRow label="Device memory" value={navigator.deviceMemory ? `${navigator.deviceMemory} GB` : "Not exposed"} />
            <TimelineRow label="WebGL" value={metrics?.webgl || "Detected in game frame"} />
          </div>
        </article>

        <article className="health-panel resources-panel">
          <PanelHeading icon={Activity} title="Largest resources" note="Encoded size · startup order" />
          <div className="resource-list">
            {(metrics?.resources || []).slice(0, 7).map((resource) => (
              <div className="resource-row" key={`${resource.name}-${resource.category}`}>
                <span className={`resource-type ${resource.category}`}>{resource.category === "models" ? "3D" : resource.category === "javascript" ? "JS" : resource.category.toUpperCase().slice(0, 3)}</span>
                <span className="resource-name" title={resource.name}>{resource.name}</span>
                <strong>{bytesToLabel(resource.encoded, "cached")}</strong>
                <small>{msToLabel(resource.duration)}</small>
              </div>
            ))}
            {!metrics?.resources?.length && <p className="empty-resources">Waiting for the game resource list…</p>}
          </div>
        </article>
      </section>

      <section className="health-note-panel">
        <div className="health-note-icon"><Check size={17} /></div>
        <div>
          <strong>How to use this check</strong>
          <p>Run it on a phone over cellular data after a hard reload. Treat “ready to play” and “game payload” as your main guardrails. Around 60 fps is smooth; sustained readings under 30 fps or long tasks above 100 ms deserve investigation.</p>
        </div>
      </section>

      <div className="health-preview-wrap">
        <div className="health-preview-label"><span className="status-dot" /> Live game sample</div>
        <iframe
          key={run}
          ref={frameRef}
          title="Live Hearth & Hamlet performance sample"
          src={`/?healthcheck=1&run=${run}`}
          className="health-preview"
          onError={() => {
            setStatus("error");
            setLastError("The game frame could not be loaded.");
          }}
        />
      </div>
    </main>
  );
}

function MetricCard({ icon: Icon, label, value, detail, tone }) {
  return (
    <article className={`metric-card ${tone}`}>
      <span className="metric-icon"><Icon size={18} /></span>
      <span className="metric-label">{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function PanelHeading({ icon: Icon, title, note }) {
  return <div className="panel-heading"><span className="panel-heading-icon"><Icon size={16} /></span><div><h2>{title}</h2><p>{note}</p></div></div>;
}

function TimelineRow({ label, value, highlight = false }) {
  return <div className={`timeline-row ${highlight ? "highlight" : ""}`}><span>{label}</span><strong>{value}</strong></div>;
}

export default HealthCheck;
