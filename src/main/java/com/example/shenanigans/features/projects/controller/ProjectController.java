package com.example.shenanigans.features.projects.controller;

import com.example.shenanigans.App;
import com.example.shenanigans.core.session.SessionManager;
import com.example.shenanigans.features.projects.model.Project;
import com.example.shenanigans.features.projects.service.ProjectService;

import javafx.application.Platform;
import javafx.beans.property.SimpleStringProperty;
import javafx.collections.FXCollections;
import javafx.collections.ObservableList;
import javafx.concurrent.Task;
import javafx.fxml.FXML;
import javafx.geometry.Pos;
import javafx.scene.control.*;
import javafx.scene.control.cell.PropertyValueFactory;
import javafx.scene.layout.HBox;
import javafx.scene.layout.VBox;

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

/**
 * Controller for the projects management view.
 * Handles CRUD operations for projects.
 */
public class ProjectController {

    private static final Logger LOGGER = Logger.getLogger(ProjectController.class.getName());
    private static final SimpleDateFormat DATE_FORMAT = new SimpleDateFormat("MMM dd, yyyy");
    private static final NumberFormat CURRENCY_FORMAT = NumberFormat.getCurrencyInstance(Locale.US);

    private final ProjectService projectService = new ProjectService();
    private final ObservableList<Project> projectList = FXCollections.observableArrayList();

    // FXML Components
    @FXML
    private TableView<Project> projectTable;

    @FXML
    private TableColumn<Project, String> nameColumn;

    @FXML
    private TableColumn<Project, String> managerColumn;

    @FXML
    private TableColumn<Project, String> statusColumn;

    @FXML
    private TableColumn<Project, String> priorityColumn;

    @FXML
    private TableColumn<Project, String> progressColumn;

    @FXML
    private TableColumn<Project, String> deadlineColumn;

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

    @FXML
    private Label completedCountLabel;

    @FXML
    private Label overdueCountLabel;

    private Project selectedProject;

    /**
     * Called automatically after FXML is loaded.
     */
    @FXML
    public void initialize() {
        // Security check
        if (!SessionManager.getInstance().isLoggedIn()) {
            LOGGER.warning("Unauthorized access to projects. Redirecting to login.");
            Platform.runLater(this::redirectToLogin);
            return;
        }

        setupTable();
        setupSearch();
        loadProjects();

        LOGGER.info("ProjectController initialized");
    }

