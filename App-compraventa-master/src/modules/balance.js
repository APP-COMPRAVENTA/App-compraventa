// src/modules/balance.js

import {
    inventory,
    transactions,
    savings, // Usamos esto como tus cuentas (Caja, Banco, etc.)
    providers,
    transferCostsConfig,
    getVehicleAvaluos,
    soatClasses,
    soatCcRanges,
    clients,
    soatPrices,
    reglasDistribucion, 
    bolsillosUtilidad ,  
    getTransferCostsConfig
} from '../store/store.js';

import { getCollectionRef } from '../services/listeners.js';
import { activeTenantId, currentUser, db,  } from '../config/firebase.js';
import {  increment, query, where, getDocs, limit, deleteField } from 'firebase/firestore';
import { doc, getDoc, writeBatch, collection } from 'firebase/firestore'; // Se agregó collection
import { renderHeader, renderFormGroup, formatCurrency } from '../utils/utils.js';
import { calcularDistribucionUtilidad } from '../utils/financeLogic.js';
import {
  colombiaDateInputToTimestamp,
  getColombiaDayBounds,
  getColombiaNow,
  getColombiaSearchDateText,
  getTodayColombiaDateKey
} from '../utils/colombiaTime.js';
import { beginSubmitGuard } from '../utils/submitGuard.js';
import { agentAPI } from './agente/api.js';

async function syncAgentInventoryItem(itemId) {
  const normalizedItemId = String(itemId || '').trim();
  if (!normalizedItemId) return;

  try {
    await agentAPI.syncInventoryItem(normalizedItemId);
  } catch (error) {
    console.warn('No se pudo sincronizar el índice del agente desde balance:', normalizedItemId, error?.message || error);
  }
}

/* ======================================================
   EXPOSICIÓN GLOBAL (HTML / MODALES)
====================================================== */
window.updateTransactionCategories = updateTransactionCategories;
window.updateDynamicFields = updateDynamicFields;
window.showRevertModal = showRevertModal;
window.hideRevertModal = hideRevertModal;
window.anularTransaccion = anularTransaccion;
// Nuevas funciones para Multi-Pago
window.addPaymentMethod = addPaymentMethod;
window.removePaymentMethod = removePaymentMethod;
window.updatePaymentTotals = updatePaymentTotals;


window.anularTransaccion = anularTransaccion;
// Agrega esta línea nueva:
window.updateDynamicDropdowns = updateDynamicDropdowns;

/* ======================================================
   LÓGICA DINÁMICA DE SOAT (Nueva Estructura)
====================================================== */

// 1. Al seleccionar la clase, despliega los rangos/cilindrajes correspondientes
window.updateSoatRanges = function() {
    const classId = document.getElementById('soat-class-select').value;
    const rangeSelect = document.getElementById('soat-range-select');
    const priceDisplay = document.getElementById('soat-price-display');
    
    if (!classId) {
        rangeSelect.innerHTML = '<option value="">-- Seleccione primero la clase --</option>';
        rangeSelect.disabled = true;
        rangeSelect.classList.add('bg-gray-100');
        priceDisplay.innerText = '$ 0';
        window.calculateSoatPrice(); 
        return;
    }

    const selectedClass = (soatPrices || []).find(c => c.id === classId);
    const opciones = selectedClass ? (selectedClass.opciones || []) : [];

    // INYECTAMOS LA UTILIDAD EN EL DATA-ATTRIBUTE (data-utilidad)
    rangeSelect.innerHTML = '<option value="">-- Seleccione Cilindraje/Rango --</option>' + 
        opciones.map(opt => `<option value="${opt.nombre}" data-precio="${opt.precio}" data-utilidad="${opt.utilidad || 0}">${opt.nombre}</option>`).join('');
    
    rangeSelect.disabled = false;
    rangeSelect.classList.remove('bg-gray-100');
    rangeSelect.classList.add('bg-white');
};

window.calculateSoatPrice = function() {
    const rangeSelect = document.getElementById('soat-range-select');
    const priceDisplay = document.getElementById('soat-price-display');
    const transAmountInput = document.getElementById('trans-amount'); 
    const totalDisplay = document.getElementById('total-display');
    
    if (!rangeSelect || rangeSelect.selectedIndex <= 0) {
        priceDisplay.innerText = '$ 0';
        return;
    }

    const selectedOption = rangeSelect.options[rangeSelect.selectedIndex];
    const precioFinal = parseFloat(selectedOption.getAttribute('data-precio')) || 0;
    
    // CAPTURAMOS LA UTILIDAD INVISIBLE
    const utilidadFinal = parseFloat(selectedOption.getAttribute('data-utilidad')) || 0;

    priceDisplay.innerText = formatCurrency(precioFinal);
    if (transAmountInput) transAmountInput.value = precioFinal;
    if (totalDisplay) totalDisplay.innerText = formatCurrency(precioFinal);

    // GUARDAMOS LA UTILIDAD EN EL INPUT OCULTO
  // GUARDAMOS LA UTILIDAD EN EL INPUT OCULTO (crear si no existe)
let profitInputHidden = document.getElementById('soat-profit-hidden');
if (!profitInputHidden) {
  profitInputHidden = document.createElement('input');
  profitInputHidden.type = 'hidden';
  profitInputHidden.id = 'soat-profit-hidden';
  profitInputHidden.name = 'soat_profit_hidden';
  // Intentar anexarlo dentro del formulario, si no existe usar body
  const formParent = document.getElementById('transaction-form') || document.body;
  formParent.appendChild(profitInputHidden);
}
profitInputHidden.value = utilidadFinal;

    const paymentInputs = document.querySelectorAll('input[name="pay-amount[]"]');
    if (paymentInputs.length === 1) {
        paymentInputs[0].value = precioFinal;
    }
};
/* ======================================================
   CONFIGURACIÓN DE OPCIONES
====================================================== */
const TRANSACTION_OPTIONS = {
    INGRESO: [
        { value: 'VENTA_PRODUCTO_CONTADO', label: 'Venta de Producto (Contado)', inventory: true, client: true, updateAmount: true },
        { value: 'VENTA_CREDITO', label: 'Venta de Producto (Crédito)', debt: true, client: true },
        { value: 'VENTA_TRASPASO', label: 'Venta Traspaso (Servicio)', client: true, transfer: true },
        { value: 'PRESTAMO_CAPITAL', label: 'Préstamo Capital Recibido', cxp: true, provider: true },
        { value: 'VENTA_SOAT', label: 'Venta SOAT', soat: true, client: true },
        { value: 'VENTA_LIBRE', label: 'Venta Libre (Servicio/Otro)' },
    ],

    EGRESO: [
        { value: 'GASTO_INVERSION_COMPRA', label: 'Inversión: Compra de Producto (Crea Ítem)', inventory_create: true },
        { value: 'GASTO_MANTENIMIENTO', label: 'Mantenimiento (Suma a Costo)', inventory: true },
        { value: 'GASTO_AHORRO', label: 'Gasto por Ahorro', savings: true },
        { value: 'GASTO_GENERAL', label: 'Gasto General' },
        { value: 'EMPEÑO', label: 'Préstamo Capital (Empeño)', pawn: true, client: true }
    ]
};

/* ======================================================
    ESTRUCTURA PRINCIPAL (renderBalance)
====================================================== */



export async function renderBalance() {
    const contentDiv = document.getElementById('content');

    contentDiv.innerHTML = await renderHeader(
        'Gestión de Balance',
        'Registro de ingresos (Ventas) y egresos (Gastos).'
    );

    contentDiv.insertAdjacentHTML('beforeend', `
      <div class="bg-white p-5 rounded-xl card mb-6 shadow-sm">
        ${renderPeriodSelector()}

        <div id="balance-summary"></div>

        <h2 class="text-xl font-semibold mb-4 text-gray-800 border-b pb-2 mt-6">
          Registrar Transacción
        </h2>

        <form id="transaction-form">
          <div class="grid sm:grid-cols-2 gap-4">
            ${renderFormGroup('Tipo de Transacción', `
              <select id="trans-type" name="trans-type" required class="w-full p-2 border rounded-lg">
                <option value="">Seleccione Tipo</option>
                <option value="INGRESO">INGRESO (Venta)</option>
                <option value="EGRESO">EGRESO (Gasto)</option>
              </select>
            `)}
            ${renderFormGroup('Categoría Específica', `
              <select id="trans-category" name="trans-category" required class="w-full p-2 border rounded-lg">
                <option value="">Seleccione primero el Tipo</option>
              </select>
            `)}
            ${renderFormGroup('Fecha de Registro', `
              <input type="date" id="trans-date" name="trans-date" required value="${getTodayColombiaDateKey()}" class="w-full p-2 border rounded-lg">
            `)}
          </div>

          <div id="dynamic-fields" class="mt-4 p-3 bg-gray-50 rounded-lg hidden"></div>

          <div class="bg-blue-50 p-4 rounded-lg border border-blue-100 mt-4 mb-4">
            <div class="flex justify-between items-center mb-2">
                <label id="payment-methods-title" class="block text-sm font-bold text-blue-700 uppercase tracking-tight">Métodos de Pago / Cuentas</label>
                <button type="button" onclick="addPaymentMethod()" class="text-xs bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 font-bold shadow-sm transition-all">
                    + Agregar Cuenta
                </button>
            </div>
            
            <div id="payment-methods-container" class="space-y-2"></div>

            <div class="flex justify-end mt-3 pt-2 border-t border-blue-200">
                <div class="text-right">
                    <p class="text-[10px] text-gray-400 font-black uppercase tracking-widest">Total Operación</p>
                    <p id="total-display" class="text-2xl font-mono font-bold text-gray-800">$0</p>
                    <input type="hidden" id="trans-amount" name="trans-amount" value="0">
                </div>
            </div>
          </div>

          <div class="mt-4">
            ${renderFormGroup('Descripción / Observaciones', `
              <textarea id="trans-description" name="trans-description" rows="2" required class="w-full p-2 border rounded-lg placeholder-gray-400" placeholder="Ej: Pago arriendo local..."></textarea>
            `)}
          </div>
          <button type="submit" class="button-primary text-white p-3 w-full mt-6 rounded-lg font-semibold shadow-md">Registrar Movimiento</button>
        </form>
        <p id="transaction-message" class="text-sm text-center mt-3 hidden"></p>
      </div>
    `);

    // Dentro de renderBalance...
contentDiv.insertAdjacentHTML('beforeend', `
    <div class="bg-white p-5 rounded-xl card shadow-sm border border-gray-100 mb-8">
      <h2 class="text-xl font-semibold mb-4 text-gray-800">Historial de Transacciones</h2>
      <!-- BUSCADOR: insertar justo arriba de la tabla -->
<div class="mb-3">
  <input id="transaction-search"
         type="search"
         placeholder="Buscar por Tercero, Relación (placa), Fecha o Tipo..."
         class="w-full p-2 border rounded-lg text-sm placeholder-gray-400"
         autocomplete="off" />
</div>
      <div class="overflow-x-auto max-h-96">
        <table class="min-w-full divide-y divide-gray-200 text-sm">
         
         <thead class="bg-gray-50 sticky top-0 z-10 shadow-sm">
            <tr>
              <th class="px-3 py-3 text-left font-bold text-gray-500 uppercase text-xs">Fecha</th>
              <th class="px-3 py-3 text-left font-bold text-gray-500 uppercase text-xs">Tipo</th>
              <th class="px-3 py-3 text-left font-bold text-gray-500 uppercase text-xs">Monto</th>
              
              <th class="px-3 py-3 text-center font-bold text-emerald-600 uppercase text-xs">Ahorro</th>
              
              <th class="px-3 py-3 text-left font-bold text-gray-500 uppercase text-xs">Tercero</th>
              <th class="px-3 py-3 text-left font-bold text-gray-500 uppercase text-xs">Relación</th>
              <th class="px-3 py-3 text-left font-bold text-gray-500 uppercase text-xs">Cuenta</th>
              <th class="px-3 py-3 text-left font-bold text-gray-500 uppercase text-xs">Descripción</th>
              <th class="px-3 py-3 text-center font-bold text-gray-500 uppercase text-xs">Acción</th>
            </tr>
          </thead>
  
          <tbody id="transaction-table-body"></tbody>
        </table>
      </div>
    </div>
  `);

    document.getElementById('trans-type').addEventListener('change', updateTransactionCategories);
    document.getElementById('trans-category').addEventListener('change', updateDynamicFields);
    document.getElementById('transaction-form').addEventListener('submit', handleTransactionSubmit);
    // Conectar buscador de transacciones
const searchEl = document.getElementById('transaction-search');
if (searchEl) {
  let searchTimeout = null;
  searchEl.addEventListener('input', (e) => {
    const val = e.target.value;
    if (searchTimeout) clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      // Llamamos a la función de render con el término de búsqueda
      renderTransactionTableRows(null, null, val);
    }, 180); // debounce 180ms
  });
}

document.querySelectorAll('.period-btn').forEach(btn => {
  btn.addEventListener('click', () => {
      document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active', 'bg-emerald-500', 'text-white'));
      btn.classList.add('active', 'bg-emerald-500', 'text-white');
      
      // Limpiar inputs de fecha personalizada al usar botones rápidos
      if(document.getElementById('date-start')) document.getElementById('date-start').value = '';
      if(document.getElementById('date-end')) document.getElementById('date-end').value = '';

      const period = btn.dataset.period;
      const searchTerm = document.getElementById('transaction-search')?.value || '';
      
      document.getElementById('balance-summary').innerHTML = renderBalanceSummary(period, null);
      renderTransactionTableRows(period, null, searchTerm);
  });
});

// 🔥 NUEVO: Activar los calendarios de fechas específicas
const dateStart = document.getElementById('date-start');
const dateEnd = document.getElementById('date-end');

