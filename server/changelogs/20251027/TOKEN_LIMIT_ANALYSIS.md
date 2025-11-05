# Token Limit Analysis - Is 10,240 Tokens Sufficient?

## Current Approach

**Single Factor:**
- ✅ Token Limit: 10,240 tokens per conversation

## Problem Analysis

### Issue 1: Token Limit vs Context Window

**Claude Sonnet 4.5 Specifications:**
- **Context Window:** 200,000 tokens
- **Output Tokens:** Up to 8,192 tokens per response

**Your Limit:** 10,240 tokens

**Analysis:**
- Your limit is only **5% of the full context window**
- This seems **very conservative** for a modern LLM

**Questions:**
1. ❓ Why such a low limit (10,240)?
   - Cost control? (Each API call costs based on tokens)
   - Performance? (Faster responses with shorter context)
   - Database size? (Smaller conversations in SQLite)
   - User experience? (Prevent extremely long conversations)

2. ❓ What's the use case?
   - **Short sessions:** Quick spreadsheet tasks → Lower limit OK
   - **Long sessions:** Complex analysis over hours → Need higher limit

---

## Additional Factors to Consider

### Factor 1: **Message Count Limit**

**Why?**
- Even with low tokens, 1000+ tiny messages = cluttered conversation
- User experience degrades with too many messages

**Recommendation:**
```javascript
{
  tokenLimit: 10240,
  messageLimit: 100,  // Max 100 messages before summarization

  // Trigger summarization when EITHER limit is reached
  shouldSummarize: tokenCount > 10240 || messageCount > 100
}
```

**Example Scenario:**
- User sends 150 short messages: "set A1 to 1", "set A2 to 2", etc.
- Each message = ~20 tokens
- Total = 3,000 tokens (under token limit)
- But 150 messages = terrible UX
- **Solution:** Message limit triggers summarization at 100 messages

---

### Factor 2: **Time-Based Limits**

**Why?**
- Conversations older than X hours may contain stale context
- User might have made changes outside of chat

**Recommendation:**
```javascript
{
  tokenLimit: 10240,
  messageLimit: 100,
  timeLimit: 24 * 60 * 60 * 1000,  // 24 hours in milliseconds

  // Auto-summarize conversations older than 24 hours
  shouldSummarize:
    tokenCount > 10240 ||
    messageCount > 100 ||
    (Date.now() - firstMessageTimestamp) > timeLimit
}
```

**Example Scenario:**
- User starts conversation on Monday
- Returns on Wednesday (48 hours later)
- Context from Monday may be outdated
- **Solution:** Auto-summarize old conversations

**Question:**
❓ Should old conversations be:
- **Option A:** Auto-summarized when resumed
- **Option B:** Archived (read-only, create new conversation)
- **Option C:** Left as-is (let user decide)

---

### Factor 3: **Tool Execution Count**

**Why?**
- Tool executions can generate large outputs
- 50 tool calls with JSON results = huge token usage
- Tool results are often redundant (e.g., multiple "get status" calls)

**Recommendation:**
```javascript
{
  tokenLimit: 10240,
  messageLimit: 100,
  toolExecutionLimit: 50,  // Max 50 tool calls before summarization

  shouldSummarize:
    tokenCount > 10240 ||
    messageCount > 100 ||
    toolExecutionCount > 50
}
```

**Example Scenario:**
- User asks Claude to "analyze each cell in column A" (100 cells)
- Claude calls `get_cell` 100 times
- Each result adds tokens
- **Solution:** Tool execution limit triggers summarization

**Advanced:** Smart tool result retention
```javascript
// Keep only the most recent tool results, summarize old ones
{
  toolResultRetention: {
    keepRecent: 10,  // Keep last 10 tool results
    summarizeOlder: true  // Summarize older results
  }
}
```

---

### Factor 4: **Conversation Complexity Score**

**Why?**
- Simple Q&A: "What's in A1?" → "100"
- Complex analysis: Multi-step reasoning, multiple tool calls
- Complex conversations benefit from longer context

**Recommendation:**
```javascript
{
  baseTokenLimit: 10240,

  // Adjust limit based on complexity
  getEffectiveLimit: (conversation) => {
    const complexity = calculateComplexity(conversation);

    if (complexity === 'simple') return 10240;      // Basic Q&A
    if (complexity === 'medium') return 20480;      // Some tool use
    if (complexity === 'complex') return 40960;     // Heavy analysis

    return 10240;
  }
}

function calculateComplexity(conversation) {
  const avgToolsPerMessage = toolCount / messageCount;
  const avgTokensPerMessage = tokenCount / messageCount;

  if (avgToolsPerMessage > 3 || avgTokensPerMessage > 200) {
    return 'complex';
  }
  if (avgToolsPerMessage > 1 || avgTokensPerMessage > 100) {
    return 'medium';
  }
  return 'simple';
}
```

