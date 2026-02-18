package com.example.shenanigans.features.projects.service;

import com.example.shenanigans.core.firebase.FirebaseInitializer;
import com.example.shenanigans.features.projects.model.Project;
import com.google.cloud.firestore.*;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.logging.Level;
import java.util.logging.Logger;
import javafx.concurrent.Task;

/**
 * Service class for project-related operations. Handles all Firestore interactions for projects.
 */
public class ProjectService {

  private static final Logger LOGGER = Logger.getLogger(ProjectService.class.getName());
  private static final String COLLECTION_NAME = "projects";

  private final Firestore firestore;

  /** Constructor initializes Firestore connection. */
  public ProjectService() {
    this.firestore = FirebaseInitializer.getFirestore();
  }

  /**
   * Creates a new project in Firestore.
   *
   * @param project The project to create
   * @return Task that resolves with the created project ID
   */
  public Task<String> createProject(Project project) {
    return new Task<>() {
      @Override
      protected String call() throws Exception {
        if (firestore == null) {
          throw new IllegalStateException("Firestore not initialized");
        }

        Map<String, Object> projectData = projectToMap(project);
        projectData.put("createdAt", System.currentTimeMillis());
        projectData.put("updatedAt", System.currentTimeMillis());

        DocumentReference docRef = firestore.collection(COLLECTION_NAME).document();
        docRef.set(projectData).get();

        LOGGER.info("Project created with ID: " + docRef.getId());
        return docRef.getId();
      }
    };
  }

  /**
   * Updates an existing project in Firestore.
   *
   * @param project The project to update
   * @return Task that resolves when update is complete
   */
  public Task<Void> updateProject(Project project) {
    return new Task<>() {
      @Override
      protected Void call() throws Exception {
        if (firestore == null) {
          throw new IllegalStateException("Firestore not initialized");
        }

        if (project.getId() == null || project.getId().isEmpty()) {
          throw new IllegalArgumentException("Project ID is required for update");
        }

        Map<String, Object> projectData = projectToMap(project);
        projectData.put("updatedAt", System.currentTimeMillis());

        firestore
            .collection(COLLECTION_NAME)
            .document(project.getId())
            .set(projectData, SetOptions.merge())
            .get();

        LOGGER.info("Project updated: " + project.getId());
        return null;
      }
    };
  }

  /**
   * Deletes a project from Firestore.
   *
   * @param projectId The ID of the project to delete
   * @return Task that resolves when deletion is complete
   */
  public Task<Void> deleteProject(String projectId) {
    return new Task<>() {
      @Override
      protected Void call() throws Exception {
        if (firestore == null) {
          throw new IllegalStateException("Firestore not initialized");
        }

        firestore.collection(COLLECTION_NAME).document(projectId).delete().get();

        LOGGER.info("Project deleted: " + projectId);
        return null;
      }
    };
  }

  /**
   * Retrieves all projects from Firestore.
   *
   * @return Task that resolves with a list of projects
   */
  public Task<List<Project>> getAllProjects() {
    return new Task<>() {
      @Override
      protected List<Project> call() throws Exception {
        if (firestore == null) {
          throw new IllegalStateException("Firestore not initialized");
        }

        List<Project> projects = new ArrayList<>();

        QuerySnapshot snapshot =
            firestore
                .collection(COLLECTION_NAME)
                .orderBy("createdAt", Query.Direction.DESCENDING)
                .get()
                .get();

        for (DocumentSnapshot doc : snapshot.getDocuments()) {
          Project project = mapToProject(doc);
          if (project != null) {
            projects.add(project);
          }
        }

        LOGGER.info("Retrieved " + projects.size() + " projects");
        return projects;
      }
    };
  }

  /**
   * Gets a project by ID.
   *
   * @param projectId The project ID
   * @return Task that resolves with the project or null
   */
  public Task<Project> getProjectById(String projectId) {
    return new Task<>() {
      @Override
      protected Project call() throws Exception {
        if (firestore == null) {
          throw new IllegalStateException("Firestore not initialized");
        }

        DocumentSnapshot doc =
            firestore.collection(COLLECTION_NAME).document(projectId).get().get();

        if (doc.exists()) {
          return mapToProject(doc);
        }
        return null;
      }
    };
  }

