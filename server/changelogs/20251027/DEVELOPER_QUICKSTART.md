# Developer Quick Start Guide

This guide helps you quickly get the spreadsheet chat interface up and running.

---

## Prerequisites

- Node.js 18+ installed
- npm installed
- Git repository cloned

---

## Installation

### 1. Install Server Dependencies

```bash
cd server
npm install
```

**Dependencies installed:**
- `@anthropic-ai/sdk` - Claude AI SDK
- `better-sqlite3` - SQLite database
- `ws` - WebSocket server
- `dotenv` - Environment variables
- `fastmcp` - MCP server

### 2. Install Client Dependencies

```bash
cd ../client
npm install
```

### 3. Configure Environment

Create `server/.env` file:

```env
ANTHROPIC_API_KEY=your_api_key_here
LOG_LEVEL=info
WEBSOCKET_MAX_CONNECTIONS=100
```

Get your API key from: https://console.anthropic.com/

---

## Running the Application

### Option 1: Run Both Servers Simultaneously

**Terminal 1 - Server:**
```bash
cd server
npm start
```

Expected output:
```
Database initialized at: /path/to/conversations.db
MCP server started on port 10051
REST API server started on port 10051
WebSocket server started on port 10052
Claude agent initialized successfully
```

**Terminal 2 - Client:**
```bash
cd client
npm run dev
```

Expected output:
```
VITE v5.x.x  ready in xxx ms

➜  Local:   http://localhost:5173/
➜  Network: use --host to expose
```

### Option 2: Development Mode with Auto-Restart

**Terminal 1 - Server (with nodemon):**
```bash
cd server
npm install -g nodemon  # Install once
nodemon server.js
```

**Terminal 2 - Client:**
```bash
cd client
npm run dev
```

---

## Accessing the Application

1. Open browser to: **http://localhost:5173/**
2. You should see:
   - Spreadsheet editor on the left
   - Chat panel on the right (500px wide)
   - WebSocket debug overlay (bottom-right)

---

## First Time Use

### 1. Create a Conversation

- Click "New Conversation" in the chat sidebar
- A new conversation will be created automatically

### 2. Send Your First Message

- Type a message in the input area (bottom of chat panel)
- Example: "What is the current value of cell A1?"
- Press Enter or click "Send"

### 3. Watch the Response Stream

- Assistant response will stream in real-time
- Tool executions will appear as expandable sections
- Token count updates automatically

### 4. Test Stop Functionality

- Send a long query
- Click "Stop" button while generating
- Generation should stop immediately

---

## Architecture Overview

```
Port 10051: MCP Server (43 spreadsheet tools)
Port 10052: WebSocket Server (chat messages + spreadsheet commands)
Port 10051: REST API Server (conversation management)
Port 5173:  Vite Dev Server (React client)
```

---

## Key Features to Test

### ✅ Chat Interface
- [x] Send messages
- [x] Streaming responses
- [x] Stop generation
- [x] Message history

### ✅ Conversation Management
- [x] Create new conversation
- [x] Switch conversations
- [x] Delete conversation
- [x] Edit title (click on title)

### ✅ Tool Executions
- [x] Expand/collapse tool sections
- [x] View input/output
- [x] Tool status indicators

### ✅ Multi-Factor Limits
- [x] Token count (20,480 limit)
- [x] Message count (150 limit)
- [x] Tool count (100 limit)
- [x] Warning indicators (80%)

### ✅ Export
- [x] Export to JSON
- [x] Export to Markdown

### ✅ Undo/Redo
- [x] Ask LLM to undo spreadsheet changes
- [x] Ask LLM to redo spreadsheet changes

---

## Example Prompts to Try

### Basic Operations
```
"Set cell A1 to 100"
"Get the value of cell B2"
"What are all the sheet names?"
```

### Complex Operations
```
"Create a financial model with revenue projections for 5 years"
"Apply blue background color to cells A1 through E1"
"Add a new row at row 5"
```

### Data Analysis
```
"Summarize the data in the current sheet"
"What is the total of column C?"
"Find all cells with values greater than 1000"
```

### Undo/Redo
```
"Undo the last change"
"Redo what I just undid"
```

---

## Database Location

**Default:** `server/database/conversations.db`

- Automatically created on first run
- Persists across server restarts
- SQLite database (can view with any SQLite viewer)

**Useful SQLite Commands:**
```bash
# Install sqlite3 (if not installed)
brew install sqlite3  # macOS
sudo apt install sqlite3  # Linux

# View database
cd server/database
sqlite3 conversations.db

# List all conversations
SELECT id, title, token_count, message_count FROM conversations;

# Count messages
SELECT COUNT(*) FROM messages;

# View conversation stats
SELECT * FROM conversation_stats;

# Exit
.quit
```

