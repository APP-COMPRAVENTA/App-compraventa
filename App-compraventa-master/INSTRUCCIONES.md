# 🚀 INSTRUCCIONES PARA EJECUTAR LA APLICACIÓN

## ⚠️ IMPORTANTE: NO abras el HTML directamente en el navegador

Si abres `index.html` directamente en el navegador, **NO funcionará** porque los imports de módulos npm (`firebase/app`, etc.) requieren un servidor de desarrollo.

## ✅ Pasos correctos:

### 1. Abre una terminal en la carpeta `frontend`

```bash
cd frontend
```

### 2. Instala las dependencias (si no lo has hecho)

```bash
npm install
```

### 3. Ejecuta el servidor de desarrollo

```bash
npm run dev
```

### 4. El navegador se abrirá automáticamente

Debería abrirse en `http://localhost:5173`

## 🔍 Si sigue sin funcionar:

1. **Abre la consola del navegador** (F12 → pestaña Console)
2. **Busca errores en rojo** y compártelos
3. **Verifica los logs** - deberías ver:
   ```
   🚀 [MAIN] Iniciando aplicación...
   🔥 Inicializando Firebase...
   ⏳ Esperando confirmación de autenticación...
   ✅ Autenticado correctamente. UID: ...
   ```

## ❌ Errores comunes:

### Error: "Failed to resolve module 'firebase/app'"
**Causa:** Estás abriendo el HTML directamente en el navegador
**Solución:** Ejecuta `npm run dev` en la terminal

### Error: "Cannot find module"
**Causa:** Dependencias no instaladas
**Solución:** Ejecuta `npm install` en la carpeta `frontend`

### La app se queda cargando infinitamente
**Causa:** Error silencioso en la autenticación
**Solución:** Revisa la consola del navegador (F12) para ver errores específicos




