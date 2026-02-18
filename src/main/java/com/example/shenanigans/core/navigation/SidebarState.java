package com.example.shenanigans.core.navigation;

/**
 * Holds sidebar accordion state across page navigation. Remembers which accordion pane is currently
 * expanded.
 */
public class SidebarState {

  private static final String DEFAULT_EXPANDED_PANE = "MAIN MENU";
  private static final SidebarState INSTANCE = new SidebarState();

  private String expandedPane = DEFAULT_EXPANDED_PANE;

  private SidebarState() {}

  /**
   * Returns the shared sidebar state instance.
   *
   * @return singleton sidebar state
   */
  public static SidebarState getInstance() {
    return INSTANCE;
  }

  /**
   * Returns the currently expanded accordion pane title.
   *
   * @return expanded pane title
   */
  public String getExpandedPane() {
    return expandedPane;
  }

  /**
   * Updates the expanded accordion pane title.
   *
   * @param paneTitle pane title to store
   */
  public void setExpandedPane(String paneTitle) {
    this.expandedPane = paneTitle;
  }

  /** Restores the default expanded pane. */
  public void reset() {
    this.expandedPane = DEFAULT_EXPANDED_PANE;
  }
}
