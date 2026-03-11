package com.example.shenanigans.features.employee_dashboard.controller;

import com.example.shenanigans.core.navigation.ViewNavigator;
import com.example.shenanigans.core.session.SessionManager;
import com.example.shenanigans.features.auth.model.User;
import com.example.shenanigans.features.employees.model.Employee;
import com.example.shenanigans.features.employees.service.EmployeeService;
import com.example.shenanigans.features.employee_dashboard.model.TimesheetEntry;
import com.example.shenanigans.features.employee_dashboard.model.LeaveRequest;
import com.example.shenanigans.features.employee_dashboard.model.CompanyDocument;
import com.example.shenanigans.features.employee_dashboard.service.TimesheetService;
import com.example.shenanigans.features.employee_dashboard.service.LeaveRequestService;
import com.example.shenanigans.features.employee_dashboard.service.DocumentService;
import com.example.shenanigans.features.projects.model.Project;
import com.example.shenanigans.features.projects.service.ProjectService;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.concurrent.ExecutionException;
import java.util.logging.Logger;
import javafx.animation.FadeTransition;
import javafx.animation.ParallelTransition;
import javafx.application.Platform;
import javafx.concurrent.Task;
import javafx.fxml.FXML;
import javafx.geometry.Pos;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.control.ProgressBar;
import javafx.scene.control.ProgressIndicator;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.Region;
import javafx.scene.layout.StackPane;
import javafx.scene.layout.VBox;
import javafx.scene.shape.Circle;
import javafx.util.Duration;

/**
 * Controller for the unified employee workspace view. Renders overview,
 * tasks, projects, timesheet, leave requests, documents, team, and profile.
 */
public class EmployeeWorkspaceController {

    private static final Logger LOGGER = Logger.getLogger(EmployeeWorkspaceController.class.getName());
    private static final DateTimeFormatter DATE_FORMATTER = DateTimeFormatter.ofPattern("MMM dd, yyyy")
            .withZone(ZoneId.systemDefault());

    private final ProjectService projectService = new ProjectService();
    private final EmployeeService employeeService = new EmployeeService();
    private final TimesheetService timesheetService = new TimesheetService();
    private final LeaveRequestService leaveRequestService = new LeaveRequestService();
    private final DocumentService documentService = new DocumentService();

    @FXML
    private Label welcomeLabel;
    @FXML
    private Label emailLabel;
    @FXML
    private Label avatarLabel;
    @FXML
    private Label roleLabel;

    @FXML
    private Button overviewButton;
    @FXML
    private Button myTasksButton;
    @FXML
    private Button myProjectsButton;
    @FXML
    private Button timeSheetButton;
    @FXML
    private Button requestsButton;
    @FXML
    private Button documentsButton;
    @FXML
    private Button teamButton;
    @FXML
    private Button profileButton;
    @FXML
    private Button backToDashboardButton;
    @FXML
    private Button refreshButton;

    @FXML
    private Label sectionTitleLabel;
    @FXML
    private Label sectionSubtitleLabel;
    @FXML
    private HBox statsContainer;
    @FXML
    private HBox contentGrid;
    @FXML
    private VBox primaryContent;
    @FXML
    private VBox secondaryContent;
    @FXML
    private Label sectionStatusLabel;
    @FXML
    private ProgressIndicator loadingIndicator;
    @FXML
    private Label workStatusTextLabel;
    @FXML
    private Label workStatusTimeLabel;
    @FXML
    private Region workStatusDot;

    private EmployeeWorkspaceSection currentSection;
    private EmployeeWorkspaceData cachedData;
    private long lastLoadedAt;

    private static final long CACHE_TTL_MILLIS = 60_000L;

    /** Called automatically after FXML is loaded. */
    @FXML
    public void initialize() {
        if (!SessionManager.getInstance().isLoggedIn()) {
            Platform.runLater(this::redirectToLogin);
            return;
        }

        User user = SessionManager.getInstance().getCurrentUser();
        if (user == null || !user.isEmployee()) {
            Platform.runLater(this::redirectToMainDashboard);
            return;
        }

        setupUserInfo(user);
        currentSection = resolveSection(SessionManager.getInstance().getSelectedEmployeeSection());
        setActiveButton(currentSection);
        loadSectionData();
    }

    private void setupUserInfo(User user) {
        if (welcomeLabel != null) {
            welcomeLabel.setText("Welcome, " + safeValue(user.getDisplayName()) + "!");
        }
        if (emailLabel != null) {
            emailLabel.setText(safeValue(user.getEmail()));
        }
        if (avatarLabel != null && user.getDisplayName() != null && !user.getDisplayName().isBlank()) {
            avatarLabel.setText(user.getDisplayName().substring(0, 1).toUpperCase());
        }
    }

    private void loadSectionData() {
        setLoading(true);
        updateStatus("Loading workspace...", false);

        User currentUser = SessionManager.getInstance().getCurrentUser();
        Task<EmployeeWorkspaceData> loadTask = new Task<>() {
            @Override
            protected EmployeeWorkspaceData call() throws Exception {
                List<Employee> allEmployees = runAndWait(employeeService.getAllEmployees());
                List<Project> allProjects = runAndWait(projectService.getAllProjects());

                Employee currentEmployee = resolveCurrentEmployee(currentUser, allEmployees);
                List<Project> assignedProjects = findAssignedProjects(currentUser, allProjects);

                String uid = currentUser.getUid();
                List<TimesheetEntry> timesheetEntries = runAndWait(timesheetService.getEntriesByEmployee(uid));
                List<LeaveRequest> leaveRequests = runAndWait(leaveRequestService.getRequestsByEmployee(uid));
                List<CompanyDocument> companyDocuments = runAndWait(documentService.getAllDocuments());

                return new EmployeeWorkspaceData(currentEmployee, allEmployees, assignedProjects,
                        timesheetEntries, leaveRequests, companyDocuments);
            }
        };

        loadTask.setOnSucceeded(event -> {
            cachedData = loadTask.getValue();
            lastLoadedAt = System.currentTimeMillis();
            animateSectionChange(cachedData);
            setLoading(false);
        });

        loadTask.setOnFailed(event -> {
            setLoading(false);
            LOGGER.warning("Failed to load employee workspace: " + loadTask.getException());
            updateStatus("Failed to load workspace data.", true);
        });

        Thread loaderThread = new Thread(loadTask, "employee-workspace-loader");
        loaderThread.setDaemon(true);
        loaderThread.start();
    }

    // =========================================================================
    // Section Rendering
    // =========================================================================

