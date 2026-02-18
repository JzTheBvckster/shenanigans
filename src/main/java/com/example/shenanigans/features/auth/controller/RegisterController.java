package com.example.shenanigans.features.auth.controller;

import com.example.shenanigans.App;
import com.example.shenanigans.core.session.SessionManager;
import com.example.shenanigans.features.auth.model.User;
import com.example.shenanigans.features.auth.service.AuthService;
import java.util.logging.Level;
import java.util.logging.Logger;
import javafx.application.Platform;
import javafx.concurrent.Task;
import javafx.fxml.FXML;
import javafx.scene.control.*;
import javafx.scene.layout.VBox;

/**
 * Controller for the registration view. Handles user registration UI
 * interactions.
 */
public class RegisterController {

  private static final Logger LOGGER = Logger.getLogger(RegisterController.class.getName());

  // Services
  private final AuthService authService = new AuthService();

  // FXML Components - Register
  @FXML
  private VBox registerPane;
  @FXML
  private TextField registerEmailField;
  @FXML
  private PasswordField registerPasswordField;
  @FXML
  private TextField registerPasswordVisibleField;
  @FXML
  private Button registerPasswordToggleButton;
  @FXML
  private PasswordField confirmPasswordField;
  @FXML
  private TextField confirmPasswordVisibleField;
  @FXML
  private Button confirmPasswordToggleButton;
  @FXML
  private TextField displayNameField;
  @FXML
  private ComboBox<String> roleComboBox;
  @FXML
  private Button registerButton;
  @FXML
  private Hyperlink backToLoginLink;

  // FXML Components - Common
  @FXML
  private Label statusLabel;
  @FXML
  private ProgressIndicator loadingIndicator;

  // FXML Components - Field Error Labels
  @FXML
  private Label nameErrorLabel;
  @FXML
  private Label emailErrorLabel;
  @FXML
  private Label passwordErrorLabel;
  @FXML
  private Label confirmPasswordErrorLabel;

  /** Called automatically after FXML is loaded. */
  @FXML
  public void initialize() {
    // Setup role combo box
    if (roleComboBox != null) {
      roleComboBox.getItems().addAll("Employee", "Project Manager", "Managing Director");
      roleComboBox.setValue("Employee");
    }

    // Hide loading indicator initially
    if (loadingIndicator != null) {
      loadingIndicator.setVisible(false);
    }

    // Clear status initially
    clearStatus();

    initializePasswordVisibilityToggles();

    // Setup real-time validation listeners
    setupValidationListeners();

    LOGGER.info("RegisterController initialized");
  }

  /**
   * Sets up real-time validation listeners for form fields. Validates when user
   * finishes typing (on
   * focus lost).
   */
  private void setupValidationListeners() {
    // Name field validation - on focus lost
    if (displayNameField != null) {
      displayNameField
          .focusedProperty()
          .addListener(
              (obs, wasFocused, isNowFocused) -> {
                if (!isNowFocused) { // Lost focus
                  validateNameField();
                }
              });
    }

    // Email field validation - on focus lost
    if (registerEmailField != null) {
      registerEmailField
          .focusedProperty()
          .addListener(
              (obs, wasFocused, isNowFocused) -> {
                if (!isNowFocused) { // Lost focus
                  validateEmailField();
                }
              });
    }

    // Password field validation - on focus lost
    if (registerPasswordField != null) {
      registerPasswordField
          .focusedProperty()
          .addListener(
              (obs, wasFocused, isNowFocused) -> {
                if (!isNowFocused) { // Lost focus
                  validatePasswordField();
                  // Also re-validate confirm password if it has content
                  if (confirmPasswordField != null && !confirmPasswordField.getText().isEmpty()) {
                    validateConfirmPasswordField();
                  }
                }
              });
    }

    // Confirm password field validation - on focus lost
    if (confirmPasswordField != null) {
      confirmPasswordField
          .focusedProperty()
          .addListener(
              (obs, wasFocused, isNowFocused) -> {
                if (!isNowFocused) { // Lost focus
                  validateConfirmPasswordField();
                }
              });
    }
  }

  /**
   * Validates the name field and shows/hides error.
   *
   * @return true if valid
   */
  private boolean validateNameField() {
    String name = displayNameField.getText().trim();
    if (name.isEmpty()) {
      showFieldError(displayNameField, nameErrorLabel, "Full name is required");
      return false;
    } else if (name.length() < 2) {
      showFieldError(displayNameField, nameErrorLabel, "Name must be at least 2 characters");
      return false;
    } else {
      clearFieldError(displayNameField, nameErrorLabel);
      return true;
    }
  }

