import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";

// The backend answers with one response, so none of this is live status.
// The stages are timed to give a sense of progress; the last one stays
// active (with the graph still moving) until the real result arrives.
const STEPS = [
  "Fetching repository tree",
  "Parsing source files",
  "Resolving imports",
  "Building the graph",
];

// Seconds at which each stage begins, and the bar fill at each stage.
const STAGE_AT = [0, 2, 4, 6];
const PROGRESS = [14, 38, 62, 84];
const SLOW_NOTE_AT = 12;

// ------------------------------------------------------------
// A small stand-in graph. Same visual rules as the real one:
// color by folder, bigger and glowing when many files import it.
// ------------------------------------------------------------

const HUES = { entry: 340, routes: 212, services: 160, shared: 38 };

const colorOf = (group) => ({
  fill: `hsl(${HUES[group]}, 42%, 30%)`,
  border: `hsl(${HUES[group]}, 62%, 62%)`,
  text: "#F4F8FC",
});

const RAW_NODES = [
  { id: "app", label: "app", group: "entry", x: 62, y: 180, col: 0 },

  { id: "router", label: "router", group: "routes", x: 205, y: 72, col: 1 },
  { id: "auth", label: "auth", group: "routes", x: 205, y: 180, col: 1 },
  { id: "api", label: "api", group: "routes", x: 205, y: 288, col: 1 },

  { id: "users", label: "users", group: "services", x: 365, y: 95, col: 2 },
  { id: "orders", label: "orders", group: "services", x: 365, y: 200, col: 2 },
  { id: "payments", label: "payments", group: "services", x: 365, y: 305, col: 2 },

  { id: "db", label: "db", group: "shared", x: 523, y: 108, col: 3 },
  { id: "utils", label: "utils", group: "shared", x: 523, y: 205, col: 3 },
  { id: "logger", label: "logger", group: "shared", x: 523, y: 300, col: 3 },
];

const RAW_EDGES = [
  ["app", "router"],
  ["app", "auth"],
  ["app", "api"],
  ["router", "users"],
  ["auth", "users"],
  ["auth", "orders"],
  ["api", "orders"],
  ["api", "payments"],
  ["users", "db"],
  ["users", "utils"],
  ["orders", "db"],
  ["orders", "utils"],
  ["orders", "logger"],
  ["payments", "db"],
  ["payments", "logger"],
];

const HUB_AT = 3;

const usedBy = {};
RAW_EDGES.forEach(([, target]) => {
  usedBy[target] = (usedBy[target] || 0) + 1;
});

const NODES = RAW_NODES.map((n) => {
  const importers = usedBy[n.id] || 0;
  const fs = 11.5 + Math.min(importers, 6) * 0.4;
  return {
    ...n,
    fs,
    hub: importers >= HUB_AT,
    w: Math.round(n.label.length * fs * 0.62 + 24),
    h: 26 + Math.min(importers, 6) * 2,
    color: colorOf(n.group),
  };
});

const NODE_BY_ID = Object.fromEntries(NODES.map((n) => [n.id, n]));

const EDGES = RAW_EDGES.map(([s, t]) => {
  const a = NODE_BY_ID[s];
  const b = NODE_BY_ID[t];
  const x1 = a.x + a.w / 2;
  const y1 = a.y;
  const x2 = b.x - b.w / 2 - 1;
  const y2 = b.y;
  const mx = (x1 + x2) / 2;

  return {
    id: `${s}>${t}`,
    toHub: b.hub,
    d: `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`,
  };
});

const EDGE_DIM = "#3F5368";
const EDGE_LIVE = "#6F95BE";
const NO_MOTION = { duration: 0 };

