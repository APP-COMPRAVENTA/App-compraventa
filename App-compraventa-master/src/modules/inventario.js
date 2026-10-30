// src/modules/inventario.js

// Estado
import {
  inventory,
  inventorySearchTerm,
  setInventorySearchTerm
} from '../store/store.js';

// Firestore helpers
import { getCollectionRef } from '../services/listeners.js';
import {
  doc,
  deleteDoc,
  updateDoc,
  getDoc,
  getDocs,
  query,
  where,
  deleteField
} from "firebase/firestore";
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from "firebase/storage";
import { db, activeTenantId, currentBranchId, storage } from '../config/firebase.js';

// Firebase auth import
import { auth, currentUser as exportedCurrentUser } from '../config/firebase.js';

// Utilidades UI
import {
  renderHeader,
  formatCurrency,
  showGeneralConfirmModal,
  escapeHtml
} from '../utils/utils.js';
import { getColombiaNow } from '../utils/colombiaTime.js';
import { agentAPI } from './agente/api.js';

// Navegación
import { navigateTo } from '../navigation.js';
import { anularTransaccion } from './balance.js';

/* ======================================================
   EXPONER FUNCIONES PARA HTML (onclick)
   Corrección: Se asignan después de que las funciones
   son elevadas (hoisted) correctamente.
====================================================== */
// Las asignaciones se harán efectivas gracias al hoisting de funciones abajo
window.deleteInventoryItemWrapper = deleteInventoryItemWrapper;
window.updateInventoryStatus = updateInventoryStatus;
window.openMediaModal = openMediaModal;
window.closeMediaModal = closeMediaModal;
window.openInventoryMediaModal = openInventoryMediaModal;
window.closeInventoryMediaModal = closeInventoryMediaModal;
window.saveInventoryMedia = saveInventoryMedia;
window.toggleInventoryMediaRemoval = toggleInventoryMediaRemoval;


window.openEditModal = openEditModal;
window.closeEditModal = closeEditModal;
window.saveInventoryEdit = saveInventoryEdit;

// --- Estado local del módulo ---
let viewingTenantId = null;     // tenant que se está viendo (null = propia empresa)
let viewingBranchId = null;     // branch que se está viendo (null = todas / por defecto)
let displayedInventory = [];    // inventario que se muestra actualmente
let availableTenants = [];      // listado de tenants para selector
let availableBranches = [];     // listado de branches para selector
let editingMediaItemId = null;  // item que se está editando en modal multimedia

