// js/utils.js
import { currentBranchId, currentUser, logout as firebaseSignOut, setSelectedBranch, userRole } from '../config/firebase.js';
import { getBranches } from '../services/admin.service.js';

// --- HELPERS DE FORMATO ---

/**
 * Formatea un número como moneda COP.
 * @param {number} amount - La cantidad a formatear.
 * @returns {string} - El string formateado (ej: "$ 1.200").
 */
export const formatCurrency = (amount) => {
    if (typeof amount !== 'number') return '$0';
    const roundedAmount = Math.round(amount); 
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(roundedAmount);
};

/**
 * Calcula los días entre dos fechas.
 * @param {Date|number} date1 - Primera fecha.
 * @param {Date|number} date2 - Segunda fecha.
 * @returns {number} - Número de días.
 */
export const getDaysBetween = (date1, date2) => {
    const oneDay = 1000 * 60 * 60 * 24;
    const diffTime = Math.abs(date2 - date1);
    return Math.floor(diffTime / oneDay);
};

// --- HELPERS DE RENDERIZADO DE UI ---

/**
 * Genera el HTML para el encabezado de un módulo.
 * @param {string} title - El título principal.
 * @param {string} subtitle - El subtítulo.
 * @returns {string} - El HTML del encabezado.
 */


export function escapeHtml(s) {
    if (!s) return '';
    return String(s).replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  }

/**
 * Función global de salida
 */
window.handleLogout = async () => {
    const confirmar = confirm("¿Estás seguro de que deseas cerrar sesión?");
    if (confirmar) {
        try {
            await firebaseSignOut();
            // Al cerrar sesión, el observador en main.js detectará currentUser = null
            // y nos mandará automáticamente al Login, pero podemos forzar el reload:
            window.location.reload(); 
        } catch (error) {
            console.error("Error al cerrar sesión:", error);
        }
    }
};

export async function renderHeader(title = "", subtitle = "") {
    let branches = [];
    let currentBranchName = "Cargando...";

    // Solo intentamos buscar datos si hay usuario logueado
    console.log("currentUser",currentUser)
    if (currentUser) {
        try {
            branches = await getBranches() || [];
            const activeBranch = branches.find(b => b.id === currentBranchId);
            currentBranchName = activeBranch ? activeBranch.name : "Sin Sede";
            if (!currentBranchId && branches.length > 0) setSelectedBranch(branches[0].id);
        } catch (e) { console.error(e); }
    }

    // Preparar UI del Usuario vs Invitado
    let userSectionHTML = '';

    if (currentUser) {
        // --- CASO LOGUEADO ---
        const userName = currentUser?.displayName || currentUser?.email || 'Usuario';
        const userPhoto = currentUser?.photoURL || `https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&background=10b981&color=fff&bold=true`;
        
        // Lógica de Sede (Admin vs Empleado) - Igual que definimos antes
        // --- LÓGICA DE SEDES PERMITIDAS (Admin vs Trabajador) ---
        let userBranches = [];
        if (userRole === 'ADMIN' || userRole === 'SUPER_ADMIN') {
            userBranches = branches; // El administrador ve todas las sedes
        } else {
            // El trabajador solo ve las sedes que le fueron asignadas
            const allowedIds = currentUser?.allowedBranches && currentUser.allowedBranches.length > 0
                ? currentUser.allowedBranches
                : (currentUser?.branchId ? [currentUser.branchId] : []);
            userBranches = branches.filter(b => allowedIds.includes(b.id));
        }

        let branchUI = '';
        // Si el usuario (sea Admin o Trabajador) tiene 2 o más sedes, activamos el selector desplegable:
        if (userBranches.length > 1) {
            branchUI = `
                <div class="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
                    <span class="text-[10px] font-black text-gray-400 uppercase">Sede:</span>
                    <select onchange="window.changeBranch(this.value)" class="bg-transparent text-sm font-bold text-emerald-600 outline-none cursor-pointer">
                        ${userBranches.map(b => `<option value="${b.id}" ${currentBranchId === b.id ? 'selected' : ''}>${b.name}</option>`).join('')}
                    </select>
                </div>`;
        } else {
            // Si solo tiene 1 sede o ninguna asignada, se mantiene fija:
            branchUI = `
                <div class="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
                    <span class="text-[10px] font-black text-gray-400 uppercase">Sede:</span>
                    <span class="text-sm font-bold text-slate-600">${currentBranchName}</span>
                </div>`;
        }

        userSectionHTML = `
            ${branchUI}
            <div class="flex items-center gap-3">
                <div class="flex items-center gap-2 bg-slate-50 p-1 rounded-full border border-slate-100 pr-4">
                    <img src="${userPhoto}" class="w-8 h-8 rounded-full border-2 border-white shadow-sm object-cover"> 
                    <div class="text-right hidden sm:block">
                        <p class="text-[11px] font-bold text-gray-700">${userName}</p>
                        <span class="text-[9px] text-emerald-500 font-bold">En línea</span>
                    </div>
                </div>
                <button onclick="handleLogout()" class="p-2 text-red-400 hover:bg-red-50 rounded-full">
                    <svg class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                </button>
            </div>`;
    } else {
        // --- CASO INVITADO (GUEST) ---
        userSectionHTML = `
        
            <button id="btn-login-header" onclick="window.triggerLoginModal()" class="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-full shadow-md transition-all transform hover:scale-105">
                <span class="text-xs font-bold uppercase tracking-wide">Ingresar</span>
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                </svg>
            </button>
        `;
    }
    

    return `
        <div class="mb-6 p-4 bg-white rounded-xl shadow-sm border border-gray-100 sticky top-0 z-20 flex flex-col md:flex-row gap-4 items-center justify-between">
            <div class="flex-1">
                <h1 class="text-xl font-bold text-gray-800 leading-tight">${title}</h1>
                <p class="text-[10px] text-gray-400 font-bold uppercase tracking-wider">${subtitle}</p>
            </div>
            ${userSectionHTML}
        </div>
    `;
}

