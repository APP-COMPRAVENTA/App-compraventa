// js/modules/deudas.js
import { debts, clients, providers, debtSearchTerm, setDebtSearchTerm, savings } from '../store/store.js';
import { getCollectionRef } from '../services/listeners.js';
import { writeBatch, doc, increment, arrayUnion } from "firebase/firestore";

import { db } from '../config/firebase.js';
import { renderHeader, formatCurrency, renderFormGroup, getDaysBetween, escapeHtml } from '../utils/utils.js';
import { formatDateColombia, getColombiaNow } from '../utils/colombiaTime.js';
import { beginSubmitGuard } from '../utils/submitGuard.js';

function getDebtCurrentTotal(debt) {
    const remainingCapital = Math.max(parseFloat(debt?.remaining_capital) || 0, 0);
    const accrued = calculateAccruedInterest(debt);
    const total = Math.round((remainingCapital + accrued.interest + accrued.mora) * 100) / 100;

    return {
        total,
        remainingCapital,
        interest: accrued.interest,
        mora: accrued.mora,
        daysAccrued: accrued.daysAccrued,
        daysOverdue: accrued.daysOverdue
    };
}



// ---------------- Helper: obtener info del tercero ----------------
function getPersonInfo(debt) {
    // debt.type === 'COBRAR' -> cliente; 'PAGAR' -> proveedor
    const role = debt.type === 'COBRAR' ? 'CLIENTE' : 'PROVEEDOR';
    const id = debt.client_id || debt.provider_id || debt.related_id || null;
  
    let person = null;
    if (role === 'CLIENTE') {
      person = (clients || []).find(c => String(c.id || c.id_number) === String(id)) || null;
    } else {
      person = (providers || []).find(p => String(p.id || p.provider_id) === String(id)) || null;
    }
  
    return {
      role,
      id,
      name: person?.name || debt.client_name || debt.provider_name || 'Tercero',
      phone: person?.phone || person?.telefono || null,
      email: person?.email || null,
      raw: person || null
    };
  }
  // ------------------------------------------------------------------
  
// Exponer funciones para el HTML
window.showAbonoModal = showAbonoModal;
window.hideAbonoModal = hideAbonoModal;
window.renderDebtTableRows = renderDebtTableRows;

// Listener del formulario (asegura que no se dupliquen eventos)
document.addEventListener('DOMContentLoaded', () => {
    const abonoForm = document.getElementById('abono-form');
    if (abonoForm) {
        abonoForm.removeEventListener('submit', handleAbonoSubmit); // Limpieza preventiva
        abonoForm.addEventListener('submit', handleAbonoSubmit);
    }
});

