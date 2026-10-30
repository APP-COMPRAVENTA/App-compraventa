// js/modules/estadisticas.js
import { inventory, transactions, getComisionesPendientes } from '../store/store.js';
import { renderHeader, formatCurrency } from '../utils/utils.js';

// Estado interno para gráficos y filtros
let inventoryChart = null;
let profitabilityChart = null;
let currentFilter = 'ALL'; // RF-060: Filtro de tiempo global

export async function renderEstadisticas() {
    const contentDiv = document.getElementById('content');
    
    // 1. Renderizamos Header
    contentDiv.innerHTML = await renderHeader('Inteligencia de Negocios', 'Métricas clave para la toma de decisiones.');

    // 2. Calculamos KPIs Globales (RF-065 y Totales)
    const kpis = calculateGlobalKPIs();

    // 3. Estructura HTML del Dashboard
    contentDiv.insertAdjacentHTML('beforeend', `
        <div class="mb-6 flex justify-end">
            <select id="dashboard-filter" class="bg-white border border-gray-300 text-gray-700 py-2 px-4 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option value="ALL">Histórico Completo</option>
                <option value="MONTH">Este Mes</option>
                <option value="WEEK">Esta Semana</option>
                <option value="TODAY">Hoy</option>
            </select>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div class="bg-white p-5 rounded-xl shadow border-l-4 border-blue-500">
                <p class="text-sm text-gray-500">Gasto Taller / vehiculos Vendida</p>
                <h3 class="text-2xl font-bold text-gray-800">${formatCurrency(kpis.avgWorkshopCost)}</h3>
                <p class="text-xs text-gray-400">Total Taller: ${formatCurrency(kpis.totalWorkshop)}</p>
            </div>
            <div class="bg-white p-5 rounded-xl shadow border-l-4 border-green-500">
                <p class="text-sm text-gray-500">Utilidad Total Real</p>
                <h3 class="text-2xl font-bold text-green-600">${formatCurrency(kpis.totalProfitReal)}</h3>
                <p class="text-xs text-gray-400">En ${kpis.soldCount} vehiculos vendidas</p>
            </div>
            <div class="bg-white p-5 rounded-xl shadow border-l-4 border-purple-500">
                <p class="text-sm text-gray-500">Comisiones Pagadas</p>
                <h3 class="text-2xl font-bold text-purple-600">${formatCurrency(kpis.totalCommissions)}</h3>
            </div>
        </div>

        <div class="grid md:grid-cols-2 gap-6 mb-6">
            <div class="bg-white p-5 rounded-xl shadow card">
                <h2 class="text-xl font-semibold mb-4 text-gray-800 border-b pb-2">🚦 Salud del Inventario (Días en Bodega)</h2>
                <div class="h-64"><canvas id="inventory-chart"></canvas></div>
            </div>
            
            <div class="bg-white p-5 rounded-xl shadow card">
                <h2 class="text-xl font-semibold mb-4 text-gray-800 border-b pb-2">📈 Rentabilidad vs Ahorro</h2>
                <div class="h-64"><canvas id="profitability-chart"></canvas></div>
            </div>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div class="bg-white p-5 rounded-xl shadow overflow-hidden">
                <h2 class="text-xl font-semibold mb-4 text-gray-800 border-b pb-2">🏆 Top Vendedores</h2>
                <div class="overflow-y-auto max-h-80">
                    <table class="w-full text-left text-sm">
                        <thead class="text-gray-500 bg-gray-50">
                            <tr>
                                <th class="pb-2 pl-2">Empleado</th>
                                <th class="pb-2 text-center">Ventas</th>
                                <th class="pb-2 text-right pr-2">Comisiones</th>
                            </tr>
                        </thead>
                        <tbody id="ranking-table-body">
                            </tbody>
                    </table>
                </div>
            </div>

            <div class="bg-white p-5 rounded-xl shadow overflow-hidden">
                <h2 class="text-xl font-semibold mb-4 text-gray-800 border-b pb-2">📉 Auditoría: Proyectado vs Real</h2>
                <div class="overflow-y-auto max-h-80">
                    <table class="w-full text-left text-sm">
                        <thead class="text-gray-500 bg-gray-50">
                            <tr>
                                <th class="pb-2 pl-2">Placa</th>
                                <th class="pb-2 text-right">Proyectada</th>
                                <th class="pb-2 text-right">Real</th>
                                <th class="pb-2 text-right pr-2">Desvío</th>
                            </tr>
                        </thead>
                        <tbody id="audit-table-body">
                            </tbody>
                    </table>
                </div>
            </div>
        </div>
    `);

    // 4. Inicializar Lógica y Eventos
    setupFilterListener();
    renderCharts();
    renderTables();
}

