# Bug Fix: Removed Invalid `signal` Parameter

**Date:** January 2025
**Issue:** Server crash on first LLM message
**Status:** ✅ Fixed

---

## Problem

When sending the first message to the LLM, the server threw this error:

```
BadRequestError: 400 {"type":"error","error":{"type":"invalid_request_error","message":"signal: Extra inputs are not permitted"},"request_id":"req_011CUVTux5CXSmWR1EYJ7sty"}
```

**Root Cause:** The Anthropic SDK's `messages.create()` method does not accept a `signal` parameter for AbortController.

---

## Solution

**Changed:** `server/claude-agent.js` line 393

**Before:**
```javascript
const stream = await anthropicClient.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 4096,
  messages,
  tools,
  stream: true,
  signal: abortController.signal  // ❌ Not supported
});
```

**After:**
```javascript
const stream = await anthropicClient.messages.create({
  model: 'claude-sonnet-4-20250514',
  max_tokens: 4096,
  messages,
  tools,
  stream: true  // ✅ Removed signal parameter
});
```

---

## Abort Mechanism Still Works

The abort functionality is **still fully functional** using manual checking:

```javascript
// Create abort controller
const abortController = new AbortController();
activeStreams.set(ws, { abortController, conversationId, messageId, startTime });

// Check abort status on each stream event
for await (const event of stream) {
  if (abortController.signal.aborted) {
    break;  // Exit loop gracefully
  }
  // Process event...
}
```

**How it works:**
1. User clicks "Stop" button
2. `stopGeneration()` calls `abortController.abort()`
3. `abortController.signal.aborted` becomes `true`
4. Next stream iteration detects abort and breaks out of loop
5. Database updated, client notified, tracking cleaned up

---

## Testing

**Test Case 1: Normal Message**
```
✅ Send message "hi" → Receives streaming response → Works correctly
```

**Test Case 2: Stop During Generation**
```
✅ Send long message → Click stop → Generation stops → Client notified
```

**Test Case 3: Client Disconnect**
```
✅ Send message → Close browser tab → Server detects disconnect → Stream stopped
```

---

## Files Modified

1. **server/claude-agent.js** (line 387-393)
   - Removed `signal: abortController.signal` parameter

2. **CLAUDE_AGENT_ENHANCED.md**
   - Updated documentation to reflect manual abort checking

---

## Impact

**Before Fix:**
- ❌ Server crashed on first LLM message
- ❌ 400 Bad Request error
- ❌ Chat interface unusable

**After Fix:**
- ✅ Messages send successfully
- ✅ Streaming works correctly
- ✅ Stop functionality still works
- ✅ Client disconnect handling still works

---

## Related Documentation

- [CLAUDE_AGENT_ENHANCED.md](CLAUDE_AGENT_ENHANCED.md) - Stop functionality details
- [WEBSOCKET_PROTOCOL.md](WEBSOCKET_PROTOCOL.md) - WebSocket message types
- [PHASE1_COMPLETE_SUMMARY.md](PHASE1_COMPLETE_SUMMARY.md) - Backend architecture

---

**Status:** ✅ Fixed and Tested
**Ready for Production:** Yes
