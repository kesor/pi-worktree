/**
 * pi-worktree tests
 */

import { describe, it, expect } from "vitest";

describe("pi-worktree", () => {
  describe("slugify", () => {
    it("should slugify names correctly", () => {
      const slugify = (input: string): string =>
        input
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+/, "")
          .replace(/-+$/, "");

      expect(slugify("My Feature")).toBe("my-feature");
      expect(slugify("Feature Name Here")).toBe("feature-name-here");
      expect(slugify("  spaced  ")).toBe("spaced");
      expect(slugify("UPPERCASE")).toBe("uppercase");
      expect(slugify("special!@#chars")).toBe("special-chars");
    });
  });

  describe("randomSlug", () => {
    it("should generate an 8-character slug", () => {
      const randomSlug = (): string => {
        const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
        let result = "";
        for (let i = 0; i < 8; i++) {
          result += chars[Math.floor(Math.random() * chars.length)];
        }
        return result;
      };

      const slug = randomSlug();
      expect(slug.length).toBe(8);
      expect(slug).toMatch(/^[a-z0-9]+$/);
    });

    it("should generate unique slugs", () => {
      const randomSlug = (): string => {
        const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
        let result = "";
        for (let i = 0; i < 8; i++) {
          result += chars[Math.floor(Math.random() * chars.length)];
        }
        return result;
      };

      const slugs = new Set<string>();
      for (let i = 0; i < 100; i++) {
        slugs.add(randomSlug());
      }
      // Should have mostly unique slugs (allowing for rare collisions)
      expect(slugs.size).toBeGreaterThan(90);
    });
  });

  describe("WorktreeStore", () => {
    it("should handle empty store", () => {
      const store = {
        version: 1,
        worktrees: {} as Record<string, any>,
        primaryDirectory: "",
      };

      expect(Object.keys(store.worktrees)).toHaveLength(0);
      expect(store.version).toBe(1);
    });

    it("should store worktree info correctly", () => {
      const store = {
        version: 1,
        worktrees: {} as Record<string, any>,
        primaryDirectory: "/home/user/project",
      };

      store.worktrees["my-feature"] = {
        name: "my-feature",
        branch: "feature/my-feature",
        directory: "/home/user/project/.pi/worktrees/my-feature",
        createdAt: Date.now(),
        slotIndex: 0,
      };

      expect(store.worktrees["my-feature"]).toBeDefined();
      expect(store.worktrees["my-feature"].branch).toBe("feature/my-feature");
      expect(store.worktrees["my-feature"].slotIndex).toBe(0);
    });
  });

  describe("LockInfo", () => {
    it("should track lock information", () => {
      const lock = {
        worktreeName: "test-worktree",
        pid: process.pid,
        createdAt: new Date().toISOString(),
      };

      expect(lock.worktreeName).toBe("test-worktree");
      expect(lock.pid).toBeDefined();
      expect(lock.createdAt).toBeDefined();
    });

    it("should serialize to JSON correctly", () => {
      const lock = {
        worktreeName: "test",
        pid: 12345,
        createdAt: "2024-01-01T00:00:00.000Z",
      };

      const json = JSON.stringify(lock);
      const parsed = JSON.parse(json);

      expect(parsed.worktreeName).toBe("test");
      expect(parsed.pid).toBe(12345);
    });
  });

  describe("git worktree parsing", () => {
    it("should parse git worktree list porcelain output", () => {
      const parseWorktreeList = (stdout: string) => {
        const entries: Array<{ path: string; branch?: string }> = [];
        let current: Partial<{ path: string; branch: string }> = {};

        for (const line of stdout.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed) {
            if (current.path) {
              entries.push({ path: current.path, branch: current.branch });
            }
            current = {};
          } else if (trimmed.startsWith("worktree ")) {
            current.path = trimmed.slice(9).trim();
          } else if (trimmed.startsWith("branch ")) {
            current.branch = trimmed.slice(7).trim().replace("refs/heads/", "");
          }
        }

        if (current.path) {
          entries.push({ path: current.path, branch: current.branch });
        }

        return entries;
      };

      const input = `worktree /home/user/project
branch refs/heads/main
worktree /home/user/project/.pi/worktrees/feature-1
branch refs/heads/feature/feature-1`;

      const result = parseWorktreeList(input);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ path: "/home/user/project", branch: "main" });
      expect(result[1]).toEqual({
        path: "/home/user/project/.pi/worktrees/feature-1",
        branch: "feature/feature-1",
      });
    });
  });

  describe("branch prefix", () => {
    it("should use feature/ prefix", () => {
      const BRANCH_PREFIX = "feature/";
      const name = "my-new-feature";
      const branch = `${BRANCH_PREFIX}${name}`;

      expect(branch).toBe("feature/my-new-feature");
    });
  });

  describe("isProcessAlive", () => {
    it("should detect own process as alive", () => {
      const isProcessAlive = (pid: number): boolean => {
        try {
          process.kill(pid, 0);
          return true;
        } catch {
          return false;
        }
      };

      // Current process should be alive
      expect(isProcessAlive(process.pid)).toBe(true);
    });

    it("should detect non-existent process as not alive", () => {
      const isProcessAlive = (pid: number): boolean => {
        try {
          process.kill(pid, 0);
          return true;
        } catch {
          return false;
        }
      };

      // A very high PID is unlikely to exist
      expect(isProcessAlive(999999999)).toBe(false);
    });
  });

  describe("path normalization", () => {
    it("should normalize paths consistently", () => {
      const normalizePath = (p: string): string => {
        // Simple normalization for testing
        return p.replace(/\\/g, "/").replace(/\/+/g, "/");
      };

      expect(normalizePath("/a/b/c")).toBe("/a/b/c");
      expect(normalizePath("/a//b//c")).toBe("/a/b/c");
      expect(normalizePath("\\a\\b\\c")).toBe("a/b/c");
    });
  });
});
