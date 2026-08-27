// --- SECCIÓN: MOTOR DE INTERFAZ Y RENDERIZADO --- //

const UI = {
    currentDate: new Date().toISOString().split('T')[0],
    currentTab: 'grid',
    editingId: null,

    init() {
        this.updateDateDisplay();
        this.renderTimeSlotOptions();
    },

    updateDateDisplay() {
        const dateInput = document.getElementById('selected-date');
        if (dateInput) {
            dateInput.value = this.currentDate;
        }

        const dateHeader = document.getElementById('current-date-header');
        if (dateHeader) {
            const [year, month, day] = this.currentDate.split('-').map(Number);
            const dateObj = new Date(year, month - 1, day);
            const options = { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' };
            const formattedStr = dateObj.toLocaleDateString('es-AR', options);
            dateHeader.textContent = formattedStr;
        }
    },

    renderTimeSlotOptions() {
        const slots = AgendaLogic.getTimeSlots();
        const startSelect = document.getElementById('commitment-start');
        const endSelect = document.getElementById('commitment-end');

        if (!startSelect || !endSelect) return;

        startSelect.innerHTML = '<option value="">Inicio...</option>';
        endSelect.innerHTML = '<option value="">Fin...</option>';

        slots.slice(0, -1).forEach(slot => {
            startSelect.appendChild(new Option(slot, slot));
        });

        slots.slice(1).forEach(slot => {
            endSelect.appendChild(new Option(slot, slot));
        });
    },

    render(commitments) {
        const { updatedCommitments, countDeactivated } = AgendaLogic.evaluateAutomaticDeactivations(commitments);
        if (countDeactivated > 0) {
            Storage.saveAll(updatedCommitments);
            commitments = updatedCommitments;
            this.showToast(`${countDeactivated} compromiso(s) se desactivaron automáticamente por vencimiento de horario.`, 'info');
        }

        if (this.currentTab === 'grid') {
            this.renderGrid(commitments);
        } else if (this.currentTab === 'list') {
            this.renderActiveList(commitments);
        } else if (this.currentTab === 'deactivated') {
            this.renderDeactivatedList(commitments);
        }
    },

    renderGrid(commitments) {
        const container = document.getElementById('agenda-grid-container');
        if (!container) return;

        const slots = AgendaLogic.getTimeSlots();
        const rowSlots = slots.slice(0, -1);
        const activeToday = commitments.filter(item => item.active && item.date === this.currentDate);

        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        const isToday = (this.currentDate === todayStr);

        let currentTimeIndicatorTop = null;
        if (isToday) {
            const currentMins = now.getHours() * 60 + now.getMinutes();
            const startMins = 7 * 60;
            const endMins = 13 * 60;

            if (currentMins >= startMins && currentMins <= endMins) {
                const elapsedRatio = (currentMins - startMins) / (endMins - startMins);
                currentTimeIndicatorTop = 38 + Math.round(elapsedRatio * (12 * 60));
            }
        }

        let html = `
            <div class="grid-table">
                <div class="grid-header-row">
                    <div class="grid-time-col-header">Horario</div>
                    <div class="grid-slot-col-header text-truncate">Agenda (${this.currentDate})</div>
                </div>
                <div class="grid-body">
        `;

        if (currentTimeIndicatorTop !== null) {
            html += `<div class="current-time-indicator" style="top: ${currentTimeIndicatorTop}px;" title="Hora Actual"></div>`;
        }

        rowSlots.forEach((slotTime, index) => {
            const nextSlotTime = slots[index + 1];
            const startingItems = activeToday.filter(item => item.startTime === slotTime);

            html += `
                <div class="grid-row" data-slot="${slotTime}">
                    <div class="grid-time-cell">
                        <span class="time-label">${slotTime}</span>
                        <span class="time-end-sublabel">a ${nextSlotTime}</span>
                    </div>
                    <div class="grid-content-cell" id="cell-${slotTime.replace(':', '')}">
            `;

            if (startingItems.length > 0) {
                startingItems.forEach(item => {
                    const spanSlots = AgendaLogic.calculateSpanSlots(item.startTime, item.endTime);
                    const cardHeight = spanSlots * 60 - 8;

                    let prioBadge = '';
                    if (item.priority === 'Urgente') {
                        prioBadge = `<span class="badge-custom badge-rose">Urgente</span>`;
                    } else if (item.priority === 'Alta') {
                        prioBadge = `<span class="badge-custom badge-amber">Alta</span>`;
                    }

                    html += `
                        <div class="commitment-card" 
                             style="height: ${cardHeight}px;"
                             onclick="UI.showDetailModal('${item.id}')">
                            <div class="card-top-bar">
                                <span class="card-time-badge">${Security.escapeHTML(item.startTime)} - ${Security.escapeHTML(item.endTime)}</span>
                                ${prioBadge}
                            </div>
                            <div class="card-title">${Security.escapeHTML(item.title)}</div>
                            
                            <div class="card-actions-hover" onclick="event.stopPropagation()">
                                <button class="btn-icon" title="Editar" onclick="UI.openEditModal('${item.id}')">
                                    <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="1.5" fill="none"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                </button>
                                <button class="btn-icon btn-icon-danger" title="Desactivar" onclick="UI.confirmDeactivate('${item.id}')">
                                    <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" stroke-width="1.5" fill="none"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>
                                </button>
                            </div>
                        </div>
                    `;
                });
            } else {
                html += `
                    <div class="empty-slot-trigger" onclick="UI.openCreateModalForSlot('${slotTime}')">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        <span class="text-truncate">Agregar acto a las ${slotTime} hs</span>
                    </div>
                `;
            }

            html += `
                    </div>
                </div>
            `;
        });

        html += `
                </div>
            </div>
        `;

        container.innerHTML = html;
    },

    renderActiveList(commitments) {
        const container = document.getElementById('agenda-grid-container');
        if (!container) return;

        const activeList = commitments.filter(item => item.active);
        const searchQuery = (document.getElementById('search-input')?.value || '').toLowerCase().trim();

        const filtered = activeList.filter(item => {
            if (!searchQuery) return true;
            return item.title.toLowerCase().includes(searchQuery) ||
                   item.date.includes(searchQuery);
        });

        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="card bg-surface border-secondary-subtle p-4 text-center text-secondary rounded-3">
                    <svg class="mb-2 opacity-50" viewBox="0 0 24 24" width="36" height="36" stroke="currentColor" stroke-width="1.5" fill="none"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                    <h3 class="h6 text-light mb-1">No hay compromisos activos</h3>
                    <p class="small mb-0">No se encontraron compromisos programados que coincidan con la búsqueda.</p>
                </div>
            `;
            return;
        }

        let html = `
            <div class="table-responsive card bg-surface border-secondary-subtle rounded-3">
                <table class="table table-dark table-hover align-middle mb-0 small">
                    <thead>
                        <tr>
                            <th>Fecha</th>
                            <th>Horario</th>
                            <th>Título / Motivo</th>
                            <th>Prioridad</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        filtered.sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime)).forEach(item => {
            let prioBadge = `<span class="badge-custom badge-zinc">Normal</span>`;
            if (item.priority === 'Urgente') prioBadge = `<span class="badge-custom badge-rose">Urgente</span>`;
            else if (item.priority === 'Alta') prioBadge = `<span class="badge-custom badge-amber">Alta</span>`;
            else if (item.priority === 'Baja') prioBadge = `<span class="badge-custom badge-zinc">Baja</span>`;

            html += `
                <tr>
                    <td class="font-mono"><strong>${Security.escapeHTML(item.date)}</strong></td>
                    <td><span class="badge-custom badge-indigo font-mono">${Security.escapeHTML(item.startTime)} - ${Security.escapeHTML(item.endTime)} hs</span></td>
                    <td class="fw-medium">${Security.escapeHTML(item.title)}</td>
                    <td>${prioBadge}</td>
                    <td>
                        <div class="d-flex gap-1">
                            <button class="btn btn-outline-secondary btn-sm py-0 px-2" onclick="UI.showDetailModal('${item.id}')">Detalle</button>
                            <button class="btn btn-indigo btn-sm py-0 px-2 text-white" onclick="UI.openEditModal('${item.id}')">Editar</button>
                            <button class="btn btn-outline-danger btn-sm py-0 px-2" onclick="UI.confirmDeactivate('${item.id}')">Desactivar</button>
                        </div>
                    </td>
                </tr>
            `;
        });

        html += `
                    </tbody>
                </table>
            </div>
        `;

        container.innerHTML = html;
    },

    renderDeactivatedList(commitments) {
        const container = document.getElementById('agenda-grid-container');
        if (!container) return;

        const deactivatedList = commitments.filter(item => !item.active);
        const searchQuery = (document.getElementById('search-input')?.value || '').toLowerCase().trim();

        const filtered = deactivatedList.filter(item => {
            if (!searchQuery) return true;
            return item.title.toLowerCase().includes(searchQuery) ||
                   item.date.includes(searchQuery);
        });

        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="card bg-surface border-secondary-subtle p-4 text-center text-secondary rounded-3">
                    <svg class="mb-2 opacity-50" viewBox="0 0 24 24" width="36" height="36" stroke="currentColor" stroke-width="1.5" fill="none"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                    <h3 class="h6 text-light mb-1">No hay registros desactivados</h3>
                    <p class="small mb-0">Los compromisos desactivados manualmente o por vencimiento aparecerán aquí.</p>
                </div>
            `;
            return;
        }

        let html = `
            <div class="table-responsive card bg-surface border-secondary-subtle rounded-3">
                <table class="table table-dark table-hover align-middle mb-0 small opacity-75">
                    <thead>
                        <tr>
                            <th>Fecha</th>
                            <th>Horario</th>
                            <th>Título / Motivo</th>
                            <th>Motivo Desactivación</th>
                            <th>Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        filtered.sort((a, b) => (b.date + b.startTime).localeCompare(a.date + a.startTime)).forEach(item => {
            const isExpired = item.deactivatedReason === 'expired';
            const reasonLabel = isExpired ? 'Vencimiento de horario' : 'Desactivación manual';
            const reasonBadge = isExpired ? `<span class="badge-custom badge-rose">${reasonLabel}</span>` : `<span class="badge-custom badge-amber">${reasonLabel}</span>`;

            html += `
                <tr>
                    <td class="font-mono"><strong>${Security.escapeHTML(item.date)}</strong></td>
                    <td><span class="badge-custom badge-zinc font-mono">${Security.escapeHTML(item.startTime)} - ${Security.escapeHTML(item.endTime)} hs</span></td>
                    <td class="title-inactive fw-medium">${Security.escapeHTML(item.title)}</td>
                    <td>${reasonBadge}</td>
                    <td>
                        <div class="d-flex gap-1">
                            <button class="btn btn-outline-secondary btn-sm py-0 px-2" onclick="UI.showDetailModal('${item.id}')">Detalle</button>
                            <button class="btn btn-indigo btn-sm py-0 px-2 text-white" onclick="UI.openEditModal('${item.id}')">Editar</button>
                            <button class="btn btn-outline-success btn-sm py-0 px-2" onclick="UI.handleReactivate('${item.id}')">Reactivar</button>
                        </div>
                    </td>
                </tr>
            `;
        });

        html += `
                    </tbody>
                </table>
            </div>
        `;

        container.innerHTML = html;
    },

    openCreateModalForSlot(slotTime) {
        this.editingId = null;
        document.getElementById('modal-title').textContent = 'Nuevo Compromiso';
        document.getElementById('commitment-form').reset();
        
        document.getElementById('commitment-date').value = this.currentDate;
        document.getElementById('commitment-start').value = slotTime;

        const slots = AgendaLogic.getTimeSlots();
        const startIdx = slots.indexOf(slotTime);
        if (startIdx !== -1 && startIdx + 1 < slots.length) {
            document.getElementById('commitment-end').value = slots[startIdx + 1];
        }

        this.toggleModal('commitment-modal', true);
    },

    openEditModal(id) {
        const commitments = Storage.getAll();
        const item = commitments.find(c => c.id === id);
        if (!item) return;

        this.editingId = id;
        document.getElementById('modal-title').textContent = item.active ? 'Editar Compromiso' : 'Editar y Reactivar Compromiso';
        
        document.getElementById('commitment-title').value = item.title;
        document.getElementById('commitment-date').value = item.date;
        document.getElementById('commitment-start').value = item.startTime;
        document.getElementById('commitment-end').value = item.endTime;
        document.getElementById('commitment-priority').value = item.priority || 'Media';
        document.getElementById('commitment-notes').value = item.notes || '';

        this.toggleModal('commitment-modal', true);
    },

    showDetailModal(id) {
        const commitments = Storage.getAll();
        const item = commitments.find(c => c.id === id);
        if (!item) return;

        const body = document.getElementById('detail-modal-body');
        const statusBadge = item.active 
            ? `<span class="badge-custom badge-emerald">Activo</span>`
            : `<span class="badge-custom badge-rose">Desactivado (${item.deactivatedReason === 'expired' ? 'Vencido' : 'Manual'})</span>`;

        body.innerHTML = `
            <div class="mb-3">
                <div class="d-flex align-items-center justify-content-between">
                    <h4 class="h6 fw-semibold text-light mb-0">${Security.escapeHTML(item.title)}</h4>
                    ${statusBadge}
                </div>
            </div>
            <div class="row g-2 p-2 bg-dark rounded border border-secondary-subtle small mb-3">
                <div class="col-6"><strong>Fecha:</strong> <span class="font-mono text-light">${Security.escapeHTML(item.date)}</span></div>
                <div class="col-6"><strong>Horario:</strong> <span class="font-mono text-light">${Security.escapeHTML(item.startTime)} - ${Security.escapeHTML(item.endTime)} hs</span></div>
                <div class="col-12"><strong>Prioridad:</strong> ${Security.escapeHTML(item.priority)}</div>
            </div>
            <div class="p-2 bg-dark rounded border border-secondary-subtle small">
                <strong class="d-block mb-1">Observaciones:</strong>
                <p class="mb-0 text-secondary">${item.notes ? Security.escapeHTML(item.notes) : '<em>Sin observaciones cargadas.</em>'}</p>
            </div>
        `;

        this.toggleModal('detail-modal', true);
    },

    confirmDeactivate(id) {
        if (confirm('¿Desea desactivar este registro? Podrá ser consultado en la pestaña de Desactivados.')) {
            Storage.deactivate(id, 'manual');
            this.showToast('Registro desactivado correctamente.', 'success');
            this.render(Storage.getAll());
        }
    },

    handleReactivate(id) {
        const commitments = Storage.getAll();
        const item = commitments.find(c => c.id === id);
        if (!item) return;

        const check = AgendaLogic.canReactivate(item, commitments);
        if (!check.canReactivate) {
            if (confirm(`${check.reason}\n\n¿Desea editar la fecha u horario de este compromiso para reactivarlo?`)) {
                this.openEditModal(id);
            }
            return;
        }

        if (Storage.reactivate(id)) {
            this.showToast('Compromiso reactivado exitosamente.', 'success');
            this.render(Storage.getAll());
        }
    },

    toggleModal(modalId, show) {
        const modalEl = document.getElementById(modalId);
        if (!modalEl) return;
        
        let modalInstance = bootstrap.Modal.getInstance(modalEl);
        if (!modalInstance) {
            modalInstance = new bootstrap.Modal(modalEl);
        }

        if (show) {
            modalInstance.show();
        } else {
            modalInstance.hide();
        }
    },

    showToast(message, type = 'info') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toastEl = document.createElement('div');
        toastEl.className = `toast align-items-center text-bg-dark border-secondary-subtle show`;
        toastEl.setAttribute('role', 'alert');
        toastEl.setAttribute('aria-live', 'assertive');
        toastEl.setAttribute('aria-atomic', 'true');

        const iconSvg = type === 'success' 
            ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`
            : type === 'error'
            ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`
            : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;

        toastEl.innerHTML = `
            <div class="d-flex">
                <div class="toast-body d-flex align-items-center gap-2 small">
                    ${iconSvg} <span>${Security.escapeHTML(message)}</span>
                </div>
                <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
            </div>
        `;

        container.appendChild(toastEl);

        setTimeout(() => {
            toastEl.remove();
        }, 4000);
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = UI;
}
