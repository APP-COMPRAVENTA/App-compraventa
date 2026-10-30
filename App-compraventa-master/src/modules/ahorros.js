import { savings, reglasDistribucion, bolsillosUtilidad } from '../store/store.js';
import { getCollectionRef } from '../services/listeners.js';
import { db } from '../config/firebase.js';
import { addDoc, doc, deleteDoc, writeBatch, increment, getDoc, setDoc } from "firebase/firestore";

import { renderHeader, formatCurrency, renderFormGroup, showGeneralConfirmModal } from '../utils/utils.js';
import { getColombiaNow } from '../utils/colombiaTime.js';

// --- Estado Local del Módulo ---
let activeTab = 'cuentas'; // 'cuentas' | 'utilidad'

window.showPocketExpenseModal = showPocketExpenseModal;
window.hidePocketExpenseModal = hidePocketExpenseModal;
window.handlePocketExpenseSubmit = handlePocketExpenseSubmit;

// --- Exposición Global ---
window.handleAccountSubmit = handleAccountSubmit;
window.handleTransferSubmit = handleTransferSubmit;
window.showTransferModal = showTransferModal;
window.hideTransferModal = hideTransferModal;
window.deleteAccountWrapper = deleteAccountWrapper;
window.switchAhorrosTab = (tab) => {
    activeTab = tab;
    renderAhorros(); // Re-renderizar
};
//transacciones
window.handleRuleSubmit = handleRuleSubmit;
window.deleteRuleWrapper = deleteRuleWrapper;
window.switchAhorrosTab = (tab) => { activeTab = tab; renderAhorros(); };
// Funciones Drag & Drop
window.dragStart = dragStart;
window.dragOver = dragOver;
window.drop = drop;
// --- RENDER PRINCIPAL ---
export async function renderAhorros() {
    const contentDiv = document.getElementById('content');
    
    // Header Común
    let html = await renderHeader('Tesorería y Utilidades', 'Administra tus cuentas bancarias y la distribución de ganancias');

    html += `
        <div class="max-w-5xl mx-auto px-4 pb-20">
            
            <div class="flex items-center gap-6 border-b border-gray-200 mb-6">
                <button onclick="switchAhorrosTab('cuentas')" 
                    class="pb-3 text-sm font-bold transition-all relative ${activeTab === 'cuentas' ? 'text-emerald-600' : 'text-gray-400 hover:text-gray-600'}">
                    CUENTAS Y BANCOS
                    ${activeTab === 'cuentas' ? '<span class="absolute bottom-0 left-0 w-full h-0.5 bg-emerald-600 rounded-t-full"></span>' : ''}
                </button>
                <button onclick="switchAhorrosTab('utilidad')" 
                    class="pb-3 text-sm font-bold transition-all relative ${activeTab === 'utilidad' ? 'text-indigo-600' : 'text-gray-400 hover:text-gray-600'}">
                    DISTRIBUCIÓN DE UTILIDAD
                    ${activeTab === 'utilidad' ? '<span class="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-600 rounded-t-full"></span>' : ''}
                </button>
            </div>

            <div id="tab-content" class="animate-fade-in-up">
                ${activeTab === 'cuentas' ? renderCuentasView() : renderUtilidadView()}
            </div>
        </div>
        
        ${renderTransferModal()}
        ${renderPocketExpenseModal()}
    `;

    contentDiv.innerHTML = html;
    // carga los valores de retención luego de renderizar la UI
if (window.loadRetentionUI) window.loadRetentionUI();
}

