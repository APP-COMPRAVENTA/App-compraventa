// src/services/commissionService.js
import { db, activeTenantId } from '../config/firebase.js'; // Importamos activeTenantId
import { doc, setDoc } from 'firebase/firestore';
import { getColombiaNow } from '../utils/colombiaTime.js';

/**
 * Guarda la configuración de comisión
 * @param {string} employeeUid 
 * @param {Object} config - { venta_porcentaje: %, empeno_fijo: $ }
 */
export const saveCommissionConfig = async (employeeUid, config) => {
    try {
        if (!activeTenantId) throw new Error("No hay un Tenant ID activo");

        // IMPORTANTE: Usamos la ruta completa que usas en el resto del app
        const configRef = doc(db, 'tenants', activeTenantId, 'config_comisiones', employeeUid);
        const nowColombia = getColombiaNow();
        
        await setDoc(configRef, {
            venta_porcentaje: parseFloat(config.venta_porcentaje) || 0, // % sobre ahorro
            empeno_fijo: parseFloat(config.empeno_fijo) || 0,           // Bono fijo venta
            updatedAt: nowColombia.timestampMs,
            updatedAtColombia: nowColombia,
            tenantId: activeTenantId 
        }, { merge: true });
        
        console.log("✅ Configuración de comisión guardada en Firestore");
        return { success: true };
    } catch (error) {
        console.error("❌ Error en saveCommissionConfig:", error);
        return { success: false, error: error.message };
    }
};

// 🔥 ESTO SOLUCIONA TU ERROR DE "is not a function"
// Hace que la función sea accesible desde el onclick del HTML
window.saveCommissionConfig = saveCommissionConfig;
