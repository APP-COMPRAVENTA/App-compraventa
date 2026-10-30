// js/modules/historialPersona.js
import { getCollectionRef } from '../services/listeners.js';
import { clients, providers, tramitador, transactions, getComisionesPendientes, savings } from '../store/store.js';
import { renderHeader, formatCurrency } from '../utils/utils.js';
import { formatDateColombia, getColombiaNow } from '../utils/colombiaTime.js';

// --- ESTADO GLOBAL DEL MÓDULO ---
let currentSearchTerm = '';
let selectedPerson = null;
let previousModule = null; // Para poder volver al módulo de origen (ej. balance)

// --- NUEVOS ESTADOS DE BÚSQUEDA LOCAL ---
let movimientosSearch = ''; // para Movimientos Detallados (personas)
let empleadoSearch = '';    // para Empleados/Vendedores (Fecha/Cliente/Placa/Estado)

// --- HELPER: Normalizar strings safely ---
const toStr = (v) => (v === undefined || v === null) ? '' : String(v);

// --- 1. FUNCIÓN PRINCIPAL (Entry Point) ---
// Nota: renderHistorialPersona ahora lee window.pendingHistorial (si existe)
// para evitar race conditions con navigateTo() / router.
export function renderHistorialPersona(reset = false, directId = null, directRole = null) {
    const contentDiv = document.getElementById('content');
    if (!contentDiv) return;

    // 1. CAPTURAR DATOS DE NAVEGACIÓN (Solo una vez)
    if (window.pendingHistorial) {
        directId = window.pendingHistorial.id;
        directRole = window.pendingHistorial.role;
        previousModule = window.pendingHistorial.origin || null; // Guardamos el origen
        
        // Limpiamos el "ticket" después de extraer los datos
        window.pendingHistorial = null; 
    }

    if (reset) {
        selectedPerson = null;
        currentSearchTerm = '';
        movimientosSearch = '';
        empleadoSearch = '';
        // No tocamos previousModule aquí para que el botón volver sepa a dónde ir
    }
    // Si hay pendingHistorial (provocado por openHistorialPersona externo), lo usamos
    if (!directId && window && window.pendingHistorial) {
        const p = window.pendingHistorial;
        directId = p.id;
        directRole = p.role;
        // No borramos inmediatamente para depuración; pero limpiamos para evitar reutilización accidental
        delete window.pendingHistorial;
    }

    // Limpiamos contenido (se sobreescribe más abajo)
    contentDiv.innerHTML = '';

    // Si venimos con un ID o Nombre directo -> resolver selectedPerson
    if (directId) {
        const role = String(directRole || 'CLIENTE').toUpperCase();

        // --- Soporte EMPLEADO / VENDEDOR (no tocar búsqueda clientes/proveedores) ---
        if (role === 'EMPLEADO' || role === 'VENDEDOR') {
            const comisiones = (typeof getComisionesPendientes === 'function') ? getComisionesPendientes() : [];

            // 1) Intentar encontrar comisión por employeeId exacto
            let match = comisiones.find(c => toStr(c.employeeId) === toStr(directId));

            // 2) Si no lo encontramos por employeeId, intentar por campos comunes (employeeName / vendedorName)
            //    o incluso por clientName si directId parece ser un nombre.
            if (!match) {
                const lowered = toStr(directId).toLowerCase();
                match = comisiones.find(c =>
                    (c.employeeName && toStr(c.employeeName).toLowerCase() === lowered) ||
                    (c.vendedorName && toStr(c.vendedorName).toLowerCase() === lowered) ||
                    (c.clientName && toStr(c.clientName).toLowerCase() === lowered)
                );
            }

            // 3) Si encontramos un match, asegurarnos de usar siempre el employeeId real como selectedPerson.id
            if (match) {
                selectedPerson = {
                    id: toStr(match.employeeId || match.vendedorId || directId),
                    name: match.employeeName || match.vendedorName || (`Vendedor ${String(match.employeeId || '').slice(0,6)}`),
                    id_number: toStr(match.employeeId || match.vendedorId || directId),
                    type: role,
                    role: role
                };
            } else {
                // No encontramos ninguna comisión asociada -> creamos perfil mínimo con lo que llegó
                selectedPerson = {
                    id: toStr(directId),
                    name: toStr(directId),
                    id_number: toStr(directId),
                    type: role,
                    role: role
                };
            }
        } else {
            // === Flujo original CLIENTE / PROVEEDOR (NO TOCAR) ===
            const list = (String(directRole || '').toUpperCase() === 'CLIENTE') ? clients : providers;

            // 1. intentamos buscar por número de documento (id_number)
            let found = list.find(p => toStr(p.id_number) === toStr(directId));

            // 2. si no lo encuentra por ID, intentamos buscar por nombre (por si enviamos el nombre como ID)
            if (!found) {
                found = list.find(p => p.name && toStr(p.name).toLowerCase() === toStr(directId).toLowerCase());
            }

            if (found) {
                selectedPerson = { ...found, type: 'CLIENTE' };
            } else {
                // Perfil temporal
                selectedPerson = {
                    name: directId,
                    id_number: "No registrado",
                    type: (String(directRole || 'CLIENTE')).toUpperCase()
                };
            }
        }
    }

    // Render según si tenemos persona seleccionada
    if (selectedPerson) {
        renderPersonProfile(contentDiv);
        bindBackButton(); // <- engancha el listener ahora que el DOM está creado
    } else {
        renderDirectoryList(contentDiv);
    }
    
}

