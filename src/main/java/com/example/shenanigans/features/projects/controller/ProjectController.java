package com.example.shenanigans.features.projects.controller;

import com.example.shenanigans.core.navigation.SidebarComponent;
import com.example.shenanigans.core.navigation.ViewNavigator;
import com.example.shenanigans.core.session.SessionManager;
import com.example.shenanigans.core.theme.ThemeSettingsDialogComponent;
import com.example.shenanigans.features.projects.model.Project;
import com.example.shenanigans.features.projects.service.ProjectService;
import java.text.NumberFormat;
import java.text.SimpleDateFormat;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.logging.Level;
import java.util.logging.Logger;
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

/**
 * Controller for the projects management view with Kanban board. Handles CRUD operations for
 * projects displayed in columns by status.
 */
public class ProjectController {

  private static final Logger LOGGER = Logger.getLogger(ProjectController.class.getName());
  private static final SimpleDateFormat DATE_FORMAT = new SimpleDateFormat("MMM dd, yyyy");
  private static final NumberFormat CURRENCY_FORMAT = NumberFormat.getCurrencyInstance(Locale.US);

  private SidebarComponent sidebarComponent;

  private final ProjectService projectService = new ProjectService();
  private final ObservableList<Project> projectList = FXCollections.observableArrayList();

  // Sidebar Components
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

  @FXML private VBox systemInfoCard;

  @FXML private Label systemInfoTitle;

  @FXML private Label systemInfoText;

  // FXML Components - Kanban Columns
  @FXML private VBox newProjectsContainer;

  @FXML private VBox pendingProjectsContainer;

  @FXML private VBox completedProjectsContainer;

  @FXML private TextField searchField;

  @FXML private Button addButton;

  @FXML private Button refreshButton;

  @FXML private Label statusLabel;

  @FXML private ProgressIndicator loadingIndicator;

  // Column Count Labels
  @FXML private Label newColumnCount;

  @FXML private Label pendingColumnCount;

  @FXML private Label completedColumnCount;

  /** Called automatically after FXML is loaded. */
  @FXML
  public void initialize() {
    // Security check
    if (!SessionManager.getInstance().isLoggedIn()) {
      LOGGER.warning("Unauthorized access to projects. Redirecting to login.");
      Platform.runLater(this::redirectToLogin);
      return;
    }

    setupSearch();
    loadProjects();
    initializeSidebarComponent();

    LOGGER.info("ProjectController initialized with Kanban view");
  }

  /** Sets up search functionality. */
  private void setupSearch() {
    if (searchField != null) {
      searchField
          .textProperty()
          .addListener(
              (obs, oldVal, newVal) -> {
                if (newVal == null || newVal.isEmpty()) {
                  loadProjects();
                } else if (newVal.length() >= 2) {
                  searchProjects(newVal);
                }
              });
    }
  }

  /** Loads all projects from Firestore and displays in Kanban board. */
  @FXML
  private void loadProjects() {
    setLoading(true);
    showStatus("Loading projects...", false);

    Task<List<Project>> task = projectService.getAllProjects();

    task.setOnSucceeded(
        event ->
            Platform.runLater(
                () -> {
                  setLoading(false);
                  List<Project> projects = task.getValue();
                  projectList.setAll(projects);
                  updateCounts(projects);
                  displayProjectsInKanban(projects);
                  showStatus("Loaded " + projects.size() + " projects", false);
                }));

    task.setOnFailed(
        event ->
            Platform.runLater(
                () -> {
                  setLoading(false);
                  showStatus("Failed to load projects", true);
                  LOGGER.log(Level.SEVERE, "Failed to load projects", task.getException());
                }));

    new Thread(task).start();
  }

  /** Searches projects. */
  private void searchProjects(String query) {
    setLoading(true);

    Task<List<Project>> task = projectService.searchProjects(query);

    task.setOnSucceeded(
        event ->
            Platform.runLater(
                () -> {
                  setLoading(false);
                  List<Project> results = task.getValue();
                  projectList.setAll(results);
                  displayProjectsInKanban(results);
                }));

    task.setOnFailed(
        event ->
            Platform.runLater(
                () -> {
                  setLoading(false);
                  LOGGER.log(Level.WARNING, "Search failed", task.getException());
                }));

    new Thread(task).start();
  }