function applyCustomDateFilter() {
  if (dateStart && dateEnd && dateStart.value && dateEnd.value) {
      document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active', 'bg-emerald-500', 'text-white'));
      
      // 🔥 FORZADO A HORA COLOMBIA (UTC-5)
      const startBounds = getColombiaDayBounds(dateStart.value);
      const endBounds = getColombiaDayBounds(dateEnd.value);
      const startTs = startBounds.start;
      const endTs = endBounds.end;
      const customRange = { start: startTs, end: endTs };
      
      const searchTerm = document.getElementById('transaction-search')?.value || '';
      document.getElementById('balance-summary').innerHTML = renderBalanceSummary(null, customRange);
      renderTransactionTableRows(null, customRange, searchTerm);
  }
}

if (dateStart && dateEnd) {
  dateStart.addEventListener('change', applyCustomDateFilter);
  dateEnd.addEventListener('change', applyCustomDateFilter);
}

document.querySelector('[data-period="month"]')?.click();
setTimeout(() => addPaymentMethod(), 50);
}

/* ================= LÓGICA DE MULTI-PAGO ================= */

function addPaymentMethod() {
    const container = document.getElementById('payment-methods-container');
    if (!container) return;
    const id = Date.now();

    const html = `
        <div class="flex gap-2 items-center payment-row bg-white p-2 rounded border border-gray-200 shadow-sm" id="pay-row-${id}">
            <div class="flex-grow">
                <select name="pay-account[]" class="w-full p-2 border rounded text-sm bg-gray-50 font-medium" onchange="updatePaymentTotals()">
                    <option value="">-- Seleccionar Cuenta --</option>
                    ${savings.map(acc => `
                        <option value="${acc.id}" data-balance="${acc.saldo}">
                            ${acc.name || acc.tag} (Saldo: ${formatCurrency(acc.saldo)})
                        </option>
                    `).join('')}
                </select>
            </div>
            <div class="w-1/3 relative">
                <input type="number" name="pay-amount[]" placeholder="0" min="0" 
                    class="w-full p-2 border rounded text-sm font-mono text-right font-bold text-gray-700" 
                    oninput="updatePaymentTotals()" required>
            </div>
            <button type="button" onclick="removePaymentMethod(${id})" class="text-gray-400 hover:text-red-500 px-2">✕</button>
        </div>
    `;
    container.insertAdjacentHTML('beforeend', html);
}

function removePaymentMethod(id) {
    const rows = document.querySelectorAll('.payment-row');
    if (rows.length > 1) {
        document.getElementById(`pay-row-${id}`).remove();
        updatePaymentTotals();
    }
}

function updatePaymentTotals() {
    const inputs = document.querySelectorAll('input[name="pay-amount[]"]');
    let total = 0;
    inputs.forEach(input => total += parseFloat(input.value) || 0);
    
    document.getElementById('trans-amount').value = total;
    document.getElementById('total-display').innerText = formatCurrency(total);
}

/* ================= FUNCIONES DE APOYO ================= */

function renderPeriodSelector() {
    return `
        <div class="flex flex-wrap gap-4 mb-6 items-center bg-gray-50 p-4 rounded-xl border border-gray-200 shadow-sm">
            <div class="flex flex-wrap gap-2">
                <button class="period-btn px-4 py-2 rounded-lg text-sm font-semibold transition-all bg-white border hover:bg-gray-100" data-period="today">Hoy</button>
                <button class="period-btn px-4 py-2 rounded-lg text-sm font-semibold transition-all bg-white border hover:bg-gray-100" data-period="week">Semana</button>
                <button class="period-btn px-4 py-2 rounded-lg text-sm font-semibold transition-all bg-white border hover:bg-gray-100" data-period="month">Mes</button>
                <button class="period-btn px-4 py-2 rounded-lg text-sm font-semibold transition-all bg-white border hover:bg-gray-100" data-period="year">Año</button>
            </div>
            <div class="h-8 w-px bg-gray-300 hidden md:block mx-2"></div>
            <div class="flex items-center gap-3 bg-white p-1 px-3 rounded-lg border shadow-inner">
                <input type="date" id="date-start" class="border-none bg-transparent text-xs font-semibold outline-none cursor-pointer" />
                <span class="text-gray-300 font-bold">→</span>
                <input type="date" id="date-end" class="border-none bg-transparent text-xs font-semibold outline-none cursor-pointer" />
            </div>
        </div>
    `;
}

function renderBalanceSummary(period = 'month', customRange = null) {
    const { ingresos, egresos, balance } = calculateBalanceSummary(period, customRange);
    const saldoCaja = savings.find(s => s.id === 'CAJA')?.saldo || 0;
    const saldoBanco = savings.find(s => s.id === 'BANCO')?.saldo || 0;

    return `
      <div class="space-y-4 mb-6">
        </div>
        <div class="bg-white rounded-xl shadow-md border border-gray-100 p-6">
            <div class="text-center mb-6">
                <p class="text-[10px] text-gray-400 font-black uppercase tracking-widest mb-1">Resultado Neto</p>
                <p class="text-4xl font-bold ${balance >= 0 ? 'text-emerald-600' : 'text-red-600'}">
                    ${balance >= 0 ? '↑' : '↓'} ${formatCurrency(balance)}
                </p>
            </div>
            <div class="grid grid-cols-2 gap-6 pt-6 border-t border-gray-50">
                <div class="text-center">
                    <p class="text-[10px] text-gray-400 font-bold uppercase mb-2 tracking-wider">Total Ingresos</p>
                    <p class="text-xl font-bold text-emerald-600 bg-emerald-50 rounded-full py-2 px-4 inline-block">+ ${formatCurrency(ingresos)}</p>
                </div>
                <div class="text-center">
                    <p class="text-[10px] text-gray-400 font-bold uppercase mb-2 tracking-wider">Total Egresos</p>
                    <p class="text-xl font-bold text-red-600 bg-red-50 rounded-full py-2 px-4 inline-block">- ${formatCurrency(egresos)}</p>
                </div>
            </div>
        </div>
      </div>
    `;
}


function updateTransferCostCalculation() {
    const category = document.getElementById('trans-category')?.value;
    // Hacemos la comprobación más tolerante (captura 'VENTA_TRASPASO' y variantes)
    if (!category || !String(category).toUpperCase().includes('TRASPASO')) return;
  
    const cityId = document.getElementById('transfer-city-id')?.value;
    const valuationId = document.getElementById('transfer-valuation-id')?.value;
    const vehicleValueInput = document.getElementById('transfer-vehicle-value');
    const amountInput = document.getElementById('trans-amount');
    const summaryDiv = document.getElementById('transfer-cost-summary');
  
    if (!vehicleValueInput || !amountInput || !summaryDiv) return;
  
    // Si se seleccionó un avalúo, autocompletar valor comercial
    if (valuationId) {
        let list = [];
        try { list = getVehicleAvaluos(); } catch(e) { list = []; }
        const avaluo = Array.isArray(list) ? list.find(a => a.id === valuationId) : null;
        if (avaluo) vehicleValueInput.value = avaluo.commercial_value;
    }
  
    let vehicleValue = parseFloat(vehicleValueInput.value) || 0;
  
    // Buscar configuración de la ciudad (transferCostsConfig debe existir)
    const config = (Array.isArray(transferCostsConfig) ? transferCostsConfig.find(c => String(c.id || '').toUpperCase() === String(cityId || '').toUpperCase()) : null);
  
    if (!config || !cityId) {
        summaryDiv.classList.add('hidden');
        summaryDiv.innerHTML = '';
        return;
    }
  
    const fixedCosts = (config.runt_cost || 0) + (config.stamps_cost || 0) + (config.agent_fee || 0) + (config.transfer_rights_cost || 0);
    const configuredProfit = config.configured_profit || 0;
    const impuesto1Percent = Math.round(vehicleValue * 0.01);
    const totalExpense = Math.round(fixedCosts + impuesto1Percent);
    const totalToCharge = Math.round(totalExpense + configuredProfit);
  
    // Volcamos resultado en el input oculto y en el resumen
    amountInput.value = totalToCharge;
  
    summaryDiv.innerHTML = `
        <div class="p-3">
            <p class="font-bold text-sm text-purple-700 mb-2">Cálculo Automático del Servicio</p>
            <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-600">
                <span>Trámites Fijos:</span> <span class="text-right font-medium">${formatCurrency(fixedCosts)}</span>
                <span>Impuesto 1%:</span> <span class="text-right font-medium text-blue-600">${formatCurrency(impuesto1Percent)}</span>
                <span class="font-bold text-slate-800">TOTAL COSTOS (EGRESO):</span> <span class="font-bold text-slate-800 text-right">${formatCurrency(totalExpense)}</span>
                <span class="font-bold text-emerald-600">GANANCIA FIJA:</span> <span class="text-right font-medium">${formatCurrency(configuredProfit)}</span>
            </div>
            <p class="mt-2 text-center font-black text-sm text-indigo-900 border-t border-indigo-200 pt-2">
                A COBRAR: <span class="text-emerald-700">${formatCurrency(totalToCharge)}</span>
            </p>
        </div>
    `;
  
    summaryDiv.classList.remove('hidden');
  }
  
  window.updateTransferCostCalculation = updateTransferCostCalculation;

  /* ======================================================
   NUEVO: RELOJ RESTRINGIDO A ZONA HORARIA COLOMBIA (UTC-5)
====================================================== */
function getColombiaTimeBounds(period) {
  // 1. Obtenemos la fecha actual, pero la obligamos a ser la hora de Bogotá
  const nowStr = new Date().toLocaleString("en-US", { timeZone: "America/Bogota" });
  const coDate = new Date(nowStr);

  const year = coDate.getFullYear();
  const month = coDate.getMonth();
  const date = coDate.getDate();
  const day = coDate.getDay();

  // 2. Helper para forzar la creación del timestamp con el offset de Colombia (-05:00)
  const makeCoTs = (y, m, d, h, min, s) => {
      const pad = (n) => String(n).padStart(2, '0');
      // Obligamos al navegador a entender que esta hora pertenece a Colombia
      return new Date(`${y}-${pad(m+1)}-${pad(d)}T${pad(h)}:${pad(min)}:${pad(s)}-05:00`).getTime();
  };

  let start, end;
  switch(period) {
      case 'today':
          start = makeCoTs(year, month, date, 0, 0, 0);
          end = makeCoTs(year, month, date, 23, 59, 59) + 999;
          break;
      case 'week':
          const startOfWeek = new Date(coDate);
          const first = date - day + (day === 0 ? -6 : 1); // Lunes
          startOfWeek.setDate(first);
          start = makeCoTs(startOfWeek.getFullYear(), startOfWeek.getMonth(), startOfWeek.getDate(), 0, 0, 0);

          const endOfWeek = new Date(coDate);
          endOfWeek.setDate(first + 6); // Domingo
          end = makeCoTs(endOfWeek.getFullYear(), endOfWeek.getMonth(), endOfWeek.getDate(), 23, 59, 59) + 999;
          break;
      case 'year':
          start = makeCoTs(year, 0, 1, 0, 0, 0);
          end = makeCoTs(year, 11, 31, 23, 59, 59) + 999;
          break;
      case 'month':
      default:
          start = makeCoTs(year, month, 1, 0, 0, 0);
          const lastDay = new Date(coDate);
          lastDay.setMonth(month + 1, 0);
          end = makeCoTs(lastDay.getFullYear(), lastDay.getMonth(), lastDay.getDate(), 23, 59, 59) + 999;
          break;
  }
  return { start, end };
}

function calculateBalanceSummary(period = 'month', customRange = null) {
  let filtered = transactions.filter(t => t.status === 'ACTIVA');
  let start, end;

  if (customRange && customRange.start && customRange.end) {
      start = customRange.start; 
      end = customRange.end;
  } else {
      // 🔥 Usamos nuestro cerebro colombiano
      const bounds = getColombiaTimeBounds(period);
      start = bounds.start; 
      end = bounds.end;
  }

  filtered = filtered.filter(t => {
      const tDate = t.date || t.timestamp; // Protegemos por si una variable falta
      return tDate >= start && tDate <= end;
  });

  const ingresos = filtered.filter(t => t.type === 'INGRESO').reduce((s, t) => s + (t.amount || 0), 0);
  const egresos = filtered.filter(t => t.type === 'EGRESO').reduce((s, t) => s + (t.amount || 0), 0);
  
  return { ingresos, egresos, balance: ingresos - egresos };
}

function updateTransactionCategories() {
    const type = document.getElementById('trans-type').value;
    const categorySelect = document.getElementById('trans-category');
    categorySelect.innerHTML = `<option value="">Seleccione Categoría</option>`;
    if (type && TRANSACTION_OPTIONS[type]) {
        TRANSACTION_OPTIONS[type].forEach(cat => categorySelect.innerHTML += `<option value="${cat.value}">${cat.label}</option>`);
    }
    updateDynamicFields();
}

// js/modules/balance.js

// Función para buscar cliente y llenar datos automáticamente
window.searchClientById = function(idValue) {
    const term = idValue.trim().toUpperCase();
    if (term.length < 3) return; // Esperar a que escriba un poco

    // Buscar en la lista de clientes importada del store
    const foundClient = clients.find(c => c.id_number === term);

    const feedbackEl = document.getElementById('client-found-feedback');
    
    if (foundClient) {
        // Si existe, llenamos los campos
        if(document.getElementById('debt-client')) document.getElementById('debt-client').value = foundClient.name || '';
        if(document.getElementById('debt-phone')) document.getElementById('debt-phone').value = foundClient.phone || '';
        if(document.getElementById('debt-address')) document.getElementById('debt-address').value = foundClient.address || '';
        if(document.getElementById('debt-city')) document.getElementById('debt-city').value = foundClient.city || '';
        
        // Mensaje visual
        if(feedbackEl) {
            feedbackEl.innerHTML = `<span class="text-emerald-600 font-bold">✓ Cliente encontrado: ${foundClient.name}</span>`;
            feedbackEl.classList.remove('hidden');
        }
    } else {
        // Si no existe, limpiamos el mensaje (opcional: limpiar campos si se desea)
        if(feedbackEl) {
            feedbackEl.innerHTML = `<span class="text-blue-500 text-xs">Nuevo cliente (se creará al guardar)</span>`;
            feedbackEl.classList.remove('hidden');
        }
    }
};

