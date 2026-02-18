package com.example.shenanigans.features.employees.controller;

import com.example.shenanigans.core.navigation.ViewNavigator;
import com.example.shenanigans.core.session.SessionManager;
import com.example.shenanigans.features.employees.model.Employee;
import com.example.shenanigans.features.employees.service.EmployeeService;
import java.util.logging.Level;
import java.util.logging.Logger;
import javafx.application.Platform;
import javafx.concurrent.Task;
import javafx.fxml.FXML;
import javafx.scene.control.Button;
import javafx.scene.control.ComboBox;
import javafx.scene.control.Label;
import javafx.scene.control.ProgressIndicator;
import javafx.scene.control.TextField;
import javafx.scene.layout.VBox;

/**
 * Controller for the dedicated employee profile page.
 */
public class EmployeeProfileController {

    private static final Logger LOGGER = Logger.getLogger(EmployeeProfileController.class.getName());

    private final EmployeeService employeeService = new EmployeeService();

    @FXML
    private VBox profilePanel;

    @FXML
    private Label profileTitleLabel;

    @FXML
    private Label profileAvatarLabel;

    @FXML
    private Label profileDisplayNameLabel;

    @FXML
    private Label profileHeadlineLabel;

    @FXML
    private Label profileMetaLabel;

    @FXML
    private Label profileStatStatusLabel;

    @FXML
    private Label profileStatDeptLabel;

    @FXML
    private Label profileStatSalaryLabel;

    @FXML
    private TextField profileFirstNameField;

    @FXML
    private TextField profileLastNameField;

    @FXML
    private TextField profileEmailField;

    @FXML
    private TextField profilePhoneField;

    @FXML
    private TextField profileDepartmentField;

    @FXML
    private TextField profilePositionField;

    @FXML
    private ComboBox<String> profileStatusCombo;

    @FXML
    private TextField profileSalaryField;

    @FXML
    private Button saveProfileButton;

    @FXML
    private Button editProfileButton;

    @FXML
    private Button cancelEditButton;

    @FXML
    private ProgressIndicator loadingIndicator;

    @FXML
    private Label statusLabel;

    private Employee selectedEmployee;

    /** Called automatically after FXML is loaded. */
    @FXML
    public void initialize() {
        if (!SessionManager.getInstance().isLoggedIn()) {
            ViewNavigator.redirectToLogin(LOGGER);
            return;
        }

        if (profileStatusCombo != null) {
            profileStatusCombo.getItems().setAll("ACTIVE", "ON_LEAVE", "TERMINATED");
        }

        String employeeId = SessionManager.getInstance().getSelectedEmployeeId();
        if (employeeId == null || employeeId.isBlank()) {
            showStatus("No employee selected.", true);
            navigateBackToEmployees();
            return;
        }

        loadEmployee(employeeId);
    }

    private void loadEmployee(String employeeId) {
        setLoading(true);
        showStatus("Loading employee profile...", false);

        Task<Employee> task = employeeService.getEmployeeById(employeeId);

        task.setOnSucceeded(
                event -> Platform.runLater(
                        () -> {
                            setLoading(false);
                            Employee employee = task.getValue();
                            if (employee == null) {
                                showStatus("Employee profile not found.", true);
                                navigateBackToEmployees();
                                return;
                            }

                            selectedEmployee = employee;
                            bindEmployeeToFields(employee);
                            setEditMode(false);
                            showStatus("Profile loaded", false);
                        }));

        task.setOnFailed(
                event -> Platform.runLater(
                        () -> {
                            setLoading(false);
                            showStatus("Failed to load profile", true);
                            LOGGER.log(Level.SEVERE, "Failed to load employee profile", task.getException());
                        }));

        Thread thread = new Thread(task, "employee-profile-load");
        thread.setDaemon(true);
        thread.start();
    }

    @FXML
    private void handleSaveProfile() {
        if (selectedEmployee == null) {
            showStatus("No employee selected.", true);
            return;
        }

        selectedEmployee.setFirstName(value(profileFirstNameField));
        selectedEmployee.setLastName(value(profileLastNameField));
        selectedEmployee.setEmail(value(profileEmailField));
        selectedEmployee.setPhone(value(profilePhoneField));
        selectedEmployee.setDepartment(value(profileDepartmentField));
        selectedEmployee.setPosition(value(profilePositionField));
        selectedEmployee.setStatus(profileStatusCombo == null ? "ACTIVE" : profileStatusCombo.getValue());
        selectedEmployee.setSalary(parseSalary(value(profileSalaryField)));

        setLoading(true);
        showStatus("Saving profile...", false);

        Task<Void> task = employeeService.updateEmployee(selectedEmployee);

        task.setOnSucceeded(
                event -> Platform.runLater(
                        () -> {
                            setLoading(false);
                            showStatus("Profile updated successfully.", false);
                            setEditMode(false);
                        }));

        task.setOnFailed(
                event -> Platform.runLater(
                        () -> {
                            setLoading(false);
                            showStatus("Failed to save profile", true);
                            LOGGER.log(Level.SEVERE, "Failed to save employee profile", task.getException());
                        }));

        Thread thread = new Thread(task, "employee-profile-save");
        thread.setDaemon(true);
        thread.start();
    }

    @FXML
    private void handleBackToEmployees() {
        navigateBackToEmployees();
    }

