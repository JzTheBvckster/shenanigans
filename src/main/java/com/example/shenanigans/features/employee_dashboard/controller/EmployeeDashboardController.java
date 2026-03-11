package com.example.shenanigans.features.employee_dashboard.controller;

import com.example.shenanigans.core.navigation.SidebarComponent;
import com.example.shenanigans.core.navigation.ViewNavigator;
import com.example.shenanigans.core.session.SessionManager;
import com.example.shenanigans.features.auth.model.User;
import com.example.shenanigans.features.employee_dashboard.model.TimesheetEntry;
import com.example.shenanigans.features.employee_dashboard.model.LeaveRequest;
import com.example.shenanigans.features.employee_dashboard.service.TimesheetService;
import com.example.shenanigans.features.employee_dashboard.service.LeaveRequestService;
import com.example.shenanigans.features.employees.model.Employee;
import com.example.shenanigans.features.employees.service.EmployeeService;
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
import javafx.fxml.FXML;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.control.ProgressBar;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.Region;
import javafx.scene.layout.VBox;
import javafx.concurrent.Task;

/**
 * Controller for the employee dashboard view. Provides a simplified dashboard
 * for employees with
 * task tracking, time sheets, and personal information.
 */
public class EmployeeDashboardController {

    private static final Logger LOGGER = Logger.getLogger(EmployeeDashboardController.class.getName());
    private static final DateTimeFormatter DATE_FORMATTER = DateTimeFormatter.ofPattern("MMM dd, yyyy")
            .withZone(ZoneId.systemDefault());

    private final ProjectService projectService = new ProjectService();
    private final EmployeeService employeeService = new EmployeeService();
    private final TimesheetService timesheetService = new TimesheetService();
    private final LeaveRequestService leaveRequestService = new LeaveRequestService();
    private Employee currentEmployee;
    private List<Project> assignedProjects = List.of();
    private SidebarComponent sidebarComponent;

    /** Employee-specific SVG icon paths for sidebar menu buttons. */
    private static final String[] EMPLOYEE_SVG_ICONS = {
            // My Tasks - clipboard with checkmark
            "M19 3h-4.18C14.4 1.84 13.3 1 12 1s-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm-2 14l-4-4 1.41-1.41L10 14.17l6.59-6.59L18 9l-8 8z",
            // My Projects - folder
            "M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z",
            // Time Sheet - clock
            "M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z",
            // Leave Requests - calendar
            "M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-2 .9-2 2v14c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM9 10H7v2h2v-2zm4 0h-2v2h2v-2zm4 0h-2v2h2v-2z",
            // Documents - file
            "M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z",
            // My Team - group
            "M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5z",
            // My Profile - person
            "M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"
    };

    // Header components
    @FXML
    private Label welcomeLabel;
    @FXML
    private Label emailLabel;
    @FXML
    private Label avatarLabel;
    @FXML
    private Button logoutButton;

    // Sidebar components
    @FXML
    private VBox sidebarContent;
    @FXML
    private Button sidebarToggleButton;
    @FXML
    private Label menuHeaderLabel;
    @FXML
    private Label settingsHeaderLabel;
    @FXML
    private VBox systemInfoCard;
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

    // Stats labels
    @FXML
    private Label tasksDueTodayLabel;
    @FXML
    private Label hoursThisWeekLabel;
    @FXML
    private Label activeProjectsLabel;
    @FXML
    private Label leaveBalanceLabel;

    // Content containers
    @FXML
    private VBox tasksContainer;
    @FXML
    private VBox activityContainer;
    @FXML
    private VBox projectsContainer;

    // Loading indicator
    @FXML
    private javafx.scene.control.ProgressIndicator loadingIndicator;

    /** Called automatically after FXML is loaded. */
    @FXML
    public void initialize() {
        // Security check - redirect to login if not authenticated
        if (!SessionManager.getInstance().isLoggedIn()) {
            LOGGER.warning("Unauthorized access attempt to employee dashboard. Redirecting to login.");
            Platform.runLater(this::redirectToLogin);
            return;
        }

        User user = SessionManager.getInstance().getCurrentUser();

        // Verify user is an employee
        if (!user.isEmployee()) {
            LOGGER.warning("Non-employee user attempted to access employee dashboard. Redirecting.");
            Platform.runLater(this::redirectToMainDashboard);
            return;
        }

        // Setup user information
        setupUserInfo(user);

        // Setup sidebar component (consistent with admin screens)
        setupSidebar();

        // Load dashboard data
        loadDashboardData();

        LOGGER.info("EmployeeDashboardController initialized for user: " + user.getEmail());
    }

