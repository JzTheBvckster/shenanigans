# Shenanigans - Enterprise Management System

A modern JavaFX-based enterprise management system for managing employees, projects, and company operations. Built with a clean architecture, Firebase backend, and a professional UI design.

![Java](https://img.shields.io/badge/Java-17-orange)
![JavaFX](https://img.shields.io/badge/JavaFX-17.0.2-blue)
![Firebase](https://img.shields.io/badge/Firebase-Admin%20SDK-yellow)
![Maven](https://img.shields.io/badge/Maven-Build-red)

## ✨ Features

### 🔐 Authentication
- Secure user registration and login with Firebase Authentication
- Role-based access control (Managing Director, Project Manager, Employee)
- Real-time field validation with modern security standards
- Password requirements: 8+ characters, uppercase, lowercase, digit, special character
- Email format validation (RFC 5322 compliant)
- Password reset functionality

### 👥 Employee Management
- Complete CRUD operations for employee records
- Employee directory with search functionality
- Status tracking (Active, On Leave, Terminated)
- Department and position management
- Automatic employee record creation on registration
- Statistics dashboard (Total, Active, On Leave, Departments)

### 📋 Project Management
- Full project lifecycle management
- Status tracking (Planning, In Progress, Completed, On Hold, Cancelled)
- Priority levels (Low, Medium, High, Critical)
- Progress tracking with visual progress bars
- Budget and spending management
- Deadline tracking with overdue alerts
- Project manager assignment
- Team member management

### 🎨 Modern UI/UX
- Beautiful gradient-based design
- Glassmorphism effects
- Responsive card-based layouts
- Status badges with color coding
- Smooth hover animations
- Professional enterprise aesthetic
- Consistent design language across all views

## 🏗️ Architecture

```
src/main/java/com/example/shenanigans/
├── core/
│   ├── firebase/
│   │   ├── FirebaseAuthClient.java    # REST API client for Firebase Auth
│   │   ├── FirebaseConfig.java        # Configuration loader
│   │   └── FirebaseInitializer.java   # Firebase Admin SDK setup
│   └── session/
│       └── SessionManager.java        # User session management
│
├── features/
│   ├── auth/
│   │   ├── controller/
│   │   │   ├── AuthController.java    # Login handling
│   │   │   └── RegisterController.java # Registration with validation
│   │   ├── model/
│   │   │   └── User.java              # User model
│   │   └── service/
│   │       └── AuthService.java       # Authentication logic
│   │
│   ├── dashboard/
│   │   └── controller/
│   │       └── DashboardController.java # Main dashboard
│   │
│   ├── employee_dashboard/
│   │   └── controller/
│   │       └── EmployeeDashboardController.java # Employee-specific view
│   │
│   ├── employees/
│   │   ├── controller/
│   │   │   └── EmployeeController.java # Employee CRUD
│   │   ├── model/
│   │   │   └── Employee.java          # Employee model
│   │   └── service/
│   │       └── EmployeeService.java   # Firestore operations
│   │
│   └── projects/
│       ├── controller/
│       │   └── ProjectController.java  # Project CRUD
│       ├── model/
│       │   └── Project.java           # Project model
│       └── service/
│           └── ProjectService.java    # Firestore operations
│
├── App.java                           # Main application class
└── Launcher.java                      # Application entry point
```

## 🚀 Getting Started

### Prerequisites

- **Java 17** or higher
- **Maven 3.6+**
- **Firebase Project** with:
  - Authentication enabled (Email/Password)
  - Firestore Database
  - Service Account Key

### Firebase Setup

1. Create a Firebase project at [Firebase Console](https://console.firebase.google.com/)

2. Enable **Email/Password** authentication in Authentication > Sign-in method

3. Create a **Firestore Database** in production or test mode

4. Generate a service account key:
   - Go to Project Settings > Service Accounts
   - Click "Generate new private key"
   - Save the JSON file

5. Configure the application:
   
   Copy your service account JSON to:
   ```
   src/main/resources/firebase/serviceAccountKey.json
   ```

   Create `src/main/resources/firebase/firebase.properties`:
   ```properties
   firebase.project.id=your-project-id
   firebase.api.key=your-web-api-key
   firebase.service.account=firebase/serviceAccountKey.json
   ```

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/shenanigans.git
   cd shenanigans
   ```

2. **Configure Firebase** (see Firebase Setup above)

3. **Build the project**
   ```bash
   mvn clean install
   ```

4. **Run the application**
   ```bash
   mvn javafx:run
   ```

   Or run `Launcher.java` directly from your IDE.

## 📁 Project Structure

```
shenanigans/
├── src/
│   ├── main/
│   │   ├── java/com/example/shenanigans/
│   │   │   ├── core/           # Core utilities (Firebase, Session)
│   │   │   ├── features/       # Feature modules
│   │   │   ├── App.java
│   │   │   └── Launcher.java
│   │   └── resources/
│   │       ├── com/example/shenanigans/features/
│   │       │   ├── auth/       # Auth views & styles
│   │       │   ├── dashboard/  # Dashboard views & styles
│   │       │   ├── employees/  # Employee views & styles
│   │       │   └── projects/   # Project views & styles
│   │       └── firebase/       # Firebase configuration
│   └── test/
│       └── java/               # Unit tests
├── pom.xml
└── README.md
```

## 🔒 Security Features

- **Password Hashing**: Firebase handles secure password storage
- **Session Management**: Secure token-based session handling
- **Role-Based Access**: Different views and permissions per role
- **Input Validation**: Real-time validation prevents invalid data entry
- **Null Safety**: Defensive programming throughout the codebase

## 🎯 User Roles

| Role | Employees | Projects | Finance | Settings |
|------|-----------|----------|---------|----------|
| Managing Director | ✅ Full Access | ✅ Full Access | ✅ Full Access | ✅ |
| Project Manager | ✅ Full Access | ✅ Full Access | ❌ | ✅ |
| Employee | 👤 Own Dashboard | 📋 Assigned Only | ❌ | ✅ |

## 🛠️ Technology Stack

- **Language**: Java 17
- **UI Framework**: JavaFX 17 with FXML
- **Build Tool**: Maven
- **Backend**: Firebase (Authentication + Firestore)
- **Testing**: JUnit 5
- **Styling**: CSS with modern design patterns

## 📝 Firestore Collections

### `users`
```json
{
  "uid": "string",
  "email": "string",
  "displayName": "string",
  "role": "MANAGING_DIRECTOR | PROJECT_MANAGER | EMPLOYEE",
  "createdAt": "timestamp"
}
```

### `employees`
```json
{
  "firstName": "string",
  "lastName": "string",
  "email": "string",
  "phone": "string",
  "department": "string",
  "position": "string",
  "status": "ACTIVE | ON_LEAVE | TERMINATED",
  "salary": "number",
  "hireDate": "timestamp"
}
```

### `projects`
```json
{
  "name": "string",
  "description": "string",
  "status": "PLANNING | IN_PROGRESS | COMPLETED | ON_HOLD | CANCELLED",
  "priority": "LOW | MEDIUM | HIGH | CRITICAL",
  "projectManager": "string",
  "department": "string",
  "budget": "number",
  "spent": "number",
  "completionPercentage": "number",
  "startDate": "timestamp",
  "endDate": "timestamp",
  "teamMemberIds": ["string"]
}
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [JavaFX](https://openjfx.io/) - UI Framework
- [Firebase](https://firebase.google.com/) - Backend Services
- [Maven](https://maven.apache.org/) - Build Automation

---

<p align="center">
  Made with ❤️ using JavaFX and Firebase
</p>
