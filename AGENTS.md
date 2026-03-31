# AGENTS.md

This file contains instructions for AI agents working on this project.

## Project Overview

`pi-worktree` is a Pi Coding Agent extension that provides git worktree management. It creates isolated worktrees for safe experimentation.

## Key Commands

### Development
```bash
# Install dependencies
npm install

# Type check
npm run typecheck

# Run tests
npm test

# Format code
npm run format
```

### Publishing
```bash
# Publish to npm (requires GitHub Actions)
# Use the publish workflow in .github/workflows/publish.yml
```

## Architecture

- `src/index.ts` - Main extension entry point
- `tests/` - Unit tests using Vitest
- Tools and commands are registered via the ExtensionAPI

## Testing

Run tests with:
```bash
npm test
```

## Release Process

This project uses release-please for automated changelog generation. Releases are managed via GitHub Actions.
