package com.example.shenanigans.features.dashboard.controller;

import com.example.shenanigans.core.session.SessionManager;
import com.example.shenanigans.features.auth.model.User;

import javafx.animation.KeyFrame;
import javafx.animation.KeyValue;
import javafx.animation.Timeline;
import javafx.application.Platform;
import javafx.fxml.FXML;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.control.ProgressBar;
import javafx.scene.control.ProgressIndicator;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.Region;
import javafx.scene.layout.VBox;
import javafx.util.Duration;
import javafx.scene.paint.Color;
import javafx.scene.shape.SVGPath;

import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Controller for the main dashboard view.
 * Displays user information and provides navigation to app features.
 */
public class DashboardController {

    private static final Logger LOGGER = Logger.getLogger(DashboardController.class.getName());

    /** Width of sidebar when expanded */
    private static final double SIDEBAR_EXPANDED_WIDTH = 280;
    /** Width of sidebar when collapsed (icon-only) */
    private static final double SIDEBAR_COLLAPSED_WIDTH = 100;
    /** Animation duration in milliseconds */
    private static final double ANIMATION_DURATION_MS = 250;

    /** Track sidebar state */
    private boolean sidebarExpanded = true;

    @FXML
    private Label welcomeLabel;

    @FXML
    private Label roleLabel;

    @FXML
    private Label emailLabel;

    @FXML
    private Label avatarLabel;

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

        // Set avatar letter
        if (avatarLabel != null && user.getDisplayName() != null && !user.getDisplayName().isEmpty()) {
            avatarLabel.setText(user.getDisplayName().substring(0, 1).toUpperCase());
        }

        // Configure menu based on user role
        configureMenuForRole(user);
        // Ensure sidebar icons are set up so they remain visible when collapsed
        setupSidebarIcons();

        // Apply sidebar state from session (remember collapsed/expanded across views)
        try {
            sidebarExpanded = SessionManager.getInstance().isSidebarExpanded();
            if (sidebarContent != null) {
                sidebarContent.setPrefWidth(sidebarExpanded ? SIDEBAR_EXPANDED_WIDTH : SIDEBAR_COLLAPSED_WIDTH);
            }
            // Update visibility of text/icons based on stored state
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

        // Load dashboard data
        loadDashboardData();

        LOGGER.info("DashboardController initialized for user: " + user.getEmail());
    }

    /**
     * Loads dashboard statistics and data.
     */
    private void loadDashboardData() {
        // Show loading indicator if available
        if (loadingIndicator != null) {
            loadingIndicator.setVisible(true);
        }

        // Set placeholder stats (to be replaced with actual Firebase data)
        if (projectsCountLabel != null) {
            projectsCountLabel.setText("12");
        }
        if (employeesCountLabel != null) {
            employeesCountLabel.setText("48");
        }
        if (tasksCountLabel != null) {
            tasksCountLabel.setText("156");
        }
        if (revenueLabel != null) {
            revenueLabel.setText("$2.4M");
        }

        // Load sample project overview
        loadProjectsOverview();

        // Load sample activity feed
        loadRecentActivity();

        // Hide loading indicator
        if (loadingIndicator != null) {
            loadingIndicator.setVisible(false);
        }
    }

    /**
     * Loads projects overview data into the container.
     */
    private void loadProjectsOverview() {
        if (projectsOverviewContainer == null)
            return;

        projectsOverviewContainer.getChildren().clear();

        // Sample projects data
        addProjectItem("Website Redesign", 75, "Due in 5 days • 3 tasks remaining");
        addProjectItem("Mobile App Development", 45, "Due in 2 weeks • 12 tasks remaining");
        addProjectItem("Database Migration", 90, "Due tomorrow • 1 task remaining");
    }

    /**
     * Adds a project item to the overview container.
     */
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

    /**
     * Loads recent activity feed.
     */
    private void loadRecentActivity() {
        if (activityContainer == null)
            return;

        activityContainer.getChildren().clear();

        // Sample activity data
        addActivityItem("New project created: Mobile App", "2 hours ago", "blue");
        addActivityItem("Task completed: Design Review", "4 hours ago", "green");
        addActivityItem("Employee added: John Smith", "Yesterday", "orange");
    }

    /**
     * Adds an activity item to the feed.
     */
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

    /**
     * Handles adding a new employee.
     */
    @FXML
    private void handleAddEmployee() {
        if (!checkAuth())
            return;
        LOGGER.info("Opening Add Employee dialog");
        navigateTo("features/employees/view/employee_view");
    }

    /**
     * Handles adding a new project.
     */
    @FXML
    private void handleAddProject() {
        if (!checkAuth())
            return;
        LOGGER.info("Opening Add Project dialog");
        navigateTo("features/projects/view/project_view");
    }

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
            // Persist new state in session
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
     * Assigns emoji icon graphics and canonical text labels to sidebar buttons.
     * This ensures the graphic is available when switching to GRAPHIC_ONLY.
     */
    private void setupSidebarIcons() {
        Button[] buttons = { dashboardButton, employeesButton, projectsButton, financeButton, settingsButton };
        String[] texts = { "Dashboard", "Employees", "Projects", "Finance", "Settings" };

        // Simple SVG path data for icons (small, stylistic)
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
        navigateTo("features/projects/view/project_view");
    }

    /**
     * Handles navigation to Finance section.
     */
    @FXML
    private void handleFinance() {
        if (!checkAuth())
            return;
        LOGGER.info("Opening Finance");
        navigateTo("features/finance/view/finance_view");
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
        // Redirect employees to their own dashboard
        if (user.isEmployee()) {
            Platform.runLater(() -> navigateTo("features/employee_dashboard/view/employee_dashboard_view"));
            return;
        }

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
            case "EMPLOYEE" -> "Employee";
            default -> role;
        };
    }
}