export async function renderDeudas() {
    const contentDiv = document.getElementById('content');
    contentDiv.innerHTML = await renderHeader('Gestión de Cartera', 'Cuentas por Cobrar (CxC) y Cuentas por Pagar (CxP).');

    const cxc = debts.filter(d => d.type === 'COBRAR');
    const cxp = debts.filter(d => d.type === 'PAGAR');
    const totalCobrar = cxc.reduce((sum, d) => sum + d.remaining_capital, 0);
    const totalPagar = cxp.reduce((sum, d) => sum + d.remaining_capital, 0);

    // Resumen de Totales
    contentDiv.insertAdjacentHTML('beforeend', `
        <div class="grid sm:grid-cols-2 gap-4 mb-6">
            <div class="bg-white p-5 rounded-xl card border-l-4 border-emerald-500 shadow-sm">
                <p class="text-xs font-bold text-gray-400 uppercase tracking-wider">Por Cobrar</p>
                <p class="text-3xl font-bold text-emerald-600">${formatCurrency(totalCobrar)}</p>
            </div>
            <div class="bg-white p-5 rounded-xl card border-l-4 border-red-500 shadow-sm">
                <p class="text-xs font-bold text-gray-400 uppercase tracking-wider">Por Pagar</p>
                <p class="text-3xl font-bold text-red-600">${formatCurrency(totalPagar)}</p>
            </div>
        </div>
    `);

    // Tablas y Buscador
    contentDiv.insertAdjacentHTML('beforeend', `
        <div class="bg-white p-5 rounded-xl card mb-6 shadow-sm">
            <h2 class="text-xl font-semibold mb-4 text-gray-800 border-b pb-2">Cartera Activa</h2>
            
            <div class="mb-4">
                <input type="text" id="debt-search" value="${debtSearchTerm}" placeholder="Buscar por Cliente, ID o Descripción..." class="w-full p-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-emerald-400 outline-none">
            </div>

            <div class="mb-8">
                <h3 class="text-sm font-bold text-emerald-700 uppercase mb-2 bg-emerald-50 p-2 rounded">Cuentas por Cobrar (${cxc.length})</h3>
                <div class="overflow-x-auto max-h-96 border rounded-lg">
                    <table class="min-w-full divide-y divide-gray-200">
                       <thead class="bg-gray-50 sticky top-0 z-10">
  <tr>
    <th class="px-3 py-2 text-left text-xs font-bold text-gray-500 uppercase">Deudor</th>
    <th class="px-3 py-2 text-left text-xs font-bold text-gray-500 uppercase">Capital</th>
    <th class="px-3 py-2 text-left text-xs font-bold text-gray-500 uppercase">Saldo</th>
    <th class="px-3 py-2 text-center text-xs font-bold text-gray-500 uppercase">Estado</th>
    <th class="px-3 py-2 text-right text-xs font-bold text-gray-500 uppercase">Interés pactado</th>
    <th class="px-3 py-2 text-right text-xs font-bold text-gray-500 uppercase">Acción</th>
  </tr>
</thead>

                        <tbody id="cxc-table-body" class="bg-white divide-y divide-gray-200"></tbody>
                    </table>
                </div>
            </div>

            <div>
                <h3 class="text-sm font-bold text-red-700 uppercase mb-2 bg-red-50 p-2 rounded">Cuentas por Pagar (${cxp.length})</h3>
                <div class="overflow-x-auto max-h-96 border rounded-lg">
                    <table class="min-w-full divide-y divide-gray-200">
                         <thead class="bg-gray-50 sticky top-0 z-10">
  <tr>
    <th class="px-3 py-2 text-left text-xs font-bold text-gray-500 uppercase">Proveedor</th>
    <th class="px-3 py-2 text-left text-xs font-bold text-gray-500 uppercase">Capital</th>
    <th class="px-3 py-2 text-left text-xs font-bold text-gray-500 uppercase">Saldo</th>
    <th class="px-3 py-2 text-center text-xs font-bold text-gray-500 uppercase">Estado</th>
    <th class="px-3 py-2 text-right text-xs font-bold text-gray-500 uppercase">Interés pactado</th>
    <th class="px-3 py-2 text-right text-xs font-bold text-gray-500 uppercase">Acción</th>
  </tr>
</thead>
                        <tbody id="cxp-table-body" class="bg-white divide-y divide-gray-200"></tbody>
                    </table>
                </div>
            </div>
        </div>

        <div id="abono-modal" class="fixed inset-0 bg-gray-900 bg-opacity-50 hidden flex items-center justify-center z-50 backdrop-blur-sm">
            <div class="bg-white p-6 rounded-xl w-11/12 max-w-md card shadow-2xl">
                <h3 class="text-xl font-bold mb-4 border-b pb-2 text-gray-800" id="abono-modal-title">Registrar Abono</h3>
                <div class="text-sm text-gray-600 mb-4 bg-gray-50 p-3 rounded border border-gray-200" id="abono-debt-info"></div>
                
                <form id="abono-form">
                    <input type="hidden" id="abono-debt-id">
                    
                    <div class="space-y-3">
                        ${renderFormGroup('Monto del Abono ($)', `<input type="number" id="abono-amount" required min="1" class="w-full p-2 border border-gray-300 rounded-lg font-bold text-lg text-gray-700">`)}
                        
                        ${renderFormGroup('Medio de Pago (Cuenta)', `
                          <select id="abono-account" required class="w-full p-2 border border-gray-300 rounded-lg bg-white">
                              <option value="">-- Seleccione Cuenta --</option>
                              ${savings.map(s => `<option value="${s.id}" data-saldo="${s.saldo || 0}">${s.tag || s.name} (${formatCurrency(s.saldo || 0)})</option>`).join('')}
                          </select>
                      `)}
                      
                      </div>

                    <div class="flex justify-end space-x-2 mt-6">
                        <button type="button" onclick="hideAbonoModal()" class="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors">Cancelar</button>
                        <button type="submit" class="button-primary text-white px-6 py-2 rounded-lg font-semibold shadow-md">Confirmar</button>
                    </div>
                </form>
                <p id="abono-message" class="text-sm text-center mt-3 hidden font-semibold"></p>
            </div>
        </div>
    `);

    // Listeners
    const searchInput = document.getElementById('debt-search');
    searchInput.addEventListener('input', (e) => {
        setDebtSearchTerm(e.target.value);
        renderDebtTableRows();
    });
    
    // Re-attach form listener dynamically
    const form = document.getElementById('abono-form');
    form.addEventListener('submit', handleAbonoSubmit);

    renderDebtTableRows();
}

