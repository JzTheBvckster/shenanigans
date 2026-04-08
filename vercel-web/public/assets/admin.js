/* Shenanigans Web — Admin Pages Logic (admin.js) */
(function (app) {
  "use strict";

  var pmSectionFiltersInitialized = false;

  function startOfTodayMs() {
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }

  function isCurrentUserRecord(user) {
    if (!user || !app.currentUser) return false;
    var currentUid = String(app.currentUser.uid || "")
      .trim()
      .toLowerCase();
    var currentEmail = String(app.currentUser.email || "")
      .trim()
      .toLowerCase();
    var currentName = String(app.currentUser.displayName || "")
      .trim()
      .toLowerCase();

    var userId = String(user.id || user.uid || "")
      .trim()
      .toLowerCase();
    var userEmail = String(user.email || "")
      .trim()
      .toLowerCase();
    var userName = String(app.buildName(user) || "")
      .trim()
      .toLowerCase();

    if (currentUid && userId && currentUid === userId) return true;
    if (currentEmail && userEmail && currentEmail === userEmail) return true;
    if (currentName && userName && currentName === userName) return true;
    return false;
  }

  /* ============================================================
       DASHBOARD
       ============================================================ */
  window.loadDashboard = function () {
    app.fetchJson("/api/dashboard/summary", function (data) {
      document.getElementById("statEmployees").textContent =
        data.totalEmployees || 0;
      document.getElementById("statProjects").textContent =
        data.activeProjects || 0;
      document.getElementById("statInvoices").textContent =
        data.openInvoices || 0;
      document.getElementById("statRevenue").textContent =
        "$" + app.formatMoney(data.totalRevenue || 0);

      document.getElementById("insightTotal").textContent =
        data.totalProjects || 0;
      document.getElementById("insightOverdue").textContent =
        data.overdueProjects || 0;
      document.getElementById("insightRevenue").textContent =
        "$" + app.formatMoney(data.paidRevenue || 0);

      var pct =
        data.totalProjects > 0
          ? Math.min(
              100,
              Math.round((data.activeProjects / data.totalProjects) * 100),
            )
          : 0;
      document.getElementById("budgetPct").textContent = pct + "%";
      document.getElementById("budgetFill").style.width = pct + "%";
    });

    app.fetchJson(
      "/api/projects",
      function (data) {
        app.cachedData.projects = data;
        renderProjectOverview(data);
        renderRecentActivity(data);
        renderProjectStatusChart(data);
      },
      function () {
        document.getElementById("projectOverviewList").innerHTML =
          '<p style="color:#94a3b8;padding:12px">No project data available.</p>';
        document.getElementById("activityList").innerHTML =
          '<p style="color:#94a3b8;padding:12px">No activity data.</p>';
      },
    );

    app.fetchJson("/api/finance/invoices", function (data) {
      app.cachedData.invoices = data;
      renderRevenueTrendChart(data);
    });

    loadApprovalQueue();
  };

  function renderProjectOverview(projects) {
    var container = document.getElementById("projectOverviewList");
    if (!container) return;
    if (!projects || projects.length === 0) {
      container.innerHTML =
        '<p style="color:#94a3b8;padding:12px">No projects found.</p>';
      return;
    }
    var active = projects.filter(isProjectActive).slice(0, 5);
    if (active.length === 0) active = projects.slice(0, 5);

    container.innerHTML = active
      .map(function (p) {
        var pct = p.completionPercentage || 0;
        return (
          '<div class="project-item">' +
          '<div class="project-item-header"><span class="name">' +
          app.esc(p.name) +
          "</span>" +
          '<span class="pct">' +
          pct +
          "%</span></div>" +
          '<div class="project-progress"><div class="project-progress-fill" style="width:' +
          pct +
          '%"></div></div>' +
          '<div class="project-meta"><span>' +
          app.esc(p.projectManager || "Unassigned") +
          "</span>" +
          "<span>" +
          app.esc(app.formatStatus(p.status)) +
          "</span></div></div>"
        );
      })
      .join("");
  }

  function renderRecentActivity(projects) {
    var container = document.getElementById("activityList");
    if (!container) return;
    if (!projects || projects.length === 0) {
      container.innerHTML =
        '<p style="color:#94a3b8;padding:12px">No recent activity.</p>';
      return;
    }
    var sorted = projects
      .slice()
      .sort(function (a, b) {
        return (
          (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0)
        );
      })
      .slice(0, 6);

    container.innerHTML = sorted
      .map(function (p, i) {
        var colors = ["blue", "green", "orange"];
        var dotColor = colors[i % colors.length];
        var action =
          p.status === "COMPLETED"
            ? "completed"
            : p.status === "IN_PROGRESS"
              ? "updated"
              : "created";
        var ts = p.updatedAt || p.createdAt || 0;
        return (
          '<div class="activity-item"><div class="activity-dot ' +
          dotColor +
          '"></div>' +
          '<div class="activity-info"><div class="title">' +
          app.esc(p.name) +
          " was " +
          action +
          "</div>" +
          '<div class="time">' +
          app.formatTimestamp(ts) +
          "</div></div></div>"
        );
      })
      .join("");
  }

  function isProjectActive(p) {
    var s = (p.status || "").toUpperCase();
    return s === "IN_PROGRESS" || s === "PLANNING";
  }

  function isProjectOverdue(p) {
    if (!p.endDate) return false;
    var end =
      typeof p.endDate === "number" ? p.endDate : new Date(p.endDate).getTime();
    return end < Date.now() && (p.status || "").toUpperCase() !== "COMPLETED";
  }

  // ---- Approval Queue ----
  function loadApprovalQueue() {
    if (!app.isMD()) return;
    var card = document.getElementById("approvalQueueCard");
    if (card) card.classList.remove("hidden");
    app.fetchJson(
      "/api/employees?pendingUsers=true",
      function (pendingUsers) {
        var pending = (pendingUsers || []).filter(function (u) {
          return !isCurrentUserRecord(u);
        });
        var countEl = document.getElementById("approvalQueueCount");
        var listEl = document.getElementById("approvalQueueList");
        if (!card) return;

        countEl.textContent = pending.length;
        if (pending.length > 0) {
          listEl.innerHTML = pending
            .map(function (e) {
              var name = app.buildName(e);
              var eid = app.esc(e.id || "");
              return (
                '<div class="approval-item"><div class="avatar">' +
                app.initials(name) +
                "</div>" +
                '<div class="info"><div class="name">' +
                app.esc(name) +
                "</div>" +
                '<div class="role">' +
                app.esc(e.role || e.position || "Employee") +
                "</div></div>" +
                '<div class="approval-actions">' +
                '<button class="btn-approve" onclick="approveEmployee(\'' +
                eid +
                '\')" data-id="' +
                eid +
                '">Approve</button>' +
                "</div></div>"
              );
            })
            .join("");
        } else {
          listEl.innerHTML =
            '<p style="color:var(--ink-faint);padding:8px 0">No pending registrations</p>';
        }
      },
      function (err) {
        if (card) {
          var listEl = document.getElementById("approvalQueueList");
          if (listEl)
            listEl.innerHTML =
              '<p style="color:#ef4444;padding:8px 0">Failed to load: ' +
              app.esc(err || "Unknown error") +
              "</p>";
        }
      },
    );
  }

  window.approveEmployee = function (id) {
    if (!id) return;
    var btn = document.querySelector('.btn-approve[data-id="' + id + '"]');
    if (btn && btn.disabled) return;
    if (btn) {
      btn.textContent = "Approving...";
      btn.disabled = true;
    }
    fetch("/api/employees/" + encodeURIComponent(id) + "?approveUser=true", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({}),
    })
      .then(function (r) {
        return r.json();
      })
      .then(function (res) {
        if (res.ok) {
          app.showToast("Employee approved", "success");
          loadApprovalQueue();
        } else {
          app.showToast(res.error || "Approval failed", "error");
          if (btn) {
            btn.textContent = "Approve";
            btn.disabled = false;
          }
        }
      })
      .catch(function () {
        app.showToast("Network error", "error");
        if (btn) {
          btn.textContent = "Approve";
          btn.disabled = false;
        }
      });
  };

  // ---- Charts ----
  var revenueTrendChartInstance = null;
  var projectStatusChartInstance = null;

  function toAmount(value) {
    if (typeof value === "string") {
      value = value.replace(/,/g, "").trim();
    }
    var amount = Number(value);
    return isNaN(amount) ? 0 : amount;
  }

  function renderRevenueTrendChart(invoices) {
    var canvas = document.getElementById("revenueTrendChart");
    if (!canvas || typeof Chart === "undefined") return;
    var months =
      parseInt((document.getElementById("chartRangeFilter") || {}).value) || 6;
    var now = new Date();
    var labels = [],
      values = [];
    for (var i = months - 1; i >= 0; i--) {
      var d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      labels.push(
        d.toLocaleString("default", { month: "short", year: "2-digit" }),
      );
      values.push(0);
    }
    (invoices || []).forEach(function (inv) {
      if (!inv.paid || !inv.issuedAt) return;
      var ts =
        typeof inv.issuedAt === "number"
          ? inv.issuedAt
          : new Date(inv.issuedAt).getTime();
      var id = new Date(ts);
      for (var i = 0; i < months; i++) {
        var ref = new Date(
          now.getFullYear(),
          now.getMonth() - (months - 1 - i),
          1,
        );
        var nextRef = new Date(ref.getFullYear(), ref.getMonth() + 1, 1);
        if (id >= ref && id < nextRef) {
          values[i] += toAmount(inv.amount);
          break;
        }
      }
    });
    if (revenueTrendChartInstance) revenueTrendChartInstance.destroy();
    var isDark = document.documentElement.classList.contains("dark");
    var gridColor = isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.06)";
    var textColor = isDark ? "#cbd5e1" : "#64748b";
    revenueTrendChartInstance = new Chart(canvas.getContext("2d"), {
      type: "line",
      data: {
        labels: labels,
        datasets: [
          {
            label: "Revenue",
            data: values,
            borderColor: "#3b82f6",
            backgroundColor: "rgba(59,130,246,0.08)",
            fill: true,
            tension: 0.35,
            pointRadius: 4,
            pointBackgroundColor: "#3b82f6",
            pointHoverRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          y: {
            beginAtZero: true,
            grid: { color: gridColor },
            ticks: {
              color: textColor,
              callback: function (v) {
                return "$" + app.formatMoney(v);
              },
            },
          },
          x: { grid: { display: false }, ticks: { color: textColor } },
        },
      },
    });
  }

  window.updateRevenueTrendChart = function () {
    renderRevenueTrendChart(app.cachedData.invoices || []);
  };

  function renderProjectStatusChart(projects) {
    var canvas = document.getElementById("projectStatusChart");
    if (!canvas || typeof Chart === "undefined") return;
    var counts = { "In Progress": 0, Completed: 0, Planning: 0, "At Risk": 0 };
    (projects || []).forEach(function (p) {
      var s = (p.status || "").toUpperCase();
      if (s === "COMPLETED") counts["Completed"]++;
      else if (isProjectOverdue(p)) counts["At Risk"]++;
      else if (s === "IN_PROGRESS") counts["In Progress"]++;
      else counts["Planning"]++;
    });
    var labels = Object.keys(counts).filter(function (k) {
      return counts[k] > 0;
    });
    var values = labels.map(function (k) {
      return counts[k];
    });
    var palette = {
      "In Progress": "#3b82f6",
      Completed: "#22c55e",
      Planning: "#f59e0b",
      "At Risk": "#ef4444",
    };
    var colors = labels.map(function (k) {
      return palette[k];
    });
    if (labels.length === 0) {
      labels = ["No Data"];
      values = [1];
      colors = ["#e2e8f0"];
    }
    if (projectStatusChartInstance) projectStatusChartInstance.destroy();
    var isDark = document.documentElement.classList.contains("dark");
    projectStatusChartInstance = new Chart(canvas.getContext("2d"), {
      type: "doughnut",
      data: {
        labels: labels,
        datasets: [
          {
            data: values,
            backgroundColor: colors,
            borderWidth: 2,
            borderColor: isDark ? "#1e293b" : "#ffffff",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "60%",
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              color: isDark ? "#cbd5e1" : "#334155",
              padding: 16,
              usePointStyle: true,
            },
          },
        },
      },
    });
  }

  /* ============================================================
       EMPLOYEES
       ============================================================ */
  window.loadEmployees = function () {
    app.fetchJson(
      "/api/employees",
      function (data) {
        app.cachedData.employees = data;
        populateEmployeeDeptFilter(data || []);
        applyEmployeeFilters();
      },
      function (err) {
        app.showNotice(
          "employeesNotice",
          err || "Failed to load employees.",
          "error",
        );
        document.getElementById("employeesDeptGroups").innerHTML = "";
      },
    );
  };

  function populateEmployeeDeptFilter(employees) {
    var sel = document.getElementById("empDeptFilter");
    if (!sel) return;
    var current = sel.value || "";
    var depts = {};
    (employees || []).forEach(function (e) {
      var d = (e.department || "").trim();
      if (d) depts[d] = true;
    });
    var sorted = Object.keys(depts).sort(function (a, b) {
      return a.localeCompare(b);
    });
    sel.innerHTML =
      '<option value="">All Departments</option>' +
      sorted
        .map(function (d) {
          return (
            '<option value="' + app.esc(d) + '">' + app.esc(d) + "</option>"
          );
        })
        .join("");
    if (current) sel.value = current;
  }

  window.initEmployeeFilters = function () {
    var wrap = document.getElementById("employeeFilters");
    if (!wrap || wrap.dataset.bound === "1") return;
    wrap.dataset.bound = "1";
    ["empDeptFilter", "empStatusFilter"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener("change", applyEmployeeFilters);
    });
    var search = document.getElementById("empNameFilter");
    if (search) search.addEventListener("input", applyEmployeeFilters);
  };

  function applyEmployeeFilters() {
    var employees = app.cachedData.employees || [];
    var dept = (
      (document.getElementById("empDeptFilter") || {}).value || ""
    ).trim();
    var status = (
      (document.getElementById("empStatusFilter") || {}).value || ""
    )
      .trim()
      .toUpperCase();
    var q = ((document.getElementById("empNameFilter") || {}).value || "")
      .toLowerCase()
      .trim();

    var filtered = employees.filter(function (e) {
      var matchesDept = !dept || (e.department || "") === dept;
      var matchesStatus =
        !status || (e.status || "ACTIVE").toUpperCase() === status;
      var hay = [
        app.buildName(e),
        e.email || "",
        e.position || "",
        e.department || "",
      ]
        .join(" ")
        .toLowerCase();
      var matchesQuery = !q || hay.indexOf(q) !== -1;
      return matchesDept && matchesStatus && matchesQuery;
    });
    renderEmployeeKanban(filtered);
  }

  window.clearEmployeeFilters = function () {
    var dept = document.getElementById("empDeptFilter");
    var status = document.getElementById("empStatusFilter");
    var q = document.getElementById("empNameFilter");
    if (dept) dept.value = "";
    if (status) status.value = "";
    if (q) q.value = "";
    applyEmployeeFilters();
  };

  function renderEmployeeKanban(employees) {
    // Group by department
    var groups = {};
    var noDept = [];
    employees.forEach(function (e) {
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

    // Stats
    var active = employees.filter(function (e) {
      return (e.status || "ACTIVE").toUpperCase() === "ACTIVE";
    }).length;
    var deptCount = sortedDepts.length + (noDept.length > 0 ? 1 : 0);
    var statsEl = document.getElementById("employeesDeptStats");
    if (statsEl) {
      statsEl.innerHTML =
        '<div class="stat-card stat-card-blue"><div class="stat-number">' +
        employees.length +
        '</div><div class="stat-label">Total</div><div class="stat-sub">All employees</div></div>' +
        '<div class="stat-card stat-card-green"><div class="stat-number">' +
        active +
        '</div><div class="stat-label">Active</div><div class="stat-sub">Currently working</div></div>' +
        '<div class="stat-card stat-card-purple"><div class="stat-number">' +
        deptCount +
        '</div><div class="stat-label">Departments</div><div class="stat-sub">Org groups</div></div>' +
        (noDept.length > 0
          ? '<div class="stat-card stat-card-orange"><div class="stat-number">' +
            noDept.length +
            '</div><div class="stat-label">No Dept</div><div class="stat-sub">Need assignment</div></div>'
          : "");
    }

    var html = "";
    // Unassigned group first (highlighted)
    if (noDept.length > 0) {
      html += renderDeptGroup("Unassigned", noDept, true);
    }
    sortedDepts.forEach(function (dept) {
      html += renderDeptGroup(dept, groups[dept], false);
    });
    if (employees.length === 0) {
      html =
        '<div class="empty-state">No employees found. Click "+ Add Employee" to get started.</div>';
    }
    document.getElementById("employeesDeptGroups").innerHTML = html;
  }

  function renderDeptGroup(deptName, members, isUnassigned) {
    members.sort(function (a, b) {
      var aPm = isProjectManagerRecord(a) ? 0 : 1;
      var bPm = isProjectManagerRecord(b) ? 0 : 1;
      if (aPm !== bPm) return aPm - bPm;
      return ((a.fullName || a.firstName || "") + "").localeCompare(
        (b.fullName || b.firstName || "") + "",
      );
    });
    var cls = isUnassigned ? " dept-group-warning" : "";
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
      " employee" +
      (members.length === 1 ? "" : "s") +
      "</span></div>" +
      '<div class="dept-group-cards">' +
      members.map(renderEmployeeCard).join("") +
      "</div></div>"
    );
  }

  function isProjectManagerRecord(emp) {
    var role = String((emp && emp.role) || "")
      .toUpperCase()
      .replace(/\s+/g, "_");
    if (role === "PROJECT_MANAGER") return true;
    var position = String((emp && emp.position) || "").toLowerCase();
    return position.indexOf("project manager") !== -1;
  }

  function renderEmployeeCard(e) {
    var name = app.buildName(e);
    var id = app.esc(e.id || "");
    var status = (e.status || "ACTIVE").toUpperCase();
    var statusClass = "employee-status-" + status.toLowerCase();
    var phoneText = e.phone ? "Phone: " + e.phone : "Phone: Not provided";
    var pmBadge = isProjectManagerRecord(e)
      ? '<span class="role-chip role-chip-pm">PM</span>'
      : "";
    return (
      '<div class="employee-card clickable" onclick="openEmployeeModal(\'' +
      id +
      "')\">" +
      '<div class="employee-card-top"><div class="employee-avatar">' +
      app.initials(name) +
      "</div>" +
      '<div class="employee-card-info"><div class="name">' +
      app.esc(name) +
      pmBadge +
      "</div>" +
      '<div class="position">' +
      app.esc(e.position || "No position") +
      "</div></div></div>" +
      '<div class="employee-card-dept"><span class="inline-icon">TEL</span>' +
      app.esc(phoneText) +
      "</div>" +
      (e.email
        ? '<div class="employee-card-contact"><span class="inline-icon">MAIL</span>Email: ' +
          app.esc(e.email) +
          "</div>"
        : "") +
      '<div class="employee-card-meta">' +
      (e.hireDate
        ? "<span>Hired " + app.formatTimestamp(e.hireDate) + "</span>"
        : "<span></span>") +
      '<span class="employee-status-badge ' +
      statusClass +
      '">' +
      app.formatStatus(status) +
      "</span>" +
      "</div></div>"
    );
  }

  // ---- Employee Modal ----
  window.openEmployeeModal = function (id) {
    app.clearModalNotice("empModalNotice");
    var isEdit = !!id;
    document.getElementById("employeeModalTitle").textContent = isEdit
      ? "Edit Employee"
      : "Add Employee";
    document.getElementById("empDeleteBtn").classList.toggle("hidden", !isEdit);
    document.getElementById("empDepartment").innerHTML = app.deptOptions("");

    if (isEdit) {
      var emp = findCached("employees", id);
      if (emp) {
        document.getElementById("empId").value = emp.id || "";
        document.getElementById("empFirstName").value = emp.firstName || "";
        document.getElementById("empLastName").value = emp.lastName || "";
        document.getElementById("empEmail").value = emp.email || "";
        document.getElementById("empPhone").value = emp.phone || "";
        document.getElementById("empDepartment").innerHTML = app.deptOptions(
          emp.department || "",
        );
        document.getElementById("empPosition").value = emp.position || "";
        document.getElementById("empStatus").value = (
          emp.status || "ACTIVE"
        ).toUpperCase();
        document.getElementById("empSalary").value = emp.salary || "";
        document.getElementById("empHireDate").value = emp.hireDate
          ? app.toDateInput(emp.hireDate)
          : "";
      }
    } else {
      [
        "empId",
        "empFirstName",
        "empLastName",
        "empEmail",
        "empPhone",
        "empPosition",
        "empSalary",
        "empHireDate",
      ].forEach(function (fid) {
        document.getElementById(fid).value = "";
      });
      document.getElementById("empDepartment").innerHTML = app.deptOptions("");
      document.getElementById("empStatus").value = "ACTIVE";
    }
    document.getElementById("employeeModal").classList.remove("hidden");
  };

  window.saveEmployee = function () {
    app.clearModalNotice("empModalNotice");
    var saveBtn = document.getElementById("empSaveBtn");
    if (saveBtn && saveBtn.disabled) return;
    var firstName = document.getElementById("empFirstName").value.trim();
    if (!firstName) {
      app.showModalNotice("empModalNotice", "First name is required.", "error");
      return;
    }

    var email = document.getElementById("empEmail").value.trim();
    if (email && !/^\S+@\S+\.\S+$/.test(email)) {
      app.showModalNotice(
        "empModalNotice",
        "Enter a valid email address.",
        "error",
      );
      return;
    }
    var salary = parseFloat(document.getElementById("empSalary").value);
    if (!isNaN(salary) && salary < 0) {
      app.showModalNotice(
        "empModalNotice",
        "Salary cannot be negative.",
        "error",
      );
      return;
    }
    var hireDate = app.dateInputToMs("empHireDate");
    if (hireDate && hireDate > Date.now()) {
      app.showModalNotice(
        "empModalNotice",
        "Hire date cannot be in the future.",
        "error",
      );
      return;
    }

    var id = document.getElementById("empId").value;
    var payload = {
      firstName: firstName,
      lastName: document.getElementById("empLastName").value.trim(),
      email: email,
      phone: document.getElementById("empPhone").value.trim(),
      department: document.getElementById("empDepartment").value.trim(),
      position: document.getElementById("empPosition").value.trim(),
      status: document.getElementById("empStatus").value,
      salary: isNaN(salary) ? 0 : salary,
      hireDate: hireDate,
    };

    var isEdit = !!id;
    var url = isEdit
      ? "/api/employees/" + encodeURIComponent(id)
      : "/api/employees";
    var method = isEdit ? "PUT" : "POST";

    saveBtn.disabled = true;
    app.fetchMutate(
      method,
      url,
      payload,
      function () {
        saveBtn.disabled = false;
        app.closeModal("employeeModal");
        app.showToast(
          isEdit ? "Employee updated" : "Employee created",
          "success",
        );
        loadEmployees();
      },
      function (err) {
        saveBtn.disabled = false;
        app.showModalNotice(
          "empModalNotice",
          err || "Failed to save employee.",
          "error",
        );
      },
    );
  };

  window.deleteEmployee = function () {
    var id = document.getElementById("empId").value;
    if (!id) return;
    app.showConfirm("Delete this employee?", function () {
      app.fetchMutate(
        "DELETE",
        "/api/employees/" + encodeURIComponent(id),
        null,
        function () {
          app.closeModal("employeeModal");
          app.showToast("Employee deleted", "success");
          loadEmployees();
        },
        function (err) {
          app.showModalNotice(
            "empModalNotice",
            err || "Failed to delete employee.",
            "error",
          );
        },
      );
    });
  };

  /* ============================================================
       PROJECTS
       ============================================================ */
  window.loadProjects = function () {
    app.fetchJson(
      "/api/projects",
      function (data) {
        app.cachedData.projects = data;
        populateProjectDeptFilter(data || []);
        applyProjectFilters();
      },
      function (err) {
        app.showNotice(
          "projectsNotice",
          err || "Failed to load projects.",
          "error",
        );
        var groupsEl = document.getElementById("projectsDeptGroups");
        if (groupsEl) groupsEl.innerHTML = "";
      },
    );
  };

  window.initProjectFilters = function () {
    var wrap = document.getElementById("projectFilters");
    if (!wrap || wrap.dataset.bound === "1") return;
    wrap.dataset.bound = "1";
    ["projDeptFilter", "projStatusFilter"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener("change", applyProjectFilters);
    });
    var search = document.getElementById("projSearchFilter");
    if (search) search.addEventListener("input", applyProjectFilters);
  };

  function populateProjectDeptFilter(projects) {
    var sel = document.getElementById("projDeptFilter");
    if (!sel) return;
    var current = sel.value || "";
    var depts = {};
    (projects || []).forEach(function (p) {
      var d = (p.department || "").trim();
      if (d) depts[d] = true;
    });
    var sorted = Object.keys(depts).sort(function (a, b) {
      return a.localeCompare(b);
    });
    sel.innerHTML =
      '<option value="">All Departments</option>' +
      sorted
        .map(function (d) {
          return (
            '<option value="' + app.esc(d) + '">' + app.esc(d) + "</option>"
          );
        })
        .join("");
    if (current) sel.value = current;
  }

  function applyProjectFilters() {
    var projects = app.cachedData.projects || [];
    var dept = (
      (document.getElementById("projDeptFilter") || {}).value || ""
    ).trim();
    var status = (
      (document.getElementById("projStatusFilter") || {}).value || ""
    )
      .trim()
      .toUpperCase();
    var q = ((document.getElementById("projSearchFilter") || {}).value || "")
      .toLowerCase()
      .trim();

    var filtered = projects.filter(function (p) {
      var pStatus = (p.status || "PLANNING").toUpperCase();
      var matchesDept = !dept || (p.department || "") === dept;
      var matchesStatus = !status || pStatus === status;
      var hay = [
        p.name || "",
        p.projectManager || "",
        p.department || "",
        p.description || "",
      ]
        .join(" ")
        .toLowerCase();
      var matchesQuery = !q || hay.indexOf(q) !== -1;
      return (
        pStatus !== "ARCHIVED" && matchesDept && matchesStatus && matchesQuery
      );
    });

    renderProjectKanban(filtered);
  }

  window.clearProjectFilters = function () {
    var dept = document.getElementById("projDeptFilter");
    var status = document.getElementById("projStatusFilter");
    var q = document.getElementById("projSearchFilter");
    if (dept) dept.value = "";
    if (status) status.value = "";
    if (q) q.value = "";
    applyProjectFilters();
  };

  function loadProjectManagersSection(projects) {
    app.fetchJson(
      "/api/employees?projectManagers=true",
      function (data) {
        var managers = data || [];
        app.cachedData.projectManagers = managers;
        initProjectManagerSectionFilters();
        renderProjectManagersByDepartment(managers, projects || []);
      },
      function () {
        app.fetchJson(
          "/api/employees",
          function (allEmployees) {
            var managers = (allEmployees || []).filter(function (e) {
              return (
                (e.role || "").toUpperCase().replace(/\s+/g, "_") ===
                "PROJECT_MANAGER"
              );
            });
            app.cachedData.projectManagers = managers;
            initProjectManagerSectionFilters();
            renderProjectManagersByDepartment(managers, projects || []);
          },
          function () {
            app.cachedData.projectManagers = [];
            initProjectManagerSectionFilters();
            renderProjectManagersByDepartment([], projects || []);
          },
        );
      },
    );
  }

  function initProjectManagerSectionFilters() {
    if (pmSectionFiltersInitialized) return;
    pmSectionFiltersInitialized = true;

    ["pmDeptFilter", "pmAssignedFilter"].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.addEventListener("change", function () {
        renderProjectManagersByDepartment(
          app.cachedData.projectManagers || [],
          app.cachedData.projects || [],
        );
      });
    });

    var search = document.getElementById("pmSearchFilter");
    if (search) {
      search.addEventListener("input", function () {
        renderProjectManagersByDepartment(
          app.cachedData.projectManagers || [],
          app.cachedData.projects || [],
        );
      });
    }
  }

  function populateProjectManagerDeptFilter(managers) {
    var deptFilter = document.getElementById("pmDeptFilter");
    if (!deptFilter) return;

    var selected = deptFilter.value || "";
    var deptMap = {};
    (managers || []).forEach(function (m) {
      var d = normalizeDepartment(m.department);
      if (d) deptMap[d] = true;
    });

    var depts = Object.keys(deptMap).sort(function (a, b) {
      return a.localeCompare(b);
    });
    deptFilter.innerHTML =
      '<option value="">All Departments</option>' +
      depts
        .map(function (d) {
          return (
            '<option value="' + app.esc(d) + '">' + app.esc(d) + "</option>"
          );
        })
        .join("");
    if (selected) deptFilter.value = selected;
  }

  window.clearProjectManagerFilters = function () {
    var dept = document.getElementById("pmDeptFilter");
    var assigned = document.getElementById("pmAssignedFilter");
    var search = document.getElementById("pmSearchFilter");
    if (dept) dept.value = "";
    if (assigned) assigned.value = "";
    if (search) search.value = "";
    renderProjectManagersByDepartment(
      app.cachedData.projectManagers || [],
      app.cachedData.projects || [],
    );
  };

  window.scrollToProjectManagersSection = function () {
    var section = document.getElementById("projectManagersSection");
    if (!section) return;
    section.classList.remove("hidden");
    section.scrollIntoView({ behavior: "smooth", block: "start" });
    section.classList.remove("section-reveal-pulse");
    setTimeout(function () {
      section.classList.add("section-reveal-pulse");
    }, 20);
  };

  function managerDisplayName(m) {
    return m.displayName || app.buildName(m) || m.email || "Unknown";
  }

  function normalizeDepartment(v) {
    return (v || "").trim();
  }

  function renderProjectManagersByDepartment(managers, projects) {
    var statsEl = document.getElementById("projectManagersDeptStats");
    var groupsEl = document.getElementById("projectManagersDeptGroups");
    if (!statsEl || !groupsEl) return;

    populateProjectManagerDeptFilter(managers);

    if (!managers || managers.length === 0) {
      statsEl.innerHTML = "";
      groupsEl.innerHTML =
        '<div class="empty-state">No project managers found.</div>';
      return;
    }

    var enriched = managers.map(function (m) {
      var mid = (m.id || m.uid || "").toLowerCase();
      var name = managerDisplayName(m);
      var nameKey = name.toLowerCase();
      var owned = (projects || []).filter(function (p) {
        var pid = (p.projectManagerId || "").toLowerCase();
        var pname = (p.projectManager || "").toLowerCase();
        return (mid && pid === mid) || (nameKey && pname === nameKey);
      });

      var dept = normalizeDepartment(m.department);
      if (!dept && owned.length > 0)
        dept = normalizeDepartment(owned[0].department);

      return {
        id: m.id || m.uid || "",
        firstName: m.firstName || "",
        lastName: m.lastName || "",
        email: m.email || "",
        position: m.position || "Project Manager",
        status: (m.status || "ACTIVE").toUpperCase(),
        department: dept,
        name: name,
        projectCount: owned.length,
      };
    });

    app.cachedData.projectManagersView = enriched;

    var deptFilter =
      (document.getElementById("pmDeptFilter") || {}).value || "";
    var assignedFilter =
      (document.getElementById("pmAssignedFilter") || {}).value || "";
    var searchText = (
      (document.getElementById("pmSearchFilter") || {}).value || ""
    )
      .toLowerCase()
      .trim();

    var filtered = enriched.filter(function (m) {
      var matchesDept = !deptFilter || m.department === deptFilter;
      var matchesAssigned =
        !assignedFilter ||
        (assignedFilter === "assigned"
          ? m.projectCount > 0
          : m.projectCount === 0);
      var blob = (m.name + " " + m.email).toLowerCase();
      var matchesSearch = !searchText || blob.indexOf(searchText) !== -1;
      return matchesDept && matchesAssigned && matchesSearch;
    });

    var groups = {};
    var noDept = [];
    filtered.forEach(function (m) {
      if (!m.department) {
        noDept.push(m);
        return;
      }
      if (!groups[m.department]) groups[m.department] = [];
      groups[m.department].push(m);
    });

    var deptNames = Object.keys(groups).sort(function (a, b) {
      return a.localeCompare(b);
    });
    var assignedCount = filtered.filter(function (m) {
      return m.projectCount > 0;
    }).length;
    var deptCount = deptNames.length + (noDept.length > 0 ? 1 : 0);

    statsEl.innerHTML =
      '<div class="stat-card stat-card-blue"><div class="stat-number">' +
      filtered.length +
      '</div><div class="stat-label">Project Managers</div><div class="stat-sub">Filtered managers</div></div>' +
      '<div class="stat-card stat-card-green"><div class="stat-number">' +
      assignedCount +
      '</div><div class="stat-label">Assigned</div><div class="stat-sub">Managing projects</div></div>' +
      '<div class="stat-card stat-card-purple"><div class="stat-number">' +
      deptCount +
      '</div><div class="stat-label">Departments</div><div class="stat-sub">Grouped view</div></div>' +
      (noDept.length > 0
        ? '<div class="stat-card stat-card-orange"><div class="stat-number">' +
          noDept.length +
          '</div><div class="stat-label">No Dept</div><div class="stat-sub">Needs assignment</div></div>'
        : "");

    var html = "";
    if (noDept.length > 0)
      html += renderProjectManagerDeptGroup("Unassigned", noDept, true);
    deptNames.forEach(function (d) {
      html += renderProjectManagerDeptGroup(d, groups[d], false);
    });
    groupsEl.innerHTML =
      html ||
      '<div class="empty-state">No project managers match the current filters.</div>';
  }

  function renderProjectManagerDeptGroup(deptName, managers, isUnassigned) {
    var cls = isUnassigned ? " dept-group-warning" : "";
    var rows = managers
      .slice()
      .sort(function (a, b) {
        return a.name.localeCompare(b.name);
      })
      .map(function (m) {
        var pmid = app.esc(m.id);
        return (
          '<div class="user-row">' +
          '<div class="user-row-avatar">' +
          app.initials(m.name) +
          "</div>" +
          '<div class="user-row-info"><div class="user-row-name">' +
          app.esc(m.name) +
          "</div>" +
          '<div class="user-row-email">' +
          app.esc(m.email || "No email") +
          "</div></div>" +
          '<span class="badge badge-muted">' +
          m.projectCount +
          " project" +
          (m.projectCount === 1 ? "" : "s") +
          "</span>" +
          '<div class="user-row-actions">' +
          '<button class="btn-edit-sm" onclick="openProjectManagerModal(\'' +
          pmid +
          "')\">Edit</button>" +
          "</div>" +
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
      managers.length +
      " manager" +
      (managers.length === 1 ? "" : "s") +
      "</span>" +
      "</div>" +
      '<div class="dept-group-list">' +
      rows +
      "</div>" +
      "</div>"
    );
  }

  window.openProjectManagerModal = function (id) {
    app.clearModalNotice("projectManagerModalNotice");
    var managers =
      app.cachedData.projectManagersView ||
      app.cachedData.projectManagers ||
      [];
    var manager = null;
    for (var i = 0; i < managers.length; i++) {
      if (managers[i].id === id) {
        manager = managers[i];
        break;
      }
    }
    if (!manager) {
      app.showToast("Project manager not found", "error");
      return;
    }

    document.getElementById("pmEditId").value = manager.id || "";
    document.getElementById("pmEditFirstName").value = manager.firstName || "";
    document.getElementById("pmEditLastName").value = manager.lastName || "";
    document.getElementById("pmEditEmail").value = manager.email || "";
    document.getElementById("pmEditPosition").value =
      manager.position || "Project Manager";
    document.getElementById("pmEditStatus").value = manager.status || "ACTIVE";
    document.getElementById("pmEditDepartment").innerHTML = app.deptOptions(
      manager.department || "",
    );
    document.getElementById("projectManagerModal").classList.remove("hidden");
  };

  window.saveProjectManagerFromProjectsPage = function () {
    app.clearModalNotice("projectManagerModalNotice");
    var id = document.getElementById("pmEditId").value;
    var firstName = document.getElementById("pmEditFirstName").value.trim();
    var email = document.getElementById("pmEditEmail").value.trim();
    if (!id) return;
    if (!firstName) {
      app.showModalNotice(
        "projectManagerModalNotice",
        "First name is required.",
        "error",
      );
      return;
    }
    if (!email) {
      app.showModalNotice(
        "projectManagerModalNotice",
        "Email is required.",
        "error",
      );
      return;
    }

    var payload = {
      firstName: firstName,
      lastName: document.getElementById("pmEditLastName").value.trim(),
      email: email,
      department: document.getElementById("pmEditDepartment").value.trim(),
      position: document.getElementById("pmEditPosition").value.trim(),
      status: document.getElementById("pmEditStatus").value,
    };

    var btn = document.getElementById("pmEditSaveBtn");
    if (btn) btn.disabled = true;
    app.fetchMutate(
      "PUT",
      "/api/employees/" + encodeURIComponent(id),
      payload,
      function () {
        if (btn) btn.disabled = false;
        app.closeModal("projectManagerModal");
        app.showToast("Project manager updated", "success");
        loadProjects();
      },
      function (err) {
        if (btn) btn.disabled = false;
        app.showModalNotice(
          "projectManagerModalNotice",
          err || "Failed to update project manager.",
          "error",
        );
      },
    );
  };

  function renderProjectKanban(projects) {
    var statsEl = document.getElementById("projectsDeptStats");
    var groupsEl = document.getElementById("projectsDeptGroups");
    if (!statsEl || !groupsEl) return;

    var groups = {};
    var noDept = [];
    (projects || []).forEach(function (p) {
      var dept = (p.department || "").trim();
      if (!dept) {
        noDept.push(p);
        return;
      }
      if (!groups[dept]) groups[dept] = [];
      groups[dept].push(p);
    });

    var deptNames = Object.keys(groups).sort(function (a, b) {
      return a.localeCompare(b);
    });
    var active = (projects || []).filter(function (p) {
      var s = (p.status || "").toUpperCase();
      return (
        s === "PLANNING" || s === "IN_PROGRESS" || s === "PENDING_APPROVAL"
      );
    }).length;
    var completed = (projects || []).filter(function (p) {
      return (p.status || "").toUpperCase() === "COMPLETED";
    }).length;
    var deptCount = deptNames.length + (noDept.length > 0 ? 1 : 0);

    statsEl.innerHTML =
      '<div class="stat-card stat-card-blue"><div class="stat-number">' +
      (projects || []).length +
      '</div><div class="stat-label">Projects</div><div class="stat-sub">Filtered list</div></div>' +
      '<div class="stat-card stat-card-green"><div class="stat-number">' +
      active +
      '</div><div class="stat-label">Active</div><div class="stat-sub">Planning / In Progress</div></div>' +
      '<div class="stat-card stat-card-purple"><div class="stat-number">' +
      deptCount +
      '</div><div class="stat-label">Departments</div><div class="stat-sub">Grouped view</div></div>' +
      '<div class="stat-card stat-card-orange"><div class="stat-number">' +
      completed +
      '</div><div class="stat-label">Completed</div><div class="stat-sub">Finished projects</div></div>';

    var html = "";
    if (noDept.length > 0) {
      html +=
        '<div class="dept-group dept-group-warning"><div class="dept-group-header"><span class="dept-group-name">Unassigned</span><span class="dept-group-count">' +
        noDept.length +
        " project" +
        (noDept.length === 1 ? "" : "s") +
        '</span></div><div class="dept-group-cards">' +
        noDept.map(renderProjectCard).join("") +
        "</div></div>";
    }

    deptNames.forEach(function (d) {
      var items = groups[d] || [];
      html +=
        '<div class="dept-group"><div class="dept-group-header"><span class="dept-group-name">' +
        app.esc(d) +
        '</span><span class="dept-group-count">' +
        items.length +
        " project" +
        (items.length === 1 ? "" : "s") +
        '</span></div><div class="dept-group-cards">' +
        items.map(renderProjectCard).join("") +
        "</div></div>";
    });

    groupsEl.innerHTML =
      html ||
      '<div class="empty-state">No projects match the current filters.</div>';
  }

  function renderProjectCard(p) {
    var pct = p.completionPercentage || 0;
    var priorityClass = "priority-" + (p.priority || "medium").toLowerCase();
    var id = app.esc(p.id || "");
    var desc = p.description
      ? p.description.length > 80
        ? p.description.substring(0, 80) + "..."
        : p.description
      : "";
    var dept = p.department || "Unassigned";
    var status = app.formatStatus(p.status || "PLANNING");
    var budget = "$" + app.formatMoney(p.budget || 0);
    var spent = "$" + app.formatMoney(p.spent || 0);
    var teamCount = (p.teamMemberIds || []).length;
    var statusBadgeClass =
      (p.status || "").toUpperCase() === "COMPLETED"
        ? "badge-green"
        : (p.status || "").toUpperCase() === "IN_PROGRESS"
          ? "badge-blue"
          : "badge-muted";
    var approvalStatus = normalizeProjectApprovalStatus(p);
    var approvalBadgeHtml = "";
    if (approvalStatus === "PENDING") {
      approvalBadgeHtml =
        '<span class="badge badge-orange">Awaiting Approval</span>';
    } else if (approvalStatus === "REJECTED") {
      approvalBadgeHtml = '<span class="badge badge-red">Rejected</span>';
    }

    var dueHtml = "";
    if (p.endDate) {
      var isOverdue =
        p.endDate < Date.now() &&
        (p.status || "").toUpperCase() !== "COMPLETED";
      dueHtml =
        '<div class="card-due' +
        (isOverdue ? " overdue" : "") +
        '">Due ' +
        app.formatTimestamp(p.endDate) +
        (isOverdue ? " (Overdue)" : "") +
        "</div>";
    }
    return (
      '<div class="project-card clickable" onclick="openProjectModal(\'' +
      id +
      "')\">" +
      '<div class="employee-card-top"><div class="entity-avatar entity-avatar-project">PRJ</div>' +
      '<div class="employee-card-info"><div class="name">' +
      app.esc(p.name || "Untitled") +
      "</div>" +
      '<div class="position">Manager: ' +
      app.esc(p.projectManager || "Unassigned") +
      "</div></div></div>" +
      (desc
        ? '<div class="card-description">' + app.esc(desc) + "</div>"
        : "") +
      '<div class="card-manager"><span class="inline-icon">DPT</span>' +
      app.esc(dept) +
      "</div>" +
      '<div class="card-manager"><span class="inline-icon">BGT</span>' +
      app.esc(budget) +
      ' <span class="inline-icon">SPT</span>' +
      app.esc(spent) +
      "</div>" +
      '<div class="card-manager"><span class="inline-icon">TEAM</span>' +
      teamCount +
      " members</div>" +
      '<span class="badge ' +
      statusBadgeClass +
      '">' +
      app.esc(status) +
      "</span> " +
      approvalBadgeHtml +
      '<span class="card-priority ' +
      priorityClass +
      '">' +
      app.esc(app.formatStatus(p.priority || "MEDIUM")) +
      "</span>" +
      dueHtml +
      '<div class="card-progress-row"><div class="card-progress"><div class="card-progress-fill" style="width:' +
      pct +
      '%"></div></div>' +
      "<span>" +
      pct +
      "%</span></div></div>"
    );
  }

  function setProjectModalHint(message) {
    var hint = document.getElementById("projModalHint");
    if (!hint) return;
    hint.textContent = message || "";
    hint.classList.toggle("hidden", !message);
  }

  function setProjectApprovalSummary(message) {
    var info = document.getElementById("projApprovalSummary");
    if (!info) return;
    info.textContent = message || "";
    info.classList.toggle("hidden", !message);
  }

  function normalizeProjectApprovalStatus(project) {
    var status = String((project && project.approvalStatus) || "")
      .trim()
      .toUpperCase();
    if (
      status === "APPROVED" ||
      status === "PENDING" ||
      status === "REJECTED"
    ) {
      return status;
    }
    if (project && project.isApproved === true) return "APPROVED";
    if (
      project &&
      (project.rejectedAt ||
        String(project.approvalDecision || "")
          .trim()
          .toUpperCase() === "NO")
    ) {
      return "REJECTED";
    }
    return "PENDING";
  }

  function buildProjectApprovalSummary(project) {
    if (!project) return "";
    var snapshot = project.submissionSnapshot || {};
    var submittedBy =
      snapshot.submittedByName ||
      project.createdByName ||
      project.projectManager ||
      "Unknown";
    var submittedAt =
      snapshot.submittedAt ||
      project.submittedForApprovalAt ||
      project.createdAt ||
      0;
    var department = snapshot.department || project.department || "Unassigned";
    var budget = Number(snapshot.budget || project.budget || 0);
    var startDate = snapshot.startDate || project.startDate || 0;
    var endDate = snapshot.endDate || project.endDate || 0;
    var parts = [
      "Submitted by " + submittedBy,
      "Department: " + department,
      "Budget: $" + app.formatMoney(budget),
    ];
    if (submittedAt)
      parts.push("Submitted: " + app.formatTimestamp(submittedAt));
    if (startDate || endDate) {
      parts.push(
        "Timeline: " +
          (startDate ? app.formatTimestamp(startDate) : "TBD") +
          " -> " +
          (endDate ? app.formatTimestamp(endDate) : "TBD"),
      );
    }
    return parts.join(" | ");
  }

  function showProjectApprovalControls(show) {
    var rejectBtn = document.getElementById("projRejectBtn");
    var approveBtn = document.getElementById("projApproveBtn");
    var reviewField = document.getElementById("projApprovalReviewField");
    if (rejectBtn) rejectBtn.classList.toggle("hidden", !show);
    if (approveBtn) approveBtn.classList.toggle("hidden", !show);
    if (reviewField) reviewField.classList.toggle("hidden", !show);
  }

  function canReviewProjectApproval(project, isManagingDirector) {
    if (!project || !isManagingDirector) return false;
    var approvalStatus = normalizeProjectApprovalStatus(project);
    return approvalStatus === "PENDING";
  }

  // ---- Project Modal ----
  window.openProjectModal = function (id) {
    app.clearModalNotice("projModalNotice");
    setProjectModalHint("");
    setProjectApprovalSummary("");
    var isEdit = !!id;
    var isManagingDirector = app.isMD();
    var canCreateProject =
      isManagingDirector ||
      app.isProjectManagerRole((app.currentUser || {}).role || "");
    if (!isEdit && !canCreateProject) {
      app.showToast("You are not allowed to create projects.", "error");
      return;
    }

    var titleEl = document.getElementById("projectModalTitle");
    var saveBtn = document.getElementById("projSaveBtn");
    var deptSel = document.getElementById("projDepartment");
    var autoStatusEl = document.getElementById("projAutoStatus");
    var deleteBtn = document.getElementById("projDeleteBtn");
    var archiveBtn = document.getElementById("projArchiveBtn");
    var approvalNoteEl = document.getElementById("projApprovalNote");
    if (approvalNoteEl) approvalNoteEl.value = "";
    showProjectApprovalControls(false);

    titleEl.textContent = isEdit
      ? "Edit Project"
      : isManagingDirector
        ? "Create Project"
        : "Request New Project";
    if (saveBtn) {
      saveBtn.textContent = isEdit
        ? isManagingDirector
          ? "Save Changes"
          : "Save Update"
        : isManagingDirector
          ? "Create Project"
          : "Submit for Approval";
      saveBtn.disabled = false;
    }

    if (deleteBtn) {
      deleteBtn.classList.toggle("hidden", !(isEdit && isManagingDirector));
    }

    var spentField = document.getElementById("projSpentField");
    var completionField = document.getElementById("projCompletionField");
    if (spentField) spentField.classList.toggle("hidden", !isEdit);
    if (completionField) completionField.classList.toggle("hidden", !isEdit);

    var hintMessage = "";
    if (autoStatusEl) {
      autoStatusEl.value = isManagingDirector
        ? "Will be calculated automatically"
        : "Pending approval until reviewed";
    }

    if (isEdit) {
      var proj = findCached("projects", id);
      if (proj) {
        var approvalStatus = normalizeProjectApprovalStatus(proj);
        if (archiveBtn) {
          archiveBtn.classList.toggle(
            "hidden",
            !isManagingDirector ||
              (proj.status || "").toUpperCase() !== "COMPLETED",
          );
        }
        document.getElementById("projId").value = proj.id || "";
        document.getElementById("projName").value = proj.name || "";
        document.getElementById("projDescription").value =
          proj.description || "";
        if (isManagingDirector) {
          deptSel.innerHTML = app.deptOptions(proj.department || "");
          deptSel.disabled = false;
        } else {
          var pmDepartment = String(
            (app.currentUser || {}).department || "",
          ).trim();
          deptSel.innerHTML = app.deptOptions(
            pmDepartment || proj.department || "",
          );
          deptSel.value = pmDepartment || proj.department || "";
          deptSel.disabled = true;
        }
        document.getElementById("projPriority").value = (
          proj.priority || "MEDIUM"
        ).toUpperCase();
        document.getElementById("projBudget").value = proj.budget || "";
        document.getElementById("projSpent").value = proj.spent || "";
        document.getElementById("projCompletion").value =
          proj.completionPercentage || 0;
        document.getElementById("projStartDate").value = proj.startDate
          ? app.toDateInput(proj.startDate)
          : "";
        document.getElementById("projEndDate").value = proj.endDate
          ? app.toDateInput(proj.endDate)
          : "";
        if (autoStatusEl) {
          autoStatusEl.value = app.formatStatus(proj.status || "PLANNING");
        }
        if (approvalNoteEl) {
          approvalNoteEl.value = proj.approvalReviewNote || "";
        }

        var summaryText = buildProjectApprovalSummary(proj);
        if (summaryText) setProjectApprovalSummary(summaryText);

        var showApprovalActions = canReviewProjectApproval(
          proj,
          isManagingDirector,
        );
        showProjectApprovalControls(showApprovalActions);
        if (showApprovalActions) {
          hintMessage =
            "Review the submitted details below, then approve or reject with an optional note.";
        } else if (approvalStatus === "REJECTED") {
          hintMessage =
            "This project request was rejected. Update the details and save to resubmit for approval.";
        }

        if (!isManagingDirector) {
          hintMessage =
            "Project manager edits follow approval workflow; project status updates automatically from progress and timeline.";
        }
      }
    } else {
      if (archiveBtn) archiveBtn.classList.add("hidden");
      [
        "projId",
        "projName",
        "projDescription",
        "projBudget",
        "projSpent",
        "projStartDate",
        "projEndDate",
      ].forEach(function (fid) {
        document.getElementById(fid).value = "";
      });

      if (isManagingDirector) {
        deptSel.innerHTML = app.deptOptions("");
        deptSel.disabled = false;
      } else {
        var userDept = String((app.currentUser || {}).department || "").trim();
        deptSel.innerHTML = app.deptOptions(userDept);
        deptSel.value = userDept;
        deptSel.disabled = true;
        hintMessage =
          "This request will be submitted as Pending Approval for Managing Director review.";
      }

      document.getElementById("projPriority").value = "MEDIUM";
      document.getElementById("projCompletion").value = "0";
      document.getElementById("projSpent").value = "0";
    }

    if (!isManagingDirector) {
      var department = String((app.currentUser || {}).department || "").trim();
      if (!department) {
        hintMessage =
          "Your account is missing a department. Ask a Managing Director to assign your department before creating projects.";
        if (saveBtn) saveBtn.disabled = true;
      }
    }

    if (isManagingDirector && !isEdit) {
      hintMessage =
        "Create projects directly. Status will be calculated automatically from schedule and progress.";
    }

    setProjectModalHint(hintMessage);
    document.getElementById("projectModal").classList.remove("hidden");
  };

  window.saveProject = function () {
    app.clearModalNotice("projModalNotice");
    setProjectModalHint("");
    var saveBtn = document.getElementById("projSaveBtn");
    if (saveBtn && saveBtn.disabled) return;
    var isManagingDirector = app.isMD();
    var id = document.getElementById("projId").value;
    var isEdit = !!id;

    var name = document.getElementById("projName").value.trim();
    if (!name) {
      app.showModalNotice(
        "projModalNotice",
        "Project name is required.",
        "error",
      );
      return;
    }

    var department = isManagingDirector
      ? document.getElementById("projDepartment").value
      : String((app.currentUser || {}).department || "").trim();
    if (!department) {
      app.showModalNotice(
        "projModalNotice",
        isManagingDirector
          ? "Department is required."
          : "Your account must have a department assigned before creating a project.",
        "error",
      );
      return;
    }

    var budget = parseFloat(document.getElementById("projBudget").value);
    var spent = isEdit
      ? parseFloat(document.getElementById("projSpent").value)
      : 0;
    var safeBudget = isNaN(budget) ? 0 : budget;
    var safeSpent = isNaN(spent) ? 0 : spent;
    if (safeBudget < 0 || safeSpent < 0) {
      app.showModalNotice(
        "projModalNotice",
        "Budget and spent cannot be negative.",
        "error",
      );
      return;
    }
    if (safeBudget > 0 && safeSpent > safeBudget) {
      app.showModalNotice(
        "projModalNotice",
        "Spent cannot exceed budget.",
        "error",
      );
      return;
    }
    var completion = isEdit
      ? parseInt(document.getElementById("projCompletion").value, 10)
      : 0;
    if (isNaN(completion) || completion < 0 || completion > 100) {
      app.showModalNotice(
        "projModalNotice",
        "Completion must be between 0 and 100.",
        "error",
      );
      return;
    }
    var startDate = app.dateInputToMs("projStartDate");
    var endDate = app.dateInputToMs("projEndDate");
    if (endDate && startDate && endDate < startDate) {
      app.showModalNotice(
        "projModalNotice",
        "End date must be on or after start date.",
        "error",
      );
      return;
    }

    var payload = {
      name: name,
      description: document.getElementById("projDescription").value.trim(),
      department: department,
      priority: document.getElementById("projPriority").value,
      budget: safeBudget,
      spent: safeSpent,
      completionPercentage: completion,
      startDate: startDate,
      endDate: endDate,
    };

    var url = isEdit
      ? "/api/projects/" + encodeURIComponent(id)
      : "/api/projects";
    var method = isEdit ? "PUT" : "POST";

    saveBtn.disabled = true;
    app.fetchMutate(
      method,
      url,
      payload,
      function () {
        saveBtn.disabled = false;
        app.closeModal("projectModal");
        app.showToast(
          isEdit ? "Project updated" : "Project created",
          "success",
        );
        // Activity log
        adminLogActivity(
          isEdit ? "UPDATE" : "CREATE",
          "project",
          id || "",
          payload.name,
          "",
          isEdit ? "Project updated" : "Project created: " + payload.name,
        );
        loadProjects();
      },
      function (err) {
        saveBtn.disabled = false;
        app.showModalNotice(
          "projModalNotice",
          err || "Failed to save project.",
          "error",
        );
      },
    );
  };

  window.reviewProjectApproval = function (decision) {
    var action = String(decision || "")
      .trim()
      .toUpperCase();
    if (action !== "YES" && action !== "NO") return;
    if (!app.isMD()) {
      app.showModalNotice(
        "projModalNotice",
        "Only Managing Directors can review project approval.",
        "error",
      );
      return;
    }

    var id = document.getElementById("projId").value;
    if (!id) return;

    var approveBtn = document.getElementById("projApproveBtn");
    var rejectBtn = document.getElementById("projRejectBtn");
    var saveBtn = document.getElementById("projSaveBtn");
    if (
      (approveBtn && approveBtn.disabled) ||
      (rejectBtn && rejectBtn.disabled)
    ) {
      return;
    }
    if (approveBtn) approveBtn.disabled = true;
    if (rejectBtn) rejectBtn.disabled = true;
    if (saveBtn) saveBtn.disabled = true;

    var note = String(
      (document.getElementById("projApprovalNote") || {}).value || "",
    )
      .trim()
      .slice(0, 1600);

    app.fetchMutate(
      "PUT",
      "/api/projects/" + encodeURIComponent(id),
      {
        approvalDecision: action,
        approvalNote: note,
      },
      function () {
        if (approveBtn) approveBtn.disabled = false;
        if (rejectBtn) rejectBtn.disabled = false;
        if (saveBtn) saveBtn.disabled = false;
        app.closeModal("projectModal");
        app.showToast(
          action === "YES" ? "Project approved" : "Project rejected",
          action === "YES" ? "success" : "error",
        );
        loadProjects();
      },
      function (err) {
        if (approveBtn) approveBtn.disabled = false;
        if (rejectBtn) rejectBtn.disabled = false;
        if (saveBtn) saveBtn.disabled = false;
        app.showModalNotice(
          "projModalNotice",
          err || "Failed to review project approval.",
          "error",
        );
      },
    );
  };

  function adminLogActivity(
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
        entityId: entityId || "",
        entityName: entityName || "",
        projectId: projectId || entityId || "",
        details: details || "",
      },
      function () {},
      function () {},
    );
  }

  window.deleteProject = function () {
    var id = document.getElementById("projId").value;
    if (!id) return;
    app.showConfirm("Delete this project?", function () {
      app.fetchMutate(
        "DELETE",
        "/api/projects/" + encodeURIComponent(id),
        null,
        function () {
          app.closeModal("projectModal");
          app.showToast("Project deleted", "success");
          loadProjects();
        },
        function (err) {
          app.showModalNotice(
            "projModalNotice",
            err || "Failed to delete project.",
            "error",
          );
        },
      );
    });
  };

  /* ============================================================
       FINANCE
       ============================================================ */
  window.loadFinance = function () {
    var projects = [];
    var invoices = [];
    var doneProjects = false;
    var doneInvoices = false;

    function finalizeFinanceLoad() {
      if (!doneProjects || !doneInvoices) return;
      app.cachedData.projectsForFinance = projects;
      app.cachedData.invoices = invoices;
      populateFinanceDeptFilter(invoices, projects);
      applyFinanceFilters();
    }

    app.fetchJson(
      "/api/projects",
      function (data) {
        projects = data || [];
        doneProjects = true;
        finalizeFinanceLoad();
      },
      function () {
        projects = [];
        doneProjects = true;
        finalizeFinanceLoad();
      },
    );

    app.fetchJson(
      "/api/finance/invoices",
      function (data) {
        invoices = data || [];
        doneInvoices = true;
        finalizeFinanceLoad();
      },
      function (err) {
        app.showNotice(
          "financeNotice",
          err || "Failed to load invoices.",
          "error",
        );
        invoices = [];
        doneInvoices = true;
        finalizeFinanceLoad();
      },
    );
  };

  window.initFinanceFilters = function () {
    var wrap = document.getElementById("financeFilters");
    if (!wrap || wrap.dataset.bound === "1") return;
    wrap.dataset.bound = "1";
    var dept = document.getElementById("financeDeptFilter");
    var paid = document.getElementById("financePaidFilter");
    var client = document.getElementById("financeClientFilter");
    if (dept) dept.addEventListener("change", applyFinanceFilters);
    if (paid) paid.addEventListener("change", applyFinanceFilters);
    if (client) client.addEventListener("input", applyFinanceFilters);
  };

  function mapProjectDepartments(projects) {
    var map = {};
    (projects || []).forEach(function (p) {
      if (p && p.id) map[p.id] = p.department || "";
    });
    return map;
  }

  function resolveInvoiceDepartment(inv, projectDeptMap) {
    if (inv.department) return inv.department;
    if (inv.projectId && projectDeptMap[inv.projectId])
      return projectDeptMap[inv.projectId];
    return "";
  }

  function populateFinanceDeptFilter(invoices, projects) {
    var sel = document.getElementById("financeDeptFilter");
    if (!sel) return;
    var current = sel.value || "";
    var deptMap = {};
    var projectDeptMap = mapProjectDepartments(projects || []);
    (invoices || []).forEach(function (inv) {
      var dept = resolveInvoiceDepartment(inv, projectDeptMap).trim();
      if (dept) deptMap[dept] = true;
    });
    var depts = Object.keys(deptMap).sort(function (a, b) {
      return a.localeCompare(b);
    });
    sel.innerHTML =
      '<option value="">All Departments</option>' +
      depts
        .map(function (d) {
          return (
            '<option value="' + app.esc(d) + '">' + app.esc(d) + "</option>"
          );
        })
        .join("");
    if (current) sel.value = current;
  }

  function applyFinanceFilters() {
    var invoices = app.cachedData.invoices || [];
    var projects = app.cachedData.projectsForFinance || [];
    var projectDeptMap = mapProjectDepartments(projects);
    var dept = (
      (document.getElementById("financeDeptFilter") || {}).value || ""
    ).trim();
    var paidState = (
      (document.getElementById("financePaidFilter") || {}).value || ""
    ).trim();
    var q = ((document.getElementById("financeClientFilter") || {}).value || "")
      .toLowerCase()
      .trim();

    var filtered = invoices.filter(function (inv) {
      var invDept = resolveInvoiceDepartment(inv, projectDeptMap);
      var matchesDept = !dept || invDept === dept;
      var matchesPaid =
        !paidState || (paidState === "paid" ? !!inv.paid : !inv.paid);
      var hay = [
        inv.client || "",
        inv.id || "",
        inv.projectId || "",
        invDept || "",
      ]
        .join(" ")
        .toLowerCase();
      var matchesQuery = !q || hay.indexOf(q) !== -1;
      return matchesDept && matchesPaid && matchesQuery;
    });

    renderInvoiceKanban(filtered, projectDeptMap);
  }

  window.clearFinanceFilters = function () {
    var dept = document.getElementById("financeDeptFilter");
    var paid = document.getElementById("financePaidFilter");
    var client = document.getElementById("financeClientFilter");
    if (dept) dept.value = "";
    if (paid) paid.value = "";
    if (client) client.value = "";
    applyFinanceFilters();
  };

  function renderInvoiceKanban(invoices, projectDeptMap) {
    var statsEl = document.getElementById("financeDeptStats");
    var groupsEl = document.getElementById("financeDeptGroups");
    if (!statsEl || !groupsEl) return;

    var groups = {};
    var noDept = [];
    (invoices || []).forEach(function (inv) {
      var dept = resolveInvoiceDepartment(inv, projectDeptMap || {}).trim();
      var enriched = Object.assign({}, inv, { __department: dept });
      if (!dept) {
        noDept.push(enriched);
        return;
      }
      if (!groups[dept]) groups[dept] = [];
      groups[dept].push(enriched);
    });

    var deptNames = Object.keys(groups).sort(function (a, b) {
      return a.localeCompare(b);
    });
    var total = (invoices || []).length;
    var paidCount = (invoices || []).filter(function (inv) {
      return !!inv.paid;
    }).length;
    var outstanding = total - paidCount;
    var deptCount = deptNames.length + (noDept.length > 0 ? 1 : 0);

    statsEl.innerHTML =
      '<div class="stat-card stat-card-blue"><div class="stat-number">' +
      total +
      '</div><div class="stat-label">Invoices</div><div class="stat-sub">Filtered list</div></div>' +
      '<div class="stat-card stat-card-green"><div class="stat-number">' +
      paidCount +
      '</div><div class="stat-label">Paid</div><div class="stat-sub">Settled invoices</div></div>' +
      '<div class="stat-card stat-card-orange"><div class="stat-number">' +
      outstanding +
      '</div><div class="stat-label">Outstanding</div><div class="stat-sub">Due invoices</div></div>' +
      '<div class="stat-card stat-card-purple"><div class="stat-number">' +
      deptCount +
      '</div><div class="stat-label">Departments</div><div class="stat-sub">Grouped view</div></div>';

    var html = "";
    if (noDept.length > 0) {
      html +=
        '<div class="dept-group dept-group-warning"><div class="dept-group-header"><span class="dept-group-name">Unassigned</span><span class="dept-group-count">' +
        noDept.length +
        " invoice" +
        (noDept.length === 1 ? "" : "s") +
        '</span></div><div class="dept-group-cards">' +
        noDept.map(renderInvoiceCard).join("") +
        "</div></div>";
    }
    deptNames.forEach(function (d) {
      var items = groups[d] || [];
      html +=
        '<div class="dept-group"><div class="dept-group-header"><span class="dept-group-name">' +
        app.esc(d) +
        '</span><span class="dept-group-count">' +
        items.length +
        " invoice" +
        (items.length === 1 ? "" : "s") +
        '</span></div><div class="dept-group-cards">' +
        items.map(renderInvoiceCard).join("") +
        "</div></div>";
    });

    groupsEl.innerHTML =
      html ||
      '<div class="empty-state">No invoices match the current filters.</div>';
  }

  function renderInvoiceCard(inv) {
    var statusClass = inv.paid
      ? "invoice-status-paid"
      : "invoice-status-outstanding";
    var statusText = inv.paid ? "Paid" : "Outstanding";
    var id = app.esc(inv.id || "");
    var toggleClass = inv.paid ? "mark-unpaid" : "mark-paid";
    var toggleLabel = inv.paid ? "Mark Unpaid" : "Mark Paid";
    var dept = inv.__department || inv.department || "Unassigned";
    return (
      '<div class="invoice-card clickable" onclick="openInvoiceModal(\'' +
      id +
      "')\">" +
      '<div class="employee-card-top"><div class="entity-avatar entity-avatar-invoice">INV</div>' +
      '<div class="employee-card-info"><div class="name">' +
      app.esc(inv.client || "Unknown client") +
      "</div>" +
      '<div class="position">Invoice #' +
      app.esc(inv.id || "N/A") +
      "</div></div></div>" +
      '<div class="invoice-amount">$' +
      app.formatMoney(inv.amount || 0) +
      "</div>" +
      '<div class="invoice-client"><span class="inline-icon">DPT</span>' +
      app.esc(dept) +
      "</div>" +
      '<span class="invoice-status-badge ' +
      statusClass +
      '">' +
      statusText +
      "</span>" +
      (inv.issuedAt
        ? '<div class="invoice-date">' +
          app.formatTimestamp(inv.issuedAt) +
          "</div>"
        : "") +
      '<button class="invoice-toggle-btn ' +
      toggleClass +
      '" onclick="event.stopPropagation();toggleInvoicePaid(\'' +
      id +
      "')\">" +
      toggleLabel +
      "</button>" +
      "</div>"
    );
  }

  window.openInvoiceModal = function (id) {
    app.clearModalNotice("invModalNotice");
    var isEdit = !!id;
    document.getElementById("invoiceModalTitle").textContent = isEdit
      ? "Edit Invoice"
      : "Add Invoice";
    document.getElementById("invDeleteBtn").classList.toggle("hidden", !isEdit);

    if (isEdit) {
      var inv = findCached("invoices", id);
      if (inv) {
        document.getElementById("invId").value = inv.id || "";
        document.getElementById("invClient").value = inv.client || "";
        document.getElementById("invAmount").value = inv.amount || "";
        document.getElementById("invPaid").value = inv.paid ? "true" : "false";
        document.getElementById("invProjectId").value = inv.projectId || "";
      }
    } else {
      ["invId", "invClient", "invAmount", "invProjectId"].forEach(
        function (fid) {
          document.getElementById(fid).value = "";
        },
      );
      document.getElementById("invPaid").value = "false";
    }
    document.getElementById("invoiceModal").classList.remove("hidden");
  };

  window.saveInvoice = function () {
    app.clearModalNotice("invModalNotice");
    var saveBtn = document.getElementById("invSaveBtn");
    if (saveBtn && saveBtn.disabled) return;
    var client = document.getElementById("invClient").value.trim();
    var amount = parseFloat(document.getElementById("invAmount").value);
    if (!client) {
      app.showModalNotice(
        "invModalNotice",
        "Client name is required.",
        "error",
      );
      return;
    }
    if (isNaN(amount) || amount <= 0) {
      app.showModalNotice(
        "invModalNotice",
        "A valid amount is required.",
        "error",
      );
      return;
    }
    var projectId = document.getElementById("invProjectId").value.trim();
    if (projectId && !/^[a-zA-Z0-9_-]{1,128}$/.test(projectId)) {
      app.showModalNotice(
        "invModalNotice",
        "Project ID format is invalid.",
        "error",
      );
      return;
    }

    var id = document.getElementById("invId").value;
    var payload = {
      client: client,
      amount: amount,
      paid: document.getElementById("invPaid").value === "true",
      projectId: projectId,
    };

    var isEdit = !!id;
    var url = isEdit
      ? "/api/finance/invoices/" + encodeURIComponent(id)
      : "/api/finance/invoices";
    var method = isEdit ? "PUT" : "POST";

    saveBtn.disabled = true;
    app.fetchMutate(
      method,
      url,
      payload,
      function () {
        saveBtn.disabled = false;
        app.closeModal("invoiceModal");
        app.showToast(
          isEdit ? "Invoice updated" : "Invoice created",
          "success",
        );
        loadFinance();
      },
      function (err) {
        saveBtn.disabled = false;
        app.showModalNotice(
          "invModalNotice",
          err || "Failed to save invoice.",
          "error",
        );
      },
    );
  };

  window.deleteInvoice = function () {
    var id = document.getElementById("invId").value;
    if (!id) return;
    app.showConfirm("Delete this invoice?", function () {
      app.fetchMutate(
        "DELETE",
        "/api/finance/invoices/" + encodeURIComponent(id),
        null,
        function () {
          app.closeModal("invoiceModal");
          app.showToast("Invoice deleted", "success");
          loadFinance();
        },
        function (err) {
          app.showModalNotice(
            "invModalNotice",
            err || "Failed to delete invoice.",
            "error",
          );
        },
      );
    });
  };

  window.toggleInvoicePaid = function (id) {
    var inv = findCached("invoices", id);
    if (!inv) return;
    var payload = {
      client: inv.client,
      amount: inv.amount,
      paid: !inv.paid,
      projectId: inv.projectId || "",
    };
    app.fetchMutate(
      "PUT",
      "/api/finance/invoices/" + encodeURIComponent(id),
      payload,
      function () {
        app.showToast(
          payload.paid
            ? "Invoice marked as paid"
            : "Invoice marked as outstanding",
          "success",
        );
        loadFinance();
      },
      function (err) {
        app.showToast(err || "Failed to update invoice", "error");
      },
    );
  };

  window.exportInvoicesCSV = function () {
    var invoices = app.cachedData.invoices;
    if (!invoices || invoices.length === 0) {
      app.showToast("No invoices to export", "error");
      return;
    }
    var csv = "ID,Client,Amount,Paid,Issued At\n";
    invoices.forEach(function (inv) {
      var client = (inv.client || "").replace(/"/g, '""');
      csv +=
        '"' +
        (inv.id || "") +
        '","' +
        client +
        '",' +
        (inv.amount || 0) +
        "," +
        (inv.paid ? "Yes" : "No") +
        ',"' +
        app.formatTimestamp(inv.issuedAt) +
        '"\n';
    });
    var blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    var link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download =
      "invoices_" + new Date().toISOString().split("T")[0] + ".csv";
    link.click();
    URL.revokeObjectURL(link.href);
    app.showToast("Invoices exported", "success");
  };

  /* ============================================================
       SETTINGS
       ============================================================ */
  window.applySettingsInfo = function () {
    if (!app.currentUser) return;
    var name = app.currentUser.displayName || app.currentUser.email || "User";
    var el;
    el = document.getElementById("settingsName");
    if (el) el.textContent = name;
    el = document.getElementById("settingsEmail");
    if (el) el.textContent = app.currentUser.email || "\u2014";
    el = document.getElementById("settingsRole");
    if (el) el.textContent = app.formatRole(app.currentUser.role);

    var approval = document.getElementById("settingsApproval");
    if (approval) {
      var isApproved = app.currentUser.mdApproved !== false;
      approval.innerHTML = isApproved
        ? '<span class="approval-badge approved">Approved</span>'
        : '<span class="approval-badge pending">Pending approval</span>';
    }
    var sidebarCheck = document.getElementById("settingSidebarExpanded");
    if (sidebarCheck) {
      sidebarCheck.checked =
        localStorage.getItem("sidebarCollapsed") !== "true";
    }
    var darkCheck = document.getElementById("settingDarkMode");
    if (darkCheck) {
      darkCheck.checked =
        typeof app.getThemeMode === "function" && app.getThemeMode() === "dark";
    }
  };

  window.saveSettings = function () {
    var darkCheckbox = document.getElementById("settingDarkMode");
    if (darkCheckbox && typeof app.setTheme === "function") {
      app.setTheme(darkCheckbox.checked ? "dark" : "light");
    }
    var sidebarCheckbox = document.getElementById("settingSidebarExpanded");
    if (sidebarCheckbox) {
      if (sidebarCheckbox.checked) {
        localStorage.removeItem("sidebarCollapsed");
        document
          .getElementById("appShell")
          .classList.remove("sidebar-collapsed");
      } else {
        localStorage.setItem("sidebarCollapsed", "true");
        document.getElementById("appShell").classList.add("sidebar-collapsed");
      }
    }
    document.getElementById("saveStatus").textContent = "Settings saved.";
    app.showToast("Settings saved", "success");
    setTimeout(function () {
      document.getElementById("saveStatus").textContent = "";
    }, 2000);
  };

  /* ============================================================
       SEARCH FILTER
       ============================================================ */
  window.setupSearchFilter = function (filterFn) {
    var input = document.getElementById("headerSearchInput");
    if (input) {
      input.addEventListener("input", function () {
        filterFn(this.value.toLowerCase().trim());
      });
    }
  };

  window.filterEmployeeCards = function (query) {
    var input = document.getElementById("empNameFilter");
    if (input) input.value = query || "";
    applyEmployeeFilters();
  };

  window.filterProjectCards = function (query) {
    var input = document.getElementById("projSearchFilter");
    if (input) input.value = query || "";
    applyProjectFilters();
  };

  window.filterUserCards = function (query) {
    var input = document.getElementById("userSearchFilter");
    if (input) input.value = query || "";
    applyUserFilters();
  };

  /* ============================================================
       USER MANAGEMENT (MD only)
       ============================================================ */
  var allUsersCache = [];
  var pendingUsersCache = [];

  window.loadUserManagement = function () {
    if (!app.isMD()) {
      app.showNotice(
        "usersNotice",
        "Access restricted to Managing Directors.",
        "error",
      );
      return;
    }
    var pendingDone = false,
      allDone = false;
    var pendingData = [],
      allData = [];

    app.fetchJson(
      "/api/employees?pendingUsers=true",
      function (data) {
        pendingData = data || [];
        pendingUsersCache = pendingData;
        pendingDone = true;
        if (allDone) renderUserManagement(pendingData, allData);
      },
      function () {
        pendingData = [];
        pendingUsersCache = [];
        pendingDone = true;
        if (allDone) renderUserManagement(pendingData, allData);
      },
    );

    app.fetchJson(
      "/api/employees?allUsers=true",
      function (data) {
        allData = data || [];
        allUsersCache = allData;
        allDone = true;
        if (pendingDone) renderUserManagement(pendingData, allData);
      },
      function () {
        allData = [];
        allUsersCache = [];
        allDone = true;
        if (pendingDone) renderUserManagement(pendingData, allData);
      },
    );
  };

  function renderUserManagement(pending, allUsers) {
    var visiblePending = (pending || []).filter(function (u) {
      return !isCurrentUserRecord(u);
    });
    var visibleUsers = (allUsers || []).filter(function (u) {
      return !isCurrentUserRecord(u);
    });

    var approved = visibleUsers.filter(function (u) {
      return u.mdApproved === true;
    }).length;
    var statsEl = document.getElementById("userStats");
    if (statsEl) {
      statsEl.innerHTML =
        '<div class="stat-card stat-card-blue"><div class="stat-number">' +
        visibleUsers.length +
        '</div><div class="stat-label">Total Users</div><div class="stat-sub">All registered accounts</div></div>' +
        '<div class="stat-card stat-card-orange"><div class="stat-number">' +
        visiblePending.length +
        '</div><div class="stat-label">Pending</div><div class="stat-sub">Awaiting approval</div></div>' +
        '<div class="stat-card stat-card-green"><div class="stat-number">' +
        approved +
        '</div><div class="stat-label">Approved</div><div class="stat-sub">Active users</div></div>';
    }

    // Pending approvals
    var pendingEl = document.getElementById("pendingUsersList");
    if (pendingEl) {
      if (visiblePending.length === 0) {
        pendingEl.innerHTML =
          '<div class="empty-state">No pending registrations.</div>';
      } else {
        pendingEl.innerHTML = visiblePending
          .map(function (u) {
            var name = app.buildName(u);
            var uid = app.esc(u.id || "");
            var stage =
              u.mdApproved === true
                ? '<span class="badge badge-orange">Awaiting PM Approval</span>'
                : '<span class="badge badge-muted">Awaiting MD Approval</span>';
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
              app.esc(app.formatRole(u.role)) +
              "</span>" +
              stage +
              '<div class="user-row-actions">' +
              '<button class="btn-approve-sm" onclick="approveUserFromManagement(\'' +
              uid +
              '")" data-user-id="' +
              uid +
              '">Approve</button>' +
              "</div></div>"
            );
          })
          .join("");
      }
    }

    // All users
    var allEl = document.getElementById("allUsersList");
    if (allEl) {
      if (visibleUsers.length === 0) {
        allEl.innerHTML = '<div class="empty-state">No registered users.</div>';
      } else {
        allEl.innerHTML = visibleUsers
          .map(function (u) {
            var name = app.buildName(u);
            var uid = app.esc(u.id || "");
            var roleClass =
              u.role === "MANAGING_DIRECTOR"
                ? "badge-blue"
                : u.role === "PROJECT_MANAGER"
                  ? "badge-orange"
                  : "badge-green";
            var approvedBadge = "";
            if (u.role === "EMPLOYEE") {
              approvedBadge =
                u.mdApproved === true && u.pmApproved === true
                  ? '<span class="badge badge-green">MD + PM Approved</span>'
                  : u.mdApproved === true
                    ? '<span class="badge badge-orange">MD Approved Only</span>'
                    : '<span class="badge badge-muted">Awaiting MD Approval</span>';
            } else {
              approvedBadge =
                u.mdApproved === true
                  ? '<span class="badge badge-green">Approved</span>'
                  : '<span class="badge badge-muted">Not Approved</span>';
            }
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
              '<span class="badge ' +
              roleClass +
              '">' +
              app.esc(app.formatRole(u.role)) +
              "</span>" +
              approvedBadge +
              '<button class="btn-edit-sm" onclick="openUserRoleModal(\'' +
              uid +
              "')\">Edit Role</button>" +
              "</div>"
            );
          })
          .join("");
      }
    }

    applyUserFilters();
  }

  window.initUserFilters = function () {
    var wrap = document.getElementById("userFilters");
    if (!wrap || wrap.dataset.bound === "1") return;
    wrap.dataset.bound = "1";
    ["userRoleFilter", "userApprovalFilter"].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener("change", applyUserFilters);
    });
    var search = document.getElementById("userSearchFilter");
    if (search) search.addEventListener("input", applyUserFilters);
  };

  function applyUserFilters() {
    var role = (
      (document.getElementById("userRoleFilter") || {}).value || ""
    ).trim();
    var approval = (
      (document.getElementById("userApprovalFilter") || {}).value || ""
    ).trim();
    var q = ((document.getElementById("userSearchFilter") || {}).value || "")
      .toLowerCase()
      .trim();

    document
      .querySelectorAll("#allUsersList .user-row")
      .forEach(function (row) {
        var rowRole = (row.querySelector(".badge") || {}).textContent || "";
        var text = (row.textContent || "").toLowerCase();
        var hasMdPmApproved = text.indexOf("md + pm approved") !== -1;
        var hasMdOnly = text.indexOf("md approved only") !== -1;
        var awaitingMd =
          text.indexOf("awaiting md approval") !== -1 ||
          text.indexOf("not approved") !== -1;

        var roleOk =
          !role ||
          text.indexOf(role.replace(/_/g, " ").toLowerCase()) !== -1 ||
          rowRole.toUpperCase().indexOf(role.replace(/_/g, " ")) !== -1;
        var approvalOk =
          !approval ||
          (approval === "approved" && hasMdPmApproved) ||
          (approval === "pm_pending" && hasMdOnly) ||
          (approval === "md_pending" && awaitingMd);
        var queryOk = !q || text.indexOf(q) !== -1;
        row.style.display = roleOk && approvalOk && queryOk ? "" : "none";
      });

    document
      .querySelectorAll("#pendingUsersList .user-row")
      .forEach(function (row) {
        var text = (row.textContent || "").toLowerCase();
        var roleOk =
          !role || text.indexOf(role.replace(/_/g, " ").toLowerCase()) !== -1;
        var approvalOk =
          !approval || approval === "md_pending" || approval === "pm_pending";
        var queryOk = !q || text.indexOf(q) !== -1;
        row.style.display = roleOk && approvalOk && queryOk ? "" : "none";
      });
  }

  window.clearUserFilters = function () {
    var role = document.getElementById("userRoleFilter");
    var approval = document.getElementById("userApprovalFilter");
    var q = document.getElementById("userSearchFilter");
    if (role) role.value = "";
    if (approval) approval.value = "";
    if (q) q.value = "";
    applyUserFilters();
  };

  window.approveUserFromManagement = function (id) {
    if (!id) return;
    var btn = document.querySelector(
      '#pendingUsersList .btn-approve-sm[data-user-id="' + id + '"]',
    );
    if (btn && btn.disabled) return;
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Approving...";
    }
    app.fetchMutate(
      "PUT",
      "/api/employees/" + encodeURIComponent(id) + "?approveUser=true",
      {},
      function () {
        app.showToast("User approved", "success");
        loadUserManagement();
      },
      function (err) {
        app.showToast(err || "Approval failed", "error");
        if (btn) {
          btn.disabled = false;
          btn.textContent = "Approve";
        }
      },
    );
  };

  window.bulkApproveUsersFromManagement = function () {
    var pending = (pendingUsersCache || []).filter(function (u) {
      return u && u.id && u.mdApproved !== true;
    });
    if (!pending.length) {
      app.showToast("No MD-pending users to approve.", "warning");
      return;
    }

    var ids = pending.map(function (u) {
      return u.id;
    });
    var bulkBtn = document.getElementById("bulkApproveUsersBtn");
    if (bulkBtn && bulkBtn.disabled) return;
    app.showConfirm("Approve " + ids.length + " pending users?", function () {
      if (bulkBtn) bulkBtn.disabled = true;
      app.fetchMutate(
        "PUT",
        "/api/employees?bulkApproveUsers=true",
        { userIds: ids },
        function (resp) {
          var count =
            resp && resp.approvedCount ? resp.approvedCount : ids.length;
          app.showToast(count + " users approved", "success");
          if (bulkBtn) bulkBtn.disabled = false;
          loadUserManagement();
        },
        function (err) {
          app.showToast(err || "Bulk approval failed", "error");
          if (bulkBtn) bulkBtn.disabled = false;
        },
      );
    });
  };

  window.openUserRoleModal = function (id) {
    app.clearModalNotice("userRoleModalNotice");
    var user = null;
    for (var i = 0; i < allUsersCache.length; i++) {
      if (allUsersCache[i].id === id) {
        user = allUsersCache[i];
        break;
      }
    }
    if (!user) {
      app.showToast("User not found", "error");
      return;
    }
    document.getElementById("editUserId").value = user.id;
    document.getElementById("editUserName").value = app.buildName(user);
    document.getElementById("editUserEmail").value = user.email || "";
    document.getElementById("editUserRole").value = user.role || "EMPLOYEE";
    document.getElementById("userRoleModal").classList.remove("hidden");
  };

  window.saveUserRole = function () {
    var id = document.getElementById("editUserId").value;
    var role = document.getElementById("editUserRole").value;
    if (!id || !role) return;
    var btn = document.getElementById("userRoleSaveBtn");
    if (btn) btn.disabled = true;
    app.fetchMutate(
      "PUT",
      "/api/employees/" + encodeURIComponent(id) + "?updateRole=true",
      { role: role },
      function () {
        if (btn) btn.disabled = false;
        app.closeModal("userRoleModal");
        app.showToast("Role updated", "success");
        loadUserManagement();
      },
      function (err) {
        if (btn) btn.disabled = false;
        app.showModalNotice(
          "userRoleModalNotice",
          err || "Failed to update role.",
          "error",
        );
      },
    );
  };

  /* ============================================================
       REPORTS & ACTIVITY
       ============================================================ */
  var activityLogsCache = [];
  var approvalAuditLogsCache = [];

  window.loadReports = function () {
    // Load project data for report
    app.fetchJson("/api/projects", function (projects) {
      var active = projects.filter(function (p) {
        return p.status === "IN_PROGRESS";
      }).length;
      var totalBudget = projects.reduce(function (s, p) {
        return s + (p.budget || 0);
      }, 0);
      var totalSpent = projects.reduce(function (s, p) {
        return s + (p.spent || 0);
      }, 0);
      var completed = projects.filter(function (p) {
        return p.status === "COMPLETED";
      }).length;

      var statsEl = document.getElementById("reportStats");
      if (statsEl) {
        statsEl.innerHTML =
          '<div class="stat-card stat-card-blue"><div class="stat-number">' +
          projects.length +
          '</div><div class="stat-label">Total Projects</div></div>' +
          '<div class="stat-card stat-card-green"><div class="stat-number">' +
          active +
          '</div><div class="stat-label">Active</div></div>' +
          '<div class="stat-card stat-card-purple"><div class="stat-number">' +
          completed +
          '</div><div class="stat-label">Completed</div></div>' +
          '<div class="stat-card stat-card-orange"><div class="stat-number">$' +
          totalBudget.toLocaleString() +
          '</div><div class="stat-label">Total Budget</div></div>';
      }

      var tbody = document.getElementById("projectReportBody");
      if (tbody) {
        if (projects.length === 0) {
          tbody.innerHTML = '<tr><td colspan="8">No projects found.</td></tr>';
        } else {
          tbody.innerHTML = projects
            .filter(function (p) {
              return p.status !== "ARCHIVED";
            })
            .map(function (p) {
              var pct = p.completionPercentage || 0;
              var deadline = p.endDate ? app.formatTimestamp(p.endDate) : "-";
              var isOverdue =
                p.endDate && p.endDate < Date.now() && p.status !== "COMPLETED";
              return (
                "<tr" +
                (isOverdue ? ' class="row-overdue"' : "") +
                ">" +
                "<td>" +
                app.esc(p.name || "Untitled") +
                "</td>" +
                '<td><span class="badge badge-muted">' +
                app.esc(app.formatStatus(p.status || "")) +
                "</span></td>" +
                "<td>" +
                app.esc(p.projectManager || "-") +
                "</td>" +
                '<td><div class="card-progress"><div class="card-progress-fill" style="width:' +
                pct +
                '%"></div></div> ' +
                pct +
                "%</td>" +
                "<td>$" +
                (p.budget || 0).toLocaleString() +
                "</td>" +
                "<td>$" +
                (p.spent || 0).toLocaleString() +
                "</td>" +
                "<td>" +
                (p.teamMemberIds || []).length +
                "</td>" +
                '<td class="' +
                (isOverdue ? "overdue" : "") +
                '">' +
                deadline +
                "</td></tr>"
              );
            })
            .join("");
        }
      }
    });

    // Load activity logs
    app.fetchJson(
      "/api/workspace/activity-logs?limit=100",
      function (logs) {
        activityLogsCache = logs || [];
        renderActivityLogs(activityLogsCache);
      },
      function () {
        document.getElementById("activityLogList").innerHTML =
          '<div class="empty-state">Could not load activity logs.</div>';
      },
    );

    // Load approval audit logs
    app.fetchJson(
      "/api/workspace/activity-logs?limit=200&entityType=approval",
      function (logs) {
        approvalAuditLogsCache = logs || [];
        renderApprovalAuditLogs(approvalAuditLogsCache);
      },
      function () {
        var list = document.getElementById("approvalAuditList");
        if (list)
          list.innerHTML =
            '<div class="empty-state">Could not load approval audit trail.</div>';
      },
    );
  };

  function renderActivityLogs(logs) {
    var el = document.getElementById("activityLogList");
    if (!el) return;
    if (!logs || logs.length === 0) {
      el.innerHTML = '<div class="empty-state">No activity logged yet.</div>';
      return;
    }
    el.innerHTML = logs
      .map(function (l) {
        var iconMap = {
          CREATE: "+",
          UPDATE: "~",
          DELETE: "x",
          COMMENT: '"',
          SUBMIT_REVIEW: "✓",
          STATUS_CHANGE: "→",
        };
        var icon = iconMap[l.action] || "•";
        var time = l.createdAt ? app.formatTimestamp(l.createdAt) : "";
        return (
          '<div class="activity-log-item">' +
          '<span class="activity-icon">' +
          icon +
          "</span>" +
          '<div class="activity-info">' +
          '<span class="activity-text"><strong>' +
          app.esc(l.userName || "Unknown") +
          "</strong> " +
          app.esc(l.details || l.action || "") +
          "</span>" +
          '<span class="activity-meta">' +
          app.esc((l.entityType || "").replace(/_/g, " ")) +
          " &middot; " +
          time +
          "</span>" +
          "</div></div>"
        );
      })
      .join("");
  }

  window.filterActivityLogs = function () {
    var filter = (document.getElementById("activityFilter") || {}).value || "";
    if (!filter) {
      renderActivityLogs(activityLogsCache);
      return;
    }
    var filtered = activityLogsCache.filter(function (l) {
      return l.entityType === filter;
    });
    renderActivityLogs(filtered);
  };

  function renderApprovalAuditLogs(logs) {
    var el = document.getElementById("approvalAuditList");
    if (!el) return;
    if (!logs || logs.length === 0) {
      el.innerHTML =
        '<div class="empty-state">No approval events logged yet.</div>';
      return;
    }
    var labelMap = {
      MD_APPROVAL: "MD Approval",
      PM_APPROVAL: "PM Approval",
      BULK_MD_APPROVAL: "MD Bulk Approval",
      BULK_PM_APPROVAL: "PM Bulk Approval",
    };
    var iconMap = {
      MD_APPROVAL: "M",
      PM_APPROVAL: "P",
      BULK_MD_APPROVAL: "M+",
      BULK_PM_APPROVAL: "P+",
    };

    el.innerHTML = logs
      .map(function (l) {
        var icon = iconMap[l.action] || "A";
        var eventLabel =
          labelMap[l.action] || app.formatStatus(l.action || "APPROVAL");
        var time = l.createdAt ? app.formatTimestamp(l.createdAt) : "";
        var actor = l.userName || "Unknown";
        var target = l.entityName || "Multiple users";
        var dept = l.department || "N/A";
        var details = l.details || "";

        return (
          '<div class="activity-log-item">' +
          '<span class="activity-icon">' +
          app.esc(icon) +
          "</span>" +
          '<div class="activity-info">' +
          '<span class="activity-text"><strong>' +
          app.esc(actor) +
          "</strong> performed <strong>" +
          app.esc(eventLabel) +
          "</strong> for <strong>" +
          app.esc(target) +
          "</strong>.</span>" +
          '<span class="activity-meta">Department: ' +
          app.esc(dept) +
          " &middot; " +
          app.esc(time) +
          "</span>" +
          (details
            ? '<span class="activity-meta">' + app.esc(details) + "</span>"
            : "") +
          "</div></div>"
        );
      })
      .join("");
  }

  window.filterApprovalAuditLogs = function () {
    var filter =
      (document.getElementById("approvalAuditFilter") || {}).value || "";
    if (!filter) {
      renderApprovalAuditLogs(approvalAuditLogsCache);
      return;
    }
    var filtered = approvalAuditLogsCache.filter(function (l) {
      return (l.action || "") === filter;
    });
    renderApprovalAuditLogs(filtered);
  };

  /* ============================================================
       ARCHIVE
       ============================================================ */
  window.archiveProject = function () {
    if (!app.isMD()) {
      app.showModalNotice(
        "projModalNotice",
        "Only Managing Directors can archive projects.",
        "error",
      );
      return;
    }
    var id = document.getElementById("projId").value;
    if (!id) return;
    if (
      !confirm(
        "Archive this project? It will be removed from the active board.",
      )
    )
      return;
    app.fetchMutate(
      "PUT",
      "/api/projects/" + encodeURIComponent(id),
      { status: "ARCHIVED" },
      function () {
        app.closeModal("projectModal");
        app.showToast("Project archived", "success");
        adminLogActivity("ARCHIVE", "project", id, "", "", "Project archived");
        loadProjects();
      },
      function (err) {
        app.showModalNotice(
          "projModalNotice",
          err || "Failed to archive.",
          "error",
        );
      },
    );
  };

  window.toggleArchivedProjects = function () {
    var list = document.getElementById("archivedProjectsList");
    if (!list) return;
    var isHidden = list.classList.toggle("hidden");
    var btn = list.previousElementSibling;
    if (btn && btn.tagName === "BUTTON")
      btn.textContent = isHidden
        ? "Show Archived Projects"
        : "Hide Archived Projects";
    if (!isHidden) renderArchivedProjects();
  };

  function renderArchivedProjects() {
    var list = document.getElementById("archivedProjectsList");
    var countEl = document.getElementById("archivedCount");
    if (!list) return;
    var projects = app.cachedData.projects || [];
    var archived = projects.filter(function (p) {
      return (p.status || "").toUpperCase() === "ARCHIVED";
    });
    if (countEl) countEl.textContent = archived.length;
    if (archived.length === 0) {
      list.innerHTML =
        '<p class="kanban-empty"><span class="msg">No archived projects.</span></p>';
      return;
    }
    list.innerHTML = archived
      .map(function (p) {
        return (
          '<div class="project-card archived-card" onclick="openProjectModal(\'' +
          app.esc(p.id) +
          "')\">" +
          '<div class="card-title">' +
          app.esc(p.name) +
          "</div>" +
          '<div class="card-meta">' +
          app.esc(p.department || "No dept") +
          "</div>" +
          "</div>"
        );
      })
      .join("");
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
      container.innerHTML =
        '<div class="kanban-empty"><div class="msg">' +
        app.esc(emptyMsg) +
        "</div></div>";
      return;
    }
    container.innerHTML = items.map(renderFn).join("");
  }

  function clearKanbanSpinners(boardId) {
    var board = document.getElementById(boardId);
    if (!board) return;
    board.querySelectorAll(".loading-spinner").forEach(function (s) {
      s.classList.remove("visible");
    });
  }
})(ShenanigansApp);