  /**
   * Validates the email field and shows/hides error.
   *
   * @return true if valid
   */
  private boolean validateEmailField() {
    String email = registerEmailField.getText().trim();
    if (email.isEmpty()) {
      showFieldError(registerEmailField, emailErrorLabel, "Email address is required");
      return false;
    } else if (!isValidEmail(email)) {
      showFieldError(registerEmailField, emailErrorLabel, "Please enter a valid email address");
      return false;
    } else {
      clearFieldError(registerEmailField, emailErrorLabel);
      return true;
    }
  }

  /**
   * Validates the password field and shows/hides error.
   *
   * @return true if valid
   */
  private boolean validatePasswordField() {
    String password = getRegisterPassword();
    if (password.isEmpty()) {
      showFieldError(registerPasswordField, passwordErrorLabel, "Password is required");
      return false;
    }
    String error = validatePassword(password);
    if (error != null) {
      showFieldError(registerPasswordField, passwordErrorLabel, error);
      return false;
    } else {
      clearFieldError(registerPasswordField, passwordErrorLabel);
      return true;
    }
  }

  /**
   * Validates the confirm password field and shows/hides error.
   *
   * @return true if valid
   */
  private boolean validateConfirmPasswordField() {
    String password = getRegisterPassword();
    String confirmPassword = getConfirmPassword();
    if (confirmPassword.isEmpty()) {
      showFieldError(
          confirmPasswordField, confirmPasswordErrorLabel, "Please confirm your password");
      return false;
    } else if (!confirmPassword.equals(password)) {
      showFieldError(confirmPasswordField, confirmPasswordErrorLabel, "Passwords do not match");
      return false;
    } else {
      clearFieldError(confirmPasswordField, confirmPasswordErrorLabel);
      return true;
    }
  }

  /** Shows an error for a specific field. */
  private void showFieldError(TextField field, Label errorLabel, String message) {
    if (field != null) {
      field.getStyleClass().removeAll("auth-field-valid", "auth-field-error");
      field.getStyleClass().add("auth-field-error");
    }
    if (errorLabel != null) {
      errorLabel.setText(message);
      errorLabel.setVisible(true);
      errorLabel.setManaged(true);
    }
  }

  /** Clears the error for a specific field and marks it as valid. */
  private void clearFieldError(TextField field, Label errorLabel) {
    if (field != null) {
      field.getStyleClass().removeAll("auth-field-valid", "auth-field-error");
      field.getStyleClass().add("auth-field-valid");
    }
    if (errorLabel != null) {
      errorLabel.setText("");
      errorLabel.setVisible(false);
      errorLabel.setManaged(false);
    }
  }

  /** Handles register button click. */
  @FXML
  private void handleRegister() {
    String displayName = displayNameField.getText().trim();
    String email = registerEmailField.getText().trim();
    String password = getRegisterPassword();
    String selectedRole = roleComboBox.getValue();

    // Run all validations
    boolean nameValid = validateNameField();
    boolean emailValid = validateEmailField();
    boolean passwordValid = validatePasswordField();
    boolean confirmValid = validateConfirmPasswordField();

    // If any validation fails, stop
    if (!nameValid || !emailValid || !passwordValid || !confirmValid) {
      showStatus("Please fix the errors above", true);
      return;
    }

    if (selectedRole == null) {
      showStatus("Please select a role", true);
      return;
    }

    // Convert display role to system role
    String role = switch (selectedRole) {
      case "Employee" -> "EMPLOYEE";
      case "Project Manager" -> "PROJECT_MANAGER";
      case "Managing Director" -> "MANAGING_DIRECTOR";
      default -> "EMPLOYEE";
    };

    setLoading(true);
    showStatus("Creating account...", false);

    Task<User> signUpTask = authService.signUp(email, password, displayName, role);

    signUpTask.setOnSucceeded(
        event -> Platform.runLater(
            () -> {
              setLoading(false);
              User user = signUpTask.getValue();
              LOGGER.info("User registered: " + user.getEmail());

              // Auto-login after successful registration
              onRegistrationSuccess(user);
            }));

    signUpTask.setOnFailed(
        event -> Platform.runLater(
            () -> {
              setLoading(false);
              Throwable error = signUpTask.getException();
              String message = error.getMessage() != null ? error.getMessage() : "Registration failed";
              showStatus(message, true);
              LOGGER.log(Level.SEVERE, "Registration failed", error);
            }));

    new Thread(signUpTask).start();
  }

