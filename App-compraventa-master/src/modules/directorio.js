// js/modules/directorio.js
import { addDoc, setDoc, doc, deleteDoc, getDoc, collection, getDocs } from 'firebase/firestore';
import { db, activeTenantId } from '../config/firebase.js';
import { getCollectionRef } from '../services/listeners.js';
import { clients, providers,  others, getComisionesPendientes, tramitador } from '../store/store.js';
import { renderHeader, escapeHtml } from '../utils/utils.js';
import { saveCommissionConfig } from '../services/commissionService.js';
import { getEmployees } from '../services/admin.service.js';
import { getColombiaNow } from '../utils/colombiaTime.js';

// --- ESTADO LOCAL ---
let activeTab = 'clientes'; // 'clientes' | 'proveedores' | 'tramitadores' | 'empleados' | 'otros'
let searchTerm = '';
let editingContact = null; // objeto cuando se edita
let employeesCache = [];

// Clase de mapeo para estilos de pestañas
const TAB_CLASS_MAP = {
  clientes: 'tab-active-emerald',
  proveedores: 'tab-active-teal',
  tramitadores: 'tab-active-purple',
  empleados: 'tab-active-blue',
  otros: 'tab-active-slate'
};

// =========================================================
// 1. FUNCIÓN PRINCIPAL DE RENDERIZADO
// =========================================================
export async function renderDirectorio() {
  const contentDiv = document.getElementById('content');
  if (!contentDiv) return;
  contentDiv.innerHTML = '';

  // Header
  contentDiv.insertAdjacentHTML('beforeend', await renderHeader('Directorio', 'Gestión de Contactos'));

  // Contenedor Principal
  const mainContainer = document.createElement('div');
  mainContainer.className = "bg-white p-6 rounded-2xl shadow-lg border border-gray-100 mb-6";

  mainContainer.innerHTML = `
    <div class="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
      <div class="flex-1 flex items-center gap-3 flex-wrap">
        <div class="flex gap-2 flex-wrap">
           <button id="tab-clientes" class="tab-btn ${activeTab === 'clientes' ? TAB_CLASS_MAP.clientes : ''}">Clientes</button>
           <button id="tab-proveedores" class="tab-btn ${activeTab === 'proveedores' ? TAB_CLASS_MAP.proveedores : ''}">Proveedores</button>
           <button id="tab-tramitadores" class="tab-btn ${activeTab === 'tramitadores' ? TAB_CLASS_MAP.tramitadores : ''}">Tramitadores</button>
           <button id="tab-empleados" class="tab-btn ${activeTab === 'empleados' ? TAB_CLASS_MAP.empleados : ''}">Empleados</button>
           <button id="tab-otros" class="tab-btn ${activeTab === 'otros' ? TAB_CLASS_MAP.otros : ''}">Otros</button>
        </div>
      </div>

      <div class="w-full lg:w-1/3 relative">
        <div class="relative">
          <input id="directorio-search" type="text" placeholder="Buscar por nombre, cédula o teléfono..." value="${escapeHtml(searchTerm)}" class="w-full pl-10 pr-4 py-3 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-400 outline-none shadow-sm">
          <svg class="w-5 h-5 absolute left-3 top-3 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M21 21l-4.35-4.35" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="11" cy="11" r="6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
      </div>
    </div>

    <div id="directorio-body"></div>
    <p id="directorio-message" class="text-sm text-center mt-4 hidden"></p>
  `;

  contentDiv.appendChild(mainContainer);

  // Agregar estilos locales para pestañas y utilitarios
  injectLocalTabStyles();

  // Listeners de Tabs (ahora existe setActiveTab)
  ['clientes', 'proveedores', 'tramitadores', 'empleados', 'otros'].forEach(tab => {
      const el = document.getElementById(`tab-${tab}`);
      if (el) el.addEventListener('click', () => setActiveTab(tab));
  });

  // Listener Buscador
  const searchInput = document.getElementById('directorio-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      searchTerm = e.target.value.trim().toLowerCase();
      renderResultsTable();
    });
  }

  // Render inicial
  await renderBody();
}

function injectLocalTabStyles() {
  if (document.getElementById('directorio-tab-styles')) return;
  const style = document.createElement('style');
  style.id = 'directorio-tab-styles';
  style.textContent = `
    .tab-btn { padding: .5rem .9rem; border-radius: .75rem; font-weight: 700; font-size: .75rem; border: 1px solid transparent; background:#f8fafc; color:#374151; transition: all .15s; cursor:pointer }
    .tab-btn:hover { transform: translateY(-2px); box-shadow: 0 6px 18px rgba(15,23,42,0.06); }
    .tab-active-emerald { background: linear-gradient(90deg,#ecfdf5,#f0fdf4); color:#065f46; border-color: rgba(6,95,70,0.12); box-shadow: inset 0 0 0 2px rgba(16,185,129,0.06); }
    .tab-active-teal { background: linear-gradient(90deg,#ecfeff,#f0fdfa); color:#0f766e; border-color: rgba(15,118,110,0.10); }
    .tab-active-purple { background: linear-gradient(90deg,#faf5ff,#fbf9ff); color:#5b21b6; border-color: rgba(91,33,182,0.10); }
    .tab-active-blue { background: linear-gradient(90deg,#eff6ff,#f7faff); color:#1d4ed8; border-color: rgba(29,78,216,0.10); }
    .tab-active-slate { background: linear-gradient(90deg,#f8fafc,#f1f5f9); color:#334155; border-color: rgba(51,65,85,0.06); }
    .animate-fade { animation: fadeOut 3s ease forwards; }
    @keyframes fadeOut { 0% { opacity: 1 } 80% { opacity: 1 } 100% { opacity: 0 } }
  `;
  document.head.appendChild(style);
}