  /** Displays projects in the Kanban board columns. */
  private void displayProjectsInKanban(List<Project> projects) {
    // Clear all columns
    if (newProjectsContainer != null) newProjectsContainer.getChildren().clear();
    if (pendingProjectsContainer != null) pendingProjectsContainer.getChildren().clear();
    if (completedProjectsContainer != null) completedProjectsContainer.getChildren().clear();

    int newCount = 0;
    int pendingCount = 0;
    int completedCount = 0;

    for (Project project : projects) {
      VBox card = createProjectCard(project);
      String status = project.getStatus();

      if ("PLANNING".equals(status) || "ON_HOLD".equals(status)) {
        if (newProjectsContainer != null) {
          newProjectsContainer.getChildren().add(card);
          newCount++;
        }
      } else if ("IN_PROGRESS".equals(status)) {
        if (pendingProjectsContainer != null) {
          pendingProjectsContainer.getChildren().add(card);
          pendingCount++;
        }
      } else if ("COMPLETED".equals(status) || "CANCELLED".equals(status)) {
        if (completedProjectsContainer != null) {
          completedProjectsContainer.getChildren().add(card);
          completedCount++;
        }
      }
    }

    // Update column counts
    if (newColumnCount != null) newColumnCount.setText(String.valueOf(newCount));
    if (pendingColumnCount != null) pendingColumnCount.setText(String.valueOf(pendingCount));
    if (completedColumnCount != null) completedColumnCount.setText(String.valueOf(completedCount));

    // Add empty states if needed
    addEmptyStateIfNeeded(newProjectsContainer, newCount, "No new projects", "✨");
    addEmptyStateIfNeeded(pendingProjectsContainer, pendingCount, "No projects in progress", "⏳");
    addEmptyStateIfNeeded(completedProjectsContainer, completedCount, "No completed projects", "✓");
  }

  /** Adds empty state placeholder if column has no projects. */
  private void addEmptyStateIfNeeded(VBox container, int count, String message, String icon) {
    if (container != null && count == 0) {
      VBox emptyState = new VBox(8);
      emptyState.setAlignment(Pos.CENTER);
      emptyState.getStyleClass().add("kanban-empty-state");
      emptyState.setPadding(new Insets(32, 16, 32, 16));

      Label iconLabel = new Label(icon);
      iconLabel.getStyleClass().add("empty-state-icon");

      Label messageLabel = new Label(message);
      messageLabel.getStyleClass().add("empty-state-message");

      emptyState.getChildren().addAll(iconLabel, messageLabel);
      container.getChildren().add(emptyState);
    }
  }

