# UI Test Session: T78 global tag normalization
**Date**: 2026-10-30 15:44:46 IST
**URL**: file:///tmp/t78-normalization-preview/index.html
**Tester**: Codex / Playwright with installed Chrome

## Test Objective and Conditions
Actual NormalizeSessionTagsModal and normalization code bundled with an Obsidian
DOM adapter and fixture storage/provider. No Obsidian app or production archive.
Viewports: desktop 1280×1000 and mobile 390×844. Console errors/warnings captured.

## Test Steps Log
1. Open modal, request fixture related-term proposals. Three groups displayed;
   semantic groups are initially unchecked. PASS; no console errors/warnings.
2. Select AI and research groups, leave ML unchecked. Editable canonical fields
   and summary report two selected groups affecting 15 sessions. PASS.
3. Capture desktop and mobile. Initial mobile Sessions header overflow was fixed;
   final document/table horizontal overflow checks are false. PASS.
4. Apply on mobile. Fifteen sessions updated; AI equivalents consolidated,
   Research Notes replaced, existing canonical research labels left alone,
   skipped ML labels preserved. PASS; no console errors/warnings.

## Screenshots
- [Desktop](../assets/T78-normalization-desktop-2026-10-30.png)
- [Mobile](../assets/T78-normalization-mobile-2026-10-30.png)

## Remaining Acceptance
Real Obsidian/theme/device integration and configured-provider requests remain
pending. The full test suite also retains its six documented baseline failures.
