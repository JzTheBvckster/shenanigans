package com.example.shenanigans.features.settings.controller;

import com.example.shenanigans.core.navigation.SidebarComponent;
import com.example.shenanigans.core.navigation.SidebarState;
import com.example.shenanigans.core.navigation.ViewNavigator;
import com.example.shenanigans.core.session.SessionManager;
import com.example.shenanigans.core.settings.AppSettingsService;
import com.example.shenanigans.core.theme.ThemeService;
import com.example.shenanigans.features.auth.model.User;
import java.util.Locale;
import java.util.logging.Logger;
import javafx.collections.FXCollections;
import javafx.fxml.FXML;
import javafx.scene.control.Button;
import javafx.scene.control.CheckBox;
import javafx.scene.control.ChoiceBox;
import javafx.scene.control.Label;
import javafx.scene.layout.VBox;

/**
 * Controller for the dedicated settings page.
 */
public class SettingsController {

    private static final Logger LOGGER = Logger.getLogger(SettingsController.class.getName());

    @FXML
    private VBox sidebarContent;
    @FXML
    private Button sidebarToggleButton;
    @FXML
    private Label menuHeaderLabel;
    @FXML
    private Label settingsHeaderLabel;
    @FXML
    private VBox systemInfoCard;

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
    private Label accountNameLabel;
    @FXML
    private Label accountEmailLabel;
    @FXML
    private Label accountRoleLabel;
    @FXML
    private Label accountApprovalLabel;

    @FXML
    private CheckBox darkModeToggle;
    @FXML
    private CheckBox sidebarExpandedToggle;
    @FXML
    private CheckBox emailNotificationsToggle;
    @FXML
    private CheckBox desktopAlertsToggle;
    @FXML
    private ChoiceBox<Integer> autoRefreshChoice;
    @FXML
    private Label saveStatusLabel;

    private SidebarComponent sidebarComponent;

    /**
     * Initializes settings UI and state bindings.
     */
    @FXML
    public void initialize() {
        if (!checkAuth()) {
            return;
        }

        initializeSidebarComponent();
        loadAccountDetails();
        loadSettings();
        configureMenuForRole(SessionManager.getInstance().getCurrentUser());
    }

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
        if (SessionManager.getInstance().isManagingDirector()) {
            navigateTo("features/finance/view/finance_view");
        }
    }

    @FXML
    private void handleSettings() {
        // already on settings page
    }

    @FXML
    private void handleSaveSettings() {
        ThemeService.setDarkMode(darkModeToggle.isSelected());
        SessionManager.getInstance().setSidebarExpanded(sidebarExpandedToggle.isSelected());
        AppSettingsService.setEmailNotificationsEnabled(emailNotificationsToggle.isSelected());
        AppSettingsService.setDesktopAlertsEnabled(desktopAlertsToggle.isSelected());

        Integer refreshMinutes = autoRefreshChoice.getValue();
        if (refreshMinutes != null) {
            AppSettingsService.setAutoRefreshMinutes(refreshMinutes);
        }

        if (sidebarComponent != null) {
            sidebarComponent.refreshIconsForTheme();
        }

        saveStatusLabel.setText("Settings saved successfully.");
    }

    @FXML
    private void handleResetSidebarState() {
        SidebarState.getInstance().reset();
        SessionManager.getInstance().setSidebarExpanded(true);
        sidebarExpandedToggle.setSelected(true);
        saveStatusLabel.setText("Sidebar layout reset.");
    }

    @FXML
    private void handleClearEmployeeContext() {
        SessionManager.getInstance().clearSelectedEmployeeId();
        saveStatusLabel.setText("Employee context cleared.");
    }

    @FXML
    private void handleLogout() {
        SessionManager.getInstance().clearSession();
        ViewNavigator.redirectToLogin(LOGGER);
    }

    private void loadSettings() {
        darkModeToggle.setSelected(ThemeService.isDarkMode());
        sidebarExpandedToggle.setSelected(SessionManager.getInstance().isSidebarExpanded());
        emailNotificationsToggle.setSelected(AppSettingsService.isEmailNotificationsEnabled());
        desktopAlertsToggle.setSelected(AppSettingsService.isDesktopAlertsEnabled());

        autoRefreshChoice.setItems(FXCollections.observableArrayList(1, 5, 10, 15, 30));
        int configuredRefresh = AppSettingsService.getAutoRefreshMinutes();
        if (!autoRefreshChoice.getItems().contains(configuredRefresh)) {
            autoRefreshChoice.getItems().add(configuredRefresh);
        }
        autoRefreshChoice.setValue(configuredRefresh);

        saveStatusLabel.setText("");
    }

    private void loadAccountDetails() {
        User user = SessionManager.getInstance().getCurrentUser();
        if (user == null) {
            accountNameLabel.setText("-");
            accountEmailLabel.setText("-");
            accountRoleLabel.setText("-");
            accountApprovalLabel.setText("Not signed in");
            return;
        }

        accountNameLabel.setText(valueOrDash(user.getDisplayName()));
        accountEmailLabel.setText(valueOrDash(user.getEmail()));
        accountRoleLabel.setText(formatRole(user.getRole()));
        accountApprovalLabel.setText(user.isMdApproved() ? "Approved" : "Pending approval");
    }

    private String valueOrDash(String value) {
        return value == null || value.isBlank() ? "-" : value;
    }

    private String formatRole(String role) {
        if (role == null || role.isBlank()) {
            return "-";
        }
        String normalized = role.replace('_', ' ').toLowerCase(Locale.ROOT);
        return Character.toUpperCase(normalized.charAt(0)) + normalized.substring(1);
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

    private void configureMenuForRole(User user) {
        if (user == null) {
            financeButton.setVisible(false);
            financeButton.setManaged(false);
            return;
        }

        boolean md = user.isManagingDirector();
        financeButton.setVisible(md);
        financeButton.setManaged(md);
    }

    private boolean checkAuth() {
        if (!SessionManager.getInstance().isLoggedIn()) {
            LOGGER.warning("Session expired or invalid. Redirecting to login.");
            ViewNavigator.redirectToLogin(LOGGER);
            return false;
        }
        return true;
    }

    private void navigateTo(String fxml) {
        ViewNavigator.navigateTo(fxml, LOGGER);
    }
}
