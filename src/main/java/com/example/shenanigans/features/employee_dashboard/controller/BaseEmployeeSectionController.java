package com.example.shenanigans.features.employee_dashboard.controller;

import com.example.shenanigans.core.navigation.SidebarComponent;
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

/**
 * Base controller for employee workspace section views.
 * Provides shared navigation, data loading, and UI component builders.
 */
public abstract class BaseEmployeeSectionController {

    protected static final DateTimeFormatter DATE_FORMATTER = DateTimeFormatter.ofPattern("MMM dd, yyyy")
            .withZone(ZoneId.systemDefault());

    protected final ProjectService projectService = new ProjectService();
    protected final EmployeeService employeeService = new EmployeeService();
    protected final TimesheetService timesheetService = new TimesheetService();
    protected final LeaveRequestService leaveRequestService = new LeaveRequestService();
    protected final DocumentService documentService = new DocumentService();

    @FXML
    protected Label welcomeLabel;
    @FXML
    protected Label emailLabel;
    @FXML
    protected Label avatarLabel;
    @FXML
    protected HBox statsContainer;
    @FXML
    protected ProgressIndicator loadingIndicator;
    @FXML
    protected Button refreshButton;
    @FXML
    protected Region workStatusDot;
    @FXML
    protected Label workStatusTextLabel;
    @FXML
    protected Label workStatusTimeLabel;

    // Sidebar components (shared across all employee workspace views)
    @FXML
    protected VBox sidebarContent;
    @FXML
    protected Button sidebarToggleButton;
    @FXML
    protected Label menuHeaderLabel;
    @FXML
    protected Label settingsHeaderLabel;
    @FXML
    protected VBox systemInfoCard;
    @FXML
    protected Button dashboardButton;
    @FXML
    protected Button myTasksButton;
    @FXML
    protected Button myProjectsButton;
    @FXML
    protected Button timeSheetButton;
    @FXML
    protected Button requestsButton;
    @FXML
    protected Button documentsButton;
    @FXML
    protected Button teamButton;
    @FXML
    protected Button profileButton;

    /** Employee-specific SVG icon paths for sidebar menu buttons. */
    private static final String[] EMPLOYEE_SVG_ICONS = {
            // Dashboard - home
            "M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z",
            // My Tasks - clipboard with checkmark
            "M19 3h-4.18C14.4 1.84 13.3 1 12 1s-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm-2 14l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z",
            // My Projects - folder
            "M20 6h-8l-2-2H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm0 12H4V8h16v10z",
            // Time Sheet - clock
            "M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z",
            // Leave Requests - document copy
            "M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z",
            // Documents - file
            "M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z",
            // My Team - group
            "M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5z",
            // My Profile - person
            "M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
    };

    protected SidebarComponent sidebarComponent;

    protected Employee currentEmployee;
    protected List<Project> assignedProjects = List.of();
    protected List<Employee> allEmployees = List.of();
    protected List<TimesheetEntry> timesheetEntries = List.of();
    protected List<LeaveRequest> leaveRequests = List.of();
    protected List<CompanyDocument> companyDocuments = List.of();

    /** Subclasses must provide their logger. */
    protected abstract Logger getLogger();

    /** Subclasses render their specific content after data loads. */
    protected abstract void renderContent();

    @FXML
    public void initialize() {
        if (!SessionManager.getInstance().isLoggedIn()) {
            Platform.runLater(() -> ViewNavigator.redirectToLogin(getLogger()));
            return;
        }
        User user = SessionManager.getInstance().getCurrentUser();
        if (user == null || !user.isEmployee()) {
            Platform.runLater(() -> ViewNavigator.redirectToDashboard(getLogger()));
            return;
        }
        setupUserInfo(user);
        setupSidebar();
        loadData();
    }

