package com.example.shenanigans.core.navigation;

import com.example.shenanigans.core.session.SessionManager;
import com.example.shenanigans.core.theme.ThemeService;
import javafx.animation.KeyFrame;
import javafx.animation.KeyValue;
import javafx.animation.Timeline;
import javafx.scene.control.Button;
import javafx.scene.control.Label;
import javafx.scene.layout.VBox;
import javafx.scene.paint.Color;
import javafx.scene.shape.SVGPath;
import javafx.util.Duration;

import java.util.logging.Logger;

/**
 * Reusable sidebar UI component for feature controllers.
 */
public class SidebarComponent {

    private static final double SIDEBAR_EXPANDED_WIDTH = 280;
    private static final double SIDEBAR_COLLAPSED_WIDTH = 100;
    private static final double ANIMATION_DURATION_MS = 250;

    private static final String[] DEFAULT_SVG_ICONS = {
            "M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z",
            "M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5s-3 1.34-3 3 1.34 3 3 3z M8 11c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5 5 6.34 5 8s1.34 3 3 3z M2 17c0-2.33 4.67-3.5 7-3.5s7 1.17 7 3.5V20H2v-3z",
            "M19 3h-4.18C14.4 1.84 13.3 1 12 1s-2.4.84-2.82 2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 0c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1z",
            "M12 1C6.48 1 2 5.48 2 11s4.48 10 10 10 10-4.48 10-10S17.52 1 12 1zm1 17.93V19h-2v-.07C8.06 18.44 6 16.28 6 13h2c0 2 2 4 5 4s5-2 5-4-2-3-5-3c-2.21 0-4 .9-4 2H8c0-2.76 3.13-5 7-5 3.87 0 7 2.24 7 5s-3.13 5-7 5c-1.66 0-3.17-.51-4.41-1.37z",
            "M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.11-.2-.36-.28-.57-.22l-2.39.96a7.007 7.007 0 0 0-1.6-.94l-.36-2.54A.486.486 0 0 0 14 1h-4c-.24 0-.44.17-.48.41l-.36 2.54c-.56.23-1.08.54-1.6.94l-2.39-.96c-.21-.08-.46.02-.57.22L2.71 8.88c-.11.2-.06.47.12.61L4.86 11.1c-.04.31-.06.63-.06.94s.02.63.06.94L2.83 15.56c-.18.14-.23.41-.12.61l1.92 3.32c.11.2.36.28.57.22l2.39-.96c.5.4 1.04.72 1.6.94l.36 2.54c.04.24.24.41.48.41h4c.24 0 .44-.17.48-.41l.36-2.54c.56-.23 1.08-.54 1.6-.94l2.39.96c.21.08.46-.02.57-.22l1.92-3.32c.11-.2.06-.47-.12-.61l-2.03-1.58z"
    };

    private final Logger logger;
    private final VBox sidebarContent;
    private final Button sidebarToggleButton;
    private final Label menuHeaderLabel;
    private final Label settingsHeaderLabel;
    private final VBox systemInfoCard;
    private final Button[] menuButtons;
    private final String[] menuTexts;

    private boolean sidebarExpanded = true;

    /**
     * Creates a reusable sidebar component.
     *
     * @param logger              logger used for warnings/info
     * @param sidebarContent      sidebar container
     * @param sidebarToggleButton sidebar toggle button
     * @param menuHeaderLabel     main menu header label
     * @param settingsHeaderLabel settings header label
     * @param systemInfoCard      system status card
     * @param menuButtons         menu buttons in display order
     * @param menuTexts           menu button text labels in display order
     */
    public SidebarComponent(Logger logger, VBox sidebarContent, Button sidebarToggleButton,
            Label menuHeaderLabel, Label settingsHeaderLabel, VBox systemInfoCard,
            Button[] menuButtons, String[] menuTexts) {
        this.logger = logger;
        this.sidebarContent = sidebarContent;
        this.sidebarToggleButton = sidebarToggleButton;
        this.menuHeaderLabel = menuHeaderLabel;
        this.settingsHeaderLabel = settingsHeaderLabel;
        this.systemInfoCard = systemInfoCard;
        this.menuButtons = menuButtons == null ? new Button[0] : menuButtons;
        this.menuTexts = menuTexts == null ? new String[0] : menuTexts;
    }

