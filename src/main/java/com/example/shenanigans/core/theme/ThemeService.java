package com.example.shenanigans.core.theme;

import java.util.Objects;
import java.util.prefs.Preferences;
import java.util.logging.Level;
import java.util.logging.Logger;

import com.example.shenanigans.App;
import com.example.shenanigans.core.session.SessionManager;

import javafx.application.Platform;
import javafx.beans.property.ReadOnlyBooleanProperty;
import javafx.beans.property.ReadOnlyBooleanWrapper;
import javafx.scene.Parent;
import javafx.scene.Scene;

/**
 * Central service for managing the application's theme (light/dark).
 * <p>
 * This service:
 * <ul>
 * <li>Persists the user's preference using {@link Preferences}.</li>
 * <li>Keeps the in-memory session preference in sync via
 * {@link SessionManager}.</li>
 * <li>Applies a root-level stylesheet to enable dark mode across all
 * views.</li>
 * </ul>
 */
public final class ThemeService {

    private static final Logger LOGGER = Logger.getLogger(ThemeService.class.getName());

    private static final String PREF_KEY_DARK_MODE = "theme.darkMode";
    private static final String DARK_STYLESHEET_RESOURCE = "/com/example/shenanigans/core/theme/dark-mode.css";

    private static final Preferences PREFS = Preferences.userNodeForPackage(ThemeService.class);
    private static final ReadOnlyBooleanWrapper DARK_MODE = new ReadOnlyBooleanWrapper(false);

    private ThemeService() {
        // utility
    }

    /**
     * Initializes the theme preference from persisted storage.
     * <p>
     * Safe to call multiple times.
     */
    public static void initFromPreferences() {
        boolean dark = false;
        try {
            dark = PREFS.getBoolean(PREF_KEY_DARK_MODE, false);
        } catch (Exception ex) {
            LOGGER.log(Level.FINE, "Failed to read theme preference", ex);
        }
        setDarkModeInternal(dark, false);
    }

    /**
     * Returns whether dark mode is currently enabled.
     */
    public static boolean isDarkMode() {
        return DARK_MODE.get();
    }

    /**
     * Exposes dark mode as an observable read-only property.
     */
    public static ReadOnlyBooleanProperty darkModeProperty() {
        return DARK_MODE.getReadOnlyProperty();
    }

    /**
     * Enables/disables dark mode, persists the preference, and applies it to the
     * current scene.
     *
     * @param dark true to enable dark mode
     */
    public static void setDarkMode(boolean dark) {
        setDarkModeInternal(dark, true);
    }

    /**
     * Binds this service to a Scene so theme changes apply immediately.
     *
     * @param scene the application's primary scene
     */
    public static void bindToScene(Scene scene) {
        Objects.requireNonNull(scene, "scene");
        applyToScene(scene);

        DARK_MODE.addListener((obs, oldVal, newVal) -> runOnFxThread(() -> applyToScene(scene)));
    }

    /**
     * Applies the current theme to the provided scene.
     * <p>
     * This attaches/removes the dark-mode stylesheet at the root node level so it
     * can override
     * view-local stylesheets declared in FXML.
     */
    public static void applyToScene(Scene scene) {
        if (scene == null) {
            return;
        }

        Parent root = scene.getRoot();
        if (root == null) {
            return;
        }

        String darkCss;
        try {
            var url = ThemeService.class.getResource(DARK_STYLESHEET_RESOURCE);
            if (url == null) {
                LOGGER.warning("Missing dark mode stylesheet: " + DARK_STYLESHEET_RESOURCE);
                return;
            }
            darkCss = url.toExternalForm();
        } catch (Exception ex) {
            LOGGER.log(Level.WARNING, "Failed to resolve dark mode stylesheet", ex);
            return;
        }

        if (DARK_MODE.get()) {
            if (!root.getStylesheets().contains(darkCss)) {
                root.getStylesheets().add(darkCss);
            }
        } else {
            root.getStylesheets().removeIf(s -> s != null && s.contains("/core/theme/dark-mode.css"));
        }
    }

    private static void setDarkModeInternal(boolean dark, boolean persist) {
        runOnFxThread(() -> {
            DARK_MODE.set(dark);

            try {
                SessionManager.getInstance().setDarkMode(dark);
            } catch (Exception ex) {
                LOGGER.log(Level.FINE, "Failed to update SessionManager theme", ex);
            }

            if (persist) {
                try {
                    PREFS.putBoolean(PREF_KEY_DARK_MODE, dark);
                } catch (Exception ex) {
                    LOGGER.log(Level.FINE, "Failed to persist theme preference", ex);
                }
            }

            try {
                Scene scene = App.getScene();
                if (scene != null) {
                    applyToScene(scene);
                }
            } catch (Exception ex) {
                LOGGER.log(Level.FINE, "Failed to apply theme to scene", ex);
            }
        });
    }

    private static void runOnFxThread(Runnable runnable) {
        if (Platform.isFxApplicationThread()) {
            runnable.run();
        } else {
            Platform.runLater(runnable);
        }
    }
}
