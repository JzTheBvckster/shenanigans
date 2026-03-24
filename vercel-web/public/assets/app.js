/* Shenanigans Web — App Shell (app.js) */
(function () {
    'use strict';

    var currentPage = 'dashboard';
    var currentUser = null;
    var cachedData = {};
    var filtersInitialized = false;

    // ---- Bootstrap ----
    checkAuth();
    checkSystemHealth();
    initPageFilters();

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
            // Show employee workspace menu
            var empMenu = document.getElementById('empMenuSection');
            if (empMenu) empMenu.classList.remove('hidden');
        }
        applySettingsInfo();
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
            settings: 'Settings',
            empTasks: 'My Tasks',
            empProjects: 'My Projects',
            empTimesheet: 'Time Sheet',
            empRequests: 'Leave Requests',
            empDocuments: 'Documents',
            empTeam: 'My Team',
            empProfile: 'My Profile'
        };
        document.getElementById('headerSubtitle').textContent = subtitles[page] || 'Management Portal';

        // Header search visibility
        var showSearch = (page === 'employees' || page === 'projects');
        document.getElementById('headerSearch').classList.toggle('hidden', !showSearch);
        document.getElementById('headerAddBtn').classList.toggle('hidden', page !== 'employees' && page !== 'projects');
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
            case 'empTasks': loadEmpTasks(); break;
            case 'empProjects': loadEmpProjects(); break;
            case 'empTimesheet': loadEmpTimesheet(); break;
            case 'empRequests': loadEmpRequests(); break;
            case 'empDocuments': loadEmpDocuments(); break;
            case 'empTeam': loadEmpTeam(); break;
            case 'empProfile': loadEmpProfile(); break;
        }
    }

    // ---- Sidebar toggle ----
    (function restoreSidebar() {
        var collapsed = localStorage.getItem('sidebarCollapsed') === 'true';
        if (collapsed) {
            document.getElementById('appShell').classList.add('sidebar-collapsed');
            document.getElementById('sidebarToggle').innerHTML = '\u2039'; // <
        }
    })();

    window.toggleSidebar = function () {
        var shell = document.getElementById('appShell');
        shell.classList.toggle('sidebar-collapsed');
        var collapsed = shell.classList.contains('sidebar-collapsed');
        var btn = document.getElementById('sidebarToggle');
        btn.innerHTML = collapsed ? '\u203A' : '\u2039'; // > or <
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
        var sidebarCheckbox = document.getElementById('settingSidebarExpanded');
        if (sidebarCheckbox) {
            if (sidebarCheckbox.checked) {
                localStorage.removeItem('sidebarCollapsed');
                document.querySelector('.sidebar').classList.remove('collapsed');
            } else {
                localStorage.setItem('sidebarCollapsed', 'true');
                document.querySelector('.sidebar').classList.add('collapsed');
            }
        }
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
            var deptFilter = (document.getElementById('employeeDeptFilter') || {}).value || '';
            var statusFilter = (document.getElementById('employeeStatusFilter') || {}).value || '';
            var cardDept = card.getAttribute('data-department') || '';
            var cardStatus = card.getAttribute('data-status') || '';
            var matchesSearch = text.includes(query);
            var matchesDept = !deptFilter || cardDept === deptFilter;
            var matchesStatus = !statusFilter || cardStatus === statusFilter;
            card.style.display = matchesSearch && matchesDept && matchesStatus ? '' : 'none';
        });
    }

    function filterProjectCards(query) {
        document.querySelectorAll('#projectsKanban .project-card').forEach(function (card) {
            var text = card.textContent.toLowerCase();
            var deptFilter = (document.getElementById('projectDeptFilter') || {}).value || '';
            var managerFilter = (document.getElementById('projectManagerFilter') || {}).value || '';
            var statusFilter = (document.getElementById('projectStatusFilter') || {}).value || '';
            var cardDept = card.getAttribute('data-department') || '';
            var cardManager = card.getAttribute('data-manager') || '';
            var cardStatus = card.getAttribute('data-status') || '';
            var matchesSearch = text.includes(query);
            var matchesDept = !deptFilter || cardDept === deptFilter;
            var matchesManager = !managerFilter || cardManager === managerFilter;
            var matchesStatus = !statusFilter || cardStatus === statusFilter;
            card.style.display = matchesSearch && matchesDept && matchesManager && matchesStatus ? '' : 'none';
        });
    }

    function filterInvoiceCards() {
        var statusFilter = (document.getElementById('invoiceStatusFilter') || {}).value || '';
        var clientFilter = ((document.getElementById('invoiceClientFilter') || {}).value || '').toLowerCase().trim();
        document.querySelectorAll('#financeKanban .invoice-card').forEach(function (card) {
            var paid = card.getAttribute('data-paid') || 'false';
            var client = (card.getAttribute('data-client') || '').toLowerCase();
            var matchesStatus = !statusFilter || (statusFilter === 'paid' ? paid === 'true' : paid !== 'true');
            var matchesClient = !clientFilter || client.indexOf(clientFilter) !== -1;
            card.style.display = matchesStatus && matchesClient ? '' : 'none';
        });
    }

    window.clearEmployeesFilters = function () {
        var dept = document.getElementById('employeeDeptFilter');
        var status = document.getElementById('employeeStatusFilter');
        var headerSearch = document.getElementById('headerSearchInput');
        if (dept) dept.value = '';
        if (status) status.value = '';
        if (headerSearch) headerSearch.value = '';
        filterEmployeeCards('');
    };

    window.clearProjectsFilters = function () {
        var dept = document.getElementById('projectDeptFilter');
        var manager = document.getElementById('projectManagerFilter');
        var status = document.getElementById('projectStatusFilter');
        var headerSearch = document.getElementById('headerSearchInput');
        if (dept) dept.value = '';
        if (manager) manager.value = '';
        if (status) status.value = '';
        if (headerSearch) headerSearch.value = '';
        filterProjectCards('');
    };

    window.clearFinanceFilters = function () {
        var status = document.getElementById('invoiceStatusFilter');
        var client = document.getElementById('invoiceClientFilter');
        if (status) status.value = '';
        if (client) client.value = '';
        filterInvoiceCards();
    };

    function applyEmpTasksFilters() {
        var statusFilter = (document.getElementById('empTaskStatusFilter') || {}).value || '';
        var priorityFilter = (document.getElementById('empTaskPriorityFilter') || {}).value || '';
        var searchFilter = ((document.getElementById('empTaskSearchFilter') || {}).value || '').toLowerCase().trim();
        document.querySelectorAll('#empTasksList .emp-task-row').forEach(function (row) {
            var status = row.getAttribute('data-status') || '';
            var priority = row.getAttribute('data-priority') || '';
            var text = row.textContent.toLowerCase();
            var matchesStatus = !statusFilter || status === statusFilter;
            var matchesPriority = !priorityFilter || priority === priorityFilter;
            var matchesSearch = !searchFilter || text.indexOf(searchFilter) !== -1;
            row.style.display = matchesStatus && matchesPriority && matchesSearch ? '' : 'none';
        });
    }

    function applyEmpProjectsFilters() {
        var statusFilter = (document.getElementById('empProjectStatusFilter') || {}).value || '';
        var priorityFilter = (document.getElementById('empProjectPriorityFilter') || {}).value || '';
        var deptFilter = (document.getElementById('empProjectDepartmentFilter') || {}).value || '';
        var searchFilter = ((document.getElementById('empProjectSearchFilter') || {}).value || '').toLowerCase().trim();
        document.querySelectorAll('#empProjectsList .emp-project-item').forEach(function (item) {
            var status = item.getAttribute('data-status') || '';
            var priority = item.getAttribute('data-priority') || '';
            var dept = item.getAttribute('data-department') || '';
            var text = item.textContent.toLowerCase();
            var matchesStatus = !statusFilter || status === statusFilter;
            var matchesPriority = !priorityFilter || priority === priorityFilter;
            var matchesDept = !deptFilter || dept === deptFilter;
            var matchesSearch = !searchFilter || text.indexOf(searchFilter) !== -1;
            item.style.display = matchesStatus && matchesPriority && matchesDept && matchesSearch ? '' : 'none';
        });
    }

    function applyEmpTeamFilters() {
        var deptFilter = (document.getElementById('empTeamDepartmentFilter') || {}).value || '';
        var searchFilter = ((document.getElementById('empTeamSearchFilter') || {}).value || '').toLowerCase().trim();
        document.querySelectorAll('#empTeamList .emp-team-row').forEach(function (row) {
            var dept = row.getAttribute('data-department') || '';
            var text = row.textContent.toLowerCase();
            var matchesDept = !deptFilter || dept === deptFilter;
            var matchesSearch = !searchFilter || text.indexOf(searchFilter) !== -1;
            row.style.display = matchesDept && matchesSearch ? '' : 'none';
        });
    }

    window.clearEmpTasksFilters = function () {
        var status = document.getElementById('empTaskStatusFilter');
        var priority = document.getElementById('empTaskPriorityFilter');
        var search = document.getElementById('empTaskSearchFilter');
        if (status) status.value = '';
        if (priority) priority.value = '';
        if (search) search.value = '';
        applyEmpTasksFilters();
    };

    window.clearEmpProjectsFilters = function () {
        var status = document.getElementById('empProjectStatusFilter');
        var priority = document.getElementById('empProjectPriorityFilter');
        var dept = document.getElementById('empProjectDepartmentFilter');
        var search = document.getElementById('empProjectSearchFilter');
        if (status) status.value = '';
        if (priority) priority.value = '';
        if (dept) dept.value = '';
        if (search) search.value = '';
        applyEmpProjectsFilters();
    };

    window.clearEmpTeamFilters = function () {
        var dept = document.getElementById('empTeamDepartmentFilter');
        var search = document.getElementById('empTeamSearchFilter');
        if (dept) dept.value = '';
        if (search) search.value = '';
        applyEmpTeamFilters();
    };

    function populateEmpProjectsDeptFilter(projects) {
        var select = document.getElementById('empProjectDepartmentFilter');
        if (!select) return;
        var current = select.value || '';
        var deptMap = {};
        (projects || []).forEach(function (p) {
            var d = normalizeDepartment(p.department);
            if (d) deptMap[d] = true;
        });
        var departments = Object.keys(deptMap).sort(function (a, b) { return a.localeCompare(b); });
        select.innerHTML = '<option value="">All Departments</option>' + departments.map(function (d) {
            return '<option value="' + esc(d) + '">' + esc(d) + '</option>';
        }).join('');
        if (current) select.value = current;
    }

    function populateEmpTeamDeptFilter(team) {
        var select = document.getElementById('empTeamDepartmentFilter');
        if (!select) return;
        var current = select.value || '';
        var deptMap = {};
        (team || []).forEach(function (e) {
            var d = normalizeDepartment(e.department);
            if (d) deptMap[d] = true;
        });
        var departments = Object.keys(deptMap).sort(function (a, b) { return a.localeCompare(b); });
        select.innerHTML = '<option value="">All Departments</option>' + departments.map(function (d) {
            return '<option value="' + esc(d) + '">' + esc(d) + '</option>';
        }).join('');
        if (current) select.value = current;
    }

    function initPageFilters() {
        if (filtersInitialized) return;
        filtersInitialized = true;

        ['employeeDeptFilter', 'employeeStatusFilter', 'projectDeptFilter', 'projectManagerFilter', 'projectStatusFilter'].forEach(function (id) {
            var el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('change', function () {
                var q = ((document.getElementById('headerSearchInput') || {}).value || '').toLowerCase().trim();
                if (currentPage === 'employees') filterEmployeeCards(q);
                if (currentPage === 'projects') filterProjectCards(q);
            });
        });

        var invoiceStatusFilter = document.getElementById('invoiceStatusFilter');
        if (invoiceStatusFilter) {
            invoiceStatusFilter.addEventListener('change', filterInvoiceCards);
        }
        var invoiceClientFilter = document.getElementById('invoiceClientFilter');
        if (invoiceClientFilter) {
            invoiceClientFilter.addEventListener('input', filterInvoiceCards);
        }

        ['empTaskStatusFilter', 'empTaskPriorityFilter'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.addEventListener('change', applyEmpTasksFilters);
        });
        var empTaskSearch = document.getElementById('empTaskSearchFilter');
        if (empTaskSearch) empTaskSearch.addEventListener('input', applyEmpTasksFilters);

        ['empProjectStatusFilter', 'empProjectPriorityFilter', 'empProjectDepartmentFilter'].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.addEventListener('change', applyEmpProjectsFilters);
        });
        var empProjectSearch = document.getElementById('empProjectSearchFilter');
        if (empProjectSearch) empProjectSearch.addEventListener('input', applyEmpProjectsFilters);

        var empTeamDept = document.getElementById('empTeamDepartmentFilter');
        if (empTeamDept) empTeamDept.addEventListener('change', applyEmpTeamFilters);
        var empTeamSearch = document.getElementById('empTeamSearchFilter');
        if (empTeamSearch) empTeamSearch.addEventListener('input', applyEmpTeamFilters);
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
            renderProjectStatusChart(data);
        }, function () {
            document.getElementById('projectOverviewList').innerHTML = '<p style="color:#94a3b8;padding:12px">No project data available.</p>';
            document.getElementById('activityList').innerHTML = '<p style="color:#94a3b8;padding:12px">No activity data.</p>';
        });

        fetchJson('/api/finance/invoices', function (data) {
            cachedData.invoices = data;
            renderRevenueTrendChart(data);
        });

        loadApprovalQueue();
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

        populateEmployeeFilters(employees);
        filterEmployeeCards(((document.getElementById('headerSearchInput') || {}).value || '').toLowerCase().trim());
    }

    function populateEmployeeFilters(employees) {
        var deptSelect = document.getElementById('employeeDeptFilter');
        if (!deptSelect) return;

        var currentVal = deptSelect.value || '';
        var depts = {};
        (employees || []).forEach(function (e) {
            var d = normalizeDepartment(e.department);
            if (d) depts[d] = true;
        });
        var options = Object.keys(depts).sort(function (a, b) { return a.localeCompare(b); });
        deptSelect.innerHTML = '<option value="">All Departments</option>' + options.map(function (d) {
            return '<option value="' + esc(d) + '">' + esc(d) + '</option>';
        }).join('');
        if (currentVal) deptSelect.value = currentVal;
    }

    function renderEmployeeCard(e) {
        var name = buildName(e);
        var id = esc(e.id || '');
        var status = (e.status || 'ACTIVE').toUpperCase();
        var department = normalizeDepartment(e.department);
        var statusClass = 'employee-status-' + status.toLowerCase();
        var statusLabel = formatStatus(status);
        return '<div class="employee-card clickable" data-department="' + esc(department) + '" data-status="' + esc(status) + '" onclick="openEmployeeModal(\'' + id + '\')">'
            + '<div class="employee-card-top">'
            + '<div class="employee-avatar">' + initials(name) + '</div>'
            + '<div class="employee-card-info">'
            + '<div class="name">' + esc(name) + '</div>'
            + '<div class="position">' + esc(e.position || 'No position') + '</div>'
            + '</div></div>'
            + (e.department ? '<div class="employee-card-dept">' + esc(e.department) + '</div>' : '')
            + (e.email ? '<div class="employee-card-contact">Email: ' + esc(e.email) + '</div>' : '')
            + (e.phone ? '<div class="employee-card-phone">Phone: ' + esc(e.phone) + '</div>' : '')
            + '<div class="employee-card-meta">'
            + (e.hireDate ? '<span>Hired ' + formatTimestamp(e.hireDate) + '</span>' : '<span></span>')
            + '<span class="employee-status-badge ' + statusClass + '">' + statusLabel + '</span>'
            + '</div></div>';
    }

    function buildName(e) {
        if (e.fullName) return e.fullName;
        if (e.displayName) return e.displayName;
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
                document.getElementById('empHireDate').value = emp.hireDate ? toDateInput(emp.hireDate) : '';
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
            document.getElementById('empHireDate').value = '';
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
            salary: parseFloat(document.getElementById('empSalary').value) || 0,
            hireDate: dateInputToMs('empHireDate')
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
            loadProjectManagersPanel(data);
        }, function (err) {
            showNotice('projectsNotice', err || 'Failed to load projects.', 'error');
            clearKanbanSpinners('projectsKanban');
            renderProjectManagersPanel([], []);
        });
    }

    function ensureProjectManagerCandidates(onDone) {
        if (cachedData.projectManagerCandidates) {
            onDone(cachedData.projectManagerCandidates);
            return;
        }

        fetchJson('/api/employees?projectManagers=true', function (data) {
            cachedData.projectManagerCandidates = data || [];
            onDone(cachedData.projectManagerCandidates);
        }, function () {
            fetchJson('/api/employees', function (allEmployees) {
                var filtered = (allEmployees || []).filter(isProjectManagerEmployee);
                cachedData.projectManagerCandidates = filtered;
                onDone(filtered);
            }, function () {
                cachedData.projectManagerCandidates = [];
                onDone([]);
            });
        });
    }

    function isProjectManagerEmployee(employee) {
        var role = (employee && employee.role ? String(employee.role) : '').toUpperCase().replace(/\s+/g, '_');
        return role === 'PROJECT_MANAGER';
    }

    function normalizeDepartment(value) {
        return (value || '').trim();
    }

    function managerDisplayName(manager) {
        return manager.displayName || buildName(manager) || manager.email || 'Unknown';
    }

    function loadProjectManagersPanel(projects) {
        ensureProjectManagerCandidates(function (managers) {
            renderProjectManagersPanel(projects || [], managers || []);
        });
    }

    function renderProjectManagersPanel(projects, managers) {
        var statsEl = document.getElementById('projectManagersStats');
        var groupsEl = document.getElementById('projectManagersDeptGroups');
        if (!statsEl || !groupsEl) return;

        if (!managers || managers.length === 0) {
            statsEl.innerHTML = '';
            groupsEl.innerHTML = '<div class="empty-state">No project managers found.</div>';
            return;
        }

        var enriched = managers.map(function (manager) {
            var id = (manager.id || manager.uid || '').toLowerCase();
            var name = managerDisplayName(manager);
            var nameKey = name.toLowerCase();
            var owned = (projects || []).filter(function (project) {
                var managerId = (project.projectManagerId || '').toLowerCase();
                var managerName = (project.projectManager || '').toLowerCase();
                return (id && managerId === id) || (nameKey && managerName === nameKey);
            });

            var dept = normalizeDepartment(manager.department);
            if (!dept && owned.length > 0) {
                dept = normalizeDepartment(owned[0].department);
            }

            return {
                id: manager.id || manager.uid || '',
                name: name,
                email: manager.email || '',
                department: dept,
                projectCount: owned.length
            };
        });

        var groups = {};
        var noDept = [];
        enriched.forEach(function (manager) {
            if (!manager.department) {
                noDept.push(manager);
                return;
            }
            if (!groups[manager.department]) groups[manager.department] = [];
            groups[manager.department].push(manager);
        });

        var deptNames = Object.keys(groups).sort(function (a, b) { return a.localeCompare(b); });
        var totalManaged = enriched.filter(function (m) { return m.projectCount > 0; }).length;
        var noDeptCount = noDept.length;

        statsEl.innerHTML =
            '<div class="stat-card stat-card-blue"><div class="stat-number">' + enriched.length + '</div><div class="stat-label">Project Managers</div><div class="stat-sub">Available managers</div></div>'
            + '<div class="stat-card stat-card-green"><div class="stat-number">' + totalManaged + '</div><div class="stat-label">Assigned</div><div class="stat-sub">Managing projects</div></div>'
            + '<div class="stat-card stat-card-purple"><div class="stat-number">' + (deptNames.length + (noDeptCount > 0 ? 1 : 0)) + '</div><div class="stat-label">Departments</div><div class="stat-sub">Manager groups</div></div>'
            + (noDeptCount > 0 ? '<div class="stat-card stat-card-orange"><div class="stat-number">' + noDeptCount + '</div><div class="stat-label">No Dept</div><div class="stat-sub">Needs assignment</div></div>' : '');

        var html = '';
        if (noDept.length > 0) {
            html += renderProjectManagerDeptGroup('Unassigned', noDept, true);
        }
        deptNames.forEach(function (dept) {
            html += renderProjectManagerDeptGroup(dept, groups[dept], false);
        });
        groupsEl.innerHTML = html || '<div class="empty-state">No project managers found.</div>';
    }

    function renderProjectManagerDeptGroup(deptName, members, isUnassigned) {
        var cls = isUnassigned ? ' dept-group-warning' : '';
        var sorted = members.slice().sort(function (a, b) { return a.name.localeCompare(b.name); });
        return '<div class="dept-group' + cls + '">'
            + '<div class="dept-group-header">'
            + '<span class="dept-group-name">' + esc(deptName) + '</span>'
            + '<span class="dept-group-count">' + sorted.length + ' manager' + (sorted.length === 1 ? '' : 's') + '</span>'
            + '</div>'
            + '<div class="dept-group-list">'
            + sorted.map(renderProjectManagerRow).join('')
            + '</div>'
            + '</div>';
    }

    function renderProjectManagerRow(manager) {
        return '<div class="user-row">'
            + '<div class="user-row-avatar">' + initials(manager.name) + '</div>'
            + '<div class="user-row-info">'
            + '<div class="user-row-name">' + esc(manager.name) + '</div>'
            + '<div class="user-row-email">' + esc(manager.email || 'No email') + '</div>'
            + '</div>'
            + '<div class="user-row-actions">'
            + '<span class="badge badge-muted">' + manager.projectCount + ' project' + (manager.projectCount === 1 ? '' : 's') + '</span>'
            + '</div>'
            + '</div>';
    }

    function buildProjectDepartments(managers, projects) {
        var map = {};
        (managers || []).forEach(function (manager) {
            var dept = normalizeDepartment(manager.department);
            if (dept) map[dept] = true;
        });
        (projects || []).forEach(function (project) {
            var dept = normalizeDepartment(project.department);
            if (dept) map[dept] = true;
        });
        return Object.keys(map).sort(function (a, b) { return a.localeCompare(b); });
    }

    function populateProjectDeptSelect(selectedDept) {
        var deptSel = document.getElementById('projDepartment');
        if (!deptSel) return;

        var depts = buildProjectDepartments(cachedData.projectManagerCandidates || [], cachedData.projects || []);
        deptSel.innerHTML = '<option value="">Select department...</option>'
            + depts.map(function (d) { return '<option value="' + esc(d) + '">' + esc(d) + '</option>'; }).join('');
        if (selectedDept) {
            deptSel.value = selectedDept;
            if (deptSel.value !== selectedDept) {
                deptSel.innerHTML += '<option value="' + esc(selectedDept) + '" selected>' + esc(selectedDept) + '</option>';
                deptSel.value = selectedDept;
            }
        }
    }

    function populateProjectManagerSelect(selectedDept, selectedManager, selectedManagerId) {
        var mgrSel = document.getElementById('projManager');
        if (!mgrSel) return;

        var managers = (cachedData.projectManagerCandidates || []).filter(function (manager) {
            if (!selectedDept) return true;
            return normalizeDepartment(manager.department) === selectedDept;
        });

        mgrSel.innerHTML = '<option value="">Unassigned</option>';
        var selectedFound = false;

        managers.forEach(function (manager) {
            var name = managerDisplayName(manager);
            var option = document.createElement('option');
            option.value = name;
            option.setAttribute('data-id', manager.id || manager.uid || '');
            option.textContent = name;
            if (selectedManager && name === selectedManager) {
                option.selected = true;
                selectedFound = true;
            }
            mgrSel.appendChild(option);
        });

        if (selectedManager && !selectedFound) {
            var legacy = document.createElement('option');
            legacy.value = selectedManager;
            legacy.setAttribute('data-id', selectedManagerId || '');
            legacy.textContent = selectedManager + ' (Current)';
            legacy.selected = true;
            mgrSel.appendChild(legacy);
        }
    }

    function setupProjectManagerForm(selectedDept, selectedManager, selectedManagerId) {
        ensureProjectManagerCandidates(function () {
            populateProjectDeptSelect(selectedDept || '');
            populateProjectManagerSelect(selectedDept || '', selectedManager || '', selectedManagerId || '');

            var deptSel = document.getElementById('projDepartment');
            if (deptSel) {
                deptSel.onchange = function () {
                    populateProjectManagerSelect(deptSel.value, '', '');
                };
            }
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

        populateProjectFilters(projects);
        filterProjectCards(((document.getElementById('headerSearchInput') || {}).value || '').toLowerCase().trim());
    }

    function populateProjectFilters(projects) {
        var deptSelect = document.getElementById('projectDeptFilter');
        var managerSelect = document.getElementById('projectManagerFilter');
        if (!deptSelect || !managerSelect) return;

        var deptCurrent = deptSelect.value || '';
        var managerCurrent = managerSelect.value || '';
        var deptMap = {};
        var managerMap = {};

        (projects || []).forEach(function (p) {
            var dept = normalizeDepartment(p.department);
            var manager = (p.projectManager || '').trim();
            if (dept) deptMap[dept] = true;
            if (manager) managerMap[manager] = true;
        });

        var depts = Object.keys(deptMap).sort(function (a, b) { return a.localeCompare(b); });
        var managers = Object.keys(managerMap).sort(function (a, b) { return a.localeCompare(b); });

        deptSelect.innerHTML = '<option value="">All Departments</option>' + depts.map(function (d) {
            return '<option value="' + esc(d) + '">' + esc(d) + '</option>';
        }).join('');
        managerSelect.innerHTML = '<option value="">All Managers</option>' + managers.map(function (m) {
            return '<option value="' + esc(m) + '">' + esc(m) + '</option>';
        }).join('');

        if (deptCurrent) deptSelect.value = deptCurrent;
        if (managerCurrent) managerSelect.value = managerCurrent;
    }

    function renderProjectCard(p) {
        var pct = p.completionPercentage || 0;
        var priorityClass = 'priority-' + (p.priority || 'medium').toLowerCase();
        var id = esc(p.id || '');
        var department = normalizeDepartment(p.department);
        var manager = (p.projectManager || '').trim();
        var status = (p.status || '').toUpperCase();
        var desc = p.description ? (p.description.length > 80 ? p.description.substring(0, 80) + '...' : p.description) : '';
        var dueHtml = '';
        if (p.endDate) {
            var isOverdue = p.endDate < Date.now() && (p.status || '').toUpperCase() !== 'COMPLETED';
            dueHtml = '<div class="card-due' + (isOverdue ? ' overdue' : '') + '">Due ' + formatTimestamp(p.endDate) + (isOverdue ? ' (Overdue)' : '') + '</div>';
        }
        return '<div class="project-card clickable" data-department="' + esc(department) + '" data-manager="' + esc(manager) + '" data-status="' + esc(status) + '" onclick="openProjectModal(\'' + id + '\')">'
            + '<div class="card-name">' + esc(p.name || 'Untitled') + '</div>'
            + '<div class="card-manager">' + esc(p.projectManager || 'Unassigned') + '</div>'
            + (desc ? '<div class="card-description">' + esc(desc) + '</div>' : '')
            + '<span class="card-priority ' + priorityClass + '">' + esc(formatStatus(p.priority || 'MEDIUM')) + '</span>'
            + dueHtml
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
                setupProjectManagerForm(proj.department || '', proj.projectManager || '', proj.projectManagerId || '');
                document.getElementById('projStatus').value = (proj.status || 'PLANNING').toUpperCase();
                document.getElementById('projPriority').value = (proj.priority || 'MEDIUM').toUpperCase();
                document.getElementById('projBudget').value = proj.budget || '';
                document.getElementById('projSpent').value = proj.spent || '';
                document.getElementById('projCompletion').value = proj.completionPercentage || 0;
                document.getElementById('projStartDate').value = proj.startDate ? toDateInput(proj.startDate) : '';
                document.getElementById('projEndDate').value = proj.endDate ? toDateInput(proj.endDate) : '';
            }
        } else {
            document.getElementById('projId').value = '';
            document.getElementById('projName').value = '';
            document.getElementById('projDescription').value = '';
            setupProjectManagerForm('', '', '');
            document.getElementById('projStatus').value = 'PLANNING';
            document.getElementById('projPriority').value = 'MEDIUM';
            document.getElementById('projBudget').value = '';
            document.getElementById('projSpent').value = '';
            document.getElementById('projCompletion').value = '0';
            document.getElementById('projStartDate').value = '';
            document.getElementById('projEndDate').value = '';
        }

        document.getElementById('projectModal').classList.remove('hidden');
    };

    window.saveProject = function () {
        clearModalNotice('projModalNotice');
        var name = document.getElementById('projName').value.trim();
        if (!name) { showModalNotice('projModalNotice', 'Project name is required.', 'error'); return; }

        var id = document.getElementById('projId').value;
        var managerSelect = document.getElementById('projManager');
        var managerOption = managerSelect ? managerSelect.options[managerSelect.selectedIndex] : null;
        var payload = {
            name: name,
            description: document.getElementById('projDescription').value.trim(),
            projectManager: managerSelect ? managerSelect.value : '',
            projectManagerId: managerOption ? (managerOption.getAttribute('data-id') || '') : '',
            department: document.getElementById('projDepartment').value,
            status: document.getElementById('projStatus').value,
            priority: document.getElementById('projPriority').value,
            budget: parseFloat(document.getElementById('projBudget').value) || 0,
            spent: parseFloat(document.getElementById('projSpent').value) || 0,
            completionPercentage: parseInt(document.getElementById('projCompletion').value, 10) || 0,
            startDate: dateInputToMs('projStartDate'),
            endDate: dateInputToMs('projEndDate')
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
        filterInvoiceCards();
    }

    function renderInvoiceCard(inv) {
        var statusClass = inv.paid ? 'invoice-status-paid' : 'invoice-status-outstanding';
        var statusText = inv.paid ? 'Paid' : 'Outstanding';
        var id = esc(inv.id || '');
        var toggleClass = inv.paid ? 'mark-unpaid' : 'mark-paid';
        var toggleLabel = inv.paid ? 'Mark Unpaid' : 'Mark Paid';
        return '<div class="invoice-card clickable" data-paid="' + (inv.paid ? 'true' : 'false') + '" data-client="' + esc(inv.client || '') + '" onclick="openInvoiceModal(\'' + id + '\')">'
            + '<div class="invoice-id">' + esc(inv.id || '\u2014') + '</div>'
            + '<div class="invoice-client">' + esc(inv.client || 'Unknown client') + '</div>'
            + '<div class="invoice-amount">$' + formatMoney(inv.amount || 0) + '</div>'
            + '<span class="invoice-status-badge ' + statusClass + '">' + statusText + '</span>'
            + (inv.issuedAt ? '<div class="invoice-date">' + formatTimestamp(inv.issuedAt) + '</div>' : '')
            + '<button class="invoice-toggle-btn ' + toggleClass + '" onclick="event.stopPropagation();toggleInvoicePaid(\'' + id + '\')">' + toggleLabel + '</button>'
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
            container.innerHTML = '<div class="kanban-empty"><div class="msg">' + esc(emptyMsg) + '</div></div>';
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

    // ---- Date helpers ----
    function toDateInput(ts) {
        if (!ts) return '';
        var d = ts > 1e12 ? new Date(ts) : new Date(ts * 1000);
        if (isNaN(d.getTime())) return '';
        return d.toISOString().split('T')[0];
    }

    function dateInputToMs(id) {
        var val = document.getElementById(id).value;
        if (!val) return 0;
        return new Date(val).getTime();
    }

    // ---- Toggle Invoice Paid ----
    window.toggleInvoicePaid = function (id) {
        var inv = findCached('invoices', id);
        if (!inv) return;
        var payload = { client: inv.client, amount: inv.amount, paid: !inv.paid, projectId: inv.projectId || '' };
        fetchMutate('PUT', '/api/finance/invoices/' + encodeURIComponent(id), payload, function () {
            showToast(payload.paid ? 'Invoice marked as paid' : 'Invoice marked as outstanding', 'success');
            loadFinance();
        }, function (err) {
            showToast(err || 'Failed to update invoice', 'error');
        });
    };

    // ---- Export Invoices CSV ----
    window.exportInvoicesCSV = function () {
        var invoices = cachedData.invoices;
        if (!invoices || invoices.length === 0) {
            showToast('No invoices to export', 'error');
            return;
        }
        var csv = 'ID,Client,Amount,Paid,Issued At\n';
        invoices.forEach(function (inv) {
            var client = (inv.client || '').replace(/"/g, '""');
            csv += '"' + (inv.id || '') + '","' + client + '",' + (inv.amount || 0) + ',' + (inv.paid ? 'Yes' : 'No') + ',"' + formatTimestamp(inv.issuedAt) + '"\n';
        });
        var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        var link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'invoices_' + new Date().toISOString().split('T')[0] + '.csv';
        link.click();
        URL.revokeObjectURL(link.href);
        showToast('Invoices exported', 'success');
    };

    // ---- Reset sidebar ----
    window.resetSidebarState = function () {
        localStorage.removeItem('sidebarCollapsed');
        document.getElementById('appShell').classList.remove('sidebar-collapsed');
        document.getElementById('sidebarToggle').innerHTML = '\u2039';
        showToast('Sidebar layout reset', 'success');
    };

    // ---- Approval Queue (MD only) ----
    function loadApprovalQueue() {
        if (!isMD()) return;
        var card = document.getElementById('approvalQueueCard');
        if (card) card.classList.remove('hidden');
        fetchJson('/api/employees?pendingUsers=true', function (pendingUsers) {
            var pending = pendingUsers || [];
            var countEl = document.getElementById('approvalQueueCount');
            var listEl = document.getElementById('approvalQueueList');
            if (!card) return;

            countEl.textContent = pending.length;
            if (pending.length > 0) {
                listEl.innerHTML = pending.map(function (e) {
                    var name = buildName(e);
                    var eid = esc(e.id || '');
                    return '<div class="approval-item">'
                        + '<div class="avatar">' + initials(name) + '</div>'
                        + '<div class="info">'
                        + '<div class="name">' + esc(name) + '</div>'
                        + '<div class="role">' + esc(e.role || e.position || 'Employee') + '</div>'
                        + '</div>'
                        + '<div class="approval-actions">'
                        + '<button class="btn-approve" onclick="approveEmployee(\'' + eid + '\')" data-id="' + eid + '">Approve</button>'
                        + '</div>'
                        + '</div>';
                }).join('');
            } else {
                listEl.innerHTML = '<p style="color:var(--ink-faint);padding:8px 0">No pending registrations</p>';
            }
        }, function (err) {
            if (card) {
                var listEl = document.getElementById('approvalQueueList');
                if (listEl) listEl.innerHTML = '<p style="color:#ef4444;padding:8px 0">Failed to load queue: ' + esc(err || 'Unknown error') + '</p>';
            }
        });
    }

    window.approveEmployee = function (id) {
        if (!id) return;
        var btn = document.querySelector('.btn-approve[data-id="' + id + '"]');
        if (btn) { btn.textContent = 'Approving...'; btn.disabled = true; }
        fetch('/api/employees/' + encodeURIComponent(id) + '?approveUser=true', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({})
        }).then(function (r) { return r.json(); }).then(function (res) {
            if (res.ok) {
                showToast('Employee approved', 'success');
                loadApprovalQueue();
            } else {
                showToast(res.error || 'Approval failed', 'error');
                if (btn) { btn.textContent = 'Approve'; btn.disabled = false; }
            }
        }).catch(function () {
            showToast('Network error', 'error');
            if (btn) { btn.textContent = 'Approve'; btn.disabled = false; }
        });
    };

    // ---- Charts ----
    var revenueTrendChartInstance = null;
    var projectStatusChartInstance = null;

    function isProjectOverdue(p) {
        if (!p.endDate) return false;
        var end = typeof p.endDate === 'number' ? p.endDate : new Date(p.endDate).getTime();
        return end < Date.now() && (p.status || '').toUpperCase() !== 'COMPLETED';
    }

    function renderRevenueTrendChart(invoices) {
        var canvas = document.getElementById('revenueTrendChart');
        if (!canvas || typeof Chart === 'undefined') return;
        var months = parseInt(document.getElementById('chartRangeFilter').value) || 6;
        var now = new Date();
        var labels = [];
        var values = [];
        for (var i = months - 1; i >= 0; i--) {
            var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            labels.push(d.toLocaleString('default', { month: 'short', year: '2-digit' }));
            values.push(0);
        }
        (invoices || []).forEach(function (inv) {
            if (!inv.paid || !inv.issuedAt) return;
            var ts = typeof inv.issuedAt === 'number' ? inv.issuedAt : new Date(inv.issuedAt).getTime();
            var d = new Date(ts);
            for (var i = 0; i < months; i++) {
                var ref = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1);
                var nextRef = new Date(ref.getFullYear(), ref.getMonth() + 1, 1);
                if (d >= ref && d < nextRef) {
                    values[i] += (inv.amount || 0);
                    break;
                }
            }
        });
        if (revenueTrendChartInstance) revenueTrendChartInstance.destroy();
        var isDark = document.documentElement.classList.contains('dark');
        var gridColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)';
        var textColor = isDark ? '#cbd5e1' : '#64748b';
        revenueTrendChartInstance = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Revenue',
                    data: values,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59,130,246,0.08)',
                    fill: true,
                    tension: 0.35,
                    pointRadius: 4,
                    pointBackgroundColor: '#3b82f6',
                    pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false } },
                scales: {
                    y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: textColor, callback: function (v) { return '$' + formatMoney(v); } } },
                    x: { grid: { display: false }, ticks: { color: textColor } }
                }
            }
        });
    }

    window.updateRevenueTrendChart = function () {
        renderRevenueTrendChart(cachedData.invoices || []);
    };

    function renderProjectStatusChart(projects) {
        var canvas = document.getElementById('projectStatusChart');
        if (!canvas || typeof Chart === 'undefined') return;
        var counts = { 'In Progress': 0, 'Completed': 0, 'Planning': 0, 'At Risk': 0 };
        (projects || []).forEach(function (p) {
            var s = (p.status || '').toUpperCase();
            if (s === 'COMPLETED') counts['Completed']++;
            else if (isProjectOverdue(p)) counts['At Risk']++;
            else if (s === 'IN_PROGRESS') counts['In Progress']++;
            else counts['Planning']++;
        });
        var labels = Object.keys(counts).filter(function (k) { return counts[k] > 0; });
        var values = labels.map(function (k) { return counts[k]; });
        var palette = { 'In Progress': '#3b82f6', 'Completed': '#22c55e', 'Planning': '#f59e0b', 'At Risk': '#ef4444' };
        var colors = labels.map(function (k) { return palette[k]; });

        if (labels.length === 0) {
            labels = ['No Data'];
            values = [1];
            colors = ['#e2e8f0'];
        }
        if (projectStatusChartInstance) projectStatusChartInstance.destroy();
        var isDark = document.documentElement.classList.contains('dark');
        projectStatusChartInstance = new Chart(canvas.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: values,
                    backgroundColor: colors,
                    borderWidth: 2,
                    borderColor: isDark ? '#1e293b' : '#ffffff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '60%',
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: isDark ? '#cbd5e1' : '#334155', padding: 16, usePointStyle: true }
                    }
                }
            }
        });
    }

    // ---- Settings: apply user info including approval ----
    function applySettingsInfo() {
        if (!currentUser) return;
        var approval = document.getElementById('settingsApproval');
        if (approval) {
            var isApproved = currentUser.mdApproved !== false;
            approval.innerHTML = isApproved
                ? '<span class="approval-badge approved">Approved</span>'
                : '<span class="approval-badge pending">Pending approval</span>';
        }
        // Restore sidebar toggle
        var sidebarCheck = document.getElementById('settingSidebarExpanded');
        if (sidebarCheck) {
            sidebarCheck.checked = localStorage.getItem('sidebarCollapsed') !== 'true';
        }
    }

    // ============================================================
    // EMPLOYEE WORKSPACE
    // ============================================================

    function ensureEmpData(cb) {
        if (cachedData.empEmployees && cachedData.empProjects) {
            cb(cachedData.empEmployees, cachedData.empProjects);
            return;
        }
        var done = { e: null, p: null };
        fetchJson('/api/employees', function (data) {
            cachedData.empEmployees = data;
            done.e = data;
            if (done.p !== null) cb(done.e, done.p);
        }, function () { cachedData.empEmployees = []; done.e = []; if (done.p !== null) cb(done.e, done.p); });
        fetchJson('/api/projects', function (data) {
            cachedData.empProjects = data;
            done.p = data;
            if (done.e !== null) cb(done.e, done.p);
        }, function () { cachedData.empProjects = []; done.p = []; if (done.e !== null) cb(done.e, done.p); });
    }

    function findCurrentEmployee(employees) {
        if (!currentUser) return null;
        var uid = (currentUser.uid || '').toLowerCase();
        var email = (currentUser.email || '').toLowerCase();
        var name = (currentUser.displayName || '').toLowerCase();
        for (var i = 0; i < employees.length; i++) {
            var e = employees[i];
            var eId = (e.id || '').toLowerCase();
            var eEmail = (e.email || '').toLowerCase();
            var eName = ((e.fullName || ((e.firstName || '') + ' ' + (e.lastName || '')).trim()) || '').toLowerCase();
            if ((uid && uid === eId) || (email && email === eEmail) || (name && name === eName)) return e;
        }
        return null;
    }

    function findAssignedProjects(projects) {
        if (!currentUser) return [];
        var uid = (currentUser.uid || '').toLowerCase();
        var name = (currentUser.displayName || '').toLowerCase();
        return projects.filter(function (p) {
            var teamAssigned = (p.teamMemberIds || []).some(function (id) { return uid && (id || '').toLowerCase() === uid; });
            var mgrAssigned = uid && (p.projectManagerId || '').toLowerCase() === uid;
            var nameAssigned = name && (p.projectManager || '').toLowerCase() === name;
            return teamAssigned || mgrAssigned || nameAssigned;
        });
    }

    function empStatCard(val, label, subtitle, color) {
        return '<div class="stat-card stat-card-' + color + '">'
            + '<div class="stat-number">' + esc(String(val)) + '</div>'
            + '<div class="stat-label">' + esc(label) + '</div>'
            + '<div class="stat-sub">' + esc(subtitle) + '</div>'
            + '</div>';
    }

    function empInfoRow(title, desc, badge) {
        return '<div class="emp-info-row">'
            + '<div class="emp-info-content"><div class="emp-info-title">' + esc(title) + '</div>'
            + '<div class="emp-info-desc">' + esc(desc) + '</div></div>'
            + '<span class="badge badge-muted">' + esc(badge) + '</span></div>';
    }

    function empDueText(endDate) {
        if (!endDate || endDate <= 0) return 'No due date';
        var ts = endDate > 1e12 ? endDate : endDate * 1000;
        var due = new Date(ts);
        var now = new Date(); now.setHours(0, 0, 0, 0);
        var diff = Math.round((due - now) / 86400000);
        if (diff < 0) return 'Overdue by ' + Math.abs(diff) + ' day' + (Math.abs(diff) === 1 ? '' : 's');
        if (diff === 0) return 'Due today';
        if (diff === 1) return 'Due tomorrow';
        return 'Due in ' + diff + ' days';
    }

    function isEmpOverdue(p) {
        if (!p.endDate || p.endDate <= 0) return false;
        var ts = p.endDate > 1e12 ? p.endDate : p.endDate * 1000;
        return new Date(ts) < new Date() && (p.status || '').toUpperCase() !== 'COMPLETED';
    }

    function isEmpActive(p) {
        var s = (p.status || '').toUpperCase();
        return s === 'IN_PROGRESS' || s === 'PLANNING';
    }

    function isEmpCompleted(p) {
        return (p.status || '').toUpperCase() === 'COMPLETED';
    }

    // ---- My Tasks ----
    function loadEmpTasks() {
        ensureEmpData(function (employees, projects) {
            var assigned = findAssignedProjects(projects);
            var tasks = assigned.filter(function (p) { return isEmpActive(p) || isEmpOverdue(p); })
                .sort(function (a, b) { return (a.endDate || Infinity) - (b.endDate || Infinity); });
            var dueToday = tasks.filter(function (p) { return empDueText(p.endDate) === 'Due today'; }).length;
            var overdue = tasks.filter(isEmpOverdue).length;
            var completed = assigned.filter(isEmpCompleted).length;

            document.getElementById('empTasksStats').innerHTML =
                empStatCard(tasks.length, 'Total Tasks', 'Assigned work items', 'blue') +
                empStatCard(dueToday, 'Due Today', 'Needs attention now', 'orange') +
                empStatCard(overdue, 'Overdue', 'Follow up required', 'purple') +
                empStatCard(completed, 'Completed', 'Delivered items', 'green');

            var html = '';
            if (tasks.length === 0) {
                html = '<div class="empty-state">No assigned tasks. You are all caught up!</div>';
            } else {
                tasks.forEach(function (p) {
                    var priority = isEmpOverdue(p) ? 'high' : 'medium';
                    var status = (p.status || '').toUpperCase();
                    var sourcePriority = (p.priority || '').toUpperCase();
                    html += '<div class="emp-task-row" data-status="' + esc(status) + '" data-priority="' + esc(sourcePriority) + '">'
                        + '<div class="priority-dot priority-' + priority + '"></div>'
                        + '<div class="emp-task-info"><div class="emp-task-name">' + esc(p.name || 'Untitled') + '</div>'
                        + '<div class="emp-task-meta"><span class="badge badge-muted">' + esc(formatStatus(p.status)) + '</span> '
                        + '<span class="emp-task-due' + (priority === 'high' ? ' urgent' : '') + '">' + empDueText(p.endDate) + '</span></div></div>'
                        + '<span class="emp-task-pct">' + (p.completionPercentage || 0) + '%</span></div>';
                });
            }
            document.getElementById('empTasksList').innerHTML = html;
            applyEmpTasksFilters();
        });
    }

    // ---- My Projects ----
    function loadEmpProjects() {
        ensureEmpData(function (employees, projects) {
            var assigned = findAssignedProjects(projects);
            var active = assigned.filter(isEmpActive).length;
            var completed = assigned.filter(isEmpCompleted).length;

            document.getElementById('empProjectsStats').innerHTML =
                empStatCard(assigned.length, 'Assigned', 'All tracked projects', 'purple') +
                empStatCard(active, 'Active', 'In progress now', 'green') +
                empStatCard(completed, 'Completed', 'Delivered projects', 'blue');

            var html = '';
            if (assigned.length === 0) {
                html = '<div class="empty-state">No assigned projects. Projects will appear here once assigned.</div>';
            } else {
                assigned.forEach(function (p) {
                    var pct = p.completionPercentage || 0;
                    var badge = isEmpCompleted(p) ? 'green' : isEmpOverdue(p) ? 'purple' : 'blue';
                    html += '<div class="emp-project-item" data-status="' + esc((p.status || '').toUpperCase()) + '" data-priority="' + esc((p.priority || '').toUpperCase()) + '" data-department="' + esc(normalizeDepartment(p.department)) + '">'
                        + '<div class="emp-project-header"><span class="emp-project-name">' + esc(p.name || 'Untitled') + '</span>'
                        + '<span class="badge badge-' + badge + '">' + esc(formatStatus(p.status)) + '</span></div>'
                        + '<div class="project-progress"><div class="project-progress-fill" style="width:' + pct + '%"></div></div>'
                        + '<div class="emp-project-meta">'
                        + '<span>Progress: ' + pct + '%</span><span>' + empDueText(p.endDate) + '</span>'
                        + '<span>Priority: ' + esc(p.priority || 'N/A') + '</span></div>'
                        + (p.description ? '<div class="emp-project-desc">' + esc(p.description) + '</div>' : '')
                        + '</div>';
                });
            }
            document.getElementById('empProjectsList').innerHTML = html;
            populateEmpProjectsDeptFilter(assigned);
            applyEmpProjectsFilters();
        });
    }

    // ---- Time Sheet ----
    function loadEmpTimesheet() {
        ensureEmpData(function (employees, projects) {
            var assigned = findAssignedProjects(projects);
            var activeP = assigned.filter(isEmpActive);
            var est = Math.min(40, activeP.length * 8);
            var rem = Math.max(0, 40 - est);

            document.getElementById('empTimesheetStats').innerHTML =
                empStatCard(est + 'h', 'This Week', 'Estimated from active projects', 'green') +
                empStatCard(rem + 'h', 'Remaining', 'Until 40h weekly target', 'blue') +
                empStatCard(activeP.length, 'Entries', 'Project time slots', 'purple');

            var html = '';
            if (activeP.length === 0) {
                html = '<div class="empty-state">No active projects. Time entries will appear when you have active projects.</div>';
            } else {
                activeP.slice(0, 6).forEach(function (p) {
                    html += empInfoRow('Log hours: ' + (p.name || 'Untitled'),
                        'Progress ' + (p.completionPercentage || 0) + '% \u2022 ' + empDueText(p.endDate), 'PROJECT');
                });
            }
            document.getElementById('empTimeEntries').innerHTML = html;

            var pct = Math.round(est / 40 * 100);
            document.getElementById('empWeeklySummary').innerHTML =
                '<div class="progress-bar-container"><div class="progress-bar-track"><div class="progress-bar-fill" style="width:' + pct + '%"></div></div></div>'
                + '<div class="emp-summary-label">' + est + 'h of 40h target (' + pct + '% utilized)</div>';

            document.getElementById('empTimeReminders').innerHTML =
                empInfoRow('Weekly check-in', 'Submit your final timesheet before Friday 6 PM', 'REMINDER')
                + empInfoRow('Time allocation', 'Split hours across projects based on actual effort', 'TIP');
        });
    }

    // ---- Leave Requests ----
    function loadEmpRequests() {
        ensureEmpData(function (employees) {
            var me = findCurrentEmployee(employees);
            var status = me ? (me.status || 'UNKNOWN') : 'UNKNOWN';

            document.getElementById('empRequestsStats').innerHTML =
                empStatCard(status, 'Status', 'Employment availability', 'green') +
                empStatCard('N/A', 'Annual Leave', 'Configured by HR policy', 'blue') +
                empStatCard('0', 'Pending', 'No open leave approvals', 'purple');

            document.getElementById('empLeaveInfo').innerHTML =
                empInfoRow('Request process', 'Contact HR or your manager to file formal leave requests', 'INFO')
                + empInfoRow('Sick leave', 'Notify your manager before start of shift when possible', 'POLICY')
                + empInfoRow('Current status', 'Your recorded status is: ' + status, 'PROFILE');

            document.getElementById('empLeavePolicy').innerHTML =
                empInfoRow('Annual leave', '20 days per year (pro-rated for new joiners)', 'POLICY')
                + empInfoRow('Sick leave', 'Up to 10 days with medical certificate', 'POLICY')
                + empInfoRow('Personal leave', '3 days per year for personal matters', 'POLICY');
        });
    }

    // ---- Documents ----
    function loadEmpDocuments() {
        ensureEmpData(function (employees, projects) {
            var assigned = findAssignedProjects(projects);

            document.getElementById('empDocsStats').innerHTML =
                empStatCard(Math.max(1, assigned.length), 'My Docs', 'Document groups', 'blue') +
                empStatCard('3', 'Policies', 'Core employee policies', 'green') +
                empStatCard('2', 'Templates', 'Reusable reporting templates', 'purple');

            document.getElementById('empCompanyDocs').innerHTML =
                empInfoRow('Employee Handbook', 'Company policy and conduct reference', 'POLICY')
                + empInfoRow('Timesheet Template', 'Weekly template for hour reporting', 'TEMPLATE')
                + empInfoRow('Leave Request Template', 'Request format for manager/HR approval', 'TEMPLATE');

            if (assigned.length === 0) {
                document.getElementById('empProjectDocs').innerHTML = '<div class="empty-state">No project documents</div>';
            } else {
                var html = '';
                assigned.slice(0, 5).forEach(function (p) {
                    html += empInfoRow('Brief: ' + (p.name || 'Untitled'),
                        'Last update ' + formatTimestamp(p.updatedAt), 'PROJECT');
                });
                document.getElementById('empProjectDocs').innerHTML = html;
            }
        });
    }

    // ---- My Team ----
    function loadEmpTeam() {
        ensureEmpData(function (employees, projects) {
            var me = findCurrentEmployee(employees);
            var dept = me ? (me.department || '').toLowerCase() : '';
            var assigned = findAssignedProjects(projects);

            var team = employees.filter(function (e) {
                if ((e.status || '').toUpperCase() !== 'ACTIVE') return false;
                if (me && e.id === me.id) return false;
                if (!dept) return true;
                return (e.department || '').toLowerCase() === dept;
            }).sort(function (a, b) {
                return ((a.fullName || a.firstName || '') + '').localeCompare((b.fullName || b.firstName || '') + '');
            });

            document.getElementById('empTeamStats').innerHTML =
                empStatCard(dept ? dept.toUpperCase() : 'All', 'Department', 'Team scope', 'green') +
                empStatCard(team.length, 'Members', 'Active colleagues', 'blue') +
                empStatCard(assigned.length, 'Shared Projects', 'Projects in your queue', 'purple');

            var html = '';
            if (team.length === 0) {
                html = '<div class="empty-state">No team members found in your department.</div>';
            } else {
                team.slice(0, 12).forEach(function (e) {
                    var name = buildName(e);
                    html += '<div class="emp-team-row" data-department="' + esc(normalizeDepartment(e.department)) + '">'
                        + '<div class="emp-team-avatar">' + initials(name) + '</div>'
                        + '<div class="emp-team-info"><div class="emp-team-name">' + esc(name) + '</div>'
                        + '<div class="emp-team-meta">' + esc(e.position || 'No position') + ' \u2022 ' + esc(e.email || '') + '</div></div>'
                        + '<span class="badge badge-green">' + esc(e.status || 'ACTIVE') + '</span></div>';
                });
            }
            document.getElementById('empTeamList').innerHTML = html;
            populateEmpTeamDeptFilter(team);
            applyEmpTeamFilters();
        });
    }

    // ---- My Profile ----
    function loadEmpProfile() {
        ensureEmpData(function (employees) {
            var me = findCurrentEmployee(employees);

            if (!me) {
                document.getElementById('empProfileStats').innerHTML =
                    empStatCard('Unavailable', 'Profile', 'No employee record matched your account', 'purple');
                document.getElementById('empProfileContent').innerHTML =
                    '<div class="empty-state">Profile not found. Try reloading.</div>';
                return;
            }

            var name = buildName(me);
            document.getElementById('empProfileStats').innerHTML =
                empStatCard(me.department || 'N/A', 'Department', 'Assigned department', 'green') +
                empStatCard(me.position || 'N/A', 'Position', 'Current role', 'blue') +
                empStatCard(me.status || 'N/A', 'Status', 'Employment status', 'purple');

            var statusClass = (me.status || '').toUpperCase() === 'ACTIVE' ? 'badge-green' : 'badge-orange';
            document.getElementById('empProfileContent').innerHTML =
                '<div class="emp-profile-header">'
                + '<div class="emp-profile-avatar">' + initials(name) + '</div>'
                + '<div class="emp-profile-info">'
                + '<div class="emp-profile-name">' + esc(name) + '</div>'
                + '<div class="emp-profile-position">' + esc(me.position || 'N/A') + ' — ' + esc(me.department || 'N/A') + '</div>'
                + '<span class="badge ' + statusClass + '">' + esc(me.status || 'N/A') + '</span>'
                + '</div></div>'
                + '<div class="emp-profile-details">'
                + empProfileRow('Full Name', name)
                + empProfileRow('Email', me.email || 'N/A')
                + empProfileRow('Phone', me.phone || 'N/A')
                + empProfileRow('Employee ID', me.id || 'N/A')
                + empProfileRow('Hire Date', me.hireDate ? formatTimestamp(me.hireDate) : 'N/A')
                + '</div>';
        });
    }

    function empProfileRow(label, value) {
        return '<div class="emp-profile-row"><span class="emp-profile-label">' + esc(label) + '</span>'
            + '<span class="emp-profile-value">' + esc(value) + '</span></div>';
    }

})();
