package com.example.shenanigans.features.employee_dashboard.controller;

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
 * Controller for the employee dashboard view.
 * Provides a simplified dashboard for employees with task tracking,
 * time sheets, and personal information.
 */
public class EmployeeDashboardController {

    private static final Logger LOGGER = Logger.getLogger(EmployeeDashboardController.class.getName());

    // Header components
    @FXML
    private Label welcomeLabel;
    @FXML
    private Label emailLabel;
    @FXML
    private Label roleLabel;
    @FXML
    private Label avatarLabel;
    @FXML
    private Button logoutButton;

    // Menu components
    @FXML
    private VBox menuContainer;
    @FXML
    private Button myTasksButton;
    @FXML
    private Button myProjectsButton;
    @FXML
    private Button timeSheetButton;
    @FXML
    private Button requestsButton;
    @FXML
    private Button documentsButton;
    @FXML
    private Button teamButton;
    @FXML
    private Button profileButton;

    // Stats labels
    @FXML
    private Label tasksDueTodayLabel;
    @FXML
    private Label hoursThisWeekLabel;
    @FXML
    private Label activeProjectsLabel;
    @FXML
    private Label leaveBalanceLabel;

    // Content containers
    @FXML
    private VBox tasksContainer;
    @FXML
    private VBox activityContainer;
    @FXML
    private VBox projectsContainer;

    // Loading indicator
    @FXML
    private javafx.scene.control.ProgressIndicator loadingIndicator;

    /**
     * Called automatically after FXML is loaded.
     */
    @FXML
    public void initialize() {
        // Security check - redirect to login if not authenticated
        if (!SessionManager.getInstance().isLoggedIn()) {
            LOGGER.warning("Unauthorized access attempt to employee dashboard. Redirecting to login.");
            Platform.runLater(this::redirectToLogin);
            return;
        }

        User user = SessionManager.getInstance().getCurrentUser();

        // Verify user is an employee
        if (!user.isEmployee()) {
            LOGGER.warning("Non-employee user attempted to access employee dashboard. Redirecting.");
            Platform.runLater(this::redirectToMainDashboard);
            return;
        }

        // Setup user information
        setupUserInfo(user);

        // Load dashboard data
        loadDashboardData();

        LOGGER.info("EmployeeDashboardController initialized for user: " + user.getEmail());
    }

    /**
     * Sets up user information in the header.
     */
    private void setupUserInfo(User user) {
        welcomeLabel.setText("Welcome, " + user.getDisplayName() + "!");
        emailLabel.setText(user.getEmail());
        roleLabel.setText("Employee");

        // Set avatar letter from display name
        if (user.getDisplayName() != null && !user.getDisplayName().isEmpty()) {
            avatarLabel.setText(user.getDisplayName().substring(0, 1).toUpperCase());
        }
    }

    /**
     * Loads dashboard statistics and data.
     */
    private void loadDashboardData() {
        // TODO: Load actual data from services
        // For now, using placeholder data shown in FXML
        tasksDueTodayLabel.setText("3");
        hoursThisWeekLabel.setText("32h");
        activeProjectsLabel.setText("2");
        leaveBalanceLabel.setText("12");
    }

    // Navigation handlers

    /**
     * Handles navigation to My Tasks section.
     */
    @FXML
    private void handleMyTasks() {
        if (!checkAuth())
            return;
        LOGGER.info("Navigating to My Tasks");
        setActiveButton(myTasksButton);
        // TODO: Navigate to tasks view or load tasks in content area
    }

    /**
     * Handles navigation to My Projects section.
     */
    @FXML
    private void handleMyProjects() {
        if (!checkAuth())
            return;
        LOGGER.info("Navigating to My Projects");
        setActiveButton(myProjectsButton);
        // TODO: Navigate to projects view
    }

    /**
     * Handles navigation to Time Sheet section.
     */
    @FXML
    private void handleTimeSheet() {
        if (!checkAuth())
            return;
        LOGGER.info("Navigating to Time Sheet");
        setActiveButton(timeSheetButton);
        // TODO: Navigate to time sheet view
    }

    /**
     * Handles navigation to Leave Requests section.
     */
    @FXML
    private void handleRequests() {
        if (!checkAuth())
            return;
        LOGGER.info("Navigating to Leave Requests");
        setActiveButton(requestsButton);
        // TODO: Navigate to leave requests view
    }

    /**
     * Handles navigation to Documents section.
     */
    @FXML
    private void handleDocuments() {
        if (!checkAuth())
            return;
        LOGGER.info("Navigating to Documents");
        setActiveButton(documentsButton);
        // TODO: Navigate to documents view
    }

    /**
     * Handles navigation to Team section.
     */
    @FXML
    private void handleTeam() {
        if (!checkAuth())
            return;
        LOGGER.info("Navigating to Team");
        setActiveButton(teamButton);
        // TODO: Navigate to team view
    }

    /**
     * Handles navigation to Profile section.
     */
    @FXML
    private void handleProfile() {
        if (!checkAuth())
            return;
        LOGGER.info("Navigating to Profile");
        setActiveButton(profileButton);
        // TODO: Navigate to profile view
    }

    /**
     * Handles user logout.
     */
    @FXML
    private void handleLogout() {
        LOGGER.info("Employee logging out");
        SessionManager.getInstance().clearSession();
        redirectToLogin();
    }

    /**
     * Sets the active state on the selected menu button.
     */
    private void setActiveButton(Button activeButton) {
        // Remove active class from all buttons
        myTasksButton.getStyleClass().remove("menu-button-active");
        myProjectsButton.getStyleClass().remove("menu-button-active");
        timeSheetButton.getStyleClass().remove("menu-button-active");
        requestsButton.getStyleClass().remove("menu-button-active");
        documentsButton.getStyleClass().remove("menu-button-active");
        teamButton.getStyleClass().remove("menu-button-active");
        profileButton.getStyleClass().remove("menu-button-active");

        // Add active class to selected button
        if (!activeButton.getStyleClass().contains("menu-button-active")) {
            activeButton.getStyleClass().add("menu-button-active");
        }
    }

    /**
     * Checks if user is authenticated.
     */
    private boolean checkAuth() {
        if (!SessionManager.getInstance().isLoggedIn()) {
            LOGGER.warning("Session expired. Redirecting to login.");
            redirectToLogin();
            return false;
        }
        return true;
    }

    /**
     * Redirects to login page.
     */
    private void redirectToLogin() {
        try {
            com.example.shenanigans.App.setRoot("features/auth/view/auth_view");
        } catch (Exception e) {
            LOGGER.log(Level.SEVERE, "Failed to redirect to login", e);
        }
    }

    /**
     * Redirects to main dashboard (for non-employees).
     */
    private void redirectToMainDashboard() {
        try {
            com.example.shenanigans.App.setRoot("features/dashboard/view/dashboard_view");
        } catch (Exception e) {
            LOGGER.log(Level.SEVERE, "Failed to redirect to main dashboard", e);
        }
    }
}
