package com.example.shenanigans.features.employee_dashboard.controller;

import com.example.shenanigans.features.employees.model.Employee;
import java.util.logging.Logger;
import javafx.fxml.FXML;
import javafx.geometry.Pos;
import javafx.scene.control.Label;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.StackPane;
import javafx.scene.layout.VBox;
import javafx.scene.shape.Circle;

/**
 * Controller for the employee profile section view.
 */
public class EmployeeProfileController extends BaseEmployeeSectionController {

    private static final Logger LOGGER = Logger.getLogger(EmployeeProfileController.class.getName());

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

        Employee employee = currentEmployee;
        if (employee == null) {
            addStatCard("Profile", "Unavailable", "No employee record matched your account", "stat-card-red");
            VBox errorCard = createCard("Profile Not Found", null);
            errorCard.getChildren().add(createEmptyState("Profile not found", "Try reloading from dashboard"));
            contentContainer.getChildren().add(errorCard);
            return;
        }

        addStatCard("Department", safeValue(employee.getDepartment()), "Assigned department", "stat-card-green");
        addStatCard("Position", safeValue(employee.getPosition()), "Current role", "stat-card-blue");
        addStatCard("Status", safeValue(employee.getStatus()), "Employment status", "stat-card-purple");

        // Profile card with avatar
        VBox profileCard = new VBox(20);
        profileCard.getStyleClass().addAll("ws-card", "profile-card");

        HBox profileHeader = new HBox(20);
        profileHeader.setAlignment(Pos.CENTER_LEFT);

        StackPane avatarPane = new StackPane();
        avatarPane.getStyleClass().add("profile-avatar-container");
        Circle avatarCircle = new Circle(36);
        avatarCircle.getStyleClass().add("profile-avatar-circle");
        Label avatarLetter = new Label(safeValue(employee.getFullName()).substring(0, 1).toUpperCase());
        avatarLetter.getStyleClass().add("profile-avatar-letter");
        avatarPane.getChildren().addAll(avatarCircle, avatarLetter);

        VBox profileInfo = new VBox(4);
        HBox.setHgrow(profileInfo, Priority.ALWAYS);
        Label nameLabel = new Label(safeValue(employee.getFullName()));
        nameLabel.getStyleClass().add("profile-name");
        Label posLabel = new Label(safeValue(employee.getPosition()) + " — " + safeValue(employee.getDepartment()));
        posLabel.getStyleClass().add("profile-position");
        Label statusLabel = new Label(safeValue(employee.getStatus()));
        statusLabel.getStyleClass().addAll("badge",
                "ACTIVE".equalsIgnoreCase(employee.getStatus()) ? "badge-green" : "badge-orange");
        profileInfo.getChildren().addAll(nameLabel, posLabel, statusLabel);

        profileHeader.getChildren().addAll(avatarPane, profileInfo);
        profileCard.getChildren().add(profileHeader);

        // Profile details
        VBox detailsGrid = new VBox(12);
        detailsGrid.getStyleClass().add("profile-details");
        detailsGrid.getChildren().addAll(
                createProfileRow("Full Name", safeValue(employee.getFullName())),
                createProfileRow("Email", safeValue(employee.getEmail())),
                createProfileRow("Phone", safeValue(employee.getPhone())),
                createProfileRow("Employee ID", safeValue(employee.getId())),
                createProfileRow("Hire Date", employee.getHireDate() > 0 ? formatDate(employee.getHireDate()) : "N/A"));
        profileCard.getChildren().add(detailsGrid);
        contentContainer.getChildren().add(profileCard);
    }
}
