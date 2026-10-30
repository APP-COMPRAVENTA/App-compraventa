// js/store.js

// 1. Contenedor de datos único (La "Caja Fuerte")
const _state = {
    inventory: [],
    transactions: [],
    debts: [],
    savings: [],
    clients: [],
    others:[],
    providers: [],
    tramitador: [],
    sharedBrands: [],
    transfers: [],
    transferCostsConfig: [],
    suggestedPriceRules: [],
    damageDiscounts: [],
    compraAvaluos: [],
    soatClasses: [],
    soatCcRanges: [],
    soatPrices: [],
    // UI State (Buscadores)
    transferSearchTerm: '',
    inventorySearchTerm: '',
    debtSearchTerm: '',
    clientSearchTerm: '',
    providerSearchTerm: '',
    plantillasDepreciacion: [],
    costosPorCiudad: [],
    cotizadorReglas: [],   // NUEVO
    cotizadorCatalogo: [], // NUEVO
    vehicleAvaluos: [],
};

// 2. EXPORTACIONES (Variables que tus otros archivos importan)
// Usamos "export let" para que otros módulos puedan leerlas directamente
export let inventory = _state.inventory;
export let transactions = _state.transactions;
export let debts = _state.debts;
export let savings = _state.savings;
export let clients = _state.clients;
export let providers = _state.providers;
export let tramitador = _state.tramitador;
export let others =_state.others;
export let sharedBrands = _state.sharedBrands;
export let transfers = _state.transfers;
export let transferCostsConfig = _state.transferCostsConfig;
export let suggestedPriceRules = _state.suggestedPriceRules;
export let damageDiscounts = _state.damageDiscounts;
export let compraAvaluos = _state.compraAvaluos;
export let soatClasses = _state.soatClasses;
export let soatCcRanges = _state.soatCcRanges;
export let soatPrices = _state.soatPrices;

// ESTOS SON LOS QUE FALTABAN (Para arreglar el error de Inventario)
export let transferSearchTerm = _state.transferSearchTerm;
export let inventorySearchTerm = _state.inventorySearchTerm;
export let debtSearchTerm = _state.debtSearchTerm;
export let clientSearchTerm = _state.clientSearchTerm;
export let providerSearchTerm = _state.providerSearchTerm;
export let plantillasDepreciacion = _state.plantillasDepreciacion;
export let costosPorCiudad = _state.costosPorCiudad;


// Función especial para Balance
export const getTransferCostsConfig = () => _state.transferCostsConfig;

// 3. MUTATORS (Funciones que usa listeners.js)
// Al usar Object.assign, actualizamos la variable sin romper la importación
export function setInventory(data) { _state.inventory = data; inventory = data; }
export function setTransactions(data) { _state.transactions = data; transactions = data; }
export function setDebts(data) { _state.debts = data; debts = data; }
export function setSavings(data) { _state.savings = data; savings = data; }
export function setClients(data) { _state.clients = data; clients = data; }
export function setProviders(data) { _state.providers = data; providers = data; }
export function setTramitador(data) { _state.tramitador = data; tramitador = data; }
export function setOthers(data) {_state.others = data; others = data; }
export function setTransfers(data) { _state.transfers = data; transfers = data; }
export function setTransferCostsConfig(data) { _state.transferCostsConfig = data; transferCostsConfig = data; }
export function setSuggestedPriceRules(data) { _state.suggestedPriceRules = data; suggestedPriceRules = data; }
export function setDamageDiscounts(data) { _state.damageDiscounts = data; damageDiscounts = data; }
export function setCompraAvaluos(data) { _state.compraAvaluos = data; compraAvaluos = data; }
export function setSoatClasses(data) { _state.soatClasses = data; soatClasses = data; }
export function setSoatCcRanges(data) { _state.soatCcRanges = data; soatCcRanges = data; }
export function setSoatPrices(data) { _state.soatPrices = data; soatPrices = data; }

export function setPlantillasDepreciacion(data) { _state.plantillasDepreciacion = data; plantillasDepreciacion = data; }
export function setCostosPorCiudad(data) { _state.costosPorCiudad = data; costosPorCiudad = data; }

// --- UI MUTATORS ---
export function setTransferSearchTerm(term) { _state.transferSearchTerm = term; transferSearchTerm = term; }
export function setInventorySearchTerm(term) { _state.inventorySearchTerm = term; inventorySearchTerm = term; }
export function setDebtSearchTerm(term) { _state.debtSearchTerm = term; debtSearchTerm = term; }
export function setClientSearchTerm(term) { _state.clientSearchTerm = term; clientSearchTerm = term; }
export function setProviderSearchTerm(term) { _state.providerSearchTerm = term; providerSearchTerm = term; }
export function setTramitadorSearchTerm(term) { _state.tramitadorSearchTerm = term; tramitadorSearchTerm = term; }


// AGREGA ESTA LÍNEA:


console.log("STORE INSTANCIADO:", import.meta.url);
console.log("STORE CARGADO", Math.random());


//exclusivo de ahorros 
export let reglasDistribucion = [];
export let bolsillosUtilidad = [];

// Setters (para usarlos desde listeners.js)
export const setReglasDistribucion = (data) => {
    // Ordenamos siempre por prioridad (1, 2, 3...)
    reglasDistribucion = data.sort((a, b) => (a.priority || 99) - (b.priority || 99));
};

export const setBolsillosUtilidad = (data) => {
    bolsillosUtilidad = data;
};


// --- ESTADO DE COMISIONES ---



// --- SETTERS PARA TRABAJADORES Y COMISIONES ---

/**
 * Guarda todas las comisiones pendientes del tenant
 * Útil para que el dueño sepa cuánto debe en total.
 */
let comisionesPendientes = [];

export const setComisionesPendientes = (val) => {
    comisionesPendientes = val;
    // Si usas algún sistema de eventos o señales para avisar a la UI, dispáralo aquí
};

export let vehicleAvaluos = _state.vehicleAvaluos;

export const getComisionesPendientes = () => comisionesPendientes;

export const setVehicleAvaluos = (data) => {
    _state.vehicleAvaluos = data;
  };
  
  export const getVehicleAvaluos = () => _state.vehicleAvaluos;
  

// --- EXPORTS ---
export let cotizadorReglas = _state.cotizadorReglas;
export let cotizadorCatalogo = _state.cotizadorCatalogo;
export let cotizadorDanos = _state.cotizadorDanos;
// --- SETTERS ---
export const setCotizadorReglas = (data) => {
    _state.cotizadorReglas = data;
    cotizadorReglas = data;
};

export const setCotizadorCatalogo = (data) => {
    _state.cotizadorCatalogo = data;
    cotizadorCatalogo = data;
};

export const setCotizadorDanos = (data) => {
    _state.cotizadorDanos = data;
    cotizadorDanos = data;
};


export let debtActions = [];
export const setDebtActions = (arr) => debtActions = arr;