  /** Creates a Kanban card for a project. */
  private VBox createProjectCard(Project project) {
    VBox card = new VBox(12);
    card.getStyleClass().add("project-card");
    card.setPadding(new Insets(16));

    // Header with name and priority
    HBox header = new HBox(8);
    header.setAlignment(Pos.CENTER_LEFT);

    Label nameLabel = new Label(project.getName());
    nameLabel.getStyleClass().add("card-title");
    nameLabel.setWrapText(true);
    HBox.setHgrow(nameLabel, Priority.ALWAYS);

    Label priorityBadge = new Label(formatPriority(project.getPriority()));
    priorityBadge
        .getStyleClass()
        .addAll("card-priority-badge", getPriorityStyleClass(project.getPriority()));

    header.getChildren().addAll(nameLabel, priorityBadge);

    // Description (truncated)
    Label descLabel = new Label(truncateText(project.getDescription(), 80));
    descLabel.getStyleClass().add("card-description");
    descLabel.setWrapText(true);

    // Progress bar
    HBox progressRow = new HBox(8);
    progressRow.setAlignment(Pos.CENTER_LEFT);

    ProgressBar progressBar = new ProgressBar(project.getCompletionPercentage() / 100.0);
    progressBar.getStyleClass().add("card-progress-bar");
    progressBar.setPrefWidth(120);
    progressBar.setPrefHeight(6);
    HBox.setHgrow(progressBar, Priority.ALWAYS);

    Label progressLabel = new Label(project.getCompletionPercentage() + "%");
    progressLabel.getStyleClass().add("card-progress-label");

    progressRow.getChildren().addAll(progressBar, progressLabel);

    // Meta info row (manager, deadline)
    HBox metaRow = new HBox(12);
    metaRow.setAlignment(Pos.CENTER_LEFT);

    if (project.getProjectManager() != null && !project.getProjectManager().isEmpty()) {
      Label managerLabel = new Label("👤 " + project.getProjectManager());
      managerLabel.getStyleClass().add("card-meta");
      metaRow.getChildren().add(managerLabel);
    }

    Region spacer = new Region();
    HBox.setHgrow(spacer, Priority.ALWAYS);
    metaRow.getChildren().add(spacer);

    if (project.getEndDate() > 0) {
      Label deadlineLabel = new Label("📅 " + DATE_FORMAT.format(new Date(project.getEndDate())));
      deadlineLabel.getStyleClass().add("card-meta");
      if (project.isOverdue()) {
        deadlineLabel.getStyleClass().add("card-overdue");
      }
      metaRow.getChildren().add(deadlineLabel);
    }

    // Status badge
    Label statusBadge = new Label(formatStatus(project.getStatus()));
    statusBadge
        .getStyleClass()
        .addAll("card-status-badge", getStatusStyleClass(project.getStatus()));

    card.getChildren().addAll(header, descLabel, progressRow, metaRow, statusBadge);

    // Add context menu
    card.setOnContextMenuRequested(
        event -> {
          ContextMenu menu = createCardContextMenu(project);
          menu.show(card, event.getScreenX(), event.getScreenY());
        });

    // Double-click to edit
    card.setOnMouseClicked(
        event -> {
          if (event.getClickCount() == 2) {
            handleEditProject(project);
          }
        });

    // Hover effect
    card.setOnMouseEntered(e -> card.getStyleClass().add("project-card-hover"));
    card.setOnMouseExited(e -> card.getStyleClass().remove("project-card-hover"));

    return card;
  }

  /** Creates context menu for a project card. */
  private ContextMenu createCardContextMenu(Project project) {
    ContextMenu menu = new ContextMenu();

    MenuItem viewItem = new MenuItem("👁 View Details");
    viewItem.setOnAction(e -> showProjectDetails(project));

    MenuItem editItem = new MenuItem("✏️ Edit");
    editItem.setOnAction(e -> handleEditProject(project));

    // Status change submenu
    Menu moveMenu = new Menu("📦 Move to...");

    MenuItem moveToPlanningItem = new MenuItem("Planning");
    moveToPlanningItem.setOnAction(e -> updateProjectStatus(project, "PLANNING"));

    MenuItem moveToProgressItem = new MenuItem("In Progress");
    moveToProgressItem.setOnAction(e -> updateProjectStatus(project, "IN_PROGRESS"));

    MenuItem moveToCompletedItem = new MenuItem("Completed");
    moveToCompletedItem.setOnAction(e -> updateProjectStatus(project, "COMPLETED"));

    MenuItem moveToHoldItem = new MenuItem("On Hold");
    moveToHoldItem.setOnAction(e -> updateProjectStatus(project, "ON_HOLD"));

    moveMenu
        .getItems()
        .addAll(moveToPlanningItem, moveToProgressItem, moveToCompletedItem, moveToHoldItem);

    MenuItem deleteItem = new MenuItem("🗑️ Delete");
    deleteItem.setOnAction(e -> handleDeleteProject(project));

    menu.getItems()
        .addAll(
            viewItem,
            editItem,
            new SeparatorMenuItem(),
            moveMenu,
            new SeparatorMenuItem(),
            deleteItem);
    return menu;
  }

  /** Updates project status and refreshes the board. */
  private void updateProjectStatus(Project project, String newStatus) {
    project.setStatus(newStatus);
    if ("COMPLETED".equals(newStatus)) {
      project.setCompletionPercentage(100);
    }
    saveProject(project);
  }

  /** Opens dialog to add a new project. */
  @FXML
  private void handleAddProject() {
    showProjectDialog("Create New Project", null);
  }

  /** Opens dialog to edit a project. */
  private void handleEditProject(Project project) {
    showProjectDialog("Edit Project", project);
  }

