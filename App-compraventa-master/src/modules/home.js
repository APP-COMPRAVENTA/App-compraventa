// js/modules/home.js

import { navigateTo } from '../navigation.js';
import { renderHeader } from '../utils/utils.js';
import { userRole } from '../config/firebase.js'; 
// Exponer navigateTo al objeto window para que los onclick="navigateTo(...)" 
// que están dentro del HTML de los botones funcionen correctamente.
window.navigateTo = navigateTo;

/**
 * Renderiza la pantalla principal (Home)
 * @param {Object} currentUser - Objeto del usuario autenticado proveniente de Firebase/Backend
 */
export async function renderHome(currentUser) {
    const contentDiv = document.getElementById('content');
    
    // Verificación de seguridad: Si no existe el contenedor, no hacemos nada
    if (!contentDiv) {
        console.error("No se encontró el contenedor #content");
        return;
    }

    // Limpiamos el contenido anterior para asegurar un renderizado limpio
    contentDiv.innerHTML = '';

    // Extraemos el ID o nombre para el encabezado (usamos el encadenamiento opcional ?.)
    const userId = currentUser?.displayName || currentUser?.email || 'Usuario';

    // 1. Renderizar el encabezado (Header) usando la utilidad compartida
    // Esto crea el título "APP Compraventa" y la barra superior
    const headerHtml = await renderHeader(
        'APP Compraventa',
        'Accesos rápidos a la gestión de tu compraventa.',
        userId
    );
    contentDiv.innerHTML = headerHtml;

    // 2. Definición de los módulos disponibles en el Home
    
  const modules = [
      { name: 'Ahorros', module: 'ahorros', color: 'bg-indigo-100 text-indigo-800', icon: '🏦' },
      { name: 'Balance', module: 'balance', color: 'bg-emerald-100 text-emerald-800', icon: '💰' },
      { name: 'Cartera', module: 'deudas', color: 'bg-red-100 text-red-800', icon: '📄' },
      { name: 'Directorio', module: 'directorio', color: 'bg-emerald-100 text-emerald-800', icon: '👥' },
      { name: 'Inventario', module: 'inventario', color: 'bg-indigo-100 text-indigo-800', icon: '📦' },
      { name: 'Agente IA', module: 'agente', color: 'bg-cyan-100 text-cyan-800', icon: '🤖' },
      { name: 'Traspasos', module: 'traspasos', color: 'bg-purple-100 text-purple-800', icon: '🔄' },
      { name: 'Estadísticas', module: 'estadisticas', color: 'bg-sky-100 text-sky-800', icon: '📊' },
      { name: 'Historial', module: 'historial', color: 'bg-slate-100 text-slate-800', icon: '🕒' },
      { name: 'Cotizador', module: 'cotizador', color: 'bg-green-100 text-green-800', icon: '🏷️' },
  ];
// --- SEGURIDAD: Solo añadir Admin si el rol es ADMIN ---

if (userRole === 'ADMIN' || userRole === 'SUPER_ADMIN') {
    modules.push({ name: 'Administración', module: 'admin', color: 'bg-gray-800 text-white', icon: '⚙️' });
}
  const gridHtml = modules.map(m => `
      <button onclick="navigateTo('${m.module}')"
          class="p-4 card rounded-xl ${m.color} hover:ring-2 hover:ring-emerald-400 transition">
          <div class="text-2xl">${m.icon}</div>
          <p class="text-sm font-semibold mt-2">${m.name}</p>
      </button>
  `).join('');

  contentDiv.insertAdjacentHTML(
      'beforeend',
      `<div class="mt-4 grid grid-cols-3 gap-4">${gridHtml}</div>`
  );
}
