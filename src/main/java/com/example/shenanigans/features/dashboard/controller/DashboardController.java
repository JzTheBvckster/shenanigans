package com.example.shenanigans.features.dashboard.controller;

import com.example.shenanigans.core.navigation.SidebarComponent;
import com.example.shenanigans.core.navigation.ViewNavigator;
import com.example.shenanigans.core.session.SessionManager;
import com.example.shenanigans.core.theme.ThemeSettingsDialogComponent;
import com.example.shenanigans.features.auth.model.User;
import com.example.shenanigans.features.auth.service.AuthService;
import com.example.shenanigans.features.employees.model.Employee;
import com.example.shenanigans.features.employees.service.EmployeeService;
import com.example.shenanigans.features.finance.model.Invoice;
import com.example.shenanigans.features.finance.service.FinanceService;
import com.example.shenanigans.features.projects.model.Project;
import com.example.shenanigans.features.projects.service.ProjectService;
import javafx.animation.FadeTransition;
import javafx.animation.PauseTransition;
import javafx.animation.SequentialTransition;
import java.text.NumberFormat;
import java.time.YearMonth;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ExecutionException;
import java.util.logging.Logger;
import javafx.application.Platform;
import javafx.collections.FXCollections;
import javafx.fxml.FXML;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.Node;
import javafx.scene.chart.CategoryAxis;
import javafx.scene.chart.LineChart;
import javafx.scene.chart.NumberAxis;
import javafx.scene.chart.PieChart;
import javafx.scene.chart.XYChart;
import javafx.scene.control.Button;
import javafx.scene.control.ComboBox;
import javafx.scene.control.Label;
import javafx.scene.control.ProgressBar;
import javafx.scene.control.ProgressIndicator;
import javafx.scene.control.Tooltip;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.Region;
import javafx.scene.layout.VBox;
import javafx.stage.Popup;
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
    private final AuthService authService = new AuthService();

    @FXML
    private Label welcomeLabel;

    @FXML
    private Label roleLabel;

    @FXML
    private Label emailLabel;

    @FXML
    private Label avatarLabel;

    @FXML
    private Button notificationButton;

    @FXML
    private Label notificationCountLabel;

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

    @FXML
    private VBox approvalQueueCard;

    @FXML
    private VBox approvalQueueContainer;

    @FXML
    private Label approvalQueueEmptyLabel;

    @FXML
    private Label approvalQueueTitleLabel;

    @FXML
    private Label toastLabel;

    @FXML
    private Label portfolioHealthLabel;

    @FXML
    private Label collectionRateLabel;

    @FXML
    private Label overdueProjectsLabel;

    @FXML
    private Label avgProjectProgressLabel;

    @FXML
    private Label lastSyncLabel;

    @FXML
    private ProgressBar portfolioProgressBar;

    @FXML
    private Label onTrackProjectsLabel;

    @FXML
    private Label atRiskProjectsLabel;

    @FXML
    private Label openInvoicesLabel;

    @FXML
    private LineChart<String, Number> revenueTrendChart;

    @FXML
    private CategoryAxis revenueTrendXAxis;

    @FXML
    private NumberAxis revenueTrendYAxis;

    @FXML
    private PieChart projectStatusChart;

    @FXML
    private ComboBox<String> chartRangeFilter;

    @FXML
    private ComboBox<String> revenueModeFilter;

    @FXML
    private Label insightSelectionLabel;

    @FXML
    private Label insightSummaryLabel;

    @FXML
    private Label insightRevenueValueLabel;

    @FXML
    private Label insightInvoiceCountLabel;

    @FXML
    private Label insightProjectCountLabel;

    @FXML
    private VBox insightHighlightsContainer;

    private List<Project> latestProjects = List.of();
    private List<Invoice> latestInvoices = List.of();
    private List<User> pendingApprovals = List.of();
    private Popup notificationPopup;
    private VBox notificationPopupContent;

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
        initializeAnalyticsFilters();
        initializeNotificationUi();

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
        if (portfolioHealthLabel != null) {
            portfolioHealthLabel.setText("0%");
        }
        if (collectionRateLabel != null) {
            collectionRateLabel.setText("0%");
        }
        if (overdueProjectsLabel != null) {
            overdueProjectsLabel.setText("0");
        }
        if (avgProjectProgressLabel != null) {
            avgProjectProgressLabel.setText("0%");
        }
        if (portfolioProgressBar != null) {
            portfolioProgressBar.setProgress(0);
        }
        if (lastSyncLabel != null) {
            lastSyncLabel.setText("Sync pending");
        }
        if (onTrackProjectsLabel != null) {
            onTrackProjectsLabel.setText("0");
        }
        if (atRiskProjectsLabel != null) {
            atRiskProjectsLabel.setText("0");
        }
        if (openInvoicesLabel != null) {
            openInvoicesLabel.setText("0");
        }
        if (revenueTrendChart != null) {
            revenueTrendChart.getData().clear();
        }
        if (projectStatusChart != null) {
            projectStatusChart.setData(FXCollections.observableArrayList());
        }
        if (approvalQueueContainer != null) {
            approvalQueueContainer.getChildren().clear();
        }
        if (approvalQueueEmptyLabel != null) {
            approvalQueueEmptyLabel.setVisible(false);
            approvalQueueEmptyLabel.setManaged(false);
        }
        setNotificationCount(0);
        resetDrilldownPanel();
        loadProjectsOverview(List.of());
        loadRecentActivity(List.of(), List.of(), List.of());
    }

    private void initializeNotificationUi() {
        if (notificationButton != null) {
            notificationButton.setTooltip(new Tooltip("Pending approvals"));
        }
        if (toastLabel != null) {
            toastLabel.setVisible(false);
            toastLabel.setManaged(false);
        }
        initializeNotificationPopup();
        setNotificationCount(0);
    }

    private void initializeNotificationPopup() {
        notificationPopupContent = new VBox(8);
        notificationPopupContent.getStyleClass().add("notification-dropdown");

        notificationPopup = new Popup();
        notificationPopup.setAutoHide(true);
        notificationPopup.getContent().add(notificationPopupContent);
    }

    private void applyDashboardData(DashboardData data) {
        List<Project> projects = safeList(data.projects());
        List<Employee> employees = safeList(data.employees());
        List<Invoice> invoices = safeList(data.invoices());

        latestProjects = projects;
        latestInvoices = invoices;

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

        applyModernInsights(projects, invoices);
        applyAnalyticsCharts(projects, invoices);

        loadProjectsOverview(projects);
        loadRecentActivity(projects, employees, invoices);
    }

    private void applyModernInsights(List<Project> projects, List<Invoice> invoices) {
        long projectCount = safeList(projects).stream().filter(Objects::nonNull).count();
        long completedProjects = safeList(projects).stream()
                .filter(Objects::nonNull)
                .filter(Project::isCompleted)
                .count();
        long overdueProjects = safeList(projects).stream()
                .filter(Objects::nonNull)
                .filter(Project::isOverdue)
                .count();

        int avgProgressPercent = projectCount == 0
                ? 0
                : (int) Math.round(
                        safeList(projects).stream()
                                .filter(Objects::nonNull)
                                .mapToInt(Project::getCompletionPercentage)
                                .average()
                                .orElse(0));

        double totalInvoiceAmount = safeList(invoices).stream()
                .filter(Objects::nonNull)
                .mapToDouble(Invoice::getAmount)
                .sum();
        double paidInvoiceAmount = safeList(invoices).stream()
                .filter(Objects::nonNull)
                .filter(Invoice::isPaid)
                .mapToDouble(Invoice::getAmount)
                .sum();
        int collectionRate = totalInvoiceAmount <= 0
                ? 0
                : (int) Math.round((paidInvoiceAmount / totalInvoiceAmount) * 100);

        int portfolioHealth = projectCount == 0
                ? 0
                : (int) Math.round((completedProjects * 100.0) / projectCount);

        if (portfolioHealthLabel != null) {
            portfolioHealthLabel.setText(portfolioHealth + "%");
        }
        if (collectionRateLabel != null) {
            collectionRateLabel.setText(collectionRate + "%");
        }
        if (overdueProjectsLabel != null) {
            overdueProjectsLabel.setText(String.valueOf(overdueProjects));
        }
        if (avgProjectProgressLabel != null) {
            avgProjectProgressLabel.setText(avgProgressPercent + "%");
        }
        if (portfolioProgressBar != null) {
            portfolioProgressBar.setProgress(Math.max(0, Math.min(1, avgProgressPercent / 100.0)));
        }
        if (lastSyncLabel != null) {
            lastSyncLabel.setText("Synced " + formatRelativeTime(System.currentTimeMillis()));
        }

        long onTrackProjects = safeList(projects).stream()
                .filter(Objects::nonNull)
                .filter(project -> !project.isCompleted())
                .filter(project -> !project.isOverdue())
                .count();
        long atRiskProjects = safeList(projects).stream()
                .filter(Objects::nonNull)
                .filter(project -> project.isOverdue() || project.getCompletionPercentage() < 35)
                .count();
        long openInvoices = safeList(invoices).stream()
                .filter(Objects::nonNull)
                .filter(invoice -> !invoice.isPaid())
                .count();

        if (onTrackProjectsLabel != null) {
            onTrackProjectsLabel.setText(String.valueOf(onTrackProjects));
        }
        if (atRiskProjectsLabel != null) {
            atRiskProjectsLabel.setText(String.valueOf(atRiskProjects));
        }
        if (openInvoicesLabel != null) {
            openInvoicesLabel.setText(String.valueOf(openInvoices));
        }
    }

    private void applyAnalyticsCharts(List<Project> projects, List<Invoice> invoices) {
        updateRevenueTrendChart(invoices);
        updateProjectStatusChart(projects);
        showOverviewDrilldown(projects, invoices);
    }

    private void initializeAnalyticsFilters() {
        if (chartRangeFilter != null) {
            chartRangeFilter.setItems(FXCollections.observableArrayList("3M", "6M", "12M"));
            chartRangeFilter.setValue("6M");
        }

        if (revenueModeFilter != null) {
            revenueModeFilter.setItems(FXCollections.observableArrayList("Paid", "Total"));
            revenueModeFilter.setValue("Paid");
        }
    }

    @FXML
    private void handleAnalyticsFilterChange() {
        applyAnalyticsCharts(safeList(latestProjects), safeList(latestInvoices));
    }

    private void updateRevenueTrendChart(List<Invoice> invoices) {
        if (revenueTrendChart == null) {
            return;
        }

        Map<YearMonth, Double> monthlyRevenue = new LinkedHashMap<>();
        YearMonth currentMonth = YearMonth.now();
        int monthWindow = resolveChartRangeMonths();
        for (int index = monthWindow - 1; index >= 0; index--) {
            monthlyRevenue.put(currentMonth.minusMonths(index), 0.0);
        }

        boolean paidOnly = isPaidRevenueMode();
        safeList(invoices).stream()
                .filter(Objects::nonNull)
                .filter(invoice -> !paidOnly || invoice.isPaid())
                .filter(invoice -> invoice.getIssuedAt() > 0)
                .forEach(invoice -> {
                    YearMonth month = YearMonth
                            .from(Instant.ofEpochMilli(invoice.getIssuedAt()).atZone(ZoneId.systemDefault()));
                    if (monthlyRevenue.containsKey(month)) {
                        monthlyRevenue.put(month, monthlyRevenue.get(month) + Math.max(0, invoice.getAmount()));
                    }
                });

        XYChart.Series<String, Number> series = new XYChart.Series<>();
        monthlyRevenue.forEach(
                (month, amount) -> {
                    XYChart.Data<String, Number> point = new XYChart.Data<>(
                            month.format(DateTimeFormatter.ofPattern("MMM")), amount);
                    point.setExtraValue(month);
                    series.getData().add(point);
                });

        revenueTrendChart.getData().clear();
        revenueTrendChart.getData().add(series);
        if (revenueTrendXAxis != null) {
            revenueTrendXAxis.setLabel("Month");
        }
        if (revenueTrendYAxis != null) {
            revenueTrendYAxis.setLabel(paidOnly ? "Collected Revenue" : "Issued Revenue");
            revenueTrendYAxis.setForceZeroInRange(true);
        }

        attachRevenuePointHandlers(series);
    }

    private int resolveChartRangeMonths() {
        if (chartRangeFilter == null || chartRangeFilter.getValue() == null) {
            return 6;
        }

        return switch (chartRangeFilter.getValue()) {
            case "3M" -> 3;
            case "12M" -> 12;
            default -> 6;
        };
    }

    private boolean isPaidRevenueMode() {
        return revenueModeFilter == null || revenueModeFilter.getValue() == null
                || "Paid".equalsIgnoreCase(revenueModeFilter.getValue());
    }

    private void updateProjectStatusChart(List<Project> projects) {
        if (projectStatusChart == null) {
            return;
        }

        Map<String, Integer> statusCounts = new LinkedHashMap<>();
        statusCounts.put("In Progress", 0);
        statusCounts.put("Completed", 0);
        statusCounts.put("Planning", 0);
        statusCounts.put("At Risk", 0);

        safeList(projects).stream()
                .filter(Objects::nonNull)
                .forEach(project -> {
                    if (project.isOverdue()) {
                        statusCounts.put("At Risk", statusCounts.get("At Risk") + 1);
                        return;
                    }

                    String status = project.getStatus() == null ? "" : project.getStatus().trim();
                    switch (status) {
                        case "COMPLETED" -> statusCounts.put("Completed", statusCounts.get("Completed") + 1);
                        case "IN_PROGRESS" -> statusCounts.put("In Progress", statusCounts.get("In Progress") + 1);
                        default -> statusCounts.put("Planning", statusCounts.get("Planning") + 1);
                    }
                });

        List<PieChart.Data> pieData = new ArrayList<>();
        statusCounts.forEach((label, value) -> {
            if (value > 0) {
                pieData.add(new PieChart.Data(label, value));
            }
        });

        if (pieData.isEmpty()) {
            pieData.add(new PieChart.Data("No Data", 1));
        }

        projectStatusChart.setData(FXCollections.observableArrayList(pieData));
        attachProjectStatusHandlers();
    }

    private void attachRevenuePointHandlers(XYChart.Series<String, Number> series) {
        Platform.runLater(
                () -> {
                    for (XYChart.Data<String, Number> dataPoint : series.getData()) {
                        Node node = dataPoint.getNode();
                        if (node == null) {
                            continue;
                        }

                        node.setOnMouseClicked(
                                event -> {
                                    Object rawMonth = dataPoint.getExtraValue();
                                    if (rawMonth instanceof YearMonth month) {
                                        showMonthDrilldown(month);
                                    }
                                });
                    }
                });
    }

    private void attachProjectStatusHandlers() {
        if (projectStatusChart == null) {
            return;
        }

        Platform.runLater(
                () -> {
                    for (PieChart.Data slice : projectStatusChart.getData()) {
                        Node node = slice.getNode();
                        if (node == null) {
                            continue;
                        }

                        node.setOnMouseClicked(event -> showStatusDrilldown(slice.getName()));
                    }
                });
    }

    private void showOverviewDrilldown(List<Project> projects, List<Invoice> invoices) {
        if (insightSelectionLabel != null) {
            insightSelectionLabel.setText("Overview");
        }

        double totalRevenue = safeList(invoices).stream()
                .filter(Objects::nonNull)
                .mapToDouble(Invoice::getAmount)
                .sum();
        int invoiceCount = safeList(invoices).size();
        int projectCount = safeList(projects).size();

        if (insightSummaryLabel != null) {
            insightSummaryLabel.setText("Summary of current data scope across projects and invoices.");
        }
        if (insightRevenueValueLabel != null) {
            insightRevenueValueLabel.setText(CURRENCY_FORMATTER.format(totalRevenue));
        }
        if (insightInvoiceCountLabel != null) {
            insightInvoiceCountLabel.setText(String.valueOf(invoiceCount));
        }
        if (insightProjectCountLabel != null) {
            insightProjectCountLabel.setText(String.valueOf(projectCount));
        }

        setInsightHighlights(
                List.of(
                        "• Click a revenue point to inspect that month.",
                        "• Click a status slice to inspect related projects.",
                        "• Use range/revenue filters for deeper analysis."));
    }

    private void showMonthDrilldown(YearMonth month) {
        List<Invoice> monthInvoices = safeList(latestInvoices).stream()
                .filter(Objects::nonNull)
                .filter(invoice -> invoice.getIssuedAt() > 0)
                .filter(invoice -> YearMonth
                        .from(Instant.ofEpochMilli(invoice.getIssuedAt()).atZone(ZoneId.systemDefault()))
                        .equals(month))
                .toList();

        double monthRevenue = monthInvoices.stream().mapToDouble(Invoice::getAmount).sum();
        long paidCount = monthInvoices.stream().filter(Invoice::isPaid).count();
        List<Project> monthProjects = safeList(latestProjects).stream()
                .filter(Objects::nonNull)
                .filter(project -> wasProjectActiveInMonth(project, month))
                .toList();

        if (insightSelectionLabel != null) {
            insightSelectionLabel.setText(month.format(DateTimeFormatter.ofPattern("MMM yyyy")));
        }
        if (insightSummaryLabel != null) {
            insightSummaryLabel.setText("Monthly breakdown for selected revenue data point.");
        }
        if (insightRevenueValueLabel != null) {
            insightRevenueValueLabel.setText(CURRENCY_FORMATTER.format(monthRevenue));
        }
        if (insightInvoiceCountLabel != null) {
            insightInvoiceCountLabel.setText(monthInvoices.size() + " (" + paidCount + " paid)");
        }
        if (insightProjectCountLabel != null) {
            insightProjectCountLabel.setText(String.valueOf(monthProjects.size()));
        }

        List<String> highlights = new ArrayList<>();
        monthInvoices.stream().limit(3).forEach(invoice -> highlights
                .add("• " + safeInvoiceId(invoice) + " • " + CURRENCY_FORMATTER.format(invoice.getAmount())));
        if (highlights.isEmpty()) {
            highlights.add("• No invoice records for this month.");
        }
        setInsightHighlights(highlights);
    }

    private void showStatusDrilldown(String statusLabel) {
        List<Project> statusProjects = safeList(latestProjects).stream()
                .filter(Objects::nonNull)
                .filter(project -> matchesStatusBucket(project, statusLabel))
                .toList();

        double avgProgress = statusProjects.stream()
                .mapToInt(Project::getCompletionPercentage)
                .average()
                .orElse(0);

        if (insightSelectionLabel != null) {
            insightSelectionLabel.setText(statusLabel);
        }
        if (insightSummaryLabel != null) {
            insightSummaryLabel.setText("Project segment details for selected status slice.");
        }
        if (insightRevenueValueLabel != null) {
            insightRevenueValueLabel.setText(String.format("Avg %,.0f%%", avgProgress));
        }
        if (insightInvoiceCountLabel != null) {
            insightInvoiceCountLabel.setText("-");
        }
        if (insightProjectCountLabel != null) {
            insightProjectCountLabel.setText(String.valueOf(statusProjects.size()));
        }

        List<String> highlights = new ArrayList<>();
        statusProjects.stream().limit(3).forEach(project -> highlights.add("• " + safeProjectName(project)
                + " • " + project.getCompletionPercentage() + "%"));
        if (highlights.isEmpty()) {
            highlights.add("• No projects in this segment.");
        }
        setInsightHighlights(highlights);
    }

    private boolean matchesStatusBucket(Project project, String statusLabel) {
        return switch (statusLabel) {
            case "At Risk" -> project.isOverdue();
            case "Completed" -> project.isCompleted();
            case "In Progress" -> "IN_PROGRESS".equals(project.getStatus()) && !project.isOverdue();
            case "Planning" -> !project.isOverdue()
                    && !project.isCompleted()
                    && !"IN_PROGRESS".equals(project.getStatus());
            default -> false;
        };
    }

    private boolean wasProjectActiveInMonth(Project project, YearMonth month) {
        long updatedAt = project.getUpdatedAt() > 0 ? project.getUpdatedAt() : project.getCreatedAt();
        if (updatedAt <= 0) {
            return false;
        }
        YearMonth projectMonth = YearMonth.from(Instant.ofEpochMilli(updatedAt).atZone(ZoneId.systemDefault()));
        return projectMonth.equals(month);
    }

    private void setInsightHighlights(List<String> items) {
        if (insightHighlightsContainer == null) {
            return;
        }

        insightHighlightsContainer.getChildren().clear();
        for (String item : items) {
            Label label = new Label(item);
            label.getStyleClass().add("insight-highlight-item");
            insightHighlightsContainer.getChildren().add(label);
        }
    }

    private String safeInvoiceId(Invoice invoice) {
        if (invoice.getId() == null || invoice.getId().isBlank()) {
            return "Invoice";
        }
        return invoice.getId();
    }

    private String safeProjectName(Project project) {
        if (project.getName() == null || project.getName().isBlank()) {
            return "Untitled Project";
        }
        return project.getName();
    }

    private void resetDrilldownPanel() {
        if (insightSelectionLabel != null) {
            insightSelectionLabel.setText("Overview");
        }
        if (insightSummaryLabel != null) {
            insightSummaryLabel.setText("Select a chart point or pie slice to inspect details.");
        }
        if (insightRevenueValueLabel != null) {
            insightRevenueValueLabel.setText(CURRENCY_FORMATTER.format(0));
        }
        if (insightInvoiceCountLabel != null) {
            insightInvoiceCountLabel.setText("0");
        }
        if (insightProjectCountLabel != null) {
            insightProjectCountLabel.setText("0");
        }
        setInsightHighlights(List.of("• Waiting for analytics data..."));
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
                .limit(3)
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

    private void loadPendingApprovals() {
        Task<List<User>> approvalsTask = authService.getPendingManagingDirectorApprovals();

        approvalsTask.setOnSucceeded(event -> {
            pendingApprovals = safeList(approvalsTask.getValue());
            renderApprovalQueue();
            setNotificationCount(pendingApprovals.size());
            refreshNotificationPopupPreview();
        });

        approvalsTask.setOnFailed(event -> {
            LOGGER.warning("Failed to load pending approvals: " + approvalsTask.getException());
            pendingApprovals = List.of();
            renderApprovalQueue();
            setNotificationCount(0);
            refreshNotificationPopupPreview();
            showToast("Could not refresh approvals", true);
        });

        Thread thread = new Thread(approvalsTask, "dashboard-approval-loader");
        thread.setDaemon(true);
        thread.start();
    }

    private void renderApprovalQueue() {
        if (approvalQueueContainer == null || approvalQueueEmptyLabel == null) {
            return;
        }

        approvalQueueContainer.getChildren().clear();
        if (approvalQueueTitleLabel != null) {
            approvalQueueTitleLabel.setText("Approval Queue (" + pendingApprovals.size() + ")");
        }

        if (pendingApprovals.isEmpty()) {
            approvalQueueEmptyLabel.setVisible(true);
            approvalQueueEmptyLabel.setManaged(true);
            return;
        }

        approvalQueueEmptyLabel.setVisible(false);
        approvalQueueEmptyLabel.setManaged(false);

        pendingApprovals.forEach(user -> {
            VBox queueItem = new VBox(8);
            queueItem.getStyleClass().add("approval-item");

            Label nameLabel = new Label(resolveDisplayName(user));
            nameLabel.getStyleClass().add("approval-item-title");

            Label metaLabel = new Label((user.getRole() == null ? "User" : formatRole(user.getRole()))
                    + " • " + (user.getEmail() == null ? "No email" : user.getEmail()));
            metaLabel.getStyleClass().add("approval-item-meta");

            Button approveButton = new Button("Approve");
            approveButton.getStyleClass().add("approve-button");
            approveButton.setOnAction(event -> approvePendingUser(user, approveButton));

            queueItem.getChildren().addAll(nameLabel, metaLabel, approveButton);
            approvalQueueContainer.getChildren().add(queueItem);
        });
    }

    private String resolveDisplayName(User user) {
        if (user == null || user.getDisplayName() == null || user.getDisplayName().isBlank()) {
            return "Unnamed User";
        }
        return user.getDisplayName();
    }

    private void approvePendingUser(User user, Button approveButton) {
        if (user == null || SessionManager.getInstance().getCurrentUser() == null) {
            return;
        }

        approveButton.setDisable(true);
        approveButton.setText("Approving...");

        String approverUid = SessionManager.getInstance().getCurrentUser().getUid();
        Task<Void> approveTask = authService.approveUserByManagingDirector(user.getUid(), approverUid);

        approveTask.setOnSucceeded(event -> {
            showToast("Approved " + resolveDisplayName(user), false);
            if (notificationPopup != null && notificationPopup.isShowing()) {
                notificationPopup.hide();
            }
            loadPendingApprovals();
        });

        approveTask.setOnFailed(event -> {
            LOGGER.warning("Failed to approve user " + user.getUid() + ": " + approveTask.getException());
            approveButton.setDisable(false);
            approveButton.setText("Approve");
            showToast("Approval failed. Try again.", true);
        });

        Thread thread = new Thread(approveTask, "dashboard-approve-user");
        thread.setDaemon(true);
        thread.start();
    }

    @FXML
    private void handleRefreshApprovals() {
        if (!checkAuth()) {
            return;
        }

        User currentUser = SessionManager.getInstance().getCurrentUser();
        if (currentUser == null || !currentUser.isManagingDirector()) {
            showToast("Approvals are available for Managing Directors only.", true);
            return;
        }

        loadPendingApprovals();
        showToast("Approval notifications refreshed", false);
    }

    @FXML
    private void handleNotificationClick() {
        if (!checkAuth()) {
            return;
        }

        User currentUser = SessionManager.getInstance().getCurrentUser();
        if (currentUser == null || !currentUser.isManagingDirector()) {
            showToast("Approvals are available for Managing Directors only.", true);
            return;
        }

        if (notificationPopup != null && notificationPopup.isShowing()) {
            notificationPopup.hide();
            return;
        }

        renderNotificationPopupPreview(true);
        showNotificationPopup();
        loadPendingApprovals();
    }

    private void showNotificationPopup() {
        if (notificationPopup == null || notificationButton == null) {
            return;
        }

        double x = notificationButton.localToScreen(notificationButton.getBoundsInLocal()).getMinX() - 248;
        double y = notificationButton.localToScreen(notificationButton.getBoundsInLocal()).getMaxY() + 8;
        notificationPopup.show(notificationButton, x, y);
    }

    private void refreshNotificationPopupPreview() {
        if (notificationPopup == null || !notificationPopup.isShowing()) {
            return;
        }

        renderNotificationPopupPreview(false);
    }

    private void renderNotificationPopupPreview(boolean loading) {
        if (notificationPopupContent == null) {
            return;
        }

        notificationPopupContent.getChildren().clear();

        Label title = new Label("Pending approvals");
        title.getStyleClass().add("notification-dropdown-title");
        notificationPopupContent.getChildren().add(title);

        if (loading) {
            Label loadingLabel = new Label("Loading...");
            loadingLabel.getStyleClass().add("notification-dropdown-empty");
            notificationPopupContent.getChildren().add(loadingLabel);
            return;
        }

        if (pendingApprovals.isEmpty()) {
            Label emptyLabel = new Label("No pending approvals.");
            emptyLabel.getStyleClass().add("notification-dropdown-empty");
            notificationPopupContent.getChildren().add(emptyLabel);
            return;
        }

        pendingApprovals.stream().limit(4).forEach(user -> {
            HBox row = new HBox(8);
            row.getStyleClass().add("notification-dropdown-item");

            VBox info = new VBox(2);
            info.setMaxWidth(Double.MAX_VALUE);
            HBox.setHgrow(info, Priority.ALWAYS);

            Label nameLabel = new Label(resolveDisplayName(user));
            nameLabel.getStyleClass().add("notification-dropdown-name");
            Label metaLabel = new Label(formatRole(user.getRole()));
            metaLabel.getStyleClass().add("notification-dropdown-meta");

            info.getChildren().addAll(nameLabel, metaLabel);

            Button approveButton = new Button("Approve");
            approveButton.getStyleClass().addAll("approve-button", "approve-button-compact");
            approveButton.setOnAction(event -> approvePendingUser(user, approveButton));

            row.getChildren().addAll(info, approveButton);
            notificationPopupContent.getChildren().add(row);
        });

        if (pendingApprovals.size() > 4) {
            Label moreLabel = new Label("+" + (pendingApprovals.size() - 4) + " more in queue");
            moreLabel.getStyleClass().add("notification-dropdown-empty");
            notificationPopupContent.getChildren().add(moreLabel);
        }
    }

    private void setNotificationCount(int count) {
        if (notificationCountLabel == null || notificationButton == null) {
            return;
        }

        String text = String.valueOf(Math.max(0, count));
        notificationCountLabel.setText(text);
        boolean hasNotifications = count > 0;
        notificationCountLabel.setVisible(hasNotifications);
        notificationCountLabel.setManaged(hasNotifications);

        if (hasNotifications) {
            notificationButton.getStyleClass().remove("notification-button-muted");
        } else if (!notificationButton.getStyleClass().contains("notification-button-muted")) {
            notificationButton.getStyleClass().add("notification-button-muted");
        }
    }

    private void showToast(String message, boolean error) {
        if (toastLabel == null) {
            return;
        }

        toastLabel.setText(message == null ? "" : message);
        toastLabel.getStyleClass().removeAll("toast-error", "toast-success");
        toastLabel.getStyleClass().add(error ? "toast-error" : "toast-success");
        toastLabel.setOpacity(0);
        toastLabel.setManaged(true);
        toastLabel.setVisible(true);

        FadeTransition fadeIn = new FadeTransition(javafx.util.Duration.millis(180), toastLabel);
        fadeIn.setFromValue(0);
        fadeIn.setToValue(1);

        PauseTransition pause = new PauseTransition(javafx.util.Duration.seconds(2.2));

        FadeTransition fadeOut = new FadeTransition(javafx.util.Duration.millis(240), toastLabel);
        fadeOut.setFromValue(1);
        fadeOut.setToValue(0);
        fadeOut.setOnFinished(event -> {
            toastLabel.setVisible(false);
            toastLabel.setManaged(false);
        });

        SequentialTransition sequence = new SequentialTransition(fadeIn, pause, fadeOut);
        sequence.play();
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
            if (approvalQueueCard != null) {
                approvalQueueCard.setVisible(true);
                approvalQueueCard.setManaged(true);
            }
            if (notificationButton != null) {
                notificationButton.setVisible(true);
                notificationButton.setManaged(true);
            }
            loadPendingApprovals();
        } else {
            // Project Managers have limited access
            financeButton.setVisible(false);
            financeButton.setManaged(false);
            if (approvalQueueCard != null) {
                approvalQueueCard.setVisible(false);
                approvalQueueCard.setManaged(false);
            }
            if (notificationButton != null) {
                notificationButton.setVisible(false);
                notificationButton.setManaged(false);
            }
            setNotificationCount(0);
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
