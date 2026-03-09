package com.example.shenanigans;

import com.example.shenanigans.core.firebase.FirebaseBootstrap;
import com.example.shenanigans.core.firebase.FirebaseInitializer;
import com.example.shenanigans.core.web.HtmlWebServer;
import java.io.IOException;
import java.util.concurrent.CountDownLatch;
import java.util.logging.Level;
import java.util.logging.Logger;

/** Entry point for lightweight HTML web mode that reuses existing Java services. */
public class WebLauncher {

  private static final Logger LOGGER = Logger.getLogger(WebLauncher.class.getName());

  public static void main(String[] args) {
    FirebaseBootstrap.initializeFromStandardSources(WebLauncher.class, LOGGER);

    int port = resolvePort();
    HtmlWebServer server;
    try {
      server = new HtmlWebServer(port);
    } catch (IOException exception) {
      LOGGER.log(Level.SEVERE, "Failed to start web server", exception);
      return;
    }

    server.start();

    CountDownLatch shutdownLatch = new CountDownLatch(1);
    Runtime.getRuntime()
        .addShutdownHook(
            new Thread(
                () -> {
                  server.stop();
                  FirebaseInitializer.shutdown();
                  shutdownLatch.countDown();
                },
                "shenanigans-web-shutdown"));

    try {
      shutdownLatch.await();
    } catch (InterruptedException interruptedException) {
      Thread.currentThread().interrupt();
      LOGGER.warning("Web launcher interrupted; shutting down.");
    }
  }

  private static int resolvePort() {
    String configuredPort = System.getenv("PORT");
    if (configuredPort == null || configuredPort.isBlank()) {
      configuredPort = System.getProperty("web.port", "8080");
    }

    try {
      return Integer.parseInt(configuredPort);
    } catch (NumberFormatException exception) {
      LOGGER.warning("Invalid PORT value: " + configuredPort + ". Falling back to 8080.");
      return 8080;
    }
  }
}