const TARGET_MEDIA_BYTES = 16 * 1024 * 1024;
const TARGET_MEDIA_HEADROOM_BYTES = Math.floor(TARGET_MEDIA_BYTES * 0.96);
const MAX_IMAGE_SOURCE_BYTES = 50 * 1024 * 1024;
const MAX_VIDEO_SOURCE_BYTES = 300 * 1024 * 1024;
const ALLOWED_VIDEO_MIME = 'video/mp4';
const FFMPEG_CORE_BASE_URLS = [
  { baseURL: '/vendor/ffmpeg-core', mode: 'same-origin' },
  import.meta.env.VITE_FFMPEG_CORE_BASE_URL
    ? { baseURL: import.meta.env.VITE_FFMPEG_CORE_BASE_URL, mode: 'blob' }
    : null,
  { baseURL: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm', mode: 'blob' },
  { baseURL: 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm', mode: 'blob' }
].filter(Boolean);

let ffmpegInstance = null;
let ffmpegLoadPromise = null;
let ffmpegProgressCallback = null;

function isFFmpegLoadError(error) {
  const message = String(error?.message || error || '').toLowerCase();
  return (
    message.includes('ffmpeg-core') ||
    message.includes('failed to import') ||
    message.includes('failed to fetch') ||
    message.includes('networkerror') ||
    message.includes('wasm')
  );
}

async function syncAgentInventoryItem(itemId) {
  const normalizedItemId = String(itemId || '').trim();
  if (!normalizedItemId) return;

  try {
    await agentAPI.syncInventoryItem(normalizedItemId);
  } catch (error) {
    console.warn('No se pudo sincronizar el índice del agente para inventario:', normalizedItemId, error?.message || error);
  }
}

/* ======================================================
   RENDER PRINCIPAL
====================================================== */
export async function renderInventario() {
  const contentDiv = document.getElementById('content');
  if (!contentDiv) return;

  // 1. Estilos Inyectados
  const styles = `
    <style>
      /* Inputs Modernos */
      .input-modern { 
        width: 100%; padding: 0.6rem 1rem; border: 1px solid #E2E8F0; border-radius: 0.5rem; 
        outline: none; transition: all 0.2s; background: #F8FAFC; color: #334155;
      }
      .input-modern:focus { border-color: #6366F1; box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1); background: white; }
      
      /* Botones */
      .btn-ghost { background: transparent; color: #64748B; padding: 0.5rem; border-radius: 0.5rem; transition: 0.2s; }
      .btn-ghost:hover { background: #F1F5F9; color: #334155; }
      .btn-primary-soft { background: #EEF2FF; color: #4F46E5; padding: 0.5rem 1rem; border-radius: 0.5rem; font-weight: 600; transition: 0.2s; }
      .btn-primary-soft:hover { background: #E0E7FF; }
      
      /* Tabla estalizada */
      .table-modern th { background: #F8FAFC; color: #64748B; font-weight: 700; text-transform: uppercase; font-size: 0.7rem; letter-spacing: 0.05em; padding: 1rem; }
      .table-modern td { padding: 1rem; border-bottom: 1px solid #F1F5F9; font-size: 0.9rem; color: #1E293B; vertical-align: middle; }
      .table-modern tr:last-child td { border-bottom: none; }
      .table-modern tr:hover { background-color: #FAFAFA; }

      /* Media Thumbnails */
      .media-thumb { width: 40px; height: 40px; object-fit: cover; border-radius: 6px; border: 1px solid #E2E8F0; cursor: pointer; transition: transform 0.2s; }
      .media-thumb:hover { transform: scale(1.1); border-color: #6366F1; }
      .media-placeholder { width: 40px; height: 40px; background: #F1F5F9; border-radius: 6px; display: flex; align-items: center; justify-content: center; color: #CBD5E1; font-size: 10px; flex-direction: column; }
      .media-manage-btn { width: 26px; height: 26px; border-radius: 999px; background: #EEF2FF; color: #4F46E5; border: 1px solid #C7D2FE; font-size: 11px; display: inline-flex; align-items: center; justify-content: center; transition: all 0.2s; }
      .media-manage-btn:hover { background: #E0E7FF; border-color: #A5B4FC; }
      .media-upload-progress { height: 6px; background: #E2E8F0; border-radius: 999px; overflow: hidden; }
      .media-upload-progress > span { display: block; height: 100%; background: #4F46E5; width: 0%; transition: width 0.2s; }
      
      /* Badges */
      .badge { padding: 0.25rem 0.75rem; border-radius: 999px; font-size: 0.75rem; font-weight: 700; display: inline-flex; items-center: center; gap: 0.25rem; }
      .badge-success { background: #DCFCE7; color: #15803D; }
      .badge-warning { background: #FEF3C7; color: #B45309; }
      .badge-error { background: #FEE2E2; color: #B91C1C; }
      .badge-neutral { background: #F1F5F9; color: #64748B; }
      .inventory-description { display: flex; align-items: flex-start; gap: 0.6rem; max-width: 250px; }
      .inventory-description-icon { width: 1.8rem; height: 1.8rem; flex: 0 0 auto; border-radius: 0.75rem; background: #ecfccb; color: #4d7c0f; display: inline-flex; align-items: center; justify-content: center; }
      .inventory-description-text { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; line-height: 1.15rem; }

      /* Lightbox Modal */
      .media-modal { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(15, 23, 42, 0.9); z-index: 9999; display: flex; align-items: center; justify-content: center; opacity: 0; pointer-events: none; transition: opacity 0.3s; backdrop-filter: blur(4px); }
      .media-modal.active { opacity: 1; pointer-events: auto; }
      .media-content { max-width: 90%; max-height: 90%; border-radius: 8px; overflow: hidden; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25); }
    </style>
  `;

  contentDiv.innerHTML = styles + await renderHeader(
    'Gestión de Inventario',
    `Total ítems activos: ${inventory.length}`
  );

  // 2. Panel de Control Superior
  contentDiv.insertAdjacentHTML('beforeend', `
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
      
      <div class="lg:col-span-1 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
        <div>
          <div class="flex items-center gap-2 mb-3">
            <div class="bg-indigo-100 p-2 rounded-lg text-indigo-600"><i class="fa-solid fa-plus"></i></div>
            <h3 class="font-bold text-slate-800">Registrar Producto</h3>
          </div>
          <p class="text-xs text-slate-500 mb-4 leading-relaxed">
            La creación de nuevos vehículos se realiza a través del registro de <strong>Egreso</strong> en el módulo de Balance.
          </p>
        </div>
        <button onclick="navigateTo('balance')" class="w-full py-2.5 rounded-xl bg-slate-900 text-white text-sm font-bold hover:bg-slate-800 transition shadow-lg shadow-slate-200">
          Ir a Balance
        </button>
      </div>

      <div class="lg:col-span-2 bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
        <div class="flex items-center gap-2 mb-4">
          <div class="bg-emerald-100 p-2 rounded-lg text-emerald-600"><i class="fa-solid fa-network-wired"></i></div>
          <h3 class="font-bold text-slate-800">Visualizar Inventario Externo</h3>
        </div>
        
        <div class="flex flex-col md:flex-row gap-3 items-end">
          <div class="flex-1 w-full">
            <label class="text-[10px] uppercase font-bold text-slate-400 mb-1 block">Empresa / Tenant</label>
            <select id="select-tenant" class="input-modern bg-white">
              <option value="">-- Mi Empresa (Local) --</option>
            </select>
          </div>
          <div class="flex-1 w-full">
            <label class="text-[10px] uppercase font-bold text-slate-400 mb-1 block">Sede / Sucursal</label>
            <select id="select-branch" class="input-modern bg-white">
              <option value="">-- Todas las Sedes --</option>
            </select>
          </div>
          <div class="flex gap-2 w-full md:w-auto">
            <button id="btn-reset-view" class="btn-primary-soft h-[42px] px-4 flex items-center justify-center gap-2">
              <i class="fa-solid fa-eye"></i> Ver
            </button>
           <button id="btn-reset-own-view" 
        class="h-[42px] px-4 bg-slate-100 border border-slate-300 rounded-lg text-slate-700 hover:bg-indigo-600 hover:text-white hover:border-indigo-600 transition-all duration-200 flex items-center gap-2 font-medium shadow-sm" 
        title="Volver a mi inventario">
    <i class="fa-solid fa-house-user text-sm"></i>
    <span class="text-xs">Mi Inventario</span>
</button>
          </div>
        </div>
        <p class="text-[10px] text-slate-400 mt-2 italic flex items-center gap-1">
          <i class="fa-solid fa-circle-info"></i> Modo solo lectura al ver inventarios ajenos.
        </p>
      </div>
    </div>
  `);

  // 3. Tabla Principal + Buscador
  contentDiv.insertAdjacentHTML('beforeend', `
    <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-10">
      
      <div class="p-5 border-b border-slate-100 bg-white flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h2 class="text-lg font-bold text-slate-800 flex items-center gap-2">
            <i class="fa-solid fa-list text-slate-400"></i> Listado de Vehículos
          </h2>
          <p class="text-sm text-slate-500 mt-1 flex items-center gap-2">
            Capital en Inventario: 
            <span id="inventory-total-cost" class="font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100">$0</span>
          </p>
        </div>
        
        <div class="relative w-full md:w-72">
          <i class="fa-solid fa-search absolute left-3 top-3 text-slate-400 text-sm"></i>
          <input
            type="text"
            id="inventory-search"
            value="${escapeHtml(inventorySearchTerm || '')}"
            placeholder="Buscar por nombre, placa o descripción..."
            class="input-modern pl-9"
          />
        </div>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full table-modern text-left">
          <thead>
            <tr>
              <th>Multimedia</th>
              <th>Producto</th>
              <th>Placa</th>
              <th>Compra</th>
              <th>Venta</th>
              <th>Máx. Desc.</th>
              <th>Ganancia Est.</th>
              <th>Descripción</th>
              <th class="text-center">Estado</th>
              <th class="text-center">Acciones</th>
            </tr>
          </thead>
          <tbody id="inventory-table-body">
            </tbody>
        </table>
      </div>

      <div id="inventory-list-status" class="hidden p-12 text-center">
        <div class="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-3 text-slate-300 text-2xl">
          <i class="fa-solid fa-box-open"></i>
        </div>
        <h3 class="text-slate-800 font-bold">No se encontraron productos</h3>
        <p class="text-slate-400 text-sm">Intenta ajustar tu búsqueda.</p>
      </div>
    </div>
    
    <div id="media-lightbox" class="media-modal" onclick="closeMediaModal(event)">
       <div class="relative">
         <button class="absolute -top-10 right-0 text-white text-xl hover:text-slate-300" onclick="closeMediaModal(event)">
            <i class="fa-solid fa-times"></i> Cerrar
         </button>
         <div id="media-lightbox-content" class="media-content bg-black flex justify-center items-center">
            </div>
       </div>
    </div>

    <div id="inventory-media-modal" class="hidden fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 transition-opacity">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden transform transition-all">
        <div class="bg-slate-50 border-b border-slate-100 px-6 py-4 flex justify-between items-center">
          <h3 class="text-lg font-bold text-slate-800 flex items-center gap-2">
            <div class="bg-indigo-100 text-indigo-600 p-2 rounded-lg"><i class="fa-solid fa-photo-film"></i></div>
            Multimedia del Producto
          </h3>
          <button onclick="closeInventoryMediaModal()" class="text-slate-400 hover:text-red-500 transition">
            <i class="fa-solid fa-xmark text-xl"></i>
          </button>
        </div>

        <form id="form-inventory-media" onsubmit="saveInventoryMedia(event)" class="p-6 space-y-5">
          <input type="hidden" id="inventory-media-id">

          <div class="rounded-xl border border-slate-200 p-3 bg-slate-50">
            <p class="text-xs uppercase font-bold text-slate-400">Producto</p>
            <p id="inventory-media-item-label" class="text-sm font-semibold text-slate-700">-</p>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="rounded-xl border border-slate-200 p-4">
              <label for="inventory-media-image" class="text-[10px] uppercase font-bold text-slate-400 mb-2 block">
                Imagen (se comprime a máx. 16MB)
              </label>
              <input id="inventory-media-image" type="file" accept="image/*" class="input-modern bg-white text-xs">
              <p id="inventory-media-image-current" class="text-[11px] text-slate-500 mt-2">Actual: Sin imagen</p>
              <input id="inventory-media-remove-image" type="checkbox" class="hidden">
              <button id="inventory-media-remove-image-btn" type="button" onclick="toggleInventoryMediaRemoval('image')" class="mt-3 w-full px-3 py-2 rounded-lg border border-red-200 text-red-600 text-xs font-bold hover:bg-red-50 transition disabled:opacity-40 disabled:cursor-not-allowed">
                <i class="fa-solid fa-trash-can mr-1"></i> Eliminar imagen
              </button>
            </div>

            <div class="rounded-xl border border-slate-200 p-4">
              <label for="inventory-media-video" class="text-[10px] uppercase font-bold text-slate-400 mb-2 block">
                Video MP4 (se comprime a máx. 16MB)
              </label>
              <input id="inventory-media-video" type="file" accept="video/mp4" class="input-modern bg-white text-xs">
              <p id="inventory-media-video-current" class="text-[11px] text-slate-500 mt-2">Actual: Sin video</p>
              <input id="inventory-media-remove-video" type="checkbox" class="hidden">
              <button id="inventory-media-remove-video-btn" type="button" onclick="toggleInventoryMediaRemoval('video')" class="mt-3 w-full px-3 py-2 rounded-lg border border-red-200 text-red-600 text-xs font-bold hover:bg-red-50 transition disabled:opacity-40 disabled:cursor-not-allowed">
                <i class="fa-solid fa-trash-can mr-1"></i> Eliminar video
              </button>
            </div>
          </div>

          <div class="space-y-2">
            <div class="media-upload-progress"><span id="inventory-media-progress-bar"></span></div>
            <p id="inventory-media-progress-text" class="text-[11px] text-slate-500">Selecciona imagen o video para guardar.</p>
          </div>

          <div class="border-t border-slate-100 pt-4 flex justify-end gap-3">
            <button type="button" onclick="closeInventoryMediaModal()" class="px-5 py-2.5 rounded-xl text-slate-500 font-bold hover:bg-slate-100 transition">
              Cancelar
            </button>
            <button id="inventory-media-submit-btn" type="submit" class="px-5 py-2.5 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition">
              <i class="fa-solid fa-cloud-arrow-up mr-1"></i> Guardar Multimedia
            </button>
          </div>
        </form>
      </div>
    </div>

    
    <div id="edit-inventory-modal" class="hidden fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4 transition-opacity">
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden transform transition-all">
        
        <div class="bg-slate-50 border-b border-slate-100 px-6 py-4 flex justify-between items-center">
          <h3 class="text-lg font-bold text-slate-800 flex items-center gap-2">
            <div class="bg-indigo-100 text-indigo-600 p-2 rounded-lg"><i class="fa-solid fa-pen"></i></div>
            Editar Producto
          </h3>
          <button onclick="closeEditModal()" class="text-slate-400 hover:text-red-500 transition">
            <i class="fa-solid fa-xmark text-xl"></i>
          </button>
        </div>

        <form id="form-edit-inventory" onsubmit="saveInventoryEdit(event)" class="p-6">
          <input type="hidden" id="edit-id">
          
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label class="text-[10px] uppercase font-bold text-slate-400 mb-1 block">Nombre del Producto</label>
              <input type="text" id="edit-nombre" required class="input-modern" placeholder="Ej: Moto ABC">
            </div>
            <div>
              <label class="text-[10px] uppercase font-bold text-slate-400 mb-1 block">Placa / Referencia</label>
              <input type="text" id="edit-placa" class="input-modern uppercase" placeholder="Ej: XYZ-123">
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label class="text-[10px] uppercase font-bold text-emerald-600 mb-1 block">Precio Compra / Costo</label>
              <input type="number" id="edit-compra" required min="0" class="input-modern font-mono font-bold text-slate-700">
            </div>
            <div>
              <label class="text-[10px] uppercase font-bold text-blue-600 mb-1 block">Precio Venta Público</label>
              <input type="number" id="edit-venta" required min="0" class="input-modern font-mono font-bold text-slate-700">
            </div>
            <div>
              <label class="text-[10px] uppercase font-bold text-red-500 mb-1 block">Descuento Máximo</label>
              <input type="number" id="edit-desc" min="0" class="input-modern font-mono font-bold text-red-500">
            </div>
          </div>

          <div class="mb-6">
            <label class="text-[10px] uppercase font-bold text-slate-400 mb-1 block">Estado del Producto</label>
            <input type="text" id="edit-estado" list="estado-sugerencias" required class="input-modern" placeholder="Escribe o selecciona un estado...">
            <datalist id="estado-sugerencias">
              <option value="Disponible">
              <option value="Mantenimiento">
              <option value="Separado">
              <option value="Garantía">
            </datalist>
            <p class="text-[10px] text-slate-400 mt-1"><i class="fa-solid fa-circle-info"></i> Puedes seleccionar una opción de la lista o escribir un estado personalizado.</p>
          </div>

          <div class="mb-6">
            <label class="text-[10px] uppercase font-bold text-lime-600 mb-1 block">Descripción Comercial</label>
            <textarea id="edit-descripcion" class="input-modern min-h-28" placeholder="Ej: Moto económica, papeles al día, ideal para trabajo, recién ajustada..."></textarea>
            <p class="text-[10px] text-slate-400 mt-1"><i class="fa-solid fa-leaf"></i> Esta descripción ayuda al agente a responder mejor y vender con más contexto.</p>
          </div>

          <div class="border-t border-slate-100 pt-4 flex justify-end gap-3">
            <button type="button" onclick="closeEditModal()" class="px-5 py-2.5 rounded-xl text-slate-500 font-bold hover:bg-slate-100 transition">
              Cancelar
            </button>
            <button type="submit" class="px-5 py-2.5 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition">
              <i class="fa-solid fa-floppy-disk mr-1"></i> Guardar Cambios
            </button>
          </div>
        </form>

      </div>
    </div>
  `);

  // Listeners
  document
    .getElementById('inventory-search')
    .addEventListener('input', (e) => {
      setInventorySearchTerm(e.target.value);
      renderInventoryTableRows();
    });

  initPublicInventorySelectors();

  // Resetear vista
  viewingTenantId = null;
  viewingBranchId = null;
  displayedInventory = []; 
  await loadInventoryForView();
}

/* ======================================================
   DROPDOWNS DINÁMICOS
====================================================== */
export function updateDynamicDropdowns() {
  const availableItems = inventory.filter(
    item => item.estado !== 'Vendido'
  );

  const selects = document.querySelectorAll('#related-inventory-id');
  if (!selects.length) return;

  selects.forEach(select => {
    const currentVal = select.value;
    select.innerHTML = `<option value="">-- No aplica --</option>`;

    availableItems.forEach(item => {
      const label = `${item.nombre} - ${item.placa || 'NA'}`;
      select.innerHTML += `
        <option
          value="${item.id}"
          data-price="${item.precio_venta}"
          data-max-discount="${item.max_discount_amount || 0}"
          ${item.id === currentVal ? 'selected' : ''}
        >
          ${label} (${formatCurrency(item.precio_venta)})
        </option>
      `;
    });
  });
}

/* ======================================================
   RENDER DE FILAS
====================================================== */
function renderInventoryTableRows() {
  const tbody = document.getElementById('inventory-table-body');
  const status = document.getElementById('inventory-list-status');
  if (!tbody) return;

  const term = (inventorySearchTerm || '').toLowerCase();
  const source = (Array.isArray(displayedInventory) && displayedInventory.length > 0)
    ? displayedInventory
    : inventory || [];

  const filtered = source
    .filter(item => String(item.estado || item.status || '').trim().toLowerCase() !== 'vendido')
    .filter(item => {
      if (!term) return true;
      const nameMatch = (item.nombre || '').toLowerCase().includes(term);
      const plateMatch = (item.placa || '').toLowerCase().includes(term);
      const descriptionMatch = (item.descripcion || '').toLowerCase().includes(term);
      return nameMatch || plateMatch || descriptionMatch;
    })
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

    // --- NUEVO: CALCULAR EL CAPITAL TOTAL INVERTIDO ---
    const totalCapital = filtered.reduce((suma, item) => suma + (parseFloat(item.precio_compra) || 0), 0);
    const labelTotalCost = document.getElementById('inventory-total-cost');
    if (labelTotalCost) {
      labelTotalCost.innerText = formatCurrency(totalCapital);
    }
    // ------------------------------------------------
  
    // --- NUEVA LÓGICA PARA EVITAR CONFUSIÓN ---
    if (!filtered.length) {
    tbody.innerHTML = ''; // Limpiamos la tabla por si había datos anteriores
    
    const isOwnView = !viewingTenantId || String(viewingTenantId) === String(activeTenantId);
    
    // Personalizamos el mensaje que se inyecta en el div de status
    status.innerHTML = `
      <div class="flex flex-col items-center justify-center py-16 text-slate-500">
      
       ${/* Icono de estado vacío con fondo circular gris suave  <div class="bg-slate-50 p-6 rounded-full mb-4">
        <i class="fa-solid fa-box-open text-5xl opacity-20"></i>
    </div> */ ''}
   
        <p class="text-lg font-bold text-slate-700">
          ${isOwnView 
            ? 'Tu inventario está vacío' 
            : 'Esta sede no tiene productos'}
        </p>
        <p class="text-sm text-slate-400 max-w-xs text-center">
          ${term 
            ? `No encontramos nada que coincida con "${term}"` 
            : 'No hay artículos disponibles para mostrar en este momento.'}
        </p>
      </div>
    `;
    
    status.classList.remove('hidden');
    return;
  }
  // ------------------------------------------

  // Si hay datos, nos aseguramos de ocultar el mensaje de estado
  status.classList.add('hidden');
  
  const ownView = !viewingTenantId || String(viewingTenantId) === String(activeTenantId);

  tbody.innerHTML = filtered.map(item => {
    // 🔥 CÁLCULO DINÁMICO: Restamos Venta - Compra en tiempo real
    const precioCompraReal = parseFloat(item.precio_compra) || 0;
    const precioVentaReal = parseFloat(item.precio_venta) || 0;
    const gananciaCalculada = precioVentaReal - precioCompraReal;

    const isGain = gananciaCalculada >= 0;
    const gainClass = isGain ? 'text-emerald-600 font-bold' : 'text-red-500 font-bold';
    const mediaHtml = renderMediaCell(item);
    const description = String(item.descripcion || '').trim();
    const descriptionHtml = description
      ? `
        <div class="inventory-description" title="${escapeHtml(description)}">
          <span class="inventory-description-icon"><i class="fa-solid fa-leaf text-xs"></i></span>
          <div class="inventory-description-text text-sm text-slate-600">${escapeHtml(description)}</div>
        </div>
      `
      : `<span class="text-xs text-slate-300">Sin descripción</span>`;

    let estadoHtml;
    if (ownView) {
        // Detectamos si es un estado personalizado que no sea de los predeterminados
        const estadoActual = item.estado || 'Disponible';
        const esPersonalizado = !['Disponible', 'Mantenimiento', 'Vendido'].includes(estadoActual);

        estadoHtml = `
            <div class="relative">
                <select 
                    class="appearance-none bg-slate-50 border border-slate-200 text-slate-700 text-xs rounded-full pl-3 pr-8 py-1 font-bold cursor-pointer hover:border-indigo-300 focus:outline-none focus:border-indigo-500 transition"
                    onchange="updateInventoryStatus('${escapeHtml(item.id)}', this.value)"
                >
                    <option value="Disponible" ${estadoActual === 'Disponible' ? 'selected' : ''}>🟢 Disponible</option>
                    <option value="Mantenimiento" ${estadoActual === 'Mantenimiento' ? 'selected' : ''}>🔧 Mantenimiento</option>
                    ${esPersonalizado ? `<option value="${escapeHtml(estadoActual)}" selected>📌 ${escapeHtml(estadoActual)}</option>` : ''}
                </select>
                <div class="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-500">
                    <i class="fa-solid fa-chevron-down text-[10px]"></i>
                </div>
            </div>
        `;
    } else {
        let badgeClass = 'badge-neutral';
        if(item.estado === 'Disponible') badgeClass = 'badge-success';
        if(item.estado === 'Mantenimiento') badgeClass = 'badge-warning';
        if(item.estado === 'Vendido') badgeClass = 'badge-error';
        estadoHtml = `<span class="badge ${badgeClass}">${escapeHtml(item.estado || '—')}</span>`;
    }

    const actionsHtml = ownView
    ? `
      <div class="flex justify-center gap-2">
        <button 
          onclick="openEditModal('${escapeHtml(item.id)}')"
          title="Editar producto"
          class="group relative w-11 h-11 rounded-xl 
                 bg-white border border-indigo-200
                 text-indigo-600 shadow-sm
                 transition-all duration-300
                 hover:bg-indigo-600 hover:text-white 
                 hover:shadow-indigo-500/30 hover:shadow-xl 
                 hover:-translate-y-[1px]">
          <i class="fa-solid fa-pen text-lg"></i>
        </button>

        <button 
          onclick="deleteInventoryItemWrapper('${escapeHtml(item.id)}','${escapeHtml(item.nombre || '')}')"
          title="Eliminar producto"
          class="group relative w-11 h-11 rounded-xl 
                 bg-white border border-red-300
                 text-red-600 shadow-sm
                 transition-all duration-300
                 hover:bg-red-600 hover:text-white 
                 hover:shadow-red-500/30 hover:shadow-xl 
                 hover:-translate-y-[1px] overflow-hidden">
          <span class="absolute inset-0 bg-red-500 opacity-10"></span>
          <i class="fa-solid fa-trash-can text-lg relative z-10"></i>
        </button>
      </div>`
    : `<span class="text-[10px] text-slate-400 font-medium bg-slate-50 px-2 py-1 rounded">Solo Lectura</span>`;
    return `
      <tr class="group transition-colors border-b border-slate-100 hover:bg-slate-50/50">
        <td class="px-4 py-3">${mediaHtml}</td>
        <td class="px-4 py-3">
            <div class="font-bold text-slate-800">${escapeHtml(item.nombre)}</div>
            <div class="text-[10px] text-slate-400">ID: ${item.id.substring(0,6)}...</div>
        </td>
        <td class="px-4 py-3">
            <span class="font-mono text-xs bg-slate-100 px-2 py-1 rounded text-slate-600 font-bold border border-slate-200">
                ${escapeHtml(item.placa || 'SIN PLACA')}
            </span>
        </td>
        <td class="px-4 py-3 text-slate-500">${formatCurrency(item.precio_compra || 0)}</td>
        <td class="px-4 py-3 font-semibold text-slate-700">${formatCurrency(item.precio_venta || 0)}</td>
        <td class="px-4 py-3 text-xs text-red-400">-${formatCurrency(item.max_discount_amount || 0)}</td>
        <td class="px-4 py-3 ${gainClass}">
        ${formatCurrency(gananciaCalculada)}
        </td>
        <td class="px-4 py-3">${descriptionHtml}</td>
        <td class="px-4 py-3 text-center">${estadoHtml}</td>
        <td class="px-4 py-3 text-center">${actionsHtml}</td>
      </tr>
    `;
  }).join('');
}

/* ======================================================
   HELPER: RENDER MEDIA
====================================================== */
function renderMediaCell(item) {
  const hasPhoto = getImageUrl(item);
  const hasVideo = getVideoUrl(item);
  const ownView = !viewingTenantId || String(viewingTenantId) === String(activeTenantId);
  const encodedId = encodeURIComponent(item.id || '');

  const imageHtml = hasPhoto
    ? `<img src="${escapeHtml(hasPhoto)}" class="media-thumb" onclick="openMediaModal('image', decodeURIComponent('${toInlineArg(hasPhoto)}'))" title="Ver foto">`
    : `<div class="media-placeholder group ${ownView ? 'cursor-pointer hover:bg-slate-100 transition' : ''}" ${ownView ? `onclick="openInventoryMediaModal(decodeURIComponent('${encodedId}'))"` : ''} title="${ownView ? 'Agregar imagen' : 'Sin foto'}">
         <i class="fa-regular fa-image text-slate-300 group-hover:text-indigo-400"></i>
       </div>`;

  const videoHtml = hasVideo
    ? `<button class="w-10 h-10 rounded-md bg-slate-800 text-white hover:bg-slate-700 transition" onclick="openMediaModal('video', decodeURIComponent('${toInlineArg(hasVideo)}'))" title="Ver video">
         <i class="fa-solid fa-play"></i>
       </button>`
    : `<div class="media-placeholder group ${ownView ? 'cursor-pointer hover:bg-slate-100 transition' : ''}" ${ownView ? `onclick="openInventoryMediaModal(decodeURIComponent('${encodedId}'))"` : ''} title="${ownView ? 'Agregar video' : 'Sin video'}">
         <i class="fa-solid fa-video text-slate-300 group-hover:text-pink-400"></i>
       </div>`;

  const manageButton = ownView
    ? `<button class="media-manage-btn" onclick="openInventoryMediaModal(decodeURIComponent('${encodedId}'))" title="Gestionar multimedia">
         <i class="fa-solid fa-pen-to-square"></i>
       </button>`
    : '';

  return `
    <div class="flex items-center gap-2 justify-center md:justify-start">
      ${imageHtml}
      ${videoHtml}
      ${manageButton}
    </div>
  `;
}

function toInlineArg(value) {
  return encodeURIComponent(String(value || ''));
}

function getImageUrl(item) {
  return item?.media_image_url || item?.image_url || item?.photo_url || null;
}

function getVideoUrl(item) {
  return item?.media_video_url || item?.video_url || null;
}

function getItemFromCurrentData(id) {
  const fromLocal = (inventory || []).find((i) => i.id === id);
  if (fromLocal) return fromLocal;
  return (displayedInventory || []).find((i) => i.id === id) || null;
}

function formatBytes(size) {
  const bytes = Number(size || 0);
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / (1024 ** i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function sanitizePathSegment(value, fallback = 'na') {
  const clean = String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/gi, '-');
  return clean || fallback;
}

function sanitizeFileName(fileName) {
  return String(fileName || 'archivo')
    .replace(/[^\w.\-]/g, '_')
    .replace(/_+/g, '_')
    .slice(-120);
}

function buildStoragePath(itemId, mediaType, fileName) {
  const tenantSegment = sanitizePathSegment(activeTenantId, 'tenant');
  const branchSegment = sanitizePathSegment(currentBranchId || 'global', 'global');
  const itemSegment = sanitizePathSegment(itemId, 'item');
  const safeName = sanitizeFileName(fileName);
  const timeKey = getColombiaNow().timestampMs;
  return `tenants/${tenantSegment}/branches/${branchSegment}/inventario/${itemSegment}/${mediaType}/${timeKey}_${safeName}`;
}

function setMediaModalBusy(isBusy) {
  const submitBtn = document.getElementById('inventory-media-submit-btn');
  const imageInput = document.getElementById('inventory-media-image');
  const videoInput = document.getElementById('inventory-media-video');
  const removeImageBtn = document.getElementById('inventory-media-remove-image-btn');
  const removeVideoBtn = document.getElementById('inventory-media-remove-video-btn');
  if (submitBtn) {
    submitBtn.disabled = isBusy;
    submitBtn.classList.toggle('opacity-60', isBusy);
    submitBtn.classList.toggle('cursor-not-allowed', isBusy);
  }
  if (imageInput) imageInput.disabled = isBusy;
  if (videoInput) videoInput.disabled = isBusy;
  if (removeImageBtn && !removeImageBtn.dataset.noMedia) removeImageBtn.disabled = isBusy;
  if (removeVideoBtn && !removeVideoBtn.dataset.noMedia) removeVideoBtn.disabled = isBusy;
}

function setMediaProgress(percent, text, isError = false) {
  const bar = document.getElementById('inventory-media-progress-bar');
  const label = document.getElementById('inventory-media-progress-text');
  const normalized = Math.max(0, Math.min(100, Number(percent || 0)));
  if (bar) bar.style.width = `${normalized}%`;
  if (label) {
    label.textContent = text || '';
    label.classList.toggle('text-red-500', !!isError);
    label.classList.toggle('text-slate-500', !isError);
  }
}

function replaceFileExtension(fileName, extension) {
  const base = String(fileName || 'archivo')
    .replace(/\.[^.]+$/, '')
    .replace(/[^\w.\-]/g, '_')
    .slice(0, 100) || 'archivo';
  return `${base}.${extension}`;
}

function blobToFile(blob, fileName, fallbackType) {
  return new File([blob], fileName, {
    type: blob.type || fallbackType,
    lastModified: Date.now()
  });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('No se pudo comprimir la imagen.'));
    }, type, quality);
  });
}

