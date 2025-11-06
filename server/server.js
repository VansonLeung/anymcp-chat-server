const WebSocket = require('ws');
const http = require('http');
const claudeAgent = require('./claude-agent');
const openaiAgent = require('./openai-agent');
const db = require('./database/db');

// Load environment variables
require('dotenv').config();

const PORT = process.env.PORT || 10052;
const API_PORT = process.env.API_PORT || 10051;
const HOST = process.env.HOST || '0.0.0.0';
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const WEBSOCKET_MAX_CONNECTIONS = parseInt(process.env.WEBSOCKET_MAX_CONNECTIONS) || 100;

// Select which agent to use: 'claude' or 'openai'
const AGENT_TYPE = process.env.AGENT_TYPE || 'claude';
const agent = AGENT_TYPE === 'openai' ? openaiAgent : claudeAgent;

// Store connected clients (for backward compatibility)
let clients = new Set();

// Create HTTP server for REST API
const apiServer = http.createServer(async (req, res) => {
  // Log incoming request
  if (LOG_LEVEL === 'debug') {
    console.log(`[API] ${req.method} ${req.url}`);
  }

  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
  res.setHeader('Access-Control-Allow-Credentials', 'false');
  res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours

  // Handle preflight
  if (req.method === 'OPTIONS') {
    if (LOG_LEVEL === 'debug') {
      console.log(`[API] OPTIONS preflight response sent`);
    }
    res.writeHead(200);
    res.end();
    return;
  }

  const url = new URL(req.url, `http://localhost:${API_PORT}`);
  const path = url.pathname;

  if (LOG_LEVEL === 'debug') {
    console.log(`[API] Parsed path: ${path}`);
  }

  try {
    // GET /health - Health check endpoint
    if (req.method === 'GET' && path === '/health') {
      const healthStatus = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        services: {
          api: 'running',
          websocket: wss.clients ? 'running' : 'stopped',
          database: 'running',
          mcp: 'running'
        },
        connections: {
          websocket: wss.clients ? wss.clients.size : 0,
          maxConnections: WEBSOCKET_MAX_CONNECTIONS
        },
        version: {
          node: process.version,
          env: process.env.NODE_ENV || 'development'
        }
      };

      // Check database health
      try {
        await db.getAllConversations(1); // Try to query 1 conversation
        healthStatus.services.database = 'running';
      } catch (error) {
        healthStatus.status = 'degraded';
        healthStatus.services.database = 'error';
        healthStatus.errors = healthStatus.errors || [];
        healthStatus.errors.push({ service: 'database', error: error.message });
      }

      const statusCode = healthStatus.status === 'healthy' ? 200 : 503;
      res.writeHead(statusCode, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(healthStatus));
      return;
    }

    // GET /api/conversations - List all conversations
    if (req.method === 'GET' && path === '/api/conversations') {
      if (LOG_LEVEL === 'debug') {
        console.log(`[API] Fetching all conversations...`);
      }
      const conversations = await db.getAllConversations();
      if (LOG_LEVEL === 'debug') {
        console.log(`[API] Found ${conversations.length} conversations`);
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ conversations }));
      return;
    }

    // GET /api/conversations/:id - Get conversation with messages
    if (req.method === 'GET' && path.startsWith('/api/conversations/')) {
      const id = path.split('/')[3];

      if (path.endsWith('/export')) {
        // GET /api/conversations/:id/export?format=json|markdown
        const conversationId = path.split('/')[3];
        const format = url.searchParams.get('format') || 'json';

        if (format === 'markdown') {
          const markdown = await db.exportConversationMarkdown(conversationId);
          if (!markdown) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Conversation not found' }));
            return;
          }
          res.writeHead(200, { 'Content-Type': 'text/markdown' });
          res.end(markdown);
        } else {
          const exported = await db.exportConversationJSON(conversationId);
          if (!exported) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Conversation not found' }));
            return;
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify(exported));
        }
        return;
      }

      const conversation = await db.getConversation(id);
      if (!conversation) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Conversation not found' }));
        return;
      }

      const messages = await db.getMessages(id);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ conversation, messages }));
      return;
    }

    // POST /api/conversations - Create new conversation
    if (req.method === 'POST' && path === '/api/conversations') {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        const { title, metadata } = JSON.parse(body || '{}');
        const conversation = await db.createConversation(title, metadata);
        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ conversation }));
      });
      return;
    }

    // PUT /api/conversations/:id - Update conversation title
    if (req.method === 'PUT' && path.startsWith('/api/conversations/')) {
      const id = path.split('/')[3];
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', async () => {
        const { title } = JSON.parse(body || '{}');
        const conversation = await db.updateConversationTitle(id, title);
        if (!conversation) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Conversation not found' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ conversation }));
      });
      return;
    }

    // DELETE /api/conversations/:id - Delete conversation
    if (req.method === 'DELETE' && path.startsWith('/api/conversations/')) {
      const id = path.split('/')[3];
      const deleted = await db.deleteConversation(id);
      if (!deleted) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Conversation not found' }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true }));
      return;
    }

    // 404 - Not found
    if (LOG_LEVEL === 'debug') {
      console.log(`[API] 404 - Not found: ${path}`);
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));

  } catch (error) {
    console.error(`[API] Error handling ${req.method} ${path}:`, error);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: error.message }));
  }
});

