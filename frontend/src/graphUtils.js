export const toPosix = (p) => String(p).replace(/\\/g, "/");

// Tests and examples are real files but rarely the architecture, so the
// graph dims them. Everything else is "source".
export function classify(path) {
  const p = toPosix(path).toLowerCase();

  if (
    /(^|\/)(tests?|__tests__|specs?|e2e)\//.test(p) ||
    /\.(test|spec)\.[a-z]+$/.test(p)
  ) {
    return "test";
  }

  if (/(^|\/)(examples?|samples?|demos?)\//.test(p)) {
    return "examples";
  }

  return "source";
}

export const isSupport = (role) => role === "test" || role === "examples";

// ------------------------------------------------------------
// Colors
// ------------------------------------------------------------

const FOLDER_HUES = [212, 160, 38, 280, 340, 190, 95, 20];

const folderColor = (index) => ({
  fill: `hsl(${FOLDER_HUES[index]}, 42%, 30%)`,
  border: `hsl(${FOLDER_HUES[index]}, 62%, 62%)`,
  text: "#F4F8FC",
});

const FIXED_COLORS = {
  tests: { fill: "#2B3949", border: "#5A6E84", text: "#C3CEDA" },
  examples: { fill: "#1D5C50", border: "#3FA58A", text: "#E4F5EF" },
  other: { fill: "#34404E", border: "#7C8DA0", text: "#E1E8EF" },
};

// Which folder a file belongs to: the first directory, skipping a leading
// "src/". Files at the top level share the group "root" (or "src").
function folderGroup(path) {
  const dirs = path.split("/").slice(0, -1);

  if (dirs.length === 0) return "root";
  if (dirs[0] === "src") return dirs.length > 1 ? dirs[1] : "src";
  return dirs[0];
}

// ------------------------------------------------------------
// Build everything the UI needs from the backend response.
// An edge means: source imports target.
// ------------------------------------------------------------

export function buildGraph(analysis) {
  const rawNodes = analysis?.graph?.nodes || [];
  const rawEdges = analysis?.graph?.edges || [];

  const ids = new Set(rawNodes.map((n) => n.id));
  const dependsOn = new Map();
  const usedBy = new Map();
  ids.forEach((id) => {
    dependsOn.set(id, []);
    usedBy.set(id, []);
  });

  const edges = [];
  const seen = new Set();
  rawEdges.forEach((e) => {
    if (!ids.has(e.source) || !ids.has(e.target) || e.source === e.target) {
      return;
    }
    const key = `${e.source}\u0000${e.target}`;
    if (seen.has(key)) return;
    seen.add(key);

    edges.push({ source: e.source, target: e.target });
    dependsOn.get(e.source).push(e.target);
    usedBy.get(e.target).push(e.source);
  });

  const nameCount = {};
  rawNodes.forEach((n) => {
    const name = toPosix(n.file || n.id).split("/").pop();
    nameCount[name] = (nameCount[name] || 0) + 1;
  });

  const nodes = rawNodes.map((n) => {
    const path = toPosix(n.file || n.id);
    const parts = path.split("/");
    const name = parts.pop();
    const dir = parts.join("/");
    const role = classify(path);

    // Many repos have dozens of index.js files. Prefix the parent folder
    // only when the bare filename would be ambiguous.
    let label =
      nameCount[name] > 1 && parts.length > 0
        ? `${parts[parts.length - 1]}/${name}`
        : name;

    if (label.length > 28) {
      label = `${label.slice(0, 13)}…${label.slice(-13)}`;
    }

    return {
      id: n.id,
      path,
      name,
      dir,
      label,
      role,
      group:
        role === "test"
          ? "tests"
          : role === "examples"
          ? "examples"
          : folderGroup(path),
      functions: n.functions || [],
      classes: n.classes || [],
      dependsOn: dependsOn.get(n.id),
      usedBy: usedBy.get(n.id),
    };
  });

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const connected = nodes.filter(
    (n) => n.dependsOn.length + n.usedBy.length > 0
  );
  const isolated = nodes.filter(
    (n) => n.dependsOn.length + n.usedBy.length === 0
  );

  // A "hub" is a file lots of others lean on (a theme, a util, a store).
  // Their incoming edges are what turn big graphs into hairballs.
  const hubThreshold = Math.max(4, Math.ceil(connected.length * 0.15));
  nodes.forEach((n) => {
    n.isHub = n.usedBy.length >= hubThreshold;
  });

  // Give the biggest folders the distinct colors; the rest share a gray.
  const folderCounts = new Map();
  connected.forEach((n) => {
    if (n.group !== "tests" && n.group !== "examples") {
      folderCounts.set(n.group, (folderCounts.get(n.group) || 0) + 1);
    }
  });

  const rankedFolders = [...folderCounts.entries()].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
  );

  const colorByGroup = new Map();
  rankedFolders.forEach(([name], i) => {
    colorByGroup.set(
      name,
      i < FOLDER_HUES.length ? folderColor(i) : FIXED_COLORS.other
    );
  });
  colorByGroup.set("tests", FIXED_COLORS.tests);
  colorByGroup.set("examples", FIXED_COLORS.examples);

  nodes.forEach((n) => {
    n.color = colorByGroup.get(n.group) || FIXED_COLORS.other;
  });

  return { nodes, edges, byId, connected, isolated, hubThreshold };
}

// Legend entries for whichever nodes are currently visible.
export function legendGroups(nodes) {
  const counts = new Map();
  nodes.forEach((n) => {
    const entry = counts.get(n.group) || { name: n.group, color: n.color, count: 0 };
    entry.count += 1;
    counts.set(n.group, entry);
  });

  const rank = (g) => (g.name === "examples" ? 1 : g.name === "tests" ? 2 : 0);

  return [...counts.values()].sort(
    (a, b) => rank(a) - rank(b) || b.count - a.count || a.name.localeCompare(b.name)
  );
}