# Chat Interface Requirements - Analysis & Clarifications

## Current Implementation Analysis

### Existing Components

1. **WebSocketDebugOverlay** (`client/src/components/WebSocketDebugOverlay.jsx`)
   - Full-screen overlay debug panel
   - Shows all WebSocket messages
   - Supports messageId grouping for streaming
   - Has command input panel on the right side
   - Toggle with Ctrl+Shift+D

2. **Claude Agent** (`server/claude-agent.js`)
   - Handles streaming chat via `handleStreamingChat()`
   - Manages conversation history as array
   - Supports tool execution
   - No built-in stop mechanism
   - No token limit tracking
   - No conversation persistence

3. **Page Layout** (`SpreadSheetEditorPageJSONTemplateCreation.jsx`)
   - Spreadsheet editor on left (flex: 1)
   - Button panel on right (width: 200px)
   - WebSocketDebugOverlay as floating overlay

---

## Requirements Analysis & Clarifications

### 1. Chat Screen Stick to Right Side

**Current State:**
- Debug overlay is full-screen modal
- No dedicated chat UI

**Requirement Interpretation:**
Create a persistent chat panel on the right side of the screen (not overlay).

**Clarifications Needed:**

❓ **Q1.1:** Should the chat panel be:
- **Option A:** Always visible (fixed width, e.g., 400px)
- **Option B:** Collapsible/expandable
- **Option C:** Resizable with drag handle

❓ **Q1.2:** Layout structure:
```
Option A: Three columns
[Spreadsheet Editor] [Button Panel 200px] [Chat Panel 400px]

Option B: Two columns (merge buttons into chat)
[Spreadsheet Editor] [Chat Panel with integrated buttons]

Option C: Tabbed interface
[Spreadsheet Editor] [Right Panel: Tabs for "Tools" and "Chat"]
```
**Which layout do you prefer?**

❓ **Q1.3:** Should the WebSocketDebugOverlay still exist as a separate debug panel, or should it be replaced entirely by the chat panel?

❓ **Q1.4:** Chat panel features:
- Message history display (scrollable)
- Input box at bottom
- Tool execution visibility (inline or collapsed)
- User messages vs Assistant messages styling
- Timestamps?
- MessageId badges?

---

### 2. Message History & Token Limit Management

**Current State:**
- `conversationHistory` passed as parameter to `handleStreamingChat()`
- No token counting
- No automatic summarization
- History grows indefinitely

**Requirement Interpretation:**
Implement conversation summarization when token limit is reached.

**Clarifications Needed:**

❓ **Q2.1:** Token limit threshold:
- What token limit should trigger summarization? (e.g., 50K, 100K, 150K?)
- Claude Sonnet 4.5 context window is 200K tokens

❓ **Q2.2:** Summarization strategy:
```
Option A: Sliding window
- Keep last N messages
- Summarize older messages into single summary message
- Summary format: "Previous conversation summary: [summary text]"

Option B: Hierarchical summarization
- Summarize in chunks (e.g., every 10 messages)
- Keep recent messages + summaries
- Example:
  [Summary 1-10] [Summary 11-20] [Msg 21] [Msg 22] ... [Msg 30]

Option C: Smart retention
- Always keep: System prompts, important user instructions
- Summarize: Tool results, repetitive exchanges
- Preserve: Recent N messages (e.g., last 20)
```
**Which strategy do you prefer?**

❓ **Q2.3:** Who performs summarization:
- **Option A:** Ask Claude to summarize (costs API calls)
- **Option B:** Simple truncation (just remove old messages)
- **Option C:** Rule-based compression (remove tool results, keep instructions)

❓ **Q2.4:** Token counting:
- Should we use `@anthropic-ai/tokenizer` or approximate (4 chars ≈ 1 token)?
- Show token count in UI?

❓ **Q2.5:** Where to store conversation history:
- **Client-side:** In React state (lost on refresh)
- **Server-side:** In memory per WebSocket connection (lost on disconnect)
- **Persistent:** Database or file system
- **Hybrid:** Client state + server backup

---

### 3. Stop Generation Mid-Response

**Current State:**
- `handleStreamingChat()` uses `for await (const event of stream)`
- No abort mechanism
- Stream continues until completion

**Requirement Interpretation:**
Add ability to cancel ongoing Claude generation.

**Clarifications Needed:**