// --- 2. openHistorialPersona GLOBAL (una sola implementación, robusta) ---
// Uso recomendado desde otros módulos: window.openHistorialPersona(employeeId, 'EMPLEADO')
//
// ... al inicio del archivo ...




// ... dentro de la función que renderiza el perfil (donde está el botón volver) ...
// Busca donde creas el botón en el HTML y asegúrate que el ID sea 'btn-back-search'
function bindBackButton() {
    const btnBack = document.getElementById('btn-back-search');
    if (!btnBack) return;

    // Remover posibles listeners previos (evita duplicados)
    btnBack.onclick = null;

    btnBack.addEventListener('click', () => {
        // Si hay un previousModule conocido y está disponible en el router -> navegar ahí
        if (previousModule) {
            const destino = previousModule;
            previousModule = null;

            if (typeof window.navigateTo === 'function') {
                window.navigateTo(destino);
            } else {
                // Fallback local: limpiar selección y mostrar directorio
                selectedPerson = null;
                renderHistorialPersona(true);
            }
            return;
        }

        // Si no hay previousModule, solo volver a la lista dentro del historial
       
renderHistorialPersona(true);

    });
}


// Helper: intenta re-renderizar el módulo historial; si no es posible, recarga la página.
// delay en ms para dar tiempo al backend / listeners a propagar cambios.
function reloadAfterLiquidacion(delay = 800) {
    setTimeout(() => {
        try {
            // Si hay un selectedPerson (empleado/vendedor) y la función principal está disponible,
            // re-renderizamos el historial para esa misma persona (sin reset).
            if (selectedPerson && typeof renderHistorialPersona === 'function') {
                // Llamamos con el id y tipo actuales para forzar recarga de datos
                renderHistorialPersona(false, selectedPerson.id, selectedPerson.type);
                return;
            }
        } catch (e) {
            console.warn('reloadAfterLiquidacion: re-render failed', e);
        }
        // fallback: recarga completa por si los listeners no actualizaron el estado
        window.location.reload();
    }, delay);
}

