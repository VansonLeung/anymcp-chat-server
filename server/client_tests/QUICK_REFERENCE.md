# Claude Agent Test Suite - Quick Reference

## 🚀 Quick Commands

```bash
# Show menu
node ct1-1-claude-agent-test.js

# Run single test
node ct1-1-claude-agent-test.js 1

# Run multiple tests
node ct1-1-claude-agent-test.js 1,3,5

# Run all tests
node ct1-1-claude-agent-test.js all
```

## 📋 Test List

| # | Test Name | Tools Used | Client Required? |
|---|-----------|------------|------------------|
| 1 | Basic Connection & Simple Query | None | ❌ No |
| 2 | Server Status Check | `get_spreadsheet_status` | ✅ Optional |
| 3 | Get Sheet Names | `get_sheet_names` | ✅ Yes |
| 4 | Get Cell Value | `get_cell` | ✅ Yes |
| 5 | Get Active Sheet | `get_active_sheet` | ✅ Yes |
| 6 | Get Range | `get_range` | ✅ Yes |
| 7 | Set Cell Value | `set_cell` | ✅ Yes |
| 8 | Set Formula | `set_formula` | ✅ Yes |
| 9 | Multi-Tool Query | `get_sheet_count`, `get_active_sheet` | ✅ Yes |
| 10 | Error Handling - No Clients | `get_cell` (fails) | ❌ No (must be disconnected) |
| 11 | Streaming Response | None | ❌ No |
| 12 | Complex Calculation | `set_cell`, `set_formula` | ✅ Yes |

## 🎯 Common Test Sequences

### Smoke Test (1 minute)
```bash
node ct1-1-claude-agent-test.js 1,2
```

### Read Operations (2 minutes)
```bash
node ct1-1-claude-agent-test.js 3,4,5,6
```

### Write Operations (2 minutes)
```bash
node ct1-1-claude-agent-test.js 7,8
```

### Complex Scenarios (3 minutes)
```bash
node ct1-1-claude-agent-test.js 9,12
```

### Full Suite (5 minutes)
```bash
node ct1-1-claude-agent-test.js all
```

## 🔧 Setup Checklist

Before running tests:

- [ ] Server running: `npm run dev`
- [ ] API key in `server/.env`: `ANTHROPIC_API_KEY=sk-ant-...`
- [ ] SpreadJS client connected (for tests 2-9, 12)

## 📊 Expected Output

### ✅ Success
```
✓ Connected to ws://localhost:10052
[Claude's streaming response...]
✓ Response completed

Validation:
✓ All checks passed
```

### ❌ Failure
```
✗ WebSocket error: connect ECONNREFUSED
```
→ Server not running

```
✗ Test timed out after 15000ms
```
→ No SpreadJS client connected

## 🐛 Troubleshooting

| Error | Solution |
|-------|----------|
| `ECONNREFUSED` | Start server: `npm run dev` |
| `ANTHROPIC_API_KEY is required` | Add key to `server/.env` |
| `No clients connected` | Connect SpreadJS client |
| Test timeout | Check SpreadJS client responding |

## 💡 Tips

- Run test #1 first (no client needed)
- Test #10 requires NO client connected
- Use `all` to run complete suite
- Watch server logs in another terminal
- Tests run sequentially with 2s delay

## 🎨 Output Legend

- 🟢 Green = Success
- 🔴 Red = Error
- 🟡 Yellow = Tool usage
- 🔵 Blue = Info
- 🟣 Magenta = Action

## 📝 Example Session

```bash
# Terminal 1: Start server
cd server
npm run dev

# Terminal 2: Run tests
cd server/client_tests
node ct1-1-claude-agent-test.js 1    # Basic test
node ct1-1-claude-agent-test.js 2    # With tools
node ct1-1-claude-agent-test.js all  # Full suite
```

## 🔗 Links

- [Full Documentation](README.md)
- [Claude Integration](../CLAUDE_INTEGRATION.md)
- [Architecture](../ARCHITECTURE.md)
