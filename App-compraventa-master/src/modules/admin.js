import { renderHeader, escapeHtml } from '../utils/utils.js';
import { currentUser, userRole } from '../config/firebase.js';
import { 
    createBranch, 
    getBranches, 
    inviteEmployee, 
    getEmployees, 
    updateEmployeeStatus,
    getPendingApprovals, 
    getAllTenants,       
    approveUser,          
    getAllAdmins,
    updateAdminStatus,
    updateTenantPrivacy,
    API_URL,
    getAuthHeaders,
    updateBranch,
    deleteBranch
} from '../services/admin.service.js';

let currentTab = 'branches'; // 'branches' | 'team' | 'global'
let editingBranchId = null;  // null = Creando, ID = Editando
let allBranchesCache = [];   // Memoria de sedes para el modal

export async function renderAdmin() {
    const contentDiv = document.getElementById('content');
    contentDiv.innerHTML = '';

    // Header
    contentDiv.innerHTML += await renderHeader('Administración', 'Gestión de sucursales y equipo de trabajo');

    const container = document.createElement('div');
    container.className = "mt-6 max-w-5xl mx-auto space-y-6";

    // --- TARJETA DE PRIVACIDAD ---
    const privacyContainer = document.createElement('div');
    privacyContainer.className = "bg-white p-6 rounded-xl shadow-sm border border-slate-200";
    
    privacyContainer.innerHTML = `
        <div class="flex items-center justify-between">
            <div class="pr-4">
                <h3 class="text-base font-semibold text-slate-800 flex items-center gap-2">
                    🔓 Visibilidad del Inventario
                </h3>
                <p class="text-sm text-slate-500 mt-1">
                    Al activar esta opción, permites que otras empresas registradas en el sistema puedan ver tu stock disponible.
                </p>
            </div>
            <label class="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" id="privacy-toggle" class="sr-only peer" disabled> 
                <div class="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-emerald-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500"></div>
                <span id="privacy-status-text" class="ml-3 text-sm font-medium text-gray-500 min-w-[60px]">Cargando...</span>
            </label>
        </div>
    `;
    container.appendChild(privacyContainer);

    // Tabs
    const isSuperAdmin = userRole === 'SUPER_ADMIN';
    const tabsContainer = document.createElement('div');
    tabsContainer.innerHTML = `
        <div class="flex border-b border-gray-200 mb-6 overflow-x-auto">
            <button id="tab-branches" onclick="window.switchAdminTab('branches')" class="px-6 py-3 font-medium text-sm border-b-2 border-transparent text-gray-500 hover:text-gray-700">🏢 Sucursales</button>
            <button id="tab-team" onclick="window.switchAdminTab('team')" class="px-6 py-3 font-medium text-sm border-b-2 border-transparent text-gray-500 hover:text-gray-700">👥 Equipo y Accesos</button>
            ${isSuperAdmin ? `<button id="tab-global" onclick="window.switchAdminTab('global')" class="px-6 py-3 font-bold text-sm border-b-2 border-transparent text-gray-500 hover:text-indigo-600">🌐 Solicitudes Globales</button>` : ''}
        </div>
        <div id="admin-content-area" class="min-h-[400px]"></div>
    `;
    container.appendChild(tabsContainer);
    contentDiv.appendChild(container);

    // --- LÓGICA DE PRIVACIDAD ---
    const toggleInput = document.getElementById('privacy-toggle');
    const statusText = document.getElementById('privacy-status-text');

    const checkInitialStatus = async () => {
        try {
            if (!currentUser || !currentUser.tenantId) return;
            const headers = await getAuthHeaders(); 
            const response = await fetch(`${API_URL}/public/tenants`, { 
                method: 'GET',
                headers: headers 
            });
            const result = await response.json();
            if (result.success) {
                const isPublic = result.data.some(t => t.id === currentUser.tenantId && t.es_publico === true);
                toggleInput.checked = isPublic;
                statusText.textContent = isPublic ? 'Público' : 'Privado';
            }
            toggleInput.disabled = false;
        } catch (error) {
            console.error("Error verificando privacidad:", error);
            statusText.textContent = 'Error';
        }
    };

    toggleInput.addEventListener('change', async (e) => {
        const newValue = e.target.checked;
        statusText.textContent = 'Guardando...';
        toggleInput.disabled = true;

        try {
            await updateTenantPrivacy(newValue);
            statusText.textContent = newValue ? 'Público' : 'Privado';
        } catch (error) {
            console.error(error);
            e.target.checked = !newValue;
            statusText.textContent = !newValue ? 'Público' : 'Privado';
            alert('No se pudo actualizar.');
        } finally {
            toggleInput.disabled = false;
        }
    });

    checkInitialStatus();

    // Función Global de Tabs
    window.switchAdminTab = (tab) => {
        const tabs = ['branches', 'team', 'global'];
        tabs.forEach(t => {
            const el = document.getElementById(`tab-${t}`);
            if(el) {
                const activeColor = t === 'global' ? 'border-indigo-500 text-indigo-600' : 'border-emerald-500 text-emerald-600';
                const inactiveColor = 'border-transparent text-gray-500 hover:text-gray-700';
                el.className = `px-6 py-3 font-medium text-sm focus:outline-none border-b-2 transition-colors whitespace-nowrap ${tab === t ? activeColor : inactiveColor}`;
            }
        });
        if (typeof loadTabContent === 'function') loadTabContent(tab);
    };

    window.switchAdminTab('branches');
}