// ==========================================
// VISTA 1: CUENTAS Y BANCOS (Tu diseño original)
// ==========================================
function renderCuentasView() {
    // Calcular Capital Total
    const totalCapital = savings.reduce((acc, curr) => acc + (parseFloat(curr.saldo) || 0), 0);

    return `
        <div class="bg-gradient-to-r from-emerald-600 to-teal-600 rounded-2xl p-6 text-white shadow-lg mb-6 flex justify-between items-center">
            <div>
                <h2 class="text-sm font-medium opacity-90">Capital Total Disponible</h2>
                <p class="text-3xl font-bold mt-1">${formatCurrency(totalCapital)}</p>
            </div>
            <div class="text-right hidden sm:block">
                <p class="text-xs opacity-75">Cuentas Activas</p>
                <p class="text-xl font-bold">${savings.length}</p>
            </div>
        </div>

        <div class="grid md:grid-cols-3 gap-6">
            
            <div class="md:col-span-1 space-y-6">
                <div class="bg-white p-5 rounded-xl shadow-sm border border-gray-100">
                    <h3 class="font-bold text-gray-800 mb-4 text-sm uppercase flex items-center gap-2">
                        <span>🏦</span> Nueva Cuenta / Caja
                    </h3>
                    <form id="account-form" onsubmit="handleAccountSubmit(event)" class="space-y-3">
                        ${renderFormGroup('Nombre de la Cuenta', `
                            <input type="text" id="acc-name" required placeholder="Ej: Bancolombia, Caja Menor..." 
                            class="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
                        `)}
                        
                        ${renderFormGroup('Saldo Inicial', `
                            <input type="number" id="acc-balance" required placeholder="0" 
                            class="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
                        `)}
                        
                        ${renderFormGroup('Retención (por mil) — 4x1000', `
                            <input type="number" id="acc-retention" min="0" step="1" value="4"
                            class="w-full p-2.5 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500 outline-none">
                            <p class="text-xs text-gray-400 mt-1">Ej: 4 = 4x1000 (0.4%). Pon 0 si esta cuenta está exenta.</p>
                        `)}
                        <button type="submit" class="w-full py-3 bg-gray-800 text-white rounded-xl font-bold text-xs hover:bg-black transition shadow-lg transform active:scale-95">
                            CREAR CUENTA
                        </button>
                    </form>

                      <!-- ======= Retención configurable (4x1000) ======= -->
<div class="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mt-4" style="max-width:420px;">

  <p class="text-xs text-gray-400 mt-2">Acumulado descontado: <span id="retention-accumulated">$0</span></p>
</div>
<!-- ======= /Retención configurable ======= -->
                </div>

                <div class="bg-emerald-50 p-5 rounded-xl border border-emerald-100 text-center">
                    <p class="text-xs text-emerald-800 mb-3 font-medium">¿Necesitas mover dinero?</p>
                    <button onclick="showTransferModal()" class="w-full py-2.5 bg-emerald-600 text-white rounded-lg font-bold text-xs hover:bg-emerald-700 transition flex items-center justify-center gap-2">
                        <span>⇄</span> REALIZAR TRANSFERENCIA
                    </button>
                </div>
            </div>

            <div class="md:col-span-2">
                <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <div class="bg-gray-50 px-5 py-3 border-b border-gray-100 flex justify-between items-center">
                        <h3 class="font-bold text-gray-700 text-sm">Mis Cuentas</h3>
                        <span class="text-xs text-gray-400">${savings.length} registradas</span>
                    </div>
                    
                    <div class="divide-y divide-gray-50">
                        ${savings.length === 0 ? 
                            `<p class="p-8 text-center text-gray-400 text-sm">No hay cuentas creadas aún.</p>` : 
                            savings.map(acc => {
                                const accountName = acc.name || "Cuenta sin nombre";
                                const initial = accountName.charAt(0).toUpperCase();
                            
                                return `
                                <div class="text-[10px] text-gray-400 uppercase tracking-wider">
    ${acc.retention_per_mille != null ? `Retención: ${acc.retention_per_mille}‰` : `Retención: ${4}‰`}
</div>
                                    <div class="p-4 flex justify-between items-center hover:bg-gray-50 transition group">
                                        <div class="flex items-center gap-3">
                                            <div class="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 font-bold text-lg">
                                                ${initial}
                                            </div>
                                            <div>
                                                <div class="font-bold text-gray-800 text-sm">${accountName}</div>
                                                <div class="text-[10px] text-gray-400 uppercase tracking-wider">Cuenta de Ahorros / Caja</div>
                                            </div>
                                        </div>
                                        <div class="text-right">
                                           <div class="text-right">
    <div class="font-bold text-gray-800 text-sm">${formatCurrency(acc.saldo)}</div>
    ${Math.abs(parseFloat(acc.saldo || 0)) > 0.01 ? `
        <span class="text-[9px] text-gray-400 block mt-1">Con fondos</span>
    ` : `
        <button onclick="deleteAccountWrapper('${acc.id}', '${accountName}')" 
            class="text-[10px] text-red-400 hover:text-red-600 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
            Eliminar
        </button>
    `}
</div>
                                        </div>
                                    </div>
                                `;
                            }).join('')
                        }
                    </div>
                </div>
            </div>
 


        </div>
        
    `;
}