    private void renderSection(EmployeeWorkspaceData data) {
        if (data == null) {
            updateStatus("No workspace data available.", true);
            return;
        }

        updateWorkStatus(data.currentEmployee());
        clearContent();

        switch (currentSection) {
            case OVERVIEW -> renderOverview(data);
            case MY_TASKS -> renderMyTasks(data);
            case MY_PROJECTS -> renderMyProjects(data);
            case TIME_SHEET -> renderTimeSheet(data);
            case REQUESTS -> renderRequests(data);
            case DOCUMENTS -> renderDocuments(data);
            case TEAM -> renderTeam(data);
            case PROFILE -> renderProfile(data);
        }

        updateStatus("", false);
    }

    private void clearContent() {
        if (statsContainer != null)
            statsContainer.getChildren().clear();
        if (primaryContent != null)
            primaryContent.getChildren().clear();
        if (secondaryContent != null)
            secondaryContent.getChildren().clear();
        // Show secondary column by default
        if (secondaryContent != null) {
            secondaryContent.setVisible(true);
            secondaryContent.setManaged(true);
        }
    }

    // -------------------------------------------------------------------------
    // Overview
    // -------------------------------------------------------------------------
    private void renderOverview(EmployeeWorkspaceData data) {
        setSectionHeader("Overview", "Your workspace at a glance");

        List<Project> projects = safeList(data.assignedProjects());
        long activeTasks = projects.stream().filter(p -> p.isActive() || p.isOverdue()).count();
        long dueToday = projects.stream().filter(this::isDueToday).count();
        long activeProjects = projects.stream().filter(Project::isActive).count();
        long overdue = projects.stream().filter(Project::isOverdue).count();

        addStatCard("Tasks Due", String.valueOf(dueToday), "Needs attention today", "stat-card-blue");
        addStatCard("Active Projects", String.valueOf(activeProjects), "Currently in progress", "stat-card-green");
        addStatCard("Open Tasks", String.valueOf(activeTasks), "Assigned work items", "stat-card-purple");
        addStatCard("Overdue", String.valueOf(overdue), "Follow up required", "stat-card-orange");

        // Primary: Tasks card
        VBox tasksCard = createCard("My Tasks", "View All");
        List<Project> taskList = projects.stream()
                .filter(p -> p.isActive() || p.isOverdue())
                .sorted(Comparator.comparingLong(this::effectiveDueDate))
                .limit(4).toList();

        VBox tasksBody = new VBox(10);
        if (taskList.isEmpty()) {
            tasksBody.getChildren().add(createEmptyState("No tasks assigned", "You're all caught up!"));
        } else {
            for (Project project : taskList) {
                tasksBody.getChildren().add(createTaskRow(project));
            }
        }
        tasksCard.getChildren().add(tasksBody);
        primaryContent.getChildren().add(tasksCard);

        // Primary: Projects progress card
        VBox projectsCard = createCard("Project Progress", "View All");
        VBox projectsBody = new VBox(12);
        List<Project> activeList = projects.stream().filter(Project::isActive).limit(3).toList();
        if (activeList.isEmpty()) {
            projectsBody.getChildren()
                    .add(createEmptyState("No active projects", "Projects will appear here once assigned"));
        } else {
            for (Project project : activeList) {
                projectsBody.getChildren().add(createProjectProgressItem(project));
            }
        }
        projectsCard.getChildren().add(projectsBody);
        primaryContent.getChildren().add(projectsCard);

        // Secondary: Quick Actions
        VBox actionsCard = createCard("Quick Actions", null);
        actionsCard.getStyleClass().add("card-accent");
        VBox actionsBody = new VBox(10);
        actionsBody.getChildren().addAll(
                createActionButton("View Tasks", () -> openSection(EmployeeWorkspaceSection.MY_TASKS)),
                createActionButton("Log Time", () -> openSection(EmployeeWorkspaceSection.TIME_SHEET)),
                createActionButton("Request Leave", () -> openSection(EmployeeWorkspaceSection.REQUESTS)),
                createActionButton("View Documents", () -> openSection(EmployeeWorkspaceSection.DOCUMENTS)));
        actionsCard.getChildren().add(actionsBody);
        secondaryContent.getChildren().add(actionsCard);

        // Secondary: Recent Activity
        VBox activityCard = createCard("Recent Activity", null);
        VBox activityBody = new VBox(8);
        List<Project> recentProjects = projects.stream()
                .sorted(Comparator
                        .comparingLong((Project p) -> p.getUpdatedAt() > 0 ? p.getUpdatedAt() : p.getCreatedAt())
                        .reversed())
                .limit(4).toList();

        if (recentProjects.isEmpty()) {
            activityBody.getChildren().add(createEmptyState("No recent activity", ""));
        } else {
            for (Project project : recentProjects) {
                long ts = project.getUpdatedAt() > 0 ? project.getUpdatedAt() : project.getCreatedAt();
                activityBody.getChildren().add(createActivityRow(
                        "Updated: " + safeProjectName(project), formatRelativeTime(ts), "green"));
            }
        }
        activityCard.getChildren().add(activityBody);
        secondaryContent.getChildren().add(activityCard);
    }

    // -------------------------------------------------------------------------
    // My Tasks
    // -------------------------------------------------------------------------
    private void renderMyTasks(EmployeeWorkspaceData data) {
        setSectionHeader("My Tasks", "Track your active and upcoming work items");
        hideSecondaryColumn();

        List<Project> tasks = safeList(data.assignedProjects()).stream()
                .filter(p -> p.isActive() || p.isOverdue())
                .sorted(Comparator.comparingLong(this::effectiveDueDate))
                .toList();

        long dueToday = tasks.stream().filter(this::isDueToday).count();
        long overdue = tasks.stream().filter(Project::isOverdue).count();
        long completed = safeList(data.assignedProjects()).stream().filter(Project::isCompleted).count();

        addStatCard("Total Tasks", String.valueOf(tasks.size()), "Assigned work items", "stat-card-blue");
        addStatCard("Due Today", String.valueOf(dueToday), "Needs attention now", "stat-card-orange");
        addStatCard("Overdue", String.valueOf(overdue), "Follow up required", "stat-card-red");
        addStatCard("Completed", String.valueOf(completed), "Delivered items", "stat-card-green");

        VBox listCard = createCard("Task List", null);
        VBox listBody = new VBox(10);

        if (tasks.isEmpty()) {
            listBody.getChildren().add(createEmptyState("No assigned tasks", "You are all caught up!"));
        } else {
            for (Project project : tasks) {
                listBody.getChildren().add(createTaskRow(project));
            }
        }
        listCard.getChildren().add(listBody);
        primaryContent.getChildren().add(listCard);
    }

