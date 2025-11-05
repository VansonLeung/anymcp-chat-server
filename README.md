# AnyMCP Server (PoC)

A proof-of-concept application demonstrating an LLM-powered chat interface with tool execution capabilities. Built with React, Vite, and Claude AI, featuring real-time conversation management and simple math operation tools.

## 📊 Project Overview

This project demonstrates a flexible architecture for LLM-powered applications with tool execution. The application showcases how AI assistants can be equipped with custom tools (in this case, math operations) and execute them in real-time through a WebSocket-based communication protocol.

### **Key Capabilities**
- **Real-Time LLM Chat**: Interactive conversation with Claude AI or OpenAI
- **Multiple LLM Support**: Switch between Claude and OpenAI-compatible APIs
- **Tool Execution**: Math operations executed by the AI
- **Conversation Management**: Multiple conversation threads with persistence
- **WebSocket Communication**: Real-time bidirectional messaging
- **Token Tracking**: Monitor usage and costs per conversation
- **OpenAI-Compatible APIs**: Works with Poe, Together AI, OpenRouter, and more

## 🏗️ Architecture

### **Technology Stack**

**Frontend**:
- React 19 with Vite build system
- Tailwind CSS with custom UI components
- WebSocket client for real-time communication
- Marked for markdown rendering

**Backend**:
- Node.js WebSocket server
- **Dual Agent Support**:
  - Anthropic Claude SDK (claude-agent.js)
  - OpenAI SDK (openai-agent.js) - compatible with OpenAI and similar APIs
- SQLite database for conversation persistence
- Zod for schema validation

### **Project Structure**
```
poc-anymcp-server/
├── client/                          # React frontend application
│   ├── src/
│   │   ├── components/
│   │   │   ├── ChatPanel.jsx        # Main chat interface
│   │   │   ├── ConversationSidebar.jsx
│   │   │   ├── MessageList.jsx
│   │   │   ├── InputArea.jsx
│   │   │   ├── ToolExecutionSection.jsx
│   │   │   └── ui/                  # Reusable UI components
│   │   ├── hooks/
│   │   │   ├── useMathCommands.js   # Math tool execution
│   │   │   └── useWebSocket.js      # WebSocket management
│   │   ├── pages/
│   │   │   └── MainChatPage.jsx     # Main application page
│   │   └── styles/
│   │       └── ChatPanel.css
│   └── package.json
├── server/                          # Backend server
│   ├── server.js                    # WebSocket & REST API server
│   ├── claude-agent.js              # Claude LLM orchestration
│   ├── openai-agent.js              # OpenAI LLM orchestration
│   ├── tool-definitions-maths.js    # Math tool definitions
│   ├── database/
│   │   ├── db.js                    # SQLite wrapper
│   │   ├── schema.sql               # Database schema
│   │   └── conversations.db         # SQLite database
│   └── package.json
└── README.md
```

## 🔄 Communication Architecture

The application uses a dual-server architecture:

### **REST API (Port 10051)**
- Conversation CRUD operations
- Message history retrieval
- Conversation export (JSON/Markdown)
- Health check endpoint

### **WebSocket Server (Port 10052)**
- Real-time LLM streaming responses
- Tool execution requests/responses
- Bidirectional client-server communication
- Connection management

### **Message Flow**
```
User Input → WebSocket → Server → Claude API
                ↓
          Tool Execution Request
                ↓
        Client Executes Math Operation
                ↓
          Result → Server → Claude API
                ↓
        Assistant Response → Client
```

## 🚀 Quick Start

### **Prerequisites**
- Node.js 16+
- **Choose one**:
  - Anthropic API key (for Claude)
  - OpenAI API key (for OpenAI or compatible APIs)

