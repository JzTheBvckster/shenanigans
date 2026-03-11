package com.example.shenanigans.features.employee_dashboard.service;

import com.example.shenanigans.core.firebase.FirebaseInitializer;
import com.example.shenanigans.features.employee_dashboard.model.CompanyDocument;
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
 * Service for company document record operations against Firestore.
 */
public class DocumentService {

    private static final Logger LOGGER = Logger.getLogger(DocumentService.class.getName());
    private static final String COLLECTION = "documents";

    /**
     * Fetches all document records.
     *
     * @return Task completing with all documents sorted by creation date descending
     */
    public Task<List<CompanyDocument>> getAllDocuments() {
        return new Task<>() {
            @Override
            protected List<CompanyDocument> call() throws Exception {
                Firestore db = FirebaseInitializer.getFirestore();
                QuerySnapshot snapshot = db.collection(COLLECTION).get().get();
                List<CompanyDocument> docs = new ArrayList<>();
                for (QueryDocumentSnapshot doc : snapshot.getDocuments()) {
                    docs.add(mapToDocument(doc));
                }
                docs.sort((a, b) -> Long.compare(b.getCreatedAt(), a.getCreatedAt()));
                LOGGER.info("Fetched " + docs.size() + " documents");
                return docs;
            }
        };
    }

    /**
     * Creates a new document record.
     *
     * @param document the document to save
     * @return Task completing with the saved document
     */
    public Task<CompanyDocument> createDocument(CompanyDocument document) {
        return new Task<>() {
            @Override
            protected CompanyDocument call() throws Exception {
                Firestore db = FirebaseInitializer.getFirestore();
                long now = System.currentTimeMillis();
                document.setCreatedAt(now);
                document.setUpdatedAt(now);
                Map<String, Object> data = documentToMap(document);
                var docRef = db.collection(COLLECTION).add(data).get();
                document.setId(docRef.getId());
                LOGGER.info("Created document: " + docRef.getId());
                return document;
            }
        };
    }

    // ==================== Mapping ====================

    private Map<String, Object> documentToMap(CompanyDocument d) {
        Map<String, Object> m = new HashMap<>();
        m.put("name", d.getName());
        m.put("description", d.getDescription());
        m.put("category", d.getCategory());
        m.put("relatedProjectId", d.getRelatedProjectId());
        m.put("uploadedBy", d.getUploadedBy());
        m.put("createdAt", d.getCreatedAt());
        m.put("updatedAt", d.getUpdatedAt());
        return m;
    }

    private CompanyDocument mapToDocument(DocumentSnapshot doc) {
        CompanyDocument d = new CompanyDocument();
        d.setId(doc.getId());
        d.setName(doc.getString("name"));
        d.setDescription(doc.getString("description"));
        d.setCategory(doc.getString("category"));
        d.setRelatedProjectId(doc.getString("relatedProjectId"));
        d.setUploadedBy(doc.getString("uploadedBy"));
        Long createdAt = doc.getLong("createdAt");
        d.setCreatedAt(createdAt != null ? createdAt : 0L);
        Long updatedAt = doc.getLong("updatedAt");
        d.setUpdatedAt(updatedAt != null ? updatedAt : 0L);
        return d;
    }
}
