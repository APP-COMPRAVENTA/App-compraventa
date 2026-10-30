// js/services/balanceRevert.js
import { writeBatch, doc } from "firebase/firestore";
import { db } from '../config/firebase.js';
import { getCollectionRef } from '../services/listeners.js';
import { getColombiaNow } from '../utils/colombiaTime.js';

export async function revertTransaction(transactions, id) {
    const t = transactions.find(tr => tr.id === id);
    if (!t) throw new Error('Transacción no encontrada');

    const batch = writeBatch(db);
    const nowColombia = getColombiaNow();

    batch.update(doc(getCollectionRef('transacciones'), id), {
        status: 'ANULADA',
        description: `(ANULADA) ${t.description}`,
        annulled_at: nowColombia.timestampMs,
        annulledAtColombia: nowColombia
    });

    batch.set(doc(getCollectionRef('transacciones')), {
        type: 'EGRESO',
        category: 'ANULACION',
        amount: t.amount,
        description: `REVERSO ID: ${id}`,
        date: nowColombia.timestampMs,
        status: 'ACTIVA',
        timestamp: nowColombia.timestampMs,
        dateColombia: nowColombia,
        createdAtColombia: nowColombia,
        updatedAtColombia: nowColombia,
        dateKey: nowColombia.dateKey,
        timeKey: nowColombia.timeKey,
        weekday: nowColombia.weekday,
        origin: 'AUTO',
        module: 'BALANCE'
    });

    await batch.commit();
}
