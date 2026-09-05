"""parsers.fallback_parser: language detection and smart-label extraction
for every non-Python/JS language the scanner now collects.

Companion to the scanner allowlist fix (tests/test_scanner.py) — collecting
the files is only half the fix; they also need a correct language tag and a
real (not "Unknown"/filename-only) label wherever the source has a class-like
declaration.
"""

import pytest

from parsers.fallback_parser import parse_fallback


@pytest.mark.parametrize(
    "path,source,expected_lang",
    [
        ("main.c", "int main() { return 0; }", "C"),
        ("widget.h", "struct Widget { int x; };", "C"),
        ("app.cc", "class App {};", "C++"),
        ("app.cxx", "class App {};", "C++"),
        ("widget.hpp", "class Widget {};", "C++"),
        ("widget.hxx", "class Widget {};", "C++"),
        ("Program.cs", "class Program {}", "C#"),
        ("App.swift", "struct App {}", "Swift"),
        ("Main.kt", "class Main {}", "Kotlin"),
        ("script.kts", "fun main() {}", "Kotlin"),
    ],
)
def test_language_detected_for_each_extension(path, source, expected_lang):
    result = parse_fallback(path, source)
    assert result is not None
    assert result["language"] == expected_lang


def test_class_name_used_over_bare_filename():
    result = parse_fallback("src/handler.cpp", "class RequestHandler {\npublic:\n    void run();\n};\n")
    assert result["label"] == "Request Handler"


def test_struct_declaration_extracted_as_label():
    result = parse_fallback("widget.h", "struct WidgetState {\n    int x;\n};\n")
    assert result["label"] == "Widget State"


def test_no_class_falls_back_to_humanized_filename():
    result = parse_fallback("utils.c", "int add(int a, int b) { return a + b; }\n")
    assert result["label"] == "Utils"
