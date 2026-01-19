package com.example.shenanigans.features.projects.model;

import java.util.ArrayList;
import java.util.List;

/**
 * Model class representing a project in the system.
 */
public class Project {

    private String id;
    private String name;
    private String description;
    private String status; // PLANNING, IN_PROGRESS, COMPLETED, ON_HOLD, CANCELLED
    private String priority; // LOW, MEDIUM, HIGH, CRITICAL
    private String projectManager;
    private String projectManagerId;
    private String department;
    private double budget;
    private double spent;
    private long startDate;
    private long endDate;
    private long createdAt;
    private long updatedAt;
    private List<String> teamMemberIds;
    private int completionPercentage;

    /**
     * Default constructor.
     */
    public Project() {
        this.teamMemberIds = new ArrayList<>();
        this.status = "PLANNING";
        this.priority = "MEDIUM";
        this.completionPercentage = 0;
        this.createdAt = System.currentTimeMillis();
        this.updatedAt = System.currentTimeMillis();
    }

    /**
     * Constructor with essential fields.
     */
    public Project(String name, String description, String projectManager) {
        this();
        this.name = name;
        this.description = description;
        this.projectManager = projectManager;
    }

    // Getters and Setters

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public String getPriority() {
        return priority;
    }

    public void setPriority(String priority) {
        this.priority = priority;
    }

    public String getProjectManager() {
        return projectManager;
    }

    public void setProjectManager(String projectManager) {
        this.projectManager = projectManager;
    }

    public String getProjectManagerId() {
        return projectManagerId;
    }

    public void setProjectManagerId(String projectManagerId) {
        this.projectManagerId = projectManagerId;
    }

    public String getDepartment() {
        return department;
    }

    public void setDepartment(String department) {
        this.department = department;
    }

    public double getBudget() {
        return budget;
    }

    public void setBudget(double budget) {
        this.budget = budget;
    }

    public double getSpent() {
        return spent;
    }

    public void setSpent(double spent) {
        this.spent = spent;
    }

    public long getStartDate() {
        return startDate;
    }

    public void setStartDate(long startDate) {
        this.startDate = startDate;
    }

    public long getEndDate() {
        return endDate;
    }

    public void setEndDate(long endDate) {
        this.endDate = endDate;
    }

    public long getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(long createdAt) {
        this.createdAt = createdAt;
    }

    public long getUpdatedAt() {
        return updatedAt;
    }

    public void setUpdatedAt(long updatedAt) {
        this.updatedAt = updatedAt;
    }

    public List<String> getTeamMemberIds() {
        return teamMemberIds;
    }

    public void setTeamMemberIds(List<String> teamMemberIds) {
        this.teamMemberIds = teamMemberIds;
    }

    public int getCompletionPercentage() {
        return completionPercentage;
    }

    public void setCompletionPercentage(int completionPercentage) {
        this.completionPercentage = Math.max(0, Math.min(100, completionPercentage));
    }

    // Utility methods

    /**
     * Returns the remaining budget.
     */
    public double getRemainingBudget() {
        return budget - spent;
    }

    /**
     * Returns true if the project is active (not completed or cancelled).
     */
    public boolean isActive() {
        return "IN_PROGRESS".equals(status) || "PLANNING".equals(status);
    }

    /**
     * Returns true if the project is completed.
     */
    public boolean isCompleted() {
        return "COMPLETED".equals(status);
    }

    /**
     * Returns true if the project is overdue.
     */
    public boolean isOverdue() {
        return endDate > 0 && System.currentTimeMillis() > endDate && !isCompleted();
    }

    /**
     * Returns the number of team members.
     */
    public int getTeamSize() {
        return teamMemberIds != null ? teamMemberIds.size() : 0;
    }

    @Override
    public String toString() {
        return "Project{" +
                "id='" + id + '\'' +
                ", name='" + name + '\'' +
                ", status='" + status + '\'' +
                ", priority='" + priority + '\'' +
                ", completionPercentage=" + completionPercentage +
                '}';
    }
}
