import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const DEFAULT_FILE_CAP = 500;

const IGNORED_DIRECTORIES = new Set(["node_modules", "dist", ".git"]);
const IGNORED_FILE_NAMES = new Set([
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "bun.lockb",
]);
const IGNORED_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
  ".ico",
  ".bmp",
]);

export type RepositoryFile = {
  path: string;
  bytes: number;
};

export type RepositorySnapshot = {
  url: string;
  commit: string;
  root: string;
  files: RepositoryFile[];
  ignored: number;
  truncated: boolean;
};

function validateGitHubUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Enter a valid GitHub repository URL.");
  }

  if (url.protocol !== "https:" || url.hostname.toLowerCase() !== "github.com") {
    throw new Error("Only https://github.com/{owner}/{repository} URLs are supported.");
  }

  const segments = url.pathname.split("/").filter(Boolean);
  if (segments.length !== 2 || !segments.every((segment) => /^[a-zA-Z0-9_.-]+$/.test(segment))) {
    throw new Error("Use a public GitHub repository URL with an owner and repository name.");
  }

  return `https://github.com/${segments[0]}/${segments[1].replace(/\.git$/, "")}.git`;
}

function shouldIgnore(relativePath: string) {
  const segments = relativePath.split(path.sep);
  const fileName = segments.at(-1) ?? "";
  return (
    segments.some((segment) => IGNORED_DIRECTORIES.has(segment)) ||
    IGNORED_FILE_NAMES.has(fileName) ||
    IGNORED_EXTENSIONS.has(path.extname(fileName).toLowerCase())
  );
}

async function walkFiles(root: string, fileCap: number) {
  const files: RepositoryFile[] = [];
  let ignored = 0;
  let truncated = false;

  async function visit(directory: string) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      const relativePath = path.relative(root, absolutePath);

      if (shouldIgnore(relativePath)) {
        ignored += 1;
        continue;
      }

      if (entry.isDirectory()) {
        if (files.length < fileCap) await visit(absolutePath);
        continue;
      }

      if (!entry.isFile()) continue;
      if (files.length >= fileCap) {
        truncated = true;
        return;
      }

      const stats = await fs.stat(absolutePath);
      files.push({ path: relativePath.split(path.sep).join("/"), bytes: stats.size });
    }
  }

  await visit(root);
  return { files, ignored, truncated };
}

export async function cloneAndInspectRepository(
  inputUrl: string,
  fileCap = DEFAULT_FILE_CAP,
): Promise<RepositorySnapshot> {
  if (!Number.isInteger(fileCap) || fileCap < 1 || fileCap > 10_000) {
    throw new Error("The file cap must be an integer between 1 and 10,000.");
  }

  const url = validateGitHubUrl(inputUrl);
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), "askanyrepo-"));

  try {
    const clonePath = path.join(temporaryRoot, "repository");
    await execFileAsync("git", ["clone", "--depth", "1", "--no-tags", url, clonePath], {
      timeout: 120_000,
      maxBuffer: 4 * 1024 * 1024,
    });
    const { stdout: commit } = await execFileAsync("git", ["-C", clonePath, "rev-parse", "HEAD"]);
    const tree = await walkFiles(clonePath, fileCap);

    return {
      url,
      commit: commit.trim(),
      root: clonePath,
      ...tree,
    };
  } finally {
    await fs.rm(temporaryRoot, { recursive: true, force: true });
  }
}