  /**
   * Called when registration is successful. Stores session and navigates to
   * dashboard.
   *
   * @param user The newly registered user
   */
  private void onRegistrationSuccess(User user) {
    if ((user.isEmployee() || user.isProjectManager()) && !user.isMdApproved()) {
      LOGGER.info(
          "Registration successful but pending MD approval for: " + user.getEmail());
      showAlert(
          "Registration Submitted",
          "Your account has been created and is pending Managing Director approval.");
      navigateToLogin();
      return;
    }

    // Store session information
    SessionManager.getInstance()
        .setSession(
            user, authService.getCurrentIdToken(), null // Refresh token handling can be added later
        );

    LOGGER.info(
        "Registration successful for: " + user.getDisplayName() + " (" + user.getRole() + ")");

    // Navigate to dashboard
    navigateToDashboard();
  }

  /** Navigates to the login view. */
  @FXML
  private void navigateToLogin() {
    try {
      App.setRoot("features/auth/view/auth_view");
    } catch (Exception e) {
      LOGGER.log(Level.SEVERE, "Failed to navigate to login", e);
      showStatus("Failed to load login page", true);
    }
  }

  /** Navigates to the appropriate dashboard based on user role. */
  private void navigateToDashboard() {
    try {
      User user = SessionManager.getInstance().getCurrentUser();
      if (user != null && user.isEmployee()) {
        App.setRoot("features/employee_dashboard/view/employee_dashboard_view");
      } else {
        App.setRoot("features/dashboard/view/dashboard_view");
      }
    } catch (Exception e) {
      LOGGER.log(Level.SEVERE, "Failed to navigate to dashboard", e);
      showStatus("Failed to load dashboard", true);
    }
  }

  private void showAlert(String title, String message) {
    Alert alert = new Alert(Alert.AlertType.INFORMATION);
    alert.setTitle(title);
    alert.setHeaderText(null);
    alert.setContentText(message);
    alert.showAndWait();
  }

  // Helper Methods

  /**
   * Shows a status message to the user.
   *
   * @param message The message to display
   * @param isError Whether this is an error message
   */
  private void showStatus(String message, boolean isError) {
    if (statusLabel != null) {
      statusLabel.setText(message);
      statusLabel.getStyleClass().removeAll("status-error", "status-success");
      statusLabel.getStyleClass().add(isError ? "status-error" : "status-success");
      statusLabel.setVisible(true);
      statusLabel.setManaged(true);
    }
  }

  /** Clears the status message. */
  private void clearStatus() {
    if (statusLabel != null) {
      statusLabel.setText("");
      statusLabel.setVisible(false);
      statusLabel.setManaged(false);
    }
  }

  /**
   * Sets the loading state of the form.
   *
   * @param loading Whether the form is in a loading state
   */
  private void setLoading(boolean loading) {
    if (loadingIndicator != null) {
      loadingIndicator.setVisible(loading);
    }
    if (registerButton != null) {
      registerButton.setDisable(loading);
    }
    if (displayNameField != null) {
      displayNameField.setDisable(loading);
    }
    if (registerEmailField != null) {
      registerEmailField.setDisable(loading);
    }
    if (registerPasswordField != null) {
      registerPasswordField.setDisable(loading);
    }
    if (registerPasswordVisibleField != null) {
      registerPasswordVisibleField.setDisable(loading);
    }
    if (registerPasswordToggleButton != null) {
      registerPasswordToggleButton.setDisable(loading);
    }
    if (confirmPasswordField != null) {
      confirmPasswordField.setDisable(loading);
    }
    if (confirmPasswordVisibleField != null) {
      confirmPasswordVisibleField.setDisable(loading);
    }
    if (confirmPasswordToggleButton != null) {
      confirmPasswordToggleButton.setDisable(loading);
    }
    if (roleComboBox != null) {
      roleComboBox.setDisable(loading);
    }
  }