    // -------------------------------------------------------------------------
    // My Projects
    // -------------------------------------------------------------------------
    private void renderMyProjects(EmployeeWorkspaceData data) {
        setSectionHeader("My Projects", "Projects where you are assigned as a contributor");
        hideSecondaryColumn();

        List<Project> projects = safeList(data.assignedProjects());
        long active = projects.stream().filter(Project::isActive).count();
        long completed = projects.stream().filter(Project::isCompleted).count();

        addStatCard("Assigned", String.valueOf(projects.size()), "All tracked projects", "stat-card-purple");
        addStatCard("Active", String.valueOf(active), "In progress now", "stat-card-green");
        addStatCard("Completed", String.valueOf(completed), "Delivered projects", "stat-card-blue");

        VBox listCard = createCard("Project Details", null);
        VBox listBody = new VBox(14);

        if (projects.isEmpty()) {
            listBody.getChildren()
                    .add(createEmptyState("No assigned projects", "Projects will appear here once assigned"));
        } else {
            for (Project project : projects) {
                listBody.getChildren().add(createProjectDetailItem(project));
            }
        }
        listCard.getChildren().add(listBody);
        primaryContent.getChildren().add(listCard);
    }

    // -------------------------------------------------------------------------
    // Time Sheet
    // -------------------------------------------------------------------------
    private void renderTimeSheet(EmployeeWorkspaceData data) {
        setSectionHeader("Time Sheet", "Track your hours across assigned projects");

        List<TimesheetEntry> entries = safeList(data.timesheetEntries());

        // Calculate real weekly hours (Mon-Sun of current week)
        LocalDate today = LocalDate.now();
        LocalDate weekStart = today.with(java.time.DayOfWeek.MONDAY);
        LocalDate weekEnd = weekStart.plusDays(6);
        long weekStartMillis = weekStart.atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli();
        long weekEndMillis = weekEnd.plusDays(1).atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli();

        double weeklyHours = entries.stream()
                .filter(e -> e.getDate() >= weekStartMillis && e.getDate() < weekEndMillis)
                .mapToDouble(TimesheetEntry::getHours).sum();
        double remaining = Math.max(0, 40 - weeklyHours);

        addStatCard("This Week", String.format("%.1fh", weeklyHours), "Hours logged this week", "stat-card-green");
        addStatCard("Remaining", String.format("%.1fh", remaining), "Until 40h weekly target", "stat-card-blue");
        addStatCard("Entries", String.valueOf(entries.size()), "Total time entries", "stat-card-purple");

        // Primary: Time entries list
        VBox entriesCard = createCard("Time Entries", null);
        VBox entriesBody = new VBox(10);

        if (entries.isEmpty()) {
            entriesBody.getChildren().add(
                    createEmptyState("No time entries yet", "Log hours to track your project contributions"));
        } else {
            entries.stream().limit(10).forEach(entry -> {
                HBox row = new HBox(12);
                row.getStyleClass().add("detail-row");
                row.setAlignment(Pos.CENTER_LEFT);

                Region dot = new Region();
                dot.getStyleClass().addAll("priority-dot", "priority-medium");

                VBox content = new VBox(3);
                HBox.setHgrow(content, Priority.ALWAYS);
                Label name = new Label(safeValue(entry.getProjectName()));
                name.getStyleClass().add("detail-row-title");
                String desc = entry.getDescription() != null && !entry.getDescription().isBlank()
                        ? entry.getDescription()
                        : "No description";
                Label meta = new Label(String.format("%.1fh • %s • %s",
                        entry.getHours(), formatDate(entry.getDate()), desc));
                meta.getStyleClass().add("detail-row-meta");
                content.getChildren().addAll(name, meta);

                Label badge = new Label(String.format("%.1fh", entry.getHours()));
                badge.getStyleClass().addAll("badge", "badge-blue");

                row.getChildren().addAll(dot, content, badge);
                entriesBody.getChildren().add(row);
            });
        }
        entriesCard.getChildren().add(entriesBody);
        primaryContent.getChildren().add(entriesCard);

        // Secondary: Weekly Summary
        VBox summaryCard = createCard("Weekly Summary", null);
        VBox summaryBody = new VBox(12);

        ProgressBar weekBar = new ProgressBar(Math.min(1.0, weeklyHours / 40.0));
        weekBar.setMaxWidth(Double.MAX_VALUE);
        weekBar.getStyleClass().add("time-progress-bar");

        Label summaryLabel = new Label(String.format("%.1fh of 40h target (%d%% utilized)",
                weeklyHours, Math.round(weeklyHours / 40.0 * 100)));
        summaryLabel.getStyleClass().add("detail-row-meta");

        summaryBody.getChildren().addAll(weekBar, summaryLabel);
        summaryCard.getChildren().add(summaryBody);
        secondaryContent.getChildren().add(summaryCard);

        // Secondary: Reminders
        VBox tipsCard = createCard("Reminders", null);
        VBox tipsBody = new VBox(10);
        tipsBody.getChildren().addAll(
                createInfoRow("Weekly check-in", "Submit your final timesheet before Friday 6 PM", "REMINDER"),
                createInfoRow("Time allocation", "Split hours across projects based on actual effort", "TIP"));
        tipsCard.getChildren().add(tipsBody);
        secondaryContent.getChildren().add(tipsCard);
    }

