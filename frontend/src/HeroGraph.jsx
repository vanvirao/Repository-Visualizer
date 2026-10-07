import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";

// A tiny made-up repo that previews what the real tool produces.
// It follows the same visual rules as the workspace: color by folder,
// bigger = imported by more files, faint edges into shared files,
// and hover (or the auto-tour) lights up one file's connections.

const GROUPS = {
  entry: { label: "src", hue: 340 },
  routes: { label: "routes", hue: 212 },
  services: { label: "services", hue: 160 },
  shared: { label: "shared", hue: 38 },
};

const colorOf = (group) => {
  const { hue } = GROUPS[group];
  return {
    fill: `hsl(${hue}, 42%, 30%)`,
    border: `hsl(${hue}, 62%, 62%)`,
    text: "#F4F8FC",
  };
};

const RAW_NODES = [
  { id: "app", label: "app.ts", group: "entry", x: 70, y: 190, col: 0 },

  { id: "users.route", label: "users.route.ts", group: "routes", x: 235, y: 55, col: 1 },
  { id: "orders.route", label: "orders.route.ts", group: "routes", x: 235, y: 145, col: 1 },
  { id: "cart.route", label: "cart.route.ts", group: "routes", x: 235, y: 235, col: 1 },
  { id: "billing.route", label: "billing.route.ts", group: "routes", x: 235, y: 325, col: 1 },

  { id: "users.service", label: "users.service.ts", group: "services", x: 435, y: 80, col: 2 },
  { id: "orders.service", label: "orders.service.ts", group: "services", x: 435, y: 190, col: 2 },
  { id: "billing.service", label: "billing.service.ts", group: "services", x: 435, y: 300, col: 2 },
  { id: "mailer", label: "mailer.ts", group: "services", x: 435, y: 390, col: 2 },

  { id: "db", label: "db.ts", group: "shared", x: 612, y: 140, col: 3 },
  { id: "utils", label: "utils.ts", group: "shared", x: 612, y: 232, col: 3 },
  { id: "logger", label: "logger.ts", group: "shared", x: 612, y: 330, col: 3 },
];

const RAW_EDGES = [
  ["app", "users.route"],
  ["app", "orders.route"],
  ["app", "cart.route"],
  ["app", "billing.route"],

  ["users.route", "users.service"],
  ["orders.route", "orders.service"],
  ["cart.route", "orders.service"],
  ["billing.route", "billing.service"],

  ["users.service", "db"],
  ["users.service", "utils"],
  ["orders.service", "db"],
  ["orders.service", "utils"],
  ["orders.service", "logger"],
  ["billing.service", "db"],
  ["billing.service", "utils"],
  ["billing.service", "logger"],
  ["billing.service", "mailer"],
  ["mailer", "utils"],
  ["mailer", "logger"],
];

const HUB_AT = 4;
const TOUR = ["app", "utils", "orders.service", "logger"];

const ARROW = {
  dim: "#3F5368",
  out: "#7DB4F0",
  in: "#E3B65B",
};

// Build sizes and paths once.
const usedBy = {};
RAW_EDGES.forEach(([, target]) => {
  usedBy[target] = (usedBy[target] || 0) + 1;
});

const NODES = RAW_NODES.map((n) => {
  const importers = usedBy[n.id] || 0;
  const fs = 11 + Math.min(importers, 6) * 0.5;
  return {
    ...n,
    fs,
    importers,
    hub: importers >= HUB_AT,
    w: Math.round(n.label.length * fs * 0.62 + 24),
    h: 26 + Math.min(importers, 6) * 2,
    color: colorOf(n.group),
  };
});

const NODE_BY_ID = Object.fromEntries(NODES.map((n) => [n.id, n]));

const EDGES = RAW_EDGES.map(([s, t], i) => {
  const a = NODE_BY_ID[s];
  const b = NODE_BY_ID[t];
  const x1 = a.x + a.w / 2;
  const y1 = a.y;
  const x2 = b.x - b.w / 2 - 1;
  const y2 = b.y;
  const mx = (x1 + x2) / 2;

  return {
    id: `${s}>${t}`,
    s,
    t,
    toHub: b.hub,
    d: `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`,
    delay: 0.95 + i * 0.045,
  };
});

const INTRO_MS = 3300;