async function compressImageToLimit(file, onProgress) {
  if (!file || file.size <= TARGET_MEDIA_BYTES) return file;

  onProgress?.(5, 'Preparando imagen para comprimir...');
  const imageBitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) {
    imageBitmap.close?.();
    throw new Error('Tu navegador no permite comprimir esta imagen.');
  }

  let maxDimension = 2560;
  let quality = 0.86;

  try {
    for (let attempt = 1; attempt <= 12; attempt += 1) {
      const scale = Math.min(1, maxDimension / Math.max(imageBitmap.width, imageBitmap.height));
      canvas.width = Math.max(1, Math.round(imageBitmap.width * scale));
      canvas.height = Math.max(1, Math.round(imageBitmap.height * scale));
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(imageBitmap, 0, 0, canvas.width, canvas.height);

      const blob = await canvasToBlob(canvas, 'image/jpeg', quality);
      onProgress?.(
        Math.min(95, 10 + attempt * 7),
        `Comprimiendo imagen... ${formatBytes(blob.size)}`
      );

      if (blob.size <= TARGET_MEDIA_BYTES) {
        return blobToFile(blob, replaceFileExtension(file.name, 'jpg'), 'image/jpeg');
      }

      if (quality > 0.55) {
        quality -= 0.08;
      } else {
        maxDimension = Math.floor(maxDimension * 0.78);
        quality = 0.72;
      }
    }
  } finally {
    imageBitmap.close?.();
  }

  throw new Error('No se pudo comprimir la imagen por debajo de 16MB.');
}