❓ **Q3.1:** How to trigger stop:
- **UI Button:** "Stop" button in chat panel (appears during generation)
- **WebSocket message:** `{ type: 'llm_stop' }` from client
- **Both**

❓ **Q3.2:** What happens when stopped:
```
Option A: Silent stop
- Just stop streaming
- No message to user
- Partial response is kept in history

Option B: Explicit acknowledgment
- Send message: "Generation stopped by user"
- Keep partial response with "[stopped]" marker
- Add to history as incomplete

Option C: Discard partial
- Remove partial response from history
- Send "Generation cancelled" message
- User can retry
```
**Which behavior do you prefer?**

❓ **Q3.3:** Implementation approach:
```javascript
Option A: AbortController (Anthropic SDK supports this)
const abortController = new AbortController();
const stream = await anthropicClient.messages.create({
  model: 'claude-sonnet-4-5',
  messages,
  tools,
  stream: true,
  signal: abortController.signal  // <-- Abort signal
});

// Later: abortController.abort()

Option B: Stream break
- Break out of for-await loop
- May leave connection in bad state

Option C: Connection close
- Close WebSocket connection
- Crude but effective
```
**Which implementation is acceptable?**

❓ **Q3.4:** Multiple concurrent generations:
- Can user send multiple prompts while one is streaming? (probably not)
- Should we queue requests or reject new ones during generation?

---

### 4. Stop on Client Disconnect

**Current State:**
- WebSocket disconnect detected in `ws.on('close')`
- No mechanism to stop ongoing Claude streaming

**Requirement Interpretation:**
When client disconnects, abort any ongoing Claude generation for that client.

**Clarifications Needed:**

❓ **Q4.1:** Implementation:
```javascript
// Track active streams per WebSocket connection
const activeStreams = new Map(); // ws -> abortController

ws.on('close', () => {
  const controller = activeStreams.get(ws);
  if (controller) {
    controller.abort();
    activeStreams.delete(ws);
  }
});
```
**Is this the desired behavior?**

❓ **Q4.2:** Should aborted messages be logged anywhere (server logs, database)?

---

### 5. Hide Tool Use Details in Chat

**Current State:**
- `llm_tool_use` messages sent to client with full tool input/output
- Debug overlay shows everything

**Requirement Interpretation:**
In the chat UI, show collapsed/minimal tool information.

**Clarifications Needed:**

❓ **Q5.1:** Display format:
```
Option A: Minimal inline
User: "Check the server status"
Assistant: [Using tool: get_spreadsheet_status] ✓
Assistant: "The server is running with 2 clients."

Option B: Expandable accordion
User: "Check the server status"
Assistant: 🔧 Using tool: get_spreadsheet_status [▼ Show details]
          (collapsed by default, click to expand)
Assistant: "The server is running with 2 clients."

Option C: Icon only
User: "Check the server status"
Assistant: 🔧 ⚡ (tool use happened, no details)
Assistant: "The server is running with 2 clients."

Option D: Side metadata
User: "Check the server status"
Assistant: "The server is running with 2 clients."
           [metadata: used 2 tools, 0.5s]
```
**Which display style do you prefer?**

❓ **Q5.2:** Should tool details be visible in:
- Chat panel: Collapsed/minimal
- Debug overlay: Full details (if debug overlay still exists)

❓ **Q5.3:** Should there be a global setting to "Show tool details" for power users?

---

### 6. Clear Conversation History

**Requirement Interpretation:**
Add command/button to clear all conversation history.

**Clarifications Needed:**

❓ **Q6.1:** Trigger method:
- **Button:** "Clear Chat" button in UI
- **Command:** Special message `{ type: 'llm_clear_history' }`
- **Keyboard:** Shortcut like Ctrl+Shift+K
- **All of the above**

❓ **Q6.2:** Confirmation:
- Should it ask "Are you sure?" before clearing?
- Or just clear immediately with undo option?

❓ **Q6.3:** What to clear:
- Only conversation history (messages)
- Also clear messageId tracking
- Reset tool use statistics
- Everything

❓ **Q6.4:** Server-side vs Client-side:
- Clear only client state
- Also notify server to clear its history
- Both should stay in sync

---

### 7. Export Conversation History

**Requirement Interpretation:**
Allow users to download conversation history.

**Clarifications Needed:**

