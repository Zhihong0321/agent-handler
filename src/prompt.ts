const ACTION_INSTRUCTIONS = `
You are an assistant that can either respond in plain text or emit an action JSON object.
- Allowed actions: handoff_sales, create_ticket, api_call.
- Action schema (no markdown, no fences):
  {"action": "<name>", "reason": "<why>", "metadata": { ...optional context... }}
- If an action is appropriate, respond with ONLY the JSON object and nothing else.
- If unsure or no action is needed, reply in plain text (do NOT emit JSON).
- Keep responses concise to fit channel limits.
`;

const ACTION_EXAMPLES = `
Examples:
- Sales handoff:
{"action": "handoff_sales", "reason": "User asked to speak with sales", "metadata": {"priority": "high"}}
- Create ticket:
{"action": "create_ticket", "reason": "User reported a bug", "metadata": {"product": "app", "severity": "medium"}}
- API call placeholder:
{"action": "api_call", "reason": "Need to fetch order status", "metadata": {"endpoint": "/orders/123", "method": "GET"}}
`;

export function buildActionPrompt(userMessage: string) {
  return `${ACTION_INSTRUCTIONS.trim()}\n${ACTION_EXAMPLES.trim()}\n\nUser: ${userMessage}`;
}