export function renderDebtTableRows() {
    const term = debtSearchTerm.toLowerCase();
    
    // Filtrar globalmente (ocultamos todo lo que ya quedó en cero o menos)
    const filteredDebts = debts.filter(d => 
        (parseFloat(d.remaining_capital) || 0) > 0 && 
        (d.client_name?.toLowerCase().includes(term) || 
         d.provider_name?.toLowerCase().includes(term) ||
         d.description?.toLowerCase().includes(term) ||
         String(d.client_id || '').includes(term))
    );

    const cxcList = filteredDebts.filter(d => d.type === 'COBRAR').sort((a, b) => b.created_date - a.created_date);
    const cxpList = filteredDebts.filter(d => d.type === 'PAGAR').sort((a, b) => b.created_date - a.created_date);

    // Render CXC
    const cxcBody = document.getElementById('cxc-table-body');
    if (cxcBody) cxcBody.innerHTML = renderRows(cxcList);

    // Render CXP
    const cxpBody = document.getElementById('cxp-table-body');
    if (cxpBody) cxpBody.innerHTML = renderRows(cxpList);
}

function renderRows(list) {
  if (!list || list.length === 0) return `<tr><td colspan="6" class="p-4 text-center text-gray-400 italic">No hay registros coincidentes.</td></tr>`;

  return list.map(d => {
    const info = calculateAccruedInterest(d);
    const debtTotals = getDebtCurrentTotal(d);
    const person = getPersonInfo(d);
    const nowColombia = getColombiaNow();
    const isMora = (d.next_payment_date || 0) < nowColombia.timestampMs;
    const rowBg = 'hover:bg-gray-50';

    let badgeClass = 'bg-gray-200 text-gray-600';
    let badgeText = 'AL DÍA';
    if (isMora) { badgeClass = 'bg-red-100 text-red-800'; badgeText = 'MORA'; }

    // contact html
    const contactHtml = (person.phone || person.email) ? `
      <div class="text-[11px] text-gray-500 mt-1">
        ${person.phone ? `<span title="Teléfono" class="mr-2">📞 ${person.phone}</span>` : ''}
        ${person.email ? `<span title="Email">✉️ ${person.email}</span>` : ''}
      </div>` : '';

    // Interés pactado
    const interestCfg = d.interest || {};
    const fixedRate = (typeof interestCfg.fixed_rate_monthly !== 'undefined' ? interestCfg.fixed_rate_monthly : (typeof d.interest_rate !== 'undefined' ? d.interest_rate : null));
    const balanceRate = (typeof interestCfg.balance_rate_monthly !== 'undefined' ? interestCfg.balance_rate_monthly : null);
    const applyBalanceOnlyOnOverdue = !!interestCfg.apply_balance_only_on_overdue;


    let interestPactado = '-';
    if (fixedRate !== null && fixedRate !== undefined && fixedRate !== '') {
      interestPactado = `${parseFloat(fixedRate)}% / mes`;
      if (balanceRate) {
        interestPactado += ` • ${parseFloat(balanceRate)}% sobre saldo${applyBalanceOnlyOnOverdue ? ' (solo mora)' : ''}`;
      }
    } else if (balanceRate) {
      interestPactado = `${parseFloat(balanceRate)}% sobre saldo${applyBalanceOnlyOnOverdue ? ' (solo mora)' : ''}`;
    }

    // --- NUEVO: Mostrar la tasa de mora pactada en la misma celda ---
    const moraRate = parseFloat(d.mora_rate || 0);
    if (moraRate > 0) {
      interestPactado = (interestPactado === '-') ? '' : interestPactado + '<br>';
      interestPactado += `<span class="text-[10px] text-red-500 font-bold uppercase tracking-wide">Mora: ${moraRate}% / mes</span>`;
    }


// --- NUEVA LÓGICA DE SALDO VISUAL (Solo para CxC) ---
let saldoVisual = debtTotals.total;
let detalleCapital = '';

if (d.type === 'COBRAR') {
    if (debtTotals.interest > 0 || debtTotals.mora > 0) {
        detalleCapital = `<div class="text-[10px] text-gray-500" title="Capital base">Cap: ${formatCurrency(debtTotals.remainingCapital)}`;
        if (debtTotals.interest > 0) detalleCapital += ` + Int: ${formatCurrency(debtTotals.interest)}`;
        if (debtTotals.mora > 0) detalleCapital += ` <span class="text-red-500 font-bold">+ Mora: ${formatCurrency(debtTotals.mora)}</span>`;
        detalleCapital += `</div>`;
    }
}
// ----------------------------------------------------
 

    const profileLink = person.raw ? `javascript:openPersonProfile('${person.id}', '${person.role}')` : 'javascript:void(0)';

    return `
      <tr class="${rowBg} border-b border-gray-100 transition-colors">
        <td class="px-3 py-3">
          <div class="font-bold text-gray-800 text-sm">
            <a href="${profileLink}" class="text-emerald-600 hover:underline">${escapeHtml(person.name)}</a>
          </div>
          <div class="text-[10px] text-gray-500 uppercase tracking-wide">${escapeHtml(d.description || 'Préstamo')}</div>
          ${contactHtml}
        </td>

        <td class="px-3 py-3 text-sm text-gray-500">${formatCurrency(d.initial_capital)}</td>

     <td class="px-3 py-3">
          <div class="font-bold text-sm text-gray-800">${formatCurrency(saldoVisual)}</div>
          ${detalleCapital}
          ${info.interest > 0 ? `<div class="text-[10px] text-orange-600 font-medium" title="Interés Calculado">+Int: ${formatCurrency(info.interest)}</div>` : ''}
          ${info.mora > 0 ? `<div class="text-[10px] text-red-600 font-bold" title="Mora Calculada por atraso">+Mora: ${formatCurrency(info.mora)}</div>` : ''}
        </td>

        <td class="px-3 py-3 text-center">
          <span class="px-2 py-1 rounded text-[10px] font-bold ${badgeClass}">${badgeText}</span>
          <div class="text-[10px] text-gray-400 mt-1">${d.next_payment_date ? formatDateColombia(d.next_payment_date) : '—'}</div>
        </td>

        <td class="px-3 py-3 text-right text-sm text-gray-600">${interestPactado}</td>

        <td class="px-3 py-3 text-right">
          <button onclick="showAbonoModal('${d.id}')" 
              class="text-xs bg-white border border-gray-300 hover:border-emerald-400 hover:text-emerald-600 text-gray-600 px-3 py-1 rounded shadow-sm transition-all disabled:opacity-30 disabled:cursor-not-allowed">
              Abonar
          </button>
        </td>
      </tr>
    `;
  }).join('');
}
  

