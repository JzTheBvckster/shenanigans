package com.example.shenanigans.features.auth.controller;

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
 * Controller for the authentication view.
 * Handles login, registration, and password reset UI interactions.
 */
public class AuthController {

    private static final Logger LOGGER = Logger.getLogger(AuthController.class.getName());

    // Services
    private final AuthService authService = new AuthService();

    // FXML Components - Login
    @FXML
    private VBox loginPane;
    @FXML
    private TextField loginEmailField;
    @FXML
    private PasswordField loginPasswordField;
    @FXML
    private Button loginButton;
    @FXML
    private Hyperlink forgotPasswordLink;
    @FXML
    private Hyperlink createAccountLink;

    // FXML Components - Forgot Password
    @FXML
    private VBox forgotPasswordPane;
    @FXML
    private TextField resetEmailField;
    @FXML
    private Button resetPasswordButton;
    @FXML
    private Hyperlink backToLoginFromResetLink;

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
        // Show login pane by default
        showLoginPane();

        // Hide loading indicator initially
        if (loadingIndicator != null) {
            loadingIndicator.setVisible(false);
        }

        LOGGER.info("AuthController initialized");
    }

    /**
     * Handles login button click.
     */
    @FXML
    private void handleLogin() {
        String email = loginEmailField.getText().trim();
        String password = loginPasswordField.getText();

        // Validate inputs
        if (email.isEmpty() || password.isEmpty()) {
            showStatus("Please enter email and password", true);
            return;
        }

        if (!isValidEmail(email)) {
            showStatus("Please enter a valid email address", true);
            return;
        }

        setLoading(true);
        showStatus("Signing in...", false);

        Task<User> loginTask = authService.signIn(email, password);

        loginTask.setOnSucceeded(event -> Platform.runLater(() -> {
            setLoading(false);
            User user = loginTask.getValue();
            showStatus("Welcome, " + user.getDisplayName() + "!", false);
            LOGGER.info("User signed in: " + user.getEmail());
            // TODO: Navigate to main dashboard
            onLoginSuccess(user);
        }));

        loginTask.setOnFailed(event -> Platform.runLater(() -> {
            setLoading(false);
            Throwable error = loginTask.getException();
            String message = error.getMessage() != null ? error.getMessage() : "Sign in failed";
            showStatus(message, true);
            LOGGER.log(Level.WARNING, "Login failed", error);
        }));

        new Thread(loginTask).start();
    }

    /**
     * Handles password reset request.
     */
    @FXML
    private void handlePasswordReset() {
        String email = resetEmailField.getText().trim();

        if (email.isEmpty()) {
            showStatus("Please enter your email address", true);
            return;
        }

        if (!isValidEmail(email)) {
            showStatus("Please enter a valid email address", true);
            return;
        }

        setLoading(true);
        showStatus("Sending reset email...", false);

        Task<Void> resetTask = authService.sendPasswordResetEmail(email);

        resetTask.setOnSucceeded(event -> Platform.runLater(() -> {
            setLoading(false);
            showStatus("Password reset email sent! Check your inbox.", false);
            LOGGER.info("Password reset email sent to: " + email);
        }));

        resetTask.setOnFailed(event -> Platform.runLater(() -> {
            setLoading(false);
            Throwable error = resetTask.getException();
            String message = error.getMessage() != null ? error.getMessage() : "Failed to send reset email";
            showStatus(message, true);
            LOGGER.log(Level.WARNING, "Password reset failed", error);
        }));

        new Thread(resetTask).start();
    }

    /**
     * Called when login is successful.
     * Stores session and navigates to dashboard.
     * 
     * @param user The authenticated user
     */
    protected void onLoginSuccess(User user) {
        // Store session information
        SessionManager.getInstance().setSession(
                user,
                authService.getCurrentIdToken(),
                null // Refresh token handling can be added later
        );

        LOGGER.info("Login successful for: " + user.getDisplayName() + " (" + user.getRole() + ")");

        // Navigate to dashboard
        navigateToDashboard();
    }

    /**
     * Navigates to the main dashboard view.
     */
    private void navigateToDashboard() {
        try {
            com.example.shenanigans.App.setRoot("features/dashboard/view/dashboard_view");
        } catch (Exception e) {
            LOGGER.log(Level.SEVERE, "Failed to navigate to dashboard", e);
            showStatus("Failed to load dashboard", true);
        }
    }

    /**
     * Shows the login pane and hides others.
     */
    @FXML
    private void showLoginPane() {
        if (loginPane != null)
            loginPane.setVisible(true);
        if (loginPane != null)
            loginPane.setManaged(true);
        if (forgotPasswordPane != null)
            forgotPasswordPane.setVisible(false);
        if (forgotPasswordPane != null)
            forgotPasswordPane.setManaged(false);
        clearStatus();
    }

    /**
     * Navigates to the registration page.
     */
    @FXML
    private void showRegisterPane() {
        try {
            com.example.shenanigans.App.setRoot("features/auth/view/register_view");
        } catch (Exception e) {
            LOGGER.log(Level.SEVERE, "Failed to navigate to registration", e);
            showStatus("Failed to load registration page", true);
        }
    }

    /**
     * Shows the forgot password pane and hides others.
     */
    @FXML
    private void showForgotPasswordPane() {
        if (loginPane != null)
            loginPane.setVisible(false);
        if (loginPane != null)
            loginPane.setManaged(false);
        if (forgotPasswordPane != null)
            forgotPasswordPane.setVisible(true);
        if (forgotPasswordPane != null)
            forgotPasswordPane.setManaged(true);
        clearStatus();
    }

    // Helper Methods

    private void showStatus(String message, boolean isError) {
        if (statusLabel != null) {
            statusLabel.setText(message);
            statusLabel.getStyleClass().removeAll("status-error", "status-success");
            statusLabel.getStyleClass().add(isError ? "status-error" : "status-success");
            statusLabel.setVisible(true);
        }
    }

    private void clearStatus() {
        if (statusLabel != null) {
            statusLabel.setText("");
            statusLabel.setVisible(false);
        }
    }

    private void setLoading(boolean loading) {
        if (loadingIndicator != null) {
            loadingIndicator.setVisible(loading);
        }
        if (loginButton != null)
            loginButton.setDisable(loading);
        if (resetPasswordButton != null)
            resetPasswordButton.setDisable(loading);
    }

    private boolean isValidEmail(String email) {
        return email != null && email.matches("^[A-Za-z0-9+_.-]+@[A-Za-z0-9.-]+$");
    }
}