### **Installation & Setup**

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd poc-anymcp-server
   ```

2. **Install server dependencies**
   ```bash
   cd server
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp .env.example .env
   # Edit .env and configure your chosen agent
   ```

   **For Claude (default)**:
   ```bash
   AGENT_TYPE=claude
   ANTHROPIC_API_KEY=your-anthropic-key-here
   ```

   **For OpenAI**:
   ```bash
   AGENT_TYPE=openai
   OPENAI_API_KEY=your-openai-key-here
   ```

   **For OpenAI-compatible APIs** (e.g., Poe):
   ```bash
   AGENT_TYPE=openai
   OPENAI_API_KEY=your-api-key-here
   OPENAI_BASE_URL=https://api.poe.com/v1
   OPENAI_MODEL=gpt-4o-mini  # or your preferred model
   ```

4. **Install client dependencies**
   ```bash
   cd ../client
   npm install
   ```

5. **Start both servers**
   ```bash
   cd ..
   ./start-dev.sh
   ```

   Or start them separately:
   ```bash
   # Terminal 1 - Server
   cd server
   npm run dev

   # Terminal 2 - Client
   cd client
   npm run dev
   ```

6. **Open your browser**
   ```
   http://localhost:10050
   ```

### **Build for Production**
```bash
cd client
npm run build
```

## 🔧 Available Math Tools

The AI assistant has access to the following math operations:

- **add**: Add two numbers
- **subtract**: Subtract second number from first
- **multiply**: Multiply two numbers
- **divide**: Divide first number by second
- **power**: Raise first number to power of second
- **sqrt**: Calculate square root
- **modulo**: Calculate remainder
- **absolute**: Get absolute value
- **round**: Round to specified decimal places
- **floor**: Round down to nearest integer
- **ceil**: Round up to nearest integer
- **min**: Find minimum in array
- **max**: Find maximum in array
- **sum**: Calculate sum of array
- **average**: Calculate average of array

### **Example Queries**
Try asking the AI:
- "What is 42 + 58?"
- "Calculate the square root of 144"
- "Find the average of 10, 20, 30, 40, 50"
- "What is 2 to the power of 8?"

## 💾 Database Schema

### **Tables**
- **conversations**: Conversation metadata, token counts, costs
- **messages**: Chat messages with role and content
- **tool_executions**: Tool invocation tracking

### **Features**
- Automatic token counting and aggregation
- Cost estimation per conversation
- Multi-factor limits (tokens, messages, tools, age)
- Conversation export to JSON/Markdown

## 🛠️ Development

### **Client Scripts**
```bash
cd client

# Development server (port 10050)
npm run dev

# Production build
npm run build

# Preview production build
npm run preview

# Lint code
npm run lint
```

### **Server Scripts**
```bash
cd server

# Start server
npm start

# Development mode with auto-restart
npm run dev
```

### **Environment Variables**

**Client (.env)**:
- `VITE_WEBSOCKET_URL`: WebSocket server URL (default: `ws://localhost:10052`)
- `VITE_API_BASE_URL`: REST API URL (default: `http://localhost:10051`)

**Server (.env)**:
- `AGENT_TYPE`: Which agent to use - `claude` or `openai` (default: `claude`)
- `PORT`: WebSocket server port (default: 10052)
- `API_PORT`: REST API port (default: 10051)
- `LOG_LEVEL`: Logging level (debug/info/silent)

**Claude Agent**:
- `ANTHROPIC_API_KEY`: Your Anthropic API key (required if AGENT_TYPE=claude)

**OpenAI Agent**:
- `OPENAI_API_KEY`: Your OpenAI API key (required if AGENT_TYPE=openai)
- `OPENAI_BASE_URL`: Custom API endpoint for OpenAI-compatible APIs (optional)
  - Examples: `https://api.poe.com/v1`, `https://api.together.xyz/v1`, `https://openrouter.ai/api/v1`
- `OPENAI_MODEL`: Model to use (default: `gpt-4o-mini`)
  - Examples: `gpt-4o`, `gpt-4-turbo`, `gpt-3.5-turbo`

### **Switching Between Agents**

To switch between Claude and OpenAI agents, simply change the `AGENT_TYPE` in your `.env` file and restart the server:

