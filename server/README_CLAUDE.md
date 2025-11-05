# Claude AI Integration - Quick Start

## Setup (2 steps)

### 1. Add API Key to `.env`

```bash
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

Get your key: https://console.anthropic.com/

### 2. Start Server

```bash
npm run dev
```

## Usage

### Send Message to Claude

```javascript
// WebSocket message format
{
  "type": "llm_user_prompt",
  "message": "What sheets are in the spreadsheet?"
}
```

### Receive Streaming Response

```javascript
// Text chunks (multiple)
{
  "type": "llm_assistant_response",
  "text": "I'll check...",
  "done": false
}

// Tool execution notification
{
  "type": "llm_tool_use",
  "toolName": "get_sheet_names",
  "toolInput": {}
}

// Completion
{
  "type": "llm_assistant_response",
  "text": "",
  "done": true
}
```

## Test

```bash
node test-claude.js
```

## Features

✅ Streaming chat with Claude Sonnet 4.5
✅ 16 spreadsheet tools available to Claude
✅ Automatic tool execution via WebSocket
✅ Multi-turn conversation support
✅ Error handling & timeouts

## Architecture

```
Client ─┬─► WebSocket ─► Claude API
        │                    │
        │              Tool Execution
        │                    │
        └─◄──────────────────┘
      Streaming Response
```

## Files

- [`claude-agent.js`](./claude-agent.js) - Main integration
- [`tool-definitions.js`](./tool-definitions.js) - Tool schemas
- [`server.js`](./server.js) - WebSocket handler
- [`test-claude.js`](./test-claude.js) - Test client
- [`CLAUDE_INTEGRATION.md`](./CLAUDE_INTEGRATION.md) - Full docs

## Available Tools

Claude can:
- Query: cells, formulas, sheets, ranges
- Modify: set values, add/delete sheets, clear ranges
- Control: switch sheets, rename sheets

See [full tool list](./CLAUDE_INTEGRATION.md#available-tools).

## Model

Using: **claude-sonnet-4-20250514** (Sonnet 4.5)

Change in [`claude-agent.js:154`](./claude-agent.js#L154)

## Troubleshooting

**No API key**: Add `ANTHROPIC_API_KEY` to `.env`
**No clients**: Connect SpreadJS client first
**Timeouts**: Check client responds to `query` messages

See [full troubleshooting guide](./CLAUDE_INTEGRATION.md#troubleshooting).
