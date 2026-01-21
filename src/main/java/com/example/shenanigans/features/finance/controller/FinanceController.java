package com.example.shenanigans.features.finance.controller;

import com.example.shenanigans.core.session.SessionManager;
import com.example.shenanigans.features.finance.model.Invoice;
import com.example.shenanigans.features.finance.service.FinanceService;
import javafx.animation.KeyFrame;
import javafx.animation.KeyValue;
import javafx.animation.Timeline;
import javafx.application.Platform;
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
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Controller for the finance view.
 */
public class FinanceController {

    private static final Logger LOGGER = Logger.getLogger(FinanceController.class.getName());

    private final FinanceService financeService = new FinanceService();

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
    private Label totalInvoicesLabel;

    @FXML
    private Label outstandingLabel;

    @FXML
    private Label paidLabel;

    @FXML
    private Label revenueLabel;

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
            if (invoicesContainer != null)
                invoicesContainer.getChildren().clear();

            int total = list.size();
            int paid = 0;
            double revenue = 0.0;
            for (Invoice inv : list) {
                if (inv.isPaid()) {
                    paid++;
                    revenue += inv.getAmount();
                }
                Label label = new Label(
                        inv.getId() + " — " + inv.getClient() + " — $" + String.format("%.2f", inv.getAmount())
                                + (inv.isPaid() ? " (PAID)" : ""));
                label.getStyleClass().add("invoice-row");
                if (invoicesContainer != null)
                    invoicesContainer.getChildren().add(label);
            }

            int outstanding = total - paid;
            if (totalInvoicesLabel != null)
                totalInvoicesLabel.setText(String.valueOf(total));
            if (paidLabel != null)
                paidLabel.setText(String.valueOf(paid));
            if (outstandingLabel != null)
                outstandingLabel.setText(String.valueOf(outstanding));
            if (revenueLabel != null)
                revenueLabel.setText("$" + String.format("%.2f", revenue));
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
        LOGGER.info("Add Invoice clicked (stub)");
        // TODO: Show add invoice dialog
    }

    @FXML
    private void handleExport() {
        LOGGER.info("Export invoices (stub)");
        // TODO: Implement export
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
            svg.setFill(Color.web("#475569"));
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
        LOGGER.info("Navigating to Settings (not implemented)");
    }

    private void navigateTo(String fxml) {
        try {
            com.example.shenanigans.App.setRoot(fxml);
        } catch (Exception e) {
            LOGGER.log(Level.SEVERE, "Failed to navigate to " + fxml, e);
        }
    }
}
