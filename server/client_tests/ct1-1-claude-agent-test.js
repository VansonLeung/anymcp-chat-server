#!/usr/bin/env node

/**
 * Claude Agent Test Suite
 *
 * Run specific tests:
 *   node ct1-1-claude-agent-test.js 1        # Run test 1
 *   node ct1-1-claude-agent-test.js 1,3,5    # Run tests 1, 3, and 5
 *   node ct1-1-claude-agent-test.js all      # Run all tests
 *   node ct1-1-claude-agent-test.js          # Show menu
 */

const WebSocket = require('ws');

// Configuration
const WS_URL = process.env.WS_URL || 'ws://localhost:10052';

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

// Test definitions
const tests = [
  {
    number: 1,
    name: 'Basic Connection & Simple Query',
    description: 'Test connection and ask Claude a simple question',
    prompt: 'Hello! Can you tell me what you can do?',
    expectedMessages: ['llm_assistant_response'],
    timeout: 15000
  },
  {
    number: 2,
    name: 'Server Status Check',
    description: 'Ask Claude to check server status (uses get_spreadsheet_status tool)',
    prompt: 'What is the current status of the spreadsheet server?',
    expectedMessages: ['llm_assistant_response', 'llm_tool_use'],
    timeout: 15000
  },
  {
    number: 3,
    name: 'Get Sheet Names',
    description: 'Ask Claude to list all sheets (uses get_sheet_names tool)',
    prompt: 'What sheets are in the spreadsheet?',
    expectedMessages: ['llm_assistant_response', 'llm_tool_use'],
    timeout: 15000
  },
  {
    number: 4,
    name: 'Get Cell Value',
    description: 'Ask Claude to get a specific cell value (uses get_cell tool)',
    prompt: 'What is the value in cell A1 of the first sheet?',
    expectedMessages: ['llm_assistant_response', 'llm_tool_use'],
    timeout: 15000
  },
  {
    number: 5,
    name: 'Get Active Sheet',
    description: 'Ask Claude to get the active sheet name',
    prompt: 'Which sheet is currently active?',
    expectedMessages: ['llm_assistant_response', 'llm_tool_use'],
    timeout: 15000
  },
  {
    number: 6,
    name: 'Get Range',
    description: 'Ask Claude to get a range of cells',
    prompt: 'Can you get the values from cells A1 to B3?',
    expectedMessages: ['llm_assistant_response', 'llm_tool_use'],
    timeout: 15000
  },
  {
    number: 7,
    name: 'Set Cell Value',
    description: 'Ask Claude to set a cell value (uses set_cell tool)',
    prompt: 'Please set cell C5 to the value "Test Value"',
    expectedMessages: ['llm_assistant_response', 'llm_tool_use'],
    timeout: 15000
  },
  {
    number: 8,
    name: 'Set Formula',
    description: 'Ask Claude to set a formula (uses set_formula tool)',
    prompt: 'Create a SUM formula in cell D1 that adds cells A1 to A10',
    expectedMessages: ['llm_assistant_response', 'llm_tool_use'],
    timeout: 15000
  },
  {
    number: 9,
    name: 'Multi-Tool Query',
    description: 'Ask a complex question requiring multiple tools',
    prompt: 'Can you tell me how many sheets there are and what the active sheet is?',
    expectedMessages: ['llm_assistant_response', 'llm_tool_use'],
    timeout: 20000
  },
  {
    number: 10,
    name: 'Error Handling - No Clients',
    description: 'Test error handling when no SpreadJS client is connected',
    prompt: 'Get the value in cell A1',
    expectedMessages: ['llm_assistant_response', 'llm_error'],
    timeout: 15000,
    expectError: true
  },
  {
    number: 11,
    name: 'Streaming Response',
    description: 'Test streaming with a longer response',
    prompt: 'Explain to me in detail what tools you have access to for controlling the spreadsheet.',
    expectedMessages: ['llm_assistant_response'],
    timeout: 20000
  },
  {
    number: 12,
    name: 'Complex Calculation Request',
    description: 'Ask Claude to perform a complex operation',
    prompt: 'Set cells A1 to A5 with values 10, 20, 30, 40, 50, then create a SUM formula in A6',
    expectedMessages: ['llm_assistant_response', 'llm_tool_use'],
    timeout: 25000
  },
  {
    number: 13,
    name: 'Message ID Grouping',
    description: 'Verify that all messages have messageId and are properly grouped',
    prompt: 'Check the server status and tell me what you found.',
    expectedMessages: ['llm_assistant_response', 'llm_tool_use'],
    timeout: 15000,
    validateMessageIds: true
  }
];

