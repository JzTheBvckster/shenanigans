package com.example.shenanigans.core.web;

import com.example.shenanigans.features.auth.model.User;
import com.example.shenanigans.features.auth.service.AuthService;
import com.example.shenanigans.features.employees.model.Employee;
import com.example.shenanigans.features.employees.service.EmployeeService;
import com.example.shenanigans.features.finance.model.Invoice;
import com.example.shenanigans.features.finance.service.FinanceService;
import com.example.shenanigans.features.projects.model.Project;
import com.example.shenanigans.features.projects.service.ProjectService;
import com.google.gson.Gson;
import com.google.gson.JsonSyntaxException;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.logging.Level;
import java.util.logging.Logger;

/**
 * Lightweight HTTP server that serves HTML pages and REST APIs backed by
 * existing services.
 */
public class HtmlWebServer {

  private static final Logger LOGGER = Logger.getLogger(HtmlWebServer.class.getName());
  private static final Gson GSON = new Gson();
  private static final String SESSION_COOKIE_NAME = "SHENANIGANS_SESSION";
  private static final Duration SESSION_TTL = Duration.ofHours(12);
  private static final AtomicInteger THREAD_COUNTER = new AtomicInteger();

  private final HttpServer server;
  private final WebSessionStore sessionStore;

  private final EmployeeService employeeService = new EmployeeService();
  private final ProjectService projectService = new ProjectService();
  private final FinanceService financeService = new FinanceService();

  public HtmlWebServer(int port) throws IOException {
    this.server = HttpServer.create(new InetSocketAddress(port), 0);
    this.sessionStore = new WebSessionStore(SESSION_TTL);
    this.server.setExecutor(
        Executors.newFixedThreadPool(
            Math.max(4, Runtime.getRuntime().availableProcessors()),
            runnable -> {
              Thread thread = new Thread(runnable, "shenanigans-web-" + THREAD_COUNTER.incrementAndGet());
              thread.setDaemon(false);
              return thread;
            }));

    registerRoutes();
  }

  /** Starts the HTTP server. */
  public void start() {
    server.start();
    LOGGER.info("HTML web server started on port " + server.getAddress().getPort());
  }

  /** Stops the HTTP server and clears active sessions. */
  public void stop() {
    sessionStore.clear();
    server.stop(1);
    LOGGER.info("HTML web server stopped");
  }

  private void registerRoutes() {
    server.createContext("/api/health", exchange -> withHandling(exchange, this::handleHealth));
    server.createContext(
        "/api/auth/login", exchange -> withHandling(exchange, this::handleAuthLogin));
    server.createContext(
        "/api/auth/register", exchange -> withHandling(exchange, this::handleAuthRegister));
    server.createContext(
        "/api/auth/logout", exchange -> withHandling(exchange, this::handleAuthLogout));
    server.createContext(
        "/api/auth/session", exchange -> withHandling(exchange, this::handleAuthSession));
    server.createContext(
        "/api/auth/forgot-password",
        exchange -> withHandling(exchange, this::handleForgotPassword));
    server.createContext(
        "/api/dashboard/summary",
        exchange -> withHandling(exchange, this::handleDashboardSummary));
    server.createContext("/api/employees", exchange -> withHandling(exchange, this::handleEmployees));
    server.createContext("/api/projects", exchange -> withHandling(exchange, this::handleProjects));
    server.createContext(
        "/api/finance/invoices", exchange -> withHandling(exchange, this::handleInvoices));

    // Keep this as the final catch-all context.
    server.createContext("/", exchange -> withHandling(exchange, this::handleStaticContent));
  }

  private void withHandling(HttpExchange exchange, ExchangeHandler handler) throws IOException {
    try {
      handler.handle(exchange);
    } catch (Exception exception) {
      LOGGER.log(Level.SEVERE, "Request failed: " + exchange.getRequestURI(), exception);
      writeJson(
          exchange,
          500,
          Map.of(
              "ok",
              false,
              "error",
              "Internal server error",
              "details",
              safeMessage(exception, "No additional details available.")));
    } finally {
      exchange.close();
    }
  }

  private void handleHealth(HttpExchange exchange) throws IOException {
    if (!ensureMethod(exchange, "GET")) {
      return;
    }

    writeJson(
        exchange,
        200,
        Map.of(
            "ok",
            true,
            "data",
            Map.of(
                "status",
                "UP",
                "firebaseInitialized",
                com.example.shenanigans.core.firebase.FirebaseInitializer.isInitialized())));
  }

