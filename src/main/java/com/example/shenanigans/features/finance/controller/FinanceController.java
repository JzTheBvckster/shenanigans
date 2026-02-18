package com.example.shenanigans.features.finance.controller;

import com.example.shenanigans.core.navigation.SidebarComponent;
import com.example.shenanigans.core.navigation.ViewNavigator;
import com.example.shenanigans.core.session.SessionManager;
import com.example.shenanigans.core.theme.ThemeSettingsDialogComponent;
import com.example.shenanigans.features.finance.model.Invoice;
import com.example.shenanigans.features.finance.service.FinanceService;
import java.io.BufferedWriter;
import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardOpenOption;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.logging.Level;
import java.util.logging.Logger;
import javafx.application.Platform;
import javafx.fxml.FXML;
import javafx.geometry.Pos;
import javafx.scene.control.Button;
import javafx.scene.control.ButtonType;
import javafx.scene.control.CheckBox;
import javafx.scene.control.Dialog;
import javafx.scene.control.DialogPane;
import javafx.scene.control.Label;
import javafx.scene.control.ProgressIndicator;
import javafx.scene.control.TextField;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.StackPane;
import javafx.scene.layout.VBox;
import javafx.scene.shape.SVGPath;
import javafx.stage.FileChooser;

/** Controller for the finance view. */
public class FinanceController {

    private static final Logger LOGGER = Logger.getLogger(FinanceController.class.getName());
    private static final DateTimeFormatter INVOICE_DATE_FORMATTER = DateTimeFormatter.ofPattern("MMM d, yyyy")
            .withZone(ZoneId.systemDefault());

    private final FinanceService financeService = new FinanceService();

    // cached invoices for export and local operations
    private final List<Invoice> currentInvoices = new ArrayList<>();

    private SidebarComponent sidebarComponent;

    // Sidebar components
    @FXML
    private VBox sidebarContent;

    @FXML
    private Button sidebarToggleButton;

    @FXML
    private Label menuHeaderLabel;

    @FXML
    private VBox mainMenuSection;

    @FXML
    private Label settingsHeaderLabel;

    @FXML
    private VBox settingsSection;

    @FXML
    private Button dashboardButton;

    @FXML
    private Button employeesButton;

    @FXML
    private Button projectsButton;

    @FXML
    private Button financeButton;

    @FXML
    private Button settingsButton;

    @FXML
    private VBox systemInfoCard;

    @FXML
    private Label systemInfoTitle;

    @FXML
    private Label systemInfoText;

    // Kanban column containers (Due, Paid)
    @FXML
    private VBox newInvoicesContainer;

    @FXML
    private VBox paidInvoicesContainer;

    @FXML
    private ProgressIndicator loadingIndicator;

    @FXML
    private Button addInvoiceButton;

    @FXML
    private Button exportButton;

    @FXML
    private Label statusLabel;

    @FXML
    private Button refreshButton;

    @FXML
    private Label newColumnCount;

    @FXML
    private Label paidColumnCount;

    @FXML
    public void initialize() {
        // Basic auth check
        if (!SessionManager.getInstance().isLoggedIn()) {
            LOGGER.warning("Unauthorized access to finance. Redirecting to login.");
            Platform.runLater(this::redirectToLogin);
            return;
        }

        initializeSidebarComponent();

        loadInvoices();
    }

    private void loadInvoices() {
        if (loadingIndicator != null)
            loadingIndicator.setVisible(true);
        var task = financeService.getAllInvoices();
        task.setOnSucceeded(
                evt -> Platform.runLater(
                        () -> {
                            if (loadingIndicator != null)
                                loadingIndicator.setVisible(false);
                            List<Invoice> list = task.getValue();
                            // cache current invoices for export and local operations
                            currentInvoices.clear();
                            if (list != null)
                                currentInvoices.addAll(list);
                            if (newInvoicesContainer != null)
                                newInvoicesContainer.getChildren().clear();
                            if (paidInvoicesContainer != null)
                                paidInvoicesContainer.getChildren().clear();

                            if (list == null)
                                list = List.of();

                            int total = list.size();
                            for (Invoice inv : list) {
                                HBox card = createInvoiceCard(inv);
                                // Route to appropriate kanban column
                                if (inv.isPaid()) {
                                    if (paidInvoicesContainer != null)
                                        paidInvoicesContainer.getChildren().add(card);
                                } else {
                                    if (newInvoicesContainer != null)
                                        newInvoicesContainer.getChildren().add(card);
                                }
                            }

                            updateKanbanCounts();
                            if (statusLabel != null)
                                statusLabel.setText("Loaded " + total + " invoices");
                        }));
        task.setOnFailed(
                evt -> Platform.runLater(
                        () -> {
                            if (loadingIndicator != null)
                                loadingIndicator.setVisible(false);
                            LOGGER.log(Level.SEVERE, "Failed to load invoices", task.getException());
                            if (statusLabel != null) {
                                statusLabel.setText("Failed to load invoices");
                            }
                        }));
        new Thread(task).start();
    }

