package com.example.shenanigans.features.auth.controller;

import com.example.shenanigans.App;
import com.example.shenanigans.core.session.SessionManager;
import com.example.shenanigans.features.auth.model.User;
import com.example.shenanigans.features.auth.service.AuthService;

import javafx.application.Platform;
import javafx.concurrent.Task;
import javafx.fxml.FXML;
import javafx.scene.control.*;
import javafx.scene.layout.VBox;

import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Controller for the registration view.
 * Handles user registration UI interactions.
 */
public class RegisterController {

    private static final Logger LOGGER = Logger.getLogger(RegisterController.class.getName());

    // Services
    private final AuthService authService = new AuthService();

    // FXML Components - Register
    @FXML
    private VBox registerPane;
    @FXML
    private TextField registerEmailField;
    @FXML
    private PasswordField registerPasswordField;
    @FXML
    private PasswordField confirmPasswordField;
    @FXML
    private TextField displayNameField;
    @FXML
    private ComboBox<String> roleComboBox;
    @FXML
    private Button registerButton;
    @FXML
    private Hyperlink backToLoginLink;

    // FXML Components - Common
    @FXML
    private Label statusLabel;
    @FXML
    private ProgressIndicator loadingIndicator;

    /**
     * Called automatically after FXML is loaded.
     */
    @FXML
    public void initialize() {
        // Setup role combo box
        if (roleComboBox != null) {
            roleComboBox.getItems().addAll("Project Manager", "Managing Director");
            roleComboBox.setValue("Project Manager");
        }

        // Hide loading indicator initially
        if (loadingIndicator != null) {
            loadingIndicator.setVisible(false);
        }

        // Clear status initially
        clearStatus();

        LOGGER.info("RegisterController initialized");
    }

    /**
     * Handles register button click.
     */
    @FXML
    private void handleRegister() {
        String email = registerEmailField.getText().trim();
        String password = registerPasswordField.getText();
        String confirmPassword = confirmPasswordField.getText();
        String displayName = displayNameField.getText().trim();
        String selectedRole = roleComboBox.getValue();

        // Validate inputs
        if (displayName.isEmpty()) {
            showStatus("Please enter your display name", true);
            return;
        }

        if (email.isEmpty()) {
            showStatus("Please enter your email address", true);
            return;
        }

        if (!isValidEmail(email)) {
            showStatus("Please enter a valid email address", true);
            return;
        }

        if (password.isEmpty()) {
            showStatus("Please enter a password", true);
            return;
        }

        if (password.length() < 6) {
            showStatus("Password must be at least 6 characters", true);
            return;
        }

        if (!password.equals(confirmPassword)) {
            showStatus("Passwords do not match", true);
            return;
        }

        if (selectedRole == null) {
            showStatus("Please select a role", true);
            return;
        }

        // Convert display role to system role
        String role = "Project Manager".equals(selectedRole) ? "PROJECT_MANAGER" : "MANAGING_DIRECTOR";

        setLoading(true);
        showStatus("Creating account...", false);

        Task<User> signUpTask = authService.signUp(email, password, displayName, role);

        signUpTask.setOnSucceeded(event -> Platform.runLater(() -> {
            setLoading(false);
            User user = signUpTask.getValue();
            LOGGER.info("User registered: " + user.getEmail());

            // Auto-login after successful registration
            onRegistrationSuccess(user);
        }));

        signUpTask.setOnFailed(event -> Platform.runLater(() -> {
            setLoading(false);
            Throwable error = signUpTask.getException();
            String message = error.getMessage() != null ? error.getMessage() : "Registration failed";
            showStatus(message, true);
            LOGGER.log(Level.SEVERE, "Registration failed", error);
        }));

        new Thread(signUpTask).start();
    }

    /**
     * Called when registration is successful.
     * Stores session and navigates to dashboard.
     * 
     * @param user The newly registered user
     */
    private void onRegistrationSuccess(User user) {
        // Store session information
        SessionManager.getInstance().setSession(
                user,
                authService.getCurrentIdToken(),
                null // Refresh token handling can be added later
        );

        LOGGER.info("Registration successful for: " + user.getDisplayName() + " (" + user.getRole() + ")");

        // Navigate to dashboard
        navigateToDashboard();
    }

    /**
     * Navigates to the login view.
     */
    @FXML
    private void navigateToLogin() {
        try {
            App.setRoot("features/auth/view/auth_view");
        } catch (Exception e) {
            LOGGER.log(Level.SEVERE, "Failed to navigate to login", e);
            showStatus("Failed to load login page", true);
        }
    }

    /**
     * Navigates to the main dashboard view.
     */
    private void navigateToDashboard() {
        try {
            App.setRoot("features/dashboard/view/dashboard_view");
        } catch (Exception e) {
            LOGGER.log(Level.SEVERE, "Failed to navigate to dashboard", e);
            showStatus("Failed to load dashboard", true);
        }
    }

    // Helper Methods

    /**
     * Shows a status message to the user.
     * 
     * @param message The message to display
     * @param isError Whether this is an error message
     */
    private void showStatus(String message, boolean isError) {
        if (statusLabel != null) {
            statusLabel.setText(message);
            statusLabel.getStyleClass().removeAll("status-error", "status-success");
            statusLabel.getStyleClass().add(isError ? "status-error" : "status-success");
            statusLabel.setVisible(true);
            statusLabel.setManaged(true);
        }
    }

    /**
     * Clears the status message.
     */
    private void clearStatus() {
        if (statusLabel != null) {
            statusLabel.setText("");
            statusLabel.setVisible(false);
            statusLabel.setManaged(false);
        }
    }

    /**
     * Sets the loading state of the form.
     * 
     * @param loading Whether the form is in a loading state
     */
    private void setLoading(boolean loading) {
        if (loadingIndicator != null) {
            loadingIndicator.setVisible(loading);
        }
        if (registerButton != null) {
            registerButton.setDisable(loading);
        }
        if (displayNameField != null) {
            displayNameField.setDisable(loading);
        }
        if (registerEmailField != null) {
            registerEmailField.setDisable(loading);
        }
        if (registerPasswordField != null) {
            registerPasswordField.setDisable(loading);
        }
        if (confirmPasswordField != null) {
            confirmPasswordField.setDisable(loading);
        }
        if (roleComboBox != null) {
            roleComboBox.setDisable(loading);
        }
    }

    /**
     * Validates an email address format.
     * 
     * @param email The email to validate
     * @return true if the email format is valid
     */
    private boolean isValidEmail(String email) {
        return email != null && email.matches("^[A-Za-z0-9+_.-]+@[A-Za-z0-9.-]+$");
    }
}