  private void handleAuthLogin(HttpExchange exchange) throws Exception {
    if (!ensureMethod(exchange, "POST")) {
      return;
    }

    LoginRequest request = readJsonRequest(exchange, LoginRequest.class);
    if (request == null || isBlank(request.email()) || isBlank(request.password())) {
      writeJson(exchange, 400, Map.of("ok", false, "error", "Email and password are required."));
      return;
    }

    AuthService authService = new AuthService();
    try {
      AuthService.AuthSession authSession = authService.signInSync(request.email().trim(), request.password());

      String sessionId = sessionStore.createSession(
          authSession.user(), authSession.idToken(), authSession.refreshToken());
      setSessionCookie(exchange, sessionId);

      writeJson(
          exchange,
          200,
          Map.of(
              "ok",
              true,
              "data",
              Map.of("user", toUserPayload(authSession.user()), "redirect", resolveRedirect(authSession.user()))));
    } catch (Exception exception) {
      int status = exception.getMessage() != null
          && exception.getMessage().toLowerCase(Locale.ROOT).contains("pending")
              ? 403
              : 401;
      writeJson(
          exchange,
          status,
          Map.of("ok", false, "error", safeMessage(exception, "Authentication failed.")));
    }
  }

  private void handleAuthRegister(HttpExchange exchange) throws Exception {
    if (!ensureMethod(exchange, "POST")) {
      return;
    }

    RegisterRequest request = readJsonRequest(exchange, RegisterRequest.class);
    if (request == null
        || isBlank(request.email())
        || isBlank(request.password())
        || isBlank(request.displayName())) {
      writeJson(
          exchange,
          400,
          Map.of("ok", false, "error", "Display name, email, and password are required."));
      return;
    }

    String role = normalizeRole(request.role());
    AuthService authService = new AuthService();

    try {
      User user = authService.signUpSync(
          request.email().trim(), request.password(), request.displayName().trim(), role);

      boolean pendingApproval = (user.isEmployee() || user.isProjectManager()) && !user.isMdApproved();
      if (pendingApproval) {
        writeJson(
            exchange,
            201,
            Map.of(
                "ok",
                true,
                "data",
                Map.of(
                    "pendingApproval",
                    true,
                    "message",
                    "Registration submitted and waiting for Managing Director approval.")));
        return;
      }

      String sessionId = sessionStore.createSession(
          user, authService.getCurrentIdToken(), authService.getCurrentRefreshToken());
      setSessionCookie(exchange, sessionId);

      writeJson(
          exchange,
          201,
          Map.of(
              "ok",
              true,
              "data",
              Map.of("pendingApproval", false, "user", toUserPayload(user), "redirect", resolveRedirect(user))));
    } catch (Exception exception) {
      writeJson(
          exchange,
          400,
          Map.of("ok", false, "error", safeMessage(exception, "Registration failed.")));
    }
  }

  private void handleAuthSession(HttpExchange exchange) throws IOException {
    if (!ensureMethod(exchange, "GET")) {
      return;
    }

    Optional<WebSessionStore.WebSession> session = findSession(exchange);
    if (session.isEmpty()) {
      writeJson(exchange, 200, Map.of("ok", true, "data", Map.of("authenticated", false)));
      return;
    }

    User user = session.get().user();
    writeJson(
        exchange,
        200,
        Map.of(
            "ok",
            true,
            "data",
            Map.of(
                "authenticated",
                true,
                "user",
                toUserPayload(user),
                "redirect",
                resolveRedirect(user))));
  }

  private void handleAuthLogout(HttpExchange exchange) throws IOException {
    if (!ensureMethod(exchange, "POST")) {
      return;
    }

    String sessionId = getCookieValue(exchange, SESSION_COOKIE_NAME);
    if (!isBlank(sessionId)) {
      sessionStore.invalidate(sessionId);
    }

    clearSessionCookie(exchange);
    writeJson(exchange, 200, Map.of("ok", true));
  }

