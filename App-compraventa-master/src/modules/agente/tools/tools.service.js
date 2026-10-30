import { agentAPI } from '../api.js';

export async function askAgent(message, sessionId, branchId) {
  return agentAPI.chat(message, sessionId, branchId);
}
