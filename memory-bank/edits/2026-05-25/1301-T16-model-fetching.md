---
kind: edit_chunk
id: 2026-05-25-1301-t16-model-fetching
created_at: 2026-05-25 13:01:00 IST
task_ids: [T16]
source_branch: main
source_commit: 9d3d1a3
---

#### 13:01:00 IST - T16: Fix model fetching for all providers in ProfileCard
- Modified `src/components/ProfileCard.tsx` - Replaced inline handleFetchModels with ChatApiManager.fetchModels() delegation
- Modified `src/components/ProfileCard.tsx` - Added plugin prop to ProfileEditForm, ProfileCard, ProfileCardProps interface
- Modified `src/components/ProfileCard.tsx` - ProfileList passes plugin to each ProfileCard
- Modified `src/components/ProfileCard.tsx` - handleFetchModels now uses: new ChatApiManager(plugin.settings, plugin.app).fetchModels(draft)

#### 12:55:00 IST - T16: Fix duplicate profile ID on copy
- Modified `src/components/ProfileCard.tsx` - handleDuplicate now destructures id before spreading source fields: const { id: _unused, ...sourceWithoutId } = source
- Modified `src/components/ProfileCard.tsx` - createProviderProfile receives sourceWithoutId instead of full source, ensuring new unique ID generation
