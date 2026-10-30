/**
 * Calcula la distribución de utilidades basada en reglas de prioridad.
 * @param {number} utilidadNeta - El monto real de ganancia a repartir (Venta - Costos).
 * @param {Array} reglas - Array de objetos reglas (ordenado por prioridad).
 * @returns {Array} Array de transacciones a aplicar a los bolsillos.
 */
// Reemplaza la función existente en financeLogic.js por esta exacta
export function calcularDistribucionUtilidad(utilidadNeta, reglas) {
    // Validaciones tempranas
    if (!Array.isArray(reglas)) return []; 
    if (typeof utilidadNeta !== 'number') utilidadNeta = Number(utilidadNeta) || 0;
    if (utilidadNeta <= 0) return [];

    let remanente = utilidadNeta;
    const movimientos = [];

    // CORRECCIÓN: usar 'reglas' (no .reglas) y defensiva ante objetos malformados
    const reglasOrdenadas = Array.from(reglas || []).slice().sort((a, b) => (Number(a.priority) || 0) - (Number(b.priority) || 0));

    for (const regla of reglasOrdenadas) {
        if (remanente <= 0) break;

        // defensiva: asegúrate de tener name/type/value mínimos
        const { type = 'PORCENTAJE', value = 0, name = 'SIN_NOMBRE', id = null } = regla || {};

        let montoAhorro = 0;
        let esParcial = false;

        if (type === 'FIJO') {
            if (remanente >= Number(value || 0)) {
                montoAhorro = Number(value || 0);
            } else {
                montoAhorro = remanente;
                esParcial = true;
            }
        } else if (type === 'PORCENTAJE') {
            const calculo = (utilidadNeta * Number(value || 0)) / 100;
            if (remanente >= calculo) {
                montoAhorro = calculo;
            } else {
                montoAhorro = remanente;
                esParcial = true;
            }
        } else if (type === 'REMANENTE') {
            montoAhorro = remanente;
        } else {
            // si aparece un tipo desconocido, skip
            continue;
        }

        if (montoAhorro > 0) {
            movimientos.push({
                pocketName: name,
                amount: Number(Math.round(montoAhorro * 100) / 100), // redondeo a 2 decimales
                isPartial: !!esParcial,
                ruleId: id
            });
            remanente = Math.round((remanente - montoAhorro) * 100) / 100;
        }
    }

    return movimientos;
}

/**
 * Calcula la ganancia neta de la venta de un vehículo.
 * @param {Object} transaccionVenta - La transacción de ingreso por la venta.
 * @param {Number} valorFinanciado - El saldo que el cliente queda debiendo (si aplica).
 * @returns {Number} La utilidad neta a distribuir.
 */
export function calcularUtilidadVenta(transaccionVenta, valorFinanciado = 0) {
    // 1. Identificar el vehículo
    const placa = transaccionVenta.relation_plate;
    if (!placa) {
        console.warn("La transacción no tiene una placa relacionada.");
        return 0;
    }

    const vehiculo = inventory.find(v => v.plate === placa);
    if (!vehiculo) {
        console.warn(`Vehículo con placa ${placa} no encontrado en el inventario.`);
        return 0;
    }

    // 2. Calcular el Costo Total (Precio Compra + Mantenimientos)
    const precioCompra = Number(vehiculo.precio_compra) || 0;
    
    // Buscar todos los gastos de mantenimiento de esta placa en el historial de transacciones
    const gastosMantenimiento = transactions.filter(t => 
        t.type === 'EGRESO' && 
        t.category === 'GASTO_MANTENIMIENTO' && 
        t.relation_plate === placa
    );
    
    const totalMantenimiento = gastosMantenimiento.reduce((acc, t) => acc + (Number(t.amount) || 0), 0);
    const costoTotal = precioCompra + totalMantenimiento;

    // 3. Calcular el Precio de Venta Real (Pago de hoy + saldo a crédito)
    const pagoHoy = Number(transaccionVenta.amount) || 0; // Lo que entra en efectivo/bancos
    const precioVentaReal = pagoHoy + Number(valorFinanciado);

    // 4. Calcular la Utilidad a repartir
    const gananciaNeta = precioVentaReal - costoTotal;

    console.log(`--- Resumen de Venta Placa: ${placa} ---`);
    console.log(`Costo Vehículo: $${precioCompra}`);
    console.log(`Mantenimientos: $${totalMantenimiento}`);
    console.log(`Costo Total: $${costoTotal}`);
    console.log(`Pago Hoy: $${pagoHoy} | Financiado: $${valorFinanciado}`);
    console.log(`Precio Venta Real: $${precioVentaReal}`);
    console.log(`Ganancia Neta a Distribuir: $${gananciaNeta}`);

    // Si hay pérdida o el vehículo se vendió al costo, no hay utilidad
    return gananciaNeta > 0 ? gananciaNeta : 0;
}