from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from analyzer import analyze_repository
from analyzer.dependency_builder import build_dependencies

from git import Repo

import os
import shutil
import tempfile
import re
import time


app = FastAPI(title="Repository Analyzer")


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
    "http://localhost:5173",
    "http://localhost:5174"
],
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
    analysis = analyze_repository(repository_path)

    analysis.dependencies = build_dependencies(
        analysis
    )

    return convert_analysis_to_dict(analysis)


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

    temporary_directory = tempfile.mkdtemp(
        prefix="repository_"
    )

    try:

        print(
            f"Cloning repository: {github_url}"
        )

        started = time.perf_counter()

        # GIT_TERMINAL_PROMPT=0 makes git fail immediately for private or
        # misspelled repos instead of waiting forever for a login prompt.
        Repo.clone_from(
            github_url,
            temporary_directory,
            depth=1,
            single_branch=True,
            env={"GIT_TERMINAL_PROMPT": "0"}
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

        repository_name = (
            github_url
            .rstrip("/")
            .split("/")[-1]
        )

        return {
            "repository": repository_name,
            "source": github_url,
            **result
        }

    except Exception as error:

        print(
            f"Repository analysis failed: {error}"
        )

        raise HTTPException(
            status_code=500,
            detail=f"Could not analyze repository: {str(error)}"
        )

    finally:

        cleanup_started = time.perf_counter()

        shutil.rmtree(
            temporary_directory,
            ignore_errors=True
        )

        print(
            f"Cleanup finished in {time.perf_counter() - cleanup_started:.1f}s"
        )