  /**
   * Searches projects by name or description.
   *
   * @param query The search query
   * @return Task that resolves with matching projects
   */
  public Task<List<Project>> searchProjects(String query) {
    return new Task<>() {
      @Override
      protected List<Project> call() throws Exception {
        if (firestore == null) {
          throw new IllegalStateException("Firestore not initialized");
        }

        // Fetch all projects directly instead of calling another Task
        List<Project> allProjects = new ArrayList<>();
        QuerySnapshot snapshot =
            firestore
                .collection(COLLECTION_NAME)
                .orderBy("createdAt", Query.Direction.DESCENDING)
                .get()
                .get();

        for (DocumentSnapshot doc : snapshot.getDocuments()) {
          Project project = mapToProject(doc);
          if (project != null) {
            allProjects.add(project);
          }
        }

        String lowerQuery = query.toLowerCase();

        return allProjects.stream()
            .filter(
                p ->
                    (p.getName() != null && p.getName().toLowerCase().contains(lowerQuery))
                        || (p.getDescription() != null
                            && p.getDescription().toLowerCase().contains(lowerQuery))
                        || (p.getProjectManager() != null
                            && p.getProjectManager().toLowerCase().contains(lowerQuery))
                        || (p.getDepartment() != null
                            && p.getDepartment().toLowerCase().contains(lowerQuery)))
            .toList();
      }
    };
  }

  /**
   * Gets projects by status.
   *
   * @param status The status to filter by
   * @return Task that resolves with matching projects
   */
  public Task<List<Project>> getProjectsByStatus(String status) {
    return new Task<>() {
      @Override
      protected List<Project> call() throws Exception {
        if (firestore == null) {
          throw new IllegalStateException("Firestore not initialized");
        }

        List<Project> projects = new ArrayList<>();

        QuerySnapshot snapshot =
            firestore.collection(COLLECTION_NAME).whereEqualTo("status", status).get().get();

        for (DocumentSnapshot doc : snapshot.getDocuments()) {
          Project project = mapToProject(doc);
          if (project != null) {
            projects.add(project);
          }
        }

        return projects;
      }
    };
  }

  /** Converts a Project to a Map for Firestore storage. */
  private Map<String, Object> projectToMap(Project project) {
    Map<String, Object> map = new HashMap<>();
    map.put("name", project.getName());
    map.put("description", project.getDescription());
    map.put("status", project.getStatus());
    map.put("priority", project.getPriority());
    map.put("projectManager", project.getProjectManager());
    map.put("projectManagerId", project.getProjectManagerId());
    map.put("department", project.getDepartment());
    map.put("budget", project.getBudget());
    map.put("spent", project.getSpent());
    map.put("startDate", project.getStartDate());
    map.put("endDate", project.getEndDate());
    map.put("teamMemberIds", project.getTeamMemberIds());
    map.put("completionPercentage", project.getCompletionPercentage());
    return map;
  }

  /** Converts a Firestore document to a Project. */
  private Project mapToProject(DocumentSnapshot doc) {
    try {
      Project project = new Project();
      project.setId(doc.getId());
      project.setName(doc.getString("name"));
      project.setDescription(doc.getString("description"));
      project.setStatus(doc.getString("status"));
      project.setPriority(doc.getString("priority"));
      project.setProjectManager(doc.getString("projectManager"));
      project.setProjectManagerId(doc.getString("projectManagerId"));
      project.setDepartment(doc.getString("department"));

      Double budget = doc.getDouble("budget");
      project.setBudget(budget != null ? budget : 0.0);

      Double spent = doc.getDouble("spent");
      project.setSpent(spent != null ? spent : 0.0);

      Long startDate = doc.getLong("startDate");
      project.setStartDate(startDate != null ? startDate : 0L);

      Long endDate = doc.getLong("endDate");
      project.setEndDate(endDate != null ? endDate : 0L);

      Long createdAt = doc.getLong("createdAt");
      project.setCreatedAt(createdAt != null ? createdAt : 0L);

      Long updatedAt = doc.getLong("updatedAt");
      project.setUpdatedAt(updatedAt != null ? updatedAt : 0L);

      Long completion = doc.getLong("completionPercentage");
      project.setCompletionPercentage(completion != null ? completion.intValue() : 0);

      @SuppressWarnings("unchecked")
      List<String> teamIds = (List<String>) doc.get("teamMemberIds");
      if (teamIds != null) {
        project.setTeamMemberIds(teamIds);
      }

      return project;
    } catch (Exception e) {
      LOGGER.log(Level.WARNING, "Error mapping project: " + doc.getId(), e);
      return null;
    }
  }
}
