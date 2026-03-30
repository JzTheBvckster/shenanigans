/* Shenanigans Web — Project Manager Workspace Logic (pm.js) */
(function (app) {
  "use strict";

  /* ============================================================
       SHARED PM HELPERS
       ============================================================ */
  function ensurePMData(cb) {
    if (app.cachedData.pmEmployees && app.cachedData.pmProjects) {
      cb(app.cachedData.pmEmployees, app.cachedData.pmProjects);
      return;
    }
    var done = { e: null, p: null };
    app.fetchJson(
      "/api/employees",
      function (data) {
        app.cachedData.pmEmployees = data;
        done.e = data;
        if (done.p !== null) cb(done.e, done.p);
      },
      function () {
        app.cachedData.pmEmployees = [];
        done.e = [];
        if (done.p !== null) cb(done.e, done.p);
      },
    );
    app.fetchJson(
      "/api/projects",
      function (data) {
        app.cachedData.pmProjects = data;
        done.p = data;
        if (done.e !== null) cb(done.e, done.p);
      },
      function () {
        app.cachedData.pmProjects = [];
        done.p = [];
        if (done.e !== null) cb(done.e, done.p);
      },
    );
  }

  function normalizeKey(value) {
    return String(value || "")
      .trim()
      .toLowerCase();
  }

  function getEmployeeIdentityKeys(employee) {
    var keys = {};
    [
      employee && employee.id,
      employee && employee.uid,
      employee && employee.userId,
      employee && employee.email,
      employee && employee.fullName,
      employee && employee.displayName,
      app.buildName(employee || {}),
    ].forEach(function (v) {
      var k = normalizeKey(v);
      if (k) keys[k] = true;
    });
    return keys;
  }

  function isSameDepartmentAsCurrentPM(employee) {
    var pmDepartment = normalizeKey(
      app.currentUser && app.currentUser.department,
    );
    if (!pmDepartment) return true;
    return normalizeKey(employee && employee.department) === pmDepartment;
  }

  function findManagedProjects(projects) {
    if (!app.currentUser) return [];
    var uid = normalizeKey(app.currentUser.uid);
    var name = normalizeKey(app.currentUser.displayName);
    var email = normalizeKey(app.currentUser.email);
    return projects.filter(function (p) {
      var managerId = normalizeKey(p.projectManagerId);
      var managerName = normalizeKey(p.projectManager);
      var createdById = normalizeKey(p.createdById);
      var mgrAssigned = uid && managerId === uid;
      var nameAssigned = name && managerName === name;
      var emailAssigned = email && managerName === email;
      var creatorAssigned = uid && createdById === uid;
      return mgrAssigned || nameAssigned || emailAssigned || creatorAssigned;
    });
  }

  function findTeamMemberIds(projects) {
    var ids = {};
    projects.forEach(function (p) {
      (p.teamMemberIds || []).forEach(function (id) {
        if (id) ids[id] = true;
      });
    });
    return Object.keys(ids);
  }

  function findTeamMembers(employees, projects) {
    return (Array.isArray(employees) ? employees : []).filter(
      isSameDepartmentAsCurrentPM,
    );
  }

  function findEmployeesAssignedToProjects(employees, projects) {
    var safeEmployees = Array.isArray(employees) ? employees : [];
    var safeProjects = Array.isArray(projects) ? projects : [];
    if (!safeEmployees.length || !safeProjects.length) return [];

    var memberIds = new Set(
      findTeamMemberIds(safeProjects).map(normalizeKey).filter(Boolean),
    );
    var memberNames = new Set();
    safeProjects.forEach(function (p) {
      (p.teamMemberNames || []).forEach(function (name) {
        var key = normalizeKey(name);
        if (key) memberNames.add(key);
      });
    });

    return safeEmployees.filter(function (e) {
      if (!isSameDepartmentAsCurrentPM(e)) return false;
      var keys = getEmployeeIdentityKeys(e);
      return Object.keys(keys).some(function (key) {
        return memberIds.has(key) || memberNames.has(key);
      });
    });
  }

  function findProjectTeamMembers(employees, project) {
    if (!project) return [];
    return findEmployeesAssignedToProjects(employees || [], [project]);
  }

  function renderProjectTeamBlock(teamMembers) {
    if (!teamMembers || teamMembers.length === 0) {
      return '<div class="detail-row full-width"><span class="detail-label">Team Members</span><p>No team members assigned.</p></div>';
    }
    return (
      '<div class="detail-row full-width"><span class="detail-label">Team Members</span><div class="milestone-meta">' +
      teamMembers
        .map(function (member) {
          var name = app.buildName(member);
          var role = member.position || "Employee";
          return (
            '<span class="badge badge-muted">' +
            app.esc(name) +
            " • " +
            app.esc(role) +
            "</span>"
          );
        })
        .join("") +
      "</div></div>"
    );
  }

  function pmStatCard(val, label, subtitle, color) {
    return (
      '<div class="stat-card stat-card-' +
      color +
      '">' +
      '<div class="stat-number">' +
      app.esc(String(val)) +
      "</div>" +
      '<div class="stat-label">' +
      app.esc(label) +
      "</div>" +
      '<div class="stat-sub">' +
      app.esc(subtitle) +
      "</div></div>"
    );
  }

  function pmInfoRow(title, desc, badge) {
    return (
      '<div class="emp-info-row">' +
      '<div class="emp-info-content"><div class="emp-info-title">' +
      app.esc(title) +
      "</div>" +
      '<div class="emp-info-desc">' +
      app.esc(desc) +
      "</div></div>" +
      '<span class="badge badge-muted">' +
      app.esc(badge) +
      "</span></div>"
    );
  }

  function pmDueText(endDate) {
    if (!endDate || endDate <= 0) return "No due date";
    var ts = endDate > 1e12 ? endDate : endDate * 1000;
    var due = new Date(ts);
    var now = new Date();
    now.setHours(0, 0, 0, 0);
    var diff = Math.round((due - now) / 86400000);
    if (diff < 0)
      return (
        "Overdue by " +
        Math.abs(diff) +
        " day" +
        (Math.abs(diff) === 1 ? "" : "s")
      );
    if (diff === 0) return "Due today";
    if (diff === 1) return "Due tomorrow";
    return "Due in " + diff + " days";
  }

  function isPMOverdue(p) {
    if (!p.endDate || p.endDate <= 0) return false;
    var ts = p.endDate > 1e12 ? p.endDate : p.endDate * 1000;
    return (
      new Date(ts) < new Date() &&
      (p.status || "").toUpperCase() !== "COMPLETED"
    );
  }

  function isPMActive(p) {
    var s = (p.status || "").toUpperCase();
    return s === "IN_PROGRESS" || s === "PLANNING";
  }

  function isPMCompleted(p) {
    return (p.status || "").toUpperCase() === "COMPLETED";
  }

  function toMs(ts) {
    if (!ts || ts <= 0) return 0;
    return ts > 1e12 ? ts : ts * 1000;
  }

  function projectStartMs(project) {
    return (
      toMs(project.startDate) ||
      toMs(project.createdAt) ||
      toMs(project.updatedAt) ||
      Date.now()
    );
  }

  function projectEndMs(project, startMs) {
    var end = toMs(project.endDate);
    if (!end) {
      end = startMs + 14 * 86400000;
    }
    if (end <= startMs) {
      end = startMs + 86400000;
    }
    return end;
  }

  function formatFileSize(bytes) {
    var value = Number(bytes) || 0;
    if (value >= 1024 * 1024) return (value / (1024 * 1024)).toFixed(1) + " MB";
    if (value >= 1024) return Math.round(value / 1024) + " KB";
    return value + " B";
  }

  function buildAttachmentList(files, emptyText) {
    if (!files || !files.length) {
      return '<div class="comment-empty">' + app.esc(emptyText) + "</div>";
    }
    return files
      .map(function (file) {
        var href = file.dataUrl ? ' href="' + app.esc(file.dataUrl) + '"' : "";
        var download = file.name
          ? ' download="' + app.esc(file.name) + '"'
          : "";
        return (
          '<div class="attachment-item">' +
          '<div class="attachment-main"><strong>' +
          app.esc(file.name || "Attachment") +
          '</strong><span class="attachment-meta">' +
          app.esc(file.mimeType || "File") +
          " · " +
          app.esc(formatFileSize(file.size)) +
          "</span></div>" +
          '<a class="attachment-link"' +
          href +
          download +
          (href ? ' target="_blank" rel="noopener"' : "") +
          ">" +
          (href ? "Open" : "Attached") +
          "</a></div>"
        );
      })
      .join("");
  }

  function formatDateKey(ts) {
    var date = new Date(ts || Date.now());
    if (isNaN(date.getTime())) return "";
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
    ].join("-");
  }

  var pmGanttState = { zoom: "month", sort: "end" };
  var pmManagedProjectsCache = [];

  function ganttDayWidth() {
    if (pmGanttState.zoom === "week") return 34;
    if (pmGanttState.zoom === "quarter") return 10;
    return 18;
  }

  function ganttTickStepDays() {
    if (pmGanttState.zoom === "week") return 7;
    if (pmGanttState.zoom === "quarter") return 30;
    return 14;
  }

  function alignGanttStart(ms) {
    var d = new Date(ms);
    d.setHours(0, 0, 0, 0);
    if (pmGanttState.zoom === "week") {
      d.setDate(d.getDate() - ((d.getDay() || 7) - 1));
      return d.getTime();
    }
    if (pmGanttState.zoom === "quarter") {
      d.setMonth(Math.floor(d.getMonth() / 3) * 3, 1);
      return d.getTime();
    }
    d.setDate(1);
    return d.getTime();
  }

  function alignGanttEnd(ms) {
    var d = new Date(ms);
    d.setHours(0, 0, 0, 0);
    if (pmGanttState.zoom === "week") {
      d.setDate(d.getDate() + (7 - (d.getDay() || 7)));
      return d.getTime();
    }
    if (pmGanttState.zoom === "quarter") {
      d.setMonth(Math.floor(d.getMonth() / 3) * 3 + 3, 0);
      return d.getTime();
    }
    d.setMonth(d.getMonth() + 1, 0);
    return d.getTime();
  }

  function pmGanttStatusClass(project) {
    var s = (project.status || "").toUpperCase();
    if (s === "COMPLETED") return "pm-gantt-bar-completed";
    if (s === "IN_PROGRESS") return "pm-gantt-bar-active";
    if (s === "ON_HOLD") return "pm-gantt-bar-hold";
    if (s === "PENDING_APPROVAL") return "pm-gantt-bar-pending";
    return "pm-gantt-bar-planning";
  }

  function renderPMGantt(managedProjects) {
    var host = document.getElementById("pmGanttChart");
    if (!host) return;

    var projects = managedProjects || [];
    if (!projects.length) {
      host.innerHTML =
        '<div class="empty-state">No managed projects to display on the timeline.</div>';
      return;
    }

    var rows = projects.map(function (p) {
      var startMs = projectStartMs(p);
      var endMs = projectEndMs(p, startMs);
      return {
        project: p,
        startMs: startMs,
        endMs: endMs,
      };
    });

    rows.sort(function (a, b) {
      return a.startMs - b.startMs;
    });

    var minStart = rows[0].startMs;
    var maxEnd = rows[0].endMs;
    rows.forEach(function (r) {
      if (r.startMs < minStart) minStart = r.startMs;
      if (r.endMs > maxEnd) maxEnd = r.endMs;
    });

    var pad = 2 * 86400000;
    var axisStart = minStart - pad;
    var axisEnd = maxEnd + pad;
    var axisSpan = Math.max(axisEnd - axisStart, 86400000);

    var ticks = "";
    var tickCount = 6;
    for (var i = 0; i < tickCount; i++) {
      var ratio = tickCount === 1 ? 0 : i / (tickCount - 1);
      var t = axisStart + Math.round(axisSpan * ratio);
      ticks +=
        '<div class="pm-gantt-tick" style="left:' +
        ratio * 100 +
        '%"><span>' +
        app.esc(app.formatTimestamp(t)) +
        "</span></div>";
    }

    var body = rows
      .map(function (r) {
        var p = r.project;
        var left = ((r.startMs - axisStart) / axisSpan) * 100;
        var width = ((r.endMs - r.startMs) / axisSpan) * 100;
        var safeWidth = Math.max(width, 1.8);
        var pid = app.esc(p.id || "");
        var pct = Number(p.completionPercentage || 0);
        if (!Number.isFinite(pct) || pct < 0) pct = 0;
        if (pct > 100) pct = 100;
        return (
          '<div class="pm-gantt-row">' +
          '<div class="pm-gantt-label">' +
          '<div class="pm-gantt-name">' +
          app.esc(p.name || "Untitled") +
          "</div>" +
          '<div class="pm-gantt-meta">' +
          app.esc(app.formatStatus(p.status || "PLANNING")) +
          " • " +
          pct +
          "%</div></div>" +
          '<div class="pm-gantt-track">' +
          '<button class="pm-gantt-bar ' +
          pmGanttStatusClass(p) +
          '" style="left:' +
          left +
          "%;width:" +
          safeWidth +
          '%" onclick="openPMProjectDetail(\'' +
          pid +
          "')\">" +
          '<span class="pm-gantt-bar-fill" style="width:' +
          pct +
          '%"></span>' +
          '<span class="pm-gantt-bar-text">' +
          app.esc(app.formatTimestamp(r.startMs)) +
          " - " +
          app.esc(app.formatTimestamp(r.endMs)) +
          "</span></button></div></div>"
        );
      })
      .join("");

    host.innerHTML =
      '<div class="pm-gantt-wrap">' +
      '<div class="pm-gantt-axis">' +
      ticks +
      "</div>" +
      '<div class="pm-gantt-body">' +
      body +
      "</div></div>";
  }

  function pmProfileRow(label, value) {
    return (
      '<div class="emp-profile-row"><span class="emp-profile-label">' +
      app.esc(label) +
      "</span>" +
      '<span class="emp-profile-value">' +
      app.esc(value) +
      "</span></div>"
    );
  }

  function startOfTodayMs() {
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  function projectTaskSummary(project) {
    return project && project.taskSummary
      ? project.taskSummary
      : {
          total: 0,
          todo: 0,
          inProgress: 0,
          underReview: 0,
          completed: 0,
          overdue: 0,
        };
  }

  function sortPMGanttRows(rows) {
    rows.sort(function (a, b) {
      if (pmGanttState.sort === "start") {
        return a.startMs - b.startMs;
      }
      if (pmGanttState.sort === "health") {
        var aScore =
          (a.summary.overdue || 0) * 100 +
          (a.summary.underReview || 0) * 10 +
          ((a.project.status || "").toUpperCase() === "ON_HOLD" ? 50 : 0);
        var bScore =
          (b.summary.overdue || 0) * 100 +
          (b.summary.underReview || 0) * 10 +
          ((b.project.status || "").toUpperCase() === "ON_HOLD" ? 50 : 0);
        if (bScore !== aScore) return bScore - aScore;
      }
      return a.endMs - b.endMs;
    });
  }

  function ganttTickLabel(ms) {
    var date = new Date(ms);
    if (pmGanttState.zoom === "quarter") {
      return date.toLocaleDateString("en-US", {
        month: "short",
        year: "2-digit",
      });
    }
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }

  window.setPMGanttZoom = function (zoom) {
    pmGanttState.zoom = zoom || "month";
    renderPMGantt(pmManagedProjectsCache);
  };

  window.setPMGanttSort = function (sort) {
    pmGanttState.sort = sort || "end";
    renderPMGantt(pmManagedProjectsCache);
  };

  function renderPMGantt(managedProjects) {
    var host = document.getElementById("pmGanttChart");
    if (!host) return;

    pmManagedProjectsCache = managedProjects || [];
    var projects = pmManagedProjectsCache;
    if (!projects.length) {
      host.innerHTML =
        '<div class="empty-state">No managed projects to display on the timeline.</div>';
      return;
    }

    var rows = projects.map(function (p) {
      var startMs = projectStartMs(p);
      var endMs = projectEndMs(p, startMs);
      return {
        project: p,
        startMs: startMs,
        endMs: endMs,
        summary: projectTaskSummary(p),
      };
    });

    sortPMGanttRows(rows);

    var minStart = rows[0].startMs;
    var maxEnd = rows[0].endMs;
    rows.forEach(function (r) {
      if (r.startMs < minStart) minStart = r.startMs;
      if (r.endMs > maxEnd) maxEnd = r.endMs;
    });

    var axisStart = alignGanttStart(minStart - 2 * 86400000);
    var axisEnd = alignGanttEnd(maxEnd + 2 * 86400000);
    var totalDays = Math.max(
      1,
      Math.round((axisEnd - axisStart) / 86400000) + 1,
    );
    var dayWidth = ganttDayWidth();
    var tickDays = ganttTickStepDays();
    var timelineWidth = Math.max(900, totalDays * dayWidth);
    var todayMs = startOfTodayMs();
    var todayLeft =
      todayMs >= axisStart && todayMs <= axisEnd
        ? Math.round(((todayMs - axisStart) / 86400000) * dayWidth)
        : -1;

    var headerTicks = "";
    var rowGrid = "";
    for (var dayIndex = 0; dayIndex < totalDays; dayIndex += tickDays) {
      var tickMs = axisStart + dayIndex * 86400000;
      var leftPx = Math.round(dayIndex * dayWidth);
      headerTicks +=
        '<div class="pm-gantt-header-tick" style="left:' +
        leftPx +
        'px"><span>' +
        app.esc(ganttTickLabel(tickMs)) +
        "</span></div>";
      rowGrid +=
        '<span class="pm-gantt-grid-line" style="left:' +
        leftPx +
        'px"></span>';
    }

    var overdueProjects = rows.filter(function (row) {
      return row.summary.overdue > 0 || isPMOverdue(row.project);
    }).length;
    var reviewProjects = rows.filter(function (row) {
      return row.summary.underReview > 0;
    }).length;

    var body = rows
      .map(function (r) {
        var p = r.project;
        var left = Math.round(((r.startMs - axisStart) / 86400000) * dayWidth);
        var durationDays = Math.max(
          1,
          Math.round((r.endMs - r.startMs) / 86400000) + 1,
        );
        var safeWidth = Math.max(durationDays * dayWidth, 28);
        var pid = app.esc(p.id || "");
        var pct = Number(p.completionPercentage || 0);
        if (!Number.isFinite(pct) || pct < 0) pct = 0;
        if (pct > 100) pct = 100;
        var flags = "";
        if (r.summary.underReview) {
          flags +=
            '<span class="pm-gantt-flag pm-gantt-flag-review">' +
            app.esc(r.summary.underReview + " review") +
            "</span>";
        }
        if (r.summary.overdue || isPMOverdue(p)) {
          flags += '<span class="pm-gantt-flag pm-gantt-flag-risk">At risk</span>';
        }
        if (String(p.priority || "").toUpperCase() === "CRITICAL") {
          flags +=
            '<span class="pm-gantt-flag pm-gantt-flag-critical">Critical</span>';
        }
        return (
          '<div class="pm-gantt-table-row">' +
          '<div class="pm-gantt-label-cell">' +
          '<div class="pm-gantt-name">' +
          app.esc(p.name || "Untitled") +
          "</div>" +
          '<div class="pm-gantt-meta">' +
          app.esc(app.formatStatus(p.status || "PLANNING")) +
          " · " +
          pct +
          "% · " +
          app.esc(pmDueText(p.endDate)) +
          "</div>" +
          '<div class="pm-gantt-flags">' +
          flags +
          '<span class="pm-gantt-flag">' +
          app.esc(
            (r.summary.completed || 0) + "/" + (r.summary.total || 0) + " done",
          ) +
          "</span></div></div>" +
          '<div class="pm-gantt-track-cell" style="width:' +
          timelineWidth +
          'px">' +
          rowGrid +
          (todayLeft >= 0
            ? '<span class="pm-gantt-today-line" style="left:' +
              todayLeft +
              'px"></span>'
            : "") +
          '<button class="pm-gantt-bar ' +
          pmGanttStatusClass(p) +
          (r.summary.overdue || isPMOverdue(p) ? " pm-gantt-bar-overdue" : "") +
          '" style="left:' +
          left +
          'px;width:' +
          safeWidth +
          'px" onclick="openPMProjectDetail(\'' +
          pid +
          "')\">" +
          '<span class="pm-gantt-bar-fill" style="width:' +
          pct +
          '%"></span>' +
          '<span class="pm-gantt-bar-text">' +
          app.esc(app.formatTimestamp(r.startMs)) +
          " → " +
          app.esc(app.formatTimestamp(r.endMs)) +
          "</span></button></div></div>"
        );
      })
      .join("");

    host.innerHTML =
      '<div class="pm-gantt-shell">' +
      '<div class="pm-gantt-toolbar">' +
      '<div class="pm-gantt-summary">' +
      '<span class="pm-gantt-summary-chip">' +
      app.esc(rows.length + " projects") +
      "</span>" +
      '<span class="pm-gantt-summary-chip">' +
      app.esc(overdueProjects + " at risk") +
      "</span>" +
      '<span class="pm-gantt-summary-chip">' +
      app.esc(reviewProjects + " in review") +
      "</span></div>" +
      '<div class="pm-gantt-controls">' +
      '<div class="pm-gantt-toggle">' +
      '<button class="' +
      (pmGanttState.zoom === "week" ? "active" : "") +
      '" onclick="setPMGanttZoom(\'week\')">Week</button>' +
      '<button class="' +
      (pmGanttState.zoom === "month" ? "active" : "") +
      '" onclick="setPMGanttZoom(\'month\')">Month</button>' +
      '<button class="' +
      (pmGanttState.zoom === "quarter" ? "active" : "") +
      '" onclick="setPMGanttZoom(\'quarter\')">Quarter</button>' +
      "</div>" +
      '<select onchange="setPMGanttSort(this.value)">' +
      '<option value="end"' +
      (pmGanttState.sort === "end" ? " selected" : "") +
      ">Sort by due date</option>" +
      '<option value="start"' +
      (pmGanttState.sort === "start" ? " selected" : "") +
      ">Sort by start date</option>" +
      '<option value="health"' +
      (pmGanttState.sort === "health" ? " selected" : "") +
      ">Sort by risk</option></select></div></div>" +
      '<div class="pm-gantt-scroll">' +
      '<div class="pm-gantt-table" style="width:' +
      (timelineWidth + 280) +
      'px">' +
      '<div class="pm-gantt-table-header">' +
      '<div class="pm-gantt-label-head">Project timeline</div>' +
      '<div class="pm-gantt-track-head" style="width:' +
      timelineWidth +
      'px">' +
      headerTicks +
      (todayLeft >= 0
        ? '<span class="pm-gantt-today-line" style="left:' +
          todayLeft +
          'px"></span><span class="pm-gantt-today-tag" style="left:' +
          todayLeft +
          'px">Today</span>'
        : "") +
      "</div></div>" +
      body +
      "</div></div></div>";
  }

  /* ============================================================
       TASK BOARD (create, assign, track tasks)
       ============================================================ */
  var pmTasksCache = [];

  window.loadPMTasks = function () {
    ensurePMData(function (employees, projects) {
      var managed = findManagedProjects(projects);
      var team = findTeamMembers(employees, managed);

      // Populate filters
      var projFilter = document.getElementById("taskProjectFilter");
      if (projFilter) {
        projFilter.innerHTML = '<option value="">All Projects</option>';
        managed.forEach(function (p) {
          projFilter.innerHTML +=
            '<option value="' +
            app.esc(p.id) +
            '">' +
            app.esc(p.name || "Untitled") +
            "</option>";
        });
      }
      var assignFilter = document.getElementById("taskAssigneeFilter");
      if (assignFilter) {
        assignFilter.innerHTML = '<option value="">All Assignees</option>';
        team.forEach(function (e) {
          var name = app.buildName(e);
          assignFilter.innerHTML +=
            '<option value="' +
            app.esc(e.id) +
            '">' +
            app.esc(name) +
            "</option>";
        });
      }

      // Populate modal dropdowns
      var projSelect = document.getElementById("taskProject");
      if (projSelect) {
        projSelect.innerHTML = '<option value="">Select project\u2026</option>';
        managed.forEach(function (p) {
          projSelect.innerHTML +=
            '<option value="' +
            app.esc(p.id) +
            '" data-name="' +
            app.esc(p.name || "") +
            '">' +
            app.esc(p.name || "Untitled") +
            "</option>";
        });
      }
      var assignSelect = document.getElementById("taskAssignee");
      if (assignSelect) {
        assignSelect.innerHTML = '<option value="">Unassigned</option>';
        team.forEach(function (e) {
          var name = app.buildName(e);
          assignSelect.innerHTML +=
            '<option value="' +
            app.esc(e.id) +
            '" data-name="' +
            app.esc(name) +
            '">' +
            app.esc(name) +
            "</option>";
        });
      }

      app.fetchJson(
        "/api/workspace/tasks",
        function (tasks) {
          var managedIds = {};
          managed.forEach(function (p) {
            managedIds[p.id] = true;
          });
          pmTasksCache = tasks.filter(function (t) {
            return managedIds[t.projectId];
          });
          renderPMTaskBoard(pmTasksCache);
        },
        function () {
          pmTasksCache = [];
          renderPMTaskBoard([]);
        },
      );
    });
  };

  function renderPMTaskBoard(tasks) {
    var todo = [],
      inProgress = [],
      underReview = [],
      completed = [];
    tasks.forEach(function (t) {
      var s = (t.status || "TODO").toUpperCase();
      if (s === "COMPLETED") completed.push(t);
      else if (s === "UNDER_REVIEW") underReview.push(t);
      else if (s === "IN_PROGRESS") inProgress.push(t);
      else todo.push(t);
    });

    var overdue = tasks.filter(function (t) {
      return (
        t.dueDate &&
        t.dueDate < Date.now() &&
        (t.status || "").toUpperCase() !== "COMPLETED"
      );
    }).length;

    var statsEl = document.getElementById("pmTasksStats");
    if (statsEl) {
      statsEl.innerHTML =
        pmStatCard(
          tasks.length,
          "Total Tasks",
          "Across managed projects",
          "blue",
        ) +
        pmStatCard(
          inProgress.length,
          "In Progress",
          "Currently active",
          "green",
        ) +
        pmStatCard(
          underReview.length,
          "Under Review",
          "Awaiting review",
          "orange",
        ) +
        pmStatCard(overdue, "Overdue", "Past due date", "purple");
    }

    var el;
    el = document.getElementById("countTodo");
    if (el) el.textContent = todo.length;
    el = document.getElementById("countTaskInProgress");
    if (el) el.textContent = inProgress.length;
    el = document.getElementById("countTaskUnderReview");
    if (el) el.textContent = underReview.length;
    el = document.getElementById("countTaskCompleted");
    if (el) el.textContent = completed.length;

    renderTaskCards("cardsTodo", todo, "No tasks in To Do");
    renderTaskCards("cardsTaskInProgress", inProgress, "No tasks in progress");
    renderTaskCards(
      "cardsTaskUnderReview",
      underReview,
      "No tasks under review",
    );
    renderTaskCards("cardsTaskCompleted", completed, "No completed tasks");
  }

  function renderTaskCards(containerId, tasks, emptyMsg) {
    var container = document.getElementById(containerId);
    if (!container) return;
    if (!tasks || tasks.length === 0) {
      container.innerHTML =
        '<div class="kanban-empty"><div class="msg">' +
        app.esc(emptyMsg) +
        "</div></div>";
      return;
    }
    container.innerHTML = tasks.map(renderTaskCard).join("");
  }

  function renderTaskCard(t) {
    var id = app.esc(t.id || "");
    var priorityClass = "priority-" + (t.priority || "MEDIUM").toLowerCase();
    var dueText = "";
    if (t.dueDate) {
      var ts = t.dueDate > 1e12 ? t.dueDate : t.dueDate * 1000;
      var due = new Date(ts);
      var now = new Date();
      now.setHours(0, 0, 0, 0);
      var diff = Math.round((due - now) / 86400000);
      if (diff < 0) dueText = "Overdue";
      else if (diff === 0) dueText = "Due today";
      else dueText = "Due in " + diff + "d";
    }
    var isOverdue =
      t.dueDate &&
      t.dueDate < Date.now() &&
      (t.status || "").toUpperCase() !== "COMPLETED";
    return (
      '<div class="task-card clickable" onclick="openTaskModal(\'' +
      id +
      "')\">" +
      '<div class="task-card-header"><span class="task-card-title">' +
      app.esc(t.title || "Untitled") +
      "</span>" +
      '<span class="card-priority ' +
      priorityClass +
      '">' +
      app.esc(app.formatStatus(t.priority || "MEDIUM")) +
      "</span></div>" +
      (t.description
        ? '<div class="task-card-desc">' +
          app.esc(
            t.description.length > 100
              ? t.description.substring(0, 100) + "..."
              : t.description,
          ) +
          "</div>"
        : "") +
      '<div class="task-card-meta">' +
      '<span class="task-card-project">' +
      app.esc(t.projectName || "No project") +
      "</span>" +
      (dueText
        ? '<span class="task-card-due' +
          (isOverdue ? " overdue" : "") +
          '">' +
          dueText +
          "</span>"
        : "") +
      "</div>" +
      (t.assignedToName
        ? '<div class="task-card-assignee"><div class="mini-avatar">' +
          app.initials(t.assignedToName) +
          "</div><span>" +
          app.esc(t.assignedToName) +
          "</span></div>"
        : '<div class="task-card-assignee unassigned">Unassigned</div>') +
      "</div>"
    );
  }

  window.filterPMTasks = function () {
    var projVal =
      (document.getElementById("taskProjectFilter") || {}).value || "";
    var assignVal =
      (document.getElementById("taskAssigneeFilter") || {}).value || "";
    var searchText = (
      (document.getElementById("taskSearchFilter") || {}).value || ""
    )
      .toLowerCase()
      .trim();
    var filtered = pmTasksCache.filter(function (t) {
      if (projVal && t.projectId !== projVal) return false;
      if (assignVal && t.assignedTo !== assignVal) return false;
      if (searchText) {
        var blob = [
          t.title || "",
          t.description || "",
          t.projectName || "",
          t.assignedToName || "",
          t.status || "",
          t.priority || "",
        ]
          .join(" ")
          .toLowerCase();
        if (blob.indexOf(searchText) === -1) return false;
      }
      return true;
    });
    renderPMTaskBoard(filtered);
  };

  window.openTaskModal = function (id) {
    app.clearModalNotice("taskModalNotice");
    var isEdit = !!id;
    document.getElementById("taskModalTitle").textContent = isEdit
      ? "Edit Task"
      : "Create Task";
    document
      .getElementById("taskDeleteBtn")
      .classList.toggle("hidden", !isEdit);

    if (isEdit) {
      var task = null;
      for (var i = 0; i < pmTasksCache.length; i++) {
        if (pmTasksCache[i].id === id) {
          task = pmTasksCache[i];
          break;
        }
      }
      if (task) {
        document.getElementById("taskId").value = task.id;
        document.getElementById("taskTitle").value = task.title || "";
        document.getElementById("taskDescription").value =
          task.description || "";
        document.getElementById("taskProject").value = task.projectId || "";
        document.getElementById("taskAssignee").value = task.assignedTo || "";
        document.getElementById("taskPriority").value =
          task.priority || "MEDIUM";
        document.getElementById("taskStatus").value = task.status || "TODO";
        document.getElementById("taskDueDate").value = task.dueDate
          ? app.toDateInput(task.dueDate)
          : "";
      }
    } else {
      ["taskId", "taskTitle", "taskDescription", "taskDueDate"].forEach(
        function (fid) {
          document.getElementById(fid).value = "";
        },
      );
      document.getElementById("taskProject").value = "";
      document.getElementById("taskAssignee").value = "";
      document.getElementById("taskPriority").value = "MEDIUM";
      document.getElementById("taskStatus").value = "TODO";
    }
    document.getElementById("taskModal").classList.remove("hidden");

    // Show/hide comments section
    var commentsSection = document.getElementById("taskCommentsSection");
    if (commentsSection) {
      if (isEdit) {
        commentsSection.classList.remove("hidden");
        loadTaskComments(id);
      } else {
        commentsSection.classList.add("hidden");
        document.getElementById("taskCommentsList").innerHTML = "";
      }
    }
  };

  window.savePMTask = function () {
    app.clearModalNotice("taskModalNotice");
    var title = document.getElementById("taskTitle").value.trim();
    if (!title) {
      app.showModalNotice(
        "taskModalNotice",
        "Task title is required.",
        "error",
      );
      return;
    }
    var saveBtn = document.getElementById("taskSaveBtn");
    if (saveBtn && saveBtn.disabled) return;
    var projSel = document.getElementById("taskProject");
    if (!projSel || !projSel.value) {
      app.showModalNotice(
        "taskModalNotice",
        "Please select a project.",
        "error",
      );
      return;
    }
    var projOpt = projSel.options[projSel.selectedIndex];
    var assignSel = document.getElementById("taskAssignee");
    var assignOpt = assignSel.options[assignSel.selectedIndex];
    var dueDate = app.dateInputToMs("taskDueDate");
    if (dueDate && dueDate < startOfTodayMs()) {
      app.showModalNotice(
        "taskModalNotice",
        "Due date cannot be in the past.",
        "error",
      );
      return;
    }

    var id = document.getElementById("taskId").value;
    var payload = {
      title: title,
      description: document.getElementById("taskDescription").value.trim(),
      projectId: projSel.value,
      projectName: projOpt
        ? projOpt.getAttribute("data-name") || projOpt.textContent
        : "",
      assignedTo: assignSel.value,
      assignedToName: assignOpt
        ? assignOpt.getAttribute("data-name") ||
          (assignSel.value ? assignOpt.textContent : "")
        : "",
      priority: document.getElementById("taskPriority").value,
      status: document.getElementById("taskStatus").value,
      dueDate: dueDate,
    };

    var isEdit = !!id;
    var url = isEdit
      ? "/api/workspace/tasks/" + encodeURIComponent(id)
      : "/api/workspace/tasks";
    var method = isEdit ? "PUT" : "POST";

    saveBtn.disabled = true;
    app.fetchMutate(
      method,
      url,
      payload,
      function () {
        saveBtn.disabled = false;
        app.closeModal("taskModal");
        app.showToast(isEdit ? "Task updated" : "Task created", "success");
        // Activity log
        logActivity(
          isEdit ? "UPDATE" : "CREATE",
          "task",
          id || "",
          payload.title,
          payload.projectId,
          isEdit ? "Task updated" : "Task created: " + payload.title,
        );
        // Notify assigned employee
        if (payload.assignedTo) {
          app.fetchMutate(
            "POST",
            "/api/workspace/notifications",
            {
              recipientId: payload.assignedTo,
              type: "TASK_ASSIGNED",
              message:
                (isEdit ? "Task updated: " : "New task assigned: ") +
                payload.title,
              entityId: id || "",
              entityType: "task",
              link: "/workspace",
            },
            function () {},
            function () {},
          );
        }
        delete app.cachedData.pmEmployees;
        delete app.cachedData.pmProjects;
        loadPMTasks();
      },
      function (err) {
        saveBtn.disabled = false;
        app.showModalNotice(
          "taskModalNotice",
          err || "Failed to save task.",
          "error",
        );
      },
    );
  };

  window.deletePMTask = function () {
    var id = document.getElementById("taskId").value;
    if (!id) return;
    app.showConfirm("Delete this task?", function () {
      app.fetchMutate(
        "DELETE",
        "/api/workspace/tasks/" + encodeURIComponent(id),
        null,
        function () {
          app.closeModal("taskModal");
          app.showToast("Task deleted", "success");
          delete app.cachedData.pmEmployees;
          delete app.cachedData.pmProjects;
          loadPMTasks();
        },
        function (err) {
          app.showModalNotice(
            "taskModalNotice",
            err || "Failed to delete task.",
            "error",
          );
        },
      );
    });
  };

  // ---- Task Comments ----
  function loadTaskComments(taskId) {
    var list = document.getElementById("taskCommentsList");
    if (!list) return;
    list.innerHTML = '<div class="loading-spinner visible"></div>';
    app.fetchJson(
      "/api/workspace/comments?taskId=" + encodeURIComponent(taskId),
      function (comments) {
        if (!comments || comments.length === 0) {
          list.innerHTML = '<div class="comment-empty">No comments yet.</div>';
          return;
        }
        list.innerHTML = comments
          .map(function (c) {
            var time = c.createdAt ? app.formatTimestamp(c.createdAt) : "";
            return (
              '<div class="comment-item">' +
              '<div class="comment-header"><strong>' +
              app.esc(c.authorName || "Unknown") +
              "</strong>" +
              '<span class="comment-role">' +
              app.esc((c.authorRole || "").replace(/_/g, " ")) +
              "</span>" +
              '<span class="comment-time">' +
              time +
              "</span></div>" +
              '<div class="comment-text">' +
              app.esc(c.text) +
              "</div></div>"
            );
          })
          .join("");
      },
      function () {
        list.innerHTML =
          '<div class="comment-empty">Failed to load comments.</div>';
      },
    );
  }

  window.postTaskComment = function () {
    var taskId = document.getElementById("taskId").value;
    var textEl = document.getElementById("taskCommentText");
    var text = (textEl.value || "").trim();
    if (!taskId || !text) return;
    if (text.length > 2000) {
      app.showToast("Comment must be under 2000 characters", "warning");
      return;
    }
    app.fetchMutate(
      "POST",
      "/api/workspace/comments",
      { taskId: taskId, text: text },
      function () {
        textEl.value = "";
        loadTaskComments(taskId);
        // Log activity
        var task = null;
        for (var i = 0; i < pmTasksCache.length; i++) {
          if (pmTasksCache[i].id === taskId) {
            task = pmTasksCache[i];
            break;
          }
        }
        logActivity(
          "COMMENT",
          "task",
          taskId,
          task ? task.title : "",
          task ? task.projectId : "",
          "Added a comment",
        );
      },
      function (err) {
        app.showToast(err || "Failed to post comment", "error");
      },
    );
  };

  function logActivity(
    action,
    entityType,
    entityId,
    entityName,
    projectId,
    details,
  ) {
    app.fetchMutate(
      "POST",
      "/api/workspace/activity-logs",
      {
        action: action,
        entityType: entityType,
        entityId: entityId,
        entityName: entityName,
        projectId: projectId,
        details: details,
      },
      function () {},
      function () {},
    );
  }

  var pmTaskDetailCache = null;

  function renderPMTaskReviewSection(task) {
    var section = document.getElementById("taskReviewSection");
    var stateEl = document.getElementById("taskReviewState");
    var infoEl = document.getElementById("taskSubmissionInfo");
    var notesEl = document.getElementById("taskReviewNotes");
    var requestBtn = document.getElementById("taskRequestChangesBtn");
    var approveBtn = document.getElementById("taskApproveBtn");
    if (!section || !stateEl || !infoEl || !notesEl || !requestBtn || !approveBtn) {
      return;
    }

    if (!task || !task.id) {
      section.classList.add("hidden");
      infoEl.innerHTML = "";
      notesEl.value = "";
      requestBtn.classList.add("hidden");
      approveBtn.classList.add("hidden");
      return;
    }

    section.classList.remove("hidden");
    var status = String(task.status || "TODO").toUpperCase();
    stateEl.textContent = app.formatStatus(status);
    stateEl.className =
      "badge " +
      (status === "COMPLETED"
        ? "badge-green"
        : status === "UNDER_REVIEW"
          ? "badge-orange"
          : status === "IN_PROGRESS"
            ? "badge-blue"
            : "badge-muted");

    var files = task.submissionFiles || [];
    infoEl.innerHTML =
      '<div class="task-feedback-card">' +
      '<strong>Latest Submission</strong>' +
      "<p>" +
      app.esc(task.submissionNotes || "No submission notes added yet.") +
      "</p>" +
      '<div class="attachment-meta">' +
      (task.submittedByName
        ? "Submitted by " + app.esc(task.submittedByName) + " · "
        : "") +
      app.esc(task.submittedAt ? app.formatTimestamp(task.submittedAt) : "Awaiting submission") +
      "</div>" +
      '<div class="attachment-list-wrap">' +
      buildAttachmentList(files, "No submission files attached.") +
      "</div></div>" +
      (task.reviewNotes || task.reviewedAt
        ? '<div class="task-feedback-card">' +
          "<strong>Review Trail</strong>" +
          "<p>" +
          app.esc(task.reviewNotes || "Reviewed") +
          "</p>" +
          '<div class="attachment-meta">' +
          (task.reviewedByName
            ? "By " + app.esc(task.reviewedByName) + " · "
            : "") +
          app.esc(task.reviewedAt ? app.formatTimestamp(task.reviewedAt) : "No review timestamp") +
          "</div></div>"
        : "");

    notesEl.value = task.reviewNotes || "";
    requestBtn.classList.toggle("hidden", status !== "UNDER_REVIEW");
    approveBtn.classList.toggle("hidden", status !== "UNDER_REVIEW");
  }

  function resetPMTaskModalReviewSection() {
    renderPMTaskReviewSection(null);
    var commentsSection = document.getElementById("taskCommentsSection");
    if (commentsSection) commentsSection.classList.add("hidden");
    var commentsList = document.getElementById("taskCommentsList");
    if (commentsList) commentsList.innerHTML = "";
    var commentBox = document.getElementById("taskCommentText");
    if (commentBox) commentBox.value = "";
  }

  function populatePMTaskModal(task) {
    pmTaskDetailCache = task || null;
    document.getElementById("taskId").value = task.id || "";
    document.getElementById("taskTitle").value = task.title || "";
    document.getElementById("taskDescription").value = task.description || "";
    document.getElementById("taskProject").value = task.projectId || "";
    document.getElementById("taskAssignee").value = task.assignedTo || "";
    document.getElementById("taskPriority").value = task.priority || "MEDIUM";
    document.getElementById("taskStatus").value = task.status || "TODO";
    document.getElementById("taskDueDate").value = task.dueDate
      ? app.toDateInput(task.dueDate)
      : "";
    document.getElementById("taskModalTitle").textContent = "Edit Task";
    document.getElementById("taskDeleteBtn").classList.remove("hidden");
    var commentsSection = document.getElementById("taskCommentsSection");
    if (commentsSection) commentsSection.classList.remove("hidden");
    renderPMTaskReviewSection(task);
    loadTaskComments(task.id);
  }

  window.openTaskModal = function (id) {
    app.clearModalNotice("taskModalNotice");
    document.getElementById("taskModal").classList.remove("hidden");
    if (!id) {
      pmTaskDetailCache = null;
      ["taskId", "taskTitle", "taskDescription", "taskDueDate"].forEach(
        function (fid) {
          document.getElementById(fid).value = "";
        },
      );
      document.getElementById("taskProject").value = "";
      document.getElementById("taskAssignee").value = "";
      document.getElementById("taskPriority").value = "MEDIUM";
      document.getElementById("taskStatus").value = "TODO";
      document.getElementById("taskModalTitle").textContent = "Create Task";
      document.getElementById("taskDeleteBtn").classList.add("hidden");
      resetPMTaskModalReviewSection();
      return;
    }

    document.getElementById("taskModalTitle").textContent = "Loading Task...";
    document.getElementById("taskDeleteBtn").classList.remove("hidden");
    renderPMTaskReviewSection({
      id: id,
      status: "TODO",
      submissionNotes: "Loading submission details...",
      submissionFiles: [],
    });
    var commentsList = document.getElementById("taskCommentsList");
    if (commentsList) {
      commentsList.innerHTML = '<div class="loading-spinner visible"></div>';
    }
    app.fetchJson(
      "/api/workspace/tasks/" + encodeURIComponent(id),
      function (task) {
        populatePMTaskModal(task);
      },
      function (err) {
        app.showModalNotice(
          "taskModalNotice",
          err || "Failed to load task details.",
          "error",
        );
        document.getElementById("taskModalTitle").textContent = "Edit Task";
      },
    );
  };

  window.savePMTask = function () {
    app.clearModalNotice("taskModalNotice");
    var title = document.getElementById("taskTitle").value.trim();
    if (!title) {
      app.showModalNotice(
        "taskModalNotice",
        "Task title is required.",
        "error",
      );
      return;
    }

    var saveBtn = document.getElementById("taskSaveBtn");
    if (saveBtn && saveBtn.disabled) return;
    var id = document.getElementById("taskId").value;
    var projSel = document.getElementById("taskProject");
    if (!projSel || !projSel.value) {
      app.showModalNotice(
        "taskModalNotice",
        "Please select a project.",
        "error",
      );
      return;
    }
    var projOpt = projSel.options[projSel.selectedIndex];
    var assignSel = document.getElementById("taskAssignee");
    var assignOpt = assignSel.options[assignSel.selectedIndex];
    var dueDate = app.dateInputToMs("taskDueDate");
    if (dueDate && !id && dueDate < startOfTodayMs()) {
      app.showModalNotice(
        "taskModalNotice",
        "Due date cannot be in the past for a new task.",
        "error",
      );
      return;
    }

    var payload = {
      title: title,
      description: document.getElementById("taskDescription").value.trim(),
      projectId: projSel.value,
      projectName: projOpt
        ? projOpt.getAttribute("data-name") || projOpt.textContent
        : "",
      assignedTo: assignSel.value,
      assignedToName: assignOpt
        ? assignOpt.getAttribute("data-name") ||
          (assignSel.value ? assignOpt.textContent : "")
        : "",
      priority: document.getElementById("taskPriority").value,
      status: document.getElementById("taskStatus").value,
      dueDate: dueDate,
      reviewNotes: document.getElementById("taskReviewNotes").value.trim(),
    };

    var isEdit = !!id;
    var method = isEdit ? "PUT" : "POST";
    var url = isEdit
      ? "/api/workspace/tasks/" + encodeURIComponent(id)
      : "/api/workspace/tasks";

    if (saveBtn) saveBtn.disabled = true;
    app.fetchMutate(
      method,
      url,
      payload,
      function (savedTask) {
        if (saveBtn) saveBtn.disabled = false;
        app.closeModal("taskModal");
        app.showToast(isEdit ? "Task updated" : "Task created", "success");
        logActivity(
          isEdit ? "UPDATE" : "CREATE",
          "task",
          (savedTask && savedTask.id) || id || "",
          payload.title,
          payload.projectId,
          isEdit ? "Task updated" : "Task created: " + payload.title,
        );
        if (payload.assignedTo) {
          app.fetchMutate(
            "POST",
            "/api/workspace/notifications",
            {
              recipientId: payload.assignedTo,
              type: "TASK_ASSIGNED",
              message:
                (isEdit ? "Task updated: " : "New task assigned: ") +
                payload.title,
              entityId: (savedTask && savedTask.id) || id || "",
              entityType: "task",
              link: "/workspace",
            },
            function () {},
            function () {},
          );
        }
        delete app.cachedData.pmEmployees;
        delete app.cachedData.pmProjects;
        loadPMTasks();
      },
      function (err) {
        if (saveBtn) saveBtn.disabled = false;
        app.showModalNotice(
          "taskModalNotice",
          err || "Failed to save task.",
          "error",
        );
      },
    );
  };

  window.reviewPMTask = function (nextStatus) {
    if (!pmTaskDetailCache || !pmTaskDetailCache.id || !nextStatus) return;
    var notes = document.getElementById("taskReviewNotes").value.trim();
    app.fetchMutate(
      "PUT",
      "/api/workspace/tasks/" + encodeURIComponent(pmTaskDetailCache.id),
      {
        status: nextStatus,
        reviewNotes: notes,
      },
      function () {
        app.closeModal("taskModal");
        app.showToast(
          nextStatus === "COMPLETED"
            ? "Task approved and closed"
            : "Feedback sent to assignee",
          "success",
        );
        loadPMTasks();
      },
      function (err) {
        app.showModalNotice(
          "taskModalNotice",
          err || "Failed to review task.",
          "error",
        );
      },
    );
  };

  /* ============================================================
       MANAGED PROJECTS
       ============================================================ */
  window.loadPMProjects = function () {
    ensurePMData(function (employees, projects) {
      var managed = findManagedProjects(projects);
      var active = managed.filter(isPMActive).length;
      var completed = managed.filter(isPMCompleted).length;
      var overdue = managed.filter(isPMOverdue).length;

      renderPMGantt(managed);

      document.getElementById("pmProjectsStats").innerHTML =
        pmStatCard(
          managed.length,
          "Total Projects",
          "Projects you manage",
          "blue",
        ) +
        pmStatCard(active, "Active", "Currently in progress", "green") +
        pmStatCard(overdue, "Overdue", "Past deadline", "orange") +
        pmStatCard(completed, "Completed", "Delivered projects", "purple");

      var html = "";
      if (managed.length === 0) {
        html =
          '<div class="empty-state">No managed projects. Projects assigned to you as PM will appear here.</div>';
      } else {
        managed.forEach(function (p) {
          var pct = p.completionPercentage || 0;
          var badge = isPMCompleted(p)
            ? "green"
            : isPMOverdue(p)
              ? "orange"
              : "blue";
          var teamCount = (p.teamMemberIds || []).length;
          var pid = app.esc(p.id || "");
          html +=
            '<div class="emp-project-item clickable" onclick="openPMProjectDetail(\'' +
            pid +
            "')\">" +
            '<div class="emp-project-header"><span class="emp-project-name">' +
            app.esc(p.name || "Untitled") +
            "</span>" +
            '<span class="badge badge-' +
            badge +
            '">' +
            app.esc(app.formatStatus(p.status)) +
            "</span></div>" +
            '<div class="project-progress"><div class="project-progress-fill" style="width:' +
            pct +
            '%"></div></div>' +
            '<div class="emp-project-meta"><span>Progress: ' +
            pct +
            "%</span><span>" +
            pmDueText(p.endDate) +
            "</span>" +
            "<span>Team: " +
            teamCount +
            " member" +
            (teamCount === 1 ? "" : "s") +
            "</span>" +
            "<span>Priority: " +
            app.esc(p.priority || "N/A") +
            "</span></div>" +
            (p.description
              ? '<div class="emp-project-desc">' +
                app.esc(p.description) +
                "</div>"
              : "") +
            "</div>";
        });
      }
      document.getElementById("pmProjectsList").innerHTML = html;
    });
  };

  // ---- PM Create Project ----
  window.openPMCreateProject = function () {
    app.clearModalNotice("pmProjNotice");
    [
      "pmProjName",
      "pmProjDescription",
      "pmProjBudget",
      "pmProjSpent",
      "pmProjStartDate",
      "pmProjEndDate",
    ].forEach(function (fid) {
      document.getElementById(fid).value = "";
    });
    var deptSelect = document.getElementById("pmProjDepartment");
    var pmDepartment =
      app.currentUser && app.currentUser.department
        ? app.currentUser.department
        : "";
    deptSelect.innerHTML = app.deptOptions(pmDepartment);
    deptSelect.disabled = !!pmDepartment;
    document.getElementById("pmProjPriority").value = "MEDIUM";

    // Load employees from current PM's department for team selection
    var teamEl = document.getElementById("pmProjTeamCheckboxes");
    teamEl.innerHTML =
      '<span class="comment-empty">Loading employees...</span>';

    ensurePMData(function (employees) {
      var sameDepartmentEmployees = (employees || []).filter(
        isSameDepartmentAsCurrentPM,
      );
      if (sameDepartmentEmployees.length === 0) {
        teamEl.innerHTML =
          '<span class="comment-empty">No employees found in your department.</span>';
      } else {
        var html = "";
        sameDepartmentEmployees.forEach(function (e) {
          var name = app.buildName(e);
          var dept = e.department || "Unassigned";
          html +=
            '<label class="team-checkbox-item">' +
            '<input type="checkbox" value="' +
            app.esc(e.id) +
            '" data-name="' +
            app.esc(name) +
            '">' +
            "<span>" +
            app.esc(name) +
            "</span>" +
            '<span class="team-checkbox-dept">' +
            app.esc(dept) +
            "</span>" +
            "</label>";
        });
        teamEl.innerHTML = html;
      }
    });

    document.getElementById("pmCreateProjectModal").classList.remove("hidden");
  };

  window.savePMProject = function () {
    app.clearModalNotice("pmProjNotice");
    var name = document.getElementById("pmProjName").value.trim();
    if (!name) {
      app.showModalNotice("pmProjNotice", "Project name is required.", "error");
      return;
    }
    var btn = document.getElementById("pmProjSaveBtn");
    if (btn && btn.disabled) return;
    var dept = document.getElementById("pmProjDepartment").value;
    if (!dept) {
      app.showModalNotice("pmProjNotice", "Department is required.", "error");
      return;
    }
    var budget = parseFloat(document.getElementById("pmProjBudget").value);
    var spent = parseFloat(document.getElementById("pmProjSpent").value);
    var safeBudget = isNaN(budget) ? 0 : budget;
    var safeSpent = isNaN(spent) ? 0 : spent;
    if (safeBudget < 0 || safeSpent < 0) {
      app.showModalNotice(
        "pmProjNotice",
        "Budget and spent values cannot be negative.",
        "error",
      );
      return;
    }
    if (safeSpent > safeBudget && safeBudget > 0) {
      app.showModalNotice(
        "pmProjNotice",
        "Spent cannot exceed budget.",
        "error",
      );
      return;
    }
    var startDate = app.dateInputToMs("pmProjStartDate");
    var endDate = app.dateInputToMs("pmProjEndDate");
    if (startDate && endDate && endDate < startDate) {
      app.showModalNotice(
        "pmProjNotice",
        "End date must be on or after start date.",
        "error",
      );
      return;
    }

    // Gather selected team members
    var teamIds = [];
    var teamNames = [];
    var checkboxes = document.querySelectorAll(
      '#pmProjTeamCheckboxes input[type="checkbox"]:checked',
    );
    checkboxes.forEach(function (cb) {
      teamIds.push(cb.value);
      teamNames.push(cb.getAttribute("data-name") || "");
    });

    var pmName = (app.currentUser && app.currentUser.displayName) || "";
    var pmId = (app.currentUser && app.currentUser.uid) || "";

    var payload = {
      name: name,
      description: document.getElementById("pmProjDescription").value.trim(),
      department: dept,
      projectManager: pmName,
      projectManagerId: pmId,
      priority: document.getElementById("pmProjPriority").value,
      status: "PENDING_APPROVAL",
      budget: safeBudget,
      spent: safeSpent,
      completionPercentage: 0,
      startDate: startDate,
      endDate: endDate,
      teamMemberIds: teamIds,
      teamMemberNames: teamNames,
    };

    if (btn) btn.disabled = true;
    app.fetchMutate(
      "POST",
      "/api/projects",
      payload,
      function () {
        if (btn) btn.disabled = false;
        app.closeModal("pmCreateProjectModal");
        app.showToast("Project submitted for approval", "success");
        logActivity(
          "CREATE",
          "project",
          "",
          payload.name,
          "",
          "PM created project: " + payload.name,
        );
        delete app.cachedData.pmProjects;
        loadPMProjects();
      },
      function (err) {
        if (btn) btn.disabled = false;
        app.showModalNotice(
          "pmProjNotice",
          err || "Failed to create project.",
          "error",
        );
      },
    );
  };

  // ---- Project Detail + Milestones ----
  var pmProjectDetailCache = null;

  function canEditProjectTeamMembers(project) {
    var creatorRole = normalizeKey(project && project.createdByRole);
    if (!creatorRole) return true;
    return creatorRole === "managing_director";
  }

  function renderPMTeamAssignmentControls(project, employees) {
    var listId = "pmProjectTeamAssignList";
    var actionId = "pmProjectTeamAssignActions";
    var noteId = "pmProjectTeamAssignNote";
    var canEdit = canEditProjectTeamMembers(project);
    var selectedSet = {};
    (project.teamMemberIds || []).forEach(function (id) {
      selectedSet[String(id)] = true;
    });

    var options = (employees || [])
      .filter(isSameDepartmentAsCurrentPM)
      .filter(function (e) {
        return !isSamePerson(e, findCurrentPM(employees || []));
      })
      .map(function (e) {
        var name = app.buildName(e);
        var eid = app.esc(e.id || "");
        var checked = selectedSet[e.id] ? " checked" : "";
        return (
          '<label class="team-checkbox-item">' +
          '<input type="checkbox" value="' +
          eid +
          '" data-name="' +
          app.esc(name) +
          '"' +
          checked +
          (canEdit ? "" : " disabled") +
          ">" +
          "<span>" +
          app.esc(name) +
          "</span>" +
          '<span class="team-checkbox-dept">' +
          app.esc(e.department || "Unassigned") +
          "</span>" +
          "</label>"
        );
      })
      .join("");

    return (
      '<div class="detail-row full-width">' +
      '<span class="detail-label">Team Assignment</span>' +
      '<div style="flex:1">' +
      '<div id="' +
      listId +
      '" class="team-checkbox-list">' +
      (options ||
        '<span class="comment-empty">No eligible team members found.</span>') +
      "</div>" +
      '<div id="' +
      actionId +
      '" style="margin-top:10px;display:flex;gap:8px;align-items:center">' +
      '<button class="btn-small btn-primary" onclick="savePMProjectTeamMembers()"' +
      (canEdit ? "" : " disabled") +
      ">Save Team Members</button>" +
      '<span id="' +
      noteId +
      '" class="comment-empty">' +
      (canEdit
        ? "Choose the team members for this project."
        : "Only projects created by a Managing Director can have team members changed by PMs.") +
      "</span>" +
      "</div>" +
      "</div>" +
      "</div>"
    );
  }

  function renderPMProjectDetailInfo(project, employees) {
    var pct = project.completionPercentage || 0;
    var teamCount = (project.teamMemberIds || []).length;
    var teamMembers = findProjectTeamMembers(employees, project);
    document.getElementById("pmProjectDetailInfo").innerHTML =
      '<div class="task-detail-grid">' +
      '<div class="detail-row"><span class="detail-label">Status</span><span class="badge badge-muted">' +
      app.esc(app.formatStatus(project.status || "")) +
      "</span></div>" +
      '<div class="detail-row"><span class="detail-label">Priority</span><span class="card-priority priority-' +
      (project.priority || "MEDIUM").toLowerCase() +
      '">' +
      app.esc(project.priority || "N/A") +
      "</span></div>" +
      '<div class="detail-row"><span class="detail-label">Department</span><span>' +
      app.esc(project.department || "None") +
      "</span></div>" +
      '<div class="detail-row"><span class="detail-label">Team</span><span>' +
      teamCount +
      " member" +
      (teamCount === 1 ? "" : "s") +
      "</span></div>" +
      '<div class="detail-row"><span class="detail-label">Progress</span><div class="project-progress" style="flex:1;margin-left:8px"><div class="project-progress-fill" style="width:' +
      pct +
      '%"></div></div><span style="margin-left:6px">' +
      pct +
      "%</span></div>" +
      '<div class="detail-row"><span class="detail-label">Due</span><span>' +
      (project.endDate ? app.formatTimestamp(project.endDate) : "No deadline") +
      "</span></div>" +
      (project.description
        ? '<div class="detail-row full-width"><span class="detail-label">Description</span><p>' +
          app.esc(project.description) +
          "</p></div>"
        : "") +
      renderProjectTeamBlock(teamMembers) +
      renderPMTeamAssignmentControls(project, employees) +
      "</div>";
  }

  window.openPMProjectDetail = function (projectId) {
    ensurePMData(function (employees, projects) {
      var project = null;
      for (var i = 0; i < projects.length; i++) {
        if (projects[i].id === projectId) {
          project = projects[i];
          break;
        }
      }
      if (!project) return;
      pmProjectDetailCache = project;
      document.getElementById("pmProjectDetailTitle").textContent =
        project.name || "Project Details";
      renderPMProjectDetailInfo(project, employees);
      loadMilestones(projectId);
      document
        .getElementById("pmProjectDetailModal")
        .classList.remove("hidden");
    });
  };

  window.savePMProjectTeamMembers = function () {
    if (!pmProjectDetailCache || !pmProjectDetailCache.id) return;

    var selected = document.querySelectorAll(
      '#pmProjectTeamAssignList input[type="checkbox"]:checked',
    );
    var teamMemberIds = [];
    var teamMemberNames = [];
    selected.forEach(function (el) {
      var id = (el.value || "").trim();
      if (!id) return;
      teamMemberIds.push(id);
      teamMemberNames.push((el.getAttribute("data-name") || "").trim());
    });

    app.fetchMutate(
      "PUT",
      "/api/projects/" + encodeURIComponent(pmProjectDetailCache.id),
      {
        teamMemberIds: teamMemberIds,
        teamMemberNames: teamMemberNames,
      },
      function () {
        app.showToast("Project team updated", "success");
        delete app.cachedData.pmProjects;
        delete app.cachedData.pmEmployees;
        ensurePMData(function (employees, projects) {
          var updated = null;
          for (var i = 0; i < projects.length; i++) {
            if (projects[i].id === pmProjectDetailCache.id) {
              updated = projects[i];
              break;
            }
          }
          if (!updated) return;
          pmProjectDetailCache = updated;
          renderPMProjectDetailInfo(updated, employees);
          loadPMProjects();
        });
      },
      function (err) {
        app.showToast(err || "Failed to update team members", "error");
      },
    );
  };

  function loadMilestones(projectId) {
    var list = document.getElementById("milestonesList");
    if (!list) return;
    list.innerHTML = '<div class="loading-spinner visible"></div>';
    app.fetchJson(
      "/api/workspace/milestones?projectId=" + encodeURIComponent(projectId),
      function (milestones) {
        if (!milestones || milestones.length === 0) {
          list.innerHTML =
            '<div class="comment-empty">No milestones yet. Add milestones to track project phases.</div>';
          return;
        }
        list.innerHTML = milestones
          .map(function (m) {
            var statusClass =
              m.status === "COMPLETED"
                ? "green"
                : m.status === "IN_PROGRESS"
                  ? "blue"
                  : "muted";
            var dueText = m.dueDate
              ? app.formatTimestamp(m.dueDate)
              : "No due date";
            var isOverdue =
              m.dueDate && m.dueDate < Date.now() && m.status !== "COMPLETED";
            var mid = app.esc(m.id || "");
            return (
              '<div class="milestone-item">' +
              '<div class="milestone-item-header">' +
              '<span class="milestone-title">' +
              app.esc(m.title) +
              "</span>" +
              '<span class="badge badge-' +
              statusClass +
              '">' +
              app.esc(app.formatStatus(m.status || "PENDING")) +
              "</span>" +
              "</div>" +
              (m.description
                ? '<div class="milestone-desc">' +
                  app.esc(m.description) +
                  "</div>"
                : "") +
              '<div class="milestone-meta">' +
              '<span class="' +
              (isOverdue ? "overdue" : "") +
              '">Due: ' +
              dueText +
              "</span>" +
              '<button class="btn-tiny" onclick="editMilestone(\'' +
              mid +
              "')\">Edit</button>" +
              '<button class="btn-tiny btn-danger" onclick="deleteMilestone(\'' +
              mid +
              "')\">Delete</button>" +
              "</div></div>"
            );
          })
          .join("");
      },
      function () {
        list.innerHTML =
          '<div class="comment-empty">Failed to load milestones.</div>';
      },
    );
  }

  window.openMilestoneForm = function () {
    document.getElementById("milestoneForm").classList.remove("hidden");
    document.getElementById("milestoneTitle").value = "";
    document.getElementById("milestoneDesc").value = "";
    document.getElementById("milestoneDueDate").value = "";
    document.getElementById("milestoneStatus").value = "PENDING";
    document.getElementById("milestoneId").value = "";
  };

  window.cancelMilestoneForm = function () {
    document.getElementById("milestoneForm").classList.add("hidden");
  };

  window.editMilestone = function (milestoneId) {
    if (!pmProjectDetailCache) return;
    app.fetchJson(
      "/api/workspace/milestones?projectId=" +
        encodeURIComponent(pmProjectDetailCache.id),
      function (milestones) {
        var m = null;
        for (var i = 0; i < milestones.length; i++) {
          if (milestones[i].id === milestoneId) {
            m = milestones[i];
            break;
          }
        }
        if (!m) return;
        document.getElementById("milestoneForm").classList.remove("hidden");
        document.getElementById("milestoneTitle").value = m.title || "";
        document.getElementById("milestoneDesc").value = m.description || "";
        document.getElementById("milestoneDueDate").value = m.dueDate
          ? app.toDateInput(m.dueDate)
          : "";
        document.getElementById("milestoneStatus").value =
          m.status || "PENDING";
        document.getElementById("milestoneId").value = m.id;
      },
    );
  };

  window.saveMilestone = function () {
    if (!pmProjectDetailCache) return;
    var title = document.getElementById("milestoneTitle").value.trim();
    if (!title) {
      app.showToast("Milestone title is required", "error");
      return;
    }
    var mid = document.getElementById("milestoneId").value;
    var dueDate = app.dateInputToMs("milestoneDueDate");
    if (dueDate && dueDate < 0) {
      app.showToast("Invalid milestone due date", "error");
      return;
    }
    var payload = {
      title: title,
      description: document.getElementById("milestoneDesc").value.trim(),
      projectId: pmProjectDetailCache.id,
      projectName: pmProjectDetailCache.name || "",
      dueDate: dueDate,
      status: document.getElementById("milestoneStatus").value,
    };
    var isEdit = !!mid;
    var url = isEdit
      ? "/api/workspace/milestones/" + encodeURIComponent(mid)
      : "/api/workspace/milestones";
    var method = isEdit ? "PUT" : "POST";
    app.fetchMutate(
      method,
      url,
      payload,
      function () {
        app.showToast(
          isEdit ? "Milestone updated" : "Milestone created",
          "success",
        );
        cancelMilestoneForm();
        loadMilestones(pmProjectDetailCache.id);
        logActivity(
          isEdit ? "UPDATE" : "CREATE",
          "milestone",
          mid || "",
          title,
          pmProjectDetailCache.id,
          (isEdit ? "Updated" : "Created") + " milestone: " + title,
        );
      },
      function (err) {
        app.showToast(err || "Failed to save milestone", "error");
      },
    );
  };

  window.deleteMilestone = function (milestoneId) {
    if (!pmProjectDetailCache) return;
    app.showConfirm("Delete this milestone?", function () {
      app.fetchMutate(
        "DELETE",
        "/api/workspace/milestones/" + encodeURIComponent(milestoneId),
        null,
        function () {
          app.showToast("Milestone deleted", "success");
          loadMilestones(pmProjectDetailCache.id);
        },
        function (err) {
          app.showToast(err || "Failed to delete milestone", "error");
        },
      );
    });
  };

  /* ============================================================
       MY TEAM
       ============================================================ */
  var pmPendingApprovalsCache = [];
  var pmTeamChatDepartment = "";
  var pmTeamChatRooms = [];
  var pmTeamChatScope = "dept";
  var pmTeamChatPollTimer = null;
  var pmRequestedChatScope = readPMRequestedChatScope();

  function readPMRequestedChatScope() {
    try {
      return String(
        new URLSearchParams(window.location.search).get("chatScope") || "",
      ).trim();
    } catch (_err) {
      return "";
    }
  }

  function pmChatUserKey() {
    return (
      (app.currentUser && app.currentUser.uid) ||
      (app.currentUser && app.currentUser.email) ||
      "anon"
    );
  }

  function pmChatStorageKey(scopeValue) {
    return "teamChatLastRead:pm:" + pmChatUserKey() + ":" + scopeValue;
  }

  function getPMLastRead(scopeValue) {
    var v = localStorage.getItem(pmChatStorageKey(scopeValue));
    var ts = Number(v);
    return Number.isFinite(ts) ? ts : 0;
  }

  function setPMLastRead(scopeValue, ts) {
    var num = Number(ts) || 0;
    localStorage.setItem(pmChatStorageKey(scopeValue), String(num));
  }

  function stopPMTeamChatPolling() {
    if (pmTeamChatPollTimer) {
      clearInterval(pmTeamChatPollTimer);
      pmTeamChatPollTimer = null;
    }
  }

  function startPMTeamChatPolling() {
    stopPMTeamChatPolling();
    pmTeamChatPollTimer = setInterval(function () {
      loadPMTeamChat();
    }, 30000);
  }

  function renderPMTeamChat(messages) {
    var host = document.getElementById("pmTeamChatList");
    if (!host) return;
    if (!messages || !messages.length) {
      host.innerHTML =
        '<div class="comment-empty">No chat messages yet. Start the conversation.</div>';
      return;
    }
    host.innerHTML = messages
      .map(function (m) {
        var mine =
          app.currentUser &&
          String(m.authorId || "") === String(app.currentUser.uid || "");
        var role = m.authorRole || "USER";
        var pmBadge = app.isProjectManagerRole(role)
          ? '<span class="comment-badge comment-badge-pm">PM</span>'
          : "";
        return (
          '<div class="team-chat-item' +
          (mine ? " mine" : "") +
          '">' +
          '<div class="comment-header"><strong>' +
          app.esc(m.authorName || "Unknown") +
          "</strong>" +
          pmBadge +
          '<span class="comment-role">' +
          app.esc(app.formatRole(role)) +
          "</span>" +
          '<span class="comment-time">' +
          app.esc(app.formatTimestamp(m.createdAt)) +
          "</span></div>" +
          '<div class="comment-text">' +
          app.esc(m.text || "") +
          "</div></div>"
        );
      })
      .join("");
    host.scrollTop = host.scrollHeight;
  }

  function fetchPMRoomMessages(scopeValue, done, fail) {
    var query = "";
    if (!scopeValue || scopeValue === "dept") {
      query =
        "department=" + encodeURIComponent(pmTeamChatDepartment) + "&limit=120";
    } else if (scopeValue.indexOf("proj:") === 0) {
      query =
        "projectId=" +
        encodeURIComponent(scopeValue.substring(5)) +
        "&limit=120";
    } else {
      query =
        "department=" + encodeURIComponent(pmTeamChatDepartment) + "&limit=120";
    }
    app.fetchJson("/api/workspace/team-chat?" + query, done, fail);
  }

  function updatePMTeamChatScopeLabels(unreadMap) {
    var select = document.getElementById("pmTeamChatScope");
    if (!select || !pmTeamChatRooms.length) return;
    var current = pmTeamChatScope || "dept";
    select.innerHTML = pmTeamChatRooms
      .map(function (room) {
        var unread =
          unreadMap && unreadMap[room.value] ? unreadMap[room.value] : 0;
        var suffix = unread > 0 ? " (" + unread + " new)" : "";
        return (
          '<option value="' +
          app.esc(room.value) +
          '">' +
          app.esc(room.baseLabel + suffix) +
          "</option>"
        );
      })
      .join("");
    select.value = current;

    var totalBadge = document.getElementById("pmTeamChatTotalUnread");
    if (totalBadge) {
      var total = 0;
      pmTeamChatRooms.forEach(function (room) {
        if (room.value === current) return;
        total += unreadMap && unreadMap[room.value] ? unreadMap[room.value] : 0;
      });
      totalBadge.textContent = total > 0 ? total + " new" : "";
    }
  }

  function refreshPMUnreadCounts() {
    if (!pmTeamChatRooms.length || !pmTeamChatDepartment) return;
    var pending = pmTeamChatRooms.length;
    var unreadMap = {};
    pmTeamChatRooms.forEach(function (room) {
      fetchPMRoomMessages(
        room.value,
        function (messages) {
          var lastRead = getPMLastRead(room.value);
          var myId = String((app.currentUser && app.currentUser.uid) || "");
          var unread = (messages || []).filter(function (m) {
            var created = Number(m.createdAt) || 0;
            var mine = String(m.authorId || "") === myId;
            return !mine && created > lastRead;
          }).length;
          unreadMap[room.value] = unread;
          pending -= 1;
          if (pending === 0) updatePMTeamChatScopeLabels(unreadMap);
        },
        function () {
          unreadMap[room.value] = 0;
          pending -= 1;
          if (pending === 0) updatePMTeamChatScopeLabels(unreadMap);
        },
      );
    });
  }

  function buildPMTeamChatQuery() {
    if (!pmTeamChatScope || pmTeamChatScope === "dept") {
      return (
        "department=" + encodeURIComponent(pmTeamChatDepartment) + "&limit=120"
      );
    }
    if (pmTeamChatScope.indexOf("proj:") === 0) {
      var projectId = pmTeamChatScope.substring(5);
      return "projectId=" + encodeURIComponent(projectId) + "&limit=120";
    }
    return (
      "department=" + encodeURIComponent(pmTeamChatDepartment) + "&limit=120"
    );
  }

  function buildPMTeamChatPayload(text) {
    if (pmTeamChatScope && pmTeamChatScope.indexOf("proj:") === 0) {
      return {
        projectId: pmTeamChatScope.substring(5),
        text: text,
      };
    }
    return {
      department: pmTeamChatDepartment,
      text: text,
    };
  }

  function renderPMTeamChatScopeOptions(managedProjects) {
    var select = document.getElementById("pmTeamChatScope");
    if (!select) return;
    var options = [];
    var seen = {};
    options.push({ value: "dept", baseLabel: "Department Room" });
    (managedProjects || []).forEach(function (p) {
      if (!p || !p.id || seen[p.id]) return;
      seen[p.id] = true;
      options.push({
        value: "proj:" + p.id,
        baseLabel: "Project: " + (p.name || "Untitled"),
      });
    });
    pmTeamChatRooms = options;
    if (
      pmRequestedChatScope &&
      options.some(function (opt) {
        return opt.value === pmRequestedChatScope;
      })
    ) {
      pmTeamChatScope = pmRequestedChatScope;
    }
    pmRequestedChatScope = "";
    updatePMTeamChatScopeLabels({});

    var stillValid = options.some(function (opt) {
      return opt.value === pmTeamChatScope;
    });
    if (!stillValid) pmTeamChatScope = "dept";
    select.value = pmTeamChatScope;
    refreshPMUnreadCounts();
  }

  window.onPMTeamChatScopeChange = function () {
    var select = document.getElementById("pmTeamChatScope");
    if (!select) return;
    pmTeamChatScope = select.value || "dept";
    loadPMTeamChat();
  };

  window.loadPMTeamChat = function () {
    var host = document.getElementById("pmTeamChatList");
    if (!host) return;
    if (!pmTeamChatDepartment) {
      host.innerHTML =
        '<div class="comment-empty">Set your department to use team chat.</div>';
      return;
    }
    app.fetchJson(
      "/api/workspace/team-chat?" + buildPMTeamChatQuery(),
      function (messages) {
        var list = messages || [];
        var previousLastRead = getPMLastRead(pmTeamChatScope || "dept");
        var myId = String((app.currentUser && app.currentUser.uid) || "");
        var hasIncoming = list.some(function (m) {
          return (
            String(m.authorId || "") !== myId &&
            (Number(m.createdAt) || 0) > previousLastRead
          );
        });
        renderPMTeamChat(list);
        var newest = list.length
          ? Math.max.apply(
              null,
              list.map(function (m) {
                return Number(m.createdAt) || 0;
              }),
            )
          : Date.now();
        setPMLastRead(pmTeamChatScope || "dept", newest);
        refreshPMUnreadCounts();
        if (hasIncoming && typeof app.refreshNotifications === "function") {
          app.refreshNotifications();
        }
      },
      function () {
        host.innerHTML =
          '<div class="comment-empty">Failed to load team chat.</div>';
      },
    );
  };

  window.postPMTeamChatMessage = function () {
    var input = document.getElementById("pmTeamChatInput");
    var btn = document.getElementById("pmTeamChatSendBtn");
    if (!input || !btn) return;
    var text = (input.value || "").trim();
    if (!text) {
      app.showToast("Please enter a message", "warning");
      return;
    }
    if (!pmTeamChatDepartment) {
      app.showToast("Department is required for team chat", "error");
      return;
    }
    btn.disabled = true;
    app.fetchMutate(
      "POST",
      "/api/workspace/team-chat",
      buildPMTeamChatPayload(text),
      function () {
        input.value = "";
        btn.disabled = false;
        loadPMTeamChat();
      },
      function (err) {
        btn.disabled = false;
        app.showToast(err || "Failed to send message", "error");
      },
    );
  };

  function loadPMDepartmentApprovals() {
    var listEl = document.getElementById("pmDeptApprovalsList");
    if (!listEl) return;

    app.fetchJson(
      "/api/employees?pendingUsers=true",
      function (users) {
        pmPendingApprovalsCache = (users || []).filter(function (u) {
          return (
            u &&
            normalizeKey(u.role) === "employee" &&
            u.mdApproved === true &&
            u.pmApproved !== true
          );
        });

        if (!pmPendingApprovalsCache.length) {
          listEl.innerHTML =
            '<div class="empty-state">No employees are waiting for your approval.</div>';
          return;
        }

        listEl.innerHTML = pmPendingApprovalsCache
          .map(function (u) {
            var name = app.buildName(u);
            var uid = app.esc(u.id || "");
            return (
              '<div class="user-row">' +
              '<div class="user-row-avatar">' +
              app.initials(name) +
              "</div>" +
              '<div class="user-row-info"><div class="user-row-name">' +
              app.esc(name) +
              "</div>" +
              '<div class="user-row-email">' +
              app.esc(u.email || "") +
              "</div></div>" +
              '<span class="badge badge-muted">' +
              app.esc(u.department || "No Department") +
              "</span>" +
              '<div class="user-row-actions">' +
              '<button class="btn-approve-sm" onclick="approvePMDepartmentEmployee(\'' +
              uid +
              "')\">Approve</button>" +
              "</div></div>"
            );
          })
          .join("");
      },
      function (err) {
        pmPendingApprovalsCache = [];
        listEl.innerHTML =
          '<div class="empty-state">Failed to load pending approvals.</div>';
        if (err) app.showToast(err, "error");
      },
    );
  }

  window.approvePMDepartmentEmployee = function (id) {
    if (!id) return;
    app.fetchMutate(
      "PUT",
      "/api/employees/" + encodeURIComponent(id) + "?approveUser=true",
      {},
      function () {
        app.showToast("Employee approved", "success");
        loadPMDepartmentApprovals();
      },
      function (err) {
        app.showToast(err || "Approval failed", "error");
      },
    );
  };

  window.approveAllPMDepartmentEmployees = function () {
    var ids = (pmPendingApprovalsCache || [])
      .map(function (u) {
        return u.id;
      })
      .filter(Boolean);
    if (!ids.length) {
      app.showToast("No pending employees to approve.", "warning");
      return;
    }
    app.showConfirm(
      "Approve " + ids.length + " employee accounts in your department?",
      function () {
        app.fetchMutate(
          "PUT",
          "/api/employees?pmApproveUsers=true",
          { userIds: ids },
          function (resp) {
            var count =
              resp && resp.approvedCount ? resp.approvedCount : ids.length;
            app.showToast(count + " employee accounts approved", "success");
            loadPMDepartmentApprovals();
          },
          function (err) {
            app.showToast(err || "Bulk approval failed", "error");
          },
        );
      },
    );
  };

  function loadPMTeamMilestones(managedProjects) {
    var listEl = document.getElementById("pmTeamMilestones");
    if (!listEl) return;

    var projects = managedProjects || [];
    if (!projects.length) {
      listEl.innerHTML =
        '<div class="empty-state">No managed projects found. Milestones will appear here once projects are assigned to you.</div>';
      return;
    }

    var projectIds = {};
    projects.forEach(function (p) {
      if (p && p.id) projectIds[p.id] = true;
    });

    app.fetchJson(
      "/api/workspace/milestones",
      function (milestones) {
        var rows = (milestones || []).filter(function (m) {
          return !!projectIds[m.projectId];
        });

        if (!rows.length) {
          listEl.innerHTML =
            '<div class="empty-state">No milestones found for your managed projects.</div>';
          return;
        }

        var now = Date.now();
        var overdueCount = rows.filter(function (m) {
          return (
            m.dueDate &&
            m.dueDate < now &&
            String(m.status || "").toUpperCase() !== "COMPLETED"
          );
        }).length;
        var activeCount = rows.filter(function (m) {
          var s = String(m.status || "").toUpperCase();
          return s === "PENDING" || s === "IN_PROGRESS" || s === "BLOCKED";
        }).length;

        rows.sort(function (a, b) {
          var ad = a.dueDate || Number.MAX_SAFE_INTEGER;
          var bd = b.dueDate || Number.MAX_SAFE_INTEGER;
          return ad - bd;
        });

        var summary =
          '<div class="milestone-meta" style="margin-bottom:10px">' +
          '<span class="badge badge-muted">Total: ' +
          rows.length +
          "</span>" +
          '<span class="badge badge-blue">Active: ' +
          activeCount +
          "</span>" +
          '<span class="badge badge-orange">Overdue: ' +
          overdueCount +
          "</span>" +
          "</div>";

        var items = rows
          .slice(0, 8)
          .map(function (m) {
            var status = String(m.status || "PENDING").toUpperCase();
            var statusClass =
              status === "COMPLETED"
                ? "green"
                : status === "IN_PROGRESS"
                  ? "blue"
                  : "muted";
            var isOverdue =
              m.dueDate && m.dueDate < now && status !== "COMPLETED";
            var dueText = m.dueDate
              ? app.formatTimestamp(m.dueDate)
              : "No due date";
            return (
              '<div class="milestone-item">' +
              '<div class="milestone-item-header">' +
              '<span class="milestone-title">' +
              app.esc(m.title || "Untitled milestone") +
              "</span>" +
              '<span class="badge badge-' +
              statusClass +
              '\">' +
              app.esc(app.formatStatus(status)) +
              "</span></div>" +
              '<div class="milestone-meta">' +
              '<span class="badge badge-muted">' +
              app.esc(m.projectName || "Unknown project") +
              "</span>" +
              '<span class="' +
              (isOverdue ? "overdue" : "") +
              '\">Due: ' +
              app.esc(dueText) +
              "</span>" +
              "</div></div>"
            );
          })
          .join("");

        if (rows.length > 8) {
          items +=
            '<div class="comment-empty">Showing 8 of ' +
            rows.length +
            " milestones.</div>";
        }

        listEl.innerHTML = summary + items;
      },
      function () {
        listEl.innerHTML =
          '<div class="empty-state">Failed to load team milestones.</div>';
      },
    );
  }

  window.loadPMTeam = function () {
    loadPMDepartmentApprovals();
    ensurePMData(function (employees, projects) {
      var managed = findManagedProjects(projects);
      var me = findCurrentPM(employees);
      pmTeamChatDepartment = me ? me.department || "" : "";
      renderPMTeamChatScopeOptions(managed);
      var team = findTeamMembers(employees, managed).filter(function (member) {
        return !isSamePerson(member, me);
      });
      loadPMTeamMilestones(managed);

      // Group by department
      var groups = {};
      var noDept = [];
      team.forEach(function (e) {
        var dept = (e.department || "").trim();
        if (!dept) {
          noDept.push(e);
          return;
        }
        if (!groups[dept]) groups[dept] = [];
        groups[dept].push(e);
      });
      var sortedDepts = Object.keys(groups).sort(function (a, b) {
        return a.localeCompare(b);
      });
      var deptCount = sortedDepts.length + (noDept.length > 0 ? 1 : 0);

      document.getElementById("pmTeamStats").innerHTML =
        pmStatCard(
          managed.length,
          "Projects",
          "Under your management",
          "blue",
        ) +
        pmStatCard(
          team.length,
          "Team Members",
          "Across all projects",
          "green",
        ) +
        pmStatCard(deptCount, "Departments", "Team org groups", "purple");

      var html = "";
      if (team.length === 0) {
        html =
          '<div class="empty-state">No team members found. Team members from your projects will appear here.</div>';
      } else {
        if (noDept.length > 0) {
          html += renderPMTeamDeptGroup("Unassigned", noDept, true);
        }
        sortedDepts.forEach(function (dept) {
          html += renderPMTeamDeptGroup(dept, groups[dept], false);
        });
      }
      document.getElementById("pmTeamList").innerHTML = html;

      loadPMTeamChat();
      startPMTeamChatPolling();
    });
  };

  window.addEventListener("beforeunload", stopPMTeamChatPolling);

  function renderPMTeamDeptGroup(deptName, members, isUnassigned) {
    members.sort(function (a, b) {
      return ((a.fullName || a.firstName || "") + "").localeCompare(
        (b.fullName || b.firstName || "") + "",
      );
    });
    var cls = isUnassigned ? " dept-group-warning" : "";
    var rows = members
      .map(function (e) {
        var name = app.buildName(e);
        var setDeptBtn = isUnassigned
          ? ' <button class="btn-set-dept-sm" onclick="openQuickDeptModal(\'' +
            app.esc(e.id || "") +
            "','" +
            app.esc(name).replace(/'/g, "") +
            "')\">Set Dept</button>"
          : "";
        return (
          '<div class="emp-team-row">' +
          '<div class="emp-team-avatar pm-avatar">' +
          app.initials(name) +
          "</div>" +
          '<div class="emp-team-info"><div class="emp-team-name">' +
          app.esc(name) +
          "</div>" +
          '<div class="emp-team-meta">' +
          app.esc(e.position || "No position") +
          " \u2022 " +
          app.esc(e.email || "") +
          "</div></div>" +
          '<span class="badge badge-green">' +
          app.esc(e.status || "ACTIVE") +
          "</span>" +
          setDeptBtn +
          "</div>"
        );
      })
      .join("");
    return (
      '<div class="dept-group' +
      cls +
      '">' +
      '<div class="dept-group-header">' +
      '<span class="dept-group-name">' +
      app.esc(deptName) +
      "</span>" +
      '<span class="dept-group-count">' +
      members.length +
      " member" +
      (members.length === 1 ? "" : "s") +
      "</span></div>" +
      '<div class="dept-group-list">' +
      rows +
      "</div></div>"
    );
  }

  /* ============================================================
       TEAM TIMESHEETS
       ============================================================ */
  window.loadPMTimesheet = function () {
    ensurePMData(function (employees, projects) {
      var managed = findManagedProjects(projects);
      var team = findTeamMembers(employees, managed);

      app.fetchJson(
        "/api/workspace/timesheets",
        function (entries) {
          renderPMTimesheetUI(entries, team, managed);
        },
        function () {
          renderPMTimesheetUI([], team, managed);
        },
      );
    });
  };

  function renderPMTimesheetUI(entries, team, managed) {
    var totalHours = entries.reduce(function (s, e) {
      return s + (e.hours || 0);
    }, 0);
    var uniqueEmployees = {};
    entries.forEach(function (e) {
      if (e.employeeId) uniqueEmployees[e.employeeId] = true;
    });

    document.getElementById("pmTimesheetStats").innerHTML =
      pmStatCard(
        totalHours.toFixed(1) + "h",
        "Total Hours",
        "Across all team members",
        "blue",
      ) +
      pmStatCard(
        Object.keys(uniqueEmployees).length,
        "Contributors",
        "Employees logging time",
        "green",
      ) +
      pmStatCard(entries.length, "Entries", "Total time entries", "purple");

    var html = "";
    if (entries.length === 0) {
      html =
        '<div class="empty-state">No timesheet entries from your team yet.</div>';
    } else {
      entries.slice(0, 15).forEach(function (e) {
        var dateStr = app.formatTimestamp(e.date);
        html +=
          '<div class="emp-info-row">' +
          '<div class="emp-info-content"><div class="emp-info-title">' +
          app.esc(e.projectName || "Unknown Project") +
          " \u2014 " +
          app.esc(e.hours + "h") +
          '</div><div class="emp-info-desc">' +
          app.esc(dateStr) +
          (e.description ? " \u2022 " + app.esc(e.description) : "") +
          "</div></div>" +
          '<span class="badge badge-blue">' +
          app.esc(e.hours + "h") +
          "</span></div>";
      });
    }
    document.getElementById("pmTimeEntries").innerHTML = html;

    // Team summary
    var summaryHtml = "";
    if (team.length === 0) {
      summaryHtml = '<div class="empty-state">No team data available.</div>';
    } else {
      team.slice(0, 8).forEach(function (member) {
        var memberHours = entries
          .filter(function (e) {
            return e.employeeId === member.id;
          })
          .reduce(function (s, e) {
            return s + (e.hours || 0);
          }, 0);
        var name = app.buildName(member);
        summaryHtml += pmInfoRow(
          name,
          memberHours.toFixed(1) + "h logged",
          member.position || "Employee",
        );
      });
    }
    document.getElementById("pmTeamSummary").innerHTML = summaryHtml;
  }

  /* ============================================================
       LEAVE REQUESTS (team view)
       ============================================================ */
  window.loadPMRequests = function () {
    app.fetchJson(
      "/api/workspace/leave-requests",
      function (requests) {
        renderPMRequestsUI(requests);
      },
      function () {
        renderPMRequestsUI([]);
      },
    );
  };

  function renderPMRequestsUI(requests) {
    var pending = requests.filter(function (r) {
      return r.status === "PENDING";
    }).length;
    var approved = requests.filter(function (r) {
      return r.status === "APPROVED";
    }).length;
    var rejected = requests.filter(function (r) {
      return r.status === "REJECTED";
    }).length;

    document.getElementById("pmRequestsStats").innerHTML =
      pmStatCard(
        requests.length,
        "Total Requests",
        "All leave requests",
        "blue",
      ) +
      pmStatCard(pending, "Pending", "Awaiting review", "orange") +
      pmStatCard(approved, "Approved", "Accepted requests", "green") +
      pmStatCard(rejected, "Rejected", "Declined requests", "purple");

    var html = "";
    if (requests.length === 0) {
      html = '<div class="empty-state">No leave requests to review.</div>';
    } else {
      requests.forEach(function (r) {
        var startStr = app.formatTimestamp(r.startDate);
        var endStr = app.formatTimestamp(r.endDate);
        var badgeClass =
          r.status === "APPROVED"
            ? "badge-green"
            : r.status === "REJECTED"
              ? "badge-red"
              : "badge-orange";
        var rid = app.esc(r.id || "");
        html +=
          '<div class="emp-info-row">' +
          '<div class="emp-info-content"><div class="emp-info-title">' +
          app.esc(r.type) +
          " Leave" +
          (r.employeeName ? " \u2014 " + app.esc(r.employeeName) : "") +
          '</div><div class="emp-info-desc">' +
          app.esc(startStr) +
          " \u2013 " +
          app.esc(endStr) +
          (r.reason ? " \u2022 " + app.esc(r.reason) : "") +
          "</div></div>" +
          '<div class="request-actions">';
        if (r.status === "PENDING") {
          html +=
            '<button class="btn-approve-sm" data-request-id="' +
            rid +
            '" onclick="reviewLeaveRequest(\'' +
            rid +
            "','APPROVED')\">Approve</button>" +
            '<button class="btn-reject-sm" data-request-id="' +
            rid +
            '" onclick="reviewLeaveRequest(\'' +
            rid +
            "','REJECTED')\">Reject</button>";
        } else {
          html +=
            '<span class="badge ' +
            badgeClass +
            '">' +
            app.esc(r.status) +
            "</span>";
        }
        html += "</div></div>";
      });
    }
    document.getElementById("pmRequestsList").innerHTML = html;
  }

  window.reviewLeaveRequest = function (id, status) {
    if (!id || !status) return;
    var buttons = document.querySelectorAll(
      '.request-actions button[data-request-id="' + id + '"]',
    );
    buttons.forEach(function (b) {
      b.disabled = true;
    });
    app.fetchMutate(
      "PUT",
      "/api/workspace/leave-requests",
      { id: id, status: status },
      function () {
        app.showToast("Request " + status.toLowerCase(), "success");
        loadPMRequests();
      },
      function (err) {
        app.showToast(err || "Failed to update request", "error");
        buttons.forEach(function (b) {
          b.disabled = false;
        });
      },
    );
  };

  window.loadPMTimesheet = function () {
    ensurePMData(function (employees, projects) {
      var managed = findManagedProjects(projects);
      var team = findTeamMembers(employees, managed);
      var managedIds = {};
      var teamIds = {};
      managed.forEach(function (project) {
        managedIds[project.id] = true;
      });
      team.forEach(function (member) {
        teamIds[member.id] = true;
      });

      app.fetchJson(
        "/api/workspace/timesheets",
        function (entries) {
          var filtered = (entries || []).filter(function (entry) {
            return managedIds[entry.projectId] || teamIds[entry.employeeId];
          });
          renderPMTimesheetUI(filtered, team, managed);
        },
        function () {
          renderPMTimesheetUI([], team, managed);
        },
      );
    });
  };

  function renderPMTimesheetUI(entries, team, managed) {
    var now = new Date();
    now.setHours(0, 0, 0, 0);
    var dayOfWeek = now.getDay() || 7;
    var weekStart = new Date(now);
    weekStart.setDate(now.getDate() - dayOfWeek + 1);
    var weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);
    var weekEntries = entries.filter(function (entry) {
      var ts = entry.date > 1e12 ? entry.date : entry.date * 1000;
      return ts >= weekStart.getTime() && ts < weekEnd.getTime();
    });

    var totalHours = weekEntries.reduce(function (sum, entry) {
      return sum + (entry.hours || 0);
    }, 0);
    var uniqueEmployees = {};
    weekEntries.forEach(function (entry) {
      if (entry.employeeId) uniqueEmployees[entry.employeeId] = true;
    });
    var flaggedMembers = team.filter(function (member) {
      var hours = weekEntries
        .filter(function (entry) {
          return entry.employeeId === member.id;
        })
        .reduce(function (sum, entry) {
          return sum + (entry.hours || 0);
        }, 0);
      return hours > 40 || (hours < 20 && weekEntries.length > 0);
    }).length;

    document.getElementById("pmTimesheetStats").innerHTML =
      pmStatCard(
        totalHours.toFixed(1) + "h",
        "This Week",
        "Logged on your projects",
        "blue",
      ) +
      pmStatCard(
        Object.keys(uniqueEmployees).length,
        "Contributors",
        "Team members active this week",
        "green",
      ) +
      pmStatCard(flaggedMembers, "Attention", "Low or high hour totals", "orange") +
      pmStatCard(entries.length, "Entries", "All captured records", "purple");

    var entryHtml = "";
    if (!weekEntries.length) {
      entryHtml =
        '<div class="empty-state">No timesheet entries from your team this week yet.</div>';
    } else {
      weekEntries
        .slice()
        .sort(function (a, b) {
          return (b.date || 0) - (a.date || 0);
        })
        .slice(0, 18)
        .forEach(function (entry) {
          entryHtml +=
            '<div class="emp-info-row timesheet-entry-row">' +
            '<div class="emp-info-content"><div class="emp-info-title">' +
            app.esc(entry.employeeName || "Unknown teammate") +
            " · " +
            app.esc(entry.projectName || "Unknown Project") +
            " · " +
            app.esc((entry.hours || 0) + "h") +
            '</div><div class="emp-info-desc">' +
            app.esc(app.formatTimestamp(entry.date)) +
            (entry.taskTitle ? " \u2022 " + app.esc(entry.taskTitle) : "") +
            (entry.description ? " \u2022 " + app.esc(entry.description) : "") +
            "</div></div>" +
            '<span class="badge badge-blue">' +
            app.esc((entry.hours || 0) + "h") +
            "</span></div>";
        });
    }
    document.getElementById("pmTimeEntries").innerHTML = entryHtml;

    var summaryHtml = "";
    if (!team.length) {
      summaryHtml = '<div class="empty-state">No team data available.</div>';
    } else {
      summaryHtml = team
        .map(function (member) {
          var memberHours = weekEntries
            .filter(function (entry) {
              return entry.employeeId === member.id;
            })
            .reduce(function (sum, entry) {
              return sum + (entry.hours || 0);
            }, 0);
          var utilization = Math.min(100, Math.round((memberHours / 40) * 100));
          return (
            '<div class="mini-progress-row">' +
            '<div class="mini-progress-label"><span>' +
            app.esc(app.buildName(member)) +
            "</span><strong>" +
            app.esc(memberHours.toFixed(1) + "h") +
            '</strong></div><div class="mini-progress-track"><span style="width:' +
            utilization +
            '%"></span></div></div>'
          );
        })
        .join("");
    }
    document.getElementById("pmTeamSummary").innerHTML = summaryHtml;

    var projectBreakdown = {};
    weekEntries.forEach(function (entry) {
      var key = entry.projectName || "Unknown Project";
      projectBreakdown[key] = (projectBreakdown[key] || 0) + Number(entry.hours || 0);
    });
    var projectHtml = Object.keys(projectBreakdown)
      .sort(function (a, b) {
        return projectBreakdown[b] - projectBreakdown[a];
      })
      .map(function (name) {
        var hours = projectBreakdown[name];
        var width = totalHours ? Math.max(8, Math.round((hours / totalHours) * 100)) : 0;
        return (
          '<div class="mini-progress-row">' +
          '<div class="mini-progress-label"><span>' +
          app.esc(name) +
          "</span><strong>" +
          app.esc(hours.toFixed(1) + "h") +
          '</strong></div><div class="mini-progress-track"><span style="width:' +
          width +
          '%"></span></div></div>'
        );
      })
      .join("");
    var projectBreakdownEl = document.getElementById("pmProjectBreakdown");
    if (projectBreakdownEl) {
      projectBreakdownEl.innerHTML = projectHtml
        ? projectHtml
        : '<div class="comment-empty">Project allocation appears once the team logs time.</div>';
    }
  }

  window.loadPMRequests = function () {
    app.fetchJson(
      "/api/workspace/leave-requests",
      function (requests) {
        renderPMRequestsUI(requests || []);
      },
      function () {
        renderPMRequestsUI([]);
      },
    );
  };

  function renderPMRequestsUI(requests) {
    requests = (requests || []).slice().sort(function (a, b) {
      var aPending = a.status === "PENDING" ? 0 : 1;
      var bPending = b.status === "PENDING" ? 0 : 1;
      if (aPending !== bPending) return aPending - bPending;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
    var pending = requests.filter(function (r) {
      return r.status === "PENDING";
    }).length;
    var approved = requests.filter(function (r) {
      return r.status === "APPROVED";
    }).length;
    var rejected = requests.filter(function (r) {
      return r.status === "REJECTED";
    }).length;

    document.getElementById("pmRequestsStats").innerHTML =
      pmStatCard(requests.length, "Total Requests", "All leave requests", "blue") +
      pmStatCard(pending, "Pending", "Awaiting review", "orange") +
      pmStatCard(approved, "Approved", "Accepted requests", "green") +
      pmStatCard(rejected, "Rejected", "Declined requests", "purple");

    var html = "";
    if (!requests.length) {
      html = '<div class="empty-state">No leave requests to review.</div>';
    } else {
      requests.forEach(function (r) {
        var badgeClass =
          r.status === "APPROVED"
            ? "badge-green"
            : r.status === "REJECTED"
              ? "badge-red"
              : r.status === "CANCELLED"
                ? "badge-muted"
                : "badge-orange";
        var rid = app.esc(r.id || "");
        html +=
          '<div class="emp-info-row leave-request-row">' +
          '<div class="emp-info-content"><div class="emp-info-title">' +
          app.esc(r.type) +
          " Leave" +
          (r.employeeName ? " · " + app.esc(r.employeeName) : "") +
          (r.businessDays ? " · " + app.esc(r.businessDays + " business day(s)") : "") +
          '</div><div class="emp-info-desc">' +
          app.esc(app.formatTimestamp(r.startDate)) +
          " \u2013 " +
          app.esc(app.formatTimestamp(r.endDate)) +
          (r.reason ? " \u2022 " + app.esc(r.reason) : "") +
          (r.reviewNote ? " \u2022 Review: " + app.esc(r.reviewNote) : "") +
          "</div>" +
          ((r.supportingDocuments && r.supportingDocuments.length) || 0
            ? '<div class="attachment-list-wrap">' +
              buildAttachmentList(
                r.supportingDocuments,
                "No supporting documents attached.",
              ) +
              "</div>"
            : "") +
          (r.status === "PENDING"
            ? '<textarea class="task-review-notes" id="leaveReviewNote_' +
              rid +
              '" rows="2" placeholder="Add a decision note (optional)"></textarea>'
            : "") +
          "</div><div class=\"request-actions\">";
        if (r.status === "PENDING") {
          html +=
            '<button class="btn-approve-sm" data-request-id="' +
            rid +
            '" onclick="reviewLeaveRequest(\'' +
            rid +
            "','APPROVED')\">Approve</button>" +
            '<button class="btn-reject-sm" data-request-id="' +
            rid +
            '" onclick="reviewLeaveRequest(\'' +
            rid +
            "','REJECTED')\">Reject</button>";
        } else {
          html +=
            '<span class="badge ' +
            badgeClass +
            '">' +
            app.esc(r.status) +
            "</span>";
        }
        html += "</div></div>";
      });
    }
    document.getElementById("pmRequestsList").innerHTML = html;
  }

  window.reviewLeaveRequest = function (id, status) {
    if (!id || !status) return;
    var buttons = document.querySelectorAll(
      '.request-actions button[data-request-id="' + id + '"]',
    );
    buttons.forEach(function (button) {
      button.disabled = true;
    });
    var noteEl = document.getElementById("leaveReviewNote_" + id);
    app.fetchMutate(
      "PUT",
      "/api/workspace/leave-requests",
      {
        id: id,
        status: status,
        reviewNote: noteEl ? noteEl.value : "",
      },
      function () {
        app.showToast("Request " + status.toLowerCase(), "success");
        loadPMRequests();
      },
      function (err) {
        app.showToast(err || "Failed to update request", "error");
        buttons.forEach(function (button) {
          button.disabled = false;
        });
      },
    );
  };

  /* ============================================================
       DOCUMENTS
       ============================================================ */
  window.loadPMDocuments = function () {
    ensurePMData(function (employees, projects) {
      var managed = findManagedProjects(projects);

      app.fetchJson(
        "/api/workspace/documents",
        function (docs) {
          renderPMDocumentsUI(docs, managed);
        },
        function () {
          renderPMDocumentsUI([], managed);
        },
      );
    });
  };

  function renderPMDocumentsUI(docs, managed) {
    var policies = docs.filter(function (d) {
      return d.category === "POLICY";
    });
    var templates = docs.filter(function (d) {
      return d.category === "TEMPLATE";
    });
    var briefs = docs.filter(function (d) {
      return d.category === "PROJECT_BRIEF";
    });

    document.getElementById("pmDocsStats").innerHTML =
      pmStatCard(docs.length, "Total Docs", "Available documents", "blue") +
      pmStatCard(policies.length, "Policies", "Company policies", "green") +
      pmStatCard(
        templates.length + briefs.length,
        "Resources",
        "Templates & briefs",
        "purple",
      );

    var companyDocs = policies.concat(templates);
    var html = "";
    if (companyDocs.length === 0) {
      html =
        '<div class="empty-state">No company documents available yet.</div>';
    } else {
      companyDocs.forEach(function (d) {
        html += pmInfoRow(
          d.name || "Untitled",
          d.description || "No description",
          d.category,
        );
      });
    }
    document.getElementById("pmCompanyDocs").innerHTML = html;

    var projHtml = "";
    if (briefs.length === 0 && managed.length === 0) {
      projHtml = '<div class="empty-state">No project documents</div>';
    } else {
      briefs.forEach(function (d) {
        projHtml += pmInfoRow(
          d.name || "Untitled",
          d.description || "No description",
          "BRIEF",
        );
      });
      managed.slice(0, 5).forEach(function (p) {
        projHtml += pmInfoRow(
          "Brief: " + (p.name || "Untitled"),
          "Last update " + app.formatTimestamp(p.updatedAt),
          "PROJECT",
        );
      });
    }
    document.getElementById("pmProjectDocs").innerHTML = projHtml;
  }

  /* ============================================================
       MY PROFILE
       ============================================================ */
  window.loadPMProfile = function () {
    ensurePMData(function (employees, projects) {
      var me = findCurrentPM(employees);

      if (!me) {
        document.getElementById("pmProfileStats").innerHTML = pmStatCard(
          "Unavailable",
          "Profile",
          "No employee record matched your account",
          "purple",
        );
        document.getElementById("pmProfileContent").innerHTML =
          '<div class="empty-state">Profile not found. Try reloading.</div>';
        return;
      }

      var name = app.buildName(me);
      var managedProjects = findManagedProjects(projects || []);
      var activeManaged = managedProjects.filter(isPMActive).length;
      var roleLabel = app.currentUser
        ? app.formatRole(app.currentUser.role)
        : app.formatRole(me.position || "PROJECT_MANAGER");
      var profileUpdatedAt = me.updatedAt || me.createdAt || 0;
      document.getElementById("pmProfileStats").innerHTML =
        pmStatCard(
          me.department || "N/A",
          "Department",
          "Assigned department",
          "blue",
        ) +
        pmStatCard(me.position || "N/A", "Position", "Current role", "green") +
        pmStatCard(
          activeManaged,
          "Active Projects",
          "Projects currently managed",
          "purple",
        );

      var statusClass =
        (me.status || "").toUpperCase() === "ACTIVE"
          ? "badge-green"
          : "badge-orange";
      document.getElementById("pmProfileContent").innerHTML =
        '<div class="emp-profile-header">' +
        '<div class="emp-profile-avatar pm-avatar">' +
        app.initials(name) +
        "</div>" +
        '<div class="emp-profile-info">' +
        '<div class="emp-profile-name">' +
        app.esc(name) +
        "</div>" +
        '<div class="emp-profile-position">' +
        app.esc(me.position || "N/A") +
        " \u2014 " +
        app.esc(me.department || "N/A") +
        "</div>" +
        '<span class="badge ' +
        statusClass +
        '">' +
        app.esc(me.status || "N/A") +
        "</span>" +
        "</div></div>" +
        '<div class="emp-profile-details">' +
        pmProfileRow("Full Name", name) +
        pmProfileRow("Email", me.email || "N/A") +
        pmProfileRow("Phone", me.phone || "N/A") +
        pmProfileRow("Account Role", roleLabel) +
        pmProfileRow("Approval Status", pmApprovalStatusLabel()) +
        pmProfileRow(
          "Hire Date",
          me.hireDate ? app.formatTimestamp(me.hireDate) : "N/A",
        ) +
        pmProfileRow(
          "Last Profile Update",
          profileUpdatedAt ? app.formatTimestamp(profileUpdatedAt) : "N/A",
        ) +
        "</div>";
    });
  };

  function isSamePerson(a, b) {
    if (!a || !b) return false;
    var aId = normalizeKey(a.id || a.uid || a.userId);
    var bId = normalizeKey(b.id || b.uid || b.userId);
    var aEmail = normalizeKey(a.email);
    var bEmail = normalizeKey(b.email);
    var aName = normalizeKey(app.buildName(a));
    var bName = normalizeKey(app.buildName(b));

    if (aId && bId && aId === bId) return true;
    if (aEmail && bEmail && aEmail === bEmail) return true;
    if (aName && bName && aName === bName) return true;
    return false;
  }

  function pmApprovalStatusLabel() {
    if (!app.currentUser) return "N/A";
    if (app.currentUser.mdApproved === true) return "Approved";
    return "Pending Approval";
  }

  function findCurrentPM(employees) {
    if (!app.currentUser) return null;
    var uid = (app.currentUser.uid || "").toLowerCase();
    var email = (app.currentUser.email || "").toLowerCase();
    var name = (app.currentUser.displayName || "").toLowerCase();
    for (var i = 0; i < employees.length; i++) {
      var e = employees[i];
      var eId = (e.id || "").toLowerCase();
      var eEmail = (e.email || "").toLowerCase();
      var eName = (
        e.fullName ||
        ((e.firstName || "") + " " + (e.lastName || "")).trim() ||
        ""
      ).toLowerCase();
      if (
        (uid && uid === eId) ||
        (email && email === eEmail) ||
        (name && name === eName)
      )
        return e;
    }
    return null;
  }
})(ShenanigansApp);
