package com.example.shenanigans.features.employee_dashboard.controller;

import com.example.shenanigans.core.navigation.ViewNavigator;
import com.example.shenanigans.core.session.SessionManager;
import com.example.shenanigans.features.auth.model.User;
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
import javafx.animation.FadeTransition;
import javafx.animation.ParallelTransition;
import javafx.application.Platform;
import javafx.concurrent.Task;
import javafx.fxml.FXML;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.control.ProgressIndicator;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.Region;
import javafx.scene.layout.VBox;
import javafx.util.Duration;

/**
 * Controller for employee-focused workspace screens shown from the employee
 * dashboard menu.
 */
public class EmployeeWorkspaceController {

    private static final Logger LOGGER = Logger.getLogger(EmployeeWorkspaceController.class.getName());
    private static final DateTimeFormatter DATE_FORMATTER = DateTimeFormatter.ofPattern("MMM dd, yyyy")
            .withZone(ZoneId.systemDefault());

    private final ProjectService projectService = new ProjectService();
    private final EmployeeService employeeService = new EmployeeService();

    @FXML
    private Label welcomeLabel;
    @FXML
    private Label emailLabel;
    @FXML
    private Label avatarLabel;

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
    private Label sectionTitleLabel;
    @FXML
    private Label sectionSubtitleLabel;
    @FXML
    private HBox summaryCardsContainer;
    @FXML
    private VBox sectionListContainer;
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

                return new EmployeeWorkspaceData(currentEmployee, allEmployees, assignedProjects);
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

    private void renderSection(EmployeeWorkspaceData data) {
        if (data == null) {
            updateStatus("No workspace data available.", true);
            return;
        }

        updateWorkStatus(data.currentEmployee());

        if (summaryCardsContainer != null) {
            summaryCardsContainer.getChildren().clear();
        }
        if (sectionListContainer != null) {
            sectionListContainer.getChildren().clear();
        }

        switch (currentSection) {
            case MY_TASKS -> renderMyTasks(data);
            case MY_PROJECTS -> renderMyProjects(data);
            case TIME_SHEET -> renderTimeSheet(data);
            case REQUESTS -> renderRequests(data);
            case DOCUMENTS -> renderDocuments(data);
            case TEAM -> renderTeam(data);
            case PROFILE -> renderProfile(data);
        }

        updateStatus("Showing " + currentSection.displayName + "", false);
    }

    private void renderMyTasks(EmployeeWorkspaceData data) {
        setSectionHeader("My Tasks", "Track your active and upcoming work items.");

        List<Project> tasks = safeList(data.assignedProjects()).stream()
                .filter(project -> project.isActive() || project.isOverdue())
                .sorted(Comparator.comparingLong(this::effectiveDueDate))
                .toList();

        long dueToday = tasks.stream().filter(this::isDueToday).count();
        long overdue = tasks.stream().filter(Project::isOverdue).count();

        addSummaryCard("Tasks", String.valueOf(tasks.size()), "Assigned work items", "summary-card-blue");
        addSummaryCard("Due Today", String.valueOf(dueToday), "Needs attention now", "summary-card-orange");
        addSummaryCard("Overdue", String.valueOf(overdue), "Follow up required", "summary-card-red");

        if (tasks.isEmpty()) {
            addListItem("No assigned tasks", "You are all caught up", "INFO");
            return;
        }

        tasks.stream().limit(8).forEach(project -> addListItem(
                safeProjectName(project),
                formatDueText(project.getEndDate()) + " • Progress " + project.getCompletionPercentage() + "%",
                project.isOverdue() ? "HIGH" : "OPEN"));
    }

    private void renderMyProjects(EmployeeWorkspaceData data) {
        setSectionHeader("My Projects", "Projects where you are assigned as a contributor.");

        List<Project> projects = safeList(data.assignedProjects());
        long active = projects.stream().filter(Project::isActive).count();
        long completed = projects.stream().filter(Project::isCompleted).count();

        addSummaryCard("Assigned", String.valueOf(projects.size()), "All tracked projects", "summary-card-purple");
        addSummaryCard("Active", String.valueOf(active), "In progress now", "summary-card-green");
        addSummaryCard("Completed", String.valueOf(completed), "Delivered projects", "summary-card-blue");

        if (projects.isEmpty()) {
            addListItem("No assigned projects", "Projects will appear here once assigned", "INFO");
            return;
        }

        projects.stream().limit(8).forEach(project -> addListItem(
                safeProjectName(project),
                "Status: " + safeValue(project.getStatus()) + " • Due " + formatDate(project.getEndDate()),
                project.getCompletionPercentage() + "%"));
    }

