import { renderHeader, escapeHtml } from '../../utils/utils.js';
import { agentAPI, getActiveAgentContext } from './api.js';
import { deleteGeminiConnection, saveGeminiConnection } from './gemini/gemini.service.js';
import { deleteYCloudConnection, saveYCloudConnection } from './ycloud/ycloud.service.js';
import { askAgent } from './tools/tools.service.js';
import { AGENTE_TABS, renderAgenteLayout, renderChatBubble, renderStatusMessage, renderTabContent } from './ui/agente.ui.js';

const state = {
  activeTab: 'chat',
  sessionId: '',
  chatMessages: [],
  latestSources: [],
  configSnapshot: null,
  contactsData: { items: [] },
  contactsSearch: '',
  editingContactPhone: '',
  activeContactCategory: 'todos'
};

function ensurePromptBlocks() {
  if (!state.configSnapshot) state.configSnapshot = {};
  if (!state.configSnapshot.prompt) state.configSnapshot.prompt = {};

  const blocks = Array.isArray(state.configSnapshot.prompt.blocks) ? state.configSnapshot.prompt.blocks : [];
  if (!blocks.length) {
    state.configSnapshot.prompt.blocks = [
      {
        id: `block-${Date.now()}`,
        name: 'Base',
        content: state.configSnapshot.prompt.instructions || ''
      }
    ];
  }

  return state.configSnapshot.prompt.blocks;
}

function createPromptBlock() {
  return {
    id: `block-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: '',
    content: ''
  };
}

function createPromptBlockFromImport(name, content, index) {
  return {
    id: `import-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
    name: String(name || '').trim() || `Bloque ${index + 1}`,
    content: String(content || '').trim()
  };
}

function collectPromptBlocksFromDom() {
  const blockNodes = document.querySelectorAll('[data-ag-prompt-block]');

  return [...blockNodes].map((node, index) => ({
    id: String(node.getAttribute('data-ag-prompt-block') || `block-${index + 1}`).trim(),
    name: String(node.querySelector('[data-ag-block-name]')?.value || '').trim(),
    content: String(node.querySelector('[data-ag-block-content]')?.value || '').trim()
  }));
}

function syncPromptBlocksDraftFromDom() {
  const blockNodes = document.querySelectorAll('[data-ag-prompt-block]');
  if (!blockNodes.length) return;
  ensurePromptBlocks();
  state.configSnapshot.prompt.blocks = collectPromptBlocksFromDom();
}

function formatPromptBlocksForClipboard(blocks = []) {
  return blocks
    .filter((block) => block.name || block.content)
    .map((block, index) => {
      const name = String(block.name || `Bloque ${index + 1}`).trim();
      const content = String(block.content || '').trim();
      return `[${name}]\n${content}`.trim();
    })
    .filter(Boolean)
    .join('\n\n');
}

function parsePromptBlocksText(text) {
  const raw = String(text || '').replace(/\r\n/g, '\n').trim();
  if (!raw) return [];

  const headingRegex = /^\[([^\]\n]{1,80})\]\s*$/gm;
  const matches = [...raw.matchAll(headingRegex)];

  if (!matches.length) {
    return [createPromptBlockFromImport('Base', raw, 0)];
  }

  const blocks = [];
  const preface = raw.slice(0, matches[0].index).trim();
  if (preface) {
    blocks.push(createPromptBlockFromImport('Base', preface, blocks.length));
  }

  matches.forEach((match, index) => {
    const name = String(match[1] || '').trim();
    const contentStart = match.index + match[0].length;
    const contentEnd = index + 1 < matches.length ? matches[index + 1].index : raw.length;
    const content = raw.slice(contentStart, contentEnd).trim();

    if (name || content) {
      blocks.push(createPromptBlockFromImport(name || `Bloque ${blocks.length + 1}`, content, blocks.length));
    }
  });

  return blocks;
}

function getContentDiv() {
  return document.getElementById('content');
}

function notify(message, type = 'ok') {
  const checkContainer = document.getElementById('ag-status');
  if (checkContainer) {
    checkContainer.innerHTML = renderStatusMessage(escapeHtml(message), type);
  }
}

function getPromptImportModal() {
  return document.getElementById('ag-import-prompt-modal');
}