// ==========================================
// VISTA 2: UTILIDAD ACUMULADA 
// ==========================================
function renderUtilidadView() {
    // 1. Calcular Utilidad Total Acumulada
    const totalUtilidad = bolsillosUtilidad.reduce((acc, curr) => acc + (parseFloat(curr.saldo) || 0), 0);
    
    // 2. Ordenar reglas por prioridad visualmente
    const reglasOrdenadas = [...reglasDistribucion].sort((a, b) => a.priority - b.priority);

    return `
        <div class="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-2xl p-6 text-white shadow-lg mb-8 flex justify-between items-center">
            <div>
                <h2 class="text-sm font-medium opacity-90">Utilidad Neta Retenida (Total)</h2>
                <p class="text-3xl font-bold mt-1">${formatCurrency(totalUtilidad)}</p>
            </div>
            <div class="text-right hidden sm:block">
                <div class="bg-white/20 backdrop-blur-sm px-4 py-2 rounded-lg">
                    <p class="text-xs opacity-90">Reglas Activas</p>
                    <p class="text-xl font-bold">${reglasOrdenadas.length}</p>
                </div>
            </div>
        </div>

        <div class="grid lg:grid-cols-3 gap-8">
            
            <div class="lg:col-span-1">
                <div class="bg-white p-6 rounded-2xl shadow-sm border border-indigo-50 sticky top-4">
                    <h3 class="font-bold text-gray-800 mb-5 text-sm uppercase flex items-center gap-2 text-indigo-900">
                        <span class="bg-indigo-100 p-1.5 rounded-md">➕</span> Nueva Regla
                    </h3>
                    <form id="rule-form" onsubmit="handleRuleSubmit(event)" class="space-y-4">
                        ${renderFormGroup('Nombre del Bolsillo', `
                            <input type="text" id="rule-name" required placeholder="Ej: Lotes, Dueño..." 
                            class="w-full p-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all">
                        `)}
                        
                        ${renderFormGroup('Tipo de Ahorro', `
                            <select id="rule-type" onchange="toggleRuleValueInput(this.value)" class="w-full p-3 border border-gray-200 rounded-xl text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none transition-all">
                                <option value="PORCENTAJE">Porcentaje (%)</option>
                                <option value="FIJO">Monto Fijo ($)</option>
                                <option value="REMANENTE">Remanente (Sobrante)</option>
                            </select>
                        `)}
                        
                        <div id="rule-value-container" class="transition-all duration-300">
                            ${renderFormGroup('Valor a descontar', `
                                <input type="number" id="rule-value" placeholder="20" 
                                class="w-full p-3 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-gray-700">
                            `)}
                        </div>

                        <div class="text-[10px] text-gray-400 bg-gray-50 p-3 rounded-lg border border-gray-100">
                            💡 Las nuevas reglas se agregan al final. Podrás arrastrarlas para cambiar su prioridad en la lista.
                        </div>

                        <button type="submit" class="w-full py-3.5 bg-indigo-600 text-white rounded-xl font-bold text-xs hover:bg-indigo-700 transition shadow-lg shadow-indigo-200 transform active:scale-95">
                            CREAR REGLA
                        </button>
                    </form>
                </div>
            </div>

            <div class="lg:col-span-2">
                <div class="flex items-center justify-between mb-4 px-1">
                    <h3 class="font-bold text-gray-700 text-sm">Distribución y Saldos</h3>
                    <span class="text-xs text-indigo-500 bg-indigo-50 px-2 py-1 rounded-full font-medium">Arrastra para reordenar</span>
                </div>

                <div class="space-y-3" id="sortable-list">
                    ${reglasOrdenadas.length === 0 ? 
                        `<div class="text-center py-12 border-2 border-dashed border-gray-200 rounded-2xl bg-gray-50">
                            <p class="text-gray-400 text-sm">No hay reglas de distribución configuradas.</p>
                        </div>` : ''
                    }

                    ${reglasOrdenadas.map((regla, index) => {
                        // Buscar saldo correspondiente en los bolsillos
                        const bolsillo = bolsillosUtilidad.find(b => b.name === regla.name);
                        const saldoActual = bolsillo ? bolsillo.saldo : 0;
                        const esRemanente = regla.type === 'REMANENTE';

                        return `
                        <div draggable="true" 
                             ondragstart="dragStart(event)" 
                             ondragover="dragOver(event)" 
                             ondrop="drop(event)"
                             data-id="${regla.id}"
                             data-priority="${index + 1}"
                             class="group bg-white p-4 rounded-xl border border-gray-200 shadow-sm hover:shadow-md transition-all cursor-move relative overflow-hidden flex items-center justify-between gap-4">
                            
                            <div class="absolute left-0 top-0 bottom-0 w-1 ${esRemanente ? 'bg-amber-400' : 'bg-indigo-500'}"></div>

                            <div class="flex items-center gap-4 flex-1">
                                <div class="text-gray-300 cursor-grab active:cursor-grabbing hover:text-gray-500">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="12" r="1"/><circle cx="9" cy="5" r="1"/><circle cx="9" cy="19" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="5" r="1"/><circle cx="15" cy="19" r="1"/></svg>
                                </div>

                                <div class="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 font-bold text-xs shrink-0 border border-gray-200">
                                    #${index + 1}
                                </div>

                                <div>
                                    <h4 class="font-bold text-gray-800 text-sm leading-tight">${regla.name}</h4>
                                    <div class="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                                        <span class="${esRemanente ? 'text-amber-600 font-bold' : ''}">
                                            ${esRemanente ? '★ Recibe todo el sobrante' : 
                                              regla.type === 'PORCENTAJE' ? `Retiene el <b>${regla.value}%</b>` : 
                                              `Retiene <b>${formatCurrency(regla.value)}</b> fijos`}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div class="flex items-center gap-6 text-right">
                                <div>
                                    <p class="text-[10px] uppercase text-gray-400 font-bold tracking-wider">Acumulado</p>
                                    <p class="text-lg font-bold text-gray-900">${formatCurrency(saldoActual)}</p>
                                </div>
                                
                                <div class="flex items-center gap-2">
                                    ${Math.abs(parseFloat(saldoActual || 0)) > 0.01 ? `
                                        <button onclick="showPocketExpenseModal('${bolsillo ? bolsillo.id : ''}', '${regla.name}', ${saldoActual})" 
                                            class="text-[10px] bg-white border border-slate-200 hover:border-indigo-300 hover:text-indigo-600 text-slate-500 font-bold py-1.5 px-3 rounded-lg shadow-sm transition">
                                            <i class="fa-solid fa-money-bill-transfer mr-1"></i> Pagar / Gasto
                                        </button>
                                        <div class="w-8 h-8 flex items-center justify-center" title="Tiene fondos">
                                            <i class="fa-solid fa-lock text-gray-300 text-xs"></i>
                                        </div>
                                    ` : `
                                        <button onclick="deleteRuleWrapper('${regla.id}', '${regla.name}')" 
                                            class="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors" title="Eliminar regla">
                                            <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2M10 11v6M14 11v6"></path></svg>
                                        </button>
                                    `}
                                </div>
                            </div>
                        </div> `;
                    }).join('')}
                </div>
            </div>
        </div>
    `;
}

