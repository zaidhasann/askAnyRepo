"""Small, dependency-light repository snapshot harness for evals."""

from __future__ import annotations

import argparse
import json
import subprocess
import tempfile
from pathlib import Path
from urllib.parse import urlparse

IGNORED_DIRECTORIES = {"node_modules", "dist", ".git"}
IGNORED_NAMES = {"package-lock.json", "yarn.lock", "pnpm-lock.yaml", "bun.lockb"}
IGNORED_EXTENSIONS = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico", ".bmp"}


def normalize_url(raw_url: str) -> str:
    parsed = urlparse(raw_url)
    segments = [segment for segment in parsed.path.split("/") if segment]
    if parsed.scheme != "https" or parsed.hostname != "github.com" or len(segments) != 2:
        raise ValueError("Only public https://github.com/{owner}/{repository} URLs are supported.")
    repository = segments[1].removesuffix(".git")
    return f"https://github.com/{segments[0]}/{repository}.git"


def ignored(relative_path: Path) -> bool:
    return bool(set(relative_path.parts) & IGNORED_DIRECTORIES) or relative_path.name in IGNORED_NAMES or relative_path.suffix.lower() in IGNORED_EXTENSIONS


def snapshot(url: str, file_cap: int = 500) -> dict:
    if not 1 <= file_cap <= 10_000:
        raise ValueError("file_cap must be between 1 and 10,000")
    repository_url = normalize_url(url)
    with tempfile.TemporaryDirectory(prefix="askanyrepo-") as temporary_directory:
        root = Path(temporary_directory) / "repository"
        subprocess.run(["git", "clone", "--depth", "1", "--no-tags", repository_url, str(root)], check=True, capture_output=True, text=True, timeout=120)
        commit = subprocess.check_output(["git", "-C", str(root), "rev-parse", "HEAD"], text=True).strip()
        files = []
        ignored_count = 0
        for candidate in sorted(root.rglob("*")):
            relative_path = candidate.relative_to(root)
            if ignored(relative_path):
                ignored_count += 1
            elif candidate.is_file() and len(files) < file_cap:
                files.append({"path": relative_path.as_posix(), "bytes": candidate.stat().st_size})
        all_files = [candidate for candidate in root.rglob("*") if candidate.is_file() and not ignored(candidate.relative_to(root))]
        return {"url": repository_url, "commit": commit, "files": files, "ignored": ignored_count, "truncated": len(all_files) > file_cap}


def main() -> None:
    parser = argparse.ArgumentParser(description="Shallow-clone and inspect a GitHub repository")
    parser.add_argument("url")
    parser.add_argument("--file-cap", type=int, default=500)
    args = parser.parse_args()
    print(json.dumps(snapshot(args.url, args.file_cap), indent=2))


if __name__ == "__main__":
    main()