function getVideoDuration(file) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.removeAttribute('src');
      video.load();
    };

    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      const duration = Number(video.duration || 0);
      cleanup();
      if (Number.isFinite(duration) && duration > 0) {
        resolve(duration);
      } else {
        reject(new Error('No se pudo leer la duración del video.'));
      }
    };
    video.onerror = () => {
      cleanup();
      reject(new Error('No se pudo leer el video seleccionado.'));
    };
    video.src = url;
  });
}

function validatePlayableVideoBlob(blob) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(blob);
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error('El video comprimido no se pudo validar para reproduccion.'));
    }, 12000);
    const cleanup = () => {
      window.clearTimeout(timeout);
      URL.revokeObjectURL(url);
      video.removeAttribute('src');
      video.load();
    };

    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = () => {
      const duration = Number(video.duration || 0);
      const width = Number(video.videoWidth || 0);
      const height = Number(video.videoHeight || 0);
      cleanup();

      if (Number.isFinite(duration) && duration > 0 && width > 0 && height > 0) {
        resolve({ duration, width, height });
        return;
      }

      reject(new Error('El video comprimido quedo sin metadata valida.'));
    };
    video.onerror = () => {
      cleanup();
      reject(new Error('El video comprimido no es reproducible en el navegador.'));
    };
    video.src = url;
  });
}