// ==========================================
// MODALES Y HELPERS
// ==========================================

function renderTransferModal() {
    // Reutilizamos el modal de transferencia existente, solo lo movemos aquí para limpiar
    // ... Tu código de modal anterior va aquí (id="transfer-modal") ...
    return `
        <div id="transfer-modal" class="fixed inset-0 bg-black/60 hidden z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div class="bg-white rounded-2xl max-w-sm w-full shadow-2xl transform transition-all scale-100">
                <div class="p-6 border-b border-gray-100">
                    <h3 class="text-lg font-bold text-gray-800">Transferencia entre Cuentas</h3>
                    <p class="text-xs text-gray-500 mt-1">Mueve dinero sin afectar tu balance general</p>
                </div>
                
                <form id="transfer-form" onsubmit="handleTransferSubmit(event)" class="p-6 space-y-4">
                    ${renderFormGroup('Cuenta de Origen (Sale dinero)', `
                        <select id="trans-source" required class="w-full p-3 border border-gray-200 rounded-xl bg-gray-50 text-sm">
                            <option value="">-- Seleccionar --</option>
                            ${savings.map(s => `<option value="${s.id}">${s.name} (${formatCurrency(s.saldo)})</option>`).join('')}
                        </select>
                    `)}

                    ${renderFormGroup('Cuenta de Destino (Entra dinero)', `
                        <select id="trans-dest" required class="w-full p-3 border border-gray-200 rounded-xl bg-gray-50 text-sm">
                            <option value="">-- Seleccionar --</option>
                            ${savings.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}
                        </select>
                    `)}

                    ${renderFormGroup('Monto a Transferir', `
                        <input type="number" id="trans-amount" required min="1" placeholder="$ 0" 
                        class="w-full p-3 border border-gray-200 rounded-xl text-lg font-bold text-emerald-600 placeholder-gray-300">
                    `)}

                    <div class="flex gap-3 mt-6 pt-2">
                        <button type="button" onclick="hideTransferModal()" class="flex-1 py-3 bg-gray-100 text-gray-600 rounded-xl font-bold text-xs hover:bg-gray-200">CANCELAR</button>
                        <button type="submit" class="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-bold text-xs hover:bg-emerald-700 shadow-md">CONFIRMAR</button>
                    </div>
                </form>
            </div>
        </div>
    `;
}

// --- LOGICA DE NEGOCIO ORIGINAL (CUENTAS) ---

