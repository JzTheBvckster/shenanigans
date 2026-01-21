package com.example.shenanigans.features.employees.controller;

import com.example.shenanigans.core.session.SessionManager;
import com.example.shenanigans.features.employees.model.Employee;
import com.example.shenanigans.features.employees.service.EmployeeService;

import javafx.animation.KeyFrame;
import javafx.animation.KeyValue;
import javafx.animation.Timeline;
import javafx.application.Platform;
import javafx.collections.FXCollections;
import javafx.collections.ObservableList;
import javafx.concurrent.Task;
import javafx.fxml.FXML;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.control.*;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.Region;
import javafx.scene.layout.VBox;
import javafx.util.Duration;

import java.text.NumberFormat;
import javafx.scene.paint.Color;
import javafx.scene.shape.SVGPath;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Controller for the employees management view with card-based layout.
 * Displays employees grouped by status type in columns.
 */
public class EmployeeController {

    private static final Logger LOGGER = Logger.getLogger(EmployeeController.class.getName());
    private static final SimpleDateFormat DATE_FORMAT = new SimpleDateFormat("MMM dd, yyyy");
    private static final NumberFormat CURRENCY_FORMAT = NumberFormat.getCurrencyInstance(Locale.US);

    /** Width of sidebar when expanded */
    private static final double SIDEBAR_EXPANDED_WIDTH = 280;
    /** Width of sidebar when collapsed (icon-only) */
    private static final double SIDEBAR_COLLAPSED_WIDTH = 100;
    /** Animation duration in milliseconds */
    private static final double ANIMATION_DURATION_MS = 250;

    /** Track sidebar state */
    private boolean sidebarExpanded = true;

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
    private Button addButton;

    @FXML
    private Button refreshButton;

    @FXML
    private Label statusLabel;

    @FXML
    private ProgressIndicator loadingIndicator;

    // Stats Labels
    @FXML
    private Label totalCountLabel;

    @FXML
    private Label activeCountLabel;

    @FXML
    private Label onLeaveCountLabel;

    @FXML
    private Label departmentCountLabel;

    // Column Count Labels
    @FXML
    private Label activeColumnCount;

    @FXML
    private Label leaveColumnCount;

    @FXML
    private Label terminatedColumnCount;

    private Employee selectedEmployee;

    /**
     * Called automatically after FXML is loaded.
     */
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
        setupSidebarIcons();

        // Apply sidebar state from session
        try {
            sidebarExpanded = SessionManager.getInstance().isSidebarExpanded();
            if (sidebarContent != null) {
                sidebarContent.setPrefWidth(sidebarExpanded ? SIDEBAR_EXPANDED_WIDTH : SIDEBAR_COLLAPSED_WIDTH);
            }
            updateSidebarCollapsedState(!sidebarExpanded);
            if (sidebarToggleButton != null) {
                Label icon = new Label(sidebarExpanded ? "⮜" : "⮞");
                icon.getStyleClass().add("menu-icon");
                sidebarToggleButton.setGraphic(icon);
                sidebarToggleButton.setText("");
            }
        } catch (Exception e) {
            LOGGER.fine("No session sidebar state available: using defaults");
        }