    // -------------------------------------------------------------------------
    // Leave Requests
    // -------------------------------------------------------------------------
    private void renderRequests(EmployeeWorkspaceData data) {
        setSectionHeader("Leave Requests", "Submit and track your leave requests");

        List<LeaveRequest> requests = safeList(data.leaveRequests());
        Employee employee = data.currentEmployee();
        String status = employee == null ? "UNKNOWN" : safeValue(employee.getStatus());

        long pending = requests.stream().filter(LeaveRequest::isPending).count();
        long approved = requests.stream().filter(LeaveRequest::isApproved).count();

        addStatCard("Status", status, "Employment availability", "stat-card-green");
        addStatCard("Approved", String.valueOf(approved), "Approved leave requests", "stat-card-blue");
        addStatCard("Pending", String.valueOf(pending), "Awaiting approval", "stat-card-purple");

        // Primary: Request list
        VBox requestsCard = createCard("My Requests", null);
        VBox requestsBody = new VBox(10);

        if (requests.isEmpty()) {
            requestsBody.getChildren().add(
                    createEmptyState("No leave requests", "Submit a request to track your leave"));
        } else {
            requests.stream().limit(10).forEach(req -> {
                HBox row = new HBox(12);
                row.getStyleClass().add("detail-row");
                row.setAlignment(Pos.CENTER_LEFT);

                Region dot = new Region();
                String dotStyle = req.isPending() ? "priority-medium"
                        : req.isApproved() ? "priority-low" : "priority-high";
                dot.getStyleClass().addAll("priority-dot", dotStyle);

                VBox content = new VBox(3);
                HBox.setHgrow(content, Priority.ALWAYS);
                Label name = new Label(safeValue(req.getType()) + " Leave");
                name.getStyleClass().add("detail-row-title");
                Label meta = new Label(formatDate(req.getStartDate()) + " - " + formatDate(req.getEndDate())
                        + (req.getReason() != null && !req.getReason().isBlank() ? " • " + req.getReason() : ""));
                meta.getStyleClass().add("detail-row-meta");
                content.getChildren().addAll(name, meta);

                String badgeStyle = req.isPending() ? "badge-orange"
                        : req.isApproved() ? "badge-green" : "badge-red";
                Label badge = new Label(safeValue(req.getStatus()));
                badge.getStyleClass().addAll("badge", badgeStyle);

                row.getChildren().addAll(dot, content, badge);
                requestsBody.getChildren().add(row);
            });
        }
        requestsCard.getChildren().add(requestsBody);
        primaryContent.getChildren().add(requestsCard);

        // Secondary: Leave Policy
        VBox policyCard = createCard("Leave Policy", null);
        VBox policyBody = new VBox(10);
        policyBody.getChildren().addAll(
                createInfoRow("Annual leave", "20 days per year (pro-rated for new joiners)", "POLICY"),
                createInfoRow("Sick leave", "Up to 10 days with medical certificate", "POLICY"),
                createInfoRow("Personal leave", "3 days per year for personal matters", "POLICY"));
        policyCard.getChildren().add(policyBody);
        secondaryContent.getChildren().add(policyCard);
    }

    // -------------------------------------------------------------------------
    // Documents
    // -------------------------------------------------------------------------
    private void renderDocuments(EmployeeWorkspaceData data) {
        setSectionHeader("Documents", "Access company policies, templates, and project documents");

        List<CompanyDocument> docs = safeList(data.companyDocuments());
        long policies = docs.stream().filter(CompanyDocument::isPolicy).count();
        long templates = docs.stream().filter(CompanyDocument::isTemplate).count();
        long briefs = docs.stream().filter(d -> "PROJECT_BRIEF".equalsIgnoreCase(d.getCategory())).count();

        addStatCard("Total", String.valueOf(docs.size()), "Company documents", "stat-card-blue");
        addStatCard("Policies", String.valueOf(policies), "Core employee policies", "stat-card-green");
        addStatCard("Templates", String.valueOf(templates), "Reusable templates", "stat-card-purple");

        // Primary: Policies & Templates
        VBox docsCard = createCard("Company Documents", null);
        VBox docsBody = new VBox(10);

        List<CompanyDocument> policiesAndTemplates = docs.stream()
                .filter(d -> d.isPolicy() || d.isTemplate())
                .toList();

        if (policiesAndTemplates.isEmpty()) {
            docsBody.getChildren().add(
                    createEmptyState("No company documents", "Documents will appear once uploaded by admin"));
        } else {
            policiesAndTemplates.forEach(doc -> {
                String badge = doc.isPolicy() ? "POLICY" : "TEMPLATE";
                docsBody.getChildren().add(createInfoRow(
                        safeValue(doc.getName()),
                        safeValue(doc.getDescription()),
                        badge));
            });
        }
        docsCard.getChildren().add(docsBody);
        primaryContent.getChildren().add(docsCard);

        // Secondary: Project Briefs
        VBox projDocsCard = createCard("Project Briefs", null);
        VBox projDocsBody = new VBox(10);

        List<CompanyDocument> projectBriefs = docs.stream()
                .filter(d -> "PROJECT_BRIEF".equalsIgnoreCase(d.getCategory()))
                .toList();

        if (projectBriefs.isEmpty()) {
            projDocsBody.getChildren().add(createEmptyState("No project briefs", ""));
        } else {
            projectBriefs.forEach(doc -> {
                projDocsBody.getChildren().add(createInfoRow(
                        safeValue(doc.getName()),
                        safeValue(doc.getDescription()) + " • " + formatDate(doc.getCreatedAt()),
                        "PROJECT"));
            });
        }
        projDocsCard.getChildren().add(projDocsBody);
        secondaryContent.getChildren().add(projDocsCard);
    }

    // -------------------------------------------------------------------------
    // Team
    // -------------------------------------------------------------------------
    private void renderTeam(EmployeeWorkspaceData data) {
        setSectionHeader("My Team", "Team members in your department");
        hideSecondaryColumn();

        Employee currentEmployee = data.currentEmployee();
        String department = currentEmployee == null ? "" : safeLower(currentEmployee.getDepartment());

        List<Employee> teamMembers = safeList(data.allEmployees()).stream()
                .filter(Objects::nonNull)
                .filter(e -> "ACTIVE".equalsIgnoreCase(safeValue(e.getStatus())))
                .filter(e -> !safeValue(e.getId())
                        .equals(safeValue(currentEmployee == null ? null : currentEmployee.getId())))
                .filter(e -> department.isBlank() || department.equals(safeLower(e.getDepartment())))
                .sorted(Comparator.comparing(e -> safeLower(e.getFullName())))
                .toList();

        addStatCard("Department", department.isBlank() ? "All" : department.toUpperCase(), "Team scope",
                "stat-card-green");
        addStatCard("Members", String.valueOf(teamMembers.size()), "Active colleagues", "stat-card-blue");
        addStatCard("Shared Projects", String.valueOf(safeList(data.assignedProjects()).size()),
                "Projects in your queue", "stat-card-purple");

        VBox teamCard = createCard("Team Members", null);
        VBox teamBody = new VBox(10);

        if (teamMembers.isEmpty()) {
            teamBody.getChildren()
                    .add(createEmptyState("No team members found", "No matching active employees in your department"));
        } else {
            teamMembers.stream().limit(12).forEach(member -> {
                teamBody.getChildren().add(createTeamMemberRow(member));
            });
        }
        teamCard.getChildren().add(teamBody);
        primaryContent.getChildren().add(teamCard);
    }