// =========================================================
// 2. FUNCIÓN PARA CAMBIAR TAB
// =========================================================

window.setActiveTab = async function(tab) {
  console.log("Cambiando pestaña a:", tab);
  activeTab = tab;
  editingContact = null; 

  // 1. Actualizar visualmente los botones (Igual que antes)
  ['clientes', 'proveedores', 'tramitadores', 'empleados', 'otros'].forEach(t => {
      const btn = document.getElementById(`tab-${t}`);
      if (btn) {
          btn.className = 'tab-btn ' + (t === tab ? TAB_CLASS_MAP[t] : '');
      }
  });

  // 2. LÓGICA NUEVA: Cargar datos si es necesario
  if (tab === 'empleados' && employeesCache.length === 0) {
      // Mostramos un indicador de carga temporal
      const container = document.getElementById('directorio-body');
      if(container) container.innerHTML = '<div class="text-center p-10"><i class="fa-solid fa-spinner fa-spin text-3xl text-blue-500"></i><p>Cargando empleados...</p></div>';
      
      // Esperamos a que termine la descarga
      await loadEmployees();
  }

  // 3. Volver a renderizar el cuerpo (Ahora employeesCache ya tendrá datos)
  renderBody();
}

// =========================================================
// 3. RENDERIZADO DEL CUERPO (layout en dos columnas salvo empleados)
// =========================================================
async function renderBody() {
  const body = document.getElementById('directorio-body');
  if (!body) return;

  // Cargar empleados si es la pestaña empleados
  if (activeTab === 'empleados' && employeesCache.length === 0) {
     if (window.getEmployees) {
         try { employeesCache = await window.getEmployees(); } 
         catch (e) { console.error(e); }
     }
  }

  // Para pestañas distintas a 'empleados' mostramos layout con form a la izquierda y lista a la derecha
  if (activeTab !== 'empleados') {
    let formHtml = '';
    if (activeTab === 'clientes') formHtml = renderClientesSection();
    else if (activeTab === 'proveedores') formHtml = renderProveedoresSection(false);
    else if (activeTab === 'tramitadores') formHtml = renderProveedoresSection(true);
    else formHtml = renderOtrosSection();

    body.innerHTML = `
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div class="lg:col-span-5">${formHtml}</div>
        <div class="lg:col-span-7">
           <div id="results-table-wrapper"></div>
        </div>
      </div>
    `;
    // Adjuntar handlers del formulario correspondiente
    if (activeTab === 'clientes') attachClienteHandlers();
    else if (activeTab === 'proveedores' || activeTab === 'tramitadores') attachProveedorHandlers(activeTab === 'tramitadores');
    else attachOtrosHandlers();

    // Renderizar la lista en la columna derecha
    renderResultsTable();
  } else {
    // Empleados: sin formulario, lista a ancho completo
    body.innerHTML = `
      <div class="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-4 text-sm text-blue-800 flex justify-between items-center">
          <div class="flex items-center gap-3">
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10z"/><path d="M2 22c2-4 6-6 10-6s8 2 10 6"/></svg>
            <span>Selecciona un empleado para ver su historial o configurar sus comisiones.</span>
          </div>
          <button id="refresh-directorio" class="underline hover:text-blue-600 text-sm">Refrescar</button>
      </div>
      <div id="results-table-wrapper"></div>
    `;
    document.getElementById('refresh-directorio')?.addEventListener('click', () => renderDirectorio());
    renderResultsTable();
  }
}

// =========================================================
// 4. SECCIONES: cada función devuelve SOLO el HTML del formulario
// (aquí sólo actualicé proveedores -> ciudad + dirección; y otros -> rol)
// =========================================================
function renderClientesSection() {
  const isEdit = !!editingContact;
  // Comprobamos si el contacto actual tiene el estado 'VETADO'
  const isVetado = editingContact && editingContact.status === 'VETADO' ? 'checked' : '';
  return `
    <div class="bg-gray-50 p-5 rounded-xl border border-gray-100">
      <h3 class="font-semibold text-gray-800 mb-4 text-sm uppercase tracking-wide">
        ${isEdit ? 'Editando Cliente' : 'Nuevo Cliente'}
      </h3>
      <form id="client-form" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-1 gap-4">
        <div>
            <label class="block text-xs font-medium text-gray-600 mb-2">Cédula / NIT</label>
            <input type="text" id="client-id" class="w-full p-3 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-300 outline-none" placeholder="12345..." required>
        </div>
        <div>
            <label class="block text-xs font-medium text-gray-600 mb-2">Nombre Completo</label>
            <input type="text" id="client-name" class="w-full p-3 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-300 outline-none" placeholder="Juan Pérez" required>
        </div>
        <div>
            <label class="block text-xs font-medium text-gray-600 mb-2">Teléfono</label>
            <input type="tel" id="client-phone" class="w-full p-3 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-300 outline-none" placeholder="300...">
        </div>
        <div>
            <label class="block text-xs font-medium text-gray-600 mb-2">Ciudad</label>
            <input type="text" id="client-city" class="w-full p-3 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-300 outline-none" placeholder="Ciudad">
        </div>
        <div>
            <label class="block text-xs font-medium text-gray-600 mb-2">Dirección</label>
            <input type="text" id="client-address" class="w-full p-3 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-300 outline-none" placeholder="Dirección completa">
        </div>
        <div class="md:col-span-2 lg:col-span-1 py-2">
            <label class="inline-flex items-center cursor-pointer group">
                <input type="checkbox" id="client-status-vetado" ${isVetado} class="form-checkbox h-5 w-5 text-red-600 rounded border-gray-300 focus:ring-red-500 transition-all">
                <span class="ml-2 text-sm font-medium text-gray-700 group-hover:text-red-600 transition-colors">🚫 Marcar como Vetado (Opcional)</span>
            </label>
        </div>
        <div class="flex justify-end gap-3 mt-2">
            ${isEdit ? `<button type="button" id="cancel-edit" class="px-4 py-2 text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-sm">Cancelar</button>` : ''}
            <button type="submit" class="px-6 py-2 bg-emerald-600 text-white font-semibold rounded-lg shadow-sm hover:bg-emerald-700 text-sm">
                ${isEdit ? 'Actualizar Cliente' : 'Guardar Cliente'}
            </button>
        </div>
      </form>
    </div>
  `;
}

