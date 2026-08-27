// --- PERSISTENCIA EN LOCALSTORAGE --- //

const Storage = {
    STORAGE_KEY: 'AGENDA_JUZGADO_DATA_V1',

    getInitialSeedData() {
        return [];
    },

    getAll() {
        try {
            const raw = localStorage.getItem(this.STORAGE_KEY);
            if (!raw) {
                const empty = this.getInitialSeedData();
                this.saveAll(empty);
                return empty;
            }
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                return parsed.filter(this.isValidCommitmentSchema);
            }
        } catch (err) {
            console.error('Error al leer storage:', err);
        }
        const empty = this.getInitialSeedData();
        this.saveAll(empty);
        return empty;
    },

    saveAll(commitments) {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(commitments));
        } catch (err) {
            console.error('Error al escribir storage:', err);
        }
    },

    add(commitmentData) {
        const commitments = this.getAll();
        const newCommitment = {
            ...commitmentData,
            id: 'cm-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
            active: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        commitments.push(newCommitment);
        this.saveAll(commitments);
        return newCommitment;
    },

    update(id, updatedData) {
        const commitments = this.getAll();
        const index = commitments.findIndex(item => item.id === id);
        if (index === -1) return null;

        commitments[index] = {
            ...commitments[index],
            ...updatedData,
            updatedAt: new Date().toISOString()
        };

        this.saveAll(commitments);
        return commitments[index];
    },

    deactivate(id, reason = 'manual') {
        const commitments = this.getAll();
        const index = commitments.findIndex(item => item.id === id);
        if (index === -1) return false;

        commitments[index].active = false;
        commitments[index].deactivatedReason = reason;
        commitments[index].deactivatedAt = new Date().toISOString();
        commitments[index].updatedAt = new Date().toISOString();

        this.saveAll(commitments);
        return true;
    },

    reactivate(id) {
        const commitments = this.getAll();
        const index = commitments.findIndex(item => item.id === id);
        if (index === -1) return false;

        commitments[index].active = true;
        delete commitments[index].deactivatedReason;
        delete commitments[index].deactivatedAt;
        commitments[index].updatedAt = new Date().toISOString();

        this.saveAll(commitments);
        return true;
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

    importBackup(validItems, mode = 'merge') {
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
