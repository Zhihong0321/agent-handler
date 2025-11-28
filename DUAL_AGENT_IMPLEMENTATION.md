# Dual Agent System Implementation

## Overview
The system now supports two types of AI agents:
- **Perplexity Agents**: Use the existing Perplexity wrapper API
- **Gemini Agents**: Use the new Gemini wrapper API

## Key Changes

### 1. New Types
- `AgentType`: Union type of "perplexity" | "gemini"
- `AgentConfig`: Updated to include `agentType` field
- Backward compatible: defaults to "perplexity"

### 2. New Components

#### GeminiClient (`src/geminiClient.ts`)
- Interfaces with Gemini API at `https://ee-gemini-api-production.up.railway.app`
- Supports sync/async queries, session management, account testing
- Maps to Gemini endpoints: `/chat`, `/chat/{session_id}`, `/accounts`

#### AgentFactory (`src/agentFactory.ts`)
- Factory pattern to route to appropriate client
- Handles parameter mapping between different API schemas
- Provides unified interface for both agent types

### 3. Configuration Updates
- Added `GEMINI_BASE_URL` and `DEFAULT_GEMINI_ACCOUNT` config options
- Default Gemini account: "primary"

### 4. Database Schema
- Added `agent_type` column to `agents` table
- Default value: "perplexity" for backward compatibility
- Migration script provided

### 5. API Changes

#### Agent Creation
```json
POST /api/agents
{
  "name": "My Agent",
  "agentType": "gemini", // NEW: "perplexity" or "gemini"
  "accountName": "primary",
  "model": "gemini-2.5-flash",
  // ... other fields
}
```

#### Agent Testing
- Route to appropriate client based on agent type
- Unified response format

#### Account Management
- Supports both agent types via query parameter: `?agentType=gemini|perplexity`

## API Schema Mapping

### Perplexity → Gemini
| Perplexity Field | Gemini Equivalent | Notes |
|------------------|------------------|-------|
| `accountName` | `accountId` | Account identifier |
| `q` | `message` | Query/message text |
| `collectionUuid` | N/A | Not used in Gemini |
| `frontendContextUuid` | `sessionId` | Session identifier |
| `mode/sources/language` | `systemPrompt` | Converted to system instructions |
| `model` | `model` | Model selection |

### Response Mapping
| Perplexity | Gemini | Unified |
|------------|--------|---------|
| `answer` | `response` | `reply` |
| `frontend_context_uuid` | `session_id` | `sessionId` |
| `backend_uuid` | N/A | `backendUuid` (null for Gemini) |

## Usage Examples

### Creating a Gemini Agent
```bash
curl -X POST /api/agents \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Gemini Helper",
    "agentType": "gemini",
    "accountName": "primary",
    "model": "gemini-2.5-flash"
  }'
```

### Testing an Agent
```bash
curl "/api/agents/{agentId}/test?message=Hello+world"
```

### Listing Accounts by Type
```bash
curl "/api/wrapper/accounts?agentType=gemini"  # Gemini accounts
curl "/api/wrapper/accounts?agentType=perplexity"  # Perplexity accounts
```

## Backward Compatibility
- All existing agents default to `agentType: "perplexity"`
- Existing API endpoints unchanged
- No breaking changes to current functionality

## Testing
1. Apply database migration
2. Set `GEMINI_BASE_URL` in environment (defaults to production URL)
3. Create test agents for both types
4. Use playground and tester interfaces to verify functionality
