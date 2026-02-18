package com.example.shenanigans.features.employees.controller;

import com.example.shenanigans.core.navigation.SidebarComponent;
import com.example.shenanigans.core.navigation.ViewNavigator;
import com.example.shenanigans.core.session.SessionManager;
import com.example.shenanigans.core.theme.ThemeSettingsDialogComponent;
import com.example.shenanigans.features.employees.model.Employee;
import com.example.shenanigans.features.employees.service.EmployeeService;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;
import java.util.Optional;
import java.util.logging.Level;
import java.util.logging.Logger;
import javafx.application.Platform;
import javafx.collections.FXCollections;
import javafx.collections.ObservableList;
import javafx.concurrent.Task;
import javafx.fxml.FXML;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.input.MouseButton;
import javafx.scene.control.*;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.Region;
import javafx.scene.layout.VBox;

/**
 * Controller for the employees management view with card-based layout. Displays
 * employees grouped
 * by status type in columns.
 */
public class EmployeeController {

    private static final Logger LOGGER = Logger.getLogger(EmployeeController.class.getName());
    private static final SimpleDateFormat DATE_FORMAT = new SimpleDateFormat("MMM dd, yyyy");

    private SidebarComponent sidebarComponent;

    private final EmployeeService employeeService = new EmployeeService();
    private final ObservableList<Employee> employeeList = FXCollections.observableArrayList();

    // Sidebar Components
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
    private VBox systemInfoCard;

    @FXML
    private Label systemInfoTitle;

    @FXML
    private Label systemInfoText;

    // FXML Components - Employee Columns
    @FXML
    private VBox activeEmployeesContainer;

    @FXML
    private VBox onLeaveEmployeesContainer;

    @FXML
    private VBox terminatedEmployeesContainer;

    @FXML
    private TextField searchField;

    @FXML
    private Button refreshButton;

    @FXML
    private Label statusLabel;

    @FXML
    private ProgressIndicator loadingIndicator;

    // Column Count Labels
    @FXML
    private Label activeColumnCount;

    @FXML
    private Label leaveColumnCount;

    @FXML
    private Label terminatedColumnCount;

    /** Called automatically after FXML is loaded. */
    @FXML
    public void initialize() {
        // Security check
        if (!SessionManager.getInstance().isLoggedIn()) {
            LOGGER.warning("Unauthorized access to employees. Redirecting to login.");
            Platform.runLater(this::redirectToLogin);
            return;
        }

        setupSearch();
        loadEmployees();
        initializeSidebarComponent();

        LOGGER.info("EmployeeController initialized with card-based view");
    }

    /** Sets up search functionality. */
    private void setupSearch() {
        if (searchField != null) {
            searchField
                    .textProperty()
                    .addListener(
                            (obs, oldVal, newVal) -> {
                                if (newVal == null || newVal.isEmpty()) {
                                    loadEmployees();
                                } else if (newVal.length() >= 2) {
                                    searchEmployees(newVal);
                                }
                            });
        }
    }

    /** Loads all employees from Firestore and displays in columns. */
    @FXML
    private void loadEmployees() {
        setLoading(true);
        showStatus("Loading employees...", false);

        Task<List<Employee>> task = employeeService.getAllEmployees();

        task.setOnSucceeded(
                event -> Platform.runLater(
                        () -> {
                            setLoading(false);
                            List<Employee> employees = task.getValue();
                            employeeList.setAll(employees);
                            updateCounts(employees);
                            displayEmployeesInColumns(employees);
                            showStatus("Loaded " + employees.size() + " employees", false);
                        }));

        task.setOnFailed(
                event -> Platform.runLater(
                        () -> {
                            setLoading(false);
                            showStatus("Failed to load employees", true);
                            LOGGER.log(Level.SEVERE, "Failed to load employees", task.getException());
                        }));

        new Thread(task).start();
    }

    /** Searches employees. */
    private void searchEmployees(String query) {
        setLoading(true);

        Task<List<Employee>> task = employeeService.searchEmployees(query);

        task.setOnSucceeded(
                event -> Platform.runLater(
                        () -> {
                            setLoading(false);
                            List<Employee> results = task.getValue();
                            employeeList.setAll(results);
                            displayEmployeesInColumns(results);
                        }));

        task.setOnFailed(
                event -> Platform.runLater(
                        () -> {
                            setLoading(false);
                            LOGGER.log(Level.WARNING, "Search failed", task.getException());
                        }));

        new Thread(task).start();
    }

