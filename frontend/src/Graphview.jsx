import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import cytoscape from "cytoscape";
import dagre from "cytoscape-dagre";
import fcose from "cytoscape-fcose";
import svg from "cytoscape-svg";
import { filterOptions, legendGroups } from "./graphUtils";

cytoscape.use(dagre);
cytoscape.use(fcose);
cytoscape.use(svg);

const FONT = "IBM Plex Mono";

// Colors that live inside the canvas, per theme. (Everything outside the
// canvas is styled with CSS variables in App.css.)
const THEME = {
  dark: {
    canvas: "#0F1822",
    edge: "#3A4C60",
    out: "#7DB4F0",
    in: "#E3B65B",
    selected: "#FFFFFF",
    faded: 0.06,
    halo: 0.18,
    supportNode: 0.55,
    supportEdge: 0.4,
    hubEdge: 0.2,
    hubSupportEdge: 0.12,
  },
  light: {
    canvas: "#EEF1F5",
    edge: "#7F90A6",
    out: "#1B6FD0",
    in: "#B7791F",
    selected: "#16202B",
    faded: 0.12,
    halo: 0.28,
    // Light backgrounds need less dimming, or pale nodes wash out.
    supportNode: 0.85,
    supportEdge: 0.6,
    hubEdge: 0.34,
    hubSupportEdge: 0.24,
  },
};

const FOCUS_CLASSES = "faded lit out in selected";

// Order matters: later rules win. Highlight rules (.faded / .lit) come last
// so hovering or selecting a file always overrides the resting look.
function makeStylesheet(theme) {
  const t = THEME[theme];

  return [
    {
      selector: "node",
      style: {
        shape: "round-rectangle",
        width: "data(w)",
        height: "data(h)",
        "background-color": "data(fill)",
        "border-width": 1,
        "border-color": "data(border)",
        label: "data(label)",
        color: "data(text)",
        "font-family": FONT,
        "font-size": "data(fs)",
        "font-weight": 500,
        "text-valign": "center",
        "text-halign": "center",
        "min-zoomed-font-size": 6,
        "text-wrap": "wrap",
        "line-height": 1.15,
        "overlay-opacity": 0,
      },
    },
    {
      // Files that many others depend on get a soft halo.
      selector: "node[?hub]",
      style: {
        "border-width": 2,
        "underlay-color": "data(border)",
        "underlay-opacity": t.halo,
        "underlay-padding": 7,
        "underlay-shape": "round-rectangle",
      },
    },
    {
      selector: "edge",
      style: {
        "curve-style": "bezier",
        width: 1.2,
        "line-color": t.edge,
        "target-arrow-shape": "triangle",
        "target-arrow-color": t.edge,
        "arrow-scale": 0.9,
        "overlay-opacity": 0,
      },
    },
    // Edges pointing into a hub are the hairball. Keep them as a faint hint.
    { selector: "edge.hubedge", style: { opacity: t.hubEdge, width: 1 } },
    { selector: "node.support", style: { opacity: t.supportNode } },
    { selector: "edge.support", style: { opacity: t.supportEdge } },
    { selector: "edge.hubedge.support", style: { opacity: t.hubSupportEdge } },
    { selector: ".faded", style: { opacity: t.faded } },
    { selector: ".lit", style: { opacity: 1 } },
    {
      selector: "edge.out",
      style: { "line-color": t.out, "target-arrow-color": t.out, width: 2 },
    },
    {
      selector: "edge.in",
      style: { "line-color": t.in, "target-arrow-color": t.in, width: 2 },
    },
    {
      selector: "node.selected",
      style: { "border-width": 3, "border-color": t.selected },
    },
    { selector: ".hidden", style: { display: "none" } },
  ];
}

// Splits a long filename onto two lines at a natural break (camelCase,
// dot, dash, slash) near the middle. Used by the top-down layout, where
// narrower nodes mean shorter rows.
function wrapLabel(label) {
  if (label.length <= 14) return label;

  const mid = label.length / 2;
  let best = -1;

  for (let i = 3; i < label.length - 3; i += 1) {
    const prev = label[i - 1];
    const here = label[i];
    const isBreak =
      /[./\-_]/.test(prev) || (/[a-z0-9]/.test(prev) && /[A-Z]/.test(here));

    if (isBreak && (best === -1 || Math.abs(i - mid) < Math.abs(best - mid))) {
      best = i;
    }
  }

  // No natural break (e.g. "Screensaver.tsx"): keep it on one line.
  if (best === -1) return label;
  return `${label.slice(0, best)}\n${label.slice(best)}`;
}