// Start API server
apiServer.listen(API_PORT, HOST, () => {
  console.log(`REST API server started on ${HOST}:${API_PORT}`);
});

// Create WebSocket server (legacy implementation for direct connections)
const wss = new WebSocket.Server({
  port: PORT,
  host: HOST,
  verifyClient: (info, callback) => {
    // Allow all origins for CORS
    callback(true);
  }
});

console.log(`WebSocket server started on ${HOST}:${PORT}`);
if (LOG_LEVEL === 'debug') {
  console.log(`Max connections: ${WEBSOCKET_MAX_CONNECTIONS}`);
  console.log(`Log level: ${LOG_LEVEL}`);
}

// Store connected clients
// const clients = new Set();

wss.on('connection', (ws, req) => {
  // Check connection limit
  if (clients.size >= WEBSOCKET_MAX_CONNECTIONS) {
    if (LOG_LEVEL !== 'silent') {
      console.log(`Connection rejected: Max connections (${WEBSOCKET_MAX_CONNECTIONS}) reached`);
    }
    ws.close(1008, 'Server full');
    return;
  }

  if (LOG_LEVEL === 'debug') {
    console.log(`New client connected from ${req.socket.remoteAddress}`);
  } else if (LOG_LEVEL !== 'silent') {
    console.log(`New client connected (${clients.size + 1}/${WEBSOCKET_MAX_CONNECTIONS})`);
  }

  // Add client to the set
  clients.add(ws);

  // Send welcome message
  ws.send(JSON.stringify({
    type: 'welcome',
    message: 'Connected to AnyMCP WebSocket Server',
    timestamp: new Date().toISOString()
  }));

  // Handle incoming messages
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message.toString());
      if (LOG_LEVEL === 'debug') {
        console.log('Received message:', data);
      }

      // Handle different message types
      switch (data.type) {
        case 'ping':
          ws.send(JSON.stringify({
            type: 'pong',
            timestamp: new Date().toISOString()
          }));
          break;

        case 'command_echo':
          ws.send(JSON.stringify({
            type: 'command',
            command: data.command,
            params: data.params,
            timestamp: new Date().toISOString()
          }));
          break;

        case 'command':
          // Forward command to all other clients (broadcast)
          let broadcastCount = 0;
          clients.forEach(client => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
              client.send(JSON.stringify({
                type: 'command',
                command: data.command,
                params: data.params,
                timestamp: new Date().toISOString()
              }));
              broadcastCount++;
            }
          });

          // Send acknowledgment to sender
          ws.send(JSON.stringify({
            type: 'command_ack',
            command: data.command,
            status: 'sent',
            broadcastCount: broadcastCount,
            timestamp: new Date().toISOString()
          }));

          if (LOG_LEVEL === 'debug') {
            console.log(`Command "${data.command}" broadcasted to ${broadcastCount} clients`);
          }
          break;

        case 'command_ack':
          // Just log acknowledgment messages
          if (LOG_LEVEL === 'debug') {
            console.log('Received command acknowledgment:', data);
          }
          break;

        case 'response':
          // Forward response to agent
          if (LOG_LEVEL === 'debug') {
            console.log('Received response from client:', data);
          }
          agent.handleWebSocketResponse(data);
          break;

        case 'llm_user_prompt':
          // Handle LLM user prompt - stream response from agent
          if (LOG_LEVEL === 'debug') {
            console.log('Received LLM user prompt:', data.message);
          }

          try {
            await agent.handleStreamingChat(data.message, ws, data.conversationId);
          } catch (error) {
            console.error('Error handling LLM prompt:', error);
            ws.send(JSON.stringify({
              type: 'llm_error',
              error: error.message,
              timestamp: new Date().toISOString()
            }));
          }
          break;

        case 'llm_stop':
          // Stop ongoing LLM generation for this client
          if (LOG_LEVEL === 'debug') {
            console.log('Received LLM stop request');
          }

          agent.stopGeneration(ws, 'user_requested');
          break;

        default:
          ws.send(JSON.stringify({
            type: 'error',
            message: 'Unknown message type',
            receivedType: data.type,
            timestamp: new Date().toISOString()
          }));
      }
    } catch (error) {
      console.error('Error parsing message:', error);
      ws.send(JSON.stringify({
        type: 'error',
        message: 'Invalid JSON format',
        timestamp: new Date().toISOString()
      }));
    }
  });

  // Handle client disconnection
  ws.on('close', () => {
    // Stop any active LLM generation for this client
    agent.handleClientDisconnect(ws);

    clients.delete(ws);
    if (LOG_LEVEL !== 'silent') {
      console.log(`Client disconnected (${clients.size}/${WEBSOCKET_MAX_CONNECTIONS})`);
    }
  });

  // Handle errors
  ws.on('error', (error) => {
    clients.delete(ws);
    if (LOG_LEVEL !== 'silent') {
      console.error('WebSocket client error:', error.message);
    }
  });
});