function renderProveedoresSection(isTramitador) {
  const isEdit = !!editingContact;
  const color = isTramitador ? 'purple' : 'teal';
  const label = isTramitador ? 'Tramitador' : 'Proveedor';

  return `
    <div class="bg-gray-50 p-5 rounded-xl border border-gray-100">
      <h3 class="font-semibold text-gray-800 mb-4 text-sm uppercase tracking-wide">
        ${isEdit ? `Editando ${label}` : `Nuevo ${label}`}
      </h3>
      <form id="provider-form" class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
            <label class="block text-xs font-medium text-gray-600 mb-2">ID / NIT</label>
            <input type="text" id="prov-id" class="w-full p-3 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-${color}-300 outline-none" required>
        </div>
        <div>
            <label class="block text-xs font-medium text-gray-600 mb-2">Nombre / Razón Social</label>
            <input type="text" id="prov-name" class="w-full p-3 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-${color}-300 outline-none" required>
        </div>

        <!-- Separé Ciudad y Dirección (unidad visual y de datos) -->
        <div>
            <label class="block text-xs font-medium text-gray-600 mb-2">Ciudad</label>
            <input type="text" id="prov-city" class="w-full p-3 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-${color}-300 outline-none" placeholder="Ciudad">
        </div>
        <div>
            <label class="block text-xs font-medium text-gray-600 mb-2">Dirección</label>
            <input type="text" id="prov-address" class="w-full p-3 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-${color}-300 outline-none" placeholder="Dirección / Barrio">
        </div>

        <div>
            <label class="block text-xs font-medium text-gray-600 mb-2">Teléfono</label>
            <input type="tel" id="prov-phone" class="w-full p-3 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-${color}-300 outline-none" placeholder="300...">
        </div>
        <div>
            <label class="block text-xs font-medium text-gray-600 mb-2">Correo (opcional)</label>
            <input type="email" id="prov-email" class="w-full p-3 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-${color}-300 outline-none" placeholder="correo@dominio.com">
        </div>

        <div class="flex justify-end gap-3 mt-2 md:col-span-2">
            ${isEdit ? `<button type="button" id="cancel-edit" class="px-4 py-2 text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-sm">Cancelar</button>` : ''}
            <button type="submit" class="px-6 py-2 bg-${color}-600 text-white font-semibold rounded-lg shadow-sm hover:bg-${color}-700 text-sm">
                ${isEdit ? 'Actualizar' : 'Guardar'}
            </button>
        </div>
      </form>
    </div>
  `;
}

function renderOtrosSection() {
  const isEdit = !!editingContact;
  return `
    <div class="bg-gray-50 p-5 rounded-xl border border-gray-100">
      <h3 class="font-semibold text-gray-800 mb-4 text-sm uppercase tracking-wide">
         ${isEdit ? 'Editando Otro' : 'Nuevo Contacto (Otros)'}
      </h3>
      <form id="other-form" class="grid grid-cols-1 gap-4">
        <div>
            <label class="block text-xs font-medium text-gray-600 mb-2">Nombre</label>
            <input type="text" id="other-name" class="w-full p-3 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-slate-300 outline-none" required>
        </div>

        <!-- Restauré Rol / Relación aquí -->
        <div>
            <label class="block text-xs font-medium text-gray-600 mb-2">Rol / Relación</label>
            <input type="text" id="other-role" class="w-full p-3 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-slate-300 outline-none" placeholder="Ej: Abogado, Técnico, Asesor" required>
        </div>

        <div>
            <label class="block text-xs font-medium text-gray-600 mb-2">Teléfono / Nota</label>
            <input type="text" id="other-phone" class="w-full p-3 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-slate-300 outline-none" placeholder="Teléfono">
        </div>

        <div class="flex justify-end gap-3 mt-2">
             ${isEdit ? `<button type="button" id="cancel-edit" class="px-4 py-2 text-gray-600 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 text-sm">Cancelar</button>` : ''}
             <button type="submit" class="px-6 py-2 bg-slate-600 text-white font-semibold rounded-lg shadow-sm hover:bg-slate-700 text-sm">
                ${isEdit ? 'Actualizar' : 'Guardar'}
             </button>
        </div>
      </form>
    </div>
  `;
}


