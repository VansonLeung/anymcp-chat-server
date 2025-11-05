# Claude Agent SDK Integration

This document describes the Claude AI integration for the SpreadJS WebSocket server.

## Overview

The server now supports streaming chat with Claude AI (Sonnet 4.5), with the ability to call spreadsheet tools during conversations.

## Architecture

```
Client → WebSocket → Server → Claude API (streaming)
                              ↓
                         Tool Execution
                              ↓
                     WebSocket → SpreadJS Client
                              ↓
                         Response Back
                              ↓
                    Claude → Server → Client
```

## Setup

### 1. Install Dependencies

Already done:
```bash
npm install @anthropic-ai/sdk
```

### 2. Configure API Key

Add your Anthropic API key to `.env`:

```bash
ANTHROPIC_API_KEY=sk-ant-...
```

Get your API key from: https://console.anthropic.com/

### 3. Start the Server

```bash
npm run dev
```

## Usage

### Client Message Format

To send a prompt to Claude, send a WebSocket message with type `llm_user_prompt`:

```javascript
{
  "type": "llm_user_prompt",
  "message": "What sheets are in the spreadsheet?",
  "conversationHistory": [],  // Optional: for multi-turn conversations
  "timestamp": "2025-01-24T10:00:00.000Z"
}
```

### Server Response Messages

#### 1. Streaming Text Response

```javascript
{
  "type": "llm_assistant_response",
  "text": "I'll check the sheets for you...",
  "done": false,
  "timestamp": "2025-01-24T10:00:00.000Z"
}
```

#### 2. Tool Use Notification

```javascript
{
  "type": "llm_tool_use",
  "toolName": "get_sheet_names",
  "toolInput": {},
  "timestamp": "2025-01-24T10:00:00.000Z"
}
```

#### 3. Response Completion

```javascript
{
  "type": "llm_assistant_response",
  "text": "",
  "done": true,
  "timestamp": "2025-01-24T10:00:00.000Z"
}
```

#### 4. Error Message

```javascript
{
  "type": "llm_error",
  "error": "Error message here",
  "timestamp": "2025-01-24T10:00:00.000Z"
}
```

## Available Tools

Claude has access to 16 spreadsheet tools:

### Query Tools
- `get_spreadsheet_status` - Get server status
- `get_cell` - Get cell value
- `get_formula` - Get cell formula
- `get_sheet_names` - Get all sheet names
- `get_sheet_count` - Get total sheet count
- `get_active_sheet` - Get active sheet name
- `get_range` - Get range of cells
- `get_sheet_data` - Get entire sheet as JSON

### Command Tools
- `set_active_sheet` - Switch active sheet
- `set_cell` - Set cell value
- `set_formula` - Set cell formula
- `set_range` - Set range of cells
- `add_sheet` - Add new sheet
- `delete_sheet` - Delete sheet
- `rename_sheet` - Rename sheet
- `clear_range` - Clear cell range
- `set_sheet_data` - Set sheet from JSON

## Example Test

Run the test script:

```bash
node test-claude.js
```

This will:
1. Connect to the WebSocket server
2. Send a test prompt to Claude
3. Display streaming responses
4. Show tool executions
5. Close connection when done

## Implementation Files

### Core Files
- [`claude-agent.js`](./claude-agent.js) - Claude streaming integration
- [`tool-definitions.js`](./tool-definitions.js) - Shared tool definitions
- [`server.js`](./server.js) - WebSocket server with LLM handler
- [`mcp-tools-server.js`](./mcp-tools-server.js) - MCP server (unchanged)

### Configuration
- [`.env.example`](./.env.example) - Environment template
- [`package.json`](./package.json) - Dependencies

### Testing
- [`test-claude.js`](./test-claude.js) - Test client

## Message Flow

1. **Client sends prompt**
   ```
   {type: "llm_user_prompt", message: "..."}
   ```

2. **Server streams response**
   ```
   {type: "llm_assistant_response", text: "...", done: false}
   {type: "llm_assistant_response", text: "...", done: false}
   ```

3. **Claude needs tool**
   ```
   {type: "llm_tool_use", toolName: "get_cell", toolInput: {...}}
   ```

4. **Server executes tool**
   - Generates correlation ID
   - Broadcasts to SpreadJS client
   - Waits for response (10s timeout)

5. **SpreadJS client responds**
   ```
   {type: "response", correlationId: "...", result: {...}}
   ```

6. **Claude continues with result**
   ```
   {type: "llm_assistant_response", text: "...", done: false}
   ```

7. **Completion**
   ```
   {type: "llm_assistant_response", text: "", done: true}
   ```

## Model Configuration

Currently using: `claude-sonnet-4-20250514` (Claude Sonnet 4.5)

To change the model, edit [`claude-agent.js`](./claude-agent.js:154):

```javascript
const stream = await anthropicClient.messages.create({
  model: 'claude-sonnet-4-20250514',  // Change here
  max_tokens: 4096,
  messages,
  tools,
  stream: true
});
```

Available models:
- `claude-sonnet-4-20250514` - Most capable (recommended)
- `claude-3-5-haiku-20241022` - Faster, lower cost
- `claude-opus-4-20250514` - Highest capability (when available)

## Conversation History

For multi-turn conversations, pass the conversation history:

```javascript
{
  "type": "llm_user_prompt",
  "message": "What about cell A2?",
  "conversationHistory": [
    {
      "role": "user",
      "content": "What's in cell A1?"
    },
    {
      "role": "assistant",
      "content": "Cell A1 contains the value 42."
    }
  ]
}
```

## Error Handling

The implementation includes:
- 10-second timeout for tool execution
- Automatic error messages to client
- Graceful fallback if no clients connected
- API key validation on startup

## Troubleshooting

### "ANTHROPIC_API_KEY is required"

Add your API key to `.env`:
```bash
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

### "No clients connected"

Make sure a SpreadJS client is connected before sending LLM prompts.

### Timeout errors

If tools consistently timeout:
1. Check SpreadJS client is responding to `query` messages
2. Verify correlation ID matching is working
3. Check WebSocket connection stability

## Next Steps

Optional improvements:
1. Add conversation persistence
2. Implement rate limiting
3. Add user authentication
4. Support multiple concurrent conversations
5. Add streaming progress indicators
6. Implement tool result caching
