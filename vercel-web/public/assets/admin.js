/* Shenanigans Web — Admin Pages Logic (admin.js) */
(function (app) {
    'use strict';

    /* ============================================================
       DASHBOARD
       ============================================================ */
    window.loadDashboard = function () {
        app.fetchJson('/api/dashboard/summary', function (data) {
            document.getElementById('statEmployees').textContent = data.totalEmployees || 0;
            document.getElementById('statProjects').textContent = data.activeProjects || 0;
            document.getElementById('statInvoices').textContent = data.openInvoices || 0;
            document.getElementById('statRevenue').textContent = '$' + app.formatMoney(data.paidRevenue || 0);

            document.getElementById('insightTotal').textContent = data.totalProjects || 0;
            document.getElementById('insightOverdue').textContent = data.overdueProjects || 0;
            document.getElementById('insightRevenue').textContent = '$' + app.formatMoney(data.paidRevenue || 0);

            var pct = data.totalProjects > 0 ? Math.min(100, Math.round((data.activeProjects / data.totalProjects) * 100)) : 0;
            document.getElementById('budgetPct').textContent = pct + '%';
            document.getElementById('budgetFill').style.width = pct + '%';
        });

        app.fetchJson('/api/projects', function (data) {
            app.cachedData.projects = data;
            renderProjectOverview(data);
            renderRecentActivity(data);
            renderProjectStatusChart(data);
        }, function () {
            document.getElementById('projectOverviewList').innerHTML = '<p style="color:#94a3b8;padding:12px">No project data available.</p>';
            document.getElementById('activityList').innerHTML = '<p style="color:#94a3b8;padding:12px">No activity data.</p>';
        });

        app.fetchJson('/api/finance/invoices', function (data) {
            app.cachedData.invoices = data;
            renderRevenueTrendChart(data);
        });

        loadApprovalQueue();
    };

    function renderProjectOverview(projects) {
        var container = document.getElementById('projectOverviewList');
        if (!container) return;
        if (!projects || projects.length === 0) {
            container.innerHTML = '<p style="color:#94a3b8;padding:12px">No projects found.</p>';
            return;
        }
        var active = projects.filter(isProjectActive).slice(0, 5);
        if (active.length === 0) active = projects.slice(0, 5);

        container.innerHTML = active.map(function (p) {
            var pct = p.completionPercentage || 0;
            return '<div class="project-item">'
                + '<div class="project-item-header"><span class="name">' + app.esc(p.name) + '</span>'
                + '<span class="pct">' + pct + '%</span></div>'
                + '<div class="project-progress"><div class="project-progress-fill" style="width:' + pct + '%"></div></div>'
                + '<div class="project-meta"><span>' + app.esc(p.projectManager || 'Unassigned') + '</span>'
                + '<span>' + app.esc(app.formatStatus(p.status)) + '</span></div></div>';
        }).join('');
    }

    function renderRecentActivity(projects) {
        var container = document.getElementById('activityList');
        if (!container) return;
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
            return '<div class="activity-item"><div class="activity-dot ' + dotColor + '"></div>'
                + '<div class="activity-info"><div class="title">' + app.esc(p.name) + ' was ' + action + '</div>'
                + '<div class="time">' + app.formatTimestamp(ts) + '</div></div></div>';
        }).join('');
    }

    function isProjectActive(p) {
        var s = (p.status || '').toUpperCase();
        return s === 'IN_PROGRESS' || s === 'PLANNING';
    }

    function isProjectOverdue(p) {
        if (!p.endDate) return false;
        var end = typeof p.endDate === 'number' ? p.endDate : new Date(p.endDate).getTime();
        return end < Date.now() && (p.status || '').toUpperCase() !== 'COMPLETED';
    }

    // ---- Approval Queue ----
    function loadApprovalQueue() {
        if (!app.isMD()) return;
        var card = document.getElementById('approvalQueueCard');
        if (card) card.classList.remove('hidden');
        app.fetchJson('/api/employees?pendingUsers=true', function (pendingUsers) {
            var pending = pendingUsers || [];
            var countEl = document.getElementById('approvalQueueCount');
            var listEl = document.getElementById('approvalQueueList');
            if (!card) return;

            countEl.textContent = pending.length;
            if (pending.length > 0) {
                listEl.innerHTML = pending.map(function (e) {
                    var name = app.buildName(e);
                    var eid = app.esc(e.id || '');
                    return '<div class="approval-item"><div class="avatar">' + app.initials(name) + '</div>'
                        + '<div class="info"><div class="name">' + app.esc(name) + '</div>'
                        + '<div class="role">' + app.esc(e.role || e.position || 'Employee') + '</div></div>'
                        + '<div class="approval-actions">'
                        + '<button class="btn-approve" onclick="approveEmployee(\'' + eid + '\')" data-id="' + eid + '">Approve</button>'
                        + '</div></div>';
                }).join('');
            } else {
                listEl.innerHTML = '<p style="color:var(--ink-faint);padding:8px 0">No pending registrations</p>';
            }
        }, function (err) {
            if (card) {
                var listEl = document.getElementById('approvalQueueList');
                if (listEl) listEl.innerHTML = '<p style="color:#ef4444;padding:8px 0">Failed to load: ' + app.esc(err || 'Unknown error') + '</p>';
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
                app.showToast('Employee approved', 'success');
                loadApprovalQueue();
            } else {
                app.showToast(res.error || 'Approval failed', 'error');
                if (btn) { btn.textContent = 'Approve'; btn.disabled = false; }
            }
        }).catch(function () {
            app.showToast('Network error', 'error');
            if (btn) { btn.textContent = 'Approve'; btn.disabled = false; }
        });
    };

    // ---- Charts ----
    var revenueTrendChartInstance = null;
    var projectStatusChartInstance = null;

    function renderRevenueTrendChart(invoices) {
        var canvas = document.getElementById('revenueTrendChart');
        if (!canvas || typeof Chart === 'undefined') return;
        var months = parseInt((document.getElementById('chartRangeFilter') || {}).value) || 6;
        var now = new Date();
        var labels = [], values = [];
        for (var i = months - 1; i >= 0; i--) {
            var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            labels.push(d.toLocaleString('default', { month: 'short', year: '2-digit' }));
            values.push(0);
        }
        (invoices || []).forEach(function (inv) {
            if (!inv.paid || !inv.issuedAt) return;
            var ts = typeof inv.issuedAt === 'number' ? inv.issuedAt : new Date(inv.issuedAt).getTime();
            var id = new Date(ts);
            for (var i = 0; i < months; i++) {
                var ref = new Date(now.getFullYear(), now.getMonth() - (months - 1 - i), 1);
                var nextRef = new Date(ref.getFullYear(), ref.getMonth() + 1, 1);
                if (id >= ref && id < nextRef) { values[i] += (inv.amount || 0); break; }
            }
        });
        if (revenueTrendChartInstance) revenueTrendChartInstance.destroy();
        var isDark = document.documentElement.classList.contains('dark');
        var gridColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.06)';
        var textColor = isDark ? '#cbd5e1' : '#64748b';
        revenueTrendChartInstance = new Chart(canvas.getContext('2d'), {
            type: 'line',
            data: { labels: labels, datasets: [{ label: 'Revenue', data: values, borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.08)', fill: true, tension: 0.35, pointRadius: 4, pointBackgroundColor: '#3b82f6', pointHoverRadius: 6 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, grid: { color: gridColor }, ticks: { color: textColor, callback: function (v) { return '$' + app.formatMoney(v); } } }, x: { grid: { display: false }, ticks: { color: textColor } } } }
        });
    }

    window.updateRevenueTrendChart = function () {
        renderRevenueTrendChart(app.cachedData.invoices || []);
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
        if (labels.length === 0) { labels = ['No Data']; values = [1]; colors = ['#e2e8f0']; }
        if (projectStatusChartInstance) projectStatusChartInstance.destroy();
        var isDark = document.documentElement.classList.contains('dark');
        projectStatusChartInstance = new Chart(canvas.getContext('2d'), {
            type: 'doughnut',
            data: { labels: labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 2, borderColor: isDark ? '#1e293b' : '#ffffff' }] },
            options: { responsive: true, maintainAspectRatio: false, cutout: '60%', plugins: { legend: { position: 'bottom', labels: { color: isDark ? '#cbd5e1' : '#334155', padding: 16, usePointStyle: true } } } }
        });
    }

    /* ============================================================
       EMPLOYEES
       ============================================================ */
    window.loadEmployees = function () {
        app.fetchJson('/api/employees', function (data) {
            app.cachedData.employees = data;
            renderEmployeeKanban(data);
        }, function (err) {
            app.showNotice('employeesNotice', err || 'Failed to load employees.', 'error');
            document.getElementById('employeesDeptGroups').innerHTML = '';
        });
    };

    function renderEmployeeKanban(employees) {
        // Group by department
        var groups = {};
        var noDept = [];
        employees.forEach(function (e) {
            var dept = (e.department || '').trim();
            if (!dept) { noDept.push(e); return; }
            if (!groups[dept]) groups[dept] = [];
            groups[dept].push(e);
        });
        var sortedDepts = Object.keys(groups).sort(function (a, b) { return a.localeCompare(b); });

        // Stats
        var active = employees.filter(function (e) { return (e.status || 'ACTIVE').toUpperCase() === 'ACTIVE'; }).length;
        var deptCount = sortedDepts.length + (noDept.length > 0 ? 1 : 0);
        var statsEl = document.getElementById('employeesDeptStats');
        if (statsEl) {
            statsEl.innerHTML =
                '<div class="stat-card stat-card-blue"><div class="stat-number">' + employees.length + '</div><div class="stat-label">Total</div><div class="stat-sub">All employees</div></div>'
                + '<div class="stat-card stat-card-green"><div class="stat-number">' + active + '</div><div class="stat-label">Active</div><div class="stat-sub">Currently working</div></div>'
                + '<div class="stat-card stat-card-purple"><div class="stat-number">' + deptCount + '</div><div class="stat-label">Departments</div><div class="stat-sub">Org groups</div></div>'
                + (noDept.length > 0 ? '<div class="stat-card stat-card-orange"><div class="stat-number">' + noDept.length + '</div><div class="stat-label">No Dept</div><div class="stat-sub">Need assignment</div></div>' : '');
        }

        var html = '';
        // Unassigned group first (highlighted)
        if (noDept.length > 0) {
            html += renderDeptGroup('Unassigned', noDept, true);
        }
        sortedDepts.forEach(function (dept) {
            html += renderDeptGroup(dept, groups[dept], false);
        });
        if (employees.length === 0) {
            html = '<div class="empty-state">No employees found. Click "+ Add Employee" to get started.</div>';
        }
        document.getElementById('employeesDeptGroups').innerHTML = html;
    }

    function renderDeptGroup(deptName, members, isUnassigned) {
        members.sort(function (a, b) {
            return ((a.fullName || a.firstName || '') + '').localeCompare((b.fullName || b.firstName || '') + '');
        });
        var cls = isUnassigned ? ' dept-group-warning' : '';
        return '<div class="dept-group' + cls + '">'
            + '<div class="dept-group-header">'
            + '<span class="dept-group-name">' + app.esc(deptName) + '</span>'
            + '<span class="dept-group-count">' + members.length + ' employee' + (members.length === 1 ? '' : 's') + '</span></div>'
            + '<div class="dept-group-cards">' + members.map(renderEmployeeCard).join('') + '</div></div>';
    }

    function renderEmployeeCard(e) {
        var name = app.buildName(e);
        var id = app.esc(e.id || '');
        var status = (e.status || 'ACTIVE').toUpperCase();
        var statusClass = 'employee-status-' + status.toLowerCase();
        var hasDept = !!(e.department && e.department.trim());
        return '<div class="employee-card clickable" onclick="openEmployeeModal(\'' + id + '\')">'
            + '<div class="employee-card-top"><div class="employee-avatar">' + app.initials(name) + '</div>'
            + '<div class="employee-card-info"><div class="name">' + app.esc(name) + '</div>'
            + '<div class="position">' + app.esc(e.position || 'No position') + '</div></div></div>'
            + (e.department ? '<div class="employee-card-dept">' + app.esc(e.department) + '</div>' : '<div class="employee-card-dept dept-missing"><button class="btn-set-dept" onclick="event.stopPropagation();openQuickDeptModal(\'' + id + '\',\'' + app.esc(name).replace(/'/g, '') + '\')">+ Set Department</button></div>')
            + (e.email ? '<div class="employee-card-contact">Email: ' + app.esc(e.email) + '</div>' : '')
            + (e.phone ? '<div class="employee-card-phone">Phone: ' + app.esc(e.phone) + '</div>' : '')
            + '<div class="employee-card-meta">'
            + (e.hireDate ? '<span>Hired ' + app.formatTimestamp(e.hireDate) + '</span>' : '<span></span>')
            + '<span class="employee-status-badge ' + statusClass + '">' + app.formatStatus(status) + '</span>'
            + '</div></div>';
    }

    // ---- Employee Modal ----
    window.openEmployeeModal = function (id) {
        app.clearModalNotice('empModalNotice');
        var isEdit = !!id;
        document.getElementById('employeeModalTitle').textContent = isEdit ? 'Edit Employee' : 'Add Employee';
        document.getElementById('empDeleteBtn').classList.toggle('hidden', !isEdit);
        document.getElementById('empDepartment').innerHTML = app.deptOptions('');

        if (isEdit) {
            var emp = findCached('employees', id);
            if (emp) {
                document.getElementById('empId').value = emp.id || '';
                document.getElementById('empFirstName').value = emp.firstName || '';
                document.getElementById('empLastName').value = emp.lastName || '';
                document.getElementById('empEmail').value = emp.email || '';
                document.getElementById('empPhone').value = emp.phone || '';
                document.getElementById('empDepartment').innerHTML = app.deptOptions(emp.department || '');
                document.getElementById('empPosition').value = emp.position || '';
                document.getElementById('empStatus').value = (emp.status || 'ACTIVE').toUpperCase();
                document.getElementById('empSalary').value = emp.salary || '';
                document.getElementById('empHireDate').value = emp.hireDate ? app.toDateInput(emp.hireDate) : '';
            }
        } else {
            ['empId', 'empFirstName', 'empLastName', 'empEmail', 'empPhone', 'empPosition', 'empSalary', 'empHireDate'].forEach(function (fid) {
                document.getElementById(fid).value = '';
            });
            document.getElementById('empDepartment').innerHTML = app.deptOptions('');
            document.getElementById('empStatus').value = 'ACTIVE';
        }
        document.getElementById('employeeModal').classList.remove('hidden');
    };

    window.saveEmployee = function () {
        app.clearModalNotice('empModalNotice');
        var firstName = document.getElementById('empFirstName').value.trim();
        if (!firstName) { app.showModalNotice('empModalNotice', 'First name is required.', 'error'); return; }

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
            hireDate: app.dateInputToMs('empHireDate')
        };

        var isEdit = !!id;
        var url = isEdit ? '/api/employees/' + encodeURIComponent(id) : '/api/employees';
        var method = isEdit ? 'PUT' : 'POST';

        document.getElementById('empSaveBtn').disabled = true;
        app.fetchMutate(method, url, payload, function () {
            document.getElementById('empSaveBtn').disabled = false;
            app.closeModal('employeeModal');
            app.showToast(isEdit ? 'Employee updated' : 'Employee created', 'success');
            loadEmployees();
        }, function (err) {
            document.getElementById('empSaveBtn').disabled = false;
            app.showModalNotice('empModalNotice', err || 'Failed to save employee.', 'error');
        });
    };

    window.deleteEmployee = function () {
        var id = document.getElementById('empId').value;
        if (!id) return;
        app.showConfirm('Delete this employee?', function () {
            app.fetchMutate('DELETE', '/api/employees/' + encodeURIComponent(id), null, function () {
                app.closeModal('employeeModal');
                app.showToast('Employee deleted', 'success');
                loadEmployees();
            }, function (err) {
                app.showModalNotice('empModalNotice', err || 'Failed to delete employee.', 'error');
            });
        });
    };

    /* ============================================================
       PROJECTS
       ============================================================ */
    window.loadProjects = function () {
        app.fetchJson('/api/projects', function (data) {
            app.cachedData.projects = data;
            renderProjectKanban(data);
        }, function (err) {
            app.showNotice('projectsNotice', err || 'Failed to load projects.', 'error');
            clearKanbanSpinners('projectsKanban');
        });
    };

    function renderProjectKanban(projects) {
        var pending = [], newP = [], inProgress = [], completed = [];
        projects.forEach(function (p) {
            var status = (p.status || '').toUpperCase();
            if (status === 'COMPLETED') completed.push(p);
            else if (status === 'IN_PROGRESS') inProgress.push(p);
            else if (status === 'PENDING_APPROVAL') pending.push(p);
            else if (status === 'ARCHIVED') { /* filtered out of active board */ }
            else newP.push(p);
        });
        document.getElementById('countPendingApproval').textContent = pending.length;
        document.getElementById('countNew').textContent = newP.length;
        document.getElementById('countInProgress').textContent = inProgress.length;
        document.getElementById('countCompleted').textContent = completed.length;
        renderCards('cardsPendingApproval', pending, renderProjectCard, 'No pending projects');
        renderCards('cardsNew', newP, renderProjectCard, 'No planning projects');
        renderCards('cardsInProgress', inProgress, renderProjectCard, 'No projects in progress');
        renderCards('cardsCompleted', completed, renderProjectCard, 'No completed projects');
    }

    function renderProjectCard(p) {
        var pct = p.completionPercentage || 0;
        var priorityClass = 'priority-' + (p.priority || 'medium').toLowerCase();
        var id = app.esc(p.id || '');
        var desc = p.description ? (p.description.length > 80 ? p.description.substring(0, 80) + '...' : p.description) : '';
        var dueHtml = '';
        if (p.endDate) {
            var isOverdue = p.endDate < Date.now() && (p.status || '').toUpperCase() !== 'COMPLETED';
            dueHtml = '<div class="card-due' + (isOverdue ? ' overdue' : '') + '">Due ' + app.formatTimestamp(p.endDate) + (isOverdue ? ' (Overdue)' : '') + '</div>';
        }
        return '<div class="project-card clickable" onclick="openProjectModal(\'' + id + '\')">'
            + '<div class="card-name">' + app.esc(p.name || 'Untitled') + '</div>'
            + '<div class="card-manager">' + app.esc(p.projectManager || 'Unassigned') + '</div>'
            + (desc ? '<div class="card-description">' + app.esc(desc) + '</div>' : '')
            + '<span class="card-priority ' + priorityClass + '">' + app.esc(app.formatStatus(p.priority || 'MEDIUM')) + '</span>'
            + dueHtml
            + '<div class="card-progress-row"><div class="card-progress"><div class="card-progress-fill" style="width:' + pct + '%"></div></div>'
            + '<span>' + pct + '%</span></div></div>';
    }

    // ---- Project Modal ----
    window.openProjectModal = function (id) {
        app.clearModalNotice('projModalNotice');
        var isEdit = !!id;
        document.getElementById('projectModalTitle').textContent = isEdit ? 'Edit Project' : 'Add Project';
        document.getElementById('projDeleteBtn').classList.toggle('hidden', !isEdit);
        // Archive button: show only for COMPLETED projects
        var archiveBtn = document.getElementById('projArchiveBtn');

        // Populate department select
        var deptSel = document.getElementById('projDepartment');

        // Populate project manager select
        var mgrSel = document.getElementById('projManager');
        function populatePMSelect(selectedVal) {
            mgrSel.innerHTML = '<option value="">Unassigned</option>';
            app.fetchJson('/api/employees?projectManagers=true', function (pms) {
                (pms || []).forEach(function (pm) {
                    var name = pm.displayName || pm.email || 'Unknown';
                    var opt = document.createElement('option');
                    opt.value = name;
                    opt.setAttribute('data-id', pm.id || '');
                    opt.textContent = name;
                    if (name === selectedVal) opt.selected = true;
                    mgrSel.appendChild(opt);
                });
            }, function () {});
        }

        if (isEdit) {
            var proj = findCached('projects', id);
            if (proj) {
                if (archiveBtn) archiveBtn.classList.toggle('hidden', (proj.status || '').toUpperCase() !== 'COMPLETED');
                document.getElementById('projId').value = proj.id || '';
                document.getElementById('projName').value = proj.name || '';
                document.getElementById('projDescription').value = proj.description || '';
                deptSel.innerHTML = app.deptOptions(proj.department || '');
                populatePMSelect(proj.projectManager || '');
                document.getElementById('projStatus').value = (proj.status || 'PLANNING').toUpperCase();
                document.getElementById('projPriority').value = (proj.priority || 'MEDIUM').toUpperCase();
                document.getElementById('projBudget').value = proj.budget || '';
                document.getElementById('projSpent').value = proj.spent || '';
                document.getElementById('projCompletion').value = proj.completionPercentage || 0;
                document.getElementById('projStartDate').value = proj.startDate ? app.toDateInput(proj.startDate) : '';
                document.getElementById('projEndDate').value = proj.endDate ? app.toDateInput(proj.endDate) : '';
            }
        } else {
            if (archiveBtn) archiveBtn.classList.add('hidden');
            ['projId', 'projName', 'projDescription', 'projBudget', 'projSpent', 'projStartDate', 'projEndDate'].forEach(function (fid) {
                document.getElementById(fid).value = '';
            });
            deptSel.innerHTML = app.deptOptions('');
            populatePMSelect('');
            document.getElementById('projStatus').value = 'PENDING_APPROVAL';
            document.getElementById('projPriority').value = 'MEDIUM';
            document.getElementById('projCompletion').value = '0';
        }
        document.getElementById('projectModal').classList.remove('hidden');
    };

    window.saveProject = function () {
        app.clearModalNotice('projModalNotice');
        var name = document.getElementById('projName').value.trim();
        if (!name) { app.showModalNotice('projModalNotice', 'Project name is required.', 'error'); return; }

        var id = document.getElementById('projId').value;
        var mgrSel = document.getElementById('projManager');
        var mgrOpt = mgrSel.options[mgrSel.selectedIndex];
        var payload = {
            name: name,
            description: document.getElementById('projDescription').value.trim(),
            projectManager: mgrSel.value || '',
            projectManagerId: mgrOpt ? (mgrOpt.getAttribute('data-id') || '') : '',
            department: document.getElementById('projDepartment').value,
            status: document.getElementById('projStatus').value,
            priority: document.getElementById('projPriority').value,
            budget: parseFloat(document.getElementById('projBudget').value) || 0,
            spent: parseFloat(document.getElementById('projSpent').value) || 0,
            completionPercentage: parseInt(document.getElementById('projCompletion').value, 10) || 0,
            startDate: app.dateInputToMs('projStartDate'),
            endDate: app.dateInputToMs('projEndDate')
        };

        var isEdit = !!id;
        var url = isEdit ? '/api/projects/' + encodeURIComponent(id) : '/api/projects';
        var method = isEdit ? 'PUT' : 'POST';

        document.getElementById('projSaveBtn').disabled = true;
        app.fetchMutate(method, url, payload, function () {
            document.getElementById('projSaveBtn').disabled = false;
            app.closeModal('projectModal');
            app.showToast(isEdit ? 'Project updated' : 'Project created', 'success');
            // Activity log
            adminLogActivity(isEdit ? 'UPDATE' : 'CREATE', 'project', id || '', payload.name, '', isEdit ? 'Project updated' : 'Project created: ' + payload.name);
            loadProjects();
        }, function (err) {
            document.getElementById('projSaveBtn').disabled = false;
            app.showModalNotice('projModalNotice', err || 'Failed to save project.', 'error');
        });
    };

    function adminLogActivity(action, entityType, entityId, entityName, projectId, details) {
        app.fetchMutate('POST', '/api/workspace/activity-logs', {
            action: action, entityType: entityType, entityId: entityId || '',
            entityName: entityName || '', projectId: projectId || entityId || '', details: details || ''
        }, function () {}, function () {});
    }

    window.deleteProject = function () {
        var id = document.getElementById('projId').value;
        if (!id) return;
        app.showConfirm('Delete this project?', function () {
            app.fetchMutate('DELETE', '/api/projects/' + encodeURIComponent(id), null, function () {
                app.closeModal('projectModal');
                app.showToast('Project deleted', 'success');
                loadProjects();
            }, function (err) {
                app.showModalNotice('projModalNotice', err || 'Failed to delete project.', 'error');
            });
        });
    };

    /* ============================================================
       FINANCE
       ============================================================ */
    window.loadFinance = function () {
        app.fetchJson('/api/finance/invoices', function (data) {
            app.cachedData.invoices = data;
            renderInvoiceKanban(data);
        }, function (err) {
            app.showNotice('financeNotice', err || 'Failed to load invoices.', 'error');
            clearKanbanSpinners('financeKanban');
        });
    };

    function renderInvoiceKanban(invoices) {
        var due = [], paid = [];
        invoices.forEach(function (inv) {
            if (inv.paid) paid.push(inv); else due.push(inv);
        });
        document.getElementById('countDue').textContent = due.length;
        document.getElementById('countPaid').textContent = paid.length;
        renderCards('cardsDue', due, renderInvoiceCard, 'No outstanding invoices');
        renderCards('cardsPaid', paid, renderInvoiceCard, 'No paid invoices');
    }

    function renderInvoiceCard(inv) {
        var statusClass = inv.paid ? 'invoice-status-paid' : 'invoice-status-outstanding';
        var statusText = inv.paid ? 'Paid' : 'Outstanding';
        var id = app.esc(inv.id || '');
        var toggleClass = inv.paid ? 'mark-unpaid' : 'mark-paid';
        var toggleLabel = inv.paid ? 'Mark Unpaid' : 'Mark Paid';
        return '<div class="invoice-card clickable" onclick="openInvoiceModal(\'' + id + '\')">'
            + '<div class="invoice-id">' + app.esc(inv.id || '\u2014') + '</div>'
            + '<div class="invoice-client">' + app.esc(inv.client || 'Unknown client') + '</div>'
            + '<div class="invoice-amount">$' + app.formatMoney(inv.amount || 0) + '</div>'
            + '<span class="invoice-status-badge ' + statusClass + '">' + statusText + '</span>'
            + (inv.issuedAt ? '<div class="invoice-date">' + app.formatTimestamp(inv.issuedAt) + '</div>' : '')
            + '<button class="invoice-toggle-btn ' + toggleClass + '" onclick="event.stopPropagation();toggleInvoicePaid(\'' + id + '\')">' + toggleLabel + '</button>'
            + '</div>';
    }

    window.openInvoiceModal = function (id) {
        app.clearModalNotice('invModalNotice');
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
            ['invId', 'invClient', 'invAmount', 'invProjectId'].forEach(function (fid) {
                document.getElementById(fid).value = '';
            });
            document.getElementById('invPaid').value = 'false';
        }
        document.getElementById('invoiceModal').classList.remove('hidden');
    };

    window.saveInvoice = function () {
        app.clearModalNotice('invModalNotice');
        var client = document.getElementById('invClient').value.trim();
        var amount = parseFloat(document.getElementById('invAmount').value);
        if (!client) { app.showModalNotice('invModalNotice', 'Client name is required.', 'error'); return; }
        if (isNaN(amount) || amount <= 0) { app.showModalNotice('invModalNotice', 'A valid amount is required.', 'error'); return; }

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
        app.fetchMutate(method, url, payload, function () {
            document.getElementById('invSaveBtn').disabled = false;
            app.closeModal('invoiceModal');
            app.showToast(isEdit ? 'Invoice updated' : 'Invoice created', 'success');
            loadFinance();
        }, function (err) {
            document.getElementById('invSaveBtn').disabled = false;
            app.showModalNotice('invModalNotice', err || 'Failed to save invoice.', 'error');
        });
    };

    window.deleteInvoice = function () {
        var id = document.getElementById('invId').value;
        if (!id) return;
        app.showConfirm('Delete this invoice?', function () {
            app.fetchMutate('DELETE', '/api/finance/invoices/' + encodeURIComponent(id), null, function () {
                app.closeModal('invoiceModal');
                app.showToast('Invoice deleted', 'success');
                loadFinance();
            }, function (err) {
                app.showModalNotice('invModalNotice', err || 'Failed to delete invoice.', 'error');
            });
        });
    };

    window.toggleInvoicePaid = function (id) {
        var inv = findCached('invoices', id);
        if (!inv) return;
        var payload = { client: inv.client, amount: inv.amount, paid: !inv.paid, projectId: inv.projectId || '' };
        app.fetchMutate('PUT', '/api/finance/invoices/' + encodeURIComponent(id), payload, function () {
            app.showToast(payload.paid ? 'Invoice marked as paid' : 'Invoice marked as outstanding', 'success');
            loadFinance();
        }, function (err) {
            app.showToast(err || 'Failed to update invoice', 'error');
        });
    };

    window.exportInvoicesCSV = function () {
        var invoices = app.cachedData.invoices;
        if (!invoices || invoices.length === 0) { app.showToast('No invoices to export', 'error'); return; }
        var csv = 'ID,Client,Amount,Paid,Issued At\n';
        invoices.forEach(function (inv) {
            var client = (inv.client || '').replace(/"/g, '""');
            csv += '"' + (inv.id || '') + '","' + client + '",' + (inv.amount || 0) + ',' + (inv.paid ? 'Yes' : 'No') + ',"' + app.formatTimestamp(inv.issuedAt) + '"\n';
        });
        var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        var link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = 'invoices_' + new Date().toISOString().split('T')[0] + '.csv';
        link.click();
        URL.revokeObjectURL(link.href);
        app.showToast('Invoices exported', 'success');
    };

    /* ============================================================
       SETTINGS
       ============================================================ */
    window.applySettingsInfo = function () {
        if (!app.currentUser) return;
        var name = app.currentUser.displayName || app.currentUser.email || 'User';
        var el;
        el = document.getElementById('settingsName');
        if (el) el.textContent = name;
        el = document.getElementById('settingsEmail');
        if (el) el.textContent = app.currentUser.email || '\u2014';
        el = document.getElementById('settingsRole');
        if (el) el.textContent = app.formatRole(app.currentUser.role);

        var approval = document.getElementById('settingsApproval');
        if (approval) {
            var isApproved = app.currentUser.mdApproved !== false;
            approval.innerHTML = isApproved
                ? '<span class="approval-badge approved">Approved</span>'
                : '<span class="approval-badge pending">Pending approval</span>';
        }
        var sidebarCheck = document.getElementById('settingSidebarExpanded');
        if (sidebarCheck) {
            sidebarCheck.checked = localStorage.getItem('sidebarCollapsed') !== 'true';
        }
    };

    window.saveSettings = function () {
        var sidebarCheckbox = document.getElementById('settingSidebarExpanded');
        if (sidebarCheckbox) {
            if (sidebarCheckbox.checked) {
                localStorage.removeItem('sidebarCollapsed');
                document.getElementById('appShell').classList.remove('sidebar-collapsed');
            } else {
                localStorage.setItem('sidebarCollapsed', 'true');
                document.getElementById('appShell').classList.add('sidebar-collapsed');
            }
        }
        document.getElementById('saveStatus').textContent = 'Settings saved.';
        app.showToast('Settings saved', 'success');
        setTimeout(function () { document.getElementById('saveStatus').textContent = ''; }, 2000);
    };

    /* ============================================================
       SEARCH FILTER
       ============================================================ */
    window.setupSearchFilter = function (filterFn) {
        var input = document.getElementById('headerSearchInput');
        if (input) {
            input.addEventListener('input', function () { filterFn(this.value.toLowerCase().trim()); });
        }
    };

    window.filterEmployeeCards = function (query) {
        document.querySelectorAll('#employeesDeptGroups .employee-card').forEach(function (card) {
            card.style.display = card.textContent.toLowerCase().includes(query) ? '' : 'none';
        });
        // Hide entire dept groups if all cards hidden
        document.querySelectorAll('#employeesDeptGroups .dept-group').forEach(function (group) {
            var visible = group.querySelectorAll('.employee-card:not([style*="display: none"])');
            group.style.display = visible.length > 0 ? '' : 'none';
        });
    };

    window.filterProjectCards = function (query) {
        document.querySelectorAll('#projectsKanban .project-card').forEach(function (card) {
            card.style.display = card.textContent.toLowerCase().includes(query) ? '' : 'none';
        });
    };

    window.filterUserCards = function (query) {
        document.querySelectorAll('#allUsersList .user-row').forEach(function (row) {
            row.style.display = row.textContent.toLowerCase().includes(query) ? '' : 'none';
        });
        document.querySelectorAll('#pendingUsersList .user-row').forEach(function (row) {
            row.style.display = row.textContent.toLowerCase().includes(query) ? '' : 'none';
        });
    };

    /* ============================================================
       USER MANAGEMENT (MD only)
       ============================================================ */
    var allUsersCache = [];

    window.loadUserManagement = function () {
        if (!app.isMD()) {
            app.showNotice('usersNotice', 'Access restricted to Managing Directors.', 'error');
            return;
        }
        var pendingDone = false, allDone = false;
        var pendingData = [], allData = [];

        app.fetchJson('/api/employees?pendingUsers=true', function (data) {
            pendingData = data || [];
            pendingDone = true;
            if (allDone) renderUserManagement(pendingData, allData);
        }, function () { pendingData = []; pendingDone = true; if (allDone) renderUserManagement(pendingData, allData); });

        app.fetchJson('/api/employees?allUsers=true', function (data) {
            allData = data || [];
            allUsersCache = allData;
            allDone = true;
            if (pendingDone) renderUserManagement(pendingData, allData);
        }, function () { allData = []; allUsersCache = []; allDone = true; if (pendingDone) renderUserManagement(pendingData, allData); });
    };

    function renderUserManagement(pending, allUsers) {
        var approved = allUsers.filter(function (u) { return u.mdApproved === true; }).length;
        var statsEl = document.getElementById('userStats');
        if (statsEl) {
            statsEl.innerHTML =
                '<div class="stat-card stat-card-blue"><div class="stat-number">' + allUsers.length + '</div><div class="stat-label">Total Users</div><div class="stat-sub">All registered accounts</div></div>'
                + '<div class="stat-card stat-card-orange"><div class="stat-number">' + pending.length + '</div><div class="stat-label">Pending</div><div class="stat-sub">Awaiting approval</div></div>'
                + '<div class="stat-card stat-card-green"><div class="stat-number">' + approved + '</div><div class="stat-label">Approved</div><div class="stat-sub">Active users</div></div>';
        }

        // Pending approvals
        var pendingEl = document.getElementById('pendingUsersList');
        if (pendingEl) {
            if (pending.length === 0) {
                pendingEl.innerHTML = '<div class="empty-state">No pending registrations.</div>';
            } else {
                pendingEl.innerHTML = pending.map(function (u) {
                    var name = app.buildName(u);
                    var uid = app.esc(u.id || '');
                    return '<div class="user-row">'
                        + '<div class="user-row-avatar">' + app.initials(name) + '</div>'
                        + '<div class="user-row-info"><div class="user-row-name">' + app.esc(name) + '</div>'
                        + '<div class="user-row-email">' + app.esc(u.email || '') + '</div></div>'
                        + '<span class="badge badge-muted">' + app.esc(app.formatRole(u.role)) + '</span>'
                        + '<div class="user-row-actions">'
                        + '<button class="btn-approve-sm" onclick="approveUserFromManagement(\'' + uid + '\')">Approve</button>'
                        + '</div></div>';
                }).join('');
            }
        }

        // All users
        var allEl = document.getElementById('allUsersList');
        if (allEl) {
            if (allUsers.length === 0) {
                allEl.innerHTML = '<div class="empty-state">No registered users.</div>';
            } else {
                allEl.innerHTML = allUsers.map(function (u) {
                    var name = app.buildName(u);
                    var uid = app.esc(u.id || '');
                    var roleClass = u.role === 'MANAGING_DIRECTOR' ? 'badge-blue' : u.role === 'PROJECT_MANAGER' ? 'badge-orange' : 'badge-green';
                    var approvedBadge = u.mdApproved === true ? '<span class="badge badge-green">Approved</span>' : '<span class="badge badge-muted">Not Approved</span>';
                    return '<div class="user-row">'
                        + '<div class="user-row-avatar">' + app.initials(name) + '</div>'
                        + '<div class="user-row-info"><div class="user-row-name">' + app.esc(name) + '</div>'
                        + '<div class="user-row-email">' + app.esc(u.email || '') + '</div></div>'
                        + '<span class="badge ' + roleClass + '">' + app.esc(app.formatRole(u.role)) + '</span>'
                        + approvedBadge
                        + '<button class="btn-edit-sm" onclick="openUserRoleModal(\'' + uid + '\')">Edit Role</button>'
                        + '</div>';
                }).join('');
            }
        }
    }

    window.approveUserFromManagement = function (id) {
        if (!id) return;
        app.fetchMutate('PUT', '/api/employees/' + encodeURIComponent(id) + '?approveUser=true', {}, function () {
            app.showToast('User approved', 'success');
            loadUserManagement();
        }, function (err) {
            app.showToast(err || 'Approval failed', 'error');
        });
    };

    window.openUserRoleModal = function (id) {
        app.clearModalNotice('userRoleModalNotice');
        var user = null;
        for (var i = 0; i < allUsersCache.length; i++) {
            if (allUsersCache[i].id === id) { user = allUsersCache[i]; break; }
        }
        if (!user) { app.showToast('User not found', 'error'); return; }
        document.getElementById('editUserId').value = user.id;
        document.getElementById('editUserName').value = app.buildName(user);
        document.getElementById('editUserEmail').value = user.email || '';
        document.getElementById('editUserRole').value = user.role || 'EMPLOYEE';
        document.getElementById('userRoleModal').classList.remove('hidden');
    };

    window.saveUserRole = function () {
        var id = document.getElementById('editUserId').value;
        var role = document.getElementById('editUserRole').value;
        if (!id || !role) return;
        var btn = document.getElementById('userRoleSaveBtn');
        if (btn) btn.disabled = true;
        app.fetchMutate('PUT', '/api/employees/' + encodeURIComponent(id) + '?updateRole=true', { role: role }, function () {
            if (btn) btn.disabled = false;
            app.closeModal('userRoleModal');
            app.showToast('Role updated', 'success');
            loadUserManagement();
        }, function (err) {
            if (btn) btn.disabled = false;
            app.showModalNotice('userRoleModalNotice', err || 'Failed to update role.', 'error');
        });
    };

    /* ============================================================
       REPORTS & ACTIVITY
       ============================================================ */
    var activityLogsCache = [];

    window.loadReports = function () {
        // Load project data for report
        app.fetchJson('/api/projects', function (projects) {
            var active = projects.filter(function (p) { return p.status === 'IN_PROGRESS'; }).length;
            var totalBudget = projects.reduce(function (s, p) { return s + (p.budget || 0); }, 0);
            var totalSpent = projects.reduce(function (s, p) { return s + (p.spent || 0); }, 0);
            var completed = projects.filter(function (p) { return p.status === 'COMPLETED'; }).length;

            var statsEl = document.getElementById('reportStats');
            if (statsEl) {
                statsEl.innerHTML =
                    '<div class="stat-card stat-card-blue"><div class="stat-number">' + projects.length + '</div><div class="stat-label">Total Projects</div></div>'
                    + '<div class="stat-card stat-card-green"><div class="stat-number">' + active + '</div><div class="stat-label">Active</div></div>'
                    + '<div class="stat-card stat-card-purple"><div class="stat-number">' + completed + '</div><div class="stat-label">Completed</div></div>'
                    + '<div class="stat-card stat-card-orange"><div class="stat-number">$' + totalBudget.toLocaleString() + '</div><div class="stat-label">Total Budget</div></div>';
            }

            var tbody = document.getElementById('projectReportBody');
            if (tbody) {
                if (projects.length === 0) {
                    tbody.innerHTML = '<tr><td colspan="8">No projects found.</td></tr>';
                } else {
                    tbody.innerHTML = projects.filter(function (p) { return p.status !== 'ARCHIVED'; }).map(function (p) {
                        var pct = p.completionPercentage || 0;
                        var deadline = p.endDate ? app.formatTimestamp(p.endDate) : '-';
                        var isOverdue = p.endDate && p.endDate < Date.now() && p.status !== 'COMPLETED';
                        return '<tr' + (isOverdue ? ' class="row-overdue"' : '') + '>'
                            + '<td>' + app.esc(p.name || 'Untitled') + '</td>'
                            + '<td><span class="badge badge-muted">' + app.esc(app.formatStatus(p.status || '')) + '</span></td>'
                            + '<td>' + app.esc(p.projectManager || '-') + '</td>'
                            + '<td><div class="card-progress"><div class="card-progress-fill" style="width:' + pct + '%"></div></div> ' + pct + '%</td>'
                            + '<td>$' + (p.budget || 0).toLocaleString() + '</td>'
                            + '<td>$' + (p.spent || 0).toLocaleString() + '</td>'
                            + '<td>' + ((p.teamMemberIds || []).length) + '</td>'
                            + '<td class="' + (isOverdue ? 'overdue' : '') + '">' + deadline + '</td></tr>';
                    }).join('');
                }
            }
        });

        // Load activity logs
        app.fetchJson('/api/workspace/activity-logs?limit=100', function (logs) {
            activityLogsCache = logs || [];
            renderActivityLogs(activityLogsCache);
        }, function () {
            document.getElementById('activityLogList').innerHTML = '<div class="empty-state">Could not load activity logs.</div>';
        });
    };

    function renderActivityLogs(logs) {
        var el = document.getElementById('activityLogList');
        if (!el) return;
        if (!logs || logs.length === 0) {
            el.innerHTML = '<div class="empty-state">No activity logged yet.</div>';
            return;
        }
        el.innerHTML = logs.map(function (l) {
            var iconMap = { CREATE: '+', UPDATE: '~', DELETE: 'x', COMMENT: '"', SUBMIT_REVIEW: '✓', STATUS_CHANGE: '→' };
            var icon = iconMap[l.action] || '•';
            var time = l.createdAt ? app.formatTimestamp(l.createdAt) : '';
            return '<div class="activity-log-item">'
                + '<span class="activity-icon">' + icon + '</span>'
                + '<div class="activity-info">'
                + '<span class="activity-text"><strong>' + app.esc(l.userName || 'Unknown') + '</strong> '
                + app.esc(l.details || l.action || '') + '</span>'
                + '<span class="activity-meta">' + app.esc((l.entityType || '').replace(/_/g, ' ')) + ' &middot; ' + time + '</span>'
                + '</div></div>';
        }).join('');
    }

    window.filterActivityLogs = function () {
        var filter = (document.getElementById('activityFilter') || {}).value || '';
        if (!filter) { renderActivityLogs(activityLogsCache); return; }
        var filtered = activityLogsCache.filter(function (l) { return l.entityType === filter; });
        renderActivityLogs(filtered);
    };

    /* ============================================================
       ARCHIVE
       ============================================================ */
    window.archiveProject = function () {
        var id = document.getElementById('projId').value;
        if (!id) return;
        if (!confirm('Archive this project? It will be removed from the active board.')) return;
        app.fetchMutate('PUT', '/api/projects/' + encodeURIComponent(id), { status: 'ARCHIVED' }, function () {
            app.closeModal('projectModal');
            app.showToast('Project archived', 'success');
            adminLogActivity('ARCHIVE', 'project', id, '', '', 'Project archived');
            loadProjects();
        }, function (err) {
            app.showModalNotice('projModalNotice', err || 'Failed to archive.', 'error');
        });
    };

    window.toggleArchivedProjects = function () {
        var list = document.getElementById('archivedProjectsList');
        if (!list) return;
        var isHidden = list.classList.toggle('hidden');
        var btn = list.previousElementSibling;
        if (btn && btn.tagName === 'BUTTON') btn.textContent = isHidden ? 'Show Archived Projects' : 'Hide Archived Projects';
        if (!isHidden) renderArchivedProjects();
    };

    function renderArchivedProjects() {
        var list = document.getElementById('archivedProjectsList');
        var countEl = document.getElementById('archivedCount');
        if (!list) return;
        var projects = app.cachedData.projects || [];
        var archived = projects.filter(function (p) { return (p.status || '').toUpperCase() === 'ARCHIVED'; });
        if (countEl) countEl.textContent = archived.length;
        if (archived.length === 0) {
            list.innerHTML = '<p class="kanban-empty"><span class="msg">No archived projects.</span></p>';
            return;
        }
        list.innerHTML = archived.map(function (p) {
            return '<div class="project-card archived-card" onclick="openProjectModal(\'' + app.esc(p.id) + '\')">'
                + '<div class="card-title">' + app.esc(p.name) + '</div>'
                + '<div class="card-meta">' + app.esc(p.department || 'No dept') + '</div>'
                + '</div>';
        }).join('');
    }

    /* ============================================================
       GENERIC HELPERS
       ============================================================ */
    function findCached(collection, id) {
        var list = app.cachedData[collection];
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
            container.innerHTML = '<div class="kanban-empty"><div class="msg">' + app.esc(emptyMsg) + '</div></div>';
            return;
        }
        container.innerHTML = items.map(renderFn).join('');
    }

    function clearKanbanSpinners(boardId) {
        var board = document.getElementById(boardId);
        if (!board) return;
        board.querySelectorAll('.loading-spinner').forEach(function (s) { s.classList.remove('visible'); });
    }

})(ShenanigansApp);
