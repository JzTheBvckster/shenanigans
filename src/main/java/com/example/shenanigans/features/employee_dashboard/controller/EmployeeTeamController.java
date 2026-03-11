package com.example.shenanigans.features.employee_dashboard.controller;

import com.example.shenanigans.features.employees.model.Employee;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.logging.Logger;
import javafx.fxml.FXML;
import javafx.scene.layout.VBox;

/**
 * Controller for the employee team section view.
 */
public class EmployeeTeamController extends BaseEmployeeSectionController {

    private static final Logger LOGGER = Logger.getLogger(EmployeeTeamController.class.getName());

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

        String department = currentEmployee == null ? "" : safeLower(currentEmployee.getDepartment());

        List<Employee> teamMembers = safeList(allEmployees).stream()
                .filter(Objects::nonNull)
                .filter(e -> "ACTIVE".equalsIgnoreCase(safeValue(e.getStatus())))
                .filter(e -> !safeValue(e.getId())
                        .equals(safeValue(currentEmployee == null ? null : currentEmployee.getId())))
                .filter(e -> department.isBlank() || department.equals(safeLower(e.getDepartment())))
                .sorted(Comparator.comparing(e -> safeLower(e.getFullName())))
                .toList();

        addStatCard("Department", department.isBlank() ? "All" : department.toUpperCase(), "Team scope",
                "stat-card-green");
        addStatCard("Members", String.valueOf(teamMembers.size()), "Active colleagues", "stat-card-blue");
        addStatCard("Shared Projects", String.valueOf(safeList(assignedProjects).size()), "Projects in your queue",
                "stat-card-purple");

        VBox teamCard = createCard("Team Members", null);
        VBox teamBody = new VBox(10);

        if (teamMembers.isEmpty()) {
            teamBody.getChildren()
                    .add(createEmptyState("No team members found", "No matching active employees in your department"));
        } else {
            teamMembers.stream().limit(12).forEach(member -> teamBody.getChildren().add(createTeamMemberRow(member)));
        }
        teamCard.getChildren().add(teamBody);
        contentContainer.getChildren().add(teamCard);
    }
}
