package com.example.shenanigans.features.employee_dashboard.controller;

import com.example.shenanigans.features.projects.model.Project;
import java.util.Comparator;
import java.util.List;
import java.util.logging.Logger;
import javafx.fxml.FXML;
import javafx.scene.layout.VBox;

/**
 * Controller for the employee tasks section view.
 */
public class EmployeeTasksController extends BaseEmployeeSectionController {

    private static final Logger LOGGER = Logger.getLogger(EmployeeTasksController.class.getName());

    @FXML
    private VBox contentContainer;

    @Override
    protected Logger getLogger() {
        return LOGGER;
    }

    @Override
    protected void renderContent() {
        if (statsContainer != null)
            statsContainer.getChildren().clear();
        if (contentContainer != null)
            contentContainer.getChildren().clear();

        List<Project> tasks = safeList(assignedProjects).stream()
                .filter(p -> p.isActive() || p.isOverdue())
                .sorted(Comparator.comparingLong(this::effectiveDueDate))
                .toList();

        long dueToday = tasks.stream().filter(this::isDueToday).count();
        long overdue = tasks.stream().filter(Project::isOverdue).count();
        long completed = safeList(assignedProjects).stream().filter(Project::isCompleted).count();

        addStatCard("Total Tasks", String.valueOf(tasks.size()), "Assigned work items", "stat-card-blue");
        addStatCard("Due Today", String.valueOf(dueToday), "Needs attention now", "stat-card-orange");
        addStatCard("Overdue", String.valueOf(overdue), "Follow up required", "stat-card-red");
        addStatCard("Completed", String.valueOf(completed), "Delivered items", "stat-card-green");

        VBox listCard = createCard("Task List", null);
        VBox listBody = new VBox(10);

        if (tasks.isEmpty()) {
            listBody.getChildren().add(createEmptyState("No assigned tasks", "You are all caught up!"));
        } else {
            for (Project project : tasks) {
                listBody.getChildren().add(createTaskRow(project));
            }
        }
        listCard.getChildren().add(listBody);
        contentContainer.getChildren().add(listCard);
    }
}