    // -------------------------------------------------------------------------
    // Profile
    // -------------------------------------------------------------------------
    private void renderProfile(EmployeeWorkspaceData data) {
        setSectionHeader("My Profile", "Your employee profile overview");
        hideSecondaryColumn();

        Employee employee = data.currentEmployee();
        if (employee == null) {
            addStatCard("Profile", "Unavailable", "No employee record matched your account", "stat-card-red");
            VBox errorCard = createCard("Profile Not Found", null);
            errorCard.getChildren().add(createEmptyState("Profile not found", "Try reloading from dashboard"));
            primaryContent.getChildren().add(errorCard);
            return;
        }

        addStatCard("Department", safeValue(employee.getDepartment()), "Assigned department", "stat-card-green");
        addStatCard("Position", safeValue(employee.getPosition()), "Current role", "stat-card-blue");
        addStatCard("Status", safeValue(employee.getStatus()), "Employment status", "stat-card-purple");

        // Profile card with avatar
        VBox profileCard = new VBox(20);
        profileCard.getStyleClass().addAll("ws-card", "profile-card");

        HBox profileHeader = new HBox(20);
        profileHeader.setAlignment(Pos.CENTER_LEFT);

        StackPane avatarPane = new StackPane();
        avatarPane.getStyleClass().add("profile-avatar-container");
        Circle avatarCircle = new Circle(36);
        avatarCircle.getStyleClass().add("profile-avatar-circle");
        Label avatarLetter = new Label(safeValue(employee.getFullName()).substring(0, 1).toUpperCase());
        avatarLetter.getStyleClass().add("profile-avatar-letter");
        avatarPane.getChildren().addAll(avatarCircle, avatarLetter);

        VBox profileInfo = new VBox(4);
        HBox.setHgrow(profileInfo, Priority.ALWAYS);
        Label nameLabel = new Label(safeValue(employee.getFullName()));
        nameLabel.getStyleClass().add("profile-name");
        Label posLabel = new Label(safeValue(employee.getPosition()) + " — " + safeValue(employee.getDepartment()));
        posLabel.getStyleClass().add("profile-position");
        Label statusLabel = new Label(safeValue(employee.getStatus()));
        statusLabel.getStyleClass().addAll("badge",
                "ACTIVE".equalsIgnoreCase(employee.getStatus()) ? "badge-green" : "badge-orange");
        profileInfo.getChildren().addAll(nameLabel, posLabel, statusLabel);

        profileHeader.getChildren().addAll(avatarPane, profileInfo);
        profileCard.getChildren().add(profileHeader);

        // Profile details
        VBox detailsGrid = new VBox(12);
        detailsGrid.getStyleClass().add("profile-details");
        detailsGrid.getChildren().addAll(
                createProfileRow("Full Name", safeValue(employee.getFullName())),
                createProfileRow("Email", safeValue(employee.getEmail())),
                createProfileRow("Phone", safeValue(employee.getPhone())),
                createProfileRow("Employee ID", safeValue(employee.getId())),
                createProfileRow("Hire Date", employee.getHireDate() > 0 ? formatDate(employee.getHireDate()) : "N/A"));
        profileCard.getChildren().add(detailsGrid);
        primaryContent.getChildren().add(profileCard);
    }

    // =========================================================================
    // UI Component Builders
    // =========================================================================

    private void addStatCard(String label, String value, String subtitle, String styleClass) {
        if (statsContainer == null)
            return;

        VBox card = new VBox(8);
        card.getStyleClass().addAll("stat-card", styleClass);
        HBox.setHgrow(card, Priority.ALWAYS);

        Label valueLabel = new Label(value);
        valueLabel.getStyleClass().add("stat-value");

        Label labelText = new Label(label);
        labelText.getStyleClass().add("stat-label");

        Label subLabel = new Label(subtitle);
        subLabel.getStyleClass().add("stat-subtitle");

        card.getChildren().addAll(valueLabel, labelText, subLabel);
        statsContainer.getChildren().add(card);
    }

    private VBox createCard(String title, String linkText) {
        VBox card = new VBox(16);
        card.getStyleClass().add("ws-card");

        HBox header = new HBox();
        header.setAlignment(Pos.CENTER_LEFT);

        Label titleLabel = new Label(title);
        titleLabel.getStyleClass().add("card-title");

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);
        header.getChildren().addAll(titleLabel, spacer);

        if (linkText != null) {
            Label link = new Label(linkText);
            link.getStyleClass().add("card-link");
            header.getChildren().add(link);
        }

