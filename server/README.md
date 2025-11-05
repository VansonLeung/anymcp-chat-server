# Spreadsheet WebSocket Server

A simple WebSocket server for remote control of SpreadJS spreadsheet applications.

## Features

- WebSocket-based real-time communication
- Command broadcasting to connected clients
- Connection status monitoring
- Error handling and logging

## Installation

```bash
cd server
npm install
```

## Usage

### Start the server

```bash
npm start
```

For development with auto-restart:

```bash
npm run dev
```

The server will start on port 10052 by default, or you can set the `PORT` environment variable.

## Environment Variables

The server uses the following environment variables (configured in `.env`):

- `PORT` - WebSocket server port (default: 10052)
- `MCP_PORT` - MCP REST API server port (default: 10051)
- `NODE_ENV` - Environment mode (development/production)
- `WEBSOCKET_MAX_CONNECTIONS` - Maximum concurrent connections (default: 100)
- `WEBSOCKET_HEARTBEAT_INTERVAL` - Heartbeat interval in ms (default: 30000)
- `LOG_LEVEL` - Logging level: silent, info, debug (default: info)

Copy `.env.example` to `.env` and modify as needed.

## MCP Endpoints

The server provides Model Context Protocol (MCP) REST endpoints that allow LLMs to interact with connected spreadsheet clients via WebSocket broadcasting.

### Available Endpoints

#### Health Check
```
GET /health
```
Returns server health status and connection information.

#### Spreadsheet Status
```
GET /mcp/spreadsheet/status
```
Returns current spreadsheet server status.

#### List Operations
```
GET /mcp/spreadsheet/operations
```
Returns list of available spreadsheet operations.

#### Set Cell Value
```
POST /mcp/spreadsheet/set-cell
Content-Type: application/json

{
  "row": 0,
  "col": 0,
  "value": "Hello World",
  "sheetIndex": 0
}
```

#### Set Cell Formula
```
POST /mcp/spreadsheet/set-formula
Content-Type: application/json

{
  "row": 0,
  "col": 0,
  "formula": "=SUM(A1:A10)",
  "sheetIndex": 0
}
```

#### Add New Sheet
```
POST /mcp/spreadsheet/add-sheet
Content-Type: application/json

{
  "sheetName": "New Sheet"
}
```

#### Set Active Sheet
```
POST /mcp/spreadsheet/set-active-sheet
Content-Type: application/json

{
  "sheetIndex": 1
}
```

#### Clear Sheet
```
POST /mcp/spreadsheet/clear-sheet
Content-Type: application/json

{
  "sheetIndex": 0
}
```

#### Load Template
```
POST /mcp/spreadsheet/load-template
Content-Type: application/json

{
  "templateName": "financial-template",
  "sheetIndex": 0
}
```

## Message Chain

The MCP integration establishes the following communication chain:

```
LLM → MCP REST Endpoint → Server → WebSocket Broadcast → Client Side
```

This allows LLMs to remotely control spreadsheet operations on connected client applications.

## WebSocket Protocol

### Connection

Clients connect to `ws://localhost:10052` (or your configured port).

### Message Types

#### Welcome Message (Server → Client)
```json
{
  "type": "welcome",
  "message": "Connected to Spreadsheet WebSocket Server",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

#### Ping/Pong (Client ↔ Server)
```json
// Client sends
{"type": "ping"}

// Server responds
{
  "type": "pong",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

#### Command (Client → Server → Other Clients)
```json
// Client sends command
{
  "type": "command",
  "command": "setProcessedData",
  "params": [0, 0, [["Hello", "World"]]]
}

// Server broadcasts to other clients
{
  "type": "command",
  "command": "setProcessedData",
  "params": [0, 0, [["Hello", "World"]]],
  "timestamp": "2024-01-01T00:00:00.000Z"
}

// Server sends acknowledgment to sender
{
  "type": "command_ack",
  "command": "setProcessedData",
  "status": "sent",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

#### Error Messages (Server → Client)
```json
{
  "type": "error",
  "message": "Unknown message type",
  "receivedType": "invalid_type",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Available Commands

The server supports any command that can be mapped to the `useSpreadSheet` hook functions. Common commands include:

- `setProcessedData` - Set cell values
- `setRawData` - Set formulas
- `addSheet` - Add a new sheet
- `setActiveSheet` - Switch active sheet
- `getSheetJSON` - Get sheet data as JSON
- And many more...

## Testing

You can test the server using the included test client:

```bash
node test-client.js
```

Or test manually using a WebSocket client or tools like:

- WebSocket King (Chrome extension)
- Postman
- Custom JavaScript code

Example test command:
```javascript
const ws = new WebSocket('ws://localhost:10052');

ws.onopen = () => {
  ws.send(JSON.stringify({ type: 'ping' }));
};

ws.onmessage = (event) => {
  console.log('Received:', event.data);
};
```

## Integration with React Client

The server is designed to work with the React spreadsheet client. Make sure to:

1. Start the WebSocket server
2. Set the `REACT_APP_WEBSOCKET_URL` environment variable in the client
3. Enable WebSocket support in the `useSpreadSheet` hook

## Environment Variables

- `PORT` - Server port (default: 10052)

## License

MIT