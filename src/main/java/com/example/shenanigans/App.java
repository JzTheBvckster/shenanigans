package com.example.shenanigans;

import com.example.shenanigans.core.firebase.FirebaseInitializer;
import com.example.shenanigans.core.firebase.FirebaseBootstrap;
import com.example.shenanigans.core.session.SessionManager;
import java.io.IOException;
import java.util.logging.Logger;
import javafx.application.Application;
import javafx.fxml.FXMLLoader;
import javafx.scene.Parent;
import javafx.scene.Scene;
import javafx.stage.Stage;
import javafx.stage.Window;

/** JavaFX App */
public class App extends Application {

  private static final Logger LOGGER = Logger.getLogger(App.class.getName());
  private static Scene scene;
  private static Stage primaryStage;

  @Override
  public void init() {
    // Initialize Firebase Admin SDK before the UI loads
    initializeFirebase();

    // Load persisted theme preference early
    com.example.shenanigans.core.theme.ThemeService.initFromPreferences();
  }

  @Override
  public void start(Stage stage) throws IOException {
    primaryStage = stage;

    // Check if user is already authenticated
    String initialView;
    if (SessionManager.getInstance().isLoggedIn()) {
      // Route to appropriate dashboard based on user role
      var user = SessionManager.getInstance().getCurrentUser();
      if (user != null && user.isEmployee()) {
        initialView = "features/employee_dashboard/view/employee_dashboard_view";
        LOGGER.info("Employee authenticated, loading employee dashboard");
      } else {
        initialView = "features/dashboard/view/dashboard_view";
        LOGGER.info("User authenticated, loading main dashboard");
      }
    } else {
      initialView = "features/auth/view/auth_view";
      LOGGER.info("No authenticated user, loading login");
    }

    scene = new Scene(loadFXML(initialView), 1024, 700);

    // Apply theme and keep it in sync for the lifetime of this scene
    com.example.shenanigans.core.theme.ThemeService.bindToScene(scene);
    stage.setTitle("Shenanigans - Enterprise Management");
    stage.setMinWidth(800);
    stage.setMinHeight(600);
    stage.setScene(scene);
    stage.show();
  }

  @Override
  public void stop() {
    // Clean up Firebase on app exit
    FirebaseInitializer.shutdown();
    LOGGER.info("Application stopped");
  }

  private void initializeFirebase() {
    FirebaseBootstrap.initializeFromStandardSources(getClass(), LOGGER);
  }

  /**
   * Changes the root view of the application.
   *
   * @param fxml Path to the FXML file (without .fxml extension)
   * @throws IOException if the FXML file cannot be loaded
   */
  public static void setRoot(String fxml) throws IOException {
    Scene targetScene = resolveNavigationScene();
    if (targetScene == null) {
      throw new IllegalStateException("No active JavaFX scene available for navigation to: " + fxml);
    }
    setRoot(targetScene, fxml);
  }

  /**
   * Changes the root view on a specific scene.
   *
   * @param targetScene scene to apply the new root to
   * @param fxml Path to the FXML file (without .fxml extension)
   * @throws IOException if the FXML file cannot be loaded
   */
  public static void setRoot(Scene targetScene, String fxml) throws IOException {
    targetScene.setRoot(loadFXML(fxml));

    // Re-apply theme because root-local stylesheets change per view.
    com.example.shenanigans.core.theme.ThemeService.applyToScene(targetScene);

    // Keep desktop compatibility while allowing JPro to target the active scene.
    scene = targetScene;
  }

  /**
   * Gets the primary Scene.
   *
   * @return the primary Scene, or null if not yet created
   */
  public static Scene getScene() {
    return scene;
  }

  /**
   * Gets the primary stage.
   *
   * @return The primary stage
   */
  public static Stage getPrimaryStage() {
    return primaryStage;
  }

  private static Parent loadFXML(String fxml) throws IOException {
    FXMLLoader fxmlLoader = new FXMLLoader(App.class.getResource(fxml + ".fxml"));
    return fxmlLoader.load();
  }

  private static Scene resolveNavigationScene() {
    if (scene != null && scene.getWindow() != null && scene.getWindow().isShowing()) {
      return scene;
    }

    for (Window window : Window.getWindows()) {
      if (window != null && window.isShowing() && window.isFocused() && window.getScene() != null) {
        return window.getScene();
      }
    }

    for (Window window : Window.getWindows()) {
      if (window != null && window.isShowing() && window.getScene() != null) {
        return window.getScene();
      }
    }

    return scene;
  }

  public static void main(String[] args) {
    launch();
  }
}