function updateDynamicFields() {
    const category = document.getElementById('trans-category').value;
    const dynamicFieldsDiv = document.getElementById('dynamic-fields');
    
    // 1. Buscar la configuración de la categoría seleccionada
    const selectedCat = TRANSACTION_OPTIONS.INGRESO.find(c => c.value === category) || 
                        TRANSACTION_OPTIONS.EGRESO.find(c => c.value === category);

    if (!selectedCat) {
        dynamicFieldsDiv.classList.add('hidden'); 
        dynamicFieldsDiv.innerHTML = ''; 
        return;
    }

    let html = ''; 
    let showDiv = false;
    const isDebtOrCxp = selectedCat.debt || selectedCat.cxp || selectedCat.pawn;

    // --- SECCIÓN A: DATOS DEL CLIENTE (Mejorada con Auto-completado) ---
    if (selectedCat.client || selectedCat.transfer || selectedCat.pawn || selectedCat.soat) {
        showDiv = true;
        const clientTitle = selectedCat.pawn ? 'DATOS DEL DEUDOR (EMPEÑO)' : 'DATOS DEL CLIENTE (COBRO)';
        const titleClass = selectedCat.pawn ? 'text-red-700' : (selectedCat.transfer ? 'text-purple-700' : 'text-blue-700');
        
        html += `
            <div class="flex justify-between items-end mb-2">
                <p class="font-semibold text-sm ${titleClass}">${clientTitle}</p>
                <div id="client-found-feedback" class="text-xs hiddEMPEÑOen"></div>
            </div>
            
            <div class="grid sm:grid-cols-2 gap-4">
                ${renderFormGroup('Cédula/ID', `<input type="text" id="debt-id" required class="w-full p-2 border rounded-lg uppercase" placeholder="Escribe para buscar..." oninput="window.searchClientById(this.value)">`)}
                
                ${renderFormGroup('Nombre Completo', `<input type="text" id="debt-client" required class="w-full p-2 border rounded-lg">`)}
                ${renderFormGroup('Teléfono', `<input type="tel" id="debt-phone" required class="w-full p-2 border rounded-lg">`)}
                ${renderFormGroup('Ciudad', `<input type="text" id="debt-city" class="w-full p-2 border rounded-lg">`)}
            </div>
            ${renderFormGroup('Dirección', `<input type="text" id="debt-address" class="w-full p-2 border rounded-lg">`)}
            <hr class="my-4 border-gray-300">`;
    }

// --- SECCIÓN B: COTIZADOR SOAT (ACTUALIZADO A NUEVA ESTRUCTURA) ---
if (selectedCat.soat || category === 'VENTA_SOAT' || category === 'Venta Seguro SOAT') {
    showDiv = true;
    
    // Generamos solo las opciones de clase basadas en tu variable unificada soatPrices
    const classOptions = (typeof soatPrices !== 'undefined' ? soatPrices : [])
        .map(c => `<option value="${c.id}">${c.nombre_clase || c.id}</option>`)
        .join('');

        html += `
        <div class="p-4 bg-blue-50 rounded-lg border border-blue-200 mb-4 shadow-sm">
            <h4 class="font-bold text-blue-800 mb-3 text-xs uppercase flex items-center gap-2">
                <i class="fa-solid fa-shield-halved"></i> Cotizador SOAT Automático
            </h4>
            <div class="grid grid-cols-2 gap-4">
                ${renderFormGroup('Tipo de Vehículo', `
                    <select id="soat-class-select" onchange="window.updateSoatRanges()" class="w-full p-2 border rounded-lg bg-white text-sm font-semibold text-gray-700 outline-none focus:border-blue-500">
                        <option value="">-- Seleccione Clase --</option>
                        ${classOptions}
                    </select>
                `)}
                
                ${renderFormGroup('Cilindraje / Rango', `
                    <select id="soat-range-select" onchange="window.calculateSoatPrice()" disabled class="w-full p-2 border rounded-lg bg-gray-100 text-sm outline-none focus:border-blue-500 disabled:opacity-50 transition-all">
                      <option value="">-- Seleccione primero la clase --</option>
                    </select>
                  `)}
            </div>
            
            <div class="mt-4 pt-3 border-t border-blue-200 flex justify-between items-center">
                <span class="text-[10px] font-black text-blue-400 uppercase tracking-widest">Precio a cobrar SOAT</span>
                <div id="soat-price-display" class="text-right font-black text-2xl text-blue-600">
                    $ 0
                </div>
                <input type="hidden" id="soat-profit-hidden" name="soat_profit_hidden" value="0">
            </div>
        </div><hr class="my-4 border-gray-300">`;
     

}
// --- SECCIÓN C: DETALLES DEL TRASPASO (actualizado para incluir Avalúo) ---
if (selectedCat.transfer) {
    showDiv = true;
    const ciudadesActuales = typeof getTransferCostsConfig === 'function' ? getTransferCostsConfig() : transferCostsConfig;

    html += `
        <p class="font-semibold text-sm mb-2 text-purple-700">DETALLES DEL TRASPASO Y CÁLCULO DE COBRO</p>
        <div class="grid sm:grid-cols-2 gap-4">
            ${renderFormGroup('Placa del Vehículo', `<input type="text" id="transfer-placa" required class="w-full p-2 border rounded-lg uppercase" placeholder="ABC-123">`)}
            
            ${renderFormGroup('Avalúo Comercial del Vehículo (Opcional)', `
                <select id="transfer-valuation-id" class="w-full p-2 border rounded-lg">
                    <option value="">-- Seleccione Marca/Modelo (Opcional) --</option>
                    ${getVehicleAvaluos().map(a => `<option value="${a.id}" data-value="${a.commercial_value}">${a.brand} ${a.model} (${a.year})</option>`).join('')}
                </select>
            `)}
            
            ${renderFormGroup('Valor Comercial del Vehículo ($) (1% Impuesto)', `<input type="number" id="transfer-vehicle-value" required min="1" class="w-full p-2 border rounded-lg" placeholder="Valor para el 1% de impuesto" value="0">`)}
            
            ${renderFormGroup('Ciudad del Traspaso', `
                <select id="transfer-city-id" required class="w-full p-2 border rounded-lg">
                    <option value="">-- Seleccione Ciudad --</option>
                    ${ciudadesActuales.map(c => `<option value="${c.id}">${c.city_name}</option>`).join('')}
                </select>
            `)}
        </div>

        <div id="transfer-cost-summary" class="mt-4 p-3 bg-purple-100 border border-purple-300 rounded-lg text-sm hidden">
            <!-- Se llenará por JS -->
        </div>

        <hr class="my-4 border-gray-300">
    `;
}


    // --- SECCIÓN D: PROVEEDORES ---
    if (selectedCat.provider) {
        showDiv = true;
        html += `
            <p class="font-semibold text-sm mb-2 text-red-700">DATOS DEL PROVEEDOR</p>
            ${renderFormGroup('Seleccionar Proveedor', `
                <select id="related-provider-id" required class="w-full p-2 border rounded-lg">
                    <option value="">-- Seleccione --</option>
                    ${providers.map(p => `<option value="${p.id_number}">${p.name}</option>`).join('')}
                </select>`)}<hr class="my-4 border-gray-300">`;
    }

    // --- SECCIÓN E: COMPRA DE INVENTARIO ---
    if (selectedCat.value === 'GASTO_INVERSION_COMPRA') {
        showDiv = true;
        html += `
            <div class="grid sm:grid-cols-2 gap-4">
                ${renderFormGroup('Nombre Producto', `<input type="text" id="inv-nombre" required class="w-full p-2 border rounded-lg">`)}
                ${renderFormGroup('Placa', `<input type="text" id="inv-placa" required class="w-full p-2 border rounded-lg uppercase">`)}
                ${renderFormGroup('Precio Venta Sugerido', `<input type="number" id="inv-precio_venta" required class="w-full p-2 border rounded-lg">`)}
                ${renderFormGroup('Descuento Máximo Permitido', `<input type="number" id="inv-max-discount" placeholder="0" class="w-full p-2 border rounded-lg text-red-600 font-bold">`)}
            </div>
            ${renderFormGroup('Descripción Comercial', `<textarea id="inv-descripcion" class="w-full p-2 border rounded-lg min-h-24" placeholder="Ej: Excelente para trabajo, bajo consumo, papeles al día..."></textarea>`)}
           `;
    }

   // --- SECCIÓN F: CRÉDITOS ---
   if (isDebtOrCxp) {
    showDiv = true;
  
    html += `
      <p class="font-semibold text-sm mb-2 text-indigo-700">CONFIGURACIÓN CRÉDITO</p>
      <div class="grid sm:grid-cols-2 gap-4">
    `;
  
    // --- CONDICIONAL REAL (FUERA del template string) ---
    if (selectedCat && selectedCat.value === 'VENTA_CREDITO') {
      html += `
        ${renderFormGroup('Vehículo / Producto', `
          <div class="flex flex-col gap-1">
            <input type="text" placeholder="🔍 Buscar producto o placa..." class="w-full p-2 border rounded-lg text-sm bg-white" oninput="window.updateDynamicDropdowns(this.value)">
            <select id="related-inventory-id" required class="w-full p-2 border rounded-lg bg-indigo-50 mt-1">
              <option value="">-- Seleccione Vehículo / Producto --</option>
            </select>
          </div>
        `)}
      `;
    } else {
      html += `
        ${renderFormGroup('Vehículo / Producto / Concepto', `
          <input type="text" id="credit-product-name"
            placeholder="Ej: Moto ABC-123, Licuadora, etc."
            class="w-full p-2 border rounded-lg bg-indigo-50 font-bold text-gray-700 uppercase">
        `)}
      `;
    }
  
    // --- CAMPOS QUE SIEMPRE VAN ---
    html += `
    ${renderFormGroup('Tasa Mensual (%)',
      `<input type="number" id="debt-interest-rate" required value="2" step="0.01" min="0"
       class="w-full p-2 border rounded-lg">`)}

    ${renderFormGroup('Tasa de Mora (%)',
      `<input type="number" id="debt-mora-rate" value="0" step="0.01" min="0"
       class="w-full p-2 border rounded-lg bg-red-50 text-red-700 font-bold" title="Porcentaje adicional si se atrasa en el pago">`)}

           ${renderFormGroup('Tipo de interés', `
            <div class="flex p-1 bg-slate-100 rounded-xl w-fit border border-slate-200">
                <label class="relative flex-1 group">
                    <input type="radio" name="debt-interest-type" value="FIJO" checked class="peer hidden">
                    <div class="cursor-pointer px-4 py-2 rounded-lg text-xs font-bold transition-all
                                peer-checked:bg-white peer-checked:text-indigo-600 peer-checked:shadow-sm
                                text-slate-500 hover:text-slate-700">
                        <i class="fa-solid fa-lock mr-1.5 opacity-70"></i>Interés Fijo
                    </div>
                </label>
                
                <label class="relative flex-1 group">
                    <input type="radio" name="debt-interest-type" value="SOBRE_SALDO" class="peer hidden">
                    <div class="cursor-pointer px-4 py-2 rounded-lg text-xs font-bold transition-all
                                peer-checked:bg-white peer-checked:text-indigo-600 peer-checked:shadow-sm
                                text-slate-500 hover:text-slate-700">
                        <i class="fa-solid fa-chart-line mr-1.5 opacity-70"></i>Sobre Saldo
                    </div>
                </label>
            </div>
            <p class="text-[10px] text-slate-400 mt-1.5 ml-1 italic">* Selecciona el método de cálculo para los intereses mensuales.</p>
        `)}
  
        ${renderFormGroup('Próx. Pago',
          `<input type="date" id="debt-next-payment-date" required
           class="w-full p-2 border rounded-lg">`)}
    `;

    // SOLO renderizamos el campo manual de deuda si NO es Préstamo Capital
// SOLO renderizamos el campo manual de deuda si NO es Préstamo ni Empeño
if (selectedCat && selectedCat.value !== 'PRESTAMO_CAPITAL' && selectedCat.value !== 'EMPEÑO') {
  html += renderFormGroup('Saldo a Financiar',
      `<input type="number" id="credit-debt-amount" required
       placeholder="Monto que queda debiendo"
       class="w-full p-2 border rounded-lg bg-yellow-50 font-bold">`
  );
}

html += `</div>`;
}

// --- NUEVO: Cambiar el título de la sección de pagos según la categoría ---
const pmTitle = document.getElementById('payment-methods-title');
if (pmTitle) {
if (category === 'PRESTAMO_CAPITAL') {
    pmTitle.innerHTML = '🏦 Cuentas destino del Préstamo a Financiar <span class="text-[10px] font-normal text-gray-500 lowercase ml-2">(El total ingresado aquí será la deuda a pagar)</span>';
} else if (category === 'EMPEÑO') {
    pmTitle.innerHTML = '🏦 Cuentas origen del Empeño <span class="text-[10px] font-normal text-gray-500 lowercase ml-2">(El total retirado de aquí será la deuda a cobrar)</span>';
} else {
    pmTitle.innerText = 'Métodos de Pago / Cuentas';
}
}
  

  // --- SECCIÓN G: MANTENIMIENTO O VENTA PRODUCTO ---
  if (selectedCat.value === 'GASTO_MANTENIMIENTO' || selectedCat.value === 'VENTA_PRODUCTO_CONTADO') {
    showDiv = true;
    html += `${renderFormGroup('Seleccionar Producto', `
        <div class="flex flex-col gap-1">
            <input type="text" placeholder="🔍 Buscar producto o placa..." class="w-full p-2 border rounded-lg text-sm bg-white shadow-sm focus:ring-2 focus:ring-emerald-400" oninput="window.updateDynamicDropdowns(this.value)">
            <select id="related-inventory-id" required class="w-full p-2 border rounded-lg mt-1 bg-gray-50">
                <option value="">-- Seleccione --</option>
            </select>
        </div>
    `)}`;
}

    // 2. Renderizado Final
    dynamicFieldsDiv.innerHTML = html;
    const selectedCategoryValue  = document.getElementById('trans-category')?.value;
if (String(selectedCategoryValue ) !== 'VENTA_PRODUCTO_CONTADO') {
    const td = document.getElementById('total-display');
    if (td) {
        // Restaurar aspecto normal
        td.innerHTML = formatCurrency ? formatCurrency(parseFloat(document.getElementById('trans-amount')?.value || 0)) : new Intl.NumberFormat('es-CO', {style:'currency',currency:'COP',minimumFractionDigits:0}).format(0);
        td.style.background = '';
        td.style.color = '';
        td.dataset.inventoryError = 'false';
    }
}

    // --- Conectar listeners del Traspaso (si existen los elementos) ---
setTimeout(() => {
    const cityEl = document.getElementById('transfer-city-id');
    const valEl = document.getElementById('transfer-valuation-id');
    const vehicleValEl = document.getElementById('transfer-vehicle-value');
  
    if (cityEl) cityEl.addEventListener('change', window.updateTransferCostCalculation);
    if (valEl) {
      valEl.addEventListener('change', window.updateTransferCostCalculation);
      // Auto-fill value on select (traspasos.js already does this, but defensivo)
      valEl.addEventListener('change', () => {
        const sel = valEl.options[valEl.selectedIndex];
        if (sel && sel.dataset && sel.dataset.value) {
          const v = parseFloat(sel.dataset.value) || 0;
          const inp = document.getElementById('transfer-vehicle-value');
          if (inp) inp.value = v;
        }
      });
    }
    if (vehicleValEl) vehicleValEl.addEventListener('input', window.updateTransferCostCalculation);
  
    // Si la categoría ya es VENTA_TRASPASO (form ya visible), forzamos cálculo una vez
    if (document.getElementById('transfer-cost-summary')) window.updateTransferCostCalculation();
  }, 80);
  
    
    if (showDiv) {
        dynamicFieldsDiv.classList.remove('hidden');
        if (category.includes('VENTA') || category.includes('MANTENIMIENTO')) {
            updateDynamicDropdowns(); // Función que llena los selects de inventario
        }
    } else {
        dynamicFieldsDiv.classList.add('hidden');
    }
    
}