  /** Deletes a project. */
  private void handleDeleteProject(Project project) {
    Alert confirm = new Alert(Alert.AlertType.CONFIRMATION);
    confirm.setTitle("Delete Project");
    confirm.setHeaderText("Delete \"" + project.getName() + "\"?");
    confirm.setContentText(
        "This action cannot be undone. All project data will be permanently deleted.");

    Optional<ButtonType> result = confirm.showAndWait();
    if (result.isPresent() && result.get() == ButtonType.OK) {
      setLoading(true);

      Task<Void> task = projectService.deleteProject(project.getId());

      task.setOnSucceeded(
          event ->
              Platform.runLater(
                  () -> {
                    setLoading(false);
                    loadProjects();
                    showStatus("Project deleted", false);
                  }));

      task.setOnFailed(
          event ->
              Platform.runLater(
                  () -> {
                    setLoading(false);
                    showStatus("Failed to delete project", true);
                    LOGGER.log(Level.SEVERE, "Delete failed", task.getException());
                  }));

      new Thread(task).start();
    }
  }

  /** Shows the project add/edit dialog. */
  private void showProjectDialog(String title, Project project) {
    Dialog<Project> dialog = new Dialog<>();
    dialog.setTitle(title);
    dialog.setHeaderText(project == null ? "Enter project details" : "Update project details");

    ButtonType saveButtonType = new ButtonType("Save", ButtonBar.ButtonData.OK_DONE);
    dialog.getDialogPane().getButtonTypes().addAll(saveButtonType, ButtonType.CANCEL);

    // Create form
    VBox content = new VBox(12);
    content.setStyle("-fx-padding: 20;");

    TextField nameInput = new TextField();
    nameInput.setPromptText("Project Name");

    TextArea descriptionInput = new TextArea();
    descriptionInput.setPromptText("Description");
    descriptionInput.setPrefRowCount(3);

    TextField managerInput = new TextField();
    managerInput.setPromptText("Project Manager");

    TextField departmentInput = new TextField();
    departmentInput.setPromptText("Department");

    ComboBox<String> statusInput = new ComboBox<>();
    statusInput.getItems().addAll("PLANNING", "IN_PROGRESS", "COMPLETED", "ON_HOLD", "CANCELLED");
    statusInput.setValue("PLANNING");

    ComboBox<String> priorityInput = new ComboBox<>();
    priorityInput.getItems().addAll("LOW", "MEDIUM", "HIGH", "CRITICAL");
    priorityInput.setValue("MEDIUM");

    TextField budgetInput = new TextField();
    budgetInput.setPromptText("Budget");

    Slider progressSlider = new Slider(0, 100, 0);
    progressSlider.setShowTickLabels(true);
    progressSlider.setShowTickMarks(true);
    progressSlider.setMajorTickUnit(25);

    DatePicker startDatePicker = new DatePicker();
    startDatePicker.setPromptText("Start Date");

    DatePicker endDatePicker = new DatePicker();
    endDatePicker.setPromptText("End Date");

    // Pre-fill if editing
    if (project != null) {
      nameInput.setText(project.getName());
      descriptionInput.setText(project.getDescription());
      managerInput.setText(project.getProjectManager());
      departmentInput.setText(project.getDepartment());
      statusInput.setValue(project.getStatus());
      priorityInput.setValue(project.getPriority());
      budgetInput.setText(String.valueOf(project.getBudget()));
      progressSlider.setValue(project.getCompletionPercentage());

      if (project.getStartDate() > 0) {
        startDatePicker.setValue(
            LocalDate.ofInstant(
                new Date(project.getStartDate()).toInstant(), ZoneId.systemDefault()));
      }
      if (project.getEndDate() > 0) {
        endDatePicker.setValue(
            LocalDate.ofInstant(
                new Date(project.getEndDate()).toInstant(), ZoneId.systemDefault()));
      }
    }

    content
        .getChildren()
        .addAll(
            new Label("Project Name:"), nameInput,
            new Label("Description:"), descriptionInput,
            new Label("Project Manager:"), managerInput,
            new Label("Department:"), departmentInput,
            new Label("Status:"), statusInput,
            new Label("Priority:"), priorityInput,
            new Label("Budget:"), budgetInput,
            new Label("Progress (%):"), progressSlider,
            new Label("Start Date:"), startDatePicker,
            new Label("End Date:"), endDatePicker);

    ScrollPane scrollPane = new ScrollPane(content);
    scrollPane.setFitToWidth(true);
    scrollPane.setPrefHeight(500);

    dialog.getDialogPane().setContent(scrollPane);

    // Convert result
    dialog.setResultConverter(
        dialogButton -> {
          if (dialogButton == saveButtonType) {
            Project proj = project != null ? project : new Project();
            proj.setName(nameInput.getText().trim());
            proj.setDescription(descriptionInput.getText().trim());
            proj.setProjectManager(managerInput.getText().trim());
            proj.setDepartment(departmentInput.getText().trim());
            proj.setStatus(statusInput.getValue());
            proj.setPriority(priorityInput.getValue());
            proj.setCompletionPercentage((int) progressSlider.getValue());

            try {
              proj.setBudget(Double.parseDouble(budgetInput.getText().trim()));
            } catch (NumberFormatException e) {
              proj.setBudget(0.0);
            }

            if (startDatePicker.getValue() != null) {
              proj.setStartDate(
                  startDatePicker
                      .getValue()
                      .atStartOfDay(ZoneId.systemDefault())
                      .toInstant()
                      .toEpochMilli());
            }
            if (endDatePicker.getValue() != null) {
              proj.setEndDate(
                  endDatePicker
                      .getValue()
                      .atStartOfDay(ZoneId.systemDefault())
                      .toInstant()
                      .toEpochMilli());
            }

            return proj;
          }
          return null;
        });

    Optional<Project> result = dialog.showAndWait();
    result.ifPresent(this::saveProject);
  }

