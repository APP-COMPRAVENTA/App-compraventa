import { auth, activeTenantId, BACKEND_URL, currentBranchId, currentUser } from '../../config/firebase.js';

function resolveBranchId(overrideBranchId) {
  return String(overrideBranchId || currentBranchId || currentUser?.branchId || '').trim();
}

function resolveTenantId() {
  const role = String(currentUser?.role || '').trim();

  if (role === 'SUPER_ADMIN') {
    return String(activeTenantId || currentUser?.tenantId || '').trim();
  }

  return String(currentUser?.tenantId || activeTenantId || '').trim();
}

async function buildHeaders(branchIdOverride) {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Debes iniciar sesión para usar el Agente IA.');
  }

  const token = await user.getIdToken();
  const tenantId = resolveTenantId();
  const branchId = resolveBranchId(branchIdOverride);

  if (!tenantId) {
    throw new Error('No hay tenant activo.');
  }

  if (!branchId) {
    throw new Error('Selecciona una sede para usar el Agente IA.');
  }

  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    'x-tenant-id': tenantId,
    'x-branch-id': branchId
  };
}

async function callAgent(path, options = {}, branchIdOverride) {
  const headers = await buildHeaders(branchIdOverride);
  const response = await fetch(`${BACKEND_URL}/agent${path}`, {
    ...options,
    headers: {
      ...headers,
      ...(options.headers || {})
    }
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(payload?.message || payload?.error || 'Error en el módulo de agente.');
  }

  return payload.data;
}

export const agentAPI = {
  async getConfig(branchIdOverride) {
    return callAgent('/config', { method: 'GET' }, branchIdOverride);
  },

  async updateGemini(data, branchIdOverride) {
    return callAgent('/config/gemini', {
      method: 'PUT',
      body: JSON.stringify({ ...data, branchId: resolveBranchId(branchIdOverride) })
    }, branchIdOverride);
  },

  async deleteGemini(branchIdOverride) {
    return callAgent('/config/gemini', {
      method: 'DELETE'
    }, branchIdOverride);
  },

  async updateYCloud(data, branchIdOverride) {
    return callAgent('/config/ycloud', {
      method: 'PUT',
      body: JSON.stringify({ ...data, branchId: resolveBranchId(branchIdOverride) })
    }, branchIdOverride);
  },

  async deleteYCloud(branchIdOverride) {
    return callAgent('/config/ycloud', {
      method: 'DELETE'
    }, branchIdOverride);
  },

  async updatePrompt(promptConfig, branchIdOverride) {
    const payload = typeof promptConfig === 'string'
      ? { instructions: promptConfig }
      : { ...promptConfig };

    return callAgent('/config/prompt', {
      method: 'PUT',
      body: JSON.stringify({
        ...payload,
        branchId: resolveBranchId(branchIdOverride)
      })
    }, branchIdOverride);
  },

  async chat(message, sessionId, branchIdOverride) {
    return callAgent('/chat', {
      method: 'POST',
      body: JSON.stringify({
        message,
        sessionId,
        branchId: resolveBranchId(branchIdOverride)
      })
    }, branchIdOverride);
  },

  async syncInventoryItem(itemId, branchIdOverride) {
    return callAgent('/index-item', {
      method: 'POST',
      body: JSON.stringify({
        itemId,
        branchId: resolveBranchId(branchIdOverride)
      })
    }, branchIdOverride);
  },

  async memory(sessionId, branchIdOverride) {
    const params = new URLSearchParams({ sessionId });
    return callAgent(`/memory?${params.toString()}`, { method: 'GET' }, branchIdOverride);
  },

  async resetMemory(branchIdOverride) {
    return callAgent('/memory', { method: 'DELETE' }, branchIdOverride);
  },

  async listContacts(q = '', branchIdOverride) {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    const suffix = params.toString() ? `?${params.toString()}` : '';
    return callAgent(`/contacts${suffix}`, { method: 'GET' }, branchIdOverride);
  },

  async addContact(data, branchIdOverride) {
    return this.updateContact(data.phoneNumber, data, branchIdOverride);
  },

  async updateContact(phoneNumber, data, branchIdOverride) {
    return callAgent(`/contacts/${encodeURIComponent(phoneNumber)}`, {
      method: 'PUT',
      body: JSON.stringify({
        ...data,
        branchId: resolveBranchId(branchIdOverride)
      })
    }, branchIdOverride);
  },

  async deleteContact(phoneNumber, branchIdOverride) {
    return callAgent(`/contacts/${encodeURIComponent(phoneNumber)}`, {
      method: 'DELETE'
    }, branchIdOverride);
  }
};

export function getActiveAgentContext() {
  return {
    tenantId: resolveTenantId(),
    branchId: resolveBranchId(),
    userId: currentUser?.uid || null,
    role: currentUser?.role || 'GUEST'
  };
}
