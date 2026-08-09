# Presence Tracking Implementation

## Status: IN PROGRESS

## Changes Made

### 1. Relay Server (relay/server.js)
- Added presence tracking with join/leave events
- Room roster broadcast on connect
- userId tracking via URL query parameter

### 2. SyncAdapter Interface (src/sync/SyncAdapter.ts)
- Added `onUserList` callback
- Added `onPresence` callback

### 3. WebSocketSyncAdapter (src/sync/WebSocketSyncAdapter.ts)
- Implemented presence protocol
- URL now includes userId query parameter
- Handles roster, join, leave messages

### 4. useChatUI Hook (src/hooks/useChatUI.ts)
- Added `connectedUsers` state
- Added `showRemoteUserDropdown` state
- Added toggle/close handlers
- Added click-outside handler

### 5. ActionBar Component (src/components/ActionBar.tsx)
- Added remote user dropdown button
- Shows connected user count badge
- Uses globe icon

## Pending
- ChatApp.tsx wiring
- CSS styles for remote user dropdown
- Build verification
- Implementation details document