function layoutOptions(name) {
  if (name === "force") {
    return {
      name: "fcose",
      quality: "proof",
      randomize: true,
      animate: false,
      fit: true,
      padding: 48,
      packComponents: true,
      nodeRepulsion: () => 16000,
      nodeSeparation: 110,
      // Edges into hubs are stretched and loosened so the shared files
      // spread out around the graph instead of piling up in the middle.
      idealEdgeLength: (edge) => (edge.hasClass("hubedge") ? 230 : 120),
      edgeElasticity: (edge) => (edge.hasClass("hubedge") ? 0.12 : 0.45),
      gravity: 0.2,
      numIter: 2500,
    };
  }

  // Importers first, the files they rely on after them.
  // "lr" reads left to right, "tb" reads top to bottom.
  const topDown = name === "tb";

  return {
    name: "dagre",
    rankDir: topDown ? "TB" : "LR",
    nodeSep: topDown ? 16 : 14,
    rankSep: topDown ? 80 : 90,
    edgeSep: 10,
    animate: false,
    fit: true,
    padding: 48,
  };
}

const LAYOUT_FILE_LABEL = { tb: "top-down", lr: "left-right", force: "force" };

const slug = (text) =>
  String(text || "graph")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "graph";

function saveAs(href, filename) {
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}