// Handle server errors
wss.on('error', (error) => {
  console.error('WebSocket server error:', error);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  if (LOG_LEVEL !== 'silent') {
    console.log('Shutting down servers...');
  }

  // Close WebSocket server
  wss.close();

  // Note: FastMCP server doesn't have a close method
  // await mcpServer.close();

  if (LOG_LEVEL !== 'silent') {
    console.log('Servers closed');
  }
  process.exit(0);
});

// Start the MCP FastMCP server
async function startServers() {
  try {
    // Start FastMCP server with MCP endpoints first
    // await mcpServer.start({
    //   transportType: 'httpStream',
    //   httpStream: {
    //     port: MCP_PORT,
    //     stateless: true,
    //   },
    // });
    // console.log(`MCP server started on port ${MCP_PORT}`);

    // Connect agent to the WebSocket server instance
    agent.setWebSocketServer(wss, clients);

    // Initialize agent
    try {
      await agent.initializeClient();
      console.log(`${AGENT_TYPE === 'openai' ? 'OpenAI' : 'Claude'} agent initialized successfully`);
    } catch (error) {
      console.warn(`Warning: ${AGENT_TYPE} agent could not be initialized:`, error.message);
      if (AGENT_TYPE === 'claude') {
        console.warn('Make sure ANTHROPIC_API_KEY is set in .env file');
      } else {
        console.warn('Make sure OPENAI_API_KEY is set in .env file');
        console.warn('Optionally set OPENAI_BASE_URL for compatible APIs (e.g., Poe)');
      }
    }

    if (LOG_LEVEL !== 'silent') {
      console.log('AnyMCP Server is running...');
      console.log(`Agent type: ${AGENT_TYPE}`);
      console.log('WebSocket connections available on port', PORT);
      console.log('API server available on port', API_PORT);
    }
  } catch (err) {
    console.error('Error starting servers:', err);
    process.exit(1);
  }
}

// Start MCP server first, then WebSocket server will be connected
startServers();

// Export WebSocket server and clients for MCP server access
module.exports = {
  wss,
  clients
};