// 1. Crear Nueva Cuenta
async function handleAccountSubmit(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.innerText = "Guardando...";

    const name = document.getElementById('acc-name').value;
    const saldo = parseFloat(document.getElementById('acc-balance').value) || 0;
    const retention = parseInt(document.getElementById('acc-retention')?.value || 4, 10) || 0;
    const nowColombia = getColombiaNow();
    try {
        await addDoc(getCollectionRef('ahorros'), {
            name: name,
            saldo: saldo,
            retention_per_mille: retention,
            created_at: nowColombia.timestampMs,
            createdAtColombia: nowColombia,
            dateKey: nowColombia.dateKey,
            timeKey: nowColombia.timeKey,
            weekday: nowColombia.weekday
        });
        e.target.reset();
    } catch (error) {
        console.error("Error creando cuenta:", error);
        alert("Error al crear la cuenta");
    } finally {
        btn.disabled = false;
        btn.innerText = "CREAR CUENTA";
    }
}

// 2. Lógica de Transferencia
async function handleTransferSubmit(e) {
    e.preventDefault();
    
    const sourceId = document.getElementById('trans-source').value;
    const destId = document.getElementById('trans-dest').value;
    const amount = parseFloat(document.getElementById('trans-amount').value);

    if (sourceId === destId) {
        alert("La cuenta de origen y destino no pueden ser la misma.");
        return;
    }
    if (!amount || amount <= 0) {
        alert("Ingresa un monto válido.");
        return;
    }

    const sourceAccount = savings.find(s => s.id === sourceId);
    if (sourceAccount && sourceAccount.saldo < amount) {
        if(!confirm(`La cuenta ${sourceAccount.name} solo tiene ${formatCurrency(sourceAccount.saldo)}. ¿Deseas continuar?`)) return;
    }

    try {
        const batch = writeBatch(db);
        const sourceRef = doc(getCollectionRef('ahorros'), sourceId);
        const destRef = doc(getCollectionRef('ahorros'), destId);

        batch.update(sourceRef, { saldo: increment(-amount) });
        batch.update(destRef, { saldo: increment(amount) });

        await batch.commit();
        hideTransferModal();
        alert("Transferencia exitosa ✅");

    } catch (error) {
        console.error("Error en transferencia:", error);
        alert("Error al transferir: " + error.message);
    }
}

// 3. Eliminar Cuenta
// 3. Eliminar Cuenta
function deleteAccountWrapper(id, name) {
    // NUEVO: Validación estricta de seguridad
    const cuenta = savings.find(s => s.id === id);
    if (cuenta && Math.abs(parseFloat(cuenta.saldo || 0)) > 0.01) {
        alert(`❌ No puedes eliminar la cuenta "${name}" porque tiene fondos (${formatCurrency(cuenta.saldo)}).\n\nDebes transferir o retirar el dinero para dejarla en $0 antes de poder eliminarla.`);
        return; // Detiene la ejecución
    }

    if (typeof showGeneralConfirmModal === 'function') {
        showGeneralConfirmModal(id, name, 'Cuenta', async (docId) => {
            await deleteDoc(doc(getCollectionRef('ahorros'), docId));
        }, "Se perderá el historial de saldo de esta cuenta.");
    } else {
        if (confirm(`¿Eliminar cuenta ${name}?`)) {
            deleteDoc(doc(getCollectionRef('ahorros'), id));
        }
    }
}

// --- UI HELPERS ---
function showTransferModal() {
    const modal = document.getElementById('transfer-modal');
    if (modal) modal.classList.remove('hidden');
}

function hideTransferModal() {
    const modal = document.getElementById('transfer-modal');
    if (modal) {
        modal.classList.add('hidden');
        document.getElementById('transfer-form').reset();
    }
}


// Pequeno script para ocultar el input de valor si es "Remanente"
window.toggleRuleValueInput = (type) => {
    const container = document.getElementById('rule-value-container');
    const input = document.getElementById('rule-value');
    if (type === 'REMANENTE') {
        container.style.opacity = '0.3';
        input.disabled = true;
        input.value = '';
    } else {
        container.style.opacity = '1';
        input.disabled = false;
    }
};


// CONFIG: dónde se guarda la retención
const RETENTION_CFG = { collection: 'config', docId: 'retencion_4x1000' };

// Ajustes UI
window.adjustRetention = (delta) => {
  const el = document.getElementById('retention-per-mille');
  if (!el) return;
  el.value = Math.max(0, parseInt(el.value || 0) + delta);
};

window.saveRetentionConfig = async () => {
  try {
    const rate = parseInt(document.getElementById('retention-per-mille').value || 0);
    const cfgRef = doc(getCollectionRef(RETENTION_CFG.collection), RETENTION_CFG.docId);
    const nowColombia = getColombiaNow();
    await setDoc(cfgRef, {
      ratePerMille: rate,
      updated_at: nowColombia.timestampMs,
      updatedAtColombia: nowColombia
    }, { merge: true });
    // actualizar acumulado en UI (si existe)
    await loadRetentionUI();
    // feedback mínimo
    alert('Retención guardada: ' + rate + ' por mil');
  } catch (err) {
    console.error('Error guardando retención', err);
    alert('Error guardando retención (ver consola).');
  }
};

