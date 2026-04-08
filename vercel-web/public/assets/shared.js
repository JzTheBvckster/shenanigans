/* Shenanigans Web — Shared Layout & Utilities (shared.js) */
var ShenanigansApp = (function () {
    'use strict';

    var app = {};
    app.currentUser = null;
    app.cachedData = {};
    app.THEME_STORAGE_KEY = 'shenanigans.theme';
    var toastTimer = null;
    var THEME_ICONS = {
        dark: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M21 12.79A9 9 0 0 1 11.21 3c0-.34.02-.67.06-1A1 1 0 0 0 10 1a10 10 0 1 0 13 13 1 1 0 0 0-2-.21z"/></svg>',
        light: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M6.76 4.84 5.34 3.42 3.92 4.84l1.42 1.42 1.42-1.42zM1 13h3v-2H1v2zm10 10h2v-3h-2v3zm7.66-18.16-1.42-1.42-1.42 1.42 1.42 1.42 1.42-1.42zM17.24 19.16l1.42 1.42 1.42-1.42-1.42-1.42-1.42 1.42zM20 13h3v-2h-3v2zM11 4h2V1h-2v3zm1 3a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm-7.66 10.16-1.42 1.42 1.42 1.42 1.42-1.42-1.42-1.42z"/></svg>'
    };

    function padDatePart(value) {
        return value < 10 ? '0' + value : String(value);
    }

    function toDateObject(ts) {
        if (!ts) return null;
        var d = ts > 1e12 ? new Date(ts) : new Date(ts * 1000);
        if (isNaN(d.getTime())) return null;
        return d;
    }

    function readStoredTheme() {
        try {
            var stored = localStorage.getItem(app.THEME_STORAGE_KEY);
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

    app.getThemeMode = function () {
        var active = document.documentElement.getAttribute('data-theme');
        if (active === 'dark' || active === 'light') return active;
        return readStoredTheme() || getSystemTheme();
    };

    app.syncThemeControls = function () {
        var mode = app.getThemeMode();
        var isDark = mode === 'dark';
        function syncThemeButton(button) {
            if (!button) return;
            button.innerHTML = '<span class="theme-toggle-icon">' + (isDark ? THEME_ICONS.light : THEME_ICONS.dark) + '</span>'
                + '<span class="theme-toggle-label">' + (isDark ? 'Light Mode' : 'Dark Mode') + '</span>';
            button.setAttribute('aria-pressed', isDark ? 'true' : 'false');
            button.setAttribute('aria-label', isDark ? 'Switch to light mode' : 'Switch to dark mode');
            button.title = isDark ? 'Switch to light mode' : 'Switch to dark mode';
        }
        var headerBtn = document.getElementById('headerThemeBtn');
        syncThemeButton(headerBtn);
        syncThemeButton(document.getElementById('sidebarThemeBtn'));
        var darkCheckbox = document.getElementById('settingDarkMode');
        if (darkCheckbox) {
            darkCheckbox.checked = isDark;
        }
    };

    app.setTheme = function (mode, persist) {
        var nextMode = mode === 'dark' || mode === 'light' ? mode : getSystemTheme();
        document.documentElement.setAttribute('data-theme', nextMode);
        if (document.body) {
            document.body.classList.toggle('dark-mode', nextMode === 'dark');
        }
        if (persist !== false) {
            try {
                localStorage.setItem(app.THEME_STORAGE_KEY, nextMode);
            } catch (_err) {
                /* ignore storage failures */
            }
        }
        app.syncThemeControls();
        return nextMode;
    };

    window.toggleThemeMode = function () {
        var nextMode = app.getThemeMode() === 'dark' ? 'light' : 'dark';
        app.setTheme(nextMode);
        app.showToast('Switched to ' + (nextMode === 'dark' ? 'dark' : 'light') + ' mode', 'success');
        if (window.closeSidebarOverlay) window.closeSidebarOverlay();
    };

    app.setTheme(app.getThemeMode(), false);

    /* Predefined departments */
    app.DEPARTMENTS = ['Engineering', 'Marketing', 'Finance', 'Human Resources', 'Operations', 'Sales'];

    app.deptOptions = function (selected) {
        var html = '<option value="">Select department…</option>';
        app.DEPARTMENTS.forEach(function (d) {
            html += '<option value="' + app.esc(d) + '"' + (d === selected ? ' selected' : '') + '>' + app.esc(d) + '</option>';
        });
        return html;
    };

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
        var value = Number(n);
        if (!isFinite(value)) value = 0;
        return value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    };

    app.formatStatus = function (s) {
        if (!s) return '';
        return s.replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
    };

    app.formatRole = function (role) {
        if (!role) return 'User';
        return role.replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
    };

    app.normalizeRole = function (role) {
        return String(role || '').trim().toUpperCase().replace(/\s+/g, '_');
    };

    app.isProjectManagerRole = function (role) {
        return app.normalizeRole(role) === 'PROJECT_MANAGER';
    };

    app.initials = function (name) {
        var parts = (name || '?').split(/\s+/);
        if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        return (parts[0][0] || '?').toUpperCase();
    };

    app.buildName = function (e) {
        if (e.fullName) return e.fullName;
        if (e.displayName) return e.displayName;
        var first = e.firstName || '';
        var last = e.lastName || '';
        return (first + ' ' + last).trim() || 'Unknown';
    };

    app.isMD = function () {
        return app.currentUser && app.currentUser.role &&
            app.currentUser.role.toUpperCase().replace(/\s+/g, '_') === 'MANAGING_DIRECTOR';
    };

    app.toDateInput = function (ts) {
        var d = toDateObject(ts);
        if (!d) return '';
        return d.getFullYear() + '-' + padDatePart(d.getMonth() + 1) + '-' + padDatePart(d.getDate());
    };

    app.dateInputToMs = function (id) {
        var input = document.getElementById(id);
        var val = input ? input.value : '';
        if (!val) return 0;
        var parts = String(val).split('-');
        if (parts.length !== 3) return 0;
        var year = Number(parts[0]);
        var month = Number(parts[1]) - 1;
        var day = Number(parts[2]);
        if (!isFinite(year) || !isFinite(month) || !isFinite(day)) return 0;
        return new Date(year, month, day).getTime();
    };

    /* ============================================================
       FETCH HELPERS
       ============================================================ */
    function shouldRedirectToAuth(status, body) {
        var message = body && body.error ? String(body.error) : '';
        if (status === 401) return true;
        if (status === 403 && /auth|session|required|permission|approval/i.test(message)) {
            return true;
        }
        return false;
    }

    function readApiResponse(response) {
        var status = response ? response.status : 0;
        var contentType = response && response.headers
            ? String(response.headers.get('content-type') || '').toLowerCase()
            : '';
        if (status === 204) {
            return Promise.resolve({ status: status, body: { ok: true } });
        }
        if (contentType.indexOf('application/json') !== -1) {
            return response.json()
                .then(function (body) {
                    return { status: status, body: body || {} };
                })
                .catch(function () {
                    return {
                        status: status,
                        body: { ok: false, error: 'Invalid server response.' }
                    };
                });
        }
        return response.text()
            .then(function (text) {
                return {
                    status: status,
                    body: {
                        ok: response && response.ok,
                        error: text && text.trim() ? text.trim() : 'Unexpected server response.'
                    }
                };
            })
            .catch(function () {
                return {
                    status: status,
                    body: { ok: false, error: 'Unexpected server response.' }
                };
            });
    }

    app.fetchJson = function (url, onSuccess, onError) {
        fetch(url, { credentials: 'same-origin' })
            .then(readApiResponse)
            .then(function (result) {
                var body = result.body || {};
                if (body.ok) {
                    if (onSuccess) onSuccess(body.data);
                } else {
                    if (shouldRedirectToAuth(result.status, body)) {
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
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        };
        if (payload && method !== 'DELETE') {
            opts.body = JSON.stringify(payload);
        }
        fetch(url, opts)
            .then(readApiResponse)
            .then(function (result) {
                var body = result.body || {};
                if (body.ok) {
                    if (onSuccess) onSuccess(body.data);
                } else {
                    if (shouldRedirectToAuth(result.status, body)) {
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
        if (toastTimer) {
            clearTimeout(toastTimer);
        }
        toastTimer = setTimeout(function () {
            toast.className = 'toast';
            toastTimer = null;
        }, 3200);
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
        applyResponsiveSidebarState();
    }

    var COMPACT_SIDEBAR_BREAKPOINT = 1024;

    function isCompactSidebarLayout() {
        return window.innerWidth <= COMPACT_SIDEBAR_BREAKPOINT;
    }

    function getSidebarPreference() {
        return localStorage.getItem('sidebarCollapsed') === 'true';
    }

    function ensureSidebarBackdrop() {
        if (document.getElementById('appSidebarBackdrop')) return;
        var backdrop = document.createElement('button');
        backdrop.type = 'button';
        backdrop.id = 'appSidebarBackdrop';
        backdrop.className = 'app-sidebar-backdrop';
        backdrop.setAttribute('aria-label', 'Close navigation');
        backdrop.addEventListener('click', function () {
            closeSidebarOverlay();
        });
        document.body.appendChild(backdrop);
    }

    function updateSidebarToggleButton() {
        var btn = document.getElementById('sidebarToggle');
        var shell = document.getElementById('appShell');
        if (!btn || !shell) return;
        if (isCompactSidebarLayout()) {
            btn.innerHTML = '&times;';
            btn.setAttribute('aria-label', 'Close navigation');
            btn.title = 'Close navigation';
            return;
        }
        var collapsed = shell.classList.contains('sidebar-collapsed');
        btn.innerHTML = collapsed ? '\u203A' : '\u2039';
        btn.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
        btn.title = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
    }

    function closeSidebarOverlay() {
        var shell = document.getElementById('appShell');
        if (!shell) return;
        shell.classList.remove('sidebar-open');
        document.body.classList.remove('sidebar-overlay-active');
        updateSidebarToggleButton();
    }

    window.closeSidebarOverlay = closeSidebarOverlay;

    function applyResponsiveSidebarState() {
        var shell = document.getElementById('appShell');
        if (!shell) return;

        var compact = isCompactSidebarLayout();
        shell.classList.toggle('sidebar-compact', compact);
        shell.classList.remove('sidebar-open');
        document.body.classList.remove('sidebar-overlay-active');

        if (compact) {
            shell.classList.remove('sidebar-collapsed');
        } else {
            shell.classList.toggle('sidebar-collapsed', getSidebarPreference());
        }

        updateSidebarToggleButton();
    }

    window.toggleSidebar = function () {
        var shell = document.getElementById('appShell');
        if (!shell) return;
        if (isCompactSidebarLayout()) {
            var open = !shell.classList.contains('sidebar-open');
            shell.classList.toggle('sidebar-open', open);
            document.body.classList.toggle('sidebar-overlay-active', open);
            updateSidebarToggleButton();
            return;
        }
        shell.classList.toggle('sidebar-collapsed');
        localStorage.setItem('sidebarCollapsed', shell.classList.contains('sidebar-collapsed'));
        updateSidebarToggleButton();
    };

    window.resetSidebarState = function () {
        localStorage.removeItem('sidebarCollapsed');
        applyResponsiveSidebarState();
        app.showToast('Sidebar layout reset', 'success');
    };

    window.addEventListener('resize', function () {
        applyResponsiveSidebarState();
    });

    document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') {
            closeSidebarOverlay();
            setNotifDropdownOpen(false);
        }
    });

    document.addEventListener('click', function (event) {
        if (!isCompactSidebarLayout()) return;
        if (event.target.closest('.app-sidebar a.menu-btn')) {
            closeSidebarOverlay();
        }
    });

    /* ============================================================
       LOGOUT
       ============================================================ */
    window.doLogout = function () {
        fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' })
            .finally(function () { window.location.href = '/'; });
    };

    /* ============================================================
       NOTIFICATIONS
       ============================================================ */
    var notifPollTimer = null;
    var notifCacheById = {};

    function buildUrlWithParams(baseUrl, params, hash) {
        var safeBase = String(baseUrl || '').trim();
        if (!safeBase) return '';
        var hashIndex = safeBase.indexOf('#');
        var urlWithoutHash = hashIndex >= 0 ? safeBase.substring(0, hashIndex) : safeBase;
        var queryIndex = urlWithoutHash.indexOf('?');
        var pathname = queryIndex >= 0 ? urlWithoutHash.substring(0, queryIndex) : urlWithoutHash;
        var search = new URLSearchParams(queryIndex >= 0 ? urlWithoutHash.substring(queryIndex + 1) : '');
        Object.keys(params || {}).forEach(function (key) {
            var value = params[key];
            if (value === undefined || value === null || value === '') return;
            search.set(key, value);
        });
        var query = search.toString();
        return pathname + (query ? '?' + query : '') + (hash ? '#' + hash : '');
    }

    app.resolveTeamChatLink = function (role, roomScope) {
        var base = app.isProjectManagerRole(role) ? '/pm-workspace/team' : '/workspace/team';
        return buildUrlWithParams(base, { chatScope: roomScope || 'dept' }, 'teamChatCard');
    };

    app.resolveNotificationLink = function (notif) {
        if (!notif) return '';
        var entityType = String(notif.entityType || '').toLowerCase();
        var type = String(notif.type || '').toUpperCase();
        if (entityType === 'team_chat' || type === 'TEAM_CHAT') {
            return app.resolveTeamChatLink(
                (app.currentUser && app.currentUser.role) || notif.recipientRole || '',
                notif.roomScope || (notif.projectId ? 'proj:' + notif.projectId : 'dept')
            );
        }
        var link = String(notif.link || '').trim();
        if (!link || link.indexOf('//') === 0 || link.charAt(0) !== '/') return '';
        return link;
    };

    function loadNotifications() {
        app.fetchJson('/api/workspace/notifications', function (notifs) {
            notifs = Array.isArray(notifs) ? notifs : [];
            notifCacheById = {};
            (notifs || []).forEach(function (n) {
                if (n && n.id) notifCacheById[n.id] = n;
            });
            var unread = notifs.filter(function (n) { return !n.read; });
            var badge = document.getElementById('notifBadge');
            if (badge) {
                if (unread.length > 0) {
                    badge.textContent = unread.length > 99 ? '99+' : unread.length;
                    badge.classList.remove('hidden');
                } else {
                    badge.classList.add('hidden');
                }
            }
            var list = document.getElementById('notifDropdownList');
            if (list) {
                if (notifs.length === 0) {
                    list.innerHTML = '<div class="notif-empty">No notifications</div>';
                } else {
                    list.innerHTML = notifs.slice(0, 20).map(function (n) {
                        var time = n.createdAt ? app.formatTimestamp(n.createdAt) : '';
                        var readClass = n.read ? ' notif-read' : '';
                        return '<div class="notif-item' + readClass + '" tabindex="0" role="button" onclick="handleNotifClick(\'' + app.esc(n.id) + '\')" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();handleNotifClick(\'' + app.esc(n.id) + '\');}">'
                            + '<div class="notif-message">' + app.esc(n.message || '') + '</div>'
                            + '<div class="notif-meta"><span>' + app.esc(n.senderName || '') + '</span><span>' + time + '</span></div>'
                            + '</div>';
                    }).join('');
                }
            }
        }, function () {});
    }

    app.refreshNotifications = loadNotifications;

    function setNotifDropdownOpen(isOpen) {
        var dd = document.getElementById('notifDropdown');
        var btn = document.getElementById('headerNotifBtn');
        if (dd) dd.classList.toggle('hidden', !isOpen);
        if (btn) btn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    }

    window.toggleNotifDropdown = function () {
        var dd = document.getElementById('notifDropdown');
        setNotifDropdownOpen(dd ? dd.classList.contains('hidden') : false);
    };

    window.handleNotifClick = function (notifId) {
        var notif = notifCacheById[notifId] || null;
        var link = app.resolveNotificationLink(notif);
        var navigated = false;
        function goToLink() {
            if (navigated || !link) return;
            navigated = true;
            window.location.href = link;
        }
        app.fetchMutate('PUT', '/api/workspace/notifications', { id: notifId }, function () {
            loadNotifications();
            goToLink();
        }, function () {
            goToLink();
        });
        if (link) {
            setTimeout(goToLink, 250);
        }
        setNotifDropdownOpen(false);
    };

    window.markAllNotifsRead = function () {
        app.fetchMutate('PUT', '/api/workspace/notifications', { markAllRead: true }, function () {
            app.showToast('All notifications marked as read', 'success');
            loadNotifications();
        }, function () {});
    };

    function startNotifPolling() {
        loadNotifications();
        notifPollTimer = setInterval(loadNotifications, 15000);
    }

    // Close dropdown when clicking outside
    document.addEventListener('click', function (e) {
        var wrap = document.getElementById('headerNotifWrap');
        var dd = document.getElementById('notifDropdown');
        if (wrap && dd && !wrap.contains(e.target)) {
            setNotifDropdownOpen(false);
        }
    });

    function ensureSkipLink() {
        if (document.getElementById('skipToContentLink')) return;
        var content = document.getElementById('appContent');
        if (!content) return;
        content.setAttribute('tabindex', '-1');
        var link = document.createElement('a');
        link.id = 'skipToContentLink';
        link.className = 'skip-link';
        link.href = '#appContent';
        link.textContent = 'Skip to content';
        document.body.insertBefore(link, document.body.firstChild);
    }

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
        var html = '<button class="header-menu-btn" id="headerMenuBtn" type="button" onclick="toggleSidebar()" aria-label="Open navigation">'
            + '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 7h16v2H4zm0 5h16v2H4zm0 5h16v2H4z"/></svg>'
            + '</button>'
            + '<div class="header-brand">'
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

        html += '<div class="header-actions"><div class="header-toolbar">';

        if (config.showAddBtn) {
            html += '<button class="header-primary-btn" id="headerAddBtn">' + (config.addBtnText || '+ Add') + '</button>';
        }

        html += '<button class="header-icon-btn header-theme-btn" id="headerThemeBtn" type="button" onclick="toggleThemeMode()"></button>';

        // Notification bell
        html += '<div class="header-notif-wrap" id="headerNotifWrap">'
            + '<button class="header-notif-btn" id="headerNotifBtn" type="button" onclick="toggleNotifDropdown()" aria-label="Open notifications" aria-controls="notifDropdown" aria-expanded="false" aria-haspopup="true">'
            + '<svg viewBox="0 0 24 24" width="20" height="20"><path fill="currentColor" d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2zm-2 1H8v-6c0-2.48 1.51-4.5 4-4.5s4 2.02 4 4.5v6z"/></svg>'
            + '<span class="notif-badge hidden" id="notifBadge">0</span>'
            + '</button>'
            + '<div class="notif-dropdown hidden" id="notifDropdown">'
            + '<div class="notif-dropdown-header"><span>Notifications</span><button class="btn-tiny" onclick="markAllNotifsRead()">Mark all read</button></div>'
            + '<div class="notif-dropdown-list" id="notifDropdownList"><div class="notif-empty">No notifications</div></div>'
            + '</div></div></div>';

        html += '<div class="header-user">'
            + '<div class="header-user-info">'
            + '<div class="welcome-text" id="headerWelcome">Welcome</div>'
            + '<div class="email-text" id="headerEmail"></div>'
            + '</div>'
            + '<div class="header-avatar-wrap">'
            + '<div class="header-avatar" id="headerAvatar">?</div>'
            + '<div class="role-badge-small" id="headerRole">User</div>'
            + '</div>'
            + '<button class="btn-logout" onclick="doLogout()" aria-label="Logout">'
            + '<span class="btn-logout-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M10 17v-3H3v-4h7V7l5 5-5 5zm7-12h-5v2h5v10h-5v2h5c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2z"/></svg></span>'
            + '<span class="btn-logout-label">Logout</span>'
            + '</button>'
            + '</div>'
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
            + menuBtn('/app/users', 'users', 'team', 'Users', activePage)
            + menuBtn('/app/reports', 'reports', 'documents', 'Reports', activePage)
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
            + '</div>' + buildSystemInfoCard();

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
            + '</div>' + buildSystemInfoCard();

        return html;
    }

    function buildPMSidebarHTML(activePage) {
        var html = '<button class="sidebar-toggle" id="sidebarToggle" onclick="toggleSidebar()">&lsaquo;</button>'
            + '<div class="menu-header">PM WORKSPACE</div>'
            + '<div class="menu-section">'
            + menuBtn('/pm-workspace', 'pmProjects', 'projects', 'Managed Projects', activePage)
            + menuBtn('/pm-workspace/tasks', 'pmTasks', 'tasks', 'Task Board', activePage)
            + menuBtn('/pm-workspace/team', 'pmTeam', 'team', 'My Team', activePage)
            + menuBtn('/pm-workspace/timesheet', 'pmTimesheet', 'timesheet', 'Team Timesheets', activePage)
            + menuBtn('/pm-workspace/requests', 'pmRequests', 'requests', 'Leave Requests', activePage)
            + menuBtn('/pm-workspace/documents', 'pmDocuments', 'documents', 'Documents', activePage)
            + menuBtn('/pm-workspace/profile', 'pmProfile', 'profile', 'My Profile', activePage)
            + '</div>' + buildSystemInfoCard();

        return html;
    }

    function buildSystemInfoCard() {
        return '<div class="system-info-card">'
            + '<div class="title">System Status</div>'
            + '<div class="status-row"><div class="status-dot" id="systemStatusDot"></div>'
            + '<span class="status-text" id="systemStatusText">Checking...</span></div>'
            + '<button class="sidebar-theme-btn" id="sidebarThemeBtn" type="button" onclick="toggleThemeMode()"></button>'
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
       DEPARTMENT PROMPT (employee / PM workspaces)
       ============================================================ */
    function checkDepartment() {
        if (sessionStorage.getItem('deptPromptDone')) return;
        app.fetchJson('/api/employees', function (employees) {
            if (!app.currentUser) return;
            var uid = (app.currentUser.uid || '').toLowerCase();
            var email = (app.currentUser.email || '').toLowerCase();
            var name = (app.currentUser.displayName || '').toLowerCase();
            var me = null;
            for (var i = 0; i < employees.length; i++) {
                var e = employees[i];
                var eId = (e.id || '').toLowerCase();
                var eEmail = (e.email || '').toLowerCase();
                var eName = ((e.fullName || ((e.firstName || '') + ' ' + (e.lastName || '')).trim()) || '').toLowerCase();
                if ((uid && eId === uid) || (email && eEmail === email) || (name && eName === name)) {
                    me = e;
                    break;
                }
            }
            if (!me || (me.department && me.department.trim())) {
                sessionStorage.setItem('deptPromptDone', '1');
                return;
            }
            // Show department prompt modal
            if (!document.getElementById('deptPromptModal')) {
                document.body.insertAdjacentHTML('beforeend',
                    '<div class="modal-overlay" id="deptPromptModal">'
                    + '<div class="modal-card modal-card-sm">'
                    + '<div class="modal-header"><h3>Department Required</h3></div>'
                    + '<div class="modal-body">'
                    + '<p style="margin-bottom:12px;color:var(--ink-sub)">Your department is not set. Please enter it to continue.</p>'
                    + '<div class="modal-field"><label>Department *</label>'
                    + '<select id="deptPromptInput">' + app.deptOptions('') + '</select></div>'
                    + '<div class="modal-notice" id="deptPromptNotice"></div>'
                    + '</div>'
                    + '<div class="modal-footer">'
                    + '<button class="btn-modal-save" id="deptPromptSaveBtn" onclick="saveDeptPrompt()">Save Department</button>'
                    + '</div></div></div>');
            } else {
                document.getElementById('deptPromptModal').classList.remove('hidden');
            }
            window._deptPromptEmpId = me.id;
        });
    }

    window.saveDeptPrompt = function () {
        var input = document.getElementById('deptPromptInput');
        var val = (input ? input.value.trim() : '');
        if (!val) {
            app.showModalNotice('deptPromptNotice', 'Department is required.', 'error');
            return;
        }
        var id = window._deptPromptEmpId;
        if (!id) return;
        var btn = document.getElementById('deptPromptSaveBtn');
        if (btn) btn.disabled = true;
        app.fetchMutate('PUT', '/api/employees/' + encodeURIComponent(id), { department: val }, function () {
            if (btn) btn.disabled = false;
            sessionStorage.setItem('deptPromptDone', '1');
            app.closeModal('deptPromptModal');
            app.showToast('Department saved', 'success');
            // Clear cached data so pages reload with updated dept
            delete app.cachedData.empEmployees;
            delete app.cachedData.pmEmployees;
        }, function (err) {
            if (btn) btn.disabled = false;
            app.showModalNotice('deptPromptNotice', err || 'Failed to save department.', 'error');
        });
    };

    /* ============================================================
       QUICK DEPARTMENT ASSIGNMENT (admin / PM / employee views)
       ============================================================ */
    window.openQuickDeptModal = function (empId, empName) {
        if (!document.getElementById('quickDeptModal')) {
            document.body.insertAdjacentHTML('beforeend',
                '<div class="modal-overlay hidden" id="quickDeptModal">'
                + '<div class="modal-card modal-card-sm">'
                + '<div class="modal-header"><h3 id="quickDeptTitle">Set Department</h3>'
                + '<button class="modal-close" onclick="closeModal(\'quickDeptModal\')">&times;</button></div>'
                + '<div class="modal-body">'
                + '<p id="quickDeptDesc" style="margin-bottom:12px;color:var(--ink-sub)"></p>'
                + '<input type="hidden" id="quickDeptEmpId">'
                + '<div class="modal-field"><label>Department *</label>'
                + '<select id="quickDeptInput">' + app.deptOptions('') + '</select></div>'
                + '<div class="modal-notice" id="quickDeptNotice"></div>'
                + '</div>'
                + '<div class="modal-footer">'
                + '<button class="btn-modal-cancel" onclick="closeModal(\'quickDeptModal\')">Cancel</button>'
                + '<button class="btn-modal-save" id="quickDeptSaveBtn" onclick="saveQuickDept()">Save</button>'
                + '</div></div></div>');
        }
        document.getElementById('quickDeptEmpId').value = empId || '';
        document.getElementById('quickDeptDesc').textContent = 'Assign a department to ' + (empName || 'this employee') + '.';
        document.getElementById('quickDeptInput').value = '';
        app.clearModalNotice('quickDeptNotice');
        document.getElementById('quickDeptModal').classList.remove('hidden');
    };

    window.saveQuickDept = function () {
        var val = (document.getElementById('quickDeptInput').value || '').trim();
        if (!val) {
            app.showModalNotice('quickDeptNotice', 'Department is required.', 'error');
            return;
        }
        var id = document.getElementById('quickDeptEmpId').value;
        if (!id) return;
        var btn = document.getElementById('quickDeptSaveBtn');
        if (btn) btn.disabled = true;
        app.fetchMutate('PUT', '/api/employees/' + encodeURIComponent(id), { department: val }, function () {
            if (btn) btn.disabled = false;
            app.closeModal('quickDeptModal');
            app.showToast('Department assigned', 'success');
            // Refresh the current page's data
            delete app.cachedData.employees;
            delete app.cachedData.empEmployees;
            delete app.cachedData.pmEmployees;
            if (typeof loadEmployees === 'function') loadEmployees();
            if (typeof loadPMTeam === 'function') loadPMTeam();
            if (typeof loadEmpTeam === 'function') loadEmpTeam();
        }, function (err) {
            if (btn) btn.disabled = false;
            app.showModalNotice('quickDeptNotice', err || 'Failed to assign department.', 'error');
        });
    };

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
        if (el) el.textContent = name;
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
        var shell = document.getElementById('appShell');

        app.setTheme(app.getThemeMode(), false);
        document.body.classList.remove('pm-theme-page', 'employee-theme-page');
        if (shell) shell.classList.remove('pm-theme', 'employee-theme');

        if (header) header.innerHTML = buildHeaderHTML(config);

        if (config.sidebar === 'employee') {
            if (shell) shell.classList.add('employee-theme');
            document.body.classList.add('employee-theme-page');
            if (sidebar) sidebar.innerHTML = buildEmployeeSidebarHTML(config.activePage);
        } else if (config.sidebar === 'pm') {
            if (shell) shell.classList.add('pm-theme');
            document.body.classList.add('pm-theme-page');
            if (sidebar) sidebar.innerHTML = buildPMSidebarHTML(config.activePage);
        } else {
            if (sidebar) sidebar.innerHTML = buildAdminSidebarHTML(config.activePage);
        }

        if (!document.getElementById('confirmModal')) {
            document.body.insertAdjacentHTML('beforeend', buildConfirmModalHTML());
        }
        if (!document.getElementById('toast')) {
            document.body.insertAdjacentHTML('beforeend', '<div class="toast" id="toast"></div>');
        }

        ensureSidebarBackdrop();
        ensureSkipLink();
        app.syncThemeControls();

        restoreSidebar();
        checkSystemHealth();
        checkAuth(function () {
            applyUserInfo(config.sidebar);
            startNotifPolling();
            if (config.sidebar === 'employee' || config.sidebar === 'pm') {
                checkDepartment();
            }
            if (config.onReady) config.onReady();
        });
    };

    window.addEventListener('storage', function (event) {
        if (event.key === app.THEME_STORAGE_KEY) {
            app.setTheme(app.getThemeMode(), false);
        }
    });

    if (window.matchMedia) {
        var media = window.matchMedia('(prefers-color-scheme: dark)');
        var onThemeMediaChange = function () {
            if (!readStoredTheme()) {
                app.setTheme(getSystemTheme(), false);
            }
        };
        if (typeof media.addEventListener === 'function') {
            media.addEventListener('change', onThemeMediaChange);
        } else if (typeof media.addListener === 'function') {
            media.addListener(onThemeMediaChange);
        }
    }

    return app;
})();
