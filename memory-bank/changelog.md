# Changelog

All notable changes to this project will be documented in this file.

## Unreleased - 2026-05-02

### Added
- Provider-profile based settings, migration helpers, and active-profile resolution - T9
- Fetch-models entry point and searchable picker shell in settings UI - T10
- Open-source community files and release-announcement draft - T8

### Changed
- Replaced the LangChain provider layer with Vercel AI SDK based model creation and streaming primitives - T4
- Standardized package-manager workflow on `pnpm` for build, package, and release operations - T8
- Normalized memory-bank task, session, registry, and history records back to the canonical templates - META-1

### Fixed
- Corrected the Kimi base URL to `https://api.moonshot.ai/v1` - T4
- Updated release workflows and metadata paths to match the renamed Obsidian AI project identity - T8

### Removed
- Legacy `@langchain/*` dependencies from the active implementation path - T4
