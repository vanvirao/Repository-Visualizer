import { useMemo } from "react";
function FileRow({ node, onSelect, count, theme }) {
  const color = node.colors[theme];

  return (
    <button className="file-row" onClick={() => onSelect(node.id)}>
      <i
        className="role-dot"
        style={{
          background: color.fill,
          borderColor: color.border,
        }}
      />
      <span className="file-row-text">
        <span className="file-row-name">{node.name}</span>
        {node.dir && <span className="file-row-dir">{node.dir}</span>}
      </span>
      {count !== undefined && <span className="file-row-count">{count}</span>}
    </button>
  );
}

function FileList({ title, ids, graph, onSelect, emptyText, theme }) {
  const nodes = ids.map((id) => graph.byId.get(id)).filter(Boolean);

  return (
    <div className="side-section">
      <h3>
        {title} <span className="side-count">{nodes.length}</span>
      </h3>
      {nodes.length === 0 ? (
        <p className="side-empty">{emptyText}</p>
      ) : (
        nodes.map((n) => (
          <FileRow key={n.id} node={n} onSelect={onSelect} theme={theme} />
        ))
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Shown when nothing is selected
// ------------------------------------------------------------
export function Overview({ graph, onSelect, theme, isShown }) {
  const mostImported = useMemo(
    () =>
      [...graph.nodes]
        .filter(
          (n) =>
            isShown(n) &&
            n.usedBy.length > 0 &&
            n.role !== "test" &&
            n.role !== "examples"
        )
        .sort((a, b) => b.usedBy.length - a.usedBy.length)
        .slice(0, 8),
    [graph, isShown]
  );

  const isolated = useMemo(
    () => graph.isolated.filter(isShown),
    [graph, isShown]
  );

  return (
    <aside className="sidebar">
      <div className="side-section">
        <h3>Most imported files</h3>
        <p className="side-hint">
          These are the files the rest of the codebase leans on. Start here.
        </p>
        {mostImported.length === 0 ? (
          <p className="side-empty">No imports were found between files.</p>
        ) : (
          mostImported.map((n) => (
            <FileRow
              key={n.id}
              node={n}
              theme={theme}
              count={n.usedBy.length}
              onSelect={onSelect}
            />
          ))
        )}
      </div>

      {isolated.length > 0 && (
        <details className="side-section isolated" open={graph.connected.length === 0}>
          <summary>
            Not connected <span className="side-count">{isolated.length}</span>
          </summary>
          <p className="side-hint">
            No imports to or from other files. Often entry points, scripts, or
            files loaded dynamically.
          </p>
          {isolated.map((n) => (
            <FileRow key={n.id} node={n} theme={theme} onSelect={onSelect} />
          ))}
        </details>
      )}
    </aside>
  );
}

// ------------------------------------------------------------
// Shown when a file is selected
// ------------------------------------------------------------
function Inspector({ node, graph, onSelect, onClose, theme }) {
  const color = node.colors[theme];

  return (
    <aside className="sidebar">
      <div className="side-section inspector-head">
        <button className="back-button" onClick={onClose}>
          ← Overview
        </button>

        <div className="inspector-title">{node.name}</div>
        <div className="inspector-path">{node.path}</div>

        <span
          className="role-chip"
          style={{
            borderColor: color.border,
            color: color.text,
            background: color.fill,
          }}
        >
          {node.group}
        </span>

        <div className="inspector-stats">
          <div>
            <strong>{node.dependsOn.length}</strong>
            <span>imports</span>
          </div>
          <div>
            <strong>{node.usedBy.length}</strong>
            <span>imported by</span>
          </div>
          <div>
            <strong>{node.functions.length}</strong>
            <span>functions</span>
          </div>
          <div>
            <strong>{node.classes.length}</strong>
            <span>classes</span>
          </div>
        </div>
      </div>

      <FileList
        title="Imports"
        ids={node.dependsOn}
        graph={graph}
        theme={theme}
        onSelect={onSelect}
        emptyText="This file doesn't import any other file in the repo."
      />

      <FileList
        title="Imported by"
        ids={node.usedBy}
        graph={graph}
        theme={theme}
        onSelect={onSelect}
        emptyText="No other file in the repo imports this one."
      />

      {node.functions.length > 0 && (
        <div className="side-section">
          <h3>
            Functions <span className="side-count">{node.functions.length}</span>
          </h3>
          <div className="code-list">
            {node.functions.map((fn, i) => (
              <div className="code-item" key={`${fn}-${i}`}>
                {fn}()
              </div>
            ))}
          </div>
        </div>
      )}

      {node.classes.length > 0 && (
        <div className="side-section">
          <h3>
            Classes <span className="side-count">{node.classes.length}</span>
          </h3>
          <div className="code-list">
            {node.classes.map((cls, i) => (
              <div className="code-item" key={`${cls}-${i}`}>
                {cls}
              </div>
            ))}
          </div>
        </div>
      )}
    </aside>
  );
}

export default Inspector;