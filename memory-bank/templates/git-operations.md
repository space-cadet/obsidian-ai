# Git Operations Log Template
*This template documents significant VCS operations: branch creation, PR activity, and merges to main*

## File Structure

```markdown
# Git Operations Log
*Created: YYYY-MM-DD HH:MM:SS IST*
*Last Updated: YYYY-MM-DD HH:MM:SS IST*

## Overview
- **Total Branches**: N
- **Total PRs Merged**: N
- **Last Operation**: YYYY-MM-DD HH:MM:SS IST

## YYYY-MM-DD

### HH:MM:SS IST - TaskID: Operation Summary
- **Type**: [branch-create | branch-delete | pr-create | pr-merge | release]
- **Details**: [Specific information about the operation]
- **Link**: [GitHub URL if applicable]
- **Notes**: [Optional additional context]

#### Example: Branch Creation
- **Type**: branch-create
- **Details**: Created branch `claude/fix-url-handling-doi-ads-0191GzpqjD1b2B3A36nCWwno` for T13b
- **Link**: n/a
- **Notes**: Feature branch for DOI and NASA ADS URL support

#### Example: PR Creation
- **Type**: pr-create
- **Details**: PR #56 "feat(T13b): Enhanced paper source support" with 4 commits
- **Stats**: +1542 additions, -62 deletions
- **Link**: https://github.com/space-cadet/arxivite/pull/56
- **Notes**: Supports 9 academic paper sources (4 with full metadata extraction)

#### Example: PR Merge to Main
- **Type**: pr-merge
- **Details**: Merged PR #56 to main - T13b enhancement complete
- **Commits**: ff087e3, 6ab3adb, b83738a, db59c80
- **Commit Types**: 2 feat, 2 docs, 1 fix
- **Files Changed**: 16 files (9 modified, 5 created, 2 image assets)
- **File Categories**: 4 source files, 8 documentation, 2 API, 2 config
- **Stats**: +1542 additions, -62 deletions
- **Dependencies Modified**: Yes (env config added for ADS API key)
- **Breaking Changes**: No
- **Task Status**: ✅ T13b complete
- **Link**: https://github.com/space-cadet/arxivite/pull/56
- **Notes**: Feature now in production - 9 paper sources supported
```

## Recording Guidelines
- Record only **significant operations** (not every commit)
- **Mandatory fields**: Type, Details, Link
- **For branch-create**: Include purpose/scope and related task
- **For pr-create**: Include branch name, commit count, and task reference
- **For pr-merge**: Include commit breakdown, files changed, dependencies modified, breaking changes, task status
- Use **IST timezone** for all timestamps
- Prepend new entries to top of the day section
- Maintain **chronological order** within each day (newest first)
- Link to GitHub when applicable (PRs, branches)
- File categories: source (src/), API (api/), config, documentation, tests, assets
