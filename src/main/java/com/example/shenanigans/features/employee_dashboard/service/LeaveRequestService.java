package com.example.shenanigans.features.employee_dashboard.service;

import com.example.shenanigans.core.firebase.FirebaseInitializer;
import com.example.shenanigans.features.employee_dashboard.model.LeaveRequest;
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
 * Service for leave request CRUD operations against Firestore.
 */
public class LeaveRequestService {

    private static final Logger LOGGER = Logger.getLogger(LeaveRequestService.class.getName());
    private static final String COLLECTION = "leave_requests";

    /**
     * Fetches leave requests for a given employee.
     *
     * @param employeeId the employee's UID
     * @return Task completing with the list of requests sorted by creation date
     *         descending
     */
    public Task<List<LeaveRequest>> getRequestsByEmployee(String employeeId) {
        return new Task<>() {
            @Override
            protected List<LeaveRequest> call() throws Exception {
                Firestore db = FirebaseInitializer.getFirestore();
                QuerySnapshot snapshot = db.collection(COLLECTION)
                        .whereEqualTo("employeeId", employeeId)
                        .get().get();
                List<LeaveRequest> requests = new ArrayList<>();
                for (QueryDocumentSnapshot doc : snapshot.getDocuments()) {
                    requests.add(mapToRequest(doc));
                }
                requests.sort((a, b) -> Long.compare(b.getCreatedAt(), a.getCreatedAt()));
                LOGGER.info("Fetched " + requests.size() + " leave requests for " + employeeId);
                return requests;
            }
        };
    }

    /**
     * Fetches all leave requests (for admin views).
     *
     * @return Task completing with all requests
     */
    public Task<List<LeaveRequest>> getAllRequests() {
        return new Task<>() {
            @Override
            protected List<LeaveRequest> call() throws Exception {
                Firestore db = FirebaseInitializer.getFirestore();
                QuerySnapshot snapshot = db.collection(COLLECTION).get().get();
                List<LeaveRequest> requests = new ArrayList<>();
                for (QueryDocumentSnapshot doc : snapshot.getDocuments()) {
                    requests.add(mapToRequest(doc));
                }
                requests.sort((a, b) -> Long.compare(b.getCreatedAt(), a.getCreatedAt()));
                return requests;
            }
        };
    }

    /**
     * Creates a new leave request with PENDING status.
     *
     * @param request the request to save
     * @return Task completing with the saved request
     */
    public Task<LeaveRequest> createRequest(LeaveRequest request) {
        return new Task<>() {
            @Override
            protected LeaveRequest call() throws Exception {
                Firestore db = FirebaseInitializer.getFirestore();
                long now = System.currentTimeMillis();
                request.setStatus("PENDING");
                request.setCreatedAt(now);
                request.setUpdatedAt(now);
                Map<String, Object> data = requestToMap(request);
                var docRef = db.collection(COLLECTION).add(data).get();
                request.setId(docRef.getId());
                LOGGER.info("Created leave request: " + docRef.getId());
                return request;
            }
        };
    }

    /**
     * Updates the status of a leave request (approve/reject).
     *
     * @param requestId  the document ID
     * @param status     APPROVED or REJECTED
     * @param reviewedBy name of the reviewer
     * @return Task completing when the update finishes
     */
    public Task<Void> updateStatus(String requestId, String status, String reviewedBy) {
        return new Task<>() {
            @Override
            protected Void call() throws Exception {
                Firestore db = FirebaseInitializer.getFirestore();
                long now = System.currentTimeMillis();
                Map<String, Object> updates = new HashMap<>();
                updates.put("status", status);
                updates.put("reviewedBy", reviewedBy);
                updates.put("reviewedAt", now);
                updates.put("updatedAt", now);
                db.collection(COLLECTION).document(requestId).update(updates).get();
                LOGGER.info("Updated leave request " + requestId + " to " + status);
                return null;
            }
        };
    }

    // ==================== Mapping ====================

    private Map<String, Object> requestToMap(LeaveRequest r) {
        Map<String, Object> m = new HashMap<>();
        m.put("employeeId", r.getEmployeeId());
        m.put("employeeName", r.getEmployeeName());
        m.put("type", r.getType());
        m.put("startDate", r.getStartDate());
        m.put("endDate", r.getEndDate());
        m.put("reason", r.getReason());
        m.put("status", r.getStatus());
        m.put("reviewedBy", r.getReviewedBy());
        m.put("reviewedAt", r.getReviewedAt());
        m.put("createdAt", r.getCreatedAt());
        m.put("updatedAt", r.getUpdatedAt());
        return m;
    }

    private LeaveRequest mapToRequest(DocumentSnapshot doc) {
        LeaveRequest r = new LeaveRequest();
        r.setId(doc.getId());
        r.setEmployeeId(doc.getString("employeeId"));
        r.setEmployeeName(doc.getString("employeeName"));
        r.setType(doc.getString("type"));
        Long startDate = doc.getLong("startDate");
        r.setStartDate(startDate != null ? startDate : 0L);
        Long endDate = doc.getLong("endDate");
        r.setEndDate(endDate != null ? endDate : 0L);
        r.setReason(doc.getString("reason"));
        r.setStatus(doc.getString("status"));
        r.setReviewedBy(doc.getString("reviewedBy"));
        Long reviewedAt = doc.getLong("reviewedAt");
        r.setReviewedAt(reviewedAt != null ? reviewedAt : 0L);
        Long createdAt = doc.getLong("createdAt");
        r.setCreatedAt(createdAt != null ? createdAt : 0L);
        Long updatedAt = doc.getLong("updatedAt");
        r.setUpdatedAt(updatedAt != null ? updatedAt : 0L);
        return r;
    }
}