  private void handleForgotPassword(HttpExchange exchange) throws Exception {
    if (!ensureMethod(exchange, "POST")) {
      return;
    }

    ForgotPasswordRequest request = readJsonRequest(exchange, ForgotPasswordRequest.class);
    if (request == null || isBlank(request.email())) {
      writeJson(exchange, 400, Map.of("ok", false, "error", "Email is required."));
      return;
    }

    try {
      AuthService authService = new AuthService();
      authService.sendPasswordResetEmailSync(request.email().trim());
      writeJson(
          exchange,
          200,
          Map.of("ok", true, "data", Map.of("message", "If an account exists, a reset link was sent.")));
    } catch (Exception exception) {
      // Always return success to avoid email enumeration
      writeJson(
          exchange,
          200,
          Map.of("ok", true, "data", Map.of("message", "If an account exists, a reset link was sent.")));
    }
  }

  private void handleDashboardSummary(HttpExchange exchange) throws Exception {
    if (!ensureMethod(exchange, "GET")) {
      return;
    }

    Optional<WebSessionStore.WebSession> session = requireSession(exchange);
    if (session.isEmpty()) {
      return;
    }

    List<Project> projects = projectService.getAllProjectsSync();
    List<Employee> employees = employeeService.getAllEmployeesSync();
    List<Invoice> invoices = financeService.getAllInvoicesSync();

    long activeProjects = projects.stream().filter(Project::isActive).count();
    long overdueProjects = projects.stream().filter(Project::isOverdue).count();
    long openInvoices = invoices.stream().filter(invoice -> !invoice.isPaid()).count();
    double paidRevenue = invoices.stream().filter(Invoice::isPaid).mapToDouble(Invoice::getAmount).sum();

    Map<String, Object> summary = new HashMap<>();
    summary.put("activeProjects", activeProjects);
    summary.put("totalProjects", projects.size());
    summary.put("totalEmployees", employees.size());
    summary.put("openInvoices", openInvoices);
    summary.put("overdueProjects", overdueProjects);
    summary.put("paidRevenue", paidRevenue);

    writeJson(exchange, 200, Map.of("ok", true, "data", summary));
  }

  private void handleEmployees(HttpExchange exchange) throws Exception {
    Optional<WebSessionStore.WebSession> session = requireSession(exchange);
    if (session.isEmpty()) {
      return;
    }

    if (session.get().user().isEmployee()) {
      writeJson(exchange, 403, Map.of("ok", false, "error", "Access denied for employee role."));
      return;
    }

    String method = exchange.getRequestMethod().toUpperCase(Locale.ROOT);
    String path = exchange.getRequestURI().getPath();
    String entityId = extractIdFromPath(path, "/api/employees/");

    switch (method) {
      case "GET" -> {
        List<Employee> employees = new ArrayList<>(employeeService.getAllEmployeesSync());
        employees.sort(
            Comparator.comparing(
                Employee::getFirstName, Comparator.nullsLast(String::compareToIgnoreCase)));
        writeJson(exchange, 200, Map.of("ok", true, "data", employees));
      }
      case "POST" -> {
        Employee employee = readJsonRequest(exchange, Employee.class);
        if (employee == null || isBlank(employee.getFirstName())) {
          writeJson(exchange, 400, Map.of("ok", false, "error", "Employee first name is required."));
          return;
        }
        employee.setCreatedAt(System.currentTimeMillis());
        employee.setUpdatedAt(System.currentTimeMillis());
        if (isBlank(employee.getStatus())) {
          employee.setStatus("ACTIVE");
        }
        javafx.concurrent.Task<Employee> task = employeeService.createEmployee(employee);
        task.run();
        Employee created = task.getValue();
        writeJson(exchange, 201, Map.of("ok", true, "data", created));
      }
      case "PUT" -> {
        if (isBlank(entityId)) {
          writeJson(exchange, 400, Map.of("ok", false, "error", "Employee ID is required in path."));
          return;
        }
        Employee employee = readJsonRequest(exchange, Employee.class);
        if (employee == null) {
          writeJson(exchange, 400, Map.of("ok", false, "error", "Employee data is required."));
          return;
        }
        employee.setId(entityId);
        employee.setUpdatedAt(System.currentTimeMillis());
        javafx.concurrent.Task<Void> updateTask = employeeService.updateEmployee(employee);
        updateTask.run();
        writeJson(exchange, 200, Map.of("ok", true, "data", Map.of("id", entityId)));
      }
      case "DELETE" -> {
        if (isBlank(entityId)) {
          writeJson(exchange, 400, Map.of("ok", false, "error", "Employee ID is required in path."));
          return;
        }
        javafx.concurrent.Task<Void> deleteTask = employeeService.deleteEmployee(entityId);
        deleteTask.run();
        writeJson(exchange, 200, Map.of("ok", true));
      }
      default -> {
        exchange.getResponseHeaders().set("Allow", "GET, POST, PUT, DELETE");
        writeJson(exchange, 405, Map.of("ok", false, "error", "Method not allowed."));
      }
    }
  }