// =========================================================
// 4. Función para cargar empleados bajo demanda (Vía API Backend)
// =========================================================
async function loadEmployees() {
    try {
        console.log(`📥 Iniciando descarga de empleados vía API Backend...`);
  
        // 1. Obtener usuarios desde el Backend
        // Puedes pasar el ID de la sede si solo quieres los de una sede específica, 
        // o dejarlo vacío (null) para traer los de toda la empresa.
        // Asumo que tienes currentBranchId en tu entorno, si no, usa null.
        const branchToFetch = typeof currentBranchId !== 'undefined' ? currentBranchId : null;
        const usersData = await getEmployees(branchToFetch);
  
        // 2. Cargar Configuraciones de Comisiones desde Firestore
        // (Mantenemos esto en Firestore porque así está tu lógica de guardado actual)
        const currentTenantId = localStorage.getItem('activeTenantId');
        const configRef = collection(db, `tenants/${currentTenantId}/config_comisiones`);
        let configSnap = { forEach: () => {} };
        
        try {
            configSnap = await getDocs(configRef);
        } catch (e) {
            console.warn("⚠️ No se encontró config_comisiones en Firestore, usando 0 por defecto.", e);
        }
  
        // 3. Crear un mapa rápido de configuraciones (UID -> Datos)
        const configMap = {};
        configSnap.forEach(docSnap => {
            configMap[docSnap.id] = docSnap.data();
        });
  
        // 4. Mezclar datos: Usuario del Backend + Su Configuración de Firestore
        employeesCache = usersData.map(user => {
            // El backend suele devolver uid, pero por si acaso validamos
            const userId = user.uid || user.id; 
            const userConfig = configMap[userId] || {};
  
            return {
                ...user, // Trae email, displayName, role, branchId, etc.
                id: userId, // Unificamos para que las tarjetas funcionen
                uid: userId,
                name: user.displayName || user.name || 'Sin Nombre', // Normalizamos el nombre
                venta_porcentaje: userConfig.venta_porcentaje || 0,
                empeno_fijo: userConfig.empeno_fijo || 0
            };
        });
  
        console.log(`✅ ${employeesCache.length} empleados cargados correctamente.`);
        renderResultsTable();
  
    } catch (error) {
        console.error("❌ Error cargando empleados:", error);
        showMessage("Error al traer empleados del servidor: " + (error.message || error), "red");
    }
  }

// =========================================================
// 5. HANDLERS y GUARDADO (se mantienen las funcionalidades)
// =========================================================
// Busca esta función en tu archivo directorio.js y reemplázala por esta:
function attachClienteHandlers() {
    if (editingContact) {
        document.getElementById('client-id').value = editingContact.id_number || '';
        document.getElementById('client-name').value = editingContact.name || '';
        document.getElementById('client-phone').value = editingContact.phone || '';
        document.getElementById('client-city').value = editingContact.city || '';
        document.getElementById('client-address').value = editingContact.address || '';
        
        // Aseguramos que el checkbox refleje el estado al editar
        const checkVetado = document.getElementById('client-status-vetado');
        if (checkVetado) {
            checkVetado.checked = editingContact.status === 'VETADO';
        }

        document.getElementById('cancel-edit')?.addEventListener('click', () => {
            editingContact = null;
            renderBody();
        });
    }

    const form = document.getElementById('client-form');
    if (form) {
      form.addEventListener('submit', async (e) => {
          e.preventDefault();
          
          // MOVIDO AQUÍ DENTRO: Captura el valor justo al enviar el formulario
          const isVetadoChecked = document.getElementById('client-status-vetado').checked;

          const data = {
              id_number: document.getElementById('client-id').value.trim(),
              name: document.getElementById('client-name').value.trim(),
              phone: document.getElementById('client-phone').value.trim(),
              city: document.getElementById('client-city').value.trim(),
              address: document.getElementById('client-address').value.trim(),
              // Ahora sí detectará si está marcado o no
              status: isVetadoChecked ? 'VETADO' : null, 
              updatedAt: new Date().toISOString()
          };
          await handleSave('clientes', data);
      });
    }
}

function attachProveedorHandlers(isTramitador) {
  if (editingContact) {
      document.getElementById('prov-id').value = editingContact.id_number || '';
      document.getElementById('prov-name').value = editingContact.name || '';
      document.getElementById('prov-phone').value = editingContact.phone || '';
      document.getElementById('prov-city').value = editingContact.city || '';
      document.getElementById('prov-address').value = editingContact.address || '';
      document.getElementById('prov-email').value = editingContact.email || '';

      document.getElementById('cancel-edit')?.addEventListener('click', () => {
          editingContact = null;
          renderBody();
      });
  }

  const form = document.getElementById('provider-form');
  if (form) {
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const nowColombia = getColombiaNow();
        const data = {
            id_number: document.getElementById('prov-id').value.trim(),
            name: document.getElementById('prov-name').value.trim(),
            phone: document.getElementById('prov-phone').value.trim(),
            city: document.getElementById('prov-city').value.trim(),
            address: document.getElementById('prov-address').value.trim(),
            email: document.getElementById('prov-email').value.trim(),
            type: isTramitador ? 'TRAMITADOR' : 'PROVEEDOR',
            updated_at: nowColombia.timestampMs,
            updatedAtColombia: nowColombia
        };

        // Si es tramitador, guardamos en la colección "otros" (o la que uses para tramitadores).
        // Si no, guardamos en "proveedores".
        const targetCollection = isTramitador ? 'tramitadores' : 'proveedores';


        await handleSave(targetCollection, data);
    });
  }
}

function attachOtrosHandlers() {
     if (editingContact) {
        document.getElementById('other-name').value = editingContact.name || '';
        document.getElementById('other-role').value = editingContact.role || '';
        document.getElementById('other-phone').value = editingContact.phone || '';
        document.getElementById('cancel-edit')?.addEventListener('click', () => {
            editingContact = null;
            renderBody();
        });
    }

    const form = document.getElementById('other-form');
    if (form) {
      form.addEventListener('submit', async (e) => {
          e.preventDefault();
          const nowColombia = getColombiaNow();
          const data = {
              name: document.getElementById('other-name').value.trim(),
              role: document.getElementById('other-role').value.trim(),
              phone: document.getElementById('other-phone').value.trim(),
              type: 'OTRO',
              updated_at: nowColombia.timestampMs,
              updatedAtColombia: nowColombia
          };
          await handleSave('otros', data);
      });
    }
}

