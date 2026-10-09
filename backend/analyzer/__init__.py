import os

from analyzer.models import RepositoryAnalysis
from analyzer.parsers.python_parser import parse_python_file
from analyzer.parsers.javascript_parser import parse_javascript_file
from analyzer.parsers.java_parser import parse_java_file
from analyzer.parsers.cpp_parser import parse_cpp_file


SUPPORTED_EXTENSIONS = {
    ".py": "Python",

    ".js": "JavaScript",
    ".jsx": "JavaScript",

    ".ts": "TypeScript",
    ".tsx": "TypeScript",

    ".java": "Java",

    ".c": "C",
    ".h": "C",

    ".cpp": "C++",
    ".cc": "C++",
    ".cxx": "C++",
    ".hpp": "C++",
}


def detect_language(file_path):
    extension = os.path.splitext(file_path)[1].lower()

    return SUPPORTED_EXTENSIONS.get(extension)


# Safety limits. They bound the work done per request, never the size of
# the repository itself: a huge repository is still analyzed, up to
# MAX_SOURCE_FILES supported source files.
MAX_FILE_BYTES = 1_000_000
MAX_SOURCE_FILES = int(os.getenv("MAX_SOURCE_FILES", "5000"))

IGNORED_DIRECTORIES = {
    "venv",
    ".venv",
    ".git",
    "__pycache__",
    "node_modules",
    "dist",
    "build",
    "vendor",
    "target",
}


def iter_source_files(root_path):
    """
    Yield every supported source file, in a stable order so that two runs
    on the same repository always pick the same files.
    """

    for current_root, directories, files in os.walk(root_path):

        directories[:] = sorted(
            directory
            for directory in directories
            if directory not in IGNORED_DIRECTORIES
        )

        for filename in sorted(files):

            file_path = os.path.join(
                current_root,
                filename
            )

            if not detect_language(file_path):
                continue

            # A symlink could point at files outside the repository.
            if os.path.islink(file_path):
                continue

            # Skip generated or minified monsters.
            try:
                if os.path.getsize(file_path) > MAX_FILE_BYTES:
                    continue
            except OSError:
                continue

            yield file_path


def get_source_files(root_path):
    """
    The files that will be analyzed: at most MAX_SOURCE_FILES of them.
    """

    source_files = []

    for file_path in iter_source_files(root_path):
        if len(source_files) >= MAX_SOURCE_FILES:
            break
        source_files.append(file_path)

    return source_files


def count_source_files(root_path):
    """
    How many supported source files the repository has in total.
    """

    return sum(1 for _ in iter_source_files(root_path))


def analyze_repository(root_path):
    analysis = RepositoryAnalysis()
    source_files = get_source_files(root_path)

    for file_path in source_files:
        language = detect_language(file_path)
        relative_path = os.path.relpath(file_path, root_path)

        try:
            if language == "Python":
                code_file = parse_python_file(
                    file_path,
                    relative_path
                )
                analysis.files.append(code_file)

            elif language in {
                "JavaScript",
                "TypeScript"
            }:
                code_file = parse_javascript_file(
                    file_path,
                    relative_path,
                    language
                )
                analysis.files.append(code_file)

            elif language == "Java":
                code_file = parse_java_file(
                    file_path,
                    relative_path
                )
                analysis.files.append(code_file)

            elif language in {"C", "C++"}:
                code_file = parse_cpp_file(
                    file_path,
                    relative_path,
                    language
                )
                analysis.files.append(code_file)

            else:
                print(
                    f"Parser not available for {language}: "
                    f"{relative_path}"
                )

        except Exception as error:
            print(
                f"Could not analyze {relative_path}: "
                f"{error}"
            )

    # --------------------------------
    # CALCULATE REPOSITORY METRICS
    # --------------------------------

    for code_file in analysis.files:

        full_path = os.path.join(
            root_path,
            code_file.path
        )

        try:
            with open(
                full_path,
                "r",
                encoding="utf-8",
                errors="ignore"
            ) as file:
                lines = file.readlines()

            analysis.lines_of_code += len(lines)

        except Exception:
            pass

        analysis.total_functions += len(
            code_file.functions
        )

        analysis.total_classes += len(
            code_file.classes
        )

        analysis.total_imports += len(
            code_file.imports
        )

        if code_file.language not in analysis.language_counts:
            analysis.language_counts[
                code_file.language
            ] = 0

        analysis.language_counts[
            code_file.language
        ] += 1

    return analysis