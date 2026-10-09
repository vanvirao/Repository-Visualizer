import { useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import Landing from "./Landing";
import Loading from "./Loading";
import GraphView from "./Graphview.jsx";
import Inspector, { Overview } from "./Inspector";
import { buildGraph } from "./graphUtils";

const API_URL = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";

const plural = (n, one, many = `${one}s`) => (n === 1 ? one : many);

function normalizeAnalysis(data) {
  if (data?.graph?.nodes && data?.graph?.edges) {
    return data;
  }

  const files = data?.files || [];
  const dependencies = data?.dependencies || [];

  const nodes = files.map((file) => ({
    id: file.path,
    label: file.path,
    file: file.path,
    module: file.path.split(/[\\/]/).pop(),
    language: file.language,
    functions: file.functions || [],
    classes: file.classes || [],
    imports: file.imports || [],
  }));

  return {
    ...data,
    graph: {
      nodes,
      edges: dependencies.map((edge) => ({
        source: edge.source,
        target: edge.target,
      })),
    },
  };
}

function App() {
  const [analysis, setAnalysis] = useState(null);
  const [runId, setRunId] = useState(0);
  const [error, setError] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const abortRef = useRef(null);

  // --------------------------------------------------
  // Analyze GitHub repository
  // --------------------------------------------------

  const analyzeGitHubRepository = async (urlOverride) => {
    const url = (urlOverride ?? githubUrl).trim();

    if (!url) {
      setError("Please enter a GitHub repository URL.");
      return;
    }

    setGithubUrl(url);
    setError("");
    setIsAnalyzing(true);
    setAnalysis(null);
    setSelectedId(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const response = await fetch(`${API_URL}/analyze-github`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
        signal: controller.signal,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Repository analysis failed.");
      }

      setAnalysis(normalizeAnalysis(data));
      setRunId((id) => id + 1);
    } catch (err) {
      if (err.name === "AbortError") return; // cancelled by the user
      console.error(err);
      setError(err.message || "Could not analyze the GitHub repository.");
    } finally {
      // Ignore a request that was cancelled and replaced by a newer one.
      if (abortRef.current === controller) {
        abortRef.current = null;
        setIsAnalyzing(false);
      }
    }
  };

  const cancelAnalysis = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsAnalyzing(false);
  };

  const reset = () => {
    setAnalysis(null);
    setSelectedId(null);
    setError("");
  };

  // Esc clears the selection.
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") setSelectedId(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // --------------------------------------------------
  // Derived data
  // --------------------------------------------------

  const graph = useMemo(() => (analysis ? buildGraph(analysis) : null), [analysis]);

  const totalFunctions =
    analysis?.files?.reduce((t, f) => t + (f.functions?.length || 0), 0) ||
    analysis?.metrics?.functions ||
    graph?.nodes.reduce((t, n) => t + n.functions.length, 0) ||
    0;

  const totalClasses =
    analysis?.files?.reduce((t, f) => t + (f.classes?.length || 0), 0) ||
    analysis?.metrics?.classes ||
    graph?.nodes.reduce((t, n) => t + n.classes.length, 0) ||
    0;

  const selectedNode = graph && selectedId ? graph.byId.get(selectedId) : null;

  // --------------------------------------------------
  // Render
  // --------------------------------------------------

  if (isAnalyzing) {
    return (
      <div className="app">
        <Loading repo={githubUrl} onCancel={cancelAnalysis} />
      </div>
    );
  }

  if (!analysis || !graph) {
    return (
      <div className="app">
        <Landing
          githubUrl={githubUrl}
          setGithubUrl={setGithubUrl}
          onAnalyze={analyzeGitHubRepository}
          error={error}
        />
      </div>
    );
  }

  return (
    <div className="app">
      <div className="workspace">
        <header className="workspace-header">
          <div className="workspace-title">
            <div className="repo-name">{analysis.repository || "Repository"}</div>
            <div className="repo-path">
              {analysis.source || "Public GitHub repository"}
            </div>
            {analysis.metrics?.truncated && (
              <div className="truncated-note">
                Partial analysis: {analysis.metrics.files} of{" "}
                {analysis.metrics.source_files_found} source files
              </div>
            )}
          </div>

          <div className="stats">
            <span><strong>{graph.nodes.length}</strong> {plural(graph.nodes.length, "file")}</span>
            <span><strong>{totalFunctions}</strong> {plural(totalFunctions, "function")}</span>
            <span><strong>{totalClasses}</strong> {plural(totalClasses, "class", "classes")}</span>
            <span><strong>{graph.edges.length}</strong> {plural(graph.edges.length, "dependency", "dependencies")}</span>
            <button className="new-repo" onClick={reset}>
              New repository
            </button>
          </div>
        </header>

        <div className="workspace-body">
          <GraphView
            key={runId}
            graph={graph}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />

          {selectedNode ? (
            <Inspector
              node={selectedNode}
              graph={graph}
              onSelect={setSelectedId}
              onClose={() => setSelectedId(null)}
            />
          ) : (
            <Overview graph={graph} onSelect={setSelectedId} />
          )}
        </div>
      </div>
    </div>
  );
}

export default App;