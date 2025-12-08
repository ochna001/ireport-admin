package com.example.iresponderapp;

import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;

import android.os.Bundle;
import android.util.Log;
import android.widget.Button;
import android.widget.EditText;
import android.widget.TextView;
import android.widget.Toast;

import com.example.iresponderapp.supabase.SupabaseAuthRepository;
import com.example.iresponderapp.supabase.SupabaseIncidentsRepository;
import com.example.iresponderapp.supabase.SupabaseUnitReportsRepository;
import com.example.iresponderapp.util.ReportDraftManager;

import kotlin.Unit;

import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

public class BfpReportFormActivity extends AppCompatActivity {

    private static final String TAG = "BfpReportForm";

    private TextView formIncidentType, formIncidentDateTime, formReportedBy, formIncidentDescription;
    private TextView formIncidentAddress, formCoordinates;

    private EditText editFireLocation, editAreaOwnership, editClassOfFire, editRootCause, editPeopleInjured;
    private Button btnSubmit;

    private static final String AGENCY_TYPE = "BFP";
    
    private String incidentKey;
    private SupabaseIncidentsRepository incidentsRepository;
    private SupabaseUnitReportsRepository reportsRepository;
    private SupabaseAuthRepository authRepository;
    private String currentResponderUid;
    
    private ReportDraftManager draftManager;
    private boolean isReadOnlyMode = false;

