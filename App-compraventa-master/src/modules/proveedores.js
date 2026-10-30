// js/modules/proveedores.js
import { providers, transactions, debts, providerSearchTerm, setProviderSearchTerm } from '../store/store.js';
import { getCollectionRef } from '../services/listeners.js';
import { doc, setDoc, deleteDoc } from "firebase/firestore";
import { renderHeader, renderFormGroup, formatCurrency, showGeneralConfirmModal } from '../utils/utils.js';
import { formatDateColombia, getColombiaNow } from '../utils/colombiaTime.js';

window.deleteProviderWrapper = deleteProviderWrapper;
window.showProviderHistoryModal = showProviderHistoryModal;
window.hideProviderHistoryModal = hideProviderHistoryModal;

export async function renderProveedores() {
    const contentDiv = document.getElementById('content');
    contentDiv.innerHTML = await renderHeader('Proveedores', `Total: ${providers.length}`);

    contentDiv.insertAdjacentHTML('beforeend', `
        <div class="bg-white p-5 rounded-xl card mb-6">
            <h2 class="text-xl font-semibold mb-4 text-gray-800 border-b pb-2">Registrar Proveedor</h2>
            <form id="provider-form">
                <div class="grid sm:grid-cols-3 gap-4">
                    ${renderFormGroup('Nombre', `<input type="text" id="provider-name" required class="w-full p-2 border border-gray-300 rounded-lg">`)}
                    ${renderFormGroup('NIT/ID', `<input type="text" id="provider-id" required class="w-full p-2 border border-gray-300 rounded-lg uppercase">`)}
                    ${renderFormGroup('Teléfono', `<input type="tel" id="provider-phone" required class="w-full p-2 border border-gray-300 rounded-lg">`)}
                </div>
                <button type="submit" class="button-primary text-white p-2 w-full mt-4 rounded-lg">Guardar</button>
            </form>
            <p id="provider-message" class="text-sm text-center mt-3 hidden"></p>
        </div>

        <div class="bg-white p-5 rounded-xl card">
            <h2 class="text-xl font-semibold mb-4 text-gray-800">Listado</h2>
            <input type="text" id="provider-search" value="${providerSearchTerm}" placeholder="Buscar..." class="w-full p-2 border border-gray-300 rounded-lg mb-4">
            <div class="overflow-x-auto">
                <table class="min-w-full divide-y divide-gray-200">
                    <thead class="bg-gray-50">
                        <tr>
                            <th class="px-3 py-2 text-left text-xs font-medium text-gray-500">Proveedor</th>
                            <th class="px-3 py-2 text-left text-xs font-medium text-gray-500">Contacto</th>
                            <th class="px-3 py-2 text-center text-xs font-medium text-gray-500">Acciones</th>
                        </tr>
                    </thead>
                    <tbody id="providers-table-body" class="bg-white divide-y divide-gray-200"></tbody>
                </table>
            </div>
        </div>
    `);

    document.getElementById('provider-form').addEventListener('submit', handleProviderSubmit);
    document.getElementById('provider-search').addEventListener('input', (e) => {
        setProviderSearchTerm(e.target.value);
        renderProvidersTableRows();
    });
    renderProvidersTableRows();
}

function renderProvidersTableRows() {
    const tbody = document.getElementById('providers-table-body');
    if (!tbody) return;
    const term = providerSearchTerm.toLowerCase();
    const filtered = providers.filter(p => 
        (p.name && p.name.toLowerCase().includes(term)) || (p.id_number && p.id_number.includes(term))
    ).sort((a,b) => b.last_contact - a.last_contact);

    tbody.innerHTML = filtered.length ? filtered.map(p => `
        <tr class="hover:bg-gray-50">
            <td class="px-3 py-2 text-sm font-medium">${p.name}<br/><span class="text-xs text-gray-500">NIT: ${p.id_number}</span></td>
            <td class="px-3 py-2 text-sm">${p.phone}</td>
            <td class="px-3 py-2 text-center">
                <button onclick="showProviderHistoryModal('${p.id_number}')" class="text-teal-600 text-xs border border-teal-300 rounded px-2 py-1 mr-1">Ver</button>
                <button onclick="deleteProviderWrapper('${p.id_number}', '${p.name}')" class="text-red-600 text-lg"><svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 inline" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 000-2h-3.382l-.724-1.447A1 1 0 0011 2H9zm4 11a1 1 0 11-2 0 1 1 0 012 0z" clip-rule="evenodd"/></svg></button>
            </td>
        </tr>
    `).join('') : '<tr><td colspan="3" class="text-center py-4 text-gray-500">Sin resultados.</td></tr>';
}

async function handleProviderSubmit(event) {
    event.preventDefault();
    const form = event.target;
    const msg = document.getElementById('provider-message');
    const id = form['provider-id'].value.toUpperCase();

    if (providers.some(p => p.id_number === id)) {
        msg.textContent = "Error: NIT ya existe."; msg.classList.remove('hidden', 'text-emerald-500'); msg.classList.add('text-red-500'); return;
    }

    try {
        const nowColombia = getColombiaNow();
        await setDoc(doc(getCollectionRef('proveedores'), id), {
            name: form['provider-name'].value,
            id_number: id,
            phone: form['provider-phone'].value,
            last_contact: nowColombia.timestampMs,
            lastContactColombia: nowColombia,
            createdAtColombia: nowColombia,
            dateKey: nowColombia.dateKey,
            timeKey: nowColombia.timeKey,
            weekday: nowColombia.weekday
        });
        msg.textContent = "Guardado."; msg.classList.remove('hidden', 'text-red-500'); msg.classList.add('text-emerald-500'); form.reset();
    } catch (e) { console.error(e); msg.textContent = e.message; msg.classList.add('text-red-500'); }
}

function showProviderHistoryModal(id) {
    const provider = providers.find(p => p.id_number === id);
    if (!provider) return;
    
    const cxp = debts.filter(d => d.provider_id === id && d.type === 'PAGAR');
    const trans = transactions.filter(t => t.provider_id === id);

    document.getElementById('provider-history-modal-title').textContent = `Historial: ${provider.name}`;
    document.getElementById('provider-history-content').innerHTML = `
        <h4 class="font-bold text-gray-700 mt-2">CxP (${cxp.length})</h4>
        <div class="max-h-40 overflow-y-auto bg-gray-50 p-2 rounded mb-4 text-sm">
            ${cxp.map(d => `<p>${formatCurrency(d.initial_capital)} (${d.status})</p>`).join('') || '<p>Sin deudas.</p>'}
        </div>
        <h4 class="font-bold text-gray-700">Movimientos (${trans.length})</h4>
        <div class="max-h-40 overflow-y-auto bg-gray-50 p-2 rounded text-sm">
            ${trans.map(t => `<p class="text-xs border-b py-1">${formatDateColombia(t.date)} - ${t.type}: ${formatCurrency(t.amount)}</p>`).join('')}
        </div>
    `;
    document.getElementById('provider-history-modal').classList.remove('hidden');
}

function hideProviderHistoryModal() { document.getElementById('provider-history-modal').classList.add('hidden'); }

function deleteProviderWrapper(id, name) {
    showGeneralConfirmModal(id, name, 'Proveedor', (id) => deleteDoc(doc(getCollectionRef('proveedores'), id)));
}