async function loadTabContent(tab) {
    const area = document.getElementById('admin-content-area');
    area.innerHTML = `
        <div class="flex justify-center p-10">
            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
        </div>
    `;

    try {
        if (tab === 'branches') {
            await renderBranchesTab(area);
        } else if (tab === 'team') {
            await renderTeamTab(area);
        } else if (tab === 'global') {
            await renderGlobalManagement(area); 
        }
    } catch (error) {
        area.innerHTML = `
            <div class="p-4 bg-red-50 text-red-600 rounded-lg border border-red-100 flex items-center gap-2">
                <span>❌</span>
                <span>Error cargando datos: ${error.message}</span>
            </div>
        `;
    }
}

// =========================================================
// 🏢 PESTAÑA 1: SUCURSALES
// =========================================================
async function renderBranchesTab(container) {
    const branches = await getBranches();
    allBranchesCache = branches;

    let html = `
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-200 sticky top-4">
                <div class="flex items-center gap-2 mb-4 border-b border-gray-100 pb-3">
                    <div class="bg-emerald-100 p-2 rounded-lg text-emerald-600">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                    </div>
                    <h3 id="branch-form-title" class="font-bold text-gray-800">Nueva Sede</h3>
                </div>

                <form id="branch-form" class="space-y-3" onsubmit="event.preventDefault(); window.handleBranchSubmit();">
                    <div>
                        <label class="text-xs font-bold text-gray-500 uppercase tracking-wide">Nombre</label>
                        <input type="text" id="branch-name" required placeholder="Ej: Sede Norte" class="w-full mt-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all outline-none text-sm">
                    </div>
                    
                    <div class="grid grid-cols-2 gap-3">
                        <div>
                            <label class="text-xs font-bold text-gray-500 uppercase tracking-wide">Ciudad</label>
                            <input type="text" id="branch-city" placeholder="Ciudad" class="w-full mt-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-emerald-500 text-sm">
                        </div>
                        <div>
                            <label class="text-xs font-bold text-gray-500 uppercase tracking-wide">Teléfono</label>
                            <input type="tel" id="branch-phone" placeholder="Celular/Fijo" class="w-full mt-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-emerald-500 text-sm">
                        </div>
                    </div>

                    <div>
                        <label class="text-xs font-bold text-gray-500 uppercase tracking-wide">Dirección</label>
                        <input type="text" id="branch-address" placeholder="Ej: Calle 14 # 5-20" class="w-full mt-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:ring-2 focus:ring-emerald-500 text-sm">
                    </div>

                    <div class="flex gap-2 pt-2">
                        <button type="submit" id="btn-branch-submit" class="flex-1 bg-gray-900 hover:bg-gray-800 text-white font-medium py-2.5 rounded-lg transition-all flex items-center justify-center gap-2 text-sm shadow-lg shadow-gray-200">
                            Guardar Sede
                        </button>
                        <button type="button" id="btn-branch-cancel" onclick="window.resetBranchForm()" class="hidden px-4 py-2.5 bg-gray-100 text-gray-600 rounded-lg font-medium hover:bg-gray-200 transition-colors text-sm">
                            Cancelar
                        </button>
                    </div>
                </form>
            </div>

            <div class="lg:col-span-2">
                <div class="mb-4 flex justify-between items-center">
                    <h3 class="font-bold text-gray-700">Sucursales Activas <span class="ml-2 text-xs bg-gray-200 text-gray-600 py-0.5 px-2 rounded-full">${branches.length}</span></h3>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    ${branches.length === 0 ? 
                        `<div class="col-span-2 flex flex-col items-center justify-center py-12 bg-gray-50 rounded-xl border-2 border-dashed border-gray-200 text-gray-400">
                            <span class="text-sm font-medium">No hay sucursales registradas</span>
                        </div>` : ''}

                        ${branches.map(b => `
                            <div class="group bg-white rounded-xl border border-gray-200 hover:border-emerald-400 hover:shadow-md transition-all duration-200 overflow-hidden relative">
                                <div class="h-1 w-full ${b.status === 'ACTIVE' ? 'bg-emerald-500' : 'bg-gray-300'}"></div>
                                <div class="p-4">
                                    <div class="flex justify-between items-start mb-3">
                                        <div class="flex items-center gap-3">
                                            <div class="w-10 h-10 rounded-full bg-gray-50 flex items-center justify-center text-gray-400 group-hover:bg-emerald-50 group-hover:text-emerald-600 transition-colors">
                                                <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                                </svg>
                                            </div>
                                            <div>
                                                <h4 class="font-bold text-gray-800 text-sm leading-tight">${b.name}</h4>
                                                <p class="text-[10px] uppercase font-bold tracking-wider ${b.status === 'ACTIVE' ? 'text-emerald-600' : 'text-gray-400'}">
                                                    ${b.status === 'ACTIVE' ? 'Activa' : 'Inactiva'}
                                                </p>
                                            </div>
                                        </div>
                        
                                        <div class="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onclick="window.editBranch('${b.id}', '${b.name}', '${b.address || ''}', '${b.phone || ''}', '${b.city || ''}')" 
                                                    class="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Editar">
                                                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                                </svg>
                                            </button>
                                            <button onclick="window.deleteBranch('${b.id}')" 
                                                    class="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Eliminar">
                                                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                </svg>
                                            </button>
                                        </div>
                                    </div>
                                    <div class="space-y-2 mt-2">
                                        <div class="flex items-start gap-2 text-gray-500 text-xs">
                                            <span class="flex-1">${b.address || 'Sin dirección'} ${b.city ? `(${b.city})` : ''}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                </div>
            </div>
        </div>
    `;
    container.innerHTML = html;
}

window.handleBranchSubmit = async () => {
    const name = document.getElementById('branch-name').value;
    const address = document.getElementById('branch-address').value;
    const phone = document.getElementById('branch-phone').value;
    const city = document.getElementById('branch-city').value;

    if (!name) {
        alert("El nombre es obligatorio");
        return;
    }

    const branchData = { name, address, phone, city };
    const btn = document.getElementById('btn-branch-submit');
    
    try {
        btn.disabled = true;
        btn.innerHTML = editingBranchId ? "Actualizando..." : "Guardando...";

        if (editingBranchId) {
            await updateBranch(editingBranchId, branchData);
        } else {
            await createBranch(branchData);
        }

        window.resetBranchForm();
        if (typeof window.switchAdminTab === 'function') {
            window.switchAdminTab('branches');
        } else {
            const container = document.getElementById('admin-tab-content');
            renderBranchesTab(container);
        }
    } catch (e) {
        console.error(e);
        alert("❌ Error: " + e.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = "Guardar Sede";
    }
};

window.editBranch = (id, name, address, phone, city) => {
    editingBranchId = id;
    document.getElementById('branch-form-title').innerText = "Editar Sede: " + name;
    document.getElementById('btn-branch-submit').innerText = "Actualizar Cambios";
    const btnCancel = document.getElementById('btn-branch-cancel');
    if (btnCancel) btnCancel.classList.remove('hidden');

    document.getElementById('branch-name').value = name || '';
    document.getElementById('branch-address').value = address || '';
    document.getElementById('branch-phone').value = phone || '';
    document.getElementById('branch-city').value = city || '';
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.resetBranchForm = () => {
    editingBranchId = null;
    document.getElementById('branch-form-title').innerText = "Nueva Sede";
    document.getElementById('btn-branch-submit').innerText = "Guardar Sede";
    const btnCancel = document.getElementById('btn-branch-cancel');
    if (btnCancel) btnCancel.classList.add('hidden');
    document.getElementById('branch-name').value = '';
    document.getElementById('branch-address').value = '';
    document.getElementById('branch-phone').value = '';
    document.getElementById('branch-city').value = '';
};

window.deleteBranch = async (id) => {
    if (!confirm("⚠️ ¿Seguro que quieres eliminar esta sede?")) return;
    try {
        await deleteBranch(id);
        if (typeof window.switchAdminTab === 'function') {
            window.switchAdminTab('branches');
        } else {
            const container = document.getElementById('admin-tab-content');
            renderBranchesTab(container);
        }
    } catch (e) {
        alert("❌ Error al eliminar: " + e.message);
    }
};

// =========================================================
// 👥 PESTAÑA 2: EQUIPO Y ACCESOS
// =========================================================
async function renderTeamTab(container) {
    const isSuperAdmin = userRole === 'SUPER_ADMIN';
    const branches = await getBranches();
    allBranchesCache = branches; // <- Guarda las sedes para el modal de multi-sedes
    const employees = await getEmployees();

    let admins = [];
    try {
        if (isSuperAdmin && typeof getAllAdmins === 'function') {
            admins = await getAllAdmins();
        }
    } catch (e) {
        console.warn("No se pudieron obtener admins globales:", e.message);
        admins = [];
    }

    const adminUsers = employees.filter(e => e.role === 'ADMIN' || e.role === 'SUPER_ADMIN');
    const staffUsers = employees.filter(e => e.role === 'EMPLOYEE');

    container.innerHTML = `
        <div class="space-y-8 animate-in fade-in duration-500">
            <div class="bg-white p-6 rounded-xl shadow-sm border border-slate-100">
                <div class="mb-4">
                    <h3 class="text-lg font-bold text-slate-800">Agregar Miembro al Equipo</h3>
                    <p class="text-sm text-slate-500">Envíe una invitación para que el usuario acceda a la plataforma.</p>
                </div>

                <form id="employee-form" class="grid md:grid-cols-4 gap-4 items-end">
                    <div>
                        <label class="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wider">Nombre Completo</label>
                        <input type="text" name="name" required 
                            class="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all" 
                            placeholder="Ej: Juan Pérez">
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wider">Correo Electrónico</label>
                        <input type="email" name="email" required 
                            class="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none transition-all" 
                            placeholder="correo@ejemplo.com">
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wider">Sede / Sucursal</label>
                        <select name="branchId" required 
                            class="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-emerald-500 outline-none bg-white">
                            <option value="">Seleccionar Sede...</option>
                            ${branches.map(b => `<option value="${b.id}">${b.name}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-slate-700 mb-1 uppercase tracking-wider">Rol de Usuario</label>
                        <select name="role" ${!isSuperAdmin ? 'disabled' : ''} 
                            class="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 ${isSuperAdmin ? 'focus:ring-emerald-500' : 'bg-slate-50 text-slate-500 cursor-not-allowed'} outline-none">
                            <option value="EMPLOYEE" selected>Trabajador / Operativo</option>
                            ${isSuperAdmin ? '<option value="ADMIN">Administrador de Empresa</option>' : ''}
                        </select>
                        ${!isSuperAdmin ? '<input type="hidden" name="role" value="EMPLOYEE">' : ''}
                    </div>
                    <div class="md:col-span-4 flex justify-end">
                        <button type="submit" 
                            ${branches.length === 0 ? 'disabled' : ''}
                            class="bg-emerald-600 text-white px-8 py-2.5 rounded-lg font-bold hover:bg-emerald-700 transition-all shadow-md active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed">
                            ${branches.length === 0 ? 'Cree una sede primero' : 'Enviar Invitación'}
                        </button>
                    </div>
                </form>
            </div>

            ${(isSuperAdmin || adminUsers.length > 0) ? `
            <div class="space-y-3">
                <h4 class="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <span class="p-1 bg-amber-100 text-amber-600 rounded">🛡️</span> Gestión Administrativa
                </h4>
                <div class="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                    <table class="w-full text-left border-collapse">
                        <thead class="bg-slate-50 text-slate-500">
                            <tr>
                                <th class="px-6 py-3 text-[10px] font-bold uppercase">Administrador</th>
                                <th class="px-6 py-3 text-[10px] font-bold uppercase text-center">EMPRESA</th>
                                <th class="px-6 py-3 text-[10px] font-bold uppercase text-right">Estado</th>
                            </tr>
                        </thead>
                        <tbody id="admins-list">
                            ${ renderAdminsRows(admins, branches) }
                        </tbody>
                    </table>
                </div>
            </div>
            ` : ''}

            <div class="space-y-3">
                <h4 class="text-sm font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <span class="p-1 bg-emerald-100 text-emerald-600 rounded">👥</span> Personal Operativo
                </h4>
                <div class="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
                    <table class="w-full text-left border-collapse">
                        <thead class="bg-slate-50 text-slate-500">
                            <tr>
                                <th class="px-6 py-3 text-[10px] font-bold uppercase">Nombre y Contacto</th>
                                <th class="px-6 py-3 text-[10px] font-bold uppercase text-center">Sede Asignada</th>
                                <th class="px-6 py-3 text-[10px] font-bold uppercase text-right">Acción</th>
                            </tr>
                        </thead>
                        <tbody id="staff-list">
                            ${renderUserRows(staffUsers, branches)}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    setupEmployeeForm();
}

function setupEmployeeForm() {
    const form = document.getElementById('employee-form');
    if (!form) return;

    form.onsubmit = async (e) => {
        e.preventDefault();
        const btn = form.querySelector('button[type="submit"]');
        const originalText = btn.innerHTML;
        const formData = new FormData(form);
        const employeeData = {
            name: formData.get('name'),
            email: formData.get('email'),
            branchId: formData.get('branchId'),
            role: formData.get('role'),
            department: 'General'
        };

        try {
            btn.innerHTML = `<span class="flex items-center gap-2">
                <div class="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div> 
                Invitando...
            </span>`;
            btn.disabled = true;

            await inviteEmployee(employeeData);
            alert("✅ Invitación enviada con éxito.");
            form.reset();
            
            const area = document.getElementById('admin-content-area');
            await renderTeamTab(area);
        } catch (error) {
            console.error("Error al invitar:", error);
            alert("❌ Error: " + error.message);
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    };
}

function renderUserRows(users, branches = []) {
    if (users.length === 0) {
        return `<tr><td colspan="3" class="px-6 py-8 text-center text-slate-400 italic text-sm">No hay registros en esta categoría</td></tr>`;
    }

    return users.map(user => {
        const userBranches = user.allowedBranches && user.allowedBranches.length > 0 
            ? user.allowedBranches 
            : (user.branchId ? [user.branchId] : []);

        const badgesHtml = userBranches.map(bId => {
            const b = branches.find(x => x.id === bId);
            return `<span class="inline-block text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded mr-1 mb-1">${b ? b.name : 'Sede desconocida'}</span>`;
        }).join('') || '<span class="text-xs text-slate-400 italic">Sin asignar</span>';

        return `
        <tr class="border-t border-slate-50 hover:bg-slate-50/50 transition-colors">
            <td class="px-6 py-4">
                <div class="flex items-center gap-3">
                    <div class="h-8 w-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 font-bold text-xs">
                        ${(user.displayName || user.name || 'U').charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <div class="text-sm font-bold text-slate-700">${user.displayName || user.name || 'Usuario'}</div>
                        <div class="text-xs text-slate-400">${user.email}</div>
                    </div>
                </div>
            </td>
            
            <td class="px-6 py-4 text-center">
                <div class="flex flex-wrap justify-center gap-1">
                    ${badgesHtml}
                </div>
            </td>

            <td class="px-6 py-4 text-right space-x-2">
                <button onclick="window.openAssignBranchesModal('${user.id}', '${escapeHtml(user.email)}', '${userBranches.join(',')}')"
                    class="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded transition-colors inline-block mb-1 sm:mb-0">
                    Editar Sedes
                </button>
                
                ${user.status !== 'PENDING' ? `
                <button 
                    onclick="window.toggleUserStatus('${user.id}', '${user.status}')"
                    class="text-[10px] font-bold ${
                        user.status === 'ACTIVE'
                            ? 'text-red-600 hover:underline'
                            : 'text-emerald-600 hover:underline'
                    }">
                    ${user.status === 'ACTIVE' ? 'Desactivar' : 'Activar'}
                </button>
                ` : ''}
            </td>
        </tr>
    `}).join('');
}

// =========================================================
// 🪟 MODAL Y LÓGICA DE ASIGNACIÓN MULTI-SEDES
// =========================================================
window.openAssignBranchesModal = async (userId, email, currentBranchesStr) => {
    const currentBranches = currentBranchesStr ? currentBranchesStr.split(',') : [];
    
    // Si la caché está vacía, la llenamos de inmediato
    if (!allBranchesCache || allBranchesCache.length === 0) {
        try {
            allBranchesCache = await getBranches() || [];
        } catch (e) {
            console.error("Error al obtener sedes:", e);
        }
    }

    let modal = document.getElementById('assign-branches-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'assign-branches-modal';
        modal.className = 'fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4';
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div class="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
            <h3 class="text-lg font-bold text-slate-800 mb-1">Asignar Sedes al Trabajador</h3>
            <p class="text-xs text-slate-500 mb-4 font-mono">${email}</p>
            
            <p class="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Seleccione los negocios permitidos:</p>
            <div id="branches-checkbox-list" class="space-y-2 max-h-56 overflow-y-auto mb-6 pr-1">
                ${allBranchesCache.map(b => `
                    <label class="flex items-center gap-3 p-2.5 rounded-lg border border-slate-200 hover:bg-slate-50 cursor-pointer transition-colors">
                        <input type="checkbox" value="${b.id}" ${currentBranches.includes(b.id) ? 'checked' : ''} class="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500">
                        <span class="text-sm font-semibold text-slate-700">${b.name}</span>
                    </label>
                `).join('')}
            </div>

            <div class="flex justify-end gap-3 border-t border-slate-100 pt-4">
                <button type="button" onclick="document.getElementById('assign-branches-modal').classList.add('hidden')" class="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">
                    Cancelar
                </button>
                <button type="button" onclick="window.saveWorkerBranches('${userId}')" id="btn-save-branches" class="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-md transition-all">
                    Guardar Cambios
                </button>
            </div>
        </div>
    `;
    modal.classList.remove('hidden');
};

window.saveWorkerBranches = async (userId) => {
    const modal = document.getElementById('assign-branches-modal');
    const checkedInputs = modal.querySelectorAll('input[type="checkbox"]:checked');
    const selectedBranches = Array.from(checkedInputs).map(cb => cb.value);

    if (selectedBranches.length === 0) {
        alert("Debe seleccionar al menos una sede para el trabajador.");
        return;
    }

    const btn = document.getElementById('btn-save-branches');
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i> Guardando...';

    try {
        await updateEmployeeStatus(userId, {
            allowedBranches: selectedBranches,
            branchId: selectedBranches[0] // Retrocompatibilidad
        });
        modal.classList.add('hidden');
        alert("✅ Sedes actualizadas correctamente.");
        
        const area = document.getElementById('admin-content-area');
        if (typeof renderTeamTab === 'function') await renderTeamTab(area);
    } catch (error) {
        console.error(error);
        alert("Error al actualizar sedes: " + error.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = 'Guardar Cambios';
    }
};

function renderAdminsRows(admins = [], branches = []) {
    if (!admins || admins.length === 0) {
        return `<tr><td colspan="3" class="px-6 py-8 text-center text-slate-400 italic text-sm">No hay administradores registrados</td></tr>`;
    }

    return admins.map(a => {
        const uid = a.uid || a.id || '';
        const email = a.email || (a.data && a.data.email) || 'Sin email';
        const status = a.status || 'PENDING';
        let tenantLabel = a.tenantId || '';
        if (tenantLabel) {
            tenantLabel = tenantLabel.replace(/[-_]/g, ' ');
            tenantLabel = tenantLabel.split(' ').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' ');
        } else {
            tenantLabel = 'Empresa';
        }

        return `
            <tr class="border-t border-slate-50 hover:bg-slate-50/50 transition-colors">
                <td class="px-6 py-4">
                    <div class="flex items-center gap-3">
                        <div class="h-8 w-8 rounded-full bg-slate-200 flex items-center justify-center text-slate-500 font-bold text-xs">
                            ${ (email || 'U').charAt(0).toUpperCase() }
                        </div>
                        <div>
                            <div class="text-sm font-bold text-slate-700">${email}</div>
                            <div class="text-xs text-slate-400">${uid ? uid : ''}</div>
                        </div>
                    </div>
                </td>

                <td class="px-6 py-4 text-center">
                    <span class="text-xs font-medium text-slate-600 bg-slate-100 px-2 py-1 rounded">
                        ${tenantLabel}
                    </span>
                </td>

                <td class="px-6 py-4 text-right space-y-2">
                    <span class="px-2.5 py-1 rounded-full text-[10px] font-bold tracking-wider ${
                        status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' : status === 'DISABLED' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                    }">
                        ${ status === 'ACTIVE' ? 'ACTIVO' : status === 'DISABLED' ? 'DESACTIVADO' : 'PENDIENTE' }
                    </span>

                    ${ status !== 'PENDING' ? `
                        <button onclick="window.tryToggleAdminStatus('${uid}', '${status}')"
                            class="text-[10px] font-bold ${
                                status === 'ACTIVE' ? 'text-red-600 hover:underline' : 'text-emerald-600 hover:underline'
                            }">
                            ${ status === 'ACTIVE' ? 'Desactivar' : 'Activar' }
                        </button>
                    ` : '' }
                </td>
            </tr>
        `;
    }).join('');
}

window.tryToggleAdminStatus = async (uid, currentStatus) => {
    const newStatus = currentStatus === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    const confirmMessage = newStatus === 'DISABLED' 
        ? `⚠️ ¿ESTÁS SEGURO?\n\nAl desactivar a este ADMIN, todos sus trabajadores perderán el acceso inmediatamente (Efecto Dominó).`
        : `¿Activar este administrador?`;

    if (!confirm(confirmMessage)) return;

    try {
        console.log(`Cambiando estado de ${uid} a ${newStatus}...`);
        await updateAdminStatus(uid, newStatus);
        alert(`✅ Éxito: El administrador y sus dependientes han sido actualizados.`);
        if (typeof loadPendingUsers === 'function') renderAdmin(); 
    } catch (error) {
        console.error("Error al cambiar estado:", error);
        alert(`❌ Error: ${error.message}`);
    }
};

// =========================================================
// 🌐 PESTAÑA 3: SOLICITUDES GLOBALES (SUPER ADMIN)
// =========================================================
async function renderGlobalManagement(container) {
    container.innerHTML = `
        <div class="space-y-6 animate-in fade-in duration-500">
            <div class="bg-indigo-50 border-l-4 border-indigo-500 p-4 rounded-r-xl flex gap-4 items-center shadow-sm">
                <div class="bg-indigo-100 p-2 rounded-full">
                    <svg class="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/></svg>
                </div>
                <div>
                    <h4 class="text-sm font-bold text-indigo-900">Centro de Solicitudes</h4>
                    <p class="text-xs text-indigo-700 mt-1">
                        Aquí aparecen usuarios nuevos que solicitan crear su propia empresa o personas sin invitación. 
                        <span class="font-bold">Nota:</span> Si un Admin local invita a un trabajador, este desaparecerá automáticamente de esta lista.
                    </p>
                </div>
            </div>

            <div class="bg-white rounded-2xl shadow-lg border border-slate-100 overflow-hidden">
                <div class="overflow-x-auto">
                    <table class="w-full text-left border-collapse">
                        <thead class="bg-slate-800 text-white">
                            <tr>
                                <th class="p-4 text-[11px] font-black uppercase tracking-wider w-1/3">Usuario Solicitante</th>
                                <th class="p-4 text-[11px] font-black uppercase tracking-wider w-1/3">Intención / Empresa</th>
                                <th class="p-4 text-[11px] font-black uppercase tracking-wider">Rol Asignado</th>
                                <th class="p-4 text-[11px] font-black uppercase tracking-wider text-right">Acción</th>
                            </tr>
                        </thead>
                        <tbody id="global-pending-table-body" class="divide-y divide-slate-100">
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
    loadPendingUsers();
}

async function loadPendingUsers() {
    const tbody = document.getElementById('global-pending-table-body');
    if (!tbody) return;

    try {
        tbody.innerHTML = '<tr><td colspan="4" class="p-8 text-center"><div class="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-slate-600"></div></td></tr>';

        const [users, tenants] = await Promise.all([getPendingApprovals(), getAllTenants()]);

        if (users.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" class="p-12 text-center text-slate-400">
                        <div class="flex flex-col items-center gap-2">
                            <svg class="w-12 h-12 text-slate-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                            <span class="text-sm font-medium">Todo al día. No hay solicitudes pendientes.</span>
                        </div>
                    </td>
                </tr>`;
            return;
        }

        tbody.innerHTML = users.map(u => {
            const isNewCompanyRequest = !!u.companyName;

            return `
            <tr id="row-${u.uid}" class="hover:bg-slate-50 transition-colors group">
                <td class="p-4">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-full ${isNewCompanyRequest ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-500'} flex items-center justify-center font-bold text-sm">
                            ${u.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <div class="font-bold text-slate-700 text-sm">${u.name}</div>
                            <div class="text-xs text-slate-400 font-mono">${u.email}</div>
                            <div class="text-[10px] text-slate-300 mt-0.5">ID: ${u.uid.slice(0,6)}...</div>
                        </div>
                    </div>
                </td>

                <td class="p-4">
                    ${isNewCompanyRequest 
                        ? `<div class="bg-emerald-50 border border-emerald-100 rounded-lg p-2.5">
                                <span class="block text-[10px] font-bold text-emerald-600 uppercase mb-1">Solicita crear:</span>
                                <div class="font-bold text-emerald-800 text-sm flex items-center gap-2">
                                    🏢 ${u.companyName}
                                </div>
                                <input type="hidden" id="company-name-${u.uid}" value="${u.companyName}">
                                <input type="hidden" id="req-type-${u.uid}" value="NEW_COMPANY">
                           </div>`
                        : `<label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">Asignar a:</label>
                           <select id="tenant-${u.uid}" class="w-full text-sm p-2 border border-slate-200 rounded-lg outline-none focus:border-indigo-500 bg-white">
                                <option value="">Seleccionar Empresa...</option>
                                ${tenants.map(t => `<option value="${t.id}">${t.name}</option>`).join('')}
                           </select>
                           <input type="hidden" id="req-type-${u.uid}" value="ASSIGN_EXISTING">`
                    }
                </td>

                <td class="p-4">
                    ${isNewCompanyRequest
                        ? `<span class="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-xs font-bold border border-indigo-200">
                                👑 ADMIN (Dueño)
                           </span>
                           <input type="hidden" id="role-${u.uid}" value="ADMIN">`
                        : `<select id="role-${u.uid}" class="text-xs p-2 border border-slate-200 rounded-lg bg-white outline-none w-32">
                                <option value="EMPLOYEE" selected>Operativo</option>
                                <option value="ADMIN">Admin</option>
                           </select>`
                    }
                </td>

                <td class="p-4 text-right">
                    <button onclick="window.approveUserHandler('${u.uid}', '${u.email}', '${u.name}')" 
                            class="group-hover:translate-x-0 -translate-x-2 transition-transform bg-slate-800 hover:bg-emerald-600 text-white text-xs font-bold py-2.5 px-5 rounded-lg shadow-md hover:shadow-emerald-200">
                        ${isNewCompanyRequest ? 'Crear y Aprobar' : 'Aprobar Acceso'}
                    </button>
                </td>
            </tr>
        `}).join('');
    } catch (e) {
        console.error(e);
        tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-red-500 text-xs font-bold">Error de conexión: ${e.message}</td></tr>`;
    }
}

