package com.example.shenanigans.core.firebase;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.SocketException;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import javax.net.ssl.SSLException;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Firebase Authentication REST API client. Handles client-side authentication
 * operations (sign in,
 * sign up, password reset).
 *
 * <p>
 * This uses Firebase's Identity Toolkit REST API since the Admin SDK doesn't
 * support client-side
 * email/password authentication.
 *
 * @see <a href="https://firebase.google.com/docs/reference/rest/auth">Firebase
 *      Auth REST API</a>
 */
public class FirebaseAuthClient {

  private static final Logger LOGGER = Logger.getLogger(FirebaseAuthClient.class.getName());

  private static final String SIGN_UP_URL = "https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=";
  private static final String SIGN_IN_URL = "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=";
  private static final String PASSWORD_RESET_URL = "https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=";
  private static final String GET_USER_DATA_URL = "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=";
  private static final String UPDATE_PROFILE_URL = "https://identitytoolkit.googleapis.com/v1/accounts:update?key=";
  private static final int MAX_NETWORK_RETRIES = 2;
  private static final long RETRY_DELAY_MILLIS = 400L;

  private final String apiKey;

  public FirebaseAuthClient(String apiKey) {
    this.apiKey = apiKey;
  }

  public AuthResponse signUp(String email, String password) throws FirebaseAuthException {
    String payload = String.format(
        "{\"email\":\"%s\",\"password\":\"%s\",\"returnSecureToken\":true}",
        escapeJson(email), escapeJson(password));

    return executeAuthRequest(SIGN_UP_URL + apiKey, payload);
  }

  public AuthResponse signIn(String email, String password) throws FirebaseAuthException {
    String payload = String.format(
        "{\"email\":\"%s\",\"password\":\"%s\",\"returnSecureToken\":true}",
        escapeJson(email), escapeJson(password));

    return executeAuthRequest(SIGN_IN_URL + apiKey, payload);
  }

  public void sendPasswordResetEmail(String email) throws FirebaseAuthException {
    String payload = String.format("{\"requestType\":\"PASSWORD_RESET\",\"email\":\"%s\"}", escapeJson(email));

    try {
      sendPostRequestWithRetry(PASSWORD_RESET_URL + apiKey, payload);
      LOGGER.info("Password reset email sent to: " + email);
    } catch (IOException e) {
      throw new FirebaseAuthException(mapNetworkErrorMessage(e), e);
    }
  }

  public void updateProfile(String idToken, String displayName) throws FirebaseAuthException {
    String payload = String.format(
        "{\"idToken\":\"%s\",\"displayName\":\"%s\",\"returnSecureToken\":true}",
        escapeJson(idToken), escapeJson(displayName));

    try {
      sendPostRequestWithRetry(UPDATE_PROFILE_URL + apiKey, payload);
      LOGGER.info("Profile updated successfully");
    } catch (IOException e) {
      throw new FirebaseAuthException(mapNetworkErrorMessage(e), e);
    }
  }

  public String getUserData(String idToken) throws FirebaseAuthException {
    String payload = String.format("{\"idToken\":\"%s\"}", escapeJson(idToken));

    try {
      return sendPostRequestWithRetry(GET_USER_DATA_URL + apiKey, payload);
    } catch (IOException e) {
      throw new FirebaseAuthException(mapNetworkErrorMessage(e), e);
    }
  }

  private AuthResponse executeAuthRequest(String url, String payload) throws FirebaseAuthException {
    try {
      String response = sendPostRequestWithRetry(url, payload);
      return parseAuthResponse(response);
    } catch (IOException e) {
      throw new FirebaseAuthException(mapNetworkErrorMessage(e), e);
    }
  }

  private String sendPostRequestWithRetry(String urlString, String payload)
      throws IOException, FirebaseAuthException {
    IOException lastException = null;
    for (int attempt = 1; attempt <= MAX_NETWORK_RETRIES + 1; attempt++) {
      try {
        return sendPostRequest(urlString, payload);
      } catch (IOException ioException) {
        lastException = ioException;
        if (!isTransientNetworkError(ioException) || attempt > MAX_NETWORK_RETRIES) {
          break;
        }

        LOGGER.log(
            Level.WARNING,
            "Transient network error during Firebase auth call, retrying (attempt "
                + (attempt + 1)
                + "/"
                + (MAX_NETWORK_RETRIES + 1)
                + ")",
            ioException);
        sleepQuietly(RETRY_DELAY_MILLIS * attempt);
      }
    }

    throw lastException;
  }

  private String sendPostRequest(String urlString, String payload)
      throws IOException, FirebaseAuthException {
    URL url = new URL(urlString);
    HttpURLConnection conn = (HttpURLConnection) url.openConnection();

    try {
      conn.setRequestMethod("POST");
      conn.setRequestProperty("Content-Type", "application/json");
      conn.setRequestProperty("Accept", "application/json");
      conn.setRequestProperty("Connection", "close");
      conn.setDoOutput(true);
      conn.setUseCaches(false);
      conn.setConnectTimeout(10000);
      conn.setReadTimeout(10000);

      try (OutputStream os = conn.getOutputStream()) {
        os.write(payload.getBytes(StandardCharsets.UTF_8));
      }

      int responseCode = conn.getResponseCode();

      if (responseCode == HttpURLConnection.HTTP_OK) {
        return readResponse(conn);
      } else {
        String errorResponse = readErrorResponse(conn);
        throw parseErrorResponse(errorResponse, responseCode);
      }
    } finally {
      conn.disconnect();
    }
  }