---

## Troubleshooting

### Issue: Server won't start

**Error:** `Cannot find module '@anthropic-ai/sdk'`
**Solution:**
```bash
cd server
rm -rf node_modules package-lock.json
npm install
```

---

### Issue: WebSocket connection failed

**Check:**
1. Is server running? (Should see "WebSocket server started on port 10052")
2. Is port 10052 available?
```bash
lsof -i :10052
```
3. Check browser console for errors

---

### Issue: No conversations loading

**Check:**
1. Is REST API running? (Should see "REST API server started on port 10051")
2. Test API manually:
```bash
curl http://localhost:10051/api/conversations
```
3. Check database exists:
```bash
ls -la server/database/conversations.db
```

---

### Issue: LLM not responding

**Check:**
1. Is ANTHROPIC_API_KEY set in `server/.env`?
2. Check server logs for errors
3. Verify API key is valid:
```bash
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model":"claude-sonnet-4-20250514","max_tokens":10,"messages":[{"role":"user","content":"Hi"}]}'
```

---

### Issue: Chat panel not showing

**Check:**
1. Is CSS loaded? Check browser console
2. Clear browser cache
3. Check if ChatPanel.css exists:
```bash
ls -la client/src/styles/ChatPanel.css
```

---

### Issue: Undo/Redo not working

**Possible Causes:**
1. No changes to undo
2. Spreadsheet not fully loaded
3. Check browser console for errors

**Test manually:**
```javascript
// In browser console:
const sheet = window.spread.getActiveSheet();
const undoManager = window.spread.undoManager();
console.log('Can undo:', undoManager.canUndo());
console.log('Can redo:', undoManager.canRedo());
```

---

## Development Tips

### Hot Reload

**Client:** Changes to React components automatically reload
**Server:** Need to restart manually (or use nodemon)

### Debug Mode

Enable debug logging in `server/.env`:
```env
LOG_LEVEL=debug
```

### WebSocket Debug Overlay

- Bottom-right corner of screen
- Shows all WebSocket messages
- Useful for debugging protocol issues
- Can collapse/expand

### Browser DevTools

**React DevTools:**
- Install React DevTools extension
- Inspect component state
- View props

**Network Tab:**
- Monitor WebSocket messages
- Check REST API calls
- View request/response timing

### Database Inspection

**View in VS Code:**
- Install "SQLite Viewer" extension
- Open `server/database/conversations.db`
- Browse tables visually

---

## Performance Optimization

### Client-Side

**Message Grouping:**
- Streaming messages grouped by `messageId`
- Prevents UI spam
- Smooth text accumulation

**Auto-Scroll:**
- Only scrolls when at bottom
- Preserves scroll position when reading history

**Lazy Rendering:**
- Messages rendered efficiently
- React key optimization

### Server-Side

**Database:**
- Synchronous operations (better-sqlite3)
- Prepared statements for queries
- Automatic indexing on foreign keys

**WebSocket:**
- Per-client abort controllers
- Immediate cleanup on disconnect
- No memory leaks

**Streaming:**
- Text chunks sent immediately
- No buffering
- Low latency

---

## File Structure

```
poc-spreadjs-server-4/
├── server/
│   ├── server.js                    # Main server entry point
│   ├── claude-agent.js              # Claude AI integration
│   ├── tool-definitions.js          # 43 MCP tools
│   ├── database/
│   │   ├── schema.sql               # Database schema
│   │   ├── db.js                    # Database wrapper
│   │   └── conversations.db         # SQLite database (auto-created)
│   ├── package.json
│   └── .env                         # Environment variables (create this)
│
├── client/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ChatPanel.jsx                # Main chat container
│   │   │   ├── ConversationSidebar.jsx      # Conversation list
│   │   │   ├── ConversationHeader.jsx       # Stats and export
│   │   │   ├── MessageList.jsx              # Message display
│   │   │   ├── ToolExecutionSection.jsx     # Tool details
│   │   │   ├── InputArea.jsx                # Text input
│   │   │   ├── SpreadSheetEditor.jsx        # SpreadJS wrapper
│   │   │   └── WebSocketDebugOverlay.jsx    # Debug panel
│   │   ├── hooks/
│   │   │   ├── useSpreadSheet.js            # SpreadJS hook
│   │   │   ├── useSpreadsheetCommands.js    # Command execution
│   │   │   └── useWebSocket.js              # WebSocket hook
│   │   ├── pages/
│   │   │   └── SpreadSheetEditorPageJSONTemplateCreation.jsx
│   │   └── styles/
│   │       └── ChatPanel.css                # All chat styling
│   └── package.json
│
└── Documentation/
    ├── PHASE1_COMPLETE_SUMMARY.md
    ├── PHASE2_COMPLETE_SUMMARY.md
    ├── WEBSOCKET_PROTOCOL.md
    ├── CHAT_IMPLEMENTATION_PLAN.md
    └── DEVELOPER_QUICKSTART.md (this file)
```

