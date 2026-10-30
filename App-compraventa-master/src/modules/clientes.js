// js/modules/clientes.js
import { clients, transactions, debts, clientSearchTerm, setClientSearchTerm } from '../store/store.js';
import { renderHeader, formatCurrency } from '../utils/utils.js';
import { formatDateColombia } from '../utils/colombiaTime.js';

// Exponer funciones para el modal
window.showClientHistoryModal = showClientHistoryModal;
window.hideClientHistoryModal = hideClientHistoryModal;

export async function renderClientes() {
    const contentDiv = document.getElementById('content');
    contentDiv.innerHTML = await renderHeader('Clientes', `Total registrados: ${clients.length}`);

    contentDiv.insertAdjacentHTML('beforeend', `
        <div class="bg-white p-5 rounded-xl card">
            <h2 class="text-xl font-semibold mb-4 text-gray-800">Listado de Clientes</h2>
            <div class="mb-4">
                <input type="text" id="client-search" value="${clientSearchTerm}" placeholder="Buscar..." class="w-full p-2 border border-gray-300 rounded-lg">
            </div>
            <div class="overflow-x-auto">
                <table class="min-w-full divide-y divide-gray-200">
                    <thead class="bg-gray-50">
                        <tr>
                            <th class="px-3 py-2 text-left text-xs font-medium text-gray-500">Cliente</th>
                            <th class="px-3 py-2 text-left text-xs font-medium text-gray-500">Contacto</th>
                            <th class="px-3 py-2 text-center text-xs font-medium text-gray-500">Últ. Transacción</th>
                            <th class="px-3 py-2 text-center text-xs font-medium text-gray-500">Historial</th>
                        </tr>
                    </thead>
                    <tbody id="clients-table-body" class="bg-white divide-y divide-gray-200"></tbody>
                </table>
            </div>
        </div>
    `);

    document.getElementById('client-search').addEventListener('input', (e) => {
        setClientSearchTerm(e.target.value);
        renderClientsTableRows();
    });
    renderClientsTableRows();
}

function renderClientsTableRows() {
    const tbody = document.getElementById('clients-table-body');
    if (!tbody) return;
    const term = clientSearchTerm.toLowerCase();
    const filtered = clients.filter(c => 
        (c.name && c.name.toLowerCase().includes(term)) || 
        (c.id_number && c.id_number.includes(term))
    ).sort((a,b) => b.last_transaction - a.last_transaction);

    tbody.innerHTML = filtered.length ? filtered.map(c => `
        <tr class="hover:bg-gray-50">
            <td class="px-3 py-2 text-sm font-medium">${c.name}<br/><span class="text-xs text-gray-500">ID: ${c.id_number}</span></td>
            <td class="px-3 py-2 text-sm">${c.phone}<br/>${c.email || ''}</td>
            <td class="px-3 py-2 text-center text-xs text-gray-500">${formatDateColombia(c.last_transaction) || '—'}</td>
            <td class="px-3 py-2 text-center">
                <button onclick="showClientHistoryModal('${c.id_number}')" class="text-blue-600 text-xs border border-blue-300 rounded px-2 py-1">Ver</button>
            </td>
        </tr>
    `).join('') : '<tr><td colspan="4" class="text-center py-4 text-gray-500">Sin resultados.</td></tr>';
}

function showClientHistoryModal(id) {
    const client = clients.find(c => c.id_number === id);
    if (!client) return;
    
    const relatedTrans = transactions.filter(t => t.client_id === id).sort((a,b) => b.date - a.date);
    const relatedDebts = debts.filter(d => d.client_id === id).sort((a,b) => b.created_date - a.created_date);

    document.getElementById('history-modal-title').textContent = `Historial: ${client.name}`;
    document.getElementById('history-content').innerHTML = `
        <h4 class="font-bold text-gray-700 mt-2">Deudas (${relatedDebts.length})</h4>
        <div class="max-h-40 overflow-y-auto bg-gray-50 p-2 rounded mb-4 text-sm">
            ${relatedDebts.map(d => `<p class="${d.status==='PAGADO'?'text-gray-500':'text-red-600'}">${d.debt_type}: ${formatCurrency(d.initial_capital)} (${d.status})</p>`).join('') || '<p>Sin deudas.</p>'}
        </div>
        <h4 class="font-bold text-gray-700">Transacciones (${relatedTrans.length})</h4>
        <div class="max-h-40 overflow-y-auto bg-gray-50 p-2 rounded text-sm">
            ${relatedTrans.map(t => `<p class="text-xs border-b py-1">${formatDateColombia(t.date)} - ${t.type}: ${formatCurrency(t.amount)}</p>`).join('') || '<p>Sin movimientos.</p>'}
        </div>
    `;
    document.getElementById('client-history-modal').classList.remove('hidden');
}

function hideClientHistoryModal() {
    document.getElementById('client-history-modal').classList.add('hidden');
}
