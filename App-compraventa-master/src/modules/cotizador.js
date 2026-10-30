// src/modules/cotizador.js
// Módulo Cotizador V2 - Redesign "Modern Indigo" (MODIFICADO: soporte refYear, profitType y nuevo motor de cálculo)
// Dependencias: getCollectionRef, addDoc, deleteDoc, doc (services/listeners.js), formatCurrency (utils/utils.js)


import { getCollectionRef } from '../services/listeners.js';
import { addDoc, deleteDoc, doc, updateDoc, getDocs } from 'firebase/firestore';

import { formatCurrency, renderHeader } from '../utils/utils.js';
import { cotizadorCatalogo, cotizadorReglas, cotizadorDanos, setCotizadorReglas } from '../store/store.js';

// ----------------- Estado local -----------------

let selectedMotoId = '';
let selectedYear = new Date().getFullYear();
let selectedCityId = '';

let manualDiscounts = {
  soat: false,
  tecno: false,
  soatValue: 650000,
  tecnoValue: 180000,
  traspasoValue: 0,
  extras: []
};

// si no existe el array de ids de daños seleccionados, inicializar
manualDiscounts.danos = manualDiscounts.danos || [];

// Exponer en global para que los handlers inline (onclick/onchange en el HTML) funcionen
window.manualDiscounts = manualDiscounts;



// Default tramos ahora incluyen profitType
let tempTramos = [{ min: 1, max: 5, loss: 500000, profit: 1000000, profitType: 'FIXED' }]; 


// Estado edición de línea en catálogo
let editingLineId = null;
let editingLineDraft = {}; // objeto temporal que guarda los cambios mientras editas


// Exponer tempTramos al scope global para que los handlers inline funcionen
window.tempTramos = tempTramos;
function syncTempTramos() { window.tempTramos = tempTramos; }
window.syncTempTramos = syncTempTramos;

let activeTab = 'cotizador'; // 'cotizador' | 'catalogo' | 'reglas'

// ----------------- Export Principal -----------------
export async function renderCotizadorCompra() {
  const content = document.getElementById('content');
  if (!content) return;

  // 1. Inyección de Estilos Globales y Fuentes
  const styles = `
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=Urbanist:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
    <style>
      body { font-family: 'Urbanist', sans-serif; background-color: #F8FAFC; color: #1E293B; }
      .input-visual { width: 100%; padding: 0.6rem 1rem; border: 1px solid #CBD5E1; border-radius: 0.5rem; outline: none; font-weight: 600; background-color: white; transition: all 0.2s ease; font-size: 0.95rem; color: #334155; }
      .input-visual:focus { border-color: #7C3AED; box-shadow: 0 0 0 4px rgba(124, 58, 237, 0.1); }
      .input-visual::placeholder { color: #94A3B8; font-weight: 400; }
      .card-modern { background: white; border-radius: 1rem; border: 1px solid #E2E8F0; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.03), 0 4px 6px -2px rgba(0, 0, 0, 0.02);  }
      .btn-primary { background: linear-gradient(135deg, #6366F1 0%, #4F46E5 100%); color: white; font-weight: 700; border-radius: 0.75rem; transition: all 0.2s; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.25); }
      .btn-primary:active { transform: translateY(0); }
      .nav-pill { padding: 0.6rem 1.5rem; border-radius: 999px; font-weight: 600; font-size: 0.9rem; cursor: pointer; transition: all 0.2s; color: #64748B; }
      .nav-pill:hover { background-color: #F1F5F9; color: #334155; }
      .nav-pill.active { background-color: #1E293B; color: white; box-shadow: 0 4px 12px rgba(30, 41, 59, 0.2); }
      .tramo-header { font-size: 0.65rem; text-transform: uppercase; font-weight: 800; color: #64748B; letter-spacing: 0.05em; background-color: #F8FAFC; border-radius: 0.5rem; padding: 0.5rem; }
      .toggle-checkbox:checked { right: 0; border-color: #10B981; }
      .toggle-checkbox:checked + .toggle-label { background-color: #10B981; }
      ::-webkit-scrollbar { width: 6px; height: 6px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 3px; }
      ::-webkit-scrollbar-thumb:hover { background: #94A3B8; }
    </style>
  `;

  // Header Simple (Opcional si usas renderHeader externo)
  const headerHtml = (typeof renderHeader === 'function')
  ? await renderHeader('MT Cotizador', 'Gestión de mercado y cálculo inteligente.')
  : `<div class="mb-6"><h1 class="text-2xl font-bold">MT Cotizador V2</h1></div>`;
  content.innerHTML = `
    ${styles}
    ${headerHtml}
    
    <div class="max-w-9xl mx-auto p-4 md:p-8">
      <div class="flex flex-col md:flex-row justify-between items-end mb-8 gap-4">
        <div>
          <h1 class="text-3xl md:text-4xl font-black text-slate-800 tracking-tight">Cotizador Inteligente</h1>
          <p class="text-slate-500 font-medium mt-1">Gestión de mercado, reglas de depreciación y cálculo de compra.</p>
        </div>
        
        <div class="flex bg-white p-1.5 rounded-full border border-slate-200 shadow-sm">
          <div id="tab-cotizador" class="nav-pill ${activeTab === 'cotizador' ? 'active' : ''}">
            <i class="fa-solid fa-calculator mr-2"></i>Cotizador
          </div>
          <div id="tab-catalogo" class="nav-pill ${activeTab === 'catalogo' ? 'active' : ''}">
            <i class="fa-solid fa-book-open mr-2"></i>Catálogo
          </div>
          <div id="tab-reglas" class="nav-pill ${activeTab === 'reglas' ? 'active' : ''}">
            <i class="fa-solid fa-sliders mr-2"></i>Reglas
          </div>
        </div>
      </div>

      <div id="cotizador-root" class="animate-fade-in">
        ${renderCotizadorMainHTML()}
      </div>
    </div>
  `;

  // Listeners de Tabs
  document.getElementById('tab-cotizador').addEventListener('click', () => { activeTab = 'cotizador'; refreshCotizadorRoot(); updateActiveTabUI('tab-cotizador'); });
  document.getElementById('tab-catalogo').addEventListener('click', () => { activeTab = 'catalogo'; refreshCotizadorRoot(); updateActiveTabUI('tab-catalogo'); });
  document.getElementById('tab-reglas').addEventListener('click', () => { activeTab = 'reglas'; refreshCotizadorRoot(); updateActiveTabUI('tab-reglas'); });

  setTimeout(() => {
    enableSearchResultsScroll();
  }, 100);
  // Init logic
  initViewListeners();
  renderTramosUI(); // Si arranca en reglas
  renderReglasList(); // <<-- agrega esta línea
  if (typeof window.loadDamages === 'function') await window.loadDamages();
  renderExtrasList(); // Si arranca en cotizador
  recalculateOffer(); // Si arranca en cotizador


}

// ----------------- Helpers UI -----------------

function updateActiveTabUI(activeId) {
  document.querySelectorAll('.nav-pill').forEach(el => el.classList.remove('active'));
  document.getElementById(activeId).classList.add('active');
}

function refreshCotizadorRoot() {
  const root = document.getElementById('cotizador-root');
  if (!root) return;
  root.innerHTML = renderCotizadorMainHTML();
  initViewListeners();
  renderTramosUI(); // Si arranca en reglas
  renderReglasList();
  if (typeof window.loadDamages === 'function') window.loadDamages();
  renderExtrasList(); // Si arranca en cotizador
  recalculateOffer(); // Si arranca en cotizador

}

function renderCotizadorMainHTML() {
  if (activeTab === 'catalogo') return renderCatalogoHTML();
  if (activeTab === 'reglas') return renderReglasHTML();
  return renderCotizadorHTML();
}

/* =========================================
   1. VISTA: REGLAS (Diseño Mejorado)
   ========================================= */
