#!/usr/bin/env node

// Simple WebSocket client test
const WebSocket = require('ws');

const serverUrl = process.argv[2] || 'ws://localhost:10052';

console.log(`Testing WebSocket connection to ${serverUrl}...`);

const ws = new WebSocket(serverUrl);

ws.on('open', () => {
  console.log('✅ Connected to WebSocket server');

  // Send a ping
  ws.send(JSON.stringify({ type: 'ping' }));
  console.log('📤 Sent ping message');
});

ws.on('message', (data) => {
  try {
    const message = JSON.parse(data.toString());
    console.log('📥 Received:', message);

    if (message.type === 'pong') {
      console.log('✅ Ping-pong test successful');

      // Send a test command
      setTimeout(() => {
        ws.send(JSON.stringify({
          type: 'command',
          command: 'testCommand',
          params: ['Hello from test client']
        }));
        console.log('📤 Sent test command');
      }, 1000);
    }

    if (message.type === 'command_ack') {
      console.log('✅ Command acknowledgment received');
      console.log('🎉 All tests passed!');
      ws.close();
    }
  } catch (error) {
    console.error('❌ Error parsing message:', error);
  }
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error.message);
  process.exit(1);
});

ws.on('close', () => {
  console.log('🔌 Connection closed');
  process.exit(0);
});

// Timeout after 10 seconds
setTimeout(() => {
  console.error('❌ Test timeout - no response from server');
  ws.close();
  process.exit(1);
}, 10000);