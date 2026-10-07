from dataclasses import dataclass, field


@dataclass
class CodeFile:
    path: str
    language: str
    functions: list[str] = field(default_factory=list)
    classes: list[str] = field(default_factory=list)
    imports: list[str] = field(default_factory=list)


@dataclass
class Dependency:
    source: str
    target: str


@dataclass
class RepositoryAnalysis:
    files: list[CodeFile] = field(default_factory=list)
    dependencies: list[Dependency] = field(default_factory=list)

    # Repository-level metrics
    lines_of_code: int = 0
    total_functions: int = 0
    total_classes: int = 0
    total_imports: int = 0
    language_counts: dict[str, int] = field(default_factory=dict)