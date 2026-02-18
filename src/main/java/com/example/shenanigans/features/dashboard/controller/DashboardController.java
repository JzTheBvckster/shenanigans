package com.example.shenanigans.features.dashboard.controller;

import com.example.shenanigans.core.navigation.SidebarComponent;
import com.example.shenanigans.core.navigation.ViewNavigator;
import com.example.shenanigans.core.session.SessionManager;
import com.example.shenanigans.core.theme.ThemeSettingsDialogComponent;
import com.example.shenanigans.features.auth.model.User;
import java.util.logging.Logger;
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

/**
 * Controller for the main dashboard view. Displays user information and provides navigation to app
 * features.
 */
public class DashboardController {

  private static final Logger LOGGER = Logger.getLogger(DashboardController.class.getName());

  private SidebarComponent sidebarComponent;

  @FXML private Label welcomeLabel;

  @FXML private Label roleLabel;

  @FXML private Label emailLabel;

  @FXML private Label avatarLabel;

  // Sidebar components
  @FXML private VBox sidebarContent;

  @FXML private Button sidebarToggleButton;

  @FXML private Label menuHeaderLabel;

  @FXML private VBox mainMenuSection;

  @FXML private Label settingsHeaderLabel;

  @FXML private VBox settingsSection;

  @FXML private Button dashboardButton;

  @FXML private Button employeesButton;

  @FXML private Button projectsButton;

  @FXML private Button financeButton;

  @FXML private Button settingsButton;

  @FXML private Button logoutButton;

  @FXML private VBox systemInfoCard;

  @FXML private Label systemInfoTitle;

  @FXML private Label systemInfoText;

  // Stats labels
  @FXML private Label projectsCountLabel;

  @FXML private Label employeesCountLabel;

  @FXML private Label tasksCountLabel;

  @FXML private Label revenueLabel;

  @FXML private ProgressIndicator loadingIndicator;

  @FXML private VBox projectsOverviewContainer;

  @FXML private VBox activityContainer;

  /** Called automatically after FXML is loaded. */
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
    initializeSidebarComponent();

    // Load dashboard data
    loadDashboardData();

    LOGGER.info("DashboardController initialized for user: " + user.getEmail());
  }

  /** Loads dashboard statistics and data. */
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

  /** Loads projects overview data into the container. */
  private void loadProjectsOverview() {
    if (projectsOverviewContainer == null) return;

    projectsOverviewContainer.getChildren().clear();

    // Sample projects data
    addProjectItem("Website Redesign", 75, "Due in 5 days • 3 tasks remaining");
    addProjectItem("Mobile App Development", 45, "Due in 2 weeks • 12 tasks remaining");
    addProjectItem("Database Migration", 90, "Due tomorrow • 1 task remaining");
  }

  /** Adds a project item to the overview container. */
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

  /** Loads recent activity feed. */
  private void loadRecentActivity() {
    if (activityContainer == null) return;

    activityContainer.getChildren().clear();

    // Sample activity data
    addActivityItem("New project created: Mobile App", "2 hours ago", "blue");
    addActivityItem("Task completed: Design Review", "4 hours ago", "green");
    addActivityItem("Employee added: John Smith", "Yesterday", "orange");
  }

  /** Adds an activity item to the feed. */
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

  /** Handles adding a new employee. */
  @FXML
  private void handleAddEmployee() {
    if (!checkAuth()) return;
    LOGGER.info("Opening Add Employee dialog");
    navigateTo("features/employees/view/employee_view");
  }

  /** Handles adding a new project. */
  @FXML
  private void handleAddProject() {
    if (!checkAuth()) return;
    LOGGER.info("Opening Add Project dialog");
    navigateTo("features/projects/view/project_view");
  }

  /**
   * Handles sidebar toggle button click. Animates the sidebar to collapse or expand with slide
   * effect. When collapsed, icons remain visible and clickable.
   */
  @FXML
  private void handleSidebarToggle() {
    if (sidebarComponent != null) {
      sidebarComponent.toggle();
    }
  }

  /** Redirects unauthenticated users to the login screen. */
  private void redirectToLogin() {
    ViewNavigator.redirectToLogin(LOGGER);
  }

  /** Handles navigation to Employees section. */
  @FXML
  private void handleEmployees() {
    if (!checkAuth()) return;
    LOGGER.info("Navigating to Employees");
    navigateTo("features/employees/view/employee_view");
  }

  /** Handles navigation to Projects section. */
  @FXML
  private void handleProjects() {
    if (!checkAuth()) return;
    LOGGER.info("Navigating to Projects");
    navigateTo("features/projects/view/project_view");
  }

  /** Handles navigation to Finance section. */
  @FXML
  private void handleFinance() {
    if (!checkAuth()) return;
    LOGGER.info("Opening Finance");
    navigateTo("features/finance/view/finance_view");
  }

  /** Handles navigation to Settings. */
  @FXML
  private void handleSettings() {
    if (!checkAuth()) return;

    ThemeSettingsDialogComponent.showDarkModeDialog(
        () -> {
          if (sidebarComponent != null) {
            sidebarComponent.refreshIconsForTheme();
          }
        });
  }

  private void initializeSidebarComponent() {
    sidebarComponent =
        new SidebarComponent(
            LOGGER,
            sidebarContent,
            sidebarToggleButton,
            menuHeaderLabel,
            settingsHeaderLabel,
            systemInfoCard,
            new Button[] {
              dashboardButton, employeesButton, projectsButton, financeButton, settingsButton
            },
            new String[] {"Dashboard", "Employees", "Projects", "Finance", "Settings"});
    sidebarComponent.initialize();
  }

  /** Handles user logout. */
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
    ViewNavigator.navigateTo(fxml, LOGGER);
  }

  /** Configures menu visibility based on user role. */
  private void configureMenuForRole(User user) {
    // Redirect employees to their own dashboard
    if (user.isEmployee()) {
      Platform.runLater(
          () -> navigateTo("features/employee_dashboard/view/employee_dashboard_view"));
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

  /** Formats the role for display. */
  private String formatRole(String role) {
    if (role == null) return "";
    return switch (role) {
      case "MANAGING_DIRECTOR" -> "Managing Director";
      case "PROJECT_MANAGER" -> "Project Manager";
      case "EMPLOYEE" -> "Employee";
      default -> role;
    };
  }
}
