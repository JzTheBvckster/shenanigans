/* Shenanigans Web — Employee Workspace Logic (employee.js) */
(function (app) {
    'use strict';

    /* ============================================================
       SHARED EMPLOYEE HELPERS
       ============================================================ */
    function ensureEmpData(cb) {
        if (app.cachedData.empEmployees && app.cachedData.empProjects) {
            cb(app.cachedData.empEmployees, app.cachedData.empProjects);
            return;
        }
        var done = { e: null, p: null };
        app.fetchJson('/api/employees', function (data) {
            app.cachedData.empEmployees = data;
            done.e = data;
            if (done.p !== null) cb(done.e, done.p);
        }, function () { app.cachedData.empEmployees = []; done.e = []; if (done.p !== null) cb(done.e, done.p); });
        app.fetchJson('/api/projects', function (data) {
            app.cachedData.empProjects = data;
            done.p = data;
            if (done.e !== null) cb(done.e, done.p);
        }, function () { app.cachedData.empProjects = []; done.p = []; if (done.e !== null) cb(done.e, done.p); });
    }

    function findCurrentEmployee(employees) {
        if (!app.currentUser) return null;
        var uid = (app.currentUser.uid || '').toLowerCase();
        var email = (app.currentUser.email || '').toLowerCase();
        var name = (app.currentUser.displayName || '').toLowerCase();
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
        if (!app.currentUser) return [];
        var uid = (app.currentUser.uid || '').toLowerCase();
        var name = (app.currentUser.displayName || '').toLowerCase();
        return projects.filter(function (p) {
            var teamAssigned = (p.teamMemberIds || []).some(function (id) { return uid && (id || '').toLowerCase() === uid; });
            var mgrAssigned = uid && (p.projectManagerId || '').toLowerCase() === uid;
            var nameAssigned = name && (p.projectManager || '').toLowerCase() === name;
            return teamAssigned || mgrAssigned || nameAssigned;
        });
    }

    function empStatCard(val, label, subtitle, color) {
        return '<div class="stat-card stat-card-' + color + '">'
            + '<div class="stat-number">' + app.esc(String(val)) + '</div>'
            + '<div class="stat-label">' + app.esc(label) + '</div>'
            + '<div class="stat-sub">' + app.esc(subtitle) + '</div></div>';
    }

    function empInfoRow(title, desc, badge) {
        return '<div class="emp-info-row">'
            + '<div class="emp-info-content"><div class="emp-info-title">' + app.esc(title) + '</div>'
            + '<div class="emp-info-desc">' + app.esc(desc) + '</div></div>'
            + '<span class="badge badge-muted">' + app.esc(badge) + '</span></div>';
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

    function empProfileRow(label, value) {
        return '<div class="emp-profile-row"><span class="emp-profile-label">' + app.esc(label) + '</span>'
            + '<span class="emp-profile-value">' + app.esc(value) + '</span></div>';
    }

    /* ============================================================
       MY TASKS
       ============================================================ */
    window.loadEmpTasks = function () {
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
                    html += '<div class="emp-task-row">'
                        + '<div class="priority-dot priority-' + priority + '"></div>'
                        + '<div class="emp-task-info"><div class="emp-task-name">' + app.esc(p.name || 'Untitled') + '</div>'
                        + '<div class="emp-task-meta"><span class="badge badge-muted">' + app.esc(app.formatStatus(p.status)) + '</span> '
                        + '<span class="emp-task-due' + (priority === 'high' ? ' urgent' : '') + '">' + empDueText(p.endDate) + '</span></div></div>'
                        + '<span class="emp-task-pct">' + (p.completionPercentage || 0) + '%</span></div>';
                });
            }
            document.getElementById('empTasksList').innerHTML = html;
        });
    };

    /* ============================================================
       MY PROJECTS
       ============================================================ */
    window.loadEmpProjects = function () {
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
                    html += '<div class="emp-project-item">'
                        + '<div class="emp-project-header"><span class="emp-project-name">' + app.esc(p.name || 'Untitled') + '</span>'
                        + '<span class="badge badge-' + badge + '">' + app.esc(app.formatStatus(p.status)) + '</span></div>'
                        + '<div class="project-progress"><div class="project-progress-fill" style="width:' + pct + '%"></div></div>'
                        + '<div class="emp-project-meta"><span>Progress: ' + pct + '%</span><span>' + empDueText(p.endDate) + '</span>'
                        + '<span>Priority: ' + app.esc(p.priority || 'N/A') + '</span></div>'
                        + (p.description ? '<div class="emp-project-desc">' + app.esc(p.description) + '</div>' : '')
                        + '</div>';
                });
            }
            document.getElementById('empProjectsList').innerHTML = html;
        });
    };

    /* ============================================================
       TIME SHEET (real Firestore data)
       ============================================================ */
    window.loadEmpTimesheet = function () {
        ensureEmpData(function (employees, projects) {
            var assigned = findAssignedProjects(projects);

            // Populate project dropdown
            var sel = document.getElementById('tsProject');
            if (sel) {
                sel.innerHTML = '<option value="">Select project\u2026</option>';
                assigned.filter(isEmpActive).forEach(function (p) {
                    sel.innerHTML += '<option value="' + app.esc(p.id) + '" data-name="' + app.esc(p.name || '') + '">'
                        + app.esc(p.name || 'Untitled') + '</option>';
                });
            }
            // Default date to today
            var tsDate = document.getElementById('tsDate');
            if (tsDate && !tsDate.value) tsDate.value = new Date().toISOString().slice(0, 10);

            // Fetch real timesheet entries
            app.fetchJson('/api/workspace/timesheets', function (entries) {
                app.cachedData.empTimesheets = entries;
                renderTimesheetUI(entries, assigned);
            }, function () {
                renderTimesheetUI([], assigned);
            });
        });

        // Wire up form submit once
        var form = document.getElementById('empTimeEntryForm');
        if (form && !form._wired) {
            form._wired = true;
            form.addEventListener('submit', function (e) {
                e.preventDefault();
                var sel = document.getElementById('tsProject');
                var opt = sel.options[sel.selectedIndex];
                var payload = {
                    projectId: sel.value,
                    projectName: opt ? opt.getAttribute('data-name') : '',
                    date: new Date(document.getElementById('tsDate').value).getTime(),
                    hours: parseFloat(document.getElementById('tsHours').value),
                    description: document.getElementById('tsDesc').value
                };
                app.fetchMutate('POST', '/api/workspace/timesheets', payload, function () {
                    app.showToast('Time entry saved', 'success');
                    form.reset();
                    document.getElementById('tsDate').value = new Date().toISOString().slice(0, 10);
                    document.getElementById('empTimeForm').style.display = 'none';
                    delete app.cachedData.empTimesheets;
                    loadEmpTimesheet();
                }, function (err) { app.showToast(err || 'Failed to save', 'error'); });
            });
        }
    };

    function renderTimesheetUI(entries, assigned) {
        // Week filter: entries from current week (Mon-Sun)
        var now = new Date(); now.setHours(0, 0, 0, 0);
        var dayOfWeek = now.getDay() || 7;
        var weekStart = new Date(now); weekStart.setDate(now.getDate() - dayOfWeek + 1);
        var weekEnd = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 7);

        var weekEntries = entries.filter(function (e) {
            var d = e.date > 1e12 ? e.date : e.date * 1000;
            return d >= weekStart.getTime() && d < weekEnd.getTime();
        });
        var totalHours = weekEntries.reduce(function (s, e) { return s + (e.hours || 0); }, 0);
        var remaining = Math.max(0, 40 - totalHours);

        document.getElementById('empTimesheetStats').innerHTML =
            empStatCard(totalHours.toFixed(1) + 'h', 'This Week', 'Logged from timesheet entries', 'green') +
            empStatCard(remaining.toFixed(1) + 'h', 'Remaining', 'Until 40h weekly target', 'blue') +
            empStatCard(weekEntries.length, 'Entries', 'This week\'s time slots', 'purple');

        // Render entries list (most recent first, max 10)
        var html = '';
        var display = entries.slice(0, 10);
        if (display.length === 0) {
            html = '<div class="empty-state">No time entries yet. Click \u201c+ Log Hours\u201d to get started.</div>';
        } else {
            display.forEach(function (e) {
                var dateStr = app.formatTimestamp(e.date);
                html += '<div class="emp-info-row">'
                    + '<div class="emp-info-content"><div class="emp-info-title">'
                    + app.esc(e.projectName || 'Unknown Project') + ' \u2014 ' + app.esc(e.hours + 'h')
                    + '</div><div class="emp-info-desc">'
                    + app.esc(dateStr) + (e.description ? ' \u2022 ' + app.esc(e.description) : '')
                    + '</div></div>'
                    + '<span class="badge badge-blue">' + app.esc(e.hours + 'h') + '</span></div>';
            });
        }
        document.getElementById('empTimeEntries').innerHTML = html;

        // Weekly summary bar
        var pct = Math.min(100, Math.round(totalHours / 40 * 100));
        document.getElementById('empWeeklySummary').innerHTML =
            '<div class="progress-bar-container"><div class="progress-bar-track"><div class="progress-bar-fill" style="width:' + pct + '%"></div></div></div>'
            + '<div class="emp-summary-label">' + totalHours.toFixed(1) + 'h of 40h target (' + pct + '% utilized)</div>';

        document.getElementById('empTimeReminders').innerHTML =
            empInfoRow('Weekly check-in', 'Submit your final timesheet before Friday 6 PM', 'REMINDER')
            + empInfoRow('Time allocation', 'Split hours across projects based on actual effort', 'TIP');
    }

    /* ============================================================
       LEAVE REQUESTS (real Firestore data)
       ============================================================ */
    window.loadEmpRequests = function () {
        ensureEmpData(function (employees) {
            var me = findCurrentEmployee(employees);
            var status = me ? (me.status || 'UNKNOWN') : 'UNKNOWN';

            // Fetch real leave requests
            app.fetchJson('/api/workspace/leave-requests', function (requests) {
                app.cachedData.empLeaveRequests = requests;
                renderRequestsUI(requests, status);
            }, function () {
                renderRequestsUI([], status);
            });
        });

        // Wire up form submit once
        var form = document.getElementById('empLeaveRequestForm');
        if (form && !form._wired) {
            form._wired = true;
            form.addEventListener('submit', function (e) {
                e.preventDefault();
                var startVal = document.getElementById('lrStart').value;
                var endVal = document.getElementById('lrEnd').value;
                if (new Date(endVal) < new Date(startVal)) {
                    app.showToast('End date must be after start date', 'error');
                    return;
                }
                var payload = {
                    type: document.getElementById('lrType').value,
                    startDate: new Date(startVal).getTime(),
                    endDate: new Date(endVal).getTime(),
                    reason: document.getElementById('lrReason').value
                };
                app.fetchMutate('POST', '/api/workspace/leave-requests', payload, function () {
                    app.showToast('Leave request submitted', 'success');
                    form.reset();
                    document.getElementById('empLeaveForm').style.display = 'none';
                    delete app.cachedData.empLeaveRequests;
                    loadEmpRequests();
                }, function (err) { app.showToast(err || 'Failed to submit', 'error'); });
            });
        }
    };

    function renderRequestsUI(requests, empStatus) {
        var pending = requests.filter(function (r) { return r.status === 'PENDING'; }).length;
        var approved = requests.filter(function (r) { return r.status === 'APPROVED'; }).length;

        document.getElementById('empRequestsStats').innerHTML =
            empStatCard(empStatus, 'Status', 'Employment availability', 'green') +
            empStatCard(approved, 'Approved', 'Approved leave days', 'blue') +
            empStatCard(pending, 'Pending', 'Awaiting manager review', 'purple');

        // Render request list
        var html = '';
        if (requests.length === 0) {
            html = '<div class="empty-state">No leave requests. Click \u201c+ Request Leave\u201d to submit one.</div>';
        } else {
            requests.forEach(function (r) {
                var startStr = app.formatTimestamp(r.startDate);
                var endStr = app.formatTimestamp(r.endDate);
                var badgeClass = r.status === 'APPROVED' ? 'badge-green' : r.status === 'REJECTED' ? 'badge-red' : 'badge-orange';
                html += '<div class="emp-info-row">'
                    + '<div class="emp-info-content"><div class="emp-info-title">'
                    + app.esc(r.type) + ' Leave'
                    + '</div><div class="emp-info-desc">'
                    + app.esc(startStr) + ' \u2013 ' + app.esc(endStr)
                    + (r.reason ? ' \u2022 ' + app.esc(r.reason) : '')
                    + '</div></div>'
                    + '<span class="badge ' + badgeClass + '">' + app.esc(r.status) + '</span></div>';
            });
        }
        document.getElementById('empLeaveInfo').innerHTML = html;

        document.getElementById('empLeavePolicy').innerHTML =
            empInfoRow('Annual leave', '20 days per year (pro-rated for new joiners)', 'POLICY')
            + empInfoRow('Sick leave', 'Up to 10 days with medical certificate', 'POLICY')
            + empInfoRow('Personal leave', '3 days per year for personal matters', 'POLICY');
    }

    /* ============================================================
       DOCUMENTS (real Firestore data)
       ============================================================ */
    window.loadEmpDocuments = function () {
        ensureEmpData(function (employees, projects) {
            var assigned = findAssignedProjects(projects);

            // Fetch real documents
            app.fetchJson('/api/workspace/documents', function (docs) {
                app.cachedData.empDocuments = docs;
                renderDocumentsUI(docs, assigned);
            }, function () {
                renderDocumentsUI([], assigned);
            });
        });
    };

    function renderDocumentsUI(docs, assigned) {
        var policies = docs.filter(function (d) { return d.category === 'POLICY'; });
        var templates = docs.filter(function (d) { return d.category === 'TEMPLATE'; });
        var briefs = docs.filter(function (d) { return d.category === 'PROJECT_BRIEF'; });

        document.getElementById('empDocsStats').innerHTML =
            empStatCard(docs.length, 'Total Docs', 'Available documents', 'blue') +
            empStatCard(policies.length, 'Policies', 'Core employee policies', 'green') +
            empStatCard(templates.length + briefs.length, 'Resources', 'Templates & project briefs', 'purple');

        // Company docs (policies + templates)
        var companyDocs = policies.concat(templates);
        var html = '';
        if (companyDocs.length === 0) {
            html = '<div class="empty-state">No company documents available yet.</div>';
        } else {
            companyDocs.forEach(function (d) {
                html += empInfoRow(d.name || 'Untitled', d.description || 'No description', d.category);
            });
        }
        document.getElementById('empCompanyDocs').innerHTML = html;

        // Project documents (briefs from Firestore + project summary)
        var projHtml = '';
        if (briefs.length === 0 && assigned.length === 0) {
            projHtml = '<div class="empty-state">No project documents</div>';
        } else {
            briefs.forEach(function (d) {
                projHtml += empInfoRow(d.name || 'Untitled', d.description || 'No description', 'BRIEF');
            });
            assigned.slice(0, 5).forEach(function (p) {
                projHtml += empInfoRow('Brief: ' + (p.name || 'Untitled'),
                    'Last update ' + app.formatTimestamp(p.updatedAt), 'PROJECT');
            });
        }
        document.getElementById('empProjectDocs').innerHTML = projHtml;
    }

    /* ============================================================
       MY TEAM
       ============================================================ */
    window.loadEmpTeam = function () {
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
                    var name = app.buildName(e);
                    html += '<div class="emp-team-row">'
                        + '<div class="emp-team-avatar">' + app.initials(name) + '</div>'
                        + '<div class="emp-team-info"><div class="emp-team-name">' + app.esc(name) + '</div>'
                        + '<div class="emp-team-meta">' + app.esc(e.position || 'No position') + ' \u2022 ' + app.esc(e.email || '') + '</div></div>'
                        + '<span class="badge badge-green">' + app.esc(e.status || 'ACTIVE') + '</span></div>';
                });
            }
            document.getElementById('empTeamList').innerHTML = html;
        });
    };

    /* ============================================================
       MY PROFILE
       ============================================================ */
    window.loadEmpProfile = function () {
        ensureEmpData(function (employees) {
            var me = findCurrentEmployee(employees);

            if (!me) {
                document.getElementById('empProfileStats').innerHTML =
                    empStatCard('Unavailable', 'Profile', 'No employee record matched your account', 'purple');
                document.getElementById('empProfileContent').innerHTML =
                    '<div class="empty-state">Profile not found. Try reloading.</div>';
                return;
            }

            var name = app.buildName(me);
            document.getElementById('empProfileStats').innerHTML =
                empStatCard(me.department || 'N/A', 'Department', 'Assigned department', 'green') +
                empStatCard(me.position || 'N/A', 'Position', 'Current role', 'blue') +
                empStatCard(me.status || 'N/A', 'Status', 'Employment status', 'purple');

            var statusClass = (me.status || '').toUpperCase() === 'ACTIVE' ? 'badge-green' : 'badge-orange';
            document.getElementById('empProfileContent').innerHTML =
                '<div class="emp-profile-header">'
                + '<div class="emp-profile-avatar">' + app.initials(name) + '</div>'
                + '<div class="emp-profile-info">'
                + '<div class="emp-profile-name">' + app.esc(name) + '</div>'
                + '<div class="emp-profile-position">' + app.esc(me.position || 'N/A') + ' \u2014 ' + app.esc(me.department || 'N/A') + '</div>'
                + '<span class="badge ' + statusClass + '">' + app.esc(me.status || 'N/A') + '</span>'
                + '</div></div>'
                + '<div class="emp-profile-details">'
                + empProfileRow('Full Name', name)
                + empProfileRow('Email', me.email || 'N/A')
                + empProfileRow('Phone', me.phone || 'N/A')
                + empProfileRow('Employee ID', me.id || 'N/A')
                + empProfileRow('Hire Date', me.hireDate ? app.formatTimestamp(me.hireDate) : 'N/A')
                + '</div>';
        });
    };

})(ShenanigansApp);
