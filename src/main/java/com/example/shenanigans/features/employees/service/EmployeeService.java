package com.example.shenanigans.features.employees.service;

import com.example.shenanigans.core.firebase.FirebaseInitializer;
import com.example.shenanigans.features.employees.model.Employee;
import com.google.cloud.firestore.DocumentSnapshot;
import com.google.cloud.firestore.Firestore;
import com.google.cloud.firestore.QueryDocumentSnapshot;
import com.google.cloud.firestore.QuerySnapshot;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.logging.Logger;
import javafx.concurrent.Task;

/**
 * Service class for employee CRUD operations. All Firebase interactions are asynchronous to avoid
 * blocking the UI thread.
 */
public class EmployeeService {

  private static final Logger LOGGER = Logger.getLogger(EmployeeService.class.getName());
  private static final String EMPLOYEES_COLLECTION = "employees";

  /**
   * Creates a new employee in Firestore.
   *
   * @param employee The employee to create
   * @return Task that completes with the created Employee (with generated ID)
   */
  public Task<Employee> createEmployee(Employee employee) {
    return new Task<>() {
      @Override
      protected Employee call() throws Exception {
        Firestore firestore = FirebaseInitializer.getFirestore();

        // Generate ID if not provided
        if (employee.getId() == null || employee.getId().isEmpty()) {
          employee.setId(UUID.randomUUID().toString());
        }

        employee.setCreatedAt(System.currentTimeMillis());
        employee.setUpdatedAt(System.currentTimeMillis());

        Map<String, Object> data = employeeToMap(employee);

        firestore.collection(EMPLOYEES_COLLECTION).document(employee.getId()).set(data).get();

        LOGGER.info("Employee created: " + employee.getId());
        return employee;
      }
    };
  }

  /**
   * Fetches all employees from Firestore.
   *
   * @return Task that completes with a list of all employees
   */
  public Task<List<Employee>> getAllEmployees() {
    return new Task<>() {
      @Override
      protected List<Employee> call() throws Exception {
        Firestore firestore = FirebaseInitializer.getFirestore();

        QuerySnapshot snapshot = firestore.collection(EMPLOYEES_COLLECTION).get().get();

        List<Employee> employees = new ArrayList<>();
        for (QueryDocumentSnapshot doc : snapshot.getDocuments()) {
          employees.add(mapToEmployee(doc));
        }

        LOGGER.info("Fetched " + employees.size() + " employees");
        return employees;
      }
    };
  }

  /**
   * Fetches active employees only.
   *
   * @return Task that completes with a list of active employees
   */
  public Task<List<Employee>> getActiveEmployees() {
    return new Task<>() {
      @Override
      protected List<Employee> call() throws Exception {
        Firestore firestore = FirebaseInitializer.getFirestore();

        QuerySnapshot snapshot =
            firestore.collection(EMPLOYEES_COLLECTION).whereEqualTo("status", "ACTIVE").get().get();

        List<Employee> employees = new ArrayList<>();
        for (QueryDocumentSnapshot doc : snapshot.getDocuments()) {
          employees.add(mapToEmployee(doc));
        }

        LOGGER.info("Fetched " + employees.size() + " active employees");
        return employees;
      }
    };
  }

  /**
   * Fetches a single employee by ID.
   *
   * @param id The employee ID
   * @return Task that completes with the Employee, or null if not found
   */
  public Task<Employee> getEmployeeById(String id) {
    return new Task<>() {
      @Override
      protected Employee call() throws Exception {
        Firestore firestore = FirebaseInitializer.getFirestore();

        DocumentSnapshot doc = firestore.collection(EMPLOYEES_COLLECTION).document(id).get().get();

        if (!doc.exists()) {
          return null;
        }

        return mapToEmployee(doc);
      }
    };
  }

  /**
   * Updates an existing employee.
   *
   * @param employee The employee with updated data
   * @return Task that completes when update is done
   */
  public Task<Void> updateEmployee(Employee employee) {
    return new Task<>() {
      @Override
      protected Void call() throws Exception {
        Firestore firestore = FirebaseInitializer.getFirestore();

        employee.setUpdatedAt(System.currentTimeMillis());
        Map<String, Object> data = employeeToMap(employee);

        firestore.collection(EMPLOYEES_COLLECTION).document(employee.getId()).set(data).get();

        LOGGER.info("Employee updated: " + employee.getId());
        return null;
      }
    };
  }

