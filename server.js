const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname)));

// Health check & DB connection status
app.get('/api/health', async (req, res) => {
    try {
        await prisma.$queryRaw`SELECT 1`;
        const isSupabase = (process.env.DATABASE_URL || '').includes('supabase');
        return res.json({ 
            status: 'ok', 
            connected: true, 
            provider: isSupabase ? 'supabase' : 'local-postgres',
            message: isSupabase 
                ? 'Conectado a Supabase (PostgreSQL Cloud)' 
                : 'Conectado a PostgreSQL Local (Docker)'
        });
    } catch (error) {
        return res.status(503).json({ 
            status: 'error', 
            connected: false, 
            message: 'No se pudo conectar a la base de datos',
            error: error.message 
        });
    }
});

// GET: Obtener todos los compromisos
app.get('/api/commitments', async (req, res) => {
    try {
        const commitments = await prisma.commitment.findMany({
            orderBy: [
                { date: 'asc' },
                { startTime: 'asc' }
            ]
        });

        // Formatear fechas a ISO strings compatibles con el frontend
        const formatted = commitments.map(c => ({
            ...c,
            createdAt: c.createdAt ? c.createdAt.toISOString() : undefined,
            updatedAt: c.updatedAt ? c.updatedAt.toISOString() : undefined,
            deactivatedAt: c.deactivatedAt ? c.deactivatedAt.toISOString() : null
        }));

        return res.json(formatted);
    } catch (error) {
        console.error('Error al obtener compromisos:', error);
        return res.status(500).json({ error: 'Error al consultar la base de datos', details: error.message });
    }
});

// POST: Crear nuevo compromiso
app.post('/api/commitments', async (req, res) => {
    try {
        const { id, title, date, startTime, endTime, priority, notes, active, deactivatedReason, deactivatedAt } = req.body;

        if (!title || !date || !startTime || !endTime) {
            return res.status(400).json({ error: 'Faltan campos obligatorios (title, date, startTime, endTime)' });
        }

        const newCommitment = await prisma.commitment.create({
            data: {
                id: id || undefined,
                title,
                date,
                startTime,
                endTime,
                priority: priority || 'Media',
                notes: notes || '',
                active: active !== undefined ? Boolean(active) : true,
                deactivatedReason: deactivatedReason || null,
                deactivatedAt: deactivatedAt ? new Date(deactivatedAt) : null
            }
        });

        return res.status(201).json(newCommitment);
    } catch (error) {
        console.error('Error al crear compromiso:', error);
        return res.status(500).json({ error: 'Error al persistir compromiso en Supabase', details: error.message });
    }
});

// PUT: Actualizar compromiso
app.put('/api/commitments/:id', async (req, res) => {
    const { id } = req.params;
    const { title, date, startTime, endTime, priority, notes, active, deactivatedReason, deactivatedAt } = req.body;

    try {
        const updated = await prisma.commitment.update({
            where: { id },
            data: {
                ...(title !== undefined && { title }),
                ...(date !== undefined && { date }),
                ...(startTime !== undefined && { startTime }),
                ...(endTime !== undefined && { endTime }),
                ...(priority !== undefined && { priority }),
                ...(notes !== undefined && { notes }),
                ...(active !== undefined && { active: Boolean(active) }),
                deactivatedReason: deactivatedReason !== undefined ? deactivatedReason : null,
                deactivatedAt: deactivatedAt ? new Date(deactivatedAt) : null
            }
        });

        return res.json(updated);
    } catch (error) {
        console.error(`Error al actualizar compromiso ${id}:`, error);
        return res.status(500).json({ error: 'Error al actualizar compromiso', details: error.message });
    }
});

// PATCH: Desactivar compromiso
app.patch('/api/commitments/:id/deactivate', async (req, res) => {
    const { id } = req.params;
    const { reason = 'manual' } = req.body;

    try {
        const deactivated = await prisma.commitment.update({
            where: { id },
            data: {
                active: false,
                deactivatedReason: reason,
                deactivatedAt: new Date()
            }
        });

        return res.json(deactivated);
    } catch (error) {
        console.error(`Error al desactivar compromiso ${id}:`, error);
        return res.status(500).json({ error: 'Error al desactivar compromiso', details: error.message });
    }
});

