// --- SUITE DE PRUEBAS AUTOMATIZADAS (TEST SUITE) --- //

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const express = require('express');
const cors = require('cors');

// Configuración de servidor de pruebas integrado
const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', async (req, res) => {
    try {
        await prisma.$queryRaw`SELECT 1`;
        return res.json({ status: 'ok', connected: true });
    } catch (error) {
        return res.status(503).json({ status: 'error', connected: false, error: error.message });
    }
});

app.get('/api/commitments', async (req, res) => {
    try {
        const commitments = await prisma.commitment.findMany({
            orderBy: [{ date: 'asc' }, { startTime: 'asc' }]
        });
        return res.json(commitments);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

app.post('/api/commitments', async (req, res) => {
    try {
        const { id, title, date, startTime, endTime, priority, notes } = req.body;
        const created = await prisma.commitment.create({
            data: { id: id || undefined, title, date, startTime, endTime, priority: priority || 'Media', notes: notes || '', active: true }
        });
        return res.status(201).json(created);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

app.put('/api/commitments/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updated = await prisma.commitment.update({
            where: { id },
            data: req.body
        });
        return res.json(updated);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

app.patch('/api/commitments/:id/deactivate', async (req, res) => {
    try {
        const { id } = req.params;
        const deactivated = await prisma.commitment.update({
            where: { id },
            data: { active: false, deactivatedReason: req.body.reason || 'manual', deactivatedAt: new Date() }
        });
        return res.json(deactivated);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

app.patch('/api/commitments/:id/reactivate', async (req, res) => {
    try {
        const { id } = req.params;
        const reactivated = await prisma.commitment.update({
            where: { id },
            data: { active: true, deactivatedReason: null, deactivatedAt: null }
        });
        return res.json(reactivated);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

app.post('/api/commitments/sync-expired', async (req, res) => {
    try {
        const { expiredIds } = req.body;
        const result = await prisma.commitment.updateMany({
            where: { id: { in: expiredIds }, active: true },
            data: { active: false, deactivatedReason: 'expired', deactivatedAt: new Date() }
        });
        return res.json({ updated: result.count });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

app.post('/api/commitments/import', async (req, res) => {
    const { items, mode = 'merge' } = req.body;
    try {
        let added = 0;
        let updated = 0;
        await prisma.$transaction(async (tx) => {
            for (const item of items) {
                const existing = await tx.commitment.findUnique({ where: { id: item.id } });
                if (existing) {
                    await tx.commitment.update({ where: { id: item.id }, data: item });
                    updated++;
                } else {
                    await tx.commitment.create({ data: item });
                    added++;
                }
            }
        });
        return res.json({ success: true, count: items.length, added, updated });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
});

const TEST_PORT = 3199;
const BASE_URL = `http://localhost:${TEST_PORT}/api`;

async function runTests() {
    console.log('====================================================');
    console.log('🧪 INICIANDO BATERÍA DE PRUEBAS: AGENDA JUZGADO');
    console.log('====================================================\n');

    const server = app.listen(TEST_PORT);
    let passed = 0;
    let failed = 0;

    async function assertTest(name, fn) {
        try {
            await fn();
            console.log(`  ✅ [PASS] ${name}`);
            passed++;
        } catch (error) {
            console.error(`  ❌ [FAIL] ${name}`);
            console.error(`     Error: ${error.message}\n`);
            failed++;
        }
    }

    const testId = `test-${Date.now()}`;
    const testDate = '2026-09-01';

    // TEST 1: Conexión Directa a la Base de Datos con Prisma
    await assertTest('Prisma Client: Conexión a Base de Datos (queryRaw SELECT 1)', async () => {
        const result = await prisma.$queryRaw`SELECT 1 as result`;
        if (!result || result.length === 0) {
            throw new Error('No se obtuvo respuesta de la base de datos.');
        }
    });

    // TEST 2: Endpoint Health Check
    await assertTest('API REST: GET /api/health', async () => {
        const res = await fetch(`${BASE_URL}/health`);
        if (!res.ok) throw new Error(`Status ${res.status}`);
        const data = await res.json();
        if (data.status !== 'ok' || !data.connected) {
            throw new Error(`Health check inválido: ${JSON.stringify(data)}`);
        }
    });

    // TEST 3: Crear Compromiso (POST /api/commitments)
    await assertTest('API REST: POST /api/commitments (Crear compromiso)', async () => {
        const payload = {
            id: testId,
            title: 'Audiencia Preliminar Test',
            date: testDate,
            startTime: '08:30',
            endTime: '09:30',
            priority: 'Alta',
            notes: 'Audiencia de prueba automatizada'
        };

        const res = await fetch(`${BASE_URL}/commitments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res.ok) throw new Error(`Status ${res.status}`);
        const created = await res.json();
        if (created.id !== testId || created.title !== payload.title) {
            throw new Error(`Datos creados no coinciden: ${JSON.stringify(created)}`);
        }
    });

    // TEST 4: Obtener Lista y Validar Persistencia (GET /api/commitments)
    await assertTest('API REST: GET /api/commitments (Verificar persistencia)', async () => {
        const res = await fetch(`${BASE_URL}/commitments`);
        if (!res.ok) throw new Error(`Status ${res.status}`);
        const list = await res.json();
        const found = list.find(c => c.id === testId);
        if (!found) throw new Error('El compromiso creado no fue encontrado en la base de datos.');
        if (found.priority !== 'Alta' || !found.active) {
            throw new Error(`Propiedades incorrectas: ${JSON.stringify(found)}`);
        }
    });

    // TEST 5: Actualizar Compromiso (PUT /api/commitments/:id)
    await assertTest('API REST: PUT /api/commitments/:id (Actualizar compromiso)', async () => {
        const updatePayload = {
            title: 'Audiencia Preliminar Test Modificada',
            priority: 'Urgente',
            notes: 'Notas actualizadas por test'
        };

        const res = await fetch(`${BASE_URL}/commitments/${testId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatePayload)
        });

        if (!res.ok) throw new Error(`Status ${res.status}`);
        const updated = await res.json();
        if (updated.title !== updatePayload.title || updated.priority !== 'Urgente') {
            throw new Error(`Actualización no aplicada: ${JSON.stringify(updated)}`);
        }
    });

    // TEST 6: Desactivar Compromiso (PATCH /api/commitments/:id/deactivate)
    await assertTest('API REST: PATCH /api/commitments/:id/deactivate (Desactivar)', async () => {
        const res = await fetch(`${BASE_URL}/commitments/${testId}/deactivate`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason: 'manual' })
        });

        if (!res.ok) throw new Error(`Status ${res.status}`);
        const deactivated = await res.json();
        if (deactivated.active !== false || deactivated.deactivatedReason !== 'manual') {
            throw new Error(`No se desactivó correctamente: ${JSON.stringify(deactivated)}`);
        }
    });

    // TEST 7: Reactivar Compromiso (PATCH /api/commitments/:id/reactivate)
    await assertTest('API REST: PATCH /api/commitments/:id/reactivate (Reactivar)', async () => {
        const res = await fetch(`${BASE_URL}/commitments/${testId}/reactivate`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' }
        });

        if (!res.ok) throw new Error(`Status ${res.status}`);
        const reactivated = await res.json();
        if (reactivated.active !== true || reactivated.deactivatedReason !== null) {
            throw new Error(`No se reactivó correctamente: ${JSON.stringify(reactivated)}`);
        }
    });

    // TEST 8: Sincronizar Expirados por Vencimiento (POST /api/commitments/sync-expired)
    await assertTest('API REST: POST /api/commitments/sync-expired', async () => {
        const res = await fetch(`${BASE_URL}/commitments/sync-expired`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ expiredIds: [testId] })
        });

        if (!res.ok) throw new Error(`Status ${res.status}`);
        const result = await res.json();
        if (result.updated !== 1) {
            throw new Error(`Se esperaba 1 registro actualizado, se obtuvo: ${result.updated}`);
        }
    });

    // TEST 9: Importación Transaccional en Lote (POST /api/commitments/import - modo merge)
    const importItem1 = `test-imp-1-${Date.now()}`;
    const importItem2 = `test-imp-2-${Date.now()}`;

    await assertTest('API REST: POST /api/commitments/import (Transacción por lote - Merge)', async () => {
        const importPayload = {
            mode: 'merge',
            items: [
                {
                    id: importItem1,
                    title: 'Trámite Importado 1',
                    date: testDate,
                    startTime: '10:00',
                    endTime: '11:00',
                    priority: 'Normal',
                    active: true
                },
                {
                    id: importItem2,
                    title: 'Trámite Importado 2',
                    date: testDate,
                    startTime: '11:00',
                    endTime: '12:00',
                    priority: 'Alta',
                    active: true
                }
            ]
        };

        const res = await fetch(`${BASE_URL}/commitments/import`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(importPayload)
        });

        if (!res.ok) throw new Error(`Status ${res.status}`);
        const result = await res.json();
        if (!result.success || result.count !== 2) {
            throw new Error(`Fallo en importación transaccional: ${JSON.stringify(result)}`);
        }
    });

    // TEST 10: Validación de Lógica de Conflicto de Horarios en JS
    await assertTest('Lógica Frontend (AgendaLogic): Detección de solapamiento', async () => {
        const AgendaLogic = require('./js/agendaLogic.js');
        const existing = [
            { id: '1', date: '2026-09-01', startTime: '08:00', endTime: '09:00', active: true }
        ];
        const conflictItem = { id: '2', date: '2026-09-01', startTime: '08:30', endTime: '09:30' };
        const noConflictItem = { id: '3', date: '2026-09-01', startTime: '09:00', endTime: '10:00' };

        const conflictFound = AgendaLogic.findOverlapConflict(conflictItem, existing);
        if (!conflictFound) throw new Error('Debió detectar conflicto de solapamiento y no lo hizo.');

        const noConflict = AgendaLogic.findOverlapConflict(noConflictItem, existing);
        if (noConflict) throw new Error('No debió detectar conflicto en horario consecutivo.');
    });

    // LIMPIEZA: Eliminar los registros de prueba generados
    console.log('\n🧹 Limpiando registros de prueba en la base de datos...');
    try {
        await prisma.commitment.deleteMany({
            where: {
                id: { in: [testId, importItem1, importItem2] }
            }
        });
        console.log('  ✨ Limpieza completada con éxito.');
    } catch (cleanErr) {
        console.warn('  ⚠️ Aviso en limpieza:', cleanErr.message);
    }

    server.close();
    await prisma.$disconnect();

    console.log('\n====================================================');
    console.log(`📊 RESULTADOS: ${passed} pasadas, ${failed} falladas.`);
    console.log('====================================================');

    if (failed > 0) {
        process.exit(1);
    } else {
        process.exit(0);
    }
}

runTests();