  /** Saves a project (create or update). */
  private void saveProject(Project project) {
    setLoading(true);

    Task<?> task;
    if (project.getId() == null || project.getId().isEmpty()) {
      task = projectService.createProject(project);
    } else {
      task = projectService.updateProject(project);
    }

    task.setOnSucceeded(
        event ->
            Platform.runLater(
                () -> {
                  setLoading(false);
                  loadProjects();
                  showStatus("Project saved successfully", false);
                }));

    task.setOnFailed(
        event ->
            Platform.runLater(
                () -> {
                  setLoading(false);
                  showStatus("Failed to save project", true);
                  LOGGER.log(Level.SEVERE, "Save failed", task.getException());
                }));

    new Thread(task).start();
  }

  /** Shows project details dialog. */
  private void showProjectDetails(Project project) {
    Alert alert = new Alert(Alert.AlertType.INFORMATION);
    alert.setTitle("Project Details");
    alert.setHeaderText(project.getName());

    StringBuilder details = new StringBuilder();
    details.append("Description: ").append(project.getDescription()).append("\n\n");
    details.append("Project Manager: ").append(project.getProjectManager()).append("\n");
    details.append("Department: ").append(project.getDepartment()).append("\n");
    details.append("Status: ").append(formatStatus(project.getStatus())).append("\n");
    details.append("Priority: ").append(formatPriority(project.getPriority())).append("\n");
    details.append("Progress: ").append(project.getCompletionPercentage()).append("%\n\n");
    details.append("Budget: ").append(CURRENCY_FORMAT.format(project.getBudget())).append("\n");
    details.append("Spent: ").append(CURRENCY_FORMAT.format(project.getSpent())).append("\n");
    details
        .append("Remaining: ")
        .append(CURRENCY_FORMAT.format(project.getRemainingBudget()))
        .append("\n\n");

    if (project.getStartDate() > 0) {
      details
          .append("Start Date: ")
          .append(DATE_FORMAT.format(new Date(project.getStartDate())))
          .append("\n");
    }
    if (project.getEndDate() > 0) {
      details
          .append("End Date: ")
          .append(DATE_FORMAT.format(new Date(project.getEndDate())))
          .append("\n");
    }
    details.append("Team Size: ").append(project.getTeamSize()).append(" members");

    alert.setContentText(details.toString());
    alert.showAndWait();
  }

  /** Handles back button. */
  @FXML
  private void handleBack() {
    ViewNavigator.redirectToDashboard(LOGGER);
  }

