// Sample data for the landing-page preview. Kept out of HeroGraph.jsx so
// that file only exports a component (required for fast refresh).

// A tiny made-up repo that previews what the real tool produces.
// It follows the same visual rules as the workspace: color by folder,
// bigger = imported by more files, faint edges into shared files,
// and hover (or the auto-tour) lights up one file's connections.

export const GROUPS = {
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
export const TOUR = ["app", "utils", "orders.service", "logger"];

export const ARROW = {
  dim: "#3F5368",
  out: "#7DB4F0",
  in: "#E3B65B",
};

// Build sizes and paths once.
const usedBy = {};
RAW_EDGES.forEach(([, target]) => {
  usedBy[target] = (usedBy[target] || 0) + 1;
});

export const NODES = RAW_NODES.map((n) => {
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

export const EDGES = RAW_EDGES.map(([s, t], i) => {
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

