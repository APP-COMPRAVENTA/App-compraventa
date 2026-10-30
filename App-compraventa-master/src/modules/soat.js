// js/modules/soat.js
import { soatClasses, soatCcRanges, soatPrices } from '../store/store.js';
import { getCollectionRef } from '../services/listeners.js';
import { doc, setDoc, deleteDoc } from "firebase/firestore";
import { renderHeader, renderFormGroup, formatCurrency, showGeneralConfirmModal } from '../utils/utils.js';

// Exponer funciones
window.deleteSoatClassWrapper = deleteSoatClassWrapper;
window.deleteSoatCCRangeWrapper = deleteSoatCCRangeWrapper;
window.deleteSoatPriceWrapper = deleteSoatPriceWrapper;

// Listeners globales para formularios de este módulo
document.addEventListener('submit', (e) => {
    if (e.target.id === 'soat-class-form') handleSoatClassSubmit(e);
    if (e.target.id === 'soat-cc-range-form') handleSoatCCRangeSubmit(e);
    if (e.target.id === 'soat-price-form') handleSoatPriceSubmit(e);
});

export function renderSoatConfig() {
    // Esta función se puede llamar desde renderTraspasos si quieres integrarla allí
    // O puedes añadir un botón en Home para ir a "Configuración SOAT"
    // Por ahora devuelve el HTML string para ser inyectado
    
    const classOptions = soatClasses.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
    const rangeOptions = soatCcRanges.map(r => `<option value="${r.id}">${r.name}</option>`).join('');

    return `
        <div class="bg-white p-5 rounded-xl card mb-6">
            <h2 class="text-xl font-semibold mb-4 text-blue-700 border-b pb-2">Configuración SOAT</h2>
            
            <div class="mb-6 border p-3 rounded">
                <h3 class="font-bold mb-2">1. Clases</h3>
                <form id="soat-class-form" class="flex gap-2 mb-2">
                    <input id="soat-class-id" placeholder="ID (MOTO)" class="border p-1 rounded uppercase" required>
                    <input id="soat-class-name" placeholder="Nombre" class="border p-1 rounded" required>
                    <button type="submit" class="bg-blue-500 text-white px-3 rounded">Add</button>
                </form>
                <div class="text-xs space-y-1">${soatClasses.map(c=>`<div class="flex justify-between bg-gray-50 p-1"><span>${c.name}</span><button onclick="deleteSoatClassWrapper('${c.id}', '${c.name}')" class="text-red-500">x</button></div>`).join('')}</div>
            </div>

            <div class="mb-6 border p-3 rounded">
                <h3 class="font-bold mb-2">2. Rangos CC</h3>
                <form id="soat-cc-range-form" class="grid grid-cols-3 gap-2 mb-2">
                    <select id="soat-cc-class-id" class="border p-1" required>${classOptions}</select>
                    <input id="soat-cc-id" placeholder="ID (100_200)" class="border p-1 uppercase" required>
                    <input id="soat-cc-name" placeholder="Nombre" class="border p-1" required>
                    <button type="submit" class="col-span-3 bg-teal-500 text-white px-3 rounded">Guardar Rango</button>
                </form>
                <div class="text-xs space-y-1">${soatCcRanges.map(r=>`<div class="flex justify-between bg-gray-50 p-1"><span>${r.name}</span><button onclick="deleteSoatCCRangeWrapper('${r.id}', '${r.name}')" class="text-red-500">x</button></div>`).join('')}</div>
            </div>

            <div class="mb-6 border p-3 rounded">
                <h3 class="font-bold mb-2">3. Precios</h3>
                <form id="soat-price-form" class="grid grid-cols-4 gap-2 mb-2">
                    <select id="soat-price-class" class="border p-1" required>${classOptions}</select>
                    <select id="soat-price-cc" class="border p-1" required>${rangeOptions}</select>
                    <input type="number" id="soat-price-value" placeholder="$" class="border p-1" required>
                    <button type="submit" class="bg-green-500 text-white px-3 rounded">Set</button>
                </form>
                <div class="text-xs space-y-1">${soatPrices.map(p=>`<div class="flex justify-between bg-gray-50 p-1"><span>${p.vehicle_class} - ${p.cc_range}: ${formatCurrency(p.price)}</span><button onclick="deleteSoatPriceWrapper('${p.id}', 'Precio')" class="text-red-500">x</button></div>`).join('')}</div>
            </div>
        </div>
    `;
}

// Handlers
async function handleSoatClassSubmit(e) {
    e.preventDefault();
    const id = e.target['soat-class-id'].value.toUpperCase();
    await setDoc(doc(getCollectionRef('soat_classes'), id), { id, name: e.target['soat-class-name'].value });
    e.target.reset();
}
function deleteSoatClassWrapper(id, name) { showGeneralConfirmModal(id, name, 'Clase', (id)=>deleteDoc(doc(getCollectionRef('soat_classes'), id))); }

async function handleSoatCCRangeSubmit(e) {
    e.preventDefault();
    const id = e.target['soat-cc-id'].value.toUpperCase();
    await setDoc(doc(getCollectionRef('soat_cc_ranges'), id), { id, name: e.target['soat-cc-name'].value, vehicle_class: e.target['soat-cc-class-id'].value });
    e.target.reset();
}
function deleteSoatCCRangeWrapper(id, name) { showGeneralConfirmModal(id, name, 'Rango', (id)=>deleteDoc(doc(getCollectionRef('soat_cc_ranges'), id))); }

async function handleSoatPriceSubmit(e) {
    e.preventDefault();
    const id = `${e.target['soat-price-class'].value}_${e.target['soat-price-cc'].value}`;
    await setDoc(doc(getCollectionRef('precios_soat'), id), { id, vehicle_class: e.target['soat-price-class'].value, cc_range: e.target['soat-price-cc'].value, price: parseFloat(e.target['soat-price-value'].value) });
    e.target.reset();
}
function deleteSoatPriceWrapper(id, name) { showGeneralConfirmModal(id, name, 'Precio', (id)=>deleteDoc(doc(getCollectionRef('precios_soat'), id))); }