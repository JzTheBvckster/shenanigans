package com.example.shenanigans.features.dashboard.controller;

import com.example.shenanigans.core.navigation.SidebarComponent;
import com.example.shenanigans.core.navigation.ViewNavigator;
import com.example.shenanigans.core.session.SessionManager;
import com.example.shenanigans.core.theme.ThemeSettingsDialogComponent;
import com.example.shenanigans.features.auth.model.User;
import com.example.shenanigans.features.employees.model.Employee;
import com.example.shenanigans.features.employees.service.EmployeeService;
import com.example.shenanigans.features.finance.model.Invoice;
import com.example.shenanigans.features.finance.service.FinanceService;
import com.example.shenanigans.features.projects.model.Project;
import com.example.shenanigans.features.projects.service.ProjectService;
import java.text.NumberFormat;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.concurrent.ExecutionException;
import java.util.logging.Logger;
import javafx.application.Platform;
import javafx.fxml.FXML;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.control.ProgressBar;
import javafx.scene.control.ProgressIndicator;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.Region;
import javafx.scene.layout.VBox;
import javafx.concurrent.Task;

/**
 * Controller for the main dashboard view. Displays user information and
 * provides navigation to app
 * features.
 */
public class DashboardController {

    private static final Logger LOGGER = Logger.getLogger(DashboardController.class.getName());
    private static final DateTimeFormatter DASHBOARD_DATE_FORMATTER = DateTimeFormatter.ofPattern("MMM dd, yyyy")
            .withZone(ZoneId.systemDefault());
    private static final NumberFormat CURRENCY_FORMATTER = NumberFormat.getCurrencyInstance(Locale.US);

    private SidebarComponent sidebarComponent;
    private final ProjectService projectService = new ProjectService();
    private final EmployeeService employeeService = new EmployeeService();
    private final FinanceService financeService = new FinanceService();

    @FXML
    private Label welcomeLabel;

    @FXML
    private Label roleLabel;

    @FXML
    private Label emailLabel;

    @FXML
    private Label avatarLabel;

    // Sidebar components
    @FXML
    private VBox sidebarContent;

    @FXML
    private Button sidebarToggleButton;

    @FXML
    private Label menuHeaderLabel;

    @FXML
    private VBox mainMenuSection;

    @FXML
    private Label settingsHeaderLabel;

    @FXML
    private VBox settingsSection;

    @FXML
    private Button dashboardButton;

    @FXML
    private Button employeesButton;

    @FXML
    private Button projectsButton;

    @FXML
    private Button financeButton;

    @FXML
    private Button settingsButton;

    @FXML
    private Button logoutButton;

    @FXML
    private VBox systemInfoCard;

    @FXML
    private Label systemInfoTitle;

    @FXML
    private Label systemInfoText;

    // Stats labels
    @FXML
    private Label projectsCountLabel;

    @FXML
    private Label employeesCountLabel;

    @FXML
    private Label tasksCountLabel;

    @FXML
    private Label revenueLabel;

    @FXML
    private ProgressIndicator loadingIndicator;

    @FXML
    private VBox projectsOverviewContainer;

    @FXML
    private VBox activityContainer;

    /** Called automatically after FXML is loaded. */
    @FXML
    public void initialize() {
        // Security check - redirect to login if not authenticated
        if (!SessionManager.getInstance().isLoggedIn()) {
            LOGGER.warning("Unauthorized access attempt to dashboard. Redirecting to login.");
            Platform.runLater(this::redirectToLogin);
            return;
        }

        User user = SessionManager.getInstance().getCurrentUser();

        welcomeLabel.setText("Welcome, " + user.getDisplayName() + "!");
        roleLabel.setText(formatRole(user.getRole()));
        emailLabel.setText(user.getEmail());

        // Set avatar letter
        if (avatarLabel != null && user.getDisplayName() != null && !user.getDisplayName().isEmpty()) {
            avatarLabel.setText(user.getDisplayName().substring(0, 1).toUpperCase());
        }

        // Configure menu based on user role
        configureMenuForRole(user);
        initializeSidebarComponent();

        // Load dashboard data
        loadDashboardData();

        LOGGER.info("DashboardController initialized for user: " + user.getEmail());
    }

