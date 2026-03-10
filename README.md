# Shenanigans - Enterprise Management System

A modern enterprise management system for managing employees, projects, finances, and company operations. Available as both a JavaFX desktop application and a web application deployed on Vercel.

![Java](https://img.shields.io/badge/Java-25-orange)
![JavaFX](https://img.shields.io/badge/JavaFX-25.0.2-blue)
![Firebase](https://img.shields.io/badge/Firebase-Admin%20SDK-yellow)
![Maven](https://img.shields.io/badge/Maven-Build-red)
![Vercel](https://img.shields.io/badge/Vercel-Deployed-black)

## Features

### Authentication
- Secure user registration and login with Firebase Authentication
- Role-based access control (Managing Director, Project Manager, Employee)
- Real-time field validation with modern security standards
- Password requirements: 8+ characters, uppercase, lowercase, digit, special character
- Email format validation (RFC 5322 compliant)
- Password reset functionality

### Employee Management
- Complete CRUD operations for employee records
- Employee directory with search functionality
- Kanban board view by status (Active, On Leave, Terminated)
- Department and position management
- Hire date tracking and salary management
- Automatic employee record creation on registration

### Project Management
- Full project lifecycle management
- Status tracking (Planning, In Progress, Completed, On Hold, Cancelled)
- Priority levels (Low, Medium, High, Critical)
- Progress tracking with visual progress bars
- Budget and spending management
- Start and end date tracking with overdue alerts
- Project manager assignment
- Team member management

### Finance
- Invoice management with CRUD operations
- Kanban board view (Due / Outstanding, Paid)
- Toggle paid/unpaid status
- CSV export functionality
- Revenue tracking across the dashboard

### Dashboard
- Key metrics: Total Employees, Active Projects, Open Invoices, Revenue
- Performance Snapshot with budget utilization
- Revenue Trend chart (configurable 3/6/12 month range)
- Project Status distribution chart
- Project overview with progress bars
- Recent activity feed
- Approval queue for Managing Directors

### Settings
- Dark mode toggle
- Sidebar layout preferences
- Notification preferences with auto-refresh interval
- Account information and approval status
- Session management

### Modern UI/UX
- Professional gradient-based design
- Light and dark theme support
- Responsive card-based layouts
- Status badges with color coding
- Smooth hover animations
- Consistent design across desktop and web

## Architecture

### Desktop Application (JavaFX)

```
src/main/java/com/example/shenanigans/
  core/
    firebase/
      FirebaseAuthClient.java      # REST API client for Firebase Auth
      FirebaseConfig.java          # Configuration loader
      FirebaseInitializer.java     # Firebase Admin SDK setup
    navigation/
      NavigationService.java       # View navigation
    session/
      SessionManager.java          # User session management
    settings/
      SettingsManager.java         # App settings persistence
    theme/
      ThemeManager.java            # Light/dark theme switching

  features/
    auth/
      controller/                  # Login and registration UI
      model/User.java              # User model
      service/AuthService.java     # Authentication logic

    dashboard/
      controller/                  # Main dashboard with charts

    employee_dashboard/
      controller/                  # Employee-specific view

    employees/
      controller/                  # Employee CRUD UI
      model/Employee.java          # Employee model
      service/EmployeeService.java # Firestore operations

    projects/
      controller/                  # Project CRUD UI
      model/Project.java           # Project model
      service/ProjectService.java  # Firestore operations

    finance/
      controller/                  # Invoice management UI
      model/Invoice.java           # Invoice model
      service/FinanceService.java  # Firestore operations

    settings/
      controller/                  # Settings UI

  App.java                         # Main application class
  Launcher.java                    # Application entry point
```

### Web Application (Vercel)

```
vercel-web/
  api/
    auth/
      login.js                     # Authentication endpoint
      register.js                  # Registration endpoint
      session.js                   # Session validation
      logout.js                    # Session termination
      forgot-password.js           # Password reset
    dashboard/
      summary.js                   # Dashboard aggregation
    employees/
      [...path].js                 # Employee CRUD API
    projects/
      [...path].js                 # Project CRUD API
    finance/
      invoices/
        [...path].js               # Invoice CRUD API
    health.js                      # Health check

  public/
    app.html                       # Main application shell
    index.html                     # Login page
    assets/
      app.js                       # Application logic
      login.js                     # Login logic
      styles.css                   # Styling

  lib/
    firebase.js                    # Firebase Admin SDK init
    session.js                     # Session middleware
```

## Getting Started

### Prerequisites

- **Java 25** or higher
- **Maven 3.6+**
- **Node.js 18+** (for web deployment)
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

### Running the Desktop Application

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/shenanigans.git
   cd shenanigans
   ```

2. **Configure Firebase** (see above)

3. **Build the project**
   ```bash
   mvnw.cmd clean install
   ```

4. **Run the application**
   ```bash
   mvnw.cmd javafx:run
   ```

### Running the Web Application

1. **Install dependencies**
   ```bash
   cd vercel-web
   npm install
   ```

2. **Configure environment** - set Firebase credentials in your Vercel project or local `.env`

3. **Deploy to Vercel**
   ```bash
   vercel --prod
   ```

   Or run locally with:
   ```bash
   vercel dev
   ```

## Project Structure

```
shenanigans/
  src/
    main/
      java/com/example/shenanigans/
        core/               # Core utilities (Firebase, Session, Navigation, Theme)
        features/           # Feature modules (auth, dashboard, employees, projects, finance, settings)
        App.java
        Launcher.java
      resources/
        com/example/shenanigans/features/
          auth/             # Auth views and styles
          dashboard/        # Dashboard views and styles
          employees/        # Employee views and styles
          projects/         # Project views and styles
          finance/          # Finance views and styles
          settings/         # Settings views and styles
        firebase/           # Firebase configuration
    test/
      java/                 # Unit tests
  vercel-web/
    api/                    # Node.js serverless functions
    public/                 # Static web frontend
    lib/                    # Shared utilities
  pom.xml
  README.md
```

## Security Features

- **Password Hashing**: Firebase handles secure password storage
- **Session Management**: Secure token-based session handling
- **Role-Based Access**: Different views and permissions per role
- **Input Validation**: Real-time validation prevents invalid data entry
- **CSRF Protection**: Server-side session cookies (web)

## User Roles

| Role | Employees | Projects | Finance | Approvals | Settings |
|------|-----------|----------|---------|-----------|----------|
| Managing Director | Full Access | Full Access | Full Access | Approve users | Full |
| Project Manager | Full Access | Full Access | No Access | -- | Full |
| Employee | Own Dashboard | Assigned Only | No Access | -- | Full |

## Technology Stack

- **Language**: Java 25
- **Desktop UI**: JavaFX 25.0.2 with FXML + CSS
- **Web Frontend**: Vanilla HTML/CSS/JS with Chart.js
- **Web Backend**: Node.js serverless functions (Vercel)
- **Database**: Firebase Firestore
- **Authentication**: Firebase Auth
- **Build Tool**: Maven (desktop), npm (web)
- **Hosting**: Vercel
- **Testing**: JUnit 5

## Firestore Collections

### `users`
```json
{
  "uid": "string",
  "email": "string",
  "displayName": "string",
  "role": "MANAGING_DIRECTOR | PROJECT_MANAGER | EMPLOYEE",
  "mdApproved": "boolean",
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
  "hireDate": "timestamp",
  "mdApproved": "boolean",
  "createdAt": "timestamp",
  "updatedAt": "timestamp"
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
  "projectManagerId": "string",
  "department": "string",
  "budget": "number",
  "spent": "number",
  "completionPercentage": "number",
  "startDate": "timestamp",
  "endDate": "timestamp",
  "teamMemberIds": ["string"],
  "createdAt": "timestamp",
  "updatedAt": "timestamp"
}
```

### `invoices`
```json
{
  "client": "string",
  "amount": "number",
  "paid": "boolean",
  "projectId": "string",
  "issuedAt": "timestamp"
}
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- [JavaFX](https://openjfx.io/) - Desktop UI Framework
- [Firebase](https://firebase.google.com/) - Backend Services
- [Chart.js](https://www.chartjs.org/) - Web Charts
- [Vercel](https://vercel.com/) - Web Hosting
- [Maven](https://maven.apache.org/) - Build Automation

---

<p align="center">
  Made with JavaFX and Firebase
</p>
