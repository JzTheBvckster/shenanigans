package com.example.shenanigans.core.firebase;

import java.io.IOException;
import java.io.InputStream;
import java.util.Properties;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Configuration loader for Firebase settings. Loads Firebase API key and project settings from
 * firebase.properties file.
 *
 * <p>Create a file at src/main/resources/firebase/firebase.properties with:
 *
 * <pre>
 * firebase.apiKey=YOUR_WEB_API_KEY
 * firebase.projectId=YOUR_PROJECT_ID
 * </pre>
 */
public class FirebaseConfig {

  private static final Logger LOGGER = Logger.getLogger(FirebaseConfig.class.getName());
  private static final String CONFIG_FILE = "/firebase/firebase.properties";

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
    try (InputStream input = getClass().getResourceAsStream(CONFIG_FILE)) {
      if (input == null) {
        LOGGER.warning("Firebase config file not found: " + CONFIG_FILE);
        LOGGER.info("Create firebase.properties in src/main/resources/firebase/ with your API key");
        return;
      }

      Properties props = new Properties();
      props.load(input);

      apiKey = props.getProperty("firebase.apiKey");
      projectId = props.getProperty("firebase.projectId");

      if (apiKey == null || apiKey.isEmpty() || apiKey.startsWith("YOUR_")) {
        LOGGER.warning("Firebase API key not configured. Update firebase.properties");
      } else {
        loaded = true;
        LOGGER.info("Firebase configuration loaded successfully");
      }

    } catch (IOException e) {
      LOGGER.log(Level.SEVERE, "Failed to load Firebase config", e);
    }
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