    // Intent data
    private String incidentType;
    private String incidentReporter;
    private String incidentAddress;
    private String incidentDescription;
    private String incidentCreatedAt;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_bfp_report_form);

        incidentKey = getIntent().getStringExtra("INCIDENT_KEY");
        if (incidentKey == null) {
            Toast.makeText(this, "Incident ID missing.", Toast.LENGTH_LONG).show();
            finish();
            return;
        }

        // Get passed incident data
        incidentType = getIntent().getStringExtra("INCIDENT_TYPE");
        incidentReporter = getIntent().getStringExtra("INCIDENT_REPORTER");
        incidentAddress = getIntent().getStringExtra("INCIDENT_ADDRESS");
        incidentDescription = getIntent().getStringExtra("INCIDENT_DESCRIPTION");
        incidentCreatedAt = getIntent().getStringExtra("INCIDENT_CREATED_AT");

        IreportApp app = (IreportApp) getApplication();
        incidentsRepository = (SupabaseIncidentsRepository) app.getIncidentsRepository();
        reportsRepository = (SupabaseUnitReportsRepository) app.getUnitReportsRepository();
        authRepository = (SupabaseAuthRepository) app.getAuthRepository();

        currentResponderUid = authRepository.getCurrentUserId();
        if (currentResponderUid == null) {
            currentResponderUid = "Unknown";
        }
        
        draftManager = new ReportDraftManager(this);

        initUiElements();

        // Load header data from intent
        loadIncidentDataFromIntent();

        // Check for Edit Mode (read-only for submitted reports)
        boolean isEditMode = getIntent().getBooleanExtra("IS_EDIT_MODE", false);
        if (isEditMode) {
            isReadOnlyMode = true;
            enableReadOnlyMode();
            loadSubmittedReportData();
        } else {
            checkAndRestoreDraft();
        }

        btnSubmit.setOnClickListener(v -> validateAndSubmit());
    }

    private void initUiElements() {
        formIncidentType = findViewById(R.id.formIncidentType);
        formIncidentDateTime = findViewById(R.id.formIncidentDateTime);
        formReportedBy = findViewById(R.id.formReportedBy);
        formIncidentDescription = findViewById(R.id.formIncidentDescription);
        formIncidentAddress = findViewById(R.id.formIncidentAddress);
        formCoordinates = findViewById(R.id.formCoordinates);

        editFireLocation = findViewById(R.id.editFireLocation);
        editAreaOwnership = findViewById(R.id.editAreaOwnership);
        editClassOfFire = findViewById(R.id.editClassOfFire);
        editRootCause = findViewById(R.id.editRootCause);
        editPeopleInjured = findViewById(R.id.editPeopleInjured);

        btnSubmit = findViewById(R.id.btnSubmitBfpReport);
    }

    private void loadIncidentDataFromIntent() {
        // Format date/time
        String date = "N/A";
        String time = "";
        if (incidentCreatedAt != null && incidentCreatedAt.length() >= 16) {
            date = incidentCreatedAt.substring(0, 10);
            time = incidentCreatedAt.substring(11, 16);
        }
        
        formIncidentType.setText(incidentType != null ? incidentType : "FIRE");
        formIncidentDateTime.setText(date + "\n" + time);
        formReportedBy.setText(incidentReporter != null ? incidentReporter : "N/A");
        formIncidentDescription.setText(incidentDescription != null ? incidentDescription : "N/A");
        formIncidentAddress.setText(incidentAddress != null ? incidentAddress : "N/A");
        formCoordinates.setText("See incident details");
        
        // Pre-fill fire location with incident address
        if (incidentAddress != null && !incidentAddress.isEmpty()) {
            editFireLocation.setText(incidentAddress);
        }
    }

    private void loadIncidentData() {
        incidentsRepository.loadIncidentByIdAsync(
                incidentKey,
                incident -> {
                    if (incident != null) {
                        String type = incident.getAgencyType();
                        String createdAt = incident.getCreatedAt();
                        String date = createdAt != null && createdAt.length() >= 10 ? createdAt.substring(0, 10) : "";
                        String time = createdAt != null && createdAt.length() >= 16 ? createdAt.substring(11, 16) : "";
                        String reporter = incident.getReporterName();
                        String address = incident.getLocationAddress();
                        String info = incident.getDescription();
                        Double lat = incident.getLatitude();
                        Double lon = incident.getLongitude();

                        formIncidentType.setText(type != null ? type : "Fire");
                        formIncidentDateTime.setText(date + "\n" + time);
                        formReportedBy.setText(reporter != null ? reporter : "N/A");
                        formIncidentDescription.setText(info != null ? info : "N/A");
                        formIncidentAddress.setText(address != null ? address : "N/A");
                        String coords = (lat != null && lon != null) ? String.format("%.6f, %.6f", lat, lon) : "N/A";
                        formCoordinates.setText(coords);
                    }
                    return Unit.INSTANCE;
                },
                throwable -> Unit.INSTANCE
        );
    }

    private void loadExistingReportData() {
        // For Supabase, edit mode would load from unit_reports
        // Simplified for now
    }

    private void showConfirmationDialog() {
        if (editFireLocation.getText().toString().trim().isEmpty()) {
            editFireLocation.setError("Required");
            return;
        }

        new AlertDialog.Builder(this)
                .setTitle("Submit Report")
                .setMessage("Are you sure you want to submit this report?")
                .setPositiveButton("Yes, Submit", (dialog, which) -> submitBfpReport())
                .setNegativeButton("Cancel", null)
                .show();
    }

    private void submitBfpReport() {
        Map<String, Object> reportDetails = new HashMap<>();
        reportDetails.put("timestamp", new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(new Date()));
        reportDetails.put("fireLocation", editFireLocation.getText().toString().trim());
        reportDetails.put("areaOwnership", editAreaOwnership.getText().toString().trim());
        reportDetails.put("classOfFire", editClassOfFire.getText().toString().trim());
        reportDetails.put("rootCause", editRootCause.getText().toString().trim());
        reportDetails.put("peopleInjured", editPeopleInjured.getText().toString().trim());

        reportsRepository.createOrUpdateReportAsync(
                incidentKey,
                "BFP",
                "BFP Fire Report",
                reportDetails,
                unit -> {
                    markIncidentAsCompleted();
                    return Unit.INSTANCE;
                },
                throwable -> {
                    Toast.makeText(this, "Failed to submit report: " + throwable.getMessage(), Toast.LENGTH_SHORT).show();
                    return Unit.INSTANCE;
                }
        );
    }

    private void markIncidentAsCompleted() {
        draftManager.deleteDraft(incidentKey, AGENCY_TYPE);
        
        incidentsRepository.updateIncidentStatusAsync(
                incidentKey,
                "resolved",
                unit -> {
                    Toast.makeText(this, "Report Submitted!", Toast.LENGTH_LONG).show();
                    finish();
                    return Unit.INSTANCE;
                },
                throwable -> {
                    Toast.makeText(this, "Report saved but failed to update status.", Toast.LENGTH_SHORT).show();
                    finish();
                    return Unit.INSTANCE;
                }
        );
    }
    
    private void validateAndSubmit() {
        String fireLocation = editFireLocation.getText().toString().trim();
        String classOfFire = editClassOfFire.getText().toString().trim();
        
        if (fireLocation.isEmpty()) {
            editFireLocation.setError("Fire location is required");
            editFireLocation.requestFocus();
            Toast.makeText(this, "Please enter the fire location", Toast.LENGTH_SHORT).show();
            return;
        }
        
        if (classOfFire.isEmpty()) {
            editClassOfFire.setError("Class of fire is required");
            editClassOfFire.requestFocus();
            Toast.makeText(this, "Please specify the class of fire", Toast.LENGTH_SHORT).show();
            return;
        }
        
        showConfirmationDialog();
    }
    
    @Override
    protected void onPause() {
        super.onPause();
        saveDraft();
    }
    
    private void saveDraft() {
        if (incidentKey == null || draftManager == null || isReadOnlyMode) return;
        
        ReportDraftManager.ReportDraft draft = new ReportDraftManager.ReportDraft();
        draft.narrative = editFireLocation.getText().toString() + "|" +
                          editAreaOwnership.getText().toString() + "|" +
                          editClassOfFire.getText().toString() + "|" +
                          editRootCause.getText().toString() + "|" +
                          editPeopleInjured.getText().toString();
        
        draftManager.saveDraft(incidentKey, AGENCY_TYPE, draft);
        Log.d(TAG, "Draft saved for incident: " + incidentKey);
    }
    
    private void checkAndRestoreDraft() {
        if (draftManager != null && draftManager.hasDraft(incidentKey, AGENCY_TYPE)) {
            new AlertDialog.Builder(this)
                    .setTitle("Restore Draft")
                    .setMessage("You have a saved draft for this report. Would you like to restore it?")
                    .setPositiveButton("Restore", (dialog, which) -> restoreDraft())
                    .setNegativeButton("Discard", (dialog, which) -> draftManager.deleteDraft(incidentKey, AGENCY_TYPE))
                    .setCancelable(false)
                    .show();
        }
    }
    
    private void restoreDraft() {
        ReportDraftManager.ReportDraft draft = draftManager.loadDraft(incidentKey, AGENCY_TYPE);
        if (draft == null || draft.narrative == null) return;
        
        String[] parts = draft.narrative.split("\\|", -1);
        if (parts.length >= 1) editFireLocation.setText(parts[0]);
        if (parts.length >= 2) editAreaOwnership.setText(parts[1]);
        if (parts.length >= 3) editClassOfFire.setText(parts[2]);
        if (parts.length >= 4) editRootCause.setText(parts[3]);
        if (parts.length >= 5) editPeopleInjured.setText(parts[4]);
        
        Toast.makeText(this, "Draft restored", Toast.LENGTH_SHORT).show();
    }
    
    private void enableReadOnlyMode() {
        btnSubmit.setVisibility(android.view.View.GONE);
        editFireLocation.setEnabled(false);
        editAreaOwnership.setEnabled(false);
        editClassOfFire.setEnabled(false);
        editRootCause.setEnabled(false);
        editPeopleInjured.setEnabled(false);
        
        editFireLocation.setBackgroundColor(0xFFF5F5F5);
        editAreaOwnership.setBackgroundColor(0xFFF5F5F5);
        editClassOfFire.setBackgroundColor(0xFFF5F5F5);
        editRootCause.setBackgroundColor(0xFFF5F5F5);
        editPeopleInjured.setBackgroundColor(0xFFF5F5F5);
    }
    
    private void loadSubmittedReportData() {
        reportsRepository.loadReportByIncidentIdAsync(
                incidentKey,
                report -> {
                    if (report != null && report.getDetails() != null) {
                        String detailsJson = report.getDetails().toString();
                        editFireLocation.setText(extractJsonValue(detailsJson, "fireLocation"));
                        editAreaOwnership.setText(extractJsonValue(detailsJson, "areaOwnership"));
                        editClassOfFire.setText(extractJsonValue(detailsJson, "classOfFire"));
                        editRootCause.setText(extractJsonValue(detailsJson, "rootCause"));
                        editPeopleInjured.setText(extractJsonValue(detailsJson, "peopleInjured"));
                    }
                    return Unit.INSTANCE;
                },
                throwable -> {
                    Log.e(TAG, "Failed to load report: " + throwable.getMessage());
                    Toast.makeText(this, "Failed to load report data", Toast.LENGTH_SHORT).show();
                    return Unit.INSTANCE;
                }
        );
    }
    
    private String extractJsonValue(String json, String key) {
        try {
            org.json.JSONObject obj = new org.json.JSONObject(json);
            return obj.optString(key, "");
        } catch (Exception e) {
            return "";
        }
    }
}