---

## Common Workflows

### Adding a New MCP Tool

1. Add tool definition to `server/tool-definitions.js`:
```javascript
{
  name: 'my_new_tool',
  description: 'Does something useful',
  parameters: z.object({
    param1: z.string().describe('Description')
  }),
  command: 'myNewTool',  // For WebSocket commands
  messageType: 'command'  // Or null for local tools
}
```

2. Add handler to `client/src/hooks/useSpreadsheetCommands.js`:
```javascript
myNewTool: (params) => {
  // Implementation
  return result;
}
```

3. Restart server

### Adding a New Message Type

1. Define handler in `client/src/components/ChatPanel.jsx`:
```javascript
case 'my_new_message_type':
  handleMyNewMessage(data);
  break;
```

2. Implement handler:
```javascript
const handleMyNewMessage = (data) => {
  // Handle the message
};
```

3. Send from server in `server/claude-agent.js`:
```javascript
ws.send(JSON.stringify({
  type: 'my_new_message_type',
  // ... data
}));
```

### Modifying Conversation Limits

Edit `server/database/schema.sql`:
```sql
-- Change limits in conversation_stats view
WHEN c.token_count >= 50000 THEN 1  -- Was 20480
WHEN c.message_count >= 200 THEN 1   -- Was 150
```

Then regenerate database:
```bash
cd server/database
rm conversations.db
# Restart server (will auto-create)
```

---

## Security Notes

**⚠️ Current Status: Development Only**

This is configured for **local development**. For production:

1. **Add Authentication:**
   - JWT tokens for REST API
   - WebSocket authentication
   - User-specific conversations

2. **Add Rate Limiting:**
   - Limit requests per IP
   - Limit WebSocket messages
   - Prevent abuse

3. **Secure Environment Variables:**
   - Never commit `.env` to git
   - Use secrets manager in production
   - Rotate API keys regularly

4. **Enable CORS Properly:**
   - Currently allows all origins (`*`)
   - Restrict to specific domains in production

5. **Input Validation:**
   - Sanitize all user input
   - Validate message sizes
   - Prevent XSS attacks

6. **HTTPS:**
   - Use HTTPS in production
   - WSS (WebSocket Secure) instead of WS

---

## Useful Commands

### Server

```bash
# Start server
npm start

# Start with debug logging
LOG_LEVEL=debug npm start

# Check if ports are in use
lsof -i :10051
lsof -i :10052
lsof -i :10051

# Kill process on port
kill -9 $(lsof -t -i :10052)
```

### Client

```bash
# Start dev server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

### Database

```bash
# Backup database
cp server/database/conversations.db server/database/conversations.backup.db

# Reset database (deletes all data!)
rm server/database/conversations.db
# Restart server to recreate

# Export conversations
curl http://localhost:10051/api/conversations > conversations.json
```

---

## Next Steps

After getting the app running:

1. **Explore the UI:**
   - Create multiple conversations
   - Test all features
   - Try different prompts

2. **Read Documentation:**
   - [WEBSOCKET_PROTOCOL.md](WEBSOCKET_PROTOCOL.md) - WebSocket message types
   - [PHASE1_COMPLETE_SUMMARY.md](PHASE1_COMPLETE_SUMMARY.md) - Backend details
   - [PHASE2_COMPLETE_SUMMARY.md](PHASE2_COMPLETE_SUMMARY.md) - UI details

3. **Customize:**
   - Modify conversation limits
   - Add new MCP tools
   - Customize UI styling

4. **Test:**
   - Try edge cases
   - Test error handling
   - Test with large datasets

---

## Getting Help

**Issues?**
- Check server logs
- Check browser console
- Review documentation
- Check database state

**Feature Requests?**
- See [CHAT_IMPLEMENTATION_PLAN.md](CHAT_IMPLEMENTATION_PLAN.md) for roadmap

**Questions?**
- Review code comments
- Check WebSocket debug overlay
- Inspect network traffic

---

**Happy Coding! 🚀**
