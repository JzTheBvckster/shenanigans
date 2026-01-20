package com.example.shenanigans.core.navigation;

/**
 * Singleton class to manage sidebar accordion state across page navigation.
 * Remembers which accordion pane is expanded.
 */
public class SidebarState {

    private static SidebarState instance;

    private String expandedPane = "MAIN MENU"; // Default expanded pane

    private SidebarState() {
    }

    /**
     * Gets the singleton instance.
     */
    public static SidebarState getInstance() {
        if (instance == null) {
            instance = new SidebarState();
        }
        return instance;
    }

    /**
     * Gets the currently expanded pane title.
     */
    public String getExpandedPane() {
        return expandedPane;
    }

    /**
     * Sets the currently expanded pane title.
     */
    public void setExpandedPane(String paneTitle) {
        this.expandedPane = paneTitle;
    }

    /**
     * Resets to default state.
     */
    public void reset() {
        this.expandedPane = "MAIN MENU";
    }
}
