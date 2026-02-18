package com.example.shenanigans.core.theme;

import javafx.scene.control.ButtonType;
import javafx.scene.control.CheckBox;
import javafx.scene.control.Dialog;
import javafx.scene.control.DialogPane;

/**
 * Reusable theme settings dialog component.
 */
public final class ThemeSettingsDialogComponent {

    private ThemeSettingsDialogComponent() {
    }

    /**
     * Displays the settings dialog for dark mode and applies changes when
     * confirmed.
     *
     * @param onThemeChanged callback invoked after a successful theme change
     */
    public static void showDarkModeDialog(Runnable onThemeChanged) {
        Dialog<ButtonType> dialog = new Dialog<>();
        dialog.setTitle("Settings");
        DialogPane pane = dialog.getDialogPane();

        CheckBox darkToggle = new CheckBox("Enable dark mode");
        darkToggle.setSelected(ThemeService.isDarkMode());

        pane.setContent(darkToggle);
        pane.getButtonTypes().addAll(ButtonType.OK, ButtonType.CANCEL);

        var result = dialog.showAndWait();
        if (result.isPresent() && result.get() == ButtonType.OK) {
            ThemeService.setDarkMode(darkToggle.isSelected());
            if (onThemeChanged != null) {
                onThemeChanged.run();
            }
        }
    }
}
