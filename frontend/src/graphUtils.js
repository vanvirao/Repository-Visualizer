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
// Colors (one palette per theme)
// ------------------------------------------------------------

const FOLDER_HUES = [212, 160, 38, 280, 340, 190, 95, 20];

const PALETTES = {
  dark: {
    folder: (i) => ({
      fill: `hsl(${FOLDER_HUES[i]}, 42%, 30%)`,
      border: `hsl(${FOLDER_HUES[i]}, 62%, 62%)`,
      text: "#F4F8FC",
    }),
    fixed: {
      tests: { fill: "#2B3949", border: "#5A6E84", text: "#C3CEDA" },
      examples: { fill: "#1D5C50", border: "#3FA58A", text: "#E4F5EF" },
      other: { fill: "#34404E", border: "#7C8DA0", text: "#E1E8EF" },
    },
  },
  light: {
    folder: (i) => ({
      fill: `hsl(${FOLDER_HUES[i]}, 52%, 80%)`,
      border: `hsl(${FOLDER_HUES[i]}, 46%, 36%)`,
      text: `hsl(${FOLDER_HUES[i]}, 62%, 11%)`,
    }),
    fixed: {
      tests: { fill: "#D2DAE4", border: "#6D7F95", text: "#27374A" },
      examples: { fill: "#BFE3D5", border: "#2D8A70", text: "#0C3B2F" },
      other: { fill: "#D3DBE5", border: "#667790", text: "#1E2B3A" },
    },
  },
};

const THEMES = Object.keys(PALETTES);

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
      language: n.language || "",
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

  nodes.forEach((n) => {
    n.colors = {};
  });

  THEMES.forEach((theme) => {
    const palette = PALETTES[theme];
    const colorByGroup = new Map();

    rankedFolders.forEach(([name], i) => {
      colorByGroup.set(
        name,
        i < FOLDER_HUES.length ? palette.folder(i) : palette.fixed.other
      );
    });
    colorByGroup.set("tests", palette.fixed.tests);
    colorByGroup.set("examples", palette.fixed.examples);

    nodes.forEach((n) => {
      n.colors[theme] = colorByGroup.get(n.group) || palette.fixed.other;
    });
  });

  return { nodes, edges, byId, connected, isolated, hubThreshold };
}

const groupRank = (name) => (name === "examples" ? 1 : name === "tests" ? 2 : 0);

// Legend / filter entries: one per folder group, biggest folders first.
export function legendGroups(nodes, theme = "dark") {
  const counts = new Map();
  nodes.forEach((n) => {
    const entry = counts.get(n.group) || {
      name: n.group,
      color: n.colors[theme],
      count: 0,
    };
    entry.count += 1;
    counts.set(n.group, entry);
  });

  return [...counts.values()].sort(
    (a, b) =>
      groupRank(a.name) - groupRank(b.name) ||
      b.count - a.count ||
      a.name.localeCompare(b.name)
  );
}

// Everything the filter menu needs: folder groups and languages, counted
// over every file (connected or not).
export function filterOptions(graph, theme = "dark") {
  const languages = new Map();
  graph.nodes.forEach((n) => {
    if (n.language) languages.set(n.language, (languages.get(n.language) || 0) + 1);
  });

  return {
    groups: legendGroups(graph.nodes, theme),
    languages: [...languages.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
  };
}