    /**
     * Sets up the table columns.
     */
    private void setupTable() {
        nameColumn.setCellValueFactory(new PropertyValueFactory<>("name"));
        managerColumn.setCellValueFactory(new PropertyValueFactory<>("projectManager"));

        // Status column with badges
        statusColumn.setCellValueFactory(
                cellData -> new SimpleStringProperty(formatStatus(cellData.getValue().getStatus())));

        statusColumn.setCellFactory(column -> new TableCell<>() {
            private final Label statusBadge = new Label();

            {
                statusBadge.setMinWidth(90);
                statusBadge.setAlignment(Pos.CENTER);
            }

            @Override
            protected void updateItem(String status, boolean empty) {
                super.updateItem(status, empty);
                if (empty || status == null) {
                    setGraphic(null);
                } else {
                    statusBadge.setText(status);
                    statusBadge.getStyleClass().clear();
                    switch (status) {
                        case "In Progress" -> statusBadge.getStyleClass().add("status-in-progress");
                        case "Completed" -> statusBadge.getStyleClass().add("status-completed");
                        case "Planning" -> statusBadge.getStyleClass().add("status-planning");
                        case "On Hold" -> statusBadge.getStyleClass().add("status-on-hold");
                        case "Cancelled" -> statusBadge.getStyleClass().add("status-cancelled");
                    }
                    setGraphic(statusBadge);
                }
            }
        });

        // Priority column with badges
        priorityColumn.setCellValueFactory(
                cellData -> new SimpleStringProperty(formatPriority(cellData.getValue().getPriority())));

        priorityColumn.setCellFactory(column -> new TableCell<>() {
            private final Label priorityBadge = new Label();

            {
                priorityBadge.setMinWidth(70);
                priorityBadge.setAlignment(Pos.CENTER);
            }

            @Override
            protected void updateItem(String priority, boolean empty) {
                super.updateItem(priority, empty);
                if (empty || priority == null) {
                    setGraphic(null);
                } else {
                    priorityBadge.setText(priority);
                    priorityBadge.getStyleClass().clear();
                    switch (priority) {
                        case "Critical" -> priorityBadge.getStyleClass().add("priority-critical");
                        case "High" -> priorityBadge.getStyleClass().add("priority-high");
                        case "Medium" -> priorityBadge.getStyleClass().add("priority-medium");
                        case "Low" -> priorityBadge.getStyleClass().add("priority-low");
                    }
                    setGraphic(priorityBadge);
                }
            }
        });

        // Progress column with progress bar
        progressColumn.setCellValueFactory(
                cellData -> new SimpleStringProperty(String.valueOf(cellData.getValue().getCompletionPercentage())));

        progressColumn.setCellFactory(column -> new TableCell<>() {
            private final ProgressBar progressBar = new ProgressBar();
            private final Label percentLabel = new Label();
            private final HBox container = new HBox(8);

            {
                progressBar.setPrefWidth(80);
                progressBar.setPrefHeight(8);
                progressBar.getStyleClass().add("project-progress-bar");
                percentLabel.getStyleClass().add("progress-label");
                container.setAlignment(Pos.CENTER_LEFT);
                container.getChildren().addAll(progressBar, percentLabel);
            }

            @Override
            protected void updateItem(String value, boolean empty) {
                super.updateItem(value, empty);
                if (empty || value == null) {
                    setGraphic(null);
                } else {
                    int percent = Integer.parseInt(value);
                    progressBar.setProgress(percent / 100.0);
                    percentLabel.setText(percent + "%");
                    setGraphic(container);
                }
            }
        });

        // Deadline column
        deadlineColumn.setCellValueFactory(cellData -> {
            long endDate = cellData.getValue().getEndDate();
            if (endDate > 0) {
                return new SimpleStringProperty(DATE_FORMAT.format(new Date(endDate)));
            }
            return new SimpleStringProperty("—");
        });

        deadlineColumn.setCellFactory(column -> new TableCell<>() {
            @Override
            protected void updateItem(String date, boolean empty) {
                super.updateItem(date, empty);
                if (empty || date == null) {
                    setText(null);
                    setStyle("");
                } else {
                    setText(date);
                    // Check if overdue
                    Project project = getTableRow().getItem();
                    if (project != null && project.isOverdue()) {
                        setStyle("-fx-text-fill: #dc2626; -fx-font-weight: bold;");
                    } else {
                        setStyle("");
                    }
                }
            }
        });

        projectTable.setItems(projectList);

        // Double-click to edit
        projectTable.setRowFactory(tv -> {
            TableRow<Project> row = new TableRow<>();
            row.setOnMouseClicked(event -> {
                if (event.getClickCount() == 2 && !row.isEmpty()) {
                    handleEditProject(row.getItem());
                }
            });
            return row;
        });

        // Context menu
        projectTable.setContextMenu(createContextMenu());
    }

    /**
     * Creates a context menu for the table.
     */
    private ContextMenu createContextMenu() {
        ContextMenu menu = new ContextMenu();

        MenuItem editItem = new MenuItem("Edit");
        editItem.setOnAction(e -> {
            Project selected = projectTable.getSelectionModel().getSelectedItem();
            if (selected != null) {
                handleEditProject(selected);
            }
        });

        MenuItem deleteItem = new MenuItem("Delete");
        deleteItem.setOnAction(e -> {
            Project selected = projectTable.getSelectionModel().getSelectedItem();
            if (selected != null) {
                handleDeleteProject(selected);
            }
        });

        MenuItem viewItem = new MenuItem("View Details");
        viewItem.setOnAction(e -> {
            Project selected = projectTable.getSelectionModel().getSelectedItem();
            if (selected != null) {
                showProjectDetails(selected);
            }
        });

        menu.getItems().addAll(viewItem, editItem, new SeparatorMenuItem(), deleteItem);
        return menu;
    }