// PATCH: Reactivar compromiso
app.patch('/api/commitments/:id/reactivate', async (req, res) => {
    const { id } = req.params;

    try {
        const reactivated = await prisma.commitment.update({
            where: { id },
            data: {
                active: true,
                deactivatedReason: null,
                deactivatedAt: null
            }
        });

        return res.json(reactivated);
    } catch (error) {
        console.error(`Error al reactivar compromiso ${id}:`, error);
        return res.status(500).json({ error: 'Error al reactivar compromiso', details: error.message });
    }
});

// POST: Sincronizar desactivaciones automáticas por expiración de horario
app.post('/api/commitments/sync-expired', async (req, res) => {
    const { expiredIds } = req.body;
    if (!Array.isArray(expiredIds) || expiredIds.length === 0) {
        return res.json({ updated: 0 });
    }

    try {
        const result = await prisma.commitment.updateMany({
            where: {
                id: { in: expiredIds },
                active: true
            },
            data: {
                active: false,
                deactivatedReason: 'expired',
                deactivatedAt: new Date()
            }
        });

        return res.json({ updated: result.count });
    } catch (error) {
        console.error('Error al sincronizar expiraciones:', error);
        return res.status(500).json({ error: 'Error al sincronizar expiraciones', details: error.message });
    }
});

// POST: Importación masiva (Merge o Replace con Transacciones Prisma)
app.post('/api/commitments/import', async (req, res) => {
    const { items, mode = 'merge' } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Lista de compromisos vacía o no válida' });
    }

    try {
        if (mode === 'replace') {
            await prisma.$transaction(async (tx) => {
                await tx.commitment.deleteMany({});
                for (const item of items) {
                    await tx.commitment.create({
                        data: {
                            id: item.id,
                            title: item.title,
                            date: item.date,
                            startTime: item.startTime,
                            endTime: item.endTime,
                            priority: item.priority || 'Media',
                            notes: item.notes || '',
                            active: item.active !== undefined ? Boolean(item.active) : true,
                            deactivatedReason: item.deactivatedReason || null,
                            deactivatedAt: item.deactivatedAt ? new Date(item.deactivatedAt) : null
                        }
                    });
                }
            });
            return res.json({ success: true, mode: 'replace', count: items.length });
        } else {
            // Mode 'merge' (upsert atómico)
            let added = 0;
            let updated = 0;

            await prisma.$transaction(async (tx) => {
                for (const item of items) {
                    const existing = await tx.commitment.findUnique({ where: { id: item.id } });
                    if (existing) {
                        await tx.commitment.update({
                            where: { id: item.id },
                            data: {
                                title: item.title,
                                date: item.date,
                                startTime: item.startTime,
                                endTime: item.endTime,
                                priority: item.priority || existing.priority,
                                notes: item.notes !== undefined ? item.notes : existing.notes,
                                active: item.active !== undefined ? Boolean(item.active) : existing.active,
                                deactivatedReason: item.deactivatedReason !== undefined ? item.deactivatedReason : existing.deactivatedReason,
                                deactivatedAt: item.deactivatedAt ? new Date(item.deactivatedAt) : existing.deactivatedAt
                            }
                        });
                        updated++;
                    } else {
                        await tx.commitment.create({
                            data: {
                                id: item.id,
                                title: item.title,
                                date: item.date,
                                startTime: item.startTime,
                                endTime: item.endTime,
                                priority: item.priority || 'Media',
                                notes: item.notes || '',
                                active: item.active !== undefined ? Boolean(item.active) : true,
                                deactivatedReason: item.deactivatedReason || null,
                                deactivatedAt: item.deactivatedAt ? new Date(item.deactivatedAt) : null
                            }
                        });
                        added++;
                    }
                }
            });

            return res.json({ success: true, mode: 'merge', count: items.length, added, updated });
        }
    } catch (error) {
        console.error('Error al importar compromisos:', error);
        return res.status(500).json({ error: 'Error durante la importación atómica en la base de datos', details: error.message });
    }
});

// Ruta principal para servir la UI
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Iniciar servidor
app.listen(PORT, () => {
    const isSupabase = (process.env.DATABASE_URL || '').includes('supabase');
    const dbTarget = isSupabase ? 'Supabase Cloud (PostgreSQL)' : 'PostgreSQL Local (Docker :5433)';

    console.log(`=========================================`);
    console.log(`🚀 Agenda Juzgado iniciada en el puerto ${PORT}`);
    console.log(`🌐 Acceso local: http://localhost:${PORT}`);
    console.log(`🔌 Base de datos activa: ${dbTarget}`);
    console.log(`=========================================`);
});