// --- LÓGICA DE INTERESES ---
// Devuelve { interest, mora, daysAccrued, daysOverdue } (redondeados)
function calculateAccruedInterest(debt) {
    if (!debt || (parseFloat(debt.remaining_capital) || 0) <= 0) return { interest: 0, interestFixed: 0, interestBalance: 0, mora: 0, daysAccrued: 0, daysOverdue: 0 };
  
    const now = getColombiaNow().timestampMs;
    const lastPayment = debt.last_payment_date || debt.created_date || now;
    const daysAccrued = getDaysBetween(lastPayment, now);
    const daysOverdue = debt.next_payment_date && debt.next_payment_date < now ? getDaysBetween(debt.next_payment_date, now) : 0;
  
    const interestCfg = debt.interest || {};
    const fixedRateMonthly = parseFloat(interestCfg.fixed_rate_monthly || debt.interest_rate || 0) || 0;
    const balanceRateMonthly = parseFloat(interestCfg.balance_rate_monthly || 0) || 0;
    const applyBalanceOnlyOnOverdue = !!interestCfg.apply_balance_only_on_overdue;
  
    const monthFraction = Math.max(0, Math.min(1, daysAccrued / 30));
    const capitalBase = (debt.interest_type === 'FIJO') ? (parseFloat(debt.initial_capital) || 0) : (parseFloat(debt.remaining_capital) || 0);
  
    const interestFixed = Math.round((capitalBase * (fixedRateMonthly / 100) * monthFraction) * 100) / 100;
  
    let interestBalance = 0;
    if (!applyBalanceOnlyOnOverdue || daysOverdue > 0) {
      const balanceBase = parseFloat(debt.remaining_capital) || 0;
      interestBalance = Math.round((balanceBase * (balanceRateMonthly / 100) * monthFraction) * 100) / 100;
    }
  
    // Mora (use existing mora_rate if present)
// Mora (use existing mora_rate if present)
let mora = 0;
if (daysOverdue > 0) {
  const moraRate = parseFloat(debt.mora_rate || 0) || 0;
  const capitalForMora = parseFloat(debt.remaining_capital) || 0;

  if (debt.type === 'COBRAR') {
      // DEUDOR (Cliente): Se cobra por el mes completo (meses iniciados de atraso)
      // Usamos Math.ceil para que 1 a 30 días = 1 mes, 31 a 60 días = 2 meses, etc.
      const mesesMora = Math.ceil(daysOverdue / 30);
      mora = Math.round((capitalForMora * (moraRate / 100) * mesesMora) * 100) / 100;
  } else {
      // PROVEEDOR (Bancos/Pagar): Se cobra la fracción exacta de días atrasados
      mora = Math.round((capitalForMora * (moraRate / 100) * (daysOverdue / 30)) * 100) / 100;
  }
}
  
    const totalInterest = Math.round((interestFixed + interestBalance) * 100) / 100;
    return { interest: totalInterest, interestFixed, interestBalance, mora, daysAccrued, daysOverdue };
  }
  

