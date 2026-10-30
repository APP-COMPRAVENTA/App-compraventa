// js/modules/login.js
import { BACKEND_URL, loginWithGoogle, logout } from '../config/firebase.js'; // <-- Agrega 'logout'

let activeTab = 'login'; // 'login' o 'register'

export function renderLogin() {
    const loginContainer = document.getElementById('login-container');
    
    loginContainer.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden transform transition-all duration-300">
            <div class="flex bg-slate-50 border-b border-slate-100">
                <button id="tab-login" class="flex-1 py-4 text-sm font-bold transition-all ${activeTab === 'login' ? 'bg-white text-emerald-600 border-b-2 border-emerald-500' : 'text-slate-400 hover:text-slate-600'}">
                    ENTRAR
                </button>
                <button id="tab-register" class="flex-1 py-4 text-sm font-bold transition-all ${activeTab === 'register' ? 'bg-white text-emerald-600 border-b-2 border-emerald-500' : 'text-slate-400 hover:text-slate-600'}">
                    REGISTRAR EMPRESA
                </button>
            </div>

            <div class="p-8">
                <div id="login-header" class="text-center mb-8">
                    <div class="w-16 h-16 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4 rotate-3">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                    </div>
                    <h2 id="form-title" class="text-2xl font-black text-slate-800 uppercase tracking-tight">
                        ${activeTab === 'login' ? 'Bienvenido de nuevo' : 'Crea tu espacio'}
                    </h2>
                    <p id="form-subtitle" class="text-slate-400 text-xs mt-1 font-medium">
                        ${activeTab === 'login' ? 'Ingresa a tu panel de control' : 'Registra tu negocio en segundos'}
                    </p>
                </div>

                <div id="login-feedback" class="hidden mb-6"></div>

                <div class="space-y-6">
                    <div id="company-field" class="${activeTab === 'register' ? 'block' : 'hidden'} animate-in fade-in slide-in-from-top-2">
                        <label class="block text-[10px] font-black text-slate-400 uppercase mb-2 ml-1">Nombre de tu Empresa</label>
                        <input type="text" id="company-name" placeholder="Ej: Distribuidora Global" 
                               class="w-full p-3.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all text-sm font-semibold">
                    </div>

                    <button id="btn-google" class="w-full flex items-center justify-center gap-3 bg-white border-2 border-slate-200 py-3.5 px-4 rounded-xl font-bold text-slate-700 hover:border-emerald-500 hover:bg-emerald-50/30 transition-all duration-200 group">
                        <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/layout/google.svg" class="w-5 h-5 group-hover:scale-110 transition-transform">
                        <span id="btn-text">${activeTab === 'login' ? 'Entrar con Google' : 'Registrar y Continuar'}</span>
                    </button>
                </div>

                <p class="mt-8 text-[10px] text-center text-slate-300 uppercase font-bold tracking-widest">
                    Sistema de Gestión Profesional
                </p>
            </div>
        </div>
    `;

    setupTabs();
    setupLoginLogic();
}

function setupTabs() {
    document.getElementById('tab-login').onclick = () => {
        activeTab = 'login';
        renderLogin();
    };
    document.getElementById('tab-register').onclick = () => {
        activeTab = 'register';
        renderLogin();
    };
}

function setupLoginLogic() {
    const btn = document.getElementById('btn-google');
    const feedback = document.getElementById('login-feedback');

    btn.onclick = async () => {
        try {
            const companyName = document.getElementById('company-name')?.value;
            
            feedback.classList.add('hidden');
            btn.disabled = true;
            btn.innerHTML = `<span class="animate-spin inline-block mr-2">⏳</span> Procesando...`;

            // 1. Login con Firebase / Google
            const result = await loginWithGoogle();
            const idToken = await result.user.getIdToken(); // 🌟 Sacamos el token de seguridad

            // 2. Si estamos en pestaña de REGISTRO
            if (activeTab === 'register') {
                if (!companyName || companyName.trim().length < 3) {
                    throw new Error("Escribe un nombre de empresa válido (mínimo 3 caracteres)");
                }
                
                const response = await fetch(`${BACKEND_URL}/auth/register-company`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${idToken}`
                    },
                    body: JSON.stringify({ companyName: companyName.trim() })
                });

                const data = await response.json();
                if (!data.success) throw new Error(data.error || "Error al registrar empresa");

                feedback.className = "mb-6 p-4 rounded-xl text-xs bg-indigo-50 text-indigo-700 border border-indigo-100 block";
                feedback.innerHTML = `🏢 ¡Solicitud Enviada! La empresa "<strong>${companyName}</strong>" ha sido registrada. El Super Admin la activará pronto.`;
                btn.classList.add('hidden');
                document.getElementById('company-field').classList.add('opacity-50', 'pointer-events-none');
                return;
            }

            // 3. 🌟 EL SECRETO ESTÁ AQUÍ: LLAMAMOS A TU FUNCIÓN 'SYNC' DEL BACKEND
            const syncResponse = await fetch(`${BACKEND_URL}/auth/sync`, {
                method: 'POST', // o GET, dependiendo de cómo lo tengas en tus rutas
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                }
            });

            const syncData = await syncResponse.json();
            const statusCode = syncResponse.status;

            // 4. Analizamos la respuesta del backend
            if (statusCode === 202) {
                feedback.className = "mb-6 p-4 rounded-xl text-xs bg-amber-50 text-amber-700 border border-amber-100 block";
                feedback.innerHTML = `⏳ <strong>Acceso Pendiente:</strong> Tu cuenta aún no ha sido aprobada por un administrador.`;
                btn.innerHTML = `<span>Intentar de nuevo</span>`;
                btn.disabled = false;
                
                // 🚨 CERRAMOS SESIÓN AQUÍ MISMO Y CORTAMOS LA FUNCIÓN
                await logout(); 
                return; 
            }
            else if (statusCode === 403) {
                // Si está desactivado
                throw new Error(syncData.message || "Tu cuenta ha sido desactivada por un administrador.");
            }
            else if (statusCode === 200 || statusCode === 201) {
                // ✅ ÉXITO: El backend ya lo procesó, borró la invitación y lo pasó a ACTIVE
                const nameToShow = result.user?.displayName || "Usuario";
                feedback.className = "mb-6 p-4 rounded-xl text-xs bg-emerald-50 text-emerald-700 border border-emerald-100 block";
                feedback.innerHTML = `✅ ¡Bienvenido, ${nameToShow}!`;
                setTimeout(() => { window.location.href = '/'; }, 1000);
            } 
            else {
                throw new Error(syncData.message || "Error de sincronización con el servidor");
            }

        } catch (error) {
            console.error("Error en Auth:", error);
            feedback.className = "mb-6 p-4 rounded-xl text-xs bg-red-50 text-red-700 border border-red-100 block";
            feedback.innerHTML = `⚠️ <strong>Error:</strong> ${error.message}`;
            btn.disabled = false;
            btn.innerHTML = `
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/layout/google.svg" class="w-5 h-5">
                <span>Continuar con Google</span>
            `;
        }
    };
}