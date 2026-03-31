# Release Process

This project uses [release-please](https://github.com/googleapis/release-please) for automated changelog generation and releases.

## How It Works

1. When you push to `main`, release-please creates a PR with updated changelog
2. Merging the PR triggers the release
3. The workflow publishes to npm with the appropriate tag

## Triggering a Release

1. **Standard release**: Push to `main` - release-please will create a PR
2. **Manual release**: Use the "Publish" workflow in GitHub Actions with the desired tag

## Version Bump

The version is automatically bumped based on [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` → minor version bump
- `fix:` → patch version bump
- `feat!:` or `fix!:` → major version bump

## NPM Token

Publishing requires `NPM_TOKEN` secret configured in the repository settings.