// ----------------- renderReglasHTML (con col-spans: form = 8, lista = 4) -----------------
function renderReglasHTML() {
  return `
    <div class="flex justify-center">
      <div class="w-full max-w-8xl">
        <div class="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">

          <!-- COLUMNA IZQUIERDA: FORMULARIO (card) -->
          <div class="lg:col-span-8">
            <section class="card-modern border-l-4 border-indigo-600">
              <div class="p-6 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                <div class="flex items-center gap-4">
                  <div class="w-12 h-12 rounded-xl bg-white text-indigo-600 flex items-center justify-center shadow-sm text-xl border border-indigo-100">
                    <i class="fa-solid fa-sliders"></i>
                  </div>
                  <div>
                    <h2 class="text-xl font-bold text-slate-800">Configuración de Reglas Maestras</h2>
                    <p class="text-xs text-slate-500 font-medium">Define la curva de depreciación y márgenes de ganancia automáticos.</p>
                  </div>
                </div>
              </div>

              <div class="p-6 md:p-8">
                <div class="mb-8 grid grid-cols-1 md:grid-cols-12 gap-6 p-6 bg-white rounded-2xl border border-slate-200 shadow-sm">
                  <div class="md:col-span-5">
                    <label class="block text-[10px] font-bold text-slate-400 uppercase mb-2 tracking-wider">Nombre de la Plantilla</label>
                    <input id="rule-name" type="text" class="input-visual" placeholder="Ej: Motos Comerciales (Media)">
                  </div>

                  <div class="md:col-span-7 flex gap-6">
                    <div class="w-1/2 relative group">
                      <label class="block text-[10px] font-bold text-slate-400 uppercase mb-2 tracking-wider">Salida Almacén (Año 0) - Pérdida (%)</label>
                      <input id="rule-exit-pct" type="number" class="input-visual pr-8 text-red-500 font-bold" value="18">
                      <span class="absolute right-4 top-10 text-xs text-red-300 font-bold">%</span>
                    </div>

                    <div class="w-1/2">
                      <label class="block text-[10px] font-bold text-slate-400 uppercase mb-2 tracking-wider">Ganancia Año 0</label>
                      <div class="flex gap-2">
                        <select id="rule-exit-profit-type" class="input-visual w-28 text-sm">
                          <option value="FIXED">$ (Pesos)</option>
                          <option value="PERCENT"> % (Porcentaje)</option>
                        </select>
                        <input id="rule-exit-profit-value" type="number" class="input-visual" placeholder="Ej: 1500000 o 15">
                      </div>
                      <p class="text-[11px] text-slate-400 mt-1">Si es % se aplicará sobre el <strong>Precio de Mercado</strong> (Precio Nuevo - Depreciación Acumulada).</p>
                    </div>
                  </div>
                </div>

                <div class="mb-6 p-6 bg-white rounded-2xl border border-slate-200">
                  <div class="flex justify-between items-center mb-3">
                    <h3 class="text-sm font-bold text-slate-700 uppercase tracking-wide">Tramos de Antigüedad</h3>
                  </div>

                  <div class="p-5 bg-white space-y-3" id="tramos-list-container"></div>

                  <div class="bg-indigo-50/50 p-3 text-center border-t border-slate-200 flex flex-col md:flex-row justify-center gap-2 md:gap-8 mt-4">
                    <p class="text-[10px] text-indigo-400 font-medium"><i class="fa-solid fa-calculator mr-1"></i> <strong>Depreciación:</strong> Acumulativa (se suma año a año).</p>
                    <p class="text-[10px] text-indigo-400 font-medium"><i class="fa-solid fa-sack-dollar mr-1"></i> <strong>Ganancia:</strong> Única (se toma el valor del rango actual).</p>
                  </div>
                </div>

                <div class="grid md:grid-cols-3 gap-4">
                  <div>
                    <label class="block text-[10px] font-bold text-slate-400 uppercase mb-2 tracking-wider">Ganancia mínima (fallback)</label>
                    <div class="flex gap-2">
                      <select id="rule-min-profit-type" class="input-visual w-28 text-sm">
                        <option value="FIXED">$ (Pesos)</option>
                        <option value="PERCENT">% (Porcentaje)</option>
                      </select>
                      <input id="rule-min-profit" type="number" class="input-visual" placeholder="Ej: 800000 o 8">
                    </div>
                    <p class="text-[11px] text-slate-400 mt-1">Se usa si no existe tramo aplicable o ganancia inválida.</p>
                  </div>
                </div>

                <div class="flex justify-end mt-6">
                  <button id="btn-save-rule" class="w-full md:w-auto px-8 btn-primary py-3.5 flex items-center justify-center gap-2 text-sm uppercase tracking-wide">
                    <i class="fa-solid fa-floppy-disk"></i> Guardar Plantilla
                  </button>
                </div>
              </div>
            </section>
          </div>

          <!-- COLUMNA DERECHA: LISTA DE REGLAS (card independiente, más pequeña) -->
          <div class="lg:col-span-4">
            <section class="card-modern border-l-4 border-emerald-600">
              <div class="p-6 bg-slate-50 border-b border-slate-100 flex items-center gap-3">
                <div class="w-10 h-10 rounded-xl bg-white text-emerald-600 flex items-center justify-center shadow-sm text-lg border border-emerald-100">
                  <i class="fa-solid fa-list"></i>
                </div>
                <div>
                  <h3 class="text-lg font-bold text-slate-800">Reglas creadas</h3>
                  <p class="text-xs text-slate-500">Edita o elimina tus plantillas</p>
                </div>
              </div>

              <div class="p-6">
                <div id="reglas-list-panel" class="space-y-3 max-h-[70vh] overflow-y-auto"></div>
              </div>
            </section>
          </div>

        </div>
      </div>
    </div>
  `;
}

