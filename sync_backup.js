// --- SCRIPT DE RESPALDO Y SINCRONIZACIÓN ENTRE BASES DE DATOS --- //

require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

async function runBackupSync() {
    const primaryUrl = process.env.DATABASE_URL;
    const backupUrl = process.env.BACKUP_DATABASE_URL || process.env.RAILWAY_DATABASE_URL;

    console.log('====================================================');
    console.log('🔄 INICIANDO RESPALDO / SINCRONIZACIÓN DE BASE DE DATOS');
    console.log('====================================================\n');

    if (!primaryUrl) {
        console.error('❌ Error: DATABASE_URL no está definida en .env');
        process.exit(1);
    }

    if (!backupUrl) {
        console.error('❌ Error: Debes definir BACKUP_DATABASE_URL (o RAILWAY_DATABASE_URL) en tu archivo .env');
        console.log('Ejemplo en .env:');
        console.log('BACKUP_DATABASE_URL="postgresql://postgres:[PASSWORD]@[RAILWAY_HOST]:[PORT]/railway"\n');
        process.exit(1);
    }

    console.log('🔌 Conectando a Base de Datos Principal...');
    const primaryPrisma = new PrismaClient({
        datasources: { db: { url: primaryUrl } }
    });

    console.log('🔌 Conectando a Base de Datos de Respaldo (Railway)...');
    const backupPrisma = new PrismaClient({
        datasources: { db: { url: backupUrl } }
    });

    try {
        // 1. Obtener todos los registros de la base principal
        console.log('\n📥 Leyendo registros desde la base de datos principal...');
        const commitments = await primaryPrisma.commitment.findMany();
        console.log(`   Se encontraron ${commitments.length} compromiso(s) para respaldar.`);

        if (commitments.length === 0) {
            console.log('ℹ️ No hay registros para sincronizar.');
            await primaryPrisma.$disconnect();
            await backupPrisma.$disconnect();
            return;
        }

        // 2. Sincronizar en la base de respaldo
        console.log('\n📤 Aplicando respaldo en la base de datos de Railway...');
        let added = 0;
        let updated = 0;

        await backupPrisma.$transaction(async (tx) => {
            for (const item of commitments) {
                const existing = await tx.commitment.findUnique({ where: { id: item.id } });
                if (existing) {
                    await tx.commitment.update({
                        where: { id: item.id },
                        data: {
                            title: item.title,
                            date: item.date,
                            startTime: item.startTime,
                            endTime: item.endTime,
                            priority: item.priority,
                            notes: item.notes,
                            active: item.active,
                            deactivatedReason: item.deactivatedReason,
                            deactivatedAt: item.deactivatedAt
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
                            priority: item.priority,
                            notes: item.notes,
                            active: item.active,
                            deactivatedReason: item.deactivatedReason,
                            deactivatedAt: item.deactivatedAt,
                            createdAt: item.createdAt,
                            updatedAt: item.updatedAt
                        }
                    });
                    added++;
                }
            }
        });

        console.log('\n====================================================');
        console.log('✅ RESPALDO COMPLETADO EXITOSAMENTE');
        console.log(`📊 Total procesados: ${commitments.length}`);
        console.log(`✨ Nuevos agregados en Railway: ${added}`);
        console.log(`🔄 Actualizados en Railway: ${updated}`);
        console.log('====================================================\n');

    } catch (error) {
        console.error('\n❌ Error durante el respaldo:', error.message);
    } finally {
        await primaryPrisma.$disconnect();
        await backupPrisma.$disconnect();
    }
}

runBackupSync();
