import { 
  transfers, 
  transferCostsConfig, 
  transferSearchTerm, 
  setTransferSearchTerm,
  soatClasses,
  soatCcRanges,
  soatPrices,
  getVehicleAvaluos, 
  setSavings,
  savings,
  reglasDistribucion,
  bolsillosUtilidad
} from '../store/store.js';

import { getCollectionRef } from '../services/listeners.js';
import { doc, setDoc, deleteDoc, writeBatch, updateDoc, arrayUnion, arrayRemove } from "firebase/firestore";

import { renderHeader, renderFormGroup, formatCurrency, showGeneralConfirmModal, escapeHtml } from '../utils/utils.js';
import { anularTransaccion } from './balance.js';
import { calcularDistribucionUtilidad } from '../utils/financeLogic.js';
import { getColombiaNow } from '../utils/colombiaTime.js';

/* ======================================================
 EXPOSICIÓN GLOBAL
====================================================== */
window.showTransferExpenseModal = showTransferExpenseModal;
window.hideTransferExpenseModal = hideTransferExpenseModal;
window.deleteCostConfigWrapper = deleteCostConfigWrapper;
window.deleteSoatClassWrapper = deleteSoatClassWrapper;
window.deleteSoatCCRangeWrapper = deleteSoatCCRangeWrapper;
window.deleteSoatPriceWrapper = deleteSoatPriceWrapper;
window.updateTransferCostCalculation = updateTransferCostCalculation;
window.renderAvaluosConfig = renderAvaluosConfig;
window.selectAvaluoBrand = selectAvaluoBrand;
window.deleteAvaluoWrapper = deleteAvaluoWrapper;

window.revertirTraspasoPendiente = revertirTraspasoPendiente;

// Nuevas funciones exportadas/globales para edición
window.showEditTransferModal = showEditTransferModal;
window.hideEditTransferModal = hideEditTransferModal;
window.showEditCostConfigModal = showEditCostConfigModal;
window.hideEditCostConfigModal = hideEditCostConfigModal;
window.showEditAvaluoModal = showEditAvaluoModal;
window.hideEditAvaluoModal = hideEditAvaluoModal;

window.updateTransferExpenseTotal = updateTransferExpenseTotal;

/* ======================================================
 CONFIG (ajustable)
====================================================== */
const TRANSFERS_COLLECTION = 'traspasos'; // <-- Cambia si tu colección tiene otro nombre

/* ======================================================
 ESTILOS GLOBALES
====================================================== */
const styles = `
<link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">
<link href="https://fonts.googleapis.com/css2?family=Urbanist:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<style>
body { font-family: 'Urbanist', sans-serif; background-color: #F8FAFC; color: #1E293B; }

/* Inputs Modernos */
.input-visual { width: 100%; padding: 0.6rem 1rem; border: 1px solid #CBD5E1; border-radius: 0.5rem; outline: none; font-weight: 600; background-color: white; transition: all 0.2s ease; font-size: 0.95rem; color: #334155; }
.input-visual:focus { border-color: #7C3AED; box-shadow: 0 0 0 4px rgba(124, 58, 237, 0.1); }
.input-visual::placeholder { color: #94A3B8; font-weight: 400; }

.card-modern { background: white; border-radius: 1rem; border: 1px solid #E2E8F0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); overflow: hidden; }

.btn-primary { background: linear-gradient(135deg, #6366F1 0%, #4F46E5 100%); color: white; font-weight: 700; border-radius: 0.75rem; transition: all 0.2s; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.25); padding: 0.6rem 1.2rem; }
.btn-primary:hover { transform: translateY(-1px); box-shadow: 0 6px 16px rgba(79, 70, 229, 0.35); }
.btn-primary:active { transform: translateY(0); }

.btn-danger { background: #FEF2F2; color: #DC2626; border: 1px solid #FECACA; font-weight: 600; border-radius: 0.5rem; padding: 0.4rem 0.8rem; transition: all 0.2s; }
.btn-danger:hover { background: #DC2626; color: white; }

.nav-pill { padding: 0.6rem 1.5rem; border-radius: 999px; font-weight: 700; font-size: 0.85rem; cursor: pointer; transition: all 0.2s; color: #64748B; border: 1px solid transparent; }
.nav-pill:hover { background-color: #F1F5F9; color: #334155; }
.nav-pill.active { background-color: #1E293B; color: white; box-shadow: 0 4px 12px rgba(30, 41, 59, 0.2); border-color: #1E293B; }

.table-header { font-size: 0.7rem; text-transform: uppercase; font-weight: 800; color: #64748B; letter-spacing: 0.05em; background-color: #F8FAFC; padding: 1rem; border-bottom: 1px solid #E2E8F0; }

::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: #94A3B8; }

/* Modal mínimo (no rompe diseño principal) */
.modal-backdrop { position: fixed; inset: 0; background: rgba(2,6,23,0.55); display:flex; align-items:center; justify-content:center; z-index:60; }
.modal-card { width: 96%; max-width:760px; border-radius:0.75rem; padding:1rem; background:white; box-shadow:0 10px 30px rgba(2,6,23,0.4); }
.modal-header { display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:8px; }
.modal-close { background:transparent; border: none; font-size:1.1rem; cursor:pointer; color:#64748B; }
.hidden { display:none !important; }
</style>
`;

/* ======================================================
 RENDERIZADO PRINCIPAL
====================================================== */
export async function renderTraspasos() {
  const contentDiv = document.getElementById('content');
  if (!contentDiv) return;

  // 1. Header
  contentDiv.innerHTML = await renderHeader(
    'Gestión de Traspasos',
    `Configuración y seguimiento de servicios de gestoría. Total: ${transfers.length} ${styles}`
  );

  // 2. Contenedor Principal
  contentDiv.insertAdjacentHTML('beforeend', `
    <div class="max-w-7xl mx-auto">

      <div class="flex flex-wrap gap-2 mb-6 bg-white p-2 rounded-full border border-slate-200 shadow-sm w-fit">
        ${renderTabButton('tab-history', 'Historial', true)}
        ${renderTabButton('tab-costs', 'Costos por Ciudad')}
        ${renderTabButton('tab-avaluos', 'Avalúos Vehículos')}
        ${renderTabButton('tab-soat', 'Precios SOAT')}
        ${renderTabButton('tab-start', 'Nuevo Traspaso')}
      </div>

      <div id="tab-history" class="tab-content animate-fade-in">
        ${renderTransfersHistory()}
      </div>

      <div id="tab-costs" class="tab-content hidden animate-fade-in">
        ${renderTraspasosConfig(true)}
      </div>

      <div id="tab-avaluos" class="tab-content hidden animate-fade-in"></div>

      <div id="tab-soat" class="tab-content hidden animate-fade-in">
        ${renderSoatPriceConfig(true)}
      </div>

      <div id="tab-start" class="tab-content hidden animate-fade-in">
        ${renderInicioTraspaso()}
      </div>
    </div>

    <!-- ================= MODAL EDITAR TRASPASO ================= -->
    <div id="edit-transfer-modal" class="modal-backdrop hidden" aria-hidden="true">
      <div class="modal-card">
        <div class="modal-header">
          <h3 class="text-lg font-bold text-slate-800">Editar Traspaso</h3>
          <button class="modal-close" onclick="hideEditTransferModal()">✕</button>
        </div>

        <form id="edit-transfer-form" class="space-y-3">
          <input type="hidden" id="edit-transfer-id">

          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label class="text-xs font-bold text-slate-400 uppercase">Placa</label>
              <input id="edit-transfer-placa" class="input-visual" required>
            </div>

            <div>
              <label class="text-xs font-bold text-slate-400 uppercase">Cliente</label>
              <input id="edit-transfer-client" class="input-visual" required>
            </div>

            <div>
              <label class="text-xs font-bold text-slate-400 uppercase">Ciudad (ID)</label>
              <input id="edit-transfer-city" class="input-visual uppercase">
            </div>

            <div>
              <label class="text-xs font-bold text-slate-400 uppercase">Valor Vehículo</label>
              <input id="edit-transfer-vehicle-value" type="number" class="input-visual">
            </div>

            <div>
              <label class="text-xs font-bold text-slate-400 uppercase">Ingreso (Servicio)</label>
              <input id="edit-transfer-service-cost" type="number" class="input-visual">
            </div>

            <div>
              <label class="text-xs font-bold text-slate-400 uppercase">Gastos Totales</label>
              <input id="edit-transfer-total-expenses" type="number" class="input-visual">
            </div>
          </div>

          <div class="flex justify-end gap-2">
            <button type="button" class="btn-danger" onclick="hideEditTransferModal()">Cancelar</button>
            <button type="submit" class="btn-primary">
              <i class="fa-solid fa-check mr-2"></i> Guardar cambios
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- ================= MODAL GASTO TRASPASO (NUEVO / CORRECTO) ================= -->
<div id="transfer-expense-modal" class="fixed inset-0 bg-black/60 hidden z-50 flex items-center justify-center p-4 backdrop-blur-sm" aria-hidden="true">
        <div class="bg-white rounded-2xl max-w-md w-full shadow-2xl transform transition-all scale-100 flex flex-col max-h-[90vh]">
            
            <div class="p-5 border-b border-gray-100 flex justify-between items-center shrink-0">
                <div>
                    <h3 class="text-lg font-bold text-gray-800">Registrar Gasto de Traspaso</h3>
                    <p class="text-xs text-gray-500 mt-1">El monto se debitará de las cuentas elegidas</p>
                </div>
                <button type="button" onclick="hideTransferExpenseModal()" class="text-gray-400 hover:text-red-500 text-2xl leading-none font-bold">✕</button>
            </div>
            
            <div class="p-6 overflow-y-auto custom-scrollbar">
                <form id="transfer-expense-form" class="space-y-5">
                    <input type="hidden" id="transfer-expense-id">
                    <input type="hidden" id="transfer-expense-max" value="0">
                    
                    <div class="bg-indigo-50 p-4 rounded-xl border border-indigo-100 text-center shadow-inner">
                        <p class="text-[10px] uppercase font-bold text-indigo-400 tracking-widest">Placa Vinculada</p>
                        <p id="transfer-expense-info" class="text-xl font-black text-indigo-800 my-1"></p>
                        
                        <p class="text-xs text-indigo-600 mt-1 bg-white inline-block px-3 py-1 rounded-full font-bold border border-indigo-100 shadow-sm">
                            Gastos Permitidos: <span id="transfer-expense-max-display"></span>
                        </p>
                    </div>

                    <div>
                        <label class="block text-[10px] font-bold text-gray-500 uppercase tracking-wide mb-2">
                            ¿De qué cuenta física sale el dinero?
                        </label>
                        <div id="transfer-expense-accounts" class="space-y-2 max-h-48 overflow-y-auto p-2 border border-gray-200 rounded-xl bg-gray-50">
                            </div>
                    </div>

                    <div class="flex items-center justify-between bg-gray-100 p-4 rounded-xl border border-gray-200 mt-2">
                        <span class="text-sm font-bold text-gray-600 uppercase">Total a Pagar:</span>
                        <span id="transfer-expense-total" class="text-2xl font-black text-indigo-600">$ 0</span>
                    </div>

                    <div class="pt-2 border-t border-gray-100">
                        <button type="submit" class="w-full py-3.5 bg-indigo-600 text-white rounded-xl font-bold text-sm hover:bg-indigo-700 shadow-md transition-all active:scale-95 flex justify-center items-center gap-2">
                            <i class="fa-solid fa-check"></i> CONFIRMAR GASTO
                        </button>
                    </div>
                </form>
            </div>
        </div>
    </div>

    <!-- ================= MODAL EDITAR COSTOS ================= -->
    <div id="edit-cost-config-modal" class="modal-backdrop hidden" aria-hidden="true">
      <div class="modal-card">
        <div class="modal-header">
          <h3 class="text-lg font-bold text-slate-800">Editar Configuración de Ciudad</h3>
          <button class="modal-close" onclick="hideEditCostConfigModal()">✕</button>
        </div>

        <form id="edit-cost-config-form" class="space-y-3">
          <input type="hidden" id="edit-cost-config-id">

          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label class="text-xs font-bold text-slate-400 uppercase">Ciudad (ID)</label>
              <input id="edit-cost-city-id" class="input-visual uppercase" required>
            </div>
            <div>
              <label class="text-xs font-bold text-slate-400 uppercase">RUNT</label>
              <input id="edit-cost-runt" type="number" class="input-visual" required>
            </div>
            <div>
              <label class="text-xs font-bold text-slate-400 uppercase">Estampillas</label>
              <input id="edit-cost-stamps" type="number" class="input-visual" required>
            </div>
            <div>
              <label class="text-xs font-bold text-slate-400 uppercase">Tramitador</label>
              <input id="edit-cost-agent" type="number" class="input-visual" required>
            </div>
            <div>
              <label class="text-xs font-bold text-slate-400 uppercase">Derechos</label>
              <input id="edit-cost-transfer-rights" type="number" class="input-visual" required>
            </div>
            <div>
              <label class="text-xs font-bold text-slate-400 uppercase">Ganancia</label>
              <input id="edit-cost-profit" type="number" class="input-visual" required>
            </div>
          </div>

          <div class="flex justify-end gap-2">
            <button type="button" class="btn-danger" onclick="hideEditCostConfigModal()">Cancelar</button>
            <button type="submit" class="btn-primary">
              <i class="fa-solid fa-check mr-2"></i> Guardar cambios
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- ================= MODAL EDITAR AVALÚO ================= -->
    <div id="edit-avaluo-modal" class="modal-backdrop hidden" aria-hidden="true">
      <div class="modal-card">
        <div class="modal-header">
          <h3 class="text-lg font-bold text-slate-800">Editar Avalúo</h3>
          <button class="modal-close" onclick="hideEditAvaluoModal()">✕</button>
        </div>

        <form id="edit-avaluo-form" class="space-y-3">
          <input type="hidden" id="edit-avaluo-id">

          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label class="text-xs font-bold text-slate-400 uppercase">Marca</label>
              <input id="edit-avaluo-brand" class="input-visual uppercase" required>
            </div>
            <div>
              <label class="text-xs font-bold text-slate-400 uppercase">Modelo</label>
              <input id="edit-avaluo-model" class="input-visual uppercase" required>
            </div>
            <div>
              <label class="text-xs font-bold text-slate-400 uppercase">Cilindraje (cc)</label>
              <input id="edit-avaluo-cylinder" type="number" class="input-visual">
            </div>
            <div>
              <label class="text-xs font-bold text-slate-400 uppercase">Año</label>
              <input id="edit-avaluo-year" type="number" class="input-visual">
            </div>
            <div class="col-span-1 md:col-span-2">
              <label class="text-xs font-bold text-slate-400 uppercase">Valor Comercial</label>
              <input id="edit-avaluo-value" type="number" class="input-visual">
            </div>
          </div>

          <div class="flex justify-end gap-2">
            <button type="button" class="btn-danger" onclick="hideEditAvaluoModal()">Cancelar</button>
            <button type="submit" class="btn-primary">
              <i class="fa-solid fa-check mr-2"></i> Guardar cambios
            </button>
          </div>
        </form>
      </div>
    </div>
  `);

  updateAvaluosTab();

  window.addEventListener('vehicleAvaluosUpdated', updateAvaluosTab);

  window.addEventListener('soatPricesUpdated', () => {
    const tabSoat = document.getElementById('tab-soat');
    if (tabSoat) tabSoat.innerHTML = renderSoatPriceConfig(true);
  });

  window.addEventListener('transferCostsUpdated', () => {
    const tabCosts = document.getElementById('tab-costs');
    if (tabCosts) tabCosts.innerHTML = renderTraspasosConfig(true);
  });

  window.addEventListener('transfersUpdated', () => {
    const tbody = document.getElementById('transfers-table-body');
    if (tbody) tbody.innerHTML = renderTransfersTableRows();
  });

  attachEventListeners();
}

