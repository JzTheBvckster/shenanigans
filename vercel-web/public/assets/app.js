/* Shenanigans Web — App Shell (app.js) */
(function () {
    'use strict';

    var currentPage = 'dashboard';
    var currentUser = null;
    var cachedData = {};

    // ---- Bootstrap ----
    checkAuth();
    checkSystemHealth();

    // ---- Auth guard ----
    function checkAuth() {
        fetch('/api/auth/session', { credentials: 'same-origin' })
            .then(function (r) { return r.json(); })
            .then(function (body) {
                if (!body.ok || !body.data || !body.data.authenticated) {
                    window.location.href = '/';
                    return;
                }
                currentUser = body.data.user;
                applyUserInfo();
                loadPage(currentPage);
            })
            .catch(function () { window.location.href = '/'; });
    }

    function applyUserInfo() {
        if (!currentUser) return;
        var name = currentUser.displayName || currentUser.email || 'User';
        document.getElementById('headerWelcome').textContent = 'Welcome, ' + name;
        document.getElementById('headerEmail').textContent = currentUser.email || '';
        document.getElementById('headerAvatar').textContent = initials(name);
        document.getElementById('headerRole').textContent = formatRole(currentUser.role);

        // Settings page info
        document.getElementById('settingsName').textContent = name;
        document.getElementById('settingsEmail').textContent = currentUser.email || '—';
        document.getElementById('settingsRole').textContent = formatRole(currentUser.role);

        // Hide finance for non-MDs
        if (!isMD()) {
            var finBtn = document.querySelector('[data-page="finance"]');
            if (finBtn) finBtn.classList.add('hidden');
        }
    }

    function isMD() {
        return currentUser && currentUser.role &&
            currentUser.role.toUpperCase().replace(/\s+/g, '_') === 'MANAGING_DIRECTOR';
    }

    function initials(name) {
        var parts = (name || '?').split(/\s+/);
        if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
        return (parts[0][0] || '?').toUpperCase();
    }

    function formatRole(role) {
        if (!role) return 'User';
        return role.replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
    }

    // ---- Navigation ----
    window.navigateTo = function (page) {
        if (page === currentPage) return;
        currentPage = page;

        // Update sidebar active state
        document.querySelectorAll('.menu-btn').forEach(function (btn) {
            btn.classList.toggle('active', btn.getAttribute('data-page') === page);
        });

        // Show/hide pages
        document.querySelectorAll('.page-view').forEach(function (el) { el.classList.add('hidden'); });
        var target = document.getElementById('page' + capitalize(page));
        if (target) target.classList.remove('hidden');

        // Update header subtitle
        var subtitles = {
            dashboard: 'Management Portal',
            employees: 'Employee Management',
            projects: 'Project Management',
            finance: 'Invoices',
            settings: 'Settings'
        };
        document.getElementById('headerSubtitle').textContent = subtitles[page] || 'Management Portal';

        // Header search visibility
        var showSearch = (page === 'employees' || page === 'projects');
        document.getElementById('headerSearch').classList.toggle('hidden', !showSearch);
        document.getElementById('headerAddBtn').classList.toggle('hidden', !showSearch);
        if (showSearch) {
            document.getElementById('headerSearchInput').placeholder = page === 'employees' ? 'Search employees...' : 'Search projects...';
            document.getElementById('headerAddBtn').textContent = page === 'employees' ? '+ Add Employee' : '+ Add Project';
        }

        loadPage(page);
    };

    function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

    function loadPage(page) {
        switch (page) {
            case 'dashboard': loadDashboard(); break;
            case 'employees': loadEmployees(); break;
            case 'projects': loadProjects(); break;
            case 'finance': loadFinance(); break;
            case 'settings': break; // static
        }
    }

    // ---- Sidebar toggle ----
    (function restoreSidebar() {
        var collapsed = localStorage.getItem('sidebarCollapsed') === 'true';
        if (collapsed) {
            document.getElementById('appShell').classList.add('sidebar-collapsed');
            document.getElementById('sidebarToggle').innerHTML = '\u2B9E'; // ⮞
        }
    })();

    window.toggleSidebar = function () {
        var shell = document.getElementById('appShell');
        shell.classList.toggle('sidebar-collapsed');
        var collapsed = shell.classList.contains('sidebar-collapsed');
        var btn = document.getElementById('sidebarToggle');
        btn.innerHTML = collapsed ? '\u2B9E' : '\u2B9C'; // ⮞ or ⮜
        localStorage.setItem('sidebarCollapsed', collapsed);
    };

    // ---- Logout ----
    window.doLogout = function () {
        fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' })
            .finally(function () { window.location.href = '/'; });
    };

    // ---- System health ----
    function checkSystemHealth() {
        fetch('/api/health')
            .then(function (r) { return r.json(); })
            .then(function (body) {
                var dot = document.getElementById('systemStatusDot');
                var text = document.getElementById('systemStatusText');
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
                dot.style.background = '#ef4444';
                text.textContent = 'Unreachable';
                text.style.color = '#ef4444';
            });
    }

    // ---- Toast ----
    window.showToast = function (message, type) {
        var toast = document.getElementById('toast');
        toast.textContent = message;
        toast.className = 'toast visible ' + (type || 'success');
        setTimeout(function () { toast.className = 'toast'; }, 3000);
    };

    // ---- Settings ----
    window.saveSettings = function () {
        document.getElementById('saveStatus').textContent = 'Settings saved.';
        showToast('Settings saved', 'success');
        setTimeout(function () { document.getElementById('saveStatus').textContent = ''; }, 2000);
    };

    // ---- Search ----
    document.getElementById('headerSearchInput').addEventListener('input', function () {
        var q = this.value.toLowerCase().trim();
        if (currentPage === 'employees') filterEmployeeCards(q);
        else if (currentPage === 'projects') filterProjectCards(q);
    });

    function filterEmployeeCards(query) {
        document.querySelectorAll('#employeesKanban .employee-card').forEach(function (card) {
            var text = card.textContent.toLowerCase();
            card.style.display = text.includes(query) ? '' : 'none';
        });
    }

    function filterProjectCards(query) {
        document.querySelectorAll('#projectsKanban .project-card').forEach(function (card) {
            var text = card.textContent.toLowerCase();
            card.style.display = text.includes(query) ? '' : 'none';
        });
    }

    // ---- Header Add Button ----
    document.getElementById('headerAddBtn').addEventListener('click', function () {
        if (currentPage === 'employees') openEmployeeModal(null);
        else if (currentPage === 'projects') openProjectModal(null);
        else if (currentPage === 'finance') openInvoiceModal(null);
    });

    // ============================================================
    // MODAL HELPERS
    // ============================================================
    window.closeModal = function (id) {
        var overlay = document.getElementById(id);
        if (overlay) overlay.classList.add('hidden');
    };

    function showModalNotice(id, msg, type) {
        var el = document.getElementById(id);
        if (!el) return;
        el.textContent = msg;
        el.className = 'modal-notice visible ' + (type || 'error');
    }

    function clearModalNotice(id) {
        var el = document.getElementById(id);
        if (el) { el.textContent = ''; el.className = 'modal-notice'; }
    }

    // ============================================================
    // DASHBOARD
    // ============================================================
    function loadDashboard() {
        fetchJson('/api/dashboard/summary', function (data) {
            document.getElementById('statEmployees').textContent = data.totalEmployees || 0;
            document.getElementById('statProjects').textContent = data.activeProjects || 0;
            document.getElementById('statInvoices').textContent = data.openInvoices || 0;
            document.getElementById('statRevenue').textContent = '$' + formatMoney(data.paidRevenue || 0);

            document.getElementById('insightTotal').textContent = data.totalProjects || 0;
            document.getElementById('insightOverdue').textContent = data.overdueProjects || 0;
            document.getElementById('insightRevenue').textContent = '$' + formatMoney(data.paidRevenue || 0);

            var pct = data.totalProjects > 0 ? Math.min(100, Math.round((data.activeProjects / data.totalProjects) * 100)) : 0;
            document.getElementById('budgetPct').textContent = pct + '%';
            document.getElementById('budgetFill').style.width = pct + '%';
        });

        fetchJson('/api/projects', function (data) {
            cachedData.projects = data;
            renderProjectOverview(data);
            renderRecentActivity(data);
        }, function () {
            document.getElementById('projectOverviewList').innerHTML = '<p style="color:#94a3b8;padding:12px">No project data available.</p>';
            document.getElementById('activityList').innerHTML = '<p style="color:#94a3b8;padding:12px">No activity data.</p>';
        });
    }

    function renderProjectOverview(projects) {
        var container = document.getElementById('projectOverviewList');
        if (!projects || projects.length === 0) {
            container.innerHTML = '<p style="color:#94a3b8;padding:12px">No projects found.</p>';
            return;
        }

        var active = projects.filter(function (p) { return isProjectActive(p); }).slice(0, 5);
        if (active.length === 0) active = projects.slice(0, 5);

        container.innerHTML = active.map(function (p) {
            var pct = p.completionPercentage || 0;
            return '<div class="project-item">'
                + '<div class="project-item-header">'
                + '<span class="name">' + esc(p.name) + '</span>'
                + '<span class="pct">' + pct + '%</span>'
                + '</div>'
                + '<div class="project-progress"><div class="project-progress-fill" style="width:' + pct + '%"></div></div>'
                + '<div class="project-meta">'
                + '<span>' + esc(p.projectManager || 'Unassigned') + '</span>'
                + '<span>' + esc(formatStatus(p.status)) + '</span>'
                + '</div></div>';
        }).join('');
    }

    function renderRecentActivity(projects) {
        var container = document.getElementById('activityList');
        if (!projects || projects.length === 0) {
            container.innerHTML = '<p style="color:#94a3b8;padding:12px">No recent activity.</p>';
            return;
        }

        var sorted = projects.slice().sort(function (a, b) {
            return (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0);
        }).slice(0, 6);

        container.innerHTML = sorted.map(function (p, i) {
            var colors = ['blue', 'green', 'orange'];
            var dotColor = colors[i % colors.length];
            var action = p.status === 'COMPLETED' ? 'completed' : p.status === 'IN_PROGRESS' ? 'updated' : 'created';
            var ts = p.updatedAt || p.createdAt || 0;
            return '<div class="activity-item">'
                + '<div class="activity-dot ' + dotColor + '"></div>'
                + '<div class="activity-info">'
                + '<div class="title">' + esc(p.name) + ' was ' + action + '</div>'
                + '<div class="time">' + formatTimestamp(ts) + '</div>'
                + '</div></div>';
        }).join('');
    }

    // ============================================================
    // EMPLOYEES
    // ============================================================
    function loadEmployees() {
        fetchJson('/api/employees', function (data) {
            cachedData.employees = data;
            renderEmployeeKanban(data);
        }, function (err) {
            showNotice('employeesNotice', err || 'Failed to load employees.', 'error');
            clearKanbanSpinners('employeesKanban');
        });
    }

    function renderEmployeeKanban(employees) {
        var active = [], leave = [], terminated = [];

        employees.forEach(function (e) {
            var status = (e.status || 'ACTIVE').toUpperCase();
            if (status === 'ON_LEAVE') leave.push(e);
            else if (status === 'TERMINATED') terminated.push(e);
            else active.push(e);
        });

        document.getElementById('countActive').textContent = active.length;
        document.getElementById('countLeave').textContent = leave.length;
        document.getElementById('countTerminated').textContent = terminated.length;

        renderCards('cardsActive', active, renderEmployeeCard, 'No active employees');
        renderCards('cardsLeave', leave, renderEmployeeCard, 'No employees on leave');
        renderCards('cardsTerminated', terminated, renderEmployeeCard, 'No terminated employees');
    }

    function renderEmployeeCard(e) {
        var name = buildName(e);
        var id = esc(e.id || '');
        return '<div class="employee-card clickable" onclick="openEmployeeModal(\'' + id + '\')">'
            + '<div class="employee-card-top">'
            + '<div class="employee-avatar">' + initials(name) + '</div>'
            + '<div class="employee-card-info">'
            + '<div class="name">' + esc(name) + '</div>'
            + '<div class="position">' + esc(e.position || 'No position') + '</div>'
            + '</div></div>'
            + (e.department ? '<div class="employee-card-dept">' + esc(e.department) + '</div>' : '')
            + (e.email ? '<div class="employee-card-contact">' + esc(e.email) + '</div>' : '')
            + '</div>';
    }

    function buildName(e) {
        if (e.fullName) return e.fullName;
        var first = e.firstName || '';
        var last = e.lastName || '';
        return (first + ' ' + last).trim() || 'Unknown';
    }

    // ---- Employee Modal ----
    window.openEmployeeModal = function (id) {
        clearModalNotice('empModalNotice');
        var isEdit = !!id;
        document.getElementById('employeeModalTitle').textContent = isEdit ? 'Edit Employee' : 'Add Employee';
        document.getElementById('empDeleteBtn').classList.toggle('hidden', !isEdit);

        if (isEdit) {
            var emp = findCached('employees', id);
            if (emp) {
                document.getElementById('empId').value = emp.id || '';
                document.getElementById('empFirstName').value = emp.firstName || '';
                document.getElementById('empLastName').value = emp.lastName || '';
                document.getElementById('empEmail').value = emp.email || '';
                document.getElementById('empPhone').value = emp.phone || '';
                document.getElementById('empDepartment').value = emp.department || '';
                document.getElementById('empPosition').value = emp.position || '';
                document.getElementById('empStatus').value = (emp.status || 'ACTIVE').toUpperCase();
                document.getElementById('empSalary').value = emp.salary || '';
            }
        } else {
            document.getElementById('empId').value = '';
            document.getElementById('empFirstName').value = '';
            document.getElementById('empLastName').value = '';
            document.getElementById('empEmail').value = '';
            document.getElementById('empPhone').value = '';
            document.getElementById('empDepartment').value = '';
            document.getElementById('empPosition').value = '';
            document.getElementById('empStatus').value = 'ACTIVE';
            document.getElementById('empSalary').value = '';
        }

        document.getElementById('employeeModal').classList.remove('hidden');
    };

    window.saveEmployee = function () {
        clearModalNotice('empModalNotice');
        var firstName = document.getElementById('empFirstName').value.trim();
        if (!firstName) { showModalNotice('empModalNotice', 'First name is required.', 'error'); return; }

        var id = document.getElementById('empId').value;
        var payload = {
            firstName: firstName,
            lastName: document.getElementById('empLastName').value.trim(),
            email: document.getElementById('empEmail').value.trim(),
            phone: document.getElementById('empPhone').value.trim(),
            department: document.getElementById('empDepartment').value.trim(),
            position: document.getElementById('empPosition').value.trim(),
            status: document.getElementById('empStatus').value,
            salary: parseFloat(document.getElementById('empSalary').value) || 0
        };

        var isEdit = !!id;
        var url = isEdit ? '/api/employees/' + encodeURIComponent(id) : '/api/employees';
        var method = isEdit ? 'PUT' : 'POST';

        document.getElementById('empSaveBtn').disabled = true;
        fetchMutate(method, url, payload, function () {
            document.getElementById('empSaveBtn').disabled = false;
            closeModal('employeeModal');
            showToast(isEdit ? 'Employee updated' : 'Employee created', 'success');
            loadEmployees();
        }, function (err) {
            document.getElementById('empSaveBtn').disabled = false;
            showModalNotice('empModalNotice', err || 'Failed to save employee.', 'error');
        });
    };

    window.deleteEmployee = function () {
        var id = document.getElementById('empId').value;
        if (!id) return;
        showConfirm('Delete this employee?', function () {
            fetchMutate('DELETE', '/api/employees/' + encodeURIComponent(id), null, function () {
                closeModal('employeeModal');
                showToast('Employee deleted', 'success');
                loadEmployees();
            }, function (err) {
                showModalNotice('empModalNotice', err || 'Failed to delete employee.', 'error');
            });
        });
    };

    // ============================================================
    // PROJECTS
    // ============================================================
    function loadProjects() {
        fetchJson('/api/projects', function (data) {
            cachedData.projects = data;
            renderProjectKanban(data);
        }, function (err) {
            showNotice('projectsNotice', err || 'Failed to load projects.', 'error');
            clearKanbanSpinners('projectsKanban');
        });
    }

    function renderProjectKanban(projects) {
        var newP = [], inProgress = [], completed = [];

        projects.forEach(function (p) {
            var status = (p.status || '').toUpperCase();
            if (status === 'COMPLETED') completed.push(p);
            else if (status === 'IN_PROGRESS') inProgress.push(p);
            else newP.push(p);
        });

        document.getElementById('countNew').textContent = newP.length;
        document.getElementById('countInProgress').textContent = inProgress.length;
        document.getElementById('countCompleted').textContent = completed.length;

        renderCards('cardsNew', newP, renderProjectCard, 'No new projects');
        renderCards('cardsInProgress', inProgress, renderProjectCard, 'No projects in progress');
        renderCards('cardsCompleted', completed, renderProjectCard, 'No completed projects');
    }

    function renderProjectCard(p) {
        var pct = p.completionPercentage || 0;
        var priorityClass = 'priority-' + (p.priority || 'medium').toLowerCase();
        var id = esc(p.id || '');
        return '<div class="project-card clickable" onclick="openProjectModal(\'' + id + '\')">'
            + '<div class="card-name">' + esc(p.name || 'Untitled') + '</div>'
            + '<div class="card-manager">' + esc(p.projectManager || 'Unassigned') + '</div>'
            + '<span class="card-priority ' + priorityClass + '">' + esc(formatStatus(p.priority || 'MEDIUM')) + '</span>'
            + '<div class="card-progress-row">'
            + '<div class="card-progress"><div class="card-progress-fill" style="width:' + pct + '%"></div></div>'
            + '<span>' + pct + '%</span>'
            + '</div></div>';
    }

    // ---- Project Modal ----
    window.openProjectModal = function (id) {
        clearModalNotice('projModalNotice');
        var isEdit = !!id;
        document.getElementById('projectModalTitle').textContent = isEdit ? 'Edit Project' : 'Add Project';
        document.getElementById('projDeleteBtn').classList.toggle('hidden', !isEdit);

        if (isEdit) {
            var proj = findCached('projects', id);
            if (proj) {
                document.getElementById('projId').value = proj.id || '';
                document.getElementById('projName').value = proj.name || '';
                document.getElementById('projDescription').value = proj.description || '';
                document.getElementById('projManager').value = proj.projectManager || '';
                document.getElementById('projDepartment').value = proj.department || '';
                document.getElementById('projStatus').value = (proj.status || 'PLANNING').toUpperCase();
                document.getElementById('projPriority').value = (proj.priority || 'MEDIUM').toUpperCase();
                document.getElementById('projBudget').value = proj.budget || '';
                document.getElementById('projSpent').value = proj.spent || '';
                document.getElementById('projCompletion').value = proj.completionPercentage || 0;
            }
        } else {
            document.getElementById('projId').value = '';
            document.getElementById('projName').value = '';
            document.getElementById('projDescription').value = '';
            document.getElementById('projManager').value = '';
            document.getElementById('projDepartment').value = '';
            document.getElementById('projStatus').value = 'PLANNING';
            document.getElementById('projPriority').value = 'MEDIUM';
            document.getElementById('projBudget').value = '';
            document.getElementById('projSpent').value = '';
            document.getElementById('projCompletion').value = '0';
        }

        document.getElementById('projectModal').classList.remove('hidden');
    };

    window.saveProject = function () {
        clearModalNotice('projModalNotice');
        var name = document.getElementById('projName').value.trim();
        if (!name) { showModalNotice('projModalNotice', 'Project name is required.', 'error'); return; }

        var id = document.getElementById('projId').value;
        var payload = {
            name: name,
            description: document.getElementById('projDescription').value.trim(),
            projectManager: document.getElementById('projManager').value.trim(),
            department: document.getElementById('projDepartment').value.trim(),
            status: document.getElementById('projStatus').value,
            priority: document.getElementById('projPriority').value,
            budget: parseFloat(document.getElementById('projBudget').value) || 0,
            spent: parseFloat(document.getElementById('projSpent').value) || 0,
            completionPercentage: parseInt(document.getElementById('projCompletion').value, 10) || 0
        };

        var isEdit = !!id;
        var url = isEdit ? '/api/projects/' + encodeURIComponent(id) : '/api/projects';
        var method = isEdit ? 'PUT' : 'POST';

        document.getElementById('projSaveBtn').disabled = true;
        fetchMutate(method, url, payload, function () {
            document.getElementById('projSaveBtn').disabled = false;
            closeModal('projectModal');
            showToast(isEdit ? 'Project updated' : 'Project created', 'success');
            loadProjects();
        }, function (err) {
            document.getElementById('projSaveBtn').disabled = false;
            showModalNotice('projModalNotice', err || 'Failed to save project.', 'error');
        });
    };

    window.deleteProject = function () {
        var id = document.getElementById('projId').value;
        if (!id) return;
        showConfirm('Delete this project?', function () {
            fetchMutate('DELETE', '/api/projects/' + encodeURIComponent(id), null, function () {
                closeModal('projectModal');
                showToast('Project deleted', 'success');
                loadProjects();
            }, function (err) {
                showModalNotice('projModalNotice', err || 'Failed to delete project.', 'error');
            });
        });
    };

    // ============================================================
    // FINANCE
    // ============================================================
    function loadFinance() {
        fetchJson('/api/finance/invoices', function (data) {
            cachedData.invoices = data;
            renderInvoiceKanban(data);
        }, function (err) {
            showNotice('financeNotice', err || 'Failed to load invoices.', 'error');
            clearKanbanSpinners('financeKanban');
        });
    }

    function renderInvoiceKanban(invoices) {
        var due = [], paid = [];

        invoices.forEach(function (inv) {
            if (inv.paid) paid.push(inv);
            else due.push(inv);
        });

        document.getElementById('countDue').textContent = due.length;
        document.getElementById('countPaid').textContent = paid.length;

        renderCards('cardsDue', due, renderInvoiceCard, 'No outstanding invoices');
        renderCards('cardsPaid', paid, renderInvoiceCard, 'No paid invoices');
    }

    function renderInvoiceCard(inv) {
        var statusClass = inv.paid ? 'invoice-status-paid' : 'invoice-status-outstanding';
        var statusText = inv.paid ? 'Paid' : 'Outstanding';
        var id = esc(inv.id || '');
        return '<div class="invoice-card clickable" onclick="openInvoiceModal(\'' + id + '\')">'
            + '<div class="invoice-id">' + esc(inv.id || '—') + '</div>'
            + '<div class="invoice-client">' + esc(inv.client || 'Unknown client') + '</div>'
            + '<div class="invoice-amount">$' + formatMoney(inv.amount || 0) + '</div>'
            + '<span class="invoice-status-badge ' + statusClass + '">' + statusText + '</span>'
            + (inv.issuedAt ? '<div class="invoice-date">' + formatTimestamp(inv.issuedAt) + '</div>' : '')
            + '</div>';
    }

    // ---- Invoice Modal ----
    window.openInvoiceModal = function (id) {
        clearModalNotice('invModalNotice');
        var isEdit = !!id;
        document.getElementById('invoiceModalTitle').textContent = isEdit ? 'Edit Invoice' : 'Add Invoice';
        document.getElementById('invDeleteBtn').classList.toggle('hidden', !isEdit);

        if (isEdit) {
            var inv = findCached('invoices', id);
            if (inv) {
                document.getElementById('invId').value = inv.id || '';
                document.getElementById('invClient').value = inv.client || '';
                document.getElementById('invAmount').value = inv.amount || '';
                document.getElementById('invPaid').value = inv.paid ? 'true' : 'false';
                document.getElementById('invProjectId').value = inv.projectId || '';
            }
        } else {
            document.getElementById('invId').value = '';
            document.getElementById('invClient').value = '';
            document.getElementById('invAmount').value = '';
            document.getElementById('invPaid').value = 'false';
            document.getElementById('invProjectId').value = '';
        }

        document.getElementById('invoiceModal').classList.remove('hidden');
    };

    window.saveInvoice = function () {
        clearModalNotice('invModalNotice');
        var client = document.getElementById('invClient').value.trim();
        var amount = parseFloat(document.getElementById('invAmount').value);
        if (!client) { showModalNotice('invModalNotice', 'Client name is required.', 'error'); return; }
        if (isNaN(amount) || amount <= 0) { showModalNotice('invModalNotice', 'A valid amount is required.', 'error'); return; }

        var id = document.getElementById('invId').value;
        var payload = {
            client: client,
            amount: amount,
            paid: document.getElementById('invPaid').value === 'true',
            projectId: document.getElementById('invProjectId').value.trim()
        };

        var isEdit = !!id;
        var url = isEdit ? '/api/finance/invoices/' + encodeURIComponent(id) : '/api/finance/invoices';
        var method = isEdit ? 'PUT' : 'POST';

        document.getElementById('invSaveBtn').disabled = true;
        fetchMutate(method, url, payload, function () {
            document.getElementById('invSaveBtn').disabled = false;
            closeModal('invoiceModal');
            showToast(isEdit ? 'Invoice updated' : 'Invoice created', 'success');
            loadFinance();
        }, function (err) {
            document.getElementById('invSaveBtn').disabled = false;
            showModalNotice('invModalNotice', err || 'Failed to save invoice.', 'error');
        });
    };

    window.deleteInvoice = function () {
        var id = document.getElementById('invId').value;
        if (!id) return;
        showConfirm('Delete this invoice?', function () {
            fetchMutate('DELETE', '/api/finance/invoices/' + encodeURIComponent(id), null, function () {
                closeModal('invoiceModal');
                showToast('Invoice deleted', 'success');
                loadFinance();
            }, function (err) {
                showModalNotice('invModalNotice', err || 'Failed to delete invoice.', 'error');
            });
        });
    };

    // ============================================================
    // CONFIRM DIALOG
    // ============================================================
    function showConfirm(message, onConfirm) {
        document.getElementById('confirmMessage').textContent = message;
        var btn = document.getElementById('confirmDeleteBtn');
        // Clone to remove old listeners
        var newBtn = btn.cloneNode(true);
        btn.parentNode.replaceChild(newBtn, btn);
        newBtn.addEventListener('click', function () {
            closeModal('confirmModal');
            onConfirm();
        });
        document.getElementById('confirmModal').classList.remove('hidden');
    }

    // ============================================================
    // GENERIC HELPERS
    // ============================================================
    function findCached(collection, id) {
        var list = cachedData[collection];
        if (!list) return null;
        for (var i = 0; i < list.length; i++) {
            if (list[i].id === id) return list[i];
        }
        return null;
    }

    function renderCards(containerId, items, renderFn, emptyMsg) {
        var container = document.getElementById(containerId);
        if (!container) return;

        if (!items || items.length === 0) {
            container.innerHTML = '<div class="kanban-empty"><div class="icon">&#128230;</div><div class="msg">' + esc(emptyMsg) + '</div></div>';
            return;
        }

        container.innerHTML = items.map(renderFn).join('');
    }

    function clearKanbanSpinners(boardId) {
        var board = document.getElementById(boardId);
        if (!board) return;
        board.querySelectorAll('.loading-spinner').forEach(function (s) { s.classList.remove('visible'); });
    }

    function showNotice(id, message, type) {
        var el = document.getElementById(id);
        if (!el) return;
        el.textContent = message;
        el.className = 'notice visible ' + (type || 'error');
    }

    function fetchJson(url, onSuccess, onError) {
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
    }

    function fetchMutate(method, url, payload, onSuccess, onError) {
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
    }

    function isProjectActive(p) {
        var s = (p.status || '').toUpperCase();
        return s === 'IN_PROGRESS' || s === 'PLANNING';
    }

    function formatStatus(s) {
        if (!s) return '';
        return s.replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
    }

    function formatMoney(n) {
        return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function formatTimestamp(ts) {
        if (!ts || ts <= 0) return '';
        var d = ts > 1e12 ? new Date(ts) : new Date(ts * 1000);
        if (isNaN(d.getTime())) return '';
        return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    }

    function esc(str) {
        if (!str) return '';
        var div = document.createElement('div');
        div.appendChild(document.createTextNode(String(str)));
        return div.innerHTML;
    }
})();
