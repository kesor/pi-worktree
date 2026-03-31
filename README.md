# 🌳 pi-worktree

Git worktree sandboxes for safe experimentation.

## Overview

`pi-worktree` creates isolated git worktrees so you can experiment freely without affecting your main branch or losing work. Each worktree gets its own branch and directory, keeping your changes completely separate.

## Features

- **Create** isolated worktrees for experiments
- **List** all worktrees with status indicators
- **Remove** worktrees and clean up their branches
- **Reset** worktrees to the default branch (discarding changes)
- **Status** check to see uncommitted changes
- **Cd** print worktree path for switching
- **Prune** clean up stale worktree references

### Safety Features

- **Lock files** - prevent conflicts with other processes
- **Stale lock cleanup** - automatically detect and clean orphaned locks
- **Primary worktree protection** - can't accidentally remove the main repo
- **Gitignore auto-add** - automatically adds `.pi/worktrees/` to global gitignore
- **Branch validation** - checks before creating duplicate branches

## Commands

| Command | Description |
|---------|-------------|
| `/worktree create <name>` | Create a new worktree |
| `/worktree list` | List all worktrees |
| `/worktree remove <name>` | Remove a worktree |
| `/worktree reset <name>` | Reset worktree to default branch |
| `/worktree cd [name]` | Print worktree path |
| `/worktree prune` | Clean up stale worktree references |
| `/worktree status [name]` | Check worktree status |

## Tools

| Tool | Description |
|------|-------------|
| `worktree_create` | Create a new worktree |
| `worktree_list` | List all worktrees |
| `worktree_remove` | Remove a worktree |
| `worktree_reset` | Reset worktree to default branch |
| `worktree_status` | Check worktree status |
| `worktree_cd` | Print worktree path |
| `worktree_prune` | Clean up stale worktree references |

## How It Works

1. **Worktrees** are stored in `.pi/worktrees/`
2. Each worktree gets a branch prefixed with `feature/`
3. Lock files (`.worktree.lock`) prevent conflicts
4. Global gitignore is updated to exclude worktree directory
5. Stale entries are cleaned up automatically

## Example Workflow

```bash
# Start an experiment
/worktree create dark-mode

# Work in the sandbox
cd .pi/worktrees/dark-mode

# Make risky changes...
# Test them out...

# If happy: commit and merge
git checkout main
git merge feature/dark-mode

# If unhappy: just remove the worktree
/worktree remove dark-mode
# All changes gone, main branch untouched!
```

## Lock Files

Each worktree has a `.worktree.lock` file that contains:
- Worktree name
- PID of the process that created it
- Timestamp

This prevents conflicts and enables stale lock detection.

## Global Gitignore

When creating a worktree, the extension automatically adds `.pi/worktrees/` to your global gitignore (`~/.gitignore` or configured location). This keeps your worktrees from appearing in git status commands.

## Comparison with @zenobius/pi-worktrees

This extension is a simplified version inspired by [@zenobius/pi-worktrees](https://github.com/zenobius/pi-worktrees).

For more advanced features like:
- Pattern-matched settings per repository
- `onCreate`/`onSwitch`/`onBeforeRemove` hooks
- Template variables (`{{path}}`, `{{name}}`, `{{branch}}`, etc.)
- Configuration service with schema validation

See the full [@zenobius/pi-worktrees](https://github.com/zenobius/pi-worktrees) implementation.

## Inspiration

This extension was built with insights from:
- [@zenobius/pi-worktrees](https://github.com/zenobius/pi-worktrees)
- [Opencode's worktree implementation](https://github.com/opencode-ai/opencode)
- [pi-autoresearch](https://github.com/monotykamary/pi-autoresearch)
- [pi-side-agents](https://github.com/your-username/pi-side-agents)

## Requirements

- Git repository
- Git version 2.5+ (for worktree support)

## Installation

```bash
pi extension install pi-worktree
```

## License

MIT
