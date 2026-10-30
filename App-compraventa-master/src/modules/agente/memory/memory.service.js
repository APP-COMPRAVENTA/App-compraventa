import { agentAPI } from '../api.js';

export async function fetchConversationMemory(sessionId, branchId) {
  return agentAPI.memory(sessionId, branchId);
}
