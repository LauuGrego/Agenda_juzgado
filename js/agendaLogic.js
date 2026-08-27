// --- LÓGICA DE HORARIOS Y COLISIONES --- //

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

    getInitialDate(now = new Date()) {
        const hours = now.getHours();
        const minutes = now.getMinutes();
        if (hours > this.END_HOUR || (hours === this.END_HOUR && minutes > 0)) {
            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);
            return this.getLocalDateString(tomorrow);
        }
        return this.getLocalDateString(now);
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

    detectAllConflicts(commitments) {
        if (!Array.isArray(commitments)) return [];
        const activeItems = commitments.filter(c => c && c.active);
        const conflicts = [];
        const seenPairs = new Set();

        for (let i = 0; i < activeItems.length; i++) {
            for (let j = i + 1; j < activeItems.length; j++) {
                const a = activeItems[i];
                const b = activeItems[j];

                if (a.date === b.date && a.id !== b.id) {
                    const aStart = this.timeToMinutes(a.startTime);
                    const aEnd = this.timeToMinutes(a.endTime);
                    const bStart = this.timeToMinutes(b.startTime);
                    const bEnd = this.timeToMinutes(b.endTime);

                    if (aStart < bEnd && aEnd > bStart) {
                        const pairKey = [a.id, b.id].sort().join('___');
                        if (!seenPairs.has(pairKey)) {
                            seenPairs.add(pairKey);
                            conflicts.push({ imported: b, existing: a });
                        }
                    }
                }
            }
        }

        return conflicts;
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
    },

    calculateLayoutPositions(activeToday) {
        if (!Array.isArray(activeToday) || activeToday.length === 0) return [];

        const items = activeToday.map(evt => {
            const startMins = this.timeToMinutes(evt.startTime);
            const endMins = this.timeToMinutes(evt.endTime);
            return {
                ...evt,
                startMins,
                endMins,
                duration: endMins - startMins
            };
        }).sort((a, b) => a.startMins - b.startMins || b.endMins - a.endMins);

        const clusters = [];
        let currentCluster = [];
        let clusterEndMins = -1;

        items.forEach(item => {
            if (currentCluster.length === 0) {
                currentCluster.push(item);
                clusterEndMins = item.endMins;
            } else {
                if (item.startMins < clusterEndMins) {
                    currentCluster.push(item);
                    if (item.endMins > clusterEndMins) {
                        clusterEndMins = item.endMins;
                    }
                } else {
                    clusters.push(currentCluster);
                    currentCluster = [item];
                    clusterEndMins = item.endMins;
                }
            }
        });

        if (currentCluster.length > 0) {
            clusters.push(currentCluster);
        }

        const positionedEvents = [];
        const startHourMins = this.START_HOUR * 60; // 420 mins (07:00)

        clusters.forEach(cluster => {
            const columns = [];

            cluster.forEach(item => {
                let assignedCol = -1;
                for (let i = 0; i < columns.length; i++) {
                    if (columns[i] <= item.startMins) {
                        assignedCol = i;
                        columns[i] = item.endMins;
                        break;
                    }
                }

                if (assignedCol === -1) {
                    assignedCol = columns.length;
                    columns.push(item.endMins);
                }

                item.colIndex = assignedCol;
            });

            const totalCols = columns.length;
            const hasConflict = totalCols > 1;

            cluster.forEach(item => {
                const topPx = (item.startMins - startHourMins) * 2 + 2; // 2px per minute
                const heightPx = Math.max(item.duration * 2 - 4, 32);

                const widthPct = 100 / totalCols;
                const leftPct = item.colIndex * widthPct;

                positionedEvents.push({
                    ...item,
                    topPx,
                    heightPx,
                    leftPct,
                    widthPct,
                    hasConflict
                });
            });
        });

        return positionedEvents;
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = AgendaLogic;
}
