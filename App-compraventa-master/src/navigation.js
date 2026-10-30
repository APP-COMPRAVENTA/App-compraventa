// js/navigation.js

// Importar todos los módulos de renderizado
import { renderHome } from './modules/home.js';
import { renderInventario } from './modules/inventario.js';
import { renderBalance } from './modules/balance.js';
import { renderDeudas } from './modules/deudas.js';
import { renderAhorros } from './modules/ahorros.js';
import { renderEstadisticas } from './modules/estadisticas.js';
import { renderClientes } from './modules/clientes.js';
import { renderProveedores } from './modules/proveedores.js';
import { renderTraspasos } from './modules/traspasos.js';
import { renderCotizadorCompra } from './modules/cotizador.js';
import {renderDirectorio }from './modules/directorio.js';
import { renderHistorialPersona } from './modules/historialPersona.js';
import { renderAdmin } from './modules/admin.js';
import { renderAgente } from './modules/agente/index.js';
// Importamos currentUser para saber si es invitado o usuario real
 


export let currentModule = ''; 

export function setupNavigation() {
    document.querySelectorAll('.nav-item').forEach(button => {
        button.addEventListener('click', (e) => {
            const module = e.currentTarget.dataset.module;
            navigateTo(module);
        });
    });
}

/**
 * Función principal de navegación con "Modo Invitado"
 */
/**
 * Retorna un HTML de carga elegante centrado verticalmente
 */
function showLoadingSpinner(container) {
    container.innerHTML = `
        <div class="flex flex-col items-center justify-center h-[70vh] animate-fade-in">
            <div class="relative">
                <div class="w-16 h-16 rounded-full absolute border-4 border-gray-200"></div>
                <div class="w-16 h-16 rounded-full animate-spin absolute border-4 border-emerald-500 border-t-transparent"></div>
            </div>
            <p class="mt-20 text-gray-400 text-sm font-medium animate-pulse">
                Cargando información...
            </p>
        </div>
    `;
}
// En js/navigation.js

export async function navigateTo(module, forceRefresh = false) {
    // 1. Validación inicial (igual que antes)
    if (!forceRefresh && currentModule === module) return;
    
    currentModule = module;

    // 2. Actualizar botones del menú (igual que antes)
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.classList.remove('active', 'text-emerald-500');
        btn.classList.add('text-gray-500');
    });
    
    const currentNavButton = document.querySelector(`#nav-${module}`);
    if (currentNavButton) {
        currentNavButton.classList.add('active', 'text-emerald-500');
        currentNavButton.classList.remove('text-gray-500');
    }

    const contentDiv = document.getElementById('content');
    
    // --- CAMBIO AQUÍ: EN LUGAR DE LIMPIAR, MOSTRAMOS EL LOADER ---
    window.scrollTo(0, 0); 
    showLoadingSpinner(contentDiv); 
    // -------------------------------------------------------------

    // 3. Cargar el módulo (el await pausará aquí, mostrando el loader)
    // Cuando el renderFinalice (ej: renderInventario), ese módulo sobreescribirá 
    // el loader con el contenido real.
    try {
        switch (module) {
            case 'home': await renderHome(); break;
            case 'inventario': await renderInventario(); break;
            case 'balance': await renderBalance(); break;
            case 'deudas': await renderDeudas(); break;
            case 'ahorros': await renderAhorros(); break;
            case 'estadisticas': await renderEstadisticas(); break;
            case 'clientes': await renderClientes(); break; 
            case 'proveedores': await renderProveedores(); break; 
            case 'traspasos': await renderTraspasos(); break;
            case 'cotizador': await renderCotizadorCompra(); break;
            case 'directorio': await renderDirectorio(); break;
            case 'admin': await renderAdmin(); break;
            case 'agente': await renderAgente(); break;
            case 'historial':  renderHistorialPersona(true); break;
            default: await renderHome();
        }
    } catch (error) {
        console.error("Error cargando módulo:", error);
        contentDiv.innerHTML = `<p class="text-center text-red-500 p-10">Error al cargar la sección. Intenta de nuevo.</p>`;
    }
}

/**
 * Función mágica: Bloquea la interacción si no estás logueado
 */


// Helper global para abrir el login (lo usaremos en utils y main)
window.triggerLoginModal = () => {
    document.getElementById('app-container').classList.add('hidden');
    document.getElementById('bottom-nav').classList.add('hidden');
    document.getElementById('login-container').classList.remove('hidden');
    // Importante: aquí podríamos llamar a renderLogin() si fuera necesario
    // pero usualmente ya está renderizado o se renderiza en main.js
    import('./modules/login.js').then(module => module.renderLogin());
};
window.currentModule = currentModule;