// ==========================================
// LÓGICA DE DATOS Y CÁLCULOS
// ==========================================

function calculateGlobalKPIs() {
    // KPI Taller (RF-065)
    const workshopTx = transactions.filter(t => 
        t.category === 'GASTO_MANTENIMIENTO' || t.category === 'REPARACION'
    );
    const totalWorkshop = workshopTx.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    const soldItems = inventory.filter(i => i.estado === 'Vendido');
    const soldCount = soldItems.length;
    const avgWorkshopCost = soldCount > 0 ? totalWorkshop / soldCount : 0;

    // Utilidad Real Total
    let totalProfitReal = 0;
    soldItems.forEach(item => {
        // Gastos asociados a esta placa
        const itemMaintenance = transactions
            .filter(t => (t.category === 'GASTO_MANTENIMIENTO' || t.category === 'REPARACION') && 
                         (t.relation_plate === item.placa))
            .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
        
        const realProfit = (Number(item.precio_venta_final) || 0) - (Number(item.precio_compra) || 0) - itemMaintenance;
        totalProfitReal += realProfit;
    });

    // Total Comisiones
    const comisiones = (typeof getComisionesPendientes === 'function') ? getComisionesPendientes() : [];
    const totalCommissions = comisiones.reduce((sum, c) => sum + (Number(c.amount) || 0), 0);

    return { avgWorkshopCost, totalWorkshop, soldCount, totalProfitReal, totalCommissions };
}

