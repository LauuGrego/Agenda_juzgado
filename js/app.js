// --- CONTROLADOR PRINCIPAL --- //

document.addEventListener('DOMContentLoaded', () => {
    App.init();
});

const App = {
    pendingImportItems: null,

    async init() {
        UI.init();
        this.checkAuthStatus();
        this.bindEvents();

        // Escuchar cambios en el estado de conexión con la base de datos (Supabase o Local)
        Storage.onStatusChange((status, isOnline, message, provider) => {
            UI.updateDbStatusBadge(status, isOnline, message, provider);
        });

        // Inicialización y carga inicial desde la base de datos
        await Storage.init();
        if (Security.isAuthenticated()) {
            this.renderCurrent();
        }

        // Sincronización automática periódica en segundo plano (cada 8 segundos)
        setInterval(async () => {
            if (Security.isAuthenticated() && Storage.isOnline) {
                await Storage.fetchRemoteData();
                this.renderCurrent();
            }
        }, 8000);

        // Sincronización automática instantánea cuando el usuario regresa a la pestaña o ventana
        window.addEventListener('focus', async () => {
            if (Security.isAuthenticated() && Storage.isOnline) {
                await Storage.fetchRemoteData();
                this.renderCurrent();
            }
        });

        document.addEventListener('visibilitychange', async () => {
            if (document.visibilityState === 'visible' && Security.isAuthenticated() && Storage.isOnline) {
                await Storage.fetchRemoteData();
                this.renderCurrent();
            }
        });

        window.addEventListener('online', async () => {
            if (Security.isAuthenticated()) {
                await Storage.init();
                this.renderCurrent();
            }
        });
    },

    checkAuthStatus() {
        const overlay = document.getElementById('auth-overlay');
        if (!overlay) return;

        if (Security.isAuthenticated()) {
            overlay.classList.add('hidden');
        } else {
            overlay.classList.remove('hidden');
            setTimeout(() => {
                document.getElementById('auth-password')?.focus();
            }, 100);
        }
    },

    renderCurrent() {
        const commitments = Storage.getAll();
        UI.render(commitments);
    },

    bindEvents() {
        document.getElementById('selected-date')?.addEventListener('change', (e) => {
            if (e.target.value) {
                UI.currentDate = e.target.value;
                if (UI.currentTab === 'list' || UI.currentTab === 'deactivated') {
                    UI.listFilters.date = e.target.value;
                }
                UI.updateDateDisplay();
                this.renderCurrent();
            }
        });

        document.getElementById('btn-prev-day')?.addEventListener('click', () => {
            const [y, m, d] = UI.currentDate.split('-').map(Number);
            const dt = new Date(y, m - 1, d - 1);
            UI.currentDate = AgendaLogic.getLocalDateString(dt);
            if (UI.currentTab === 'list' || UI.currentTab === 'deactivated') {
                UI.listFilters.date = UI.currentDate;
            }
            UI.updateDateDisplay();
            this.renderCurrent();
        });

        document.getElementById('btn-next-day')?.addEventListener('click', () => {
            const [y, m, d] = UI.currentDate.split('-').map(Number);
            const dt = new Date(y, m - 1, d + 1);
            UI.currentDate = AgendaLogic.getLocalDateString(dt);
            if (UI.currentTab === 'list' || UI.currentTab === 'deactivated') {
                UI.listFilters.date = UI.currentDate;
            }
            UI.updateDateDisplay();
            this.renderCurrent();
        });

        document.getElementById('btn-today')?.addEventListener('click', () => {
            UI.currentDate = AgendaLogic.getInitialDate();
            if (UI.currentTab === 'list' || UI.currentTab === 'deactivated') {
                UI.listFilters.date = UI.currentDate;
            }
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
            btn.addEventListener('click', (e) => {
                const modalEl = e.currentTarget.closest('.modal');
                if (modalEl && modalEl.id) {
                    UI.toggleModal(modalEl.id, false);
                } else {
                    UI.toggleModal('commitment-modal', false);
                    UI.toggleModal('detail-modal', false);
                    UI.toggleModal('import-modal', false);
                    UI.toggleModal('conflicts-modal', false);
                }
            });
        });

        const searchInput = document.getElementById('search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                UI.updateSearch(e.target.value);
            });

            searchInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    UI.navigateSearch(e.shiftKey ? -1 : 1);
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    UI.clearSearch();
                }
            });
        }

        document.getElementById('btn-search-prev')?.addEventListener('click', () => {
            UI.navigateSearch(-1);
        });

        document.getElementById('btn-search-next')?.addEventListener('click', () => {
            UI.navigateSearch(1);
        });

        document.getElementById('btn-search-clear')?.addEventListener('click', () => {
            UI.clearSearch();
        });

        document.getElementById('commitment-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleFormSubmit();
        });

        document.getElementById('btn-export-backup')?.addEventListener('click', () => {
            Storage.exportBackup();
            UI.showToast('Copia de seguridad exportada correctamente.', 'success');
        });

        document.getElementById('btn-mobile-export')?.addEventListener('click', () => {
            Storage.exportBackup();
            UI.showToast('Copia de seguridad exportada correctamente.', 'success');
        });

        document.getElementById('btn-import-backup')?.addEventListener('click', () => {
            document.getElementById('import-file-input')?.click();
        });

        document.getElementById('btn-mobile-import')?.addEventListener('click', () => {
            document.getElementById('import-file-input')?.click();
        });

        document.getElementById('mobile-theme-toggle')?.addEventListener('click', () => {
            document.getElementById('theme-toggle')?.click();
        });

        document.getElementById('import-file-input')?.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (event) => {
                const parseResult = Storage.parseBackupData(event.target.result);
                if (!parseResult.success) {
                    UI.showToast(`Error al leer archivo: ${parseResult.error}`, 'error');
                    e.target.value = '';
                    return;
                }

                App.pendingImportItems = parseResult.validItems;

                const countBadge = document.getElementById('import-count-badge');
                if (countBadge) {
                    countBadge.textContent = parseResult.validItems.length;
                }

                UI.toggleModal('import-modal', true);
                e.target.value = '';
            };
            reader.readAsText(file);
        });

        document.getElementById('btn-import-merge')?.addEventListener('click', async () => {
            if (!App.pendingImportItems) return;
            UI.toggleModal('import-modal', false);
            
            const result = await Storage.importBackup(App.pendingImportItems, 'merge');
            App.pendingImportItems = null;

            if (result.success) {
                this.renderCurrent();
                
                let detailsStr = '';
                if (result.added > 0 && result.updated > 0) {
                    detailsStr = `(${result.added} nuevo(s), ${result.updated} actualizado(s))`;
                } else if (result.added > 0) {
                    detailsStr = `(${result.added} nuevo(s))`;
                } else if (result.updated > 0) {
                    detailsStr = `(${result.updated} actualizado(s))`;
                }

                if (result.conflicts && result.conflicts.length > 0) {
                    UI.showToast(
                        `Se procesaron ${result.count} registro(s) ${detailsStr}. Se detectaron ${result.conflicts.length} conflicto(s) de horario.`, 
                        'error',
                        'Conflicto de Horario Detectado'
                    );
                    UI.showConflictsModal(result.conflicts);
                } else {
                    UI.showToast(`Se procesaron ${result.count} registro(s) ${detailsStr} correctamente sin conflictos.`, 'success');
                }
            } else {
                UI.showToast(`Error al importar: ${result.error}`, 'error');
            }
        });

        document.getElementById('btn-import-replace')?.addEventListener('click', async () => {
            if (!App.pendingImportItems) return;
            UI.toggleModal('import-modal', false);

            const result = await Storage.importBackup(App.pendingImportItems, 'replace');
            App.pendingImportItems = null;

            if (result.success) {
                this.renderCurrent();
                if (result.conflicts && result.conflicts.length > 0) {
                    UI.showToast(
                        `Se reemplazaron los datos. ${result.count} registro(s) restaurado(s). Se detectaron ${result.conflicts.length} conflicto(s) de horario.`, 
                        'error',
                        'Conflicto de Horario Detectado'
                    );
                    UI.showConflictsModal(result.conflicts);
                } else {
                    UI.showToast(`Se reemplazaron los datos. ${result.count} registro(s) restaurado(s) con éxito sin conflictos.`, 'success');
                }
            } else {
                UI.showToast(`Error al importar: ${result.error}`, 'error');
            }
        });

        const applyTheme = (theme) => {
            document.documentElement.setAttribute('data-bs-theme', theme);
            document.documentElement.setAttribute('data-theme', theme);
            localStorage.setItem('AGENDA_THEME', theme);

            const sunIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
            const moonIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;

            const themeBtn = document.getElementById('theme-toggle');
            if (themeBtn) {
                themeBtn.innerHTML = theme === 'light' ? moonIcon : sunIcon;
                themeBtn.setAttribute('title', theme === 'light' ? 'Cambiar a modo oscuro' : 'Cambiar a modo claro');
            }
            const mobileThemeBtn = document.getElementById('mobile-theme-toggle');
            if (mobileThemeBtn) {
                mobileThemeBtn.innerHTML = (theme === 'light' ? moonIcon : sunIcon) + `<span>${theme === 'light' ? 'Modo Oscuro' : 'Modo Claro'}</span>`;
            }
        };

        document.getElementById('theme-toggle')?.addEventListener('click', () => {
            const currentTheme = document.documentElement.getAttribute('data-bs-theme') || 'dark';
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            applyTheme(newTheme);
        });

        const savedTheme = localStorage.getItem('AGENDA_THEME') || 'dark';
        applyTheme(savedTheme);

        // --- EVENTOS DE AUTENTICACIÓN Y BLOQUEO --- //
        const authForm = document.getElementById('auth-form');
        if (authForm) {
            authForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                const passInput = document.getElementById('auth-password');
                const rememberCheck = document.getElementById('auth-remember');
                const errorBox = document.getElementById('auth-error');
                const errorText = document.getElementById('auth-error-text');
                const authCard = document.querySelector('.auth-card');
                const submitBtn = document.getElementById('btn-auth-submit');

                if (!passInput) return;
                const password = passInput.value;
                const remember = rememberCheck ? rememberCheck.checked : false;

                if (submitBtn) submitBtn.disabled = true;

                const result = await Security.verifyPassword(password, remember);

                if (submitBtn) submitBtn.disabled = false;

                if (result.success) {
                    if (errorBox) errorBox.classList.add('d-none');
                    passInput.value = '';
                    const overlay = document.getElementById('auth-overlay');
                    if (overlay) overlay.classList.add('hidden');
                    
                    this.renderCurrent();
                    UI.showToast('Acceso concedido a la Agenda Única.', 'success');
                } else {
                    if (errorBox && errorText) {
                        errorText.textContent = result.error || 'Contraseña incorrecta.';
                        errorBox.classList.remove('d-none');
                    }
                    if (authCard) {
                        authCard.classList.remove('shake-horizontal');
                        void authCard.offsetWidth; // Force reflow
                        authCard.classList.add('shake-horizontal');
                    }
                    passInput.select();
                }
            });
        }

        document.getElementById('btn-toggle-password')?.addEventListener('click', () => {
            const passInput = document.getElementById('auth-password');
            const eyeShow = document.getElementById('icon-eye-show');
            const eyeHide = document.getElementById('icon-eye-hide');

            if (passInput) {
                const isPassword = passInput.type === 'password';
                passInput.type = isPassword ? 'text' : 'password';
                if (eyeShow && eyeHide) {
                    eyeShow.classList.toggle('d-none', !isPassword);
                    eyeHide.classList.toggle('d-none', isPassword);
                }
            }
        });

        const handleLockApp = () => {
            Security.logout();
            this.checkAuthStatus();
            UI.showToast('Agenda bloqueada correctamente.', 'info');
        };

        document.getElementById('btn-lock-app')?.addEventListener('click', handleLockApp);
        document.getElementById('btn-mobile-lock')?.addEventListener('click', handleLockApp);
    },

    async handleFormSubmit() {
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
                `Conflicto de horario: se solapa con "${Security.escapeHTML(conflict.title)}" (${conflict.startTime} - ${conflict.endTime} hs).`, 
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
            await Storage.update(UI.editingId, updatePayload);
            UI.showToast('Compromiso actualizado con éxito.', 'success');
        } else {
            await Storage.add(sanitized);
            UI.showToast('Compromiso guardado exitosamente en Supabase.', 'success');
        }

        UI.toggleModal('commitment-modal', false);
        UI.currentDate = sanitized.date;
        UI.updateDateDisplay();
        this.renderCurrent();
    }
};