// Test runner class
class TestRunner {
  constructor(testNumber) {
    this.test = tests.find(t => t.number === testNumber);
    this.ws = null;
    this.receivedMessages = [];
    this.responseText = '';
    this.toolCalls = [];
    this.errors = [];
    this.startTime = null;
    this.endTime = null;
    this.messageIds = new Set();
    this.messagesWithIds = [];
  }

  async run() {
    if (!this.test) {
      console.error(`${colors.red} Test not found${colors.reset}`);
      return false;
    }

    this.printTestHeader();

    return new Promise((resolve) => {
      this.startTime = Date.now();

      // Setup timeout
      const timeout = setTimeout(() => {
        this.endTime = Date.now();
        console.log(`\n${colors.red} Test timed out after ${this.test.timeout}ms${colors.reset}`);
        this.cleanup();
        resolve(false);
      }, this.test.timeout);

      // Create WebSocket connection
      this.ws = new WebSocket(WS_URL);

      this.ws.on('open', () => {
        console.log(`${colors.green} Connected to ${WS_URL}${colors.reset}`);
        this.sendPrompt();
      });

      this.ws.on('message', (message) => {
        const data = JSON.parse(message.toString());
        this.handleMessage(data);

        // Check if test is complete
        if (this.isTestComplete(data)) {
          clearTimeout(timeout);
          this.endTime = Date.now();
          this.printResults();
          const success = this.validateResults();
          this.cleanup();
          resolve(success);
        }
      });

      this.ws.on('error', (error) => {
        clearTimeout(timeout);
        this.endTime = Date.now();
        console.error(`\n${colors.red} WebSocket error: ${error.message}${colors.reset}`);
        this.cleanup();
        resolve(false);
      });

      this.ws.on('close', () => {
        if (!this.endTime) {
          clearTimeout(timeout);
          this.endTime = Date.now();
          console.log(`\n${colors.yellow}� Connection closed unexpectedly${colors.reset}`);
          resolve(false);
        }
      });
    });
  }

