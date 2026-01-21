package com.example.shenanigans.features.finance.service;

import com.example.shenanigans.features.finance.model.Invoice;
import javafx.concurrent.Task;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * Lightweight Finance service stub providing async tasks for invoices.
 * In a full implementation this would call Firebase/Firestore.
 */
public class FinanceService {

    public Task<List<Invoice>> getAllInvoices() {
        return new Task<>() {
            @Override
            protected List<Invoice> call() {
                // Return sample data
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
                // Stubbed create operation
                return null;
            }
        };
    }

    public Task<Void> updateInvoice(Invoice invoice) {
        return new Task<>() {
            @Override
            protected Void call() {
                // Stubbed update
                return null;
            }
        };
    }

    public Task<Void> deleteInvoice(String id) {
        return new Task<>() {
            @Override
            protected Void call() {
                // Stubbed delete
                return null;
            }
        };
    }
}