function openPromptImportModal(prefill = '') {
  const modal = getPromptImportModal();
  const textarea = document.getElementById('ag-import-prompt-text');
  if (!modal || !textarea) return;

  textarea.value = prefill;
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  textarea.focus();
}

function closePromptImportModal() {
  const modal = getPromptImportModal();
  if (!modal) return;

  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

function parseCategoriesInput(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseContactTagsInput(value) {
  const dedup = new Map();
  String(value || '')
    .split(/[\n,]/)
    .map((item) => item.trim().replace(/\s+/g, ' '))
    .filter(Boolean)
    .forEach((tag) => {
      const key = tag.toLowerCase();
      if (!dedup.has(key)) dedup.set(key, tag.slice(0, 60));
    });

  return Array.from(dedup.values()).slice(0, 25);
}

function getPromptContactTags() {
  return Array.isArray(state.configSnapshot?.prompt?.contactTags)
    ? state.configSnapshot.prompt.contactTags
    : [];
}

function wireTabs() {
  document.querySelectorAll('[data-ag-tab]').forEach((button) => {
    button.addEventListener('click', () => {
      const selected = button.dataset.agTab;
      state.activeTab = selected;

      document.querySelectorAll('[data-ag-tab]').forEach((tabBtn) => {
        tabBtn.classList.toggle('active', tabBtn.dataset.agTab === selected);
      });

      renderCurrentTab();
    });
  });
}

function renderChatMessages() {
  const list = document.getElementById('ag-chat-list');
  if (!list) return;

  list.innerHTML = state.chatMessages
    .map((entry) => renderChatBubble(entry.role, escapeHtml(entry.content)))
    .join('');

  list.scrollTop = list.scrollHeight;

  const sessionLabel = document.getElementById('ag-session-id');
  if (sessionLabel) {
    sessionLabel.textContent = state.sessionId || 'sin sesión';
  }
}

async function onSendChat() {
  const input = document.getElementById('ag-chat-input');
  if (!input) return;

  const message = input.value.trim();
  if (!message) return;

  input.value = '';
  state.chatMessages.push({ role: 'user', content: message });
  renderChatMessages();

  try {
    const response = await askAgent(message, state.sessionId || undefined);
    state.sessionId = response.sessionId;
    state.latestSources = response.sources || [];
    state.chatMessages.push({ role: 'assistant', content: response.answer || 'Sin respuesta.' });
    renderChatMessages();
  } catch (error) {
    state.chatMessages.push({ role: 'assistant', content: `Error: ${error.message}` });
    renderChatMessages();
  }
}

async function onSaveGemini(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);

  try {
    const payload = {
      apiKey: String(form.get('apiKey') || ''),
      model: String(form.get('model') || ''),
      embeddingModel: String(form.get('embeddingModel') || ''),
      temperature: Number(form.get('temperature') || 0.2)
    };

    state.configSnapshot = await saveGeminiConnection(payload);
    renderCurrentTab();
    notify('Gemini configurado para la sede actual.');
  } catch (error) {
    notify(error.message, 'error');
  }
}

async function onSaveYCloud(event) {
  event.preventDefault();
  const formElement = event.currentTarget;
  const form = new FormData(formElement);

  try {
    state.configSnapshot = await saveYCloudConnection({
      apiKey: String(form.get('apiKey') || ''),
      webhookSecret: String(form.get('webhookSecret') || ''),
      appId: String(form.get('appId') || ''),
      businessPhone: String(form.get('businessPhone') || ''),
      botPaused: String(form.get('botPaused') || 'false') === 'true',
      coexistence: {
        enabled: formElement.querySelector('[name="coexistenceEnabled"]')
          ? Boolean(form.get('coexistenceEnabled'))
          : undefined,
        replyDelayValue: formElement.querySelector('[name="replyDelayValue"]')
          ? Number(form.get('replyDelayValue') || 0)
          : undefined,
        replyDelayUnit: 'seconds',
        humanModeValue: formElement.querySelector('[name="humanModeValue"]')
          ? Number(form.get('humanModeValue') || 0)
          : undefined,
        humanModeUnit: 'seconds'
      }
    });
    renderCurrentTab();
    notify('YCloud configurado para la sede actual.');
  } catch (error) {
    notify(error.message, 'error');
  }
}

async function onToggleBotPause() {
  const formElement = document.getElementById('ag-form-ycloud');
  const pausedInput = formElement?.querySelector('[name="botPaused"]');
  if (!formElement || !pausedInput) return;

  pausedInput.value = pausedInput.value === 'true' ? 'false' : 'true';
  await onSaveYCloud({
    preventDefault() {},
    currentTarget: formElement
  });
}

async function onSavePrompt(event) {
  event.preventDefault();
  const blocks = collectPromptBlocksFromDom().filter((block) => block.name || block.content);

  try {
    state.configSnapshot = await agentAPI.updatePrompt({ blocks, contactTags: getPromptContactTags() });
    renderCurrentTab();
    notify('Bloques del prompt guardados para la sede actual.');
  } catch (error) {
    notify(error.message, 'error');
  }
}

async function onCopyPromptBlocks() {
  syncPromptBlocksDraftFromDom();
  const text = formatPromptBlocksForClipboard(ensurePromptBlocks());

  if (!text) {
    notify('No hay bloques para copiar.', 'error');
    return;
  }

  try {
    if (!navigator.clipboard?.writeText) {
      throw new Error('Clipboard API no disponible.');
    }
    await navigator.clipboard.writeText(text);
    notify('Bloques copiados al portapapeles.');
  } catch (_error) {
    openPromptImportModal(text);
    notify('No pude copiar automaticamente. El texto quedo abierto para copiar manualmente.', 'error');
  }
}

function onApplyPromptImport() {
  const textarea = document.getElementById('ag-import-prompt-text');
  const blocks = parsePromptBlocksText(textarea?.value || '');

  if (!blocks.length) {
    notify('Pega al menos un bloque o contenido para importar.', 'error');
    return;
  }

  if (!state.configSnapshot) state.configSnapshot = {};
  if (!state.configSnapshot.prompt) state.configSnapshot.prompt = {};
  state.configSnapshot.prompt.blocks = blocks;
  closePromptImportModal();
  renderCurrentTab();
  notify('Bloques aplicados. Revisa y pulsa Guardar bloques para persistirlos.');
}

async function onSaveTags(event) {
  event.preventDefault();
  const contactTags = parseContactTagsInput(document.getElementById('ag-contact-tags-input')?.value || '');
  const blocks = Array.isArray(state.configSnapshot?.prompt?.blocks)
    ? state.configSnapshot.prompt.blocks
    : ensurePromptBlocks();

  try {
    state.configSnapshot = await agentAPI.updatePrompt({ blocks, contactTags });
    state.activeContactCategory = contactTags.some((tag) => tag.toLowerCase() === state.activeContactCategory.toLowerCase())
      ? state.activeContactCategory
      : 'todos';
    renderCurrentTab();
    notify('Etiquetas guardadas para la sede actual.');
  } catch (error) {
    notify(error.message, 'error');
  }
}

async function onDeleteGemini() {
  const confirmed = window.confirm('Se eliminara la conexion de Gemini de esta sede. El chat del agente dejara de responder hasta que vuelvas a configurarlo. ¿Continuar?');
  if (!confirmed) return;

  try {
    state.configSnapshot = await deleteGeminiConnection();
    renderCurrentTab();
    notify('Conexion Gemini eliminada para la sede actual.');
  } catch (error) {
    notify(error.message, 'error');
  }
}

async function onDeleteYCloud() {
  const confirmed = window.confirm('Se eliminara la conexion de YCloud de esta sede. El webhook y la respuesta por WhatsApp dejaran de funcionar hasta que la vuelvas a configurar. ¿Continuar?');
  if (!confirmed) return;

  try {
    state.configSnapshot = await deleteYCloudConnection();
    renderCurrentTab();
    notify('Conexion YCloud eliminada para la sede actual.');
  } catch (error) {
    notify(error.message, 'error');
  }
}

async function onResetMemory() {
  const confirmed = window.confirm('Se borrara la memoria conversacional de la IA para todos los contactos de esta sede. No se borran contactos, inventario ni configuraciones. ¿Continuar?');
  if (!confirmed) return;

  try {
    const result = await agentAPI.resetMemory();
    const count = Number(result?.deletedConversations || 0);
    notify(`Memoria reiniciada. Conversaciones borradas: ${count}.`);
  } catch (error) {
    notify(error.message, 'error');
  }
}

async function refreshConfig() {
  try {
    state.configSnapshot = await agentAPI.getConfig();
    renderCurrentTab();
  } catch (error) {
    notify(error.message, 'error');
  }
}

async function refreshContacts(searchOverride = state.contactsSearch) {
  try {
    state.contactsSearch = String(searchOverride || '').trim();
    state.contactsData = await agentAPI.listContacts(state.contactsSearch);
    renderCurrentTab();
  } catch (error) {
    notify(error.message, 'error');
  }
}

async function onSaveContact(phoneNumber) {
  const saveButton = [...document.querySelectorAll('[data-ag-save-contact]')]
    .find((button) => String(button.getAttribute('data-ag-save-contact') || '').trim() === phoneNumber);
  const row = saveButton?.closest('.ag-card');
  if (!row) return;

  const customerName = String(row.querySelector('[data-ag-contact-name]')?.value || '').trim();
  const categories = parseCategoriesInput(row.querySelector('[data-ag-contact-categories]')?.value || '');
  const botPaused = Boolean(row.querySelector('[data-ag-contact-bot-paused]')?.checked);

  try {
    await agentAPI.updateContact(phoneNumber, { customerName, categories, botPaused });
    state.editingContactPhone = '';
    await refreshContacts();
    notify('Contacto actualizado para esta sede.');
  } catch (error) {
    notify(error.message, 'error');
  }
}

async function onAddContact(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const phoneNumber = String(form.get('phoneNumber') || '').trim();

  if (!phoneNumber) {
    notify('Ingresa un numero para agregarlo.', 'error');
    return;
  }

  try {
    await agentAPI.addContact({
      phoneNumber,
      customerName: String(form.get('customerName') || '').trim(),
      botPaused: Boolean(form.get('botPaused'))
    });
    event.currentTarget.reset();
    event.currentTarget.querySelector('[name="botPaused"]').checked = true;
    await refreshContacts();
    notify('Numero agregado a contactos de esta sede.');
  } catch (error) {
    notify(error.message, 'error');
  }
}

async function onDeleteContact(phoneNumber) {
  const confirmed = window.confirm(`Se eliminara el contacto ${phoneNumber} de la lista interna de esta sede. Esta accion no toca WhatsApp ni YCloud. ¿Continuar?`);
  if (!confirmed) return;

  try {
    await agentAPI.deleteContact(phoneNumber);
    if (state.editingContactPhone === phoneNumber) state.editingContactPhone = '';
    await refreshContacts();
    notify('Contacto eliminado de la lista interna.');
  } catch (error) {
    notify(error.message, 'error');
  }
}

function wireModal() {
  const openBtn = document.getElementById('ag-open-sources');
  const modal = document.getElementById('ag-source-modal');
  const closeBtn = document.getElementById('ag-close-source-modal');
  const content = document.getElementById('ag-source-modal-content');

  if (openBtn) {
    openBtn.addEventListener('click', () => {
      content.textContent = JSON.stringify(state.latestSources || [], null, 2);
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    });
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    });
  }

  if (modal) {
    modal.addEventListener('click', (event) => {
      if (event.target === modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
      }
    });
  }
}

