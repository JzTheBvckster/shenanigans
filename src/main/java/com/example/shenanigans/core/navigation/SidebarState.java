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

    
    public static SidebarState getInstance() {
        if (instance == null) {
            instance = new SidebarState();
        }
        return instance;
    }

    
    public String getExpandedPane() {
        return expandedPane;
    }

    
    public void setExpandedPane(String paneTitle) {
        this.expandedPane = paneTitle;
    }

    
    public void reset() {
        this.expandedPane = "MAIN MENU";
    }
}
