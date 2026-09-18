// --- SEGURIDAD Y VALIDACIÓN --- //

const Security = {
    escapeHTML(str) {
        if (typeof str !== 'string') return '';
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    },

    isValidDate(dateStr) {
        if (!dateStr || typeof dateStr !== 'string') return false;
        const regex = /^\d{4}-\d{2}-\d{2}$/;
        if (!regex.test(dateStr)) return false;
        const date = new Date(dateStr + 'T00:00:00');
        return !isNaN(date.getTime());
    },

    isValidTimeSlot(timeStr) {
        if (!timeStr || typeof timeStr !== 'string') return false;
        const regex = /^([01]\d|2[0-3]):([0-5]\d)$/;
        if (!regex.test(timeStr)) return false;

        const [hours, minutes] = timeStr.split(':').map(Number);
        const totalMinutes = hours * 60 + minutes;
        
        const minMinutes = 7 * 60;
        const maxMinutes = 13 * 60;

        return totalMinutes >= minMinutes && totalMinutes <= maxMinutes;
    },

    isValidTimeRange(startTime, endTime) {
        if (!this.isValidTimeSlot(startTime) || !this.isValidTimeSlot(endTime)) return false;
        const [startH, startM] = startTime.split(':').map(Number);
        const [endH, endM] = endTime.split(':').map(Number);
        
        const startTotal = startH * 60 + startM;
        const endTotal = endH * 60 + endM;

        return startTotal < endTotal;
    },

    sanitizeCommitmentInput(input) {
        return {
            title: this.escapeHTML((input.title || '').trim()),
            date: (input.date || '').trim(),
            startTime: (input.startTime || '').trim(),
            endTime: (input.endTime || '').trim(),
            priority: ['Baja', 'Media', 'Alta', 'Urgente'].includes(input.priority) ? input.priority : 'Media',
            notes: this.escapeHTML((input.notes || '').trim())
        };
    },

    // --- AUTENTICACIÓN Y SESIÓN DE USUARIO --- //
    isAuthenticated() {
        return sessionStorage.getItem('AGENDA_AUTHENTICATED') === 'true' || localStorage.getItem('AGENDA_AUTHENTICATED') === 'true';
    },

    async verifyPassword(password, rememberMe = false) {
        if (!password || typeof password !== 'string') {
            return { success: false, error: 'Por favor ingrese una contraseña.' };
        }

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password })
            });

            if (response.ok) {
                this.setAuthSession(rememberMe);
                return { success: true };
            } else {
                const data = await response.json().catch(() => ({}));
                return { success: false, error: data.message || 'Contraseña incorrecta.' };
            }
        } catch (err) {
            // Respaldar verificación local en modo offline / sin servidor Node activo
            const defaultPass = 'juzgado2026';
            if (password === defaultPass) {
                this.setAuthSession(rememberMe);
                return { success: true };
            }
            return { success: false, error: 'Contraseña incorrecta.' };
        }
    },

    setAuthSession(rememberMe) {
        sessionStorage.setItem('AGENDA_AUTHENTICATED', 'true');
        if (rememberMe) {
            localStorage.setItem('AGENDA_AUTHENTICATED', 'true');
        } else {
            localStorage.removeItem('AGENDA_AUTHENTICATED');
        }
    },

    logout() {
        sessionStorage.removeItem('AGENDA_AUTHENTICATED');
        localStorage.removeItem('AGENDA_AUTHENTICATED');
    }
};

if (typeof module !== 'undefined' && module.exports) {
    module.exports = Security;
}
