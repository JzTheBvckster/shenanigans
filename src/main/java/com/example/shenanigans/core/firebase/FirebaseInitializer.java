package com.example.shenanigans.core.firebase;

import com.google.auth.oauth2.GoogleCredentials;
import com.google.cloud.firestore.Firestore;
import com.google.firebase.FirebaseApp;
import com.google.firebase.FirebaseOptions;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.cloud.FirestoreClient;

import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Initializes and manages Firebase services for the application.
 * This is the single entry point for all Firebase operations.
 * 
 * <p>
 * Usage: Call {@link #initialize(String)} once at application startup,
 * then use the getter methods to access Firebase services.
 * </p>
 */
public final class FirebaseInitializer {

    private static final Logger LOGGER = Logger.getLogger(FirebaseInitializer.class.getName());

    private static FirebaseApp firebaseApp;
    private static FirebaseAuth firebaseAuth;
    private static Firestore firestore;
    private static boolean initialized = false;

    private FirebaseInitializer() {
        // Prevent instantiation
    }

    /**
     * Initializes Firebase with the provided service account credentials.
     * 
     * @param serviceAccountPath Path to the Firebase service account JSON file.
     *                           Place this file in src/main/resources/firebase/
     * @throws IOException           if the credentials file cannot be read
     * @throws IllegalStateException if Firebase is already initialized
     */
    public static synchronized void initialize(String serviceAccountPath) throws IOException {
        if (initialized) {
            LOGGER.warning("Firebase already initialized. Skipping re-initialization.");
            return;
        }

        LOGGER.info("Initializing Firebase...");

        try (InputStream serviceAccount = new FileInputStream(serviceAccountPath)) {
            FirebaseOptions options = FirebaseOptions.builder()
                    .setCredentials(GoogleCredentials.fromStream(serviceAccount))
                    .build();

            firebaseApp = FirebaseApp.initializeApp(options);
            firebaseAuth = FirebaseAuth.getInstance(firebaseApp);
            firestore = FirestoreClient.getFirestore(firebaseApp);

            initialized = true;
            LOGGER.info("Firebase initialized successfully.");

        } catch (IOException e) {
            LOGGER.log(Level.SEVERE, "Failed to initialize Firebase", e);
            throw e;
        }
    }

    /**
     * Initializes Firebase using a resource stream (for packaged applications).
     * 
     * @param resourceStream InputStream of the service account JSON
     * @throws IOException if initialization fails
     */
    public static synchronized void initialize(InputStream resourceStream) throws IOException {
        if (initialized) {
            LOGGER.warning("Firebase already initialized. Skipping re-initialization.");
            return;
        }

        LOGGER.info("Initializing Firebase from resource stream...");

        FirebaseOptions options = FirebaseOptions.builder()
                .setCredentials(GoogleCredentials.fromStream(resourceStream))
                .build();

        firebaseApp = FirebaseApp.initializeApp(options);
        firebaseAuth = FirebaseAuth.getInstance(firebaseApp);
        firestore = FirestoreClient.getFirestore(firebaseApp);

        initialized = true;
        LOGGER.info("Firebase initialized successfully.");
    }

    /**
     * @return true if Firebase has been initialized
     */
    public static boolean isInitialized() {
        return initialized;
    }

    /**
     * @return FirebaseAuth instance for authentication operations
     * @throws IllegalStateException if Firebase is not initialized
     */
    public static FirebaseAuth getAuth() {
        checkInitialized();
        return firebaseAuth;
    }

    /**
     * @return Firestore instance for database operations
     * @throws IllegalStateException if Firebase is not initialized
     */
    public static Firestore getFirestore() {
        checkInitialized();
        return firestore;
    }

    /**
     * Shuts down Firebase services. Call this when the application exits.
     */
    public static synchronized void shutdown() {
        if (firebaseApp != null) {
            firebaseApp.delete();
            firebaseApp = null;
            firebaseAuth = null;
            firestore = null;
            initialized = false;
            LOGGER.info("Firebase shut down successfully.");
        }
    }

    private static void checkInitialized() {
        if (!initialized) {
            throw new IllegalStateException("Firebase has not been initialized. Call initialize() first.");
        }
    }
}