async function getLoadedFFmpeg(onProgress) {
  if (ffmpegInstance) return ffmpegInstance;
  if (!ffmpegLoadPromise) {
    ffmpegLoadPromise = (async () => {
      const [{ FFmpeg }, { toBlobURL }] = await Promise.all([
        import('@ffmpeg/ffmpeg'),
        import('@ffmpeg/util')
      ]);

      const ffmpeg = new FFmpeg();
      ffmpeg.on('progress', ({ progress }) => {
        if (ffmpegProgressCallback) {
          ffmpegProgressCallback(Math.max(0, Math.min(1, Number(progress || 0))));
        }
      });
      ffmpeg.on('log', ({ message }) => {
        if (message) console.debug('[ffmpeg]', message);
      });

      onProgress?.(5, 'Cargando motor FFmpeg...');
      let lastLoadError = null;

      for (let index = 0; index < FFMPEG_CORE_BASE_URLS.length; index += 1) {
        const { baseURL, mode } = FFMPEG_CORE_BASE_URLS[index];
        try {
          onProgress?.(5 + index * 2, `Cargando motor FFmpeg... fuente ${index + 1}`);
          const corePath = `${baseURL}/ffmpeg-core.js`;
          const wasmPath = `${baseURL}/ffmpeg-core.wasm`;
          await ffmpeg.load({
            coreURL: mode === 'same-origin'
              ? corePath
              : await toBlobURL(corePath, 'text/javascript'),
            wasmURL: mode === 'same-origin'
              ? wasmPath
              : await toBlobURL(wasmPath, 'application/wasm')
          });
          lastLoadError = null;
          break;
        } catch (error) {
          lastLoadError = error;
          console.warn('No se pudo cargar FFmpeg desde:', baseURL, error?.message || error);
        }
      }

      if (lastLoadError) {
        throw lastLoadError;
      }

      ffmpegInstance = ffmpeg;
      return ffmpeg;
    })().catch((error) => {
      ffmpegLoadPromise = null;
      throw error;
    });
  }

  return ffmpegLoadPromise;
}

function getVideoBitratePlan(durationSeconds, targetBytes) {
  const audioKbps = durationSeconds < 8 ? 96 : 64;
  const totalKbps = Math.floor((targetBytes * 8) / durationSeconds / 1000);
  const videoKbps = Math.floor(totalKbps - audioKbps - 24);

  if (videoKbps < 150) {
    throw new Error('El video es demasiado largo para quedar por debajo de 16MB con calidad aceptable.');
  }

  return {
    audioKbps,
    videoKbps: Math.min(videoKbps, 2200)
  };
}

async function runVideoCompressionPass(ffmpeg, inputName, outputName, plan) {
  await ffmpeg.exec([
    '-i', inputName,
    '-map', '0:v:0',
    '-map', '0:a?',
    '-sn',
    '-dn',
    '-vf', 'scale=trunc(min(1280,iw)/2)*2:-2,format=yuv420p',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-profile:v', 'baseline',
    '-level:v', '3.1',
    '-pix_fmt', 'yuv420p',
    '-tag:v', 'avc1',
    '-b:v', `${plan.videoKbps}k`,
    '-maxrate', `${plan.videoKbps}k`,
    '-bufsize', `${Math.max(plan.videoKbps * 2, 300)}k`,
    '-c:a', 'aac',
    '-b:a', `${plan.audioKbps}k`,
    '-ar', '44100',
    '-ac', '2',
    '-movflags', '+faststart',
    '-f', 'mp4',
    '-y',
    outputName
  ]);
}

async function compressVideoToLimit(file, onProgress) {
  if (!file || file.size <= TARGET_MEDIA_BYTES) return file;

  const [{ fetchFile }, ffmpeg, durationSeconds] = await Promise.all([
    import('@ffmpeg/util'),
    getLoadedFFmpeg(onProgress),
    getVideoDuration(file)
  ]);

  const inputName = `input_${Date.now()}.mp4`;
  const outputName = `output_${Date.now()}.mp4`;
  let plan = getVideoBitratePlan(durationSeconds, TARGET_MEDIA_HEADROOM_BYTES);

  onProgress?.(8, 'Preparando video para comprimir...');
  await ffmpeg.writeFile(inputName, await fetchFile(file));

  try {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      ffmpegProgressCallback = (progress) => {
        onProgress?.(
          Math.min(95, 10 + progress * 82),
          `Comprimiendo video... intento ${attempt}`
        );
      };

      await runVideoCompressionPass(ffmpeg, inputName, outputName, plan);
      const data = await ffmpeg.readFile(outputName);
      const blob = new Blob([data], { type: ALLOWED_VIDEO_MIME });

      onProgress?.(95, `Video comprimido: ${formatBytes(blob.size)}`);
      if (blob.size <= TARGET_MEDIA_BYTES) {
        await validatePlayableVideoBlob(blob);
        return blobToFile(blob, replaceFileExtension(file.name, 'mp4'), ALLOWED_VIDEO_MIME);
      }

      plan = {
        ...plan,
        videoKbps: Math.floor(plan.videoKbps * Math.max(0.55, (TARGET_MEDIA_HEADROOM_BYTES / blob.size) * 0.92))
      };

      if (plan.videoKbps < 150) break;
      await ffmpeg.deleteFile(outputName).catch(() => null);
    }
  } finally {
    ffmpegProgressCallback = null;
    await ffmpeg.deleteFile(inputName).catch(() => null);
    await ffmpeg.deleteFile(outputName).catch(() => null);
  }

  throw new Error('No se pudo comprimir el video por debajo de 16MB.');
}

