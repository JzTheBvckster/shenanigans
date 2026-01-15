package com.example.shenanigans.features.employees.model;

/**
 * Represents an employee in the system.
 */
public class Employee {

    private String id;
    private String firstName;
    private String lastName;
    private String email;
    private String phone;
    private String department;
    private String position;
    private String status; // ACTIVE, ON_LEAVE, TERMINATED
    private double salary;
    private long hireDate;
    private long createdAt;
    private long updatedAt;

    public Employee() {
    }

    public Employee(String id, String firstName, String lastName, String email) {
        this.id = id;
        this.firstName = firstName;
        this.lastName = lastName;
        this.email = email;
        this.status = "ACTIVE";
    }

    // Getters and Setters

    public String getId() {
        return id;
    }

    public void setId(String id) {
        this.id = id;
    }

    public String getFirstName() {
        return firstName;
    }

    public void setFirstName(String firstName) {
        this.firstName = firstName;
    }

    public String getLastName() {
        return lastName;
    }

    public void setLastName(String lastName) {
        this.lastName = lastName;
    }

    public String getFullName() {
        return (firstName != null ? firstName : "") + " " + (lastName != null ? lastName : "");
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getPhone() {
        return phone;
    }

    public void setPhone(String phone) {
        this.phone = phone;
    }

    public String getDepartment() {
        return department;
    }

    public void setDepartment(String department) {
        this.department = department;
    }

    public String getPosition() {
        return position;
    }

    public void setPosition(String position) {
        this.position = position;
    }

    public String getStatus() {
        return status;
    }

    public void setStatus(String status) {
        this.status = status;
    }

    public double getSalary() {
        return salary;
    }

    public void setSalary(double salary) {
        this.salary = salary;
    }

    public long getHireDate() {
        return hireDate;
    }

    public void setHireDate(long hireDate) {
        this.hireDate = hireDate;
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

    public boolean isActive() {
        return "ACTIVE".equals(status);
    }

    @Override
    public String toString() {
        return "Employee{" +
                "id='" + id + '\'' +
                ", name='" + getFullName() + '\'' +
                ", email='" + email + '\'' +
                ", department='" + department + '\'' +
                ", status='" + status + '\'' +
                '}';
    }
}