  private String readResponse(HttpURLConnection conn) throws IOException {
    StringBuilder response = new StringBuilder();
    try (BufferedReader reader = new BufferedReader(
        new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8))) {
      String line;
      while ((line = reader.readLine()) != null) {
        response.append(line);
      }
    }
    return response.toString();
  }

  private String readErrorResponse(HttpURLConnection conn) {
    try (BufferedReader reader = new BufferedReader(
        new InputStreamReader(conn.getErrorStream(), StandardCharsets.UTF_8))) {
      StringBuilder response = new StringBuilder();
      String line;
      while ((line = reader.readLine()) != null) {
        response.append(line);
      }
      return response.toString();
    } catch (Exception e) {
      return "";
    }
  }

  private FirebaseAuthException parseErrorResponse(String errorResponse, int responseCode) {
    // Parse Firebase error message
    String message = "Authentication failed (HTTP " + responseCode + ")";

    if (errorResponse.contains("EMAIL_EXISTS")) {
      message = "This email is already registered";
    } else if (errorResponse.contains("EMAIL_NOT_FOUND")) {
      message = "No account found with this email";
    } else if (errorResponse.contains("INVALID_PASSWORD")
        || errorResponse.contains("INVALID_LOGIN_CREDENTIALS")) {
      message = "Invalid email or password";
    } else if (errorResponse.contains("USER_DISABLED")) {
      message = "This account has been disabled";
    } else if (errorResponse.contains("TOO_MANY_ATTEMPTS_TRY_LATER")) {
      message = "Too many failed attempts. Please try again later";
    } else if (errorResponse.contains("WEAK_PASSWORD")) {
      message = "Password must be at least 6 characters";
    } else if (errorResponse.contains("INVALID_EMAIL")) {
      message = "Invalid email address";
    }

    LOGGER.log(Level.WARNING, "Auth error: " + errorResponse);
    return new FirebaseAuthException(message);
  }

  private AuthResponse parseAuthResponse(String json) {
    // Simple JSON parsing without external dependencies
    AuthResponse response = new AuthResponse();
    response.idToken = extractJsonValue(json, "idToken");
    response.refreshToken = extractJsonValue(json, "refreshToken");
    response.localId = extractJsonValue(json, "localId");
    response.email = extractJsonValue(json, "email");
    response.displayName = extractJsonValue(json, "displayName");

    String expiresIn = extractJsonValue(json, "expiresIn");
    if (expiresIn != null && !expiresIn.isEmpty()) {
      response.expiresIn = Long.parseLong(expiresIn);
    }

    return response;
  }

  private String extractJsonValue(String json, String key) {
    String searchKey = "\"" + key + "\":";
    int keyIndex = json.indexOf(searchKey);
    if (keyIndex == -1)
      return null;

    int valueStart = keyIndex + searchKey.length();
    // Skip whitespace
    while (valueStart < json.length() && Character.isWhitespace(json.charAt(valueStart))) {
      valueStart++;
    }

    if (valueStart >= json.length())
      return null;

    char firstChar = json.charAt(valueStart);
    if (firstChar == '"') {
      // String value
      int valueEnd = json.indexOf('"', valueStart + 1);
      if (valueEnd == -1)
        return null;
      return json.substring(valueStart + 1, valueEnd);
    } else {
      // Number or boolean
      int valueEnd = valueStart;
      while (valueEnd < json.length()
          && !Character.isWhitespace(json.charAt(valueEnd))
          && json.charAt(valueEnd) != ','
          && json.charAt(valueEnd) != '}') {
        valueEnd++;
      }
      return json.substring(valueStart, valueEnd);
    }
  }

  private String escapeJson(String value) {
    if (value == null)
      return "";
    return value
        .replace("\\", "\\\\")
        .replace("\"", "\\\"")
        .replace("\n", "\\n")
        .replace("\r", "\\r")
        .replace("\t", "\\t");
  }

  private boolean isTransientNetworkError(IOException exception) {
    if (exception instanceof SocketTimeoutException
        || exception instanceof SocketException
        || exception instanceof SSLException) {
      return true;
    }

    String message = exception.getMessage();
    if (message == null) {
      return false;
    }

    String normalized = message.toLowerCase();
    return normalized.contains("connection reset")
        || normalized.contains("timed out")
        || normalized.contains("broken pipe")
        || normalized.contains("remote host terminated")
        || normalized.contains("connection aborted");
  }

  private String mapNetworkErrorMessage(IOException exception) {
    if (isTransientNetworkError(exception)) {
      return "Network connection to Firebase was interrupted. Please check your internet and try again.";
    }
    return "Authentication request failed due to a network error.";
  }

  private void sleepQuietly(long delayMillis) {
    try {
      Thread.sleep(delayMillis);
    } catch (InterruptedException interruptedException) {
      Thread.currentThread().interrupt();
    }
  }

  /** Response from Firebase authentication operations. */
  public static class AuthResponse {
    public String idToken;
    public String refreshToken;
    public String localId; // This is the user's UID
    public String email;
    public String displayName;
    public long expiresIn; // Token expiration in seconds

    @Override
    public String toString() {
      return "AuthResponse{localId='" + localId + "', email='" + email + "'}";
    }
  }

  /** Exception for Firebase authentication errors. */
  public static class FirebaseAuthException extends Exception {
    public FirebaseAuthException(String message) {
      super(message);
    }

    public FirebaseAuthException(String message, Throwable cause) {
      super(message, cause);
    }
  }
}
