package com.example.shenanigans.features.employee_dashboard.controller;

import com.example.shenanigans.features.employee_dashboard.model.CompanyDocument;
import com.example.shenanigans.features.projects.model.Project;
import java.util.List;
import java.util.logging.Logger;
import javafx.fxml.FXML;
import javafx.scene.layout.HBox;
import javafx.scene.layout.VBox;

/**
 * Controller for the employee documents section view.
 * Displays real document records from Firestore alongside project briefs.
 */
public class EmployeeDocumentsController extends BaseEmployeeSectionController {

    private static final Logger LOGGER = Logger.getLogger(EmployeeDocumentsController.class.getName());

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

        List<CompanyDocument> docs = safeList(companyDocuments);
        List<Project> projects = safeList(assignedProjects);

        long policies = docs.stream().filter(CompanyDocument::isPolicy).count();
        long templates = docs.stream().filter(CompanyDocument::isTemplate).count();
        long briefs = docs.stream().filter(d -> "PROJECT_BRIEF".equalsIgnoreCase(d.getCategory())).count();

        addStatCard("Total Docs", String.valueOf(docs.size()), "Available documents", "stat-card-blue");
        addStatCard("Policies", String.valueOf(policies), "Core employee policies", "stat-card-green");
        addStatCard("Resources", String.valueOf(templates + briefs), "Templates & project briefs", "stat-card-purple");

        // Primary: Company documents (policies + templates)
        VBox docsCard = createCard("Company Documents", null);
        VBox docsBody = new VBox(10);
        List<CompanyDocument> companyDocs = docs.stream()
                .filter(d -> d.isPolicy() || d.isTemplate())
                .toList();
        if (companyDocs.isEmpty()) {
            docsBody.getChildren()
                    .add(createEmptyState("No company documents", "Documents will appear when added by managers"));
        } else {
            companyDocs.forEach(d -> docsBody.getChildren().add(
                    createInfoRow(safeValue(d.getName()), safeValue(d.getDescription()), safeValue(d.getCategory()))));
        }
        docsCard.getChildren().add(docsBody);
        primaryContent.getChildren().add(docsCard);

        // Secondary: Project documents
        VBox projDocsCard = createCard("Project Briefs", null);
        VBox projDocsBody = new VBox(10);
        List<CompanyDocument> briefDocs = docs.stream()
                .filter(d -> "PROJECT_BRIEF".equalsIgnoreCase(d.getCategory()))
                .toList();
        if (briefDocs.isEmpty() && projects.isEmpty()) {
            projDocsBody.getChildren().add(createEmptyState("No project documents", ""));
        } else {
            briefDocs.forEach(d -> projDocsBody.getChildren().add(
                    createInfoRow(safeValue(d.getName()), safeValue(d.getDescription()), "BRIEF")));
            projects.stream().limit(5).forEach(project -> projDocsBody.getChildren().add(createInfoRow(
                    "Brief: " + safeProjectName(project),
                    "Last update " + formatDate(project.getUpdatedAt()),
                    "PROJECT")));
        }
        projDocsCard.getChildren().add(projDocsBody);
        secondaryContent.getChildren().add(projDocsCard);
    }
}