function GraphView({
  graph,
  repoName,
  theme,
  onToggleTheme,
  selectedId,
  onSelect,
  hiddenGroups,
  hiddenLangs,
  onHiddenGroupsChange,
  onHiddenLangsChange,
}) {
  const containerRef = useRef(null);
  const cyRef = useRef(null);
  const onSelectRef = useRef(onSelect);
  const themeRef = useRef(theme);

  const [layoutName, setLayoutName] = useState("lr");
  const [hoverId, setHoverId] = useState(null);
  const [openMenu, setOpenMenu] = useState(null); // "filter" | "download" | null

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  const options = useMemo(() => filterOptions(graph, theme), [graph, theme]);
  const hasSupport = options.groups.some(
    (g) => g.name === "tests" || g.name === "examples"
  );
  const supportShown = !hiddenGroups.has("tests") && !hiddenGroups.has("examples");
  const activeFilters = hiddenGroups.size + hiddenLangs.size;

  const isShown = useCallback(
    (n) => !hiddenGroups.has(n.group) && !hiddenLangs.has(n.language),
    [hiddenGroups, hiddenLangs]
  );

  const visibleCount = useMemo(
    () => graph.connected.filter(isShown).length,
    [graph, isShown]
  );

  const legend = useMemo(
    () => legendGroups(graph.connected.filter(isShown), theme),
    [graph, isShown, theme]
  );

  // Nothing to draw: either the repo has no connected files at all, or the
  // filters currently hide every one of them.
  const noFiles = graph.nodes.length === 0;
  const noConnections = graph.connected.length === 0;
  const allHidden = !noConnections && visibleCount === 0;

  // ------------------------------------------------------------
  // Create the Cytoscape instance
  // ------------------------------------------------------------
  useEffect(() => {
    const startTheme = themeRef.current;

    const nodeEls = graph.connected.map((n) => {
      const importers = n.usedBy.length;
      const fs = 11 + Math.min(importers, 6) * 0.6;
      const h1 = 26 + Math.min(importers, 8) * 2;
      const color = n.colors[startTheme];

      const wrapped = wrapLabel(n.label);
      const longest = Math.max(...wrapped.split("\n").map((s) => s.length));

      return {
        group: "nodes",
        data: {
          id: n.id,
          label: n.label,
          fill: color.fill,
          border: color.border,
          text: color.text,
          fs,
          w: Math.round(n.label.length * fs * 0.62 + 26),
          h: h1,
          // Variants swapped in by the layout effect (top-down uses two lines).
          label1: n.label,
          w1: Math.round(n.label.length * fs * 0.62 + 26),
          h1,
          label2: wrapped,
          w2: Math.round(longest * fs * 0.62 + 22),
          h2: wrapped.includes("\n") ? h1 + Math.round(fs * 1.25) : h1,
          hub: n.isHub,
          group: n.group,
          lang: n.language,
        },
        classes: n.group === "tests" || n.group === "examples" ? "support" : "",
      };
    });

    const supportIds = new Set(
      graph.connected
        .filter((n) => n.group === "tests" || n.group === "examples")
        .map((n) => n.id)
    );
    const hubIds = new Set(
      graph.connected.filter((n) => n.isHub).map((n) => n.id)
    );

    const edgeEls = graph.edges.map((e, i) => ({
      group: "edges",
      data: { id: `e${i}`, source: e.source, target: e.target },
      classes: [
        supportIds.has(e.source) ? "support" : "",
        hubIds.has(e.target) ? "hubedge" : "",
      ]
        .join(" ")
        .trim(),
    }));

    const cy = cytoscape({
      container: containerRef.current,
      elements: [...nodeEls, ...edgeEls],
      style: makeStylesheet(startTheme),
      minZoom: 0.05,
      maxZoom: 2.5,
      boxSelectionEnabled: false,
    });

    cy.on("tap", "node", (event) => onSelectRef.current(event.target.id()));
    cy.on("tap", (event) => {
      if (event.target === cy) onSelectRef.current(null);
    });
    cy.on("mouseover", "node", (event) => {
      containerRef.current.style.cursor = "pointer";
      setHoverId(event.target.id());
    });
    cy.on("mouseout", "node", () => {
      containerRef.current.style.cursor = "default";
      setHoverId(null);
    });

    cyRef.current = cy;

    // Canvas text is drawn once, so redraw after the web font arrives.
    document.fonts?.ready.then(() => {
      if (cyRef.current === cy) cy.forceRender();
    });

    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [graph]);

  // ------------------------------------------------------------
  // Theme: swap the canvas colors without touching the layout
  // ------------------------------------------------------------
  useEffect(() => {
    themeRef.current = theme;

    const cy = cyRef.current;
    if (!cy) return;

    cy.batch(() => {
      cy.nodes().forEach((n) => {
        const color = graph.byId.get(n.id())?.colors[theme];
        if (color) n.data({ fill: color.fill, border: color.border, text: color.text });
      });
    });
    cy.style(makeStylesheet(theme));
    cy.forceRender();
  }, [theme, graph]);

  // ------------------------------------------------------------
  // Layout + folder / language filters
  // ------------------------------------------------------------
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    const variant = layoutName === "tb" ? "2" : "1";

    cy.batch(() => {
      cy.nodes().forEach((n) => {
        n.toggleClass(
          "hidden",
          hiddenGroups.has(n.data("group")) || hiddenLangs.has(n.data("lang"))
        );
        n.data({
          label: n.data(`label${variant}`),
          w: n.data(`w${variant}`),
          h: n.data(`h${variant}`),
        });
      });
    });

    const nodes = cy.nodes().not(".hidden");
    if (nodes.empty()) return;

    const eles = nodes.union(nodes.edgesWith(nodes));
    eles.layout(layoutOptions(layoutName)).run();

    // A top-down graph with one very wide row would shrink until labels
    // vanish. Start at a readable zoom on the entry points instead; the
    // Fit button still shows the whole thing.
    if (layoutName === "tb" && cy.zoom() < 0.7) {
      const box = nodes.boundingBox();
      cy.zoom(0.7);
      cy.pan({
        x: cy.width() / 2 - ((box.x1 + box.x2) / 2) * 0.7,
        y: 56 - box.y1 * 0.7,
      });
    }
  }, [graph, layoutName, hiddenGroups, hiddenLangs]);

  // ------------------------------------------------------------
  // Highlight. Hovering previews a file, selecting pins it.
  // ------------------------------------------------------------
  const paint = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;

    cy.elements().removeClass(FOCUS_CLASSES);

    if (selectedId) {
      const picked = cy.getElementById(selectedId);
      if (picked.nonempty()) picked.addClass("selected");
    }

    const focusId = hoverId || selectedId;
    const focused = focusId ? cy.getElementById(focusId) : null;

    if (focused && focused.nonempty() && !focused.hasClass("hidden")) {
      const hood = focused.closedNeighborhood().not(".hidden");
      cy.elements().not(hood).addClass("faded");
      hood.addClass("lit");
      focused.outgoers("edge").addClass("out");
      focused.incomers("edge").addClass("in");
    }
  }, [selectedId, hoverId]);

  useEffect(() => {
    paint();
  }, [paint, graph, layoutName, hiddenGroups, hiddenLangs, theme]);

  // ------------------------------------------------------------
  // Bring a newly selected file into view (e.g. picked in the sidebar).
  // Separate from highlighting so hovering never moves the camera.
  // ------------------------------------------------------------
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !selectedId) return;

    const node = cy.getElementById(selectedId);
    if (node.empty() || node.hasClass("hidden")) return;

    const p = node.renderedPosition();
    const margin = 60;
    if (
      p.x < margin ||
      p.y < margin ||
      p.x > cy.width() - margin ||
      p.y > cy.height() - margin
    ) {
      cy.animate({ center: { eles: node } }, { duration: 250 });
    }
  }, [graph, selectedId]);

  // ------------------------------------------------------------
  // Menus: close on outside click or Escape.
  // ------------------------------------------------------------
  useEffect(() => {
    const onDown = (event) => {
      if (!event.target.closest(".menu-panel, .menu-trigger")) setOpenMenu(null);
    };
    const onKey = (event) => {
      if (event.key === "Escape") setOpenMenu(null);
    };

    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  // ------------------------------------------------------------
  // Toolbar actions
  // ------------------------------------------------------------
  const zoomBy = (factor) => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.zoom({
      level: cy.zoom() * factor,
      renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 },
    });
  };

  const fit = () => {
    const cy = cyRef.current;
    if (!cy) return;
    const visible = cy.nodes().not(".hidden");
    if (visible.nonempty()) cy.fit(visible, 48);
  };

  const toggleSupport = () => {
    const next = new Set(hiddenGroups);
    if (supportShown) {
      next.add("tests");
      next.add("examples");
    } else {
      next.delete("tests");
      next.delete("examples");
    }
    onHiddenGroupsChange(next);
  };

  const toggleIn = (set, value, onChange) => {
    const next = new Set(set);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    onChange(next);
  };

  const clearFilters = () => {
    onHiddenGroupsChange(new Set());
    onHiddenLangsChange(new Set());
  };

  // ------------------------------------------------------------
  // Download
  // ------------------------------------------------------------
  const download = (format) => {
    const cy = cyRef.current;
    setOpenMenu(null);

    const base = `${slug(repoName)}-${LAYOUT_FILE_LABEL[layoutName]}`;

    if (format === "json") {
      const data = {
        repository: repoName,
        nodes: graph.nodes.map((n) => ({
          id: n.id,
          path: n.path,
          folder: n.group,
          language: n.language,
          functions: n.functions,
          classes: n.classes,
          imports: n.dependsOn,
          importedBy: n.usedBy,
        })),
        edges: graph.edges,
      };
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
      );
      saveAs(url, `${slug(repoName)}-graph.json`);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return;
    }

    if (!cy || cy.nodes().not(".hidden").empty()) return;

    // Export the clean graph, not whatever is hovered or selected.
    cy.elements().removeClass(FOCUS_CLASSES);
    const bg = THEME[theme].canvas;

    try {
      if (format === "svg") {
        const markup = cy.svg({ full: true, scale: 1, bg });
        const url = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml" }));
        saveAs(url, `${base}.svg`);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      } else {
        saveAs(
          cy.png({ full: true, scale: 2, bg, maxWidth: 8000, maxHeight: 8000 }),
          `${base}.png`
        );
      }
    } finally {
      paint();
    }
  };

  return (
    <section className="graph-section">
      <div className="graph-toolbar">
        <div className="toolbar-group">
          <button
            className={`tool-button ${layoutName === "tb" ? "active" : ""}`}
            onClick={() => setLayoutName("tb")}
            title="Hierarchical, top to bottom"
          >
            Hierarchical ↓
          </button>
          <button
            className={`tool-button ${layoutName === "lr" ? "active" : ""}`}
            onClick={() => setLayoutName("lr")}
            title="Hierarchical, left to right"
          >
            Hierarchical →
          </button>
          <button
            className={`tool-button ${layoutName === "force" ? "active" : ""}`}
            onClick={() => setLayoutName("force")}
          >
            Force-directed
          </button>
        </div>

        <div className="toolbar-group">
          {hasSupport && (
            <button
              className={`tool-button toggle ${supportShown ? "active" : ""}`}
              onClick={toggleSupport}
              aria-pressed={supportShown}
              title="Tests and examples are shown dimmed. Turn off to focus on the core code."
            >
              Tests &amp; examples
            </button>
          )}
          <button
            className={`tool-button menu-trigger ${activeFilters ? "active" : ""}`}
            onClick={() => setOpenMenu(openMenu === "filter" ? null : "filter")}
            aria-expanded={openMenu === "filter"}
          >
            Filter{activeFilters ? ` · ${activeFilters}` : ""} ▾
          </button>
          <button
            className="tool-button menu-trigger"
            onClick={() => setOpenMenu(openMenu === "download" ? null : "download")}
            aria-expanded={openMenu === "download"}
          >
            Download ▾
          </button>
          <button
            className="tool-button icon-button"
            onClick={onToggleTheme}
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? <SunIcon /> : <MoonIcon />}
          </button>
          <button className="tool-button" onClick={() => zoomBy(1.25)}>
            +
          </button>
          <button className="tool-button" onClick={() => zoomBy(0.8)}>
            −
          </button>
          <button className="tool-button" onClick={fit}>
            Fit
          </button>
        </div>
      </div>

      {openMenu === "filter" && (
        <div className="menu-panel" role="dialog" aria-label="Filter files">
          <div className="menu-title">Folders</div>
          {options.groups.map((group) => (
            <label key={group.name} className="menu-check">
              <input
                type="checkbox"
                checked={!hiddenGroups.has(group.name)}
                onChange={() => toggleIn(hiddenGroups, group.name, onHiddenGroupsChange)}
              />
              <i style={{ background: group.color.fill, borderColor: group.color.border }} />
              <span className="menu-check-name">{group.name}</span>
              <span className="menu-check-count">{group.count}</span>
            </label>
          ))}

          {options.languages.length > 1 && (
            <>
              <div className="menu-title">Language</div>
              {options.languages.map((language) => (
                <label key={language.name} className="menu-check">
                  <input
                    type="checkbox"
                    checked={!hiddenLangs.has(language.name)}
                    onChange={() => toggleIn(hiddenLangs, language.name, onHiddenLangsChange)}
                  />
                  <span className="menu-check-name">{language.name}</span>
                  <span className="menu-check-count">{language.count}</span>
                </label>
              ))}
            </>
          )}

          <button className="menu-reset" onClick={clearFilters} disabled={!activeFilters}>
            Show everything
          </button>
        </div>
      )}

      {openMenu === "download" && (
        <div className="menu-panel menu-panel-narrow" role="menu" aria-label="Download">
          <div className="menu-title">Current view: {LAYOUT_FILE_LABEL[layoutName]}</div>
          <button className="menu-item" role="menuitem" onClick={() => download("png")}>
            <strong>PNG image</strong>
            <span>Whole graph, high resolution</span>
          </button>
          <button className="menu-item" role="menuitem" onClick={() => download("svg")}>
            <strong>SVG vector</strong>
            <span>Sharp at any size, editable</span>
          </button>
          <button className="menu-item" role="menuitem" onClick={() => download("json")}>
            <strong>Graph data (JSON)</strong>
            <span>Every file and dependency</span>
          </button>
        </div>
      )}

      <div className="graph-canvas">
        <div ref={containerRef} className="graph-container" />

        {!noConnections && (
          <div className="graph-legend">
            <div className="legend-roles">
              {legend.slice(0, 10).map((group) => (
                <span key={group.name} className="legend-item">
                  <i
                    style={{
                      background: group.color.fill,
                      borderColor: group.color.border,
                    }}
                  />
                  {group.name}
                </span>
              ))}
            </div>
            <div className="legend-note">
              Colored by folder · arrows point to the imported file · larger =
              imported by more files · hover a file to see its connections
            </div>
          </div>
        )}

        {noConnections && (
          <div className="graph-empty-state" role="status">
            <div className="empty-mark" aria-hidden="true">
              <i /> <i /> <i />
            </div>
            {noFiles ? (
              <>
                <h2>No source files found</h2>
                <p>
                  This repository doesn’t contain files in a language we read
                  yet (Python, JavaScript, TypeScript, Java and C++).
                </p>
              </>
            ) : (
              <>
                <h2>No connected files to show</h2>
                <p>
                  We analyzed {graph.nodes.length}{" "}
                  {graph.nodes.length === 1 ? "file" : "files"}, but none of
                  them import each other, so there is no graph to draw. This is
                  common for single-file projects, collections of scripts, or
                  imports we can’t resolve, like path aliases.
                </p>
                <p className="empty-hint">
                  The files are listed in the sidebar.
                </p>
              </>
            )}
          </div>
        )}

        {allHidden && (
          <div className="graph-empty-state" role="status">
            <h2>Every file is hidden</h2>
            <p>The current filters hide all connected files.</p>
            <button className="empty-action" onClick={clearFilters}>
              Show everything
            </button>
          </div>
        )}

      </div>
    </section>
  );
}

export default GraphView;