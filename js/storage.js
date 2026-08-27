// --- SECCIÓN: PERSISTENCIA EN LOCALSTORAGE --- //

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
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = Storage;
}