    private void renderTimeSheet(EmployeeWorkspaceData data) {
        setSectionHeader("Time Sheet", "Your weekly utilization and reporting snapshot.");

        long activeProjects = safeList(data.assignedProjects()).stream().filter(Project::isActive).count();
        int estimatedHours = Math.min(40, (int) activeProjects * 8);
        int remainingHours = Math.max(0, 40 - estimatedHours);

        addSummaryCard("This Week", estimatedHours + "h", "Estimated from active projects", "summary-card-green");
        addSummaryCard("Remaining", remainingHours + "h", "Until 40h weekly target", "summary-card-blue");
        addSummaryCard("Entries", String.valueOf(activeProjects), "Project time slots", "summary-card-purple");

        addListItem("Weekly check-in", "Submit your final timesheet before Friday 6 PM", "REMINDER");
        addListItem("Time allocation", "Split hours across projects based on actual effort", "TIP");
        safeList(data.assignedProjects()).stream().filter(Project::isActive).limit(6)
                .forEach(project -> addListItem(
                        "Log hours: " + safeProjectName(project),
                        "Current progress " + project.getCompletionPercentage() + "%",
                        "PROJECT"));
    }

    private void renderRequests(EmployeeWorkspaceData data) {
        setSectionHeader("Leave Requests", "Review leave status and request guidance.");

        Employee employee = data.currentEmployee();
        String status = employee == null ? "UNKNOWN" : safeValue(employee.getStatus());

        addSummaryCard("Current Status", status, "Employment availability", "summary-card-orange");
        addSummaryCard("Annual Leave", "N/A", "Configured by HR policy", "summary-card-blue");
        addSummaryCard("Pending", "0", "No open leave approvals", "summary-card-purple");

        addListItem("Request process", "Contact HR or your manager to file formal leave requests", "INFO");
        addListItem("Sick leave", "Notify your manager before start of shift when possible", "POLICY");
        addListItem("Status", "Your current recorded status is: " + status, "PROFILE");
    }

    private void renderDocuments(EmployeeWorkspaceData data) {
        setSectionHeader("Documents", "Quick access to employee and project documents.");

        List<Project> projects = safeList(data.assignedProjects());

        addSummaryCard("My Docs", String.valueOf(Math.max(1, projects.size())), "Document groups", "summary-card-blue");
        addSummaryCard("Policies", "3", "Core employee policies", "summary-card-green");
        addSummaryCard("Templates", "2", "Reusable reporting templates", "summary-card-purple");

        addListItem("Employee Handbook", "Company policy and conduct reference", "POLICY");
        addListItem("Timesheet Template", "Weekly template for hour reporting", "TEMPLATE");
        addListItem("Leave Request Template", "Request format for manager/HR approval", "TEMPLATE");

        projects.stream().limit(5).forEach(project -> addListItem(
                "Project Brief: " + safeProjectName(project),
                "Latest update " + formatDate(project.getUpdatedAt()),
                "PROJECT"));
    }

