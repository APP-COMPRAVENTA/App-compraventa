// js/services/balanceHandlers.js
import { doc } from "firebase/firestore";
import { getCollectionRef } from './listeners.js';
import { inventory, providers, transferCostsConfig } from '../store/store.js';
import { getColombiaNow } from '../utils/colombiaTime.js';

export function handleClient(form, batch, transaction) {
    if (!form['debt-id']) return null;

    const clientId = form['debt-id'].value;
    const nowColombia = getColombiaNow();

    batch.set(doc(getCollectionRef('clientes'), clientId), {
        name: form['debt-client'].value,
        id_number: clientId,
        phone: form['debt-phone'].value,
        email: form['debt-email'].value,
        address: form['debt-address'].value,
        last_transaction: nowColombia.timestampMs,
        lastTransactionColombia: nowColombia
    }, { merge: true });

    transaction.client_id = clientId;
    transaction.client_name = form['debt-client'].value;

    return clientId;
}

export function handleInventoryPurchase(form, batch, transaction) {
    const nowColombia = getColombiaNow();
    const item = {
        nombre: form['inv-nombre'].value,
        placa: form['inv-placa'].value.toUpperCase(),
        cantidad: parseInt(form['inv-cantidad'].value),
        precio_compra: transaction.amount,
        precio_venta: parseFloat(form['inv-precio_venta'].value),
        max_discount_amount: parseFloat(form['inv-max_discount'].value),
        categoria: form['inv-categoria'].value,
        estado: 'Disponible',
        timestamp: nowColombia.timestampMs,
        createdAtColombia: nowColombia,
        updatedAtColombia: nowColombia,
        dateKey: nowColombia.dateKey,
        timeKey: nowColombia.timeKey,
        weekday: nowColombia.weekday,
        ganancia_potencial: parseFloat(form['inv-precio_venta'].value) - transaction.amount
    };

    const ref = doc(getCollectionRef('inventario'));
    batch.set(ref, item);

    transaction.related_inventory_id = ref.id;
    transaction.description = `Compra: ${item.nombre} (${item.placa}) - ${transaction.description}`;
}

export function handleInventorySale(form, batch, transaction) {
    const invId = form['related-inventory-id'].value;
    batch.delete(doc(getCollectionRef('inventario'), invId));

    const item = inventory.find(i => i.id === invId);
    if (item) {
        transaction.description = `Venta ${item.nombre}. ${transaction.description}`;
    }
}

export function handleTransfer(form, batch, transaction, clientId) {
    const nowColombia = getColombiaNow();
    const val = parseFloat(document.getElementById('transfer-vehicle-value').value);
    const city = document.getElementById('transfer-city-id').value;
    const conf = transferCostsConfig.find(c => c.id === city);
    const tax = val * 0.01;
    const totalExp = conf.runt_cost + conf.stamps_cost + conf.agent_fee + (conf.transfer_rights_cost || 0) + tax;

    const tRef = doc(getCollectionRef('traspasos'));

    batch.set(tRef, {
        placa: document.getElementById('transfer-placa').value.toUpperCase(),
        client_id: clientId,
        client_name: transaction.client_name,
        service_cost: transaction.amount,
        date: transaction.date,
        status: 'PENDIENTE',
        city_id: city,
        vehicle_value: val,
        total_expenses: totalExp,
        impuesto_1_percent: tax,
        timestamp: nowColombia.timestampMs,
        createdAtColombia: nowColombia,
        updatedAtColombia: nowColombia,
        dateKey: nowColombia.dateKey,
        timeKey: nowColombia.timeKey,
        weekday: nowColombia.weekday
    });

    transaction.related_transfer_id = tRef.id;

    batch.set(doc(getCollectionRef('transacciones')), {
        type: 'EGRESO',
        category: 'GASTO_TRASPASO_COSTOS_FIJOS',
        amount: totalExp,
        description: `Costos fijos Traspaso`,
        date: transaction.date,
        status: 'ACTIVA',
        timestamp: nowColombia.timestampMs,
        createdAtColombia: nowColombia,
        updatedAtColombia: nowColombia,
        dateKey: nowColombia.dateKey,
        timeKey: nowColombia.timeKey,
        weekday: nowColombia.weekday
    });
}
