# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0](https://github.com/kesor/pi-worktree/releases/tag/v0.1.0) (2024-01-01)

### Features

- Create isolated git worktrees for experiments
- List all worktrees with status indicators
- Remove worktrees and clean up branches
- Reset worktrees to the default branch
- Check worktree status for uncommitted changes
- Print worktree path for switching
- Prune stale worktree references

### Safety Features

- Lock files to prevent conflicts
- Stale lock detection and cleanup
- Primary worktree protection
- Global gitignore auto-configuration
- Branch validation

### Commands

- `/worktree create <name>` - Create a new worktree
- `/worktree list` - List all worktrees
- `/worktree remove <name>` - Remove a worktree
- `/worktree reset <name>` - Reset to default branch
- `/worktree cd [name]` - Print worktree path
- `/worktree status [name]` - Check worktree status
- `/worktree prune` - Clean up stale references