    @FXML
    private void handleRefresh() {
        loadInvoices();
    }

    @FXML
    private void handleAddInvoice() {
        Dialog<ButtonType> dialog = new Dialog<>();
        dialog.setTitle("Add Invoice");
        DialogPane pane = dialog.getDialogPane();

        TextField clientField = new TextField();
        clientField.setPromptText("Client name");
        TextField amountField = new TextField();
        amountField.setPromptText("Amount");
        CheckBox paidBox = new CheckBox("Paid");

        javafx.scene.layout.GridPane grid = new javafx.scene.layout.GridPane();
        grid.setHgap(10);
        grid.setVgap(10);
        grid.add(new Label("Client:"), 0, 0);
        grid.add(clientField, 1, 0);
        grid.add(new Label("Amount:"), 0, 1);
        grid.add(amountField, 1, 1);
        grid.add(paidBox, 1, 2);

        pane.setContent(grid);
        pane.getButtonTypes().addAll(ButtonType.OK, ButtonType.CANCEL);

        dialog.setResultConverter(btn -> btn);
        var result = dialog.showAndWait();
        if (result.isPresent() && result.get() == ButtonType.OK) {
            String client = clientField.getText().trim();
            String amountText = amountField.getText().trim();
            double amount = 0.0;
            try {
                amount = Double.parseDouble(amountText);
            } catch (NumberFormatException ex) {
                LOGGER.warning("Invalid amount entered for invoice");
                return;
            }

            Invoice invoice = new Invoice();
            // generate simple id
            String id = "INV-" + (currentInvoices.size() + 1);
            invoice.setId(id);
            invoice.setClient(client);
            invoice.setAmount(amount);
            invoice.setPaid(paidBox.isSelected());

            var task = financeService.createInvoice(invoice);
            task.setOnSucceeded(
                    evt -> Platform.runLater(
                            () -> {
                                // refresh list after creation
                                loadInvoices();
                            }));
            task.setOnFailed(
                    evt -> LOGGER.log(Level.SEVERE, "Failed to create invoice", task.getException()));
            new Thread(task).start();
        }
    }

    @FXML
    private void handleExport() {
        if (currentInvoices.isEmpty()) {
            LOGGER.info("No invoices to export");
            return;
        }
        FileChooser chooser = new FileChooser();
        chooser.setTitle("Export Invoices");
        chooser.getExtensionFilters().add(new FileChooser.ExtensionFilter("CSV Files", "*.csv"));
        File file = chooser.showSaveDialog(exportButton == null ? null : exportButton.getScene().getWindow());
        if (file == null)
            return;

        try (BufferedWriter writer = Files.newBufferedWriter(
                file.toPath(),
                StandardCharsets.UTF_8,
                StandardOpenOption.CREATE,
                StandardOpenOption.TRUNCATE_EXISTING)) {
            writer.write("id,client,amount,paid,issuedAt\n");
            for (Invoice inv : currentInvoices) {
                writer.write(
                        String.format(
                                "%s,%s,%.2f,%s,%d\n",
                                inv.getId(),
                                inv.getClient().replace(",", " "),
                                inv.getAmount(),
                                inv.isPaid(),
                                inv.getIssuedAt()));
            }
        } catch (IOException e) {
            LOGGER.log(Level.SEVERE, "Failed to export invoices", e);
        }
    }