async function prepareMediaFileForUpload(file, type, onProgress) {
  validateMediaFile(file, type);
  if (type === 'image') return compressImageToLimit(file, onProgress);
  try {
    return await compressVideoToLimit(file, onProgress);
  } catch (error) {
    if (isFFmpegLoadError(error) && file.size <= TARGET_MEDIA_BYTES) {
      console.warn('FFmpeg no cargó; se sube el MP4 original porque ya cumple el límite:', error?.message || error);
      onProgress?.(95, 'Video listo para subir sin compresión.');
      return file;
    }

    if (isFFmpegLoadError(error)) {
      throw new Error('No se pudo cargar el compresor de video. Intenta de nuevo o sube un MP4 menor a 16MB.');
    }

    throw error;
  }
}

function assertOwnViewForMedia() {
  const ownView = !viewingTenantId || String(viewingTenantId) === String(activeTenantId);
  if (!ownView) {
    alert('Solo puedes gestionar multimedia en tu inventario.');
    return false;
  }
  return true;
}

function validateMediaFile(file, type) {
  if (!file) return;
  if (type === 'image') {
    if (!String(file.type || '').startsWith('image/')) {
      throw new Error('La imagen debe tener formato válido de imagen.');
    }
    if (file.size > MAX_IMAGE_SOURCE_BYTES) {
      throw new Error('La imagen supera el límite de entrada de 50MB.');
    }
    return;
  }

  const isMp4ByType = file.type === ALLOWED_VIDEO_MIME;
  const isMp4ByName = /\.mp4$/i.test(file.name || '');
  if (!isMp4ByType && !isMp4ByName) {
    throw new Error('El video debe ser MP4.');
  }
  if (file.size > MAX_VIDEO_SOURCE_BYTES) {
    throw new Error('El video supera el límite de entrada de 300MB.');
  }
}

function deleteStoragePath(path) {
  if (!path) return Promise.resolve();
  return deleteObject(ref(storage, path));
}

function uploadInventoryFile(file, itemId, type, onProgress) {
  const path = buildStoragePath(itemId, type, file.name);
  const objectRef = ref(storage, path);
  const metadata = {
    contentType: file.type || (type === 'video' ? ALLOWED_VIDEO_MIME : undefined),
    customMetadata: {
      tenantId: String(activeTenantId || ''),
      branchId: String(currentBranchId || 'global'),
      inventoryId: String(itemId || ''),
      mediaType: type
    }
  };

  return new Promise((resolve, reject) => {
    const task = uploadBytesResumable(objectRef, file, metadata);
    task.on(
      'state_changed',
      (snapshot) => {
        const percent = snapshot.totalBytes
          ? (snapshot.bytesTransferred / snapshot.totalBytes) * 100
          : 0;
        if (onProgress) onProgress(percent);
      },
      (error) => reject(error),
      async () => {
        try {
          const url = await getDownloadURL(task.snapshot.ref);
          resolve({
            url,
            path,
            name: file.name,
            size: Number(file.size || 0)
          });
        } catch (err) {
          reject(err);
        }
      }
    );
  });
}

function setRemovalButtonState(type, checked, hasMedia) {
  const checkbox = document.getElementById(`inventory-media-remove-${type}`);
  const button = document.getElementById(`inventory-media-remove-${type}-btn`);
  if (checkbox) checkbox.checked = Boolean(checked);
  if (!button) return;

  button.disabled = !hasMedia;
  button.dataset.noMedia = hasMedia ? '' : 'true';
  button.classList.toggle('bg-red-600', checked);
  button.classList.toggle('text-white', checked);
  button.classList.toggle('border-red-600', checked);
  button.classList.toggle('shadow-md', checked);
  button.innerHTML = checked
    ? `<i class="fa-solid fa-rotate-left mr-1"></i> No eliminar ${type === 'image' ? 'imagen' : 'video'}`
    : `<i class="fa-solid fa-trash-can mr-1"></i> Eliminar ${type === 'image' ? 'imagen' : 'video'}`;
}

function toggleInventoryMediaRemoval(type) {
  const checkbox = document.getElementById(`inventory-media-remove-${type}`);
  const item = getItemFromCurrentData(editingMediaItemId);
  const hasMedia = type === 'image' ? Boolean(getImageUrl(item)) : Boolean(getVideoUrl(item));
  if (!checkbox || !hasMedia) return;

  setRemovalButtonState(type, !checkbox.checked, hasMedia);
  setMediaProgress(0, checkbox.checked
    ? `Se eliminará ${type === 'image' ? 'la imagen' : 'el video'} al guardar.`
    : `Eliminación de ${type === 'image' ? 'imagen' : 'video'} cancelada.`);
}

function openInventoryMediaModal(id) {
  if (!assertOwnViewForMedia()) return;
  const item = getItemFromCurrentData(id);
  if (!item) {
    alert('No se encontró el producto para gestionar multimedia.');
    return;
  }

  editingMediaItemId = item.id;

  const modal = document.getElementById('inventory-media-modal');
  const idInput = document.getElementById('inventory-media-id');
  const itemLabel = document.getElementById('inventory-media-item-label');
  const currentImage = document.getElementById('inventory-media-image-current');
  const currentVideo = document.getElementById('inventory-media-video-current');
  const imageInput = document.getElementById('inventory-media-image');
  const videoInput = document.getElementById('inventory-media-video');
  const hasImage = Boolean(getImageUrl(item));
  const hasVideo = Boolean(getVideoUrl(item));

  if (idInput) idInput.value = item.id;
  if (itemLabel) {
    itemLabel.textContent = `${item.nombre || 'Producto'}${item.placa ? ` (${item.placa})` : ''}`;
  }

  const currentImageText = item?.media_image_name
    ? `${item.media_image_name} (${formatBytes(item.media_image_size)})`
    : 'Sin imagen';
  const currentVideoText = item?.media_video_name
    ? `${item.media_video_name} (${formatBytes(item.media_video_size)})`
    : 'Sin video';

  if (currentImage) currentImage.textContent = `Actual: ${currentImageText}`;
  if (currentVideo) currentVideo.textContent = `Actual: ${currentVideoText}`;

  if (imageInput) imageInput.value = '';
  if (videoInput) videoInput.value = '';
  setRemovalButtonState('image', false, hasImage);
  setRemovalButtonState('video', false, hasVideo);

  setMediaProgress(0, 'Selecciona imagen o video para guardar.');
  setMediaModalBusy(false);

  if (modal) modal.classList.remove('hidden');
}

function closeInventoryMediaModal() {
  editingMediaItemId = null;
  const modal = document.getElementById('inventory-media-modal');
  const form = document.getElementById('form-inventory-media');
  if (modal) modal.classList.add('hidden');
  if (form) form.reset();
  setRemovalButtonState('image', false, false);
  setRemovalButtonState('video', false, false);
  setMediaProgress(0, 'Selecciona imagen o video para guardar.');
  setMediaModalBusy(false);
}

