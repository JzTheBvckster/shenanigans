package com.example.shenanigans.features.auth.service;

import com.example.shenanigans.core.firebase.FirebaseAuthClient;
import com.example.shenanigans.core.firebase.FirebaseAuthClient.AuthResponse;
import com.example.shenanigans.core.firebase.FirebaseAuthClient.FirebaseAuthException;
import com.example.shenanigans.core.firebase.FirebaseConfig;
import com.example.shenanigans.core.firebase.FirebaseInitializer;
import com.example.shenanigans.features.auth.model.User;
import com.google.cloud.firestore.DocumentSnapshot;
import com.google.cloud.firestore.Firestore;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.UserRecord;
import com.example.shenanigans.features.employees.model.Employee;
import com.example.shenanigans.features.employees.service.EmployeeService;

import javafx.concurrent.Task;

import java.util.HashMap;
import java.util.Map;
import java.util.logging.Logger;

/**
 * Service class for authentication operations.
 * Uses Firebase REST API for client-side auth and Admin SDK for user
 * management.
 * All operations are asynchronous to avoid blocking the UI thread.
 */
public class AuthService {

    private static final Logger LOGGER = Logger.getLogger(AuthService.class.getName());
    private static final String USERS_COLLECTION = "users";

    private final FirebaseAuthClient authClient;
    private User currentUser;
    private String currentIdToken;
    private String currentRefreshToken;
    EmployeeService EmployeeService = new EmployeeService();

    public AuthService() {
        FirebaseConfig config = FirebaseConfig.getInstance();
        if (config.isLoaded()) {
            this.authClient = new FirebaseAuthClient(config.getApiKey());
        } else {
            this.authClient = null;
            LOGGER.warning("Firebase config not loaded. Auth operations will fail.");
        }
    }

    /**
     * Signs in a user with email and password.
     * 
     * @param email    User's email
     * @param password User's password
     * @return Task that completes with the authenticated User
     */
    public Task<User> signIn(String email, String password) {
        return new Task<>() {
            @Override
            protected User call() throws Exception {
                checkAuthClient();

                // Authenticate via REST API
                AuthResponse response = authClient.signIn(email, password);

                // Store tokens
                currentIdToken = response.idToken;
                currentRefreshToken = response.refreshToken;

                // Fetch full user data from Firestore
                User user = fetchUserFromFirestore(response.localId);

                if (user == null) {
                    // User exists in Auth but not in Firestore - create basic profile
                    user = new User();
                    user.setUid(response.localId);
                    user.setEmail(response.email);
                    user.setDisplayName(response.displayName != null ? response.displayName : email.split("@")[0]);
                    user.setRole("PROJECT_MANAGER"); // Default role

                    // Save to Firestore
                    saveUserToFirestore(user);
                }

                currentUser = user;
                LOGGER.info("User signed in: " + user.getEmail());
                return user;
            }
        };
    }

    /**
     * Creates a new user with email and password (sign up).
     * 
     * @param email       User's email
     * @param password    User's password
     * @param displayName User's display name
     * @param role        User's role (MANAGING_DIRECTOR or PROJECT_MANAGER)
     * @return Task that completes with the created User
     */
    public Task<User> signUp(String email, String password, String displayName, String role) {
        return new Task<>() {
            @Override
            protected User call() throws Exception {
                checkAuthClient();

                // Create user via REST API
                AuthResponse response = authClient.signUp(email, password);

                // Store tokens
                currentIdToken = response.idToken;
                currentRefreshToken = response.refreshToken;

                // Update display name
                if (displayName != null && !displayName.isEmpty()) {
                    authClient.updateProfile(response.idToken, displayName);
                }

                // Create user object
                User user = new User(response.localId, email, displayName, role);

                // Save to Firestore users collection
                saveUserToFirestore(user);

                // If role is EMPLOYEE, also create an employee record
                if ("EMPLOYEE".equals(role)) {
                    createEmployeeRecord(user);
                }

                LOGGER.info("User created: " + user.getEmail());
                return user;
            }
        };
    }

    /**
     * Creates an employee record in the employees collection.
     * 
     * @param user The user to create an employee record for
     */
    private void createEmployeeRecord(User user) {
        try {
            Firestore firestore = FirebaseInitializer.getFirestore();

            // Parse display name into first and last name
            String[] nameParts = parseDisplayName(user.getDisplayName());

            Map<String, Object> employeeData = new HashMap<>();
            employeeData.put("id", user.getUid());
            employeeData.put("firstName", nameParts[0]);
            employeeData.put("lastName", nameParts[1]);
            employeeData.put("email", user.getEmail());
            employeeData.put("status", "ACTIVE");
            employeeData.put("position", "Employee");
            employeeData.put("department", "Unassigned");
            employeeData.put("hireDate", System.currentTimeMillis());
            employeeData.put("createdAt", System.currentTimeMillis());
            employeeData.put("updatedAt", System.currentTimeMillis());

            firestore.collection("employees")
                    .document(user.getUid())
                    .set(employeeData)
                    .get();

            LOGGER.info("Employee record created for: " + user.getEmail());
        } catch (Exception e) {
            LOGGER.warning("Failed to create employee record: " + e.getMessage());
        }
    }

