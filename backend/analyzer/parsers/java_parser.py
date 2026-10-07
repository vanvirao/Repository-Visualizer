import re

from analyzer.models import CodeFile


def parse_java_file(file_path, relative_path):

    with open(file_path, "r", encoding="utf-8") as file:
        source_code = file.read()

    functions = []
    classes = []
    imports = []

    # -----------------------------
    # IMPORTS
    # -----------------------------

    import_pattern = (
        r'\bimport\s+'
        r'([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*;'
    )

    matches = re.findall(
        import_pattern,
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
    # INTERFACES
    # -----------------------------

    interface_pattern = (
        r'\binterface\s+'
        r'([A-Za-z_$][\w$]*)'
    )

    matches = re.findall(
        interface_pattern,
        source_code
    )

    for match in matches:

        if match not in classes:
            classes.append(match)

    # -----------------------------
    # METHODS
    # -----------------------------

    method_pattern = (
        r'(?:public|private|protected|static|final|'
        r'abstract|synchronized|native|strictfp|\s)+'
        r'[\w<>\[\], ?]+\s+'
        r'([A-Za-z_$][\w$]*)\s*'
        r'\([^;{}]*\)\s*\{'
    )

    matches = re.findall(
        method_pattern,
        source_code
    )

    for match in matches:

        if match not in functions:
            functions.append(match)

    return CodeFile(
        path=relative_path,
        language="Java",
        functions=functions,
        classes=classes,
        imports=imports
    )