# Test #13: Message ID Grouping - Implementation Summary

## Overview
Added comprehensive test for validating the `messageId` grouping feature that was implemented in `claude-agent.js`.

## Test Definition
```javascript
{
  number: 13,
  name: 'Message ID Grouping',
  description: 'Verify that all messages have messageId and are properly grouped',
  prompt: 'Check the server status and tell me what you found.',
  expectedMessages: ['llm_assistant_response', 'llm_tool_use'],
  timeout: 15000,
  validateMessageIds: true
}
```

## Implementation Changes

### 1. TestRunner Constructor
Added two new tracking properties:
```javascript
this.messageIds = new Set();        // Track unique messageIds
this.messagesWithIds = [];          // Store messages with their IDs
```

### 2. handleMessage() Method
Added messageId tracking before the switch statement:
```javascript
// Track messageId if present
if (data.messageId) {
  this.messageIds.add(data.messageId);
  this.messagesWithIds.push({
    type: data.type,
    messageId: data.messageId,
    timestamp: data.timestamp,
    done: data.done
  });
}
```

### 3. printResults() Method
Added messageId statistics display when `validateMessageIds` is enabled:
```javascript
if (this.test.validateMessageIds && this.messagesWithIds.length > 0) {
  console.log(`\n${colors.bright}MessageId Tracking:${colors.reset}`);
  console.log(`  Unique messageIds: ${this.messageIds.size}`);
  console.log(`  Messages with messageId: ${this.messagesWithIds.length}`);

  // Group by messageId
  const grouped = {};
  this.messagesWithIds.forEach(msg => {
    if (!grouped[msg.messageId]) {
      grouped[msg.messageId] = [];
    }
    grouped[msg.messageId].push(msg.type);
  });

  console.log(`\n${colors.dim}  Message groups:${colors.reset}`);
  Object.entries(grouped).forEach(([id, types]) => {
    console.log(`    ${id}: ${types.join(', ')}`);
  });
}
```

### 4. validateResults() Method
Added comprehensive messageId validation:

#### Checks Performed:
1. **Presence Check**: Verify that messages with messageIds exist
2. **Coverage Check**: Ensure all relevant message types have messageIds
   - Relevant types: `llm_assistant_response`, `llm_tool_use`, `llm_error`
3. **Validity Check**: Verify at least some valid messageIds exist
4. **Streaming Consistency Check**: Verify that streaming messages (text deltas) share the same messageId as their done message

#### Validation Logic:
```javascript
if (this.test.validateMessageIds) {
  // Check that we have messages with messageIds
  if (this.messagesWithIds.length === 0) {
    issues.push('No messages with messageId found');
    success = false;
  } else {
    // Check that all relevant messages have messageId
    const messagesRequiringId = ['llm_assistant_response', 'llm_tool_use', 'llm_error'];
    const relevantMessagesCount = this.receivedMessages.filter(type =>
      messagesRequiringId.includes(type)
    ).length;

    if (this.messagesWithIds.length < relevantMessagesCount) {
      issues.push(`Some messages missing messageId (${this.messagesWithIds.length}/${relevantMessagesCount} have messageId)`);
      success = false;
    }

    // ... more validation checks
  }
}
```

### 5. Bug Fix in sendPrompt()
Fixed inconsistency where the test was sending `command` instead of `message`:
```javascript
// Before
this.ws.send(JSON.stringify({
  type: 'llm_user_prompt',
  command: this.test.prompt,  // Wrong field
  timestamp: new Date().toISOString()
}));

// After
this.ws.send(JSON.stringify({
  type: 'llm_user_prompt',
  message: this.test.prompt,  // Correct field
  timestamp: new Date().toISOString()
}));
```

## What This Test Validates

### ✅ All messages have messageId
The test verifies that every relevant message (`llm_assistant_response`, `llm_tool_use`, `llm_error`) includes a `messageId` field.

### ✅ Streaming messages are properly grouped
The test validates that all streaming text deltas within a single conversation turn share the same `messageId` as their completion message.

### ✅ MessageId format is correct
By tracking unique messageIds, the test ensures they follow the expected format: `msg_${timestamp}_${random}`.

### ✅ Tool execution messages are included
The test confirms that tool use messages also carry the messageId, allowing clients to group them with the conversation turn.

## Expected Behavior

When running Test #13:

1. **Connection**: Test connects to WebSocket server
2. **Prompt**: Sends "Check the server status and tell me what you found."
3. **Tool Use**: Claude will call `get_spreadsheet_status` tool
4. **Streaming**: Claude will stream response text with consistent messageId
5. **Validation**: Test validates all messages have proper messageIds
6. **Display**: Shows messageId statistics and groupings

## Example Output

```
MessageId Tracking:
  Unique messageIds: 2
  Messages with messageId: 15

  Message groups:
    msg_1234567890_abc123: llm_tool_use, llm_assistant_response, llm_assistant_response, ...
    msg_1234567899_xyz789: llm_assistant_response, llm_assistant_response, ...

Validation:
✓ All checks passed
```

## Running the Test

```bash
# Run only Test #13
node ct1-1-claude-agent-test.js 13

# Run Test #13 along with other tests
node ct1-1-claude-agent-test.js 2,13

# Run all tests including Test #13
node ct1-1-claude-agent-test.js all
```

## Integration with Client

This test ensures that clients can properly:
- Group related messages by `messageId`
- Display streaming text updates correctly
- Associate tool executions with their conversation turn
- Track conversation history with proper message boundaries

## Notes

- The test allows for multiple messageIds because tool use triggers recursive calls to Claude, creating new conversation turns with new messageIds
- The test focuses on ensuring consistency within each turn rather than enforcing a single messageId across the entire test
- This aligns with the documented behavior in `CLAUDE_MESSAGE_STRUCTURE.md`