    /**
     * Parses a display name into first and last name.
     * 
     * @param displayName The full display name
     * @return Array with [firstName, lastName]
     */
    private String[] parseDisplayName(String displayName) {
        if (displayName == null || displayName.trim().isEmpty()) {
            return new String[] { "", "" };
        }

        String[] parts = displayName.trim().split("\\s+", 2);
        if (parts.length == 1) {
            return new String[] { parts[0], "" };
        }
        return parts;
    }

    /**
     * Sends a password reset email.
     * 
     * @param email User's email address
     * @return Task that completes when email is sent
     */
    public Task<Void> sendPasswordResetEmail(String email) {
        return new Task<>() {
            @Override
            protected Void call() throws Exception {
                checkAuthClient();
                authClient.sendPasswordResetEmail(email);
                LOGGER.info("Password reset email sent to: " + email);
                return null;
            }
        };
    }

    /**
     * Signs out the current user.
     */
    public void signOut() {
        currentUser = null;
        currentIdToken = null;
        currentRefreshToken = null;
        LOGGER.info("User signed out");
    }

    /**
     * @return The currently authenticated user, or null if not authenticated
     */
    public User getCurrentUser() {
        return currentUser;
    }

    /**
     * @return The current ID token, or null if not authenticated
     */
    public String getCurrentIdToken() {
        return currentIdToken;
    }

    /**
     * @return true if a user is currently signed in
     */
    public boolean isSignedIn() {
        return currentUser != null && currentIdToken != null;
    }

    // ==================== Admin SDK Operations ====================
    // These require Firebase Admin SDK initialization

    /**
     * Creates a new user using Admin SDK (for admin operations).
     * 
     * @param email       User's email
     * @param password    User's password
     * @param displayName User's display name
     * @param role        User's role
     * @return Task that completes with the created User
     */
    public Task<User> createUserAdmin(String email, String password, String displayName, String role) {
        return new Task<>() {
            @Override
            protected User call() throws Exception {
                FirebaseAuth auth = FirebaseInitializer.getAuth();

                UserRecord.CreateRequest request = new UserRecord.CreateRequest()
                        .setEmail(email)
                        .setPassword(password)
                        .setDisplayName(displayName)
                        .setEmailVerified(false);

                UserRecord userRecord = auth.createUser(request);
                LOGGER.info("Created user via Admin SDK: " + userRecord.getUid());

                User user = new User(userRecord.getUid(), email, displayName, role);
                saveUserToFirestore(user);

                return user;
            }
        };
    }

    /**
     * Fetches user by UID from Firestore.
     * 
     * @param uid User's Firebase UID
     * @return Task that completes with the User
     */
    public Task<User> getUserByUid(String uid) {
        return new Task<>() {
            @Override
            protected User call() throws Exception {
                return fetchUserFromFirestore(uid);
            }
        };
    }

    /**
     * Updates user profile in Firestore.
     * 
     * @param user User with updated fields
     * @return Task that completes when update is done
     */
    public Task<Void> updateUserProfile(User user) {
        return new Task<>() {
            @Override
            protected Void call() throws Exception {
                Firestore firestore = FirebaseInitializer.getFirestore();

                Map<String, Object> updates = new HashMap<>();
                updates.put("displayName", user.getDisplayName());
                updates.put("photoUrl", user.getPhotoUrl());
                updates.put("updatedAt", System.currentTimeMillis());

                firestore.collection(USERS_COLLECTION)
                        .document(user.getUid())
                        .update(updates)
                        .get();

                LOGGER.info("User profile updated: " + user.getUid());
                return null;
            }
        };
    }

    /**
     * Deletes a user from Firebase Auth and Firestore.
     * 
     * @param uid User's Firebase UID
     * @return Task that completes when deletion is done
     */
    public Task<Void> deleteUser(String uid) {
        return new Task<>() {
            @Override
            protected Void call() throws Exception {
                FirebaseAuth auth = FirebaseInitializer.getAuth();
                Firestore firestore = FirebaseInitializer.getFirestore();

                firestore.collection(USERS_COLLECTION)
                        .document(uid)
                        .delete()
                        .get();

                auth.deleteUser(uid);

                LOGGER.info("User deleted: " + uid);
                return null;
            }
        };
    }

    // ==================== Private Helper Methods ====================

    private void checkAuthClient() throws FirebaseAuthException {
        if (authClient == null) {
            throw new FirebaseAuthException("Firebase not configured. Please add your API key to firebase.properties");
        }
    }

    private User fetchUserFromFirestore(String uid) throws Exception {
        Firestore firestore = FirebaseInitializer.getFirestore();

        DocumentSnapshot doc = firestore.collection(USERS_COLLECTION)
                .document(uid)
                .get()
                .get();

        if (!doc.exists()) {
            return null;
        }

        User user = new User();
        user.setUid(uid);
        user.setEmail(doc.getString("email"));
        user.setDisplayName(doc.getString("displayName"));
        user.setRole(doc.getString("role"));
        user.setPhotoUrl(doc.getString("photoUrl"));

        return user;
    }

    private void saveUserToFirestore(User user) throws Exception {
        Firestore firestore = FirebaseInitializer.getFirestore();

        Map<String, Object> userData = new HashMap<>();
        userData.put("uid", user.getUid());
        userData.put("email", user.getEmail());
        userData.put("displayName", user.getDisplayName());
        userData.put("role", user.getRole());
        userData.put("createdAt", System.currentTimeMillis());

        firestore.collection(USERS_COLLECTION)
                .document(user.getUid())
                .set(userData)
                .get();

        LOGGER.info("User saved to Firestore: " + user.getUid());
    }
}