function updateDynamicDropdowns(searchTerm = '') {
  // 1. Normalizamos el término de búsqueda
  const normalizedTerm = typeof searchTerm === 'string' ? searchTerm.toLowerCase().trim() : '';

  // 2. Filtramos items disponibles Y que coincidan con la búsqueda
  const availableItems = inventory.filter(item => {
      const isAvailable = (item.estado || item.status || '').toString().toUpperCase() !== 'VENDIDO';
      if (!isAvailable) return false;
      
      // Si no hay texto de búsqueda, mostramos todos los disponibles
      if (!normalizedTerm) return true; 
      
      // Si hay texto, buscamos coincidencias en nombre, descripción, marca, modelo o placa
      const textoBusqueda = `${item.nombre || ''} ${item.descripcion || ''} ${item.brand || ''} ${item.model || ''} ${item.placa || ''}`.toLowerCase();
      return textoBusqueda.includes(normalizedTerm);
  });

  const selects = document.querySelectorAll('#related-inventory-id');

  selects.forEach(select => {
      // Guardamos el valor actual seleccionado
      const currentValue = select.value;

      // 3. Limpiamos y llenamos el select con los resultados filtrados
      select.innerHTML = `<option value="">-- Seleccione --</option>`;
      availableItems.forEach(item => {
          const precio = item.precio_venta || 0;
          const descuento = item.max_discount_amount || 0;
          const nombre = item.nombre || `${item.brand || ''} ${item.model || ''}`.trim();
          const placa = item.placa ? ` - ${item.placa}` : '';

          select.insertAdjacentHTML('beforeend', `
              <option value="${item.id}"
                      data-price="${precio}"
                      data-discount="${descuento}">
                  ${nombre}${placa}
              </option>`);
      });

      // 4. Intentamos mantener la selección si aún existe tras el filtro
      select.value = currentValue;

      // 5. Agregamos el listener para que actualice la info visual de precios
      select.setAttribute('onchange', 'window.updateInventoryInfo(this)');

      // 6. Extra info (Venta, Máx. Desc)
      if (!select.nextElementSibling || select.nextElementSibling.id !== 'inventory-extra-info') {
          const infoHtml = `
              <div id="inventory-extra-info" class="mt-2 flex gap-4 text-sm font-bold hidden">
                  <div class="bg-emerald-100 text-emerald-700 px-3 py-1 rounded-md border border-emerald-200">
                      Venta: <span id="info-precio">$0</span>
                  </div>
                  <div class="bg-red-100 text-red-700 px-3 py-1 rounded-md border border-red-200">
                      Máx. Desc: <span id="info-descuento">$0</span>
                  </div>
              </div>`;
          select.insertAdjacentHTML('afterend', infoHtml);
      }
  });
}

window.updateInventoryInfo = function(selectElement) {
    // contenedor relativo al select (misma estructura que ya tienes)
    const container = selectElement.parentElement;
    const infoBox = container.querySelector('#inventory-extra-info');
    const precioSpan = container.querySelector('#info-precio');
    const descuentoSpan = container.querySelector('#info-descuento');
    const selectedOption = selectElement.options[selectElement.selectedIndex];

    const totalDisplay = document.getElementById('total-display');
    const transAmountInput = document.getElementById('trans-amount'); // el input que almacena el total
    const paymentInputs = () => document.querySelectorAll('input[name="pay-amount[]"]');

    const moneyFormatter = new Intl.NumberFormat('es-CO', {
        style: 'currency',
        currency: 'COP',
        minimumFractionDigits: 0
    });

    // helper para limpiar mensaje de error y restaurar apariencias
    function clearTotalDisplay() {
        // si hay monto, mostrarlo con formato; si no, mostrar $0
        const current = parseFloat(transAmountInput?.value || 0) || 0;
        totalDisplay.innerHTML = formatCurrency ? formatCurrency(current) : moneyFormatter.format(current);
        totalDisplay.style.background = '';
        totalDisplay.style.color = '';
        totalDisplay.dataset.inventoryError = 'false';
    }

    // remover listener previo (evita duplicados al re-render)
    if (container._invValidateFn) {
        if (transAmountInput) transAmountInput.removeEventListener('input', container._invValidateFn);
        paymentInputs().forEach(inp => inp.removeEventListener('input', container._invValidateFn));
    }

    if (selectedOption && selectedOption.value !== "") {
        const precio = parseFloat(selectedOption.getAttribute('data-price')) || 0;
        const descuento = parseFloat(selectedOption.getAttribute('data-discount')) || 0;

        precioSpan.innerText = moneyFormatter.format(precio);
        descuentoSpan.innerText = moneyFormatter.format(descuento);
        infoBox.classList.remove('hidden');

        // Validación sólo para la categoría VENTA_PRODUCTO_CONTADO
        const selectedCategoryValue  = document.getElementById('trans-category')?.value;
        if (['VENTA_PRODUCTO_CONTADO', 'VENTA_CREDITO'].includes(String(selectedCategoryValue))) {
            const precioMinimo = precio - descuento;

            // función reutilizable que valida el monto actual
            const validateAmountAgainstMin = () => {
                const montoActual = parseFloat(transAmountInput?.value || 0) || 0;
                if (montoActual < precioMinimo) {
                    // mostrar mensaje en rojo con fondo rosado y icono ⚠️
                    totalDisplay.innerHTML = `
                        <span style="display:inline-block;padding:6px 10px;border-radius:8px;
                                     background:#ffe4e6;color:#dc2626;font-weight:700;">
                            ⚠️ EXCESO DE DESCUENTO (Mínimo: ${moneyFormatter.format(precioMinimo)})
                        </span>`;
                    totalDisplay.dataset.inventoryError = 'true';
                } else {
                    clearTotalDisplay();
                }
            };

            // guardar referencia para poder remover listeners más tarde
            container._invValidateFn = validateAmountAgainstMin;

            // conectar listeners
            if (transAmountInput) transAmountInput.addEventListener('input', validateAmountAgainstMin);
            paymentInputs().forEach(inp => inp.addEventListener('input', validateAmountAgainstMin));

            // validar inmediatamente con el valor actual
            validateAmountAgainstMin();
            return;
        } else {
            // si no es venta contado, limpiar cualquier restricción previa
            clearTotalDisplay();
        }

    } else {
        // si no hay opción seleccionada, ocultar infoBox y limpiar mensajes
        infoBox.classList.add('hidden');
        clearTotalDisplay();
    }
};
/* ================= GUARDADO CON MULTI-PAGO Y SPLIT ================= */

async function handleTransactionSubmit(event) {
  event.preventDefault();
  const form = event.target;

  // -----------------------
  // PREPARACIÓN Y DATOS
  // -----------------------
  let montoDistribuido = 0;
  let distribucionRealizada = [];
  const nowColombia = getColombiaNow();
  const timeNow = nowColombia.timestampMs;

  // Datos básicos
  const type = form['trans-type'].value;
  const category = form['trans-category'].value;
  const normalizedType = String(type || '').toUpperCase().trim();
  const normalizedCategory = String(category || '').toUpperCase().trim();
  let desc = form['trans-description'].value || '';

  // Priorizar inventario seleccionado para descripción
  let customProduct = '';
  const selInv = document.getElementById('related-inventory-id');
  if (selInv && selInv.value) {
    customProduct = selInv.options[selInv.selectedIndex]?.text || '';
  } else {
    customProduct = (document.getElementById('credit-product-name')?.value || '').trim();
  }
  if (customProduct) desc = `${customProduct} - ${desc}`;

  const transactionDateKey = form['trans-date'].value || nowColombia.dateKey;
  const date = colombiaDateInputToTimestamp(transactionDateKey, '12:00:00');
  const transactionDateColombia = getColombiaNow(new Date(date));

  // -----------------------
  // MÉTODOS DE PAGO (UI)
  // -----------------------
  const paymentRows = document.querySelectorAll('.payment-row');
  const paymentMethods = [];
  let totalAmount = 0;

  paymentRows.forEach(row => {
    const select = row.querySelector('select');
    const input = row.querySelector('input');
    const accId = select?.value;
    const amt = parseFloat(input?.value) || 0;
    const accName = select?.options?.[select.selectedIndex]?.text || null;

    if (accId && amt > 0) {
      paymentMethods.push({ accountId: accId, amount: amt, name: accName });
      totalAmount += amt;
    }
  });

  if (paymentMethods.length === 0) return alert("Seleccione al menos un método de pago.");

  // Validación especial: venta contado con precio mínimo
  if (normalizedType === 'INGRESO' && ['VENTA_PRODUCTO_CONTADO', 'VENTA_CREDITO'].includes(normalizedCategory)) {
    const relatedInvId = form['related-inventory-id']?.value || document.getElementById('related-inventory-id')?.value;
    if (relatedInvId) {
      const producto = inventory.find(i => String(i.id) === String(relatedInvId));
      const pVenta = parseFloat(producto?.precio_venta) || 0;
      const maxDesc = parseFloat(producto?.max_discount_amount) || 0;
      const precioMinimo = pVenta - maxDesc;
      const montoIngresado = parseFloat(document.getElementById('trans-amount')?.value || totalAmount || 0) || 0;

      if (montoIngresado < precioMinimo) {
        const moneyFormatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });
        const totalDisplay = document.getElementById('total-display');
        if (totalDisplay) {
          totalDisplay.innerHTML = `
            <span style="display:inline-block;padding:8px 10px;border-radius:8px;
              background:#ffe4e6;color:#991b1b;font-weight:800;">
              ⛔ NO SE PUEDE GUARDAR: El precio es inferior al límite permitido (Mínimo: ${moneyFormatter.format(precioMinimo)})
            </span>`;
        }
        const submitBtn = (form.querySelector('button[type="submit"]') || document.querySelector('button[type="submit"]'));
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerText = submitBtn.dataset.originalText || submitBtn.innerText;
        }
        return;
      }
    }
  }

