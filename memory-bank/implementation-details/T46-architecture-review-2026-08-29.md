# T46 Architecture Review Record — 2026-08-29

**Review timestamp**: 2026-08-29 16:48:06 IST
**Review skill**: `improve-codebase-architecture`
**Reviewed source**: `main` at `63bce58`
**Archive commit**: `a08430bc86c71c27d22fc5bbb62c8b81aa04e48d`

## Durable Reports

- Previous baseline: [2026-08-27 review](../architecture-reviews/2026-08-27T12-47-architecture-review.html)
- Fresh review: [2026-08-29 review](../architecture-reviews/2026-08-29T16-48-06+0530-architecture-review.html)
- Archive index: [architecture-reviews/README.md](../architecture-reviews/README.md)

The August 27 report remains unchanged as the historical baseline. The fresh
review was read-only and compared the current source after the T46/T46a work.

## Findings and Current Decision

1. **Model-history policy remains the top action.** Tool replay, elision,
   truncation, request budgeting, and semantic compaction still cross
   `historyBuilder.ts`, `contextBudget.ts`, `semanticCompaction.ts`,
   `TurnLifecycle`, `AgentLoop`, and `OpenResponsesLoop`. T48/T48a/T48b/T48c
   and T62a retain policy ownership; T46 should consume one model-ready result
   rather than create another policy layer.
2. **TurnLifecycle is the next review boundary, not an automatic extraction.**
   The hook-level send/request finding is addressed by the 220-line hook, but
   `turnLifecycle.ts` remains broad at about 1,170 lines. First define the
   history-policy seam, then reassess whether lifecycle extraction is justified.
3. **Capability ownership is mostly consolidated.** The resolved registry now
   supplies descriptors, availability, model projections, and execution lookup.
   T60/T60a may simplify remaining executor/provider construction without
   introducing a second capability policy.
4. **Sync decomposition remains deferred at the time of this review.** The
   large sync modules were treated as a speculative concern, and no new sync
   task was warranted without new pressure at that point.

## Existing Task Ownership

- T46: physical orchestration boundaries, provider switching, and real-provider
  runtime acceptance.
- T48a: request budget and provider-window/attachment accounting.
- T48b: canonical tool replay and pairing.
- T48c: derived summaries, compaction, provenance, and exact retrieval.
- T62a: agent-mode elision decision and workflow regression acceptance.
- T64b: retention measurements, complete and retained as evidence.

No new task or subtask is created. The remaining architecture work crosses
existing owners and should be coordinated through these records.

## Planned Order

1. Define and test the single model-history projection boundary under T48,
   T48a, T48b, T48c, and T62a.
2. Reassess `TurnLifecycle` after that boundary is stable; extract only a
   complete concept if the module still has repeated policy seams.
3. Finish T46's provider-switching and real-provider runtime acceptance.
4. Revisit capability-construction cleanup under T60/T60a if it reduces
   duplicate setup without changing descriptor ownership.
5. Keep sync decomposition deferred until a concrete reliability or change
   pressure justifies it.

## Current Source Boundary

The current checkout contains `ChatTurnCoordinator.ts` and `ChatTurnOutput.ts`
under `src/agent/`; it does not contain `ChatTurnRequest.ts` or
`ChatTurnPersistence.ts`. Earlier references to those files are historical
records of an intermediate branch and are not current source claims.

## Implementation Slice — 2026-08-29

The selected automatic agent-mode preservation policy (T62a candidate Option
2; user-selected choice 1 in the implementation discussion) preserves tool
details for agent turns. The first implementation adds
`src/context/modelHistory.ts` as the shared entry point. It applies the
selected replay mode, checks tool pairing,
applies the request budget, and returns the exact messages sent to the model.

`TurnLifecycle` now uses that entry point. `AgentLoop` and
`OpenResponsesLoop` use its shared budget and result-limit helpers for their
in-progress tool turns. The saved transcript is unchanged. Normal chat still
uses its configured `elide` or `preserve` setting.

Verification completed: 45 test files / 381 tests, TypeScript, formatting, and
the production bundle passed. Provider switching and real-provider acceptance
remain separate T46 gates. Pairing through compaction and real agent-provider
workflow acceptance remain open under T48b/T48c/T62a.

## 2026-08-30 Monolithic-File Reassessment

The dated [overall monolithic-files audit](monolithic-files-audit-2026-08-30.md)
reassessed the current source after the pulled `579252b` changes. It confirms
that `storage.ts` remains a cross-domain coordinator spanning initialization,
chat persistence, sync orchestration, plugin-data recovery, and session-end
memory work. It also confirms that `turnLifecycle.ts` remains broad but should
be reassessed only after the single model-history policy seam is stable.

The first small turn-lifecycle extraction has now started: stop, retry, edit,
cancel-edit, and tool approval actions live in `src/agent/turnActions.ts`,
while `turnLifecycle.ts` retains the main `send()` path and execution policy.
This does not replace the model-history acceptance gates or change T46's
provider/runtime scope. CSS is intentionally outside T46 and is tracked
independently by T66.

## Later update — 2026-08-30

The review's earlier decision to defer sync decomposition has now been acted
on under T67. Persistence, sync coordination, and selected plugin-data sync
were moved into separate lifecycle modules through commits `0974157`,
`2995047`, and `56422f1`. The remaining T46 work is still provider switching,
real-provider runtime acceptance, and the model-history reassessment.
