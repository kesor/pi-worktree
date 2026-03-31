/**
 * pi-worktree: Git Worktree Sandboxes for Safe Experimentation
 *
 * Create isolated git worktrees for experiments. Safe to try risky changes
 * without affecting your main branch or losing work.
 *
 * Commands:
 * - /worktree create <name> - Create a new worktree
 * - /worktree list         - List all worktrees
 * - /worktree remove <name> - Remove a worktree
 * - /worktree reset <name>  - Reset to default branch
 * - /worktree cd <name>    - Print worktree path
 * - /worktree status       - Show current worktree status
 * - /worktree prune        - Clean up stale worktree references
 */

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs/promises";
import * as path from "path";
import * as os from "os";

const execAsync = promisify(exec);

// ============================================================================
// Types
// ============================================================================

interface WorktreeInfo {
  name: string;
  branch: string;
  directory: string;
  createdAt: number;
  slotIndex?: number;
}

interface WorktreeStore {
  worktrees: Record<string, WorktreeInfo>;
  primaryDirectory: string;
  version: number;
}

interface LockInfo {
  agentId?: string;
  worktreeName?: string;
  pid?: number;
  createdAt: string;
}

interface GitWorktreeEntry {
  path: string;
  branch?: string;
  isMain: boolean;
  isCurrent: boolean;
}

// ============================================================================
// Constants
// ============================================================================

const STORE_VERSION = 1;
const WORKTREE_DIR = ".pi/worktrees";
const STORE_FILE = `${WORKTREE_DIR}/store.json`;
const LOCK_FILE = ".worktree.lock";
const BRANCH_PREFIX = "feature/";

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Run a git command and return the result
 */
async function git(args: string[], cwd?: string): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execAsync(`git ${args.join(" ")}`, {
      cwd: cwd || process.cwd(),
      encoding: "utf-8",
    });
    return { code: 0, stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (error: any) {
    return {
      code: error.code || 1,
      stdout: error.stdout?.trim() || "",
      stderr: error.stderr?.trim() || error.message || "Unknown error",
    };
  }
}

/**
 * Run a shell command
 */
async function runCommand(
  command: string,
  cwd?: string
): Promise<{ code: number; stdout: string; stderr: string }> {
  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd: cwd || process.cwd(),
      encoding: "utf-8",
    });
    return { code: 0, stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (error: any) {
    return {
      code: error.code || 1,
      stdout: error.stdout?.trim() || "",
      stderr: error.stderr?.trim() || error.message || "Unknown error",
    };
  }
}

/**
 * Generate a slug from a name
 */
function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
}

/**
 * Generate a random slug for unique names
 */
function randomSlug(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < 8; i++) {
    result += chars[Math.floor(Math.random() * chars.length)];
  }
  return result;
}

/**
 * Get the worktree storage directory
 */
function getWorktreeRoot(): string {
  return path.join(process.cwd(), WORKTREE_DIR);
}

/**
 * Get global gitignore path
 */
async function getGlobalGitignorePath(): Promise<string | null> {
  // Check git config first
  const configResult = await runCommand("git config --global core.excludesfile");
  if (configResult.code === 0 && configResult.stdout.trim()) {
    return configResult.stdout.trim();
  }

  // Default locations
  const home = os.homedir();
  const candidates = [
    path.join(home, ".gitignore"),
    path.join(home, ".gitignore_global"),
    path.join(home, ".config", "git", "ignore"),
  ];

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      // doesn't exist, try next
    }
  }

  // Default to ~/.gitignore
  return path.join(home, ".gitignore");
}

/**
 * Ensure worktrees directory is in global gitignore
 */
async function ensureGlobalGitignore(): Promise<void> {
  try {
    const gitignorePath = await getGlobalGitignorePath();
    if (!gitignorePath) return;

    const pattern = `${WORKTREE_DIR}/`;

    let content = "";
    try {
      content = await fs.readFile(gitignorePath, "utf-8");
    } catch {
      // File doesn't exist yet
    }

    // Check if already present
    const lines = content.split(/\r?\n/);
    if (lines.some((line) => line.trim() === pattern || line.trim() === WORKTREE_DIR)) {
      return;
    }

    // Append pattern
    const entry = content.endsWith("\n") || content === "" ? pattern : `\n${pattern}`;
    await fs.appendFile(gitignorePath, entry + "\n", "utf-8");
  } catch {
    // Non-fatal - ignore errors
  }
}

