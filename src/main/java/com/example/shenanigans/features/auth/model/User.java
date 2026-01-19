package com.example.shenanigans.features.auth.model;

/**
 * Represents an authenticated user in the system.
 */
public class User {

    private String uid;
    private String email;
    private String displayName;
    private String role; // "MANAGING_DIRECTOR" or "PROJECT_MANAGER"
    private String photoUrl;
    private boolean emailVerified;

    public User() {
    }

    public User(String uid, String email, String displayName, String role) {
        this.uid = uid;
        this.email = email;
        this.displayName = displayName;
        this.role = role;
    }

    // Getters and Setters

    public String getUid() {
        return uid;
    }

    public void setUid(String uid) {
        this.uid = uid;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getDisplayName() {
        return displayName;
    }

    public void setDisplayName(String displayName) {
        this.displayName = displayName;
    }

    public String getRole() {
        return role;
    }

    public void setRole(String role) {
        this.role = role;
    }

    public String getPhotoUrl() {
        return photoUrl;
    }

    public void setPhotoUrl(String photoUrl) {
        this.photoUrl = photoUrl;
    }

    public boolean isEmailVerified() {
        return emailVerified;
    }

    public void setEmailVerified(boolean emailVerified) {
        this.emailVerified = emailVerified;
    }

    /**
     * @return true if user has Managing Director role
     */
    public boolean isManagingDirector() {
        return "MANAGING_DIRECTOR".equals(role);
    }

    /**
     * @return true if user has Project Manager role
     */
    public boolean isProjectManager() {
        return "PROJECT_MANAGER".equals(role);
    }

    /**
     * @return true if user has Employee role
     */
    public boolean isEmployee() {
        return "EMPLOYEE".equals(role);
    }

    @Override
    public String toString() {
        return "User{" +
                "uid='" + uid + '\'' +
                ", email='" + email + '\'' +
                ", displayName='" + displayName + '\'' +
                ", role='" + role + '\'' +
                '}';
    }
}
