// --- MOTOR DE INTERFAZ Y RENDERIZADO --- //

const UI = {
    currentDate: AgendaLogic.getInitialDate(),
    currentTab: 'grid',
    editingId: null,

    searchState: {
        query: '',
        matches: [],
        currentIndex: -1
    },

    updateSearch(queryRaw) {
        const query = (queryRaw || '').toLowerCase().trim();
        const countEl = document.getElementById('search-count');
        const prevBtn = document.getElementById('btn-search-prev');
        const nextBtn = document.getElementById('btn-search-next');
        const clearBtn = document.getElementById('btn-search-clear');

        if (!query) {
            this.searchState = { query: '', matches: [], currentIndex: -1 };
            if (countEl) countEl.classList.add('d-none');
            if (prevBtn) prevBtn.classList.add('d-none');
            if (nextBtn) nextBtn.classList.add('d-none');
            if (clearBtn) clearBtn.classList.add('d-none');
            if (typeof App !== 'undefined') App.renderCurrent();
            return;
        }

        if (clearBtn) clearBtn.classList.remove('d-none');

        const allCommitments = typeof Storage !== 'undefined' ? Storage.getAll() : [];
        const isDeactivatedTab = (this.currentTab === 'deactivated');
        
        const filteredCommitments = allCommitments.filter(item => isDeactivatedTab ? !item.active : item.active);

        const matches = filteredCommitments.filter(item => {
            return (
                (item.title && item.title.toLowerCase().includes(query)) ||
                (item.notes && item.notes.toLowerCase().includes(query)) ||
                (item.priority && item.priority.toLowerCase().includes(query)) ||
                (item.date && item.date.includes(query))
            );
        }).sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));

        this.searchState.query = query;
        this.searchState.matches = matches;

        if (matches.length === 0) {
            this.searchState.currentIndex = -1;
            if (countEl) {
                countEl.textContent = '0 de 0';
                countEl.classList.remove('d-none');
            }
            if (prevBtn) prevBtn.classList.add('d-none');
            if (nextBtn) nextBtn.classList.add('d-none');
        } else {
            if (this.searchState.currentIndex < 0 || this.searchState.currentIndex >= matches.length) {
                this.searchState.currentIndex = 0;
            }

            const activeMatch = matches[this.searchState.currentIndex];
            if (this.currentTab === 'grid' && activeMatch && activeMatch.date !== this.currentDate) {
                this.currentDate = activeMatch.date;
                this.updateDateDisplay();
            }

            const currentDisplay = this.searchState.currentIndex + 1;
            if (countEl) {
                countEl.textContent = `${currentDisplay} de ${matches.length}`;
                countEl.classList.remove('d-none');
            }
            if (prevBtn) prevBtn.classList.remove('d-none');
            if (nextBtn) nextBtn.classList.remove('d-none');
        }

        if (typeof App !== 'undefined') App.renderCurrent();
        this.scrollToActiveMatch();
    },

    navigateSearch(direction) {
        const matches = this.searchState.matches;
        if (!matches || matches.length === 0) return;

        let newIndex = this.searchState.currentIndex + direction;
        if (newIndex >= matches.length) newIndex = 0;
        if (newIndex < 0) newIndex = matches.length - 1;

        this.searchState.currentIndex = newIndex;
        const targetItem = matches[newIndex];

        const countEl = document.getElementById('search-count');
        if (countEl) {
            countEl.textContent = `${newIndex + 1} de ${matches.length}`;
        }

        if (this.currentTab === 'grid' && targetItem.date !== this.currentDate) {
            this.currentDate = targetItem.date;
            this.updateDateDisplay();
        }

        if (typeof App !== 'undefined') App.renderCurrent();
        this.scrollToActiveMatch();
    },

    clearSearch() {
        const input = document.getElementById('search-input');
        if (input) input.value = '';
        this.updateSearch('');
    },

    scrollToActiveMatch() {
        setTimeout(() => {
            const matches = this.searchState.matches;
            const idx = this.searchState.currentIndex;
            if (!matches || idx < 0 || idx >= matches.length) return;

            const targetItem = matches[idx];
            const activeCard = document.querySelector(`.commitment-card[onclick*="${targetItem.id}"]`) ||
                               document.querySelector(`tr[onclick*="${targetItem.id}"]`);

            if (activeCard) {
                activeCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 100);
    },

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

        const searchQuery = (document.getElementById('search-input')?.value || '').toLowerCase().trim();

        const slots = AgendaLogic.getTimeSlots();
        const rowSlots = slots.slice(0, -1);
        const activeToday = commitments.filter(item => item.active && item.date === this.currentDate);

        const now = new Date();
        const todayStr = AgendaLogic.getLocalDateString(now);
        const isToday = (this.currentDate === todayStr);

        let currentTimeIndicatorTop = null;
        if (isToday) {
            const currentMins = now.getHours() * 60 + now.getMinutes();
            const startMins = 7 * 60;
            const endMins = 13 * 60;

            if (currentMins >= startMins && currentMins <= endMins) {
                const elapsedRatio = (currentMins - startMins) / (endMins - startMins);
                currentTimeIndicatorTop = Math.round(elapsedRatio * 720);
            }
        }

        const positionedEvents = AgendaLogic.calculateLayoutPositions(activeToday);

        let html = `
            <div class="grid-table">
                <div class="grid-header-row">
                    <div class="grid-time-col-header">Horario</div>
                    <div class="grid-slot-col-header text-truncate">Agenda (${this.currentDate})</div>
                </div>
                <div class="grid-body position-relative">
        `;

        if (currentTimeIndicatorTop !== null) {
            html += `<div class="current-time-indicator" style="top: ${currentTimeIndicatorTop}px;" title="Hora Actual"></div>`;
        }

        rowSlots.forEach((slotTime) => {
            const [h, m] = slotTime.split(':').map(Number);
            const endH = m === 30 ? (h + 1).toString().padStart(2, '0') : h.toString().padStart(2, '0');
            const endM = m === 30 ? '00' : '30';
            const nextSlotTime = `${endH}:${endM}`;

            const slotMins = AgendaLogic.timeToMinutes(slotTime);
            const isSlotCovered = activeToday.some(item => {
                const startMins = AgendaLogic.timeToMinutes(item.startTime);
                const endMins = AgendaLogic.timeToMinutes(item.endTime);
                return slotMins >= startMins && slotMins < endMins;
            });

            html += `
                <div class="grid-row" data-slot="${slotTime}">
                    <div class="grid-time-cell">
                        <span class="time-label">${slotTime}</span>
                        <span class="time-end-sublabel">a ${nextSlotTime}</span>
                    </div>
                    <div class="grid-content-cell">
            `;

            if (!isSlotCovered) {
                html += `
                        <div class="empty-slot-trigger" onclick="UI.openCreateModalForSlot('${slotTime}')">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                            <span class="text-truncate">Agregar compromiso a las ${slotTime} hs</span>
                        </div>
                `;
            } else {
                html += `
                        <div class="empty-slot-placeholder" onclick="UI.openCreateModalForSlot('${slotTime}')" title="Agregar compromiso a las ${slotTime} hs"></div>
                `;
            }

            html += `
                    </div>
                </div>
            `;
        });

        html += `<div class="grid-events-layer">`;

        positionedEvents.forEach(item => {
            let prioBadge = '';
            if (item.priority === 'Urgente') {
                prioBadge = `<span class="badge-custom badge-rose">Urgente</span>`;
            } else if (item.priority === 'Alta') {
                prioBadge = `<span class="badge-custom badge-amber">Alta</span>`;
            }

            let conflictBadge = '';
            let cardConflictClass = '';
            if (item.hasConflict) {
                cardConflictClass = 'has-conflict';
                conflictBadge = `<span class="badge-custom badge-rose me-1 font-mono">Conflicto</span>`;
            }

            let searchClass = '';
            if (searchQuery) {
                const activeMatchId = (this.searchState.matches && this.searchState.currentIndex >= 0)
                    ? this.searchState.matches[this.searchState.currentIndex]?.id
                    : null;

                const isMatch = (
                    (item.title && item.title.toLowerCase().includes(searchQuery)) ||
                    (item.notes && item.notes.toLowerCase().includes(searchQuery)) ||
                    (item.priority && item.priority.toLowerCase().includes(searchQuery)) ||
                    (item.date && item.date.includes(searchQuery))
                );

                if (item.id === activeMatchId) {
                    searchClass = 'is-active-search-match';
                } else if (isMatch) {
                    searchClass = 'is-search-highlight';
                } else {
                    searchClass = 'is-dimmed';
                }
            }

            html += `
                <div class="commitment-card ${cardConflictClass} ${searchClass}" 
                     style="top: ${item.topPx}px; height: ${item.heightPx}px; left: calc(${item.leftPct}% + 4px); width: calc(${item.widthPct}% - 8px);"
                     onclick="UI.showDetailModal('${item.id}')">
                    <div class="card-top-bar">
                        <span class="card-time-badge font-mono">${Security.escapeHTML(item.startTime)} - ${Security.escapeHTML(item.endTime)}</span>
                        <div class="d-flex align-items-center gap-1">
                            ${conflictBadge}
                            ${prioBadge}
                        </div>
                    </div>
                    <div class="card-title text-truncate">${Security.escapeHTML(item.title)}</div>
                    
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

        html += `
                </div>
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
            return (
                (item.title && item.title.toLowerCase().includes(searchQuery)) ||
                (item.notes && item.notes.toLowerCase().includes(searchQuery)) ||
                (item.priority && item.priority.toLowerCase().includes(searchQuery)) ||
                (item.date && item.date.includes(searchQuery))
            );
        });

        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="card bg-surface border-secondary-subtle p-4 text-center text-secondary rounded-3">
                    <svg class="mb-2 opacity-50" viewBox="0 0 24 24" width="36" height="36" stroke="currentColor" stroke-width="1.5" fill="none"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                    <h3 class="h6 text-primary-custom mb-1">No hay compromisos activos</h3>
                    <p class="small mb-0">No se encontraron compromisos programados que coincidan con la búsqueda.</p>
                </div>
            `;
            return;
        }

        const sorted = filtered.sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));

        // Vista de Tabla (Desktop)
        let tableRows = sorted.map(item => {
            let prioBadge = `<span class="badge-custom badge-zinc">Normal</span>`;
            if (item.priority === 'Urgente') prioBadge = `<span class="badge-custom badge-rose">Urgente</span>`;
            else if (item.priority === 'Alta') prioBadge = `<span class="badge-custom badge-amber">Alta</span>`;
            else if (item.priority === 'Baja') prioBadge = `<span class="badge-custom badge-zinc">Baja</span>`;

            return `
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
        }).join('');

        let desktopHtml = `
            <div class="d-none d-md-block table-responsive card bg-surface border-secondary-subtle rounded-3">
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
                        ${tableRows}
                    </tbody>
                </table>
            </div>
        `;

        // Vista de Tarjetas (Mobile)
        let mobileCards = sorted.map(item => {
            let prioBadge = `<span class="badge-custom badge-zinc">Normal</span>`;
            if (item.priority === 'Urgente') prioBadge = `<span class="badge-custom badge-rose">Urgente</span>`;
            else if (item.priority === 'Alta') prioBadge = `<span class="badge-custom badge-amber">Alta</span>`;
            else if (item.priority === 'Baja') prioBadge = `<span class="badge-custom badge-zinc">Baja</span>`;

            return `
                <div class="card bg-surface border-secondary-subtle p-3 rounded-3 shadow-sm mb-2">
                    <div class="d-flex justify-content-between align-items-start gap-2 mb-2">
                        <div>
                            <div class="font-mono text-primary-custom fw-bold small">${Security.escapeHTML(item.date)}</div>
                            <span class="badge-custom badge-indigo font-mono small">${Security.escapeHTML(item.startTime)} - ${Security.escapeHTML(item.endTime)} hs</span>
                        </div>
                        <div>${prioBadge}</div>
                    </div>
                    <h4 class="h6 fw-semibold text-primary-custom mb-1">${Security.escapeHTML(item.title)}</h4>
                    ${item.notes ? `<p class="small text-secondary-custom mb-2 text-truncate">${Security.escapeHTML(item.notes)}</p>` : ''}
                    <div class="d-flex gap-1 mt-2 pt-2 border-top border-secondary-subtle border-opacity-25">
                        <button class="btn btn-outline-secondary btn-sm py-1 px-2 flex-grow-1" onclick="UI.showDetailModal('${item.id}')">Detalle</button>
                        <button class="btn btn-indigo btn-sm py-1 px-2 text-white flex-grow-1" onclick="UI.openEditModal('${item.id}')">Editar</button>
                        <button class="btn btn-outline-danger btn-sm py-1 px-2 flex-grow-1" onclick="UI.confirmDeactivate('${item.id}')">Desactivar</button>
                    </div>
                </div>
            `;
        }).join('');

        let mobileHtml = `
            <div class="d-block d-md-none">
                ${mobileCards}
            </div>
        `;

        container.innerHTML = desktopHtml + mobileHtml;
    },

    renderDeactivatedList(commitments) {
        const container = document.getElementById('agenda-grid-container');
        if (!container) return;

        const deactivatedList = commitments.filter(item => !item.active);
        const searchQuery = (document.getElementById('search-input')?.value || '').toLowerCase().trim();

        const filtered = deactivatedList.filter(item => {
            if (!searchQuery) return true;
            return (
                (item.title && item.title.toLowerCase().includes(searchQuery)) ||
                (item.notes && item.notes.toLowerCase().includes(searchQuery)) ||
                (item.priority && item.priority.toLowerCase().includes(searchQuery)) ||
                (item.date && item.date.includes(searchQuery))
            );
        });

        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="card bg-surface border-secondary-subtle p-4 text-center text-secondary rounded-3">
                    <svg class="mb-2 opacity-50" viewBox="0 0 24 24" width="36" height="36" stroke="currentColor" stroke-width="1.5" fill="none"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                    <h3 class="h6 text-primary-custom mb-1">No hay registros desactivados</h3>
                    <p class="small mb-0">Los compromisos desactivados manualmente o por vencimiento aparecerán aquí.</p>
                </div>
            `;
            return;
        }

        const sorted = filtered.sort((a, b) => (b.date + b.startTime).localeCompare(a.date + a.startTime));

        // Vista de Tabla (Desktop)
        let tableRows = sorted.map(item => {
            const isExpired = item.deactivatedReason === 'expired';
            const reasonLabel = isExpired ? 'Vencimiento de horario' : 'Desactivación manual';
            const reasonBadge = isExpired ? `<span class="badge-custom badge-rose">${reasonLabel}</span>` : `<span class="badge-custom badge-amber">${reasonLabel}</span>`;

            return `
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
        }).join('');

        let desktopHtml = `
            <div class="d-none d-md-block table-responsive card bg-surface border-secondary-subtle rounded-3">
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
                        ${tableRows}
                    </tbody>
                </table>
            </div>
        `;

        // Vista de Tarjetas (Mobile)
        let mobileCards = sorted.map(item => {
            const isExpired = item.deactivatedReason === 'expired';
            const reasonLabel = isExpired ? 'Vencimiento de horario' : 'Desactivación manual';
            const reasonBadge = isExpired ? `<span class="badge-custom badge-rose">${reasonLabel}</span>` : `<span class="badge-custom badge-amber">${reasonLabel}</span>`;

            return `
                <div class="card bg-surface border-secondary-subtle p-3 rounded-3 shadow-sm mb-2 opacity-75">
                    <div class="d-flex justify-content-between align-items-start gap-2 mb-2">
                        <div>
                            <div class="font-mono text-primary-custom fw-bold small">${Security.escapeHTML(item.date)}</div>
                            <span class="badge-custom badge-zinc font-mono small">${Security.escapeHTML(item.startTime)} - ${Security.escapeHTML(item.endTime)} hs</span>
                        </div>
                        <div>${reasonBadge}</div>
                    </div>
                    <h4 class="h6 fw-semibold text-primary-custom title-inactive mb-1">${Security.escapeHTML(item.title)}</h4>
                    ${item.notes ? `<p class="small text-secondary-custom mb-2 text-truncate">${Security.escapeHTML(item.notes)}</p>` : ''}
                    <div class="d-flex gap-1 mt-2 pt-2 border-top border-secondary-subtle border-opacity-25">
                        <button class="btn btn-outline-secondary btn-sm py-1 px-2 flex-grow-1" onclick="UI.showDetailModal('${item.id}')">Detalle</button>
                        <button class="btn btn-indigo btn-sm py-1 px-2 text-white flex-grow-1" onclick="UI.openEditModal('${item.id}')">Editar</button>
                        <button class="btn btn-outline-success btn-sm py-1 px-2 flex-grow-1" onclick="UI.handleReactivate('${item.id}')">Reactivar</button>
                    </div>
                </div>
            `;
        }).join('');

        let mobileHtml = `
            <div class="d-block d-md-none">
                ${mobileCards}
            </div>
        `;

        container.innerHTML = desktopHtml + mobileHtml;
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
                    <h4 class="h6 fw-semibold text-primary-custom mb-0">${Security.escapeHTML(item.title)}</h4>
                    ${statusBadge}
                </div>
            </div>
            <div class="row g-2 p-2 bg-card-inner rounded border border-secondary-subtle small mb-3">
                <div class="col-6"><strong>Fecha:</strong> <span class="font-mono text-primary-custom">${Security.escapeHTML(item.date)}</span></div>
                <div class="col-6"><strong>Horario:</strong> <span class="font-mono text-primary-custom">${Security.escapeHTML(item.startTime)} - ${Security.escapeHTML(item.endTime)} hs</span></div>
                <div class="col-12"><strong>Prioridad:</strong> ${Security.escapeHTML(item.priority)}</div>
            </div>
            <div class="p-2 bg-card-inner rounded border border-secondary-subtle small">
                <strong class="d-block mb-1">Observaciones:</strong>
                <p class="mb-0 text-secondary-custom">${item.notes ? Security.escapeHTML(item.notes) : '<em>Sin observaciones cargadas.</em>'}</p>
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

    showToast(message, type = 'info', customTitle = '') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toastEl = document.createElement('div');
        
        let borderClass = 'toast-info';
        let defaultTitle = 'Información';
        let iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
        let duration = 5000;

        if (type === 'success') {
            borderClass = 'toast-success';
            defaultTitle = 'Operación Exitosa';
            iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`;
        } else if (type === 'error') {
            borderClass = 'toast-error';
            defaultTitle = '¡Atención / Conflicto!';
            iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>`;
            duration = 8500;
        } else if (type === 'warning') {
            borderClass = 'toast-warning';
            defaultTitle = 'Advertencia';
            iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
            duration = 7500;
        }

        const titleText = customTitle || defaultTitle;

        toastEl.className = `custom-toast-item ${borderClass} p-3 mb-2`;
        toastEl.setAttribute('role', 'alert');

        toastEl.innerHTML = `
            <div class="d-flex align-items-start gap-3">
                <div class="toast-icon-wrapper flex-shrink-0 mt-0.5">
                    ${iconSvg}
                </div>
                <div class="toast-content flex-grow-1">
                    <div class="fw-semibold text-primary-custom mb-1" style="font-size: 0.9rem;">${Security.escapeHTML(titleText)}</div>
                    <div class="text-secondary-custom" style="font-size: 0.84rem; line-height: 1.4;">${Security.escapeHTML(message)}</div>
                </div>
                <button type="button" class="btn-close btn-close-custom btn-sm ms-2 flex-shrink-0" onclick="this.closest('.custom-toast-item').remove()" aria-label="Close"></button>
            </div>
        `;

        container.appendChild(toastEl);

        setTimeout(() => {
            if (toastEl.parentNode) {
                toastEl.classList.add('toast-fade-out');
                setTimeout(() => toastEl.remove(), 300);
            }
        }, duration);
    },

    showConflictsModal(conflicts) {
        if (!Array.isArray(conflicts) || conflicts.length === 0) return;

        const listContainer = document.getElementById('conflicts-list-container');
        if (!listContainer) return;

        let html = '';
        conflicts.forEach((item, idx) => {
            const imp = item.imported;
            const ex = item.existing;

            html += `
                <div class="p-3 bg-card-inner rounded-3 border border-danger-subtle">
                    <div class="d-flex align-items-center justify-content-between mb-2">
                        <span class="badge-custom badge-rose font-mono">Conflicto #${idx + 1} &bull; ${Security.escapeHTML(imp.date)} (${Security.escapeHTML(imp.startTime)} - ${Security.escapeHTML(imp.endTime)} hs)</span>
                    </div>
                    <div class="row g-2 small">
                        <div class="col-12 col-md-6">
                            <div class="p-2 rounded bg-surface border border-secondary-subtle">
                                <strong class="d-block text-rose-400 mb-0.5">Acto Importado:</strong>
                                <span class="text-primary-custom fw-medium">${Security.escapeHTML(imp.title)}</span>
                            </div>
                        </div>
                        <div class="col-12 col-md-6">
                            <div class="p-2 rounded bg-surface border border-secondary-subtle">
                                <strong class="d-block text-amber-400 mb-0.5">Ya existente en la agenda:</strong>
                                <span class="text-primary-custom fw-medium">${Security.escapeHTML(ex.title)}</span>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });

        listContainer.innerHTML = html;
        this.toggleModal('conflicts-modal', true);
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = UI;
}
