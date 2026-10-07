import os

from analyzer.models import Dependency


def normalize_path(path):
    return os.path.normpath(path).replace("\\", "/")


def get_module_name(file_path):
    path_without_extension = os.path.splitext(file_path)[0]

    return path_without_extension.replace(
        os.sep,
        "."
    )


def build_path_index(analysis):
    """
    Map "path without extension" -> file, once, so each import can be
    resolved with a dictionary lookup instead of scanning every file.

    Folder imports such as "./components" are also registered, so they
    resolve to components/index.(js|ts|tsx|jsx).
    """

    path_index = {}

    for code_file in analysis.files:

        without_extension = os.path.splitext(
            normalize_path(code_file.path)
        )[0]

        path_index.setdefault(without_extension, code_file)

        if without_extension.endswith("/index"):
            path_index.setdefault(
                without_extension[:-len("/index")],
                code_file
            )

    return path_index


def find_target_file(source_file, imported_module, module_lookup, path_index):
    # JavaScript / TypeScript relative import
    if imported_module.startswith("."):

        source_directory = os.path.dirname(source_file)

        possible_path = normalize_path(
            os.path.join(
                source_directory,
                imported_module
            )
        )

        # Try the path as written (handles "./Dock"), then without an
        # extension (handles "./Dock.tsx" or "./sound.js").
        target = path_index.get(possible_path)

        if target is None:
            target = path_index.get(
                os.path.splitext(possible_path)[0]
            )

        return target

    # Python-style module lookup
    target = module_lookup.get(imported_module)

    if target is not None:
        return target

    # Try parent Python modules
    parts = imported_module.split(".")

    while len(parts) > 1:

        parts.pop()

        possible_module = ".".join(parts)

        target = module_lookup.get(
            possible_module
        )

        if target is not None:
            return target

    return None


def build_dependencies(analysis):

    dependencies = []
    seen = set()

    module_lookup = {}

    for code_file in analysis.files:

        module_name = get_module_name(
            code_file.path
        )

        module_lookup[module_name] = code_file

    path_index = build_path_index(analysis)

    for code_file in analysis.files:

        source_file = code_file.path

        for imported_module in code_file.imports:

            target = find_target_file(
                source_file,
                imported_module,
                module_lookup,
                path_index
            )

            if target is None:
                continue

            target_file = target.path

            if source_file == target_file:
                continue

            key = (source_file, target_file)

            if key in seen:
                continue

            seen.add(key)

            dependencies.append(
                Dependency(
                    source=source_file,
                    target=target_file
                )
            )

    return dependencies