        card.getChildren().add(header);
        return card;
    }

    private HBox createTaskRow(Project project) {
        HBox row = new HBox(12);
        row.getStyleClass().add("task-row");
        row.setAlignment(Pos.CENTER_LEFT);

        String priority = project.isOverdue() ? "high" : isDueSoon(project) ? "medium" : "low";

        Region dot = new Region();
        dot.getStyleClass().addAll("priority-dot", "priority-" + priority);

        VBox content = new VBox(3);
        HBox.setHgrow(content, Priority.ALWAYS);

        Label name = new Label(safeProjectName(project));
        name.getStyleClass().add("task-name");

        HBox meta = new HBox(8);
        meta.setAlignment(Pos.CENTER_LEFT);
        Label tag = new Label(safeValue(project.getStatus()));
        tag.getStyleClass().add("task-tag");
        Label due = new Label(formatDueText(project.getEndDate()));
        due.getStyleClass().add("task-due");
        if ("high".equals(priority)) {
            due.getStyleClass().add("task-due-urgent");
        }
        meta.getChildren().addAll(tag, due);

        content.getChildren().addAll(name, meta);

        Label progressLabel = new Label(project.getCompletionPercentage() + "%");
        progressLabel.getStyleClass().add("task-progress-badge");

        row.getChildren().addAll(dot, content, progressLabel);
        return row;
    }

    private VBox createProjectProgressItem(Project project) {
        VBox item = new VBox(8);
        item.getStyleClass().add("project-row");

        HBox header = new HBox();
        header.setAlignment(Pos.CENTER_LEFT);
        Label name = new Label(safeProjectName(project));
        name.getStyleClass().add("project-name");
        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);
        Label pct = new Label(project.getCompletionPercentage() + "%");
        pct.getStyleClass().add("project-percentage");
        header.getChildren().addAll(name, spacer, pct);

        ProgressBar bar = new ProgressBar(project.getCompletionPercentage() / 100.0);
        bar.setMaxWidth(Double.MAX_VALUE);
        bar.getStyleClass().add("project-progress-bar");

        Label meta = new Label(formatDueText(project.getEndDate()) + " • " +
                safeValue(project.getStatus()));
        meta.getStyleClass().add("project-meta");

        item.getChildren().addAll(header, bar, meta);
        return item;
    }

    private VBox createProjectDetailItem(Project project) {
        VBox item = new VBox(10);
        item.getStyleClass().add("project-detail-card");

        HBox header = new HBox(12);
        header.setAlignment(Pos.CENTER_LEFT);

        Label name = new Label(safeProjectName(project));
        name.getStyleClass().add("project-name");
        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        Label statusBadge = new Label(safeValue(project.getStatus()));
        String badgeStyle = project.isCompleted() ? "badge-green" : project.isOverdue() ? "badge-red" : "badge-blue";
        statusBadge.getStyleClass().addAll("badge", badgeStyle);
        header.getChildren().addAll(name, spacer, statusBadge);

        ProgressBar bar = new ProgressBar(project.getCompletionPercentage() / 100.0);
        bar.setMaxWidth(Double.MAX_VALUE);
        bar.getStyleClass().add("project-progress-bar");

        HBox details = new HBox(16);
        details.getChildren().addAll(
                createDetailLabel("Progress", project.getCompletionPercentage() + "%"),
                createDetailLabel("Due", formatDueText(project.getEndDate())),
                createDetailLabel("Priority", safeValue(project.getPriority())));

        if (project.getDescription() != null && !project.getDescription().isBlank()) {
            Label desc = new Label(project.getDescription());
            desc.getStyleClass().add("project-description");
            desc.setWrapText(true);
            item.getChildren().addAll(header, bar, details, desc);
        } else {
            item.getChildren().addAll(header, bar, details);
        }

        return item;
    }

    private HBox createTeamMemberRow(Employee member) {
        HBox row = new HBox(14);
        row.getStyleClass().add("team-member-row");
        row.setAlignment(Pos.CENTER_LEFT);

        StackPane avatarPane = new StackPane();
        avatarPane.getStyleClass().add("team-avatar-container");
        Circle circle = new Circle(18);
        circle.getStyleClass().add("team-avatar-circle");
        String initial = safeValue(member.getFullName()).substring(0, 1).toUpperCase();
        Label initialLabel = new Label(initial);
        initialLabel.getStyleClass().add("team-avatar-letter");
        avatarPane.getChildren().addAll(circle, initialLabel);

        VBox info = new VBox(2);
        HBox.setHgrow(info, Priority.ALWAYS);
        Label nameLabel = new Label(safeValue(member.getFullName()));
        nameLabel.getStyleClass().add("team-member-name");
        Label posLabel = new Label(safeValue(member.getPosition()) + " • " + safeValue(member.getEmail()));
        posLabel.getStyleClass().add("team-member-meta");
        info.getChildren().addAll(nameLabel, posLabel);

        Label statusBadge = new Label(safeValue(member.getStatus()));
        statusBadge.getStyleClass().addAll("badge", "badge-green");

        row.getChildren().addAll(avatarPane, info, statusBadge);
        return row;
    }

    private HBox createActivityRow(String title, String time, String color) {
        HBox row = new HBox(12);
        row.getStyleClass().add("activity-row");
        row.setAlignment(Pos.CENTER_LEFT);

        Region dot = new Region();
        dot.getStyleClass().addAll("activity-dot", "activity-dot-" + color);

        VBox content = new VBox(2);
        HBox.setHgrow(content, Priority.ALWAYS);
        Label titleLabel = new Label(title);
        titleLabel.getStyleClass().add("activity-title");
        Label timeLabel = new Label(time);
        timeLabel.getStyleClass().add("activity-time");
        content.getChildren().addAll(titleLabel, timeLabel);

        row.getChildren().addAll(dot, content);
        return row;
    }

    private HBox createInfoRow(String title, String description, String badgeText) {
        HBox row = new HBox(12);
        row.getStyleClass().add("detail-row");
        row.setAlignment(Pos.CENTER_LEFT);

        VBox content = new VBox(3);
        HBox.setHgrow(content, Priority.ALWAYS);
        Label titleLabel = new Label(title);
        titleLabel.getStyleClass().add("detail-row-title");
        Label descLabel = new Label(description);
        descLabel.getStyleClass().add("detail-row-meta");
        descLabel.setWrapText(true);
        content.getChildren().addAll(titleLabel, descLabel);

        Label badge = new Label(badgeText);
        badge.getStyleClass().addAll("badge", "badge-muted");

        row.getChildren().addAll(content, badge);
        return row;
    }

    private Button createActionButton(String text, Runnable action) {
        Button btn = new Button(text);
        btn.setMaxWidth(Double.MAX_VALUE);
        btn.getStyleClass().add("action-button");
        btn.setOnAction(e -> action.run());
        return btn;
    }

    private HBox createProfileRow(String label, String value) {
        HBox row = new HBox(12);
        row.getStyleClass().add("profile-row");
        row.setAlignment(Pos.CENTER_LEFT);

        Label labelNode = new Label(label);
        labelNode.getStyleClass().add("profile-row-label");
        labelNode.setMinWidth(120);

        Label valueNode = new Label(value);
        valueNode.getStyleClass().add("profile-row-value");

        row.getChildren().addAll(labelNode, valueNode);
        return row;
    }

    private VBox createDetailLabel(String label, String value) {
        VBox box = new VBox(2);
        Label l = new Label(label);
        l.getStyleClass().add("detail-label");
        Label v = new Label(value);
        v.getStyleClass().add("detail-value");
        box.getChildren().addAll(l, v);
        return box;
    }

    private VBox createEmptyState(String title, String subtitle) {
        VBox box = new VBox(6);
        box.setAlignment(Pos.CENTER);
        box.getStyleClass().add("empty-state");

        Label titleLabel = new Label(title);
        titleLabel.getStyleClass().add("empty-state-title");
        box.getChildren().add(titleLabel);

        if (subtitle != null && !subtitle.isBlank()) {
            Label subLabel = new Label(subtitle);
            subLabel.getStyleClass().add("empty-state-subtitle");
            box.getChildren().add(subLabel);
        }
        return box;
    }

    // =========================================================================
    // Navigation Handlers
    // =========================================================================

    @FXML
    private void handleOverview() {
        openSection(EmployeeWorkspaceSection.OVERVIEW);
    }

    @FXML
    private void handleMyTasks() {
        openSection(EmployeeWorkspaceSection.MY_TASKS);
    }

    @FXML
    private void handleMyProjects() {
        openSection(EmployeeWorkspaceSection.MY_PROJECTS);
    }

    @FXML
    private void handleTimeSheet() {
        openSection(EmployeeWorkspaceSection.TIME_SHEET);
    }

    @FXML
    private void handleRequests() {
        openSection(EmployeeWorkspaceSection.REQUESTS);
    }

    @FXML
    private void handleDocuments() {
        openSection(EmployeeWorkspaceSection.DOCUMENTS);
    }

    @FXML
    private void handleTeam() {
        openSection(EmployeeWorkspaceSection.TEAM);
    }

    @FXML
    private void handleProfile() {
        openSection(EmployeeWorkspaceSection.PROFILE);
    }

    @FXML
    private void handleBackToDashboard() {
        navigateTo("features/employee_dashboard/view/employee_dashboard_view");
    }

    @FXML
    private void handleLogout() {
        SessionManager.getInstance().clearSession();
        redirectToLogin();
    }

    @FXML
    private void handleRefresh() {
        cachedData = null;
        lastLoadedAt = 0;
        loadSectionData();
    }

    // =========================================================================
    // Internal Logic
    // =========================================================================

    private void openSection(EmployeeWorkspaceSection section) {
        if (section == null)
            return;

        SessionManager.getInstance().setSelectedEmployeeSection(section.name());
        currentSection = section;
        setActiveButton(section);

        if (cachedData != null && !isCacheStale()) {
            animateSectionChange(cachedData);
            return;
        }

        loadSectionData();
    }

    private void animateSectionChange(EmployeeWorkspaceData data) {
        if (primaryContent == null) {
            renderSection(data);
            return;
        }

        FadeTransition fadeOut1 = new FadeTransition(Duration.millis(100), primaryContent);
        fadeOut1.setFromValue(1.0);
        fadeOut1.setToValue(0.2);

        FadeTransition fadeOut2 = new FadeTransition(Duration.millis(100), statsContainer);
        fadeOut2.setFromValue(1.0);
        fadeOut2.setToValue(0.2);

        ParallelTransition fadeOut = new ParallelTransition(fadeOut1, fadeOut2);
        fadeOut.setOnFinished(event -> {
            renderSection(data);

            FadeTransition fadeIn1 = new FadeTransition(Duration.millis(180), primaryContent);
            fadeIn1.setFromValue(0.2);
            fadeIn1.setToValue(1.0);

            FadeTransition fadeIn2 = new FadeTransition(Duration.millis(180), statsContainer);
            fadeIn2.setFromValue(0.2);
            fadeIn2.setToValue(1.0);

            new ParallelTransition(fadeIn1, fadeIn2).play();
        });

        fadeOut.play();
    }

    private void hideSecondaryColumn() {
        if (secondaryContent != null) {
            secondaryContent.setVisible(false);
            secondaryContent.setManaged(false);
        }
    }

    private Employee resolveCurrentEmployee(User user, List<Employee> employees) {
        if (user == null)
            return null;

        String uid = safeLower(user.getUid());
        String email = safeLower(user.getEmail());
        String displayName = safeLower(user.getDisplayName());

        return safeList(employees).stream()
                .filter(Objects::nonNull)
                .filter(employee -> {
                    String eId = safeLower(employee.getId());
                    String eEmail = safeLower(employee.getEmail());
                    String eName = safeLower(employee.getFullName());
                    return (!uid.isBlank() && uid.equals(eId))
                            || (!email.isBlank() && email.equals(eEmail))
                            || (!displayName.isBlank() && displayName.equals(eName));
                })
                .findFirst().orElse(null);
    }

    private List<Project> findAssignedProjects(User user, List<Project> allProjects) {
        if (user == null)
            return List.of();

        String uid = safeLower(user.getUid());
        String displayName = safeLower(user.getDisplayName());

        return safeList(allProjects).stream()
                .filter(Objects::nonNull)
                .filter(project -> {
                    boolean teamAssigned = project.getTeamMemberIds() != null
                            && project.getTeamMemberIds().stream()
                                    .filter(Objects::nonNull)
                                    .map(this::safeLower)
                                    .anyMatch(id -> !uid.isBlank() && id.equals(uid));
                    boolean managerAssigned = !uid.isBlank()
                            && uid.equals(safeLower(project.getProjectManagerId()));
                    boolean nameAssigned = !displayName.isBlank()
                            && displayName.equals(safeLower(project.getProjectManager()));
                    return teamAssigned || managerAssigned || nameAssigned;
                })
                .sorted(Comparator
                        .comparingLong((Project p) -> p.getUpdatedAt() > 0 ? p.getUpdatedAt() : p.getCreatedAt())
                        .reversed())
                .toList();
    }

    private long effectiveDueDate(Project project) {
        return project.getEndDate() > 0 ? project.getEndDate() : Long.MAX_VALUE;
    }

    private boolean isDueToday(Project project) {
        if (project.getEndDate() <= 0)
            return false;
        LocalDate dueDate = Instant.ofEpochMilli(project.getEndDate()).atZone(ZoneId.systemDefault()).toLocalDate();
        return dueDate.equals(LocalDate.now());
    }

    private boolean isDueSoon(Project project) {
        if (project.getEndDate() <= 0)
            return false;
        LocalDate dueDate = Instant.ofEpochMilli(project.getEndDate()).atZone(ZoneId.systemDefault()).toLocalDate();
        long days = ChronoUnit.DAYS.between(LocalDate.now(), dueDate);
        return days >= 0 && days <= 2;
    }

    private String formatDueText(long endDateMillis) {
        if (endDateMillis <= 0)
            return "No due date";
        LocalDate dueDate = Instant.ofEpochMilli(endDateMillis).atZone(ZoneId.systemDefault()).toLocalDate();
        long dayDiff = ChronoUnit.DAYS.between(LocalDate.now(), dueDate);

        if (dayDiff < 0)
            return "Overdue by " + Math.abs(dayDiff) + " day" + (Math.abs(dayDiff) == 1 ? "" : "s");
        if (dayDiff == 0)
            return "Due today";
        if (dayDiff == 1)
            return "Due tomorrow";
        return "Due in " + dayDiff + " days";
    }

    private String formatDate(long epochMillis) {
        if (epochMillis <= 0)
            return "N/A";
        return DATE_FORMATTER.format(Instant.ofEpochMilli(epochMillis));
    }

    private String formatRelativeTime(long epochMillis) {
        if (epochMillis <= 0)
            return "Just now";
        long minutes = Math.max(0, ChronoUnit.MINUTES.between(Instant.ofEpochMilli(epochMillis), Instant.now()));
        if (minutes < 1)
            return "Just now";
        if (minutes < 60)
            return minutes + " min ago";
        long hours = minutes / 60;
        if (hours < 24)
            return hours + "h ago";
        long days = hours / 24;
        if (days < 7)
            return days + "d ago";
        return DATE_FORMATTER.format(Instant.ofEpochMilli(epochMillis));
    }

    private void setSectionHeader(String title, String subtitle) {
        if (sectionTitleLabel != null)
            sectionTitleLabel.setText(title);
        if (sectionSubtitleLabel != null)
            sectionSubtitleLabel.setText(subtitle);
    }

    private void updateStatus(String message, boolean error) {
        if (sectionStatusLabel == null)
            return;
        sectionStatusLabel.setText(message);
        sectionStatusLabel.getStyleClass().removeAll("status-error", "status-ok");
        sectionStatusLabel.getStyleClass().add(error ? "status-error" : "status-ok");
    }

    private void setLoading(boolean loading) {
        if (loadingIndicator != null)
            loadingIndicator.setVisible(loading);
        if (refreshButton != null)
            refreshButton.setDisable(loading);
        setMenuDisabled(loading);
    }

    private void setMenuDisabled(boolean disabled) {
        if (overviewButton != null)
            overviewButton.setDisable(disabled);
        if (myTasksButton != null)
            myTasksButton.setDisable(disabled);
        if (myProjectsButton != null)
            myProjectsButton.setDisable(disabled);
        if (timeSheetButton != null)
            timeSheetButton.setDisable(disabled);
        if (requestsButton != null)
            requestsButton.setDisable(disabled);
        if (documentsButton != null)
            documentsButton.setDisable(disabled);
        if (teamButton != null)
            teamButton.setDisable(disabled);
        if (profileButton != null)
            profileButton.setDisable(disabled);
        if (backToDashboardButton != null)
            backToDashboardButton.setDisable(disabled);
    }

    private boolean isCacheStale() {
        return lastLoadedAt <= 0 || (System.currentTimeMillis() - lastLoadedAt) > CACHE_TTL_MILLIS;
    }

    private void updateWorkStatus(Employee employee) {
        if (workStatusTextLabel == null || workStatusTimeLabel == null || workStatusDot == null)
            return;

        workStatusDot.getStyleClass().removeAll("status-dot-online", "status-dot-away", "status-dot-offline");

        String status = safeValue(employee == null ? null : employee.getStatus());
        switch (status) {
            case "ACTIVE" -> {
                workStatusTextLabel.setText("Clocked In");
                workStatusTimeLabel.setText("Status synced just now");
                workStatusDot.getStyleClass().add("status-dot-online");
            }
            case "ON_LEAVE" -> {
                workStatusTextLabel.setText("On Leave");
                workStatusTimeLabel.setText("HR leave status active");
                workStatusDot.getStyleClass().add("status-dot-away");
            }
            case "TERMINATED" -> {
                workStatusTextLabel.setText("Inactive");
                workStatusTimeLabel.setText("No active shift");
                workStatusDot.getStyleClass().add("status-dot-offline");
            }
            default -> {
                workStatusTextLabel.setText("Status Unavailable");
                workStatusTimeLabel.setText("Profile status not set");
                workStatusDot.getStyleClass().add("status-dot-offline");
            }
        }
    }

    private void setActiveButton(EmployeeWorkspaceSection section) {
        Button[] allButtons = { overviewButton, myTasksButton, myProjectsButton, timeSheetButton,
                requestsButton, documentsButton, teamButton, profileButton };
        for (Button btn : allButtons) {
            if (btn != null)
                btn.getStyleClass().remove("menu-button-active");
        }

        Button activeButton = switch (section) {
            case OVERVIEW -> overviewButton;
            case MY_TASKS -> myTasksButton;
            case MY_PROJECTS -> myProjectsButton;
            case TIME_SHEET -> timeSheetButton;
            case REQUESTS -> requestsButton;
            case DOCUMENTS -> documentsButton;
            case TEAM -> teamButton;
            case PROFILE -> profileButton;
        };

        if (activeButton != null && !activeButton.getStyleClass().contains("menu-button-active")) {
            activeButton.getStyleClass().add("menu-button-active");
        }
    }

    private EmployeeWorkspaceSection resolveSection(String sectionName) {
        if (sectionName == null || sectionName.isBlank())
            return EmployeeWorkspaceSection.OVERVIEW;
        try {
            return EmployeeWorkspaceSection.valueOf(sectionName);
        } catch (IllegalArgumentException ex) {
            return EmployeeWorkspaceSection.OVERVIEW;
        }
    }

    private String safeValue(String value) {
        return value == null || value.isBlank() ? "N/A" : value;
    }

    private String safeLower(String value) {
        return value == null ? "" : value.trim().toLowerCase();
    }

    private String safeProjectName(Project project) {
        return project.getName() == null || project.getName().isBlank() ? "Untitled Project" : project.getName();
    }

    private <T> List<T> safeList(List<T> input) {
        return input == null ? List.of() : input;
    }

    private <T> List<T> runAndWait(Task<List<T>> task) throws Exception {
        Thread thread = new Thread(task);
        thread.setDaemon(true);
        thread.start();
        try {
            List<T> value = task.get();
            return value == null ? List.of() : value;
        } catch (ExecutionException ex) {
            Throwable cause = ex.getCause();
            if (cause instanceof Exception e)
                throw e;
            throw new RuntimeException(cause);
        }
    }

    private void navigateTo(String viewPath) {
        ViewNavigator.navigateTo(viewPath, LOGGER);
    }

    private void redirectToLogin() {
        ViewNavigator.redirectToLogin(LOGGER);
    }

    private void redirectToMainDashboard() {
        ViewNavigator.redirectToDashboard(LOGGER);
    }

    private record EmployeeWorkspaceData(Employee currentEmployee, List<Employee> allEmployees,
            List<Project> assignedProjects, List<TimesheetEntry> timesheetEntries,
            List<LeaveRequest> leaveRequests, List<CompanyDocument> companyDocuments) {
    }

    private enum EmployeeWorkspaceSection {
        OVERVIEW("Overview"),
        MY_TASKS("My Tasks"),
        MY_PROJECTS("My Projects"),
        TIME_SHEET("Time Sheet"),
        REQUESTS("Leave Requests"),
        DOCUMENTS("Documents"),
        TEAM("My Team"),
        PROFILE("My Profile");

        private final String displayName;

        EmployeeWorkspaceSection(String displayName) {
            this.displayName = displayName;
        }
    }
}
