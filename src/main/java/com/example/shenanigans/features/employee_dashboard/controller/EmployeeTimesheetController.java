package com.example.shenanigans.features.employee_dashboard.controller;

import com.example.shenanigans.features.employee_dashboard.model.TimesheetEntry;
import com.example.shenanigans.features.projects.model.Project;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.TemporalAdjusters;
import java.util.List;
import java.util.logging.Logger;
import javafx.fxml.FXML;
import javafx.geometry.Pos;
import javafx.scene.control.Button;
import javafx.scene.control.ComboBox;
import javafx.scene.control.DatePicker;
import javafx.scene.control.Label;
import javafx.scene.control.ProgressBar;
import javafx.scene.control.Spinner;
import javafx.scene.control.SpinnerValueFactory;
import javafx.scene.control.TextField;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.Region;
import javafx.scene.layout.VBox;

/**
 * Controller for the employee time sheet section view.
 * Displays real timesheet entries from Firestore with ability to log new hours.
 */
public class EmployeeTimesheetController extends BaseEmployeeSectionController {

    private static final Logger LOGGER = Logger.getLogger(EmployeeTimesheetController.class.getName());

    @FXML
    private HBox contentGrid;
    @FXML
    private VBox primaryContent;
    @FXML
    private VBox secondaryContent;

    @Override
    protected Logger getLogger() {
        return LOGGER;
    }

    @Override
    protected void renderContent() {
        if (statsContainer != null)
            statsContainer.getChildren().clear();
        if (primaryContent != null)
            primaryContent.getChildren().clear();
        if (secondaryContent != null)
            secondaryContent.getChildren().clear();

        List<TimesheetEntry> entries = safeList(timesheetEntries);

        // Calculate this week's hours
        LocalDate today = LocalDate.now();
        LocalDate weekStart = today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        long weekStartMillis = weekStart.atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli();
        long weekEndMillis = weekStart.plusDays(7).atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli();

        double weekHours = entries.stream()
                .filter(e -> e.getDate() >= weekStartMillis && e.getDate() < weekEndMillis)
                .mapToDouble(TimesheetEntry::getHours)
                .sum();
        long weekEntryCount = entries.stream()
                .filter(e -> e.getDate() >= weekStartMillis && e.getDate() < weekEndMillis)
                .count();
        double remaining = Math.max(0, 40 - weekHours);

        addStatCard("This Week", String.format("%.1fh", weekHours), "Logged from timesheet entries", "stat-card-green");
        addStatCard("Remaining", String.format("%.1fh", remaining), "Until 40h weekly target", "stat-card-blue");
        addStatCard("Entries", String.valueOf(weekEntryCount), "This week's time slots", "stat-card-purple");

        // Primary: Log form + entries list
        VBox formCard = buildLogForm();
        primaryContent.getChildren().add(formCard);

        VBox entriesCard = createCard("Time Entries", null);
        VBox entriesBody = new VBox(10);

        if (entries.isEmpty()) {
            entriesBody.getChildren().add(
                    createEmptyState("No time entries yet", "Use the form above to log your first hours"));
        } else {
            entries.stream().limit(10).forEach(entry -> {
                String dateStr = formatDate(entry.getDate());
                String title = safeValue(entry.getProjectName()) + " \u2014 " +
                        String.format("%.1fh", entry.getHours());
                String desc = dateStr + (entry.getDescription() != null && !entry.getDescription().isBlank()
                        ? " \u2022 " + entry.getDescription()
                        : "");
                entriesBody.getChildren().add(
                        createInfoRow(title, desc, String.format("%.1fh", entry.getHours())));
            });
        }
        entriesCard.getChildren().add(entriesBody);
        primaryContent.getChildren().add(entriesCard);

        // Secondary: Weekly Summary + Reminders
        VBox summaryCard = createCard("Weekly Summary", null);
        VBox summaryBody = new VBox(12);
        double pct = Math.min(1.0, weekHours / 40.0);
        ProgressBar weekBar = new ProgressBar(pct);
        weekBar.setMaxWidth(Double.MAX_VALUE);
        weekBar.getStyleClass().add("time-progress-bar");
        Label summaryLabel = new Label(String.format("%.1fh of 40h target (%d%% utilized)",
                weekHours, Math.round(pct * 100)));
        summaryLabel.getStyleClass().add("detail-row-meta");
        summaryBody.getChildren().addAll(weekBar, summaryLabel);
        summaryCard.getChildren().add(summaryBody);
        secondaryContent.getChildren().add(summaryCard);

        VBox tipsCard = createCard("Reminders", null);
        VBox tipsBody = new VBox(10);
        tipsBody.getChildren().addAll(
                createInfoRow("Weekly check-in", "Submit your final timesheet before Friday 6 PM", "REMINDER"),
                createInfoRow("Time allocation", "Split hours across projects based on actual effort", "TIP"));
        tipsCard.getChildren().add(tipsBody);
        secondaryContent.getChildren().add(tipsCard);
    }

    private VBox buildLogForm() {
        VBox card = createCard("Log Time Entry", null);
        HBox form = new HBox(12);
        form.setAlignment(Pos.CENTER_LEFT);

        List<Project> activeProjects = safeList(assignedProjects).stream()
                .filter(Project::isActive).toList();

        ComboBox<String> projectPicker = new ComboBox<>();
        projectPicker.setPromptText("Select project\u2026");
        activeProjects.forEach(p -> projectPicker.getItems().add(safeProjectName(p)));
        projectPicker.setMaxWidth(200);

        DatePicker datePicker = new DatePicker(LocalDate.now());
        datePicker.setMaxWidth(140);

        Spinner<Double> hourSpinner = new Spinner<>();
        hourSpinner.setValueFactory(new SpinnerValueFactory.DoubleSpinnerValueFactory(0.25, 24, 1, 0.25));
        hourSpinner.setEditable(true);
        hourSpinner.setMaxWidth(90);

        TextField descField = new TextField();
        descField.setPromptText("Description");
        HBox.setHgrow(descField, Priority.ALWAYS);

        Button saveBtn = new Button("Save");
        saveBtn.getStyleClass().add("action-button");
        saveBtn.setOnAction(e -> {
            int idx = projectPicker.getSelectionModel().getSelectedIndex();
            if (idx < 0)
                return;
            Project selected = activeProjects.get(idx);

            TimesheetEntry entry = new TimesheetEntry();
            entry.setEmployeeId(currentEmployee != null ? currentEmployee.getId() : "");
            entry.setEmployeeName(currentEmployee != null ? safeValue(currentEmployee.getFullName()) : "");
            entry.setProjectId(selected.getId());
            entry.setProjectName(safeProjectName(selected));
            entry.setDate(datePicker.getValue().atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli());
            entry.setHours(hourSpinner.getValue());
            entry.setDescription(descField.getText());

            javafx.concurrent.Task<TimesheetEntry> saveTask = timesheetService.createEntry(entry);
            saveTask.setOnSucceeded(ev -> loadData());
            saveTask.setOnFailed(ev -> getLogger().warning("Failed to save timesheet: " + saveTask.getException()));
            Thread t = new Thread(saveTask, "ts-save");
            t.setDaemon(true);
            t.start();
        });

        form.getChildren().addAll(projectPicker, datePicker, hourSpinner, descField, saveBtn);
        card.getChildren().add(form);
        return card;
    }
}
