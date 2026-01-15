package com.example.shenanigans.features.employees.controller;

import com.example.shenanigans.core.session.SessionManager;
import com.example.shenanigans.features.employees.model.Employee;
import com.example.shenanigans.features.employees.service.EmployeeService;

import javafx.application.Platform;
import javafx.beans.property.SimpleStringProperty;
import javafx.collections.FXCollections;
import javafx.collections.ObservableList;
import javafx.concurrent.Task;
import javafx.fxml.FXML;
import javafx.scene.control.*;
import javafx.scene.control.cell.PropertyValueFactory;
import javafx.scene.layout.VBox;

import java.util.List;
import java.util.Optional;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Controller for the employees management view.
 * Handles CRUD operations for employees.
 */
public class EmployeeController {

    private static final Logger LOGGER = Logger.getLogger(EmployeeController.class.getName());

    private final EmployeeService employeeService = new EmployeeService();
    private final ObservableList<Employee> employeeList = FXCollections.observableArrayList();

    // FXML Components
    @FXML
    private TableView<Employee> employeeTable;

    @FXML
    private TableColumn<Employee, String> nameColumn;

    @FXML
    private TableColumn<Employee, String> emailColumn;

    @FXML
    private TableColumn<Employee, String> departmentColumn;

    @FXML
    private TableColumn<Employee, String> positionColumn;

    @FXML
    private TableColumn<Employee, String> statusColumn;

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

    @FXML
    private Label totalCountLabel;

    @FXML
    private Label activeCountLabel;

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

        setupTable();
        setupSearch();
        loadEmployees();

        LOGGER.info("EmployeeController initialized");
    }

    /**
     * Sets up the table columns.
     */
    private void setupTable() {
        nameColumn.setCellValueFactory(cellData -> new SimpleStringProperty(cellData.getValue().getFullName()));

        emailColumn.setCellValueFactory(new PropertyValueFactory<>("email"));
        departmentColumn.setCellValueFactory(new PropertyValueFactory<>("department"));
        positionColumn.setCellValueFactory(new PropertyValueFactory<>("position"));

        statusColumn.setCellValueFactory(
                cellData -> new SimpleStringProperty(formatStatus(cellData.getValue().getStatus())));

        // Style status column
        statusColumn.setCellFactory(column -> new TableCell<>() {
            @Override
            protected void updateItem(String status, boolean empty) {
                super.updateItem(status, empty);
                if (empty || status == null) {
                    setText(null);
                    setStyle("");
                } else {
                    setText(status);
                    switch (status) {
                        case "Active" -> setStyle("-fx-text-fill: #27ae60; -fx-font-weight: bold;");
                        case "On Leave" -> setStyle("-fx-text-fill: #f39c12; -fx-font-weight: bold;");
                        case "Terminated" -> setStyle("-fx-text-fill: #e74c3c; -fx-font-weight: bold;");
                        default -> setStyle("");
                    }
                }
            }
        });

        employeeTable.setItems(employeeList);

        // Double-click to edit
        employeeTable.setRowFactory(tv -> {
            TableRow<Employee> row = new TableRow<>();
            row.setOnMouseClicked(event -> {
                if (event.getClickCount() == 2 && !row.isEmpty()) {
                    handleEditEmployee(row.getItem());
                }
            });
            return row;
        });

        // Context menu
        employeeTable.setContextMenu(createContextMenu());
    }

    /**
     * Creates a context menu for the table.
     */
    private ContextMenu createContextMenu() {
        ContextMenu menu = new ContextMenu();

        MenuItem editItem = new MenuItem("Edit");
        editItem.setOnAction(e -> {
            Employee selected = employeeTable.getSelectionModel().getSelectedItem();
            if (selected != null) {
                handleEditEmployee(selected);
            }
        });

        MenuItem deleteItem = new MenuItem("Delete");
        deleteItem.setOnAction(e -> {
            Employee selected = employeeTable.getSelectionModel().getSelectedItem();
            if (selected != null) {
                handleDeleteEmployee(selected);
            }
        });

        menu.getItems().addAll(editItem, deleteItem);
        return menu;
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
     * Loads all employees from Firestore.
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
            employeeList.setAll(task.getValue());
        }));

        task.setOnFailed(event -> Platform.runLater(() -> {
            setLoading(false);
            LOGGER.log(Level.WARNING, "Search failed", task.getException());
        }));

        new Thread(task).start();
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

        dialog.getDialogPane().setContent(content);

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
        if (selectedEmployee == null) {
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
            statusLabel.setStyle(isError ? "-fx-text-fill: #e74c3c;" : "-fx-text-fill: #27ae60;");
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