    /** Sets up user information in the header. */
    private void setupUserInfo(User user) {
        welcomeLabel.setText("Welcome, " + user.getDisplayName() + "!");
        emailLabel.setText(user.getEmail());

        // Set avatar letter from display name
        if (user.getDisplayName() != null && !user.getDisplayName().isEmpty()) {
            avatarLabel.setText(user.getDisplayName().substring(0, 1).toUpperCase());
        }
    }

    /**
     * Initializes the sidebar component with employee-specific icons and toggle.
     */
    private void setupSidebar() {
        sidebarComponent = new SidebarComponent(
                LOGGER,
                sidebarContent,
                sidebarToggleButton,
                menuHeaderLabel,
                settingsHeaderLabel,
                systemInfoCard,
                new Button[] { myTasksButton, myProjectsButton, timeSheetButton, requestsButton,
                        documentsButton, teamButton, profileButton },
                new String[] { "My Tasks", "My Projects", "Time Sheet", "Leave Requests",
                        "Documents", "My Team", "My Profile" },
                EMPLOYEE_SVG_ICONS);
        sidebarComponent.initialize();
    }

    /** Handles sidebar toggle action. */
    @FXML
    private void handleSidebarToggle() {
        if (sidebarComponent != null) {
            sidebarComponent.toggle();
        }
    }

    /** Loads dashboard statistics and data. */
    private void loadDashboardData() {
        if (loadingIndicator != null) {
            loadingIndicator.setVisible(true);
        }

        clearDashboardData();

        User currentUser = SessionManager.getInstance().getCurrentUser();
        Task<EmployeeDashboardData> loadTask = new Task<>() {
            @Override
            protected EmployeeDashboardData call() throws Exception {
                List<Employee> allEmployees = runAndWait(employeeService.getAllEmployees());
                List<Project> allProjects = runAndWait(projectService.getAllProjects());

                Employee currentEmployee = resolveCurrentEmployee(currentUser, allEmployees);
                List<Project> assignedProjects = findAssignedProjects(currentUser, allProjects);

                String uid = currentUser.getUid();
                List<TimesheetEntry> timesheetEntries = runAndWait(timesheetService.getEntriesByEmployee(uid));
                List<LeaveRequest> leaveRequests = runAndWait(leaveRequestService.getRequestsByEmployee(uid));

                return new EmployeeDashboardData(currentEmployee, assignedProjects, timesheetEntries, leaveRequests);
            }
        };

        loadTask.setOnSucceeded(
                event -> {
                    applyDashboardData(loadTask.getValue());
                    if (loadingIndicator != null) {
                        loadingIndicator.setVisible(false);
                    }
                });

        loadTask.setOnFailed(
                event -> {
                    LOGGER.warning("Failed to load employee dashboard data: " + loadTask.getException());
                    showLoadFailureState();
                    if (loadingIndicator != null) {
                        loadingIndicator.setVisible(false);
                    }
                });

        Thread thread = new Thread(loadTask, "employee-dashboard-loader");
        thread.setDaemon(true);
        thread.start();
    }

    private void clearDashboardData() {
        currentEmployee = null;
        assignedProjects = List.of();
        if (tasksDueTodayLabel != null) {
            tasksDueTodayLabel.setText("0");
        }
        if (hoursThisWeekLabel != null) {
            hoursThisWeekLabel.setText("N/A");
        }
        if (activeProjectsLabel != null) {
            activeProjectsLabel.setText("0");
        }
        if (leaveBalanceLabel != null) {
            leaveBalanceLabel.setText("N/A");
        }
        renderTasks(List.of());
        renderProjects(List.of());
        renderActivity(List.of());
    }

