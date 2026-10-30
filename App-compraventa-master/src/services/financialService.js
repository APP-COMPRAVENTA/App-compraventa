// src/services/financialService.js
import { db, userId } from '../config/firebase.js';
import { collection, doc, runTransaction, addDoc, increment } from "firebase/firestore";

// Helper para obtener la colección correcta del usuario
const getTransCollection = () => collection(db, `artifacts/${userId}/transacciones`);
const getInventoryRef = (id) => doc(db, `artifacts/${userId}/inventario`, id);
const getDebtCollection = () => collection(db, `artifacts/${userId}/deudas`);

export const FinancialService = {

    /**
     * RF-05-01 y RF-05-02: Registrar Gasto
     * Si viene con 'vehicleId', actualiza automáticamente el costo de la moto.
     */
    async registerExpense(data) {
        // data esperada: { amount, concept, category, date, paymentMethod, vehicleId (opcional), providerId (opcional) }
        
        try {
            await runTransaction(db, async (transaction) => {
                // 1. Crear el registro en el Balance (Libro Diario)
                const newTransRef = doc(getTransCollection());
                transaction.set(newTransRef, {
                    type: 'EXPENSE',
                    ...data,
                    createdAt: new Date().toISOString()
                });

                // 2. RF-05-02: TRIGGER AUTOMÁTICO - Vincular gasto al vehículo
                if (data.vehicleId) {
                    const vehicleRef = getInventoryRef(data.vehicleId);
                    // Usamos 'increment' para seguridad atómica (evita errores si dos personas editan a la vez)
                    transaction.update(vehicleRef, {
                        costos_reparacion: increment(Number(data.amount))
                    });
                }
            });
            console.log("✅ Gasto registrado y vinculado correctamente.");
            return true;
        } catch (error) {
            console.error("Error en registerExpense:", error);
            throw error;
        }
    },

    /**
     * RF-05-03: Registrar Ingreso (VENTAS)
     * Este es el que usará tu Inventario para reportar la venta.
     */
    async registerIncome(data) {
        // data esperada: { amount, concept, category: 'VENTA', vehicleId, date, paymentMethod }
        try {
            await runTransaction(db, async (transaction) => {
                // 1. Registrar el dinero en Balance
                const newTransRef = doc(getTransCollection());
                transaction.set(newTransRef, {
                    type: 'INCOME',
                    ...data,
                    createdAt: new Date().toISOString()
                });

                // 2. TRIGGER: Si es venta de vehículo, marcarlo como VENDIDO en inventario
                if (data.category === 'VENTA' && data.vehicleId) {
                    const vehicleRef = getInventoryRef(data.vehicleId);
                    transaction.update(vehicleRef, {
                        status: 'VENDIDO',
                        fechaVenta: data.date,
                        precioVentaFinal: Number(data.amount)
                    });
                }
            });
            console.log("✅ Venta registrada y moto dada de baja del inventario.");
            return true;
        } catch (error) {
            console.error("Error en registerIncome:", error);
            throw error;
        }
    },

    /**
     * RF-05-04 y RF-05-05: Pago Dividido (Caja + Deuda)
     * Si no alcanza la plata, paga lo que hay y crea una cuenta por pagar.
     */
    async registerSplitExpense(expenseData, availableCash, debtAmount, providerId) {
        if (!providerId) throw new Error("Se requiere un Proveedor para crear la deuda.");

        try {
            await runTransaction(db, async (transaction) => {
                // 1. Gasto por lo que SÍ hay en caja
                const partialExpenseRef = doc(getTransCollection());
                transaction.set(partialExpenseRef, {
                    ...expenseData,
                    amount: Number(availableCash),
                    concept: `${expenseData.concept} (Pago Parcial)`,
                    isSplit: true,
                    type: 'EXPENSE'
                });

                // 2. Crear la Deuda (CXP)
                const newDebtRef = doc(getDebtCollection());
                transaction.set(newDebtRef, {
                    providerId,
                    amount: Number(debtAmount),
                    concept: `Saldo pendiente: ${expenseData.concept}`,
                    date: expenseData.date,
                    status: 'PENDING', // Pendiente de pago
                    vehicleId: expenseData.vehicleId || null,
                    createdAt: new Date().toISOString()
                });

                // 3. Si es de una moto, sumamos EL TOTAL (pagado + deuda) al costo
                if (expenseData.vehicleId) {
                    const vehicleRef = getInventoryRef(expenseData.vehicleId);
                    transaction.update(vehicleRef, {
                        costos_reparacion: increment(Number(availableCash) + Number(debtAmount))
                    });
                }
            });
            return true;
        } catch (error) {
            console.error("Error en Split Payment:", error);
            throw error;
        }
    }
};