  private void handleProjects(HttpExchange exchange) throws Exception {
    Optional<WebSessionStore.WebSession> session = requireSession(exchange);
    if (session.isEmpty()) {
      return;
    }

    if (session.get().user().isEmployee()) {
      writeJson(exchange, 403, Map.of("ok", false, "error", "Access denied for employee role."));
      return;
    }

    String method = exchange.getRequestMethod().toUpperCase(Locale.ROOT);
    String path = exchange.getRequestURI().getPath();
    String entityId = extractIdFromPath(path, "/api/projects/");

    switch (method) {
      case "GET" -> {
        List<Project> projects = projectService.getAllProjectsSync();
        writeJson(exchange, 200, Map.of("ok", true, "data", projects));
      }
      case "POST" -> {
        Project project = readJsonRequest(exchange, Project.class);
        if (project == null || isBlank(project.getName())) {
          writeJson(exchange, 400, Map.of("ok", false, "error", "Project name is required."));
          return;
        }
        project.setCreatedAt(System.currentTimeMillis());
        project.setUpdatedAt(System.currentTimeMillis());
        if (isBlank(project.getStatus())) {
          project.setStatus("PLANNING");
        }
        javafx.concurrent.Task<String> task = projectService.createProject(project);
        task.run();
        String createdId = task.getValue();
        writeJson(exchange, 201, Map.of("ok", true, "data", Map.of("id", createdId)));
      }
      case "PUT" -> {
        if (isBlank(entityId)) {
          writeJson(exchange, 400, Map.of("ok", false, "error", "Project ID is required in path."));
          return;
        }
        Project project = readJsonRequest(exchange, Project.class);
        if (project == null) {
          writeJson(exchange, 400, Map.of("ok", false, "error", "Project data is required."));
          return;
        }
        project.setId(entityId);
        project.setUpdatedAt(System.currentTimeMillis());
        javafx.concurrent.Task<Void> updateTask = projectService.updateProject(project);
        updateTask.run();
        writeJson(exchange, 200, Map.of("ok", true, "data", Map.of("id", entityId)));
      }
      case "DELETE" -> {
        if (isBlank(entityId)) {
          writeJson(exchange, 400, Map.of("ok", false, "error", "Project ID is required in path."));
          return;
        }
        javafx.concurrent.Task<Void> deleteTask = projectService.deleteProject(entityId);
        deleteTask.run();
        writeJson(exchange, 200, Map.of("ok", true));
      }
      default -> {
        exchange.getResponseHeaders().set("Allow", "GET, POST, PUT, DELETE");
        writeJson(exchange, 405, Map.of("ok", false, "error", "Method not allowed."));
      }
    }
  }

  private void handleInvoices(HttpExchange exchange) throws Exception {
    Optional<WebSessionStore.WebSession> session = requireSession(exchange);
    if (session.isEmpty()) {
      return;
    }

    if (!session.get().user().isManagingDirector()) {
      writeJson(
          exchange,
          403,
          Map.of("ok", false, "error", "Finance data is restricted to Managing Directors."));
      return;
    }

    String method = exchange.getRequestMethod().toUpperCase(Locale.ROOT);
    String path = exchange.getRequestURI().getPath();
    String entityId = extractIdFromPath(path, "/api/finance/invoices/");

    switch (method) {
      case "GET" -> {
        List<Invoice> invoices = financeService.getAllInvoicesSync();
        writeJson(exchange, 200, Map.of("ok", true, "data", invoices));
      }
      case "POST" -> {
        Invoice invoice = readJsonRequest(exchange, Invoice.class);
        if (invoice == null || isBlank(invoice.getClient())) {
          writeJson(exchange, 400, Map.of("ok", false, "error", "Client name is required."));
          return;
        }
        if (invoice.getIssuedAt() <= 0) {
          invoice.setIssuedAt(System.currentTimeMillis());
        }
        javafx.concurrent.Task<Void> task = financeService.createInvoice(invoice);
        task.run();
        writeJson(exchange, 201, Map.of("ok", true, "data", Map.of("id", invoice.getId())));
      }
      case "PUT" -> {
        if (isBlank(entityId)) {
          writeJson(exchange, 400, Map.of("ok", false, "error", "Invoice ID is required in path."));
          return;
        }
        Invoice invoice = readJsonRequest(exchange, Invoice.class);
        if (invoice == null) {
          writeJson(exchange, 400, Map.of("ok", false, "error", "Invoice data is required."));
          return;
        }
        invoice.setId(entityId);
        javafx.concurrent.Task<Void> updateTask = financeService.updateInvoice(invoice);
        updateTask.run();
        writeJson(exchange, 200, Map.of("ok", true, "data", Map.of("id", entityId)));
      }
      case "DELETE" -> {
        if (isBlank(entityId)) {
          writeJson(exchange, 400, Map.of("ok", false, "error", "Invoice ID is required in path."));
          return;
        }
        javafx.concurrent.Task<Void> deleteTask = financeService.deleteInvoice(entityId);
        deleteTask.run();
        writeJson(exchange, 200, Map.of("ok", true));
      }
      default -> {
        exchange.getResponseHeaders().set("Allow", "GET, POST, PUT, DELETE");
        writeJson(exchange, 405, Map.of("ok", false, "error", "Method not allowed."));
      }
    }
  }

