#### 19:40:00 IST - T71: Created task — Chat View Scroll Performance and Streaming Follow

**Action:** Created
**Files:**
- Created: memory-bank/tasks/T71.md
- Modified: memory-bank/tasks.md (registry row)

Records the five chat-view commits on `perf/chat-scroll-settings-lag`:
`e32eb88` preview build + large-session fixture, `ff3f960` scroll/settings lag,
`7ecccdd` follow-scroll streaming with scroll-up interrupt, `5443c4e` mention
pills root-cause fix, `fa44b6f` send-scroll follow race (restore effect dep on
recreated `checkScrollPosition`; fixed via `checkScrollPositionRef`, deps
`[sessionId, restoreScrollTop]`). Red-first regression test in
`ChatMessages.followScroll.test.tsx`.