async function saveInventoryMedia(event) {
  event.preventDefault();
  if (!assertOwnViewForMedia()) return;

  const itemId = editingMediaItemId || document.getElementById('inventory-media-id')?.value;
  if (!itemId) {
    alert('No se encontró el producto para guardar multimedia.');
    return;
  }

  const colRef = getCollectionRef('inventario');
  if (!colRef) {
    alert('No hay tenant seleccionado.');
    return;
  }

  const imageInput = document.getElementById('inventory-media-image');
  const videoInput = document.getElementById('inventory-media-video');
  const removeImageInput = document.getElementById('inventory-media-remove-image');
  const removeVideoInput = document.getElementById('inventory-media-remove-video');
  const imageFile = imageInput?.files?.[0] || null;
  const videoFile = videoInput?.files?.[0] || null;
  const removeImage = Boolean(removeImageInput?.checked);
  const removeVideo = Boolean(removeVideoInput?.checked);

  if (!imageFile && !videoFile && !removeImage && !removeVideo) {
    alert('Selecciona una imagen/video o marca un archivo actual para eliminar.');
    return;
  }

  if (imageFile && removeImage) {
    alert('Elige solo una acción para la imagen: subir una nueva o eliminar la actual.');
    return;
  }

  if (videoFile && removeVideo) {
    alert('Elige solo una acción para el video: subir uno nuevo o eliminar el actual.');
    return;
  }

  try {
    if (imageFile) validateMediaFile(imageFile, 'image');
    if (videoFile) validateMediaFile(videoFile, 'video');
  } catch (validationError) {
    setMediaProgress(0, validationError.message, true);
    alert(validationError.message);
    return;
  }

  const docRef = doc(colRef, itemId);
  const itemBefore = getItemFromCurrentData(itemId) || {};
  const uploadedNewPaths = [];
  const oldPathsToDelete = [];
  const nowColombia = getColombiaNow();
  const updatePayload = {
    updated_at: nowColombia.timestampMs,
    updatedAtColombia: nowColombia
  };

  setMediaModalBusy(true);
  setMediaProgress(0, 'Iniciando carga...');

  try {
    let uploadImageFile = imageFile;
    let uploadVideoFile = videoFile;

    if (imageFile) {
      uploadImageFile = await prepareMediaFileForUpload(imageFile, 'image', (pct, text) => {
        setMediaProgress(pct, text || `Comprimiendo imagen... ${Math.round(pct)}%`);
      });
    }

    if (videoFile) {
      uploadVideoFile = await prepareMediaFileForUpload(videoFile, 'video', (pct, text) => {
        setMediaProgress(pct, text || `Comprimiendo video... ${Math.round(pct)}%`);
      });
    }

    if (imageFile) {
      setMediaProgress(0, 'Subiendo imagen...');
      const imageUpload = await uploadInventoryFile(uploadImageFile, itemId, 'image', (pct) => {
        setMediaProgress(pct, `Subiendo imagen... ${Math.round(pct)}%`);
      });
      uploadedNewPaths.push(imageUpload.path);
      updatePayload.media_image_url = imageUpload.url;
      updatePayload.media_image_path = imageUpload.path;
      updatePayload.media_image_name = imageUpload.name;
      updatePayload.media_image_size = imageUpload.size;
      if (itemBefore.media_image_path && itemBefore.media_image_path !== imageUpload.path) {
        oldPathsToDelete.push(itemBefore.media_image_path);
      }
    }

    if (removeImage) {
      updatePayload.media_image_url = deleteField();
      updatePayload.media_image_path = deleteField();
      updatePayload.media_image_name = deleteField();
      updatePayload.media_image_size = deleteField();
      updatePayload.image_url = deleteField();
      updatePayload.photo_url = deleteField();
      if (itemBefore.media_image_path) oldPathsToDelete.push(itemBefore.media_image_path);
      setMediaProgress(15, 'Imagen marcada para eliminar...');
    }

    if (videoFile) {
      setMediaProgress(0, 'Subiendo video...');
      const videoUpload = await uploadInventoryFile(uploadVideoFile, itemId, 'video', (pct) => {
        setMediaProgress(pct, `Subiendo video... ${Math.round(pct)}%`);
      });
      uploadedNewPaths.push(videoUpload.path);
      updatePayload.media_video_url = videoUpload.url;
      updatePayload.media_video_path = videoUpload.path;
      updatePayload.media_video_name = videoUpload.name;
      updatePayload.media_video_size = videoUpload.size;
      if (itemBefore.media_video_path && itemBefore.media_video_path !== videoUpload.path) {
        oldPathsToDelete.push(itemBefore.media_video_path);
      }
    }

    if (removeVideo) {
      updatePayload.media_video_url = deleteField();
      updatePayload.media_video_path = deleteField();
      updatePayload.media_video_name = deleteField();
      updatePayload.media_video_size = deleteField();
      updatePayload.video_url = deleteField();
      if (itemBefore.media_video_path) oldPathsToDelete.push(itemBefore.media_video_path);
      setMediaProgress(30, 'Video marcado para eliminar...');
    }

    await updateDoc(docRef, updatePayload);
    await syncAgentInventoryItem(itemId);
    setMediaProgress(100, 'Guardando en inventario...');

    const deletionWarnings = [];
    const uniqueOldPaths = [...new Set(oldPathsToDelete)];
    for (const oldPath of uniqueOldPaths) {
      try {
        await deleteStoragePath(oldPath);
      } catch (deleteErr) {
        console.warn('No se pudo borrar archivo anterior:', oldPath, deleteErr);
        deletionWarnings.push(oldPath);
      }
    }

    closeInventoryMediaModal();
    await loadInventoryForView();
    if (deletionWarnings.length) {
      alert('Multimedia guardada, pero no se pudo borrar uno de los archivos anteriores en Storage.');
      return;
    }
    alert(removeImage || removeVideo ? 'Multimedia actualizada correctamente.' : 'Multimedia guardada correctamente ✅');
  } catch (error) {
    console.error('Error guardando multimedia:', error);
    const errorMessage = String(error?.message || 'No se pudo guardar la multimedia.');
    setMediaProgress(0, errorMessage, true);

    for (const newPath of uploadedNewPaths) {
      try {
        await deleteStoragePath(newPath);
      } catch (cleanupErr) {
        console.warn('No se pudo limpiar archivo parcial:', newPath, cleanupErr);
      }
    }

    alert(errorMessage);
  } finally {
    setMediaModalBusy(false);
  }
}


/* ======================================================
   LÓGICA DEL MODAL DE EDICIÓN
====================================================== */
function openEditModal(id) {
  // Buscar el producto en el array actual
  const item = inventory.find(i => i.id === id);
  if (!item) {
    alert("No se encontró el producto.");
    return;
  }

  // Llenar los campos del modal
  document.getElementById('edit-id').value = item.id;
  document.getElementById('edit-nombre').value = item.nombre || '';
  document.getElementById('edit-placa').value = item.placa || '';
  document.getElementById('edit-compra').value = item.precio_compra || 0;
  document.getElementById('edit-venta').value = item.precio_venta || 0;
  document.getElementById('edit-desc').value = item.max_discount_amount || 0;
  document.getElementById('edit-estado').value = item.estado || 'Disponible';
  document.getElementById('edit-descripcion').value = item.descripcion || '';

  // Mostrar el modal
  const modal = document.getElementById('edit-inventory-modal');
  modal.classList.remove('hidden');
}

function closeEditModal() {
  const modal = document.getElementById('edit-inventory-modal');
  if (modal) {
    modal.classList.add('hidden');
  }
  
  const form = document.getElementById('form-edit-inventory');
  if (form) {
    form.reset();
  }
}

async function saveInventoryEdit(e) {
  e.preventDefault(); // Evitar que la página recargue

  const id = document.getElementById('edit-id').value;
  const nombre = document.getElementById('edit-nombre').value.trim();
  const placa = document.getElementById('edit-placa').value.trim().toUpperCase();
  const compra = parseFloat(document.getElementById('edit-compra').value) || 0;
  const venta = parseFloat(document.getElementById('edit-venta').value) || 0;
  const descuento = parseFloat(document.getElementById('edit-desc').value) || 0;
  const estado = document.getElementById('edit-estado').value.trim() || 'Disponible';
  const descripcion = document.getElementById('edit-descripcion').value.trim();
  const nowColombia = getColombiaNow();

  try {
    const colRef = getCollectionRef('inventario');
    if (!colRef) return alert('No hay tenant seleccionado.');
    
    const docRef = doc(colRef, id);

    // Actualizar en Firebase
    await updateDoc(docRef, {
      nombre: nombre,
      placa: placa,
      precio_compra: compra,
      precio_venta: venta,
      max_discount_amount: descuento,
      estado: estado,
      descripcion: descripcion || null,
      ganancia_potencial: venta - compra, // Se recalcula por si cambiaron los precios
      updated_at: nowColombia.timestampMs,
      updatedAtColombia: nowColombia
    });

    await syncAgentInventoryItem(id);

    // Cerrar modal y avisar
    closeEditModal();
    alert('Producto actualizado correctamente ✅');
    
    // Recargar la tabla (tu listener de Firebase debería actualizar el arreglo automáticamente, 
    // pero forzamos el renderizado por seguridad)
    await loadInventoryForView();

  } catch (error) {
    console.error('Error actualizando inventario:', error);
    alert('Hubo un error al guardar los cambios.');
  }
}

/* ======================================================
   MODAL LIGHTBOX
====================================================== */
function openMediaModal(type, url) {
    const modal = document.getElementById('media-lightbox');
    const content = document.getElementById('media-lightbox-content');
    if (!modal || !content) return;

    content.innerHTML = '';
    if (type === 'image') {
        content.innerHTML = `<img src="${url}" class="max-w-full max-h-[80vh] rounded shadow-2xl">`;
    } else if (type === 'video') {
        content.innerHTML = `
            <video controls autoplay class="max-w-full max-h-[80vh] rounded shadow-2xl">
                <source src="${url}" type="video/mp4">
                Tu navegador no soporta video.
            </video>
        `;
    }
    modal.classList.add('active');
}