window.approveUserHandler = async (uid, email, name) => {
    const reqType = document.getElementById(`req-type-${uid}`).value;
    const btn = document.querySelector(`#row-${uid} button`);
    let payload = { name, email };

    if (reqType === 'NEW_COMPANY') {
        const companyName = document.getElementById(`company-name-${uid}`).value;
        payload = { 
            ...payload, 
            isNewCompany: true, 
            companyName: companyName,
            role: 'ADMIN' 
        };
    } else {
        const tenantSelect = document.getElementById(`tenant-${uid}`);
        const roleSelect = document.getElementById(`role-${uid}`);
        
        if (!tenantSelect.value) {
            alert("⚠️ Por favor selecciona una empresa existente para este usuario.");
            tenantSelect.classList.add('ring-2', 'ring-red-200', 'animate-pulse');
            return;
        }
        
        payload = { 
            ...payload, 
            tenantId: tenantSelect.value, 
            role: roleSelect.value 
        };
    }

    try {
        const originalText = btn.innerHTML;
        btn.innerHTML = '<span class="animate-spin inline-block mr-2">⏳</span> Procesando...';
        btn.disabled = true;
        btn.classList.add('opacity-75', 'cursor-not-allowed');

        await approveUser(uid, payload);
        
        const row = document.getElementById(`row-${uid}`);
        row.innerHTML = `
            <td colspan="4" class="p-4 bg-emerald-50 text-center text-emerald-700 font-bold border-t border-emerald-100">
                ✅ ${reqType === 'NEW_COMPANY' ? 'Empresa creada y usuario asignado' : 'Usuario aprobado correctamente'}
            </td>
        `;
        
        setTimeout(() => {
            row.style.transition = 'opacity 0.5s ease, height 0.5s ease';
            row.style.opacity = '0';
            setTimeout(() => {
                row.remove();
                if (document.querySelectorAll('#global-pending-table-body tr').length === 0) loadPendingUsers();
            }, 500);
        }, 1500);
    } catch (e) {
        alert("Error: " + e.message);
        btn.disabled = false;
        btn.classList.remove('opacity-75', 'cursor-not-allowed');
        btn.innerHTML = "Reintentar";
    }
};

window.toggleUserStatus = async (userId, currentStatus) => {
    const newStatus = currentStatus === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    if (!confirm(`¿Seguro que deseas ${newStatus === 'DISABLED' ? 'desactivar' : 'activar'} este usuario?`)) return;

    try {
        await updateEmployeeStatus(userId, { status: newStatus });
        const area = document.getElementById('admin-content-area');
        await renderTeamTab(area);
    } catch (e) {
        alert("Error: " + e.message);
    }
};