---

### Factor 5: **User-Configurable Limits**

**Why?**
- Power users may want longer conversations
- Casual users may prefer quick, focused chats

**Recommendation:**
```javascript
// User settings (stored per user or per conversation)
{
  userPreferences: {
    conversationLength: 'short' | 'medium' | 'long',

    limits: {
      short: { tokens: 5120, messages: 50 },
      medium: { tokens: 10240, messages: 100 },
      long: { tokens: 20480, messages: 200 }
    }
  }
}
```

---

### Factor 6: **Cost-Based Limits**

**Why?**
- API calls cost money
- Claude Sonnet 4.5 pricing (as of 2024):
  - Input: $3 per million tokens
  - Output: $15 per million tokens

**Calculation:**
```javascript
// Example conversation cost
Input tokens: 10,000
Output tokens: 2,000

Cost = (10,000 * $3 / 1,000,000) + (2,000 * $15 / 1,000,000)
     = $0.03 + $0.03
     = $0.06 per conversation
```

**Recommendation:**
```javascript
{
  tokenLimit: 10240,
  costLimit: 0.50,  // Max $0.50 per conversation

  // Track cumulative cost
  getCurrentCost: (conversation) => {
    const inputCost = (inputTokens * 3) / 1000000;
    const outputCost = (outputTokens * 15) / 1000000;
    return inputCost + outputCost;
  },

  shouldSummarize:
    tokenCount > 10240 ||
    getCurrentCost(conversation) > 0.50
}
```

**Question:**
❓ Is cost a concern for your use case?
- If yes, add cost tracking
- If no, ignore this factor

---

## Recommended Multi-Factor Approach

### Option A: Conservative (Your Original + Message Limit)
```javascript
const limits = {
  tokens: 10240,
  messages: 100,

  shouldSummarize: (conversation) => {
    return conversation.tokenCount > 10240 ||
           conversation.messageCount > 100;
  }
};
```

**Pros:**
- Simple to understand
- Low cost
- Fast responses

**Cons:**
- May truncate complex conversations too early
- Users might need multiple conversations for one task

---

### Option B: Balanced (Recommended)
```javascript
const limits = {
  tokens: 20480,           // 2x your original (still conservative)
  messages: 150,           // Reasonable message limit
  toolExecutions: 75,      // Prevent tool spam
  age: 48 * 60 * 60 * 1000, // 48 hours

  shouldSummarize: (conversation) => {
    const age = Date.now() - conversation.createdAt;

    return conversation.tokenCount > 20480 ||
           conversation.messageCount > 150 ||
           conversation.toolExecutionCount > 75 ||
           age > (48 * 60 * 60 * 1000);
  }
};
```

**Pros:**
- Handles both simple and complex conversations
- Prevents runaway tool usage
- Auto-cleans old conversations

**Cons:**
- Slightly more complex logic
- Higher cost (but still <5% of context window)

---

### Option C: Adaptive (Advanced)
```javascript
const limits = {
  base: {
    tokens: 10240,
    messages: 100,
    toolExecutions: 50
  },

  // Dynamically adjust based on conversation type
  getEffectiveLimits: (conversation) => {
    const complexity = analyzeComplexity(conversation);
    const multiplier = complexity === 'high' ? 2 : 1;

    return {
      tokens: limits.base.tokens * multiplier,
      messages: limits.base.messages * multiplier,
      toolExecutions: limits.base.toolExecutions * multiplier
    };
  },

  shouldSummarize: (conversation) => {
    const effective = limits.getEffectiveLimits(conversation);

    return conversation.tokenCount > effective.tokens ||
           conversation.messageCount > effective.messages ||
           conversation.toolExecutionCount > effective.toolExecutions;
  }
};

function analyzeComplexity(conversation) {
  const avgToolsPerMsg = conversation.toolExecutionCount / conversation.messageCount;
  const avgTokensPerMsg = conversation.tokenCount / conversation.messageCount;

  // High complexity: lots of tools or long messages
  if (avgToolsPerMsg > 2 || avgTokensPerMsg > 150) {
    return 'high';
  }

  return 'low';
}
```

**Pros:**
- Best of both worlds
- Efficient for simple tasks
- Generous for complex tasks

**Cons:**
- Most complex implementation
- Harder to predict behavior

---

## Database Schema Updates

Add tracking fields to `conversations` table:

