"""Add an independent HTML fallback while preserving existing API proxy behavior."""
import argparse
from pathlib import Path
import re

INCLUDE = "include /etc/nginx/snippets/guoke-maintenance.conf;"
ROOT = re.compile(r"^(?P<indent>[ \t]*)location / \{\n(?P<body>.*?)^(?P=indent)\}", re.MULTILINE | re.DOTALL)


def configure_site(site: str) -> str:
    site = site.replace("\r\n", "\n")
    if INCLUDE in site:
        if site.count(INCLUDE) != 1:
            raise ValueError("Maintenance include is duplicated; manual review required")
        return site
    roots = list(ROOT.finditer(site))
    if len(roots) != 1:
        raise ValueError("Expected one existing root proxy location; configuration left unchanged")
    match = roots[0]
    indent, body = match.group("indent"), match.group("body")
    if "proxy_pass " not in body or "proxy_intercept_errors" in body or "error_page" in body:
        raise ValueError("Existing root proxy has unexpected error handling; manual review required")
    if re.search(r"location\s+(?:\^~\s+)?/api/\s*\{", site):
        raise ValueError("Existing API prefix requires manual review; configuration left unchanged")
    replacement = (
        f"{indent}{INCLUDE}\n\n"
        f"{indent}# Keep API JSON responses and existing proxy timeouts intact.\n"
        f"{indent}location /api/ {{\n"
        f"{indent}    proxy_intercept_errors off;\n{body}{indent}}}\n\n"
        f"{indent}location / {{\n"
        f"{indent}    proxy_intercept_errors on;\n"
        f"{indent}    error_page 500 502 503 504 =503 /_guoke_maintenance.html;\n"
        f"{body}{indent}}}"
    )
    return site[:match.start()] + replacement + site[match.end():]


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    result = configure_site(args.source.read_text(encoding="utf-8"))
    args.output.write_text(result, encoding="utf-8")