function updateAvaluosTab() {
const tabAvaluosEl = document.getElementById('tab-avaluos');
if (tabAvaluosEl) {
    tabAvaluosEl.innerHTML = renderAvaluosConfig(true);
}
}

function renderTabButton(id, label, active = false) {
  return `
      <button data-tab-button="${id}" onclick="switchTab('${id}', this)" class="nav-pill ${active ? 'active' : ''}">
          ${label}
      </button>
  `;
}

window.switchTab = function (id, btn) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.add('hidden'));
  const target = document.getElementById(id);
  if (target) target.classList.remove('hidden');

  document.querySelectorAll('[data-tab-button]').forEach(b => {
      b.classList.remove('active');
  });

  if (btn) btn.classList.add('active');
};

/* ======================================================
 HISTORIAL (Diseño Mejorado) - agregué botón editar
====================================================== */
function renderTransfersHistory() {
  return `
      <div class="card-modern p-6">
          <div class="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
              <h2 class="text-xl font-bold text-slate-800 flex items-center gap-2">
                  <i class="fa-solid fa-clock-rotate-left text-indigo-500"></i> Historial de Trámites
              </h2>
              <div class="relative w-full md:w-72">
                  <i class="fa-solid fa-search absolute left-3 top-3 text-slate-400"></i>
                  <input type="text" id="transfer-search" value="${transferSearchTerm}" placeholder="Buscar placa o cliente..." class="input-visual pl-10">
              </div>
          </div>

          <div class="overflow-x-auto rounded-lg border border-slate-100">
              <table class="w-full text-left border-collapse">
                  <thead>
                      <tr>
                          <th class="table-header">Placa / Cliente</th>
                          
                          <th class="table-header">Ingreso</th>
                          <th class="table-header">Gastos Totales</th>
                          <th class="table-header">Utilidad</th>
                          <th class="table-header">Estado</th>
                          <th class="table-header text-center">Acciones</th>
                      </tr>
                  </thead>
                  <tbody id="transfers-table-body" class="divide-y divide-slate-50">
                      ${renderTransfersTableRows()}
                  </tbody>
              </table>
          </div>
          <p id="transfers-list-status" class="text-center text-slate-400 mt-8 hidden italic">No se encontraron resultados.</p>
      </div>
  `;
}

function renderTransfersTableRows() {
  const term = (transferSearchTerm || "").toLowerCase();
  const filtered = (transfers || []).filter(t => {
      const placa = (t.placa || "").toLowerCase();
      const cliente = (t.client_name || t.clientName || "").toLowerCase();
      return placa.includes(term) || cliente.includes(term);
  }).sort((a, b) => {
      const dateA = a.timestamp?.seconds || new Date(a.timestamp).getTime() || 0;
      const dateB = b.timestamp?.seconds || new Date(b.timestamp).getTime() || 0;
      return dateB - dateA;
  });

  if (filtered.length === 0) {
      return `<tr><td colspan="6" class="p-8 text-center text-slate-400">Sin datos para mostrar.</td></tr>`;
  }

  return filtered.map(t => {
      const serviceCost = parseFloat(t.service_cost || 0);
      const totalExpenses = parseFloat(t.total_expenses || 0);
      const utilidadNeta = serviceCost - totalExpenses;
      const utilidadClass = utilidadNeta >= 0 ? 'text-emerald-600' : 'text-red-500';
      const clientDisplayName = t.client_name || t.clientName || 'Sin Nombre';

      return `
      <tr class="hover:bg-slate-50 transition-colors" data-transfer-id="${t.id}">
      
        <!-- PLACA / CLIENTE / CIUDAD -->
        <td class="p-4">
          <div class="text-sm font-black text-slate-800 uppercase">${t.placa}</div>
          <div class="text-xs text-slate-500 font-medium">${clientDisplayName}</div>
          <span class="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-bold">
            ${t.city_id || 'N/A'}
          </span>
        </td>
      
        <!-- VALOR VEHÍCULO -->
      
      
        <!-- INGRESO SERVICIO -->
        <td class="p-4 text-sm text-indigo-600 font-bold">
          ${formatCurrency(serviceCost)}
        </td>
      
        <!-- GASTOS TOTALES -->
        <td class="p-4 text-sm text-slate-500 font-medium">
          ${formatCurrency(totalExpenses)}
        </td>
      
        <!-- UTILIDAD -->
        <td class="p-4 text-sm font-black ${utilidadClass}">
          ${formatCurrency(utilidadNeta)}
        </td>
      <td class="p-4 ">
            <!-- STATUS -->
            <span class="text-[9px] px-2 py-0.5 rounded ${
              (t.status || 'PENDIENTE') === 'PENDIENTE'
                ? 'bg-yellow-50 text-yellow-700'
                : (t.status === 'COMPLETADO'
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-slate-100 text-slate-600')
            } font-bold">
              ${t.status || 'PENDIENTE'}
            </span>
             </td>

        <!-- ACCIONES -->
<td class="p-4 text-center">
          <div class="flex items-center justify-center gap-2">
      
            ${(t.status || 'PENDIENTE') !== 'COMPLETADO' ? `
              <button
                onclick="showTransferExpenseModal('${t.id}', '${t.placa}', ${serviceCost || 0})"
                class="text-[10px] bg-white border border-slate-200 hover:border-indigo-300 hover:text-indigo-600 text-slate-500 font-bold py-1.5 px-3 rounded-lg shadow-sm transition">
                <i class="fa-solid fa-plus mr-1"></i> Gasto
              </button>
      
              <button
                onclick="revertirTraspasoPendiente('${t.id}', '${t.source_transaction_id}')"
                class="text-[10px] bg-white border border-slate-200 hover:border-red-300 hover:text-red-500 text-slate-500 font-bold py-1.5 px-3 rounded-lg shadow-sm transition">
                <i class="fa-solid fa-rotate-left mr-1"></i> Revertir
              </button>
            ` : `
              <span class="text-[10px] text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-1.5 rounded-lg font-bold">
                <i class="fa-solid fa-lock mr-1"></i> Cerrado
              </span>
            `}
      
            <button
              onclick="showEditTransferModal('${t.id}')"
              class="text-[10px] bg-white border border-slate-200 hover:border-slate-300 hover:text-slate-700 text-slate-500 font-bold py-1.5 px-3 rounded-lg shadow-sm transition">
              <i class="fa-solid fa-pen-to-square mr-1"></i> Editar
            </button>
      
          </div>
        </td>
      
      </tr>
      `;
  }).join('');
}