function LoadingGraph({ stage, reduce }) {
  const parsed = stage >= 1; // nodes get their color and name
  const linked = stage >= 2; // edges are drawn
  const settled = stage >= 3; // graph is complete, keeps moving quietly

  return (
    <svg
      className="loading-graph-svg"
      viewBox="0 0 600 360"
      role="presentation"
      aria-hidden="true"
    >
      <defs>
        <marker
          id="lg-arrow"
          markerWidth="7"
          markerHeight="7"
          refX="6"
          refY="3.5"
          orient="auto"
          markerUnits="userSpaceOnUse"
        >
          <path d="M0,0 L7,3.5 L0,7 z" fill={EDGE_LIVE} />
        </marker>
      </defs>

      {EDGES.map((e, i) => (
        <g key={e.id}>
          <motion.path
            d={e.d}
            fill="none"
            markerEnd="url(#lg-arrow)"
            initial={false}
            animate={{
              pathLength: linked ? 1 : 0,
              opacity: linked ? (e.toHub ? 0.32 : 0.85) : 0,
              stroke: settled ? EDGE_LIVE : EDGE_DIM,
              strokeWidth: 1.2,
            }}
            transition={
              reduce
                ? NO_MOTION
                : {
                    pathLength: { delay: i * 0.05, duration: 0.8, ease: "easeOut" },
                    opacity: { delay: i * 0.05 + 0.25, duration: 0.2 },
                    stroke: { duration: 0.7 },
                  }
            }
          />

          {settled && !reduce && !e.toHub && (
            <circle r="2.6" fill="#7DB4F0">
              <animateMotion
                dur={`${2.4 + (i % 4) * 0.45}s`}
                repeatCount="indefinite"
                path={e.d}
              />
            </circle>
          )}
        </g>
      ))}

      {NODES.map((n) => {
        const appear = 0.1 + n.col * 0.14;
        const fillDelay = n.col * 0.12;
        const pulse = n.hub && settled && !reduce;

        return (
          <motion.g
            key={n.id}
            style={{ transformBox: "fill-box", transformOrigin: "center" }}
            initial={reduce ? false : { opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={
              reduce
                ? NO_MOTION
                : {
                    opacity: { delay: appear, duration: 0.35 },
                    scale: { delay: appear, type: "spring", stiffness: 260, damping: 20 },
                  }
            }
          >
            {n.hub && (
              <motion.rect
                x={n.x - n.w / 2 - 6}
                y={n.y - n.h / 2 - 6}
                width={n.w + 12}
                height={n.h + 12}
                rx="10"
                fill={n.color.border}
                initial={false}
                animate={{ opacity: !parsed ? 0 : pulse ? [0.12, 0.3, 0.12] : 0.18 }}
                transition={
                  reduce
                    ? NO_MOTION
                    : pulse
                    ? { duration: 2.4, repeat: Infinity, ease: "easeInOut" }
                    : { delay: fillDelay, duration: 0.4 }
                }
              />
            )}

            {/* Outline only, until the file has been parsed. */}
            <motion.rect
              x={n.x - n.w / 2}
              y={n.y - n.h / 2}
              width={n.w}
              height={n.h}
              rx="6"
              fill="none"
              stroke={EDGE_DIM}
              strokeWidth="1"
              strokeDasharray="3 3"
              initial={false}
              animate={{ opacity: parsed ? 0 : 0.9 }}
              transition={reduce ? NO_MOTION : { delay: fillDelay, duration: 0.3 }}
            />

            <motion.rect
              x={n.x - n.w / 2}
              y={n.y - n.h / 2}
              width={n.w}
              height={n.h}
              rx="6"
              fill={n.color.fill}
              stroke={n.color.border}
              strokeWidth={n.hub ? 2 : 1}
              initial={false}
              animate={{ opacity: parsed ? 1 : 0 }}
              transition={reduce ? NO_MOTION : { delay: fillDelay, duration: 0.4 }}
            />

            <motion.text
              x={n.x}
              y={n.y}
              textAnchor="middle"
              dominantBaseline="central"
              fontFamily="'IBM Plex Mono', Consolas, monospace"
              fontSize={n.fs}
              fontWeight="500"
              fill={n.color.text}
              initial={false}
              animate={{ opacity: parsed ? 1 : 0 }}
              transition={reduce ? NO_MOTION : { delay: fillDelay + 0.15, duration: 0.35 }}
            >
              {n.label}
            </motion.text>
          </motion.g>
        );
      })}
    </svg>
  );
}

// ------------------------------------------------------------
// Page
// ------------------------------------------------------------

const repoName = (url) => {
  const name = String(url || "")
    .trim()
    .replace(/^https?:\/\/(www\.)?github\.com\//i, "")
    .replace(/\.git$/i, "")
    .replace(/\/+$/, "");
  return name || "repository";
};

const clock = (seconds) => {
  const s = Math.floor(seconds);
  const mm = String(Math.floor(s / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${mm}:${ss}`;
};

function Loading({ repo = "", onCancel }) {
  const reduce = useReducedMotion();
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setElapsed((s) => s + 0.5), 500);
    return () => clearInterval(timer);
  }, []);

  const stage = STAGE_AT.reduce((current, at, i) => (elapsed >= at ? i : current), 0);

  return (
    <div className="loading">
      <div className="loading-brand">REPOSITORY VISUALIZER</div>

      <div className="loading-main">
        <span className="sr-only" role="status" aria-live="polite">
          {STEPS[stage]}
        </span>

        <div className="loading-window">
          <div className="loading-bar">
            <strong>{repoName(repo)}</strong>
            <span>{clock(elapsed)}</span>
          </div>

          <div className="loading-canvas">
            <LoadingGraph stage={stage} reduce={reduce} />
          </div>

          <div className="loading-track" aria-hidden="true">
            <div className="loading-fill" style={{ width: `${PROGRESS[stage]}%` }} />
          </div>
        </div>

        <ol className="loading-steps">
          {STEPS.map((step, i) => {
            const state = i < stage ? "done" : i === stage ? "active" : "";
            return (
              <li key={step} className={state}>
                <span className="step-mark">
                  <span className="step-num">{String(i + 1).padStart(2, "0")}</span>
                  {state === "done" && <span className="step-check">✓</span>}
                  {state === "active" && <span className="step-dot" />}
                </span>
                <span className="step-label">{step}</span>
              </li>
            );
          })}
        </ol>

        <div className="loading-foot">
          <p className="loading-note">
            {elapsed >= SLOW_NOTE_AT
              ? "Larger repositories can take a little longer. Still working."
              : "Reading your repository on the server."}
          </p>
          {onCancel && (
            <button className="loading-cancel" onClick={onCancel}>
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default Loading;