    /** Displays employees in the status columns. */
    private void displayEmployeesInColumns(List<Employee> employees) {
        // Clear all columns
        if (activeEmployeesContainer != null)
            activeEmployeesContainer.getChildren().clear();
        if (onLeaveEmployeesContainer != null)
            onLeaveEmployeesContainer.getChildren().clear();
        if (terminatedEmployeesContainer != null)
            terminatedEmployeesContainer.getChildren().clear();

        int activeCount = 0;
        int leaveCount = 0;
        int terminatedCount = 0;

        for (Employee employee : employees) {
            VBox card = createEmployeeCard(employee);
            String status = employee.getStatus();

            if ("ACTIVE".equals(status)) {
                if (activeEmployeesContainer != null) {
                    activeEmployeesContainer.getChildren().add(card);
                    activeCount++;
                }
            } else if ("ON_LEAVE".equals(status)) {
                if (onLeaveEmployeesContainer != null) {
                    onLeaveEmployeesContainer.getChildren().add(card);
                    leaveCount++;
                }
            } else if ("TERMINATED".equals(status)) {
                if (terminatedEmployeesContainer != null) {
                    terminatedEmployeesContainer.getChildren().add(card);
                    terminatedCount++;
                }
            }
        }

        // Update column counts
        if (activeColumnCount != null)
            activeColumnCount.setText(String.valueOf(activeCount));
        if (leaveColumnCount != null)
            leaveColumnCount.setText(String.valueOf(leaveCount));
        if (terminatedColumnCount != null)
            terminatedColumnCount.setText(String.valueOf(terminatedCount));

        // Add empty states if needed
        addEmptyStateIfNeeded(activeEmployeesContainer, activeCount, "No active employees", "✓");
        addEmptyStateIfNeeded(onLeaveEmployeesContainer, leaveCount, "No employees on leave", "🏖");
        addEmptyStateIfNeeded(
                terminatedEmployeesContainer, terminatedCount, "No terminated employees", "✗");
    }

    /** Adds empty state placeholder if column has no employees. */
    private void addEmptyStateIfNeeded(VBox container, int count, String message, String icon) {
        if (container != null && count == 0) {
            VBox emptyState = new VBox(8);
            emptyState.setAlignment(Pos.CENTER);
            emptyState.getStyleClass().add("column-empty-state");
            emptyState.setPadding(new Insets(32, 16, 32, 16));

            Label iconLabel = new Label(icon);
            iconLabel.getStyleClass().add("empty-state-icon");

            Label messageLabel = new Label(message);
            messageLabel.getStyleClass().add("empty-state-message");

            emptyState.getChildren().addAll(iconLabel, messageLabel);
            container.getChildren().add(emptyState);
        }
    }

    /** Creates an employee card for display. */
    private VBox createEmployeeCard(Employee employee) {
        VBox card = new VBox(12);
        card.getStyleClass().add("employee-card");
        card.setPadding(new Insets(16));

        // Header with avatar and name
        HBox header = new HBox(12);
        header.setAlignment(Pos.CENTER_LEFT);

        // Avatar circle with initials
        Label avatar = new Label(getInitials(employee));
        avatar.getStyleClass().add("employee-avatar");

        VBox nameBox = new VBox(2);
        Label nameLabel = new Label(employee.getFullName());
        nameLabel.getStyleClass().add("card-name");

        Label positionLabel = new Label(employee.getPosition() != null ? employee.getPosition() : "No position");
        positionLabel.getStyleClass().add("card-position");

        nameBox.getChildren().addAll(nameLabel, positionLabel);
        HBox.setHgrow(nameBox, Priority.ALWAYS);

        header.getChildren().addAll(avatar, nameBox);

        // Department badge
        HBox deptRow = new HBox(8);
        deptRow.setAlignment(Pos.CENTER_LEFT);

        if (employee.getDepartment() != null && !employee.getDepartment().isEmpty()) {
            Label deptBadge = new Label("🏢 " + employee.getDepartment());
            deptBadge.getStyleClass().add("card-department");
            deptRow.getChildren().add(deptBadge);
        }

        // Contact info
        VBox contactBox = new VBox(6);

        if (employee.getEmail() != null && !employee.getEmail().isEmpty()) {
            Label emailLabel = new Label("✉ " + employee.getEmail());
            emailLabel.getStyleClass().add("card-contact");
            contactBox.getChildren().add(emailLabel);
        }

        if (employee.getPhone() != null && !employee.getPhone().isEmpty()) {
            Label phoneLabel = new Label("📞 " + employee.getPhone());
            phoneLabel.getStyleClass().add("card-contact");
            contactBox.getChildren().add(phoneLabel);
        }

        // Footer with hire date and status
        HBox footer = new HBox(8);
        footer.setAlignment(Pos.CENTER_LEFT);

        if (employee.getHireDate() > 0) {
            Label hireDateLabel = new Label("Joined: " + DATE_FORMAT.format(new Date(employee.getHireDate())));
            hireDateLabel.getStyleClass().add("card-hire-date");
            footer.getChildren().add(hireDateLabel);
        }

        Region spacer = new Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);
        footer.getChildren().add(spacer);

