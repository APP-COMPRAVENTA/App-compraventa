import { doc, runTransaction } from 'firebase/firestore';
import { db, activeTenantId, currentBranchId } from '../config/firebase.js';
import { getCollectionRef } from '../services/listeners.js';
import { getColombiaNow } from './colombiaTime.js';

const localInFlight = new Set();

function safeId(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9_.:-]/g, '_')
    .slice(0, 180);
}

function createOperationId(scope) {
  const random = globalThis.crypto?.randomUUID?.() || `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return `${safeId(scope)}_${random}`;
}

function getSubmitButtons(form) {
  if (!form?.querySelectorAll) return [];
  return Array.from(form.querySelectorAll('button[type="submit"], input[type="submit"]'));
}

function setBusy(form, isBusy, busyText) {
  if (!form) return;
  form.dataset.submitGuardBusy = isBusy ? 'true' : 'false';

  getSubmitButtons(form).forEach((button) => {
    if (isBusy) {
      if (!button.dataset.submitGuardOriginalText) {
        button.dataset.submitGuardOriginalText = button.tagName === 'INPUT'
          ? button.value
          : button.innerHTML;
      }
      button.disabled = true;
      if (button.tagName === 'INPUT') {
        button.value = busyText;
      } else {
        button.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-1"></i> ${busyText}`;
      }
      return;
    }

    button.disabled = false;
    const original = button.dataset.submitGuardOriginalText;
    if (original) {
      if (button.tagName === 'INPUT') button.value = original;
      else button.innerHTML = original;
    }
  });
}

function ensureOperationId(form, scope) {
  if (!form) return createOperationId(scope);
  if (!form.dataset.operationId || form.dataset.operationScope !== scope) {
    form.dataset.operationId = createOperationId(scope);
    form.dataset.operationScope = scope;
  }
  return form.dataset.operationId;
}

function resetOperationId(form, scope) {
  if (!form) return;
  form.dataset.operationId = createOperationId(scope);
  form.dataset.operationScope = scope;
}

function getLockRef(operationId) {
  const locksRef = getCollectionRef('operation_locks');
  if (!locksRef) {
    throw new Error('No hay tenant o sede activa para crear el lock de operación.');
  }
  return doc(locksRef, safeId(operationId));
}

async function reserveOperationLock({ operationId, scope }) {
  const lockRef = getLockRef(operationId);
  const now = getColombiaNow();

  return runTransaction(db, async (transaction) => {
    const snap = await transaction.get(lockRef);
    if (snap.exists()) {
      const current = snap.data() || {};
      if (current.status === 'PROCESSING' || current.status === 'SUCCESS') {
        return {
          ok: false,
          duplicate: true,
          status: current.status
        };
      }
    }

    transaction.set(lockRef, {
      operationId,
      scope,
      tenantId: activeTenantId || null,
      branchId: currentBranchId || null,
      status: 'PROCESSING',
      createdAt: now.timestampMs,
      updatedAt: now.timestampMs,
      createdAtColombia: now,
      updatedAtColombia: now
    }, { merge: true });

    return {
      ok: true,
      duplicate: false
    };
  });
}

async function markOperationLock(operationId, status, extra = {}) {
  const lockRef = getLockRef(operationId);
  const now = getColombiaNow();

  await runTransaction(db, async (transaction) => {
    transaction.set(lockRef, {
      status,
      updatedAt: now.timestampMs,
      updatedAtColombia: now,
      ...(status === 'SUCCESS' ? {
        completedAt: now.timestampMs,
        completedAtColombia: now
      } : {}),
      ...(status === 'FAILED' ? {
        failedAt: now.timestampMs,
        failedAtColombia: now
      } : {}),
      ...extra
    }, { merge: true });
  });
}

export function beginSubmitGuard(eventOrForm, {
  scope,
  operationId: providedOperationId = null,
  busyText = 'Procesando...',
  duplicateMessage = 'Esta operación ya está en proceso o ya fue registrada.'
} = {}) {
  const event = eventOrForm?.preventDefault ? eventOrForm : null;
  if (event) event.preventDefault();

  if (!scope) {
    throw new Error('submitGuard requiere un scope.');
  }

  const form = event?.target || eventOrForm;
  const operationId = providedOperationId || ensureOperationId(form, scope);
  const localKey = `${currentBranchId || 'tenant'}::${operationId}`;

  if (form?.dataset?.submitGuardBusy === 'true' || localInFlight.has(localKey)) {
    return null;
  }

  localInFlight.add(localKey);
  setBusy(form, true, busyText);

  let reserved = false;
  let duplicate = false;

  return {
    operationId,
    operationScope: scope,
    get isDuplicate() {
      return duplicate;
    },
    async reserve() {
      if (reserved) return { ok: true, duplicate: false };
      const result = await reserveOperationLock({ operationId, scope });
      duplicate = Boolean(result.duplicate);
      if (duplicate) {
        alert(duplicateMessage);
        return result;
      }
      reserved = true;
      return result;
    },
    async success(extra = {}) {
      if (!reserved || duplicate) return;
      await markOperationLock(operationId, 'SUCCESS', extra);
      resetOperationId(form, scope);
    },
    async fail(error) {
      if (!reserved || duplicate) return;
      await markOperationLock(operationId, 'FAILED', {
        error: String(error?.message || error || 'Error desconocido')
      });
      resetOperationId(form, scope);
    },
    release() {
      localInFlight.delete(localKey);
      setBusy(form, false, busyText);
    }
  };
}

export function withSubmitGuard(event, options, handler) {
  const guard = beginSubmitGuard(event, options);
  if (!guard) return Promise.resolve(null);

  return Promise.resolve()
    .then(() => handler(guard))
    .finally(() => guard.release());
}