/* ======================================================
 COSTOS FIJOS (Diseño Mejorado) - agregué botón editar
====================================================== */
function renderTraspasosConfig(isTab = false) {
  const listRows = transferCostsConfig.map(c => {
       const totalFixed = c.runt_cost + c.stamps_cost + c.agent_fee + (c.transfer_rights_cost || 0);
       return `
          <div class="p-4 bg-white border border-slate-200 rounded-xl flex justify-between items-center shadow-sm hover:shadow-md transition group">
              <div>
                  <div class="flex items-center gap-2 mb-1">
                      <div class="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold text-xs">
                          <i class="fa-solid fa-city"></i>
                      </div>
                      <p class="font-bold text-slate-800">${c.city_name}</p>
                  </div>
                  <div class="text-[10px] text-slate-500 space-x-2">
                      <span><i class="fa-solid fa-receipt mr-1"></i>Fijo: <strong>${formatCurrency(totalFixed)}</strong></span>
                      <span class="text-emerald-600"><i class="fa-solid fa-sack-dollar mr-1"></i>Ganancia: <strong>${formatCurrency(c.configured_profit || 0)}</strong></span>
                  </div>
              </div>
              <div class="flex gap-2 items-center">
                <button onclick="showEditCostConfigModal('${c.id}')" class="w-8 h-8 rounded-full flex items-center justify-center text-slate-300 hover:bg-slate-100 hover:text-indigo-600 transition">
                    <i class="fa-solid fa-pen-to-square"></i>
                </button>
                <button onclick="deleteCostConfigWrapper('${c.id}', '${c.city_name}')" class="w-8 h-8 rounded-full flex items-center justify-center text-slate-300 hover:bg-red-50 hover:text-red-500 transition">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
              </div>
          </div>
      `;
  }).join('');

  return `
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div class="lg:col-span-5">
              <div class="card-modern p-6 sticky top-6">
                  <h3 class="text-sm font-bold text-slate-800 uppercase tracking-wide mb-4 flex items-center gap-2">
                      <span class="w-6 h-6 rounded bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs">1</span>
                      Configurar Ciudad
                  </h3>
                  
                  <form id="cost-config-form" class="space-y-4">
                      ${renderFormGroup('Ciudad (ID)', `<input type="text" id="cost-city-id" required class="input-visual uppercase font-bold" placeholder="Ej: PEREIRA">`)}
                      
                      <div class="grid grid-cols-2 gap-3">
                          ${renderFormGroup('RUNT', `<input type="number" id="cost-runt" required min="0" class="input-visual" value="0">`)}
                          ${renderFormGroup('Estampillas', `<input type="number" id="cost-stamps" required min="0" class="input-visual" value="0">`)}
                      </div>
                      
                      <div class="grid grid-cols-2 gap-3">
                          ${renderFormGroup('Tramitador', `<input type="number" id="cost-agent" required min="0" class="input-visual" value="0">`)}
                          ${renderFormGroup('Derechos', `<input type="number" id="cost-transfer-rights" required min="0" class="input-visual" value="0">`)}
                      </div>

                      ${renderFormGroup('Ganancia Fija (Servicio)', `<input type="number" id="cost-profit" required min="0" class="input-visual text-emerald-600 font-bold" value="0">`)}
                      
                      <button type="submit" class="btn-primary w-full mt-4 flex justify-center items-center gap-2">
                          <i class="fa-solid fa-floppy-disk"></i> Guardar Configuración
                      </button>
                  </form>
                  <p id="cost-config-message" class="text-xs text-center mt-3 font-medium text-emerald-500 hidden"></p>
              </div>
          </div>

          <div class="lg:col-span-7">
              <div class="card-modern p-6 h-full">
                  <h3 class="text-sm font-bold text-slate-800 uppercase tracking-wide mb-4 flex items-center gap-2">
                      <span class="w-6 h-6 rounded bg-emerald-100 text-emerald-600 flex items-center justify-center text-xs">2</span>
                      Ciudades Registradas
                  </h3>
                  <div class="space-y-3 max-h-[600px] overflow-y-auto pr-2">
                      ${listRows.length > 0 ? listRows : '<div class="p-8 text-center text-slate-400 text-sm">No hay ciudades configuradas.</div>'}
                  </div>
              </div>
          </div>
      </div>
  `;
}

/* ======================================================
 AVALÚOS (Lógica Blindada + Diseño Intacto) - agregué editar
====================================================== */
export function renderAvaluosConfig() {
  let currentData = [];
  try {
      currentData = getVehicleAvaluos();
  } catch (e) {
      currentData = [];
  }

  const groupByBrandLocal = (list) => {
      const groups = {};
      list.forEach(item => {
          const b = (item.brand || 'OTRAS').toUpperCase();
          if (!groups[b]) groups[b] = [];
          groups[b].push(item);
      });
      return groups;
  };

  const byBrand = groupByBrandLocal(currentData);
  let selectedBrand = window._avaluo_selectedBrand;
  const availableBrands = Object.keys(byBrand).sort();

  // 1. Si la marca seleccionada es NUEVA, la agregamos a la lista visual para que no se pierda
  if (selectedBrand && !availableBrands.includes(selectedBrand)) {
      availableBrands.push(selectedBrand);
      availableBrands.sort();
  }

  // 2. Solo reseteamos la selección si de verdad NO hay nada seleccionado
  if (!selectedBrand) {
      selectedBrand = availableBrands.length > 0 ? availableBrands[0] : '';
      window._avaluo_selectedBrand = selectedBrand;
  }

  const linesForBrand = byBrand[selectedBrand] || [];

  const brandsHtml = availableBrands.map(brand => {
    const active = brand === selectedBrand;
    // 3. Evitamos el crash si la marca es nueva usando un conteo seguro
    const count = byBrand[brand] ? byBrand[brand].length : 0; 
    
    return `
      <div onclick="window.selectAvaluoBrand('${escapeHtml(brand)}')" 
           class="group flex justify-between items-center px-4 py-3 rounded-xl cursor-pointer transition-all duration-200 mb-1 border border-transparent
           ${active ? 'bg-slate-800 text-white shadow-md' : 'hover:bg-white hover:border-slate-200 text-slate-600'}">
        <span class="font-bold text-sm tracking-wide">${escapeHtml(brand)}</span>
        <div class="flex items-center gap-3">
          <span class="text-[10px] px-2 py-0.5 rounded-full font-bold ${active ? 'bg-slate-600 text-slate-200' : 'bg-slate-100 text-slate-400'}">${count}</span>
        </div>
      </div>
    `;
  }).join('');

  const linesRows = linesForBrand.map(a => `
    <tr class="hover:bg-slate-50 transition border-b border-slate-50 last:border-0 group">
      <td class="p-4">
        <div class="font-bold text-slate-700">${escapeHtml(a.model || '')}</div>
      </td>
      <td class="p-4 text-slate-500 text-sm font-medium">
        ${a.cylinder_cc ? `${a.cylinder_cc} cc` : '—'}
      </td>
      <td class="p-4">
        <div class="font-bold text-slate-800">${formatCurrency(a.commercial_value || 0)}</div>
      </td>
      <td class="p-4">
        <span class="px-2 py-1 bg-slate-100 rounded text-slate-600 font-bold text-xs">${a.year || '—'}</span>
      </td>
      <td class="p-4 text-right">
        <div class="flex items-center justify-end gap-2">
          <button onclick="showEditAvaluoModal('${a.id}')" class="w-8 h-8 rounded-full flex items-center justify-center text-slate-300 hover:bg-slate-100 hover:text-indigo-600 transition"><i class="fa-solid fa-pen-to-square"></i></button>
          <button onclick="deleteAvaluoWrapper('${a.id}', '${escapeHtml(a.brand)} ${escapeHtml(a.model)}')" 
                  class="w-8 h-8 rounded-full flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 transition">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </div>
      </td>
    </tr>
  `).join('');

  /* ---------------------------
     CONTROL DE AJUSTE MASIVO
     (defínelo aquí y luego insértalo dentro del template)
     --------------------------- */
  const bulkPercentControlsHtml = `
    <div class="flex items-center gap-3 mb-4">
      <div class="flex items-center gap-2">
        <label class="text-xs font-bold text-slate-500 uppercase">Ajuste masivo</label>
      </div>

      <input id="avaluos-percentage" type="number" step="0.01" placeholder="Ej: 10"
             class="input-visual w-28" />

      <div class="flex items-center gap-2 text-xs">
        <label class="flex items-center gap-1"><input type="radio" name="avaluos-mode" value="up" checked> Subir</label>
        <label class="flex items-center gap-1"><input type="radio" name="avaluos-mode" value="down"> Bajar</label>
      </div>

      <button id="apply-avaluos-percent-btn" type="button" class="btn-primary text-xs" onclick="applyAvaluosPercentage()">
        Aplicar a TODOS
      </button>

      <button id="preview-avaluos-percent-btn" type="button" class="bg-white border border-slate-200 text-slate-600 text-xs px-3 py-2 rounded-xl"
              onclick="previewAvaluosPercentage()">
        Vista previa
      </button>
    </div>
  `;

  /* ---------------------------
     TEMPLATE PRINCIPAL (UN SOLO RETURN)
     Inserta ${bulkPercentControlsHtml} donde quieres que se muestre el control.
     Aquí lo coloco justo arriba del form (dentro del card superior).
     --------------------------- */
     return `
     <div class="flex flex-col lg:flex-row gap-6 h-auto lg:h-[calc(100vh-220px)] min-h-[600px]">
       
       <aside class="w-full lg:w-1/4 flex flex-col gap-4">
         <div class="card-modern p-1 flex-1 flex flex-col bg-slate-50/50 border border-slate-200/60">
           <div class="p-4 border-b border-slate-200/60">
             <h3 class="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Marcas (${currentData.length} Vehículos)</h3>
             <div class="flex gap-2">
               <input id="new-brand-input" type="text" placeholder="NUEVA MARCA" 
                 class="input-visual text-xs uppercase font-bold bg-white w-full p-2 border rounded-lg shadow-sm">
               <button class="bg-indigo-600 text-white w-12 rounded-lg hover:bg-indigo-700 transition flex items-center justify-center shrink-0 shadow-sm">
                 <i class="fa-solid fa-plus"></i>
               </button>
             </div>
           </div>
           <div class="flex-1 overflow-y-auto p-2 space-y-1 max-h-[160px] lg:max-h-none">
             ${brandsHtml || '<div class="p-8 text-center text-slate-400 text-xs italic">Sin marcas.</div>'}
           </div>
         </div>
       </aside>
   
       <main class="w-full lg:w-3/4 flex flex-col gap-4">
         
         <div class="card-modern p-4 lg:p-5 bg-white border border-slate-200/60 shadow-sm">
           ${bulkPercentControlsHtml}
           <form id="avaluo-form">
             <input type="hidden" id="avaluo-brand" value="${escapeHtml(selectedBrand)}">
                
             <div class="flex flex-col gap-4">
               <div>
                 <p class="text-[10px] font-black text-indigo-500 uppercase tracking-wider mb-1">Catálogo de</p>
                 <h2 class="text-2xl lg:text-3xl font-black text-slate-800 leading-none">${escapeHtml(selectedBrand || 'SELECCIONA MARCA')}</h2>
               </div>
   
               <div class="grid grid-cols-2 md:grid-cols-4 lg:flex lg:items-end gap-3 bg-slate-50 p-3 rounded-2xl border border-slate-100">
                 
                 <div class="col-span-2 lg:flex-1 lg:min-w-[140px]">
                   <label class="block text-[9px] font-bold text-slate-400 uppercase mb-1 pl-1">Modelo (Línea)</label>
                   <input type="text" id="avaluo-model" required placeholder="Ej: XTZ" 
                     class="input-visual py-2.5 text-xs uppercase font-bold bg-white w-full border rounded-xl px-3 shadow-sm">
                 </div>
   
                 <div class="col-span-1 lg:w-24">
                   <label class="block text-[9px] font-bold text-slate-400 uppercase mb-1 pl-1">CC</label>
                   <input type="number" id="avaluo-cylinder" required placeholder="125" 
                     class="input-visual py-2.5 text-xs text-center bg-white w-full border rounded-xl px-1 shadow-sm">
                 </div>
   
                 <div class="col-span-1 lg:w-24">
                   <label class="block text-[9px] font-bold text-slate-400 uppercase mb-1 pl-1">Año</label>
                   <input type="number" id="avaluo-year" required value="${new Date().getFullYear()}" 
                     class="input-visual py-2.5 text-xs text-center font-bold bg-white w-full border rounded-xl px-1 shadow-sm">
                 </div>
   
                 <div class="col-span-1 lg:w-36">
                   <label class="block text-[9px] font-bold text-slate-400 uppercase mb-1 pl-1">Valor Comercial</label>
                   <input type="number" id="avaluo-value" required placeholder="$" 
                     class="input-visual py-2.5 text-xs font-bold text-emerald-600 bg-white w-full border rounded-xl px-3 shadow-sm">
                 </div>
   
                 <div class="col-span-1 lg:w-auto">
                   <button type="submit" class="w-full bg-emerald-500 text-white rounded-xl px-4 h-[42px] lg:h-[38px] hover:bg-emerald-600 transition shadow-lg shadow-emerald-200/50 flex items-center justify-center gap-2">
                     <i class="fa-solid fa-floppy-disk"></i>
                     <span class="text-xs font-black uppercase lg:inline">Guardar</span>
                   </button>
                 </div>
   
               </div>
             </div>
           </form>
         </div>
   
         <div class="card-modern flex-1 overflow-hidden flex flex-col border border-slate-200/60 bg-white shadow-none">
           <div class="overflow-x-auto overflow-y-auto flex-1 h-full">
             <table class="w-full text-left border-collapse min-w-[500px]">
               <thead class="sticky top-0 bg-white z-10 shadow-sm">
                 <tr class="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-200">
                   <th class="p-4 bg-slate-50/50 backdrop-blur">Línea</th>
                   <th class="p-4 bg-slate-50/50 backdrop-blur">Cilindraje</th>
                   <th class="p-4 bg-slate-50/50 backdrop-blur">Valor</th>
                   <th class="p-4 bg-slate-50/50 backdrop-blur">Año</th>
                   <th class="p-4 bg-slate-50/50 backdrop-blur text-right">Acciones</th>
                 </tr>
               </thead>
               <tbody class="divide-y divide-slate-50">
                 ${linesRows || '<tr><td colspan="5" class="p-12 text-center text-slate-400">Selecciona una marca a la izquierda.</td></tr>'}
               </tbody>
             </table>
           </div>
         </div>
       </main>
     </div>
   `;
}