  private void handleStaticContent(HttpExchange exchange) throws IOException {
    if (!ensureMethod(exchange, "GET")) {
      return;
    }

    String path = exchange.getRequestURI().getPath();
    if (path.startsWith("/api/")) {
      writeJson(exchange, 404, Map.of("ok", false, "error", "Endpoint not found."));
      return;
    }

    String resourcePath = resolveResourcePath(path);
    if (resourcePath == null) {
      writeJson(exchange, 404, Map.of("ok", false, "error", "Resource not found."));
      return;
    }

    try (InputStream resource = HtmlWebServer.class.getResourceAsStream(resourcePath)) {
      if (resource == null) {
        writeJson(exchange, 404, Map.of("ok", false, "error", "Resource not found."));
        return;
      }

      byte[] payload = resource.readAllBytes();
      exchange.getResponseHeaders().set("Content-Type", detectMimeType(resourcePath));
      exchange.sendResponseHeaders(200, payload.length);

      try (OutputStream output = exchange.getResponseBody()) {
        output.write(payload);
      }
    }
  }

  private Optional<WebSessionStore.WebSession> requireSession(HttpExchange exchange) throws IOException {
    Optional<WebSessionStore.WebSession> session = findSession(exchange);
    if (session.isPresent()) {
      return session;
    }

    clearSessionCookie(exchange);
    writeJson(exchange, 401, Map.of("ok", false, "error", "Authentication required."));
    return Optional.empty();
  }

  private Optional<WebSessionStore.WebSession> findSession(HttpExchange exchange) {
    String sessionId = getCookieValue(exchange, SESSION_COOKIE_NAME);
    return sessionStore.findSession(sessionId);
  }

  private String getCookieValue(HttpExchange exchange, String name) {
    List<String> cookies = exchange.getRequestHeaders().get("Cookie");
    if (cookies == null || cookies.isEmpty()) {
      return null;
    }

    for (String header : cookies) {
      String[] pairs = header.split(";");
      for (String pair : pairs) {
        String[] keyValue = pair.trim().split("=", 2);
        if (keyValue.length == 2 && keyValue[0].trim().equals(name)) {
          return keyValue[1].trim();
        }
      }
    }

    return null;
  }

  private void setSessionCookie(HttpExchange exchange, String sessionId) {
    long maxAge = SESSION_TTL.toSeconds();
    exchange
        .getResponseHeaders()
        .add(
            "Set-Cookie",
            SESSION_COOKIE_NAME
                + "="
                + sessionId
                + "; Path=/; HttpOnly; SameSite=Lax; Max-Age="
                + maxAge);
  }

  private void clearSessionCookie(HttpExchange exchange) {
    exchange
        .getResponseHeaders()
        .add(
            "Set-Cookie",
            SESSION_COOKIE_NAME + "=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0");
  }

  private boolean ensureMethod(HttpExchange exchange, String expectedMethod) throws IOException {
    if (expectedMethod.equalsIgnoreCase(exchange.getRequestMethod())) {
      return true;
    }

    exchange.getResponseHeaders().set("Allow", expectedMethod);
    writeJson(exchange, 405, Map.of("ok", false, "error", "Method not allowed."));
    return false;
  }

