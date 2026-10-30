// js/services/admin.service.js
import { auth, activeTenantId } from '../config/firebase.js'; // <-- Importamos activeTenantId

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

// Helper para obtener cabeceras con el Token y el Tenant dinámico
export async function getAuthHeaders() {
    const user = auth.currentUser;
    if (!user) throw new Error("Usuario no autenticado");
    const token = await user.getIdToken();
    
    return {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'x-tenant-id': activeTenantId // <-- Ahora usamos el tenant activo (dinámico)
    };
}

// --- SUCURSALES (BRANCHES) ---

export async function createBranch(branchData) {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_URL}/branches`, {
        method: 'POST',
        headers,
        body: JSON.stringify(branchData)
    });
    const result = await response.json();
    if (!result.success) throw new Error(result.message);
    return result.data;
}

export async function getBranches() {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_URL}/branches`, { headers });
    const result = await response.json();
    if (!result.success) throw new Error(result.message);
    return result.data;
}


// --- FUNCIONES PARA SEDES (admin.service.js) ---

export async function updateBranch(branchId, branchData) {
    const headers = await getAuthHeaders();
    // Usamos PATCH porque así está en tu backend: router.patch('/:branchId', ...)
    const response = await fetch(`${API_URL}/branches/${branchId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(branchData)
    });
    const result = await response.json();
    if (!result.success) throw new Error(result.message);
    return result.data;
}

// OJO: Si quieres eliminar, debes agregar router.delete('/:branchId', ...) en tu backend
export async function deleteBranch(branchId) {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_URL}/branches/${branchId}`, {
        method: 'DELETE',
        headers
    });
    const result = await response.json();
    if (!result.success) throw new Error(result.message);
    return result;
}
// --- GESTIÓN DE EQUIPO (EMPLEADOS) ---

export async function inviteEmployee(employeeData) {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_URL}/tenants/me/users`, {
        method: 'POST',
        headers,
        body: JSON.stringify(employeeData)
    });
    const result = await response.json();
    if (!result.success) throw new Error(result.message);
    return result.data;
}

export async function getEmployees(branchId = null) {
    const headers = await getAuthHeaders();
    let url = `${API_URL}/tenants/me/users`;
    if (branchId) url += `?branchId=${branchId}`;
    
    const response = await fetch(url, { headers });
    const result = await response.json();
    if (!result.success) throw new Error(result.message);
    return result.data;
}

// --- NUEVAS FUNCIONES PARA SUPER ADMIN ---

/**
 * Obtiene todos los locales registrados en el sistema (Para el selector del Header)
 */
// Ejemplo para obtener la lista de empresas (donde te da el error)
export async function getAllTenants() {
    const headers = await getAuthHeaders();
    
    // Si no pones esto, enviará activeTenantId (que puede ser null o local-centro-01)
    // y el middleware te dará 401 porque el Super Admin vive en 'system'
    headers['x-tenant-id'] = 'system'; 

    const response = await fetch(`${API_URL}/super/tenants`, { headers });
    const result = await response.json();
    if (!result.success) throw new Error(result.message);
    return result.data;
}

/**
 * Obtiene la lista de personas que intentaron entrar y están en espera
 */
export async function getPendingApprovals() {
    const headers = await getAuthHeaders();
    headers['x-tenant-id'] = 'system';

    const response = await fetch(`${API_URL}/super/pending-users`, { headers });
    const result = await response.json();
    if (!result.success) throw new Error(result.message);
    return result.data;
}

/**
 * Aprueba a un usuario dándole un rol y asignándolo a un local
 */
export async function approveUser(userId, approvalData) {
    const headers = await getAuthHeaders();
    headers['x-tenant-id'] = 'system';

    const response = await fetch(`${API_URL}/super/approve-user/${userId}`, {
        method: 'POST',
        headers,
        body: JSON.stringify(approvalData) // { role: 'ADMIN', tenantId: '...' }
    });
    const result = await response.json();
    if (!result.success) throw new Error(result.message);
    return result.data;
}

export async function updateEmployeeStatus(userId, updates) {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_URL}/tenants/me/users/${userId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(updates)
    });
    const result = await response.json();
    if (!result.success) throw new Error(result.message);
    return result.data;
}

/**
 * Envía una solicitud para registrar una nueva empresa desde el Login
 */
export async function requestCompanyRegistration(companyName) {
    const user = auth.currentUser;
    if (!user) throw new Error("No hay sesión de Google activa");
    const token = await user.getIdToken();

    const response = await fetch('http://localhost:3000/api/v1/auth/register-company', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'x-tenant-id': 'system'
        },
        body: JSON.stringify({ companyName })
    });

    const result = await response.json();
    if (!result.success) throw new Error(result.error || "Error al registrar empresa");
    return result;
}

export async function getAllAdmins() {
    const headers = await getAuthHeaders();
    headers['x-tenant-id'] = 'system';

    const res = await fetch(`${API_URL}/super/admins`, { headers });
    const json = await res.json();
    if (!json.success) throw new Error(json.message);
    return json.data;
}

export async function updateAdminStatus(targetUid, newStatus) {
    const headers = await getAuthHeaders(); // Tu función que ya incluye el Token
    const response = await fetch(`${API_URL}/super/toggle-admin-status`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ targetUid, newStatus })
    });
    const result = await response.json();
    if (!result.success) throw new Error(result.message);
    return result;
}


/**
 * Actualiza el estado de privacidad de la empresa
 */
export async function updateTenantPrivacy(esPublico) {
    const headers = await getAuthHeaders();
    const response = await fetch(`${API_URL}/tenants/me/privacy`, { // Ajusta la URL a tu ruta
        method: 'PATCH',
        headers,
        body: JSON.stringify({ es_publico: esPublico })
    });
    const result = await response.json();
    if (!result.success) throw new Error(result.message);
    return result;
}