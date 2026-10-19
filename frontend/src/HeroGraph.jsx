import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ARROW, EDGES, NODES, TOUR } from "./heroData";

// Miniature, animated dependency graph for the landing page. Follows the
// same visual rules as the workspace: color by folder, bigger = imported by
// more files, faint edges into shared files, and hover (or the auto-tour)
// lights up one file's connections.

const INTRO_MS = 3300;

function HeroGraph() {
  const reduce = useReducedMotion();

  const [hoverId, setHoverId] = useState(null);
  const [tourIndex, setTourIndex] = useState(0);
  const [introDone, setIntroDone] = useState(Boolean(reduce));

  useEffect(() => {
    if (reduce) return undefined;
    const timer = setTimeout(() => setIntroDone(true), INTRO_MS);
    return () => clearTimeout(timer);
  }, [reduce]);

  // After the intro, quietly tour a few files to show what highlighting does.
  // The index only changes inside the timer callback.
  useEffect(() => {
    if (reduce || !introDone) return undefined;

    const timer = setInterval(() => {
      setTourIndex((i) => (i + 1) % TOUR.length);
    }, 3200);

    return () => clearInterval(timer);
  }, [reduce, introDone]);

  const tourId = !reduce && introDone ? TOUR[tourIndex] : null;

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

export default HeroGraph;