  private <T> T readJsonRequest(HttpExchange exchange, Class<T> type) throws IOException {
    byte[] bodyBytes = exchange.getRequestBody().readAllBytes();
    if (bodyBytes.length == 0) {
      return null;
    }

    String rawBody = new String(bodyBytes, StandardCharsets.UTF_8);
    try {
      return GSON.fromJson(rawBody, type);
    } catch (JsonSyntaxException invalidJson) {
      LOGGER.log(Level.FINE, "Invalid JSON payload", invalidJson);
      return null;
    }
  }

  private void writeJson(HttpExchange exchange, int statusCode, Object payload) throws IOException {
    byte[] responseBytes = GSON.toJson(payload).getBytes(StandardCharsets.UTF_8);
    exchange.getResponseHeaders().set("Content-Type", "application/json; charset=utf-8");
    exchange.sendResponseHeaders(statusCode, responseBytes.length);

    try (OutputStream output = exchange.getResponseBody()) {
      output.write(responseBytes);
    }
  }

  private Map<String, Object> toUserPayload(User user) {
    if (user == null) {
      return Map.of();
    }

    return Map.of(
        "uid", nullToEmpty(user.getUid()),
        "email", nullToEmpty(user.getEmail()),
        "displayName", nullToEmpty(user.getDisplayName()),
        "role", nullToEmpty(user.getRole()),
        "mdApproved", user.isMdApproved());
  }

  private String resolveRedirect(User user) {
    if (user != null && user.isEmployee()) {
      return "/app?view=employee";
    }
    return "/app";
  }

  private String normalizeRole(String rawRole) {
    if (rawRole == null) {
      return "EMPLOYEE";
    }

    String normalized = rawRole.trim().toUpperCase(Locale.ROOT).replace(" ", "_");
    return switch (normalized) {
      case "MANAGING_DIRECTOR", "PROJECT_MANAGER", "EMPLOYEE" -> normalized;
      default -> "EMPLOYEE";
    };
  }

  private String safeMessage(Exception exception, String fallback) {
    String message = exception.getMessage();
    return message == null || message.isBlank() ? fallback : message;
  }

  private String resolveResourcePath(String requestPath) {
    if (requestPath == null || requestPath.isBlank() || "/".equals(requestPath)) {
      return "/web/index.html";
    }

    if ("/app".equals(requestPath)) {
      return "/web/app.html";
    }

    if ("/index.html".equals(requestPath) || "/app.html".equals(requestPath)) {
      return "/web" + requestPath;
    }

    if (requestPath.startsWith("/assets/")) {
      return "/web" + requestPath;
    }

    return null;
  }

  private String detectMimeType(String resourcePath) {
    if (resourcePath.endsWith(".html")) {
      return "text/html; charset=utf-8";
    }
    if (resourcePath.endsWith(".css")) {
      return "text/css; charset=utf-8";
    }
    if (resourcePath.endsWith(".js")) {
      return "application/javascript; charset=utf-8";
    }
    if (resourcePath.endsWith(".svg")) {
      return "image/svg+xml";
    }
    if (resourcePath.endsWith(".png")) {
      return "image/png";
    }
    if (resourcePath.endsWith(".jpg") || resourcePath.endsWith(".jpeg")) {
      return "image/jpeg";
    }
    return "application/octet-stream";
  }

  private boolean isBlank(String value) {
    return value == null || value.isBlank();
  }

  private String nullToEmpty(String value) {
    return value == null ? "" : value;
  }

  @FunctionalInterface
  private interface ExchangeHandler {
    void handle(HttpExchange exchange) throws Exception;
  }

  private record LoginRequest(String email, String password) {
  }

  private record RegisterRequest(String displayName, String email, String password, String role) {
  }

  private record ForgotPasswordRequest(String email) {
  }

  /**
   * Extracts an entity ID from a request path.
   * For example, extractIdFromPath("/api/employees/abc123", "/api/employees/")
   * returns "abc123".
   */
  private String extractIdFromPath(String path, String prefix) {
    if (path == null || !path.startsWith(prefix)) {
      return null;
    }
    String id = path.substring(prefix.length()).trim();
    if (id.isEmpty() || id.contains("/")) {
      return null;
    }
    return id;
  }
}