    private void applyDashboardData(EmployeeDashboardData data) {
        currentEmployee = data.currentEmployee();
        assignedProjects = safeList(data.assignedProjects());

        long dueToday = assignedProjects.stream().filter(this::isDueToday).count();
        long activeProjects = assignedProjects.stream().filter(Project::isActive).count();

        if (tasksDueTodayLabel != null) {
            tasksDueTodayLabel.setText(String.valueOf(dueToday));
        }
        if (hoursThisWeekLabel != null) {
            LocalDate today = LocalDate.now();
            LocalDate weekStart = today.with(java.time.DayOfWeek.MONDAY);
            long weekStartMillis = weekStart.atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli();
            long weekEndMillis = weekStart.plusDays(7).atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli();
            double weeklyHours = safeList(data.timesheetEntries()).stream()
                    .filter(e -> e.getDate() >= weekStartMillis && e.getDate() < weekEndMillis)
                    .mapToDouble(TimesheetEntry::getHours).sum();
            hoursThisWeekLabel.setText(String.format("%.1fh", weeklyHours));
        }
        if (activeProjectsLabel != null) {
            activeProjectsLabel.setText(String.valueOf(activeProjects));
        }
        if (leaveBalanceLabel != null) {
            long pending = safeList(data.leaveRequests()).stream().filter(LeaveRequest::isPending).count();
            leaveBalanceLabel.setText(pending > 0 ? pending + " pending" : "None pending");
        }

        renderTasks(assignedProjects);
        renderProjects(assignedProjects);
        renderActivity(assignedProjects);
    }

    private void showLoadFailureState() {
        if (tasksDueTodayLabel != null) {
            tasksDueTodayLabel.setText("-");
        }
        if (hoursThisWeekLabel != null) {
            hoursThisWeekLabel.setText("N/A");
        }
        if (activeProjectsLabel != null) {
            activeProjectsLabel.setText("-");
        }
        if (leaveBalanceLabel != null) {
            leaveBalanceLabel.setText("N/A");
        }
        renderTasks(List.of());
        renderProjects(List.of());
        if (activityContainer != null) {
            activityContainer.getChildren().clear();
            addActivityItem("Dashboard data could not be loaded", "Try refresh from My Tasks", "orange");
        }
    }

    private Employee resolveCurrentEmployee(User user, List<Employee> employees) {
        if (user == null) {
            return null;
        }

        String uid = safeLower(user.getUid());
        String email = safeLower(user.getEmail());
        String displayName = safeLower(user.getDisplayName());

        return safeList(employees).stream()
                .filter(Objects::nonNull)
                .filter(
                        employee -> {
                            String employeeId = safeLower(employee.getId());
                            String employeeEmail = safeLower(employee.getEmail());
                            String employeeName = safeLower(employee.getFullName());
                            return (!uid.isBlank() && uid.equals(employeeId))
                                    || (!email.isBlank() && email.equals(employeeEmail))
                                    || (!displayName.isBlank() && displayName.equals(employeeName));
                        })
                .findFirst()
                .orElse(null);
    }

    private List<Project> findAssignedProjects(User user, List<Project> allProjects) {
        if (user == null) {
            return List.of();
        }

        String uid = safeLower(user.getUid());
        String displayName = safeLower(user.getDisplayName());

        return safeList(allProjects).stream()
                .filter(Objects::nonNull)
                .filter(
                        project -> {
                            boolean teamAssigned = project.getTeamMemberIds() != null
                                    && project.getTeamMemberIds().stream()
                                            .filter(Objects::nonNull)
                                            .map(this::safeLower)
                                            .anyMatch(memberId -> !uid.isBlank() && memberId.equals(uid));
                            boolean managerAssigned = !uid.isBlank()
                                    && uid.equals(safeLower(project.getProjectManagerId()));
                            boolean nameAssigned = !displayName.isBlank()
                                    && displayName.equals(safeLower(project.getProjectManager()));

                            return teamAssigned || managerAssigned || nameAssigned;
                        })
                .sorted(
                        Comparator.comparingLong(
                                (Project project) -> project.getUpdatedAt() > 0 ? project.getUpdatedAt()
                                        : project.getCreatedAt())
                                .reversed())
                .toList();
    }

