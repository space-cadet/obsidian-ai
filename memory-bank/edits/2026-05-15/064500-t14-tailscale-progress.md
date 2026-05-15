# Edit: T14 Status Update + Tailscale Progress
*Created: 2026-05-15 06:45 IST*
*Task: T14*

## Changes

### `memory-bank/activeContext.md`
- Updated T14a status from "ASSIGNED TO HUMAN" → "IN PROGRESS" (2/3 complete)
- Updated T14 Phase 3 from "blocked on T14a" → "in progress"
- Added specific blocker: ufw on VPS only has IPv6 rules, needs IPv4 rule on `tailscale0`
- Added device details: MacBook `100.92.54.38`, VPS `100.89.228.41`

### `memory-bank/tasks/T14.md`
- Updated status: Phase 3 "in progress — Obsidian configured, connection test hanging"
- Changed Phase 3 from ⏳ Blocked → 🔄 In progress

## Context

Deepak completed Cloudy migration to DO VPS this morning. Tailscale installed on both MacBook and VPS, authenticated successfully. Obsidian AI plugin already has agent provider code (pushed in commit `3b4fc04`). Settings configured with VPS tailnet IP, but connection test hangs. Network diagnosis revealed ufw firewall blocking inbound IPv4 Tailscale traffic.

## Verification

Pending confirmation of ufw fix on VPS. Once applied:
1. `ping 100.89.228.41` from MacBook should succeed
2. `curl http://100.89.228.41:18789/v1/responses` from MacBook should return (even if 401)
3. Obsidian "Test connection" button should complete
