package com.example.shenanigans.core.web;

import com.example.shenanigans.features.auth.model.User;
import java.time.Duration;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

/** Stores short-lived authenticated web sessions for the embedded HTTP server. */
public class WebSessionStore {

  private final Map<String, WebSession> sessions = new ConcurrentHashMap<>();
  private final Duration sessionTtl;

  public WebSessionStore(Duration sessionTtl) {
    this.sessionTtl = sessionTtl;
  }

  /**
   * Creates a session and returns its generated ID.
   *
   * @param user authenticated user
   * @param idToken firebase id token
   * @param refreshToken firebase refresh token
   * @return session id used in the cookie
   */
  public String createSession(User user, String idToken, String refreshToken) {
    String sessionId = UUID.randomUUID().toString();
    long now = System.currentTimeMillis();
    long expiresAt = now + sessionTtl.toMillis();

    sessions.put(sessionId, new WebSession(user, idToken, refreshToken, now, expiresAt));
    return sessionId;
  }

  /**
   * Finds an active session by id.
   *
   * @param sessionId cookie session id
   * @return active session if not expired
   */
  public Optional<WebSession> findSession(String sessionId) {
    if (sessionId == null || sessionId.isBlank()) {
      return Optional.empty();
    }

    WebSession session = sessions.get(sessionId);
    if (session == null) {
      return Optional.empty();
    }

    if (session.expiresAt() <= System.currentTimeMillis()) {
      sessions.remove(sessionId);
      return Optional.empty();
    }

    return Optional.of(session);
  }

  /** Invalidates a session id. */
  public void invalidate(String sessionId) {
    if (sessionId == null || sessionId.isBlank()) {
      return;
    }
    sessions.remove(sessionId);
  }

  /** Clears all sessions. */
  public void clear() {
    sessions.clear();
  }

  /** Immutable session payload used by web API handlers. */
  public record WebSession(
      User user, String idToken, String refreshToken, long createdAt, long expiresAt) {}
}
