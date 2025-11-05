# Claude Agent Test Suite

Comprehensive CLI-based test suite for the Claude AI integration.

## Quick Start

### Show Menu
```bash
node ct1-1-claude-agent-test.js
```

### Run Single Test
```bash
node ct1-1-claude-agent-test.js 1
```

### Run Multiple Tests
```bash
node ct1-1-claude-agent-test.js 1,3,5
```

### Run All Tests
```bash
node ct1-1-claude-agent-test.js all
```

## Prerequisites

1. **Server must be running**:
   ```bash
   cd ../
   npm run dev
   ```

2. **API key configured**:
   ```bash
   # In server/.env
   ANTHROPIC_API_KEY=sk-ant-your-key-here
   ```

3. **(Optional) SpreadJS client connected**:
   - Required for tests that use tools (#2-12)
   - Test #1 works without a client
   - Test #10 specifically tests the no-client scenario

## Available Tests

### Test 1: Basic Connection & Simple Query
- **What it does**: Tests WebSocket connection and basic Claude response
- **No tools required**: Works without SpreadJS client
- **Expected**: Streaming text response from Claude
- **Usage**: `node ct1-1-claude-agent-test.js 1`

### Test 2: Server Status Check
- **What it does**: Tests the `get_spreadsheet_status` tool
- **Tools used**: `get_spreadsheet_status`
- **Expected**: Server status with client count
- **Usage**: `node ct1-1-claude-agent-test.js 2`

### Test 3: Get Sheet Names
- **What it does**: Tests listing all spreadsheet sheets
- **Tools used**: `get_sheet_names`
- **Expected**: List of sheet names
- **Usage**: `node ct1-1-claude-agent-test.js 3`

### Test 4: Get Cell Value
- **What it does**: Tests reading a specific cell value
- **Tools used**: `get_cell`
- **Expected**: Cell value from A1
- **Usage**: `node ct1-1-claude-agent-test.js 4`

### Test 5: Get Active Sheet
- **What it does**: Tests getting the currently active sheet
- **Tools used**: `get_active_sheet`
- **Expected**: Name of active sheet
- **Usage**: `node ct1-1-claude-agent-test.js 5`

### Test 6: Get Range
- **What it does**: Tests reading a range of cells
- **Tools used**: `get_range`
- **Expected**: Values from A1:B3
- **Usage**: `node ct1-1-claude-agent-test.js 6`

### Test 7: Set Cell Value
- **What it does**: Tests writing a value to a cell
- **Tools used**: `set_cell`
- **Expected**: Cell C5 set to "Test Value"
- **Usage**: `node ct1-1-claude-agent-test.js 7`

### Test 8: Set Formula
- **What it does**: Tests creating a formula
- **Tools used**: `set_formula`
- **Expected**: SUM formula in D1
- **Usage**: `node ct1-1-claude-agent-test.js 8`

### Test 9: Multi-Tool Query
- **What it does**: Tests complex query requiring multiple tools
- **Tools used**: `get_sheet_count`, `get_active_sheet`
- **Expected**: Claude uses multiple tools to answer
- **Usage**: `node ct1-1-claude-agent-test.js 9`

### Test 10: Error Handling - No Clients
- **What it does**: Tests error handling when no client connected
- **Tools used**: `get_cell` (attempts)
- **Expected**: Error message about no clients
- **Usage**: `node ct1-1-claude-agent-test.js 10`
- **Note**: Run this WITHOUT a SpreadJS client connected

### Test 11: Streaming Response
- **What it does**: Tests streaming with a longer response
- **No tools required**: Pure text response
- **Expected**: Long streaming text response
- **Usage**: `node ct1-1-claude-agent-test.js 11`

### Test 12: Complex Calculation Request
- **What it does**: Tests multiple sequential tool calls
- **Tools used**: `set_cell` (multiple), `set_formula`
- **Expected**: Sets multiple cells then creates formula
- **Usage**: `node ct1-1-claude-agent-test.js 12`

## Example Output

### Running Test 1
```bash
$ node ct1-1-claude-agent-test.js 1

================================================================================
Test #1: Basic Connection & Simple Query
Test connection and ask Claude a simple question
================================================================================

Prompt: "Hello! Can you tell me what you can do?"

→ Sending prompt to Claude...

✓ Connected to ws://localhost:10052

I can help you interact with and manage spreadsheet data through various tools...

✓ Response completed

--------------------------------------------------------------------------------
Test Results:
Duration: 2341ms

Messages Received:
  welcome: 1
  llm_assistant_response: 15

Response Length: 423 characters

Validation:
✓ All checks passed
================================================================================
```

### Running Multiple Tests
```bash
$ node ct1-1-claude-agent-test.js 1,2,3

# Runs tests 1, 2, and 3 sequentially

================================================================================
Test Summary
================================================================================

  Test 1: ✓ PASS - Basic Connection & Simple Query
  Test 2: ✓ PASS - Server Status Check
  Test 3: ✓ PASS - Get Sheet Names

Results: 3/3 passed (100%)
```

## Test Output Features

### Color-Coded Output
- 🟢 **Green**: Success messages
- 🔴 **Red**: Errors and failures
- 🟡 **Yellow**: Warnings and tools
- 🔵 **Blue**: Informational messages
- 🟣 **Magenta**: Actions being performed
- 🔷 **Cyan**: Test headers

### Real-Time Streaming
Tests display Claude's responses as they stream in real-time, just like the actual client would see them.

### Tool Execution Tracking
When Claude uses tools, you'll see:
```
🔧 Tool: get_sheet_names
   Input: {}
```

### Detailed Results
Each test shows:
- Duration
- Message counts
- Tools called with inputs
- Response length
- Validation results

## Configuration

### WebSocket URL
Override the default WebSocket URL:
```bash
WS_URL=ws://production-server:10052 node ct1-1-claude-agent-test.js 1
```

### Custom Timeouts
Each test has its own timeout (15-25 seconds). Modify in the test definition if needed.

## Troubleshooting

### "WebSocket error: connect ECONNREFUSED"
→ Server is not running. Start it with `npm run dev`

### "Error: ANTHROPIC_API_KEY is required"
→ Add API key to `server/.env`

### Test times out
→ Check if SpreadJS client is connected (for tests 2-9, 12)
→ Check server logs for errors

### "No clients connected"
→ Expected for test #10
→ For other tests, connect a SpreadJS client first

### All tests fail
→ Verify server is running: `curl http://localhost:10052`
→ Check server logs for startup errors
→ Verify API key is valid

## Advanced Usage

### Run Specific Test Sequence
```bash
# Test basic functionality
node ct1-1-claude-agent-test.js 1,2,3

# Test read operations
node ct1-1-claude-agent-test.js 3,4,5,6

# Test write operations
node ct1-1-claude-agent-test.js 7,8

# Test complex scenarios
node ct1-1-claude-agent-test.js 9,12
```

### Continuous Testing
```bash
# Run all tests in a loop
while true; do
  node ct1-1-claude-agent-test.js all
  sleep 60
done
```

### Integration with CI/CD
```bash
# Exit code 0 if all pass, 1 if any fail
node ct1-1-claude-agent-test.js all
echo $?  # Check exit code
```

## Writing Custom Tests

Add new tests to the `tests` array:

```javascript
{
  number: 13,
  name: 'My Custom Test',
  description: 'Description of what this tests',
  prompt: 'Your prompt to Claude',
  expectedMessages: ['llm_assistant_response', 'llm_tool_use'],
  timeout: 15000,
  expectError: false  // Set true if error is expected
}
```

## Test Strategy

### Recommended Test Sequence

1. **Quick Smoke Test**:
   ```bash
   node ct1-1-claude-agent-test.js 1,2
   ```

2. **Full Query Test**:
   ```bash
   node ct1-1-claude-agent-test.js 3,4,5,6
   ```

3. **Full Command Test**:
   ```bash
   node ct1-1-claude-agent-test.js 7,8
   ```

4. **Complex Scenarios**:
   ```bash
   node ct1-1-claude-agent-test.js 9,12
   ```

5. **Error Handling**:
   ```bash
   node ct1-1-claude-agent-test.js 10
   ```

### Before Deploying

Run full test suite:
```bash
node ct1-1-claude-agent-test.js all
```

Verify 100% pass rate before deploying changes.

## Files

- `ct1-1-claude-agent-test.js` - Main test suite
- `README.md` - This file

## Related Documentation

- [Server Integration](../CLAUDE_INTEGRATION.md) - Full Claude integration docs
- [Quick Start](../README_CLAUDE.md) - Quick start guide
- [Architecture](../ARCHITECTURE.md) - System architecture

## Support

Issues with tests? Check:
1. Server logs: `npm run dev` in server directory
2. Server is accessible: `curl http://localhost:10052`
3. API key is valid: Check Anthropic console
4. SpreadJS client is connected (if needed)

## Examples

### Example 1: Development Workflow
```bash
# Terminal 1: Start server
cd server
npm run dev

# Terminal 2: Run tests
cd server/client_tests
node ct1-1-claude-agent-test.js 1    # Quick test
node ct1-1-claude-agent-test.js all  # Full suite
```

### Example 2: Debugging Failed Test
```bash
# Run single failing test to see detailed output
node ct1-1-claude-agent-test.js 4

# Check server logs in other terminal
# Look for tool execution and correlation IDs
```

### Example 3: Performance Testing
```bash
# Run test multiple times to check consistency
for i in {1..10}; do
  echo "Run $i"
  node ct1-1-claude-agent-test.js 3
  sleep 2
done
```

## License

Same as parent project.