// -----------------------
  // AJUSTE (Saldo a Financiar) - SECCIÓN MOVIDA: debe ejecutarse ANTES de Profit First
  // -----------------------
  // Leemos valor original de saldo a financiar (si existe en el formulario)
  const originalSaldoFinanciar = Math.round((parseFloat(document.getElementById('credit-debt-amount')?.value || 0) || 0) * 100) / 100;

  // Aplicar SOLO si es INGRESO y es VENTA_CREDITO (Para PRESTAMO_CAPITAL el total ingresado a cuentas ES la deuda)
  if (normalizedType === 'INGRESO' && normalizedCategory === 'VENTA_CREDITO' && originalSaldoFinanciar > 0) { const prevTotal = Math.round((totalAmount || 0) * 100) / 100;
    const remaining = Math.max(Math.round((prevTotal - originalSaldoFinanciar) * 100) / 100, 0);

    // Guardamos el monto neto en totalAmount (monto base para distribución y transacción)
    totalAmount = remaining;

    // Actualizamos trans-amount UI inmediatamente (no afectamos la lógica de deudas)
    const td = document.getElementById('total-display');
    const transAmountInput = document.getElementById('trans-amount');
    if (transAmountInput) transAmountInput.value = remaining;
    if (td) td.innerText = typeof formatCurrency === 'function'
      ? formatCurrency(remaining)
      : new Intl.NumberFormat('es-CO', { style:'currency', currency:'COP', minimumFractionDigits:0 }).format(remaining);

    
  }

  // -----------------------
  // SINCRONIZAR paymentMethods con el remaining (para que Ahorros reciba la cantidad real)
  // -----------------------
  try {
    // suma actual de los pagos declarados por el usuario
    const sumPayments = (paymentMethods || []).reduce((s, p) => s + (parseFloat(p.amount || 0) || 0), 0);
    const diff = Math.round((sumPayments - totalAmount) * 100) / 100; // sumPayments - remaining (nota: totalAmount ya fue actualizado si aplica)

    if (Math.abs(diff) > 0.01 && (paymentMethods || []).length > 0) {
      // Distribuimos la diferencia reduciéndola de forma ordenada sobre los métodos de pago
      let remainingDiff = diff;
      const payInputs = Array.from(document.querySelectorAll('input[name="pay-amount[]"]'));

      for (let i = 0; i < paymentMethods.length && remainingDiff > 0; i++) {
        const pm = paymentMethods[i];
        const available = Math.max(parseFloat(pm.amount || 0), 0);
        const reduce = Math.min(available, remainingDiff);
        pm.amount = Math.round((available - reduce) * 100) / 100;
        remainingDiff = Math.round((remainingDiff - reduce) * 100) / 100;

        // Actualizar input DOM correspondiente si existe (coincidencia por índice)
        if (payInputs[i]) payInputs[i].value = pm.amount;
      }

      // Si quedó una pequeña diferencia negativa por redondeo, ajustamos el primer pago
      if (Math.abs(remainingDiff) > 0.001) {
        paymentMethods[0].amount = Math.max(Math.round((paymentMethods[0].amount - remainingDiff) * 100) / 100, 0);
        if (payInputs[0]) payInputs[0].value = paymentMethods[0].amount;
      }

      // Forzar recálculo visual y el input trans-amount
      if (typeof updatePaymentTotals === 'function') {
        try { updatePaymentTotals(); } catch (e) { /* ignore */ }
      } else {
        // fallback: recalcular manualmente
        const newSum = (paymentMethods || []).reduce((s,p) => s + (parseFloat(p.amount||0)||0), 0);
        const transAmountInput2 = document.getElementById('trans-amount');
        const totalDisplay2 = document.getElementById('total-display');
        if (transAmountInput2) transAmountInput2.value = newSum;
        if (totalDisplay2) totalDisplay2.innerText = typeof formatCurrency === 'function' ? formatCurrency(newSum) : new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0}).format(newSum);
      }

    }
  } catch (e) {
    console.warn('[WARN] no se pudo sincronizar paymentMethods con remaining:', e);
  }

  // -----------------------
  // INICIAR BATCH Y TRANSACCIÓN MAESTRA
  // -----------------------
  const submitGuard = beginSubmitGuard(form, {
    scope: 'balance.transaction',
    busyText: 'Guardando...'
  });
  if (!submitGuard) return;

  const batch = writeBatch(db);
  const newTransactionRef = doc(getCollectionRef('transacciones'));

  let transData = {
    id: newTransactionRef.id,
    type,
    category,
    amount: 0,
    distributedAmount: 0,
    description: desc,
    date,
    status: 'ACTIVA',
    timestamp: timeNow,
    operationId: submitGuard.operationId,
    operationScope: submitGuard.operationScope,
    createdAtColombia: nowColombia,
    updatedAtColombia: nowColombia,
    dateColombia: transactionDateColombia,
    dateKey: transactionDateColombia.dateKey,
    timeKey: nowColombia.timeKey,
    weekday: transactionDateColombia.weekday,
    related_id: null,
    related_role: null,
    related_name: null,
    related_type: null,
    related_debt_id: null,
    placa: null,
    relation_plate: null,
    payment_accounts: null,
    retention_amount: 0
  };

  try {
    const reservation = await submitGuard.reserve();
    if (!reservation.ok) return;

    const isDeferredUtilitySale =
      normalizedType === 'INGRESO' &&
      (
        normalizedCategory === 'VENTA_TRASPASO' ||
        normalizedCategory === 'VENTA_SOAT' ||
        normalizedCategory.includes('TRASPASO') ||
        normalizedCategory.includes('SOAT')
      );

    // ======================
    // PASO 1: Profit First (ventas) -> DISTRIBUYE SOLO GANANCIA NETA REAL
    // ======================
    if (type === 'INGRESO' && String(category).includes('VENTA') && category !== 'VENTA_LIBRE' && !isDeferredUtilitySale) {
      const productId = document.getElementById('related-inventory-id')?.value;
      const product = productId ? inventory.find(p => p.id === productId) : null;
      let gananciaNetaReal = 0;

      if (product) {
        // 1. Calcular Costo Total (Compra + Gastos de Mantenimiento guardados en inventario)
        const costoCompra = parseFloat(product.precio_compra || product.purchasePrice) || 0; 
        
        // 🔥 CAMBIO AQUÍ: Leemos directamente lo que ya se sumó al inventario
        const gastosMantenimiento = parseFloat(product.costos_reparacion) || 0; 

        const costoTotal = costoCompra + gastosMantenimiento;
        const placaVehiculo = product.placa || relation_plate; // Mantenemos la variable para los console.log

        // 2. Calcular Precio de Venta Real (Lo que entra hoy + lo que queda debiendo)
        // Nota: originalSaldoFinanciar ya lo calculaste más arriba en tu código
        const pagoHoy = parseFloat(totalAmount) || 0; 
        const saldoCredito = parseFloat(originalSaldoFinanciar) || 0;
        const precioVentaReal = pagoHoy + saldoCredito;

        // 3. La ganancia neta es la diferencia
        gananciaNetaReal = precioVentaReal - costoTotal;

        console.log(`--- UTILIDAD VENTA: ${placaVehiculo} ---`);
        console.log(`Costo Compra: $${costoCompra} + Mantenimiento: $${gastosMantenimiento} = Costo Total: $${costoTotal}`);
        console.log(`Pago Hoy: $${pagoHoy} + Crédito: $${saldoCredito} = Venta Real: $${precioVentaReal}`);
        console.log(`GANANCIA A REPARTIR: $${gananciaNetaReal}`);

      } else {
        // Si es una venta genérica (sin inventario), toma el total
        gananciaNetaReal = totalAmount;
      }

      // 4. MANDAMOS A LOS BOLSILLOS SOLO SI HUBO GANANCIA
      if (gananciaNetaReal > 0) {
        // ¡Aquí está la magia! Le pasamos gananciaNetaReal en lugar de totalAmount
       // ¡Aquí está la magia! Le pasamos gananciaNetaReal en lugar de totalAmount
       distribucionRealizada = calcularDistribucionUtilidad(gananciaNetaReal, reglasDistribucion);
       montoDistribuido = distribucionRealizada.reduce((suma, mov) => suma + mov.amount, 0);

       for (const mov of distribucionRealizada) {
          const bolsillo = bolsillosUtilidad.find(b => b.name.trim().toLowerCase() === mov.pocketName.trim().toLowerCase());
          if (bolsillo) {
            const bolsilloRef = doc(getCollectionRef('bolsillos_utilidad'), bolsillo.id);
            batch.set(bolsilloRef, { saldo: increment(mov.amount), updated_at: timeNow }, { merge: true });
          }
        }

        if (product) {
          const productRef = doc(getCollectionRef('inventario'), productId);
          batch.set(productRef, {
            profitDistributed: increment(montoDistribuido),
            totalCollected: increment(totalAmount),
            updated_at: timeNow
          }, { merge: true });
        }
      } else if (product) {
        // Si la ganancia fue 0 o negativa (pérdida), igual sumamos lo recaudado en el inventario
        const productRef = doc(getCollectionRef('inventario'), productId);
        batch.set(productRef, { totalCollected: increment(totalAmount), updated_at: timeNow }, { merge: true });
      }
    } // end profit first 

    // -----------------------
    // A) Lógica Traspasos / SOAT
    // -----------------------
    // (NOTA: no redefinimos normalizedCategory para evitar conflictos)
    const catNorm = String(category || '').toUpperCase().trim();
    const esTraspaso = catNorm === 'VENTA_TRASPASO' || catNorm.includes('TRASPASO');
    const esSoat = catNorm === 'VENTA_SOAT' || catNorm.includes('SOAT');

    if (type === 'INGRESO' && (esTraspaso || esSoat)) {
      try { if (typeof window.updateTransferCostCalculation === 'function') window.updateTransferCostCalculation(); } catch (e) {}

      const placa = (document.getElementById('transfer-placa')?.value || '').trim().toUpperCase();
      const vehicleValue = parseFloat(document.getElementById('transfer-vehicle-value')?.value) || 0;
      const cityId = (document.getElementById('transfer-city-id')?.value || '').trim();
      const impuesto_1_percent = Math.round(vehicleValue * 0.01);
      const serviceCost = Math.round(parseFloat(document.getElementById('trans-amount')?.value) || totalAmount || 0);

      const cfg = (typeof transferCostsConfig !== 'undefined' && Array.isArray(transferCostsConfig))
        ? transferCostsConfig.find(c => String(c.id || '').toUpperCase() === String(cityId || '').toUpperCase())
        : null;

      const fixedCosts = cfg ? ((cfg.runt_cost || 0) + (cfg.stamps_cost || 0) + (cfg.agent_fee || 0) + (cfg.transfer_rights_cost || 0)) : 0;

      // --- CAMBIO AQUÍ: Usamos let para permitir reasignación si es SOAT ---
      let totalExpense = Math.round(fixedCosts + impuesto_1_percent);

      let expectedProfit = 0;

      // En SOAT, el campo configurado "utilidad" representa ganancia esperada.
      // Por eso el gasto esperado es: precio cobrado - utilidad esperada.
      if (esSoat) {
        expectedProfit = Math.max(parseFloat(document.getElementById('soat-profit-hidden')?.value) || 0, 0);
        totalExpense = Math.max(serviceCost - expectedProfit, 0);
      }

      const configuredProfit = esSoat ? expectedProfit : (cfg ? (cfg.configured_profit || 0) : 0);

      const transferRef = doc(getCollectionRef('transfers'));
      const transferDoc = {
        id: transferRef.id,
        placa: esTraspaso ? (placa || 'N/A') : (esSoat ? (`SOAT - ${ (document.getElementById('soat-class-select')?.options?.[document.getElementById('soat-class-select')?.selectedIndex]?.text) || 'Vehículo' }`) : (placa || 'N/A')),
        client_name: document.getElementById('debt-client')?.value || document.getElementById('related-client')?.value || 'Cliente General',
        city_id: cityId || null,
        vehicle_value: vehicleValue,
        impuesto_1_percent,
        total_expenses: totalExpense,
        configured_profit: configuredProfit,
        service_cost: serviceCost,
        status: 'PENDIENTE',
        tipo_gestion: esSoat ? 'SOAT' : 'TRASPASO',
        timestamp: nowColombia.isoColombia,
        createdAtColombia: nowColombia,
        dateKey: nowColombia.dateKey,
        timeKey: nowColombia.timeKey,
        weekday: nowColombia.weekday,
        source_transaction_id: newTransactionRef.id
      };
      batch.set(transferRef, transferDoc);

      // Para traspaso/SOAT, el totalAmount que guarda la transacción debe ser el serviceCost
      totalAmount = serviceCost;
      transData.amount = serviceCost;

   
    } // end traspaso/soat


// -----------------------
    // B) PROCESAMIENTO DE PAGOS Y CAJAS (MEJORADO Y CON PROFIT FIRST)
    // -----------------------
    
    // 1. Clonar métodos de pago para calcular lo que realmente va a la cuenta operativa (Ahorros)
    let pagosParaAhorros = paymentMethods.map(pm => ({ ...pm }));

    // 2. Descontar el monto que ya se distribuyó a los bolsillos de utilidad
    if (
      type === 'INGRESO' &&
      montoDistribuido > 0 &&
      category !== 'VENTA_LIBRE' &&
      !isDeferredUtilitySale
    ) {
      let porRestar = montoDistribuido;
      for (let i = 0; i < pagosParaAhorros.length; i++) {
        if (porRestar <= 0) break;
        
        let pm = pagosParaAhorros[i];
        let disponible = pm.amount;
        let descontar = Math.min(disponible, porRestar);
        
        pm.amount = Math.round((disponible - descontar) * 100) / 100;
        porRestar = Math.round((porRestar - descontar) * 100) / 100;
      }
      console.log(`[PROFIT FIRST] Descontando $${montoDistribuido} de las cuentas. Queda neto para operativo.`);
    }

    let ratePerMille = 4;
    const isEgreso = (normalizedType === 'EGRESO');

    // 🔹 Solo leer configuración si es EGRESO
    if (isEgreso) {
      try {
        const retCfgRef = doc(getCollectionRef('config'), 'retencion_4x1000');
        const retSnap = await getDoc(retCfgRef);
        if (retSnap.exists()) {
          ratePerMille = parseFloat(retSnap.data().ratePerMille) || ratePerMille;
        }
      } catch (e) {
        console.warn('No se pudo leer retención, usando fallback', e);
      }
    } else {
      ratePerMille = 0; 
    }

    let totalRetentionThisTransaction = 0;
    const retentionByAccount = [];

    console.log('[DEBUG] trans type:', type, 'normalizedType:', normalizedType, 'isEgreso:', isEgreso, 'ratePerMille:', ratePerMille);

    // 🚨 CAMBIO CLAVE: Ahora iteramos sobre pagosParaAhorros, NO sobre paymentMethods
    for (const pm of pagosParaAhorros) {
      if (!pm || !pm.accountId) continue;
      
      // Si después de quitar la utilidad el monto quedó en 0 o menos, no gastamos lectura/escritura en BD
      if (pm.amount <= 0 && !isEgreso) continue; 

      const accRef = doc(getCollectionRef('ahorros'), pm.accountId);
      const accSnap = await getDoc(accRef);

      if (!accSnap.exists()) {
        console.warn('Cuenta no existe:', pm.accountId);
        continue;
      }

      const currentBalance = parseFloat(accSnap.data().saldo || 0);
      let retentionAccount = 0; 

      if (isEgreso) {
        const accountRate = accSnap.data().retention_per_mille != null
          ? parseFloat(accSnap.data().retention_per_mille)
          : ratePerMille;

        retentionAccount = Math.round(((pm.amount * accountRate) / 1000) * 100) / 100;
        const totalRequired = pm.amount + retentionAccount;

        if (totalRequired > currentBalance) {
          const faltante = totalRequired - currentBalance;
          alert(
            `Saldo insuficiente en ${pm.name}.\n\n` +
            `Disponible: ${formatCurrency(currentBalance)}\n` +
            `Necesitas: ${formatCurrency(totalRequired)}\n` +
            `Faltan: ${formatCurrency(faltante)}\n\n` +
            `Debes registrar un préstamo.`
          );
          redirectToLoanIngreso();
          return;
        }
      } 

      let nuevoSaldo;
      if (!isEgreso) {
        // INGRESO → suma el monto neto (ya sin la tajada de los bolsillos)
        nuevoSaldo = Math.round((currentBalance + pm.amount) * 100) / 100;
      } else {
        // EGRESO → resta monto + retención
        nuevoSaldo = Math.round((currentBalance - pm.amount - retentionAccount) * 100) / 100;
      }

      if (isEgreso && retentionAccount > 0) {
        totalRetentionThisTransaction += retentionAccount;
        retentionByAccount.push({
          accountId: pm.accountId,
          name: pm.name || null,
          amount: retentionAccount
        });
      }

      batch.update(accRef, {
        saldo: nuevoSaldo,
        updated_at: timeNow
      });
    } // end for pagosParaAhorros

    // Después del loop: redondeo y registro del gasto por retención + acumulado global
    const retentionRounded = Math.round(totalRetentionThisTransaction * 100) / 100;
    transData.retention_amount = retentionRounded;

    if (isEgreso && retentionRounded > 0) {
      const retentionExpenseRef = doc(getCollectionRef('transacciones'));
      batch.set(retentionExpenseRef, {
        id: retentionExpenseRef.id,
        type: 'EGRESO',
        category: 'GASTO_4X1000',
        amount: retentionRounded,
        description: 'Retención GMF (4x1000) aplicada',
        date,
        timestamp: timeNow,
        status: 'ACTIVA',
        is_system_generated: true,
        payment_accounts: retentionByAccount.length ? retentionByAccount : null
      });

      const retRef = doc(getCollectionRef('config'), 'retencion_4x1000');
      batch.set(retRef, {
        accumulated: increment(retentionRounded),
        ratePerMille: ratePerMille,
        updated_at: timeNow
      }, { merge: true });
    }
    // -----------------------
    // DEUDAS / PRÉSTAMOS (VENTA CREDITO / PRESTAMO_CAPITAL)
    // -----------------------
    if (type === 'INGRESO' && category === 'VENTA_CREDITO') {
      const saldoFinanciar = parseFloat(document.getElementById('credit-debt-amount')?.value || 0) || 0;
      const clientID = (document.getElementById('debt-id')?.value || '').trim().toUpperCase();
      const clientName = (document.getElementById('debt-client')?.value || '').trim();

      if (saldoFinanciar > 0) {
        const interestType = document.querySelector('input[name="debt-interest-type"]:checked')?.value || 'FIJO';
        const fixedRate = parseFloat(document.getElementById('debt-interest-rate')?.value || 0) || 0;
        const balanceRate = parseFloat(document.getElementById('debt-balance-rate')?.value || 0) || 0;
        const moraRate = parseFloat(document.getElementById('debt-mora-rate')?.value || 0) || 0;
        const applyBalanceOnlyOnOverdue = !!document.getElementById('loan-balance-only-overdue')?.checked;

        const deudaRef = doc(getCollectionRef('deudas'));
        const deudaPayload = {
          id: deudaRef.id,
          type: 'COBRAR',
          client_id: clientID || null,
          client_name: clientName || null,
          initial_capital: saldoFinanciar,
          remaining_capital: saldoFinanciar,
          status: 'ACTIVO',
          created_date: timeNow,
          next_payment_date: colombiaDateInputToTimestamp(document.getElementById('debt-next-payment-date')?.value || nowColombia.dateKey, '12:00:00'),
          createdAtColombia: nowColombia,
          updatedAtColombia: nowColombia,
          dateKey: nowColombia.dateKey,
          timeKey: nowColombia.timeKey,
          weekday: nowColombia.weekday,
          payment_frequency: 'MENSUAL',
          interest_type: interestType,
          interest: {
            fixed_rate_monthly: fixedRate,
            balance_rate_monthly: balanceRate,
            apply_balance_only_on_overdue: !!applyBalanceOnlyOnOverdue
          },
          interest_rate: fixedRate,
          mora_rate: moraRate,
          description: `Venta crédito: ${desc}`,
          payments_log: []
        };
        batch.set(deudaRef, deudaPayload);
        transData.related_debt_id = deudaRef.id;
        if (clientID) transData.related_id = clientID;
        if (clientName) transData.related_name = clientName;
        transData.related_role = 'CLIENTE';
      } else {
        console.warn('Venta crédito: monto a financiar es 0 — no se crea deuda.');
      }
    }

    if (type === 'INGRESO' && category === 'PRESTAMO_CAPITAL') {
      try {
        const loanAmount = parseFloat(
          document.getElementById('credit-debt-amount')?.value ||
          document.getElementById('loan-amount')?.value ||
          totalAmount || 0
        ) || 0;

        const fixedRate = parseFloat(document.getElementById('debt-interest-rate')?.value || 0) || 0;
        const balanceRate = parseFloat(document.getElementById('debt-balance-rate')?.value || 0) || 0;
        const moraRate = parseFloat(document.getElementById('debt-mora-rate')?.value || 0) || 0;
        const applyBalanceOnlyOnOverdue = !!document.getElementById('loan-balance-only-overdue')?.checked;

        const nextPayment = document.getElementById('debt-next-payment-date')?.value;
        const nextPaymentTs = nextPayment ? colombiaDateInputToTimestamp(nextPayment, '12:00:00') : timeNow;

        const providerIdEl = document.getElementById('related-provider-id');
        const providerId = providerIdEl?.value || null;
        let providerName = null;
        if (providerIdEl) {
          const idx = providerIdEl.selectedIndex;
          providerName = (providerIdEl.options && providerIdEl.options[idx] && providerIdEl.options[idx].text) || providerIdEl.value || null;
        }

        const interestType = document.querySelector('input[name="debt-interest-type"]:checked')?.value || 'FIJO';

        if (!providerId && !providerName) {
          console.warn('PRESTAMO_CAPITAL: falta providerId/providerName — NO se crea deuda.');
        } else if (loanAmount > 0) {
          const deudaRef = doc(getCollectionRef('deudas'));
          const deudaPayload = {
            id: deudaRef.id,
            type: 'PAGAR',
            provider_id: providerId || null,
            provider_name: providerName || null,
            initial_capital: loanAmount,
            remaining_capital: loanAmount,
            status: 'ACTIVO',
            created_date: timeNow,
            next_payment_date: nextPaymentTs,
            createdAtColombia: nowColombia,
            updatedAtColombia: nowColombia,
            dateKey: nowColombia.dateKey,
            timeKey: nowColombia.timeKey,
            weekday: nowColombia.weekday,
            interest_type: interestType,
            interest: {
              fixed_rate_monthly: fixedRate,
              balance_rate_monthly: balanceRate,
              apply_balance_only_on_overdue: !!applyBalanceOnlyOnOverdue
            },
            interest_rate: fixedRate,
            mora_rate: moraRate, 
            payments_log: [],
            description: desc || `Préstamo recibido ${providerName || ''}`
          };
          batch.set(deudaRef, deudaPayload);
          transData.related_debt_id = deudaRef.id;
          transData.related_id = providerId || transData.related_id;
          transData.related_name = providerName || transData.related_name;
          transData.related_role = 'PROVEEDOR';
        }
      } catch (err) {
        console.error('Error creando deuda PRESTAMO_CAPITAL:', err);
      }
    }

     // NUEVO BLOQUE: Creación de deuda para EMPEÑO (Cartera por cobrar)
     if (type === 'EGRESO' && category === 'EMPEÑO') {
      try {
        // Tomamos directamente el total que salió de las cuentas
        const loanAmount = parseFloat(totalAmount || 0) || 0;
        
        const clientID = (document.getElementById('debt-id')?.value || '').trim().toUpperCase();
        const clientName = (document.getElementById('debt-client')?.value || '').trim();
        const fixedRate = parseFloat(document.getElementById('debt-interest-rate')?.value || 0) || 0;
        const balanceRate = parseFloat(document.getElementById('debt-balance-rate')?.value || 0) || 0;
        const moraRate = parseFloat(document.getElementById('debt-mora-rate')?.value || 0) || 0;
        const applyBalanceOnlyOnOverdue = !!document.getElementById('loan-balance-only-overdue')?.checked;
        const nextPayment = document.getElementById('debt-next-payment-date')?.value;
        const nextPaymentTs = nextPayment ? colombiaDateInputToTimestamp(nextPayment, '12:00:00') : timeNow;
        const interestType = document.querySelector('input[name="debt-interest-type"]:checked')?.value || 'FIJO';

        if (!clientID && !clientName) {
          console.warn('EMPEÑO: falta clientID/clientName — NO se crea deuda.');
        } else if (loanAmount > 0) {
          const deudaRef = doc(getCollectionRef('deudas'));
          const deudaPayload = {
            id: deudaRef.id,
            type: 'COBRAR', // Importante: Tú prestas la plata, así que es una cuenta por COBRAR
            client_id: clientID || null,
            client_name: clientName || null,
            initial_capital: loanAmount,
            remaining_capital: loanAmount,
            status: 'ACTIVO',
            created_date: timeNow,
            next_payment_date: nextPaymentTs,
            createdAtColombia: nowColombia,
            updatedAtColombia: nowColombia,
            dateKey: nowColombia.dateKey,
            timeKey: nowColombia.timeKey,
            weekday: nowColombia.weekday,
            payment_frequency: 'MENSUAL',
            interest_type: interestType,
            interest: {
              fixed_rate_monthly: fixedRate,
              balance_rate_monthly: balanceRate,
              apply_balance_only_on_overdue: !!applyBalanceOnlyOnOverdue
            },
            interest_rate: fixedRate,
            mora_rate: moraRate,
            payments_log: [],
            description: desc || `Empeño de capital a ${clientName || ''}`
          };
          batch.set(deudaRef, deudaPayload);
          
          // Vinculamos la transacción principal con esta nueva deuda
          transData.related_debt_id = deudaRef.id;
          transData.related_id = clientID || transData.related_id;
          transData.related_name = clientName || transData.related_name;
          transData.related_role = 'CLIENTE';
        }
      } catch (err) {
        console.error('Error creando deuda EMPEÑO:', err);
      }
    }


    // -----------------------
    // C) REGISTRO TRANSACCIÓN PRINCIPAL
    // -----------------------
    // Resolver relaciones y placa
    let related_name = null, related_type = null, related_id = null, related_role = null, relation_plate = null;

    const debtClientIdEl = document.getElementById('debt-client-id');
    const debtClientNameEl = document.getElementById('debt-client');
    if (debtClientIdEl && debtClientIdEl.value) {
      related_id = debtClientIdEl.value.trim();
      related_role = 'CLIENTE';
      related_name = debtClientNameEl?.value?.trim() || related_name;
    } else if (debtClientNameEl && debtClientNameEl.value) {
      related_name = debtClientNameEl.value.trim();
      related_role = 'CLIENTE';
    }

    const provSel = form['related-provider-id']?.value || document.getElementById('related-provider-id')?.value;
    if (provSel) {
      const prov = providers.find(p => String(p.id_number) === String(provSel));
      if (prov) {
        related_name = prov.name || related_name;
        related_id = prov.id_number || related_id;
        related_role = (prov.category && String(prov.category).toUpperCase() === 'TRAMITADOR') ? 'TRAMITADOR' : 'PROVEEDOR';
      } else {
        related_id = provSel;
      }
    }

    const placaEl = document.getElementById('transfer-placa') || document.getElementById('related-placa');
    if (placaEl && placaEl.value) relation_plate = String(placaEl.value).trim().toUpperCase();
    const relatedInvId = form['related-inventory-id']?.value || document.getElementById('related-inventory-id')?.value;
    if (relatedInvId) {
      const invItem = inventory.find(i => String(i.id) === String(relatedInvId));
      if (invItem && invItem.placa) relation_plate = invItem.placa;
    }

   // NUEVO: Usamos pagosParaAhorros (si existe) para guardar el monto NETO real
   const cuentasFinales = (typeof pagosParaAhorros !== 'undefined' ? pagosParaAhorros : paymentMethods || []);
   const payment_accounts = cuentasFinales.map(pm => ({
     accountId: pm.accountId,
     name: pm.name || (pm.accountId ? `Cuenta ${pm.accountId}` : 'Cuenta'),
     amount: pm.amount || 0
   }));

    const placaInput = document.getElementById('inv-placa')?.value || null;

    // Actualizar transData con valores definitivos
    transData.type = type;
    transData.category = category;
    transData.amount = totalAmount;
    transData.distributedAmount = montoDistribuido;
    transData.description = desc;
    transData.date = date;
    transData.status = 'ACTIVA';
    transData.timestamp = timeNow;
    transData.createdAtColombia = transData.createdAtColombia || nowColombia;
    transData.updatedAtColombia = nowColombia;
    transData.dateColombia = transactionDateColombia;
    transData.dateKey = transactionDateColombia.dateKey;
    transData.timeKey = nowColombia.timeKey;
    transData.weekday = transactionDateColombia.weekday;
    transData.related_id = related_id || null;
    transData.related_role = related_role || null;
    transData.related_name = related_name || null;
    transData.related_type = related_type || related_role || null;
    transData.placa = placaInput || null;
    transData.relation_plate = relation_plate || null;
    transData.payment_accounts = payment_accounts.length ? payment_accounts : null;
    transData.utility_distribution = distribucionRealizada.length > 0 ? distribucionRealizada : null; // NUEVO: Guardamos el "recibo" de los bolsillos

    // Guardamos la transacción principal en el batch
    batch.set(newTransactionRef, transData);

    // -----------------------
    // COMISIONES (ventas)
    // -----------------------
    if (type === 'INGRESO' && String(category).includes('VENTA')) {
      let commissionsConfig = { venta_porcentaje: 0, empeno_fijo: 0 };
      try {
        if (currentUser && currentUser.uid) {
          const configRef = doc(db, 'tenants', activeTenantId, 'config_comisiones', currentUser.uid);
          const configSnap = await getDoc(configRef);
          if (configSnap.exists()) commissionsConfig = configSnap.data();
        } else {
          console.error("No hay currentUser definido. No se puede cargar comisión.");
        }
      } catch (e) {
        console.error("Error leyendo config de comisiones:", e);
      }

      const vehiculo = inventory.find(v => v.placa === relation_plate);
      if (vehiculo) {
        const pVentaPublico = parseFloat(vehiculo.precio_venta) || 0;
        const descuentoMax = parseFloat(vehiculo.max_discount_amount) || 0;
        const totalVenta = parseFloat(totalAmount) || 0;
        const precioMinimoPermitido = pVentaPublico - descuentoMax;
        let ahorroLogrado = totalVenta - precioMinimoPermitido;
        if (ahorroLogrado < 0) ahorroLogrado = 0;

        const pctAhorro = parseFloat(commissionsConfig.venta_porcentaje) || 0;
        const bonoFijo = parseFloat(commissionsConfig.empeno_fijo) || 0;
        const comisionPorAhorro = (ahorroLogrado * pctAhorro) / 100;
        const montoComision = comisionPorAhorro + bonoFijo;

        if (montoComision > 0) {
          const commRef = doc(getCollectionRef('comisiones_pendientes'));
          batch.set(commRef, {
            employeeId: currentUser.uid,
            employeeName: currentUser.displayName || 'Vendedor',
            amount: montoComision,
            sourceTransactionId: newTransactionRef.id,
            relation_plate: relation_plate || 'SIN PLACA',
            clientName: related_name || 'Cliente General',
            status: 'PENDIENTE',
            category: category,
            description: `Venta ${relation_plate}: Ahorro(${formatCurrency(ahorroLogrado)}) + Fijo`,
            createdAt: timeNow,
            createdAtColombia: nowColombia,
            date: nowColombia.isoColombia,
            dateKey: nowColombia.dateKey,
            timeKey: nowColombia.timeKey,
            weekday: nowColombia.weekday
          });
        }
      } else {
        const bonoFijo = parseFloat(commissionsConfig.empeno_fijo) || 0;
        if (bonoFijo > 0) {
          const commRef = doc(getCollectionRef('comisiones_pendientes'));
          batch.set(commRef, {
            employeeId: currentUser.uid,
            employeeName: currentUser.displayName || 'Vendedor',
            amount: bonoFijo,
            sourceTransactionId: newTransactionRef.id,
            relation_plate: 'Venta General',
            clientName: related_name || 'Cliente General',
            status: 'PENDIENTE',
            category: category,
            description: `Bono Fijo Venta General`,
            createdAt: timeNow,
            createdAtColombia: nowColombia,
            date: nowColombia.isoColombia,
            dateKey: nowColombia.dateKey,
            timeKey: nowColombia.timeKey,
            weekday: nowColombia.weekday
          });
        }
      }
    }

    let inventorySyncTargets = [];

    // -----------------------
    // D) INVENTARIO (compra / venta / gasto)
    // -----------------------
    if (type === 'EGRESO' && category === 'GASTO_INVERSION_COMPRA') {
      const nombre = document.getElementById('inv-nombre')?.value;
      const precioVenta = parseFloat(document.getElementById('inv-precio_venta')?.value || 0);
      const maxDiscount = parseFloat(document.getElementById('inv-max-discount')?.value || 0);
      const descripcion = (document.getElementById('inv-descripcion')?.value || '').trim();

      const inventarioRef = doc(getCollectionRef('inventario'));
      inventorySyncTargets.push(inventarioRef.id);

      batch.set(inventarioRef, {
        nombre,
        placa: document.getElementById('inv-placa')?.value || null,
        precio_compra: totalAmount,
        precio_venta: precioVenta,
        descripcion: descripcion || null,
        estado: 'Disponible',
        timestamp: timeNow,
        createdAtColombia: nowColombia,
        updatedAtColombia: nowColombia,
        dateKey: nowColombia.dateKey,
        timeKey: nowColombia.timeKey,
        weekday: nowColombia.weekday,
        ganancia_potencial: precioVenta - totalAmount,
        max_discount_amount: maxDiscount,
      });
    }

    const invId = form['related-inventory-id']?.value;
    if (invId) {
      if (type === 'INGRESO' && String(category).includes('VENTA')) {
        inventorySyncTargets.push(invId);
        batch.update(doc(getCollectionRef('inventario'), invId), {
          estado: 'Vendido',
          fecha_venta: timeNow,
          fechaVentaColombia: nowColombia,
          updated_at: timeNow,
          updatedAtColombia: nowColombia,
          precio_venta_final: totalAmount
        });
      }
      if (type === 'EGRESO' && category === 'GASTO_MANTENIMIENTO') {
        inventorySyncTargets.push(invId);
        const item = (typeof inventory !== 'undefined') ? inventory.find(i => i.id === invId) : null;
        const costoPrevio = item?.costos_reparacion || 0;
        
        // Obtenemos el precio de compra que tiene el vehículo actualmente
        const precioCompraActual = parseFloat(item?.precio_compra || item?.purchasePrice) || 0;

        batch.update(doc(getCollectionRef('inventario'), invId), {
          costos_reparacion: costoPrevio + totalAmount,
          // 🔥 AQUI ESTÁ LA MAGIA: Le sumamos el mantenimiento directamente al precio_compra
          precio_compra: precioCompraActual + totalAmount,
          updated_at: timeNow,
          updatedAtColombia: nowColombia
        });
      }
    }

    // -----------------------
    // SINCRONIZACIÓN CLIENTES
    // -----------------------
    const captureClientId = (document.getElementById('debt-id')?.value || '').trim().toUpperCase();
    const captureClientName = (document.getElementById('debt-client')?.value || '').trim();
    if (captureClientId && captureClientName) {
      const clientDocRef = doc(getCollectionRef('clientes'), captureClientId);
      const clientData = {
        id_number: captureClientId,
        name: captureClientName,
        phone: document.getElementById('debt-phone')?.value.trim() || null,
        city: document.getElementById('debt-city')?.value.trim() || null,
        address: document.getElementById('debt-address')?.value.trim() || null,
        last_transaction: timeNow
      };
      batch.set(clientDocRef, clientData, { merge: true });
    }

    // -----------------------
    // COMMIT
    // -----------------------
    await batch.commit();
    await submitGuard.success({ primaryDocId: newTransactionRef.id });

    if (inventorySyncTargets.length) {
      const uniqueTargets = [...new Set(inventorySyncTargets.filter(Boolean))];
      await Promise.all(uniqueTargets.map((itemId) => syncAgentInventoryItem(itemId)));
    }

    console.log("✅ Transacción guardada exitosamente.");
    alert("Transacción registrada correctamente ✅");

    // Limpieza UI
    if (form) form.reset();
    const pmContainer = document.getElementById('payment-methods-container');
    if (pmContainer) pmContainer.innerHTML = '';
    if (typeof addPaymentMethod === 'function') addPaymentMethod();
    if (typeof renderBalance === 'function') await renderBalance();

  } catch (e) {
    await submitGuard.fail(e);
    console.error("Error en transacción:", e);
    alert("Error: " + (e.message || e));
  } finally {
    submitGuard.release();
  }
}

