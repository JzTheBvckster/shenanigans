package com.example.shenanigans.features.dashboard.controller;

import com.example.shenanigans.core.session.SessionManager;
import com.example.shenanigans.features.auth.model.User;

import javafx.application.Platform;
import javafx.fxml.FXML;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.layout.VBox;

import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Controller for the main dashboard view.
 * Displays user information and provides navigation to app features.
 */
public class DashboardController {

    private static final Logger LOGGER = Logger.getLogger(DashboardController.class.getName());

    @FXML
    private Label welcomeLabel;

    @FXML
    private Label roleLabel;

    @FXML
    private Label emailLabel;

    @FXML
    private VBox menuContainer;

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

    /**
     * Called automatically after FXML is loaded.
     */
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

        // Configure menu based on user role
        configureMenuForRole(user);

        LOGGER.info("DashboardController initialized for user: " + user.getEmail());
    }

    /**
     * Redirects unauthenticated users to the login screen.
     */
    private void redirectToLogin() {
        try {
            com.example.shenanigans.App.setRoot("features/auth/view/auth_view");
        } catch (Exception e) {
            LOGGER.log(Level.SEVERE, "Failed to redirect to login", e);
        }
    }

    /**
     * Handles navigation to Employees section.
     */
    @FXML
    private void handleEmployees() {
        if (!checkAuth())
            return;
        LOGGER.info("Navigating to Employees");
        navigateTo("features/employees/view/employee_view");
    }

    /**
     * Handles navigation to Projects section.
     */
    @FXML
    private void handleProjects() {
        if (!checkAuth())
            return;
        LOGGER.info("Navigating to Projects");
        // TODO: Implement navigation
    }

    /**
     * Handles navigation to Finance section.
     */
    @FXML
    private void handleFinance() {
        if (!checkAuth())
            return;
        LOGGER.info("Navigating to Finance");
        // TODO: Implement navigation
    }

    /**
     * Handles navigation to Settings.
     */
    @FXML
    private void handleSettings() {
        if (!checkAuth())
            return;
        LOGGER.info("Navigating to Settings");
        // TODO: Implement navigation
    }

    /**
     * Handles user logout.
     */
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
        try {
            com.example.shenanigans.App.setRoot(fxml);
        } catch (Exception e) {
            LOGGER.log(Level.SEVERE, "Failed to navigate to " + fxml, e);
        }
    }

    /**
     * Configures menu visibility based on user role.
     */
    private void configureMenuForRole(User user) {
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

    /**
     * Formats the role for display.
     */
    private String formatRole(String role) {
        if (role == null)
            return "";
        return switch (role) {
            case "MANAGING_DIRECTOR" -> "Managing Director";
            case "PROJECT_MANAGER" -> "Project Manager";
            default -> role;
        };
    }
}