/* =========================================
   2. VISTA: CATÁLOGO (Diseño Mejorado)
   ========================================= */
   function renderCatalogoHTML() {
    const byBrand = groupByBrand(cotizadorCatalogo);
    const selectedBrand = window._cotizador_selectedBrand || Object.keys(byBrand)[0] || '';
    const linesForBrand = byBrand[selectedBrand] || [];
    const rulesOptions = `<option value="">-- Sin regla --</option>` + cotizadorReglas.map(r => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('');
  
    // Sidebar Marcas
    const brandsHtml = Object.keys(byBrand).map(brand => {
      const active = brand === selectedBrand;
      return `
        <div onclick="window.selectBrand('${escapeHtml(brand)}')" 
             class="group flex justify-between items-center px-4 py-3 rounded-xl cursor-pointer transition-all duration-200 mb-1 border border-transparent
             ${active ? 'bg-slate-800 text-white shadow-md' : 'hover:bg-white hover:border-slate-200 text-slate-600'}">
          <span class="font-bold text-sm tracking-wide">${escapeHtml(brand)}</span>
          <div class="flex items-center gap-3">
            <span class="text-[10px] px-2 py-0.5 rounded-full font-bold ${active ? 'bg-slate-600 text-slate-200' : 'bg-slate-100 text-slate-400'}">${byBrand[brand].length}</span>
            ${active ? `<button onclick="event.stopPropagation(); window.deleteBrand('${escapeHtml(brand)}')" class="text-slate-400 hover:text-red-400 transition"><i class="fa-solid fa-trash text-xs"></i></button>` : ''}
          </div>
        </div>
      `;
    }).join('');
  
    // Tabla Líneas (ahora incluye columna Modelo Ref y botón Editar)
    const linesRows = linesForBrand.map(item => {
      const ruleName = cotizadorReglas.find(r => r.id === item.ruleId)?.name || '<span class="text-slate-300 italic">Manual</span>';
  
      // Si esta fila está en modo edición
      if (editingLineId === item.id) {
        // Si draft está vacío, inicializarlo con los valores actuales
        if (!editingLineDraft || editingLineDraft.id !== item.id) {
          editingLineDraft = { ...item }; // copia por valor
          editingLineDraft.id = item.id;
        }
  
        const ruleSelectHtml = `<select id="edit-rule-${item.id}" class="input-visual text-sm" onchange="onEditField('${item.id}', 'ruleId', this)">${rulesOptions}</select>`;
  
        return `
          <tr class="bg-slate-50 transition border-b border-slate-50 last:border-0 group">
            <td class="p-4">
              <input type="text" value="${escapeHtml(editingLineDraft.name || '')}" class="input-visual text-sm font-bold" onchange="onEditField('${item.id}', 'name', this)">
            </td>
            <td class="p-4 text-slate-500 text-sm font-medium">
              <input type="number" value="${Number(editingLineDraft.cc || 0)}" class="input-visual text-sm" onchange="onEditField('${item.id}', 'cc', this)">
            </td>
            <td class="p-4">
              <div class="flex items-center bg-white border border-slate-200 rounded-lg px-2 py-1 w-40">
                <span class="text-slate-400 text-xs mr-1">$</span>
                <input type="number" value="${Number(editingLineDraft.price || 0)}" class="w-full outline-none text-sm font-bold text-slate-700" onchange="onEditField('${item.id}', 'price', this)">
              </div>
            </td>
  
            <td class="p-4 text-xs text-slate-500 truncate max-w-[150px]" title="${escapeHtml(ruleName)}">
              <select id="edit-rule-${item.id}" class="input-visual text-sm" onchange="onEditField('${item.id}', 'ruleId', this)">
                ${`<option value="">-- Sin regla --</option>` + cotizadorReglas.map(r => `<option value="${r.id}" ${ (editingLineDraft.ruleId===r.id) ? 'selected' : '' }>${escapeHtml(r.name)}</option>`).join('')}
              </select>
            </td>
  
            <td class="p-4 text-sm">
              <div class="flex items-center gap-2">
                <div class="w-28">
                  <label class="text-[10px] text-slate-400 block">Modelo Ref</label>
                  <input type="number" value="${Number(editingLineDraft.refYear || 0)}" class="input-visual text-sm" onchange="onEditField('${item.id}', 'refYear', this)">
                </div>
                <div class="flex gap-2">
                  <button class="px-3 py-1 bg-emerald-500 text-white rounded-md text-sm" onclick="saveLineEdit('${item.id}')">
                    <i class="fa-solid fa-floppy-disk mr-2"></i>Guardar
                  </button>
                  <button class="px-3 py-1 bg-slate-200 text-slate-700 rounded-md text-sm" onclick="cancelEditLine('${item.id}')">
                    Cancelar
                  </button>
                </div>
              </div>
            </td>
          </tr>
        `;
      }
  
      // modo lectura
      return `
        <tr class="hover:bg-slate-50 transition border-b border-slate-50 last:border-0 group">
          <td class="p-4">
            <div class="font-bold text-slate-700">${escapeHtml(item.name)}</div>
          </td>
          <td class="p-4 text-slate-500 text-sm font-medium">${item.cc ? `${item.cc} cc` : '—'}</td>
          <td class="p-4">
            <div class="flex items-center bg-white border border-slate-200 rounded-lg px-2 py-1 w-32">
              <span class="text-slate-400 text-xs mr-1">$</span>
              <input type="number" value="${Number(item.price || 0)}" 
                class="w-full outline-none text-sm font-bold text-slate-700"
                onchange="window.updateLinePrice('${item.id}', this.value)">
            </div>
          </td>
          <td class="p-4 text-xs text-slate-500 truncate max-w-[150px]" title="${ruleName}">${ruleName}</td>
          <td class="p-4 text-sm font-bold text-slate-600">
  ${Number(item.refYear || '—')}
</td>
          <td class="p-4 text-right">
            <div class="flex items-center justify-end gap-2">
              <button class="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-indigo-50 transition" onclick="startEditLine('${item.id}')">
                <i class="fa-solid fa-pen-to-square"></i>
              </button>
              <button class="w-8 h-8 rounded-full flex items-center justify-center text-slate-300 hover:text-red-500 hover:bg-red-50 transition" onclick="window.deleteLine('${item.id}')">
                <i class="fa-solid fa-trash-can"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  
    return `
  <div class="flex flex-col lg:flex-row gap-6 h-auto lg:h-[calc(100vh-200px)] min-h-[600px]">
    <aside class="w-full lg:w-1/4 flex flex-col gap-4">
      <div class="card-modern p-1 flex-1 flex flex-col bg-slate-50/50">
        <div class="p-4 border-b border-slate-200/60">
          <h3 class="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Marcas</h3>
          <div class="flex gap-2">
            <input id="new-brand-input" type="text" placeholder="NUEVA MARCA" class="input-visual text-xs uppercase font-bold bg-white w-full">
            <button id="btn-add-brand" class="bg-indigo-600 text-white w-12 rounded-lg hover:bg-indigo-700 transition shadow-sm flex items-center justify-center shrink-0"><i class="fa-solid fa-plus"></i></button>
          </div>
        </div>
        <div class="flex-1 overflow-y-auto p-2 space-y-1 max-h-[200px] lg:max-h-none">
          ${brandsHtml || '<div class="p-4 text-center text-slate-400 text-sm">Sin marcas</div>'}
        </div>
      </div>
    </aside>

    <main class="w-full lg:w-3/4 flex flex-col gap-4">
      <div class="card-modern p-4 lg:p-5 flex flex-col gap-4 bg-white">
        <div>
          <p class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Catálogo de</p>
          <h2 class="text-2xl lg:text-3xl font-black text-slate-800">${escapeHtml(selectedBrand || 'Seleccione Marca')}</h2>
        </div>

        <div class="grid grid-cols-2 md:grid-cols-4 lg:flex lg:items-end gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
          
          <div class="col-span-2 lg:flex-grow">
            <label class="block text-[9px] font-bold text-slate-400 uppercase mb-1 pl-1">Referencia</label>
            <input id="new-line-name" placeholder="Ej: NMAX 155" class="input-visual w-full py-2.5 text-xs uppercase font-bold">
          </div>

          <div class="col-span-1 lg:w-20">
            <label class="block text-[9px] font-bold text-slate-400 uppercase mb-1 pl-1">CC</label>
            <input id="new-line-cc" type="number" placeholder="155" class="input-visual w-full py-2.5 text-xs text-center">
          </div>

          <div class="col-span-1 lg:w-24">
            <label class="block text-[9px] font-bold text-slate-400 uppercase mb-1 pl-1">Modelo Ref</label>
            <input id="new-line-refyear" type="number" placeholder="2027" class="input-visual w-full py-2.5 text-xs text-center font-bold">
          </div>

          <div class="col-span-1 lg:w-32">
            <label class="block text-[9px] font-bold text-slate-400 uppercase mb-1 pl-1">Precio Nuevo</label>
            <input id="new-line-price" type="number" placeholder="$" class="input-visual w-full py-2.5 text-xs font-bold text-emerald-600">
          </div>

          <div class="col-span-1 lg:w-40">
            <label class="block text-[9px] font-bold text-slate-400 uppercase mb-1 pl-1">Regla</label>
            <select id="new-line-rule" class="input-visual w-full py-2.5 text-xs p-1">${rulesOptions}</select>
          </div>

          <div class="col-span-2 lg:w-auto">
            <button id="btn-add-line" class="w-full bg-emerald-500 text-white rounded-lg px-4 py-2.5 h-[42px] lg:h-[38px] hover:bg-emerald-600 transition shadow-md font-bold flex items-center justify-center gap-2">
              <i class="fa-solid fa-plus"></i>
              <span class="lg:hidden text-xs uppercase">Agregar Referencia</span>
            </button>
          </div>
        </div>
      </div>

      <div class="card-modern flex-1 overflow-hidden flex flex-col">
        <div class="overflow-x-auto overflow-y-auto flex-1">
          <table class="w-full text-left border-collapse min-w-[600px]">
            <thead class="sticky top-0 bg-white z-10 shadow-sm">
              <tr class="text-[10px] font-bold text-slate-400 uppercase tracking-widest border-b border-slate-200">
                <th class="p-4 bg-slate-50/80 backdrop-blur">Línea / Referencia</th>
                <th class="p-4 bg-slate-50/80 backdrop-blur">Cilindraje</th>
                <th class="p-4 bg-slate-50/80 backdrop-blur">Precio Almacén</th>
                <th class="p-4 bg-slate-50/80 backdrop-blur">Regla</th>
                <th class="p-4 bg-slate-50/80 backdrop-blur">Modelo Ref</th>
                <th class="p-4 bg-slate-50/80 backdrop-blur text-right">Acción</th>
              </tr>
            </thead>
            <tbody id="lines-tbody" class="divide-y divide-slate-50">
              ${linesRows || '<tr><td colspan="6" class="p-8 text-center text-slate-400">Selecciona una marca y agrega referencias.</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  </div>
`;
  }
  
  
  

/* =========================================
   3. VISTA: COTIZADOR (Calculadora Final)
   ========================================= */
   function renderCotizadorHTML() {
    const currentMoto = cotizadorCatalogo.find(m => m.id === selectedMotoId);
    const currentMotoName = currentMoto ? currentMoto.name : '';
  
    // Función interna rápida para evitar errores de escape
    const esc = (str) => String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[m]));
  
    // Toggle Switch Component HTML helper
    const renderToggle = (id, label, priceLabel, checked) => `
      <div class="flex justify-between items-center p-3 border border-slate-100 rounded-xl bg-slate-50/50 hover:bg-slate-50 transition">
        <div class="flex items-center gap-3">
          <div class="relative inline-block w-10 mr-2 align-middle select-none transition duration-200 ease-in">
              <input type="checkbox" name="${id}" id="${id}" class="toggle-checkbox absolute block w-5 h-5 rounded-full bg-white border-4 appearance-none cursor-pointer border-slate-300 transition-all duration-300" ${checked ? 'checked' : ''} onchange="window.updateCalculation()"/>
              <label for="${id}" class="toggle-label block overflow-hidden h-5 rounded-full bg-slate-300 cursor-pointer transition-colors duration-300"></label>
          </div>
          <span class="text-sm font-bold text-slate-700">${label}</span>
        </div>
        <div class="text-xs font-bold text-red-500 bg-red-50 px-2 py-1 rounded">- ${priceLabel}</div>
      </div>
    `;
  
    return `
      <div class="grid lg:grid-cols-12 gap-6">
        <div class="lg:col-span-7 space-y-6">
          <div class="card-modern p-6">
            <h3 class="text-sm font-bold text-slate-800 uppercase tracking-wide mb-4 flex items-center gap-2">
              <span class="w-6 h-6 rounded bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs">1</span>
              Datos del Vehículo
            </h3>
            
            <div class="space-y-4">
              <div>
                <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1 ml-1">Buscar Vehículo (Referencia o Marca)</label>
                <div class="relative" id="moto-search-container">
                  <i class="fa-solid fa-motorcycle absolute left-4 top-3.5 text-slate-400"></i>
                 <input
  type="text"
  id="input-moto-search"
  class="input-visual !pl-14 h-12"
  placeholder="Ej: NMAX, Pulsar, Yamaha."
  value="${esc(currentMotoName)}"
  autocomplete="off"
/>

                  <input type="hidden" id="select-moto" value="${selectedMotoId}">
                 <div id="moto-search-results"
  class="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl max-h-64 overflow-y-auto hidden overscroll-contain"
  style="-webkit-overflow-scrolling: touch;">
</div>

                </div>
                <div class="flex justify-between items-center mt-2 px-1">
                   <div class="text-[10px] text-slate-400">Regla aplicada: <span id="applied-rule" class="font-bold text-indigo-500">—</span></div>
                </div>
              </div>
  
              <div class="grid grid-cols-2 gap-4">
                <div>
                  <label class="block text-[10px] font-bold text-slate-400 uppercase mb-1 ml-1">Modelo (Año)</label>
                  <input id="input-year" type="number" class="input-visual" value="${selectedYear}" onchange="window.updateCalculation()">
                  <p class="text-[11px] text-slate-400 mt-1">La antigüedad se calcula como: <strong>refYear (línea) - Modelo (Año)</strong></p>
                </div>
              </div>
            </div>
          </div>
  
          <div class="card-modern p-6">
            <h3 class="text-sm font-bold text-slate-800 uppercase tracking-wide mb-4 flex items-center gap-2">
              <span class="w-6 h-6 rounded bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs">2</span>
              Estado y Documentación
            </h3>
  
            <!-- Bloque editable: SOAT / Tecno / Traspaso -->
            <div class="space-y-3 mb-4">
  
              <!-- SOAT -->
          <div class="flex items-center gap-3">
  <label class="relative inline-flex items-center cursor-pointer">
    <input type="checkbox" id="chk-soat" class="sr-only peer"
      ${manualDiscounts.soat ? 'checked' : ''}
      onchange="manualDiscounts.soat=this.checked; window.updateCalculation()">
    <div class="w-11 h-6 bg-slate-300 rounded-full peer peer-checked:bg-indigo-600 transition"></div>
    <div class="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full transition
                peer-checked:translate-x-5"></div>
  </label>

  <span class="w-28 text-sm">SOAT Vencido</span>

  <input id="input-soat-value" type="number"
    class="input-visual w-32 text-right"
    value="${manualDiscounts.soatValue || 650000}"
    oninput="manualDiscounts.soatValue=Number(this.value); window.updateCalculation()">
</div>

  
              <!-- TECNO -->
            <div class="flex items-center gap-3">
  <label class="relative inline-flex items-center cursor-pointer">
    <input type="checkbox" id="chk-tecno" class="sr-only peer"
      ${manualDiscounts.tecno ? 'checked' : ''}
      onchange="manualDiscounts.tecno=this.checked; window.updateCalculation()">
    <div class="w-11 h-6 bg-slate-300 rounded-full peer peer-checked:bg-indigo-600 transition"></div>
    <div class="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full transition
                peer-checked:translate-x-5"></div>
  </label>

  <span class="w-28 text-sm">Tecno Vencida</span>

  <input id="input-tecno-value" type="number"
    class="input-visual w-32 text-right"
    value="${manualDiscounts.tecnoValue || 180000}"
    oninput="manualDiscounts.tecnoValue=Number(this.value); window.updateCalculation()">
</div>

  
              <!-- TRASPASO -->
              <div class="flex items-center gap-3">
                <span class="w-28 text-sm font-medium">Traspaso</span>
                <input id="input-traspaso-value" type="number" class="input-visual w-32 text-right" value="${manualDiscounts.traspasoValue || 0}" oninput="manualDiscounts.traspasoValue=Number(this.value); window.updateCalculation()">
              </div>
  
            </div>
  
            <!-- Otros Descuentos (Daños, Multas) - simple: input + boton Agregar -->
         <div class="border-t border-slate-100 pt-4">
              <label class="block text-[10px] font-bold text-slate-400 uppercase mb-2 ml-1">Otros Descuentos (Daños, Multas)</label>
              
              <div class="mb-3 relative">
                <i class="fa-solid fa-magnifying-glass absolute left-3 top-3.5 text-slate-400"></i>
                <input id="search-danos" class="input-visual !pl-10 !pr-10" placeholder="Buscar daño existente..." oninput="window.renderExtrasList()"/>
                <button onclick="document.getElementById('search-danos').value=''; window.renderExtrasList()" class="absolute right-3 top-2.5 w-6 h-6 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-700 flex items-center justify-center transition" title="Limpiar búsqueda">
                  <i class="fa-solid fa-xmark"></i>
                </button>
              </div>

              <div class="flex gap-2 mb-3">
                <input id="extra-desc" class="input-visual" placeholder="Nuevo Daño (Ej: Kit Arrastre)"/>
                <input id="extra-val" class="input-visual w-32" type="number" placeholder="$ Valor"/>
                <button class="px-4 bg-slate-800 text-white rounded-lg hover:bg-slate-700 transition" onclick="window.addExtraDiscount()" title="Crear y guardar nuevo daño">
                  <i class="fa-solid fa-plus"></i>
                </button>
              </div>
              <div id="extras-list" class="space-y-2"></div>
            </div>
          </div>
  
        </div>
  
        <div class="lg:col-span-5">
          <div class="card-modern sticky top-6 border-0 shadow-2xl ring-1 ring-slate-900/5">
            <div class="bg-slate-900 p-8 text-white relative overflow-hidden">
              <div class="relative z-10 text-center">
                <div class="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Oferta Máxima Sugerida</div>
                <div id="result-price" class="text-5xl font-black tracking-tight text-white mb-2">$ 0</div>
                <div id="result-profit" class="inline-block px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-[10px] text-emerald-400 font-bold tracking-wide">
                  Utilidad Reservada: $0
                </div>
              </div>
            </div>
  
            <div class="p-6 bg-white">
              <h4 class="text-xs font-bold text-slate-400 uppercase mb-4 border-b border-slate-100 pb-2">Desglose de la Operación</h4>
              <div id="result-breakdown" class="space-y-3">
                <div class="p-4 text-center text-slate-400 text-sm bg-slate-50 rounded-lg border border-slate-100 italic">
                  Selecciona un vehículo para ver el cálculo detallado.
                </div>
              </div>
            </div>
  
            <div class="p-4 bg-slate-50 border-t border-slate-100">
              <button class="w-full bg-slate-900 text-white font-bold py-3.5 rounded-xl hover:bg-slate-800 transition flex items-center justify-center gap-2 shadow-lg shadow-slate-200" onclick="window.copyOffer()">
                <i class="fa-regular fa-copy"></i> COPIAR OFERTA AL PORTAPAPELES
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }
  



  

  window.toggleDano = function(id) {
    const idx = manualDiscounts.danos.indexOf(id);
    if (idx >= 0) manualDiscounts.danos.splice(idx, 1);
    else manualDiscounts.danos.push(id);
  
    recalculateOffer();
  };
  


  
  function openDamageModal({ title, name = '', value = 0, onSave }) {
    // eliminar si ya existe
    const old = document.getElementById('damage-modal');
    if (old) old.remove();
  
    const modal = document.createElement('div');
    modal.id = 'damage-modal';
    modal.className = 'fixed inset-0 bg-black/40 flex items-center justify-center z-50';
  
    modal.innerHTML = `
      <div class="bg-white rounded-2xl w-full max-w-sm p-6 shadow-xl animate-fadeIn">
        <h3 class="font-bold text-lg mb-4">${title}</h3>
  
        <label class="block text-xs font-bold text-slate-400 uppercase mb-1">Nombre</label>
        <input id="dm-name" class="input-visual mb-3" value="${escapeHtml(name)}"/>
  
        <label class="block text-xs font-bold text-slate-400 uppercase mb-1">Valor</label>
        <input id="dm-value" type="number" class="input-visual mb-4" value="${value}"/>
  
        <div class="flex justify-end gap-2">
          <button id="dm-cancel" class="px-4 py-2 text-sm bg-slate-100 rounded-lg">Cancelar</button>
          <button id="dm-save" class="px-4 py-2 text-sm bg-indigo-600 text-white rounded-lg">Guardar</button>
        </div>
      </div>
    `;
  
    document.body.appendChild(modal);
  
    document.getElementById('dm-cancel').onclick = () => modal.remove();
    document.getElementById('dm-save').onclick = () => {
      const newName = document.getElementById('dm-name').value.trim();
      const newVal = Number(document.getElementById('dm-value').value || 0);
      if (!newName || !newVal) return alert('Completa nombre y valor');
      onSave(newName, newVal);
      modal.remove();
    };
  }
  
  

  window.openEditLocalExtra = function (idx) {
    const item = manualDiscounts.extras[idx];
    if (!item) return;
  
    openDamageModal({
      title: 'Editar daño',
      name: item.desc,
      value: item.val,
      onSave: (n, v) => {
        item.desc = n;
        item.val = v;
        renderExtrasList();
        if (window.updateCalculation) window.updateCalculation();
      }
    });
  };
  
// ----------------- Helpers de Renderizado Lógico (Tramos y Extras) -----------------

function renderTramosUI() {
    const container = document.getElementById('tramos-list-container');
    if (!container) return;
  
    container.innerHTML = `
      <div class="grid grid-cols-12 gap-2 tramo-header mb-2 px-2">
        <div class="col-span-2 text-left pl-2">Desde</div>
        <div class="col-span-2 text-left">Hasta</div>
        <div class="col-span-3 text-right pr-2 text-red-400">Pérdida/Año</div>
        <div class="col-span-1"></div>
        <div class="col-span-3 text-right pr-2 text-emerald-500">Ganancia</div>
        <div class="col-span-1"></div>
      </div>
  
      ${tempTramos.map((t, idx) => `
        <div class="grid grid-cols-12 gap-2 items-center p-2 rounded-lg border border-slate-100 hover:border-indigo-100 hover:bg-slate-50 transition group bg-white">
          <div class="col-span-2">
            <input type="number" value="${t.min}" class="input-visual h-9 text-xs text-center bg-slate-50 text-slate-500 border-transparent group-hover:bg-white group-hover:border-slate-200" ${idx === 0 ? 'readonly' : ''} onchange="updateTramoMin(${idx}, this)">
          </div>
          <div class="col-span-2">
            <input type="number" value="${t.max}" class="input-visual h-9 text-xs text-center font-bold" onchange="updateTramoMax(${idx}, this)">
          </div>
  
          <div class="col-span-3 relative">
            <input type="number" value="${t.loss}" class="input-visual h-9 text-xs text-right" onchange="updateTramoLoss(${idx}, this)">
            <span class="absolute left-3 top-2 text-xs text-red-400">$</span>
          </div>
  
          <div class="col-span-1 flex items-center justify-center">
            <button class="text-slate-400 hover:text-red-500 transition" onclick="deleteTramo(${idx})">
              <i class="fa-solid fa-trash-can"></i>
            </button>
          </div>
  
          <div class="col-span-3">
            <div class="flex gap-2">
              <select class="input-visual w-24 text-sm" onchange="updateTramoProfitType(${idx}, this)" >
                <option value="FIXED" ${ (t.profitType||'FIXED') === 'FIXED' ? 'selected' : '' }>$</option>
                <option value="PERCENT" ${ (t.profitType||'FIXED') === 'PERCENT' ? 'selected' : '' }>%</option>
              </select>
              <input type="number" value="${t.profit}" class="input-visual" onchange="updateTramoProfit(${idx}, this)">
            </div>
          </div>
  
          <div class="col-span-1 text-right">
            <span class="text-xs text-slate-400">/año</span>
          </div>
        </div>
      `).join('')}
  
      <div class="mt-2">
        <button id="add-tramo-button" class="px-4 bg-indigo-600 text-white rounded-lg py-2 hover:bg-indigo-700 transition">Agregar tramo</button>
      </div>
    `;
  
    // bind add tramo
    document.getElementById('add-tramo-button')?.addEventListener('click', () => {
      // default new tramo: continue after last max
      const last = tempTramos[tempTramos.length - 1] || { max: 0 };
      const nextMin = Number(last.max || 0) + 1;
      tempTramos.push({ min: nextMin, max: nextMin + 2, loss: 500000, profit: 500000, profitType: 'FIXED' });
      // mantener sincronía con window.tempTramos y re-renderizar
      if (typeof syncTempTramos === 'function') syncTempTramos();
      if (typeof renderTramosUI === 'function') renderTramosUI();
    });
  }
  
window.renderTramosUI = renderTramosUI;

// Helpers globales para manejar cambios desde los handlers inline
window.updateTramoMin = function(idx, el) { tempTramos[idx].min = Number(el.value); syncTempTramos(); renderTramosUI(); };
window.updateTramoMax = function(idx, el) { tempTramos[idx].max = Number(el.value); syncTempTramos(); renderTramosUI(); };
window.updateTramoLoss = function(idx, el) { tempTramos[idx].loss = Number(el.value); syncTempTramos(); renderTramosUI(); };
window.updateTramoProfitType = function(idx, el) { tempTramos[idx].profitType = String(el.value || 'FIXED'); syncTempTramos(); renderTramosUI(); };
window.updateTramoProfit = function(idx, el) { tempTramos[idx].profit = Number(el.value); syncTempTramos(); renderTramosUI(); };
window.deleteTramo = function(idx) { tempTramos.splice(idx, 1); syncTempTramos(); renderTramosUI(); };



/* =========================================
   Eventos y lógica de guardado (Reglas / Catálogo)
   ========================================= */

function initViewListeners() {
  // Guardar regla
  document.getElementById('btn-save-rule')?.addEventListener('click', async () => {
    const name = document.getElementById('rule-name')?.value?.trim();
    const exitPct = Number(document.getElementById('rule-exit-pct')?.value || 0);
    const exitProfitType = document.getElementById('rule-exit-profit-type')?.value || 'FIXED';
    const exitProfitValue = Number(document.getElementById('rule-exit-profit-value')?.value || 0);
    const minProfitType = document.getElementById('rule-min-profit-type')?.value || 'FIXED';
    const minProfit = Number(document.getElementById('rule-min-profit')?.value || 0);
  
    if (!name) return alert('Nombre de regla requerido');
  
    const normalized = tempTramos.map(t => ({
      min: Number(t.min) || 0,
      max: Number(t.max) || 0,
      loss: Number(t.loss) || 0,
      profit: Number(t.profit) || 0,
      profitType: t.profitType || 'FIXED'
    })).filter(t => t.max >= t.min);
  
    const payload = {
      name,
      exitPct,
      exitProfitType,
      exitProfitValue,
      minProfitType,
      minProfit,
      tramos: normalized,
      updatedAt: new Date().toISOString()
    };
  
    try {
      // Si estamos editando: actualizar doc en Firestore
      if (window.reglaEditandoDocId) {
        const docId = String(window.reglaEditandoDocId);
        await updateDoc(doc(getCollectionRef('cotizador_reglas'), docId), payload);
  
        // actualizar copia local si existe
        const idx = (cotizadorReglas || []).findIndex(r => String(r.id) === docId);
        if (idx >= 0) cotizadorReglas[idx] = { ...(cotizadorReglas[idx] || {}), ...payload, id: docId };
  
        alert('Regla actualizada correctamente');
      } else {
        // Crear nueva regla
        const docRef = await addDoc(getCollectionRef('cotizador_reglas'), {
          ...payload,
          createdAt: new Date().toISOString()
        });
        
        // CORRECCIÓN: No reasignamos cotizadorReglas, solo hacemos push al array existente
        if (Array.isArray(cotizadorReglas)) {
            cotizadorReglas.push({ id: docRef.id, ...payload });
        }
        
        alert('Regla guardada correctamente');
      }
  
      // reset visual y re-render de panel
      resetRuleFormVisual();
      renderReglasList();
    } catch (e) {
      console.error(e);
      alert('Error al guardar la regla');
    }
  });
  

  // LOGICA CATALOGO
  document.getElementById('btn-add-brand')?.addEventListener('click', () => {
    const val = document.getElementById('new-brand-input')?.value?.trim();
    if (val) { window._cotizador_selectedBrand = val; renderCotizadorCompra(); }
  });

  window.deleteBrand = async (brand) => {
    if (!confirm(`¿Eliminar marca ${brand} y todas sus líneas?`)) return;
    const items = cotizadorCatalogo.filter(i => i.brand === brand);
    for (const it of items) await deleteDoc(doc(getCollectionRef('cotizador_catalogo'), it.id));
    window._cotizador_selectedBrand = null; renderCotizadorCompra();
  };

  // Al añadir línea al catálogo: incluir refYear por defecto (interno)
  document.getElementById('btn-add-line')?.addEventListener('click', async () => {
    const name = document.getElementById('new-line-name')?.value?.trim();
    const cc = Number(document.getElementById('new-line-cc')?.value || 0);
    const price = Number(document.getElementById('new-line-price')?.value || 0);
    const ruleId = document.getElementById('new-line-rule')?.value || null;
    const brand = window._cotizador_selectedBrand;

    if (!brand) return alert('Selecciona una marca primero');
    if (!name || !price) return alert('Nombre y precio requeridos');
    
    // refYear por defecto: año actual + 1 (interno), puede ser sobreescrito en BD si lo deseas
    const defaultRefYear = new Date().getFullYear() + 1;
    await addDoc(getCollectionRef('cotizador_catalogo'), { brand, name, cc, price, ruleId, refYear: defaultRefYear });
    // Limpiar inputs
    document.getElementById('new-line-name').value = '';
    document.getElementById('new-line-price').value = '';
    renderCotizadorCompra();
  });

  window.deleteLine = async (id) => {
    if (confirm('¿Eliminar referencia?')) {
      await deleteDoc(doc(getCollectionRef('cotizador_catalogo'), id));
      renderCotizadorCompra();
    }
  };

  window.updateLinePrice = async (id, val) => {
    await updateDoc(doc(getCollectionRef('cotizador_catalogo'), id), { price: Number(val) });
  };


  // --- Edit row helpers (Catálogo) ---
window.startEditLine = function(id) {
  editingLineId = id;
  const item = cotizadorCatalogo.find(x => x.id === id) || {};
  editingLineDraft = { ...item }; // copia local
  // forzar re-render del catálogo
  renderCotizadorCompra();
};

window.onEditField = function(id, field, el) {
  if (!editingLineDraft || editingLineDraft.id !== id) editingLineDraft = { ...(cotizadorCatalogo.find(x => x.id === id) || {}), id };
  let val = el.value;
  // normalizar números para campos conocidos
  if (el.type === 'number' || ['price','cc','refYear'].includes(field)) val = Number(val || 0);
  editingLineDraft[field] = val;
  // opcional: no re-render cada cambio para no perder foco; solo actualiza draft
};

window.saveLineEdit = async function(id) {
  if (!editingLineDraft || editingLineDraft.id !== id) return alert('Nada para guardar');
  try {
    const payload = {
      name: String(editingLineDraft.name || ''),
      cc: Number(editingLineDraft.cc || 0),
      price: Number(editingLineDraft.price || 0),
      ruleId: editingLineDraft.ruleId || null,
      refYear: Number(editingLineDraft.refYear || 0)
    };
    await updateDoc(doc(getCollectionRef('cotizador_catalogo'), id), payload);
    editingLineId = null;
    editingLineDraft = {};
    // recargar catálogo local desde BD si tu app lo hace automáticamente, o forzar re-render
    renderCotizadorCompra();
  } catch (e) {
    console.error(e);
    alert('Error al guardar la línea');
  }
};

window.cancelEditLine = function(id) {
  editingLineId = null;
  editingLineDraft = {};
  renderCotizadorCompra();
};

  // LOGICA COTIZADOR
  window.updateCalculation = () => {
    selectedMotoId = document.getElementById('select-moto')?.value || '';
    selectedYear = Number(document.getElementById('input-year')?.value || new Date().getFullYear());
    selectedCityId = document.getElementById('select-city')?.value || '';
    manualDiscounts.soat = !!document.getElementById('chk-soat')?.checked;
    manualDiscounts.tecno = !!document.getElementById('chk-tecno')?.checked;
    recalculateOffer();
  };

  // Búsqueda Predictiva
  const searchInput = document.getElementById('input-moto-search');
  const resultsDiv = document.getElementById('moto-search-results');
  const hiddenIdInput = document.getElementById('select-moto');

  searchInput?.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase().trim();
    if (term.length < 2) {
      resultsDiv.classList.add('hidden');
      return;
    }
    const filtered = cotizadorCatalogo.filter(m => 
      m.name.toLowerCase().includes(term) || 
      m.brand.toLowerCase().includes(term)
    );
    if (filtered.length > 0) {
      resultsDiv.innerHTML = filtered.map(m => `
        <div class="px-4 py-3 hover:bg-indigo-50 cursor-pointer border-b border-slate-50 last:border-0 flex justify-between items-center transition-colors" 
             onclick="window.selectMotoFromSearch('${m.id}', '${escapeHtml(m.name)}')">
          <div>
            <div class="text-sm font-bold text-slate-700">${escapeHtml(m.name)}</div>
            <div class="text-[10px] text-indigo-500 uppercase font-bold">${escapeHtml(m.brand)}</div>
          </div>
          <div class="text-xs font-black text-slate-400">${m.cc ? m.cc + 'cc' : ''}</div>
        </div>
      `).join('');
      resultsDiv.classList.remove('hidden');

     

      // --- AGREGA ESTO AQUÍ ---
      // Forzamos al navegador a reconocer que el contenido cambió y necesita scroll
      resultsDiv.scrollTop = 0; 
      window.enableSearchResultsScroll();
    } else {
      resultsDiv.innerHTML = '<div class="p-4 text-sm text-slate-400">No se encontraron resultados</div>';
      resultsDiv.classList.remove('hidden');
    }
  });
}


// ---------- Lista de reglas (panel derecho) + helpers ----------
window.reglaEditandoDocId = null; // id del doc firestone si estamos editando

// ----------------- renderReglasList (pinta dentro del #reglas-list-panel, sin posicionamiento absoluto) -----------------
function renderReglasList() {
  const panel = document.getElementById('reglas-list-panel');
  if (!panel) return; // si no existe (aún no se renderizó la vista), no hace nada

  if (!Array.isArray(cotizadorReglas) || cotizadorReglas.length === 0) {
    panel.innerHTML = `<div class="text-sm text-slate-400">No hay reglas registradas.</div>`;
    return;
  }

  panel.innerHTML = cotizadorReglas.map((r, i) => {
    const name = escapeHtml(r.name || r.nombre || `Regla ${i+1}`);
    const tramosCount = Array.isArray(r.tramos) ? r.tramos.length : 0;
    const id = escapeHtml(r.id || '');
    return `
      <div class="p-3 border rounded-lg flex justify-between items-start">
        <div class="min-w-0">
          <div class="font-semibold truncate">${name}</div>
          <div class="text-xs text-slate-400 mt-1">${tramosCount} tramos • ${Number(r.exitPct ?? 0)}% salida</div>
          <div class="text-[10px] text-slate-300 mt-1">ID: ${id}</div>
        </div>
        <div class="flex flex-col gap-2 ml-3">
          <button onclick="editarRegla('${id}')" class="px-2 py-1 text-xs rounded bg-yellow-50 border text-yellow-600">Editar</button>
          <button onclick="eliminarRegla('${id}')" class="px-2 py-1 text-xs rounded bg-red-50 text-red-600 border">Eliminar</button>
        </div>
      </div>
    `;
  }).join('');
}


// Prefill form para editar (busca por doc id en cotizadorReglas)
window.editarRegla = function(docId) {
  const regla = (cotizadorReglas || []).find(r => String(r.id) === String(docId));
  if (!regla) return alert('Regla no encontrada en memoria local.');

  // Rellenar formulario existente (IDs del formulario en tu renderReglasHTML)
  document.getElementById('rule-name').value = regla.name || regla.nombre || '';
  document.getElementById('rule-exit-pct').value = Number(regla.exitPct || regla.exit_pct || 0);
  document.getElementById('rule-exit-profit-type').value = regla.exitProfitType || regla.exit_profit_type || 'FIXED';
  document.getElementById('rule-exit-profit-value').value = Number(regla.exitProfitValue || regla.exit_profit_value || 0);
  document.getElementById('rule-min-profit-type').value = regla.minProfitType || regla.min_profit_type || 'FIXED';
  document.getElementById('rule-min-profit').value = Number(regla.minProfit || regla.min_profit || 0);

  // Rellenar tempTramos si vienen en la regla para que el UI de tramos muestre los valores
  if (Array.isArray(regla.tramos) && regla.tramos.length) {
    tempTramos = regla.tramos.map(t => ({
      min: Number(t.min || 0),
      max: Number(t.max || 0),
      loss: Number(t.loss || 0),
      profit: Number(t.profit || 0),
      profitType: t.profitType || t.profit_type || 'FIXED'
    }));
    if (typeof syncTempTramos === 'function') syncTempTramos();
    if (typeof renderTramosUI === 'function') renderTramosUI();
  }

  // Marcar edición
  window.reglaEditandoDocId = String(docId);
  // Opcional: dar feedback visual (cambiar texto botón guardar)
  const btn = document.getElementById('btn-save-rule');
  if (btn) btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Guardar cambios';
};

// Eliminar regla desde panel (borra en Firestore y actualiza UI local)
window.eliminarRegla = async function(docId) {
  if (!confirm('¿Eliminar esta regla permanentemente?')) return;
  try {
    await deleteDoc(doc(getCollectionRef('cotizador_reglas'), String(docId)));
    
    // CORRECCIÓN: Usar splice para modificar el array original importado
    const idx = cotizadorReglas.findIndex(r => String(r.id) === String(docId));
    if (idx > -1) {
        cotizadorReglas.splice(idx, 1);
    }

    renderReglasList();
    if (typeof renderTramosUI === 'function') renderTramosUI();
    alert('Regla eliminada');
  } catch (err) {
    console.error('Error eliminando regla:', err);
    alert('No fue posible eliminar la regla');
  }
};

// Reset UI del form luego de guardar/editar
function resetRuleFormVisual() {
  document.getElementById('rule-name').value = '';
  document.getElementById('rule-exit-pct').value = '18';
  document.getElementById('rule-exit-profit-type').value = 'FIXED';
  document.getElementById('rule-exit-profit-value').value = '';
  document.getElementById('rule-min-profit-type').value = 'FIXED';
  document.getElementById('rule-min-profit').value = '';
  tempTramos = [{ min: 1, max: 5, loss: 500000, profit: 1000000, profitType: 'FIXED' }];
  if (typeof syncTempTramos === 'function') syncTempTramos();
  if (typeof renderTramosUI === 'function') renderTramosUI();

  window.reglaEditandoDocId = null;
  const btn = document.getElementById('btn-save-rule');
  if (btn) btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Guardar Plantilla';
}

// ----------------- Utilidades -----------------

function escapeHtml(str='') { return String(str).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"}[m])); }
export function groupByBrand(arr = []) {
  return (arr || []).reduce((acc, cur) => {
    acc[cur.brand] = acc[cur.brand] || [];
    acc[cur.brand].push(cur);
    return acc;
  }, {});
}

// Extras (daños)
// Añadir daño: guarda en colección y en lista local (para cálculo inmediato)
// Añadir daño: guarda en colección y en lista local (para cálculo inmediato)
// Añadir daño: guarda en colección y en lista local (para cálculo inmediato)
window.addExtraDiscount = async () => {
  const desc = document.getElementById('extra-desc')?.value?.trim();
  const val = Number(document.getElementById('extra-val')?.value || 0);
  if (!desc || !val) return alert('Descripción y valor requeridos');

  // 1. Limpiamos los inputs
  document.getElementById('extra-desc').value = '';
  document.getElementById('extra-val').value = '';

  // 2. Intentar guardar directamente en Firestore (colección: 'cotizador_danos')
  try {
    await addDoc(getCollectionRef('cotizador_danos'), {
      name: desc,
      value: Number(val),
      createdAt: new Date().toISOString()
    });

    // 3. Recargar daños desde BD para sincronizar y mostrar en la lista
    if (typeof window.loadDamages === 'function') await window.loadDamages();

    // 4. Re-renderizar vistas para que aparezca el interruptor (apagado por defecto)
    if (typeof renderExtrasList === 'function') renderExtrasList();
    if (typeof renderDamagesAccordion === 'function') renderDamagesAccordion();
    
    // Eliminamos el updateCalculation de aquí porque el daño entra apagado, 
    // se calculará cuando el usuario active el interruptor.

  } catch (e) {
    console.error('Error guardando daño en colección:', e);
    alert('No se pudo guardar el daño.');
  }
};



// ---------- Gestión de daños en Firestore + render acordeón ----------

// Guardar daño en la colección (si necesitas guardar desde código)
// payload: { name, value }
window.saveDamageToCollection = async (payload) => {
  if (!payload || !payload.name || !payload.value) throw new Error('payload inválido');
  return await addDoc(getCollectionRef('cotizador_danos'), {
    name: String(payload.name),
    value: Number(payload.value),
    createdAt: new Date().toISOString()
  });
};

// Cargar daños desde colección y renderizar acordeón
window.loadDamages = async () => {
  try {
    const snap = await getDocs(getCollectionRef('cotizador_danos'));
    const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    // Renderizar acordeón
    renderDamagesAccordion(items);
    return items;
  } catch (e) {
    console.error('Error cargando daños:', e);
    // mostrar vacío en acordeón
    renderDamagesAccordion([]);
    return [];
  }
};

// Render simple de acordeón (mantener diseño limpio)
function renderDamagesAccordion(items = []) {
  const container = document.getElementById('damages-accordion');
  if (!container) return;
  if (!items || items.length === 0) {
    container.innerHTML = `<div class="p-3 text-sm text-slate-400 bg-slate-50 rounded-lg border border-slate-100 italic">No hay daños en la colección.</div>`;
    return;
  }

  container.innerHTML = items.map(it => `
    <div class="p-3 bg-white rounded-lg border border-slate-100 shadow-sm">
      <div class="flex justify-between items-start gap-3">
        <div class="min-w-0">
          <div class="font-bold text-slate-700">${escapeHtml(it.name)}</div>
          <div class="text-xs text-slate-400 mt-1">Valor: <strong>${formatCurrency(Number(it.value || 0))}</strong></div>
          <div class="text-[10px] text-slate-300 mt-1">ID: ${it.id}</div>
        </div>

        <div class="flex items-center gap-2">
          <button class="px-3 py-1 text-xs bg-slate-100 rounded-md" onclick="(function(){ openEditDamage('${it.id}', ${Number(it.value||0)}, '${escapeHtml(it.name).replace(/'/g, '&#39;')}') })()">
            Editar
          </button>
          <button class="px-3 py-1 text-xs bg-red-50 text-red-600 rounded-md" onclick="(function(){ if(confirm('Eliminar daño?')) window.deleteDamageFromCollection('${it.id}') })()">
            Eliminar
          </button>
        </div>
      </div>
    </div>
  `).join('');
}

// ==== HACER EDITABLES LOS DAÑOS (GLOBAL) ====

window.openEditDamage = function (id, value, name) {
  openDamageModal({
    title: 'Editar daño guardado',
    name: name || '',
    value: value || 0,
    onSave: async (n, v) => {
      try {
        await updateDoc(doc(getCollectionRef('cotizador_danos'), id), {
          name: String(n),
          value: Number(v),
          updatedAt: new Date().toISOString()
        });

        // recargar y re-renderizar para que el cambio se vea de inmediato
        if (typeof window.loadDamages === 'function') await window.loadDamages();
        if (typeof renderExtrasList === 'function') renderExtrasList();
        if (typeof renderDamagesAccordion === 'function') renderDamagesAccordion();
        if (window.updateCalculation) window.updateCalculation();
      } catch (err) {
        console.error('Error guardando edición del daño:', err);
        alert('No se pudo guardar la edición');
      }
    }
  });
};

window.openEditLocalExtra = (index) => {
  const item = manualDiscounts.extras[index];
  if (!item) return;

  const newName = prompt('Editar nombre:', item.desc);
  if (newName === null) return;

  const newVal = prompt('Editar valor:', item.val);
  if (newVal === null || isNaN(newVal)) {
    alert('Valor inválido');
    return;
  }

  item.desc = newName.trim();
  item.val = Number(newVal);

  renderExtrasList();
  if (window.updateCalculation) window.updateCalculation();
};


// Actualizar daño en la colección y recargar
window.updateDamageInCollection = async (id, payload) => {
  try {
    await updateDoc(doc(getCollectionRef('cotizador_danos'), id), {
      name: String(payload.name),
      value: Number(payload.value),
      updatedAt: new Date().toISOString()
    });

    // recargar daños y re-renderizar vistas relacionadas
    if (typeof window.loadDamages === 'function') await window.loadDamages();
    if (typeof renderExtrasList === 'function') renderExtrasList();
    if (typeof renderDamagesAccordion === 'function') renderDamagesAccordion();
    if (window.updateCalculation) window.updateCalculation();
  } catch (e) {
    console.error('Error actualizando daño:', e);
    alert('Error al actualizar');
  }
};


// Eliminar daño de la colección y recargar
// Eliminar daño de la colección y recargar; además limpiar local por docId si existe
window.deleteDamageFromCollection = async (id) => {
  try {
    await deleteDoc(doc(getCollectionRef('cotizador_danos'), id));
    // Limpiar local por docId exacto para evitar ghost items
    manualDiscounts.extras = (manualDiscounts.extras || []).filter(e => String(e.docId || '') !== String(id));
    renderExtrasList();
    if (window.updateCalculation) window.updateCalculation();

    // recargar daños desde BD y re-render
    if (typeof window.loadDamages === 'function') await window.loadDamages();
    if (typeof renderDamagesAccordion === 'function') renderDamagesAccordion();
  } catch (e) {
    console.error('Error eliminando daño:', e);
    alert('Error al eliminar');
  }
};


// Exponemos la función al objeto window para que el oninput del HTML la pueda llamar
window.renderExtrasList = renderExtrasList;

function renderExtrasList() {
  const el = document.getElementById('extras-list');
  if (!el) return;

  manualDiscounts.danos = manualDiscounts.danos || [];

  const dmgName = (d) => d?.name ?? d?.nombre ?? '';
  const dmgValue = (d) => Number(d?.value ?? d?.valor ?? 0);

  // 1. Leer el valor del buscador
  const searchInput = document.getElementById('search-danos');
  const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';

  // 2. Filtrar la lista de daños
  let filteredDanos = cotizadorDanos || [];
  if (searchTerm) {
    filteredDanos = filteredDanos.filter(d => dmgName(d).toLowerCase().includes(searchTerm));
  }

  let savedHtml = '';
  if (Array.isArray(cotizadorDanos) && cotizadorDanos.length > 0) {
    // Forzar apertura del acordeón si el usuario está buscando algo
    const isOpen = searchTerm ? 'open' : '';

    savedHtml = `
      <details class="border rounded-lg bg-white shadow-sm" ${isOpen}>
        <summary class="cursor-pointer px-3 py-2 font-semibold text-sm flex justify-between items-center bg-slate-50 rounded-t-lg">
          <span>Daños guardados (${filteredDanos.length})</span>
          <span class="text-xs text-slate-400">Seleccione para descontar</span>
        </summary>
        <div class="p-2 space-y-1 max-h-60 overflow-y-auto">
          ${filteredDanos.length > 0 ? filteredDanos.map(d => {
            const checked = manualDiscounts.danos.includes(d.id) ? 'checked' : '';
            const name = escapeHtml(dmgName(d));
            const val = dmgValue(d);
            return `
              <label class="flex justify-between items-center text-sm gap-2 p-2 rounded hover:bg-slate-50 transition border border-transparent hover:border-slate-100">
                <div class="flex items-center gap-3">
                 <label class="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" class="sr-only peer" ${checked} onchange="toggleDano('${d.id}')">
                  <div class="w-10 h-5 bg-slate-300 rounded-full peer peer-checked:bg-indigo-600 transition"></div>
                  <div class="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full transition peer-checked:translate-x-5"></div>
                </label>
                  <span class="truncate font-medium text-slate-700">${name}</span>
                </div>
                <div class="flex items-center gap-2">
                  <strong class="mr-3 text-red-500">- ${formatCurrency(val)}</strong>
                  <button class="px-2 py-1 text-xs bg-slate-100 text-slate-600 hover:bg-slate-200 transition rounded-md" onclick="openEditDamage('${d.id}', ${val}, '${name.replace(/'/g,'&#39;')}')">Editar</button>
                  <button class="px-2 py-1 text-xs bg-red-50 text-red-600 hover:bg-red-100 transition rounded-md" onclick="(function(){ if(confirm('Eliminar daño?')) window.deleteDamageFromCollection('${d.id}') })()">Eliminar</button>
                </div>
              </label>
            `;
          }).join('') : `<div class="p-4 text-center text-sm text-slate-400 italic">No se encontraron daños con "${escapeHtml(searchTerm)}"</div>`}
        </div>
      </details>
    `;
  } else {
    savedHtml = `
      <div class="p-3 text-sm text-slate-400 italic border rounded-lg bg-slate-50 text-center">No hay daños registrados en la colección.</div>
    `;
  }

  el.innerHTML = `<div class="space-y-2">${savedHtml}</div>`;
}

// Editar extra local (abre prompt simple — podemos reemplazar por modal si quieres)
window.openEditLocalExtra = function(index) {
  const item = manualDiscounts.extras[index];
  if (!item) return;
  const newDesc = prompt('Editar descripción', item.desc);
  if (newDesc === null) return; // cancelar
  const newValRaw = prompt('Editar valor (número)', String(item.val));
  if (newValRaw === null) return;
  const newVal = Number(newValRaw || 0);
  if (!newDesc || !newVal) return alert('Descripción y valor válidos requeridos');
  // Si tiene docId, actualizamos la colección también
  if (item.docId) {
    (async () => {
      try {
        await updateDoc(doc(getCollectionRef('cotizador_danos'), item.docId), {
          name: String(newDesc),
          value: Number(newVal),
          updatedAt: new Date().toISOString()
        });
        // actualizar local y re-render
        manualDiscounts.extras[index] = { desc: newDesc, val: newVal, docId: item.docId };
        renderExtrasList();
        if (window.updateCalculation) window.updateCalculation();
        if (typeof window.loadDamages === 'function') window.loadDamages();
      } catch (e) {
        console.error('Error actualizando daño en colección', e);
        alert('Error actualizando en colección');
      }
    })();
  } else {
    // solo local
    manualDiscounts.extras[index] = { desc: newDesc, val: newVal, docId: null };
    renderExtrasList();
    if (window.updateCalculation) window.updateCalculation();
  }
};

// ----------------- MOTOR DE CÁLCULO (CASCADA) -----------------
function recalculateOffer() {
  const resultPriceEl = document.getElementById('result-price');
  const resultProfitEl = document.getElementById('result-profit');
  const breakdownEl = document.getElementById('result-breakdown');

  if (!resultPriceEl || !resultProfitEl || !breakdownEl) return;

  const moto = cotizadorCatalogo.find(m => m.id === selectedMotoId);
  if (!moto) {
    resultPriceEl.innerText = formatCurrency(0);
    resultProfitEl.innerText = 'Utilidad Reservada: $0';
    breakdownEl.innerHTML = `<div class="p-4 text-center text-slate-400 text-sm bg-slate-50 rounded-lg border border-slate-100 italic">Selecciona un vehículo para ver el cálculo detallado.</div>`;
    return;
  }

  // Obtener regla aplicada (si existe)
  const rule = cotizadorReglas.find(r => r.id === moto.ruleId) || null;

  // 1) Cálculo de antigüedad usando Modelo (Año) y refYear de la línea
  const modeloSeleccionado = Number(document.getElementById('input-year')?.value || selectedYear || 0);
  const effectiveRefYear = Number(moto.refYear || 0); // ya no usamos fallback año+1
  const age = Math.max(0, effectiveRefYear - modeloSeleccionado);

  // 2) Depreciación Acumulada
  const priceNew = Number(moto.price || 0);
  const exitPct = rule ? Number(rule.exitPct || 0) : 0;
  const exitLossAmount = Math.round(priceNew * (exitPct / 100));

  let yearLossTotal = 0;
  if (rule && Array.isArray(rule.tramos)) {
    for (let y = 1; y <= age; y++) {
      const tramo = rule.tramos.find(t => Number(t.min) <= y && Number(t.max) >= y);
      if (tramo) yearLossTotal += Number(tramo.loss || 0);
    }
  }

  const depreciacionAcumulada = exitLossAmount + yearLossTotal;

  // 3) Precio de Mercado (Venta)
  const priceMarket = Math.max(0, priceNew - depreciacionAcumulada);

  // 4) Reserva de Ganancia
  let reservedProfit = 0;
  let appliedProfitLabel = '';

  if (age === 0) {
    if (rule) {
      const epType = rule.exitProfitType || 'FIXED';
      const epVal = Number(rule.exitProfitValue || 0);
      if (epType === 'PERCENT') {
        reservedProfit = Math.round(priceMarket * (epVal / 100));
        appliedProfitLabel = `${epVal}% de Precio de Mercado`;
      } else {
        reservedProfit = Math.round(epVal);
        appliedProfitLabel = `$ ${formatCurrency(epVal)} (fijo)`;
      }
    }
  } else {
    let appliedTramo = null;
    if (rule && Array.isArray(rule.tramos)) {
      appliedTramo = rule.tramos.find(t => Number(t.min) <= age && Number(t.max) >= age) || null;
    }
    if (appliedTramo) {
      const pType = appliedTramo.profitType || 'FIXED';
      const pVal = Number(appliedTramo.profit || 0);
      if (pType === 'PERCENT') {
        reservedProfit = Math.round(priceMarket * (pVal / 100));
        appliedProfitLabel = `${pVal}% del Precio de Mercado`;
      } else {
        reservedProfit = Math.round(pVal);
        appliedProfitLabel = `$ ${formatCurrency(pVal)} (fijo)`;
      }
    } else {
      if (rule) {
        const mpType = rule.minProfitType || 'FIXED';
        const mpVal = Number(rule.minProfit || 0);
        if (mpType === 'PERCENT') {
          reservedProfit = Math.round(priceMarket * (mpVal / 100));
          appliedProfitLabel = `${mpVal}% (fallback)`;
        } else {
          reservedProfit = Math.round(mpVal);
          appliedProfitLabel = `$ ${formatCurrency(mpVal)} (fallback)`;
        }
      }
    }
  }

  // 5) Deducciones (SOAT, Tecno, Daños y Traspaso editable + 1% impuesto)
  const soatCost  = manualDiscounts.soat  ? Number(manualDiscounts.soatValue  || 0) : 0;
  const tecnoCost = manualDiscounts.tecno ? Number(manualDiscounts.tecnoValue || 0) : 0;
  const extrasLocal = (manualDiscounts.extras || []).reduce((s, e) => s + Number(e.val || 0), 0);

  const extrasFromDanos = (manualDiscounts.danos || []).reduce((sum, id) => {
    const d = (cotizadorDanos || []).find(x => x.id === id);
    return sum + (d ? Number(d.value || d.valor || 0) : 0);
  }, 0);
  
  const extrasTotal = extrasLocal + extrasFromDanos;
  
  
  const traspasoBase = Number(manualDiscounts.traspasoValue || 0);
  const traspasoTotal = traspasoBase 

  const totalDeductions = soatCost + tecnoCost + extrasTotal + traspasoTotal;

  // 6) Oferta de Compra Final
  const ofertaFinal = Math.max(0, priceMarket - reservedProfit - totalDeductions);

  // Render resultados
  resultPriceEl.innerText = formatCurrency(ofertaFinal);
  resultProfitEl.innerText = `Utilidad Reservada: ${formatCurrency(reservedProfit)}`;

  // Breakdown detallado
  const breakdownHtml = `
    <div class="p-3 rounded-lg border border-slate-100 bg-slate-50">
      <div class="mb-2 text-sm font-bold">Resumen</div>
      <div class="flex justify-between text-sm"><div>Precio Nuevo</div><div>${formatCurrency(priceNew)}</div></div>
      <div class="flex justify-between text-sm"><div>Depreciación Acumulada</div><div>${formatCurrency(depreciacionAcumulada)}</div></div>
      <div class="flex justify-between text-sm"><div><strong>Precio de Mercado</strong></div><div><strong>${formatCurrency(priceMarket)}</strong></div></div>
      <hr class="my-2"/>
      <div class="flex justify-between text-sm"><div>Ganancia aplicada</div><div>${appliedProfitLabel} — ${formatCurrency(reservedProfit)}</div></div>
      <div class="flex justify-between text-sm"><div>SOAT</div><div>${formatCurrency(soatCost)}</div></div>
      <div class="flex justify-between text-sm"><div>Tecno</div><div>${formatCurrency(tecnoCost)}</div></div>
      <div class="flex justify-between text-sm"><div>Extras (Daños/Multas)</div><div>${formatCurrency(extrasTotal)}</div></div>
      <div class="flex justify-between text-sm"><div>Traspaso</div><div>${formatCurrency(traspasoTotal)}</div></div>
      <hr class="my-2"/>
      <div class="flex justify-between text-sm font-bold"><div>Oferta de Compra Final</div><div>${formatCurrency(ofertaFinal)}</div></div>
      <div class="mt-2 text-xs text-slate-400">Antigüedad calculada: refYear(${effectiveRefYear}) - modelo(${modeloSeleccionado}) = ${age} años</div>
    </div>
  `;
  breakdownEl.innerHTML = breakdownHtml;

  // Mostrar regla aplicada en UI
  const appliedRuleName = rule ? rule.name : '—';
  const appliedRuleEl = document.getElementById('applied-rule');
  if (appliedRuleEl) appliedRuleEl.innerText = appliedRuleName;
}


// ----------------- Misc (copiar oferta) -----------------
window.copyOffer = () => {
  const price = document.getElementById('result-price')?.innerText || '';
  const breakdown = document.getElementById('result-breakdown')?.innerText || '';
  const txt = `Oferta: ${price}\n\n${breakdown}`;
  navigator.clipboard.writeText(txt).then(() => alert('Oferta copiada al portapapeles'));
};

// ----------------- Funciones UI auxiliares para selección (busqueda)
window.selectMotoFromSearch = (id, name) => {
  document.getElementById('input-moto-search').value = name;
  document.getElementById('select-moto').value = id;
  selectedMotoId = id;
  document.getElementById('moto-search-results').classList.add('hidden');
  recalculateOffer();
};

window.selectBrand = (brand) => {
  window._cotizador_selectedBrand = brand;
  renderCotizadorCompra();
};





/**
 * Habilita el scroll independiente y evita que se propague al body.
 * Se define localmente para evitar problemas de 'any' y alcance global.
 */
// 1. Definirla como función estándar al principio del archivo
window.enableSearchResultsScroll = function() {
  const resultsDiv = document.getElementById('moto-search-results');
  if (!resultsDiv) return;

  // Asegurar estilos de scroll
  resultsDiv.style.maxHeight = '250px';
  resultsDiv.style.overflowY = 'auto';
  resultsDiv.style.overscrollBehavior = 'contain';
  resultsDiv.style.webkitOverflowScrolling = 'touch';

  // Prevenir que el scroll se vaya al body
  const handleScroll = (e) => {
    const isScrollable = resultsDiv.scrollHeight > resultsDiv.clientHeight;
    if (isScrollable) {
      e.stopPropagation(); // Detiene el evento para que no llegue al body
    }
  };

  resultsDiv.addEventListener('wheel', handleScroll, { passive: true });
  resultsDiv.addEventListener('touchstart', handleScroll, { passive: true });
  resultsDiv.addEventListener('touchmove', handleScroll, { passive: true });
};

// Exponerla
window.enableSearchResultsScroll = enableSearchResultsScroll;
// ----------------- Export (si requiere)
export default {
  renderCotizadorCompra
};