export async function anularTransaccion(transactionId) {
    console.log("🔍 Iniciando anulación del ID:", transactionId);
    const nowColombia = getColombiaNow();
    const timeNow = nowColombia.timestampMs;

    const tRef = doc(getCollectionRef('transacciones'), transactionId);
    const tSnap = await getDoc(tRef);

    if (!tSnap.exists()) {
        console.warn("Transacción no encontrada:", transactionId);
        return;
    }

    const t = tSnap.data();

    // Evitar anular dos veces
    if (t.status === 'ANULADA') {
        console.warn("La transacción ya está anulada:", transactionId);
        alert("Esta transacción ya fue anulada anteriormente.");
        return;
    }

    // Crear batch *después* de tener la transacción
    const batch = writeBatch(db);
    const categoryNorm = String(t.category || '').toUpperCase().trim();

    if (
        t.type === 'INGRESO' &&
        (categoryNorm === 'VENTA_TRASPASO' || categoryNorm === 'VENTA_SOAT' || categoryNorm.includes('TRASPASO') || categoryNorm.includes('SOAT'))
    ) {
        const transfersRef = getCollectionRef('transfers');
        const transferSnap = await getDocs(query(transfersRef, where('source_transaction_id', '==', transactionId), limit(1)));

        if (!transferSnap.empty) {
            const transferDoc = transferSnap.docs[0];
            const transferData = transferDoc.data();

            if (String(transferData.status || '').toUpperCase() === 'COMPLETADO') {
                alert('Este SOAT/traspaso ya tiene un gasto registrado. Anula primero el gasto del trámite para reabrirlo y luego anula la venta.');
                return false;
            }

            batch.delete(transferDoc.ref);
        }
    }

    // Si la transacción liquidó comisiones: reabrirlas primero (usando batch)
    if (t.category === 'PAGO_COMISION' && Array.isArray(t.liquidated_commissions_ids) && t.liquidated_commissions_ids.length) {
        for (const commId of t.liquidated_commissions_ids) {
            const commRef = doc(getCollectionRef('comisiones_pendientes'), commId);
            batch.update(commRef, {
                status: 'PENDIENTE',
                payment_transaction_id: null,
                paid_at: null
            });
        }
        console.log("Reabriendo comisiones:", t.liquidated_commissions_ids);
    }

    // 1. Marcar la transacción como ANULADA
    batch.update(tRef, {
        status: 'ANULADA',
        annulled_at: timeNow,
        annulledAtColombia: nowColombia
    });

    // 2. REVERSIÓN DE DINERO (payment_accounts)
    if (t.payment_accounts && Array.isArray(t.payment_accounts)) {
        for (const account of t.payment_accounts) {
            const accRef = doc(getCollectionRef('ahorros'), account.accountId);
            const delta = t.type === 'INGRESO' ? -account.amount : account.amount;
            // Usamos update/merge para no sobreescribir campos existentes
            batch.set(accRef, {
                saldo: increment(delta),
                updated_at: timeNow,
                updatedAtColombia: nowColombia
            }, { merge: true });
        }
    }

    // 2.5 REVERSIÓN DE BOLSILLOS DE UTILIDAD (Profit First)
    if (t.utility_distribution && Array.isArray(t.utility_distribution)) {
      for (const mov of t.utility_distribution) {
          // Buscamos el bolsillo afectado
          const bolsillo = bolsillosUtilidad.find(b => b.name.trim().toLowerCase() === mov.pocketName.trim().toLowerCase());
          if (bolsillo) {
              const bolsilloRef = doc(getCollectionRef('bolsillos_utilidad'), bolsillo.id);
              // Si anulamos un INGRESO, quitamos la plata del bolsillo (negativo)
              const isDeferredUtilityExpense = String(t.category || '').toUpperCase() === 'GASTO_TRASPASO';
              const deltaUtilidad = (t.type === 'INGRESO' || isDeferredUtilityExpense) ? -mov.amount : mov.amount;
              
              batch.set(bolsilloRef, { 
                  saldo: increment(deltaUtilidad), 
                  updated_at: timeNow,
                  updatedAtColombia: nowColombia
              }, { merge: true });
              console.log(`[REVERSO] Quitados $${Math.abs(deltaUtilidad)} del bolsillo: ${bolsillo.name}`);
          }
      }
  }

    
   const inventorySyncTargets = [];

   // 3. REVERSIÓN DE INVENTARIO (Búsqueda por placa)
   if (t.relation_plate) {
    try {
        const invRef = getCollectionRef('inventario');
        const q = query(invRef, where("placa", "==", t.relation_plate), limit(1));
        const invSnap = await getDocs(q);

        if (!invSnap.empty) {
            const productDoc = invSnap.docs[0];
            
            // Si anulamos un MANTENIMIENTO, le restamos la plata al vehículo
            if (t.type === 'EGRESO' && t.category === 'GASTO_MANTENIMIENTO') {
                inventorySyncTargets.push(productDoc.id);
                batch.update(productDoc.ref, { 
                    costos_reparacion: increment(-t.amount),
                    precio_compra: increment(-t.amount)
                });
                console.log("🔧 Mantenimiento reversado en el inventario:", t.relation_plate);
            } 
            // Si anulamos una VENTA, devolvemos el vehículo al patio
            else if (t.type === 'INGRESO' && String(t.category).includes('VENTA')) {
                inventorySyncTargets.push(productDoc.id);
                batch.update(productDoc.ref, { estado: 'Disponible' }); 
                console.log("📦 Producto liberado:", t.relation_plate);
            }
        }
    } catch (e) {
        console.error("Error buscando producto en inventario:", e);
    }
}

    // 4. REVERSIÓN DE ACUMULADO 4x1000
    if (t.category === 'GASTO_4X1000' && t.amount > 0) {
      const retRef = doc(getCollectionRef('config'), 'retencion_4x1000');
      batch.set(retRef, {
          accumulated: increment(-t.amount), // Restamos lo que se había sumado
          updated_at: timeNow,
          updatedAtColombia: nowColombia
      }, { merge: true });
      console.log("Acumulado global de 4x1000 reducido.");
  }

  if (String(t.category || '').toUpperCase() === 'GASTO_TRASPASO') {
      const transfersRef = getCollectionRef('transfers');
      const transferSnap = await getDocs(query(transfersRef, where('expense_transaction_id', '==', transactionId), limit(1)));

      if (!transferSnap.empty) {
          const transferDoc = transferSnap.docs[0];
          const transferData = transferDoc.data();
          const restoredExpenses = Number(
              t.expected_transfer_expenses ??
              transferData.expected_expenses ??
              transferData.total_expenses ??
              0
          );

          batch.update(transferDoc.ref, {
              status: 'PENDIENTE',
              total_expenses: restoredExpenses,
              updated_at: timeNow,
              updatedAtColombia: nowColombia,
              expense_transaction_id: deleteField(),
              retention_transaction_id: deleteField(),
              realized_utility: deleteField(),
              utility_distributed_amount: deleteField(),
              utility_distribution: deleteField()
          });

          if (transferData.retention_transaction_id) {
              const retentionRef = doc(getCollectionRef('transacciones'), transferData.retention_transaction_id);
              const retentionSnap = await getDoc(retentionRef);

              if (retentionSnap.exists()) {
                  const retentionData = retentionSnap.data();
                  if (retentionData.status !== 'ANULADA') {
                      batch.update(retentionRef, {
                          status: 'ANULADA',
                          annulled_at: timeNow,
                          annulledAtColombia: nowColombia
                      });

                      if (Array.isArray(retentionData.payment_accounts)) {
                          for (const account of retentionData.payment_accounts) {
                              const accRef = doc(getCollectionRef('ahorros'), account.accountId);
                              batch.set(accRef, {
                                  saldo: increment(Number(account.amount || 0)),
                                  updated_at: timeNow,
                                  updatedAtColombia: nowColombia
                              }, { merge: true });
                          }
                      }

                      if (Number(retentionData.amount || 0) > 0) {
                          batch.set(doc(getCollectionRef('config'), 'retencion_4x1000'), {
                              accumulated: increment(-Number(retentionData.amount || 0)),
                              updated_at: timeNow,
                              updatedAtColombia: nowColombia
                          }, { merge: true });
                      }
                  }
              }
          }
      }
  }

// 5. REVERSIÓN DE DEUDAS (Si la transacción generó una deuda)
if (t.related_debt_id) {
  const deudaRef = doc(getCollectionRef('deudas'), t.related_debt_id);
  
  // ELIMINAR la deuda completamente de la base de datos de Firebase
  batch.delete(deudaRef);
  
  console.log(`[REVERSO] Deuda ${t.related_debt_id} eliminada por completo de la base de datos.`);
}
    const submitGuard = beginSubmitGuard(null, {
        scope: 'balance.annul',
        operationId: `balance.annul.${transactionId}`,
        busyText: 'Anulando...'
    });
    if (!submitGuard) return false;

    const reservation = await submitGuard.reserve();
    if (!reservation.ok) {
        submitGuard.release();
        return false;
    }

    // Ejecutar batch
    try {
        await batch.commit();
        await submitGuard.success({ primaryDocId: transactionId });
        if (inventorySyncTargets.length) {
          const uniqueTargets = [...new Set(inventorySyncTargets.filter(Boolean))];
          await Promise.all(uniqueTargets.map((itemId) => syncAgentInventoryItem(itemId)));
        }

        // Cerrar modal si aplica
        if (typeof hideRevertModal === 'function') hideRevertModal();

        alert("Transacción anulada con éxito.");
        if (typeof renderBalance === 'function') renderBalance();
        return true;
    } catch (error) {
        await submitGuard.fail(error);
        console.error("❌ Error al ejecutar el batch:", error);
        alert("Hubo un error al procesar la anulación.");
        return false;
    } finally {
        submitGuard.release();
    }
}

  
  // Render completo y robusto de las filas de la tabla de transacciones
