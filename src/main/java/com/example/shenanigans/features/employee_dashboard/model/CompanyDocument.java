package com.example.shenanigans.features.employee_dashboard.model;

/** Represents a company document record stored in Firestore. */
public class CompanyDocument {

    private String id;
    private String name;
    private String description;
    private String category; // POLICY, TEMPLATE, PROJECT_BRIEF
    private String relatedProjectId;
    private String uploadedBy;
    private long createdAt;
    private long updatedAt;

    public CompanyDocument() {
    }

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

    public String getCategory() {
        return category;
    }

    public void setCategory(String category) {
        this.category = category;
    }

    public String getRelatedProjectId() {
        return relatedProjectId;
    }

    public void setRelatedProjectId(String relatedProjectId) {
        this.relatedProjectId = relatedProjectId;
    }

    public String getUploadedBy() {
        return uploadedBy;
    }

    public void setUploadedBy(String uploadedBy) {
        this.uploadedBy = uploadedBy;
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

    public boolean isPolicy() {
        return "POLICY".equalsIgnoreCase(category);
    }

    public boolean isTemplate() {
        return "TEMPLATE".equalsIgnoreCase(category);
    }
}
