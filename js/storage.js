// --- PERSISTENCIA HÍBRIDA: SUPABASE / PRISMA ORM + CACHÉ LOCAL --- //

const Storage = {
    STORAGE_KEY: 'AGENDA_JUZGADO_DATA_V1',
    API_BASE: '/api',
    _memoryCache: null,
    isOnline: false,
    dbStatus: 'checking', // 'checking' | 'connected' | 'offline' | 'syncing'
    provider: 'supabase', // 'supabase' | 'local-postgres'
    statusListeners: [],

    onStatusChange(callback) {
        if (typeof callback === 'function') {
            this.statusListeners.push(callback);
            callback(this.dbStatus, this.isOnline, '', this.provider);
        }
    },

    notifyStatus(status, isOnline = false, detail = '', provider = null) {
        this.dbStatus = status;
        this.isOnline = isOnline;
        if (provider) this.provider = provider;
        this.statusListeners.forEach(cb => {
            try { cb(status, isOnline, detail, this.provider); } catch (e) { console.error(e); }
        });
    },

    getInitialSeedData() {
        return [];
    },

    getLocalData() {
        try {
            const raw = localStorage.getItem(this.STORAGE_KEY);
            if (!raw) return [];
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                return parsed.filter(this.isValidCommitmentSchema);
            }
        } catch (err) {
            console.error('Error al leer de localStorage:', err);
        }
        return [];
    },

    saveLocalData(commitments) {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(commitments));
        } catch (err) {
            console.error('Error al escribir en localStorage:', err);
        }
    },

    async init() {
        this.notifyStatus('checking', false, 'Conectando con la base de datos...');
        // Carga inicial desde caché local para renderizado instantáneo
        this._memoryCache = this.getLocalData();

        try {
            const healthRes = await fetch(`${this.API_BASE}/health`, { method: 'GET' });
            if (healthRes.ok) {
                const healthData = await healthRes.json();
                if (healthData.connected) {
                    this.provider = healthData.provider || 'supabase';
                    await this.fetchRemoteData();
                    const label = this.provider === 'local-postgres' ? 'PostgreSQL Local (Docker)' : 'Supabase (Prisma ORM)';
                    this.notifyStatus('connected', true, `Conectado a ${label}`, this.provider);
                    return this._memoryCache;
                }
            }
            this.notifyStatus('offline', false, 'Base de datos no disponible, usando almacenamiento local');
        } catch (err) {
            console.warn('Servidor o base de datos no disponible en este momento. Operando en modo local.', err);
            this.notifyStatus('offline', false, 'Modo local (Sin conexión al servidor)');
        }

        return this._memoryCache;
    },

    async fetchRemoteData() {
        try {
            this.notifyStatus('syncing', true, 'Sincronizando con Supabase...');
            const res = await fetch(`${this.API_BASE}/commitments`);
            if (res.ok) {
                const remoteCommitments = await res.json();
                if (Array.isArray(remoteCommitments)) {
                    this._memoryCache = remoteCommitments.filter(this.isValidCommitmentSchema);
                    this.saveLocalData(this._memoryCache);
                    this.notifyStatus('connected', true, 'Base de datos sincronizada', this.provider);
                    return this._memoryCache;
                }
            }
        } catch (err) {
            console.error('Error al sincronizar con el servidor:', err);
            this.notifyStatus('offline', false, 'Error de sincronización con Supabase');
        }
        return this._memoryCache;
    },

    getAll() {
        if (this._memoryCache === null) {
            this._memoryCache = this.getLocalData();
        }
        return this._memoryCache;
    },

    saveAll(commitments) {
        this._memoryCache = [...commitments];
        this.saveLocalData(this._memoryCache);
    },

    async add(commitmentData) {
        const newCommitment = {
            ...commitmentData,
            id: commitmentData.id || ('cm-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7)),
            active: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        const commitments = this.getAll();
        commitments.push(newCommitment);
        this.saveAll(commitments);

        if (this.isOnline) {
            try {
                const res = await fetch(`${this.API_BASE}/commitments`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(newCommitment)
                });
                if (!res.ok) {
                    const err = await res.json();
                    console.warn('Aviso al guardar en Supabase:', err);
                }
            } catch (err) {
                console.error('Fallo al persistir en Supabase:', err);
            }
        }

        return newCommitment;
    },

    async update(id, updatedData) {
        const commitments = this.getAll();
        const index = commitments.findIndex(item => item.id === id);
        if (index === -1) return null;

        const updatedCommitment = {
            ...commitments[index],
            ...updatedData,
            updatedAt: new Date().toISOString()
        };

        commitments[index] = updatedCommitment;
        this.saveAll(commitments);

        if (this.isOnline) {
            try {
                await fetch(`${this.API_BASE}/commitments/${encodeURIComponent(id)}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(updatedCommitment)
                });
            } catch (err) {
                console.error(`Fallo al actualizar en Supabase id=${id}:`, err);
            }
        }

        return updatedCommitment;
    },

    async deactivate(id, reason = 'manual') {
        const commitments = this.getAll();
        const index = commitments.findIndex(item => item.id === id);
        if (index === -1) return false;

        commitments[index].active = false;
        commitments[index].deactivatedReason = reason;
        commitments[index].deactivatedAt = new Date().toISOString();
        commitments[index].updatedAt = new Date().toISOString();

        this.saveAll(commitments);

        if (this.isOnline) {
            try {
                await fetch(`${this.API_BASE}/commitments/${encodeURIComponent(id)}/deactivate`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ reason })
                });
            } catch (err) {
                console.error(`Fallo al desactivar en Supabase id=${id}:`, err);
            }
        }

        return true;
    },

    async reactivate(id) {
        const commitments = this.getAll();
        const index = commitments.findIndex(item => item.id === id);
        if (index === -1) return false;

        commitments[index].active = true;
        delete commitments[index].deactivatedReason;
        delete commitments[index].deactivatedAt;
        commitments[index].updatedAt = new Date().toISOString();

        this.saveAll(commitments);

        if (this.isOnline) {
            try {
                await fetch(`${this.API_BASE}/commitments/${encodeURIComponent(id)}/reactivate`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' }
                });
            } catch (err) {
                console.error(`Fallo al reactivar en Supabase id=${id}:`, err);
            }
        }

        return true;
    },

    async syncExpired(expiredIds) {
        if (!Array.isArray(expiredIds) || expiredIds.length === 0) return;
        if (this.isOnline) {
            try {
                await fetch(`${this.API_BASE}/commitments/sync-expired`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ expiredIds })
                });
            } catch (err) {
                console.error('Error al sincronizar expirados con Supabase:', err);
            }
        }
    },

    isValidCommitmentSchema(item) {
        return (
            item &&
            typeof item.id === 'string' &&
            typeof item.title === 'string' &&
            typeof item.date === 'string' &&
            typeof item.startTime === 'string' &&
            typeof item.endTime === 'string' &&
            typeof item.active === 'boolean'
        );
    },

    exportBackup() {
        const commitments = this.getAll();
        const backupObj = {
            version: '1.0',
            appName: 'Agenda_juzgado',
            database: 'Supabase/PostgreSQL (Prisma ORM)',
            exportedAt: new Date().toISOString(),
            count: commitments.length,
            commitments: commitments
        };

        const jsonStr = JSON.stringify(backupObj, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const dateStr = typeof AgendaLogic !== 'undefined' && AgendaLogic.getLocalDateString
            ? AgendaLogic.getLocalDateString()
            : new Date().toISOString().split('T')[0];

        const link = document.createElement('a');
        link.href = url;
        link.download = `agenda_backup_${dateStr}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    },

    parseBackupData(jsonString) {
        try {
            const data = JSON.parse(jsonString);
            let itemsToImport = [];

            if (Array.isArray(data)) {
                itemsToImport = data;
            } else if (data && Array.isArray(data.commitments)) {
                itemsToImport = data.commitments;
            } else {
                return { success: false, error: 'Formato de archivo de respaldo no reconocido.' };
            }

            const validItems = itemsToImport.filter(item => this.isValidCommitmentSchema(item));
            if (validItems.length === 0 && itemsToImport.length > 0) {
                return { success: false, error: 'Ningún registro en el archivo posee el formato válido de la agenda.' };
            }

            return { success: true, validItems };
        } catch (err) {
            return { success: false, error: 'El archivo seleccionado no es un JSON válido.' };
        }
    },

    async importBackup(validItems, mode = 'merge') {
        if (!Array.isArray(validItems)) {
            return { success: false, error: 'Datos no válidos para importar.' };
        }

        let finalList = [];
        let addedCount = 0;
        let updatedCount = 0;

        if (mode === 'replace') {
            finalList = [...validItems];
            addedCount = validItems.length;
        } else {
            // Modo 'merge' (Combinar)
            const currentItems = this.getAll();
            finalList = [...currentItems];

            validItems.forEach(item => {
                const existingIndex = finalList.findIndex(c => c.id === item.id);
                if (existingIndex !== -1) {
                    finalList[existingIndex] = { ...finalList[existingIndex], ...item };
                    updatedCount++;
                } else {
                    finalList.push(item);
                    addedCount++;
                }
            });
        }

        this.saveAll(finalList);

        if (this.isOnline) {
            try {
                this.notifyStatus('syncing', true, 'Importando datos a Supabase con transacción Prisma...');
                const res = await fetch(`${this.API_BASE}/commitments/import`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ items: validItems, mode })
                });
                if (res.ok) {
                    this.notifyStatus('connected', true, 'Datos importados y respaldados en Supabase');
                } else {
                    const err = await res.json();
                    console.warn('Aviso en importación de Supabase:', err);
                }
            } catch (err) {
                console.error('Error al sincronizar importación con Supabase:', err);
            }
        }

        const conflicts = typeof AgendaLogic !== 'undefined' && AgendaLogic.detectAllConflicts
            ? AgendaLogic.detectAllConflicts(finalList)
            : [];

        return { 
            success: true, 
            mode: mode, 
            count: validItems.length, 
            added: addedCount, 
            updated: updatedCount, 
            conflicts: conflicts 
        };
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = Storage;
}