async function handleSave(collectionName, data) {
    try {
        const nowColombia = getColombiaNow();
        data.updated_at = data.updated_at || nowColombia.timestampMs;
        data.updatedAtColombia = data.updatedAtColombia || nowColombia;
        // Obtener referencia via getCollectionRef (respeta branch/tenant)
        const colRef = getCollectionRef(collectionName);
        if (!colRef) {
            showMessage('No hay tenant o sede seleccionada. Selecciona una antes de guardar.', 'red');
            return;
        }
        
        if (editingContact && editingContact.id) {
            const docRef = doc(colRef, editingContact.id);
            await setDoc(docRef, data, { merge: true });
            showMessage('Actualizado correctamente', 'green');
            editingContact = null;
        } else {
            data.created_at = nowColombia.timestampMs;
            data.createdAtColombia = nowColombia;
            data.dateKey = nowColombia.dateKey;
            data.timeKey = nowColombia.timeKey;
            data.weekday = nowColombia.weekday;
            await addDoc(colRef, data);
            showMessage('Guardado correctamente', 'green');
        }
        
        // Limpiar inputs
        const inputs = document.querySelectorAll('input');
        inputs.forEach(i => i.value = '');
        
        // Refrescar tabla y forms
        renderBody();
        
    } catch (error) {
        console.error(error);
        showMessage('Error al guardar: ' + (error.message || error), 'red');
    }
}

