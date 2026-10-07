import { useEffect, useMemo, useRef, useState } from "react";
import cytoscape from "cytoscape";
import dagre from "cytoscape-dagre";
import fcose from "cytoscape-fcose";
import { isSupport, legendGroups } from "./graphUtils";

cytoscape.use(dagre);
cytoscape.use(fcose);

const FONT = "IBM Plex Mono";

// Order matters: later rules win. Highlight rules (.faded / .lit) come last
// so hovering or selecting a file always overrides the resting look.
const stylesheet = [
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
      "underlay-opacity": 0.18,
      "underlay-padding": 7,
      "underlay-shape": "round-rectangle",
    },
  },
  {
    selector: "edge",
    style: {
      "curve-style": "bezier",
      width: 1.2,
      "line-color": "#3A4C60",
      "target-arrow-shape": "triangle",
      "target-arrow-color": "#3A4C60",
      "arrow-scale": 0.9,
      "overlay-opacity": 0,
    },
  },
  // Edges pointing into a hub are the hairball. Keep them as a faint hint.
  { selector: "edge.hubedge", style: { opacity: 0.2, width: 1 } },
  { selector: "node.support", style: { opacity: 0.55 } },
  { selector: "edge.support", style: { opacity: 0.4 } },
  { selector: "edge.hubedge.support", style: { opacity: 0.12 } },
  { selector: ".faded", style: { opacity: 0.06 } },
  { selector: ".lit", style: { opacity: 1 } },
  {
    selector: "edge.out",
    style: {
      "line-color": "#7DB4F0",
      "target-arrow-color": "#7DB4F0",
      width: 2,
    },
  },
  {
    selector: "edge.in",
    style: {
      "line-color": "#E3B65B",
      "target-arrow-color": "#E3B65B",
      width: 2,
    },
  },
  {
    selector: "node.selected",
    style: { "border-width": 3, "border-color": "#FFFFFF" },
  },
  { selector: ".hidden", style: { display: "none" } },
];

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

function GraphView({ graph, selectedId, onSelect }) {
  const containerRef = useRef(null);
  const cyRef = useRef(null);
  const onSelectRef = useRef(onSelect);

  const [layoutName, setLayoutName] = useState("lr");
  const [showSupport, setShowSupport] = useState(true);
  const [hoverId, setHoverId] = useState(null);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  const hasSupport = useMemo(
    () => graph.connected.some((n) => isSupport(n.role)),
    [graph]
  );

  const legend = useMemo(
    () =>
      legendGroups(
        graph.connected.filter((n) => showSupport || !isSupport(n.role))
      ),
    [graph, showSupport]
  );

  // ------------------------------------------------------------
  // Create the Cytoscape instance
  // ------------------------------------------------------------
  useEffect(() => {
    const nodeEls = graph.connected.map((n) => {
      const importers = n.usedBy.length;
      const fs = 11 + Math.min(importers, 6) * 0.6;
      const h1 = 26 + Math.min(importers, 8) * 2;

      const wrapped = wrapLabel(n.label);
      const longest = Math.max(...wrapped.split("\n").map((s) => s.length));

      return {
        group: "nodes",
        data: {
          id: n.id,
          label: n.label,
          fill: n.color.fill,
          border: n.color.border,
          text: n.color.text,
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
        },
        classes: isSupport(n.role) ? "support" : "",
      };
    });

    const supportIds = new Set(
      graph.connected.filter((n) => isSupport(n.role)).map((n) => n.id)
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
      style: stylesheet,
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
  // Layout + tests/examples filter
  // ------------------------------------------------------------
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    const variant = layoutName === "tb" ? "2" : "1";

    cy.batch(() => {
      cy.nodes().forEach((n) => {
        n.toggleClass("hidden", !showSupport && n.hasClass("support"));
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
  }, [graph, layoutName, showSupport]);

  // ------------------------------------------------------------
  // Highlight: hovering previews a file, selecting pins it.
  // ------------------------------------------------------------
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    cy.elements().removeClass("faded lit out in selected");

    if (selectedId) {
      const picked = cy.getElementById(selectedId);
      if (picked.nonempty()) picked.addClass("selected");
    }

    const focusId = hoverId || selectedId;
    if (!focusId) return;

    const node = cy.getElementById(focusId);
    if (node.empty() || node.hasClass("hidden")) return;

    const hood = node.closedNeighborhood().not(".hidden");
    cy.elements().not(hood).addClass("faded");
    hood.addClass("lit");
    node.outgoers("edge").addClass("out");
    node.incomers("edge").addClass("in");
  }, [graph, selectedId, hoverId, layoutName, showSupport]);

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
              className={`tool-button toggle ${showSupport ? "active" : ""}`}
              onClick={() => setShowSupport((v) => !v)}
              aria-pressed={showSupport}
              title="Tests and examples are shown dimmed. Turn off to focus on the core code."
            >
              Tests &amp; examples
            </button>
          )}
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

      <div className="graph-canvas">
        <div ref={containerRef} className="graph-container" />

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
      </div>
    </section>
  );
}

export default GraphView;