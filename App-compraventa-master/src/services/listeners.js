// src/services/listeners.js
import { collection, onSnapshot } from "firebase/firestore"; 
import { db, isAuthReady, appId, currentBranchId, activeTenantId } from '../config/firebase.js';
import {
    setInventory, setTransactions, setDebts, setSavings, setClients, setProviders,
    setTransfers, setTransferCostsConfig, setVehicleAvaluos, setSuggestedPriceRules,
    setDamageDiscounts, setCompraAvaluos, setSoatClasses, setSoatCcRanges, setSoatPrices,
    setOthers,
    setBolsillosUtilidad,
    setReglasDistribucion,
    setComisionesPendientes,
    setTramitador,
    setCostosPorCiudad,
    setPlantillasDepreciacion,
    setCotizadorReglas,
    setCotizadorCatalogo,
    setCotizadorDanos,
    getVehicleAvaluos,
    setDebtActions
} from '../store/store.js';
import { currentModule, navigateTo } from '../navigation.js';
import { renderAvaluosConfig } from "../modules/traspasos.js";

const PUBLIC_PATH = `/artifacts/${appId}/public/data`;

export const getCollectionRef = (collectionName) => {
    if (!db || !activeTenantId) return null;
  
    // Si hay sede seleccionada → usar subcolección por sede
    if (currentBranchId) {
      return collection(
        db,
        `tenants/${activeTenantId}/branches/${currentBranchId}/${collectionName}`
      );
    }
  
    // Fallback: datos al nivel del tenant
    return collection(
      db,
      `tenants/${activeTenantId}/${collectionName}`
    );
  };
  
export function initializeDataListeners() {
    // Si la DB no ha cargado, esperamos 1 segundo y reintentamos
    if (!db) {
        console.warn("⚠️ Esperando a Firestore...");
        setTimeout(initializeDataListeners, 1000);
        return;
    }

    console.log("✅ Conectando Listeners en:", PUBLIC_PATH);

    // 1. COSTOS DE TRASPASOS (El que faltaba)
    const costosRef = getCollectionRef('costos_traspasos');
    if (costosRef) {
      onSnapshot(costosRef, (snap) => {
        setTransferCostsConfig(snap.docs.map(d => ({id: d.id, ...d.data()})));
        // NUEVO: Le avisamos al HTML que los Costos cambiaron
        window.dispatchEvent(new Event('transferCostsUpdated')); 
      });
    }

    // --- ESCUCHAR AVALÚOS DE VEHÍCULOS ---
    const avaluosRef = getCollectionRef('avaluos_vehiculos');
    console.log('[DEBUG] avaluosRef ->', avaluosRef);
    
    if (avaluosRef) {
      onSnapshot(avaluosRef,
        (snapshot) => {
    
          const listaAvaluos = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
    
          console.log('[DEBUG] onSnapshot - listaAvaluos recibida:', listaAvaluos);
    
          // 🔥 Guardamos en store
          setVehicleAvaluos(listaAvaluos);
    
          // 🔥 Disparamos evento reactivo
          window.dispatchEvent(new Event('vehicleAvaluosUpdated'));
    
          // 🔎 Debug limpio
          console.log('[DEBUG] after setVehicleAvaluos ->', getVehicleAvaluos());
        },
        (err) => {
          console.error('[ERROR] onSnapshot avaluos_vehiculos:', err);
        }
      );
    } else {
      console.warn('[WARN] getCollectionRef("avaluos_vehiculos") devolvió falsy');
    }
    
    // 2. CAJAS / AHORROS
    const ahorrosRef = getCollectionRef('ahorros');
    if (ahorrosRef) {
        onSnapshot(ahorrosRef, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setSavings(data); 
            // Refresca si estás en ahorros o balance
            if (currentModule === 'ahorros' || currentModule === 'balance') navigateTo(currentModule, true);
        });
    }

    
    // Añadir esto dentro de initializeDataListeners() en listeners.js

// --- ESCUCHAR REGLAS DE DISTRIBUCIÓN ---
const reglasRef = getCollectionRef('reglas_distribucion');
if (reglasRef) {
    onSnapshot(reglasRef, (snapshot) => {
        const reglas = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        // Asumiendo que crearás setReglas en tu store.js
        setReglasDistribucion(reglas.sort((a, b) => a.priority - b.priority));
    });
}