    /** Loads dashboard statistics and data. */
    private void loadDashboardData() {
        clearDashboardData();

        if (loadingIndicator != null) {
            loadingIndicator.setVisible(true);
        }

        Task<DashboardData> loadTask = new Task<>() {
            @Override
            protected DashboardData call() throws Exception {
                List<Project> projects = runAndWait(projectService.getAllProjects());
                List<Employee> employees = runAndWait(employeeService.getAllEmployees());
                List<Invoice> invoices = runAndWait(financeService.getAllInvoices());
                return new DashboardData(projects, employees, invoices);
            }
        };

        loadTask.setOnSucceeded(
                event -> {
                    DashboardData data = loadTask.getValue();
                    applyDashboardData(data);
                    if (loadingIndicator != null) {
                        loadingIndicator.setVisible(false);
                    }
                });

        loadTask.setOnFailed(
                event -> {
                    LOGGER.warning("Failed to load dashboard data: " + loadTask.getException());
                    loadProjectsOverview(List.of());
                    loadRecentActivity(List.of(), List.of(), List.of());
                    if (loadingIndicator != null) {
                        loadingIndicator.setVisible(false);
                    }
                });

        Thread thread = new Thread(loadTask, "dashboard-data-loader");
        thread.setDaemon(true);
        thread.start();
    }

    private void clearDashboardData() {
        if (projectsCountLabel != null) {
            projectsCountLabel.setText("0");
        }
        if (employeesCountLabel != null) {
            employeesCountLabel.setText("0");
        }
        if (tasksCountLabel != null) {
            tasksCountLabel.setText("0");
        }
        if (revenueLabel != null) {
            revenueLabel.setText(CURRENCY_FORMATTER.format(0));
        }
        loadProjectsOverview(List.of());
        loadRecentActivity(List.of(), List.of(), List.of());
    }

    private void applyDashboardData(DashboardData data) {
        List<Project> projects = safeList(data.projects());
        List<Employee> employees = safeList(data.employees());
        List<Invoice> invoices = safeList(data.invoices());

        if (projectsCountLabel != null) {
            long activeProjects = projects.stream().filter(Objects::nonNull).filter(Project::isActive).count();
            projectsCountLabel.setText(String.valueOf(activeProjects));
        }

        if (employeesCountLabel != null) {
            employeesCountLabel.setText(String.valueOf(employees.size()));
        }

        if (tasksCountLabel != null) {
            tasksCountLabel.setText(String.valueOf(calculatePendingWorkItems(projects)));
        }

        if (revenueLabel != null) {
            double paidRevenue = invoices.stream()
                    .filter(Objects::nonNull)
                    .filter(Invoice::isPaid)
                    .mapToDouble(Invoice::getAmount)
                    .sum();
            revenueLabel.setText(CURRENCY_FORMATTER.format(paidRevenue));
        }

        loadProjectsOverview(projects);
        loadRecentActivity(projects, employees, invoices);
    }

    /** Loads projects overview data into the container. */
    private void loadProjectsOverview(List<Project> projects) {
        if (projectsOverviewContainer == null)
            return;

        projectsOverviewContainer.getChildren().clear();

        List<Project> topProjects = safeList(projects).stream()
                .filter(Objects::nonNull)
                .sorted(
                        Comparator.comparingLong(
                                (Project project) -> project.getUpdatedAt() > 0 ? project.getUpdatedAt()
                                        : project.getCreatedAt())
                                .reversed())
                .limit(3)
                .toList();

        if (topProjects.isEmpty()) {
            Label empty = new Label("No projects available yet.");
            empty.getStyleClass().add("project-meta");
            projectsOverviewContainer.getChildren().add(empty);
            return;
        }

        for (Project project : topProjects) {
            int remainingUnits = Math.max(0, (100 - project.getCompletionPercentage() + 24) / 25);
            String dueText = formatDueDate(project.getEndDate());
            String meta = dueText + " • " + remainingUnits + " tasks remaining";
            addProjectItem(
                    project.getName() == null || project.getName().isBlank()
                            ? "Untitled Project"
                            : project.getName(),
                    project.getCompletionPercentage(),
                    meta);
        }
    }

    /** Adds a project item to the overview container. */
    private void addProjectItem(String name, double progress, String meta) {
        VBox projectItem = new VBox(8);
        projectItem.getStyleClass().add("project-item");
        projectItem.setPadding(new Insets(16));

        // Header with name and percentage
        HBox header = new HBox();
        header.setAlignment(Pos.CENTER_LEFT);
        Label nameLabel = new Label(name);
        nameLabel.getStyleClass().add("project-name");
        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);
        Label percentLabel = new Label(String.format("%.0f%%", progress));
        percentLabel.getStyleClass().add("project-percentage");
        header.getChildren().addAll(nameLabel, spacer, percentLabel);

        // Progress bar
        ProgressBar progressBar = new ProgressBar(progress / 100.0);
        progressBar.getStyleClass().add("project-progress-bar");
        progressBar.setMaxWidth(Double.MAX_VALUE);