    private HBox createInvoiceCard(Invoice inv) {
        HBox root = new HBox();
        root.getStyleClass().addAll("invoice-row", "invoice-card");
        root.setSpacing(12);
        root.setAlignment(Pos.CENTER_LEFT);

        VBox left = new VBox();
        left.setSpacing(4);
        left.getStyleClass().add("invoice-main");

        Label id = new Label(inv.getId());
        id.getStyleClass().add("invoice-id");

        Label client = new Label(inv.getClient());
        client.getStyleClass().add("invoice-client");

        HBox issuedMeta = new HBox();
        issuedMeta.setSpacing(4);
        issuedMeta.setAlignment(Pos.CENTER_LEFT);
        issuedMeta.getStyleClass().add("invoice-issued-row");

        StackPane issuedIconContainer = new StackPane();
        issuedIconContainer.getStyleClass().add("invoice-issued-icon-container");

        SVGPath issuedIcon = new SVGPath();
        issuedIcon
                .setContent(
                        "M4 2h2v2h4V2h2v2h2a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2V2zm10 6H4v6h10V8z");
        issuedIcon.getStyleClass().add("invoice-issued-svg");
        issuedIconContainer.getChildren().add(issuedIcon);

        Label issuedDate = new Label(formatIssuedDate(inv.getIssuedAt()));
        issuedDate.getStyleClass().add("invoice-issued");

        issuedMeta.getChildren().addAll(issuedIconContainer, issuedDate);

        left.getChildren().addAll(id, client, issuedMeta);

        javafx.scene.layout.Region spacer = new javafx.scene.layout.Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        VBox right = new VBox();
        right.setSpacing(6);
        right.setAlignment(Pos.CENTER_RIGHT);
        right.getStyleClass().add("invoice-meta");

        Label amount = new Label("$" + String.format("%.2f", inv.getAmount()));
        amount.getStyleClass().add("invoice-amount");

        Label status = new Label(inv.isPaid() ? "PAID" : "OUTSTANDING");
        status.getStyleClass().add("invoice-status-badge");
        applyStatusStyle(status, inv.isPaid());

        HBox actions = new HBox();
        actions.setSpacing(8);
        actions.getStyleClass().add("invoice-actions");

        Button togglePaid = new Button(inv.isPaid() ? "Mark Unpaid" : "Mark Paid");
        togglePaid.getStyleClass().add("invoice-toggle-button");
        togglePaid.setOnAction(
                e -> {
                    inv.setPaid(!inv.isPaid());
                    status.setText(inv.isPaid() ? "PAID" : "OUTSTANDING");
                    applyStatusStyle(status, inv.isPaid());
                    togglePaid.setText(inv.isPaid() ? "Mark Unpaid" : "Mark Paid");

                    // Move card between kanban columns on status change
                    javafx.scene.Parent parent = root.getParent();
                    if (parent instanceof VBox) {
                        ((VBox) parent).getChildren().remove(root);
                    }
                    if (inv.isPaid()) {
                        if (paidInvoicesContainer != null)
                            paidInvoicesContainer.getChildren().add(root);
                    } else {
                        if (newInvoicesContainer != null)
                            newInvoicesContainer.getChildren().add(root);
                    }

                    updateKanbanCounts();

                    var t = financeService.updateInvoice(inv);
                    t.setOnFailed(
                            evt -> LOGGER.log(Level.SEVERE, "Failed to update invoice", t.getException()));
                    new Thread(t).start();
                });

        Button delete = new Button("Delete");
        delete.getStyleClass().add("invoice-delete-button");
        delete.setOnAction(
                e -> {
                    var t = financeService.deleteInvoice(inv.getId());
                    t.setOnSucceeded(
                            evt -> Platform.runLater(
                                    () -> {
                                        javafx.scene.Parent parent = root.getParent();
                                        if (parent instanceof VBox) {
                                            ((VBox) parent).getChildren().remove(root);
                                        }
                                        updateKanbanCounts();
                                    }));
                    t.setOnFailed(
                            evt -> LOGGER.log(Level.SEVERE, "Failed to delete invoice", t.getException()));
                    new Thread(t).start();
                });

        actions.getChildren().addAll(togglePaid, delete);

        right.getChildren().addAll(amount, status, actions);

        root.getChildren().addAll(left, spacer, right);
        return root;
    }

    private void applyStatusStyle(Label statusLabel, boolean paid) {
        statusLabel.getStyleClass().removeAll("invoice-status-paid", "invoice-status-outstanding");
        statusLabel.getStyleClass().add(paid ? "invoice-status-paid" : "invoice-status-outstanding");
    }

    private String formatIssuedDate(long issuedAtEpochMillis) {
        if (issuedAtEpochMillis <= 0) {
            return "Issued: N/A";
        }
        return "Issued: " + INVOICE_DATE_FORMATTER.format(Instant.ofEpochMilli(issuedAtEpochMillis));
    }

    private void redirectToLogin() {
        ViewNavigator.redirectToLogin(LOGGER);
    }

    private void updateKanbanCounts() {
        if (newColumnCount != null) {
            int dueCount = newInvoicesContainer == null ? 0 : newInvoicesContainer.getChildren().size();
            newColumnCount.setText(String.valueOf(dueCount));
        }
        if (paidColumnCount != null) {
            int paidCount = paidInvoicesContainer == null ? 0 : paidInvoicesContainer.getChildren().size();
            paidColumnCount.setText(String.valueOf(paidCount));
        }
    }

    // ==================== Sidebar helpers ====================

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
    private void handleProjects() {
        navigateTo("features/projects/view/project_view");
    }

    @FXML
    private void handleFinance() {
        // already on finance - no op
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
        sidebarComponent = new SidebarComponent(
                LOGGER,
                sidebarContent,
                sidebarToggleButton,
                menuHeaderLabel,
                settingsHeaderLabel,
                systemInfoCard,
                new Button[] {
                        dashboardButton, employeesButton, projectsButton, financeButton, settingsButton
                },
                new String[] { "Dashboard", "Employees", "Projects", "Finance", "Settings" });
        sidebarComponent.initialize();
    }

    private void navigateTo(String fxml) {
        ViewNavigator.navigateTo(fxml, LOGGER);
    }
}