    protected void setupUserInfo(User user) {
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

    /**
     * Initializes the sidebar component with employee-specific icons and toggle.
     */
    protected void setupSidebar() {
        if (sidebarContent == null || sidebarToggleButton == null) {
            return;
        }
        sidebarComponent = new SidebarComponent(
                getLogger(),
                sidebarContent,
                sidebarToggleButton,
                menuHeaderLabel,
                settingsHeaderLabel,
                systemInfoCard,
                new Button[] { dashboardButton, myTasksButton, myProjectsButton, timeSheetButton,
                        requestsButton, documentsButton, teamButton, profileButton },
                new String[] { "Dashboard", "My Tasks", "My Projects", "Time Sheet",
                        "Leave Requests", "Documents", "My Team", "My Profile" },
                EMPLOYEE_SVG_ICONS);
        sidebarComponent.initialize();
    }

    /** Handles sidebar toggle action. */
    @FXML
    protected void handleSidebarToggle() {
        if (sidebarComponent != null) {
            sidebarComponent.toggle();
        }
    }

    protected void loadData() {
        setLoading(true);
        User currentUser = SessionManager.getInstance().getCurrentUser();
        Task<EmployeeViewData> loadTask = new Task<>() {
            @Override
            protected EmployeeViewData call() throws Exception {
                List<Employee> employees = runAndWait(employeeService.getAllEmployees());
                List<Project> projects = runAndWait(projectService.getAllProjects());
                Employee employee = resolveCurrentEmployee(currentUser, employees);
                List<Project> assigned = findAssignedProjects(currentUser, projects);

                String uid = currentUser != null ? currentUser.getUid() : "";
                List<TimesheetEntry> tsEntries = uid.isEmpty() ? List.of()
                        : runAndWait(timesheetService.getEntriesByEmployee(uid));
                List<LeaveRequest> lrList = uid.isEmpty() ? List.of()
                        : runAndWait(leaveRequestService.getRequestsByEmployee(uid));
                List<CompanyDocument> docList = runAndWait(documentService.getAllDocuments());

                return new EmployeeViewData(employee, employees, assigned, tsEntries, lrList, docList);
            }
        };

        loadTask.setOnSucceeded(event -> {
            EmployeeViewData data = loadTask.getValue();
            currentEmployee = data.currentEmployee();
            allEmployees = safeList(data.allEmployees());
            assignedProjects = safeList(data.assignedProjects());
            timesheetEntries = safeList(data.timesheetEntries());
            leaveRequests = safeList(data.leaveRequests());
            companyDocuments = safeList(data.companyDocuments());
            updateWorkStatus(currentEmployee);
            renderContent();
            setLoading(false);
        });

        loadTask.setOnFailed(event -> {
            setLoading(false);
            getLogger().warning("Failed to load data: " + loadTask.getException());
        });

        Thread thread = new Thread(loadTask, "employee-section-loader");
        thread.setDaemon(true);
        thread.start();
    }

    // =========================================================================
    // Navigation
    // =========================================================================

    @FXML
    protected void handleDashboard() {
        navigateTo("features/employee_dashboard/view/employee_dashboard_view");
    }

    @FXML
    protected void handleMyTasks() {
        navigateTo("features/employee_dashboard/view/employee_tasks_view");
    }

    @FXML
    protected void handleMyProjects() {
        navigateTo("features/employee_dashboard/view/employee_projects_view");
    }

    @FXML
    protected void handleTimeSheet() {
        navigateTo("features/employee_dashboard/view/employee_timesheet_view");
    }

    @FXML
    protected void handleRequests() {
        navigateTo("features/employee_dashboard/view/employee_requests_view");
    }

    @FXML
    protected void handleDocuments() {
        navigateTo("features/employee_dashboard/view/employee_documents_view");
    }

    @FXML
    protected void handleTeam() {
        navigateTo("features/employee_dashboard/view/employee_team_view");
    }

    @FXML
    protected void handleProfile() {
        navigateTo("features/employee_dashboard/view/employee_profile_view");
    }

    @FXML
    protected void handleLogout() {
        SessionManager.getInstance().clearSession();
        ViewNavigator.redirectToLogin(getLogger());
    }

    @FXML
    protected void handleRefresh() {
        loadData();
    }

    protected void navigateTo(String viewPath) {
        ViewNavigator.navigateTo(viewPath, getLogger());
    }

    // =========================================================================
    // UI Component Builders
    // =========================================================================

    protected void addStatCard(String label, String value, String subtitle, String styleClass) {
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

    protected VBox createCard(String title, String linkText) {
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

    protected HBox createTaskRow(Project project) {
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
        if ("high".equals(priority))
            due.getStyleClass().add("task-due-urgent");
        meta.getChildren().addAll(tag, due);
        content.getChildren().addAll(name, meta);

        Label progressLabel = new Label(project.getCompletionPercentage() + "%");
        progressLabel.getStyleClass().add("task-progress-badge");

        row.getChildren().addAll(dot, content, progressLabel);
        return row;
    }

    protected VBox createProjectDetailItem(Project project) {
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

        item.getChildren().addAll(header, bar, details);
        if (project.getDescription() != null && !project.getDescription().isBlank()) {
            Label desc = new Label(project.getDescription());
            desc.getStyleClass().add("project-description");
            desc.setWrapText(true);
            item.getChildren().add(desc);
        }
        return item;
    }

    protected HBox createTeamMemberRow(Employee member) {
        HBox row = new HBox(14);
        row.getStyleClass().add("team-member-row");
        row.setAlignment(Pos.CENTER_LEFT);

        StackPane avatarPane = new StackPane();
        avatarPane.getStyleClass().add("team-avatar-container");
        Circle circle = new Circle(18);
        circle.getStyleClass().add("team-avatar-circle");
        Label initialLabel = new Label(safeValue(member.getFullName()).substring(0, 1).toUpperCase());
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

    protected HBox createInfoRow(String title, String description, String badgeText) {
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

    protected VBox createDetailLabel(String label, String value) {
        VBox box = new VBox(2);
        Label l = new Label(label);
        l.getStyleClass().add("detail-label");
        Label v = new Label(value);
        v.getStyleClass().add("detail-value");
        box.getChildren().addAll(l, v);
        return box;
    }

    protected VBox createEmptyState(String title, String subtitle) {
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

    protected HBox createProfileRow(String label, String value) {
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

    // =========================================================================
    // Utility Methods
    // =========================================================================

    protected void updateWorkStatus(Employee employee) {
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
            default -> {
                workStatusTextLabel.setText("Status Unavailable");
                workStatusTimeLabel.setText("Profile status not set");
                workStatusDot.getStyleClass().add("status-dot-offline");
            }
        }
    }

    protected void setLoading(boolean loading) {
        if (loadingIndicator != null)
            loadingIndicator.setVisible(loading);
        if (refreshButton != null)
            refreshButton.setDisable(loading);
    }

    protected Employee resolveCurrentEmployee(User user, List<Employee> employees) {
        if (user == null)
            return null;
        String uid = safeLower(user.getUid());
        String email = safeLower(user.getEmail());
        String displayName = safeLower(user.getDisplayName());
        return safeList(employees).stream()
                .filter(Objects::nonNull)
                .filter(e -> {
                    String eId = safeLower(e.getId());
                    String eEmail = safeLower(e.getEmail());
                    String eName = safeLower(e.getFullName());
                    return (!uid.isBlank() && uid.equals(eId))
                            || (!email.isBlank() && email.equals(eEmail))
                            || (!displayName.isBlank() && displayName.equals(eName));
                })
                .findFirst().orElse(null);
    }

    protected List<Project> findAssignedProjects(User user, List<Project> allProjects) {
        if (user == null)
            return List.of();
        String uid = safeLower(user.getUid());
        String displayName = safeLower(user.getDisplayName());
        return safeList(allProjects).stream()
                .filter(Objects::nonNull)
                .filter(p -> {
                    boolean teamAssigned = p.getTeamMemberIds() != null
                            && p.getTeamMemberIds().stream()
                                    .filter(Objects::nonNull)
                                    .map(this::safeLower)
                                    .anyMatch(id -> !uid.isBlank() && id.equals(uid));
                    boolean managerAssigned = !uid.isBlank() && uid.equals(safeLower(p.getProjectManagerId()));
                    boolean nameAssigned = !displayName.isBlank()
                            && displayName.equals(safeLower(p.getProjectManager()));
                    return teamAssigned || managerAssigned || nameAssigned;
                })
                .sorted(Comparator
                        .comparingLong((Project p) -> p.getUpdatedAt() > 0 ? p.getUpdatedAt() : p.getCreatedAt())
                        .reversed())
                .toList();
    }

    protected boolean isDueToday(Project project) {
        if (project.getEndDate() <= 0)
            return false;
        LocalDate dueDate = Instant.ofEpochMilli(project.getEndDate()).atZone(ZoneId.systemDefault()).toLocalDate();
        return dueDate.equals(LocalDate.now());
    }

    protected boolean isDueSoon(Project project) {
        if (project.getEndDate() <= 0)
            return false;
        LocalDate dueDate = Instant.ofEpochMilli(project.getEndDate()).atZone(ZoneId.systemDefault()).toLocalDate();
        long days = ChronoUnit.DAYS.between(LocalDate.now(), dueDate);
        return days >= 0 && days <= 2;
    }

    protected long effectiveDueDate(Project project) {
        return project.getEndDate() > 0 ? project.getEndDate() : Long.MAX_VALUE;
    }

    protected String formatDueText(long endDateMillis) {
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

    protected String formatDate(long epochMillis) {
        if (epochMillis <= 0)
            return "N/A";
        return DATE_FORMATTER.format(Instant.ofEpochMilli(epochMillis));
    }

    protected String formatRelativeTime(long epochMillis) {
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

    protected String safeValue(String value) {
        return value == null || value.isBlank() ? "N/A" : value;
    }

    protected String safeLower(String value) {
        return value == null ? "" : value.trim().toLowerCase();
    }

    protected String safeProjectName(Project project) {
        return project.getName() == null || project.getName().isBlank() ? "Untitled Project" : project.getName();
    }

    protected <T> List<T> safeList(List<T> input) {
        return input == null ? List.of() : input;
    }

    protected <T> List<T> runAndWait(Task<List<T>> task) throws Exception {
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

    /** Common data record shared by all section views. */
    protected record EmployeeViewData(Employee currentEmployee, List<Employee> allEmployees,
            List<Project> assignedProjects, List<TimesheetEntry> timesheetEntries,
            List<LeaveRequest> leaveRequests, List<CompanyDocument> companyDocuments) {
    }
}
