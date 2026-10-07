import re

from analyzer.models import CodeFile


def parse_javascript_file(file_path, relative_path, language):

    with open(file_path, "r", encoding="utf-8") as file:
        source_code = file.read()

    functions = []
    classes = []
    imports = []

    # -----------------------------
    # IMPORTS
    # -----------------------------

    import_patterns = [
        r'import\s+(?:.*?\s+from\s+)?["\']([^"\']+)["\']',
        r'import\s*["\']([^"\']+)["\']',
        r'require\s*\(\s*["\']([^"\']+)["\']\s*\)'
    ]

    for pattern in import_patterns:

        matches = re.findall(
            pattern,
            source_code
        )

        for match in matches:

            if match not in imports:
                imports.append(match)

    # -----------------------------
    # NORMAL FUNCTIONS
    # -----------------------------

    function_patterns = [
        r'\bfunction\s+([A-Za-z_$][\w$]*)\s*\(',
        r'\basync\s+function\s+([A-Za-z_$][\w$]*)\s*\('
    ]

    for pattern in function_patterns:

        matches = re.findall(
            pattern,
            source_code
        )

        for match in matches:

            if match not in functions:
                functions.append(match)

    # -----------------------------
    # ARROW FUNCTIONS
    # -----------------------------

    arrow_pattern = (
        r'\b(?:const|let|var)\s+'
        r'([A-Za-z_$][\w$]*)\s*=\s*'
        r'(?:async\s*)?'
        r'(?:\([^)]*\)|[A-Za-z_$][\w$]*)'
        r'\s*=>'
    )

    matches = re.findall(
        arrow_pattern,
        source_code
    )

    for match in matches:

        if match not in functions:
            functions.append(match)

    # -----------------------------
    # CLASSES
    # -----------------------------

    class_pattern = (
        r'\bclass\s+'
        r'([A-Za-z_$][\w$]*)'
    )

    matches = re.findall(
        class_pattern,
        source_code
    )

    for match in matches:

        if match not in classes:
            classes.append(match)

    # -----------------------------
    # RETURN COMMON MODEL
    # -----------------------------

    return CodeFile(
        path=relative_path,
        language=language,
        functions=functions,
        classes=classes,
        imports=imports
    )