        LOGGER.info("EmployeeController initialized with card-based view");
    }

    /**
     * Sets up search functionality.
     */
    private void setupSearch() {
        if (searchField != null) {
            searchField.textProperty().addListener((obs, oldVal, newVal) -> {
                if (newVal == null || newVal.isEmpty()) {
                    loadEmployees();
                } else if (newVal.length() >= 2) {
                    searchEmployees(newVal);
                }
            });
        }
    }

    /**
     * Loads all employees from Firestore and displays in columns.
     */
    @FXML
    private void loadEmployees() {
        setLoading(true);
        showStatus("Loading employees...", false);

        Task<List<Employee>> task = employeeService.getAllEmployees();

        task.setOnSucceeded(event -> Platform.runLater(() -> {
            setLoading(false);
            List<Employee> employees = task.getValue();
            employeeList.setAll(employees);
            updateCounts(employees);
            displayEmployeesInColumns(employees);
            showStatus("Loaded " + employees.size() + " employees", false);
        }));

        task.setOnFailed(event -> Platform.runLater(() -> {
            setLoading(false);
            showStatus("Failed to load employees", true);
            LOGGER.log(Level.SEVERE, "Failed to load employees", task.getException());
        }));

        new Thread(task).start();
    }

    /**
     * Searches employees.
     */
    private void searchEmployees(String query) {
        setLoading(true);

        Task<List<Employee>> task = employeeService.searchEmployees(query);

        task.setOnSucceeded(event -> Platform.runLater(() -> {
            setLoading(false);
            List<Employee> results = task.getValue();
            employeeList.setAll(results);
            displayEmployeesInColumns(results);
        }));

        task.setOnFailed(event -> Platform.runLater(() -> {
            setLoading(false);
            LOGGER.log(Level.WARNING, "Search failed", task.getException());
        }));

        new Thread(task).start();
    }

    /**
     * Displays employees in the status columns.
     */
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
        addEmptyStateIfNeeded(terminatedEmployeesContainer, terminatedCount, "No terminated employees", "✗");
    }

    /**
     * Adds empty state placeholder if column has no employees.
     */
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

    /**
     * Creates an employee card for display.
     */
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
        statusBadge.getStyleClass().addAll("card-status-badge", getStatusStyleClass(employee.getStatus()));
        footer.getChildren().add(statusBadge);

        card.getChildren().addAll(header, deptRow, contactBox, footer);

        // Add context menu
        card.setOnContextMenuRequested(event -> {
            ContextMenu menu = createCardContextMenu(employee);
            menu.show(card, event.getScreenX(), event.getScreenY());
        });

        // Double-click to edit
        card.setOnMouseClicked(event -> {
            if (event.getClickCount() == 2) {
                handleEditEmployee(employee);
            }
        });

        // Hover effect
        card.setOnMouseEntered(e -> card.getStyleClass().add("employee-card-hover"));
        card.setOnMouseExited(e -> card.getStyleClass().remove("employee-card-hover"));

        return card;
    }

    /**
     * Gets initials from employee name.
     */
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

    /**
     * Creates context menu for an employee card.
     */
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

        menu.getItems().addAll(editItem, new SeparatorMenuItem(), statusMenu, new SeparatorMenuItem(), deleteItem);
        return menu;
    }

    /**
     * Updates employee status.
     */
    private void updateEmployeeStatus(Employee employee, String newStatus) {
        employee.setStatus(newStatus);
        saveEmployee(employee);
    }

    /**
     * Gets CSS style class for status.
     */
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

    /**
     * Opens dialog to add a new employee.
     */
    @FXML
    private void handleAddEmployee() {
        selectedEmployee = null;
        showEmployeeDialog("Add New Employee", null);
    }

    /**
     * Opens dialog to edit an employee.
     */
    private void handleEditEmployee(Employee employee) {
        selectedEmployee = employee;
        showEmployeeDialog("Edit Employee", employee);
    }

    /**
     * Shows the employee add/edit dialog.
     */
    private void showEmployeeDialog(String title, Employee employee) {
        Dialog<Employee> dialog = new Dialog<>();
        dialog.setTitle(title);
        dialog.setHeaderText(employee == null ? "Enter employee details" : "Update employee details");

        // Set button types
        ButtonType saveButtonType = new ButtonType("Save", ButtonBar.ButtonData.OK_DONE);
        dialog.getDialogPane().getButtonTypes().addAll(saveButtonType, ButtonType.CANCEL);

        // Create form
        VBox content = new VBox(10);
        content.setStyle("-fx-padding: 20;");

        TextField firstNameInput = new TextField();
        firstNameInput.setPromptText("First Name");

        TextField lastNameInput = new TextField();
        lastNameInput.setPromptText("Last Name");

        TextField emailInput = new TextField();
        emailInput.setPromptText("Email");

        TextField phoneInput = new TextField();
        phoneInput.setPromptText("Phone");

        TextField departmentInput = new TextField();
        departmentInput.setPromptText("Department");

        TextField positionInput = new TextField();
        positionInput.setPromptText("Position");

        ComboBox<String> statusInput = new ComboBox<>();
        statusInput.getItems().addAll("ACTIVE", "ON_LEAVE", "TERMINATED");
        statusInput.setValue("ACTIVE");

        TextField salaryInput = new TextField();
        salaryInput.setPromptText("Salary");

        // Pre-fill if editing
        if (employee != null) {
            firstNameInput.setText(employee.getFirstName());
            lastNameInput.setText(employee.getLastName());
            emailInput.setText(employee.getEmail());
            phoneInput.setText(employee.getPhone());
            departmentInput.setText(employee.getDepartment());
            positionInput.setText(employee.getPosition());
            statusInput.setValue(employee.getStatus());
            salaryInput.setText(String.valueOf(employee.getSalary()));
        }

        content.getChildren().addAll(
                new Label("First Name:"), firstNameInput,
                new Label("Last Name:"), lastNameInput,
                new Label("Email:"), emailInput,
                new Label("Phone:"), phoneInput,
                new Label("Department:"), departmentInput,
                new Label("Position:"), positionInput,
                new Label("Status:"), statusInput,
                new Label("Salary:"), salaryInput);

        ScrollPane scrollPane = new ScrollPane(content);
        scrollPane.setFitToWidth(true);
        scrollPane.setPrefHeight(400);

        dialog.getDialogPane().setContent(scrollPane);

        // Convert result
        dialog.setResultConverter(dialogButton -> {
            if (dialogButton == saveButtonType) {
                Employee emp = employee != null ? employee : new Employee();
                emp.setFirstName(firstNameInput.getText().trim());
                emp.setLastName(lastNameInput.getText().trim());
                emp.setEmail(emailInput.getText().trim());
                emp.setPhone(phoneInput.getText().trim());
                emp.setDepartment(departmentInput.getText().trim());
                emp.setPosition(positionInput.getText().trim());
                emp.setStatus(statusInput.getValue());

                try {
                    emp.setSalary(Double.parseDouble(salaryInput.getText().trim()));
                } catch (NumberFormatException e) {
                    emp.setSalary(0.0);
                }

                if (employee == null) {
                    emp.setHireDate(System.currentTimeMillis());
                }

                return emp;
            }
            return null;
        });

        Optional<Employee> result = dialog.showAndWait();
        result.ifPresent(this::saveEmployee);
    }

    /**
     * Saves an employee (create or update).
     */
    private void saveEmployee(Employee employee) {
        setLoading(true);

        Task<?> task;
        if (selectedEmployee == null && (employee.getId() == null || employee.getId().isEmpty())) {
            // Create new
            task = employeeService.createEmployee(employee);
            showStatus("Creating employee...", false);
        } else {
            // Update existing
            task = employeeService.updateEmployee(employee);
            showStatus("Updating employee...", false);
        }

        task.setOnSucceeded(event -> Platform.runLater(() -> {
            setLoading(false);
            showStatus("Employee saved successfully!", false);
            loadEmployees();
        }));

        task.setOnFailed(event -> Platform.runLater(() -> {
            setLoading(false);
            showStatus("Failed to save employee", true);
            LOGGER.log(Level.SEVERE, "Failed to save employee", task.getException());
        }));

        new Thread(task).start();
    }

    /**
     * Confirms and deletes an employee.
     */
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

    /**
     * Deletes an employee.
     */
    private void deleteEmployee(Employee employee) {
        setLoading(true);
        showStatus("Deleting employee...", false);

        Task<Void> task = employeeService.deleteEmployee(employee.getId());

        task.setOnSucceeded(event -> Platform.runLater(() -> {
            setLoading(false);
            showStatus("Employee deleted", false);
            loadEmployees();
        }));

        task.setOnFailed(event -> Platform.runLater(() -> {
            setLoading(false);
            showStatus("Failed to delete employee", true);
            LOGGER.log(Level.SEVERE, "Failed to delete employee", task.getException());
        }));

        new Thread(task).start();
    }

    /**
     * Navigates back to dashboard.
     */
    @FXML
    private void handleBack() {
        try {
            com.example.shenanigans.App.setRoot("features/dashboard/view/dashboard_view");
        } catch (Exception e) {
            LOGGER.log(Level.SEVERE, "Failed to navigate to dashboard", e);
        }
    }

    // ==================== Helper Methods ====================

    private void redirectToLogin() {
        try {
            com.example.shenanigans.App.setRoot("features/auth/view/auth_view");
        } catch (Exception e) {
            LOGGER.log(Level.SEVERE, "Failed to redirect to login", e);
        }
    }

    private void setLoading(boolean loading) {
        if (loadingIndicator != null) {
            loadingIndicator.setVisible(loading);
        }
        if (addButton != null)
            addButton.setDisable(loading);
        if (refreshButton != null)
            refreshButton.setDisable(loading);
    }

    private void showStatus(String message, boolean isError) {
        if (statusLabel != null) {
            statusLabel.setText(message);
            statusLabel.setStyle(isError
                    ? "-fx-text-fill: #fee2e2; -fx-background-color: rgba(239, 68, 68, 0.3);"
                    : "-fx-text-fill: rgba(255, 255, 255, 0.9); -fx-background-color: rgba(255, 255, 255, 0.15);");
        }
    }

    private void updateCounts(List<Employee> employees) {
        if (totalCountLabel != null) {
            totalCountLabel.setText(String.valueOf(employees.size()));
        }
        if (activeCountLabel != null) {
            long activeCount = employees.stream().filter(Employee::isActive).count();
            activeCountLabel.setText(String.valueOf(activeCount));
        }
        if (onLeaveCountLabel != null) {
            long onLeaveCount = employees.stream()
                    .filter(e -> "ON_LEAVE".equals(e.getStatus()))
                    .count();
            onLeaveCountLabel.setText(String.valueOf(onLeaveCount));
        }
        if (departmentCountLabel != null) {
            long deptCount = employees.stream()
                    .map(Employee::getDepartment)
                    .filter(d -> d != null && !d.isEmpty())
                    .distinct()
                    .count();
            departmentCountLabel.setText(String.valueOf(deptCount));
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
     * Handles sidebar toggle button click.
     * Animates the sidebar to collapse or expand with slide effect.
     * When collapsed, icons remain visible and clickable.
     */
    @FXML
    private void handleSidebarToggle() {
        if (sidebarContent == null) {
            LOGGER.warning("Sidebar content not found");
            return;
        }

        double endWidth = sidebarExpanded ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH;

        // Create animation timeline
        Timeline timeline = new Timeline();

        // Animate width
        KeyValue keyValue = new KeyValue(sidebarContent.prefWidthProperty(), endWidth);
        KeyFrame keyFrame = new KeyFrame(Duration.millis(ANIMATION_DURATION_MS), keyValue);
        timeline.getKeyFrames().add(keyFrame);

        // Toggle state first so we know the target state
        sidebarExpanded = !sidebarExpanded;

        // Handle visibility of text elements based on target state
        timeline.setOnFinished(event -> {
            updateSidebarCollapsedState(!sidebarExpanded);
            try {
                SessionManager.getInstance().setSidebarExpanded(sidebarExpanded);
            } catch (Exception e) {
                LOGGER.fine("Failed to persist sidebar state to session");
            }
        });

        // Update toggle button icon (chevron left/right)
        Label icon = new Label(sidebarExpanded ? "⮜" : "⮞");
        icon.getStyleClass().add("menu-icon");
        sidebarToggleButton.setGraphic(icon);
        sidebarToggleButton.setText("");

        // Play animation
        timeline.play();

        LOGGER.info("Sidebar toggled: " + (sidebarExpanded ? "expanded" : "collapsed"));
    }

    /**
     * Updates the sidebar elements visibility based on collapsed state.
     * Hides text labels and system info when collapsed.
     */
    private void updateSidebarCollapsedState(boolean collapsed) {
        // Hide/show menu headers
        if (menuHeaderLabel != null) {
            menuHeaderLabel.setVisible(!collapsed);
            menuHeaderLabel.setManaged(!collapsed);
        }
        if (settingsHeaderLabel != null) {
            settingsHeaderLabel.setVisible(!collapsed);
            settingsHeaderLabel.setManaged(!collapsed);
        }

        // Hide/show system info card
        if (systemInfoCard != null) {
            systemInfoCard.setVisible(!collapsed);
            systemInfoCard.setManaged(!collapsed);
        }

        // Update button text visibility
        updateButtonsForCollapsedState(collapsed);
    }

    /**
     * Updates buttons to show only icons when collapsed.
     */
    private void updateButtonsForCollapsedState(boolean collapsed) {
        Button[] buttons = { dashboardButton, employeesButton, projectsButton, financeButton, settingsButton };
        String[] texts = { "Dashboard", "Employees", "Projects", "Finance", "Settings" };

        for (int i = 0; i < buttons.length; i++) {
            if (buttons[i] != null) {
                buttons[i].setText(collapsed ? "" : texts[i]);
                buttons[i].setContentDisplay(collapsed ? javafx.scene.control.ContentDisplay.GRAPHIC_ONLY
                        : javafx.scene.control.ContentDisplay.LEFT);
            }
        }
    }

    /**
     * Assign emoji icons to buttons and set canonical text labels.
     */
    private void setupSidebarIcons() {
        Button[] buttons = { dashboardButton, employeesButton, projectsButton, financeButton, settingsButton };
        String[] texts = { "Dashboard", "Employees", "Projects", "Finance", "Settings" };

        String[] svgs = {
                "M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z",
                "M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3z M8 11c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3z M2 17c0-2.33 4.67-3.5 7-3.5s7 1.17 7 3.5V20H2v-3z",
                "M19 3h-4.18C14.4 1.84 13.3 1 12 1s-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1z",
                "M12 1C6.48 1 2 5.48 2 11s4.48 10 10 10 10-4.48 10-10S17.52 1 12 1zm1 17.93V19h-2v-.07C8.06 18.44 6 16.28 6 13h2c0 2 2 4 5 4s5-2 5-4-2-3-5-3c-2.21 0-4 .9-4 2H8c0-2.76 3.13-5 7-5 3.87 0 7 2.24 7 5s-3.13 5-7 5c-1.66 0-3.17-.51-4.41-1.37z",
                "M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.11-.2-.36-.28-.57-.22l-2.39.96a7.007 7.007 0 0 0-1.6-.94l-.36-2.54A.486.486 0 0 0 14 1h-4c-.24 0-.44.17-.48.41l-.36 2.54c-.56.23-1.08.54-1.6.94l-2.39-.96c-.21-.08-.46.02-.57.22L2.71 8.88c-.11.2-.06.47.12.61L4.86 11.1c-.04.31-.06.63-.06.94s.02.63.06.94L2.83 15.56c-.18.14-.23.41-.12.61l1.92 3.32c.11.2.36.28.57.22l2.39-.96c.5.4 1.04.72 1.6.94l.36 2.54c.04.24.24.41.48.41h4c.24 0 .44-.17.48-.41l.36-2.54c.56-.23 1.08-.54 1.6-.94l2.39.96c.21.08.46-.02.57-.22l1.92-3.32c.11-.2.06-.47-.12-.61l-2.03-1.58z"
        };

        for (int i = 0; i < buttons.length; i++) {
            Button b = buttons[i];
            if (b == null)
                continue;
            SVGPath svg = new SVGPath();
            svg.setContent(svgs[i]);
            svg.setFill(Color.web("#475569"));
            svg.setScaleX(0.9);
            svg.setScaleY(0.9);
            svg.getStyleClass().add("menu-icon-svg");
            b.setGraphic(svg);
            b.setText(texts[i]);
            b.setContentDisplay(javafx.scene.control.ContentDisplay.LEFT);
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
        LOGGER.info("Navigating to Settings");
        // TODO: Implement navigation
    }

    private void navigateTo(String fxml) {
        try {
            com.example.shenanigans.App.setRoot(fxml);
        } catch (Exception e) {
            LOGGER.log(Level.SEVERE, "Failed to navigate to " + fxml, e);
        }
    }
}