function selectAvaluoBrand(brand) {
  window._avaluo_selectedBrand = brand;
  const container = document.getElementById('tab-avaluos');
  if (container) container.innerHTML = renderAvaluosConfig(true);
}

/* ======================================================
 SOAT (Diseño Mejorado) - SIN EDITAR (según tu petición)
====================================================== */
function renderSoatPriceConfig(isTab = false) {
  const dataSoat = soatPrices || []; 
  
  const classOptions = dataSoat.map(c => `<option value="${c.id}">${c.nombre_clase || c.id}</option>`).join('');
  
  const priceRows = dataSoat.flatMap(categoria => 
      (categoria.opciones || []).map(opcion => `
         <div class="p-3 bg-white border border-slate-200 rounded-lg flex justify-between items-center shadow-sm hover:shadow-md transition mb-2">
             <div>
                 <p class="font-bold text-slate-800 text-xs uppercase">${categoria.nombre_clase || categoria.id} <span class="font-normal text-slate-500">| ${opcion.nombre}</span></p>
                 <p class="text-xs font-bold text-indigo-600 mt-0.5">
                    Precio: ${formatCurrency(opcion.precio)} 
                    <span class="text-emerald-600 ml-2">| Utilidad: ${formatCurrency(opcion.utilidad || 0)}</span>
                 </p>
             </div>
             <div class="flex gap-2">
                 <button onclick="openEditSoatModal('${categoria.id}', '${opcion.nombre}', ${opcion.precio}, ${opcion.utilidad || 0})" class="w-7 h-7 rounded-full flex items-center justify-center text-slate-300 hover:bg-slate-100 hover:text-indigo-600 transition">
                     <i class="fa-solid fa-pen-to-square"></i>
                 </button>
                 <button onclick="deleteSoatOption('${categoria.id}', '${opcion.nombre}', ${opcion.precio}, ${opcion.utilidad || 0})" class="w-7 h-7 rounded-full flex items-center justify-center text-slate-300 hover:bg-red-50 hover:text-red-500 transition">
                     <i class="fa-solid fa-trash-can"></i>
                 </button>
             </div>
         </div>
      `)
  ).join('');

  return `
    <div class="grid grid-cols-1 lg:grid-cols-12 gap-6 h-full relative">
        <div id="edit-soat-modal" class="hidden absolute inset-0 bg-white/90 z-50 flex items-center justify-center backdrop-blur-sm rounded-xl">
             <div class="bg-white p-6 rounded-xl shadow-2xl border border-slate-200 w-80 text-center">
                 <h3 class="text-lg font-bold text-slate-800 mb-4">Editar Precio y Utilidad</h3>
                 <input type="hidden" id="edit-soat-class-id">
                 <input type="hidden" id="edit-soat-old-name">
                 <input type="hidden" id="edit-soat-old-price">
                 <input type="hidden" id="edit-soat-old-profit">
                 
                 <div class="mb-3">
                     <label class="block text-xs font-bold text-slate-400 uppercase mb-1" id="edit-soat-title"></label>
                     <p class="text-[10px] text-slate-400 mb-1">Precio SOAT:</p>
                     <input type="number" id="edit-soat-new-price" class="input-visual text-center text-xl font-black text-indigo-600 mb-3">
                     
                     <p class="text-[10px] text-slate-400 mb-1">Gasto de Utilidad:</p>
                     <input type="number" id="edit-soat-new-profit" class="input-visual text-center text-lg font-bold text-emerald-600">
                 </div>
                 <div class="flex gap-2 justify-center mt-4">
                     <button onclick="closeEditSoatModal()" class="btn-danger text-xs px-4 py-2">Cancelar</button>
                     <button onclick="saveEditSoatPrice()" class="btn-primary text-xs px-4 py-2">Guardar</button>
                 </div>
             </div>
        </div>

        <div class="lg:col-span-5 space-y-4">
            <div class="card-modern p-5 bg-slate-50 border-slate-200 shadow-sm">
                <h3 class="font-bold text-sm text-indigo-700 mb-4 flex items-center gap-2">
                    <i class="fa-solid fa-shield-halved"></i> Configuración de SOAT
                </h3>
                
                <form id="unified-soat-form" class="space-y-4">
                    <div class="bg-white p-3 rounded-lg border border-slate-200">
                        <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">1. Clase de Vehículo</label>
                        <select id="unified-class-select" required class="input-visual w-full text-xs font-bold text-slate-700">
                            <option value="">-- Seleccione Clase --</option>
                            ${classOptions}
                            <option value="NEW_CLASS" class="text-indigo-600 font-bold">+ CREAR NUEVA CLASE</option>
                        </select>
                        <div id="new-class-fields" class="hidden mt-2 pt-2 border-t border-dashed border-indigo-200">
                             <input type="text" id="new-class-name" placeholder="Ej: MOTOS, CAMIONETAS" class="input-visual text-xs font-bold uppercase w-full bg-indigo-50">
                        </div>
                    </div>

                    <div class="bg-white p-3 rounded-lg border border-slate-200">
                        <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">2. Cilindraje / Rango</label>
                        <input type="text" id="unified-range-name" required placeholder="Ej: 100 a 200 c.c" class="input-visual text-xs w-full">
                    </div>

                    <div class="bg-white p-3 rounded-lg border border-slate-200 border-l-4 border-l-indigo-500">
                        <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">3. Precio SOAT</label>
                        <div class="flex items-center gap-2">
                            <span class="text-slate-400 font-bold">$</span>
                            <input type="number" id="unified-price" required placeholder="0" class="input-visual w-full text-lg font-bold text-slate-800">
                        </div>
                    </div>

                    <div class="bg-white p-3 rounded-lg border border-slate-200 border-l-4 border-l-emerald-500">
                        <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1">4. Gasto de Utilidad</label>
                        <div class="flex items-center gap-2">
                            <span class="text-slate-400 font-bold">$</span>
                            <input type="number" id="unified-profit" required placeholder="0" class="input-visual w-full text-lg font-bold text-emerald-600">
                        </div>
                    </div>

                    <button type="submit" class="w-full bg-indigo-600 text-white rounded-lg py-3 font-bold shadow-lg hover:bg-indigo-700 transition flex justify-center items-center gap-2">
                        <i class="fa-solid fa-plus"></i> Guardar Configuración
                    </button>
                </form>
            </div>
        </div>

        <div class="lg:col-span-7 h-full flex flex-col">
            <div class="card-modern p-5 bg-white border-slate-200 flex-1 flex flex-col">
                <h3 class="font-bold text-xs text-slate-500 uppercase tracking-wider mb-4 border-b pb-2">Lista de Precios Guardados</h3>
                <div class="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                    ${priceRows.length > 0 ? priceRows : '<div class="h-full flex items-center justify-center text-slate-400 italic text-sm">No hay configuraciones.</div>'}
                </div>
            </div>
        </div>
    </div>
  `;
}
/* ======================================================
 Inicio Traspaso
====================================================== */
function renderInicioTraspaso() {
  return `
  <div class="card-modern p-8 flex flex-col items-center justify-center text-center py-20 border-l-4 border-purple-600 bg-purple-50/50">
      <div class="w-16 h-16 bg-purple-100 text-purple-600 rounded-full flex items-center justify-center text-2xl mb-4">
          <i class="fa-solid fa-rocket"></i>
      </div>
      <h3 class="text-2xl font-black text-slate-800 mb-2">
          Iniciar Nuevo Traspaso
      </h3>
      <p class="text-slate-500 max-w-md mx-auto mb-6">
          Para registrar un nuevo servicio de traspaso y generar la venta correspondiente, debes dirigirte al módulo de Balance.
      </p>
      <button class="btn-primary px-8" onclick="navigateTo('balance')">
          Ir a Balance <i class="fa-solid fa-arrow-right ml-2"></i>
      </button>
  </div>
  `;
}

