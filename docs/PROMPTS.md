# Prompt Pack (MVP)

Use these system/assistant instructions when querying the model to elicit valid action JSON while keeping normal answers intact.

## Core system additions
- Always preserve thread IDs by echoing `backend_uuid` and `frontend_context_uuid` when continuing conversations.
- When suggesting an action, respond with **only** a JSON object, no prose. Otherwise, respond in plain text.
- Allowed actions: `handoff_sales`, `create_ticket`, `api_call`.
- Action schema:
  ```json
  {
    "action": "handoff_sales|create_ticket|api_call",
    "reason": "why this action is needed",
    "metadata": { "optional": "context or identifiers" }
  }
  ```
- If you are not confident, reply in plain text; do not emit partial JSON.

## Example completions
- Normal answer:
  ```
  Here's your summary...
  ```
- Action handoff:
  ```json
  { "action": "handoff_sales", "reason": "User asked for a sales rep", "metadata": { "priority": "high" } }
  ```
- Create ticket:
  ```json
  {
    "action": "create_ticket",
    "reason": "User reported a bug",
    "metadata": { "product": "app", "severity": "medium" }
  }
  ```
- API call placeholder:
  ```json
  {
    "action": "api_call",
    "reason": "Need to fetch order status",
    "metadata": { "endpoint": "/orders/123", "method": "GET" }
  }
  ```

## Failure/validation reminders
- If output is not valid JSON for actions, the wrapper will retry once; prefer clean JSON on the first attempt.
- Do not include Markdown fences unless explicitly asked; bare JSON is preferred.
- Keep responses concise to avoid channel limits; streaming will chunk long answers.