❓ **Q7.1:** Export format:
```
Option A: JSON (structured)
{
  "conversationId": "uuid",
  "timestamp": "2025-01-15T10:30:00Z",
  "messages": [
    { "role": "user", "content": "...", "timestamp": "..." },
    { "role": "assistant", "content": "...", "timestamp": "...", "toolsUsed": [...] }
  ]
}

Option B: Markdown (readable)
# Conversation Export
Date: 2025-01-15

**User:** Check the server status
*[10:30:45]*

**Assistant:** The server is running with 2 clients.
*[10:30:47] [Tools: get_spreadsheet_status]*

Option C: Plain text (simple)
[10:30:45] User: Check the server status
[10:30:47] Assistant: The server is running with 2 clients.

Option D: All formats (let user choose)
```
**Which format(s) should be supported?**

❓ **Q7.2:** Export trigger:
- Button: "Export Chat" in UI
- Right-click context menu
- Keyboard shortcut

❓ **Q7.3:** What to include:
- All messages
- Exclude tool details (just tool names)
- Include timestamps
- Include messageId metadata
- Include token counts

❓ **Q7.4:** File naming:
- `conversation_YYYY-MM-DD_HH-MM-SS.json`
- `claude_chat_export.json`
- Let user specify name

---

### 8. Import Conversation History

**Requirement Interpretation:**
Load a previously exported conversation to continue it.

**Clarifications Needed:**

❓ **Q8.1:** Import method:
- File upload button
- Drag & drop JSON file
- Paste JSON into dialog
- All of the above

❓ **Q8.2:** Import behavior:
```
Option A: Replace current
- Clear existing history
- Load imported history
- Continue from there

Option B: Append
- Keep existing history
- Add imported messages at beginning
- Merge conversations

Option C: Ask user
- "Replace current conversation or append?"
```
**Which behavior?**

❓ **Q8.3:** Validation:
- Validate JSON structure before import
- Show preview before confirming
- Handle corrupted/invalid files gracefully

❓ **Q8.4:** Context restoration:
- Should imported conversation be "executable" (Claude sees all previous messages)?
- Or just for display/reference?

---

### 9. Redo/Undo Commands

**Requirement Interpretation:**
Allow undo/redo of operations.

**Clarifications Needed:**

❓ **Q9.1:** What operations can be undone:
```
Option A: Spreadsheet operations only
- Set cell value
- Add/delete rows
- Apply formatting
- NOT chat messages

Option B: Chat messages
- Undo last user message
- Regenerate assistant response
- Branch conversations

Option C: Both spreadsheet + chat
- Full operation history
- Undo anything

Option D: Specific actions
- Undo tool executions (reverse their effects)
- Undo data changes only
```
**What should undo/redo affect?**

❓ **Q9.2:** Implementation scope:
- **Spreadsheet undo/redo:** SpreadJS has built-in undo/redo (via commandManager)
- **Chat undo:** Need custom implementation
- **Tool execution undo:** Would need reverse operations for each tool

❓ **Q9.3:** Trigger method:
- Buttons in UI: ⟲ Undo / ⟳ Redo
- Keyboard: Ctrl+Z / Ctrl+Y
- Commands: `{ type: 'undo' }` / `{ type: 'redo' }`

❓ **Q9.4:** Undo chat message behavior:
```
Example conversation:
1. User: "Set A1 to 100"
2. Assistant: [Calls set_cell tool]
3. Assistant: "Done! Cell A1 is now 100"

If user clicks "Undo" on message 1:
Option A: Remove messages 1-3, revert spreadsheet change
Option B: Just remove messages from history, keep spreadsheet change
Option C: Not allowed (can't undo user messages, only regenerate assistant responses)
```
**What should happen?**

❓ **Q9.5:** History depth:
- Unlimited undo history (memory concern)
- Last N operations (e.g., 50)
- Session-only (cleared on refresh)

---

## Proposed Architecture

Based on requirements, here's a proposed architecture:

### Client-Side Components

```
SpreadSheetEditorPageJSONTemplateCreation.jsx
├── SpreadsheetEditor (left, flex: 1)
├── ButtonPanel (right-top, 200px, collapsible?)
└── ChatPanel (right-bottom, 400px width, resizable?)
    ├── MessageList (scrollable)
    │   ├── UserMessage
    │   ├── AssistantMessage
    │   ├── ToolUseIndicator (collapsed)
    │   └── SystemMessage
    ├── InputBox (bottom)
    │   ├── TextArea (prompt input)
    │   ├── SendButton
    │   └── StopButton (visible during generation)
    └── ChatControls
        ├── ClearButton
        ├── ExportButton
        ├── ImportButton
        └── TokenCounter (optional)
```

