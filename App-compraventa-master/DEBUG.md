# 🔍 Guía de Depuración

## Problema: La app se queda en "Cargando aplicación y autenticando..."

### ✅ PASO 1: Verificar que estás usando el servidor de desarrollo

**IMPORTANTE:** NO abras el HTML directamente en el navegador. Debes usar Vite.

1. Abre una terminal en la carpeta `frontend`
2. Ejecuta:
   ```bash
   npm run dev
   ```
3. Debería abrirse automáticamente en `http://localhost:5173`

### ✅ PASO 2: Revisar la consola del navegador

Abre las herramientas de desarrollador (F12) y ve a la pestaña **Console**. Deberías ver logs como:

```
🚀 [MAIN] Iniciando aplicación...
🔥 Inicializando Firebase...
⏳ Esperando confirmación de autenticación...
✅ Autenticado correctamente. UID: ...
✅ [MAIN] Firebase inicializado y usuario autenticado.
```

### ❌ Si ves errores de importación:

Si ves errores como:
- `Failed to resolve module "firebase/app"`
- `Cannot find module 'firebase/app'`

**Solución:** Asegúrate de estar usando el servidor de desarrollo (`npm run dev`), NO abrir el HTML directamente.

### ❌ Si no ves ningún log:

1. Verifica que el script se está cargando:
   - Ve a la pestaña **Network** en las herramientas de desarrollador
   - Busca `main.js` y verifica que se carga correctamente (status 200)

2. Verifica errores de JavaScript:
   - Ve a la pestaña **Console**
   - Busca errores en rojo

### 🔧 Comandos útiles:

```bash
# Instalar dependencias (si falta algo)
cd frontend
npm install

# Ejecutar servidor de desarrollo
npm run dev

# Verificar que Firebase está instalado
npm list firebase
```