// =========================================================
// 6. RENDERIZADO DE RESULTADOS: siempre en el wrapper derecho
// =========================================================
function renderResultsTable() {
  const container = document.getElementById('results-table-wrapper');
  if (!container) return;

  // --- LOGS DE DEPURACIÓN (Inicio) ---
  console.group("🔍 DEBUGEANDO RENDER TABLE");
  console.log("1. Tab Activa:", activeTab);
  
  // Verificamos si la función del store existe y qué trae
  if (typeof getComisionesPendientes === 'function') {
      const testComs = getComisionesPendientes();
      console.log("2. Store Comisiones (Global):", testComs.length, "registros", testComs);
  } else {
      console.error("❌ ERROR CRÍTICO: getComisionesPendientes no es una función o no se importó.");
  }
  // -----------------------------------

  let list = [];
  if (activeTab === 'clientes') list = clients;
  else if (activeTab === 'proveedores') list = providers;
  else if (activeTab === 'tramitadores') list = tramitador;
  else if (activeTab === 'empleados') {
      list = employeesCache;
      console.log("3. Cache de Empleados:", list); // ¿Está vacío aquí?
  }
  else list = others.filter(o => o.type !== 'TRAMITADOR');

  const term = searchTerm;
  const filtered = list.filter(item => {
      if (!term) return true;
      return (
          (item.name && item.name.toLowerCase().includes(term)) ||
          (item.id_number && String(item.id_number).toLowerCase().includes(term)) ||
          (item.phone && String(item.phone).toLowerCase().includes(term)) ||
          (item.city && (item.city + '').toLowerCase().includes(term)) ||
          (item.uid && String(item.uid).toLowerCase().includes(term)) ||
          (item.role && String(item.role).toLowerCase().includes(term)) ||
          (item.status && String(item.status).toLowerCase().includes(term))
      );
  });

  console.log(`4. Resultados finales a renderizar: ${filtered.length} items`);
  console.groupEnd();

  if (filtered.length === 0) {
      container.innerHTML = `<div class="text-center py-12 text-gray-400 border-2 border-dashed border-gray-100 rounded-2xl">
          No se encontraron resultados (Lista vacía). <br>
          <small>Revisa la consola para ver por qué.</small>
      </div>`;
      return;
  }

  container.innerHTML = `
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-4">
          ${filtered.map(item => createCardHTML(item)).join('')}
      </div>
  `;
}
function createCardHTML(item) {
    // 1. Normalización de datos básicos
    const name = escapeHtml(item.name || item.displayName || 'Sin Nombre');
    const phone = escapeHtml(item.phone || 'Sin Tel');
    const city = escapeHtml(item.city || '');
    const role = escapeHtml(item.role || '');
    
    const docId = item.id; 
    const rawId = item.id_number || item.uid || item.id || '';
    
    // --- ÚNICA DECLARACIÓN DE idToUse (Al inicio) ---
    const idToUse = docId || rawId; 

    const currentId = String(rawId).trim();
    const displayId = currentId.length > 15 ? currentId.substring(0, 8) + '...' : currentId;

    // --- LÓGICA DE VETADOS ---
    const isVetado = item.status === 'VETADO'; 

    // Botón Vetado (solo NO empleados)
    let btnVetado = '';
    if (activeTab !== 'empleados') {
      btnVetado = `
        <button onclick="window.toggleVetado('${idToUse}')"
          class="w-8 h-8 rounded-full ${
            isVetado
              ?'bg-red-50 text-red-600'
              :'bg-yellow-50 text-yellow-700'
          } hover:scale-110 transition-all flex items-center justify-center"
          title="${isVetado ? 'Quitar vetado' : 'Marcar como vetado'}">
          <i class="fa-solid ${isVetado ? 'fa-user-slash':  'fa-user-check'}"></i>
        </button>
      `;
    }
  
    let statusBadge = '';
    if (isVetado) {
        statusBadge = `
          <span class="ml-2 px-2 py-0.5 bg-red-100 text-red-700 text-[10px] font-bold rounded-full border border-red-200 animate-pulse">
              🚫 VETADO
          </span>`;
    }
  
    // Tema de color según la pestaña
    const theme = isVetado ? 'red' : (
                  activeTab === 'clientes' ? 'emerald' :
                  activeTab === 'proveedores' ? 'teal' :
                  activeTab === 'empleados' ? 'blue' :
                  activeTab === 'tramitadores' ? 'purple' : 'gray'
    );
  
    // --- LÓGICA DE BOTONES (ACCIONES) ---
    
    // 1. Regla de eliminación (3 días)
    let canDelete = false;
    let createdTime = 0;
    
    if (item.created_at && item.created_at.seconds) {
        createdTime = item.created_at.seconds * 1000; 
    } else if (item.created_at) {
        createdTime = new Date(item.created_at).getTime();
    } else if (item.createdAt) {
        createdTime = new Date(item.createdAt).getTime(); 
    }

    if (createdTime > 0) {
        const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
        const now = getColombiaNow().timestampMs;
        if ((now - createdTime) < threeDaysMs) {
            canDelete = true;
        }
    }

    // --- AQUÍ HABÍA UNA SEGUNDA DECLARACIÓN QUE DEBES BORRAR ---
    // (Ya la movimos arriba)

    // 2. DETERMINAR QUÉ FUNCIÓN DE HISTORIAL USAR
    let historyFunction = '';
    
    if (activeTab === 'empleados') {
        historyFunction = `window.openEmployeeHistory('${idToUse}', '${name}')`;
    } else {
        let roleType = 'CLIENTE';
        if (activeTab === 'proveedores') roleType = 'PROVEEDOR';
        if (activeTab === 'tramitadores') roleType = 'TRAMITADOR';
        if (activeTab === 'otros') roleType = 'OTRO';
        
        historyFunction = `window.openGeneralHistory('${idToUse}', '${roleType}')`;
    }

    // Botón Historial (Azul)
    const btnHistory = `
        <button onclick="${historyFunction}" 
                class="w-8 h-8 rounded-full bg-blue-50 text-blue-600 hover:bg-blue-100 hover:scale-110 transition-all flex items-center justify-center" 
                title="Ver Historial">
            <i class="fa-solid fa-clock-rotate-left"></i>
        </button>
    `;

    // Botón Editar (Naranja)
    let btnEdit = '';
    if (activeTab !== 'empleados') {
         btnEdit = `
            <button onclick="window.editContact('${idToUse}')" 
                    class="w-8 h-8 rounded-full bg-orange-50 text-orange-600 hover:bg-orange-100 hover:scale-110 transition-all flex items-center justify-center" 
                    title="Editar">
                <i class="fa-solid fa-pen"></i>
            </button>
        `;
    }

    // Botón Eliminar (Rojo)
    const btnDelete = canDelete ? `
        <button onclick="window.deleteContact('${idToUse}')" 
                class="w-8 h-8 rounded-full bg-red-50 text-red-600 hover:bg-red-100 hover:scale-110 transition-all flex items-center justify-center" 
                title="Eliminar (Disponible por 3 días)">
            <i class="fa-solid fa-trash"></i>
        </button>
    ` : '';

    // Agrupamos los botones
    let actions = `
    <div class="flex items-center gap-2">
        ${btnVetado}
        ${btnHistory}
        ${btnEdit}
        ${btnDelete}
    </div>
  `;

    if (activeTab === 'empleados') {
        actions = `
        <div class="flex items-center gap-2">
            <button onclick="window.openCommissionConfig('${item.uid || idToUse}', '${name}')" 
                    class="px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 hover:bg-indigo-100 text-xs font-bold border border-indigo-200"
                    title="Configurar Comisiones">
               <i class="fa-solid fa-sack-dollar"></i>
            </button>
            ${btnHistory}
            ${btnDelete}
        </div>`;
    }

    // Metadatos visuales
    const metaParts = [];
    if (activeTab === 'empleados') {
        const ventaPct = item.venta_porcentaje ?? 0;
        const empenoFijo = item.empeno_fijo ?? 0;
        metaParts.push(`<span class="text-[12px] px-2 py-0.5 bg-blue-50 rounded-md text-blue-700">Venta: ${escapeHtml(String(ventaPct))}%</span>`);
        metaParts.push(`<span class="text-[12px] px-2 py-0.5 bg-blue-50 rounded-md text-blue-700">Fijo: ${escapeHtml(String(empenoFijo))}</span>`);
    }
    if (role) metaParts.push(`<span class="text-[12px] px-2 py-0.5 bg-gray-100 rounded-md text-gray-700">${role}</span>`);
    if (city) metaParts.push(`<span class="text-[12px] text-gray-400">${city}</span>`);
  
    return `
    <div class="bg-white p-4 rounded-2xl border ${isVetado ? 'border-red-300 bg-red-50/30' : 'border-gray-100'} shadow-sm hover:shadow-md transition-all flex justify-between items-center group">
        <div class="flex items-center gap-4 overflow-hidden min-w-0">
            <div class="w-12 h-12 rounded-full bg-${theme}-50 text-${theme}-700 flex items-center justify-center font-bold text-sm shrink-0 border border-${theme}-100">
                ${name.substring(0,2).toUpperCase()}
            </div>
            <div class="min-w-0">
                <div class="flex items-center gap-2">
                    <h4 class="font-semibold ${isVetado ? 'text-red-800' : 'text-gray-800'} text-sm truncate">${name}</h4>
                    ${statusBadge}   
                </div>
                <div class="flex items-center gap-2 text-xs text-gray-500 mt-1">
                    <span class="bg-gray-50 px-2 py-0.5 rounded-md border border-gray-100 font-mono text-[12px]" title="${currentId}">${displayId}</span>
                    ${metaParts.length ? `<div class="flex gap-2 ml-2">${metaParts.join('')}</div>` : ''}
                </div>
                <div class="text-[11px] text-gray-400 mt-0.5 truncate flex items-center gap-1">
                   <i class="fa-solid fa-phone text-[10px]"></i> ${phone}
                </div>
            </div>
        </div>
        <div class="ml-4 shrink-0">
            ${actions}
        </div>
    </div>
    `;
}
// =========================================================
// 7. MENSAJES
// =========================================================
function showMessage(msg, color) {
    const el = document.getElementById('directorio-message');
    if (el) {
        el.textContent = msg;
        el.className = `mt-4 p-3 rounded-lg text-sm text-center block bg-${color}-50 text-${color}-700 border border-${color}-200 animate-fade`;
        el.classList.remove('hidden');
        setTimeout(() => el.classList.add('hidden'), 3000);
    } else {
      console.log(msg);
    }
}