// --- ESCUCHAR BOLSILLOS (SALDOS VIRTUALES) ---
const bolsillosRef = getCollectionRef('bolsillos_utilidad');
if (bolsillosRef) {
    onSnapshot(bolsillosRef, (snapshot) => {
        const bolsillos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setBolsillosUtilidad(bolsillos);
        if (currentModule === 'ahorros') navigateTo('ahorros', true);
    });
}


    // 3. INVENTARIO
    const inventoryRef = getCollectionRef('inventario');
    if (inventoryRef) {
        onSnapshot(inventoryRef, (snapshot) => {
            setInventory(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            if (currentModule === 'inventario') navigateTo('inventario', true);
        });
    }

    // 4. TRANSACCIONES
// 4. TRANSACCIONES (Versión Unificada y Normalizada)
const transRef = getCollectionRef('transacciones'); // Asegúrate que en Firebase sea 'transacciones'
if (transRef) {
    onSnapshot(transRef, (snapshot) => {
        const data = snapshot.docs.map(doc => {
            const d = doc.data();
            return {
                id: doc.id,
                date: d.date ?? null,
                type: d.type ?? null,
                category: d.category ?? null,
                amount: Number(d.amount ?? 0),
                description: d.description ?? null,
                status: d.status ?? 'ACTIVA',
                timestamp: d.timestamp ?? d.date ?? 0,

                distributedAmount: Number(d.distributedAmount ?? 0),

                // 🔑 ESTA ES LA NORMALIZACIÓN QUE REPARA EL CLIC
                related_id: d.related_id ?? null,
                // Si en Firebase es related_type, aquí lo convertimos a related_role
                related_role: d.related_role ?? d.related_type ?? 'CLIENTE', 
                related_name: d.related_name ?? d.thirdParty ?? '—',

                relation_plate: d.relation_plate ?? d.placa ?? null,
                source: d.source ?? '—',
                payment_accounts: Array.isArray(d.payment_accounts) ? d.payment_accounts : []
            };
        });

        console.log("💳 Transacciones actualizadas y normalizadas");
        setTransactions(data);
        
        // Solo refrescar si estamos viendo el balance
        if (currentModule === 'balance') navigateTo('balance', true);
    });
}

    // 5. DEUDAS
    const deudasRef = getCollectionRef('deudas');
    if (deudasRef) {
        onSnapshot(deudasRef, (snapshot) => {
            setDebts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
            if (currentModule === 'deudas') navigateTo('deudas', true);
        });
    }

    // 6. PROVEEDORES
    const providersRef = getCollectionRef('proveedores');
    if (providersRef) {
        onSnapshot(providersRef, (snapshot) => {
            setProviders(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
    }

    const tramitadorRef = getCollectionRef('tramitadores');
    if (tramitadorRef) {
        onSnapshot(tramitadorRef, (snapshot) => {
            setTramitador(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
    }


    const debtActionsRef = getCollectionRef('debt_actions');
if (debtActionsRef) {
  onSnapshot(debtActionsRef, snap => {
    setDebtActions(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  });
}



// 6. CLIENTES
const clientsRef = getCollectionRef('clientes');
if (clientsRef) {
    onSnapshot(clientsRef, (snapshot) => {
        setClients(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });
}

// Otros (contactos sencillos)
onSnapshot(getCollectionRef('otros'), (snapshot) => {
    // cada doc tendrá { id: doc.id, ...doc.data() }
    setOthers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    console.log("Otros actualizados:", snapshot.docs.length);
    if (currentModule === 'directorio') navigateTo('directorio', true);
  }, (error) => console.error("Error fetching otros:", error));
  
// En listeners.js, dentro de initializeDataListeners()

// --- ESCUCHAR GESTIONES DE TRASPASOS ---
const transfersRef = getCollectionRef('transfers'); // Asegúrate que el nombre en Firebase sea 'transfers'
if (transfersRef) {
  onSnapshot(transfersRef, (snap) => {
    setTransfers(snap.docs.map(d => ({id: d.id, ...d.data()})));
    // NUEVO: Le avisamos al HTML que el Historial cambió
    window.dispatchEvent(new Event('transfersUpdated')); 
  });
}

// En listeners.js - Dentro de initializeDataListeners()

// --- ESCUCHAR DATOS SOAT ---
const soatClassesRef = getCollectionRef('soat_classes');
if (soatClassesRef) onSnapshot(soatClassesRef, (snap) => setSoatClasses(snap.docs.map(d => ({id: d.id, ...d.data()}))));

const soatRangesRef = getCollectionRef('soat_cc_ranges');
if (soatRangesRef) onSnapshot(soatRangesRef, (snap) => setSoatCcRanges(snap.docs.map(d => ({id: d.id, ...d.data()}))));

// --- EJEMPLO PARA TU COLECCIÓN DE SOAT ---
const soatPricesRef = getCollectionRef('soat_prices');
if (soatPricesRef) {
  onSnapshot(soatPricesRef, (snap) => {
    setSoatPrices(snap.docs.map(d => ({id: d.id, ...d.data()})));
    // NUEVO: Le avisamos al HTML que el SOAT cambió
    window.dispatchEvent(new Event('soatPricesUpdated')); 
  });
}

// --- ESCUCHAR COMISIONES PENDIENTES ---
const commRef = getCollectionRef('comisiones_pendientes');
    
if (commRef) {
    onSnapshot(commRef, (snapshot) => {
        const lista = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));
        
        // Guardamos en el store
        setComisionesPendientes(lista);
        
        console.log("💰 Comisiones sincronizadas:", lista.length);
        
        // Si el usuario está parado en el módulo de comisiones, refrescamos la vista
        // 🔥 AGREGA ESTO: Refrescar si estás en el directorio
 
      
    }, (error) => {
        console.error("Error en listener de comisiones:", error);
    });
}

// --- ESCUCHAR PLANTILLAS DE DEPRECIACION ---
const plantillasRef = getCollectionRef('plantillas_depreciacion');
if (plantillasRef) {
  onSnapshot(plantillasRef, (snapshot) => {
    const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    setPlantillasDepreciacion(list);
    console.log("📘 Plantillas de depreciación cargadas:", list.length);
  }, (err) => console.error("Error cargando plantillas_depreciacion:", err));
}

// --- ESCUCHAR COSTOS POR CIUDAD (para el cotizador) ---
const costosCiudadRef = getCollectionRef('costos_por_ciudad') || getCollectionRef('costos_ciudad');
if (costosCiudadRef) {
  onSnapshot(costosCiudadRef, (snapshot) => {
    const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
    setCostosPorCiudad(list);
    console.log("📍 Costos por ciudad cargados:", list.length);
  }, (err) => console.error("Error cargando costos_por_ciudad:", err));
}



// --- LISTENER: REGLAS DEL COTIZADOR ---
const cotizadorReglasRef = getCollectionRef('cotizador_reglas');
if (cotizadorReglasRef) {
    onSnapshot(cotizadorReglasRef, (snapshot) => {
        const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        setCotizadorReglas(list);
        console.log("📏 Reglas cotizador cargadas:", list.length);
        
        // Refrescar si estamos en el módulo cotizador
        if (window.currentModule === 'cotizador') {
            import('../modules/cotizador.js').then(m => m.renderCotizadorCompra());
        }
    });
}


const cotizadorDanosRef = getCollectionRef('cotizador_danos');
if (cotizadorDanosRef) {
    onSnapshot(cotizadorDanosRef, (snapshot) => {
        const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        setCotizadorDanos(list);  
        // Refrescar si estamos en el módulo cotizador
        if (window.currentModule === 'cotizador') {
            import('../modules/cotizador.js').then(m => m.renderCotizadorCompra());
        }
    });
}
// --- LISTENER: CATÁLOGO DE MOTOS ---
const catalogoRef = getCollectionRef('cotizador_catalogo');
if (catalogoRef) {
    onSnapshot(catalogoRef, (snapshot) => {
        const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        setCotizadorCatalogo(list);
        console.log("🏍️ Catálogo cotizador cargado:", list.length);
        
        // Refrescar si estamos en el módulo cotizador
        if (window.currentModule === 'cotizador') {
            import('../modules/cotizador.js').then(m => m.renderCotizadorCompra());
        }
    });
}

}