  /**
   * Deletes an employee from Firestore.
   *
   * @param id The employee ID to delete
   * @return Task that completes when deletion is done
   */
  public Task<Void> deleteEmployee(String id) {
    return new Task<>() {
      @Override
      protected Void call() throws Exception {
        Firestore firestore = FirebaseInitializer.getFirestore();

        firestore.collection(EMPLOYEES_COLLECTION).document(id).delete().get();

        LOGGER.info("Employee deleted: " + id);
        return null;
      }
    };
  }

  /**
   * Searches employees by name or email.
   *
   * @param query The search query
   * @return Task that completes with matching employees
   */
  public Task<List<Employee>> searchEmployees(String query) {
    return new Task<>() {
      @Override
      protected List<Employee> call() throws Exception {
        // Firestore doesn't support full-text search, so we fetch all and filter
        List<Employee> allEmployees = fetchAllEmployeesInternal();
        String lowerQuery = query.toLowerCase();

        List<Employee> results = new ArrayList<>();
        for (Employee emp : allEmployees) {
          if (emp.getFullName().toLowerCase().contains(lowerQuery)
              || (emp.getEmail() != null && emp.getEmail().toLowerCase().contains(lowerQuery))
              || (emp.getDepartment() != null
                  && emp.getDepartment().toLowerCase().contains(lowerQuery))) {
            results.add(emp);
          }
        }

        LOGGER.info("Search found " + results.size() + " employees for query: " + query);
        return results;
      }
    };
  }

  /**
   * Gets the count of employees by status.
   *
   * @return Task that completes with a map of status to count
   */
  public Task<Map<String, Long>> getEmployeeCountByStatus() {
    return new Task<>() {
      @Override
      protected Map<String, Long> call() throws Exception {
        List<Employee> employees = fetchAllEmployeesInternal();

        Map<String, Long> counts = new HashMap<>();
        counts.put("ACTIVE", 0L);
        counts.put("ON_LEAVE", 0L);
        counts.put("TERMINATED", 0L);

        for (Employee emp : employees) {
          String status = emp.getStatus();
          if (status != null) {
            counts.put(status, counts.getOrDefault(status, 0L) + 1);
          }
        }

        return counts;
      }
    };
  }

  // ==================== Private Helper Methods ====================

  /**
   * Internal method to fetch all employees directly (not as a Task). Used by other methods that
   * need the data synchronously within their Task.
   */
  private List<Employee> fetchAllEmployeesInternal() throws Exception {
    Firestore firestore = FirebaseInitializer.getFirestore();

    QuerySnapshot snapshot = firestore.collection(EMPLOYEES_COLLECTION).get().get();

    List<Employee> employees = new ArrayList<>();
    for (QueryDocumentSnapshot doc : snapshot.getDocuments()) {
      employees.add(mapToEmployee(doc));
    }

    return employees;
  }

  private Map<String, Object> employeeToMap(Employee employee) {
    Map<String, Object> data = new HashMap<>();
    data.put("id", employee.getId());
    data.put("firstName", employee.getFirstName());
    data.put("lastName", employee.getLastName());
    data.put("email", employee.getEmail());
    data.put("phone", employee.getPhone());
    data.put("department", employee.getDepartment());
    data.put("position", employee.getPosition());
    data.put("status", employee.getStatus());
    data.put("salary", employee.getSalary());
    data.put("hireDate", employee.getHireDate());
    data.put("createdAt", employee.getCreatedAt());
    data.put("updatedAt", employee.getUpdatedAt());
    return data;
  }

  private Employee mapToEmployee(DocumentSnapshot doc) {
    Employee employee = new Employee();
    employee.setId(doc.getString("id"));
    employee.setFirstName(doc.getString("firstName"));
    employee.setLastName(doc.getString("lastName"));
    employee.setEmail(doc.getString("email"));
    employee.setPhone(doc.getString("phone"));
    employee.setDepartment(doc.getString("department"));
    employee.setPosition(doc.getString("position"));
    employee.setStatus(doc.getString("status"));

    Double salary = doc.getDouble("salary");
    employee.setSalary(salary != null ? salary : 0.0);

    Long hireDate = doc.getLong("hireDate");
    employee.setHireDate(hireDate != null ? hireDate : 0L);

    Long createdAt = doc.getLong("createdAt");
    employee.setCreatedAt(createdAt != null ? createdAt : 0L);

    Long updatedAt = doc.getLong("updatedAt");
    employee.setUpdatedAt(updatedAt != null ? updatedAt : 0L);

    return employee;
  }
}