function renderCharts() {
    // Limpiar anteriores
    if (inventoryChart) inventoryChart.destroy();
    if (profitabilityChart) profitabilityChart.destroy();

    // --- CHART 1: Semáforo Inventario (RF-061) ---
    const activeInventory = inventory.filter(i => i.estado !== 'Vendido');
    const now = Date.now();
    const DAY_MS = 1000 * 60 * 60 * 24;
    
    const stats = { fresh: 0, alert: 0, old: 0 }; // 0-30, 31-60, >60

    activeInventory.forEach(item => {
        // Usamos item.timestamp como fecha de ingreso
        const days = Math.floor((now - (item.timestamp || now)) / DAY_MS);
        if (days <= 30) stats.fresh++;
        else if (days <= 60) stats.alert++;
        else stats.old++;
    });

    const ctxInv = document.getElementById('inventory-chart');
    if (ctxInv) {
        inventoryChart = new Chart(ctxInv, {
            type: 'doughnut',
            data: {
                labels: ['Fresco (<30d)', 'Alerta (30-60d)', 'Hueso (>60d)'],
                datasets: [{
                    data: [stats.fresh, stats.alert, stats.old],
                    backgroundColor: ['#10b981', '#f59e0b', '#ef4444'],
                    hoverOffset: 4
                }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
        });
    }

    // --- CHART 2: Rentabilidad Mensual ---
    // Agrupamos transacciones por mes
    const monthlyData = transactions.reduce((acc, t) => {
        if (t.status === 'ANULADA') return acc;
        // Aplicar filtro de fecha global si es necesario (para simplificar, el gráfico muestra histórico, el filtro aplica a tablas)
        
        const date = new Date(t.date || t.createdAt); // Fallback de fecha
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        
        if (!acc[key]) acc[key] = { net: 0, save: 0 };
        
        if (t.type === 'INGRESO') acc[key].net += Number(t.amount);
        else if (t.type === 'EGRESO' && t.category !== 'GASTO_AHORRO') acc[key].net -= Number(t.amount);
        else if (t.category === 'GASTO_AHORRO') acc[key].save += Number(t.amount);
        
        return acc;
    }, {});

    const keys = Object.keys(monthlyData).sort();
    const ctxProf = document.getElementById('profitability-chart');
    if (ctxProf) {
        profitabilityChart = new Chart(ctxProf, {
            type: 'bar',
            data: {
                labels: keys.map(k => {
                    const [y, m] = k.split('-');
                    const date = new Date(y, m - 1);
                    return date.toLocaleDateString('es-CO', { month: 'short', year: '2-digit' });
                }),
                datasets: [
                    { label: 'Utilidad Neta', data: keys.map(k => monthlyData[k].net), backgroundColor: '#3b82f6' },
                    { label: 'Ahorro', data: keys.map(k => monthlyData[k].save), backgroundColor: '#fcd34d' }
                ]
            },
            options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
        });
    }
}

function renderTables() {
    // --- TABLA 1: Ranking Empleados (RF-063) ---
    const comisiones = (typeof getComisionesPendientes === 'function') ? getComisionesPendientes() : [];
    const rankingMap = {};

    comisiones.forEach(c => {
        // Filtrar por fecha si aplica currentFilter
        if (!passDateFilter(c.createdAt)) return;

        const name = c.employeeName || c.vendedorName || 'Desconocido';
        if (!rankingMap[name]) rankingMap[name] = { name, count: 0, total: 0 };
        rankingMap[name].count++;
        rankingMap[name].total += (Number(c.amount) || 0);
    });

    const rankingList = Object.values(rankingMap).sort((a, b) => b.count - a.count);
    
    const rankingBody = document.getElementById('ranking-table-body');
    rankingBody.innerHTML = rankingList.map((emp, i) => `
        <tr class="border-b hover:bg-gray-50">
            <td class="py-2 pl-2 flex items-center gap-2">
                <span class="font-bold text-gray-400">#${i + 1}</span> ${emp.name}
            </td>
            <td class="text-center font-bold">${emp.count}</td>
            <td class="text-right pr-2 text-green-600">${formatCurrency(emp.total)}</td>
        </tr>
    `).join('') || '<tr><td colspan="3" class="text-center py-4 text-gray-400">Sin datos en este periodo</td></tr>';


    // --- TABLA 2: Auditoría Rentabilidad (RF-062) ---
    const soldItems = inventory.filter(i => i.estado === 'Vendido');
    const auditList = soldItems.map(item => {
         // Filtrar por fecha de venta si aplica currentFilter
         if (!passDateFilter(item.fecha_venta || item.timestamp)) return null;

        // Gastos Taller x Placa
        const maintenance = transactions
            .filter(t => (t.category === 'GASTO_MANTENIMIENTO' || t.category === 'REPARACION') && t.relation_plate === item.placa)
            .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

        const proyectada = (Number(item.ganancia_potencial) || (Number(item.precio_venta) - Number(item.precio_compra)));
        const real = (Number(item.precio_venta_final) || 0) - (Number(item.precio_compra) || 0) - maintenance;
        
        return {
            placa: item.placa,
            proyectada,
            real,
            diff: real - proyectada
        };
    }).filter(x => x !== null).reverse().slice(0, 20); // Últimas 20 ventas

    const auditBody = document.getElementById('audit-table-body');
    auditBody.innerHTML = auditList.map(row => `
        <tr class="border-b hover:bg-gray-50">
            <td class="py-2 pl-2 font-mono font-bold text-gray-700">${row.placa}</td>
            <td class="text-right text-blue-600">${formatCurrency(row.proyectada)}</td>
            <td class="text-right text-green-600 font-bold">${formatCurrency(row.real)}</td>
            <td class="text-right pr-2 ${row.diff < 0 ? 'text-red-500' : 'text-gray-400'}">
                ${formatCurrency(row.diff)}
            </td>
        </tr>
    `).join('') || '<tr><td colspan="4" class="text-center py-4 text-gray-400">Sin ventas en este periodo</td></tr>';
}

// Helper para Filtro de Fechas (RF-060)
function setupFilterListener() {
    const select = document.getElementById('dashboard-filter');
    if(select) {
        select.value = currentFilter;
        select.addEventListener('change', (e) => {
            currentFilter = e.target.value;
            renderTables(); // Re-renderizamos tablas, los gráficos podrían quedarse históricos o filtrarse también
        });
    }
}

function passDateFilter(dateVal) {
    if (currentFilter === 'ALL') return true;
    if (!dateVal) return false;

    const date = new Date(dateVal);
    const now = new Date();
    const startOfDay = new Date(now.setHours(0,0,0,0));
    
    if (currentFilter === 'TODAY') return date >= startOfDay;
    
    if (currentFilter === 'WEEK') {
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay());
        return date >= startOfWeek;
    }
    
    if (currentFilter === 'MONTH') {
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        return date >= startOfMonth;
    }
    return true;
}