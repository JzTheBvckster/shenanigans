package com.example.shenanigans.core.navigation;

import com.example.shenanigans.App;
import java.util.logging.Level;
import java.util.logging.Logger;

/** Reusable view navigation helper for JavaFX controllers. */
public final class ViewNavigator {

  private ViewNavigator() {}

  /**
   * Navigates to the given view path.
   *
   * @param fxmlPath target FXML path without extension
   * @param logger logger for error reporting
   */
  public static void navigateTo(String fxmlPath, Logger logger) {
    navigateTo(fxmlPath, logger, "Failed to navigate to " + fxmlPath);
  }

  /**
   * Navigates to the login view.
   *
   * @param logger logger for error reporting
   */
  public static void redirectToLogin(Logger logger) {
    navigateTo("features/auth/view/auth_view", logger, "Failed to redirect to login");
  }

  /**
   * Navigates to the main dashboard view.
   *
   * @param logger logger for error reporting
   */
  public static void redirectToDashboard(Logger logger) {
    navigateTo(
        "features/dashboard/view/dashboard_view", logger, "Failed to redirect to main dashboard");
  }

  private static void navigateTo(String fxmlPath, Logger logger, String failureMessage) {
    try {
      App.setRoot(fxmlPath);
    } catch (Exception e) {
      if (logger != null) {
        logger.log(Level.SEVERE, failureMessage, e);
      }
    }
  }
}