  /** Redirects to login page. */
  private void redirectToLogin() {
    ViewNavigator.redirectToLogin(LOGGER);
  }

  /** Sets loading state. */
  private void setLoading(boolean loading) {
    if (loadingIndicator != null) {
      loadingIndicator.setVisible(loading);
    }
    if (addButton != null) {
      addButton.setDisable(loading);
    }
    if (refreshButton != null) {
      refreshButton.setDisable(loading);
    }
  }

  /** Shows status message. */
  private void showStatus(String message, boolean isError) {
    if (statusLabel != null) {
      statusLabel.setText(message);
      statusLabel.setStyle(
          isError
              ? "-fx-text-fill: #fee2e2; -fx-background-color: rgba(239, 68, 68, 0.3);"
              : "-fx-text-fill: rgba(255, 255, 255, 0.9); -fx-background-color: rgba(255, 255, 255,"
                    + " 0.15);");
    }
  }

  /** Updates count labels. */
  private void updateCounts(List<Project> projects) {
    if (newColumnCount != null) {
      long newCount =
          projects.stream()
              .filter(p -> "PLANNING".equals(p.getStatus()) || "ON_HOLD".equals(p.getStatus()))
              .count();
      newColumnCount.setText(String.valueOf(newCount));
    }
    if (pendingColumnCount != null) {
      long pendingCount =
          projects.stream().filter(p -> "IN_PROGRESS".equals(p.getStatus())).count();
      pendingColumnCount.setText(String.valueOf(pendingCount));
    }
    if (completedColumnCount != null) {
      long completedCount = projects.stream().filter(Project::isCompleted).count();
      completedColumnCount.setText(String.valueOf(completedCount));
    }
  }

  /** Truncates text to a maximum length. */
  private String truncateText(String text, int maxLength) {
    if (text == null || text.isEmpty()) {
      return "No description";
    }
    if (text.length() <= maxLength) {
      return text;
    }
    return text.substring(0, maxLength - 3) + "...";
  }

  /** Gets CSS style class for priority. */
  private String getPriorityStyleClass(String priority) {
    if (priority == null) return "priority-medium";
    return switch (priority) {
      case "LOW" -> "priority-low";
      case "MEDIUM" -> "priority-medium";
      case "HIGH" -> "priority-high";
      case "CRITICAL" -> "priority-critical";
      default -> "priority-medium";
    };
  }

  /** Gets CSS style class for status. */
  private String getStatusStyleClass(String status) {
    if (status == null) return "status-planning";
    return switch (status) {
      case "PLANNING" -> "status-planning";
      case "IN_PROGRESS" -> "status-in-progress";
      case "COMPLETED" -> "status-completed";
      case "ON_HOLD" -> "status-on-hold";
      case "CANCELLED" -> "status-cancelled";
      default -> "status-planning";
    };
  }

  /** Formats status for display. */
  private String formatStatus(String status) {
    if (status == null) return "";
    return switch (status) {
      case "IN_PROGRESS" -> "In Progress";
      case "COMPLETED" -> "Completed";
      case "PLANNING" -> "Planning";
      case "ON_HOLD" -> "On Hold";
      case "CANCELLED" -> "Cancelled";
      default -> status;
    };
  }

  /** Formats priority for display. */
  private String formatPriority(String priority) {
    if (priority == null) return "";
    return switch (priority) {
      case "LOW" -> "Low";
      case "MEDIUM" -> "Medium";
      case "HIGH" -> "High";
      case "CRITICAL" -> "Critical";
      default -> priority;
    };
  }

  // ==================== Sidebar Navigation Methods ====================

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

  @FXML
  private void handleDashboard() {
    navigateTo("features/dashboard/view/dashboard_view");
  }

  @FXML
  private void handleEmployees() {
    navigateTo("features/employees/view/employee_view");
  }

  @FXML
  private void handleFinance() {
    LOGGER.info("Opening Finance");
    navigateTo("features/finance/view/finance_view");
  }

  @FXML
  private void handleSettings() {
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

  private void navigateTo(String fxml) {
    ViewNavigator.navigateTo(fxml, LOGGER);
  }
}