// =========================================================
// 8. FUNCIONES GLOBALES ACCESIBLES DESDE HTML
// =========================================================
window.editContact = (identifier) => {
    // identifier puede ser id, uid o id_number
    let list = [];
    if (activeTab === 'clientes') list = clients;
    else if (activeTab === 'proveedores') list = providers;
    else if (activeTab === 'tramitadores') list = tramitador;
    else list = others;

    const found = list.find(i => i.id === identifier || i.uid === identifier || i.id_number === identifier);
    if (found) {
        editingContact = found;
        renderBody();
        document.querySelector('form')?.scrollIntoView({ behavior: 'smooth' });
    } else {
        const alt = list.find(i => (i.name || '').toLowerCase().includes(String(identifier).toLowerCase()));
        if (alt) {
            editingContact = alt;
            renderBody();
        } else {
            alert('Contacto no encontrado para editar.');
        }
    }
};

window.deleteContact = async (identifier) => {
    if (!confirm('¿Eliminar contacto?')) return;
    let collectionName = activeTab === 'clientes' ? 'clientes' : (activeTab === 'otros' ? 'otros' : 'proveedores');
    
    try {
        const docId = identifier; // asumimos que quien llama pasa el id correcto
        const colRef = getCollectionRef(collectionName);
        if (!colRef) {
            showMessage('No hay tenant o sede seleccionada. Selecciona una antes de eliminar.', 'red');
            return;
        }
        await deleteDoc(doc(colRef, docId));
        showMessage('Contacto eliminado', 'green');
        // refrescar lista
        renderBody();
    } catch (e) {
        console.error(e);
        showMessage('Error al eliminar', 'red');
    }
};

// =========================================================
// 9. LÓGICA DE MODAL DE COMISIONES (Añadir al final)
// =========================================================

/**
 * Abre el modal de configuración de comisiones para un empleado
 */
window.openCommissionConfig = async (uid, name) => {
  ensureCommissionModalExists(); 
  const modal = document.getElementById('commission-modal');
  
  // Preparar campos básicos
  document.getElementById('comm-employee-uid').value = uid;
  document.getElementById('comm-uid-display').textContent = (uid || '').substring(0,8)+'...';
  document.getElementById('comm-employee-name').textContent = name;
  document.getElementById('comm-avatar').textContent = (name || '').substring(0,2).toUpperCase();
  
  // Limpiar valores previos
  document.getElementById('comm-venta-pct').value = ''; 
  document.getElementById('comm-fix').value = '';
  
  modal.classList.remove('hidden');

  try {
      if (!activeTenantId) {
          showMessage("No hay tenant seleccionado.", "red");
          return;
      }
      // Cargamos la configuración actual desde Firestore (usando getCollectionRef)
      const configCollectionRef = getCollectionRef('config_comisiones');
      if (!configCollectionRef) {
          showMessage("No hay sede/tenant configurado para cargar comisiones.", "red");
          return;
      }
      const ref = doc(configCollectionRef, uid);
      const snap = await getDoc(ref);
      
      if (snap.exists()) {
          const data = snap.data();
          document.getElementById('comm-venta-pct').value = data.venta_porcentaje || 0;
          document.getElementById('comm-fix').value = data.empeno_fijo || 0;
      }
  } catch (e) {
      console.error("Error cargando config de comisiones:", e);
      showMessage("Error cargando config de comisiones.", "red");
  }
};

/**
* Recoge los datos del modal y llama al servicio para guardar
*/
window.saveCommissionChanges = async () => {
  const btn = document.getElementById('btn-save-comm');
  const uid = document.getElementById('comm-employee-uid').value;
  const pct = document.getElementById('comm-venta-pct').value;
  const fix = document.getElementById('comm-fix').value;

  if (!uid) return;

  try {
      btn.disabled = true;
      btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Guardando...';

      // USAMOS EL SERVICE IMPORTADO
      const result = await saveCommissionConfig(uid, {
        venta_porcentaje: Number(pct) || 0,
        empeno_fijo: Number(fix) || 0
      });

      if (result.success) {
        // actualizar cache local para reflejar cambios inmediatamente
        const newPct = Number(pct) || 0;
        const newFix = Number(fix) || 0;
        employeesCache = employeesCache.map(emp => {
          if ((emp.uid || emp.id) === uid) {
            return { ...emp, venta_porcentaje: newPct, empeno_fijo: newFix };
          }
          return emp;
        });
      
        alert("✅ Configuración de comisión actualizada (Ahorro + Bono)");
        document.getElementById('commission-modal').classList.add('hidden');
        renderResultsTable();
      }else {
          alert("❌ Error: " + result.error);
      }
  } catch (e) {
      console.error(e);
      alert("Ocurrió un error inesperado.");
  } finally {
      btn.disabled = false;
      btn.innerHTML = 'Guardar Cambios';
  }
};