// Reemplaza la función existente por esta versión

function renderTransactionTableRows(period = null, customRange = null, searchTerm = '') {
  const tbody = document.getElementById('transaction-table-body');
  if (!tbody) return;

  // Normaliza y tokeniza el término de búsqueda
  const rawSearch = (searchTerm || '').toString().trim().toLowerCase();
  const tokens = rawSearch ? rawSearch.split(/\s+/).filter(Boolean) : [];

  let rows = (transactions || []).slice();

  // 🔥 NUEVO: LÓGICA DE FILTRADO DE FECHAS (Protegida)
  let start, end;

  if (customRange && customRange.start && customRange.end) {
      start = customRange.start;
      end = customRange.end;
  } else if (period) {
      const bounds = getColombiaTimeBounds(period);
      start = bounds.start;
      end = bounds.end;
  }

 
// Descartamos lo que no esté en la fecha elegida
if (start && end) {
  rows = rows.filter(t => {
      const tDate = t.date || t.timestamp; // Usamos date o timestamp por seguridad
      return tDate >= start && tDate <= end;
  });
}

// Ordenamos y limitamos para no saturar la vista
rows = rows.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)).slice(0, 100);

  // Filtrar si hay búsqueda
    if (tokens.length > 0) {

        rows = rows.filter(t => {

            const tercero = (t.related_name || t.related_id || '').toLowerCase();

            const relacion =
                (t.relation_plate ||
                 t.placa ||
                 t.vehicle_plate ||
                 '').toLowerCase();

            const fechaIso = (t?.dateKey || (t?.date ? getColombiaNow(new Date(t.date)).dateKey : '')).toLowerCase();
            const fechaLocal = t?.date ? getColombiaSearchDateText(t.date) : '';

            const tipo =
                ((t.type || '') + ' ' + (t.category || ''))
                .toLowerCase();

            return tokens.some(token =>
                tercero.includes(token) ||
                relacion.includes(token) ||
                fechaIso.includes(token) ||
                fechaLocal.includes(token) ||
                tipo.includes(token)
            );

        });

    }

    console.log(`📊 Renderizando ${rows.length} filas en Balance.`);

    // Helper
    function toTitleCase(str) {
        return str.split(' ')
            .map(s =>
                s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : ''
            )
            .join(' ');
    }

    // Render HTML
    tbody.innerHTML = rows.map(t => {

        const fecha = t?.dateColombia?.readable || (t?.date ? getColombiaNow(new Date(t.date)).dateKey : '—');

        const category = t?.category || '—';

        let categoryDisplay =
            category === '—'
            ? '—'
            : category.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();

        if (categoryDisplay !== '—')
            categoryDisplay = toTitleCase(categoryDisplay);

        const monto = formatCurrency(t?.amount || 0);

        const descripcion = escapeHtml(t?.description || '—');

        const placa =
            t?.relation_plate ||
            t?.placa ||
            t?.vehicle_plate ||
            '—';

        const badgeUtilidad =
            (t.distributedAmount && t.distributedAmount > 0)
            ? `<span class="bg-emerald-100 text-emerald-800 text-xs font-bold px-2 py-1 rounded-full border border-emerald-200 shadow-sm whitespace-nowrap">
                + ${formatCurrency(t.distributedAmount)}
               </span>`
            : '<span class="text-gray-300 text-xs">—</span>';

        const role =
            (t.related_type || t.related_role || 'CLIENTE')
            .toUpperCase();

        const nombre =
            t.related_name || 'Sin Nombre';

        const idParaHistorial =
            t.related_id || nombre;

        const terceroHtml = `
            <a href="javascript:void(0)"
               data-persona-id="${escapeHtml(String(idParaHistorial))}"
               data-persona-role="${escapeHtml(role)}"
               class="persona-link text-emerald-600 hover:underline font-bold">
               ${escapeHtml(nombre)} (${role.toLowerCase()})
            </a>
        `;

        const cuentasHtml =
            (Array.isArray(t?.payment_accounts) && t.payment_accounts.length)
            ? t.payment_accounts
                .map(p =>
                    `${escapeHtml(p.name || 'Cuenta')}: ${formatCurrency(p.amount || 0)}`
                )
                .join(' + ')
            : escapeHtml(t?.source || '—');

        // ESTA ES LA LINEA CORRECTA (sin error)
        const btnRevert =
            t?.status === 'ACTIVA'
            ? `<button onclick="showRevertModal('${escapeHtml(t.id)}', '${escapeHtml((t.description || '').replace(/'/g, "\\'"))}', ${t.amount || 0})"
                 class="text-red-400 hover:text-red-600 transition"
                 title="Reversar transacción">↺</button>`
            : 'Anulada';

        return `
            <tr class="hover:bg-gray-50 border-b transition-colors">

                <td class="px-3 py-2 text-sm text-gray-600">
                    ${escapeHtml(fecha)}
                </td>

                <td class="px-3 py-2 text-sm">
                    <span class="px-2 py-1 rounded-md text-xs font-bold
                    ${t?.type === 'INGRESO'
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-red-50 text-red-700'}">
                        ${escapeHtml(categoryDisplay)}
                    </span>
                </td>

                <td class="px-3 py-2 text-sm font-bold
                    ${t?.type === 'INGRESO'
                        ? 'text-emerald-600'
                        : 'text-red-600'}">

                    ${monto}

                </td>

                <td class="px-3 py-2 text-center">
                    ${badgeUtilidad}
                </td>

                <td class="px-3 py-2 text-sm">
                    ${terceroHtml}
                </td>

                <td class="px-3 py-2 text-sm font-mono text-gray-500">
                    ${escapeHtml(placa)}
                </td>

                <td class="px-3 py-2 text-sm text-xs text-gray-500">
                    ${cuentasHtml}
                </td>

                <td class="px-3 py-2 text-sm break-words max-w-xs text-gray-600">
                    ${descripcion}
                </td>

                <td class="px-3 py-2 text-center">
                    ${btnRevert}
                </td>

            </tr>
        `;

    }).join('');

    // Reactivar links
    setTimeout(() => {

        document.querySelectorAll('.persona-link')
        .forEach(link => {

            link.onclick = (e) => {

                e.preventDefault();

                const id = link.dataset.personaId;

                const role = link.dataset.personaRole;

                const name = link.textContent;

                if (window.openHistorialPersona)
                    window.openHistorialPersona(
                        id === 'NO_ID' ? name : id,
                        role,
                        'balance'
                    );

            };

        });

    }, 500);

}