/* ======================================================
 HANDLERS & LISTENERS
====================================================== */
function attachEventListeners() {
  // 1. Añadir Nueva Marca
  document.body.addEventListener('click', async (e) => {
      const addBrandBtn = e.target.closest('button');
      if (addBrandBtn && addBrandBtn.previousElementSibling && addBrandBtn.previousElementSibling.id === 'new-brand-input') {
           const input = addBrandBtn.previousElementSibling;
           const val = input.value.trim();
           if (val) {
               window._avaluo_selectedBrand = val.toUpperCase();
               const tabAvaluosEl = document.getElementById('tab-avaluos');
               if(tabAvaluosEl) tabAvaluosEl.innerHTML = renderAvaluosConfig(true);
           }
      }
  });

  // 2. Formulario Avalúos
  document.body.addEventListener('submit', async (e) => {
      if (e.target.id === 'avaluo-form') {
          e.preventDefault();
          const brand = document.getElementById('avaluo-brand')?.value?.trim();
          const model = document.getElementById('avaluo-model')?.value?.trim();
          const cc = Number(document.getElementById('avaluo-cylinder')?.value || 0);
          const year = Number(document.getElementById('avaluo-year')?.value || new Date().getFullYear());
          const price = Number(document.getElementById('avaluo-value')?.value || 0);

          if (!brand) return alert('Selecciona una marca.');
          if (!model) return alert('Modelo requerido.');
          if (price <= 0) return alert('Precio inválido.');

          const safeModel = model.replace(/\s+/g, '_').toUpperCase();
          const id = `${brand}_${safeModel}_${cc}_${year}`.toUpperCase();

          try {
              const nowColombia = getColombiaNow();
              await setDoc(doc(getCollectionRef('avaluos_vehiculos'), id), {
                  id,
                  brand: brand.toUpperCase(),
                  model: model.toUpperCase(),
                  cylinder_cc: cc,
                  year: year,
                  commercial_value: price,
                  timestamp: nowColombia.timestampMs,
                  createdAtColombia: nowColombia,
                  updatedAtColombia: nowColombia,
                  dateKey: nowColombia.dateKey,
                  timeKey: nowColombia.timeKey,
                  weekday: nowColombia.weekday
              });
              
              document.getElementById('avaluo-model').value = '';
              document.getElementById('avaluo-value').value = '';
          } catch (err) {
              alert('Error al guardar.');
          }
      }

      // Edit transfer form submit
      if (e.target.id === 'edit-transfer-form') {
          e.preventDefault();
          await handleEditTransferSubmit(e.target);
      }

      // Edit cost config submit
      if (e.target.id === 'edit-cost-config-form') {
          e.preventDefault();
          await handleEditCostConfigSubmit(e.target);
      }

      // Edit avaluo submit
      if (e.target.id === 'edit-avaluo-form') {
          e.preventDefault();
          await handleEditAvaluoSubmit(e.target);
      }
  });

  // 3. Otros Forms
  const costConfigForm = document.getElementById('cost-config-form');
  if (costConfigForm) costConfigForm.addEventListener('submit', handleCostConfigSubmit);

  const soatClassForm = document.getElementById('soat-class-form');
  if (soatClassForm) soatClassForm.addEventListener('submit', handleSoatClassSubmit);
  
  const soatCCRangeForm = document.getElementById('soat-cc-range-form');
  if (soatCCRangeForm) soatCCRangeForm.addEventListener('submit', handleSoatCCRangeSubmit);
  
  const soatPriceForm = document.getElementById('soat-price-form');
  if (soatPriceForm) soatPriceForm.addEventListener('submit', handleSoatPriceSubmit);

  // Search Historial
  const transferSearch = document.getElementById('transfer-search');
  if (transferSearch) {
      transferSearch.addEventListener('input', (e) => {
          setTransferSearchTerm(e.target.value);
          const tbody = document.getElementById('transfers-table-body');
          if (tbody) tbody.innerHTML = renderTransfersTableRows();
      });
  }

// --- MANEJO INTEGRADO DE SOAT (UNIFICADO EN COLECCIÓN soat_prices) ---

// Listener para el Formulario (Guardar Nueva Clase o Rango)
// Listener para el Formulario (Guardar Nueva Clase o Rango)
document.addEventListener('submit', async (e) => {
  if (e.target && e.target.id === 'unified-soat-form') {
      e.preventDefault();
      
      const classSelect = document.getElementById('unified-class-select');
      const rangeInput = document.getElementById('unified-range-name');
      const priceInput = document.getElementById('unified-price');
      const profitInput = document.getElementById('unified-profit'); // NUEVO
      
      let classId = classSelect.value;
      let className = classSelect.options[classSelect.selectedIndex].text;
      
      if (classId === 'NEW_CLASS') {
          className = document.getElementById('new-class-name').value.trim().toUpperCase();
          classId = className.replace(/\s+/g, '_').toLowerCase();
          if (!className) return alert("Escribe el nombre de la nueva clase");
      }

      try {
          const docRef = doc(getCollectionRef('soat_prices'), classId);
          await setDoc(docRef, {
              id: classId,
              nombre_clase: className,
              opciones: arrayUnion({
                  nombre: rangeInput.value.trim(),
                  precio: parseFloat(priceInput.value),
                  utilidad: parseFloat(profitInput.value || 0) // NUEVO GUARDADO
              })
          }, { merge: true });

          e.target.reset();
          document.getElementById('new-class-fields').classList.add('hidden');
          alert("¡Configuración SOAT guardada!");
      } catch (error) {
          console.error("Error al guardar SOAT:", error);
          alert("No se pudo guardar la configuración.");
      }
  }
});

// Listener para mostrar campo de texto si elige "NUEVA CLASE"
document.addEventListener('change', (e) => {
  if (e.target && e.target.id === 'unified-class-select') {
      const newClassDiv = document.getElementById('new-class-fields');
      if (e.target.value === 'NEW_CLASS') newClassDiv.classList.remove('hidden');
      else newClassDiv.classList.add('hidden');
  }
});

// --- FUNCIONES GLOBALES PARA LA INTERFAZ (Eliminar y Editar) ---

window.deleteSoatOption = function(classId, name, price, profit) {
  showGeneralConfirmModal(classId, name, 'Precio SOAT', async () => {
      try {
          // Importamos getDoc dinámicamente para poder leer el documento actual
          const { getDoc } = await import('firebase/firestore');
          const docRef = doc(getCollectionRef('soat_prices'), classId);
          
          const docSnap = await getDoc(docRef);
          
          if (docSnap.exists()) {
              const data = docSnap.data();
              
              // Buscamos el objeto EXACTO en la base de datos que coincida con el nombre
              const optionToRemove = (data.opciones || []).find(opt => opt.nombre === name);
              
              if (optionToRemove) {
                  // Le pasamos el objeto exacto a arrayRemove
                  await updateDoc(docRef, {
                      opciones: arrayRemove(optionToRemove)
                  });
              } else {
                  console.warn("No se encontró el precio en la base de datos.");
              }
          }
      } catch (error) {
          console.error("Error al eliminar:", error);
          alert("Hubo un error al eliminar. Revisa la consola.");
      }
  });
};

window.openEditSoatModal = function(classId, name, price, profit) {
  document.getElementById('edit-soat-class-id').value = classId;
  document.getElementById('edit-soat-old-name').value = name;
  document.getElementById('edit-soat-old-price').value = price;
  document.getElementById('edit-soat-old-profit').value = profit || 0;
  
  document.getElementById('edit-soat-title').innerText = `Editar: ${name}`;
  document.getElementById('edit-soat-new-price').value = price;
  document.getElementById('edit-soat-new-profit').value = profit || 0;
  
  document.getElementById('edit-soat-modal').classList.remove('hidden');
};

window.closeEditSoatModal = () => document.getElementById('edit-soat-modal').classList.add('hidden');

window.saveEditSoatPrice = async function() {
  const classId = document.getElementById('edit-soat-class-id').value;
  const name = document.getElementById('edit-soat-old-name').value;
  const oldPrice = parseFloat(document.getElementById('edit-soat-old-price').value);
  const oldProfit = parseFloat(document.getElementById('edit-soat-old-profit').value) || 0;
  
  const newPrice = parseFloat(document.getElementById('edit-soat-new-price').value);
  const newProfit = parseFloat(document.getElementById('edit-soat-new-profit').value) || 0;

  if (isNaN(newPrice)) return alert("Precio no válido");

  try {
      const docRef = doc(getCollectionRef('soat_prices'), classId);
      // Borrar el viejo (necesita coincidir exacto)
      await updateDoc(docRef, { opciones: arrayRemove({ nombre: name, precio: oldPrice, utilidad: oldProfit }) });
      // Guardar el nuevo
      await updateDoc(docRef, { opciones: arrayUnion({ nombre: name, precio: newPrice, utilidad: newProfit }) });
      
      closeEditSoatModal();
  } catch (error) {
      console.error("Error al actualizar precio:", error);
      alert("Error al actualizar.");
  }
};}
// Handlers Costos
async function handleCostConfigSubmit(event) {
  event.preventDefault();
  const form = event.target;
  const msg = document.getElementById('cost-config-message'); 
  const cityId = (form.querySelector('#cost-city-id')?.value || "").toUpperCase().trim();
  
  if (!cityId) return;

  const nowColombia = getColombiaNow();
  const data = {
      id: cityId,
      city_name: cityId,
      runt_cost: parseFloat(form.querySelector('#cost-runt')?.value) || 0,
      stamps_cost: parseFloat(form.querySelector('#cost-stamps')?.value) || 0,
      agent_fee: parseFloat(form.querySelector('#cost-agent')?.value) || 0,
      transfer_rights_cost: parseFloat(form.querySelector('#cost-transfer-rights')?.value) || 0,
      configured_profit: parseFloat(form.querySelector('#cost-profit')?.value) || 0,
      updated_at: nowColombia.timestampMs,
      updatedAtColombia: nowColombia
  };
  
  try {
      await setDoc(doc(getCollectionRef('costos_traspasos'), cityId), data);
      if (msg) {
          msg.textContent = 'Guardado correctamente.';
          msg.classList.remove('hidden');
          setTimeout(() => msg.classList.add('hidden'), 3000);
      }
      form.reset();
  } catch (e) {}
}

function deleteCostConfigWrapper(id, name) {
  showGeneralConfirmModal(id, name, 'Costo de Traspaso', async (id) => {
      await deleteDoc(doc(getCollectionRef('costos_traspasos'), id));
  });
}

// Handlers Avalúos
function deleteAvaluoWrapper(id, name) {
  showGeneralConfirmModal(id, name, 'Avalúo', async (id) => {
      await deleteDoc(doc(getCollectionRef('avaluos_vehiculos'), id));
  });
}

