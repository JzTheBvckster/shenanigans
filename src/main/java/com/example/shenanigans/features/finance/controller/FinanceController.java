package com.example.shenanigans.features.finance.controller;

import com.example.shenanigans.core.session.SessionManager;
import com.example.shenanigans.core.theme.ThemeService;
import com.example.shenanigans.features.finance.model.Invoice;
import com.example.shenanigans.features.finance.service.FinanceService;
import javafx.animation.KeyFrame;
import javafx.animation.KeyValue;
import javafx.animation.Timeline;
import javafx.application.Platform;
import javafx.scene.control.ButtonType;
import javafx.scene.control.CheckBox;
import javafx.scene.control.Dialog;
import javafx.scene.control.DialogPane;
import javafx.scene.control.TextField;
import javafx.stage.FileChooser;
import javafx.fxml.FXML;
import javafx.geometry.Insets;
import javafx.geometry.Pos;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.control.ProgressIndicator;
import javafx.scene.layout.HBox;
import javafx.scene.layout.Priority;
import javafx.scene.layout.VBox;
import javafx.scene.paint.Color;
import javafx.scene.shape.SVGPath;
import javafx.util.Duration;

import java.util.List;
import java.util.ArrayList;
import java.io.BufferedWriter;
import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.StandardOpenOption;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Controller for the finance view.
 */
public class FinanceController {

    private static final Logger LOGGER = Logger.getLogger(FinanceController.class.getName());

    private final FinanceService financeService = new FinanceService();

    // cached invoices for export and local operations
    private final List<Invoice> currentInvoices = new ArrayList<>();

    // Sidebar constants
    private static final double SIDEBAR_EXPANDED_WIDTH = 280;
    private static final double SIDEBAR_COLLAPSED_WIDTH = 100;
    private static final double ANIMATION_DURATION_MS = 250;

    private boolean sidebarExpanded = true;

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

    @FXML
    private VBox invoicesContainer;

    // Kanban column containers (New, Due, Completed)
    @FXML
    private VBox newProjectsContainer;

    @FXML
    private VBox newProjectsContainer1;

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
    private Label totalCountLabel;

    @FXML
    private Label activeCountLabel;

    @FXML
    private Label completedCountLabel;

    @FXML
    public void initialize() {
        // Basic auth check
        if (!SessionManager.getInstance().isLoggedIn()) {
            LOGGER.warning("Unauthorized access to finance. Redirecting to login.");
            Platform.runLater(this::redirectToLogin);
            return;
        }

        // Setup sidebar icons and apply stored state
        setupSidebarIcons();
        try {
            sidebarExpanded = SessionManager.getInstance().isSidebarExpanded();
            if (sidebarContent != null) {
                sidebarContent.setPrefWidth(sidebarExpanded ? SIDEBAR_EXPANDED_WIDTH : SIDEBAR_COLLAPSED_WIDTH);
            }
            updateSidebarCollapsedState(!sidebarExpanded);
            if (sidebarToggleButton != null) {
                Label icon = new Label(sidebarExpanded ? "⮜" : "⮞");
                icon.getStyleClass().add("menu-icon");
                sidebarToggleButton.setGraphic(icon);
                sidebarToggleButton.setText("");
            }
        } catch (Exception e) {
            LOGGER.fine("No session sidebar state available: using defaults");
        }

        loadInvoices();
    }