function showRevertModal(id, desc, amount) {
    document.getElementById('revert-trans-id').value = id;
    document.getElementById('revert-info').innerHTML = `${desc}<br><b>${formatCurrency(amount)}</b>`;
    document.getElementById('revert-modal').classList.remove('hidden');
}
function hideRevertModal() { document.getElementById('revert-modal').classList.add('hidden'); }



// Helper: redirige al form de transacción y selecciona Tipo=INGRESO y Categoría=PRESTAMO_CAPITAL
function redirectToLoanIngreso() {
    try {
      // Guardamos un flag para indicar al render que se debe preseleccionar tipo/categoría
      // (solo para abrir la vista correcta; no rellenamos demás campos)
      sessionStorage.setItem('openLoanForm', '1');
  
      // Si la página tiene un form visible, hacemos scroll hacia él para "redirigir visualmente"
      const formEl = document.getElementById('transaction-form');
      if (formEl) {
        formEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
  
      // Intentamos seleccionar los selects si ya existen en DOM (esto solo preselecciona tipo+categoría)
      setTimeout(() => {
        const typeEl = document.getElementById('trans-type');
        const catEl = document.getElementById('trans-category');
        if (typeEl && catEl) {
          // Ponemos Tipo = INGRESO
          typeEl.value = 'INGRESO';
          typeEl.dispatchEvent(new Event('change'));
  
          // Esperamos un poco y seleccionamos la categoría de préstamo capital recibido si existe
          setTimeout(() => {
            // Valor exacto en tu TRANSACTION_OPTIONS: 'PRESTAMO_CAPITAL'
            const opt = Array.from(catEl.options).find(o => o.value === 'PRESTAMO_CAPITAL');
            if (opt) {
              catEl.value = 'PRESTAMO_CAPITAL';
              catEl.dispatchEvent(new Event('change'));
            }
          }, 80);
        }
      }, 120);
    } catch (e) {
      console.warn('redirectToLoanIngreso fallback:', e);
    }
  }
   // interes fijo por un porcentaje simepre fijo y  interes de cota o de banco o de saldo paga 10%  pero sobre lo que va debiendo 


  function escapeHtml(value) {
    if (value === null || value === undefined) return '—';
    return String(value).replace(/[&<>"']/g, (m) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[m]);
  }

  // Dentro de balance.js


  /**
   * Función corregida para respetar la estructura Multi-Tenant
   */
/**
 * Procesa la comisión para CUALQUIER rol que venda (Empleado, Admin, Super Admin)
 */
