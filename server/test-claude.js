/**
 * Test script for Claude Agent integration
 * This script simulates a client sending an llm_user_prompt message
 */

const WebSocket = require('ws');

// Configuration
const WS_URL = 'ws://localhost:10052';

// Create WebSocket connection
const ws = new WebSocket(WS_URL);

ws.on('open', () => {
  console.log('Connected to WebSocket server');

  // Send a test LLM prompt
  console.log('\n📤 Sending test prompt to Claude...\n');

  ws.send(JSON.stringify({
    type: 'llm_user_prompt',
    message: 'Hello! Can you tell me the status of the spreadsheet server?',
    timestamp: new Date().toISOString()
  }));
});

ws.on('message', (message) => {
  try {
    const data = JSON.parse(message.toString());

    switch (data.type) {
      case 'welcome':
        console.log('✅ Connected:', data.message);
        break;

      case 'llm_assistant_response':
        if (data.done) {
          console.log('\n✅ Response completed\n');
          // Close connection after receiving complete response
          setTimeout(() => {
            console.log('Closing connection...');
            ws.close();
          }, 1000);
        } else {
          // Stream text as it arrives
          process.stdout.write(data.text);
        }
        break;

      case 'llm_tool_use':
        console.log(`\n🔧 Claude is using tool: ${data.toolName}`);
        console.log('   Input:', JSON.stringify(data.toolInput, null, 2));
        break;

      case 'llm_error':
        console.error('\n❌ Error:', data.error);
        ws.close();
        break;

      default:
        console.log('Received:', data.type);
    }
  } catch (error) {
    console.error('Error parsing message:', error);
  }
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error.message);
});

ws.on('close', () => {
  console.log('\n👋 Connection closed');
  process.exit(0);
});

// Handle process termination
process.on('SIGINT', () => {
  console.log('\nClosing connection...');
  ws.close();
  process.exit(0);
});