    private void loadInvoices() {
        if (loadingIndicator != null)
            loadingIndicator.setVisible(true);
        var task = financeService.getAllInvoices();
        task.setOnSucceeded(evt -> Platform.runLater(() -> {
            if (loadingIndicator != null)
                loadingIndicator.setVisible(false);
            List<Invoice> list = task.getValue();
            // cache current invoices for export and local operations
            currentInvoices.clear();
            if (list != null)
                currentInvoices.addAll(list);
            if (invoicesContainer != null)
                invoicesContainer.getChildren().clear();
            if (newProjectsContainer != null)
                newProjectsContainer.getChildren().clear();
            if (newProjectsContainer1 != null)
                newProjectsContainer1.getChildren().clear();

            int total = list.size();
            int paid = 0;
            double revenue = 0.0;
            for (Invoice inv : list) {
                if (inv.isPaid()) {
                    paid++;
                    revenue += inv.getAmount();
                }
                HBox card = createInvoiceCard(inv);
                // Route to appropriate kanban column
                if (inv.isPaid()) {
                    if (newProjectsContainer1 != null)
                        newProjectsContainer1.getChildren().add(card);
                } else {
                    // treat invoices older than 7 days as Due, otherwise New
                    long ageMs = System.currentTimeMillis() - inv.getIssuedAt();
                    long sevenDaysMs = 7L * 24 * 60 * 60 * 1000;
                    if (ageMs > sevenDaysMs) {
                        if (newProjectsContainer1 != null)
                            newProjectsContainer1.getChildren().add(card);
                    } else {
                        if (newProjectsContainer != null)
                            newProjectsContainer.getChildren().add(card);
                    }
                }
            }

            int outstanding = total - paid;
            if (totalCountLabel != null)
                totalCountLabel.setText(String.valueOf(total));
            if (completedCountLabel != null)
                completedCountLabel.setText(String.valueOf(paid));
            if (activeCountLabel != null)
                activeCountLabel.setText(String.valueOf(outstanding));
            if (statusLabel != null)
                statusLabel.setText("Loaded " + total + " invoices");
        }));
        task.setOnFailed(evt -> Platform.runLater(() -> {
            if (loadingIndicator != null)
                loadingIndicator.setVisible(false);
            LOGGER.log(Level.SEVERE, "Failed to load invoices", task.getException());
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
            task.setOnSucceeded(evt -> Platform.runLater(() -> {
                // refresh list after creation
                loadInvoices();
            }));
            task.setOnFailed(evt -> LOGGER.log(Level.SEVERE, "Failed to create invoice", task.getException()));
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

        try (BufferedWriter writer = Files.newBufferedWriter(file.toPath(), StandardCharsets.UTF_8,
                StandardOpenOption.CREATE, StandardOpenOption.TRUNCATE_EXISTING)) {
            writer.write("id,client,amount,paid,issuedAt\n");
            for (Invoice inv : currentInvoices) {
                writer.write(String.format("%s,%s,%.2f,%s,%d\n", inv.getId(), inv.getClient().replace(",", " "),
                        inv.getAmount(), inv.isPaid(), inv.getIssuedAt()));
            }
        } catch (IOException e) {
            LOGGER.log(Level.SEVERE, "Failed to export invoices", e);
        }
    }

    private HBox createInvoiceCard(Invoice inv) {
        HBox root = new HBox();
        root.getStyleClass().add("invoice-row");
        root.setSpacing(12);
        root.setPadding(new Insets(10));
        root.setAlignment(Pos.CENTER_LEFT);

        VBox left = new VBox();
        left.setSpacing(4);
        Label id = new Label(inv.getId());
        id.getStyleClass().add("view-title");
        Label client = new Label(inv.getClient());
        client.setStyle("-fx-text-fill: #64748b; -fx-font-size: 12px;");
        left.getChildren().addAll(id, client);

        javafx.scene.layout.Region spacer = new javafx.scene.layout.Region();
        HBox.setHgrow(spacer, Priority.ALWAYS);

        VBox right = new VBox();
        right.setSpacing(6);
        right.setAlignment(Pos.CENTER_RIGHT);

        Label amount = new Label("$" + String.format("%.2f", inv.getAmount()));
        amount.getStyleClass().add("stat-value");

        Label status = new Label(inv.isPaid() ? "PAID" : "OUTSTANDING");
        status.setStyle(inv.isPaid() ? "-fx-text-fill: #10b981; -fx-font-weight: 700;"
                : "-fx-text-fill: #ef4444; -fx-font-weight: 700;");

        HBox actions = new HBox();
        actions.setSpacing(8);

        Button togglePaid = new Button(inv.isPaid() ? "Mark Unpaid" : "Mark Paid");
        togglePaid.getStyleClass().add("invoice-toggle-button");
        togglePaid.setOnAction(e -> {
            inv.setPaid(!inv.isPaid());
            status.setText(inv.isPaid() ? "PAID" : "OUTSTANDING");
            status.setStyle(inv.isPaid() ? "-fx-text-fill: #10b981; -fx-font-weight: 700;"
                    : "-fx-text-fill: #ef4444; -fx-font-weight: 700;");
            togglePaid.setText(inv.isPaid() ? "Mark Unpaid" : "Mark Paid");

            // Move card between kanban columns on status change
            javafx.scene.Parent parent = root.getParent();
            if (parent instanceof VBox) {
                ((VBox) parent).getChildren().remove(root);
            }
            if (inv.isPaid()) {
                if (newProjectsContainer1 != null)
                    newProjectsContainer1.getChildren().add(root);
            } else {
                long ageMs = System.currentTimeMillis() - inv.getIssuedAt();
                long sevenDaysMs = 7L * 24 * 60 * 60 * 1000;
                if (ageMs > sevenDaysMs) {
                    if (newProjectsContainer1 != null)
                        newProjectsContainer1.getChildren().add(root);
                } else {
                    if (newProjectsContainer != null)
                        newProjectsContainer.getChildren().add(root);
                }
            }

            var t = financeService.updateInvoice(inv);
            t.setOnFailed(evt -> LOGGER.log(Level.SEVERE, "Failed to update invoice", t.getException()));
            new Thread(t).start();
        });

        Button delete = new Button("Delete");
        delete.getStyleClass().add("invoice-delete-button");
        delete.setOnAction(e -> {
            var t = financeService.deleteInvoice(inv.getId());
            t.setOnSucceeded(evt -> Platform.runLater(() -> {
                javafx.scene.Parent parent = root.getParent();
                if (parent instanceof VBox) {
                    ((VBox) parent).getChildren().remove(root);
                } else if (invoicesContainer != null) {
                    invoicesContainer.getChildren().remove(root);
                }
            }));
            t.setOnFailed(evt -> LOGGER.log(Level.SEVERE, "Failed to delete invoice", t.getException()));
            new Thread(t).start();
        });

        actions.getChildren().addAll(togglePaid, delete);

        right.getChildren().addAll(amount, status, actions);

        root.getChildren().addAll(left, spacer, right);
        return root;
    }

    private void redirectToLogin() {
        try {
            com.example.shenanigans.App.setRoot("features/auth/view/auth_view");
        } catch (Exception e) {
            LOGGER.log(Level.SEVERE, "Failed to redirect to login", e);
        }
    }

    // ==================== Sidebar helpers ====================

    @FXML
    private void handleSidebarToggle() {
        if (sidebarContent == null) {
            LOGGER.warning("Sidebar content not found");
            return;
        }

        double endWidth = sidebarExpanded ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH;

        Timeline timeline = new Timeline();
        KeyValue keyValue = new KeyValue(sidebarContent.prefWidthProperty(), endWidth);
        KeyFrame keyFrame = new KeyFrame(Duration.millis(ANIMATION_DURATION_MS), keyValue);
        timeline.getKeyFrames().add(keyFrame);

        // Toggle
        sidebarExpanded = !sidebarExpanded;

        timeline.setOnFinished(event -> {
            updateSidebarCollapsedState(!sidebarExpanded);
            try {
                SessionManager.getInstance().setSidebarExpanded(sidebarExpanded);
            } catch (Exception e) {
                LOGGER.fine("Failed to persist sidebar state to session");
            }
        });

        Label icon = new Label(sidebarExpanded ? "⮜" : "⮞");
        icon.getStyleClass().add("menu-icon");
        if (sidebarToggleButton != null) {
            sidebarToggleButton.setGraphic(icon);
            sidebarToggleButton.setText("");
        }

        timeline.play();
    }

    private void updateSidebarCollapsedState(boolean collapsed) {
        if (menuHeaderLabel != null) {
            menuHeaderLabel.setVisible(!collapsed);
            menuHeaderLabel.setManaged(!collapsed);
        }
        if (settingsHeaderLabel != null) {
            settingsHeaderLabel.setVisible(!collapsed);
            settingsHeaderLabel.setManaged(!collapsed);
        }
        if (systemInfoCard != null) {
            systemInfoCard.setVisible(!collapsed);
            systemInfoCard.setManaged(!collapsed);
        }
        updateButtonsForCollapsedState(collapsed);
    }

    private void updateButtonsForCollapsedState(boolean collapsed) {
        Button[] buttons = { dashboardButton, employeesButton, projectsButton, financeButton, settingsButton };
        String[] texts = { "Dashboard", "Employees", "Projects", "Finance", "Settings" };

        for (int i = 0; i < buttons.length; i++) {
            if (buttons[i] != null) {
                buttons[i].setText(collapsed ? "" : texts[i]);
                buttons[i].setContentDisplay(collapsed ? javafx.scene.control.ContentDisplay.GRAPHIC_ONLY
                        : javafx.scene.control.ContentDisplay.LEFT);
            }
        }
    }

    private void setupSidebarIcons() {
        Button[] buttons = { dashboardButton, employeesButton, projectsButton, financeButton, settingsButton };
        String[] texts = { "Dashboard", "Employees", "Projects", "Finance", "Settings" };

        String[] svgs = {
                "M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z",
                "M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3z M8 11c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3z M2 17c0-2.33 4.67-3.5 7-3.5s7 1.17 7 3.5V20H2v-3z",
                "M19 3h-4.18C14.4 1.84 13.3 1 12 1s-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1z",
                "M12 1C6.48 1 2 5.48 2 11s4.48 10 10 10 10-4.48 10-10S17.52 1 12 1zm1 17.93V19h-2v-.07C8.06 18.44 6 16.28 6 13h2c0 2 2 4 5 4s5-2 5-4-2-3-5-3c-2.21 0-4 .9-4 2H8c0-2.76 3.13-5 7-5 3.87 0 7 2.24 7 5s-3.13 5-7 5c-1.66 0-3.17-.51-4.41-1.37z",
                "M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.11-.2-.36-.28-.57-.22l-2.39.96a7.007 7.007 0 0 0-1.6-.94l-.36-2.54A.486.486 0 0 0 14 1h-4c-.24 0-.44.17-.48.41l-.36 2.54c-.56.23-1.08.54-1.6.94l-2.39-.96c-.21-.08-.46.02-.57.22L2.71 8.88c-.11.2-.06.47.12.61L4.86 11.1c-.04.31-.06.63-.06.94s.02.63.06.94L2.83 15.56c-.18.14-.23.41-.12.61l1.92 3.32c.11.2.36.28.57.22l2.39-.96c.5.4 1.04.72 1.6.94l.36 2.54c.04.24.24.41.48.41h4c.24 0 .44-.17.48-.41l.36-2.54c.56-.23 1.08-.54 1.6-.94l2.39.96c.21.08.46-.02.57-.22l1.92-3.32c.11-.2.06-.47-.12-.61l-2.03-1.58z"
        };

        for (int i = 0; i < buttons.length; i++) {
            Button b = buttons[i];
            if (b == null)
                continue;
            SVGPath svg = new SVGPath();
            svg.setContent(svgs[i]);
            svg.setFill(ThemeService.isDarkMode() ? Color.web("#e2e8f0") : Color.web("#475569"));
            svg.setScaleX(0.9);
            svg.setScaleY(0.9);
            svg.getStyleClass().add("menu-icon-svg");
            b.setGraphic(svg);
            b.setText(texts[i]);
            b.setContentDisplay(javafx.scene.control.ContentDisplay.LEFT);
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
        Dialog<ButtonType> dialog = new Dialog<>();
        dialog.setTitle("Settings");
        DialogPane pane = dialog.getDialogPane();

        CheckBox darkToggle = new CheckBox("Enable dark mode");
        darkToggle.setSelected(ThemeService.isDarkMode());

        pane.setContent(darkToggle);
        pane.getButtonTypes().addAll(ButtonType.OK, ButtonType.CANCEL);

        dialog.setResultConverter(btn -> btn);
        var result = dialog.showAndWait();
        if (result.isPresent() && result.get() == ButtonType.OK) {
            ThemeService.setDarkMode(darkToggle.isSelected());
            setupSidebarIcons();
        }
    }

    private void navigateTo(String fxml) {
        try {
            com.example.shenanigans.App.setRoot(fxml);
        } catch (Exception e) {
            LOGGER.log(Level.SEVERE, "Failed to navigate to " + fxml, e);
        }
    }
}
