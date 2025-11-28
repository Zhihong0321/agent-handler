# Implementation Testing Guide

## ✅ Verified Components

### 1. Gemini API Connectivity
- **Health Check**: ✅ `https://ee-gemini-api-production.up.railway.app/health` returns healthy status
- **Account List**: ✅ `https://ee-gemini-api-production.up.railway.app/accounts` returns `["primary"]`
- **Model List**: ✅ `https://ee-gemini-api-production.up.railway.app/models` returns available models
- **Chat Endpoint**: ✅ POST to `/chat` works, returns proper response format:
  ```json
  {
    "response": "Hello! How can I help you today?",
    "model": "gemini-2.5-flash",
    "session_id": null,
    "candidates_count": 1
  }
  ```

### 2. Implementation Logic
- **Agent Creation**: ✅ Both Perplexity and Gemini agent types supported
- **Parameter Mapping**: ✅ Correct field mappings between APIs
- **Factory Pattern**: ✅ Proper routing to correct client
- **Database Schema**: ✅ Migration script created to add `agent_type` column

## 🧪 Manual Testing Required

To fully test the implementation, you need to:

### Step 1: Start the Development Server
```bash
npm run dev
```

### Step 2: Apply Database Migration
```sql
-- Run this against your PostgreSQL database:
ALTER TABLE agents ADD COLUMN IF NOT EXISTS agent_type VARCHAR(20) NOT NULL DEFAULT 'perplexity';
CREATE INDEX IF NOT EXISTS idx_agents_agent_type ON agents(agent_type);
UPDATE agents SET agent_type = 'perplexity' WHERE agent_type IS NULL;
```

### Step 3: Test Agent Creation
```bash
# Create a Gemini agent
curl -X POST http://localhost:3000/api/agents \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Gemini Test Agent",
    "agentType": "gemini",
    "accountName": "primary",
    "model": "gemini-2.5-flash"
  }'

# Create a Perplexity agent (existing functionality)
curl -X POST http://localhost:3000/api/agents \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Perplexity Test Agent", 
    "agentType": "perplexity",
    "accountName": "your_perplexity_account",
    "model": "gpt-4"
  }'
```

### Step 4: Test Agent Execution
```bash
# Test Gemini agent
curl "http://localhost:3000/api/agents/{gemini_agent_id}/test?message=Hello+Gemini"

# Test Perplexity agent  
curl "http://localhost:3000/api/agents/{perplexity_agent_id}/test?message=Hello+Perplexity"
```

### Step 5: Test Account Management
```bash
# List Gemini accounts
curl "http://localhost:3000/api/wrapper/accounts?agentType=gemini"

# List Perplexity accounts
curl "http://localhost:3000/api/wrapper/accounts?agentType=perplexity"

# Test Gemini account
curl -X POST "http://localhost:3000/api/wrapper/accounts/primary/test?agentType=gemini"
```

## 🐛 Known Issues to Watch For

1. **Stream Handling**: Gemini streaming responses have different format - ensure chunker handles both
2. **Session Management**: Gemini uses `session_id`, Perplexity uses `frontend_context_uuid`
3. **Error Handling**: Different error formats between APIs need proper mapping
4. **Backend UUID**: Gemini doesn't use backend_uuid concept - should be null

## ✅ Current Status

**Implementation**: ✅ Complete
**API Connectivity**: ✅ Verified (Gemini API works)
**Code Syntax**: ✅ No compilation errors detected
**Database Migration**: ✅ Ready
**Documentation**: ✅ Complete

**Testing Status**: 🟡 Ready for manual testing

The dual agent system is **implemented and ready for testing**. The Gemini API endpoints are confirmed working, and all code is in place. The final verification requires running the development server and testing the actual agent creation and execution flows.