  printTestHeader() {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`${colors.bright}${colors.cyan}Test #${this.test.number}: ${this.test.name}${colors.reset}`);
    console.log(`${colors.dim}${this.test.description}${colors.reset}`);
    console.log(`${'='.repeat(80)}\n`);
    console.log(`${colors.blue}Prompt:${colors.reset} "${this.test.prompt}"\n`);
  }

  sendPrompt() {
    console.log(`${colors.magenta}� Sending prompt to Claude...${colors.reset}\n`);

    this.ws.send(JSON.stringify({
      type: 'llm_user_prompt',
      command: this.test.prompt,
      timestamp: new Date().toISOString()
    }));
  }

  handleMessage(data) {
    this.receivedMessages.push(data.type);

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

    switch (data.type) {
      case 'welcome':
        // Ignore welcome message
        break;

      case 'llm_assistant_response':
        if (data.done) {
          console.log(`\n${colors.green} Response completed${colors.reset}`);
        } else {
          // Stream text to console
          process.stdout.write(data.text);
          this.responseText += data.text;
        }
        break;

      case 'llm_tool_use':
        this.toolCalls.push({
          name: data.toolName,
          input: data.toolInput
        });
        console.log(`\n${colors.yellow}=' Tool: ${colors.bright}${data.toolName}${colors.reset}`);
        console.log(`${colors.dim}   Input: ${JSON.stringify(data.toolInput)}${colors.reset}\n`);
        break;

      case 'llm_error':
        this.errors.push(data.error);
        console.log(`\n${colors.red}L Error: ${data.error}${colors.reset}`);
        break;

      default:
        // Ignore other message types
        break;
    }
  }

  isTestComplete(data) {
    // Test is complete when we receive a done message or an error
    if (data.type === 'llm_assistant_response' && data.done) {
      return true;
    }
    if (data.type === 'llm_error') {
      return true;
    }
    return false;
  }

  printResults() {
    const duration = this.endTime - this.startTime;

    console.log(`\n${'-'.repeat(80)}`);
    console.log(`${colors.bright}Test Results:${colors.reset}`);
    console.log(`${colors.dim}Duration: ${duration}ms${colors.reset}`);
    console.log(`\n${colors.bright}Messages Received:${colors.reset}`);

    // Count message types
    const messageCounts = {};
    this.receivedMessages.forEach(type => {
      messageCounts[type] = (messageCounts[type] || 0) + 1;
    });

    Object.entries(messageCounts).forEach(([type, count]) => {
      console.log(`  ${type}: ${count}`);
    });

    if (this.toolCalls.length > 0) {
      console.log(`\n${colors.bright}Tools Called (${this.toolCalls.length}):${colors.reset}`);
      this.toolCalls.forEach((tool, idx) => {
        console.log(`  ${idx + 1}. ${tool.name}`);
        console.log(`     ${colors.dim}${JSON.stringify(tool.input)}${colors.reset}`);
      });
    }

    if (this.errors.length > 0) {
      console.log(`\n${colors.bright}Errors (${this.errors.length}):${colors.reset}`);
      this.errors.forEach((error, idx) => {
        console.log(`  ${idx + 1}. ${colors.red}${error}${colors.reset}`);
      });
    }

    if (this.responseText) {
      console.log(`\n${colors.bright}Response Length:${colors.reset} ${this.responseText.length} characters`);
    }

    if (this.test.validateMessageIds && this.messagesWithIds.length > 0) {
      console.log(`\n${colors.bright}MessageId Tracking:${colors.reset}`);
      console.log(`  Unique messageIds: ${this.messageIds.size}`);
      console.log(`  Messages with messageId: ${this.messagesWithIds.length}`);

      // Group by messageId
      const grouped = {};
      const grouped_messages = {};
      this.messagesWithIds.forEach(msg => {
        if (!grouped[msg.messageId]) {
          grouped[msg.messageId] = [];
        }
        grouped[msg.messageId].push(msg.type);
      });
      this.messagesWithIds.forEach(msg => {
        if (!grouped_messages[msg.messageId]) {
          grouped_messages[msg.messageId] = [];
        }
        grouped_messages[msg.messageId].push(msg.type === 'llm_assistant_response' ? this.responseText : JSON.stringify(msg));
      });

      console.log(`\n${colors.dim}  Message groups:${colors.reset}`);
      Object.entries(grouped).forEach(([id, types]) => {
        console.log(`    ${id}: ${types.join(', ')}`);
      });
      Object.entries(grouped_messages).forEach(([id, messages]) => {
        console.log(`\n${colors.dim}  Messages for ${id}:${colors.reset}`);
        messages.forEach((msg, idx) => {
          console.log(`    ${idx + 1}. ${msg}`);
        });
      });
    }
  }

  validateResults() {
    let success = true;
    const issues = [];

    // Check if expected message types were received
    this.test.expectedMessages.forEach(expectedType => {
      if (!this.receivedMessages.includes(expectedType)) {
        issues.push(`Missing expected message type: ${expectedType}`);
        success = false;
      }
    });

    // Check error expectations
    if (this.test.expectError && this.errors.length === 0) {
      issues.push('Expected an error but none occurred');
      success = false;
    }

    if (!this.test.expectError && this.errors.length > 0) {
      issues.push('Unexpected error occurred');
      success = false;
    }

    // Validate messageId if test requires it
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

        // Check that all messages in this conversation turn have the same messageId
        // (or at least all messages before a tool use recursion share the same ID)
        const messageIdList = this.messagesWithIds.map(m => m.messageId);
        const uniqueIds = new Set(messageIdList);

        // It's ok to have multiple messageIds if there are tool use recursions
        // But we should at least have some messageIds
        if (uniqueIds.size === 0) {
          issues.push('No valid messageIds found');
          success = false;
        }

        // Verify that streaming messages (non-done llm_assistant_response)
        // share the same messageId as their done message
        const responseMessages = this.messagesWithIds.filter(m =>
          m.type === 'llm_assistant_response'
        );

        if (responseMessages.length > 1) {
          // Group by done status
          const streamingMessages = responseMessages.filter(m => !m.done);
          const doneMessage = responseMessages.find(m => m.done);

          if (doneMessage && streamingMessages.length > 0) {
            const allSameId = streamingMessages.every(m => m.messageId === doneMessage.messageId);
            if (!allSameId) {
              issues.push('Streaming messages have different messageIds from done message');
              success = false;
            }
          }
        }
      }
    }

    // Print validation results
    console.log(`\n${colors.bright}Validation:${colors.reset}`);
    if (success) {
      console.log(`${colors.green} All checks passed${colors.reset}`);
    } else {
      console.log(`${colors.red} Test failed:${colors.reset}`);
      issues.forEach(issue => {
        console.log(`  ${colors.red}" ${issue}${colors.reset}`);
      });
    }

    console.log(`${'='.repeat(80)}\n`);

    return success;
  }

  cleanup() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.close();
    }
  }
}