function closeMediaModal(e) {
    if (e.target.id === 'media-lightbox' || e.target.tagName === 'BUTTON' || e.target.tagName === 'I') {
        const modal = document.getElementById('media-lightbox');
        const content = document.getElementById('media-lightbox-content');
        if (modal) modal.classList.remove('active');
        if (content) content.innerHTML = '';
    }
}

/* ======================================================
   FUNCIONES CRUD LOCALES
====================================================== */
function deleteInventoryItemWrapper(id, name) {
  const ownView = !viewingTenantId || String(viewingTenantId) === String(activeTenantId);
  if (!ownView) {
    alert("No tienes permisos para eliminar ítems de otra empresa/sede.");
    return;
  }
  showGeneralConfirmModal(
    id,
    name,
    'Producto',
    deleteInventoryItem,
    'Este producto será eliminado permanentemente.'
  );
}

async function deleteInventoryItem(id) {
  try {
    const colRef = getCollectionRef('inventario');
    if (!colRef) return alert('No hay tenant seleccionado.');

    // 1) Cargamos el documento del item para obtener placa / id utiles para buscar transacciones
    const itemRef = doc(colRef, id);
    const itemSnap = await getDoc(itemRef);
    const itemData = itemSnap && itemSnap.exists ? itemSnap.data() : null;

    // 2) Si existe item, buscamos transacciones relacionadas y llamamos a anularTransaccion por cada una
    if (itemData) {
      // campos a utilizar
      const placa = itemData.placa || null;
      const relatedId = itemData.id || id || null;

      // posibles nombres de la colección de transacciones (ajusta si en tu proyecto se llama distinto)
      const possibleTxCollections = ['transacciones', 'transactions', 'balance']; 

      for (const collName of possibleTxCollections) {
        const txColRef = getCollectionRef(collName);
        if (!txColRef) continue; // colección no existe en este tenant

        // buscaremos por relation_plate (placa) y por related_id
        const queries = [];

        if (placa) queries.push(query(txColRef, where('relation_plate', '==', placa), /* opcional limit */));
        if (relatedId) queries.push(query(txColRef, where('related_id', '==', relatedId), /* opcional limit */));

        for (const q of queries) {
          try {
            const txSnap = await getDocs(q);
            if (!txSnap || txSnap.empty) continue;
            // Revertir cada transacción encontrada
            for (const docTx of txSnap.docs) {
              const txId = docTx.id;
              try {
                // anularTransaccion está diseñada para recibir el transactionId.
                // Esperamos para asegurarnos que las reversas terminen antes de borrar inventario.
                await anularTransaccion(txId);
              } catch (innerErr) {
                console.error('Error anulando transacción', txId, innerErr);
                // No abortamos; registramos y seguimos con las demás.
              }
            }
          } catch (qErr) {
            console.error('Error consultando transacciones en', collName, qErr);
          }
        }
      }
    }

    // 3) Finalmente eliminamos el documento de inventario (igual que antes)
    await deleteDoc(itemRef);
    await syncAgentInventoryItem(id);

    // 4) Refrescar vista
    await loadInventoryForView();

  } catch (e) {
    console.error('Error deleting inventory item', e);
    alert('Error eliminando producto');
  }
}

async function updateInventoryStatus(id, newStatus) {
  try {
    const ownView = !viewingTenantId || String(viewingTenantId) === String(activeTenantId);
    if (!ownView) {
      alert("No tienes permisos para modificar ítems de otra empresa/sede.");
      await loadInventoryForView();
      return;
    }
    const refCol = getCollectionRef('inventario');
    if (!refCol) return alert('No hay tenant seleccionado.');
    const ref = doc(refCol, id);
    const nowColombia = getColombiaNow();
    await updateDoc(ref, {
      estado: newStatus,
      updated_at: nowColombia.timestampMs,
      updatedAtColombia: nowColombia
    });
    await syncAgentInventoryItem(id);
    await loadInventoryForView();
  } catch (e) {
    console.error('Error actualizando estado', e);
    alert('No se pudo actualizar el estado');
  }
}

/* ======================================================
   LÓGICA BACKEND / TENANTS
====================================================== */
async function getAuthToken() {
  try {
    if (auth && auth.currentUser && typeof auth.currentUser.getIdToken === 'function') {
      try { const t = await auth.currentUser.getIdToken(); if (t) return t; } catch (e) {}
    }
    if (exportedCurrentUser && typeof exportedCurrentUser.getIdToken === 'function') {
      try { const t = await exportedCurrentUser.getIdToken(); if (t) return t; } catch (e) {}
    }
    return null;
  } catch (e) { return null; }
}

const API_BASE = window.API_BASE || 'http://localhost:3000/api/v1';

async function fetchPublicTenants() {
  try {
    const token = await getAuthToken();
    if (!token) return [];
    const res = await fetch(`${API_BASE}/public/tenants`, {
      headers: { Authorization: `Bearer ${token}`, 'Accept': 'application/json', 'x-tenant-id': 'system' }
    });
    if (!res.ok) throw await res.json();
    const json = await res.json();
    return json.data || [];
  } catch (e) { console.error(e); return []; }
}

async function fetchBranchesForTenant(tenantId) {
  try {
    if (!tenantId) return [];
    const token = await getAuthToken();
    if (!token) return [];
    const res = await fetch(`${API_BASE}/public/tenants/${encodeURIComponent(tenantId)}/branches`, {
      headers: { Authorization: `Bearer ${token}`, 'Accept': 'application/json', 'x-tenant-id': tenantId }
    });
    if (!res.ok) throw await res.json();
    const json = await res.json();
    return json.data || [];
  } catch (e) { console.error(e); return []; }
}

async function loadInventoryForView() {
  try {
    const tenant = viewingTenantId || null;
    const branch = viewingBranchId || null;

    if (tenant && String(tenant) !== String(activeTenantId)) {
      const params = new URLSearchParams();
      params.set('tenantId', tenant);
      if (branch) params.set('branchId', branch);
      const token = await getAuthToken();
      if (!token) { displayedInventory = []; renderInventoryTableRows(); return; }
      
      const resp = await fetch(`${API_BASE}/public/inventory?${params.toString()}`, {
        method: 'GET',
        headers: { 'Accept': 'application/json', Authorization: `Bearer ${token}`, 'x-tenant-id': tenant }
      });

      if (!resp.ok) { displayedInventory = []; renderInventoryTableRows(); return; }
      const json = await resp.json();
      displayedInventory = Array.isArray(json.data) ? json.data : [];
      renderInventoryTableRows();
      return;
    }

    displayedInventory = [];
    renderInventoryTableRows();
  } catch (e) {
    console.error('Error cargando inventario:', e);
    displayedInventory = [];
    renderInventoryTableRows();
  }
}

async function initPublicInventorySelectors() {
  try {
    const tenantSelect = document.getElementById('select-tenant');
    const branchSelect = document.getElementById('select-branch');
    const btnView = document.getElementById('btn-reset-view');
    const btnOwn = document.getElementById('btn-reset-own-view');

    if (!tenantSelect || !branchSelect || !btnView || !btnOwn) return;

    availableTenants = await fetchPublicTenants();
    tenantSelect.innerHTML = `<option value="">-- Mi Empresa (Local) --</option>`;
    availableTenants.forEach(t => {
      tenantSelect.innerHTML += `<option value="${escapeHtml(t.id)}">${escapeHtml(t.id)}</option>`;
    });

    tenantSelect.addEventListener('change', async (e) => {
      const tId = e.target.value || null;
      branchSelect.innerHTML = `<option value="">-- Sede (Todas) --</option>`;
      if (!tId) return;
      const branches = await fetchBranchesForTenant(tId);
      branches.forEach(b => {
        branchSelect.innerHTML += `<option value="${escapeHtml(b.id)}">${escapeHtml(b.name || b.id)}</option>`;
      });
    });

    btnView.addEventListener('click', async () => {
      viewingTenantId = tenantSelect.value || null;
      viewingBranchId = branchSelect.value || null;
      await loadInventoryForView();
    });

    btnOwn.addEventListener('click', async () => {
      viewingTenantId = null;
      viewingBranchId = null;
      tenantSelect.value = '';
      branchSelect.innerHTML = `<option value="">-- Todas las Sedes --</option>`;
      await loadInventoryForView();
    });

  } catch (e) { console.error(e); }
}

export { loadInventoryForView };