### Server-Side Enhancements

```javascript
// claude-agent.js additions

// Track active streams per client
const activeStreams = new Map(); // ws -> { abortController, messageId, startTime }

// Conversation management
const conversations = new Map(); // ws -> { messages[], tokenCount, summaries[] }

// Stop generation
function stopGeneration(ws) {
  const stream = activeStreams.get(ws);
  if (stream) {
    stream.abortController.abort();
    activeStreams.delete(ws);
  }
}

// Token counting
function estimateTokens(text) {
  return Math.ceil(text.length / 4); // Rough estimate
}

// Summarization (when token limit reached)
async function summarizeConversation(messages) {
  // Implementation depends on Q2.2 answer
}
```

### New WebSocket Message Types

```javascript
// Client -> Server
{ type: 'llm_user_prompt', message: '...', conversationId?: '...' }
{ type: 'llm_stop' }
{ type: 'llm_clear_history' }
{ type: 'llm_export_history' }
{ type: 'llm_import_history', history: [...] }
{ type: 'llm_undo' }
{ type: 'llm_redo' }

// Server -> Client
{ type: 'llm_assistant_response', text: '...', done: false, messageId: '...', tokenCount?: 123 }
{ type: 'llm_tool_use', toolName: '...', toolInput: {...}, messageId: '...', collapsed: true }
{ type: 'llm_tool_result', toolName: '...', result: {...}, messageId: '...', collapsed: true }
{ type: 'llm_stopped', reason: 'user_requested' | 'client_disconnect' }
{ type: 'llm_history_cleared' }
{ type: 'llm_history_exported', data: {...} }
{ type: 'llm_error', error: '...' }
```

---

## Implementation Phases (Proposed)

**Phase 1: Chat UI**
- Create ChatPanel component
- Integrate into page layout
- Basic message display

**Phase 2: Conversation Management**
- Implement conversation history tracking (client + server)
- Add token counting
- Implement summarization strategy (TBD based on Q2.2)

**Phase 3: Stop Functionality**
- Add AbortController to streaming
- Implement stop button in UI
- Handle client disconnect gracefully

**Phase 4: Tool Display**
- Collapsed tool use display in chat
- Expandable details
- Full details still in debug overlay

**Phase 5: History Management**
- Clear conversation
- Export conversation (format TBD)
- Import conversation

**Phase 6: Undo/Redo**
- Determine scope (spreadsheet vs chat vs both)
- Implement based on Q9.1-Q9.5 answers

---

## Open Questions Summary

Please answer the following to proceed:

### Critical (Need answers before starting):
1. **Layout:** Q1.2 - Which layout structure? (A/B/C)
2. **History Strategy:** Q2.2 - Which summarization strategy? (A/B/C)
3. **Stop Behavior:** Q3.2 - What happens when stopped? (A/B/C)
4. **Tool Display:** Q5.1 - Tool display format in chat? (A/B/C/D)
5. **Undo Scope:** Q9.1 - What can be undone? (A/B/C/D)

### Important (Affects UX):
6. **Q1.3** - Keep debug overlay separate or replace with chat?
7. **Q2.5** - Where to store conversation history?
8. **Q6.2** - Confirm before clearing history?
9. **Q7.1** - Export format(s)?
10. **Q8.2** - Import behavior (replace/append)?

### Nice to Have (Can decide later):
11. **Q1.1** - Chat panel: fixed/collapsible/resizable?
12. **Q2.4** - Show token count in UI?
13. **Q5.3** - "Show tool details" setting?
14. **Q9.5** - Undo history depth?

---

## Recommendations

Based on common patterns, I recommend:

1. **Layout:** Option B (two columns, merge buttons into chat)
2. **Summarization:** Option C (smart retention) - most efficient
3. **Stop:** Option B (explicit acknowledgment) - clearest UX
4. **Tool Display:** Option B (expandable accordion) - balance clarity/detail
5. **Undo:** Option A (spreadsheet only) - simplest, most useful
6. **History Storage:** Hybrid (client state + server backup)
7. **Export Format:** JSON + Markdown (offer both)
8. **Import:** Option A (replace current) - cleaner

But please confirm your preferences!