    /**
     * Sets up search functionality.
     */
    private void setupSearch() {
        if (searchField != null) {
            searchField.textProperty().addListener((obs, oldVal, newVal) -> {
                if (newVal == null || newVal.isEmpty()) {
                    loadProjects();
                } else if (newVal.length() >= 2) {
                    searchProjects(newVal);
                }
            });
        }
    }

    /**
     * Loads all projects from Firestore.
     */
    @FXML
    private void loadProjects() {
        setLoading(true);
        showStatus("Loading projects...", false);

        Task<List<Project>> task = projectService.getAllProjects();

        task.setOnSucceeded(event -> Platform.runLater(() -> {
            setLoading(false);
            List<Project> projects = task.getValue();
            projectList.setAll(projects);
            updateCounts(projects);
            showStatus("Loaded " + projects.size() + " projects", false);
        }));

        task.setOnFailed(event -> Platform.runLater(() -> {
            setLoading(false);
            showStatus("Failed to load projects", true);
            LOGGER.log(Level.SEVERE, "Failed to load projects", task.getException());
        }));

        new Thread(task).start();
    }

    /**
     * Searches projects.
     */
    private void searchProjects(String query) {
        setLoading(true);

        Task<List<Project>> task = projectService.searchProjects(query);

        task.setOnSucceeded(event -> Platform.runLater(() -> {
            setLoading(false);
            projectList.setAll(task.getValue());
        }));

        task.setOnFailed(event -> Platform.runLater(() -> {
            setLoading(false);
            LOGGER.log(Level.WARNING, "Search failed", task.getException());
        }));

        new Thread(task).start();
    }

    /**
     * Opens dialog to add a new project.
     */
    @FXML
    private void handleAddProject() {
        selectedProject = null;
        showProjectDialog("Create New Project", null);
    }

    /**
     * Opens dialog to edit a project.
     */
    private void handleEditProject(Project project) {
        selectedProject = project;
        showProjectDialog("Edit Project", project);
    }

    /**
     * Deletes a project.
     */
    private void handleDeleteProject(Project project) {
        Alert confirm = new Alert(Alert.AlertType.CONFIRMATION);
        confirm.setTitle("Delete Project");
        confirm.setHeaderText("Delete \"" + project.getName() + "\"?");
        confirm.setContentText("This action cannot be undone. All project data will be permanently deleted.");

        Optional<ButtonType> result = confirm.showAndWait();
        if (result.isPresent() && result.get() == ButtonType.OK) {
            setLoading(true);

            Task<Void> task = projectService.deleteProject(project.getId());

            task.setOnSucceeded(event -> Platform.runLater(() -> {
                setLoading(false);
                loadProjects();
                showStatus("Project deleted", false);
            }));

            task.setOnFailed(event -> Platform.runLater(() -> {
                setLoading(false);
                showStatus("Failed to delete project", true);
                LOGGER.log(Level.SEVERE, "Delete failed", task.getException());
            }));

            new Thread(task).start();
        }
    }