```bash
# Use Claude
AGENT_TYPE=claude
ANTHROPIC_API_KEY=your-key-here

# Or use OpenAI
AGENT_TYPE=openai
OPENAI_API_KEY=your-key-here
```

### **Using OpenAI-Compatible APIs**

The OpenAI agent works with any OpenAI-compatible API. Here are some examples:

**Poe**:
```bash
AGENT_TYPE=openai
OPENAI_API_KEY=your-poe-api-key
OPENAI_BASE_URL=https://api.poe.com/v1
```

**Together AI**:
```bash
AGENT_TYPE=openai
OPENAI_API_KEY=your-together-api-key
OPENAI_BASE_URL=https://api.together.xyz/v1
OPENAI_MODEL=meta-llama/Meta-Llama-3.1-8B-Instruct-Turbo
```

**OpenRouter**:
```bash
AGENT_TYPE=openai
OPENAI_API_KEY=your-openrouter-api-key
OPENAI_BASE_URL=https://openrouter.ai/api/v1
OPENAI_MODEL=anthropic/claude-3.5-sonnet
```

## 🔌 Extending with New Tools

To add new tools to the AI assistant:

1. **Define the tool in `server/tool-definitions-maths.js`**:
   ```javascript
   {
     name: 'my_tool',
     description: 'What the tool does',
     parameters: z.object({
       param1: z.string().describe('Parameter description')
     }),
     command: 'myTool',
     messageType: 'command'
   }
   ```

2. **Implement the tool in `client/src/hooks/useMathCommands.js`**:
   ```javascript
   case 'myTool':
     result = /* your implementation */;
     break;
   ```

3. The tool will automatically be available to the AI assistant!

## 📋 API Endpoints

### **REST API (http://localhost:10051)**
- `GET /health` - Health check
- `GET /api/conversations` - List all conversations
- `GET /api/conversations/:id` - Get conversation with messages
- `GET /api/conversations/:id/export?format=json|markdown` - Export conversation
- `POST /api/conversations` - Create new conversation
- `PUT /api/conversations/:id` - Update conversation title
- `DELETE /api/conversations/:id` - Delete conversation

### **WebSocket (ws://localhost:10052)**
- Connect to receive real-time LLM responses
- Send user messages with type `llm_user_prompt`
- Receive streaming responses with type `llm_assistant_response`
- Handle tool execution with types `llm_tool_use` and `response`

## 🎯 Use Cases

### **Learning & Experimentation**
- Understand LLM tool execution patterns
- Experiment with custom tool definitions
- Learn WebSocket-based real-time communication

### **Proof of Concept**
- Demonstrate LLM integration capabilities
- Show conversation persistence patterns
- Validate architecture for larger applications

### **Extension Base**
- Replace math tools with domain-specific tools
- Add more complex tool execution workflows
- Integrate with external APIs

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/new-tool`)
3. Make your changes
4. Test with the AI assistant
5. Commit your changes (`git commit -am 'Add new tool'`)
6. Push to the branch (`git push origin feature/new-tool`)
7. Create a Pull Request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Troubleshooting

### **Common Issues**

**"ANTHROPIC_API_KEY not set"**:
- Make sure `.env` file exists in `/server` directory
- Add your API key: `ANTHROPIC_API_KEY=your-key-here`

**WebSocket connection fails**:
- Check that server is running on port 10052
- Verify firewall settings
- Check browser console for errors

**Tools not executing**:
- Verify tool definition in `tool-definitions-maths.js`
- Check implementation in `useMathCommands.js`
- Look for errors in browser console

### **Debugging**
- Set `LOG_LEVEL=debug` in server `.env` for detailed logs
- Check WebSocket debug overlay in UI (bottom right)
- Review browser network tab for WebSocket messages

## 📞 Support

For technical questions or issues:
1. Check the error messages in browser console
2. Review server logs for backend issues
3. Create an issue in the repository

---

**Note**: This is a proof-of-concept application. For production use, additional security, error handling, rate limiting, and scalability considerations would be required.
