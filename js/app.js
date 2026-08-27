// --- SECCIÓN: CONTROLADOR PRINCIPAL --- //

document.addEventListener('DOMContentLoaded', () => {
    App.init();
});

const App = {
    init() {
        UI.init();
        this.bindEvents();
        this.renderCurrent();

        setInterval(() => {
            const commitments = Storage.getAll();
            UI.render(commitments);
        }, 30000);
    },

    renderCurrent() {
        const commitments = Storage.getAll();
        UI.render(commitments);
    },

    bindEvents() {
        document.getElementById('selected-date')?.addEventListener('change', (e) => {
            if (e.target.value) {
                UI.currentDate = e.target.value;
                UI.updateDateDisplay();
                this.renderCurrent();
            }
        });

        document.getElementById('btn-prev-day')?.addEventListener('click', () => {
            const [y, m, d] = UI.currentDate.split('-').map(Number);
            const dt = new Date(y, m - 1, d - 1);
            UI.currentDate = dt.toISOString().split('T')[0];
            UI.updateDateDisplay();
            this.renderCurrent();
        });

        document.getElementById('btn-next-day')?.addEventListener('click', () => {
            const [y, m, d] = UI.currentDate.split('-').map(Number);
            const dt = new Date(y, m - 1, d + 1);
            UI.currentDate = dt.toISOString().split('T')[0];
            UI.updateDateDisplay();
            this.renderCurrent();
        });

        document.getElementById('btn-today')?.addEventListener('click', () => {
            UI.currentDate = new Date().toISOString().split('T')[0];
            UI.updateDateDisplay();
            this.renderCurrent();
        });

        document.querySelectorAll('.nav-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
                const target = e.currentTarget;
                target.classList.add('active');
                
                UI.currentTab = target.dataset.tab;
                this.renderCurrent();
            });
        });

        document.getElementById('btn-new-commitment')?.addEventListener('click', () => {
            UI.editingId = null;
            document.getElementById('modal-title').textContent = 'Nuevo Compromiso';
            document.getElementById('commitment-form').reset();
            document.getElementById('commitment-date').value = UI.currentDate;
            document.getElementById('commitment-start').value = '08:00';
            document.getElementById('commitment-end').value = '09:00';
            UI.toggleModal('commitment-modal', true);
        });

        document.querySelectorAll('.btn-close-modal').forEach(btn => {
            btn.addEventListener('click', () => {
                UI.toggleModal('commitment-modal', false);
                UI.toggleModal('detail-modal', false);
            });
        });

        document.getElementById('search-input')?.addEventListener('input', () => {
            this.renderCurrent();
        });

        document.getElementById('commitment-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleFormSubmit();
        });

        document.getElementById('theme-toggle')?.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-bs-theme') || 'dark';
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            
            document.documentElement.setAttribute('data-bs-theme', newTheme);
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('AGENDA_THEME', newTheme);
        });

        const savedTheme = localStorage.getItem('AGENDA_THEME') || 'dark';
        document.documentElement.setAttribute('data-bs-theme', savedTheme);
        document.documentElement.setAttribute('data-theme', savedTheme);
    },

    handleFormSubmit() {
        const titleRaw = document.getElementById('commitment-title').value;
        const dateRaw = document.getElementById('commitment-date').value;
        const startRaw = document.getElementById('commitment-start').value;
        const endRaw = document.getElementById('commitment-end').value;
        const priorityRaw = document.getElementById('commitment-priority').value;
        const notesRaw = document.getElementById('commitment-notes').value;

        const sanitized = Security.sanitizeCommitmentInput({
            title: titleRaw,
            date: dateRaw,
            startTime: startRaw,
            endTime: endRaw,
            priority: priorityRaw,
            notes: notesRaw
        });

        if (!sanitized.title) {
            UI.showToast('El título del compromiso es requerido.', 'error');
            return;
        }

        if (!Security.isValidDate(sanitized.date)) {
            UI.showToast('La fecha ingresada no es válida.', 'error');
            return;
        }

        if (!Security.isValidTimeRange(sanitized.startTime, sanitized.endTime)) {
            UI.showToast('La hora de fin debe ser posterior a la hora de inicio (entre 07:00 y 13:00 hs).', 'error');
            return;
        }

        const targetObj = {
            id: UI.editingId,
            date: sanitized.date,
            startTime: sanitized.startTime,
            endTime: sanitized.endTime
        };

        const commitments = Storage.getAll();
        const conflict = AgendaLogic.findOverlapConflict(targetObj, commitments);

        if (conflict) {
            UI.showToast(
                `¡Conflicto de horario! Se solapa con "${Security.escapeHTML(conflict.title)}" (${conflict.startTime} - ${conflict.endTime} hs).`, 
                'error'
            );
            return;
        }

        if (UI.editingId) {
            const existing = commitments.find(c => c.id === UI.editingId);
            const updatePayload = {
                ...sanitized,
                active: true
            };
            if (existing && existing.deactivatedReason) {
                delete updatePayload.deactivatedReason;
                delete updatePayload.deactivatedAt;
            }
            Storage.update(UI.editingId, updatePayload);
            UI.showToast('Compromiso actualizado con éxito.', 'success');
        } else {
            Storage.add(sanitized);
            UI.showToast('Compromiso creado exitosamente.', 'success');
        }

        UI.toggleModal('commitment-modal', false);
        UI.currentDate = sanitized.date;
        UI.updateDateDisplay();
        this.renderCurrent();
    }
};
