package com.example.shenanigans.features.employees.controller;

import com.example.shenanigans.core.session.SessionManager;
import com.example.shenanigans.features.employees.model.Employee;
import com.example.shenanigans.features.employees.service.EmployeeService;

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

import java.text.NumberFormat;
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

    private final EmployeeService employeeService = new EmployeeService();
    private final ObservableList<Employee> employeeList = FXCollections.observableArrayList();

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
}
