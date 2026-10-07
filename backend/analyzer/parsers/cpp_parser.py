import re

from analyzer.models import CodeFile


def parse_cpp_file(file_path, relative_path, language):

    with open(file_path, "r", encoding="utf-8") as file:
        source_code = file.read()

    functions = []
    classes = []
    imports = []

    # -----------------------------
    # INCLUDES
    # -----------------------------

    include_pattern = (
        r'#include\s*[<"]([^>"]+)[>"]'
    )

    matches = re.findall(
        include_pattern,
        source_code
    )

    for match in matches:

        if match not in imports:
            imports.append(match)

    # -----------------------------
    # CLASSES
    # -----------------------------

    class_pattern = (
        r'\bclass\s+'
        r'([A-Za-z_][A-Za-z0-9_]*)'
    )

    matches = re.findall(
        class_pattern,
        source_code
    )

    for match in matches:

        if match not in classes:
            classes.append(match)

    # -----------------------------
    # FUNCTIONS
    # -----------------------------

    function_pattern = (
        r'(?:[A-Za-z_][\w:<>,\s*&]*)\s+'
        r'([A-Za-z_][A-Za-z0-9_]*)\s*'
        r'\([^;{}]*\)\s*\{'
    )

    matches = re.findall(
        function_pattern,
        source_code
    )

    for match in matches:

        if match not in functions:
            functions.append(match)

    return CodeFile(
        path=relative_path,
        language=language,
        functions=functions,
        classes=classes,
        imports=imports
    )