    private void renderTeam(EmployeeWorkspaceData data) {
        setSectionHeader("My Team", "Team members related to your department.");

        Employee currentEmployee = data.currentEmployee();
        String department = currentEmployee == null ? "" : safeLower(currentEmployee.getDepartment());

        List<Employee> teamMembers = safeList(data.allEmployees()).stream()
                .filter(Objects::nonNull)
                .filter(employee -> "ACTIVE".equalsIgnoreCase(safeValue(employee.getStatus())))
                .filter(employee -> !safeValue(employee.getId())
                        .equals(safeValue(currentEmployee == null ? null : currentEmployee.getId())))
                .filter(employee -> department.isBlank() || department.equals(safeLower(employee.getDepartment())))
                .sorted(Comparator.comparing(employee -> safeLower(employee.getFullName())))
                .toList();

        addSummaryCard("Department", department.isBlank() ? "All" : department.toUpperCase(), "Team scope",
                "summary-card-green");
        addSummaryCard("Members", String.valueOf(teamMembers.size()), "Active colleagues", "summary-card-blue");
        addSummaryCard("Shared Projects", String.valueOf(safeList(data.assignedProjects()).size()),
                "Projects in your queue", "summary-card-purple");

        if (teamMembers.isEmpty()) {
            addListItem("No team members found", "No matching active employees in your department", "INFO");
            return;
        }

        teamMembers.stream().limit(10).forEach(member -> addListItem(
                safeValue(member.getFullName()),
                safeValue(member.getPosition()) + " • " + safeValue(member.getEmail()),
                safeValue(member.getStatus())));
    }

