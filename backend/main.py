from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from analyzer import (
    MAX_SOURCE_FILES,
    analyze_repository,
    count_source_files,
)
from analyzer.dependency_builder import build_dependencies

import os
import re
import shutil
import subprocess
import tempfile
import threading
import time


# --------------------------------------------------
# Settings (override with environment variables)
# --------------------------------------------------

# Browser origins allowed to call this API, comma separated.
# Locally the defaults are enough. In production add your frontend URL:
#   ALLOWED_ORIGINS=https://your-site.vercel.app
DEFAULT_ORIGINS = "http://localhost:5173,http://localhost:5174"
ALLOWED_ORIGINS = [
    origin.strip().rstrip("/")
    for origin in os.getenv("ALLOWED_ORIGINS", DEFAULT_ORIGINS).split(",")
    if origin.strip()
]

# There is deliberately no limit on repository size. Very large
# repositories are bounded by how many source files get analyzed
# (MAX_SOURCE_FILES in analyzer/__init__.py) and by this clone timeout.
CLONE_TIMEOUT = int(os.getenv("CLONE_TIMEOUT", "180"))  # seconds

# How many repositories may be analyzed at the same time. Keep this low
# on a small server, since each analysis holds the whole repo in memory.
MAX_CONCURRENT_ANALYSES = int(os.getenv("MAX_CONCURRENT_ANALYSES", "1"))
_analysis_gate = threading.BoundedSemaphore(MAX_CONCURRENT_ANALYSES)


app = FastAPI(title="Repository Analyzer")


app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class RepositoryRequest(BaseModel):
    path: str


class GitHubRequest(BaseModel):
    url: str


@app.get("/")
def home():
    return {
        "message": "Repository Analyzer API is running"
    }


# Used by the uptime monitor that keeps the free server awake.
# HEAD is allowed because some monitors use it instead of GET.
@app.api_route("/health", methods=["GET", "HEAD"])
def health():
    return {"status": "ok"}


def convert_analysis_to_dict(analysis):
    # Create graph nodes from analyzed files
    graph_nodes = []

    for code_file in analysis.files:
        graph_nodes.append({
            "id": code_file.path,
            "label": code_file.path,
            "file": code_file.path,
            "module": code_file.path,
            "functions": code_file.functions,
            "classes": code_file.classes,
            "imports": code_file.imports,
            "language": code_file.language
        })

    # Create graph edges from dependencies
    graph_edges = []

    for dependency in analysis.dependencies:
        graph_edges.append({
            "source": dependency.source,
            "target": dependency.target
        })

    return {
        "files": [
            {
                "path": code_file.path,
                "language": code_file.language,
                "functions": code_file.functions,
                "classes": code_file.classes,
                "imports": code_file.imports
            }
            for code_file in analysis.files
        ],

        "dependencies": [
            {
                "source": dependency.source,
                "target": dependency.target
            }
            for dependency in analysis.dependencies
        ],

        "metrics": {
            "files": len(analysis.files),
            "lines_of_code": analysis.lines_of_code,
            "functions": analysis.total_functions,
            "classes": analysis.total_classes,
            "imports": analysis.total_imports,
            "dependencies": len(analysis.dependencies),
            "languages": analysis.language_counts
        },

        # Graph data for frontend
        "graph": {
            "nodes": graph_nodes,
            "edges": graph_edges
        }
    }


def analyze_path(repository_path):
    # How many supported source files the repository has, so the result
    # can say whether the analysis covered all of them.
    source_files_found = count_source_files(repository_path)

    analysis = analyze_repository(repository_path)

    analysis.dependencies = build_dependencies(
        analysis
    )

    result = convert_analysis_to_dict(analysis)

    result["metrics"]["source_files_found"] = source_files_found
    result["metrics"]["source_files_limit"] = MAX_SOURCE_FILES
    result["metrics"]["truncated"] = source_files_found > MAX_SOURCE_FILES

    return result


# --------------------------------------------------
# Local-path analysis (development only)
#
# This endpoint reads any folder on the machine running the server.
# That is fine on your laptop and dangerous on a public server, so it
# only exists when ENABLE_LOCAL_ANALYZE=1 is set.
# --------------------------------------------------

