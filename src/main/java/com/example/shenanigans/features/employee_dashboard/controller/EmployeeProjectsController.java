package com.example.shenanigans.features.employee_dashboard.controller;

import com.example.shenanigans.features.projects.model.Project;
import java.util.List;
import java.util.logging.Logger;
import javafx.fxml.FXML;
import javafx.scene.layout.VBox;

/**
 * Controller for the employee projects section view.
 */
public class EmployeeProjectsController extends BaseEmployeeSectionController {

    private static final Logger LOGGER = Logger.getLogger(EmployeeProjectsController.class.getName());

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

        List<Project> projects = safeList(assignedProjects);
        long active = projects.stream().filter(Project::isActive).count();
        long completed = projects.stream().filter(Project::isCompleted).count();

        addStatCard("Assigned", String.valueOf(projects.size()), "All tracked projects", "stat-card-purple");
        addStatCard("Active", String.valueOf(active), "In progress now", "stat-card-green");
        addStatCard("Completed", String.valueOf(completed), "Delivered projects", "stat-card-blue");

        VBox listCard = createCard("Project Details", null);
        VBox listBody = new VBox(14);

        if (projects.isEmpty()) {
            listBody.getChildren()
                    .add(createEmptyState("No assigned projects", "Projects will appear here once assigned"));
        } else {
            for (Project project : projects) {
                listBody.getChildren().add(createProjectDetailItem(project));
            }
        }
        listCard.getChildren().add(listBody);
        contentContainer.getChildren().add(listCard);
    }
}