        // Meta info
        Label metaLabel = new Label(meta);
        metaLabel.getStyleClass().add("project-meta");

        projectItem.getChildren().addAll(header, progressBar, metaLabel);
        projectsOverviewContainer.getChildren().add(projectItem);
    }

    /** Loads recent activity feed. */
    private void loadRecentActivity(
            List<Project> projects, List<Employee> employees, List<Invoice> invoices) {
        if (activityContainer == null)
            return;

        activityContainer.getChildren().clear();

        List<ActivityEntry> activityEntries = new ArrayList<>();

        safeList(projects).stream()
                .filter(Objects::nonNull)
                .forEach(
                        project -> {
                            long timestamp = project.getCreatedAt() > 0 ? project.getCreatedAt()
                                    : project.getUpdatedAt();
                            String name = project.getName() == null || project.getName().isBlank()
                                    ? "Untitled Project"
                                    : project.getName();
                            activityEntries.add(
                                    new ActivityEntry("Project updated: " + name, timestamp, "blue"));
                        });

        safeList(employees).stream()
                .filter(Objects::nonNull)
                .forEach(
                        employee -> activityEntries.add(
                                new ActivityEntry(
                                        "Employee added: " + employee.getFullName(), employee.getCreatedAt(),
                                        "orange")));

        safeList(invoices).stream()
                .filter(Objects::nonNull)
                .forEach(
                        invoice -> activityEntries.add(
                                new ActivityEntry(
                                        invoice.isPaid()
                                                ? "Invoice paid: " + invoice.getId()
                                                : "Invoice issued: " + invoice.getId(),
                                        invoice.getIssuedAt(),
                                        invoice.isPaid() ? "green" : "blue")));

        activityEntries.stream()
                .filter(activity -> activity.timestamp() > 0)
                .sorted(Comparator.comparingLong(ActivityEntry::timestamp).reversed())
                .limit(5)
                .forEach(
                        activity -> addActivityItem(
                                activity.title(), formatRelativeTime(activity.timestamp()), activity.color()));

        if (activityContainer.getChildren().isEmpty()) {
            addActivityItem("No recent activity", "Just now", "blue");
        }
    }

    /** Adds an activity item to the feed. */
    private void addActivityItem(String title, String time, String color) {
        HBox activityItem = new HBox(12);
        activityItem.getStyleClass().add("activity-item");
        activityItem.setAlignment(Pos.CENTER_LEFT);
        activityItem.setPadding(new Insets(12, 16, 12, 16));

        // Activity dot
        Region dot = new Region();
        dot.getStyleClass().addAll("activity-dot", "activity-dot-" + color);

        // Content
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

    /** Handles adding a new employee. */
    @FXML
    private void handleAddEmployee() {
        if (!checkAuth())
            return;
        LOGGER.info("Opening Add Employee dialog");
        navigateTo("features/employees/view/employee_view");
    }

    /** Handles adding a new project. */
    @FXML
    private void handleAddProject() {
        if (!checkAuth())
            return;
        LOGGER.info("Opening Add Project dialog");
        navigateTo("features/projects/view/project_view");
    }

    /**
     * Handles sidebar toggle button click. Animates the sidebar to collapse or
     * expand with slide
     * effect. When collapsed, icons remain visible and clickable.
     */
    @FXML
    private void handleSidebarToggle() {
        if (sidebarComponent != null) {
            sidebarComponent.toggle();
        }
    }

    /** Redirects unauthenticated users to the login screen. */
    private void redirectToLogin() {
        ViewNavigator.redirectToLogin(LOGGER);
    }

    /** Handles navigation to Employees section. */
    @FXML
    private void handleEmployees() {
        if (!checkAuth())
            return;
        LOGGER.info("Navigating to Employees");
        navigateTo("features/employees/view/employee_view");
    }

    /** Handles navigation to Projects section. */
    @FXML
    private void handleProjects() {
        if (!checkAuth())
            return;
        LOGGER.info("Navigating to Projects");
        navigateTo("features/projects/view/project_view");
    }

    /** Handles navigation to Finance section. */
    @FXML
    private void handleFinance() {
        if (!checkAuth())
            return;
        LOGGER.info("Opening Finance");
        navigateTo("features/finance/view/finance_view");
    }

    /** Handles navigation to Settings. */
    @FXML
    private void handleSettings() {
        if (!checkAuth())
            return;

        ThemeSettingsDialogComponent.showDarkModeDialog(
                () -> {
                    if (sidebarComponent != null) {
                        sidebarComponent.refreshIconsForTheme();
                    }
                });
    }

    private void initializeSidebarComponent() {
        sidebarComponent = new SidebarComponent(
                LOGGER,
                sidebarContent,
                sidebarToggleButton,
                menuHeaderLabel,
                settingsHeaderLabel,
                systemInfoCard,
                new Button[] {
                        dashboardButton, employeesButton, projectsButton, financeButton, settingsButton
                },
                new String[] { "Dashboard", "Employees", "Projects", "Finance", "Settings" });
        sidebarComponent.initialize();
    }

    /** Handles user logout. */
    @FXML
    private void handleLogout() {
        LOGGER.info("User logging out");
        SessionManager.getInstance().clearSession();

        // Navigate back to auth view
        redirectToLogin();
    }

    /**
     * Checks if user is authenticated. Redirects to login if not.
     *
     * @return true if authenticated, false otherwise
     */
    private boolean checkAuth() {
        if (!SessionManager.getInstance().isLoggedIn()) {
            LOGGER.warning("Session expired or invalid. Redirecting to login.");
            redirectToLogin();
            return false;
        }
        return true;
    }

    /**
     * Navigates to a specific view.
     *
     * @param fxml The FXML path (without .fxml extension)
     */
    private void navigateTo(String fxml) {
        ViewNavigator.navigateTo(fxml, LOGGER);
    }

    /** Configures menu visibility based on user role. */
    private void configureMenuForRole(User user) {
        // Redirect employees to their own dashboard
        if (user.isEmployee()) {
            Platform.runLater(
                    () -> navigateTo("features/employee_dashboard/view/employee_dashboard_view"));
            return;
        }

        if (user.isManagingDirector()) {
            // Managing Directors have access to all features
            financeButton.setVisible(true);
            financeButton.setManaged(true);
        } else {
            // Project Managers have limited access
            financeButton.setVisible(false);
            financeButton.setManaged(false);
        }
    }

    /** Formats the role for display. */
    private String formatRole(String role) {
        if (role == null)
            return "";
        return switch (role) {
            case "MANAGING_DIRECTOR" -> "Managing Director";
            case "PROJECT_MANAGER" -> "Project Manager";
            case "EMPLOYEE" -> "Employee";
            default -> role;
        };
    }

    private int calculatePendingWorkItems(List<Project> projects) {
        return safeList(projects).stream()
                .filter(Objects::nonNull)
                .filter(project -> !project.isCompleted())
                .mapToInt(project -> Math.max(0, (100 - project.getCompletionPercentage() + 24) / 25))
                .sum();
    }

    private String formatDueDate(long endDateMillis) {
        if (endDateMillis <= 0) {
            return "No due date";
        }

        LocalDate dueDate = Instant.ofEpochMilli(endDateMillis).atZone(ZoneId.systemDefault()).toLocalDate();
        LocalDate today = LocalDate.now();
        long days = ChronoUnit.DAYS.between(today, dueDate);

        if (days < 0) {
            return "Overdue by " + Math.abs(days) + " day" + (Math.abs(days) == 1 ? "" : "s");
        }
        if (days == 0) {
            return "Due today";
        }
        if (days == 1) {
            return "Due tomorrow";
        }
        if (days <= 30) {
            return "Due in " + days + " days";
        }
        return "Due " + DASHBOARD_DATE_FORMATTER.format(Instant.ofEpochMilli(endDateMillis));
    }

    private String formatRelativeTime(long epochMillis) {
        Duration duration = Duration.between(Instant.ofEpochMilli(epochMillis), Instant.now());
        long minutes = Math.max(0, duration.toMinutes());

        if (minutes < 1) {
            return "Just now";
        }
        if (minutes < 60) {
            return minutes + " minute" + (minutes == 1 ? "" : "s") + " ago";
        }

        long hours = duration.toHours();
        if (hours < 24) {
            return hours + " hour" + (hours == 1 ? "" : "s") + " ago";
        }

        long days = duration.toDays();
        if (days < 7) {
            return days + " day" + (days == 1 ? "" : "s") + " ago";
        }

        return DASHBOARD_DATE_FORMATTER.format(Instant.ofEpochMilli(epochMillis));
    }

    private <T> List<T> safeList(List<T> input) {
        return input == null ? List.of() : input;
    }

    private <T> List<T> runAndWait(Task<List<T>> task) throws Exception {
        Thread worker = new Thread(task);
        worker.setDaemon(true);
        worker.start();

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

    private record DashboardData(
            List<Project> projects, List<Employee> employees, List<Invoice> invoices) {
    }

    private record ActivityEntry(String title, long timestamp, String color) {
    }
}