```sql
CREATE TABLE conversations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    -- Token tracking
    token_count INTEGER DEFAULT 0,
    input_token_count INTEGER DEFAULT 0,   -- NEW
    output_token_count INTEGER DEFAULT 0,  -- NEW

    -- Message tracking
    message_count INTEGER DEFAULT 0,       -- NEW

    -- Tool tracking
    tool_execution_count INTEGER DEFAULT 0, -- NEW

    -- Cost tracking (optional)
    estimated_cost REAL DEFAULT 0.0,       -- NEW (in USD)

    -- Summarization tracking
    summary TEXT,
    summarized_at DATETIME,                -- NEW
    times_summarized INTEGER DEFAULT 0     -- NEW
);
```

---

## Recommendations

### For Your Use Case (Spreadsheet Assistant):

**I recommend Option B (Balanced) with these settings:**

```javascript
const conversationLimits = {
  // Primary limits
  tokenLimit: 20480,              // ~10% of context window
  messageLimit: 150,              // Reasonable for most sessions
  toolExecutionLimit: 100,        // Spreadsheet operations can be numerous

  // Secondary limits
  conversationAge: 24 * 60 * 60 * 1000,  // 24 hours (1 day)

  // Summarization trigger
  shouldSummarize: (conversation) => {
    const age = Date.now() - new Date(conversation.createdAt).getTime();

    return (
      conversation.tokenCount >= 20480 ||
      conversation.messageCount >= 150 ||
      conversation.toolExecutionCount >= 100 ||
      (age >= 24 * 60 * 60 * 1000 && conversation.messageCount > 10)
    );
  },

  // Warning thresholds (notify user before summarizing)
  warningThresholds: {
    tokenWarning: 16384,      // Warn at 80%
    messageWarning: 120,       // Warn at 80%
    toolWarning: 80            // Warn at 80%
  }
};
```

**Rationale:**
1. **20,480 tokens** - Handles complex spreadsheet analysis without being wasteful
2. **150 messages** - Prevents UI clutter from rapid-fire commands
3. **100 tool executions** - Spreadsheet ops can be tool-heavy (get/set cells)
4. **24 hour age** - Stale conversations auto-summarized when resumed
5. **Warning at 80%** - User gets heads-up before summarization happens

---

## UI Display

Show limits to user:

```
┌─────────────────────────────────────────┐
│ 💬 Spreadsheet Analysis                 │
│                                         │
│ 📊 Usage:                               │
│   Tokens:  12,450 / 20,480 (61%) ⚠️    │
│   Messages: 45 / 150 (30%)             │
│   Tools:    67 / 100 (67%) ⚠️          │
│   Age:      2 hours                     │
│                                         │
│ ⚠️ Approaching tool limit              │
│                                         │
│ [Chat messages...]                      │
└─────────────────────────────────────────┘
```

---

## Questions for You

Please clarify:

1. ❓ **Why 10,240 tokens specifically?**
   - Cost concern?
   - Performance?
   - Just a starting point?

2. ❓ **Which option do you prefer?**
   - **Option A:** Simple (10K tokens + message limit)
   - **Option B:** Balanced (20K tokens + multiple limits) ← **Recommended**
   - **Option C:** Adaptive (dynamic limits based on complexity)

3. ❓ **Should we track costs?**
   - Yes, show estimated cost to user
   - No, not a concern

4. ❓ **Conversation age limit?**
   - Should old conversations auto-summarize?
   - If yes, what age? (24h, 48h, 1 week?)

5. ❓ **Should users be warned before auto-summarization?**
   - Yes, show warning at 80% of limit
   - No, just auto-summarize silently

6. ❓ **Should users be able to configure limits?**
   - Yes, per-conversation or per-user settings
   - No, use fixed limits for all users

---

## My Strong Recommendation

**Use Option B with these specific values:**

```javascript
{
  tokenLimit: 20480,        // Instead of 10,240
  messageLimit: 150,
  toolExecutionLimit: 100,
  conversationAge: 24 * 60 * 60 * 1000,

  // Show warnings at 80%
  showWarnings: true,

  // Don't track cost (unless you need it)
  trackCost: false
}
```

**Why?**
- ✅ 10,240 tokens is too restrictive for complex spreadsheet work
- ✅ Multiple factors prevent both token overuse AND poor UX
- ✅ 20,480 tokens still only 10% of context window (very safe)
- ✅ Message/tool limits prevent non-token issues
- ✅ Age limit keeps conversations fresh

**Cost Impact:**
- 10,240 tokens ≈ $0.03-0.05 per conversation
- 20,480 tokens ≈ $0.06-0.10 per conversation
- Difference: ~$0.05 per conversation (negligible for most use cases)

What do you think? Should we go with Option B?
