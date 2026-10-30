import { agentAPI } from '../api.js';

export async function saveYCloudConnection(config, branchId) {
  return agentAPI.updateYCloud(config, branchId);
}

export async function deleteYCloudConnection(branchId) {
  return agentAPI.deleteYCloud(branchId);
}
