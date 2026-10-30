// main.js
import { initializeFirebase, logout as firebaseSignOut, currentUser } from './config/firebase.js';
import { initializeDataListeners } from './services/listeners.js'; 
import { setupNavigation, navigateTo } from './navigation.js';
import { renderLogin } from './modules/login.js';


// ==========================================
// 🛡️ EL GUARDAESPALDAS INVISIBLE (INTERCEPTOR)
// ==========================================
// MODIFICACIÓN EN main.js (El interceptor)

document.addEventListener('click', (e) => {
  // 1. Si hay usuario O si el clic es automático del sistema (!e.isTrusted), dejamos pasar.
  if (currentUser || !e.isTrusted) return;

  const isNavigation = e.target.closest('.nav-item') || e.target.closest('#bottom-nav');
  const isLoginButton = e.target.closest('#btn-login-header'); 
  
  if (isNavigation || isLoginButton) return;

  const contentArea = document.getElementById('content');
  
  if (contentArea && contentArea.contains(e.target)) {
      const elementTouched = e.target.closest('button, input, select, textarea, a, .cursor-pointer');

      if (elementTouched) {
          // --- NUEVA REGLA: Dejar pasar si el botón es para navegar ---
          const clickAction = elementTouched.getAttribute('onclick') || "";
          if (clickAction.includes('navigateTo')) {
              return; // No bloqueamos, dejamos que navegue al módulo
          }

          // Si no es para navegar, entonces sí bloqueamos (es una acción de DB)
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();

          console.log("🚫 Acción bloqueada: Solo lectura");
          window.triggerLoginModal();
      }
  }
}, true);

// 1. GLOBALIZAR NAVIGATETO
window.navigateTo = navigateTo;

// Verificación de entorno (igual que antes)
if (window.location.protocol === 'file:') {
  alert("Usa un servidor local");
  throw new Error("Protocolo file:// no soportado");
}

async function startApp() {
    const loader = document.getElementById('loader');
    const appContainer = document.getElementById('app-container');
    const loginContainer = document.getElementById('login-container');
    const bottomNav = document.getElementById('bottom-nav'); 
    const contentContainer = document.getElementById('content'); 

    try {
      console.log("🚀 [MAIN] Iniciando...");
      
      
      // Esperar a Firebase
      const user = await initializeFirebase();

      if (loader) loader.classList.add('hidden');

      // --- CAMBIO CLAVE AQUÍ ---
      // Ya no usamos "if (user) { app } else { login }"
      // Ahora SIEMPRE mostramos la app, el bloqueo lo hace navigation.js
      
      console.log(user ? `✅ Usuario: ${user.displayName}` : "👀 Modo Invitado");

      // 1. Mostrar la App SIEMPRE (App Shell)
      if(appContainer) appContainer.classList.remove('hidden');
      if(bottomNav) bottomNav.classList.remove('hidden');
      if(contentContainer) contentContainer.classList.remove('hidden');
      
      // Ocultar Login por defecto (se abrirá solo si hacen click en "Ingresar")
      if(loginContainer) loginContainer.classList.add('hidden');

      // 2. Configurar Navegación
      setupNavigation();      

      // 3. Cargar Listeners SOLO si hay usuario (para evitar errores de permisos)
      if (user) {
          initializeDataListeners(); 
      } else {
          console.log("🔒 Listeners pausados (Modo Invitado)");
      }
      
      // 4. Ir a Home
      navigateTo('home');
  
    } catch (error) {
      console.error("❌ [MAIN] Error crítico:", error);
      if(loader) loader.innerHTML = `<p class="text-red-500">Error: ${error.message}</p>`;
    }
}

document.addEventListener('DOMContentLoaded', startApp);