  private void initializePasswordVisibilityToggles() {
    setupPasswordToggle(
        registerPasswordField, registerPasswordVisibleField, registerPasswordToggleButton);
    setupPasswordToggle(confirmPasswordField, confirmPasswordVisibleField, confirmPasswordToggleButton);
  }

  private void setupPasswordToggle(
      PasswordField obscuredField, TextField visibleField, Button toggleButton) {
    if (obscuredField == null || visibleField == null) {
      return;
    }

    visibleField.setManaged(false);
    visibleField.setVisible(false);
    obscuredField.setManaged(true);
    obscuredField.setVisible(true);

    obscuredField
        .textProperty()
        .addListener(
            (obs, oldValue, newValue) -> {
              if (!newValue.equals(visibleField.getText())) {
                visibleField.setText(newValue);
              }
            });
    visibleField
        .textProperty()
        .addListener(
            (obs, oldValue, newValue) -> {
              if (!newValue.equals(obscuredField.getText())) {
                obscuredField.setText(newValue);
              }
            });

    if (toggleButton != null) {
      toggleButton.setText("Show");
    }
  }

  @FXML
  private void handleToggleRegisterPassword() {
    togglePasswordVisibility(
        registerPasswordField, registerPasswordVisibleField, registerPasswordToggleButton);
  }

  @FXML
  private void handleToggleConfirmPassword() {
    togglePasswordVisibility(
        confirmPasswordField, confirmPasswordVisibleField, confirmPasswordToggleButton);
  }

  private void togglePasswordVisibility(
      PasswordField obscuredField, TextField visibleField, Button toggleButton) {
    if (obscuredField == null || visibleField == null) {
      return;
    }

    boolean currentlyObscured = obscuredField.isVisible();
    obscuredField.setVisible(!currentlyObscured);
    obscuredField.setManaged(!currentlyObscured);
    visibleField.setVisible(currentlyObscured);
    visibleField.setManaged(currentlyObscured);

    if (toggleButton != null) {
      toggleButton.setText(currentlyObscured ? "Hide" : "Show");
    }
  }

  private String getRegisterPassword() {
    if (registerPasswordVisibleField != null && registerPasswordVisibleField.isVisible()) {
      return registerPasswordVisibleField.getText();
    }
    return registerPasswordField != null ? registerPasswordField.getText() : "";
  }

  private String getConfirmPassword() {
    if (confirmPasswordVisibleField != null && confirmPasswordVisibleField.isVisible()) {
      return confirmPasswordVisibleField.getText();
    }
    return confirmPasswordField != null ? confirmPasswordField.getText() : "";
  }

  /**
   * Validates an email address format using RFC 5322 compliant pattern.
   *
   * @param email The email to validate
   * @return true if the email format is valid
   */
  private boolean isValidEmail(String email) {
    if (email == null || email.isEmpty()) {
      return false;
    }
    // RFC 5322 compliant email regex pattern
    String emailRegex = "^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$";
    return email.matches(emailRegex)
        && email.contains(".")
        && email.indexOf("@") < email.lastIndexOf(".");
  }

  /**
   * Validates password strength according to modern security standards.
   * Requirements: - Minimum 8
   * characters - At least one uppercase letter - At least one lowercase letter -
   * At least one digit
   * - At least one special character
   *
   * @param password The password to validate
   * @return Error message if invalid, null if valid
   */
  private String validatePassword(String password) {
    if (password == null || password.isEmpty()) {
      return "Password is required";
    }

    if (password.length() < 8) {
      return "Password must be at least 8 characters long";
    }

    if (password.length() > 128) {
      return "Password must not exceed 128 characters";
    }

    if (!password.matches(".*[A-Z].*")) {
      return "Password must contain at least one uppercase letter";
    }

    if (!password.matches(".*[a-z].*")) {
      return "Password must contain at least one lowercase letter";
    }

    if (!password.matches(".*[0-9].*")) {
      return "Password must contain at least one digit";
    }

    if (!password.matches(".*[!@#$%^&*()_+\\-=\\[\\]{}|;:,.<>?].*")) {
      return "Password must contain at least one special character (!@#$%^&*...)";
    }

    // Check for common weak passwords
    String lowerPassword = password.toLowerCase();
    if (lowerPassword.contains("password")
        || lowerPassword.contains("123456")
        || lowerPassword.contains("qwerty")
        || lowerPassword.equals("abcdefgh")) {
      return "Password is too common. Please choose a stronger password";
    }

    return null; // Password is valid
  }
}