// Función global para el cambio de sede
window.changeBranch = (branchId) => {
    if (!branchId) return;
    setSelectedBranch(branchId);
    window.location.reload(); 
};          

/**
 * Genera el HTML para un grupo de formulario estándar (label + input).
 * @param {string} label - El texto del label.
 *id="abono-form" * @param {string} inputHtml - El HTML completo del input/select/textarea.
 * @returns {string} - El HTML del grupo de formulario.
 */
export const renderFormGroup = (label, inputHtml) => `
    <div class="mb-4">
        <label class="block text-sm font-medium text-gray-700 mb-1">${label}</label>
        ${inputHtml}
    </div>
`;

// --- LÓGICA DEL MODAL DE CONFIRMACIÓN GENÉRICO ---

let pendingAction = null; // Almacena la función de callback

/**
 * Muestra el modal de confirmación genérico.
 * @param {string} id - El ID del ítem a confirmar.
 * @param {string} name - El nombre del ítem (para mostrar en el mensaje).
 * @param {string} type - El tipo de ítem (ej: "Producto", "Fondo").
 * @param {Function} actionFunc - La función a ejecutar si se confirma (recibe el id).
 * @param {string} [additionalMessage=''] - Un mensaje de advertencia adicional.
 */
export function showGeneralConfirmModal(id, name, type, actionFunc, additionalMessage = '') {
    // buscar elementos y verificar existencia
    const modalEl = document.getElementById('general-confirm-modal');
    const inputIdEl = document.getElementById('confirm-action-id');
    const inputTypeEl = document.getElementById('confirm-action-type');
    const titleEl = document.getElementById('confirm-modal-title');
    const messageEl = document.getElementById('confirm-modal-message');
    const buttonEl = document.getElementById('confirm-modal-button');

    // Si falta alguno, loguear y evitar el crash (fallback: usar confirm())
    if (!modalEl || !inputIdEl || !inputTypeEl || !titleEl || !messageEl || !buttonEl) {
        console.warn('showGeneralConfirmModal: falta HTML del modal de confirmación. Usando fallback confirm().', {
            modalEl, inputIdEl, inputTypeEl, titleEl, messageEl, buttonEl
        });

        // Fallback simple: confirm() sin UI custom
        const fallbackMsg = `¿Eliminar ${type} "${name}"? Esta acción es irreversible.${additionalMessage ? '\n\n' + additionalMessage : ''}`;
        if (confirm(fallbackMsg)) {
            actionFunc && actionFunc(id);
        }
        return;
    }

    // Todo ok: rellenar valores y mostrar modal
    inputIdEl.value = id || '';
    inputTypeEl.value = type || '';
    titleEl.textContent = `Confirmar Eliminación de ${type || ''}`;
    messageEl.innerHTML = `
        ¿Estás seguro de que deseas eliminar permanentemente <strong>${escapeHtml(name)}</strong>?
        <p class="mt-2 text-xs text-red-500 font-semibold">Esta acción es irreversible.</p>
        ${additionalMessage ? `<p class="mt-2 text-xs text-orange-500">${escapeHtml(additionalMessage)}</p>` : ''}
    `;
    buttonEl.textContent = `Sí, Eliminar ${type || ''}`;
    pendingAction = actionFunc;
    modalEl.classList.remove('hidden');
}

/**
 * Oculta el modal de confirmación genérico.
 */
export function hideGeneralConfirmModal() {
    document.getElementById('general-confirm-modal').classList.add('hidden');
    pendingAction = null;
}

/**
 * Ejecuta la acción pendiente al confirmar el modal genérico.
 */
export function confirmGeneralAction() {
    if (pendingAction) {
        const id = document.getElementById('confirm-action-id').value;
        pendingAction(id);
    }
    hideGeneralConfirmModal();
}

// --- Exponer funciones de modales en 'window' ---
// (Esto es necesario porque el HTML de los modales está en index.html 
// y llama a estas funciones directamente con 'onclick')

window.hideGeneralConfirmModal = hideGeneralConfirmModal;
window.confirmGeneralAction = confirmGeneralAction;

// Las otras funciones de modal (hideClientHistoryModal, hideProviderHistoryModal, etc.)
// serán exportadas desde sus respectivos módulos (ej: clientes.js, proveedores.js)
// y también las tendrás que asignar a 'window' en esos archivos.