// Handlers SOAT
async function handleSoatClassSubmit(e) {
  e.preventDefault();
  const id = e.target['soat-class-id'].value.toUpperCase().trim();
  const name = e.target['soat-class-name'].value.trim();
  try {
      await setDoc(doc(getCollectionRef('soat_classes'), id), { id, name });
      e.target.reset();
  } catch(err) {}
}

async function handleSoatCCRangeSubmit(e) {
  e.preventDefault();
  const id = e.target['soat-cc-id'].value.toUpperCase().trim();
  const name = e.target['soat-cc-name'].value.trim();
  const vehicle_class = e.target['soat-cc-class-id'].value;
  try {
      await setDoc(doc(getCollectionRef('soat_cc_ranges'), id), { id, name, vehicle_class });
      e.target.reset();
  } catch(err) {}
}

async function handleSoatPriceSubmit(e) {
  e.preventDefault();
  const vehicle_class = e.target['soat-price-class'].value;
  const cc_range = e.target['soat-price-cc'].value;
  const price = parseFloat(e.target['soat-price-value'].value);
  const id = `${vehicle_class}_${cc_range}`;
  const msg = document.getElementById('soat-price-message');

  try {
      await setDoc(doc(getCollectionRef('soat_prices'), id), { id, vehicle_class, cc_range, price });
      e.target.reset();
      if (msg) {
          msg.textContent = 'Precio guardado.';
          msg.classList.remove('hidden');
          setTimeout(() => msg.classList.add('hidden'), 3000);
      }
  } catch(err) {}
}

function deleteSoatClassWrapper(id) { showGeneralConfirmModal(id, id, 'Clase SOAT', async (id) => await deleteDoc(doc(getCollectionRef('soat_classes'), id))); }
function deleteSoatCCRangeWrapper(id) { showGeneralConfirmModal(id, id, 'Rango CC', async (id) => await deleteDoc(doc(getCollectionRef('soat_cc_ranges'), id))); }
function deleteSoatPriceWrapper(id) { showGeneralConfirmModal(id, id, 'Precio SOAT', async (id) => await deleteDoc(doc(getCollectionRef('soat_prices'), id))); }

/* ======================================================
 EDIT: Traspasos, Cost Configs, Avaluos
====================================================== */

function showEditTransferModal(id) {
  const t = (transfers || []).find(x => x.id === id);
  if (!t) return alert('Registro no encontrado localmente. Refresca la página.');
  document.getElementById('edit-transfer-id').value = id;
  document.getElementById('edit-transfer-placa').value = t.placa || '';
  document.getElementById('edit-transfer-client').value = t.client_name || t.clientName || '';
  document.getElementById('edit-transfer-city').value = t.city_id || '';
  document.getElementById('edit-transfer-vehicle-value').value = t.vehicle_value || 0;
  document.getElementById('edit-transfer-service-cost').value = t.service_cost || 0;
  document.getElementById('edit-transfer-total-expenses').value = t.total_expenses || 0;
  document.getElementById('edit-transfer-modal').classList.remove('hidden');
}

function hideEditTransferModal() {
  document.getElementById('edit-transfer-modal').classList.add('hidden');
}

async function handleEditTransferSubmit(formEl) {
  const id = formEl.querySelector('#edit-transfer-id').value;
  if (!id) return alert('ID inválido.');

  const nowColombia = getColombiaNow();
  const payload = {
    placa: formEl.querySelector('#edit-transfer-placa').value.trim(),
    client_name: formEl.querySelector('#edit-transfer-client').value.trim(),
    city_id: formEl.querySelector('#edit-transfer-city').value.trim(),
    vehicle_value: Number(formEl.querySelector('#edit-transfer-vehicle-value').value) || 0,
    service_cost: Number(formEl.querySelector('#edit-transfer-service-cost').value) || 0,
    total_expenses: Number(formEl.querySelector('#edit-transfer-total-expenses').value) || 0,
    updated_at: nowColombia.timestampMs,
    updatedAtColombia: nowColombia
  };

  // Recalcular impuesto_1_percent si tiene vehicle_value
  payload.impuesto_1_percent = Math.round((payload.vehicle_value || 0) * 0.01);

  try {
    await updateDoc(doc(getCollectionRef(TRANSFERS_COLLECTION), id), payload);
    // actualizar localmente para reflejar cambios inmediatamente (si la store es mutable)
    const idx = (transfers || []).findIndex(x => x.id === id);
    if (idx !== -1) {
      Object.assign(transfers[idx], payload);
    }
    const tbody = document.getElementById('transfers-table-body');
    if (tbody) tbody.innerHTML = renderTransfersTableRows();
    hideEditTransferModal();
  } catch (err) {
    console.error(err);
    alert('Error al actualizar registro.');
  }
}

/* COST CONFIG EDIT */
function showEditCostConfigModal(id) {
  const cfg = (transferCostsConfig || []).find(c => c.id === id);
  if (!cfg) return alert('Configuración no encontrada localmente.');
  document.getElementById('edit-cost-config-id').value = cfg.id;
  document.getElementById('edit-cost-city-id').value = cfg.city_name || cfg.id;
  document.getElementById('edit-cost-runt').value = cfg.runt_cost || 0;
  document.getElementById('edit-cost-stamps').value = cfg.stamps_cost || 0;
  document.getElementById('edit-cost-agent').value = cfg.agent_fee || 0;
  document.getElementById('edit-cost-transfer-rights').value = cfg.transfer_rights_cost || 0;
  document.getElementById('edit-cost-profit').value = cfg.configured_profit || 0;
  document.getElementById('edit-cost-config-modal').classList.remove('hidden');
}

function hideEditCostConfigModal() {
  document.getElementById('edit-cost-config-modal').classList.add('hidden');
}

async function handleEditCostConfigSubmit(formEl) {
  const id = formEl.querySelector('#edit-cost-config-id').value;
  if (!id) return alert('ID inválido.');

  const nowColombia = getColombiaNow();
  const payload = {
    id: formEl.querySelector('#edit-cost-city-id').value.trim().toUpperCase(),
    city_name: formEl.querySelector('#edit-cost-city-id').value.trim().toUpperCase(),
    runt_cost: Number(formEl.querySelector('#edit-cost-runt').value) || 0,
    stamps_cost: Number(formEl.querySelector('#edit-cost-stamps').value) || 0,
    agent_fee: Number(formEl.querySelector('#edit-cost-agent').value) || 0,
    transfer_rights_cost: Number(formEl.querySelector('#edit-cost-transfer-rights').value) || 0,
    configured_profit: Number(formEl.querySelector('#edit-cost-profit').value) || 0,
    updated_at: nowColombia.timestampMs,
    updatedAtColombia: nowColombia
  };

  try {
    await updateDoc(doc(getCollectionRef('costos_traspasos'), id), payload);
    // actualizar localmente
    const idx = (transferCostsConfig || []).findIndex(x => x.id === id);
    if (idx !== -1) Object.assign(transferCostsConfig[idx], payload);
    // volver a renderizar panel de costos
    const tabCosts = document.getElementById('tab-costs');
    if (tabCosts) tabCosts.innerHTML = renderTraspasosConfig(true);
    hideEditCostConfigModal();
  } catch (err) {
    console.error(err);
    alert('Error al actualizar configuración.');
  }
}

/* AVALUO EDIT */
function showEditAvaluoModal(id) {
  // buscar en los avaluos locales
  let list = [];
  try { list = getVehicleAvaluos(); } catch (e) {}
  const a = list.find(x => x.id === id);
  if (!a) return alert('Avalúo no encontrado localmente.');
  document.getElementById('edit-avaluo-id').value = a.id;
  document.getElementById('edit-avaluo-brand').value = a.brand || '';
  document.getElementById('edit-avaluo-model').value = a.model || '';
  document.getElementById('edit-avaluo-cylinder').value = a.cylinder_cc || 0;
  document.getElementById('edit-avaluo-year').value = a.year || new Date().getFullYear();
  document.getElementById('edit-avaluo-value').value = a.commercial_value || 0;
  document.getElementById('edit-avaluo-modal').classList.remove('hidden');
}

function hideEditAvaluoModal() {
  document.getElementById('edit-avaluo-modal').classList.add('hidden');
}

async function handleEditAvaluoSubmit(formEl) {
  const id = formEl.querySelector('#edit-avaluo-id').value;
  if (!id) return alert('ID inválido.');

  const nowColombia = getColombiaNow();
  const payload = {
    brand: formEl.querySelector('#edit-avaluo-brand').value.trim().toUpperCase(),
    model: formEl.querySelector('#edit-avaluo-model').value.trim().toUpperCase(),
    cylinder_cc: Number(formEl.querySelector('#edit-avaluo-cylinder').value) || 0,
    year: Number(formEl.querySelector('#edit-avaluo-year').value) || new Date().getFullYear(),
    commercial_value: Number(formEl.querySelector('#edit-avaluo-value').value) || 0,
    updated_at: nowColombia.timestampMs,
    updatedAtColombia: nowColombia
  };

  try {
    await updateDoc(doc(getCollectionRef('avaluos_vehiculos'), id), payload);
    // si la store es mutable, actualizar local y re-renderizar
    const list = getVehicleAvaluos();
    const idx = list.findIndex(x => x.id === id);
    if (idx !== -1) Object.assign(list[idx], payload);
    updateAvaluosTab();
    hideEditAvaluoModal();
  } catch (err) {
    console.error(err);
    alert('Error al actualizar avalúo.');
  }
}

/* ======================================================
 Helpers Modales & Calculos (existentes)
====================================================== */
async function showTransferExpenseModal(id, placa, maxExpense = 0) {
  const idEl = document.getElementById('transfer-expense-id');
  const infoEl = document.getElementById('transfer-expense-info');
  const modalEl = document.getElementById('transfer-expense-modal');
  const maxEl = document.getElementById('transfer-expense-max');
  const maxDisplayEl = document.getElementById('transfer-expense-max-display');

  if (!idEl || !infoEl || !modalEl) return;

  idEl.value = id;
  infoEl.innerText = placa;
  
  // Asignar los valores límite
  if (maxEl) maxEl.value = maxExpense;
  if (maxDisplayEl) maxDisplayEl.innerText = formatCurrency(maxExpense);

  let list = Array.isArray(savings) ? savings.slice() : (Array.isArray(window.savings) ? window.savings.slice() : []);

  if (!list || list.length === 0) {
    try {
      const { db } = await import('../config/firebase.js');
      const { collection, getDocs } = await import('firebase/firestore');
      const snaps = await getDocs(collection(db, 'ahorros'));
      list = snaps.docs.map(d => ({ id: d.id, ...d.data() }));
      window.savings = list;
      if (typeof setSavings === 'function') setSavings(list);
    } catch (err) {
      list = list || [];
    }
  }

  // --- AQUI DIBUJAMOS LAS CUENTAS Y CONECTAMOS LA SUMA AUTOMÁTICA ---
  const container = document.getElementById('transfer-expense-accounts');
  if (container) {
      if (!list.length) {
          container.innerHTML = `<p class="text-xs text-gray-500 p-3 text-center">No hay cuentas configuradas.</p>`;
      } else {
          container.innerHTML = list.map(acc => {
              const name = acc.name || acc.nombre || acc.tag || acc.id;
              const saldo = formatCurrency(parseFloat(acc.saldo || 0));
              return `
              <div class="flex items-center gap-3 bg-white p-2 rounded-lg border border-gray-200 shadow-sm hover:border-indigo-300 transition-colors">
                  <label class="flex-1 text-sm font-bold text-gray-700 truncate cursor-pointer" title="${name}">
                      ${name} <br><span class="text-[10px] text-gray-400 font-normal">Disponible: ${saldo}</span>
                  </label>
                  <input type="number" min="0" step="0.01" class="w-28 p-2 border border-gray-200 rounded-lg text-sm text-right outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 font-bold text-gray-800" 
                         data-acc-id="${acc.id}" data-acc-saldo="${parseFloat(acc.saldo || 0)}" placeholder="0" oninput="updateTransferExpenseTotal()">
              </div>
              `;
          }).join('');
      }
  }

  const totalEl = document.getElementById('transfer-expense-total');
  if (totalEl) {
      totalEl.innerText = formatCurrency(0);
      totalEl.classList.remove('text-red-500');
      totalEl.classList.add('text-indigo-600');
  }
  
  // Limpiar cualquier input anterior
  document.getElementById('transfer-expense-form')?.reset();
  
  modalEl.classList.remove('hidden');
}