// --- FUNCION DE ASIGNACION (WATERFALL) ---
// Devuelve un objeto con lo aplicado a cada rubro y el nuevo remaining capital
function allocatePayment(debt, monto) {
    const accrued = calculateAccruedInterest(debt);
    let restante = monto;

    let appliedMora = 0;
    let appliedInterest = 0;
    let appliedCapital = 0;

    // 1) Aplicar a Mora (si existe)
    if (accrued.mora > 0) {
        const apply = Math.min(restante, accrued.mora);
        appliedMora = apply;
        restante -= apply;
    }

    // 2) Aplicar a Intereses
    if (accrued.interest > 0 && restante > 0) {
        const apply = Math.min(restante, accrued.interest);
        appliedInterest = apply;
        restante -= apply;
    }

    // 3) Aplicar a Capital
    if (restante > 0) {
        appliedCapital = restante;
        restante = 0;
    }

    // Nuevo saldo de capital
    let newRemaining = debt.remaining_capital - appliedCapital;
    if (newRemaining < 0) newRemaining = 0;

    return {
        appliedMora,
        appliedInterest,
        appliedCapital,
        newRemaining,
        accruedInterest: accrued.interest,
        accruedMora: accrued.mora
    };
}

// --- MODAL Y LOGICA DE ENVIO ---

