import { agentAPI } from '../api.js';

export async function saveGeminiConnection(config, branchId) {
  return agentAPI.updateGemini(config, branchId);
}

export async function deleteGeminiConnection(branchId) {
  return agentAPI.deleteGemini(branchId);
}
