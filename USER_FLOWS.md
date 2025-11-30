# iReport Camarines Norte - User Flows & Screen Functions

## 📱 User Roles & Their Screens

---

## 1. 👤 RESIDENT (General Public)

### Authentication & Onboarding
- **LandingScreen** - App introduction and entry point
- **LoginScreen** - Resident authentication 
- **SignUpScreen** - New resident registration with email/phone verification
- **ForgotPasswordScreen** - Password recovery initiation
- **OTPVerificationScreen** - Verify OTP code
- **OTPSuccessScreen** - Successful OTP confirmation

### Core Incident Reporting Flow
- **HomeScreen** - Main dashboard with three prominent buttons for each agency (PNP, BFP, PDRRMO) for direct reporting.
- **CameraScreen** - Camera-first incident photo capture.
- **[Unit]IncidentFormScreen** - After the camera, the user is taken directly to the specific form for the chosen agency (e.g., BfpIncidentFormScreen), with GPS and timestamp auto-populated.
- **ConfirmationScreen** - Incident submission confirmation.

### Tracking & Management
- **MyReportsScreen** - View all submitted incident reports
- **ProfileScreen** - User profile and settings

---

## 2. 👥 GUEST USER (Anonymous Reporter)

### Anonymous Incident Reporting
- **LandingScreen** - Option to "Report as Guest" which leads to the HomeScreen.
- **HomeScreen** - User taps one of the three agency buttons (PNP, BFP, PDRRMO).
- **CameraScreen** - Camera-first incident photo capture (no login required).
- **[Unit]IncidentFormScreen** - User is taken directly to the specific form for the chosen agency.
- **ConfirmationScreen** - Incident submission confirmation.
- **Note**: Guest users cannot track reports or access MyReports. Anonymous submissions are processed normally by Desk Officers.

---

## 3. 🚔 PNP (Philippine National Police)

### A. DESK OFFICER
**Role**: Initial incident processing and assignment
**Note**: No authentication required - direct system access

#### Incident Management
- **PendingIncidentsScreen** - View unprocessed PNP incidents
- **DeskOfficerFormScreen** - Process and assign incidents to field officers
- **PnpIncidentFormScreen** - PNP-specific incident report form
- **PnpActiveIncidentScreen** - Monitor active PNP cases

#### Case Closure
- **PnpFinalReportScreen** - View resolved PNP cases (clickable to pre-fill forms)
- **PnpFinalReportFormScreen** - Complete final documentation when closing PNP cases

### B. FIELD OFFICER
**Role**: Respond to assigned incidents in the field

#### Authentication & Onboarding
- **LoginScreen** - Field Officer authentication
- **SignUpScreen** - New field officer registration (requires agency verification)
- **ForgotPasswordScreen** - Password recovery

#### Incident Response
- **AssignedIncidentsScreen** - View assigned PNP incidents
- **FieldOfficerIncidentDetailsScreen** - Detailed incident information for field response
- **PnpActiveIncidentScreen** - Real-time incident status updates

### C. CHIEF
**Role**: System oversight and management

- **ChiefDashboardScreen** - Overview of all PNP operations
- **ChiefIncidentDetailsScreen** - Detailed view of any PNP incident
- **PnpActiveIncidentScreen** - Monitor all active PNP cases
- **PnpFinalReportScreen** - Review completed PNP cases

---

## 4. 🌊 PDRRMO (Provincial Disaster Risk Reduction and Management Office)

### A. DESK OFFICER
**Role**: Initial disaster/accident incident processing
**Note**: No authentication required - direct system access

#### Incident Management
- **PendingIncidentsScreen** - View unprocessed PDRRMO incidents (vehicular accidents, disasters)
- **DeskOfficerFormScreen** - Process and assign incidents to field teams
- **PdrrmoIncidentFormScreen** - PDRRMO-specific incident report form
- **PdrrmoActiveIncidentScreen** - Monitor active PDRRMO cases

#### Case Closure
- **PdrrmoFinalReportScreen** - View resolved PDRRMO cases (clickable to pre-fill forms)
- **PdrrmoFinalReportFormScreen** - Complete final documentation when closing PDRRMO cases

### B. FIELD OFFICER
**Role**: Respond to disaster/accident incidents