// --- 3. VISTA DE LISTA (Directorio + Buscador) ---
// Nota: Mantengo el HTML/CSS original intacto; solo aseguro que el click local no use navigateTo.
async function renderDirectoryList(container) {
    container.innerHTML = `
        ${await renderHeader('Historial Financiero', 'Selecciona una persona para ver su expediente completo')}
        
        <div class="sticky top-0 z-20 bg-[#f7f9fb] pt-2 pb-4 px-4">
            <div class="max-w-3xl mx-auto relative">
                <input type="text" id="historial-search-input" 
                    class="w-full p-4 pl-12 border-none shadow-sm rounded-xl text-lg focus:ring-2 focus:ring-emerald-400 transition-all outline-none"
                    placeholder="Buscar por Nombre, Cédula o Placa..." 
                    value="${currentSearchTerm}"
                    autocomplete="off">
                <svg class="w-6 h-6 text-emerald-500 absolute left-4 top-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
            </div>
        </div>

        <div id="historial-results-grid" class="max-w-6xl mx-auto px-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pb-20">
            </div>
    `;

    const input = document.getElementById('historial-search-input');
    if (input) input.focus();
    
    // Función interna para renderizar la grilla
    const renderGrid = (term) => {
        const grid = document.getElementById('historial-results-grid');
        if (!grid) return;
        grid.innerHTML = '';

        // 1. Unificar Clientes y Proveedores
        let allPeople = [
            ...clients.map(c => ({ ...c, type: 'CLIENTE', typeColor: 'bg-blue-100 text-blue-700' })), 
            ...providers.map(p => ({ ...p, type: 'PROVEEDOR', typeColor: 'bg-purple-100 text-purple-700' })),
            ...tramitador.map(p => ({ ...p, type: 'TRAMITADOR', typeColor: 'bg-purple-100 text-purple-700' }))
        ];

        // 2. Filtrar
        let matches = [];
        const cleanTerm = (term || '').trim().toUpperCase();

        if (cleanTerm === '') {
            matches = allPeople; // Mostrar todos si está vacío
        } else {
            // Filtro normal (Nombre/ID)
            matches = allPeople.filter(p => {
                const name = (p.name || '').toUpperCase();
                const id = (p.id_number || '').toUpperCase();
                return name.includes(cleanTerm) || id.includes(cleanTerm);
            });

            // Búsqueda Inteligente por PLACA (mantener)
            const plateMatches = transactions.filter(t => 
                t.relation_plate && toStr(t.relation_plate).toUpperCase().includes(cleanTerm)
            );
            
            // Si encontramos placas, añadimos a los dueños asociados aunque no coincida el nombre
            plateMatches.forEach(tx => {
                if (tx.related_name) {
                    const exists = matches.find(m => m.name === tx.related_name);
                    if (!exists) {
                        // Buscarlo en la lista global o crear uno temporal
                        const personInDb = allPeople.find(p => p.name === tx.related_name);
                        if (personInDb) {
                            matches.push(personInDb);
                        } else {
                            matches.push({
                                name: tx.related_name,
                                id_number: tx.related_id || 'S/N',
                                type: 'TRANSACCIÓN',
                                typeColor: 'bg-orange-100 text-orange-700'
                            });
                        }
                    }
                }
            });
        }

        // 3. Renderizar (Limitamos a 50 para no congelar si hay miles)
        if (matches.length === 0) {
            grid.innerHTML = `<div class="col-span-full text-center py-10 text-gray-400">No se encontraron personas.</div>`;
            return;
        }

        matches.slice(0, 50).forEach(person => {
            const card = document.createElement('div');
            card.className = "bg-white p-4 rounded-xl shadow-sm hover:shadow-md cursor-pointer transition-all border border-transparent hover:border-emerald-300 flex items-center gap-4 group";
            
            const initial = person.name ? person.name.charAt(0).toUpperCase() : '?';

            card.innerHTML = `
                <div class="w-12 h-12 rounded-full bg-gray-50 group-hover:bg-emerald-50 flex items-center justify-center font-bold text-gray-500 group-hover:text-emerald-600 text-xl transition-colors">
                    ${initial}
                </div>
                <div class="flex-1 overflow-hidden">
                    <h3 class="font-bold text-gray-800 truncate">${person.name}</h3>
                    <div class="flex items-center gap-2 mt-1">
                        <span class="text-[10px] font-bold px-2 py-0.5 rounded ${person.typeColor}">${person.type}</span>
                        <span class="text-xs text-gray-400 truncate">${person.id_number || 'S/N'}</span>
                    </div>
                </div>
                <svg class="w-5 h-5 text-gray-300 group-hover:text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
            `;

            // Al hacer click en la tarjeta del directorio, seleccionamos localmente y mostramos perfil.
            // Importante: No llamamos a window.navigateTo aquí para evitar rebotes; esto es una interacción local.
            card.addEventListener('click', () => {
                selectedPerson = person;
                renderHistorialPersona(false); // FALSE = No resetear, mantener selección
           
             // FALSE = No resetear, mantener selección
            });

            grid.appendChild(card);
        });
    };

    // Event listeners
    if (input) {
        input.addEventListener('input', (e) => {
            currentSearchTerm = e.target.value;
            renderGrid(currentSearchTerm);
        });
    }

    // Render inicial
    renderGrid(currentSearchTerm);
}