function HeroGraph() {
  const reduce = useReducedMotion();

  const [hoverId, setHoverId] = useState(null);
  const [tourId, setTourId] = useState(null);
  const [introDone, setIntroDone] = useState(Boolean(reduce));

  useEffect(() => {
    if (reduce) return undefined;
    const timer = setTimeout(() => setIntroDone(true), INTRO_MS);
    return () => clearTimeout(timer);
  }, [reduce]);

  // After the intro, quietly tour a few files to show what highlighting does.
  useEffect(() => {
    if (reduce || !introDone) return undefined;

    let i = 0;
    setTourId(TOUR[0]);
    const timer = setInterval(() => {
      i = (i + 1) % TOUR.length;
      setTourId(TOUR[i]);
    }, 3200);

    return () => clearInterval(timer);
  }, [reduce, introDone]);

  const focus = hoverId || tourId;

  const lit = useMemo(() => {
    if (!focus) return null;
    const set = new Set([focus]);
    EDGES.forEach((e) => {
      if (e.s === focus) set.add(e.t);
      if (e.t === focus) set.add(e.s);
    });
    return set;
  }, [focus]);

  const edgeLook = (e) => {
    if (!focus) {
      return e.toHub
        ? { state: "hub", stroke: ARROW.dim, opacity: 0.22, width: 1, marker: "dim" }
        : { state: "base", stroke: ARROW.dim, opacity: 0.85, width: 1.2, marker: "dim" };
    }
    if (e.s === focus) {
      return { state: "out", stroke: ARROW.out, opacity: 1, width: 2, marker: "out" };
    }
    if (e.t === focus) {
      return { state: "in", stroke: ARROW.in, opacity: 1, width: 2, marker: "in" };
    }
    return { state: "faded", stroke: ARROW.dim, opacity: 0.07, width: 1, marker: "dim" };
  };

  const settle = { duration: 0.25 };

  return (
    <svg
      className="hero-graph-svg"
      viewBox="0 0 700 440"
      role="presentation"
      aria-hidden="true"
    >
      <defs>
        {Object.entries(ARROW).map(([key, color]) => (
          <marker
            key={key}
            id={`hg-arrow-${key}`}
            markerWidth="7"
            markerHeight="7"
            refX="6"
            refY="3.5"
            orient="auto"
            markerUnits="userSpaceOnUse"
          >
            <path d="M0,0 L7,3.5 L0,7 z" fill={color} />
          </marker>
        ))}
      </defs>

      {EDGES.map((e) => {
        const look = edgeLook(e);
        const animating = look.state === "out" || look.state === "in";

        return (
          <g key={e.id}>
            <motion.path
              d={e.d}
              fill="none"
              markerEnd={`url(#hg-arrow-${look.marker})`}
              initial={reduce ? false : { pathLength: 0, opacity: 0 }}
              animate={{
                pathLength: 1,
                opacity: look.opacity,
                stroke: look.stroke,
                strokeWidth: look.width,
              }}
              transition={
                introDone
                  ? settle
                  : {
                      pathLength: { delay: e.delay, duration: 0.8, ease: "easeOut" },
                      opacity: { delay: e.delay + 0.45, duration: 0.2 },
                      stroke: settle,
                      strokeWidth: settle,
                    }
              }
            />

            {animating && !reduce && (
              <circle r="2.8" fill={look.stroke}>
                <animateMotion
                  key={`${e.id}-${focus}`}
                  dur="1.7s"
                  repeatCount="indefinite"
                  path={e.d}
                />
              </circle>
            )}
          </g>
        );
      })}

      {NODES.map((n) => {
        const dimmed = lit && !lit.has(n.id);
        const focused = focus === n.id;
        const delay = 0.25 + n.col * 0.17;

        return (
          <motion.g
            key={n.id}
            style={{ transformBox: "fill-box", transformOrigin: "center", cursor: "pointer" }}
            initial={reduce ? false : { opacity: 0, scale: 0.6 }}
            animate={{ opacity: dimmed ? 0.16 : 1, scale: 1 }}
            transition={
              introDone
                ? settle
                : {
                    opacity: { delay, duration: 0.35 },
                    scale: { delay, type: "spring", stiffness: 260, damping: 20 },
                  }
            }
            onMouseEnter={() => setHoverId(n.id)}
            onMouseLeave={() => setHoverId(null)}
          >
            {n.hub && (
              <rect
                x={n.x - n.w / 2 - 6}
                y={n.y - n.h / 2 - 6}
                width={n.w + 12}
                height={n.h + 12}
                rx="10"
                fill={n.color.border}
                opacity="0.18"
              />
            )}
            <rect
              x={n.x - n.w / 2}
              y={n.y - n.h / 2}
              width={n.w}
              height={n.h}
              rx="6"
              fill={n.color.fill}
              stroke={focused ? "#FFFFFF" : n.color.border}
              strokeWidth={focused ? 2.5 : n.hub ? 2 : 1}
            />
            <text
              x={n.x}
              y={n.y}
              textAnchor="middle"
              dominantBaseline="central"
              fontFamily="'IBM Plex Mono', Consolas, monospace"
              fontSize={n.fs}
              fontWeight="500"
              fill={n.color.text}
            >
              {n.label}
            </text>
          </motion.g>
        );
      })}
    </svg>
  );
}

export const HERO_STATS = {
  files: NODES.length,
  dependencies: EDGES.length,
};

export const HERO_LEGEND = Object.values(GROUPS).map((g) => ({
  label: g.label,
  color: colorOf(
    Object.keys(GROUPS).find((k) => GROUPS[k] === g)
  ),
}));

export default HeroGraph;