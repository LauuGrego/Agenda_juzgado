// --- SECCIÓN: LÓGICA DE HORARIOS Y COLISIONES --- //

const AgendaLogic = {
    START_HOUR: 7,
    END_HOUR: 13,
    SLOT_INTERVAL_MINS: 30,

    getLocalDateString(d = new Date()) {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    },

    getTimeSlots() {
        const slots = [];
        let totalMinutes = this.START_HOUR * 60;
        const endMinutes = this.END_HOUR * 60;

        while (totalMinutes <= endMinutes) {
            const h = Math.floor(totalMinutes / 60).toString().padStart(2, '0');
            const m = (totalMinutes % 60).toString().padStart(2, '0');
            slots.push(`${h}:${m}`);
            totalMinutes += this.SLOT_INTERVAL_MINS;
        }

        return slots;
    },

    timeToMinutes(timeStr) {
        if (!timeStr) return 0;
        const [hours, minutes] = timeStr.split(':').map(Number);
        return hours * 60 + minutes;
    },

    minutesToTime(totalMinutes) {
        const h = Math.floor(totalMinutes / 60).toString().padStart(2, '0');
        const m = (totalMinutes % 60).toString().padStart(2, '0');
        return `${h}:${m}`;
    },

    calculateSpanSlots(startTime, endTime) {
        const startMins = this.timeToMinutes(startTime);
        const endMins = this.timeToMinutes(endTime);
        if (endMins <= startMins) return 1;
        return Math.ceil((endMins - startMins) / this.SLOT_INTERVAL_MINS);
    },

    findOverlapConflict(target, commitments) {
        const targetStart = this.timeToMinutes(target.startTime);
        const targetEnd = this.timeToMinutes(target.endTime);

        for (const item of commitments) {
            if (!item.active) continue;
            if (item.date !== target.date) continue;
            if (target.id && item.id === target.id) continue;

            const itemStart = this.timeToMinutes(item.startTime);
            const itemEnd = this.timeToMinutes(item.endTime);

            if (targetStart < itemEnd && targetEnd > itemStart) {
                return item;
            }
        }
        return null;
    },

    evaluateAutomaticDeactivations(commitments, now = new Date()) {
        let countDeactivated = 0;
        const updatedCommitments = commitments.map(item => {
            if (!item.active) return item;

            const [year, month, day] = item.date.split('-').map(Number);
            const [hours, minutes] = item.endTime.split(':').map(Number);
            const itemEndDateTime = new Date(year, month - 1, day, hours, minutes, 0);

            if (now >= itemEndDateTime) {
                countDeactivated++;
                return {
                    ...item,
                    active: false,
                    deactivatedReason: 'expired',
                    deactivatedAt: new Date().toISOString()
                };
            }
            return item;
        });

        return { updatedCommitments, countDeactivated };
    },

    canReactivate(target, commitments, now = new Date()) {
        const [year, month, day] = target.date.split('-').map(Number);
        const [hours, minutes] = target.startTime.split(':').map(Number);
        const targetStartDateTime = new Date(year, month - 1, day, hours, minutes, 0);

        if (targetStartDateTime <= now) {
            return {
                canReactivate: false,
                reason: 'No se puede reactivar un compromiso cuya hora de inicio ya ha pasado. Por favor edite la fecha u horario.'
            };
        }

        const conflict = this.findOverlapConflict(target, commitments);
        if (conflict) {
            return {
                canReactivate: false,
                reason: `Existe un conflicto de horario con el compromiso activo "${conflict.title}" (${conflict.startTime} - ${conflict.endTime} hs).`,
                conflict
            };
        }

        return { canReactivate: true };
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = AgendaLogic;
}
