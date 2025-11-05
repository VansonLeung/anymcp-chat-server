# Architecture Overview

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client Layer                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────┐         ┌──────────────────┐            │
│  │  SpreadJS Client │         │   Chat UI        │            │
│  │  (React)         │         │   (Optional)     │            │
│  └────────┬─────────┘         └────────┬─────────┘            │
│           │                            │                       │
│           │ WebSocket (ws://localhost:10052)                  │
│           │                            │                       │
└───────────┼────────────────────────────┼───────────────────────┘
            │                            │
            ▼                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                      WebSocket Server                           │
│                   (server/server.js)                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Message Router (switch on message.type)                       │
│  ├─ ping/pong          → Health check                          │
│  ├─ command            → Broadcast to clients                  │
│  ├─ command_echo       → Echo to sender                        │
│  ├─ response           → Forward to MCP + Claude               │
│  └─ llm_user_prompt    → Claude agent ⭐ NEW                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
            │                            │
            ▼                            ▼
┌─────────────────────┐      ┌──────────────────────────┐
│   MCP Tools Server  │      │    Claude Agent          │
│ (mcp-tools-server)  │      │   (claude-agent.js) ⭐   │
├─────────────────────┤      ├──────────────────────────┤
│ Port: 10051         │      │ Anthropic SDK            │
│ FastMCP Framework   │      │ Model: Sonnet 4.5        │
│ HTTP REST API       │      │ Streaming enabled        │
│                     │      │                          │
│ 50+ MCP Tools       │      │ Tool Execution:          │
│ - Query tools       │      │ ┌──────────────────────┐ │
│ - Command tools     │      │ │ tool-definitions.js  │ │
│ - Correlation IDs   │      │ │ ⭐ NEW (shared)      │ │
│                     │      │ └──────────────────────┘ │
└─────────────────────┘      └──────────────────────────┘
            │                            │
            └────────────┬───────────────┘
                         │
                         ▼
              ┌────────────────────┐
              │  Shared Resources  │
              ├────────────────────┤
              │ - WebSocket Server │
              │ - Connected Clients│
              │ - Tool Definitions │
              └────────────────────┘
```

## Message Flow

### 1. LLM Chat Flow (NEW)

```
Client                 Server                Claude API         SpreadJS Client
  │                       │                      │                      │
  ├─ llm_user_prompt ────▶│                      │                      │
  │                       ├─ Create stream ─────▶│                      │
  │                       │                      │                      │
  │◀─ llm_assistant_─────┤◀──── Text chunk ─────┤                      │
  │      response         │                      │                      │
  │   (streaming...)      │                      │                      │
  │                       │                      │                      │
  │◀─ llm_tool_use ───────┤◀──── Tool request ───┤                      │
  │                       │                      │                      │
  │                       ├─ Broadcast query ──────────────────────────▶│
  │                       │   (with correlationId)                      │
  │                       │                                              │
  │                       │◀──────────── response ──────────────────────┤
  │                       │   (with correlationId)                      │
  │                       │                      │                      │
  │                       ├─ Tool result ────────▶│                      │
  │                       │                      │                      │
  │◀─ llm_assistant_─────┤◀──── Text chunk ─────┤                      │
  │      response         │                      │                      │
  │   (streaming...)      │                      │                      │
  │                       │                      │                      │
  │◀─ llm_assistant_─────┤◀──── End stream ─────┤                      │
  │   response (done)     │                      │                      │
  │                       │                      │                      │
```

### 2. MCP Flow (Existing - Unchanged)

```
External Tool          Server (MCP)           SpreadJS Client
  │                       │                      │
  ├─ HTTP POST ──────────▶│                      │
  │   /mcp                │                      │
  │                       ├─ Broadcast query ───▶│
  │                       │   (with correlationId)│
  │                       │                      │
  │                       │◀──── response ───────┤
  │                       │   (with correlationId)│
  │                       │                      │
  │◀─ HTTP Response ──────┤                      │
  │   (JSON)              │                      │
```

## Component Responsibilities

### server.js
- WebSocket server management
- Connection handling
- Message routing
- Integrates MCP + Claude

### claude-agent.js ⭐ NEW
- Anthropic SDK integration
- Streaming message handling
- Tool execution coordinator
- WebSocket response handling

### tool-definitions.js ⭐ NEW
- Tool schema definitions (Zod)
- Anthropic format conversion
- Shared between MCP & Claude
- Avoids code duplication

### mcp-tools-server.js (Unchanged)
- FastMCP server
- HTTP REST endpoints
- Tool implementations
- Still works independently

## Data Structures

### Tool Definition

```javascript
{
  name: 'get_cell',
  description: 'Get the value of a specific cell',
  parameters: z.object({
    row: z.number().int().min(0),
    col: z.number().int().min(0),
    sheetName: z.string().optional()
  }),
  command: 'getCell',      // WebSocket command
  messageType: 'query'     // 'query' or 'command'
}
```

### Anthropic Tool Format

```javascript
{
  name: 'get_cell',
  description: 'Get the value of a specific cell',
  input_schema: {
    type: 'object',
    properties: {
      row: { type: 'number', description: '...' },
      col: { type: 'number', description: '...' },
      sheetName: { type: 'string', description: '...' }
    },
    required: ['row', 'col']
  }
}
```

## Message Types

### WebSocket Messages

#### Client → Server

| Type | Purpose | Handler |
|------|---------|---------|
| `ping` | Health check | Built-in |
| `command` | Broadcast command | Built-in |
| `command_echo` | Echo command | Built-in |
| `response` | Tool result | MCP + Claude |
| `llm_user_prompt` ⭐ | Chat with Claude | Claude agent |

#### Server → Client

| Type | Purpose | Source |
|------|---------|--------|
| `welcome` | Connection ACK | Built-in |
| `pong` | Health check | Built-in |
| `command` | Execute command | Built-in |
| `command_ack` | Command ACK | Built-in |
| `query` | Request data | MCP + Claude |
| `error` | Error message | Built-in |
| `llm_assistant_response` ⭐ | Claude response | Claude agent |
| `llm_tool_use` ⭐ | Tool notification | Claude agent |
| `llm_error` ⭐ | Claude error | Claude agent |

## Correlation ID Pattern

Both MCP and Claude use the same correlation pattern:

```javascript
// Generate ID
const correlationId = `<prefix>_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

// MCP prefix: "mcp_"
// Claude prefix: "claude_"

// Send request
{
  type: 'query',
  command: 'getCell',
  params: {...},
  correlationId: 'claude_1234567890_abc123',
  source: 'claude'  // or 'mcp'
}

// Receive response
{
  type: 'response',
  correlationId: 'claude_1234567890_abc123',
  result: {...}
}

// Match and resolve
pendingRequests.get(correlationId).resolve(result);
```

## Tool Execution Flow

```
1. Claude decides to use tool
   ↓
2. Server receives tool_use block
   ↓
3. Create correlation ID
   ↓
4. Build WebSocket message
   {
     type: 'query',
     command: 'getCell',
     params: {row: 0, col: 0},
     correlationId: 'claude_...',
     source: 'claude'
   }
   ↓
5. Broadcast to SpreadJS clients
   ↓
6. Store pending request
   pendingRequests.set(correlationId, {resolve, reject, timeout})
   ↓
7. Wait for response (10s timeout)
   ↓
8. SpreadJS client executes & responds
   {
     type: 'response',
     correlationId: 'claude_...',
     result: {...}
   }
   ↓
9. Match correlation ID & resolve
   ↓
10. Return result to Claude
   ↓
11. Claude continues conversation
```

## Error Handling

### Timeout (10 seconds)
```javascript
setTimeout(() => {
  reject(new Error('Timeout waiting for response'));
}, 10000);
```

### No Clients
```javascript
if (broadcastCount === 0) {
  reject(new Error('No clients connected'));
}
```

### API Errors
```javascript
try {
  const stream = await anthropicClient.messages.create({...});
} catch (error) {
  ws.send({ type: 'llm_error', error: error.message });
}
```

### Tool Errors
```javascript
try {
  const result = await executeTool(name, input);
} catch (error) {
  return {
    type: 'tool_result',
    tool_use_id: id,
    content: `Error: ${error.message}`,
    is_error: true
  };
}
```

## Configuration

### Environment Variables

```bash
# Server
PORT=10052                      # WebSocket port
MCP_PORT=10051                  # MCP HTTP port
NODE_ENV=development
LOG_LEVEL=info

# WebSocket
WEBSOCKET_MAX_CONNECTIONS=100
WEBSOCKET_HEARTBEAT_INTERVAL=30000

# Claude AI ⭐ NEW
ANTHROPIC_API_KEY=sk-ant-...
```

### Model Configuration

Location: [`claude-agent.js:154`](./claude-agent.js#L154)

```javascript
model: 'claude-sonnet-4-20250514',  // Sonnet 4.5
max_tokens: 4096,
stream: true
```

## Performance Considerations

### Streaming Benefits
- Real-time user feedback
- Lower perceived latency
- Progressive rendering

### Tool Execution
- Parallel broadcasting
- 10s timeout prevents hangs
- Reuses WebSocket connections

### Memory
- Pending requests map (temporary)
- No conversation persistence
- Stateless by default

## Security Considerations

### API Key
- Stored in `.env` (not committed)
- Server-side only
- Never exposed to client

### WebSocket
- Same-origin by default
- CORS configurable
- Connection limit (100)

### Tool Execution
- Validation via Zod schemas
- Timeout protection
- Error isolation

## Extensibility

### Adding New Tools

1. Add to `tool-definitions.js`:
```javascript
{
  name: 'new_tool',
  description: '...',
  parameters: z.object({...}),
  command: 'newCommand',
  messageType: 'query'
}
```

2. That's it! Works in both MCP and Claude

### Changing Model

Edit `claude-agent.js:154`:
```javascript
model: 'claude-3-5-haiku-20241022',  // Faster
// or
model: 'claude-opus-4-20250514',     // More capable
```

### Adding Conversation Persistence

Extend `handleStreamingChat`:
```javascript
// Save to database
await saveConversation(messages);
```

## Monitoring

### Logs

```bash
# Debug mode
LOG_LEVEL=debug npm run dev

# Silent mode
LOG_LEVEL=silent npm start
```

### Connection Status

```javascript
console.log(`Connected clients: ${clients.size}`);
```

### Tool Usage

```javascript
if (LOG_LEVEL === 'debug') {
  console.log('Tool execution:', toolName, toolInput);
}
```

## Testing

### Unit Testing
```bash
node -c server.js
node -c claude-agent.js
node -c tool-definitions.js
```

### Integration Testing
```bash
node test-claude.js
```

### Manual Testing
1. Start server: `npm run dev`
2. Connect client
3. Send: `{type: 'llm_user_prompt', message: '...'}`
4. Observe streaming response

## Deployment

### Requirements
- Node.js 18+
- WebSocket support
- Environment variables configured
- Anthropic API key

### Production Checklist
- [ ] Set `NODE_ENV=production`
- [ ] Configure `ANTHROPIC_API_KEY`
- [ ] Set appropriate `LOG_LEVEL`
- [ ] Configure `WEBSOCKET_MAX_CONNECTIONS`
- [ ] Set up monitoring
- [ ] Configure CORS if needed
- [ ] Enable HTTPS for WebSocket (WSS)

## Comparison: MCP vs Claude

| Feature | MCP Server | Claude Agent |
|---------|------------|--------------|
| Protocol | HTTP REST | WebSocket |
| Purpose | External API | Internal chat |
| Streaming | No | Yes |
| Tools | 50+ | 16 (subset) |
| Client | Desktop apps | Web UI |
| Stateful | No | Optional |
| Port | 10051 | 10052 |
| Dependencies | FastMCP | Anthropic SDK |

Both use the same underlying tool execution mechanism!
