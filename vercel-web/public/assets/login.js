/* Shenanigans Web — Auth (login.js) */
(function () {
    'use strict';

    var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    var THEME_STORAGE_KEY = 'shenanigans.theme';
    var THEME_ICONS = {
        dark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21 12.79A9 9 0 0 1 11.21 3c0-.34.02-.67.06-1A1 1 0 0 0 10 1a10 10 0 1 0 13 13 1 1 0 0 0-2-.21z"/></svg>',
        light: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6.76 4.84 5.34 3.42 3.92 4.84l1.42 1.42 1.42-1.42zM1 13h3v-2H1v2zm10 10h2v-3h-2v3zm7.66-18.16-1.42-1.42-1.42 1.42 1.42 1.42 1.42-1.42zM17.24 19.16l1.42 1.42 1.42-1.42-1.42-1.42-1.42 1.42zM20 13h3v-2h-3v2zM11 4h2V1h-2v3zm1 3a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm-7.66 10.16-1.42 1.42 1.42 1.42 1.42-1.42-1.42-1.42z"/></svg>'
    };

    function readStoredTheme() {
        try {
            var stored = localStorage.getItem(THEME_STORAGE_KEY);
            return stored === 'dark' || stored === 'light' ? stored : '';
        } catch (_err) {
            return '';
        }
    }

    function getSystemTheme() {
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
            return 'dark';
        }
        return 'light';
    }

    function getThemeMode() {
        var active = document.documentElement.getAttribute('data-theme');
        if (active === 'dark' || active === 'light') return active;
        return readStoredTheme() || getSystemTheme();
    }

    function syncThemeButton() {
        var btn = document.getElementById('authThemeBtn');
        var isDark = getThemeMode() === 'dark';
        if (!btn) return;
        btn.innerHTML = '<span class="theme-toggle-icon">' + (isDark ? THEME_ICONS.light : THEME_ICONS.dark) + '</span>'
            + '<span class="theme-toggle-label">' + (isDark ? 'Light Mode' : 'Dark Mode') + '</span>';
        btn.setAttribute('aria-pressed', isDark ? 'true' : 'false');
        btn.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
    }

    function applyTheme(mode, persist) {
        var nextMode = mode === 'dark' || mode === 'light' ? mode : getSystemTheme();
        document.documentElement.setAttribute('data-theme', nextMode);
        document.body.classList.toggle('dark-mode', nextMode === 'dark');
        if (persist !== false) {
            try {
                localStorage.setItem(THEME_STORAGE_KEY, nextMode);
            } catch (_err) {
                /* ignore storage failures */
            }
        }
        syncThemeButton();
    }

    applyTheme(getThemeMode(), false);

    // Check if already authenticated
    checkSession();

    // Toggle form navigation
    var showRegisterLink = document.getElementById('showRegisterLink');
    var showLoginLink = document.getElementById('showLoginLink');
    var forgotPasswordLink = document.getElementById('forgotPasswordLink');
    var backToLoginLink = document.getElementById('backToLoginLink');

    if (showRegisterLink) showRegisterLink.addEventListener('click', function (e) { e.preventDefault(); showForm('register'); });
    if (showLoginLink) showLoginLink.addEventListener('click', function (e) { e.preventDefault(); showForm('login'); });
    if (forgotPasswordLink) forgotPasswordLink.addEventListener('click', function (e) { e.preventDefault(); showForm('forgot'); });
    if (backToLoginLink) backToLoginLink.addEventListener('click', function (e) { e.preventDefault(); showForm('login'); });
    syncThemeButton();

    window.toggleAuthTheme = function () {
        applyTheme(getThemeMode() === 'dark' ? 'light' : 'dark');
    };

    window.addEventListener('storage', function (event) {
        if (event.key === THEME_STORAGE_KEY) {
            applyTheme(getThemeMode(), false);
        }
    });

    if (window.matchMedia) {
        var media = window.matchMedia('(prefers-color-scheme: dark)');
        var onThemeMediaChange = function () {
            if (!readStoredTheme()) {
                applyTheme(getSystemTheme(), false);
            }
        };
        if (typeof media.addEventListener === 'function') {
            media.addEventListener('change', onThemeMediaChange);
        } else if (typeof media.addListener === 'function') {
            media.addListener(onThemeMediaChange);
        }
    }

    // Enter key support
    document.getElementById('loginEmail').addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); });
    document.getElementById('loginPassword').addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); });
    document.getElementById('regName').addEventListener('keydown', function (e) { if (e.key === 'Enter') doRegister(); });
    document.getElementById('regEmail').addEventListener('keydown', function (e) { if (e.key === 'Enter') doRegister(); });
    document.getElementById('regPassword').addEventListener('keydown', function (e) { if (e.key === 'Enter') doRegister(); });
    var regRole = document.getElementById('regRole');
    var regDepartment = document.getElementById('regDepartment');
    var forgotEmail = document.getElementById('forgotEmail');
    if (regRole) regRole.addEventListener('keydown', function (e) { if (e.key === 'Enter') doRegister(); });
    if (regDepartment) regDepartment.addEventListener('keydown', function (e) { if (e.key === 'Enter') doRegister(); });
    if (forgotEmail) forgotEmail.addEventListener('keydown', function (e) { if (e.key === 'Enter') doForgotPassword(); });
    if (regRole) regRole.addEventListener('change', syncDepartmentRequirement);
    syncDepartmentRequirement();

    function focusFormField(name) {
        var targetId = {
            login: 'loginEmail',
            register: 'regName',
            forgot: 'forgotEmail'
        }[name];
        var target = targetId ? document.getElementById(targetId) : null;
        if (target) target.focus();
    }

    function showForm(name) {
        document.getElementById('loginForm').classList.toggle('hidden', name !== 'login');
        document.getElementById('registerForm').classList.toggle('hidden', name !== 'register');
        document.getElementById('forgotForm').classList.toggle('hidden', name !== 'forgot');
        clearAllNotices();
        focusFormField(name);
    }

    function clearAllNotices() {
        ['loginNotice', 'registerNotice', 'forgotNotice'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) { el.textContent = ''; el.className = 'auth-notice'; }
        });
    }

    function showNotice(id, message, type) {
        var el = document.getElementById(id);
        if (!el) return;
        el.textContent = message;
        el.className = 'auth-notice visible ' + type;
    }

    function setSpinner(id, visible) {
        var el = document.getElementById(id);
        if (el) el.classList.toggle('visible', visible);
    }

    function setButtonDisabled(id, disabled) {
        var btn = document.getElementById(id);
        if (btn) btn.disabled = disabled;
    }

    function syncDepartmentRequirement() {
        var roleEl = document.getElementById('regRole');
        var deptEl = document.getElementById('regDepartment');
        if (!roleEl || !deptEl) return;
        var needsDepartment = !!roleEl.value;
        deptEl.disabled = !needsDepartment;
        if (!needsDepartment) deptEl.value = '';
    }

    // ---- Session probe ----
    function checkSession() {
        fetch('/api/auth/session', { credentials: 'same-origin' })
            .then(function (r) { return r.json(); })
            .then(function (body) {
                if (body.ok && body.data && body.data.authenticated) {
                    window.location.href = body.data.redirect || '/app';
                }
            })
            .catch(function () { /* not authenticated, stay on login */ });
    }

    // ---- Login ----
    window.doLogin = function () {
        clearAllNotices();
        var email = document.getElementById('loginEmail').value.trim();
        var password = document.getElementById('loginPassword').value;
        var loginBtn = document.getElementById('loginBtn');
        if (loginBtn && loginBtn.disabled) return;

        if (!email) { showNotice('loginNotice', 'Please enter your email address.', 'error'); return; }
        if (!EMAIL_RE.test(email)) { showNotice('loginNotice', 'Please enter a valid email address.', 'error'); return; }
        if (!password) { showNotice('loginNotice', 'Please enter your password.', 'error'); return; }
        if (password.length < 8 || password.length > 128) { showNotice('loginNotice', 'Password must be between 8 and 128 characters.', 'error'); return; }

        setSpinner('loginSpinner', true);
        setButtonDisabled('loginBtn', true);

        fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ email: email, password: password })
        })
            .then(function (r) { return r.json(); })
            .then(function (body) {
                setSpinner('loginSpinner', false);
                setButtonDisabled('loginBtn', false);

                if (body.ok) {
                    showNotice('loginNotice', 'Login successful! Redirecting...', 'success');
                    setTimeout(function () { window.location.href = body.data.redirect || '/app'; }, 400);
                } else {
                    showNotice('loginNotice', body.error || 'Login failed.', 'error');
                }
            })
            .catch(function (err) {
                setSpinner('loginSpinner', false);
                setButtonDisabled('loginBtn', false);
                showNotice('loginNotice', 'Network error. Please try again.', 'error');
            });
    };

    // ---- Register ----
    window.doRegister = function () {
        clearAllNotices();
        var name = document.getElementById('regName').value.trim();
        var email = document.getElementById('regEmail').value.trim();
        var password = document.getElementById('regPassword').value;
        var role = document.getElementById('regRole').value;
        var department = document.getElementById('regDepartment').value;
        var registerBtn = document.getElementById('registerBtn');
        if (registerBtn && registerBtn.disabled) return;

        if (!name) { showNotice('registerNotice', 'Please enter your full name.', 'error'); return; }
        if (name.length < 2 || name.length > 100) { showNotice('registerNotice', 'Name must be between 2 and 100 characters.', 'error'); return; }
        if (!email) { showNotice('registerNotice', 'Please enter your email address.', 'error'); return; }
        if (!EMAIL_RE.test(email)) { showNotice('registerNotice', 'Please enter a valid email address.', 'error'); return; }
        if (!password || password.length < 8 || password.length > 128) { showNotice('registerNotice', 'Password must be between 8 and 128 characters.', 'error'); return; }
        if (!role) { showNotice('registerNotice', 'Please select a role.', 'error'); return; }
        if (role !== 'Employee' && role !== 'Project Manager') {
            showNotice('registerNotice', 'Invalid role selected.', 'error');
            return;
        }
        if (!department) {
            showNotice('registerNotice', 'Please select a department.', 'error');
            return;
        }

        setSpinner('registerSpinner', true);
        setButtonDisabled('registerBtn', true);

        fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ displayName: name, email: email, password: password, role: role, department: department })
        })
            .then(function (r) { return r.json(); })
            .then(function (body) {
                setSpinner('registerSpinner', false);
                setButtonDisabled('registerBtn', false);

                if (body.ok) {
                    if (body.data.pendingApproval) {
                        showNotice('registerNotice', body.data.message || 'Registration submitted. Awaiting approval.', 'warn');
                    } else {
                        showNotice('registerNotice', 'Account created! Redirecting...', 'success');
                        setTimeout(function () { window.location.href = body.data.redirect || '/app'; }, 400);
                    }
                } else {
                    showNotice('registerNotice', body.error || 'Registration failed.', 'error');
                }
            })
            .catch(function () {
                setSpinner('registerSpinner', false);
                setButtonDisabled('registerBtn', false);
                showNotice('registerNotice', 'Network error. Please try again.', 'error');
            });
    };

    // ---- Forgot Password ----
    window.doForgotPassword = function () {
        clearAllNotices();
        var email = document.getElementById('forgotEmail').value.trim();
        var forgotBtn = document.getElementById('forgotBtn');
        if (forgotBtn && forgotBtn.disabled) return;
        if (!email) { showNotice('forgotNotice', 'Please enter your email address.', 'error'); return; }
        if (!EMAIL_RE.test(email)) { showNotice('forgotNotice', 'Please enter a valid email address.', 'error'); return; }

        setSpinner('forgotSpinner', true);
        setButtonDisabled('forgotBtn', true);

        fetch('/api/auth/forgot-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ email: email })
        })
            .then(function (r) { return r.json(); })
            .then(function (body) {
                setSpinner('forgotSpinner', false);
                setButtonDisabled('forgotBtn', false);
                if (body.ok) {
                    showNotice('forgotNotice', 'If an account exists, a reset link was sent to your email.', 'success');
                } else {
                    showNotice('forgotNotice', body.error || 'Failed to send reset email.', 'error');
                }
            })
            .catch(function () {
                setSpinner('forgotSpinner', false);
                setButtonDisabled('forgotBtn', false);
                showNotice('forgotNotice', 'Network error. Please try again.', 'error');
            });
    };

    // ---- Password toggle (obscureText / !obscureText pattern) ----
    window.togglePasswordVisibility = function (inputId, btn) {
        var input = document.getElementById(inputId);
        if (!input) return;

        var obscureText = input.dataset.obscureText !== 'false';
        obscureText = !obscureText;
        input.dataset.obscureText = obscureText ? 'true' : 'false';

        input.type = obscureText ? 'password' : 'text';
        if (btn) btn.textContent = obscureText ? 'Show' : 'Hide';
    };
})();
