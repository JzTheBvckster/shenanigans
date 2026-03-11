package com.example.shenanigans.features.employee_dashboard.service;

import com.example.shenanigans.core.firebase.FirebaseInitializer;
import com.example.shenanigans.features.employee_dashboard.model.TimesheetEntry;
import com.google.cloud.firestore.DocumentSnapshot;
import com.google.cloud.firestore.Firestore;
import com.google.cloud.firestore.QueryDocumentSnapshot;
import com.google.cloud.firestore.QuerySnapshot;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.logging.Logger;
import javafx.concurrent.Task;

/**
 * Service for timesheet entry CRUD operations against Firestore.
 */
public class TimesheetService {

    private static final Logger LOGGER = Logger.getLogger(TimesheetService.class.getName());
    private static final String COLLECTION = "timesheets";

    /**
     * Fetches all timesheet entries for a given employee.
     *
     * @param employeeId the employee's UID
     * @return Task completing with the list of entries sorted by date descending
     */
    public Task<List<TimesheetEntry>> getEntriesByEmployee(String employeeId) {
        return new Task<>() {
            @Override
            protected List<TimesheetEntry> call() throws Exception {
                Firestore db = FirebaseInitializer.getFirestore();
                QuerySnapshot snapshot = db.collection(COLLECTION)
                        .whereEqualTo("employeeId", employeeId)
                        .get().get();
                List<TimesheetEntry> entries = new ArrayList<>();
                for (QueryDocumentSnapshot doc : snapshot.getDocuments()) {
                    entries.add(mapToEntry(doc));
                }
                entries.sort((a, b) -> Long.compare(b.getDate(), a.getDate()));
                LOGGER.info("Fetched " + entries.size() + " timesheet entries for " + employeeId);
                return entries;
            }
        };
    }

    /**
     * Fetches all timesheet entries (for admin views).
     *
     * @return Task completing with all entries
     */
    public Task<List<TimesheetEntry>> getAllEntries() {
        return new Task<>() {
            @Override
            protected List<TimesheetEntry> call() throws Exception {
                Firestore db = FirebaseInitializer.getFirestore();
                QuerySnapshot snapshot = db.collection(COLLECTION).get().get();
                List<TimesheetEntry> entries = new ArrayList<>();
                for (QueryDocumentSnapshot doc : snapshot.getDocuments()) {
                    entries.add(mapToEntry(doc));
                }
                entries.sort((a, b) -> Long.compare(b.getDate(), a.getDate()));
                return entries;
            }
        };
    }

    /**
     * Creates a new timesheet entry.
     *
     * @param entry the entry to save
     * @return Task completing with the saved entry (with generated ID)
     */
    public Task<TimesheetEntry> createEntry(TimesheetEntry entry) {
        return new Task<>() {
            @Override
            protected TimesheetEntry call() throws Exception {
                Firestore db = FirebaseInitializer.getFirestore();
                long now = System.currentTimeMillis();
                entry.setCreatedAt(now);
                entry.setUpdatedAt(now);
                Map<String, Object> data = entryToMap(entry);
                var docRef = db.collection(COLLECTION).add(data).get();
                entry.setId(docRef.getId());
                LOGGER.info("Created timesheet entry: " + docRef.getId());
                return entry;
            }
        };
    }

    /**
     * Deletes a timesheet entry.
     *
     * @param entryId the document ID
     * @return Task completing when deletion finishes
     */
    public Task<Void> deleteEntry(String entryId) {
        return new Task<>() {
            @Override
            protected Void call() throws Exception {
                Firestore db = FirebaseInitializer.getFirestore();
                db.collection(COLLECTION).document(entryId).delete().get();
                LOGGER.info("Deleted timesheet entry: " + entryId);
                return null;
            }
        };
    }

    // ==================== Mapping ====================

    private Map<String, Object> entryToMap(TimesheetEntry e) {
        Map<String, Object> m = new HashMap<>();
        m.put("employeeId", e.getEmployeeId());
        m.put("employeeName", e.getEmployeeName());
        m.put("projectId", e.getProjectId());
        m.put("projectName", e.getProjectName());
        m.put("date", e.getDate());
        m.put("hours", e.getHours());
        m.put("description", e.getDescription());
        m.put("createdAt", e.getCreatedAt());
        m.put("updatedAt", e.getUpdatedAt());
        return m;
    }

    private TimesheetEntry mapToEntry(DocumentSnapshot doc) {
        TimesheetEntry e = new TimesheetEntry();
        e.setId(doc.getId());
        e.setEmployeeId(doc.getString("employeeId"));
        e.setEmployeeName(doc.getString("employeeName"));
        e.setProjectId(doc.getString("projectId"));
        e.setProjectName(doc.getString("projectName"));
        Long date = doc.getLong("date");
        e.setDate(date != null ? date : 0L);
        Double hours = doc.getDouble("hours");
        e.setHours(hours != null ? hours : 0.0);
        e.setDescription(doc.getString("description"));
        Long createdAt = doc.getLong("createdAt");
        e.setCreatedAt(createdAt != null ? createdAt : 0L);
        Long updatedAt = doc.getLong("updatedAt");
        e.setUpdatedAt(updatedAt != null ? updatedAt : 0L);
        return e;
    }
}