    private void renderTasks(List<Project> assignedProjects) {
        if (tasksContainer == null) {
            return;
        }

        tasksContainer.getChildren().clear();
        List<Project> relevantProjects = safeList(assignedProjects).stream()
                .filter(project -> project.isActive() || project.isOverdue())
                .sorted(Comparator.comparingLong(this::effectiveDueDate))
                .limit(3)
                .toList();

        if (relevantProjects.isEmpty()) {
            addTaskItem("No assigned tasks", "No projects assigned", "No due date", "low");
            return;
        }

        for (Project project : relevantProjects) {
            String priority = project.isOverdue() ? "high" : isDueSoon(project) ? "medium" : "low";
            addTaskItem(
                    "Progress update: " + safeProjectName(project),
                    safeProjectName(project),
                    formatTaskDue(project.getEndDate()),
                    priority);
        }
    }

    private void renderProjects(List<Project> assignedProjects) {
        if (projectsContainer == null) {
            return;
        }

        projectsContainer.getChildren().clear();

        if (safeList(assignedProjects).isEmpty()) {
            Label empty = new Label("No assigned projects yet.");
            empty.getStyleClass().add("project-meta");
            projectsContainer.getChildren().add(empty);
            return;
        }

        safeList(assignedProjects).stream().limit(3).forEach(this::addProjectProgressItem);
    }

    private void renderActivity(List<Project> assignedProjects) {
        if (activityContainer == null) {
            return;
        }

        activityContainer.getChildren().clear();

        List<Project> activityProjects = safeList(assignedProjects).stream()
                .sorted(
                        Comparator.comparingLong(
                                (Project project) -> project.getUpdatedAt() > 0 ? project.getUpdatedAt()
                                        : project.getCreatedAt())
                                .reversed())
                .limit(3)
                .toList();

        if (activityProjects.isEmpty()) {
            addActivityItem("No recent activity", "Just now", "blue");
            return;
        }

        for (Project project : activityProjects) {
            long timestamp = project.getUpdatedAt() > 0 ? project.getUpdatedAt() : project.getCreatedAt();
            addActivityItem(
                    "Project updated: " + safeProjectName(project), formatRelativeTime(timestamp), "green");
        }
    }

    private void addTaskItem(String title, String tag, String dueText, String priority) {
        HBox taskItem = new HBox(14);
        taskItem.getStyleClass().addAll("task-item", "task-" + priority);
        taskItem.setAlignment(javafx.geometry.Pos.CENTER_LEFT);

        VBox priorityBox = new VBox(2);
        priorityBox.setAlignment(javafx.geometry.Pos.CENTER);
        Region priorityDot = new Region();
        priorityDot.getStyleClass().addAll("priority-dot", "priority-" + priority);
        priorityBox.getChildren().add(priorityDot);

        VBox content = new VBox(4);
        HBox.setHgrow(content, Priority.ALWAYS);
        Label taskName = new Label(title);
        taskName.getStyleClass().add("task-name");

        HBox metaRow = new HBox(8);
        Label taskTag = new Label(tag);
        taskTag.getStyleClass().add("task-tag");
        Label dueLabel = new Label(dueText);
        dueLabel.getStyleClass().add("task-due");
        if ("high".equals(priority)) {
            dueLabel.getStyleClass().add("task-due-urgent");
        }
        metaRow.getChildren().addAll(taskTag, dueLabel);

        content.getChildren().addAll(taskName, metaRow);

        Button completeButton = new Button("");
        completeButton.getStyleClass().add("task-complete-btn");
        completeButton.setDisable(true);

        taskItem.getChildren().addAll(priorityBox, content, completeButton);
        tasksContainer.getChildren().add(taskItem);
    }

    private void addProjectProgressItem(Project project) {
        VBox item = new VBox(8);
        item.getStyleClass().add("project-item");

        HBox header = new HBox();
        header.setAlignment(javafx.geometry.Pos.CENTER_LEFT);
        Label name = new Label(safeProjectName(project));
        name.getStyleClass().add("project-name");
        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);
        Label percentage = new Label(project.getCompletionPercentage() + "%");
        percentage.getStyleClass().add("project-percentage");
        header.getChildren().addAll(name, spacer, percentage);

        ProgressBar progressBar = new ProgressBar(project.getCompletionPercentage() / 100.0);
        progressBar.setMaxWidth(Double.MAX_VALUE);
        progressBar.getStyleClass().add("project-progress-bar");