// Menu and test execution
function showMenu() {
  console.log(`\n${colors.bright}${colors.cyan}Claude Agent Test Suite${colors.reset}\n`);
  console.log(`${colors.dim}Available tests:${colors.reset}\n`);

  tests.forEach(test => {
    console.log(`  ${colors.bright}${test.number}.${colors.reset} ${test.name}`);
    console.log(`     ${colors.dim}${test.description}${colors.reset}`);
  });

  console.log(`\n${colors.bright}Usage:${colors.reset}`);
  console.log(`  ${colors.green}node ct1-1-claude-agent-test.js <test_numbers>${colors.reset}`);
  console.log(`\n${colors.bright}Examples:${colors.reset}`);
  console.log(`  node ct1-1-claude-agent-test.js 1        ${colors.dim}# Run test 1${colors.reset}`);
  console.log(`  node ct1-1-claude-agent-test.js 1,3,5    ${colors.dim}# Run tests 1, 3, and 5${colors.reset}`);
  console.log(`  node ct1-1-claude-agent-test.js all      ${colors.dim}# Run all tests${colors.reset}`);
  console.log(`  node ct1-1-claude-agent-test.js          ${colors.dim}# Show this menu${colors.reset}`);
  console.log();
}

async function runTests(testNumbers) {
  const results = [];

  for (const testNum of testNumbers) {
    const runner = new TestRunner(testNum);
    const success = await runner.run();
    results.push({ number: testNum, success });

    // Wait a bit between tests
    if (testNumbers.length > 1) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  // Print summary
  if (results.length > 1) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`${colors.bright}${colors.cyan}Test Summary${colors.reset}`);
    console.log(`${'='.repeat(80)}\n`);

    results.forEach(result => {
      const test = tests.find(t => t.number === result.number);
      const status = result.success
        ? `${colors.green} PASS${colors.reset}`
        : `${colors.red} FAIL${colors.reset}`;
      console.log(`  Test ${result.number}: ${status} - ${test.name}`);
    });

    const passed = results.filter(r => r.success).length;
    const total = results.length;
    const passRate = Math.round((passed / total) * 100);

    console.log(`\n${colors.bright}Results: ${passed}/${total} passed (${passRate}%)${colors.reset}\n`);
  }
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    showMenu();
    process.exit(0);
  }

  const input = args[0].toLowerCase();

  if (input === 'all') {
    return tests.map(t => t.number);
  }

  if (input === 'help' || input === '-h' || input === '--help') {
    showMenu();
    process.exit(0);
  }

  // Parse comma-separated numbers
  const numbers = input.split(',').map(n => parseInt(n.trim())).filter(n => !isNaN(n));

  if (numbers.length === 0) {
    console.error(`${colors.red}Invalid test number(s): ${args[0]}${colors.reset}`);
    showMenu();
    process.exit(1);
  }

  // Validate test numbers
  const invalidNumbers = numbers.filter(n => !tests.find(t => t.number === n));
  if (invalidNumbers.length > 0) {
    console.error(`${colors.red}Invalid test number(s): ${invalidNumbers.join(', ')}${colors.reset}`);
    console.log(`${colors.yellow}Valid test numbers: 1-${tests.length}${colors.reset}`);
    process.exit(1);
  }

  return numbers;
}

// Main execution
async function main() {
  try {
    const testNumbers = parseArgs();
    await runTests(testNumbers);
    process.exit(0);
  } catch (error) {
    console.error(`${colors.red}Error: ${error.message}${colors.reset}`);
    process.exit(1);
  }
}

// Handle SIGINT (Ctrl+C)
process.on('SIGINT', () => {
  console.log(`\n\n${colors.yellow}Tests interrupted by user${colors.reset}\n`);
  process.exit(130);
});

// Run main
main();
