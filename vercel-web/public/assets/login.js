/* Shenanigans Web — Auth (login.js) */
(function () {
    'use strict';

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

    // Enter key support
    document.getElementById('loginPassword').addEventListener('keydown', function (e) { if (e.key === 'Enter') doLogin(); });
    var regRole = document.getElementById('regRole');
    if (regRole) regRole.addEventListener('keydown', function (e) { if (e.key === 'Enter') doRegister(); });
    if (regRole) regRole.addEventListener('change', syncDepartmentRequirement);
    syncDepartmentRequirement();

    function showForm(name) {
        document.getElementById('loginForm').classList.toggle('hidden', name !== 'login');
        document.getElementById('registerForm').classList.toggle('hidden', name !== 'register');
        document.getElementById('forgotForm').classList.toggle('hidden', name !== 'forgot');
        clearAllNotices();
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
        var needsDepartment = roleEl.value && roleEl.value !== 'Managing Director';
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

        if (!email) { showNotice('loginNotice', 'Please enter your email address.', 'error'); return; }
        if (!password) { showNotice('loginNotice', 'Please enter your password.', 'error'); return; }

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

        if (!name) { showNotice('registerNotice', 'Please enter your full name.', 'error'); return; }
        if (!email) { showNotice('registerNotice', 'Please enter your email address.', 'error'); return; }
        if (!password || password.length < 6) { showNotice('registerNotice', 'Password must be at least 6 characters.', 'error'); return; }
        if (!role) { showNotice('registerNotice', 'Please select a role.', 'error'); return; }
        if (role !== 'Managing Director' && !department) {
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
        if (!email) { showNotice('forgotNotice', 'Please enter your email address.', 'error'); return; }

        fetch('/api/auth/forgot-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email })
        })
            .then(function (r) { return r.json(); })
            .then(function (body) {
                if (body.ok) {
                    showNotice('forgotNotice', 'If an account exists, a reset link was sent to your email.', 'success');
                } else {
                    showNotice('forgotNotice', body.error || 'Failed to send reset email.', 'error');
                }
            })
            .catch(function () {
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