function showAbonoModal(debtId) {
  const debt = debts.find(d => d.id === debtId);
  if (!debt) return;
  
  const info = calculateAccruedInterest(debt);
  const debtTotals = getDebtCurrentTotal(debt);
  const isCxC = debt.type === 'COBRAR';
  
  // Extraemos los porcentajes para mostrarlos en pantalla
  const interestCfg = debt.interest || {};
  const fixedRate = parseFloat(interestCfg.fixed_rate_monthly || debt.interest_rate || 0);
  const moraRate = parseFloat(debt.mora_rate || 0);
  
  // Suma total de lo que debe a la fecha
  const totalDeudaActual = debtTotals.total;
  
  // Si es un cliente (COBRAR), mostramos los meses de mora. Si es proveedor, los días.
  let moraLabel = `Mora (${info.daysOverdue} días)`;
  if (isCxC) {
      const mesesMora = Math.ceil(info.daysOverdue / 30);
      moraLabel = `Mora (${mesesMora} mes${mesesMora !== 1 ? 'es' : ''})`;
  }

  document.getElementById('abono-debt-id').value = debtId;
  document.getElementById('abono-modal-title').textContent = `Abonar a: ${isCxC ? debt.client_name : debt.provider_name}`;
  
  // Resumen informativo en el modal (Con Porcentajes y Total)
  document.getElementById('abono-debt-info').innerHTML = `
      <div class="flex justify-between mb-1 text-gray-600">
          <span>Capital Pendiente:</span>
          <span class="font-bold">${formatCurrency(debt.remaining_capital)}</span>
      </div>
      
      <div class="flex justify-between text-orange-700 mb-1">
          <span title="Calculado por ${info.daysAccrued} días">Interés (${fixedRate}% / mes):</span>
          <span>+ ${formatCurrency(info.interest)}</span>
      </div>
      
      ${moraRate > 0 ? `
      <div class="flex justify-between text-red-700 font-bold mb-1">
          <span>${moraLabel} al ${moraRate}%:</span>
          <span>+ ${formatCurrency(info.mora)}</span>
      </div>` : ''}
      
      <div class="flex justify-between items-center text-gray-900 font-black text-lg border-t border-gray-300 pt-2 mt-2">
          <span>Total Deuda a la fecha:</span>
          <span class="text-emerald-700">${formatCurrency(totalDeudaActual)}</span>
      </div>

      <div class="mt-3 text-[11px] bg-blue-50 text-blue-800 p-2 rounded border border-blue-200">
          <strong>Distribución Automática:</strong> El sistema aplicará el dinero que ingreses en este orden: <em>Mora → Interés → Capital</em>.
      </div>
      <div class="mt-2 text-[11px] bg-amber-50 text-amber-800 p-2 rounded border border-amber-200">
          <strong>Regla de control:</strong> El abono debe ser igual o menor al total actual de la deuda. No se permiten pagos por encima del saldo exigible.
      </div>
  `;

  // Resetear formulario y mostrar
  document.getElementById('abono-form').reset();
  document.getElementById('abono-message').classList.add('hidden');
  document.getElementById('abono-modal').classList.remove('hidden');
}

function hideAbonoModal() {
    document.getElementById('abono-modal').classList.add('hidden');
}


async function handleAbonoSubmit(event) {
  event.preventDefault();
  const form = event.target;
  const msg = document.getElementById('abono-message');

  const debtId = form['abono-debt-id'].value;
  const amount = parseFloat(form['abono-amount'].value);
  const accountId = form['abono-account'].value;

  if (isNaN(amount) || amount <= 0) { showError(msg, "Ingrese un monto válido mayor a 0."); return; }
  if (!accountId) { showError(msg, "Seleccione una Cuenta (Caja/Banco)."); return; }

  const currentDebt = debts.find(d => d.id === debtId);
  if (!currentDebt) { showError(msg, "Deuda no encontrada."); return; }
  const debtTotals = getDebtCurrentTotal(currentDebt);

  const account = savings.find(s => s.id === accountId);
  if (!account) { showError(msg, "Cuenta no válida."); return; }

  if (amount > debtTotals.total) {
    showError(msg, `Estás pagando de más. Máximo permitido: ${formatCurrency(debtTotals.total)}.`);
    return;
  }

  // Validar saldo si es PAGO (Tú pagando a un proveedor/banco)
  if (currentDebt.type === 'PAGAR') {
    const saldoDisponible = account.saldo || account.amount || 0;
    if (amount > saldoDisponible) {
      showError(msg, `Saldo insuficiente en ${account.name || account.tag}. Disponible: ${formatCurrency(saldoDisponible)}`);
      return;
    }
  }

  // 100% AUTOMÁTICO: Aplicación en Cascada (Mora -> Intereses -> Capital)
  const allocation = allocatePayment(currentDebt, amount);
  const submitGuard = beginSubmitGuard(form, {
    scope: `deudas.abono.${debtId}`,
    busyText: 'Procesando...'
  });
  if (!submitGuard) return;

  try {
    const reservation = await submitGuard.reserve();
    if (!reservation.ok) return;

    msg.textContent = "Procesando pago en curso...";
    msg.className = "text-sm text-center mt-3 font-bold text-blue-600";
    msg.classList.remove('hidden');

    const batch = writeBatch(db);
    const nowColombia = getColombiaNow();
    const timeNow = nowColombia.timestampMs;
    const isCobrar = currentDebt.type === 'COBRAR';

    // ==========================================
    // 1. ACTUALIZAR SALDO DE CAJA / BANCO
    // ==========================================
    const accountRef = doc(getCollectionRef('ahorros'), accountId);
    const accountDelta = isCobrar ? amount : -amount; // Si cobras suma, si pagas resta
    batch.set(accountRef, {
        saldo: increment(accountDelta),
        updated_at: timeNow,
        updatedAtColombia: nowColombia
    }, { merge: true });

    // ==========================================
    // 2. CREAR TRANSACCIÓN EN BALANCE GENERAL
    // ==========================================
    const txRef = doc(getCollectionRef('transacciones'));
    const txType = isCobrar ? 'INGRESO' : 'EGRESO';
    const txCategory = isCobrar ? 'INGRESO_ABONO_CARTERA' : 'EGRESO_PAGO_PROVEEDOR';
    const role = isCobrar ? 'CLIENTE' : 'PROVEEDOR';
    
    // Armar desglose detallado para el historial
    const moneyFormatter = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 });
    const descDetalle = `Abono a Cartera. Total: ${moneyFormatter.format(amount)} (Mora: ${moneyFormatter.format(allocation.appliedMora)} | Int: ${moneyFormatter.format(allocation.appliedInterest)} | Cap: ${moneyFormatter.format(allocation.appliedCapital)}) - Deuda: ${currentDebt.description || ''}`;

    const txData = {
        id: txRef.id,
        type: txType,
        category: txCategory,
        amount: amount,
        distributedAmount: 0,
        description: descDetalle,
        date: timeNow,
        dateColombia: nowColombia,
        dateKey: nowColombia.dateKey,
        timeKey: nowColombia.timeKey,
        weekday: nowColombia.weekday,
        status: 'ACTIVA',
        timestamp: timeNow,
        operationId: submitGuard.operationId,
        operationScope: submitGuard.operationScope,
        createdAtColombia: nowColombia,
        updatedAtColombia: nowColombia,
        related_id: currentDebt.client_id || currentDebt.provider_id || null,
        related_role: role,
        related_name: currentDebt.client_name || currentDebt.provider_name || null,
        related_type: role,
        related_debt_id: debtId,
        payment_accounts: [{ accountId: accountId, name: account.name || account.tag || 'Cuenta', amount: amount }]
    };
    batch.set(txRef, txData);