/**
* Crea el HTML del modal si no existe en el DOM
*/
function ensureCommissionModalExists() {
  if (document.getElementById('commission-modal')) return;

  const modalHtml = `
  <div id="commission-modal" class="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center hidden p-4">
      <div class="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
          <div class="bg-gradient-to-r from-blue-600 to-indigo-700 p-6 text-white relative">
              <button onclick="document.getElementById('commission-modal').classList.add('hidden')" class="absolute top-4 right-4 hover:bg-white/20 rounded-full p-2 transition-colors">
                  <i class="fa-solid fa-xmark"></i>
              </button>
              <div class="flex items-center gap-4">
                  <div id="comm-avatar" class="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center text-2xl font-bold backdrop-blur-md border border-white/30">?</div>
                  <div>
                      <h3 id="comm-employee-name" class="text-xl font-bold">Empleado</h3>
                      <p class="text-blue-100 text-xs flex items-center gap-1">
                          <i class="fa-solid fa-fingerprint"></i> ID: <span id="comm-uid-display"></span>
                      </p>
                  </div>
              </div>
          </div>
          
          <div class="p-8 space-y-6">
              <input type="hidden" id="comm-employee-uid">
              
              <div class="space-y-2">
                  <label class="block text-sm font-bold text-gray-700 flex items-center gap-2">
                      <i class="fa-solid fa-percent text-blue-500"></i> % de Comisión sobre Ahorro
                  </label>
                  <input type="number" id="comm-venta-pct" step="0.1" placeholder="Ej: 50" 
                         class="w-full p-4 bg-gray-50 border-2 border-gray-100 rounded-2xl focus:border-blue-500 focus:ring-0 outline-none transition-all text-lg font-semibold">
                  <p class="text-[10px] text-gray-400 italic">Se calcula sobre lo que el vendedor "ahorre" del descuento máximo.</p>
              </div>

              <div class="space-y-2">
                  <label class="block text-sm font-bold text-gray-700 flex items-center gap-2">
                      <i class="fa-solid fa-money-bill-wave text-emerald-500"></i> Bono Fijo por Venta
                  </label>
                  <input type="number" id="comm-fix" placeholder="Ej: 5000" 
                         class="w-full p-4 bg-gray-50 border-2 border-gray-100 rounded-2xl focus:border-emerald-500 focus:ring-0 outline-none transition-all text-lg font-semibold">
              </div>

              <button id="btn-save-comm" onclick="window.saveCommissionChanges()" 
                      class="w-full py-4 bg-gray-900 text-white font-bold rounded-2xl hover:bg-blue-600 shadow-lg shadow-gray-200 transition-all transform hover:-translate-y-1 active:scale-95">
                  Guardar Cambios
              </button>
          </div>
      </div>
  </div>`;
  document.body.insertAdjacentHTML('beforeend', modalHtml);
}

// --- FUNCIÓN PARA VER HISTORIAL DE EMPLEADO ---
window.openEmployeeHistory = function(id, name) {
  console.log("📂 Abriendo historial de:", name);
  
  if (typeof window.openHistorialPersona === 'function') {
      window.openHistorialPersona(id, 'EMPLEADO', 'directorio');
  } else {
      console.error("❌ El módulo de historial no está cargado");
  }
};

// --- FUNCIÓN PARA VER HISTORIAL GENERAL (Clientes, Proveedores, etc.) ---
window.openGeneralHistory = function(id, role) {
    console.log(`📂 Abriendo historial general para: ${id} (${role})`);
    
    if (typeof window.openHistorialPersona === 'function') {
        // Llamamos al router global pasando el ID y el ROL específico (CLIENTE, PROVEEDOR, TRAMITADOR)
        window.openHistorialPersona(id, role, 'directorio');
    } else {
        console.error("❌ El módulo de historial no está cargado");
        alert("El módulo de historial no está disponible en este momento.");
    }
  };


  window.toggleVetado = async (id) => {
    try {
      const colName =
        activeTab === 'clientes' ? 'clientes' :
        activeTab === 'proveedores' ? 'proveedores' :
        activeTab === 'tramitadores' ? 'tramitadores' :
        activeTab === 'otros' ? 'otros' : null;
  
      if (!colName) return;
  
      const colRef = getCollectionRef(colName);
      if (!colRef) {
        showMessage('No hay tenant/sede seleccionada', 'red');
        return;
      }
  
      const ref = doc(colRef, id);
      const snap = await getDoc(ref);
  
      const newStatus =
        snap.exists() && snap.data()?.status === 'VETADO'
          ? null
          : 'VETADO';
  
      await setDoc(ref, { status: newStatus }, { merge: true });
  
      // 🔄 actualizar estado local mutando el objeto, NO reasignando la variable
      const updateStateLocal = (list) => {
          const item = list.find(i => i.id === id || i.uid === id || i.id_number === id);
          if (item) {
              item.status = newStatus;
          }
      };
  
      if (activeTab === 'clientes') updateStateLocal(clients);
      else if (activeTab === 'proveedores') updateStateLocal(providers);
      else if (activeTab === 'tramitadores') updateStateLocal(tramitador);
      else if (activeTab === 'otros') updateStateLocal(others);
  
      renderResultsTable();
      showMessage('Estado actualizado', 'green');
  
    } catch (e) {
      console.error(e);
      showMessage('Error al cambiar estado', 'red');
    }
  };