function wireCurrentTab() {
  if (state.activeTab === 'chat') {
    document.getElementById('ag-send-chat')?.addEventListener('click', onSendChat);
    document.getElementById('ag-chat-input')?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') onSendChat();
    });
    renderChatMessages();
    wireModal();
    return;
  }

  if (state.activeTab === 'conexiones') {
    document.getElementById('ag-form-gemini')?.addEventListener('submit', onSaveGemini);
    document.getElementById('ag-form-ycloud')?.addEventListener('submit', onSaveYCloud);
    document.getElementById('ag-toggle-bot-pause')?.addEventListener('click', onToggleBotPause);
    document.getElementById('ag-delete-gemini')?.addEventListener('click', onDeleteGemini);
    document.getElementById('ag-delete-ycloud')?.addEventListener('click', onDeleteYCloud);
    document.getElementById('ag-reset-memory')?.addEventListener('click', onResetMemory);
    return;
  }

  if (state.activeTab === 'contactos') {
    document.getElementById('ag-add-contact-form')?.addEventListener('submit', onAddContact);
    document.querySelectorAll('[data-ag-contact-filter]').forEach((button) => {
      button.addEventListener('click', () => {
        state.activeContactCategory = String(button.getAttribute('data-ag-contact-filter') || 'todos').trim() || 'todos';
        renderCurrentTab();
      });
    });
    document.getElementById('ag-refresh-contacts')?.addEventListener('click', () => refreshContacts());
    document.getElementById('ag-search-contacts')?.addEventListener('click', () => {
      const value = document.getElementById('ag-contacts-search')?.value || '';
      refreshContacts(value);
    });
    document.getElementById('ag-contacts-search')?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        refreshContacts(event.currentTarget.value);
      }
    });

    document.querySelectorAll('[data-ag-edit-contact]').forEach((button) => {
      button.addEventListener('click', () => {
        state.editingContactPhone = String(button.getAttribute('data-ag-edit-contact') || '').trim();
        renderCurrentTab();
      });
    });

    document.querySelectorAll('[data-ag-cancel-contact]').forEach((button) => {
      button.addEventListener('click', () => {
        state.editingContactPhone = '';
        renderCurrentTab();
      });
    });

    document.querySelectorAll('[data-ag-save-contact]').forEach((button) => {
      button.addEventListener('click', () => {
        const phoneNumber = String(button.getAttribute('data-ag-save-contact') || '').trim();
        onSaveContact(phoneNumber);
      });
    });

    document.querySelectorAll('[data-ag-delete-contact]').forEach((button) => {
      button.addEventListener('click', () => {
        const phoneNumber = String(button.getAttribute('data-ag-delete-contact') || '').trim();
        onDeleteContact(phoneNumber);
      });
    });

    return;
  }

  if (state.activeTab === 'etiquetas') {
    document.getElementById('ag-form-tags')?.addEventListener('submit', onSaveTags);
    return;
  }

  if (state.activeTab === 'prompt') {
    ensurePromptBlocks();
    document.getElementById('ag-form-prompt')?.addEventListener('submit', onSavePrompt);
    document.getElementById('ag-copy-prompt-blocks')?.addEventListener('click', onCopyPromptBlocks);
    document.getElementById('ag-open-import-prompt')?.addEventListener('click', () => {
      syncPromptBlocksDraftFromDom();
      openPromptImportModal();
    });
    document.getElementById('ag-close-import-prompt')?.addEventListener('click', closePromptImportModal);
    document.getElementById('ag-cancel-import-prompt')?.addEventListener('click', closePromptImportModal);
    document.getElementById('ag-apply-import-prompt')?.addEventListener('click', onApplyPromptImport);
    getPromptImportModal()?.addEventListener('click', (event) => {
      if (event.target === event.currentTarget) closePromptImportModal();
    });
    document.getElementById('ag-add-prompt-block')?.addEventListener('click', () => {
      syncPromptBlocksDraftFromDom();
      ensurePromptBlocks().push(createPromptBlock());
      renderCurrentTab();
    });
    document.querySelectorAll('[data-ag-remove-block]').forEach((button) => {
      button.addEventListener('click', () => {
        syncPromptBlocksDraftFromDom();
        const blockId = String(button.getAttribute('data-ag-remove-block') || '').trim();
        const blocks = ensurePromptBlocks().filter((block) => String(block.id) !== blockId);
        state.configSnapshot.prompt.blocks = blocks;
        renderCurrentTab();
      });
    });
    return;
  }
}

function renderCurrentTab() {
  const tabBody = document.getElementById('ag-tab-body');
  if (!tabBody) return;

  tabBody.innerHTML = renderTabContent(state.activeTab, state);
  wireCurrentTab();
}

export async function renderAgente() {
  const content = getContentDiv();
  if (!content) return;

  const context = getActiveAgentContext();
  const header = await renderHeader(
    'Agente IA',
    `Asistente por sede: ${context.branchId || 'sin sede seleccionada'}`
  );

  content.innerHTML = `${header}${renderAgenteLayout()}`;

  wireTabs();
  renderCurrentTab();

  await refreshConfig();
  await refreshContacts();
}
