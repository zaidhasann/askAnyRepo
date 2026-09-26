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
  content?: string;
};

export type RepositorySnapshot = {
  url: string;
  commit: string;
  root: string;
  files: RepositoryFile[];
  ignored: number;
  truncated: boolean;
  degraded?: boolean;
  degradedReason?: string;
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

async function removeTemporaryDirectory(directory: string) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await fs.rm(directory, { recursive: true, force: true, maxRetries: 1, retryDelay: 100 });
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EBUSY" && code !== "EPERM" && code !== "ENOTEMPTY") throw error;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
}

async function walkFiles(root: string, fileCap: number) {
  const files: RepositoryFile[] = [];
  let ignored = 0;
  let truncated = false;
  let degraded = false;

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
      const file: RepositoryFile = { path: relativePath.split(path.sep).join("/"), bytes: stats.size };
      try {
        file.content = await fs.readFile(absolutePath, "utf8");
      } catch {
        degraded = true;
      }
      files.push(file);
    }
  }

  await visit(root);
  return { files, ignored, truncated, degraded };
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
  let clonePath = path.join(temporaryRoot, "repository");
  let degraded = false;

  try {
    let cloneError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      clonePath = path.join(temporaryRoot, attempt === 0 ? "repository" : `repository-retry-${attempt}`);
      try {
        await execFileAsync("git", ["clone", "--depth", "1", "--no-tags", url, clonePath], {
          timeout: 120_000,
          maxBuffer: 4 * 1024 * 1024,
        });
        cloneError = undefined;
        break;
      } catch (error) {
        cloneError = error;
        if (attempt === 0) {
          await removeTemporaryDirectory(clonePath);
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
    }

    if (cloneError) {
      const error = cloneError as NodeJS.ErrnoException & { stderr?: string };
      const degradedReason = error.stderr?.trim() || error.message || "Git clone failed after one retry.";
      return { url, commit: "unknown", root: clonePath, files: [], ignored: 0, truncated: false, degraded: true, degradedReason };
    }

    let commit = "unknown";
    try {
      const result = await execFileAsync("git", ["-C", clonePath, "rev-parse", "HEAD"]);
      commit = result.stdout.trim();
    } catch {
      degraded = true;
    }

    const tree = await walkFiles(clonePath, fileCap);

    return {
      url,
      commit,
      root: clonePath,
      ...tree,
      degraded: degraded || tree.degraded,
    };
  } finally {
    try {
      await removeTemporaryDirectory(temporaryRoot);
    } catch {
    }
  }
}