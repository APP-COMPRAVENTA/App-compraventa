import { getActiveAgentContext } from '../api.js';

export const AGENTE_TABS = [
  { id: 'chat', label: 'Chat' },
  { id: 'contactos', label: 'Contactos' },
  { id: 'conexiones', label: 'Conexiones' },
  { id: 'etiquetas', label: 'Etiquetas' },
  { id: 'prompt', label: 'Prompt' }
];

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[char]));
}

function formatDate(value) {
  if (!value) return 'Sin registro';

  const rawDate = typeof value?.toDate === 'function' ? value.toDate() : value;
  const date = rawDate instanceof Date ? rawDate : new Date(rawDate);
  if (Number.isNaN(date.getTime())) return 'Sin registro';

  return new Intl.DateTimeFormat('es-CO', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(date);
}

function formatDurationLabel(value, unit) {
  const amount = Number(value) || 0;
  const normalized = String(unit || 'seconds').toLowerCase();
  const labels = {
    seconds: amount === 1 ? 'segundo' : 'segundos',
    minutes: amount === 1 ? 'minuto' : 'minutos',
    hours: amount === 1 ? 'hora' : 'horas'
  };
  return `${amount} ${labels[normalized] || 'segundos'}`;
}

function renderConnectionSummary(title, config, extraLines = []) {
  const enabled = Boolean(config?.enabled);
  const badgeClass = enabled ? 'ag-pill ag-pill-ok' : 'ag-pill ag-pill-warn';
  const badgeText = enabled ? 'Guardado' : 'Pendiente';

  return `
    <div class="ag-card p-4">
      <div class="flex items-center justify-between gap-3 mb-3">
        <h4 class="font-black text-slate-800">${title}</h4>
        <span class="${badgeClass}">${badgeText}</span>
      </div>
      <div class="text-xs text-slate-600 space-y-1">
        <p><strong>API:</strong> ${escapeHtml(config?.apiKeyMasked || 'No visible por seguridad')}</p>
        ${extraLines.join('')}
        <p><strong>Actualizado:</strong> ${escapeHtml(formatDate(config?.updatedAt))}</p>
      </div>
    </div>
  `;
}

function renderPromptBlocks(blocks = []) {
  if (!blocks.length) {
    return `
      <div class="ag-card p-4 border-dashed">
        <p class="text-sm text-slate-500">Todavia no hay bloques. Crea uno para definir personalidad, horarios, reglas o cualquier otra instruccion.</p>
      </div>
    `;
  }

  return blocks.map((block, index) => `
    <div class="ag-card p-4 ag-prompt-block" data-ag-prompt-block="${escapeHtml(block.id || `block-${index + 1}`)}">
      <div class="flex flex-col md:flex-row gap-3 md:items-start md:justify-between mb-3">
        <div class="flex-1">
          <label class="text-[10px] uppercase font-bold text-slate-400 mb-1 block">Nombre del bloque</label>
          <input
            class="ag-input"
            data-ag-block-name
            value="${escapeHtml(block.name || '')}"
            placeholder="Ej: Personalidad, horarios, objeciones..."
          />
        </div>
        <button type="button" class="ag-btn ag-btn-muted md:mt-6" data-ag-remove-block="${escapeHtml(block.id || `block-${index + 1}`)}">Eliminar</button>
      </div>
      <div>
        <label class="text-[10px] uppercase font-bold text-slate-400 mb-1 block">Contenido</label>
        <textarea
          class="ag-input min-h-40"
          data-ag-block-content
          placeholder="Escribe las instrucciones de este bloque..."
        >${escapeHtml(block.content || '')}</textarea>
      </div>
    </div>
  `).join('');
}

function renderContactChips(categories = []) {
  const items = Array.isArray(categories) ? categories : [];
  if (!items.length) {
    return '<span class="text-xs text-slate-400">Sin categorias</span>';
  }

  return items
    .map((category) => `<span class="ag-pill ag-block-tag">${escapeHtml(category)}</span>`)
    .join('');
}

function getContactTagsFromState(state = {}) {
  const configured = Array.isArray(state.configSnapshot?.prompt?.contactTags)
    ? state.configSnapshot.prompt.contactTags
    : [];
  const contactItems = Array.isArray(state.contactsData?.items) ? state.contactsData.items : [];
  const observed = contactItems.flatMap((item) => Array.isArray(item.categories) ? item.categories : []);
  const dedup = new Map();

  [...configured, ...observed].forEach((tag) => {
    const label = String(tag || '').trim().replace(/\s+/g, ' ');
    if (!label) return;
    const key = label.toLowerCase();
    if (!dedup.has(key)) dedup.set(key, label);
  });

  return Array.from(dedup.values());
}

function renderContactCategoryFilters(tags = [], activeTag = 'todos', totalCount = 0, categorizedContacts = []) {
  const counts = new Map();
  categorizedContacts.forEach((contact) => {
    (Array.isArray(contact.categories) ? contact.categories : []).forEach((category) => {
      const key = String(category || '').trim().toLowerCase();
      if (!key) return;
      counts.set(key, (counts.get(key) || 0) + 1);
    });
  });

  return `
    <div class="ag-lead-filter-scroll mb-4" id="ag-contact-category-filters">
      <button type="button" class="ag-lead-filter ${activeTag === 'todos' ? 'active' : ''}" data-ag-contact-filter="todos">
        Todos <span>${totalCount}</span>
      </button>
      ${tags.map((tag) => {
        const key = tag.toLowerCase();
        const count = counts.get(key) || 0;
        return `
          <button type="button" class="ag-lead-filter ${activeTag.toLowerCase() === key ? 'active' : ''}" data-ag-contact-filter="${escapeHtml(tag)}">
            ${escapeHtml(tag)} <span>${count}</span>
          </button>
        `;
      }).join('')}
    </div>
  `;
}

function renderManualRows(items = [], editingPhone = '') {
  if (!items.length) {
    return `
      <div class="ag-card p-4 text-sm text-slate-500">
        No hay numeros en atencion manual.
      </div>
    `;
  }

  return items.map((item) => {
    const isEditing = editingPhone && editingPhone === item.phoneNumber;

    return `
      <div class="ag-card p-4">
        ${isEditing ? `
          <div class="grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-3">
            <div>
              <label class="text-[10px] uppercase font-bold text-slate-400 mb-1 block">Nombre</label>
              <input class="ag-input" data-ag-contact-name value="${escapeHtml(item.customerName || '')}" placeholder="Nombre del contacto" />
            </div>
            <div>
              <label class="text-[10px] uppercase font-bold text-slate-400 mb-1 block">Numero</label>
              <input class="ag-input bg-slate-50" value="${escapeHtml(item.phoneNumber || '')}" disabled />
            </div>
          </div>
          <input type="hidden" data-ag-contact-categories value="${escapeHtml(Array.isArray(item.categories) ? item.categories.join(', ') : '')}" />
          <input type="checkbox" class="hidden" data-ag-contact-bot-paused checked />
          <div class="mt-3 flex flex-wrap gap-2">
            <button type="button" class="ag-btn ag-btn-primary" data-ag-save-contact="${escapeHtml(item.phoneNumber || '')}">Guardar</button>
            <button type="button" class="ag-btn ag-btn-muted" data-ag-cancel-contact="${escapeHtml(item.phoneNumber || '')}">Cancelar</button>
          </div>
        ` : `
          <div class="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div class="space-y-2 flex-1 min-w-0">
              <div>
                <p class="font-black text-slate-800">${escapeHtml(item.customerName || 'Sin nombre')}</p>
                <p class="text-xs text-slate-500">${escapeHtml(item.phoneNumber || 'Sin numero')}</p>
              </div>
              <span class="ag-pill ag-pill-warn">Bot no responde</span>
            </div>
            <div class="flex flex-wrap gap-2">
              <button type="button" class="ag-btn ag-btn-muted" data-ag-edit-contact="${escapeHtml(item.phoneNumber || '')}">Editar</button>
              <button type="button" class="ag-btn ag-btn-muted" data-ag-delete-contact="${escapeHtml(item.phoneNumber || '')}">Eliminar</button>
            </div>
          </div>
        `}
      </div>
    `;
  }).join('');
}

function renderCategorizedRows(items = [], editingPhone = '') {
  if (!items.length) {
    return `
      <div class="ag-card p-4 text-sm text-slate-500">
        Todavia no hay contactos categorizados por el agente.
      </div>
    `;
  }

  return items.map((item) => {
    const isEditing = editingPhone && editingPhone === item.phoneNumber;
    const categoriesText = Array.isArray(item.categories) ? item.categories.join(', ') : '';

    return `
      <div class="ag-card p-4">
        ${isEditing ? `
          <div class="grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-3">
            <div>
              <label class="text-[10px] uppercase font-bold text-slate-400 mb-1 block">Nombre</label>
              <input class="ag-input" data-ag-contact-name value="${escapeHtml(item.customerName || '')}" placeholder="Nombre del contacto" />
            </div>
            <div>
              <label class="text-[10px] uppercase font-bold text-slate-400 mb-1 block">Numero</label>
              <input class="ag-input bg-slate-50" value="${escapeHtml(item.phoneNumber || '')}" disabled />
            </div>
          </div>
          <div class="mt-3">
            <input type="hidden" data-ag-contact-categories value="${escapeHtml(categoriesText)}" />
          </div>
          <input type="checkbox" class="hidden" data-ag-contact-bot-paused />
          <div class="mt-3 flex flex-wrap gap-2">
            <button type="button" class="ag-btn ag-btn-primary" data-ag-save-contact="${escapeHtml(item.phoneNumber || '')}">Guardar</button>
            <button type="button" class="ag-btn ag-btn-muted" data-ag-cancel-contact="${escapeHtml(item.phoneNumber || '')}">Cancelar</button>
          </div>
        ` : `
          <div class="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div class="space-y-2 flex-1 min-w-0">
              <div>
                <p class="font-black text-slate-800">${escapeHtml(item.customerName || 'Sin nombre')}</p>
                <p class="text-xs text-slate-500">${escapeHtml(item.phoneNumber || 'Sin numero')}</p>
              </div>
              <div class="text-[11px] text-slate-500 space-y-1">
                <p><strong>Ultima categorizacion:</strong> ${escapeHtml(formatDate(item.lastCategorizedAt))}</p>
                <p><strong>Motivo:</strong> ${escapeHtml(item.lastReason || 'Sin motivo registrado')}</p>
              </div>
            </div>
            <div class="flex flex-wrap gap-2">
              <button type="button" class="ag-btn ag-btn-muted" data-ag-edit-contact="${escapeHtml(item.phoneNumber || '')}">Editar</button>
              <button type="button" class="ag-btn ag-btn-muted" data-ag-delete-contact="${escapeHtml(item.phoneNumber || '')}">Eliminar</button>
            </div>
          </div>
        `}
      </div>
    `;
  }).join('');
}

export function renderAgenteLayout() {
  const context = getActiveAgentContext();

  return `
    <style>
      .ag-shell { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; }
      .ag-tab { border: 1px solid #dbeafe; background: #fff; color: #334155; transition: all .2s; }
      .ag-tab:hover { border-color: #93c5fd; box-shadow: 0 6px 20px -16px rgba(14, 116, 144, .8); }
      .ag-tab.active { background: linear-gradient(135deg,#0f766e,#0284c7); color: #fff; border-color: transparent; box-shadow: 0 12px 25px -18px rgba(15,118,110,.9); }
      .ag-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; box-shadow: 0 10px 28px -24px rgba(2, 6, 23, 0.8); }
      .ag-input { width: 100%; border: 1px solid #cbd5e1; border-radius: 8px; padding: .65rem .8rem; background: #fff; }
      .ag-input:focus { border-color: #0ea5e9; box-shadow: 0 0 0 3px rgba(14,165,233,.12); outline: none; }
      .ag-btn { border-radius: 8px; padding: .65rem .95rem; font-weight: 700; font-size: .84rem; }
      .ag-btn-primary { background: linear-gradient(135deg,#0f766e,#0284c7); color: #fff; }
      .ag-btn-muted { background: #f8fafc; color: #334155; border: 1px solid #cbd5e1; }
      .ag-pill { display: inline-flex; align-items: center; border-radius: 999px; padding: .2rem .65rem; font-size: .72rem; font-weight: 700; }
      .ag-pill-ok { background: #dcfce7; color: #166534; }
      .ag-pill-warn { background: #fef9c3; color: #854d0e; }
      .ag-code { display: block; word-break: break-all; white-space: normal; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: .55rem .65rem; color: #0f172a; }
      .ag-chat-bubble-user { background: #dbeafe; color: #0f172a; }
      .ag-chat-bubble-bot { background: #f8fafc; color: #0f172a; border: 1px solid #e2e8f0; }
      .ag-block-tag { background: #ecfeff; color: #0f766e; border: 1px solid #a5f3fc; }
      .ag-lead-filter-scroll { display: flex; gap: .5rem; overflow-x: auto; padding-bottom: .35rem; scrollbar-width: thin; }
      .ag-lead-filter { flex: 0 0 auto; display: inline-flex; align-items: center; gap: .45rem; border: 1px solid #dbeafe; background: #fff; color: #334155; border-radius: 999px; padding: .55rem .85rem; font-weight: 800; font-size: .82rem; }
      .ag-lead-filter span { background: #f1f5f9; color: #64748b; border-radius: 999px; padding: .05rem .45rem; font-size: .72rem; }
      .ag-lead-filter.active { background: #075985; color: #fff; border-color: #075985; }
      .ag-lead-filter.active span { background: rgba(255,255,255,.18); color: #fff; }
      .ag-fade { animation: agFade .25s ease-in-out; }
      @keyframes agFade { from { opacity: 0; transform: translateY(6px);} to {opacity: 1; transform: translateY(0);} }
    </style>

    <section class="ag-shell p-5 md:p-6 ag-fade">
      <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-5">
        <div>
          <h2 class="text-xl font-black text-slate-800 tracking-tight">Agente IA por Sede</h2>
          <p class="text-xs text-slate-500 font-semibold uppercase tracking-wide">Solo lectura de inventario (Fase 1)</p>
        </div>
        <div class="ag-card px-4 py-3 text-xs text-slate-600">
          <p><strong>Tenant:</strong> <span id="ag-tenant-value">${context.tenantId || 'N/D'}</span></p>
          <p><strong>Sede:</strong> <span id="ag-branch-value">${context.branchId || 'N/D'}</span></p>
        </div>
      </div>

      <div class="grid grid-cols-2 md:grid-cols-5 gap-2 mb-5" id="ag-tabs">
        ${AGENTE_TABS.map((tab, index) => `<button class="ag-tab ag-btn ${index === 0 ? 'active' : ''}" data-ag-tab="${tab.id}">${tab.label}</button>`).join('')}
      </div>

      <div id="ag-tab-body"></div>
    </section>

    <div id="ag-source-modal" class="fixed inset-0 hidden items-center justify-center bg-slate-900/70 z-50 p-4">
      <div class="ag-card w-full max-w-xl p-4">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-sm font-black text-slate-800">Inventario consultado por el agente</h3>
          <button class="ag-btn ag-btn-muted" id="ag-close-source-modal">Cerrar</button>
        </div>
        <pre id="ag-source-modal-content" class="text-xs bg-slate-50 rounded-lg p-3 overflow-auto max-h-80"></pre>
      </div>
    </div>
  `;
}

export function renderTabContent(tabId, state = {}) {
  switch (tabId) {
    case 'chat':
      return `
        <div class="ag-card p-4">
          <div id="ag-chat-list" class="space-y-3 max-h-80 overflow-auto mb-4"></div>
          <div class="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-2">
            <input id="ag-chat-input" class="ag-input" placeholder="Pregunta por inventario de esta sede..." />
            <button id="ag-send-chat" class="ag-btn ag-btn-primary">Enviar</button>
          </div>
          <div class="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <span>Sesion:</span>
            <code id="ag-session-id" class="bg-slate-100 px-2 py-1 rounded">${state.sessionId || 'sin sesión'}</code>
            <button id="ag-open-sources" class="ag-btn ag-btn-muted">Ver inventario usado</button>
          </div>
        </div>
      `;

    case 'contactos':
      const contactsData = state.contactsData || { items: [] };
      const contactItems = Array.isArray(contactsData.items) ? contactsData.items : [];
      const manualContacts = contactItems.filter((item) => Boolean(item.botPaused));
      const categorizedContacts = contactItems.filter((item) => !item.botPaused && Array.isArray(item.categories) && item.categories.length);
      const contactTags = getContactTagsFromState(state);
      const activeContactCategory = String(state.activeContactCategory || 'todos').trim() || 'todos';
      const filteredCategorizedContacts = activeContactCategory === 'todos'
        ? categorizedContacts
        : categorizedContacts.filter((item) => (Array.isArray(item.categories) ? item.categories : [])
          .some((category) => String(category || '').trim().toLowerCase() === activeContactCategory.toLowerCase()));
      return `
        <div class="ag-card p-4">
          <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-4">
            <div>
              <h3 class="font-black text-slate-800">Contactos</h3>
              <p class="text-xs text-slate-500">Separa numeros en atencion manual de contactos categorizados por el agente.</p>
            </div>
            <div class="flex items-center gap-2">
              <span class="ag-pill ag-pill-warn">${manualContacts.length} manual(es)</span>
              <span class="ag-pill ag-block-tag">${filteredCategorizedContacts.length}/${categorizedContacts.length} lead(s)</span>
              <button type="button" class="ag-btn ag-btn-muted" id="ag-refresh-contacts">Actualizar</button>
            </div>
          </div>
          <div class="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-2 mb-4">
            <input id="ag-contacts-search" class="ag-input" placeholder="Buscar por nombre, numero o categoria..." value="${escapeHtml(state.contactsSearch || '')}" />
            <button type="button" class="ag-btn ag-btn-primary" id="ag-search-contacts">Buscar</button>
          </div>
          <form id="ag-add-contact-form" class="ag-card p-3 mb-4">
            <h4 class="font-black text-slate-800 mb-3">Numeros en atencion manual</h4>
            <div class="grid grid-cols-1 lg:grid-cols-[1fr_220px_auto] gap-2">
              <input name="customerName" class="ag-input" placeholder="Nombre de la persona" />
              <input name="phoneNumber" class="ag-input" placeholder="+57..." />
              <input type="hidden" name="categories" value="" />
              <input type="checkbox" class="hidden" name="botPaused" checked />
              <button type="submit" class="ag-btn ag-btn-primary">Agregar numero</button>
            </div>
          </form>
          <div class="space-y-3 mb-5" id="ag-manual-contacts-list">
            ${renderManualRows(manualContacts, state.editingContactPhone || '')}
          </div>
          <div class="flex items-center justify-between gap-3 mb-3">
            <h4 class="font-black text-slate-800">Leads categorizados</h4>
            <span class="ag-pill ag-block-tag">${filteredCategorizedContacts.length} visible(s)</span>
          </div>
          ${renderContactCategoryFilters(contactTags, activeContactCategory, categorizedContacts.length, categorizedContacts)}
          <div class="space-y-3" id="ag-contacts-list">
            ${renderCategorizedRows(filteredCategorizedContacts, state.editingContactPhone || '')}
          </div>
          <div id="ag-status" class="mt-3 text-xs text-slate-600"></div>
        </div>
      `;

    case 'etiquetas':
      const promptContactTags = Array.isArray(state.configSnapshot?.prompt?.contactTags) ? state.configSnapshot.prompt.contactTags : [];
      return `
        <div class="ag-card p-4">
          <form id="ag-form-tags">
            <div class="flex flex-col md:flex-row gap-3 md:items-center md:justify-between mb-4">
              <div>
                <h3 class="font-black text-slate-800">Etiquetas</h3>
                <p class="text-xs text-slate-500">Estas son las unicas etiquetas que la IA puede asignar a leads de WhatsApp en esta sede.</p>
              </div>
              <span class="ag-pill ag-block-tag">${promptContactTags.length} etiqueta(s)</span>
            </div>
            <label class="text-[10px] uppercase font-bold text-slate-400 mb-1 block">Lista de etiquetas permitidas</label>
            <textarea
              id="ag-contact-tags-input"
              class="ag-input min-h-44"
              placeholder="Ej:
Interesado en comprar
Quiere vender moto
Financiacion
SOAT"
            >${escapeHtml(promptContactTags.join('\n'))}</textarea>
            <div class="mt-3 ag-card p-3 bg-slate-50">
              <p class="text-xs text-slate-600">Define en el prompt cuando debe usar cada etiqueta. Si la IA intenta usar una etiqueta distinta, el backend la rechaza.</p>
            </div>
            <div class="mt-4 flex justify-end">
              <button class="ag-btn ag-btn-primary" type="submit">Guardar etiquetas</button>
            </div>
          </form>
          <div id="ag-status" class="mt-3 text-xs text-slate-600"></div>
        </div>
      `;

    case 'conexiones':
      const gemini = state.configSnapshot?.gemini || {};
      const ycloud = state.configSnapshot?.ycloud || {};
      const coexistence = ycloud.coexistence || {};
      const ycloudEvents = Array.isArray(ycloud.enabledEvents) ? ycloud.enabledEvents : [];
      const botPaused = Boolean(ycloud.botPaused);
      const replyDelaySeconds = Math.max(1, Math.round(Number(coexistence.replyDelayMs || 8000) / 1000));
      const humanPauseSeconds = Math.max(1, Math.round(Number(coexistence.humanModeDurationMs || 8000) / 1000));

      return `
        <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <form id="ag-form-gemini" class="ag-card p-4">
            <h3 class="font-black text-slate-800 mb-3">Gemini (por sede)</h3>
            <p class="text-xs text-slate-500 mb-3">La API key se guarda en Firebase desde backend cifrada. Por seguridad vuelve a mostrarse vacía, pero abajo verás si ya quedó guardada.</p>
            <input name="apiKey" class="ag-input mb-2" placeholder="API Key Gemini" type="password" />
            <input name="model" class="ag-input mb-2" placeholder="Modelo (ej. gemini-2.5-flash-lite)" value="${escapeHtml(gemini.model || 'gemini-2.5-flash-lite')}" />
            <input name="embeddingModel" class="ag-input mb-2" placeholder="Modelo embedding" value="${escapeHtml(gemini.embeddingModel || 'gemini-embedding-2-preview')}" />
            <input name="temperature" class="ag-input mb-3" placeholder="Temperatura" value="${escapeHtml(gemini.temperature ?? 0.2)}" />
            <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
              <button class="ag-btn ag-btn-primary w-full" type="submit">Guardar Gemini</button>
              <button class="ag-btn ag-btn-muted w-full" type="button" id="ag-delete-gemini">Eliminar Gemini</button>
            </div>
          </form>
          <form id="ag-form-ycloud" class="ag-card p-4">
            <h3 class="font-black text-slate-800 mb-3">YCloud (por sede)</h3>
            <p class="text-xs text-slate-500 mb-3">Guarda la API key del dashboard, el secret del webhook y el numero de WhatsApp Business que usara YCloud para responder.</p>
            <input name="apiKey" class="ag-input mb-2" placeholder="API Key YCloud" type="password" />
            <input name="webhookSecret" class="ag-input mb-2" placeholder="Webhook Secret" type="password" />
            <input name="appId" class="ag-input mb-2" placeholder="App ID (opcional)" value="${escapeHtml(ycloud.appId || '')}" />
            <input name="businessPhone" class="ag-input mb-3" placeholder="Telefono WhatsApp Business (+57...)" value="${escapeHtml(ycloud.businessPhone || '')}" />
            <div class="ag-card p-3 mb-3 ${botPaused ? 'border-amber-300 bg-amber-50' : 'bg-slate-50'}">
              <input type="hidden" name="botPaused" value="${botPaused ? 'true' : 'false'}" />
              <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <p class="font-black text-slate-800">Bot de WhatsApp</p>
                  <p class="text-xs text-slate-500">${botPaused ? 'Pausado: no respondera mensajes entrantes.' : 'Activo: respondera mensajes entrantes.'}</p>
                </div>
                <button type="button" id="ag-toggle-bot-pause" class="ag-btn ${botPaused ? 'ag-btn-primary' : 'ag-btn-muted'}">
                  ${botPaused ? 'Activar bot' : 'Pausar bot'}
                </button>
              </div>
            </div>
            <div class="border-t border-slate-200 pt-3 mb-3">
              <div class="mb-3">
                <label class="text-[10px] uppercase font-bold text-slate-400 mb-1 block">Esperar antes de responder al cliente (segundos)</label>
                <input name="replyDelayValue" class="ag-input" type="number" min="1" step="1" value="${escapeHtml(replyDelaySeconds)}" />
              </div>
              <label class="inline-flex items-center gap-2 text-sm font-semibold text-slate-700 mb-3">
                <input type="checkbox" name="coexistenceEnabled" ${coexistence.enabled ? 'checked' : ''} />
                Intervencion humana en WhatsApp Business
              </label>
              <div>
                <label class="text-[10px] uppercase font-bold text-slate-400 mb-1 block">Pausar bot despues de mensaje manual (segundos)</label>
                <input name="humanModeValue" class="ag-input" type="number" min="1" step="1" value="${escapeHtml(humanPauseSeconds)}" />
              </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
              <button class="ag-btn ag-btn-primary w-full" type="submit">Guardar YCloud</button>
              <button class="ag-btn ag-btn-muted w-full" type="button" id="ag-delete-ycloud">Eliminar YCloud</button>
            </div>
          </form>
          ${renderConnectionSummary('Estado Gemini', gemini, [
            `<p><strong>Modelo:</strong> ${escapeHtml(gemini.model || 'gemini-2.5-flash-lite')}</p>`,
            `<p><strong>Embedding:</strong> ${escapeHtml(gemini.embeddingModel || 'gemini-embedding-2-preview')}</p>`,
            `<p><strong>Temperatura:</strong> ${escapeHtml(gemini.temperature ?? 0.2)}</p>`
          ])}
          ${renderConnectionSummary('Estado YCloud', ycloud, [
            `<p><strong>Webhook:</strong> ${escapeHtml(ycloud.webhookSecretMasked || 'No visible por seguridad')}</p>`,
            `<p><strong>App ID:</strong> ${escapeHtml(ycloud.appId || 'Sin registro')}</p>`,
            `<p><strong>Telefono:</strong> ${escapeHtml(ycloud.businessPhone || 'Sin registro')}</p>`,
            `<p><strong>Bot WhatsApp:</strong> ${botPaused ? 'Pausado' : 'Activo'}</p>`,
            `<p><strong>Coexistencia:</strong> ${coexistence.enabled ? 'Activa' : 'Inactiva'}</p>`,
            `<p><strong>Debounce cliente:</strong> ${escapeHtml(formatDurationLabel(replyDelaySeconds, 'seconds'))}</p>`,
            `<p><strong>Pausa admin:</strong> ${escapeHtml(formatDurationLabel(humanPauseSeconds, 'seconds'))}</p>`
          ])}
          <div class="ag-card p-4 xl:col-span-2">
            <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
              <div>
                <h4 class="font-black text-slate-800">Memoria de la IA</h4>
                <p class="text-xs text-slate-500">Reinicia el historial conversacional del agente para todos los contactos de esta sede.</p>
              </div>
              <button class="ag-btn ag-btn-muted" type="button" id="ag-reset-memory">Reiniciar memoria</button>
            </div>
          </div>
          <div class="ag-card p-4 xl:col-span-2">
            <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-3">
              <h4 class="font-black text-slate-800">Webhook para dashboard YCloud</h4>
              <span class="${ycloud.webhookSecretMasked ? 'ag-pill ag-pill-ok' : 'ag-pill ag-pill-warn'}">${ycloud.webhookSecretMasked ? 'Secret guardado' : 'Falta secret'}</span>
            </div>
            <div class="text-xs text-slate-600 space-y-3">
              <div>
                <p class="font-bold text-slate-700 mb-1">URL a registrar</p>
                <code class="ag-code">${escapeHtml(ycloud.webhookUrl || ycloud.webhookPath || 'Guarda la configuracion para generar la URL')}</code>
              </div>
              <div>
                <p class="font-bold text-slate-700 mb-1">Eventos a activar</p>
                <div class="flex flex-wrap gap-2">
                  ${(ycloudEvents.length ? ycloudEvents : ['whatsapp.inbound_message.received', 'whatsapp.message.updated'])
                    .map((eventName) => `<code class="bg-slate-100 border border-slate-200 rounded-md px-2 py-1">${escapeHtml(eventName)}</code>`)
                    .join('')}
                </div>
              </div>
            </div>
          </div>
          <div id="ag-status" class="xl:col-span-2 text-xs text-slate-600 bg-white border border-slate-200 rounded-lg p-3"></div>
        </div>
      `;

    case 'prompt':
      const promptBlocks = Array.isArray(state.configSnapshot?.prompt?.blocks) ? state.configSnapshot.prompt.blocks : [];

      return `
        <div class="ag-card p-4">
          <form id="ag-form-prompt">
            <div class="flex flex-col md:flex-row gap-3 md:items-center md:justify-between mb-4">
              <div>
                <h3 class="font-black text-slate-800">Bloques del prompt</h3>
                <p class="text-xs text-slate-500">Crea y elimina bloques libremente. El agente unira todos los bloques en el orden visual para construir su comportamiento.</p>
              </div>
              <div class="flex flex-wrap items-center gap-2">
                <span class="ag-pill ag-block-tag">${promptBlocks.length} bloque(s)</span>
                <button class="ag-btn ag-btn-muted" type="button" id="ag-copy-prompt-blocks">Copiar bloques</button>
                <button class="ag-btn ag-btn-muted" type="button" id="ag-open-import-prompt">Pegar bloques</button>
                <button class="ag-btn ag-btn-muted" type="button" id="ag-add-prompt-block">Agregar bloque</button>
              </div>
            </div>
            <div id="ag-prompt-blocks" class="space-y-3 mb-4">${renderPromptBlocks(promptBlocks)}</div>
            <div class="flex flex-col md:flex-row gap-2 md:items-center md:justify-between">
              <p class="text-xs text-slate-500">Se guarda por sede y se aplica al chat sin mostrarte el prompt final como un solo texto desordenado.</p>
              <button class="ag-btn ag-btn-primary" type="submit">Guardar bloques</button>
            </div>
          </form>
          <div id="ag-status" class="mt-3 text-xs text-slate-600"></div>
          <div id="ag-import-prompt-modal" class="fixed inset-0 hidden items-center justify-center bg-slate-900/70 z-50 p-4">
            <div class="ag-card w-full max-w-3xl p-4">
              <div class="flex items-center justify-between gap-3 mb-3">
                <h3 class="text-sm font-black text-slate-800">Pegar bloques del prompt</h3>
                <button class="ag-btn ag-btn-muted" type="button" id="ag-close-import-prompt">Cerrar</button>
              </div>
              <textarea
                id="ag-import-prompt-text"
                class="ag-input min-h-[320px] font-mono text-xs"
                placeholder="[Identidad y tono]&#10;Contenido...&#10;&#10;[Protocolo de compra]&#10;Contenido..."
              ></textarea>
              <div class="mt-3 flex flex-col md:flex-row gap-2 md:items-center md:justify-between">
                <p class="text-xs text-slate-500">Al aplicar, reemplaza los bloques visibles. Para guardar en Firebase usa Guardar bloques.</p>
                <div class="flex gap-2 justify-end">
                  <button class="ag-btn ag-btn-muted" type="button" id="ag-cancel-import-prompt">Cancelar</button>
                  <button class="ag-btn ag-btn-primary" type="button" id="ag-apply-import-prompt">Aplicar bloques</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;

    default:
      return `
        <div class="ag-card p-4">
          <div id="ag-status" class="text-xs text-slate-600"></div>
        </div>
      `;
  }
}

export function renderStatusMessage(message, type = 'ok') {
  const klass = type === 'error' ? 'ag-pill ag-pill-warn' : 'ag-pill ag-pill-ok';
  return `<span class="${klass}">${message}</span>`;
}

export function renderChatBubble(role, text) {
  const cls = role === 'user' ? 'ag-chat-bubble-user ml-auto' : 'ag-chat-bubble-bot';
  return `<div class="${cls} rounded-xl px-3 py-2 text-sm max-w-[85%] whitespace-pre-wrap">${text}</div>`;
}
