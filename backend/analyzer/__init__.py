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


def get_source_files(root_path):
    source_files = []

    for current_root, directories, files in os.walk(root_path):

        directories[:] = [
            directory
            for directory in directories
            if directory not in {
                "venv",
                ".git",
                "__pycache__",
                "node_modules",
                "dist",
                "build"
            }
        ]

        for filename in files:

            file_path = os.path.join(
                current_root,
                filename
            )

            if detect_language(file_path):
                source_files.append(file_path)

    return source_files


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