    /**
     * Initializes sidebar icons and restores persisted sidebar state.
     */
    public void initialize() {
        refreshIconsForTheme();
        try {
            sidebarExpanded = SessionManager.getInstance().isSidebarExpanded();
            if (sidebarContent != null) {
                sidebarContent.setPrefWidth(sidebarExpanded ? SIDEBAR_EXPANDED_WIDTH : SIDEBAR_COLLAPSED_WIDTH);
            }
            updateSidebarCollapsedState(!sidebarExpanded);
            updateToggleIcon();
        } catch (Exception e) {
            logger.fine("No session sidebar state available: using defaults");
        }
    }

    /**
     * Toggles sidebar collapsed state with animation and persists it in session.
     */
    public void toggle() {
        if (sidebarContent == null) {
            logger.warning("Sidebar content not found");
            return;
        }

        double endWidth = sidebarExpanded ? SIDEBAR_COLLAPSED_WIDTH : SIDEBAR_EXPANDED_WIDTH;
        Timeline timeline = new Timeline();
        KeyValue keyValue = new KeyValue(sidebarContent.prefWidthProperty(), endWidth);
        KeyFrame keyFrame = new KeyFrame(Duration.millis(ANIMATION_DURATION_MS), keyValue);
        timeline.getKeyFrames().add(keyFrame);

        sidebarExpanded = !sidebarExpanded;

        timeline.setOnFinished(event -> {
            updateSidebarCollapsedState(!sidebarExpanded);
            try {
                SessionManager.getInstance().setSidebarExpanded(sidebarExpanded);
            } catch (Exception e) {
                logger.fine("Failed to persist sidebar state to session");
            }
        });

        updateToggleIcon();
        timeline.play();
        logger.info("Sidebar toggled: " + (sidebarExpanded ? "expanded" : "collapsed"));
    }

    /**
     * Rebuilds sidebar button icons using current theme colors.
     */
    public void refreshIconsForTheme() {
        int limit = Math.min(Math.min(menuButtons.length, menuTexts.length), DEFAULT_SVG_ICONS.length);
        for (int i = 0; i < limit; i++) {
            Button button = menuButtons[i];
            if (button == null) {
                continue;
            }
            SVGPath svg = new SVGPath();
            svg.setContent(DEFAULT_SVG_ICONS[i]);
            svg.setFill(ThemeService.isDarkMode() ? Color.web("#e2e8f0") : Color.web("#475569"));
            svg.setScaleX(0.9);
            svg.setScaleY(0.9);
            svg.getStyleClass().add("menu-icon-svg");
            button.setGraphic(svg);
            button.setText(menuTexts[i]);
            button.setContentDisplay(javafx.scene.control.ContentDisplay.LEFT);
        }
    }

    private void updateToggleIcon() {
        if (sidebarToggleButton == null) {
            return;
        }
        Label icon = new Label(sidebarExpanded ? "⮜" : "⮞");
        icon.getStyleClass().add("menu-icon");
        sidebarToggleButton.setGraphic(icon);
        sidebarToggleButton.setText("");
    }

    private void updateSidebarCollapsedState(boolean collapsed) {
        if (menuHeaderLabel != null) {
            menuHeaderLabel.setVisible(!collapsed);
            menuHeaderLabel.setManaged(!collapsed);
        }
        if (settingsHeaderLabel != null) {
            settingsHeaderLabel.setVisible(false);
            settingsHeaderLabel.setManaged(false);
        }
        if (systemInfoCard != null) {
            systemInfoCard.setVisible(!collapsed);
            systemInfoCard.setManaged(!collapsed);
        }

        int limit = Math.min(menuButtons.length, menuTexts.length);
        for (int i = 0; i < limit; i++) {
            Button button = menuButtons[i];
            if (button == null) {
                continue;
            }
            button.setText(collapsed ? "" : menuTexts[i]);
            button.setContentDisplay(collapsed ? javafx.scene.control.ContentDisplay.GRAPHIC_ONLY
                    : javafx.scene.control.ContentDisplay.LEFT);
        }
    }
}
