package com.example.shenanigans.core.session;

import com.example.shenanigans.features.auth.model.User;

import java.util.logging.Logger;

/**
 * Manages the current user session across the application.
 * Singleton class that holds the authenticated user information.
 */
public final class SessionManager {

    private static final Logger LOGGER = Logger.getLogger(SessionManager.class.getName());

    private static SessionManager instance;

    private User currentUser;
    private String idToken;
    private String refreshToken;
    // Sidebar expanded/collapsed state for the current session
    private boolean sidebarExpanded = true;

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

    /**
     * Clears the current session (logout).
     */
    public void clearSession() {
        String email = currentUser != null ? currentUser.getEmail() : "unknown";
        this.currentUser = null;
        this.idToken = null;
        this.refreshToken = null;
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
}