        // Status badge
        Label statusBadge = new Label(formatStatus(employee.getStatus()));
        statusBadge
                .getStyleClass()
                .addAll("card-status-badge", getStatusStyleClass(employee.getStatus()));
        footer.getChildren().add(statusBadge);

        card.getChildren().addAll(header, deptRow, contactBox, footer);

        // Add context menu
        card.setOnContextMenuRequested(
                event -> {
                    ContextMenu menu = createCardContextMenu(employee);
                    menu.show(card, event.getScreenX(), event.getScreenY());
                });

        // Double-click to edit
        card.setOnMouseClicked(
                event -> {
                    if (event.getClickCount() == 1 && event.getButton() == MouseButton.PRIMARY) {
                        handleEditEmployee(employee);
                    }
                });

        // Hover effect
        card.setOnMouseEntered(e -> card.getStyleClass().add("employee-card-hover"));
        card.setOnMouseExited(e -> card.getStyleClass().remove("employee-card-hover"));

        return card;
    }

    /** Gets initials from employee name. */
    private String getInitials(Employee employee) {
        String first = employee.getFirstName();
        String last = employee.getLastName();
        StringBuilder initials = new StringBuilder();

        if (first != null && !first.isEmpty()) {
            initials.append(first.charAt(0));
        }
        if (last != null && !last.isEmpty()) {
            initials.append(last.charAt(0));
        }

        return initials.toString().toUpperCase();
    }

    /** Creates context menu for an employee card. */
    private ContextMenu createCardContextMenu(Employee employee) {
        ContextMenu menu = new ContextMenu();

        MenuItem editItem = new MenuItem("✏️ Edit");
        editItem.setOnAction(e -> handleEditEmployee(employee));

        // Status change submenu
        Menu statusMenu = new Menu("📋 Change Status...");

        MenuItem activeItem = new MenuItem("Active");
        activeItem.setOnAction(e -> updateEmployeeStatus(employee, "ACTIVE"));

        MenuItem leaveItem = new MenuItem("On Leave");
        leaveItem.setOnAction(e -> updateEmployeeStatus(employee, "ON_LEAVE"));

        MenuItem terminatedItem = new MenuItem("Terminated");
        terminatedItem.setOnAction(e -> updateEmployeeStatus(employee, "TERMINATED"));

        statusMenu.getItems().addAll(activeItem, leaveItem, terminatedItem);

        MenuItem deleteItem = new MenuItem("🗑️ Delete");
        deleteItem.setOnAction(e -> handleDeleteEmployee(employee));

        menu.getItems()
                .addAll(editItem, new SeparatorMenuItem(), statusMenu, new SeparatorMenuItem(), deleteItem);
        return menu;
    }

    /** Updates employee status. */
    private void updateEmployeeStatus(Employee employee, String newStatus) {
        employee.setStatus(newStatus);
        saveEmployee(employee);
    }

    /** Gets CSS style class for status. */
    private String getStatusStyleClass(String status) {
        if (status == null)
            return "status-active";
        return switch (status) {
            case "ACTIVE" -> "status-active";
            case "ON_LEAVE" -> "status-on-leave";
            case "TERMINATED" -> "status-inactive";
            default -> "status-active";
        };
    }

    /** Opens dialog to edit an employee. */
    private void handleEditEmployee(Employee employee) {
        if (employee == null) {
            return;
        }

        SessionManager.getInstance().setSelectedEmployeeId(employee.getId());
        navigateTo("features/employees/view/employee_profile_view");
    }

    /** Saves an employee (create or update). */
    private void saveEmployee(Employee employee) {
        if (employee == null || employee.getId() == null || employee.getId().isEmpty()) {
            showStatus("Creating employees from this view is disabled.", true);
            LOGGER.warning("Blocked employee create save path because add action is disabled.");
            return;
        }

        setLoading(true);

        Task<?> task = employeeService.updateEmployee(employee);
        showStatus("Updating employee...", false);

        task.setOnSucceeded(
                event -> Platform.runLater(
                        () -> {
                            setLoading(false);
                            showStatus("Employee saved successfully!", false);
                            loadEmployees();
                        }));

        task.setOnFailed(
                event -> Platform.runLater(
                        () -> {
                            setLoading(false);
                            showStatus("Failed to save employee", true);
                            LOGGER.log(Level.SEVERE, "Failed to save employee", task.getException());
                        }));

        new Thread(task).start();
    }

    /** Confirms and deletes an employee. */
    private void handleDeleteEmployee(Employee employee) {
        Alert confirm = new Alert(Alert.AlertType.CONFIRMATION);
        confirm.setTitle("Delete Employee");
        confirm.setHeaderText("Delete " + employee.getFullName() + "?");
        confirm.setContentText("This action cannot be undone.");

        Optional<ButtonType> result = confirm.showAndWait();
        if (result.isPresent() && result.get() == ButtonType.OK) {
            deleteEmployee(employee);
        }
    }

    /** Deletes an employee. */
    private void deleteEmployee(Employee employee) {
        setLoading(true);
        showStatus("Deleting employee...", false);

        Task<Void> task = employeeService.deleteEmployee(employee.getId());

        task.setOnSucceeded(
                event -> Platform.runLater(
                        () -> {
                            setLoading(false);
                            showStatus("Employee deleted", false);
                            loadEmployees();
                        }));

        task.setOnFailed(
                event -> Platform.runLater(
                        () -> {
                            setLoading(false);
                            showStatus("Failed to delete employee", true);
                            LOGGER.log(Level.SEVERE, "Failed to delete employee", task.getException());
                        }));

        new Thread(task).start();
    }

    /** Navigates back to dashboard. */
    @FXML
    private void handleBack() {
        ViewNavigator.redirectToDashboard(LOGGER);
    }

    // ==================== Helper Methods ====================

    private void redirectToLogin() {
        ViewNavigator.redirectToLogin(LOGGER);
    }

    private void setLoading(boolean loading) {
        if (loadingIndicator != null) {
            loadingIndicator.setVisible(loading);
        }
        if (refreshButton != null)
            refreshButton.setDisable(loading);
    }

    private void showStatus(String message, boolean isError) {
        if (statusLabel != null) {
            statusLabel.setText(message);
            statusLabel.setStyle(
                    isError
                            ? "-fx-text-fill: #fee2e2; -fx-background-color: rgba(239, 68, 68, 0.3);"
                            : "-fx-text-fill: rgba(255, 255, 255, 0.9); -fx-background-color: rgba(255, 255, 255,"
                                    + " 0.15);");
        }
    }

    private void updateCounts(List<Employee> employees) {
        if (activeColumnCount != null) {
            long activeCount = employees.stream().filter(Employee::isActive).count();
            activeColumnCount.setText(String.valueOf(activeCount));
        }
        if (leaveColumnCount != null) {
            long leaveCount = employees.stream().filter(e -> "ON_LEAVE".equals(e.getStatus())).count();
            leaveColumnCount.setText(String.valueOf(leaveCount));
        }
        if (terminatedColumnCount != null) {
            long terminatedCount = employees.stream().filter(e -> "TERMINATED".equals(e.getStatus())).count();
            terminatedColumnCount.setText(String.valueOf(terminatedCount));
        }
    }

    private String formatStatus(String status) {
        if (status == null)
            return "";
        return switch (status) {
            case "ACTIVE" -> "Active";
            case "ON_LEAVE" -> "On Leave";
            case "TERMINATED" -> "Terminated";
            default -> status;
        };
    }

    // ==================== Sidebar Navigation Methods ====================

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

    @FXML
    private void handleDashboard() {
        navigateTo("features/dashboard/view/dashboard_view");
    }

    @FXML
    private void handleProjects() {
        navigateTo("features/projects/view/project_view");
    }

    @FXML
    private void handleFinance() {
        LOGGER.info("Opening Finance");
        navigateTo("features/finance/view/finance_view");
    }

    @FXML
    private void handleSettings() {
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

    private void navigateTo(String fxml) {
        ViewNavigator.navigateTo(fxml, LOGGER);
    }
}
