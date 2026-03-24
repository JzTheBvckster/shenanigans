package com.example.shenanigans.features.project_manager.controller;

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
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
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
 * Controller for the unified PM workspace view. Renders overview,
 * managed projects, team, timesheets, leave requests, documents, and profile.
 */
public class PMWorkspaceController {

    private static final Logger LOGGER = Logger.getLogger(PMWorkspaceController.class.getName());
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
    private Button managedProjectsButton;
    @FXML
    private Button myTeamButton;
    @FXML
    private Button teamTimesheetsButton;
    @FXML
    private Button leaveRequestsButton;
    @FXML
    private Button documentsButton;
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

    private PMSection currentSection;
    private PMWorkspaceData cachedData;
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
        if (user == null || !user.isProjectManager()) {
            Platform.runLater(this::redirectToMainDashboard);
            return;
        }

        setupUserInfo(user);
        currentSection = resolveSection(SessionManager.getInstance().getSelectedPMSection());
        setActiveButton(currentSection);
        loadSectionData();
    }

    private void setupUserInfo(User user) {
        if (welcomeLabel != null)
            welcomeLabel.setText("Welcome, " + safeValue(user.getDisplayName()) + "!");
        if (emailLabel != null)
            emailLabel.setText(safeValue(user.getEmail()));
        if (avatarLabel != null && user.getDisplayName() != null && !user.getDisplayName().isBlank())
            avatarLabel.setText(user.getDisplayName().substring(0, 1).toUpperCase());
    }

    private void loadSectionData() {
        setLoading(true);
        updateStatus("Loading workspace...", false);

        User currentUser = SessionManager.getInstance().getCurrentUser();
        Task<PMWorkspaceData> loadTask = new Task<>() {
            @Override
            protected PMWorkspaceData call() throws Exception {
                List<Employee> allEmployees = runAndWait(employeeService.getAllEmployees());
                List<Project> allProjects = runAndWait(projectService.getAllProjects());

                Employee currentEmployee = resolveCurrentEmployee(currentUser, allEmployees);
                List<Project> managedProjects = findManagedProjects(currentUser, allProjects);

                // Gather team member IDs from managed projects
                Set<String> teamMemberIds = new HashSet<>();
                for (Project p : managedProjects) {
                    if (p.getTeamMemberIds() != null) {
                        p.getTeamMemberIds().stream().filter(Objects::nonNull)
                                .forEach(teamMemberIds::add);
                    }
                }

                List<Employee> teamMembers = allEmployees.stream()
                        .filter(e -> teamMemberIds.contains(e.getId()))
                        .toList();

                String uid = currentUser.getUid();
                List<TimesheetEntry> timesheetEntries = runAndWait(timesheetService.getEntriesByEmployee(uid));
                List<LeaveRequest> leaveRequests = runAndWait(leaveRequestService.getRequestsByEmployee(uid));
                List<CompanyDocument> companyDocuments = runAndWait(documentService.getAllDocuments());

                return new PMWorkspaceData(currentEmployee, allEmployees, managedProjects,
                        teamMembers, timesheetEntries, leaveRequests, companyDocuments);
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
            LOGGER.warning("Failed to load PM workspace: " + loadTask.getException());
            updateStatus("Failed to load workspace data.", true);
        });

        Thread loaderThread = new Thread(loadTask, "pm-workspace-loader");
        loaderThread.setDaemon(true);
        loaderThread.start();
    }

    // =========================================================================
    // Section Rendering
    // =========================================================================

    private void renderSection(PMWorkspaceData data) {
        if (data == null) {
            updateStatus("No workspace data available.", true);
            return;
        }

        updateWorkStatus(data.currentEmployee());
        clearContent();

        switch (currentSection) {
            case OVERVIEW -> renderOverview(data);
            case MANAGED_PROJECTS -> renderManagedProjects(data);
            case MY_TEAM -> renderMyTeam(data);
            case TEAM_TIMESHEETS -> renderTeamTimesheets(data);
            case LEAVE_REQUESTS -> renderLeaveRequests(data);
            case DOCUMENTS -> renderDocuments(data);
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
        if (secondaryContent != null) {
            secondaryContent.setVisible(true);
            secondaryContent.setManaged(true);
        }
    }

    // -------------------------------------------------------------------------
    // Overview
    // -------------------------------------------------------------------------
    private void renderOverview(PMWorkspaceData data) {
        setSectionHeader("Overview", "Your management workspace at a glance");

        List<Project> projects = safeList(data.managedProjects());
        long active = projects.stream().filter(Project::isActive).count();
        long overdue = projects.stream().filter(Project::isOverdue).count();

        addStatCard("Managed", String.valueOf(projects.size()), "Projects under you", "stat-card-blue");
        addStatCard("Active", String.valueOf(active), "Currently in progress", "stat-card-green");
        addStatCard("Overdue", String.valueOf(overdue), "Past deadline", "stat-card-orange");
        addStatCard("Team", String.valueOf(safeList(data.teamMembers()).size()), "Total team members",
                "stat-card-purple");

        // Primary: Project status card
        VBox projectsCard = createCard("Project Portfolio", "View All");
        VBox projectsBody = new VBox(12);
        List<Project> activeList = projects.stream().filter(Project::isActive).limit(4).toList();
        if (activeList.isEmpty()) {
            projectsBody.getChildren()
                    .add(createEmptyState("No active projects", "Projects will appear once assigned"));
        } else {
            for (Project project : activeList) {
                projectsBody.getChildren().add(createProjectProgressItem(project));
            }
        }
        projectsCard.getChildren().add(projectsBody);
        primaryContent.getChildren().add(projectsCard);

        // Primary: Team quick view
        VBox teamCard = createCard("Team Members", "View All");
        VBox teamBody = new VBox(10);
        List<Employee> teamPreview = safeList(data.teamMembers()).stream().limit(3).toList();
        if (teamPreview.isEmpty()) {
            teamBody.getChildren()
                    .add(createEmptyState("No team members", "Members from your projects will appear here"));
        } else {
            for (Employee member : teamPreview) {
                teamBody.getChildren().add(createTeamMemberRow(member));
            }
        }
        teamCard.getChildren().add(teamBody);
        primaryContent.getChildren().add(teamCard);

        // Secondary: Quick Actions
        VBox actionsCard = createCard("Quick Actions", null);
        actionsCard.getStyleClass().add("card-accent");
        VBox actionsBody = new VBox(10);
        actionsBody.getChildren().addAll(
                createActionButton("Managed Projects", () -> openSection(PMSection.MANAGED_PROJECTS)),
                createActionButton("View Team", () -> openSection(PMSection.MY_TEAM)),
                createActionButton("Team Timesheets", () -> openSection(PMSection.TEAM_TIMESHEETS)),
                createActionButton("Leave Requests", () -> openSection(PMSection.LEAVE_REQUESTS)),
                createActionButton("Documents", () -> openSection(PMSection.DOCUMENTS)));
        actionsCard.getChildren().add(actionsBody);
        secondaryContent.getChildren().add(actionsCard);

        // Secondary: Recent activity
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
    // Managed Projects
    // -------------------------------------------------------------------------
    private void renderManagedProjects(PMWorkspaceData data) {
        setSectionHeader("Managed Projects", "Projects assigned to you as Project Manager");
        hideSecondaryColumn();

        List<Project> projects = safeList(data.managedProjects());
        long active = projects.stream().filter(Project::isActive).count();
        long completed = projects.stream().filter(Project::isCompleted).count();
        long overdue = projects.stream().filter(Project::isOverdue).count();

        addStatCard("Total", String.valueOf(projects.size()), "Projects you manage", "stat-card-blue");
        addStatCard("Active", String.valueOf(active), "Currently in progress", "stat-card-green");
        addStatCard("Overdue", String.valueOf(overdue), "Past deadline", "stat-card-orange");
        addStatCard("Completed", String.valueOf(completed), "Delivered projects", "stat-card-purple");

        VBox listCard = createCard("Project Portfolio", null);
        VBox listBody = new VBox(14);

        if (projects.isEmpty()) {
            listBody.getChildren()
                    .add(createEmptyState("No managed projects", "Projects will appear once assigned to you as PM"));
        } else {
            for (Project project : projects) {
                listBody.getChildren().add(createProjectDetailItem(project));
            }
        }
        listCard.getChildren().add(listBody);
        primaryContent.getChildren().add(listCard);
    }

    // -------------------------------------------------------------------------
    // My Team
    // -------------------------------------------------------------------------
    private void renderMyTeam(PMWorkspaceData data) {
        setSectionHeader("My Team", "Team members across your managed projects");
        hideSecondaryColumn();

        List<Employee> team = safeList(data.teamMembers());
        List<Project> projects = safeList(data.managedProjects());
        long active = projects.stream().filter(Project::isActive).count();

        addStatCard("Projects", String.valueOf(projects.size()), "Under your management", "stat-card-blue");
        addStatCard("Members", String.valueOf(team.size()), "Across all projects", "stat-card-green");
        addStatCard("Active", String.valueOf(active), "Projects running now", "stat-card-purple");

        VBox teamCard = createCard("Team Members", null);
        VBox teamBody = new VBox(10);

        if (team.isEmpty()) {
            teamBody.getChildren().add(
                    createEmptyState("No team members found", "Members from your managed projects will appear here"));
        } else {
            team.stream()
                    .sorted(Comparator.comparing(e -> safeLower(e.getFullName())))
                    .limit(15)
                    .forEach(member -> teamBody.getChildren().add(createTeamMemberRow(member)));
        }
        teamCard.getChildren().add(teamBody);
        primaryContent.getChildren().add(teamCard);
    }

    // -------------------------------------------------------------------------
    // Team Timesheets
    // -------------------------------------------------------------------------
    private void renderTeamTimesheets(PMWorkspaceData data) {
        setSectionHeader("Team Timesheets", "Review time entries from your team members");

        List<TimesheetEntry> entries = safeList(data.timesheetEntries());
        double totalHours = entries.stream().mapToDouble(TimesheetEntry::getHours).sum();

        Set<String> uniqueEmps = new HashSet<>();
        entries.forEach(e -> {
            if (e.getEmployeeId() != null)
                uniqueEmps.add(e.getEmployeeId());
        });

        addStatCard("Total Hours", String.format("%.1fh", totalHours), "Across all team members", "stat-card-blue");
        addStatCard("Contributors", String.valueOf(uniqueEmps.size()), "Employees logging time", "stat-card-green");
        addStatCard("Entries", String.valueOf(entries.size()), "Total time entries", "stat-card-purple");

        // Primary: Time entries list
        VBox entriesCard = createCard("Time Entries", null);
        VBox entriesBody = new VBox(10);

        if (entries.isEmpty()) {
            entriesBody.getChildren()
                    .add(createEmptyState("No timesheet entries yet", "Team time entries will appear here"));
        } else {
            entries.stream().limit(15).forEach(entry -> {
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
                Label meta = new Label(String.format("%.1fh \u2022 %s \u2022 %s",
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

        // Secondary: Team summary
        VBox summaryCard = createCard("Team Summary", null);
        VBox summaryBody = new VBox(10);
        List<Employee> team = safeList(data.teamMembers());
        if (team.isEmpty()) {
            summaryBody.getChildren().add(createEmptyState("No team data", ""));
        } else {
            team.stream().limit(8).forEach(member -> {
                double memberHours = entries.stream()
                        .filter(e -> Objects.equals(e.getEmployeeId(), member.getId()))
                        .mapToDouble(TimesheetEntry::getHours).sum();
                summaryBody.getChildren().add(createInfoRow(
                        safeValue(member.getFullName()),
                        String.format("%.1fh logged", memberHours),
                        safeValue(member.getPosition())));
            });
        }
        summaryCard.getChildren().add(summaryBody);
        secondaryContent.getChildren().add(summaryCard);
    }

    // -------------------------------------------------------------------------
    // Leave Requests
    // -------------------------------------------------------------------------
    private void renderLeaveRequests(PMWorkspaceData data) {
        setSectionHeader("Leave Requests", "Review and manage team leave requests");
        hideSecondaryColumn();

        List<LeaveRequest> requests = safeList(data.leaveRequests());
        long pending = requests.stream().filter(LeaveRequest::isPending).count();
        long approved = requests.stream().filter(LeaveRequest::isApproved).count();
        long rejected = requests.stream().filter(r -> "REJECTED".equalsIgnoreCase(r.getStatus())).count();

        addStatCard("Total", String.valueOf(requests.size()), "All leave requests", "stat-card-blue");
        addStatCard("Pending", String.valueOf(pending), "Awaiting review", "stat-card-orange");
        addStatCard("Approved", String.valueOf(approved), "Accepted requests", "stat-card-green");
        addStatCard("Rejected", String.valueOf(rejected), "Declined requests", "stat-card-purple");

        VBox listCard = createCard("Team Requests", null);
        VBox listBody = new VBox(10);

        if (requests.isEmpty()) {
            listBody.getChildren().add(createEmptyState("No leave requests", "Team leave requests will appear here"));
        } else {
            requests.stream().limit(12).forEach(req -> {
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
                        + (req.getReason() != null && !req.getReason().isBlank() ? " \u2022 " + req.getReason() : ""));
                meta.getStyleClass().add("detail-row-meta");
                content.getChildren().addAll(name, meta);

                String badgeStyle = req.isPending() ? "badge-orange" : req.isApproved() ? "badge-green" : "badge-red";
                Label badge = new Label(safeValue(req.getStatus()));
                badge.getStyleClass().addAll("badge", badgeStyle);

                row.getChildren().addAll(dot, content, badge);
                listBody.getChildren().add(row);
            });
        }
        listCard.getChildren().add(listBody);
        primaryContent.getChildren().add(listCard);
    }

    // -------------------------------------------------------------------------
    // Documents
    // -------------------------------------------------------------------------
    private void renderDocuments(PMWorkspaceData data) {
        setSectionHeader("Documents", "Project and company documents for your teams");

        List<CompanyDocument> docs = safeList(data.companyDocuments());
        long policies = docs.stream().filter(CompanyDocument::isPolicy).count();
        long templates = docs.stream().filter(CompanyDocument::isTemplate).count();

        addStatCard("Total", String.valueOf(docs.size()), "Company documents", "stat-card-blue");
        addStatCard("Policies", String.valueOf(policies), "Core policies", "stat-card-green");
        addStatCard("Resources", String.valueOf(templates), "Templates & briefs", "stat-card-purple");

        // Primary: Company docs
        VBox docsCard = createCard("Company Documents", null);
        VBox docsBody = new VBox(10);

        List<CompanyDocument> companyDocs = docs.stream()
                .filter(d -> d.isPolicy() || d.isTemplate()).toList();

        if (companyDocs.isEmpty()) {
            docsBody.getChildren()
                    .add(createEmptyState("No company documents", "Documents will appear once uploaded by admin"));
        } else {
            companyDocs.forEach(doc -> docsBody.getChildren().add(
                    createInfoRow(safeValue(doc.getName()), safeValue(doc.getDescription()),
                            doc.isPolicy() ? "POLICY" : "TEMPLATE")));
        }
        docsCard.getChildren().add(docsBody);
        primaryContent.getChildren().add(docsCard);

        // Secondary: Project Briefs
        VBox projDocsCard = createCard("Project Documents", null);
        VBox projDocsBody = new VBox(10);

        List<CompanyDocument> briefs = docs.stream()
                .filter(d -> "PROJECT_BRIEF".equalsIgnoreCase(d.getCategory())).toList();
        List<Project> managed = safeList(data.managedProjects());

        if (briefs.isEmpty() && managed.isEmpty()) {
            projDocsBody.getChildren().add(createEmptyState("No project documents", ""));
        } else {
            briefs.forEach(doc -> projDocsBody.getChildren().add(
                    createInfoRow(safeValue(doc.getName()), safeValue(doc.getDescription()), "BRIEF")));
            managed.stream().limit(5).forEach(p -> projDocsBody.getChildren().add(createInfoRow(
                    "Brief: " + safeProjectName(p),
                    "Last update " + formatDate(p.getUpdatedAt()), "PROJECT")));
        }
        projDocsCard.getChildren().add(projDocsBody);
        secondaryContent.getChildren().add(projDocsCard);
    }

    // -------------------------------------------------------------------------
    // Profile
    // -------------------------------------------------------------------------
    private void renderProfile(PMWorkspaceData data) {
        setSectionHeader("My Profile", "Your project manager profile overview");
        hideSecondaryColumn();

        Employee employee = data.currentEmployee();
        if (employee == null) {
            addStatCard("Profile", "Unavailable", "No employee record matched your account", "stat-card-red");
            VBox errorCard = createCard("Profile Not Found", null);
            errorCard.getChildren().add(createEmptyState("Profile not found", "Try reloading from dashboard"));
            primaryContent.getChildren().add(errorCard);
            return;
        }

        addStatCard("Department", safeValue(employee.getDepartment()), "Assigned department", "stat-card-blue");
        addStatCard("Position", safeValue(employee.getPosition()), "Current role", "stat-card-green");
        addStatCard("Status", safeValue(employee.getStatus()), "Employment status", "stat-card-purple");

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
        Label posLabel = new Label(
                safeValue(employee.getPosition()) + " \u2014 " + safeValue(employee.getDepartment()));
        posLabel.getStyleClass().add("profile-position");
        Label statusLabel = new Label(safeValue(employee.getStatus()));
        statusLabel.getStyleClass().addAll("badge",
                "ACTIVE".equalsIgnoreCase(employee.getStatus()) ? "badge-green" : "badge-orange");
        profileInfo.getChildren().addAll(nameLabel, posLabel, statusLabel);

        profileHeader.getChildren().addAll(avatarPane, profileInfo);
        profileCard.getChildren().add(profileHeader);

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

        int teamCount = project.getTeamMemberIds() != null ? project.getTeamMemberIds().size() : 0;
        Label meta = new Label(formatDueText(project.getEndDate()) + " \u2022 " +
                safeValue(project.getStatus()) + " \u2022 " + teamCount + " member" + (teamCount == 1 ? "" : "s"));
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

        int teamCount = project.getTeamMemberIds() != null ? project.getTeamMemberIds().size() : 0;
        HBox details = new HBox(16);
        details.getChildren().addAll(
                createDetailLabel("Progress", project.getCompletionPercentage() + "%"),
                createDetailLabel("Due", formatDueText(project.getEndDate())),
                createDetailLabel("Priority", safeValue(project.getPriority())),
                createDetailLabel("Team", teamCount + " member" + (teamCount == 1 ? "" : "s")));

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
        Label posLabel = new Label(safeValue(member.getPosition()) + " \u2022 " + safeValue(member.getEmail()));
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
        openSection(PMSection.OVERVIEW);
    }

    @FXML
    private void handleManagedProjects() {
        openSection(PMSection.MANAGED_PROJECTS);
    }

    @FXML
    private void handleMyTeam() {
        openSection(PMSection.MY_TEAM);
    }

    @FXML
    private void handleTeamTimesheets() {
        openSection(PMSection.TEAM_TIMESHEETS);
    }

    @FXML
    private void handleLeaveRequests() {
        openSection(PMSection.LEAVE_REQUESTS);
    }

    @FXML
    private void handleDocuments() {
        openSection(PMSection.DOCUMENTS);
    }

    @FXML
    private void handleProfile() {
        openSection(PMSection.PROFILE);
    }

    @FXML
    private void handleBackToDashboard() {
        navigateTo("features/dashboard/view/dashboard_view");
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

    private void openSection(PMSection section) {
        if (section == null)
            return;

        SessionManager.getInstance().setSelectedPMSection(section.name());
        currentSection = section;
        setActiveButton(section);

        if (cachedData != null && !isCacheStale()) {
            animateSectionChange(cachedData);
            return;
        }

        loadSectionData();
    }

    private void animateSectionChange(PMWorkspaceData data) {
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

    private List<Project> findManagedProjects(User user, List<Project> allProjects) {
        if (user == null)
            return List.of();

        String uid = safeLower(user.getUid());
        String displayName = safeLower(user.getDisplayName());

        return safeList(allProjects).stream()
                .filter(Objects::nonNull)
                .filter(project -> {
                    boolean mgrAssigned = !uid.isBlank()
                            && uid.equals(safeLower(project.getProjectManagerId()));
                    boolean nameAssigned = !displayName.isBlank()
                            && displayName.equals(safeLower(project.getProjectManager()));
                    return mgrAssigned || nameAssigned;
                })
                .sorted(Comparator
                        .comparingLong((Project p) -> p.getUpdatedAt() > 0 ? p.getUpdatedAt() : p.getCreatedAt())
                        .reversed())
                .toList();
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
        if (managedProjectsButton != null)
            managedProjectsButton.setDisable(disabled);
        if (myTeamButton != null)
            myTeamButton.setDisable(disabled);
        if (teamTimesheetsButton != null)
            teamTimesheetsButton.setDisable(disabled);
        if (leaveRequestsButton != null)
            leaveRequestsButton.setDisable(disabled);
        if (documentsButton != null)
            documentsButton.setDisable(disabled);
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
                workStatusTextLabel.setText("Online");
                workStatusTimeLabel.setText("Status synced just now");
                workStatusDot.getStyleClass().add("status-dot-online");
            }
            case "ON_LEAVE" -> {
                workStatusTextLabel.setText("On Leave");
                workStatusTimeLabel.setText("HR leave status active");
                workStatusDot.getStyleClass().add("status-dot-away");
            }
            default -> {
                workStatusTextLabel.setText("Status Unavailable");
                workStatusTimeLabel.setText("Profile status not set");
                workStatusDot.getStyleClass().add("status-dot-offline");
            }
        }
    }

    private void setActiveButton(PMSection section) {
        Button[] allButtons = { overviewButton, managedProjectsButton, myTeamButton,
                teamTimesheetsButton, leaveRequestsButton, documentsButton, profileButton };
        for (Button btn : allButtons) {
            if (btn != null)
                btn.getStyleClass().remove("menu-button-active");
        }

        Button activeButton = switch (section) {
            case OVERVIEW -> overviewButton;
            case MANAGED_PROJECTS -> managedProjectsButton;
            case MY_TEAM -> myTeamButton;
            case TEAM_TIMESHEETS -> teamTimesheetsButton;
            case LEAVE_REQUESTS -> leaveRequestsButton;
            case DOCUMENTS -> documentsButton;
            case PROFILE -> profileButton;
        };

        if (activeButton != null && !activeButton.getStyleClass().contains("menu-button-active")) {
            activeButton.getStyleClass().add("menu-button-active");
        }
    }

    private PMSection resolveSection(String sectionName) {
        if (sectionName == null || sectionName.isBlank())
            return PMSection.OVERVIEW;
        try {
            return PMSection.valueOf(sectionName);
        } catch (IllegalArgumentException ex) {
            return PMSection.OVERVIEW;
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

    private record PMWorkspaceData(Employee currentEmployee, List<Employee> allEmployees,
            List<Project> managedProjects, List<Employee> teamMembers,
            List<TimesheetEntry> timesheetEntries, List<LeaveRequest> leaveRequests,
            List<CompanyDocument> companyDocuments) {
    }

    private enum PMSection {
        OVERVIEW,
        MANAGED_PROJECTS,
        MY_TEAM,
        TEAM_TIMESHEETS,
        LEAVE_REQUESTS,
        DOCUMENTS,
        PROFILE
    }
}