    /**
     * Shows the project add/edit dialog.
     */
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
                startDatePicker.setValue(LocalDate.ofInstant(
                        new Date(project.getStartDate()).toInstant(), ZoneId.systemDefault()));
            }
            if (project.getEndDate() > 0) {
                endDatePicker.setValue(LocalDate.ofInstant(
                        new Date(project.getEndDate()).toInstant(), ZoneId.systemDefault()));
            }
        }

        content.getChildren().addAll(
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
        dialog.setResultConverter(dialogButton -> {
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
                    proj.setStartDate(startDatePicker.getValue()
                            .atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli());
                }
                if (endDatePicker.getValue() != null) {
                    proj.setEndDate(endDatePicker.getValue()
                            .atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli());
                }

                return proj;
            }
            return null;
        });

        Optional<Project> result = dialog.showAndWait();
        result.ifPresent(this::saveProject);
    }

    /**
     * Saves a project (create or update).
     */
    private void saveProject(Project project) {
        setLoading(true);

        Task<?> task;
        if (project.getId() == null || project.getId().isEmpty()) {
            task = projectService.createProject(project);
        } else {
            task = projectService.updateProject(project);
        }

        task.setOnSucceeded(event -> Platform.runLater(() -> {
            setLoading(false);
            loadProjects();
            showStatus("Project saved successfully", false);
        }));

        task.setOnFailed(event -> Platform.runLater(() -> {
            setLoading(false);
            showStatus("Failed to save project", true);
            LOGGER.log(Level.SEVERE, "Save failed", task.getException());
        }));

        new Thread(task).start();
    }

    /**
     * Shows project details dialog.
     */
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
        details.append("Remaining: ").append(CURRENCY_FORMAT.format(project.getRemainingBudget())).append("\n\n");

        if (project.getStartDate() > 0) {
            details.append("Start Date: ").append(DATE_FORMAT.format(new Date(project.getStartDate()))).append("\n");
        }
        if (project.getEndDate() > 0) {
            details.append("End Date: ").append(DATE_FORMAT.format(new Date(project.getEndDate()))).append("\n");
        }
        details.append("Team Size: ").append(project.getTeamSize()).append(" members");

        alert.setContentText(details.toString());
        alert.showAndWait();
    }

    /**
     * Handles back button.
     */
    @FXML
    private void handleBack() {
        try {
            App.setRoot("features/dashboard/view/dashboard_view");
        } catch (Exception e) {
            LOGGER.log(Level.SEVERE, "Navigation failed", e);
        }
    }

    /**
     * Redirects to login page.
     */
    private void redirectToLogin() {
        try {
            App.setRoot("features/auth/view/auth_view");
        } catch (Exception e) {
            LOGGER.log(Level.SEVERE, "Failed to redirect to login", e);
        }
    }

    /**
     * Sets loading state.
     */
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

    /**
     * Shows status message.
     */
    private void showStatus(String message, boolean isError) {
        if (statusLabel != null) {
            statusLabel.setText(message);
            statusLabel.setStyle(isError
                    ? "-fx-text-fill: #fee2e2; -fx-background-color: rgba(239, 68, 68, 0.3);"
                    : "-fx-text-fill: rgba(255, 255, 255, 0.9); -fx-background-color: rgba(255, 255, 255, 0.15);");
        }
    }

    /**
     * Updates count labels.
     */
    private void updateCounts(List<Project> projects) {
        if (totalCountLabel != null) {
            totalCountLabel.setText(String.valueOf(projects.size()));
        }
        if (activeCountLabel != null) {
            long activeCount = projects.stream()
                    .filter(p -> "IN_PROGRESS".equals(p.getStatus()))
                    .count();
            activeCountLabel.setText(String.valueOf(activeCount));
        }
        if (completedCountLabel != null) {
            long completedCount = projects.stream()
                    .filter(Project::isCompleted)
                    .count();
            completedCountLabel.setText(String.valueOf(completedCount));
        }
        if (overdueCountLabel != null) {
            long overdueCount = projects.stream()
                    .filter(Project::isOverdue)
                    .count();
            overdueCountLabel.setText(String.valueOf(overdueCount));
        }
    }

    /**
     * Formats status for display.
     */
    private String formatStatus(String status) {
        if (status == null)
            return "";
        return switch (status) {
            case "IN_PROGRESS" -> "In Progress";
            case "COMPLETED" -> "Completed";
            case "PLANNING" -> "Planning";
            case "ON_HOLD" -> "On Hold";
            case "CANCELLED" -> "Cancelled";
            default -> status;
        };
    }

    /**
     * Formats priority for display.
     */
    private String formatPriority(String priority) {
        if (priority == null)
            return "";
        return switch (priority) {
            case "LOW" -> "Low";
            case "MEDIUM" -> "Medium";
            case "HIGH" -> "High";
            case "CRITICAL" -> "Critical";
            default -> priority;
        };
    }
}