function hideTransferExpenseModal() {
  const modal = document.getElementById('transfer-expense-modal');
  if (modal) {
      modal.classList.add('hidden');
      document.getElementById('transfer-expense-form')?.reset(); // Limpia los campos
  }
}

function updateTransferExpenseTotal() {
  const inputs = document.querySelectorAll('#transfer-expense-accounts input[data-acc-id]');
  let total = 0;
  inputs.forEach(i => { total += parseFloat(i.value || 0) || 0; });
  
  const totalEl = document.getElementById('transfer-expense-total');
  if (!totalEl) return;

  totalEl.innerText = formatCurrency(total);
  
  // Mostrar en rojo si se pasa del límite
  const max = parseFloat(document.getElementById('transfer-expense-max').value) || 0;
  if (total > max) {
      totalEl.classList.remove('text-indigo-600');
      totalEl.classList.add('text-red-500');
  } else {
      totalEl.classList.remove('text-red-500');
      totalEl.classList.add('text-indigo-600');
  }
}

/* ===== Handler del submit: realiza batch (debita cuentas, crea transacción, actualiza transfer) ===== */
// REEMPLAZAR la función existente por esta versión mejorada:
window.handleTransferExpenseSubmit = async function (e) {
  e.preventDefault();

  const transferId = document.getElementById('transfer-expense-id')?.value;
  if (!transferId) return alert('ID de traspaso inválido.');

  // Recolectar montos por cuenta
  const inputs = document.querySelectorAll('#transfer-expense-accounts input[data-acc-id]');
  const selected = [];
  let total = 0;
  inputs.forEach(i => {
    const accId = i.dataset.accId;
    const amt = Math.round((parseFloat(i.value || 0) || 0) * 100) / 100;
    const saldo = parseFloat(i.dataset.accSaldo || 0);
    if (amt > 0) {
      selected.push({ accountId: accId, amount: amt, saldo });
      total += amt;
    }
  });

  if (selected.length === 0) return alert('Ingresa por lo menos un monto mayor a 0.');

  // NUEVA VALIDACIÓN DE LÍMITE DE GASTO
  const maxExpense = parseFloat(document.getElementById('transfer-expense-max').value) || 0;
  if (total > maxExpense) {
      return alert(`❌ El pago excede el límite. Solo puedes registrar hasta ${formatCurrency(maxExpense)} para este traspaso.`);
  }

  if (!confirm(`Confirmas registrar un gasto total de ${formatCurrency(total)} y debitar las cuentas seleccionadas?`)) return;
  try {
    // Import dinámico (asegúrate de que increment esté desestructurado)
    const { db } = await import('../config/firebase.js');
    const { writeBatch, doc, getDoc, increment } = await import('firebase/firestore');

    // --- Leer configuración global de retención (4x1000) ---
    let ratePerMille = 4;
    try {
      const retCfgRef = doc(getCollectionRef('config'), 'retencion_4x1000');
      const retSnap = await getDoc(retCfgRef);
      if (retSnap.exists()) ratePerMille = parseFloat(retSnap.data().ratePerMille) || ratePerMille;
    } catch (e) {
      console.warn('No se pudo leer retención, usando fallback', e);
    }

    // Obtener datos del transfer (para decidir COMPLETADO/PENDIENTE)
    const transferRef = doc(getCollectionRef('transfers'), transferId);
    const transferSnap = await getDoc(transferRef);
    const transferData = transferSnap.exists() ? transferSnap.data() : {};
    const prevExpenses = parseFloat(transferData.total_expenses || 0) || 0;
    const serviceCost = parseFloat(transferData.service_cost || 0) || 0;
    const tipoGestion = transferData.tipo_gestion || 'TRASPASO';

    // Inicializaciones antes del loop
    let totalRetentionThisTransaction = 0;
    const retentionByAccount = []; // detalle por cuenta para el gasto de retención
    const paymentAccounts = []; // detalle para la transacción principal (montos aplicados al gasto)
    const utilidadFinal = Math.max(Math.round((serviceCost - total) * 100) / 100, 0);
    const utilityDistribution = utilidadFinal > 0
      ? calcularDistribucionUtilidad(utilidadFinal, reglasDistribucion)
      : [];
    const utilityDistributedAmount = utilityDistribution.reduce((sum, mov) => sum + (parseFloat(mov.amount || 0) || 0), 0);
    const nowColombia = getColombiaNow();
    const batch = writeBatch(db);

    for (const mov of utilityDistribution) {
      const bolsillo = (bolsillosUtilidad || []).find(b =>
        String(b.name || '').trim().toLowerCase() === String(mov.pocketName || '').trim().toLowerCase()
      );
      if (bolsillo) {
        batch.set(doc(getCollectionRef('bolsillos_utilidad'), bolsillo.id), {
          saldo: increment(mov.amount),
          updated_at: nowColombia.timestampMs,
          updatedAtColombia: nowColombia
        }, { merge: true });
      }
    }

    // Validaciones por cuenta (NO permitir saldo negativo)
    for (const s of selected) {
      // leer cuenta una sola vez
      const accRef = doc(getCollectionRef('ahorros'), s.accountId);
      const accSnap = await getDoc(accRef);
      const currentBalance = accSnap.exists() ? (parseFloat(accSnap.data().saldo || 0) || 0) : 0;

      // tasa de retención por cuenta o fallback
      const accountRate = accSnap.exists() && accSnap.data().retention_per_mille != null
        ? parseFloat(accSnap.data().retention_per_mille)
        : ratePerMille;

      // retención por cuenta (redondeada 2 decimales)
      const retentionAccount = Math.round(((s.amount * accountRate) / 1000) * 100) / 100;

      const totalRequired = Math.round((s.amount + retentionAccount) * 100) / 100;

      // Bloqueo: no permitir saldo negativo
      if (totalRequired > currentBalance) {
        alert(
          `Saldo insuficiente en la cuenta ${accSnap.exists() ? (accSnap.data().nombre || accSnap.data().name || s.accountId) : s.accountId}.\n\n` +
          `Disponible: ${formatCurrency(currentBalance)}\n` +
          `Necesitas: ${formatCurrency(totalRequired)}\n` +
          `Faltan: ${formatCurrency(totalRequired - currentBalance)}\n\n` +
          `No se permiten saldos negativos. Ajusta montos o registra un préstamo.`
        );
        return; // abortar todo
      }

      // Guardar datos procesados para el batch
      totalRetentionThisTransaction += retentionAccount;
      if (retentionAccount > 0) {
        retentionByAccount.push({
          accountId: s.accountId,
          name: accSnap.exists() ? (accSnap.data().nombre || accSnap.data().name || null) : null,
          amount: retentionAccount
        });
      }

      // Actualizaremos la cuenta (debito por monto + retención)
      batch.update(accRef, {
        saldo: increment(-(s.amount + retentionAccount)),
        updated_at: nowColombia.timestampMs,
        updatedAtColombia: nowColombia
      });

      // Payment account para la transacción principal (monto "gasto" sin retención)
      paymentAccounts.push({
        accountId: s.accountId,
        name: accSnap.exists() ? (accSnap.data().nombre || accSnap.data().name || null) : null,
        amount: s.amount
      });
    } // end for selected

    // 2) Crear la transacción EGRESO (registro de gasto)
    const transRef = doc(getCollectionRef('transacciones'));
    batch.set(transRef, {
      id: transRef.id,
      type: 'EGRESO',
      category: 'GASTO_TRASPASO',
      amount: total,
      description: `Gasto adicional traspaso: ${transferId}`,
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
      payment_accounts: paymentAccounts,
      transfer_id: transferId,
      tipo_gestion: tipoGestion,
      expected_transfer_expenses: prevExpenses,
      realized_utility: utilidadFinal,
      distributedAmount: utilityDistributedAmount,
      utility_distribution: utilityDistribution.length ? utilityDistribution : null
    });

  
// 3) Si hay retención, crear transacción EGRESO GASTO_4X1000 y actualizar config
const retentionRounded = Math.round(totalRetentionThisTransaction * 100) / 100;
let retentionTransId = null; // NUEVO: Variable para guardar el ID de la retención

if (retentionRounded > 0) {
  const retentionExpenseRef = doc(getCollectionRef('transacciones'));
  retentionTransId = retentionExpenseRef.id; // Guardamos el ID

  batch.set(retentionExpenseRef, {
    id: retentionExpenseRef.id,
    type: 'EGRESO',
    category: 'GASTO_4X1000',
    amount: retentionRounded,
    description: 'Retención GMF (4x1000) aplicada por gasto traspaso',
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
    payment_accounts: retentionByAccount.length ? retentionByAccount : null
  });

  const retRef = doc(getCollectionRef('config'), 'retencion_4x1000');
  batch.set(retRef, {
    accumulated: increment(retentionRounded),
    ratePerMille: ratePerMille,
    updated_at: nowColombia.timestampMs,
    updatedAtColombia: nowColombia
  }, { merge: true });
}

// 4) Actualizar transfer: marcamos como COMPLETADO y guardamos ambos IDs
batch.update(transferRef, {
  updated_at: nowColombia.timestampMs,
  updatedAtColombia: nowColombia,
  status: 'COMPLETADO',
  total_expenses: total,
  expected_expenses: prevExpenses,
  realized_utility: utilidadFinal,
  utility_distributed_amount: utilityDistributedAmount,
  utility_distribution: utilityDistribution.length ? utilityDistribution : null,
  expense_transaction_id: transRef.id,
  retention_transaction_id: retentionTransId // NUEVO: Guardamos el ID en la base de datos
});

// Commit ...
await batch.commit();

// actualizar copia local y UI
const idx = (transfers || []).findIndex(t => t.id === transferId);
if (idx !== -1) {
  transfers[idx].status = 'COMPLETADO';
  transfers[idx].total_expenses = total;
  transfers[idx].expected_expenses = prevExpenses;
  transfers[idx].realized_utility = utilidadFinal;
  transfers[idx].utility_distributed_amount = utilityDistributedAmount;
  transfers[idx].utility_distribution = utilityDistribution.length ? utilityDistribution : null;
  transfers[idx].expense_transaction_id = transRef.id; 
  transfers[idx].retention_transaction_id = retentionTransId; // NUEVO
}

    hideTransferExpenseModal();
    const tbody = document.getElementById('transfers-table-body');
    if (tbody) tbody.innerHTML = renderTransfersTableRows();

    alert('✅ Gasto registrado correctamente.');
  } catch (err) {
    console.error('Error registrando gasto de traspaso:', err);
    alert('Error: ' + (err.message || err));
  }
};