// ==========================================
    // 3. ACTUALIZAR DEUDA Y GUARDAR HISTORIAL INTERNO
    // ==========================================
    const debtRef = doc(getCollectionRef('deudas'), debtId);
    
    if (allocation.newRemaining <= 0) {
        // Si el saldo llega a 0 (o menos), se elimina la deuda permanentemente
        batch.delete(debtRef);
    } else {
        // Si aún queda saldo, se registra el abono normalmente
        // Si el pago cubrió mora o intereses, movemos la base de cálculo
        // para que la mora no siga creciendo desde la fecha original.
        const shouldResetOverdueBase = allocation.appliedMora > 0 || allocation.appliedInterest > 0;
        const paymentLogEntry = {
            date: timeNow,
            dateColombia: nowColombia,
            amount: amount,
            applied_mora: allocation.appliedMora,
            applied_interest: allocation.appliedInterest,
            applied_capital: allocation.appliedCapital,
            account_id: accountId,
            transaction_id: txRef.id,
            operationId: submitGuard.operationId
        };

        batch.set(debtRef, {
            remaining_capital: allocation.newRemaining,
            last_payment_date: timeNow,
            next_payment_date: shouldResetOverdueBase ? timeNow : currentDebt.next_payment_date,
            payments_log: arrayUnion(paymentLogEntry),
            updated_at: timeNow,
            updatedAtColombia: nowColombia
        }, { merge: true });
    }

    // ==========================================
    // EJECUTAR TODO AL MISMO TIEMPO
    // ==========================================
    await batch.commit();
    await submitGuard.success({ primaryDocId: txRef.id, debtId });

    showSuccess(msg, "Pago procesado y cuentas actualizadas con éxito.");
    
    setTimeout(() => {
        hideAbonoModal();
    }, 1500);
    
  } catch (err) {
    await submitGuard.fail(err);
    console.error('Error procesando el abono:', err);
    showError(msg, "Hubo un error al ejecutar la transacción bancaria.");
  } finally {
    submitGuard.release();
  }
}

function showError(el, text) {
    el.textContent = text;
    el.className = "text-sm text-center mt-3 font-bold text-red-600";
    el.classList.remove('hidden');
}


function showSuccess(el, text) {
  el.textContent = text;
  // Usamos text-emerald-600 para que el mensaje de éxito sea verde
  el.className = "text-sm text-center mt-3 font-bold text-emerald-600";
  el.classList.remove('hidden');
}
