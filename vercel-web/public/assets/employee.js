/* Shenanigans Web — Employee Workspace Logic (employee.js) */
(function (app) {
  "use strict";

  /* ============================================================
       SHARED EMPLOYEE HELPERS
       ============================================================ */
  function ensureEmpData(cb) {
    if (app.cachedData.empEmployees && app.cachedData.empProjects) {
      cb(app.cachedData.empEmployees, app.cachedData.empProjects);
      return;
    }
    var done = { e: null, p: null };
    app.fetchJson(
      "/api/employees",
      function (data) {
        app.cachedData.empEmployees = data;
        done.e = data;
        if (done.p !== null) cb(done.e, done.p);
      },
      function () {
        app.cachedData.empEmployees = [];
        done.e = [];
        if (done.p !== null) cb(done.e, done.p);
      },
    );
    app.fetchJson(
      "/api/projects",
      function (data) {
        app.cachedData.empProjects = data;
        done.p = data;
        if (done.e !== null) cb(done.e, done.p);
      },
      function () {
        app.cachedData.empProjects = [];
        done.p = [];
        if (done.e !== null) cb(done.e, done.p);
      },
    );
  }

  function findCurrentEmployee(employees) {
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

  function isSameEmployee(a, b) {
    if (!a || !b) return false;
    var aId = String(a.id || a.uid || "").toLowerCase();
    var bId = String(b.id || b.uid || "").toLowerCase();
    var aEmail = String(a.email || "").toLowerCase();
    var bEmail = String(b.email || "").toLowerCase();
    var aName = String(app.buildName(a) || "").toLowerCase();
    var bName = String(app.buildName(b) || "").toLowerCase();

    if (aId && bId && aId === bId) return true;
    if (aEmail && bEmail && aEmail === bEmail) return true;
    if (aName && bName && aName === bName) return true;
    return false;
  }

  function findAssignedProjects(projects) {
    if (!app.currentUser) return [];
    var uid = (app.currentUser.uid || "").toLowerCase();
    var name = (app.currentUser.displayName || "").toLowerCase();
    return projects.filter(function (p) {
      var teamAssigned = (p.teamMemberIds || []).some(function (id) {
        return uid && (id || "").toLowerCase() === uid;
      });
      var mgrAssigned = uid && (p.projectManagerId || "").toLowerCase() === uid;
      var nameAssigned =
        name && (p.projectManager || "").toLowerCase() === name;
      return teamAssigned || mgrAssigned || nameAssigned;
    });
  }

  function empStatCard(val, label, subtitle, color) {
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

  function empInfoRow(title, desc, badge) {
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

  function empDueText(endDate) {
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

  function isEmpOverdue(p) {
    if (!p.endDate || p.endDate <= 0) return false;
    var ts = p.endDate > 1e12 ? p.endDate : p.endDate * 1000;
    return (
      new Date(ts) < new Date() &&
      (p.status || "").toUpperCase() !== "COMPLETED"
    );
  }

  function isEmpActive(p) {
    var s = (p.status || "").toUpperCase();
    return s === "IN_PROGRESS" || s === "PLANNING";
  }

  function isEmpCompleted(p) {
    return (p.status || "").toUpperCase() === "COMPLETED";
  }

  function empProfileRow(label, value) {
    return (
      '<div class="emp-profile-row"><span class="emp-profile-label">' +
      app.esc(label) +
      "</span>" +
      '<span class="emp-profile-value">' +
      app.esc(value) +
      "</span></div>"
    );
  }

  function empApprovalStatusLabel() {
    if (!app.currentUser) return "N/A";
    if (
      app.currentUser.mdApproved === true &&
      app.currentUser.pmApproved === true
    ) {
      return "MD + PM Approved";
    }
    if (app.currentUser.mdApproved === true) return "MD Approved";
    return "Pending Approval";
  }

  /* ============================================================
       MY TASKS (real Firestore tasks via workspace API)
       ============================================================ */
  window.loadEmpTasks = function () {
    app.fetchJson(
      "/api/workspace/tasks",
      function (tasks) {
        empTasksCache = tasks;
        var active = tasks.filter(function (t) {
          return (t.status || "").toUpperCase() !== "COMPLETED";
        });
        var completed = tasks.filter(function (t) {
          return (t.status || "").toUpperCase() === "COMPLETED";
        });
        var overdue = tasks.filter(function (t) {
          return (
            t.dueDate &&
            t.dueDate < Date.now() &&
            (t.status || "").toUpperCase() !== "COMPLETED"
          );
        });
        var dueToday = active.filter(function (t) {
          if (!t.dueDate) return false;
          var ts = t.dueDate > 1e12 ? t.dueDate : t.dueDate * 1000;
          var due = new Date(ts);
          var now = new Date();
          return due.toDateString() === now.toDateString();
        });

        document.getElementById("empTasksStats").innerHTML =
          empStatCard(
            active.length,
            "Active Tasks",
            "Work items assigned to you",
            "blue",
          ) +
          empStatCard(
            dueToday.length,
            "Due Today",
            "Needs attention now",
            "orange",
          ) +
          empStatCard(
            overdue.length,
            "Overdue",
            "Follow up required",
            "purple",
          ) +
          empStatCard(
            completed.length,
            "Completed",
            "Delivered items",
            "green",
          );

        var html = "";
        if (active.length === 0 && completed.length === 0) {
          html =
            '<div class="empty-state">No assigned tasks. You are all caught up!</div>';
        } else {
          // Show active tasks first, then completed
          var display = active.concat(completed);
          display.forEach(function (t) {
            var isComp = (t.status || "").toUpperCase() === "COMPLETED";
            var isOver = t.dueDate && t.dueDate < Date.now() && !isComp;
            var priority = (t.priority || "MEDIUM").toLowerCase();
            var dueText = empDueText(t.dueDate);
            var statusLabel = (t.status || "TODO").replace(/_/g, " ");

            var nextStatus = null;
            var nextLabel = "";
            var s = (t.status || "TODO").toUpperCase();
            if (s === "TODO") {
              nextStatus = "IN_PROGRESS";
              nextLabel = "Start";
            } else if (s === "IN_PROGRESS") {
              nextStatus = "UNDER_REVIEW";
              nextLabel = "Submit for Review";
            } else if (s === "UNDER_REVIEW") {
              nextStatus = null;
              nextLabel = "";
            }

            var tid = app.esc(t.id || "");
            html +=
              '<div class="emp-task-row clickable' +
              (isComp ? " task-completed" : "") +
              '" onclick="openEmpTaskDetail(\'' +
              tid +
              "')\">" +
              '<div class="priority-dot priority-' +
              priority +
              '"></div>' +
              '<div class="emp-task-info"><div class="emp-task-name">' +
              app.esc(t.title || "Untitled") +
              "</div>" +
              '<div class="emp-task-meta">' +
              '<span class="badge badge-muted">' +
              app.esc(statusLabel) +
              "</span> " +
              (t.projectName
                ? '<span class="emp-task-project">' +
                  app.esc(t.projectName) +
                  "</span> "
                : "") +
              '<span class="emp-task-due' +
              (isOver ? " urgent" : "") +
              '">' +
              dueText +
              "</span>" +
              "</div></div>";
            if (nextStatus) {
              html +=
                '<button class="emp-task-status-btn" onclick="updateEmpTaskStatus(\'' +
                tid +
                "','" +
                nextStatus +
                "')\">" +
                nextLabel +
                "</button>";
            } else if (s === "UNDER_REVIEW") {
              html += '<span class="badge badge-orange">Under Review</span>';
            } else {
              html += '<span class="badge badge-green">Done</span>';
            }
            html += "</div>";
          });
        }
        document.getElementById("empTasksList").innerHTML = html;
      },
      function () {
        document.getElementById("empTasksStats").innerHTML =
          empStatCard(0, "Active Tasks", "Work items assigned to you", "blue") +
          empStatCard(0, "Due Today", "Needs attention now", "orange") +
          empStatCard(0, "Overdue", "Follow up required", "purple") +
          empStatCard(0, "Completed", "Delivered items", "green");
        document.getElementById("empTasksList").innerHTML =
          '<div class="empty-state">Could not load tasks. Try reloading.</div>';
      },
    );
  };

  window.updateEmpTaskStatus = function (taskId, newStatus) {
    if (!taskId || !newStatus) return;
    app.fetchMutate(
      "PUT",
      "/api/workspace/tasks/" + encodeURIComponent(taskId),
      { status: newStatus },
      function () {
        app.showToast("Task updated", "success");
        // Log activity
        var task = null;
        for (var i = 0; i < empTasksCache.length; i++) {
          if (empTasksCache[i].id === taskId) {
            task = empTasksCache[i];
            break;
          }
        }
        if (newStatus === "UNDER_REVIEW" && task) {
          // Notify PM (task creator)
          if (task.createdBy) {
            app.fetchMutate(
              "POST",
              "/api/workspace/notifications",
              {
                recipientId: task.createdBy,
                type: "TASK_REVIEW",
                message:
                  "Task submitted for review: " + (task.title || "Untitled"),
                entityId: taskId,
                entityType: "task",
                link: "/pm-workspace/tasks",
              },
              function () {},
              function () {},
            );
          }
          empLogActivity(
            "SUBMIT_REVIEW",
            "task",
            taskId,
            task ? task.title : "",
            task ? task.projectId : "",
            "Submitted task for review",
          );
        } else {
          empLogActivity(
            "STATUS_CHANGE",
            "task",
            taskId,
            task ? task.title : "",
            task ? task.projectId : "",
            "Status changed to " + newStatus,
          );
        }
        loadEmpTasks();
      },
      function (err) {
        app.showToast(err || "Failed to update task", "error");
      },
    );
  };

  var empTasksCache = [];

  window.openEmpTaskDetail = function (taskId) {
    var task = null;
    for (var i = 0; i < empTasksCache.length; i++) {
      if (empTasksCache[i].id === taskId) {
        task = empTasksCache[i];
        break;
      }
    }
    if (!task) return;
    document.getElementById("empTaskModalTitle").textContent =
      task.title || "Task Details";
    var statusLabel = (task.status || "TODO").replace(/_/g, " ");
    var dueText = task.dueDate
      ? app.formatTimestamp(task.dueDate)
      : "No due date";
    var priorityLabel = (task.priority || "MEDIUM").replace(/_/g, " ");
    document.getElementById("empTaskDetail").innerHTML =
      '<div class="task-detail-grid">' +
      '<div class="detail-row"><span class="detail-label">Status</span><span class="badge badge-muted">' +
      app.esc(statusLabel) +
      "</span></div>" +
      '<div class="detail-row"><span class="detail-label">Priority</span><span class="card-priority priority-' +
      (task.priority || "MEDIUM").toLowerCase() +
      '">' +
      app.esc(priorityLabel) +
      "</span></div>" +
      '<div class="detail-row"><span class="detail-label">Project</span><span>' +
      app.esc(task.projectName || "None") +
      "</span></div>" +
      '<div class="detail-row"><span class="detail-label">Due Date</span><span>' +
      dueText +
      "</span></div>" +
      (task.description
        ? '<div class="detail-row full-width"><span class="detail-label">Description</span><p>' +
          app.esc(task.description) +
          "</p></div>"
        : "") +
      "</div>";
    // Load comments
    loadEmpTaskComments(taskId);
    document.getElementById("empTaskModal").dataset.taskId = taskId;
    document.getElementById("empTaskModal").classList.remove("hidden");
  };

  function loadEmpTaskComments(taskId) {
    var list = document.getElementById("empTaskCommentsList");
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

  window.postEmpTaskComment = function () {
    var modal = document.getElementById("empTaskModal");
    var taskId = modal ? modal.dataset.taskId : "";
    var textEl = document.getElementById("empTaskCommentText");
    var text = (textEl.value || "").trim();
    if (!taskId || !text) return;
    app.fetchMutate(
      "POST",
      "/api/workspace/comments",
      { taskId: taskId, text: text },
      function () {
        textEl.value = "";
        loadEmpTaskComments(taskId);
        empLogActivity("COMMENT", "task", taskId, "", "", "Added a comment");
      },
      function (err) {
        app.showToast(err || "Failed to post comment", "error");
      },
    );
  };

  function empLogActivity(
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

  /* ============================================================
       MY PROJECTS
       ============================================================ */
  window.loadEmpProjects = function () {
    ensureEmpData(function (employees, projects) {
      var assigned = findAssignedProjects(projects);
      var active = assigned.filter(isEmpActive).length;
      var completed = assigned.filter(isEmpCompleted).length;

      document.getElementById("empProjectsStats").innerHTML =
        empStatCard(
          assigned.length,
          "Assigned",
          "All tracked projects",
          "purple",
        ) +
        empStatCard(active, "Active", "In progress now", "green") +
        empStatCard(completed, "Completed", "Delivered projects", "blue");

      var html = "";
      if (assigned.length === 0) {
        html =
          '<div class="empty-state">No assigned projects. Projects will appear here once assigned.</div>';
      } else {
        assigned.forEach(function (p) {
          var pct = p.completionPercentage || 0;
          var badge = isEmpCompleted(p)
            ? "green"
            : isEmpOverdue(p)
              ? "purple"
              : "blue";
          html +=
            '<div class="emp-project-item">' +
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
            empDueText(p.endDate) +
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
      document.getElementById("empProjectsList").innerHTML = html;
    });
  };

  /* ============================================================
       TIME SHEET (real Firestore data)
       ============================================================ */
  window.loadEmpTimesheet = function () {
    ensureEmpData(function (employees, projects) {
      var assigned = findAssignedProjects(projects);

      // Populate project dropdown
      var sel = document.getElementById("tsProject");
      if (sel) {
        sel.innerHTML = '<option value="">Select project\u2026</option>';
        assigned.filter(isEmpActive).forEach(function (p) {
          sel.innerHTML +=
            '<option value="' +
            app.esc(p.id) +
            '" data-name="' +
            app.esc(p.name || "") +
            '">' +
            app.esc(p.name || "Untitled") +
            "</option>";
        });
      }
      // Default date to today
      var tsDate = document.getElementById("tsDate");
      if (tsDate && !tsDate.value)
        tsDate.value = new Date().toISOString().slice(0, 10);

      // Fetch real timesheet entries
      app.fetchJson(
        "/api/workspace/timesheets",
        function (entries) {
          app.cachedData.empTimesheets = entries;
          renderTimesheetUI(entries, assigned);
        },
        function () {
          renderTimesheetUI([], assigned);
        },
      );
    });

    // Wire up form submit once
    var form = document.getElementById("empTimeEntryForm");
    if (form && !form._wired) {
      form._wired = true;
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var sel = document.getElementById("tsProject");
        var opt = sel.options[sel.selectedIndex];
        var payload = {
          projectId: sel.value,
          projectName: opt ? opt.getAttribute("data-name") : "",
          date: new Date(document.getElementById("tsDate").value).getTime(),
          hours: parseFloat(document.getElementById("tsHours").value),
          description: document.getElementById("tsDesc").value,
        };
        app.fetchMutate(
          "POST",
          "/api/workspace/timesheets",
          payload,
          function () {
            app.showToast("Time entry saved", "success");
            form.reset();
            document.getElementById("tsDate").value = new Date()
              .toISOString()
              .slice(0, 10);
            document.getElementById("empTimeForm").style.display = "none";
            delete app.cachedData.empTimesheets;
            loadEmpTimesheet();
          },
          function (err) {
            app.showToast(err || "Failed to save", "error");
          },
        );
      });
    }
  };

  function renderTimesheetUI(entries, assigned) {
    // Week filter: entries from current week (Mon-Sun)
    var now = new Date();
    now.setHours(0, 0, 0, 0);
    var dayOfWeek = now.getDay() || 7;
    var weekStart = new Date(now);
    weekStart.setDate(now.getDate() - dayOfWeek + 1);
    var weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 7);

    var weekEntries = entries.filter(function (e) {
      var d = e.date > 1e12 ? e.date : e.date * 1000;
      return d >= weekStart.getTime() && d < weekEnd.getTime();
    });
    var totalHours = weekEntries.reduce(function (s, e) {
      return s + (e.hours || 0);
    }, 0);
    var remaining = Math.max(0, 40 - totalHours);

    document.getElementById("empTimesheetStats").innerHTML =
      empStatCard(
        totalHours.toFixed(1) + "h",
        "This Week",
        "Logged from timesheet entries",
        "green",
      ) +
      empStatCard(
        remaining.toFixed(1) + "h",
        "Remaining",
        "Until 40h weekly target",
        "blue",
      ) +
      empStatCard(
        weekEntries.length,
        "Entries",
        "This week's time slots",
        "purple",
      );

    // Render entries list (most recent first, max 10)
    var html = "";
    var display = entries.slice(0, 10);
    if (display.length === 0) {
      html =
        '<div class="empty-state">No time entries yet. Click \u201c+ Log Hours\u201d to get started.</div>';
    } else {
      display.forEach(function (e) {
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
    document.getElementById("empTimeEntries").innerHTML = html;

    // Weekly summary bar
    var pct = Math.min(100, Math.round((totalHours / 40) * 100));
    document.getElementById("empWeeklySummary").innerHTML =
      '<div class="progress-bar-container"><div class="progress-bar-track"><div class="progress-bar-fill" style="width:' +
      pct +
      '%"></div></div></div>' +
      '<div class="emp-summary-label">' +
      totalHours.toFixed(1) +
      "h of 40h target (" +
      pct +
      "% utilized)</div>";

    document.getElementById("empTimeReminders").innerHTML =
      empInfoRow(
        "Weekly check-in",
        "Submit your final timesheet before Friday 6 PM",
        "REMINDER",
      ) +
      empInfoRow(
        "Time allocation",
        "Split hours across projects based on actual effort",
        "TIP",
      );
  }

  /* ============================================================
       LEAVE REQUESTS (real Firestore data)
       ============================================================ */
  window.loadEmpRequests = function () {
    ensureEmpData(function (employees) {
      var me = findCurrentEmployee(employees);
      var status = me ? me.status || "UNKNOWN" : "UNKNOWN";

      // Fetch real leave requests
      app.fetchJson(
        "/api/workspace/leave-requests",
        function (requests) {
          app.cachedData.empLeaveRequests = requests;
          renderRequestsUI(requests, status);
        },
        function () {
          renderRequestsUI([], status);
        },
      );
    });

    // Wire up form submit once
    var form = document.getElementById("empLeaveRequestForm");
    if (form && !form._wired) {
      form._wired = true;
      form.addEventListener("submit", function (e) {
        e.preventDefault();
        var startVal = document.getElementById("lrStart").value;
        var endVal = document.getElementById("lrEnd").value;
        if (new Date(endVal) < new Date(startVal)) {
          app.showToast("End date must be after start date", "error");
          return;
        }
        var payload = {
          type: document.getElementById("lrType").value,
          startDate: new Date(startVal).getTime(),
          endDate: new Date(endVal).getTime(),
          reason: document.getElementById("lrReason").value,
        };
        app.fetchMutate(
          "POST",
          "/api/workspace/leave-requests",
          payload,
          function () {
            app.showToast("Leave request submitted", "success");
            form.reset();
            document.getElementById("empLeaveForm").style.display = "none";
            delete app.cachedData.empLeaveRequests;
            loadEmpRequests();
          },
          function (err) {
            app.showToast(err || "Failed to submit", "error");
          },
        );
      });
    }
  };

  function renderRequestsUI(requests, empStatus) {
    var pending = requests.filter(function (r) {
      return r.status === "PENDING";
    }).length;
    var approved = requests.filter(function (r) {
      return r.status === "APPROVED";
    }).length;

    document.getElementById("empRequestsStats").innerHTML =
      empStatCard(empStatus, "Status", "Employment availability", "green") +
      empStatCard(approved, "Approved", "Approved leave days", "blue") +
      empStatCard(pending, "Pending", "Awaiting manager review", "purple");

    // Render request list
    var html = "";
    if (requests.length === 0) {
      html =
        '<div class="empty-state">No leave requests. Click \u201c+ Request Leave\u201d to submit one.</div>';
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
        html +=
          '<div class="emp-info-row">' +
          '<div class="emp-info-content"><div class="emp-info-title">' +
          app.esc(r.type) +
          " Leave" +
          '</div><div class="emp-info-desc">' +
          app.esc(startStr) +
          " \u2013 " +
          app.esc(endStr) +
          (r.reason ? " \u2022 " + app.esc(r.reason) : "") +
          "</div></div>" +
          '<span class="badge ' +
          badgeClass +
          '">' +
          app.esc(r.status) +
          "</span></div>";
      });
    }
    document.getElementById("empLeaveInfo").innerHTML = html;

    document.getElementById("empLeavePolicy").innerHTML =
      empInfoRow(
        "Annual leave",
        "20 days per year (pro-rated for new joiners)",
        "POLICY",
      ) +
      empInfoRow(
        "Sick leave",
        "Up to 10 days with medical certificate",
        "POLICY",
      ) +
      empInfoRow(
        "Personal leave",
        "3 days per year for personal matters",
        "POLICY",
      );
  }

  /* ============================================================
       DOCUMENTS (real Firestore data)
       ============================================================ */
  window.loadEmpDocuments = function () {
    ensureEmpData(function (employees, projects) {
      var assigned = findAssignedProjects(projects);

      // Fetch real documents
      app.fetchJson(
        "/api/workspace/documents",
        function (docs) {
          app.cachedData.empDocuments = docs;
          renderDocumentsUI(docs, assigned);
        },
        function () {
          renderDocumentsUI([], assigned);
        },
      );
    });
  };

  function renderDocumentsUI(docs, assigned) {
    var policies = docs.filter(function (d) {
      return d.category === "POLICY";
    });
    var templates = docs.filter(function (d) {
      return d.category === "TEMPLATE";
    });
    var briefs = docs.filter(function (d) {
      return d.category === "PROJECT_BRIEF";
    });

    document.getElementById("empDocsStats").innerHTML =
      empStatCard(docs.length, "Total Docs", "Available documents", "blue") +
      empStatCard(
        policies.length,
        "Policies",
        "Core employee policies",
        "green",
      ) +
      empStatCard(
        templates.length + briefs.length,
        "Resources",
        "Templates & project briefs",
        "purple",
      );

    // Company docs (policies + templates)
    var companyDocs = policies.concat(templates);
    var html = "";
    if (companyDocs.length === 0) {
      html =
        '<div class="empty-state">No company documents available yet.</div>';
    } else {
      companyDocs.forEach(function (d) {
        html += empInfoRow(
          d.name || "Untitled",
          d.description || "No description",
          d.category,
        );
      });
    }
    document.getElementById("empCompanyDocs").innerHTML = html;

    // Project documents (briefs from Firestore + project summary)
    var projHtml = "";
    if (briefs.length === 0 && assigned.length === 0) {
      projHtml = '<div class="empty-state">No project documents</div>';
    } else {
      briefs.forEach(function (d) {
        projHtml += empInfoRow(
          d.name || "Untitled",
          d.description || "No description",
          "BRIEF",
        );
      });
      assigned.slice(0, 5).forEach(function (p) {
        projHtml += empInfoRow(
          "Brief: " + (p.name || "Untitled"),
          "Last update " + app.formatTimestamp(p.updatedAt),
          "PROJECT",
        );
      });
    }
    document.getElementById("empProjectDocs").innerHTML = projHtml;
  }

  /* ============================================================
       MY TEAM
       ============================================================ */
  var empTeamChatDepartment = "";
  var empTeamChatRooms = [];
  var empTeamChatScope = "dept";
  var empTeamChatPollTimer = null;

  function empChatUserKey() {
    return (
      (app.currentUser && app.currentUser.uid) ||
      (app.currentUser && app.currentUser.email) ||
      "anon"
    );
  }

  function empChatStorageKey(scopeValue) {
    return "teamChatLastRead:emp:" + empChatUserKey() + ":" + scopeValue;
  }

  function getEmpLastRead(scopeValue) {
    var v = localStorage.getItem(empChatStorageKey(scopeValue));
    var ts = Number(v);
    return Number.isFinite(ts) ? ts : 0;
  }

  function setEmpLastRead(scopeValue, ts) {
    var num = Number(ts) || 0;
    localStorage.setItem(empChatStorageKey(scopeValue), String(num));
  }

  function stopEmpTeamChatPolling() {
    if (empTeamChatPollTimer) {
      clearInterval(empTeamChatPollTimer);
      empTeamChatPollTimer = null;
    }
  }

  function startEmpTeamChatPolling() {
    stopEmpTeamChatPolling();
    empTeamChatPollTimer = setInterval(function () {
      loadEmpTeamChat();
    }, 30000);
  }

  function renderEmpTeamChat(messages) {
    var host = document.getElementById("empTeamChatList");
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
        return (
          '<div class="team-chat-item' +
          (mine ? " mine" : "") +
          '">' +
          '<div class="comment-header"><strong>' +
          app.esc(m.authorName || "Unknown") +
          "</strong>" +
          (m.authorRole === "PM" 
            ? '<span class="badge badge-purple" style="font-size: 0.65rem; padding: 2px 6px; margin-left: 6px; vertical-align: middle;">PM</span>'
            : '<span class="comment-role">' + app.esc(app.formatRole(m.authorRole || "USER")) + "</span>"
          ) +
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

  function fetchEmpRoomMessages(scopeValue, done, fail) {
    var query = "";
    if (!scopeValue || scopeValue === "dept") {
      query =
        "department=" +
        encodeURIComponent(empTeamChatDepartment) +
        "&limit=120";
    } else if (scopeValue.indexOf("proj:") === 0) {
      query =
        "projectId=" +
        encodeURIComponent(scopeValue.substring(5)) +
        "&limit=120";
    } else {
      query =
        "department=" +
        encodeURIComponent(empTeamChatDepartment) +
        "&limit=120";
    }
    app.fetchJson("/api/workspace/team-chat?" + query, done, fail);
  }

  function updateEmpTeamChatScopeLabels(unreadMap) {
    var select = document.getElementById("empTeamChatScope");
    if (!select || !empTeamChatRooms.length) return;
    var current = empTeamChatScope || "dept";
    select.innerHTML = empTeamChatRooms
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

    var totalBadge = document.getElementById("empTeamChatTotalUnread");
    if (totalBadge) {
      var total = 0;
      empTeamChatRooms.forEach(function (room) {
        if (room.value === current) return;
        total += unreadMap && unreadMap[room.value] ? unreadMap[room.value] : 0;
      });
      totalBadge.textContent = total > 0 ? total + " new" : "";
    }
  }

  function refreshEmpUnreadCounts() {
    if (!empTeamChatRooms.length || !empTeamChatDepartment) return;
    var pending = empTeamChatRooms.length;
    var unreadMap = {};
    empTeamChatRooms.forEach(function (room) {
      fetchEmpRoomMessages(
        room.value,
        function (messages) {
          var lastRead = getEmpLastRead(room.value);
          var myId = String((app.currentUser && app.currentUser.uid) || "");
          var unread = (messages || []).filter(function (m) {
            var created = Number(m.createdAt) || 0;
            var mine = String(m.authorId || "") === myId;
            return !mine && created > lastRead;
          }).length;
          unreadMap[room.value] = unread;
          pending -= 1;
          if (pending === 0) updateEmpTeamChatScopeLabels(unreadMap);
        },
        function () {
          unreadMap[room.value] = 0;
          pending -= 1;
          if (pending === 0) updateEmpTeamChatScopeLabels(unreadMap);
        },
      );
    });
  }

  function buildEmpTeamChatQuery() {
    if (!empTeamChatScope || empTeamChatScope === "dept") {
      return (
        "department=" + encodeURIComponent(empTeamChatDepartment) + "&limit=120"
      );
    }
    if (empTeamChatScope.indexOf("proj:") === 0) {
      var projectId = empTeamChatScope.substring(5);
      return "projectId=" + encodeURIComponent(projectId) + "&limit=120";
    }
    return (
      "department=" + encodeURIComponent(empTeamChatDepartment) + "&limit=120"
    );
  }

  function buildEmpTeamChatPayload(text) {
    if (empTeamChatScope && empTeamChatScope.indexOf("proj:") === 0) {
      return {
        projectId: empTeamChatScope.substring(5),
        text: text,
      };
    }
    return {
      department: empTeamChatDepartment,
      text: text,
    };
  }

  function renderEmpTeamChatScopeOptions(assignedProjects) {
    var select = document.getElementById("empTeamChatScope");
    if (!select) return;
    var options = [];
    var seen = {};
    options.push({ value: "dept", baseLabel: "Department Room" });
    (assignedProjects || []).forEach(function (p) {
      if (!p || !p.id || seen[p.id]) return;
      seen[p.id] = true;
      options.push({
        value: "proj:" + p.id,
        baseLabel: "Project: " + (p.name || "Untitled"),
      });
    });
    empTeamChatRooms = options;
    updateEmpTeamChatScopeLabels({});

    var stillValid = options.some(function (opt) {
      return opt.value === empTeamChatScope;
    });
    if (!stillValid) empTeamChatScope = "dept";
    select.value = empTeamChatScope;
    refreshEmpUnreadCounts();
  }

  window.onEmpTeamChatScopeChange = function () {
    var select = document.getElementById("empTeamChatScope");
    if (!select) return;
    empTeamChatScope = select.value || "dept";
    loadEmpTeamChat();
  };

  window.loadEmpTeamChat = function () {
    var host = document.getElementById("empTeamChatList");
    if (!host) return;
    if (!empTeamChatDepartment) {
      host.innerHTML =
        '<div class="comment-empty">Set your department to use team chat.</div>';
      return;
    }
    app.fetchJson(
      "/api/workspace/team-chat?" + buildEmpTeamChatQuery(),
      function (messages) {
        var list = messages || [];
        renderEmpTeamChat(list);
        var newest = list.length
          ? Math.max.apply(
              null,
              list.map(function (m) {
                return Number(m.createdAt) || 0;
              }),
            )
          : Date.now();
        setEmpLastRead(empTeamChatScope || "dept", newest);
        refreshEmpUnreadCounts();
      },
      function () {
        host.innerHTML =
          '<div class="comment-empty">Failed to load team chat.</div>';
      },
    );
  };

  window.postEmpTeamChatMessage = function () {
    var input = document.getElementById("empTeamChatInput");
    var btn = document.getElementById("empTeamChatSendBtn");
    if (!input || !btn) return;
    var text = (input.value || "").trim();
    if (!text) {
      app.showToast("Please enter a message", "warning");
      return;
    }
    if (!empTeamChatDepartment) {
      app.showToast("Department is required for team chat", "error");
      return;
    }
    btn.disabled = true;
    app.fetchMutate(
      "POST",
      "/api/workspace/team-chat",
      buildEmpTeamChatPayload(text),
      function () {
        input.value = "";
        btn.disabled = false;
        loadEmpTeamChat();
      },
      function (err) {
        btn.disabled = false;
        app.showToast(err || "Failed to send message", "error");
      },
    );
  };

  window.loadEmpTeam = function () {
    ensureEmpData(function (employees, projects) {
      var me = findCurrentEmployee(employees);
      var dept = me ? (me.department || "").toLowerCase() : "";
      empTeamChatDepartment = me ? me.department || "" : "";
      var assigned = findAssignedProjects(projects);
      renderEmpTeamChatScopeOptions(assigned);

      var team = employees.filter(function (e) {
        if ((e.status || "").toUpperCase() !== "ACTIVE") return false;
        if (me && isSameEmployee(e, me)) return false;
        return true;
      });

      // Group by department
      var groups = {};
      var noDept = [];
      team.forEach(function (e) {
        var d = (e.department || "").trim();
        if (!d) {
          noDept.push(e);
          return;
        }
        if (!groups[d]) groups[d] = [];
        groups[d].push(e);
      });
      var sortedDepts = Object.keys(groups).sort(function (a, b) {
        // Current user's dept comes first
        if (dept) {
          if (a.toLowerCase() === dept) return -1;
          if (b.toLowerCase() === dept) return 1;
        }
        return a.localeCompare(b);
      });
      var deptCount = sortedDepts.length + (noDept.length > 0 ? 1 : 0);

      document.getElementById("empTeamStats").innerHTML =
        empStatCard(
          dept ? dept.toUpperCase() : "All",
          "My Dept",
          "Your department",
          "green",
        ) +
        empStatCard(team.length, "Colleagues", "Active team members", "blue") +
        empStatCard(deptCount, "Departments", "Org groups", "purple");

      var html = "";
      if (team.length === 0) {
        html = '<div class="empty-state">No team members found.</div>';
      } else {
        sortedDepts.forEach(function (d) {
          var isMine = dept && d.toLowerCase() === dept;
          html += renderEmpTeamDeptGroup(d, groups[d], false, isMine);
        });
        if (noDept.length > 0) {
          html += renderEmpTeamDeptGroup("Unassigned", noDept, true, false);
        }
      }
      document.getElementById("empTeamList").innerHTML = html;

      loadEmpTeamChat();
      startEmpTeamChatPolling();
    });
  };

  window.addEventListener("beforeunload", stopEmpTeamChatPolling);

  function renderEmpTeamDeptGroup(deptName, members, isUnassigned, isMyDept) {
    members.sort(function (a, b) {
      return ((a.fullName || a.firstName || "") + "").localeCompare(
        (b.fullName || b.firstName || "") + "",
      );
    });
    var cls = isUnassigned
      ? " dept-group-warning"
      : isMyDept
        ? " dept-group-mine"
        : "";
    var rows = members
      .map(function (e) {
        var name = app.buildName(e);
        return (
          '<div class="emp-team-row">' +
          '<div class="emp-team-avatar">' +
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
          (isUnassigned
            ? ' <button class="btn-set-dept-sm" onclick="openQuickDeptModal(\'' +
              app.esc(e.id || "") +
              "','" +
              app.esc(name).replace(/'/g, "") +
              "')\">Set Dept</button>"
            : "") +
          "</div>"
        );
      })
      .join("");
    var label = isMyDept ? deptName + " (Your Department)" : deptName;
    return (
      '<div class="dept-group' +
      cls +
      '">' +
      '<div class="dept-group-header">' +
      '<span class="dept-group-name">' +
      app.esc(label) +
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
       MY PROFILE
       ============================================================ */
  window.loadEmpProfile = function () {
    ensureEmpData(function (employees, projects) {
      var me = findCurrentEmployee(employees);

      if (!me) {
        document.getElementById("empProfileStats").innerHTML = empStatCard(
          "Unavailable",
          "Profile",
          "No employee record matched your account",
          "purple",
        );
        document.getElementById("empProfileContent").innerHTML =
          '<div class="empty-state">Profile not found. Try reloading.</div>';
        return;
      }

      var name = app.buildName(me);
      var assignedProjects = findAssignedProjects(projects || []);
      var activeProjects = assignedProjects.filter(isEmpActive).length;
      var roleLabel = app.currentUser
        ? app.formatRole(app.currentUser.role)
        : app.formatRole(me.position || "EMPLOYEE");
      var profileUpdatedAt = me.updatedAt || me.createdAt || 0;
      document.getElementById("empProfileStats").innerHTML =
        empStatCard(
          me.department || "N/A",
          "Department",
          "Assigned department",
          "green",
        ) +
        empStatCard(me.position || "N/A", "Position", "Current role", "blue") +
        empStatCard(
          activeProjects,
          "Active Projects",
          "Projects currently assigned",
          "purple",
        );

      var statusClass =
        (me.status || "").toUpperCase() === "ACTIVE"
          ? "badge-green"
          : "badge-orange";
      document.getElementById("empProfileContent").innerHTML =
        '<div class="emp-profile-header">' +
        '<div class="emp-profile-avatar">' +
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
        empProfileRow("Full Name", name) +
        empProfileRow("Email", me.email || "N/A") +
        empProfileRow("Phone", me.phone || "N/A") +
        empProfileRow("Account Role", roleLabel) +
        empProfileRow("Approval Status", empApprovalStatusLabel()) +
        empProfileRow(
          "Hire Date",
          me.hireDate ? app.formatTimestamp(me.hireDate) : "N/A",
        ) +
        empProfileRow(
          "Last Profile Update",
          profileUpdatedAt ? app.formatTimestamp(profileUpdatedAt) : "N/A",
        ) +
        "</div>";
    });
  };
})(ShenanigansApp);
