package com.example.shenanigans.features.finance.service;

import com.example.shenanigans.core.firebase.FirebaseInitializer;
import com.example.shenanigans.features.finance.model.Invoice;
import com.google.api.core.ApiFuture;
import com.google.cloud.firestore.CollectionReference;
import com.google.cloud.firestore.DocumentReference;
import com.google.cloud.firestore.Firestore;
import com.google.cloud.firestore.DocumentSnapshot;
import com.google.cloud.firestore.QueryDocumentSnapshot;
import com.google.cloud.firestore.QuerySnapshot;
import com.google.cloud.firestore.WriteResult;
import java.util.ArrayList;
import java.util.List;
import java.util.logging.Level;
import java.util.logging.Logger;
import javafx.concurrent.Task;

/** Finance service that persists invoices to Firestore when available. */
public class FinanceService {

    private static final Logger LOGGER = Logger.getLogger(FinanceService.class.getName());

    private static final String COLLECTION = "invoices";

    public Task<List<Invoice>> getAllInvoices() {
        return new Task<>() {
            @Override
            protected List<Invoice> call() {
                if (FirebaseInitializer.isInitialized()) {
                    try {
                        Firestore db = FirebaseInitializer.getFirestore();
                        CollectionReference col = db.collection(COLLECTION);
                        ApiFuture<QuerySnapshot> future = col.get();
                        QuerySnapshot snapshot = future.get();
                        List<Invoice> out = new ArrayList<>();
                        for (QueryDocumentSnapshot doc : snapshot.getDocuments()) {
                            try {
                                Invoice inv = mapInvoiceDocument(doc);
                                out.add(inv);
                            } catch (Exception mappingError) {
                                LOGGER.log(
                                        Level.WARNING,
                                        "Skipping unreadable invoice document: " + doc.getId(),
                                        mappingError);
                            }
                        }
                        return out;
                    } catch (Exception e) {
                        LOGGER.log(Level.SEVERE, "Failed to load invoices from Firestore", e);
                        return new ArrayList<>();
                    }
                }

                // Fallback sample data
                List<Invoice> list = new ArrayList<>();
                Invoice a = new Invoice();
                a.setId("INV-001");
                a.setClient("Acme Corp");
                a.setAmount(12450.00);
                a.setPaid(false);

                Invoice b = new Invoice();
                b.setId("INV-002");
                b.setClient("Beta LLC");
                b.setAmount(5300.00);
                b.setPaid(true);

                list.add(a);
                list.add(b);
                return list;
            }
        };
    }

    public Task<Void> createInvoice(Invoice invoice) {
        return new Task<>() {
            @Override
            protected Void call() {
                if (FirebaseInitializer.isInitialized()) {
                    try {
                        Firestore db = FirebaseInitializer.getFirestore();
                        CollectionReference col = db.collection(COLLECTION);
                        if (invoice.getId() == null || invoice.getId().isEmpty()) {
                            ApiFuture<DocumentReference> ref = col.add(invoice);
                            DocumentReference docRef = ref.get();
                            invoice.setId(docRef.getId());
                        } else {
                            ApiFuture<WriteResult> w = col.document(invoice.getId()).set(invoice);
                            w.get();
                        }
                    } catch (Exception e) {
                        LOGGER.log(Level.SEVERE, "Failed to create invoice in Firestore", e);
                        throw new RuntimeException(e);
                    }
                    return null;
                }

                // stubbed behaviour when Firebase not initialized
                return null;
            }
        };
    }

    public Task<Void> updateInvoice(Invoice invoice) {
        return new Task<>() {
            @Override
            protected Void call() {
                if (FirebaseInitializer.isInitialized()) {
                    try {
                        Firestore db = FirebaseInitializer.getFirestore();
                        if (invoice.getId() == null || invoice.getId().isEmpty()) {
                            throw new IllegalArgumentException("Invoice id required for update");
                        }
                        ApiFuture<WriteResult> w = db.collection(COLLECTION).document(invoice.getId()).set(invoice);
                        w.get();
                    } catch (Exception e) {
                        LOGGER.log(Level.SEVERE, "Failed to update invoice in Firestore", e);
                        throw new RuntimeException(e);
                    }
                    return null;
                }
                // stubbed
                return null;
            }
        };
    }

    public Task<Void> deleteInvoice(String id) {
        return new Task<>() {
            @Override
            protected Void call() {
                if (FirebaseInitializer.isInitialized()) {
                    try {
                        Firestore db = FirebaseInitializer.getFirestore();
                        ApiFuture<WriteResult> w = db.collection(COLLECTION).document(id).delete();
                        w.get();
                    } catch (Exception e) {
                        LOGGER.log(Level.SEVERE, "Failed to delete invoice from Firestore", e);
                        throw new RuntimeException(e);
                    }
                    return null;
                }
                // stubbed
                return null;
            }
        };
    }

    private Invoice mapInvoiceDocument(DocumentSnapshot doc) {
        Invoice invoice = new Invoice();
        invoice.setId(doc.getId());

        String projectId = readString(doc, "projectId");
        String client = readString(doc, "client");
        if (client.isEmpty()) {
            client = readString(doc, "clientName");
        }

        invoice.setProjectId(projectId);
        invoice.setClient(client.isEmpty() ? "Unknown Client" : client);
        invoice.setAmount(readDouble(doc, "amount", 0.0));
        invoice.setPaid(readPaidStatus(doc));
        invoice.setIssuedAt(readLong(doc, "issuedAt", System.currentTimeMillis()));

        return invoice;
    }

    private String readString(DocumentSnapshot doc, String field) {
        Object value = doc.get(field);
        return value == null ? "" : String.valueOf(value).trim();
    }

    private double readDouble(DocumentSnapshot doc, String field, double defaultValue) {
        Object value = doc.get(field);
        if (value == null) {
            return defaultValue;
        }
        if (value instanceof Number number) {
            return number.doubleValue();
        }
        if (value instanceof String text) {
            try {
                return Double.parseDouble(text.trim());
            } catch (NumberFormatException ignored) {
                return defaultValue;
            }
        }
        return defaultValue;
    }

    private long readLong(DocumentSnapshot doc, String field, long defaultValue) {
        Object value = doc.get(field);
        if (value == null) {
            return defaultValue;
        }
        if (value instanceof Number number) {
            return number.longValue();
        }
        if (value instanceof String text) {
            try {
                return Long.parseLong(text.trim());
            } catch (NumberFormatException ignored) {
                return defaultValue;
            }
        }
        return defaultValue;
    }

    private boolean readPaidStatus(DocumentSnapshot doc) {
        Object paid = doc.get("paid");
        if (paid instanceof Boolean bool) {
            return bool;
        }
        if (paid instanceof String text) {
            String normalized = text.trim().toLowerCase();
            return normalized.equals("true") || normalized.equals("paid") || normalized.equals("done");
        }

        Object status = doc.get("status");
        if (status instanceof String statusText) {
            String normalized = statusText.trim().toLowerCase();
            return normalized.equals("paid") || normalized.equals("completed") || normalized.equals("done");
        }

        return false;
    }
}
