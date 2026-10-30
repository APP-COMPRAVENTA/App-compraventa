import { agentAPI } from '../api.js';

export async function reindexInventoryVectors(branchId) {
  return agentAPI.reindex(branchId);
}