/**
 * Load the worktree store from disk
 */
async function loadStore(): Promise<WorktreeStore> {
  try {
    const content = await fs.readFile(STORE_FILE, "utf-8");
    const parsed = JSON.parse(content);
    return {
      version: parsed.version || 0,
      worktrees: parsed.worktrees || {},
      primaryDirectory: parsed.primaryDirectory || "",
    };
  } catch {
    return { version: STORE_VERSION, worktrees: {}, primaryDirectory: "" };
  }
}

/**
 * Save the worktree store to disk
 */
async function saveStore(): Promise<void> {
  await fs.mkdir(getWorktreeRoot(), { recursive: true });
  await fs.writeFile(STORE_FILE, JSON.stringify(store, null, 2));
}

/**
 * Check if a process is alive
 */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Load lock file
 */
async function loadLock(worktreeDir: string): Promise<LockInfo | null> {
  const lockPath = path.join(worktreeDir, LOCK_FILE);
  try {
    const content = await fs.readFile(lockPath, "utf-8");
    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Write lock file
 */
async function writeLock(worktreeDir: string, info: LockInfo): Promise<void> {
  const lockPath = path.join(worktreeDir, LOCK_FILE);
  await fs.mkdir(path.dirname(lockPath), { recursive: true });
  await fs.writeFile(lockPath, JSON.stringify(info, null, 2));
}

/**
 * Remove lock file
 */
async function removeLock(worktreeDir: string): Promise<void> {
  const lockPath = path.join(worktreeDir, LOCK_FILE);
  try {
    await fs.unlink(lockPath);
  } catch {
    // May not exist
  }
}

/**
 * Check if the current directory is a git repository
 */
async function isGitRepo(): Promise<boolean> {
  const result = await git(["rev-parse", "--is-inside-work-tree"]);
  return result.code === 0 && result.stdout === "true";
}

/**
 * Get the current working directory as the primary worktree
 */
async function getPrimaryDirectory(): Promise<string> {
  const result = await git(["rev-parse", "--show-toplevel"]);
  return result.code === 0 ? result.stdout : process.cwd();
}

/**
 * Get git root directory
 */
async function getGitRoot(): Promise<string> {
  const result = await git(["rev-parse", "--git-common-dir"]);
  if (result.code === 0) {
    // git-common-dir points to .git or the parent .git in worktrees
    const gitDir = result.stdout;
    return path.dirname(gitDir);
  }
  return process.cwd();
}

/**
 * Get current branch name
 */
async function getCurrentBranch(cwd?: string): Promise<string> {
  const result = await git(["branch", "--show-current"], cwd);
  return result.code === 0 ? result.stdout || "HEAD (detached)" : "unknown";
}

/**
 * List all git worktrees with details
 */
async function listGitWorktrees(cwd?: string): Promise<GitWorktreeEntry[]> {
  const result = await git(["worktree", "list", "--porcelain"], cwd);
  if (result.code !== 0) return [];

  const entries: GitWorktreeEntry[] = [];
  const currentDir = cwd || process.cwd();
  const primaryPath = await getPrimaryDirectory();

  let current: Partial<GitWorktreeEntry> = {};

  for (const line of result.stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (current.path) {
        entries.push({
          path: current.path,
          branch: current.branch,
          isMain: current.path === primaryPath,
          isCurrent: current.path === currentDir,
        });
      }
      current = {};
    } else if (trimmed.startsWith("worktree ")) {
      current.path = trimmed.slice(9).trim();
    } else if (trimmed.startsWith("branch ")) {
      current.branch = trimmed.slice(7).trim().replace("refs/heads/", "");
    } else if (trimmed === "detached") {
      current.branch = "HEAD (detached)";
    }
  }

  // Don't forget the last entry
  if (current.path) {
    entries.push({
      path: current.path,
      branch: current.branch,
      isMain: current.path === primaryPath,
      isCurrent: current.path === currentDir,
    });
  }

  return entries;
}

/**
 * Find the default branch (main or master)
 */
async function getDefaultBranch(): Promise<string> {
  // Check origin/main first
  const mainCheck = await git(["show-ref", "--verify", "--quiet", "refs/heads/main"]);
  if (mainCheck.code === 0) return "main";

  const masterCheck = await git(["show-ref", "--verify", "--quiet", "refs/heads/master"]);
  if (masterCheck.code === 0) return "master";

  return "main";
}

/**
 * Check if a branch exists
 */
async function branchExists(branch: string): Promise<boolean> {
  const result = await git(["show-ref", "--verify", "--quiet", `refs/heads/${branch}`]);
  return result.code === 0;
}

// ============================================================================
// State
// ============================================================================

let store: WorktreeStore = {
  version: STORE_VERSION,
  worktrees: {},
  primaryDirectory: "",
};

// ============================================================================
// Core Worktree Operations
// ============================================================================

/**
 * Create a new worktree
 */
async function createWorktree(name?: string): Promise<WorktreeInfo> {
  // Check if it's a git repo
  if (!(await isGitRepo())) {
    throw new Error("Not a git repository. Worktrees require a git repo.");
  }

  const primaryDir = await getPrimaryDirectory();

  // Generate worktree info
  const baseName = name ? slugify(name) : randomSlug();
  const worktreeName = name ? baseName : `${baseName}-${randomSlug()}`;
  const branch = `${BRANCH_PREFIX}${worktreeName}`;
  const worktreeDir = path.join(getWorktreeRoot(), worktreeName);

  // Check if worktree already exists in store
  if (store.worktrees[worktreeName]) {
    const existing = store.worktrees[worktreeName];
    // Check if it's still valid
    try {
      await fs.access(existing.directory);
      // Still exists, return it
      return existing;
    } catch {
      // Stale entry, will be cleaned up
    }
  }

  // Check if directory already exists
  try {
    await fs.access(worktreeDir);
    // Check if it's a registered worktree
    const gitWorktrees = await listGitWorktrees();
    const isGitWorktree = gitWorktrees.some((wt) => path.normalize(wt.path) === path.normalize(worktreeDir));

    if (isGitWorktree) {
      throw new Error(`Worktree already exists at ${worktreeDir}`);
    }

    // Directory exists but not registered - clean it up first
    await fs.rm(worktreeDir, { recursive: true, force: true });
  } catch (error: any) {
    if (error.code !== "ENOENT") throw error;
  }

  // Ensure global gitignore has our worktree dir
  const gitignorePath = await getGlobalGitignorePath();
  if (gitignorePath) {
    const pattern = `${WORKTREE_DIR}/`;
    let content = "";
    try {
      content = await fs.readFile(gitignorePath, "utf-8");
    } catch {
      // File doesn't exist yet
    }
    const lines = content.split(/\r?\n/);
    if (!lines.some((line) => line.trim() === pattern || line.trim() === WORKTREE_DIR)) {
      const entry = content.endsWith("\n") || content === "" ? pattern : `\n${pattern}`;
      await fs.appendFile(gitignorePath, entry + "\n", "utf-8");
    }
  }

  // Create the worktree directory
  await fs.mkdir(getWorktreeRoot(), { recursive: true });
  await fs.mkdir(worktreeDir, { recursive: true });

  // Create git worktree with new branch
  const result = await git(
    ["worktree", "add", "--no-checkout", "-b", branch, worktreeDir],
    primaryDir
  );

  if (result.code !== 0) {
    // Clean up directory on failure
    await fs.rm(worktreeDir, { recursive: true, force: true });
    throw new Error(`Failed to create worktree: ${result.stderr}`);
  }

  // Checkout files
  const checkoutResult = await git(["reset", "--hard", "HEAD"], worktreeDir);
  if (checkoutResult.code !== 0) {
    console.warn(`Warning: Failed to checkout files: ${checkoutResult.stderr}`);
  }

  // Write lock file
  await writeLock(worktreeDir, {
    worktreeName,
    pid: process.pid,
    createdAt: new Date().toISOString(),
  });

  // Determine slot index
  const slotIndex = Object.keys(store.worktrees).length;

  // Store worktree info
  const info: WorktreeInfo = {
    name: worktreeName,
    branch,
    directory: worktreeDir,
    createdAt: Date.now(),
    slotIndex,
  };

  store.worktrees[worktreeName] = info;
  store.primaryDirectory = primaryDir;
  await saveStore();

  return info;
}

/**
 * List all tracked worktrees
 */
async function listWorktrees(): Promise<WorktreeInfo[]> {
  const gitWorktrees = await listGitWorktrees();
  const gitPaths = new Set(gitWorktrees.map((wt) => path.normalize(wt.path)));

  // Filter out stale entries
  const valid: WorktreeInfo[] = [];
  for (const [name, info] of Object.entries(store.worktrees)) {
    const normalizedDir = path.normalize(info.directory);
    if (gitPaths.has(normalizedDir)) {
      valid.push(info);
    }
    // Clean up stale entries
    else {
      delete store.worktrees[name];
    }
  }

  // Save cleaned store
  if (valid.length !== Object.keys(store.worktrees).length) {
    await saveStore();
  }

  return valid;
}

/**
 * Remove a worktree
 */
async function removeWorktree(name: string): Promise<void> {
  const info = store.worktrees[name];
  if (!info) {
    throw new Error(`Worktree "${name}" not found`);
  }

  const primaryDir = await getPrimaryDirectory();
  const normalizedDir = path.normalize(info.directory);
  const normalizedPrimary = path.normalize(primaryDir);

  // Don't allow removing primary
  if (normalizedDir === normalizedPrimary) {
    throw new Error("Cannot remove the primary workspace");
  }

  // Check lock
  const lock = await loadLock(info.directory);
  if (lock) {
    // Check if the lock holder is still alive
    if (lock.pid && !isProcessAlive(lock.pid)) {
      // Stale lock - proceed with removal
      console.warn(`Removing stale lock for ${name} (PID ${lock.pid} is not running)`);
    } else if (lock.pid === process.pid) {
      // Own lock - this shouldn't happen during removal
    } else if (lock.pid) {
      // Another process holds the lock
      throw new Error(`Worktree "${name}" is locked by another process (PID ${lock.pid}). Wait for it to finish or remove manually.`);
    }
  }

  // Try git worktree remove first
  const result = await git(["worktree", "remove", "--force", info.directory], primaryDir);

  if (result.code !== 0) {
    // Worktree might be stale - clean up manually
    console.warn(`Git worktree remove warning: ${result.stderr}`);
  }

  // Try to delete the branch (non-fatal)
  try {
    await git(["branch", "-D", info.branch], info.directory);
  } catch {
    // Branch may not exist or can't be deleted
  }

  // Clean up directory if it still exists
  try {
    await fs.rm(info.directory, { recursive: true, force: true });
  } catch (error: any) {
    console.warn(`Warning: Failed to remove directory: ${error.message}`);
  }

  // Remove lock file
  await removeLock(info.directory);

  // Remove from store
  delete store.worktrees[name];
  await saveStore();
}

/**
 * Reset a worktree to the default branch
 */
async function resetWorktree(name: string): Promise<void> {
  const info = store.worktrees[name];
  if (!info) {
    throw new Error(`Worktree "${name}" not found`);
  }

  const primaryDir = await getPrimaryDirectory();
  const normalizedDir = path.normalize(info.directory);
  const normalizedPrimary = path.normalize(primaryDir);

  // Don't allow resetting primary
  if (normalizedDir === normalizedPrimary) {
    throw new Error("Cannot reset the primary workspace");
  }

  // Get default branch
  const defaultBranch = await getDefaultBranch();

  // Fetch latest from remote
  await git(["fetch", "origin", defaultBranch], primaryDir);

  // Reset to default branch
  const resetResult = await git(["reset", "--hard", `origin/${defaultBranch}`], info.directory);
  if (resetResult.code !== 0) {
    throw new Error(`Failed to reset worktree: ${resetResult.stderr}`);
  }

  // Clean untracked files
  const cleanResult = await git(["clean", "-ffdx"], info.directory);
  if (cleanResult.code !== 0) {
    console.warn(`Warning: Failed to clean untracked files: ${cleanResult.stderr}`);
  }

  // Update submodules if any
  await git(["submodule", "update", "--init", "--recursive"], info.directory);
}

/**
 * Get info about a specific worktree
 */
async function getWorktreeInfo(name: string): Promise<WorktreeInfo | null> {
  const worktrees = await listWorktrees();
  return worktrees.find((wt) => wt.name === name) || null;
}

/**
 * Find worktree by name or partial match
 */
async function findWorktree(name: string): Promise<WorktreeInfo | null> {
  const worktrees = await listWorktrees();

  // Exact match
  if (worktrees.some((wt) => wt.name === name)) {
    return worktrees.find((wt) => wt.name === name)!;
  }

  // Branch match
  const branchMatch = `${BRANCH_PREFIX}${name}`;
  if (worktrees.some((wt) => wt.branch === branchMatch)) {
    return worktrees.find((wt) => wt.branch === branchMatch)!;
  }

  // Partial match on name
  const partial = worktrees.find(
    (wt) => wt.name.includes(name) || wt.branch.includes(name)
  );
  return partial || null;
}

/**
 * Prune stale worktrees
 */
async function pruneWorktrees(): Promise<{ removed: number; warnings: string[] }> {
  const warnings: string[] = [];
  let removed = 0;

  // Run git worktree prune
  const pruneResult = await git(["worktree", "prune"]);
  if (pruneResult.code !== 0) {
    warnings.push(`git worktree prune: ${pruneResult.stderr}`);
  }

  // Get current git worktrees
  const gitWorktrees = await listGitWorktrees();
  const gitPaths = new Set(gitWorktrees.map((wt) => path.normalize(wt.path)));

  // Clean up store entries that don't have corresponding git worktrees
  for (const [name, info] of Object.entries(store.worktrees)) {
    const normalizedDir = path.normalize(info.directory);
    if (!gitPaths.has(normalizedDir)) {
      // Also clean up any leftover directories
      try {
        await fs.rm(info.directory, { recursive: true, force: true });
      } catch {
        // Directory may not exist
      }

      // Clean up lock file
      await removeLock(info.directory);

      delete store.worktrees[name];
      removed++;
    }
  }

  if (removed > 0) {
    await saveStore();
  }

  return { removed, warnings };
}

/**
 * Clean up stale locks (locks from dead processes)
 */
async function cleanupStaleLocks(): Promise<{ cleaned: number }> {
  const worktrees = await listWorktrees();
  let cleaned = 0;

  for (const info of worktrees) {
    const lock = await loadLock(info.directory);
    if (lock && lock.pid && !isProcessAlive(lock.pid)) {
      await removeLock(info.directory);
      cleaned++;
    }
  }

  return { cleaned };
}

// ============================================================================
// Pi Extension
// ============================================================================

export default function (pi: ExtensionAPI) {
  // Initialize store on startup
  loadStore().then((s) => {
    store = s;
  });

  // ============================================================================
  // Tools
  // ============================================================================

  // Create worktree
  pi.registerTool({
    name: "worktree_create",
    label: "Create Worktree",
    description: "Create an isolated git worktree for experimenting",
    parameters: Type.Object({
      name: Type.Optional(
        Type.String({
          description: "Name for the worktree (will be slugified and made unique)",
        })
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      try {
        // Check if git repo
        if (!(await isGitRepo())) {
          return {
            content: [{ type: "text", text: "❌ Not a git repository. Worktrees require a git repo." }],
            isError: true,
            details: {},
          };
        }

        // Check if name already exists
        if (params.name) {
          const existing = await findWorktree(params.name);
          if (existing) {
            return {
              content: [
                {
                  type: "text",
                  text:
                    `ℹ️ Worktree "${existing.name}" already exists\n\n` +
                    `Branch: \`${existing.branch}\`\n` +
                    `Path: \`${existing.directory}\`\n\n` +
                    `Use \`cd ${existing.directory}\` to enter it.`,
                },
              ],
              details: existing,
            };
          }
        }

        const info = await createWorktree(params.name);

        return {
          content: [
            {
              type: "text",
              text:
                `## 🌳 Worktree Created\n\n` +
                `**Name:** ${info.name}\n` +
                `**Branch:** \`${info.branch}\`\n` +
                `**Directory:** \`${info.directory}\`\n\n` +
                `Use \`cd ${info.directory}\` to enter the sandbox.`,
            },
          ],
          details: info,
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `❌ Failed to create worktree: ${error.message}` }],
          isError: true,
          details: { error: error.message },
        };
      }
    },
  });

  // List worktrees
  pi.registerTool({
    name: "worktree_list",
    label: "List Worktrees",
    description: "List all worktrees in this project",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, _ctx) {
      const worktrees = await listWorktrees();
      const gitWorktrees = await listGitWorktrees();
      const currentDir = process.cwd();

      if (worktrees.length === 0) {
        return {
          content: [
            {
              type: "text",
              text:
                "## 🌳 Worktrees\n\n" +
                "No worktrees created yet.\n\n" +
                "Use `/worktree create <name>` or `worktree_create` tool to create one for safe experimentation.",
            },
          ],
          details: { worktrees: [] },
        };
      }

      const primaryDir = await getPrimaryDirectory();
      const lines = worktrees.map((wt) => {
        const gitEntry = gitWorktrees.find(
          (g) => path.normalize(g.path) === path.normalize(wt.directory)
        );
        const isCurrent = path.normalize(wt.directory) === path.normalize(currentDir);
        const isMain = path.normalize(wt.directory) === path.normalize(primaryDir);

        let icon = "🌿";
        if (isMain) icon = "🏠";
        else if (isCurrent) icon = "📍";

        let status = "";
        if (gitEntry?.isMain) status = " (main)";
        else if (isCurrent) status = " (current)";

        return `${icon} **${wt.name}**${status}\n   Branch: \`${wt.branch}\`\n   Path: \`${wt.directory}\``;
      });

      return {
        content: [
          {
            type: "text",
            text: "## 🌳 Worktrees\n\n" + lines.join("\n\n") + "\n\nUse `/worktree create <name>` to add more.",
          },
        ],
        details: { worktrees },
      };
    },
  });

  // Remove worktree
  pi.registerTool({
    name: "worktree_remove",
    label: "Remove Worktree",
    description: "Remove a worktree and clean up its branch",
    parameters: Type.Object({
      name: Type.String({
        description: "Name of the worktree to remove",
      }),
      force: Type.Optional(
        Type.Boolean({
          description: "Force removal even if worktree is dirty",
        })
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      try {
        const info = await getWorktreeInfo(params.name);
        if (!info) {
          return {
            content: [{ type: "text", text: `❌ Worktree "${params.name}" not found` }],
            isError: true,
            details: {},
          };
        }

        await removeWorktree(params.name);

        return {
          content: [
            {
              type: "text",
              text: `✅ Worktree "${params.name}" removed.\n\nBranch \`${info.branch}\` deleted. Directory cleaned up.`,
            },
          ],
          details: { removed: params.name },
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `❌ Failed to remove worktree: ${error.message}` }],
          isError: true,
          details: { error: error.message },
        };
      }
    },
  });

  // Reset worktree
  pi.registerTool({
    name: "worktree_reset",
    label: "Reset Worktree",
    description: "Reset a worktree to the default branch, discarding local changes",
    parameters: Type.Object({
      name: Type.String({
        description: "Name of the worktree to reset",
      }),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      try {
        const defaultBranch = await getDefaultBranch();
        await resetWorktree(params.name);

        return {
          content: [
            {
              type: "text",
              text: `✅ Worktree "${params.name}" reset to \`${defaultBranch}\`.\n\nAll local changes discarded.`,
            },
          ],
          details: { reset: params.name, branch: defaultBranch },
        };
      } catch (error: any) {
        return {
          content: [{ type: "text", text: `❌ Failed to reset worktree: ${error.message}` }],
          isError: true,
          details: { error: error.message },
        };
      }
    },
  });

  // Status
  pi.registerTool({
    name: "worktree_status",
    label: "Worktree Status",
    description: "Check the status of a worktree",
    parameters: Type.Object({
      name: Type.Optional(
        Type.String({
          description: "Name of the worktree to check (current if not specified)",
        })
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      let info: WorktreeInfo | null;
      let targetDir: string;

      if (params.name) {
        info = await getWorktreeInfo(params.name);
        if (!info) {
          return {
            content: [{ type: "text", text: `Worktree "${params.name}" not found` }],
            isError: true,
            details: {},
          };
        }
        targetDir = info.directory;
      } else {
        targetDir = process.cwd();
        info = null;
        // Try to find current worktree
        const worktrees = await listWorktrees();
        info = worktrees.find(
          (wt) => path.normalize(wt.directory) === path.normalize(targetDir)
        ) || null;
      }

      // Get git status
      const status = await git(["status", "--porcelain"], targetDir);
      const branch = await git(["branch", "--show-current"], targetDir);

      const hasChanges = status.stdout.trim().length > 0;

      let report = `## 🌳 ${info?.name || "Current Directory"}\n\n`;
      report += `**Path:** \`${targetDir}\`\n`;
      if (info) {
        report += `**Branch:** \`${info.branch}\`\n`;
        report += `**Created:** ${new Date(info.createdAt).toLocaleString()}\n\n`;
      } else {
        report += `**Branch:** \`${branch.stdout || "unknown"}\`\n\n`;
      }

      if (hasChanges) {
        report += `### ⚠️ Uncommitted Changes\n\n\`\`\`\n${status.stdout}\n\`\`\`\n\n`;
        report += `Use \`/worktree reset ${info?.name}\` to discard changes.`;
      } else {
        report += `### ✅ Clean\n\nNo uncommitted changes.`;
      }

      return {
        content: [{ type: "text", text: report }],
        details: { info, hasChanges, status: status.stdout },
      };
    },
  });

  // Cd (print path)
  pi.registerTool({
    name: "worktree_cd",
    label: "Worktree Cd",
    description: "Print the path of a worktree for switching into it",
    parameters: Type.Object({
      name: Type.Optional(
        Type.String({
          description: "Name of the worktree (current if not specified)",
        })
      ),
    }),
    async execute(_toolCallId, params, _signal, _onUpdate, _ctx) {
      if (!params.name) {
        return {
          content: [{ type: "text", text: `Current directory: ${process.cwd()}` }],
          details: { path: process.cwd() },
        };
      }

      const info = await findWorktree(params.name);
      if (!info) {
        return {
          content: [{ type: "text", text: `Worktree not found: ${params.name}` }],
          isError: true,
          details: {},
        };
      }

      return {
        content: [
          {
            type: "text",
            text: `\`\`\`bash\ncd ${info.directory}\n\`\`\`\n\nWorktree **${info.name}**:\n- Branch: \`${info.branch}\`\n- Path: \`${info.directory}\``,
          },
        ],
        details: { worktree: info },
      };
    },
  });

  // Prune
  pi.registerTool({
    name: "worktree_prune",
    label: "Prune Worktrees",
    description: "Clean up stale worktree references and directories",
    parameters: Type.Object({}),
    async execute(_toolCallId, _params, _signal, _onUpdate, _ctx) {
      const { removed, warnings } = await pruneWorktrees();
      const { cleaned } = await cleanupStaleLocks();

      let report = "## 🌳 Prune Complete\n\n";
      report += `Removed ${removed} stale worktree entries.\n`;
      if (cleaned > 0) {
        report += `Cleaned ${cleaned} stale locks.\n`;
      }

      if (warnings.length > 0) {
        report += `\n### Warnings\n\n${warnings.join("\n")}`;
      }

      return {
        content: [{ type: "text", text: report }],
        details: { removed, cleaned },
      };
    },
  });

  // ============================================================================
  // Commands
  // ============================================================================

  pi.registerCommand("worktree", {
    description: "Git worktree management",
    handler: async (args, ctx) => {
      const parts = args.split(/\s+/);
      const cmd = parts[0] || "";
      const name = parts.slice(1).join(" ");

      switch (cmd) {
        case "create":
        case "new": {
          if (!name) {
            ctx.ui.notify("Usage: /worktree create <name>", "error");
            return;
          }
          if (!(await isGitRepo())) {
            ctx.ui.notify("Not in a git repository", "error");
            return;
          }
          ctx.ui.notify(`🌳 Creating worktree "${name}"...`, "info");
          break;
        }

        case "list":
        case "ls": {
          const worktrees = await listWorktrees();
          if (worktrees.length === 0) {
            ctx.ui.notify("🌳 No worktrees created yet", "info");
          } else {
            const list = worktrees.map((wt) => `• ${wt.name}: ${wt.branch}`).join("\n");
            ctx.ui.notify(`🌳 Worktrees (${worktrees.length})\n\n${list}`, "info");
          }
          break;
        }

        case "remove":
        case "rm": {
          if (!name) {
            ctx.ui.notify("Usage: /worktree remove <name>", "error");
            return;
          }
          const info = await getWorktreeInfo(name);
          if (!info) {
            ctx.ui.notify(`Worktree "${name}" not found`, "error");
            return;
          }
          ctx.ui.notify(`🌳 Removing worktree "${name}"...`, "info");
          break;
        }

        case "reset": {
          if (!name) {
            ctx.ui.notify("Usage: /worktree reset <name>", "error");
            return;
          }
          ctx.ui.notify(`🌳 Resetting worktree "${name}"...`, "info");
          break;
        }

        case "cd": {
          if (!name) {
            ctx.ui.notify(`Current: ${process.cwd()}`, "info");
          } else {
            const info = await findWorktree(name);
            if (info) {
              ctx.ui.notify(`Path: ${info.directory}`, "info");
            } else {
              ctx.ui.notify(`Worktree not found: ${name}`, "error");
            }
          }
          break;
        }

        case "prune": {
          ctx.ui.notify("🌳 Pruning stale worktrees...", "info");
          break;
        }

        case "status": {
          const info = name ? await getWorktreeInfo(name) : null;
          const status = await git(["status", "--porcelain"], info?.directory);
          const hasChanges = status.stdout.trim().length > 0;
          if (hasChanges) {
            ctx.ui.notify(`⚠️ Worktree has uncommitted changes`, "warning");
          } else {
            ctx.ui.notify("✅ Worktree is clean", "info");
          }
          break;
        }

        default: {
          ctx.ui.notify(
            "🌳 Worktree Commands\n\n" +
              "  /worktree create <name>  - Create new worktree\n" +
              "  /worktree list           - List all worktrees\n" +
              "  /worktree remove <name>  - Remove worktree\n" +
              "  /worktree reset <name>   - Reset to default branch\n" +
              "  /worktree cd [name]      - Print worktree path\n" +
              "  /worktree prune          - Clean up stale refs\n" +
              "  /worktree status [name]   - Check worktree status",
            "info"
          );
        }
      }
    },
  });

  // ============================================================================
  // Event Handlers
  // ============================================================================

  // Note: "session_end" event may not be available in all pi versions
  // Uncomment when the event type is supported:
  // pi.on("session_end", async (_event: any, _ctx: any) => {
  //   const { cleaned } = await cleanupStaleLocks();
  //   if (cleaned > 0) {
  //     console.log(`[worktree] Cleaned ${cleaned} stale locks`);
  //   }
  // });
}
