package com.example.shenanigans.core.firebase;

import java.io.IOException;
import java.io.InputStream;
import java.util.Properties;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Configuration loader for Firebase settings. Loads Firebase API key and project settings from
 * firebase.properties file or environment variables.
 *
 * <p>Create a file at src/main/resources/firebase/firebase.properties with:
 *
 * <pre>
 * firebase.apiKey=YOUR_WEB_API_KEY
 * firebase.projectId=YOUR_PROJECT_ID
 * </pre>
 *
 * <p>For containers/cloud deployments, set:
 *
 * <pre>
 * FIREBASE_API_KEY=YOUR_WEB_API_KEY
 * FIREBASE_PROJECT_ID=YOUR_PROJECT_ID
 * </pre>
 */
public class FirebaseConfig {

  private static final Logger LOGGER = Logger.getLogger(FirebaseConfig.class.getName());
  private static final String CONFIG_FILE = "firebase/firebase.properties";

  private static FirebaseConfig instance;

  private String apiKey;
  private String projectId;
  private boolean loaded = false;

  private FirebaseConfig() {
    load();
  }

  /**
   * Gets the singleton instance of FirebaseConfig.
   *
   * @return FirebaseConfig instance
   */
  public static synchronized FirebaseConfig getInstance() {
    if (instance == null) {
      instance = new FirebaseConfig();
    }
    return instance;
  }

  private void load() {
    Properties props = new Properties();
    boolean loadedFromFile = false;

    try (InputStream input = openConfigStream()) {
      if (input != null) {
        props.load(input);
        loadedFromFile = true;
      }
    } catch (IOException e) {
      LOGGER.log(Level.SEVERE, "Failed to load Firebase config", e);
      return;
    }

    apiKey =
        firstNonBlank(
            props.getProperty("firebase.apiKey"),
            props.getProperty("firebase.api.key"),
            readSetting("FIREBASE_API_KEY"),
            readSetting("firebase.apiKey"),
            readSetting("firebase.api.key"));

    projectId =
        firstNonBlank(
            props.getProperty("firebase.projectId"),
            props.getProperty("firebase.project.id"),
            readSetting("FIREBASE_PROJECT_ID"),
            readSetting("firebase.projectId"),
            readSetting("firebase.project.id"));

    if (!loadedFromFile) {
      LOGGER.warning("Firebase config file not found: /" + CONFIG_FILE);
      LOGGER.info("Using environment variable fallback if available.");
    }

    boolean apiKeyValid = apiKey != null && !apiKey.isBlank() && !apiKey.startsWith("YOUR_");
    boolean projectIdValid = projectId != null && !projectId.isBlank() && !projectId.startsWith("YOUR_");

    if (!apiKeyValid) {
      LOGGER.warning(
          "Firebase API key not configured. Set FIREBASE_API_KEY or firebase.apiKey in firebase.properties");
    }
    if (!projectIdValid) {
      LOGGER.warning(
          "Firebase project ID not configured. Set FIREBASE_PROJECT_ID or firebase.projectId in firebase.properties");
    }

    loaded = apiKeyValid && projectIdValid;
    if (loaded) {
      LOGGER.info("Firebase configuration loaded successfully");
    }
  }

  private InputStream openConfigStream() {
    ClassLoader classLoader = Thread.currentThread().getContextClassLoader();
    if (classLoader != null) {
      InputStream input = classLoader.getResourceAsStream(CONFIG_FILE);
      if (input != null) {
        return input;
      }
    }
    return FirebaseConfig.class.getResourceAsStream("/" + CONFIG_FILE);
  }

  private String readSetting(String key) {
    String value = System.getenv(key);
    if (value == null || value.isBlank()) {
      value = System.getProperty(key);
    }
    return value;
  }

  private String firstNonBlank(String... values) {
    for (String value : values) {
      if (value != null && !value.isBlank()) {
        return value;
      }
    }
    return null;
  }

  /**
   * @return Firebase Web API Key
   */
  public String getApiKey() {
    return apiKey;
  }

  /**
   * @return Firebase Project ID
   */
  public String getProjectId() {
    return projectId;
  }

  /**
   * @return true if configuration was loaded successfully
   */
  public boolean isLoaded() {
    return loaded;
  }
}
