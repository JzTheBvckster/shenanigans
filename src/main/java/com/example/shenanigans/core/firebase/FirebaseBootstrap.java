package com.example.shenanigans.core.firebase;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Boots Firebase using environment variables first, then classpath fallback.
 *
 * <p>This keeps startup consistent across desktop, containers, and cloud deployments.
 */
public final class FirebaseBootstrap {

  private static final String DEFAULT_SERVICE_ACCOUNT_RESOURCE =
      "/firebase/shenanigans-ff409-firebase-adminsdk-fbsvc-e841083317.json";

  private FirebaseBootstrap() {
    // Utility class
  }

  /**
   * Initializes Firebase using standard credential sources.
   *
   * @param resourceOwner class used to load classpath resources
   * @param logger logger used for status/error messages
   * @return true when Firebase is initialized; false when credentials are missing/invalid
   */
  public static boolean initializeFromStandardSources(Class<?> resourceOwner, Logger logger) {
    Logger targetLogger = logger != null ? logger : Logger.getLogger(FirebaseBootstrap.class.getName());

    if (FirebaseInitializer.isInitialized()) {
      targetLogger.fine("Firebase already initialized. Skipping bootstrap.");
      return true;
    }

    try {
      String serviceAccountJson = System.getenv("FIREBASE_SERVICE_ACCOUNT_JSON");
      if (serviceAccountJson != null && !serviceAccountJson.isBlank()) {
        try (InputStream input =
            new ByteArrayInputStream(serviceAccountJson.getBytes(StandardCharsets.UTF_8))) {
          FirebaseInitializer.initialize(input);
          targetLogger.info("Firebase initialized from FIREBASE_SERVICE_ACCOUNT_JSON");
          return true;
        }
      }

      String serviceAccountBase64 = System.getenv("FIREBASE_SERVICE_ACCOUNT_BASE64");
      if (serviceAccountBase64 != null && !serviceAccountBase64.isBlank()) {
        byte[] decoded = Base64.getDecoder().decode(serviceAccountBase64);
        try (InputStream input = new ByteArrayInputStream(decoded)) {
          FirebaseInitializer.initialize(input);
          targetLogger.info("Firebase initialized from FIREBASE_SERVICE_ACCOUNT_BASE64");
          return true;
        }
      }

      InputStream classpathCredentials =
          resourceOwner != null
              ? resourceOwner.getResourceAsStream(DEFAULT_SERVICE_ACCOUNT_RESOURCE)
              : FirebaseBootstrap.class.getResourceAsStream(DEFAULT_SERVICE_ACCOUNT_RESOURCE);

      if (classpathCredentials == null) {
        targetLogger.warning("Firebase service account file not found in classpath.");
        targetLogger.info(
            "Set FIREBASE_SERVICE_ACCOUNT_JSON or FIREBASE_SERVICE_ACCOUNT_BASE64 in environment.");
        return false;
      }

      try (InputStream input = classpathCredentials) {
        FirebaseInitializer.initialize(input);
        targetLogger.info("Firebase initialized from bundled classpath credentials");
        return true;
      }
    } catch (IllegalArgumentException illegalBase64) {
      targetLogger.log(
          Level.SEVERE,
          "Invalid base64 content in FIREBASE_SERVICE_ACCOUNT_BASE64",
          illegalBase64);
      return false;
    } catch (IOException ioException) {
      targetLogger.log(Level.SEVERE, "Failed to initialize Firebase", ioException);
      return false;
    }
  }
}