#### Authentication & Onboarding
- **LoginScreen** - Field Officer authentication
- **SignUpScreen** - New field officer registration (requires agency verification)
- **ForgotPasswordScreen** - Password recovery

#### Incident Response
- **AssignedIncidentsScreen** - View assigned PDRRMO incidents
- **FieldOfficerIncidentDetailsScreen** - Detailed incident information
- **PdrrmoActiveIncidentScreen** - Real-time incident status updates

### C. CHIEF
**Role**: Disaster management oversight

- **ChiefDashboardScreen** - Overview of all PDRRMO operations
- **ChiefIncidentDetailsScreen** - Detailed view of any PDRRMO incident
- **PdrrmoActiveIncidentScreen** - Monitor all active PDRRMO cases
- **PdrrmoFinalReportScreen** - Review completed PDRRMO cases

---

## 5. 🔥 BFP (Bureau of Fire Protection)

### A. DESK OFFICER
**Role**: Initial fire incident processing
**Note**: No authentication required - direct system access

#### Incident Management
- **PendingIncidentsScreen** - View unprocessed BFP fire incidents
- **DeskOfficerFormScreen** - Process and assign incidents to field officers
- **BfpIncidentFormScreen** - BFP-specific fire incident report form
- **BfpActiveIncidentScreen** - Monitor active fire incidents

#### Case Closure
- **BfpFinalReportScreen** - View resolved BFP cases (clickable to pre-fill forms)
- **BfpFinalReportFormScreen** - Complete final fire incident documentation

### B. FIELD OFFICER
**Role**: Respond to fire incidents

#### Authentication & Onboarding
- **LoginScreen** - Field Officer authentication
- **SignUpScreen** - New field officer registration (requires agency verification)
- **ForgotPasswordScreen** - Password recovery

#### Incident Response
- **AssignedIncidentsScreen** - View assigned fire incidents
- **FieldOfficerIncidentDetailsScreen** - Detailed fire incident information
- **BfpActiveIncidentScreen** - Real-time fire incident status updates

### C. CHIEF
**Role**: Fire service oversight

- **ChiefDashboardScreen** - Overview of all BFP operations
- **ChiefIncidentDetailsScreen** - Detailed view of any BFP fire incident
- **BfpActiveIncidentScreen** - Monitor all active fire cases
- **BfpFinalReportScreen** - Review completed fire incident cases

---


## 📊 Complete User Flow Summary

### RESIDENT FLOW (Authenticated - 3-Step Reporting)
1. **HomeScreen** → Tap agency-specific button (e.g., "Report Fire").
2. **CameraScreen** → Capture incident photo.
3. **[Unit]IncidentFormScreen** → Confirm auto-filled details, add notes, and Submit.
4. **ConfirmationScreen** → Track via **MyReportsScreen**.

### GUEST USER FLOW (Anonymous - 3-Step Reporting)
1. **LandingScreen** → Select "Report as Guest" → **HomeScreen**.
2. **HomeScreen** → Tap agency-specific button (e.g., "Report Crime").
3. **CameraScreen** → Capture incident photo.
4. **[Unit]IncidentFormScreen** → Confirm auto-filled details, add notes, and Submit.
5. **ConfirmationScreen** → Cannot track (anonymous submission).

### DESK OFFICER FLOW (All Units - No Authentication)
1. **PendingIncidentsScreen** → Select incident
2. **DeskOfficerFormScreen** → Process and assign to field officer
3. Monitor via **[Unit]ActiveIncidentScreen**
4. When resolved: **[Unit]FinalReportScreen** → Click resolved case
5. **[Unit]FinalReportFormScreen** → Complete final documentation

### FIELD OFFICER FLOW (All Units - Authenticated)
1. **AssignedIncidentsScreen** → View assigned incidents
2. **FieldOfficerIncidentDetailsScreen** → Get details and respond
3. Update status via **[Unit]ActiveIncidentScreen**
4. Submit final report when incident resolved

### CHIEF FLOW (All Units - Authenticated)
1. **ChiefDashboardScreen** → System overview
2. **ChiefIncidentDetailsScreen** → Review any incident
3. **[Unit]ActiveIncidentScreen** → Monitor operations
4. **[Unit]FinalReportScreen** → Review completed cases
