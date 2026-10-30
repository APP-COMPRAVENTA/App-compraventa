// frontend/src/config/firebase.js
import { initializeApp } from "firebase/app";
import { doc, getFirestore, onSnapshot } from "firebase/firestore";
import { 
  getAuth, 
  onAuthStateChanged, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut 
} from "firebase/auth";
import { getStorage } from "firebase/storage";

export const BACKEND_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

export const appId = firebaseConfig.appId; 
export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);

// --- ESTADO DEL USUARIO ---
// Ya no guardamos solo el ID, guardamos todo el perfil
export let currentUser = null; 
export let userRole = null;    
export let isAuthReady = false;
export let userStatus = null; // <-- Nueva variable para rastrear estados como 'PENDING_APPROVAL'

export let activeTenantId = localStorage.getItem('activeTenantId') || null;

// Al final de tu archivo de configuración de Firebase
export let currentBranchId = localStorage.getItem('selectedBranchId') || null;

// 1. Esta se mantiene igual, es para manejo interno de sucursales
export function setSelectedBranch(branchId) {
  currentBranchId = branchId;
  localStorage.setItem('selectedBranchId', branchId);
}




let statusUnsubscribe = null; // Variable para guardar el listener

// 1. Función para iniciar la vigilancia
export function watchUserStatus(tenantId, uid) {
    // Si ya hay un vigilante, lo quitamos para no duplicar
    if (statusUnsubscribe) statusUnsubscribe();

    console.log(`👀 Iniciando vigilancia de estado para: ${uid} en ${tenantId}`);

    const userRef = doc(db, 'tenants', tenantId, 'users', uid);

    statusUnsubscribe = onSnapshot(userRef, (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            // SI EL ESTADO CAMBIA A DISABLED
            if (data.status === 'DISABLED' || data.status === 'INACTIVE') {
                console.warn("⛔ ALERTA: Usuario desactivado en tiempo real.");
                forceLogout("Tu cuenta ha sido desactivada por un administrador.");
            }
        } else {
            // Si el documento es borrado, también lo sacamos
            forceLogout("Tu perfil de usuario ha dejado de existir.");
        }
    }, (error) => {
        console.error("Error vigilando estado:", error);
    });
}

// 2. Función auxiliar para sacar al usuario a la fuerza
async function forceLogout(message) {
    if (statusUnsubscribe) statusUnsubscribe(); // Dejar de vigilar
    statusUnsubscribe = null;
    
    await signOut(auth);
    limpiarEstado();
    
    // Usamos un alert nativo o SweetAlert si lo tienes
    alert(`⚠️ SESIÓN CERRADA\n\n${message}`);
    window.location.href = '/'; // Recargar a la pantalla de login
}

// 2. FUNCIÓN DE LOGIN CORREGIDA

export async function loginWithGoogle() {
  const provider = new GoogleAuthProvider();
  const result = await signInWithPopup(auth, provider);
  const token = await result.user.getIdToken();

  try {
      const response = await fetch(`${BACKEND_URL}/auth/sync`, {
          method: 'POST',
          headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
              'x-tenant-id': activeTenantId || 'system'
          }
      });

      const backendData = await response.json();
      
      // Si el backend responde (sea 200 o 202), guardamos datos
      if (response.ok || response.status === 202) {
          const userData = backendData.data || {};
          currentUser = {
              uid: result.user.uid,
              email: result.user.email,
              displayName: userData.displayName || result.user.displayName,
              tenantId: userData.tenantId || 'system',
              role: userData.role || 'GUEST'
          };
          isAuthReady = true;
          watchUserStatus(currentUser.tenantId, currentUser.uid);
          return { success: true, user: result.user, backend: userData, status: response.status };
      }
      
      // Si el backend da un error controlado (401, 403)
      throw new Error(backendData.message || "Error de sincronización");

  } catch (error) {
      console.warn("⚠️ El backend no pudo sincronizar, pero Google sí:", error.message);
      // IMPORTANTE: Devolvemos el usuario de Google para que el proceso de "Registrar Empresa" pueda seguir
      return { success: true, user: result.user, errorSync: true }; 
  }
}
// --- 2. FUNCIÓN DE LOGOUT ---
export async function logout() {
  try {
    await signOut(auth);
    currentUser = null;
    userRole = null;
    console.log("🔒 Sesión cerrada");
    window.location.reload(); // Recargar para limpiar la UI
  } catch (error) {
    console.error("Error al cerrar sesión:", error);
  }
}

// El Tenant ID ahora se recupera de localStorage para recordar la elección del Super Admin


export function setActiveTenantId(id) {
  if (!id) return; // Seguridad: no guardar valores nulos
  
  activeTenantId = id;
  localStorage.setItem('activeTenantId', id);
  
  console.log(`🏢 Contexto de empresa cambiado a: ${id}`);
}

export function initializeFirebase() {
  return new Promise((resolve) => {
    onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const token = await user.getIdToken();
          
          // 1. OBTENEMOS EL ID QUE TENGAMOS GUARDADO
          // Si es la primera vez, usaremos 'system' para que el middleware no nos bloquee
          const savedTenantId = localStorage.getItem('activeTenantId') || 'system';

          const response = await fetch(`${BACKEND_URL}/auth/sync`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
              'x-tenant-id': savedTenantId // <--- IMPORTANTE: Enviar siempre un ID
            }
          });
          
          const backendData = await response.json();

          // STATUS 201 o 200: El usuario ya está aprobado y mapeado
          if (response.status === 201 || response.status === 200) {
            const userData = backendData.data;

            // 2. ACTUALIZACIÓN CRÍTICA: 
            // Si el backend nos encontró en el "Mapa Global", nos dirá su tenantId real
            if (userData.tenantId) {
                activeTenantId = userData.tenantId;
                localStorage.setItem('activeTenantId', activeTenantId);
            }
            watchUserStatus(userData.tenantId, user.uid);

            currentUser = {
              uid: user.uid,
              email: user.email,
              photoURL: user.photoURL,
              displayName: userData.displayName || user.displayName,
              tenantId: userData.tenantId,
              role: userData.role,
              branchId: userData.branchId,
              commissions: userData.commissions || {}
          };
          userRole = userData.role;
          
          // 🚨 NUEVO: Forzar la sede global para que los datos descarguen correctamente
          if (userRole === 'EMPLOYEE' && userData.branchId) {
              setSelectedBranch(userData.branchId);
          }

          userStatus = 'ACTIVE';
          isAuthReady = true;

          } else if (response.status === 202) {
            // STATUS 202: Usuario registrado pero esperando aprobación (PENDING_APPROVAL)
            currentUser = { 
                uid: user.uid, 
                email: user.email,
                displayName: user.displayName || 'Usuario en Revisión' 
            };
            userRole = 'GUEST'; 
            userStatus = 'PENDING_APPROVAL';
            isAuthReady = true;
            
          } else {
            // Error de autenticación o prohibido
            console.warn("Acceso denegado por el backend");
            await signOut(auth);
            limpiarEstado();
          }
        } catch (e) {
          console.error("❌ Error reconectando sesión:", e);
          limpiarEstado();
        }
      } else {
        limpiarEstado();
      }
      resolve(currentUser);
    });
  });
}

// Función auxiliar para resetear todo cuando no hay sesión
function limpiarEstado() {
  currentUser = null;
  userRole = null;
  userStatus = null;
  isAuthReady = false;
  activeTenantId = null;
  localStorage.removeItem('activeTenantId');
  localStorage.removeItem('selectedBranchId'); // <-- Agrega esta línea para borrar el rastro
}