        int remainingUnits = Math.max(0, (100 - project.getCompletionPercentage() + 24) / 25);
        Label meta = new Label(formatTaskDue(project.getEndDate()) + " • " + remainingUnits + " tasks remaining");
        meta.getStyleClass().add("project-meta");

        item.getChildren().addAll(header, progressBar, meta);
        projectsContainer.getChildren().add(item);
    }

    private void addActivityItem(String title, String time, String color) {
        HBox activityItem = new HBox(12);
        activityItem.getStyleClass().add("activity-item");
        activityItem.setAlignment(javafx.geometry.Pos.CENTER_LEFT);

        Region dot = new Region();
        dot.getStyleClass().addAll("activity-dot", "activity-dot-" + color);

        VBox content = new VBox(2);
        HBox.setHgrow(content, Priority.ALWAYS);
        Label titleLabel = new Label(title);
        titleLabel.getStyleClass().add("activity-title");
        Label timeLabel = new Label(time);
        timeLabel.getStyleClass().add("activity-time");
        content.getChildren().addAll(titleLabel, timeLabel);

        activityItem.getChildren().addAll(dot, content);
        activityContainer.getChildren().add(activityItem);
    }

    private long effectiveDueDate(Project project) {
        return project.getEndDate() > 0 ? project.getEndDate() : Long.MAX_VALUE;
    }

    private boolean isDueToday(Project project) {
        if (project.getEndDate() <= 0) {
            return false;
        }

        LocalDate dueDate = Instant.ofEpochMilli(project.getEndDate()).atZone(ZoneId.systemDefault()).toLocalDate();
        return dueDate.equals(LocalDate.now());
    }

    private boolean isDueSoon(Project project) {
        if (project.getEndDate() <= 0) {
            return false;
        }
        LocalDate dueDate = Instant.ofEpochMilli(project.getEndDate()).atZone(ZoneId.systemDefault()).toLocalDate();
        long daysUntilDue = ChronoUnit.DAYS.between(LocalDate.now(), dueDate);
        return daysUntilDue >= 0 && daysUntilDue <= 2;
    }

    private String formatTaskDue(long endDateMillis) {
        if (endDateMillis <= 0) {
            return "No due date";
        }

        LocalDate dueDate = Instant.ofEpochMilli(endDateMillis).atZone(ZoneId.systemDefault()).toLocalDate();
        long dayDiff = ChronoUnit.DAYS.between(LocalDate.now(), dueDate);

        if (dayDiff < 0) {
            return "Overdue by " + Math.abs(dayDiff) + " day" + (Math.abs(dayDiff) == 1 ? "" : "s");
        }
        if (dayDiff == 0) {
            return "Due today";
        }
        if (dayDiff == 1) {
            return "Due tomorrow";
        }
        if (dayDiff <= 30) {
            return "Due in " + dayDiff + " days";
        }
        return "Due " + DATE_FORMATTER.format(Instant.ofEpochMilli(endDateMillis));
    }

    private String formatRelativeTime(long epochMillis) {
        if (epochMillis <= 0) {
            return "Just now";
        }

        long minutes = Math.max(0, ChronoUnit.MINUTES.between(Instant.ofEpochMilli(epochMillis), Instant.now()));
        if (minutes < 1) {
            return "Just now";
        }
        if (minutes < 60) {
            return minutes + " minute" + (minutes == 1 ? "" : "s") + " ago";
        }

        long hours = Math.max(0, ChronoUnit.HOURS.between(Instant.ofEpochMilli(epochMillis), Instant.now()));
        if (hours < 24) {
            return hours + " hour" + (hours == 1 ? "" : "s") + " ago";
        }

        long days = Math.max(0, ChronoUnit.DAYS.between(Instant.ofEpochMilli(epochMillis), Instant.now()));
        if (days < 7) {
            return days + " day" + (days == 1 ? "" : "s") + " ago";
        }

        return DATE_FORMATTER.format(Instant.ofEpochMilli(epochMillis));
    }

    private String formatLeaveMetric(Employee employee) {
        if (employee == null || employee.getStatus() == null) {
            return "N/A";
        }
        return switch (employee.getStatus()) {
            case "ON_LEAVE" -> "0";
            case "ACTIVE" -> "N/A";
            default -> "N/A";
        };
    }

    private String safeProjectName(Project project) {
        return project.getName() == null || project.getName().isBlank()
                ? "Untitled Project"
                : project.getName();
    }

    private String safeLower(String value) {
        return value == null ? "" : value.trim().toLowerCase();
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
        } catch (ExecutionException executionException) {
            Throwable cause = executionException.getCause();
            if (cause instanceof Exception exception) {
                throw exception;
            }
            throw new RuntimeException(cause);
        }
    }

    private record EmployeeDashboardData(Employee currentEmployee, List<Project> assignedProjects,
            List<TimesheetEntry> timesheetEntries, List<LeaveRequest> leaveRequests) {
    }

    // Navigation handlers

    /** Handles navigation to My Tasks section. */
    @FXML
    private void handleMyTasks() {
        if (!checkAuth())
            return;
        LOGGER.info("Navigating to My Tasks");
        navigateTo("features/employee_dashboard/view/employee_tasks_view");
    }

    /** Handles navigation to My Projects section. */
    @FXML
    private void handleMyProjects() {
        if (!checkAuth())
            return;
        LOGGER.info("Navigating to My Projects");
        navigateTo("features/employee_dashboard/view/employee_projects_view");
    }

    /** Handles navigation to Time Sheet section. */
    @FXML
    private void handleTimeSheet() {
        if (!checkAuth())
            return;
        LOGGER.info("Navigating to Time Sheet");
        navigateTo("features/employee_dashboard/view/employee_timesheet_view");
    }

    /** Handles navigation to Leave Requests section. */
    @FXML
    private void handleRequests() {
        if (!checkAuth())
            return;
        LOGGER.info("Navigating to Leave Requests");
        navigateTo("features/employee_dashboard/view/employee_requests_view");
    }

    /** Handles navigation to Documents section. */
    @FXML
    private void handleDocuments() {
        if (!checkAuth())
            return;
        LOGGER.info("Navigating to Documents");
        navigateTo("features/employee_dashboard/view/employee_documents_view");
    }

    /** Handles navigation to Team section. */
    @FXML
    private void handleTeam() {
        if (!checkAuth())
            return;
        LOGGER.info("Navigating to Team");
        navigateTo("features/employee_dashboard/view/employee_team_view");
    }

    /** Handles navigation to Profile section. */
    @FXML
    private void handleProfile() {
        if (!checkAuth())
            return;
        LOGGER.info("Navigating to Profile");
        if (currentEmployee != null && currentEmployee.getId() != null && !currentEmployee.getId().isBlank()) {
            SessionManager.getInstance().setSelectedEmployeeId(currentEmployee.getId());
        }
        navigateTo("features/employee_dashboard/view/employee_profile_view");
    }

    /** Handles user logout. */
    @FXML
    private void handleLogout() {
        LOGGER.info("Employee logging out");
        SessionManager.getInstance().clearSession();
        redirectToLogin();
    }

    /** Sets the active state on the selected menu button. */
    private void setActiveButton(Button activeButton) {
        // Remove active class from all buttons
        myTasksButton.getStyleClass().remove("menu-button-active");
        myProjectsButton.getStyleClass().remove("menu-button-active");
        timeSheetButton.getStyleClass().remove("menu-button-active");
        requestsButton.getStyleClass().remove("menu-button-active");
        documentsButton.getStyleClass().remove("menu-button-active");
        teamButton.getStyleClass().remove("menu-button-active");
        profileButton.getStyleClass().remove("menu-button-active");

        // Add active class to selected button
        if (!activeButton.getStyleClass().contains("menu-button-active")) {
            activeButton.getStyleClass().add("menu-button-active");
        }
    }

    /** Checks if user is authenticated. */
    private boolean checkAuth() {
        if (!SessionManager.getInstance().isLoggedIn()) {
            LOGGER.warning("Session expired. Redirecting to login.");
            redirectToLogin();
            return false;
        }
        return true;
    }

    /** Redirects to login page. */
    private void redirectToLogin() {
        ViewNavigator.redirectToLogin(LOGGER);
    }

    /** Redirects to main dashboard (for non-employees). */
    private void redirectToMainDashboard() {
        ViewNavigator.redirectToDashboard(LOGGER);
    }

    private void navigateTo(String viewPath) {
        ViewNavigator.navigateTo(viewPath, LOGGER);
    }

}