async function loadRetentionUI() {
  try {
    const cfgRef = doc(getCollectionRef(RETENTION_CFG.collection), RETENTION_CFG.docId);
    const snap = await getDoc(cfgRef);
    const rate = snap.exists() ? (snap.data().ratePerMille || 4) : 4;
    const accum = snap.exists() ? (snap.data().accumulated || 0) : 0;
    const inp = document.getElementById('retention-per-mille');
    const accEl = document.getElementById('retention-accumulated');
    if (inp) inp.value = rate;
    if (accEl) accEl.innerText = formatCurrency(accum);
  } catch (e) {
    console.warn('No se pudo cargar retención:', e);
  }
}
window.loadRetentionUI = loadRetentionUI;


// ==========================================
// LÓGICA DE ARRASTRAR Y SOLTAR (DRAG & DROP)
// ==========================================

let draggedItem = null;

function dragStart(e) {
    draggedItem = e.currentTarget; // El elemento que estamos arrastrando
    e.dataTransfer.effectAllowed = 'move';
    // Un poco de transparencia visual
    setTimeout(() => draggedItem.classList.add('opacity-50', 'bg-indigo-50'), 0);
}

function dragOver(e) {
    e.preventDefault(); // Necesario para permitir el drop
    const target = e.currentTarget;
    if (target !== draggedItem) {
        // Efecto visual al pasar por encima
        target.classList.add('border-indigo-300', 'bg-gray-50');
    }
}

// Limpiar estilos al salir (opcional, pero buena práctica)
// Puedes añadir ondragleave="dragLeave(event)" en el HTML si quieres perfeccionarlo
function dragLeave(e) {
    e.currentTarget.classList.remove('border-indigo-300', 'bg-gray-50');
}

async function drop(e) {
    e.preventDefault();
    const target = e.currentTarget;
    
    // Restaurar estilos visuales
    target.classList.remove('border-indigo-300', 'bg-gray-50');
    draggedItem.classList.remove('opacity-50', 'bg-indigo-50');

    if (target && target !== draggedItem) {
        // 1. Reordenar visualmente en el DOM primero (para feedback instantáneo)
        const list = document.getElementById('sortable-list');
        const allItems = [...list.querySelectorAll('[draggable="true"]')];
        const draggedIndex = allItems.indexOf(draggedItem);
        const targetIndex = allItems.indexOf(target);

        if (draggedIndex < targetIndex) {
            target.after(draggedItem);
        } else {
            target.before(draggedItem);
        }

        // 2. Actualizar prioridades en Firebase
        await updatePrioritiesInFirebase();
    }
}

async function updatePrioritiesInFirebase() {
    const list = document.getElementById('sortable-list');
    const items = list.querySelectorAll('[draggable="true"]');
    
    // Preparamos un batch para hacer todas las actualizaciones en una sola petición
    const batch = writeBatch(db);
    let changeCount = 0;

    items.forEach((item, index) => {
        const docId = item.getAttribute('data-id');
        const newPriority = index + 1; // Prioridad basada en el nuevo orden (1, 2, 3...)
        
        // Solo actualizamos si la prioridad cambió
        // (Aunque para asegurar consistencia, podemos actualizar todo)
        const ref = doc(getCollectionRef('reglas_distribucion'), docId);
        batch.update(ref, { priority: newPriority });
        changeCount++;
    });

    if (changeCount > 0) {
        try {
            // Mostrar un indicador de "Guardando orden..." si quieres
            await batch.commit();
            console.log("Orden actualizado exitosamente");
            // No es necesario recargar renderAhorros() porque el listener lo hará automáticamente
        } catch (error) {
            console.error("Error actualizando prioridades:", error);
            alert("No se pudo guardar el nuevo orden");
        }
    }
}