    @FXML
    private void handleEditProfile() {
        if (selectedEmployee == null) {
            showStatus("No employee selected.", true);
            return;
        }

        setEditMode(true);
        showStatus("Edit mode enabled", false);
    }

    @FXML
    private void handleCancelEdit() {
        if (selectedEmployee != null) {
            bindEmployeeToFields(selectedEmployee);
        }
        setEditMode(false);
        showStatus("Edit cancelled", false);
    }

    private void navigateBackToEmployees() {
        SessionManager.getInstance().clearSelectedEmployeeId();
        ViewNavigator.navigateTo("features/employees/view/employee_view", LOGGER);
    }

    private void bindEmployeeToFields(Employee employee) {
        if (profileTitleLabel != null) {
            profileTitleLabel.setText("Profile Details");
        }
        if (profileAvatarLabel != null) {
            profileAvatarLabel.setText(resolveAvatarText(employee));
        }
        if (profileDisplayNameLabel != null) {
            profileDisplayNameLabel.setText(safe(employee.getFullName()));
        }
        if (profileHeadlineLabel != null) {
            profileHeadlineLabel.setText(safe(employee.getDepartment()) + " • " + safe(employee.getPosition()));
        }
        if (profileMetaLabel != null) {
            profileMetaLabel.setText("Status: " + safe(employee.getStatus()));
        }
        if (profileStatStatusLabel != null) {
            profileStatStatusLabel.setText("Status: " + safe(employee.getStatus()));
        }
        if (profileStatDeptLabel != null) {
            profileStatDeptLabel.setText("Dept: " + safe(employee.getDepartment()));
        }
        if (profileStatSalaryLabel != null) {
            profileStatSalaryLabel.setText("Salary: " + String.format("%,.2f", employee.getSalary()));
        }
        if (profileFirstNameField != null) {
            profileFirstNameField.setText(safe(employee.getFirstName()));
        }
        if (profileLastNameField != null) {
            profileLastNameField.setText(safe(employee.getLastName()));
        }
        if (profileEmailField != null) {
            profileEmailField.setText(safe(employee.getEmail()));
        }
        if (profilePhoneField != null) {
            profilePhoneField.setText(safe(employee.getPhone()));
        }
        if (profileDepartmentField != null) {
            profileDepartmentField.setText(safe(employee.getDepartment()));
        }
        if (profilePositionField != null) {
            profilePositionField.setText(safe(employee.getPosition()));
        }
        if (profileStatusCombo != null) {
            profileStatusCombo.setValue(employee.getStatus() == null ? "ACTIVE" : employee.getStatus());
        }
        if (profileSalaryField != null) {
            profileSalaryField.setText(String.valueOf(employee.getSalary()));
        }
    }

    private void setLoading(boolean loading) {
        if (loadingIndicator != null) {
            loadingIndicator.setVisible(loading);
        }
        if (saveProfileButton != null) {
            saveProfileButton.setDisable(loading);
        }
        if (profilePanel != null) {
            profilePanel.setDisable(loading);
        }
    }

    private void setEditMode(boolean enabled) {
        setFieldEditability(enabled);

        if (editProfileButton != null) {
            editProfileButton.setManaged(!enabled);
            editProfileButton.setVisible(!enabled);
        }
        if (cancelEditButton != null) {
            cancelEditButton.setManaged(enabled);
            cancelEditButton.setVisible(enabled);
        }
        if (saveProfileButton != null) {
            saveProfileButton.setManaged(enabled);
            saveProfileButton.setVisible(enabled);
        }
    }

    private void setFieldEditability(boolean editable) {
        setEditable(profileFirstNameField, editable);
        setEditable(profileLastNameField, editable);
        setEditable(profileEmailField, editable);
        setEditable(profilePhoneField, editable);
        setEditable(profileDepartmentField, editable);
        setEditable(profilePositionField, editable);
        setEditable(profileSalaryField, editable);

        if (profileStatusCombo != null) {
            profileStatusCombo.setDisable(!editable);
        }
    }

    private void setEditable(TextField field, boolean editable) {
        if (field == null) {
            return;
        }

        field.setEditable(editable);
        field.setDisable(false);
    }

    private void showStatus(String message, boolean isError) {
        if (statusLabel == null) {
            return;
        }

        statusLabel.setText(message);
        statusLabel.setStyle(
                isError
                        ? "-fx-text-fill: #b91c1c; -fx-background-color: #fee2e2;"
                        : "-fx-text-fill: #14532d; -fx-background-color: #dcfce7;");
    }

    private String safe(String value) {
        return value == null ? "" : value;
    }

    private String value(TextField field) {
        return field == null || field.getText() == null ? "" : field.getText().trim();
    }

    private String resolveAvatarText(Employee employee) {
        String fullName = safe(employee.getFullName()).trim();
        if (fullName.isEmpty()) {
            return "U";
        }

        String[] parts = fullName.split("\\s+");
        if (parts.length == 1) {
            return parts[0].substring(0, 1).toUpperCase();
        }

        String first = parts[0].isEmpty() ? "" : parts[0].substring(0, 1);
        String second = parts[1].isEmpty() ? "" : parts[1].substring(0, 1);
        return (first + second).toUpperCase();
    }

    private double parseSalary(String value) {
        try {
            return Double.parseDouble(value == null ? "0" : value.trim());
        } catch (NumberFormatException exception) {
            return 0.0;
        }
    }
}