if os.getenv("ENABLE_LOCAL_ANALYZE") == "1":

    @app.post("/analyze")
    def analyze(request: RepositoryRequest):

        repository_path = request.path

        if not os.path.exists(repository_path):
            raise HTTPException(
                status_code=404,
                detail="Repository path does not exist"
            )

        result = analyze_path(repository_path)

        return {
            "repository": repository_path,
            **result
        }


# --------------------------------------------------
# GitHub analysis
# --------------------------------------------------

def validate_github_url(url):
    url = url.strip()

    # Remove query parameters and fragments
    url = url.split("?")[0]
    url = url.split("#")[0]

    pattern = r"^https://github\.com/[^/]+/[^/]+/?$"

    return re.match(
        pattern,
        url
    ) is not None


def clone_repository(url, destination):
    """
    Shallow-clone a public repository, giving up after CLONE_TIMEOUT.
    """

    # GIT_TERMINAL_PROMPT=0 makes git fail immediately for private or
    # misspelled repos instead of waiting forever for a login prompt.
    environment = {**os.environ, "GIT_TERMINAL_PROMPT": "0"}

    try:
        completed = subprocess.run(
            [
                "git", "clone",
                "--depth", "1",
                "--single-branch",
                "--quiet",
                "--",
                url,
                destination
            ],
            env=environment,
            capture_output=True,
            text=True,
            timeout=CLONE_TIMEOUT
        )

    except subprocess.TimeoutExpired:
        raise HTTPException(
            status_code=504,
            detail="Cloning took too long. Try a smaller repository."
        )

    except FileNotFoundError:
        raise HTTPException(
            status_code=500,
            detail="git is not installed on the server."
        )

    if completed.returncode != 0:
        print(f"git clone failed: {completed.stderr.strip()}")

        raise HTTPException(
            status_code=400,
            detail="Could not clone the repository. It may be private "
                   "or the URL may be wrong."
        )


@app.post("/analyze-github")
def analyze_github(request: GitHubRequest):

    github_url = request.url.strip()

    # Remove query parameters and fragments
    github_url = github_url.split("?")[0]
    github_url = github_url.split("#")[0]

    if not validate_github_url(github_url):

        raise HTTPException(
            status_code=400,
            detail="Please provide a valid public GitHub repository URL."
        )

    owner, repository_name = github_url.rstrip("/").split("/")[-2:]

    if repository_name.endswith(".git"):
        repository_name = repository_name[:-4]

    # Refuse right away instead of queueing: a queued request would
    # sit on a loading screen for minutes.
    if not _analysis_gate.acquire(blocking=False):
        raise HTTPException(
            status_code=429,
            detail="The server is busy analyzing another repository. "
                   "Please try again in a minute."
        )

    temporary_directory = None

    try:

        temporary_directory = tempfile.mkdtemp(
            prefix="repository_"
        )

        print(
            f"Cloning repository: {github_url}"
        )

        started = time.perf_counter()

        clone_repository(
            github_url,
            temporary_directory
        )

        cloned = time.perf_counter()

        print(
            f"Repository cloned in {cloned - started:.1f}s"
        )

        result = analyze_path(
            temporary_directory
        )

        print(
            f"Analysis finished in {time.perf_counter() - cloned:.1f}s "
            f"({result['metrics']['files']} files)"
        )

        return {
            "repository": repository_name,
            "source": github_url,
            **result
        }

    except HTTPException:

        # Already has a clear message for the user.
        raise

    except Exception as error:

        print(
            f"Repository analysis failed: {error}"
        )

        raise HTTPException(
            status_code=500,
            detail=f"Could not analyze repository: {str(error)}"
        )

    finally:

        if temporary_directory:

            cleanup_started = time.perf_counter()

            shutil.rmtree(
                temporary_directory,
                ignore_errors=True
            )

            print(
                f"Cleanup finished in "
                f"{time.perf_counter() - cleanup_started:.1f}s"
            )

        _analysis_gate.release()