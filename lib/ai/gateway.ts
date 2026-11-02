import type { JSONValue } from "ai"

/**
 * The Vercel AI Gateway: one key for every provider (D13, docs/crm-v1/AGENTS-IA.md §4). The AI SDK resolves string model
 * ids such as "anthropic/claude-sonnet-5.5" through it, reading AI_GATEWAY_API_KEY on the server.
 */
export const aiConfigured = () => Boolean(process.env.AI_GATEWAY_API_KEY)

/**
 * Options sent with every call: the fallbacks, only providers that do not train on our data (D16), and the person and
 * agent for the Gateway's spend reports (an opaque member id, never a name or an email).
 */
export function gatewayOptions(input: { models: readonly JSONValue[]; userKey: string; agentId: string }): Record<string, Record<string, JSONValue>> {
  return {
    gateway: {
      models: [...input.models],
      disallowPromptTraining: true,
      user: input.userKey,
      tags: [`agent:${input.agentId}`],
    },
  }
}