// Conectar submit del form del modal (si el template ya existe al cargar el JS)
document.addEventListener('submit', function (ev) {
  if (ev.target && ev.target.id === 'transfer-expense-form') {
    ev.preventDefault();
    window.handleTransferExpenseSubmit(ev);
  }
});

function updateTransferCostCalculation() {
  const category = document.getElementById('trans-category')?.value;
  if (category !== 'VENTA_TRASPASO') return;

  const cityId = document.getElementById('transfer-city-id')?.value;
  const valuationId = document.getElementById('transfer-valuation-id')?.value;
  const vehicleValueInput = document.getElementById('transfer-vehicle-value');
  const amountInput = document.getElementById('trans-amount');
  const summaryDiv = document.getElementById('transfer-cost-summary');

  if (!vehicleValueInput || !amountInput || !summaryDiv) return;

  if (valuationId) {
      let list = [];
      try { list = getVehicleAvaluos(); } catch(e) {}
      const avaluo = list.find(a => a.id === valuationId);
      if (avaluo) vehicleValueInput.value = avaluo.commercial_value;
  }

  let vehicleValue = parseFloat(vehicleValueInput.value) || 0;
  const config = transferCostsConfig.find(c => c.id === cityId);

  if (!config || !cityId) {
      summaryDiv.classList.add('hidden');
      summaryDiv.innerHTML = '';
      return;
  }

  const fixedCosts = (config.runt_cost || 0) + (config.stamps_cost || 0) + (config.agent_fee || 0) + (config.transfer_rights_cost || 0);
  const configuredProfit = config.configured_profit || 0;
  const impuesto1Percent = vehicleValue * 0.01;
  const totalExpense = fixedCosts + impuesto1Percent;
  const totalToCharge = totalExpense + configuredProfit;

  amountInput.value = Math.round(totalToCharge);

  summaryDiv.innerHTML = `
      <div class="bg-indigo-50 p-3 rounded-lg border border-indigo-100 mt-2">
          <p class="font-bold text-xs text-indigo-700 mb-2 border-b border-indigo-200 pb-1">DESGLOSE AUTOMÁTICO</p>
          <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600">
              <span>Trámites Fijos:</span> <span class="text-right font-medium">${formatCurrency(fixedCosts)}</span>
              <span>Impuesto 1%:</span> <span class="text-right font-medium text-blue-600">${formatCurrency(impuesto1Percent)}</span>
              <span class="font-bold text-slate-800">COSTO TOTAL:</span> <span class="text-right font-bold text-slate-800">${formatCurrency(totalExpense)}</span>
              <span class="font-bold text-emerald-600">GANANCIA:</span> 
<span class="text-right font-bold text-emerald-600">${formatCurrency(configuredProfit)}</span>
          </div>
          <p class="mt-2 text-center font-black text-sm text-indigo-900 border-t border-indigo-200 pt-2">
              A COBRAR: ${formatCurrency(totalToCharge)}
          </p>
      </div>
  `;
  summaryDiv.classList.remove('hidden');
}



// ---------------------------
// Vista previa rápida del ajuste masivo
// ---------------------------
window.previewAvaluosPercentage = function () {
  try {
    const raw = document.getElementById('avaluos-percentage')?.value;
    const pct = raw === undefined || raw === '' ? NaN : parseFloat(raw);
    const mode = document.querySelector('input[name="avaluos-mode"]:checked')?.value || 'up';
    if (!Number.isFinite(pct)) return alert('Ingresa un porcentaje válido (ej: 10).');
    if (pct === 0) return alert('El porcentaje es 0 — no habrá cambios.');

    const list = (typeof getVehicleAvaluos === 'function') ? getVehicleAvaluos() : [];
    if (!Array.isArray(list) || list.length === 0) return alert('No hay avalúos cargados para previsualizar.');

    const factor = mode === 'up' ? (1 + pct / 100) : (1 - pct / 100);
    const sampleCount = Math.min(6, list.length);

    const sample = list.slice(0, sampleCount).map(a => {
      const oldV = Number(a.commercial_value || 0);
      const newV = Math.max(0, Math.round(oldV * factor));
      return `${a.brand || '—'} ${a.model || '—'} (${a.id || 'sin-id'}): ${formatCurrency(oldV)} → ${formatCurrency(newV)}`;
    }).join('\n');

    alert(`Vista previa (${sampleCount} primeros registros):\n\n${sample}`);
  } catch (err) {
    console.error('previewAvaluosPercentage error', err);
    alert('Ocurrió un error al generar la vista previa. Revisa la consola.');
  }
};

// ---------------------------
// Aplicar ajuste masivo a TODOS los avalúos (usa updateDoc por defecto)
// ---------------------------
window.applyAvaluosPercentage = async function () {
  try {
    const raw = document.getElementById('avaluos-percentage')?.value;
    const pct = raw === undefined || raw === '' ? NaN : parseFloat(raw);
    const mode = document.querySelector('input[name="avaluos-mode"]:checked')?.value || 'up';
    if (!Number.isFinite(pct)) return alert('Ingresa un porcentaje válido (ej: 10).');
    if (pct === 0) return alert('El porcentaje es 0 — no hay cambios que aplicar.');

    if (!confirm(`¿Seguro aplicar ${mode === 'up' ? '+' : '-'}${pct}% a TODOS los avalúos?\n\nRecomendado: exporta/respalda la colección antes.`)) {
      return;
    }

    const list = (typeof getVehicleAvaluos === 'function') ? getVehicleAvaluos() : [];
    if (!Array.isArray(list) || list.length === 0) return alert('No hay avalúos cargados para actualizar.');

    const factor = mode === 'up' ? (1 + pct / 100) : (1 - pct / 100);
    const tasks = list.map(a => {
      const oldV = Number(a.commercial_value || 0);
      const newV = Math.max(0, Math.round(oldV * factor));
      return { id: a.id, oldV, newV };
    });

    const toUpdate = tasks.filter(t => t.id && t.newV !== t.oldV);
    if (toUpdate.length === 0) return alert('Ningún registro cambiaría con ese porcentaje.');

    // Si la colección es muy grande puedes ajustar CHUNK_SIZE a un número menor.
    const CHUNK_SIZE = 20;
    let updatedCount = 0;

    for (let i = 0; i < toUpdate.length; i += CHUNK_SIZE) {
      const chunk = toUpdate.slice(i, i + CHUNK_SIZE);

      await Promise.all(chunk.map(async (t) => {
        try {
          const ref = doc(getCollectionRef('avaluos_vehiculos'), t.id);
          // updateDoc debe estar disponible en tu scope (como ya usabas).
          const nowColombia = getColombiaNow();
          await updateDoc(ref, {
            commercial_value: t.newV,
            updated_at: nowColombia.timestampMs,
            updatedAtColombia: nowColombia
          });

          // actualizar copia local si getVehicleAvaluos devuelve la misma referencia
          try {
            const local = (typeof getVehicleAvaluos === 'function') ? getVehicleAvaluos() : [];
            const found = local.find(x => x.id === t.id);
            if (found) found.commercial_value = t.newV;
          } catch (e) { /* noop */ }

          updatedCount++;
        } catch (err) {
          console.error('Error actualizando avaluo', t.id, err);
        }
      }));

      // opcional: pequeña pausa para no forzar cuotas (descomenta si lo necesitas)
      // await new Promise(r => setTimeout(r, 100));
    }

    // Forzar re-render en la UI
    try { window.dispatchEvent(new Event('vehicleAvaluosUpdated')); } catch (e) { /* noop */ }

    alert(`Proceso finalizado. Registros actualizados: ${updatedCount} / ${list.length}.`);
    console.log('applyAvaluosPercentage result', { total: list.length, changed: updatedCount });
  } catch (err) {
    console.error('applyAvaluosPercentage error', err);
    alert('Ocurrió un error aplicando el ajuste. Revisa la consola.');
  }
};

/* ---------------------------
  Opción alternativa (comentada): usar writeBatch (ventaja: transacciones parciales de 500)
  Si prefieres que genere batches de 500 y haga commit por lote, puedo habilitar esta versión.
  La dejo comentada por si la necesitas luego.
----------------------------*/

/*
window.applyAvaluosPercentage_batch = async function () {
  // Requiere: writeBatch y getDocs/pagination si quieres recorrer toda la colección desde servidor
  // Ejemplo general (muy útil cuando no tienes todos los docs en cliente):
  //  - paginar la colección en el servidor
  //  - para cada page, crear batches de hasta 500 updates
  //  - commit() por cada batch
  // Implemento esto si lo solicitas explícitamente.
};
*/

/* ======================================================
 REVERTIR TRASPASO PENDIENTE (Anula Ingreso y Borra Trámite)
====================================================== */
async function revertirTraspasoPendiente(transferId, transactionId) {
  // Si la transacción se hizo antes de agregar el 'source_transaction_id', avisamos
  if (!transactionId || transactionId === 'undefined') {
      alert("⚠️ No se encontró el ID de la transacción original. Esto pasa con trámites viejos. Para estos, debes anularlos directamente desde el Historial de Balance.");
      return;
  }

  if (!confirm("¿Estás seguro de que deseas ANULAR este trámite por completo?\n\n- El dinero cobrado regresará a tus cuentas.\n- Este trámite desaparecerá de la lista.")) {
      return;
  }

  try {
      // 1. Llamamos a la función mágica de balance para devolver la plata
      const anulada = await anularTransaccion(transactionId);
      if (anulada === false) return;

      // 2. Importamos Firestore
      const { doc, deleteDoc } = await import('firebase/firestore');
      
      // 3. Eliminamos el trámite de la base de datos definitivamente
      const transferRef = doc(getCollectionRef('transfers'), transferId);
      await deleteDoc(transferRef);

      // 4. Actualizamos el estado local para que desaparezca de la tabla sin recargar la página
      const idx = (transfers || []).findIndex(t => t.id === transferId);
      if (idx !== -1) {
          transfers.splice(idx, 1);
      }

      const tbody = document.getElementById('transfers-table-body');
      if (tbody) tbody.innerHTML = renderTransfersTableRows();

      alert("✅ Trámite anulado exitosamente. El dinero está de vuelta en tu balance.");

  } catch (error) {
      console.error("Error al anular el trámite:", error);
      alert("Ocurrió un error al intentar anular el trámite. Revisa la consola.");
  }
}