// FILE: ahorros.js
// Reemplaza tu handleRuleSubmit actual por esta versión optimizada:
async function handleRuleSubmit(e) {
    e.preventDefault();
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.innerText = "GUARDANDO...";

    const name = (document.getElementById('rule-name').value || '').trim();
    const type = document.getElementById('rule-type').value;
    const value = parseFloat(document.getElementById('rule-value').value) || 0;

    if (!name) {
        alert('Nombre de la regla requerido');
        submitBtn.disabled = false;
        return;
    }

    try {
        const nowColombia = getColombiaNow();
        // 1. Calcular prioridad
        const maxPriority = (reglasDistribucion.length > 0)
            ? Math.max(...reglasDistribucion.map(r => Number(r.priority || 0)))
            : 0;

        // 2. Crear el bolsillo primero
        const newPocketRef = await addDoc(getCollectionRef('bolsillos_utilidad'), {
            name,
            saldo: 0,
            created_at: nowColombia.timestampMs,
            updated_at: nowColombia.timestampMs,
            createdAtColombia: nowColombia,
            updatedAtColombia: nowColombia,
            dateKey: nowColombia.dateKey,
            timeKey: nowColombia.timeKey,
            weekday: nowColombia.weekday
        });

        // 3. Crear la regla vinculada al nuevo bolsillo
        await addDoc(getCollectionRef('reglas_distribucion'), {
            name,
            type,
            value,
            priority: maxPriority + 1,
            bolsilloId: newPocketRef.id,
            created_at: nowColombia.timestampMs,
            createdAtColombia: nowColombia,
            dateKey: nowColombia.dateKey,
            timeKey: nowColombia.timeKey,
            weekday: nowColombia.weekday
        });

        e.target.reset();
        // Feedback visual inmediato
        if (typeof renderAhorros === 'function') renderAhorros();

    } catch (error) {
        console.error('Error creando regla:', error);
        alert('Error al guardar. Intenta de nuevo.');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerText = "CREAR REGLA";
    }
}
// Localiza y reemplaza tu función deleteRuleWrapper por esta:
async function deleteRuleWrapper(id, name) {
    // 1. Buscamos la regla en el estado local para obtener el ID del bolsillo asociado
    const regla = reglasDistribucion.find(r => r.id === id);
    const bolsilloId = regla?.bolsilloId;

    // NUEVO: Validar saldo del bolsillo antes de eliminar
    const bolsillo = bolsillosUtilidad.find(b => b.id === bolsilloId || b.name === name);
    if (bolsillo && Math.abs(parseFloat(bolsillo.saldo || 0)) > 0.01) {
        alert(`❌ No puedes eliminar la regla "${name}" porque su bolsillo tiene fondos (${formatCurrency(bolsillo.saldo)}).\n\nDebes transferir ese dinero a una cuenta o registrar un gasto antes de poder eliminar la regla.`);
        return; // Detiene la ejecución
    }

    const confirmacion = confirm(
        `¿Eliminar la regla "${name}"?\n\n⚠️ ATENCIÓN: Esto también eliminará permanentemente el registro de este bolsillo.`
    );

    if (confirmacion) {
        try {
            const batch = writeBatch(db);
            
            // Referencia a la regla
            const reglaRef = doc(getCollectionRef('reglas_distribucion'), id);
            batch.delete(reglaRef);

            // Referencia al bolsillo (si existe)
            if (bolsilloId) {
                const bolsilloRef = doc(getCollectionRef('bolsillos_utilidad'), bolsilloId);
                batch.delete(bolsilloRef);
            }

            await batch.commit();
            
            // Forzamos el re-render en caso de que el listener de store.js tenga lag
            if (typeof renderAhorros === 'function') {
                setTimeout(() => renderAhorros(), 300); 
            }
            
            console.log(`Regla y bolsillo "${name}" eliminados con éxito.`);
        } catch (error) {
            console.error("Error al eliminar regla completa:", error);
            alert("Hubo un error al intentar eliminar todos los datos vinculados.");
        }
    }
}

// ==========================================
// MODAL Y LÓGICA DE GASTOS DESDE BOLSILLOS
// ==========================================

// ==========================================
// MODAL Y LÓGICA DE GASTOS DESDE BOLSILLOS (ESTILO TRASPASOS)
// ==========================================

// ==========================================
// MODAL Y LÓGICA DE GASTOS DESDE BOLSILLOS (VERSIÓN SIMPLE)
// ==========================================

