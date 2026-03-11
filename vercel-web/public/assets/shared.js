/* Shenanigans Web — Shared Layout & Utilities (shared.js) */
var ShenanigansApp = (function () {
    'use strict';

    var app = {};
    app.currentUser = null;
    app.cachedData = {};

    /* ============================================================
       UTILITIES
       ============================================================ */
    app.esc = function (str) {
        if (!str) return '';
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(String(str)));
        return div.innerHTML;
    };

    app.formatTimestamp = function (ts) {
        if (!ts || ts <= 0) return '';
        var d = ts > 1e12 ? new Date(ts) : new Date(ts * 1000);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    };

    app.formatMoney = function (n) {
        return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    app.formatStatus = function (s) {
        if (!s) return '';
        return s.replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
    };

    app.formatRole = function (role) {
        if (!role) return 'User';
        return role.replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
    };

    app.initials = function (name) {
        var parts = (name || '?').split(/\s+/);
        if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        return (parts[0][0] || '?').toUpperCase();
    };

    app.buildName = function (e) {
        if (e.fullName) return e.fullName;
        var first = e.firstName || '';
        var last = e.lastName || '';
        return (first + ' ' + last).trim() || 'Unknown';
    };

    app.isMD = function () {
        return app.currentUser && app.currentUser.role &&
            app.currentUser.role.toUpperCase().replace(/\s+/g, '_') === 'MANAGING_DIRECTOR';
    };

    app.toDateInput = function (ts) {
        if (!ts) return '';
        var d = ts > 1e12 ? new Date(ts) : new Date(ts * 1000);
        if (isNaN(d.getTime())) return '';
        return d.toISOString().split('T')[0];
    };

    app.dateInputToMs = function (id) {
        var val = document.getElementById(id).value;
        if (!val) return 0;
        return new Date(val).getTime();
    };

    /* ============================================================
       FETCH HELPERS
       ============================================================ */
    app.fetchJson = function (url, onSuccess, onError) {
        fetch(url, { credentials: 'same-origin' })
            .then(function (r) { return r.json(); })
            .then(function (body) {
                if (body.ok && body.data !== undefined) {
                    onSuccess(body.data);
                } else {
                    if (body.error && body.error.toLowerCase().includes('auth')) {
                        window.location.href = '/';
                        return;
                    }
                    if (onError) onError(body.error || 'Request failed');
                }
            })
            .catch(function () {
                if (onError) onError('Network error');
            });
    };

    app.fetchMutate = function (method, url, payload, onSuccess, onError) {
        var opts = {
            method: method,
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' }
        };
        if (payload && method !== 'DELETE') {
            opts.body = JSON.stringify(payload);
        }
        fetch(url, opts)
            .then(function (r) { return r.json(); })
            .then(function (body) {
                if (body.ok) {
                    onSuccess(body.data);
                } else {
                    if (body.error && body.error.toLowerCase().includes('auth')) {
                        window.location.href = '/';
                        return;
                    }
                    if (onError) onError(body.error || 'Request failed');
                }
            })
            .catch(function () {
                if (onError) onError('Network error');
            });
    };

    /* ============================================================
       TOAST
       ============================================================ */
    app.showToast = function (message, type) {
        var toast = document.getElementById('toast');
        if (!toast) return;
        toast.textContent = message;
        toast.className = 'toast visible ' + (type || 'success');
        setTimeout(function () { toast.className = 'toast'; }, 3000);
    };
    window.showToast = app.showToast;

    /* ============================================================
       MODAL HELPERS
       ============================================================ */
    app.closeModal = function (id) {
        var overlay = document.getElementById(id);
        if (overlay) overlay.classList.add('hidden');
    };
    window.closeModal = app.closeModal;

    app.showModalNotice = function (id, msg, type) {
        var el = document.getElementById(id);
        if (!el) return;
        el.textContent = msg;
        el.className = 'modal-notice visible ' + (type || 'error');
    };

    app.clearModalNotice = function (id) {
        var el = document.getElementById(id);
        if (el) { el.textContent = ''; el.className = 'modal-notice'; }
    };

    app.showConfirm = function (message, onConfirm) {
        document.getElementById('confirmMessage').textContent = message;
        var btn = document.getElementById('confirmDeleteBtn');
        var newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        newBtn.addEventListener('click', function () {
            app.closeModal('confirmModal');
            onConfirm();
        });
        document.getElementById('confirmModal').classList.remove('hidden');
    };

    app.showNotice = function (id, message, type) {
        var el = document.getElementById(id);
        if (!el) return;
        el.textContent = message;
        el.className = 'notice visible ' + (type || 'error');
    };

    /* ============================================================
       SYSTEM HEALTH
       ============================================================ */
    function checkSystemHealth() {
        fetch('/api/health')
            .then(function (r) { return r.json(); })
            .then(function (body) {
                var dot = document.getElementById('systemStatusDot');
                var text = document.getElementById('systemStatusText');
                if (!dot || !text) return;
                if (body.ok && body.data && body.data.status === 'UP') {
                    dot.style.background = '#10b981';
                    text.textContent = 'All Systems Operational';
                    text.style.color = '#10b981';
                } else {
                    dot.style.background = '#f59e0b';
                    text.textContent = 'Degraded';
                    text.style.color = '#f59e0b';
                }
            })
            .catch(function () {
                var dot = document.getElementById('systemStatusDot');
                var text = document.getElementById('systemStatusText');
                if (!dot || !text) return;
                dot.style.background = '#ef4444';
                text.textContent = 'Unreachable';
                text.style.color = '#ef4444';
            });
    }

    /* ============================================================
       SIDEBAR TOGGLE
       ============================================================ */
    function restoreSidebar() {
        var collapsed = localStorage.getItem('sidebarCollapsed') === 'true';
        if (collapsed) {
            document.getElementById('appShell').classList.add('sidebar-collapsed');
            var btn = document.getElementById('sidebarToggle');
            if (btn) btn.innerHTML = '\u203A';
        }
    }

    window.toggleSidebar = function () {
        var shell = document.getElementById('appShell');
        shell.classList.toggle('sidebar-collapsed');
        var collapsed = shell.classList.contains('sidebar-collapsed');
        var btn = document.getElementById('sidebarToggle');
        if (btn) btn.innerHTML = collapsed ? '\u203A' : '\u2039';
        localStorage.setItem('sidebarCollapsed', collapsed);
    };

    window.resetSidebarState = function () {
        localStorage.removeItem('sidebarCollapsed');
        document.getElementById('appShell').classList.remove('sidebar-collapsed');
        var btn = document.getElementById('sidebarToggle');
        if (btn) btn.innerHTML = '\u2039';
        app.showToast('Sidebar layout reset', 'success');
    };

    /* ============================================================
       LOGOUT
       ============================================================ */
    window.doLogout = function () {
        fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' })
            .finally(function () { window.location.href = '/'; });
    };

    /* ============================================================
       LAYOUT BUILDERS
       ============================================================ */
    var SVG_ICONS = {
        dashboard: '<path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>',
        employees: '<path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3z M8 11c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3z M2 17c0-2.33 4.67-3.5 7-3.5s7 1.17 7 3.5V20H2v-3z"/>',
        projects: '<path d="M19 3h-4.18C14.4 1.84 13.3 1 12 1s-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1z"/>',
        finance: '<path d="M12 1C6.48 1 2 5.48 2 11s4.48 10 10 10 10-4.48 10-10S17.52 1 12 1zm1 17.93V19h-2v-.07C8.06 18.44 6 16.28 6 13h2c0 2 2 4 5 4s5-2 5-4-2-3-5-3c-2.21 0-4 .9-4 2H8c0-2.76 3.13-5 7-5 3.87 0 7 2.24 7 5s-3.13 5-7 5c-1.66 0-3.17-.51-4.41-1.37z"/>',
        settings: '<path d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.11-.2-.36-.28-.57-.22l-2.39.96a7.007 7.007 0 0 0-1.6-.94l-.36-2.54A.486.486 0 0 0 14 1h-4c-.24 0-.44.17-.48.41l-.36 2.54c-.56.23-1.08.54-1.6.94l-2.39-.96c-.21-.08-.46.02-.57.22L2.71 8.88c-.11.2-.06.47.12.61L4.86 11.1c-.04.31-.06.63-.06.94s.02.63.06.94L2.83 15.56c-.18.14-.23.41-.12.61l1.92 3.32c.11.2.36.28.57.22l2.39-.96c.5.4 1.04.72 1.6.94l.36 2.54c.04.24.24.41.48.41h4c.24 0 .44-.17.48-.41l.36-2.54c.56-.23 1.08-.54 1.6-.94l2.39.96c.21.08.46-.02.57-.22l1.92-3.32c.11-.2.06-.47-.12-.61l-2.03-1.58z"/>',
        tasks: '<path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-2 10H7v-2h10v2z"/>',
        timesheet: '<path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/>',
        requests: '<path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11z"/>',
        documents: '<path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>',
        team: '<path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5z"/>',
        profile: '<path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>'
    };

    function svgIcon(name) {
        return '<span class="menu-btn-icon"><svg viewBox="0 0 24 24">' + SVG_ICONS[name] + '</svg></span>';
    }

    function buildHeaderHTML(config) {
        var html = '<div class="header-brand">'
            + '<div class="logo-circle">S</div>'
            + '<div class="header-brand-text">'
            + '<h1>Shenanigans</h1>'
            + '<p id="headerSubtitle">' + (config.subtitle || 'Management Portal') + '</p>'
            + '</div></div>'
            + '<div class="header-spacer"></div>';

        if (config.showSearch) {
            html += '<div class="header-search" id="headerSearch">'
                + '<span class="header-search-icon"><svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg></span>'
                + '<input type="text" id="headerSearchInput" placeholder="' + (config.searchPlaceholder || 'Search...') + '">'
                + '</div>';
        }

        if (config.showAddBtn) {
            html += '<button class="header-primary-btn" id="headerAddBtn">' + (config.addBtnText || '+ Add') + '</button>';
        }

        html += '<div class="header-user">'
            + '<div class="header-user-info">'
            + '<div class="welcome-text" id="headerWelcome">Welcome</div>'
            + '<div class="email-text" id="headerEmail"></div>'
            + '</div>'
            + '<div class="header-avatar-wrap">'
            + '<div class="header-avatar" id="headerAvatar">?</div>'
            + '<div class="role-badge-small" id="headerRole">User</div>'
            + '</div>'
            + '<button class="btn-logout" onclick="doLogout()">Logout</button>'
            + '</div>';

        return html;
    }

    function menuBtn(url, page, iconName, label, activePage) {
        var isActive = page === activePage;
        return '<a href="' + url + '" class="menu-btn' + (isActive ? ' active' : '') + '" data-page="' + page + '">'
            + svgIcon(iconName)
            + '<span class="menu-btn-text">' + label + '</span></a>';
    }

    function buildAdminSidebarHTML(activePage) {
        var html = '<button class="sidebar-toggle" id="sidebarToggle" onclick="toggleSidebar()">&lsaquo;</button>'
            + '<div class="menu-header">MAIN MENU</div>'
            + '<div class="menu-section">'
            + menuBtn('/app', 'dashboard', 'dashboard', 'Dashboard', activePage)
            + menuBtn('/app/employees', 'employees', 'employees', 'Employees', activePage)
            + menuBtn('/app/projects', 'projects', 'projects', 'Projects', activePage)
            + menuBtn('/app/finance', 'finance', 'finance', 'Finance', activePage)
            + '</div>'
            + '<div class="menu-section">'
            + '<a href="/app/settings" class="menu-btn secondary' + (activePage === 'settings' ? ' active' : '') + '" data-page="settings">'
            + svgIcon('settings')
            + '<span class="menu-btn-text">Settings</span></a>'
            + '</div>'
            + '<div class="menu-section hidden" id="workspaceLink">'
            + '<div class="menu-header">MY WORKSPACE</div>'
            + '<a href="/workspace" class="menu-btn">' + svgIcon('tasks')
            + '<span class="menu-btn-text">My Workspace &rarr;</span></a>'
            + '</div>'
            + '<div class="sidebar-spacer"></div>'
            + buildSystemInfoCard();

        return html;
    }

    function buildEmployeeSidebarHTML(activePage) {
        var html = '<button class="sidebar-toggle" id="sidebarToggle" onclick="toggleSidebar()">&lsaquo;</button>'
            + '<div class="menu-header">MY WORKSPACE</div>'
            + '<div class="menu-section">'
            + menuBtn('/workspace', 'empTasks', 'tasks', 'My Tasks', activePage)
            + menuBtn('/workspace/projects', 'empProjects', 'projects', 'My Projects', activePage)
            + menuBtn('/workspace/timesheet', 'empTimesheet', 'timesheet', 'Time Sheet', activePage)
            + menuBtn('/workspace/requests', 'empRequests', 'requests', 'Leave Requests', activePage)
            + menuBtn('/workspace/documents', 'empDocuments', 'documents', 'Documents', activePage)
            + menuBtn('/workspace/team', 'empTeam', 'team', 'My Team', activePage)
            + menuBtn('/workspace/profile', 'empProfile', 'profile', 'My Profile', activePage)
            + '</div>'
            + '<div class="menu-section">'
            + '<div class="menu-header">PORTAL</div>'
            + '<a href="/app" class="menu-btn secondary">' + svgIcon('dashboard')
            + '<span class="menu-btn-text">&larr; Main Portal</span></a>'
            + '</div>'
            + '<div class="sidebar-spacer"></div>'
            + buildSystemInfoCard();

        return html;
    }

    function buildSystemInfoCard() {
        return '<div class="system-info-card">'
            + '<div class="title">System Status</div>'
            + '<div class="status-row"><div class="status-dot" id="systemStatusDot"></div>'
            + '<span class="status-text" id="systemStatusText">Checking...</span></div>'
            + '</div>';
    }

    function buildConfirmModalHTML() {
        return '<div class="modal-overlay hidden" id="confirmModal">'
            + '<div class="modal-card modal-card-sm">'
            + '<div class="modal-header"><h3>Confirm Delete</h3>'
            + '<button class="modal-close" onclick="closeModal(\'confirmModal\')">&times;</button></div>'
            + '<div class="modal-body"><p id="confirmMessage">Are you sure?</p></div>'
            + '<div class="modal-footer">'
            + '<button class="btn-modal-cancel" onclick="closeModal(\'confirmModal\')">Cancel</button>'
            + '<button class="btn-modal-delete" id="confirmDeleteBtn">Delete</button>'
            + '</div></div></div>';
    }

    /* ============================================================
       AUTH CHECK
       ============================================================ */
    function checkAuth(callback) {
        fetch('/api/auth/session', { credentials: 'same-origin' })
            .then(function (r) { return r.json(); })
            .then(function (body) {
                if (!body.ok || !body.data || !body.data.authenticated) {
                    window.location.href = '/';
                    return;
                }
                app.currentUser = body.data.user;
                callback();
            })
            .catch(function () { window.location.href = '/'; });
    }

    function applyUserInfo(sidebarType) {
        if (!app.currentUser) return;
        var name = app.currentUser.displayName || app.currentUser.email || 'User';

        var el;
        el = document.getElementById('headerWelcome');
        if (el) el.textContent = 'Welcome, ' + name;
        el = document.getElementById('headerEmail');
        if (el) el.textContent = app.currentUser.email || '';
        el = document.getElementById('headerAvatar');
        if (el) el.textContent = app.initials(name);
        el = document.getElementById('headerRole');
        if (el) el.textContent = app.formatRole(app.currentUser.role);

        if (sidebarType === 'admin' && !app.isMD()) {
            var finBtn = document.querySelector('[data-page="finance"]');
            if (finBtn) finBtn.classList.add('hidden');
            var wsLink = document.getElementById('workspaceLink');
            if (wsLink) wsLink.classList.remove('hidden');
        }
    }

    /* ============================================================
       INIT
       ============================================================ */
    app.init = function (config) {
        var header = document.getElementById('appHeader');
        var sidebar = document.getElementById('appSidebar');

        if (header) header.innerHTML = buildHeaderHTML(config);

        if (config.sidebar === 'employee') {
            document.getElementById('appShell').classList.add('employee-theme');
            if (sidebar) sidebar.innerHTML = buildEmployeeSidebarHTML(config.activePage);
        } else {
            if (sidebar) sidebar.innerHTML = buildAdminSidebarHTML(config.activePage);
        }

        if (!document.getElementById('confirmModal')) {
            document.body.insertAdjacentHTML('beforeend', buildConfirmModalHTML());
        }
        if (!document.getElementById('toast')) {
            document.body.insertAdjacentHTML('beforeend', '<div class="toast" id="toast"></div>');
        }

        restoreSidebar();
        checkSystemHealth();
        checkAuth(function () {
            applyUserInfo(config.sidebar);
            if (config.onReady) config.onReady();
        });
    };

    return app;
})();
