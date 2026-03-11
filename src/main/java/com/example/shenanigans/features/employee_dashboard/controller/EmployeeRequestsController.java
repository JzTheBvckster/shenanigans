package com.example.shenanigans.features.employee_dashboard.controller;

import com.example.shenanigans.features.employee_dashboard.model.LeaveRequest;
import com.example.shenanigans.features.employees.model.Employee;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.logging.Logger;
import javafx.fxml.FXML;
import javafx.geometry.Pos;
import javafx.scene.control.Button;
import javafx.scene.control.ComboBox;
import javafx.scene.control.DatePicker;
import javafx.scene.control.Label;
import javafx.scene.control.TextField;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.VBox;

/**
 * Controller for the employee leave requests section view.
 * Displays real leave requests from Firestore with ability to submit new ones.
 */
public class EmployeeRequestsController extends BaseEmployeeSectionController {

    private static final Logger LOGGER = Logger.getLogger(EmployeeRequestsController.class.getName());

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

        Employee employee = currentEmployee;
        String status = employee == null ? "UNKNOWN" : safeValue(employee.getStatus());
        List<LeaveRequest> requests = safeList(leaveRequests);

        long pending = requests.stream().filter(LeaveRequest::isPending).count();
        long approved = requests.stream().filter(LeaveRequest::isApproved).count();

        addStatCard("Status", status, "Employment availability", "stat-card-green");
        addStatCard("Approved", String.valueOf(approved), "Approved leave requests", "stat-card-blue");
        addStatCard("Pending", String.valueOf(pending), "Awaiting manager review", "stat-card-purple");

        // Primary: Submit form + request list
        VBox formCard = buildRequestForm();
        primaryContent.getChildren().add(formCard);

        VBox requestsCard = createCard("My Requests", null);
        VBox requestsBody = new VBox(10);

        if (requests.isEmpty()) {
            requestsBody.getChildren().add(
                    createEmptyState("No leave requests", "Use the form above to submit your first request"));
        } else {
            requests.forEach(r -> {
                String title = safeValue(r.getType()) + " Leave";
                String dates = formatDate(r.getStartDate()) + " \u2013 " + formatDate(r.getEndDate());
                String desc = dates + (r.getReason() != null && !r.getReason().isBlank()
                        ? " \u2022 " + r.getReason()
                        : "");
                String badge = safeValue(r.getStatus());
                requestsBody.getChildren().add(createInfoRow(title, desc, badge));
            });
        }
        requestsCard.getChildren().add(requestsBody);
        primaryContent.getChildren().add(requestsCard);

        // Secondary: Leave Policy
        VBox policyCard = createCard("Leave Policy", null);
        VBox policyBody = new VBox(10);
        policyBody.getChildren().addAll(
                createInfoRow("Annual leave", "20 days per year (pro-rated for new joiners)", "POLICY"),
                createInfoRow("Sick leave", "Up to 10 days with medical certificate", "POLICY"),
                createInfoRow("Personal leave", "3 days per year for personal matters", "POLICY"));
        policyCard.getChildren().add(policyBody);
        secondaryContent.getChildren().add(policyCard);
    }

    private VBox buildRequestForm() {
        VBox card = createCard("New Leave Request", null);
        HBox form = new HBox(12);
        form.setAlignment(Pos.CENTER_LEFT);

        ComboBox<String> typePicker = new ComboBox<>();
        typePicker.setPromptText("Leave type\u2026");
        typePicker.getItems().addAll("ANNUAL", "SICK", "PERSONAL");
        typePicker.setMaxWidth(150);

        DatePicker startPicker = new DatePicker(LocalDate.now());
        startPicker.setMaxWidth(140);
        DatePicker endPicker = new DatePicker(LocalDate.now());
        endPicker.setMaxWidth(140);

        TextField reasonField = new TextField();
        reasonField.setPromptText("Reason (optional)");
        HBox.setHgrow(reasonField, Priority.ALWAYS);

        Button submitBtn = new Button("Submit");
        submitBtn.getStyleClass().add("action-button");
        submitBtn.setOnAction(e -> {
            if (typePicker.getValue() == null)
                return;
            if (endPicker.getValue().isBefore(startPicker.getValue()))
                return;

            LeaveRequest req = new LeaveRequest();
            req.setEmployeeId(currentEmployee != null ? currentEmployee.getId() : "");
            req.setEmployeeName(currentEmployee != null ? safeValue(currentEmployee.getFullName()) : "");
            req.setType(typePicker.getValue());
            req.setStartDate(startPicker.getValue().atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli());
            req.setEndDate(endPicker.getValue().atStartOfDay(ZoneId.systemDefault()).toInstant().toEpochMilli());
            req.setReason(reasonField.getText());

            javafx.concurrent.Task<LeaveRequest> saveTask = leaveRequestService.createRequest(req);
            saveTask.setOnSucceeded(ev -> loadData());
            saveTask.setOnFailed(ev -> getLogger().warning("Failed to save leave request: " + saveTask.getException()));
            Thread t = new Thread(saveTask, "lr-save");
            t.setDaemon(true);
            t.start();
        });

        form.getChildren().addAll(typePicker, startPicker, endPicker, reasonField, submitBtn);
        card.getChildren().add(form);
        return card;
    }
}