function renderPocketExpenseModal() {
    return `
        <div id="pocket-expense-modal" class="fixed inset-0 bg-black/60 hidden z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div class="bg-white rounded-2xl max-w-sm w-full shadow-2xl transform transition-all scale-100">
                <div class="p-6 border-b border-gray-100 flex justify-between items-center">
                    <div>
                        <h3 class="text-lg font-bold text-gray-800">Registrar Pago / Gasto</h3>
                        <p class="text-xs text-gray-500 mt-1">El dinero saldrá directamente del bolsillo</p>
                    </div>
                    <button onclick="hidePocketExpenseModal()" class="text-gray-400 hover:text-red-500 text-xl font-bold">✕</button>
                </div>
                
                <form id="pocket-expense-form" onsubmit="handlePocketExpenseSubmit(event)" class="p-6 space-y-4">
                    <input type="hidden" id="pocket-expense-id">
                    <input type="hidden" id="pocket-expense-max" value="0">
                    
                    <div class="bg-indigo-50 p-4 rounded-xl border border-indigo-100 text-center mb-4 shadow-inner">
                        <p class="text-[10px] uppercase font-bold text-indigo-400 tracking-widest">Bolsillo Seleccionado</p>
                        <p id="pocket-expense-name" class="text-xl font-black text-indigo-800 my-1"></p>
                        <p class="text-xs text-indigo-600 mt-1 bg-white inline-block px-3 py-1 rounded-full font-bold border border-indigo-100 shadow-sm">
                            Disponible: <span id="pocket-expense-available"></span>
                        </p>
                    </div>

                    ${renderFormGroup('Monto a Gastar / Retirar', `
                        <input type="number" id="pocket-expense-amount" required min="1" step="0.01" placeholder="$ 0" 
                        class="w-full p-3 border border-gray-200 rounded-xl text-xl font-black text-indigo-600 placeholder-gray-300 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all text-center">
                    `)}

                    ${renderFormGroup('Descripción / Motivo del Gasto', `
                        <input type="text" id="pocket-expense-desc" required placeholder="Ej: Pago recibo de la luz..." 
                        class="w-full p-3 border border-gray-200 rounded-xl text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 transition-all">
                    `)}

                    <div class="flex gap-3 mt-6 pt-2">
                        <button type="submit" class="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 shadow-md transition-all active:scale-95 flex justify-center items-center gap-2">
                            <i class="fa-solid fa-check"></i> CONFIRMAR GASTO
                        </button>
                    </div>
                </form>
            </div>
        </div>
    `;
}

function showPocketExpenseModal(id, name, available) {
    if (!id || id === 'undefined') {
        alert("Este bolsillo no tiene un ID válido.");
        return;
    }
    
    document.getElementById('pocket-expense-id').value = id;
    document.getElementById('pocket-expense-max').value = available; // Guardamos el tope máximo
    document.getElementById('pocket-expense-name').innerText = name;
    document.getElementById('pocket-expense-available').innerText = formatCurrency(available);
    
    const amountInput = document.getElementById('pocket-expense-amount');
    amountInput.max = available; // Evita que gaste más de lo que hay
    amountInput.value = '';
    document.getElementById('pocket-expense-desc').value = '';
    
    document.getElementById('pocket-expense-modal').classList.remove('hidden');
}

function hidePocketExpenseModal() {
    const modal = document.getElementById('pocket-expense-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

async function handlePocketExpenseSubmit(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    
    const id = document.getElementById('pocket-expense-id').value;
    const name = document.getElementById('pocket-expense-name').innerText;
    const amount = parseFloat(document.getElementById('pocket-expense-amount').value);
    const desc = document.getElementById('pocket-expense-desc').value;
    const maxPocket = parseFloat(document.getElementById('pocket-expense-max').value) || 0;
    
    if (!id || amount <= 0) return;

    if (amount > maxPocket) {
        alert(`❌ No puedes gastar más de lo que hay en el bolsillo (${formatCurrency(maxPocket)}).`);
        return;
    }
    
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> PROCESANDO...`;

    try {
        const batch = writeBatch(db);
        const nowColombia = getColombiaNow();
        
        // 1. Descontar el dinero directamente del bolsillo
        const bolsilloRef = doc(getCollectionRef('bolsillos_utilidad'), id);
        batch.update(bolsilloRef, {
            saldo: increment(-amount),
            updated_at: nowColombia.timestampMs,
            updatedAtColombia: nowColombia
        });
        
        // 2. Generar la transacción para que quede en el historial de Balance
        const transRef = doc(getCollectionRef('transacciones'));
        batch.set(transRef, {
            id: transRef.id,
            type: 'EGRESO',
            category: 'GASTO_UTILIDAD',
            amount: amount,
            description: `Gasto de bolsillo [${name}]: ${desc}`,
            date: nowColombia.timestampMs,
            timestamp: nowColombia.timestampMs,
            dateColombia: nowColombia,
            createdAtColombia: nowColombia,
            updatedAtColombia: nowColombia,
            dateKey: nowColombia.dateKey,
            timeKey: nowColombia.timeKey,
            weekday: nowColombia.weekday,
            status: 'ACTIVA',
            is_system_generated: true,
            utility_pocket_id: id 
        });
        
        await batch.commit();
        hidePocketExpenseModal();
        
        // Refrescar la pantalla
        if (typeof renderAhorros === 'function') {
            setTimeout(() => renderAhorros(), 300); 
        }
        alert("✅ Gasto registrado y descontado del bolsillo exitosamente.");
        
    } catch (error) {
        console.error("Error registrando gasto de bolsillo:", error);
        alert("Ocurrió un error al procesar el gasto.");
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-check"></i> CONFIRMAR GASTO`;
    }
}
