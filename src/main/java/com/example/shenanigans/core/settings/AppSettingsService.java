package com.example.shenanigans.core.settings;

import java.util.prefs.Preferences;

/**
 * Provides persisted application-level settings not tied to a specific feature.
 */
public final class AppSettingsService {

    private static final String KEY_EMAIL_NOTIFICATIONS = "settings.emailNotifications";
    private static final String KEY_DESKTOP_ALERTS = "settings.desktopAlerts";
    private static final String KEY_AUTO_REFRESH_MINUTES = "settings.autoRefreshMinutes";

    private static final Preferences PREFS = Preferences.userNodeForPackage(AppSettingsService.class);

    private AppSettingsService() {
    }

    /**
     * Returns whether email-style notifications are enabled.
     *
     * @return true when enabled
     */
    public static boolean isEmailNotificationsEnabled() {
        return PREFS.getBoolean(KEY_EMAIL_NOTIFICATIONS, true);
    }

    /**
     * Persists email notification preference.
     *
     * @param enabled true to enable notifications
     */
    public static void setEmailNotificationsEnabled(boolean enabled) {
        PREFS.putBoolean(KEY_EMAIL_NOTIFICATIONS, enabled);
    }

    /**
     * Returns whether in-app desktop alerts are enabled.
     *
     * @return true when enabled
     */
    public static boolean isDesktopAlertsEnabled() {
        return PREFS.getBoolean(KEY_DESKTOP_ALERTS, true);
    }

    /**
     * Persists desktop alert preference.
     *
     * @param enabled true to enable alerts
     */
    public static void setDesktopAlertsEnabled(boolean enabled) {
        PREFS.putBoolean(KEY_DESKTOP_ALERTS, enabled);
    }

    /**
     * Returns auto-refresh interval in minutes.
     *
     * @return refresh interval in minutes
     */
    public static int getAutoRefreshMinutes() {
        return PREFS.getInt(KEY_AUTO_REFRESH_MINUTES, 5);
    }

    /**
     * Persists auto-refresh interval.
     *
     * @param minutes refresh interval in minutes
     */
    public static void setAutoRefreshMinutes(int minutes) {
        int safeMinutes = Math.max(1, minutes);
        PREFS.putInt(KEY_AUTO_REFRESH_MINUTES, safeMinutes);
    }
}
