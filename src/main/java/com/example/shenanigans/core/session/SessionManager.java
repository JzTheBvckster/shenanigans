package com.example.shenanigans.core.session;

import com.example.shenanigans.features.auth.model.User;
import java.util.logging.Logger;

/**
 * Manages the current user session across the application. Singleton class that
 * holds the
 * authenticated user information.
 */
public final class SessionManager {

  private static final Logger LOGGER = Logger.getLogger(SessionManager.class.getName());

  private static SessionManager instance;

  private User currentUser;
  private String idToken;
  private String refreshToken;
  private String selectedEmployeeId;
  private String selectedEmployeeSection;
  private boolean sidebarExpanded = true;
  // Theme preference for the current session: false = light, true = dark
  private boolean darkMode = false;

  private SessionManager() {
    // Private constructor for singleton
  }

  /**
   * Gets the singleton instance of SessionManager.
   *
   * @return SessionManager instance
   */
  public static synchronized SessionManager getInstance() {
    if (instance == null) {
      instance = new SessionManager();
    }
    return instance;
  }

  /**
   * Sets the current authenticated user.
   *
   * @param user         The authenticated user
   * @param idToken      Firebase ID token
   * @param refreshToken Firebase refresh token
   */
  public void setSession(User user, String idToken, String refreshToken) {
    this.currentUser = user;
    this.idToken = idToken;
    this.refreshToken = refreshToken;
    LOGGER.info("Session started for: " + user.getEmail());
  }

  /** Clears the current session (logout). */
  public void clearSession() {
    String email = currentUser != null ? currentUser.getEmail() : "unknown";
    this.currentUser = null;
    this.idToken = null;
    this.refreshToken = null;
    this.selectedEmployeeId = null;
    this.selectedEmployeeSection = null;
    LOGGER.info("Session cleared for: " + email);
  }

  /**
   * @return The currently authenticated user, or null if not logged in
   */
  public User getCurrentUser() {
    return currentUser;
  }

  /**
   * @return The current Firebase ID token, or null if not logged in
   */
  public String getIdToken() {
    return idToken;
  }

  /**
   * @return The current Firebase refresh token, or null if not logged in
   */
  public String getRefreshToken() {
    return refreshToken;
  }

  /**
   * @return true if a user is currently logged in
   */
  public boolean isLoggedIn() {
    return currentUser != null && idToken != null;
  }

  /**
   * @return true if the current user is a Managing Director
   */
  public boolean isManagingDirector() {
    return currentUser != null && currentUser.isManagingDirector();
  }

  /**
   * @return true if the current user is a Project Manager
   */
  public boolean isProjectManager() {
    return currentUser != null && currentUser.isProjectManager();
  }

  /**
   * Gets the user's UID.
   *
   * @return User's UID or null if not logged in
   */
  public String getUserId() {
    return currentUser != null ? currentUser.getUid() : null;
  }

  /**
   * Stores the selected employee id for cross-view navigation.
   *
   * @param employeeId employee id to persist for profile navigation
   */
  public void setSelectedEmployeeId(String employeeId) {
    this.selectedEmployeeId = employeeId;
  }

  /**
   * Returns currently selected employee id for profile navigation.
   *
   * @return selected employee id or null
   */
  public String getSelectedEmployeeId() {
    return selectedEmployeeId;
  }

  /** Clears selected employee navigation context. */
  public void clearSelectedEmployeeId() {
    this.selectedEmployeeId = null;
  }

  /**
   * Stores current employee workspace section for employee portal navigation.
   *
   * @param section section key to persist (e.g., MY_TASKS)
   */
  public void setSelectedEmployeeSection(String section) {
    this.selectedEmployeeSection = section;
  }

  /**
   * Returns currently selected employee workspace section.
   *
   * @return section key or null
   */
  public String getSelectedEmployeeSection() {
    return selectedEmployeeSection;
  }

  /** Clears selected employee workspace section. */
  public void clearSelectedEmployeeSection() {
    this.selectedEmployeeSection = null;
  }

  /**
   * Gets the sidebar expanded state for the current session.
   *
   * @return true if sidebar should be expanded, false if collapsed
   */
  public boolean isSidebarExpanded() {
    return sidebarExpanded;
  }

  /**
   * Sets the sidebar expanded state for the current session.
   *
   * @param expanded the new state
   */
  public void setSidebarExpanded(boolean expanded) {
    this.sidebarExpanded = expanded;
  }

  /**
   * Returns current theme preference.
   *
   * @return true if dark mode is enabled
   */
  public boolean isDarkMode() {
    return darkMode;
  }

  /**
   * Sets the current theme preference for the session.
   *
   * @param dark true to enable dark mode
   */
  public void setDarkMode(boolean dark) {
    this.darkMode = dark;
  }
}