    private void renderProfile(EmployeeWorkspaceData data) {
        setSectionHeader("My Profile", "Your employee profile overview.");

        Employee employee = data.currentEmployee();
        if (employee == null) {
            addSummaryCard("Profile", "Unavailable", "No employee record matched your account", "summary-card-red");
            addListItem("Profile not found", "Try reloading from dashboard", "ERROR");
            return;
        }

        addSummaryCard("Department", safeValue(employee.getDepartment()), "Assigned department", "summary-card-green");
        addSummaryCard("Position", safeValue(employee.getPosition()), "Current role", "summary-card-blue");
        addSummaryCard("Status", safeValue(employee.getStatus()), "Employment status", "summary-card-purple");

        addListItem("Name", safeValue(employee.getFullName()), "PROFILE");
        addListItem("Email", safeValue(employee.getEmail()), "CONTACT");
        addListItem("Phone", safeValue(employee.getPhone()), "CONTACT");
        addListItem("Employee ID", safeValue(employee.getId()), "ID");
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

    private void openSection(EmployeeWorkspaceSection section) {
        if (section == null) {
            return;
        }

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
        if (summaryCardsContainer == null || sectionListContainer == null) {
            renderSection(data);
            return;
        }

        FadeTransition fadeOutSummary = new FadeTransition(Duration.millis(110), summaryCardsContainer);
        fadeOutSummary.setFromValue(1.0);
        fadeOutSummary.setToValue(0.25);

        FadeTransition fadeOutList = new FadeTransition(Duration.millis(110), sectionListContainer);
        fadeOutList.setFromValue(1.0);
        fadeOutList.setToValue(0.25);

        ParallelTransition fadeOut = new ParallelTransition(fadeOutSummary, fadeOutList);
        fadeOut.setOnFinished(event -> {
            renderSection(data);

            FadeTransition fadeInSummary = new FadeTransition(Duration.millis(170), summaryCardsContainer);
            fadeInSummary.setFromValue(0.25);
            fadeInSummary.setToValue(1.0);

            FadeTransition fadeInList = new FadeTransition(Duration.millis(170), sectionListContainer);
            fadeInList.setFromValue(0.25);
            fadeInList.setToValue(1.0);

            new ParallelTransition(fadeInSummary, fadeInList).play();
        });

        fadeOut.play();
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

    private String formatDueText(long endDateMillis) {
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
        return "Due in " + dayDiff + " days";
    }

    private String formatDate(long epochMillis) {
        if (epochMillis <= 0) {
            return "N/A";
        }
        return DATE_FORMATTER.format(Instant.ofEpochMilli(epochMillis));
    }

    private void addSummaryCard(String title, String value, String subtitle, String styleClass) {
        if (summaryCardsContainer == null) {
            return;
        }

        VBox card = new VBox(8);
        card.getStyleClass().addAll("summary-card", styleClass);

        Label titleLabel = new Label(title);
        titleLabel.getStyleClass().add("summary-card-title");

        Label valueLabel = new Label(value);
        valueLabel.getStyleClass().add("summary-card-value");

        Label subtitleLabel = new Label(subtitle);
        subtitleLabel.getStyleClass().add("summary-card-subtitle");

        card.getChildren().addAll(titleLabel, valueLabel, subtitleLabel);
        summaryCardsContainer.getChildren().add(card);
    }

    private void addListItem(String title, String meta, String badge) {
        if (sectionListContainer == null) {
            return;
        }

        HBox row = new HBox(12);
        row.getStyleClass().add("section-item");

        VBox content = new VBox(4);
        HBox.setHgrow(content, Priority.ALWAYS);

        Label titleLabel = new Label(title);
        titleLabel.getStyleClass().add("section-item-title");

        Label metaLabel = new Label(meta);
        metaLabel.getStyleClass().add("section-item-meta");

        content.getChildren().addAll(titleLabel, metaLabel);

        Label badgeLabel = new Label(badge);
        badgeLabel.getStyleClass().add("section-item-badge");

        row.getChildren().addAll(content, badgeLabel);
        sectionListContainer.getChildren().add(row);
    }

    private void setSectionHeader(String title, String subtitle) {
        if (sectionTitleLabel != null) {
            sectionTitleLabel.setText(title);
        }
        if (sectionSubtitleLabel != null) {
            sectionSubtitleLabel.setText(subtitle);
        }
    }

    private void updateStatus(String message, boolean error) {
        if (sectionStatusLabel == null) {
            return;
        }

        sectionStatusLabel.setText(message);
        sectionStatusLabel.getStyleClass().removeAll("status-error", "status-ok");
        sectionStatusLabel.getStyleClass().add(error ? "status-error" : "status-ok");
    }

    private void setLoading(boolean loading) {
        if (loadingIndicator != null) {
            loadingIndicator.setVisible(loading);
        }

        setMenuDisabled(loading);
    }

    private void setMenuDisabled(boolean disabled) {
        myTasksButton.setDisable(disabled);
        myProjectsButton.setDisable(disabled);
        timeSheetButton.setDisable(disabled);
        requestsButton.setDisable(disabled);
        documentsButton.setDisable(disabled);
        teamButton.setDisable(disabled);
        profileButton.setDisable(disabled);

        if (backToDashboardButton != null) {
            backToDashboardButton.setDisable(disabled);
        }
    }

    private boolean isCacheStale() {
        return lastLoadedAt <= 0 || (System.currentTimeMillis() - lastLoadedAt) > CACHE_TTL_MILLIS;
    }

    private void updateWorkStatus(Employee employee) {
        if (workStatusTextLabel == null || workStatusTimeLabel == null || workStatusDot == null) {
            return;
        }

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
        myTasksButton.getStyleClass().remove("menu-button-active");
        myProjectsButton.getStyleClass().remove("menu-button-active");
        timeSheetButton.getStyleClass().remove("menu-button-active");
        requestsButton.getStyleClass().remove("menu-button-active");
        documentsButton.getStyleClass().remove("menu-button-active");
        teamButton.getStyleClass().remove("menu-button-active");
        profileButton.getStyleClass().remove("menu-button-active");

        Button activeButton = switch (section) {
            case MY_TASKS -> myTasksButton;
            case MY_PROJECTS -> myProjectsButton;
            case TIME_SHEET -> timeSheetButton;
            case REQUESTS -> requestsButton;
            case DOCUMENTS -> documentsButton;
            case TEAM -> teamButton;
            case PROFILE -> profileButton;
        };

        if (!activeButton.getStyleClass().contains("menu-button-active")) {
            activeButton.getStyleClass().add("menu-button-active");
        }
    }

    private EmployeeWorkspaceSection resolveSection(String sectionName) {
        if (sectionName == null || sectionName.isBlank()) {
            return EmployeeWorkspaceSection.MY_TASKS;
        }

        try {
            return EmployeeWorkspaceSection.valueOf(sectionName);
        } catch (IllegalArgumentException ex) {
            return EmployeeWorkspaceSection.MY_TASKS;
        }
    }

    private String safeValue(String value) {
        return value == null || value.isBlank() ? "N/A" : value;
    }

    private String safeLower(String value) {
        return value == null ? "" : value.trim().toLowerCase();
    }

    private String safeProjectName(Project project) {
        return project.getName() == null || project.getName().isBlank()
                ? "Untitled Project"
                : project.getName();
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
            List<Project> assignedProjects) {
    }

    private enum EmployeeWorkspaceSection {
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