// --- 4. PERFIL FINANCIERO (Detalle) ---
function renderPersonProfile(container) {
    // Si venimos con ventana pending (por seguridad) la manejamos arriba en renderHistorialPersona
    const isEmpleado = selectedPerson && (String(selectedPerson.type).toUpperCase() === 'EMPLEADO' || String(selectedPerson.type).toUpperCase() === 'VENDEDOR');

    // --- ADAPTADOR DE DATOS ---
    let txHistory = [];

    if (isEmpleado) {
        // Los objetos de comisiones tienen la forma conocida:
        // { id, clientName, date, relation_plate, employeeId, amount, status }
        const comisiones = (typeof getComisionesPendientes === 'function') ? getComisionesPendientes() : [];

        // Filtramos por employeeId (selectedPerson.id) — seleccionado en la fase de resolución
        txHistory = comisiones
            .filter(c => toStr(c.employeeId) === toStr(selectedPerson.id))
            .map(c => {
                // Parseamos fecha ISO con fallback a now
                const parsed = c.date ? Date.parse(c.date) : NaN;
                const timestamp = !isNaN(parsed) ? parsed : getColombiaNow().timestampMs;

                return {
                    timestamp,
                    category: 'Comisión',
                    description: c.clientName || c.description || '',
                    relation_plate: c.relation_plate || c.relationPlate || '',
                    type: 'INGRESO',
                    amount: Number(c.amount || c.monto || 0),
                    __status: (c.status || c.estado || '').toString().toUpperCase(),
                    raw: c
                };
            })
            .sort((a, b) => b.timestamp - a.timestamp);
    } else {
        // Flujo original para clientes/proveedores (no tocar)
        txHistory = transactions.filter(t => {
            const matchId = selectedPerson.id && t.related_id === selectedPerson.id;
            const matchName = t.related_name && selectedPerson.name && t.related_name.trim().toUpperCase() === selectedPerson.name.trim().toUpperCase();
            return matchId || matchName;
        }).sort((a, b) => b.timestamp - a.timestamp);
    }

    // --- CÁLCULOS ---
    let totalIngresos = 0;
    let totalEgresos = 0;
    let saldoPendiente = 0;

    txHistory.forEach(t => {
        if (isEmpleado) {
            totalIngresos += Number(t.amount || 0);
            if (t.__status === 'PENDIENTE') {
                saldoPendiente += Number(t.amount || 0);
            }
        } else {
            if (t.type === 'INGRESO') totalIngresos += Number(t.amount || 0);
            if (t.type === 'EGRESO') totalEgresos += Number(t.amount || 0);
        }
    });

    const balanceNeto = isEmpleado ? (totalIngresos - saldoPendiente) : (totalIngresos - totalEgresos);


    // ---------------------------
    // AÑADIDO: FILTRADO SEGÚN BUSCADORES LOCALES
    // No modificamos txHistory original (se usa para cálculos / clientes recientes)
    // Creamos filteredTxHistory que se renderizará en las tablas.
    let filteredTxHistory = txHistory;

    if (isEmpleado && empleadoSearch && empleadoSearch.trim() !== '') {
        const term = empleadoSearch.trim().toUpperCase();
        filteredTxHistory = txHistory.filter(t => {
            // Fecha: comparamos la fecha local corta con el término si el término parece fecha,
            // pero también permitimos búsqueda por texto en cliente, placa o estado.
            const fechaStr = formatDateColombia(t.timestamp);
            if (fechaStr.toUpperCase().includes(term)) return true;
            if ((t.description || '').toUpperCase().includes(term)) return true;
            if ((t.relation_plate || '').toUpperCase().includes(term)) return true;
            if ((t.__status || '').toUpperCase().includes(term)) return true;
            return false;
        });
    } else if (!isEmpleado && movimientosSearch && movimientosSearch.trim() !== '') {
        const term = movimientosSearch.trim().toUpperCase();
        filteredTxHistory = txHistory.filter(t => {
            const fechaStr = formatDateColombia(t.timestamp);
            if (fechaStr.toUpperCase().includes(term)) return true;
            if ((t.category || '').toUpperCase().includes(term)) return true;
            if ((t.description || '').toUpperCase().includes(term)) return true;
            if ((t.relation_plate || '').toUpperCase().includes(term)) return true;
            return false;
        });
    }
    // ---------------------------

   // --- DENTRO DE renderPersonProfile(container) ---

if (isEmpleado) {
    // stats específicos para empleado / vendedor
    const totalCommissions = txHistory.reduce((s, t) => s + Number(t.amount || 0), 0);
    const totalPaid = txHistory.filter(t => t.__status === 'PAGADO' || t.__status === 'LIQUIDADA').reduce((s, t) => s + Number(t.amount || 0), 0);
    const totalPending = txHistory.filter(t => t.__status === 'PENDIENTE').reduce((s, t) => s + Number(t.amount || 0), 0);
    const lastCommissionDate = txHistory.length ? formatDateColombia(txHistory[0].timestamp) : '—';
    const uniqueClients = [...new Set(txHistory.map(t => t.description).filter(Boolean))].slice(0,5);

    // Obtener cuentas de ahorros desde el store para el selector
  

    container.innerHTML = `
        <div class="flex items-center gap-2 mb-6 pt-4 px-4">
            <button id="btn-back-search" class="p-2 rounded-full hover:bg-white hover:shadow-md text-gray-600 transition-all">
                <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path>
                </svg>
            </button>
            <div>
                <h2 class="text-2xl font-bold text-gray-800">${selectedPerson.name}</h2>
                <p class="text-sm text-gray-500">Empleado / Vendedor</p>
            </div>
        </div>

        <div class="max-w-6xl mx-auto px-4 pb-20 space-y-6">

            <div class="bg-white rounded-2xl shadow-sm p-6 flex flex-wrap gap-6 items-center border border-gray-100">
                <div class="flex items-center gap-3">
                    <div class="p-2 bg-blue-50 text-blue-600 rounded-lg"><i class="fa-solid fa-calendar-day"></i></div>
                    <div>
                        <p class="text-xs text-gray-400 uppercase">Última comisión</p>
                        <p class="font-semibold text-gray-800">${lastCommissionDate}</p>
                    </div>
                </div>

                <div class="flex items-center gap-3">
                    <div class="p-2 bg-emerald-50 text-emerald-600 rounded-lg"><i class="fa-solid fa- calculator"></i></div>
                    <div>
                        <p class="text-xs text-gray-400 uppercase">Total comisiones</p>
                        <p class="font-semibold text-gray-800">${formatCurrency(totalCommissions)}</p>
                    </div>
                </div>

                <div class="flex items-center gap-3">
                    <div class="p-2 bg-red-50 text-red-600 rounded-lg"><i class="fa-solid fa-clock-rotate-left"></i></div>
                    <div>
                        <p class="text-xs text-gray-400 uppercase">Pendiente por pagar</p>
                        <p class="font-semibold text-gray-800 text-red-600">${formatCurrency(totalPending)}</p>
                    </div>
                </div>

                <div class="flex items-center gap-3">
                    <div class="p-2 bg-green-50 text-green-600 rounded-lg"><i class="fa-solid fa-check-double"></i></div>
                    <div>
                        <p class="text-xs text-gray-400 uppercase">Pagadas</p>
                        <p class="font-semibold text-gray-800">${formatCurrency(totalPaid)}</p>
                    </div>
                </div>
            </div>

            <div class="bg-blue-600 rounded-2xl shadow-lg p-6 text-white flex flex-wrap items-center justify-between gap-4">
                <div class="flex items-center gap-4">
                    <div class="bg-blue-500 p-3 rounded-xl">
                        <i class="fa-solid fa-wallet text-2xl"></i>
                    </div>
                    <div>
                        <p class="text-blue-100 text-xs font-bold uppercase">Liquidar Pendientes</p>
                        <p class="text-2xl font-black">${formatCurrency(totalPending)}</p>
                    </div>
                </div>

                <div class="flex items-center gap-3">
                    <select id="account-select-commission" class="bg-blue-700 text-white border-none rounded-xl p-3 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-300">
                        <option value="">Seleccionar cuenta de pago...</option>
                        ${(savings || []).map(acc => `<option value="${acc.id}">${acc.name} ($${(acc.saldo || 0).toLocaleString()})</option>`).join('')}
                    </select>

                    <button onclick="liquidarComisiones('${selectedPerson.id}')" 
                        class="bg-white text-blue-600 px-6 py-3 rounded-xl font-black hover:bg-blue-50 transition-all shadow-md active:scale-95">
                        PAGAR TODO
                    </button>
                </div>
            </div>

            <div class="bg-white rounded-2xl shadow-sm p-4 border border-gray-100">
                <input
                    id="empleado-search"
                    type="text"
                    placeholder="Buscar por Fecha, Cliente, Placa o Estado..."
                    class="w-full p-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-400 outline-none"
                    value="${empleadoSearch || ''}"
                />
            </div>

            <div class="bg-white rounded-2xl shadow-sm p-6 border border-gray-100">
                <h3 class="font-bold text-gray-700 mb-4">Detalle de Comisiones</h3>
                <div class="overflow-x-auto">
                    <table class="w-full text-left">
                        <thead class="bg-gray-50 text-gray-500 text-xs uppercase">
                            <tr>
                                <th class="px-6 py-3">Fecha</th>
                                <th class="px-6 py-3">Cliente / Descripción</th>
                                <th class="px-6 py-3">Placa</th>
                                <th class="px-6 py-3">Estado</th>
                                <th class="px-6 py-3 text-right">Monto</th>
                                <th class="px-6 py-3 text-center">Acción</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-gray-100 text-sm">
                            ${filteredTxHistory.length > 0 ? filteredTxHistory.map(tx => `
                                <tr class="hover:bg-gray-50 transition-colors">
                                    <td class="px-6 py-4">
                                        <div class="font-medium text-gray-800">${formatDateColombia(tx.timestamp)}</div>
                                        <div class="text-[10px] text-gray-400">${new Date(tx.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                                    </td>
                                    <td class="px-6 py-4">
                                        <span class="block text-gray-800 font-medium">${tx.description || '-'}</span>
                                    </td>
                                    <td class="px-6 py-4">
                                        ${tx.relation_plate ? `<span class="bg-yellow-100 text-yellow-800 text-[10px] font-bold px-2 py-0.5 rounded border border-yellow-200">${tx.relation_plate}</span>` : '<span class="text-gray-300">-</span>'}
                                    </td>
                                    <td class="px-6 py-4">
                                        <span class="px-2 py-1 rounded-full text-[10px] font-bold ${tx.__status === 'PENDIENTE' ? 'bg-red-100 text-red-600' : 'bg-emerald-100 text-emerald-600'}">
                                            ${tx.__status || '—'}
                                        </span>
                                    </td>
                                    <td class="px-6 py-4 text-right font-bold text-emerald-600">
                                        + ${formatCurrency(tx.amount)}
                                    </td>
                                    <td class="px-6 py-4 text-center">
                                        ${tx.__status === 'PENDIENTE' ? `
                                            <button onclick="liquidarComisiones('${selectedPerson.id}', '${tx.raw.id}')" 
                                                class="text-blue-600 hover:bg-blue-50 p-2 rounded-lg transition-colors" title="Pagar esta comisión">
                                                 <p class="font-semibold text-gray-800">Liquidar</p>
                                            </button>
                                        ` : `
                                            <i class="fa-solid fa-circle-check text-gray-300 text-xl"></i>
                                        `}
                                    </td>
                                </tr>
                            `).join('') : `
                                <tr>
                                    <td colspan="6" class="px-6 py-10 text-center text-gray-400 italic">No hay comisiones registradas.</td>
                                </tr>
                            `}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
    // ... (El resto de los listeners de botones y buscadores se mantienen igual)
     

    } else {
        // --- HTML (DISEÑO SIN MODIFICAR) pero con BUSCADOR arriba de Movimientos Detallados ---
        container.innerHTML = `
            <div class="flex items-center gap-2 mb-6 pt-4 px-4">
                <button id="btn-back-search" class="p-2 rounded-full hover:bg-white hover:shadow-md text-gray-600 transition-all">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
                </button>
                <div>
                    <h2 class="text-2xl font-bold text-gray-800">${selectedPerson.name}</h2>
                    <p class="text-sm text-gray-500">${selectedPerson.type || 'Historial'}</p>
                </div>
            </div>

            <div class="max-w-6xl mx-auto px-4 pb-20 space-y-6">
                
                <div class="bg-white rounded-2xl shadow-sm p-6 flex flex-wrap gap-6 items-center border border-gray-100">
                    <div class="flex items-center gap-3">
                        <div class="p-2 bg-blue-50 text-blue-600 rounded-lg"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2"></path></svg></div>
                        <div>
                            <p class="text-xs text-gray-400 uppercase">Identificación</p>
                            <p class="font-semibold text-gray-800">${selectedPerson.id_number || 'No registrada'}</p>
                        </div>
                    </div>
                    <div class="flex items-center gap-3">
                        <div class="p-2 bg-green-50 text-green-600 rounded-lg"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"></path></svg></div>
                        <div>
                            <p class="text-xs text-gray-400 uppercase">Teléfono</p>
                            <p class="font-semibold text-gray-800">${selectedPerson.phone || 'No registrado'}</p>
                        </div>
                    </div>
                    <div class="flex items-center gap-3">
                        <div class="p-2 bg-orange-50 text-orange-600 rounded-lg"><svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"></path></svg></div>
                        <div>
                            <p class="text-xs text-gray-400 uppercase">Ubicación</p>
                            <p class="font-semibold text-gray-800">${selectedPerson.city || selectedPerson.address || 'No registrada'}</p>
                        </div>
                    </div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div class="bg-emerald-500 rounded-2xl p-5 text-white shadow-lg shadow-emerald-200">
                        <p class="text-emerald-100 text-xs font-bold uppercase tracking-wider">Entradas (Ingresos)</p>
                        <p class="text-3xl font-bold mt-1">${formatCurrency(totalIngresos)}</p>
                    </div>
                    <div class="bg-red-500 rounded-2xl p-5 text-white shadow-lg shadow-red-200">
                        <p class="text-red-100 text-xs font-bold uppercase tracking-wider">${isEmpleado ? 'Saldo Pendiente' : 'Salidas (Pagos)'}</p>
                        <p class="text-3xl font-bold mt-1">${formatCurrency(isEmpleado ? saldoPendiente : totalEgresos)}</p>
                    </div>
                    <div class="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
                        <p class="text-gray-400 text-xs font-bold uppercase tracking-wider">Balance Total</p>
                        <p class="text-3xl font-bold mt-1 ${balanceNeto >= 0 ? 'text-emerald-600' : 'text-red-600'}">
                            ${balanceNeto >= 0 ? '+' : ''}${formatCurrency(balanceNeto)}
                        </p>
                    </div>
                </div>

                <!-- BUSCADOR (PERSONA - Movimientos Detallados): Buscar por Fecha / Concepto / Ref -->
                <div class="bg-white rounded-2xl shadow-sm p-4 border border-gray-100">
                    <input
                        id="movimientos-search"
                        type="text"
                        placeholder="Buscar por Fecha, Concepto o Ref..."
                        class="w-full p-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-emerald-400 outline-none"
                        value="${movimientosSearch || ''}"
                    />
                </div>

                <div class="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                    <div class="bg-gray-50 px-6 py-4 border-b border-gray-100">
                        <h3 class="font-bold text-gray-700">Movimientos Detallados</h3>
                    </div>
                    <div class="overflow-x-auto">
                        <table class="w-full text-left">
                            <thead class="bg-gray-50 text-gray-500 text-xs uppercase">
                                <tr>
                                    <th class="px-6 py-3">Fecha</th>
                                    <th class="px-6 py-3">Concepto</th>
                                    <th class="px-6 py-3">Ref.</th>
                                    <th class="px-6 py-3 text-right">Monto</th>
                                </tr>
                            </thead>
                            <tbody class="divide-y divide-gray-100 text-sm">
                                ${filteredTxHistory.length > 0 ? filteredTxHistory.map(tx => `
                                    <tr class="hover:bg-gray-50 transition-colors">
                                        <td class="px-6 py-4">
                                            <div class="font-medium text-gray-800">${formatDateColombia(tx.timestamp)}</div>
                                            <div class="text-[10px] text-gray-400">${new Date(tx.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                                        </td>
                                        <td class="px-6 py-4">
                                            <span class="block text-gray-800 font-medium">${tx.category}</span>
                                            <span class="block text-gray-400 text-xs truncate max-w-[200px]">${tx.description || ''}</span>
                                        </td>
                                        <td class="px-6 py-4">
                                            ${tx.relation_plate ? `<span class="bg-yellow-100 text-yellow-800 text-[10px] font-bold px-2 py-0.5 rounded border border-yellow-200">${tx.relation_plate}</span>` : '<span class="text-gray-300">-</span>'}
                                        </td>
                                        <td class="px-6 py-4 text-right font-bold ${isEmpleado ? 'text-emerald-600' : (tx.type === 'INGRESO' ? 'text-emerald-600' : 'text-red-600')}">
                                            ${isEmpleado ? '+' : (tx.type === 'INGRESO' ? '+' : '-')} ${formatCurrency(tx.amount)}
                                        </td>
                                    </tr>
                                `).join('') : `
                                    <tr>
                                        <td colspan="4" class="px-6 py-10 text-center text-gray-400 italic">No hay transacciones registradas.</td>
                                    </tr>
                                `}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        `;

        // Botón volver: si venimos de otro módulo (previousModule), navegamos ahí; si no, mostramos directorio


        // Listener del buscador de Movimientos
        const movInput = document.getElementById('movimientos-search');
        if (movInput) {
            movInput.addEventListener('input', (e) => {
                movimientosSearch = e.target.value;
            
                renderPersonProfile(container);
            
                // 🔧 recuperar foco
                requestAnimationFrame(() => {
                    const input = document.getElementById('movimientos-search');
                    if (input) {
                        input.focus();
                        input.setSelectionRange(input.value.length, input.value.length);
                    }
                });
            });
            
        }
    }
}
// NOTA: No exportar más funciones globlales desde este módulo aparte de openHistorialPersona.
// Fin del archivo.

// --- FUNCIONES DE LIQUIDACIÓN DE COMISIONES ---

window.liquidarComisiones = async function(employeeId, commissionId = null) {
    const accountId = document.getElementById('account-select-commission')?.value;
    if (!accountId) return alert("Por favor, selecciona una cuenta de origen para el pago.");

    // 1. Obtener las comisiones a pagar
    const todasLasComisiones = getComisionesPendientes();
    let comisionesAPagar = todasLasComisiones.filter(c => 
        c.employeeId === employeeId && 
        c.status === 'PENDIENTE'
    );

    // Si es un pago individual, filtramos por ID
    if (commissionId) {
        comisionesAPagar = comisionesAPagar.filter(c => c.id === commissionId);
    }

    if (comisionesAPagar.length === 0) return alert("No hay comisiones pendientes para liquidar.");

    const totalALiquidar = comisionesAPagar.reduce((sum, c) => sum + (c.amount || 0), 0);
    const namesPockets = comisionesAPagar.map(c => c.relation_plate || 'S/P').join(', ');

    if (!confirm(`¿Confirmas la liquidación de ${comisionesAPagar.length} comisión(es) por un total de ${formatCurrency(totalALiquidar)}?`)) return;

    try {
        const { db } = await import('../config/firebase.js');
        const { writeBatch, doc, getDoc } = await import('firebase/firestore');
        const batch = writeBatch(db);

        // A. Actualizar Cuenta de Ahorros
        const accRef = doc(getCollectionRef('ahorros'), accountId);
        const accSnap = await getDoc(accRef);
        if (!accSnap.exists()) throw new Error("La cuenta seleccionada no existe.");
        const nuevoSaldo = (accSnap.data().saldo || 0) - totalALiquidar;
        const nowColombia = getColombiaNow();
        
        batch.update(accRef, { 
            saldo: nuevoSaldo, 
            updated_at: nowColombia.timestampMs,
            updatedAtColombia: nowColombia
        });

        // B. Crear Transacción en Balance (Registro de Egreso)
        const transRef = doc(getCollectionRef('transacciones'));
        const transId = transRef.id;
        const employeeName = comisionesAPagar[0].employeeName || 'Empleado';

        batch.set(transRef, {
            id: transId,
            type: 'EGRESO',
            category: 'PAGO_COMISION',
            amount: totalALiquidar,
            description: commissionId ? comisionesAPagar[0].description : `Liquidación masiva de comisiones: ${namesPockets}`,
            date: nowColombia.timestampMs,
            timestamp: nowColombia.timestampMs,
            dateColombia: nowColombia,
            createdAtColombia: nowColombia,
            updatedAtColombia: nowColombia,
            dateKey: nowColombia.dateKey,
            timeKey: nowColombia.timeKey,
            weekday: nowColombia.weekday,
            related_id: employeeId,
            related_name: employeeName,
            related_role: 'EMPLEADO',
            relation_plate: commissionId ? (comisionesAPagar[0].relation_plate || null) : 'VARIAS',
            payment_accounts: [{ accountId, name: accSnap.data().nombre || 'Cuenta', amount: totalALiquidar }],
            status: 'ACTIVA',
            // Guardamos los IDs de las comisiones para el reverso
            liquidated_commissions_ids: comisionesAPagar.map(c => c.id)
        });

        // C. Marcar Comisiones como LIQUIDADA
        comisionesAPagar.forEach(comm => {
            const cRef = doc(getCollectionRef('comisiones_pendientes'), comm.id);
            batch.update(cRef, {
                status: 'LIQUIDADA',
                payment_transaction_id: transId, // Referencia para el reverso
                paid_at: nowColombia.timestampMs,
                paidAtColombia: nowColombia
            });
        });

        await batch.commit();
        alert("✅ Liquidación completada con éxito.");
        reloadAfterLiquidacion(800);
        
    } catch (error) {
        console.error("Error liquidando:", error);
        alert("Error: " + error.message);
    }
};

// Actualizamos la función global para capturar el origen
// --- 2. openHistorialPersona GLOBAL ---
window.openHistorialPersona = function(id, role, source = null) {
    // Preparamos los datos
    window.pendingHistorial = { 
        id: id, 
        role: role || 'CLIENTE', 
        origin: source || window.currentModule 
    };
    
    // Navegamos (El router llamará a renderHistorialPersona(true) y éste leerá el pending)
    if (typeof window.navigateTo === 'function') {
        window.navigateTo('historial');
    } else {
        renderHistorialPersona(false, id, role);
    }
};

// IMPORTANTE: Borra cualquier línea de código que veas debajo de esta llave.

// 🛑 AQUÍ TERMINA EL ARCHIVO. No debe haber nada más abajo.
