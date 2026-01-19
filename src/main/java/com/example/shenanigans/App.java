package com.example.shenanigans;

import com.example.shenanigans.core.firebase.FirebaseInitializer;
import com.example.shenanigans.core.session.SessionManager;

import javafx.application.Application;
import javafx.fxml.FXMLLoader;
import javafx.scene.Parent;
import javafx.scene.Scene;
import javafx.stage.Stage;

import java.io.IOException;
import java.io.InputStream;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * JavaFX App
 */
public class App extends Application {

    private static final Logger LOGGER = Logger.getLogger(App.class.getName());
    private static Scene scene;
    private static Stage primaryStage;

    @Override
    public void init() {
        // Initialize Firebase Admin SDK before the UI loads
        initializeFirebase();
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
        try {
            // Load service account from resources
            InputStream serviceAccount = getClass().getResourceAsStream(
                    "/firebase/shenanigans-ff409-firebase-adminsdk-fbsvc-e841083317.json");

            if (serviceAccount == null) {
                LOGGER.warning("Firebase service account file not found. Firestore operations will fail.");
                return;
            }

            FirebaseInitializer.initialize(serviceAccount);
            LOGGER.info("Firebase Admin SDK initialized successfully");

        } catch (IOException e) {
            LOGGER.log(Level.SEVERE, "Failed to initialize Firebase Admin SDK", e);
        }
    }

    /**
     * Changes the root view of the application.
     * 
     * @param fxml Path to the FXML file (without .fxml extension)
     * @throws IOException if the FXML file cannot be loaded
     */
    public static void setRoot(String fxml) throws IOException {
        scene.setRoot(loadFXML(fxml));
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

    public static void main(String[] args) {
        launch();
    }

}