import ast
import os


def get_python_files(root_path):
    """
    Find all Python files inside the repository.
    """

    python_files = []

    for current_root, directories, files in os.walk(root_path):

        # Ignore folders that are not part of the source code
        directories[:] = [
            directory
            for directory in directories
            if directory not in {
                "venv",
                ".git",
                "__pycache__",
                "node_modules"
            }
        ]

        for filename in files:

            if filename.endswith(".py"):
                file_path = os.path.join(current_root, filename)
                python_files.append(file_path)

    return python_files


def get_module_name(file_path, root_path):
    """
    Convert a Python file path into a module-style name.

    Example:
        test_repo/auth.py
        becomes:
        auth

        test_repo/utils/helpers.py
        becomes:
        utils.helpers
    """

    relative_path = os.path.relpath(file_path, root_path)

    relative_path = os.path.splitext(relative_path)[0]

    module_name = relative_path.replace(os.sep, ".")

    # __init__.py represents the package itself
    if module_name.endswith(".__init__"):
        module_name = module_name[:-9]

    return module_name


def analyze_file(file_path, root_path):
    """
    Analyze one Python file using the AST.
    """

    with open(file_path, "r", encoding="utf-8") as file:
        source_code = file.read()

    tree = ast.parse(source_code)

    relative_path = os.path.relpath(file_path, root_path)

    functions = []
    classes = []
    imports = []

    for node in ast.walk(tree):

        # Functions
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            functions.append(node.name)

        # Classes
        elif isinstance(node, ast.ClassDef):
            classes.append(node.name)

        # import something
        elif isinstance(node, ast.Import):

            for alias in node.names:
                imports.append(alias.name)

        # from something import ...
        elif isinstance(node, ast.ImportFrom):

            if node.module:
                imports.append(node.module)

    return {
        "file": relative_path,
        "module": get_module_name(file_path, root_path),
        "functions": functions,
        "classes": classes,
        "imports": imports
    }


def analyze_repository(root_path):
    """
    Analyze the entire Python repository.
    """

    python_files = get_python_files(root_path)

    results = []

    for file_path in python_files:

        try:
            result = analyze_file(file_path, root_path)
            results.append(result)

        except Exception as error:
            print(f"Could not analyze {file_path}: {error}")

    return results


def build_graph(results):
    """
    Convert repository analysis into graph nodes and edges.

    Each Python file becomes a node.

    If one file imports another file inside the repository,
    an edge is created between them.
    """

    nodes = []
    edges = []

    # Create a lookup:
    # module name -> file information
    module_lookup = {}

    for result in results:
        module_lookup[result["module"]] = result

    # Create graph nodes
    for result in results:

        node = {
            "id": result["file"],
            "label": os.path.basename(result["file"]),
            "file": result["file"],
            "module": result["module"],
            "functions": result["functions"],
            "classes": result["classes"]
        }

        nodes.append(node)

    # Create graph edges
    for result in results:

        source_file = result["file"]

        for imported_module in result["imports"]:

            # Try the complete imported module first
            target = module_lookup.get(imported_module)

            # If not found, try parent module
            if target is None:

                parts = imported_module.split(".")

                while len(parts) > 1 and target is None:
                    parts.pop()
                    possible_module = ".".join(parts)
                    target = module_lookup.get(possible_module)

            if target is not None:

                target_file = target["file"]

                # Avoid self-links
                if source_file != target_file:

                    edge = {
                        "source": source_file,
                        "target": target_file
                    }

                    # Avoid duplicate edges
                    if edge not in edges:
                        edges.append(edge)

    return {
        "nodes": nodes,
        "edges": edges
    }


def print_analysis(results, graph):
    """
    Print a readable summary of the repository.
    """

    print("\n===================================")
    print("       REPOSITORY ANALYSIS")
    print("===================================")

    print(f"\nPython files: {len(results)}")
    print(f"Graph nodes: {len(graph['nodes'])}")
    print(f"Internal dependencies: {len(graph['edges'])}")

    total_functions = sum(
        len(result["functions"])
        for result in results
    )

    total_classes = sum(
        len(result["classes"])
        for result in results
    )

    print(f"Functions: {total_functions}")
    print(f"Classes: {total_classes}")

    print("\n----------- FILES -----------")

    for result in results:

        print(f"\nFile: {result['file']}")

        if result["classes"]:
            print("Classes:")
            for class_name in result["classes"]:
                print(f"  - {class_name}")

        if result["functions"]:
            print("Functions:")
            for function_name in result["functions"]:
                print(f"  - {function_name}")

        if result["imports"]:
            print("Imports:")
            for imported_module in result["imports"]:
                print(f"  - {imported_module}")

    print("\n----------- DEPENDENCIES -----------")

    for edge in graph["edges"]:

        print(
            f"{edge['source']}  -->  {edge['target']}"
        )


if __name__ == "__main__":

    repository_path = input(
        "Enter repository path: "
    ).strip()

    if not os.path.exists(repository_path):

        print("\nRepository path does not exist.")

    else:

        results = analyze_repository(repository_path)

        graph = build_graph(results)

        print_analysis(results, graph)