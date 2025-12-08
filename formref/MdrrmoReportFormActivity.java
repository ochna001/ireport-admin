package com.example.iresponderapp;

import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;

import android.app.TimePickerDialog;
import android.content.DialogInterface;
import android.os.Bundle;
import android.view.LayoutInflater;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;

import com.example.iresponderapp.supabase.SupabaseAuthRepository;
import com.example.iresponderapp.supabase.SupabaseIncidentsRepository;
import com.example.iresponderapp.supabase.SupabaseUnitReportsRepository;
import com.example.iresponderapp.util.ReportDraftManager;

import kotlin.Unit;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

public class MdrrmoReportFormActivity extends AppCompatActivity {

    private static final String TAG = "MdrrmoReportForm";
    private static final String AGENCY_TYPE = "MDRRMO";

    private LinearLayout containerPatients;
    private Button btnAddPatient, btnSubmit;
    private Spinner spinnerNatureOfCall, spinnerEmergencyType, spinnerAreaType, spinnerFacilityType;
    private EditText editIncidentLocation, editFacilityName, editNarrative;

    // Time Fields
    private EditText timeCall, timeDispatch, timeScene, timeDeparture, timeFacility, timeHandover, timeClear, timeBase;

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
        setContentView(R.layout.activity_mdrrmo_report_form);

        incidentKey = getIntent().getStringExtra("INCIDENT_KEY");
        if (incidentKey == null) { finish(); return; }

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

        // Pre-fill incident location from intent
        if (incidentAddress != null && !incidentAddress.isEmpty()) {
            editIncidentLocation.setText(incidentAddress);
        }

        boolean isEditMode = getIntent().getBooleanExtra("IS_EDIT_MODE", false);
        if (isEditMode) {
            isReadOnlyMode = true;
            enableReadOnlyMode();
            loadSubmittedReportData();
        } else {
            addPatientCard(); // Add 1 blank patient card by default
            checkAndRestoreDraft();
        }

        btnAddPatient.setOnClickListener(v -> addPatientCard());
        btnSubmit.setOnClickListener(v -> validateAndSubmit());
    }

    private void initUiElements() {
        containerPatients = findViewById(R.id.containerPatients);
        btnAddPatient = findViewById(R.id.btnAddPatient);
        btnSubmit = findViewById(R.id.btnSubmitMdrrmoReport);

        spinnerNatureOfCall = findViewById(R.id.spinnerNatureOfCall);
        spinnerEmergencyType = findViewById(R.id.spinnerEmergencyType);
        spinnerAreaType = findViewById(R.id.spinnerAreaType);
        editIncidentLocation = findViewById(R.id.editIncidentLocation);
        editNarrative = findViewById(R.id.editNarrative);

        timeCall = findViewById(R.id.timeCall);
        timeDispatch = findViewById(R.id.timeDispatch);
        timeScene = findViewById(R.id.timeScene);
        timeDeparture = findViewById(R.id.timeDeparture);
        timeFacility = findViewById(R.id.timeFacility);
        timeHandover = findViewById(R.id.timeHandover);
        timeClear = findViewById(R.id.timeClear);
        timeBase = findViewById(R.id.timeBase);

        setupTimePicker(timeCall);
        setupTimePicker(timeDispatch);
        setupTimePicker(timeScene);
        setupTimePicker(timeDeparture);
        setupTimePicker(timeFacility);
        setupTimePicker(timeHandover);
        setupTimePicker(timeClear);
        setupTimePicker(timeBase);

        spinnerFacilityType = findViewById(R.id.spinnerFacilityType);
        editFacilityName = findViewById(R.id.editFacilityName);
    }

    private void setupTimePicker(EditText editText) {
        editText.setOnClickListener(v -> {
            Calendar mcurrentTime = Calendar.getInstance();
            int hour = mcurrentTime.get(Calendar.HOUR_OF_DAY);
            int minute = mcurrentTime.get(Calendar.MINUTE);
            TimePickerDialog mTimePicker;
            mTimePicker = new TimePickerDialog(this, (timePicker, selectedHour, selectedMinute) -> {
                String time = String.format(Locale.US, "%02d:%02d", selectedHour, selectedMinute);
                editText.setText(time);
            }, hour, minute, true);
            mTimePicker.setTitle("Select Time");
            mTimePicker.show();
        });
    }

    private void addPatientCard() {
        View view = LayoutInflater.from(this).inflate(R.layout.item_mdrrmo_patient_entry, containerPatients, false);

        TextView title = view.findViewById(R.id.patientHeaderTitle);
        title.setText("Patient " + (containerPatients.getChildCount() + 1));

        setVitalRowLabel(view, R.id.rowBP, "BP");
        setVitalRowLabel(view, R.id.rowPulseRate, "Pulse");
        setVitalRowLabel(view, R.id.rowRespRate, "Resp");
        setVitalRowLabel(view, R.id.rowTemp, "Temp");
        setVitalRowLabel(view, R.id.rowSaO2, "SaO2");
        setVitalRowLabel(view, R.id.rowCapRefillVital, "Cap Refill");
        setVitalRowLabel(view, R.id.rowPain, "Pain");
        setVitalRowLabel(view, R.id.rowGlucose, "Glucose");
        setVitalRowLabel(view, R.id.rowObsTime, "Obs Time");

        // --- Multi-Select: Body Parts ---
        setupMultiSelect(view.findViewById(R.id.editBodyParts), R.array.body_parts_options, "Select Affected Body Parts");

        // --- Multi-Select: Injury Type ---
        setupMultiSelect(view.findViewById(R.id.editInjuryType), R.array.injury_type_options, "Select Injury Types");

        view.findViewById(R.id.btnRemoveEntry).setOnClickListener(v -> containerPatients.removeView(view));

        containerPatients.addView(view);
    }

    // Helper to setup multi-select dialogs
    private void setupMultiSelect(EditText editText, int arrayResId, String title) {
        String[] itemsArray = getResources().getStringArray(arrayResId);
        boolean[] checkedItems = new boolean[itemsArray.length];
        ArrayList<Integer> userItems = new ArrayList<>();

        editText.setOnClickListener(v -> {
            // Re-calc checked state based on current text
            String currentText = editText.getText().toString();
            userItems.clear();
            for(int i=0; i<itemsArray.length; i++) {
                if(currentText.contains(itemsArray[i])) {
                    checkedItems[i] = true;
                    userItems.add(i);
                } else {
                    checkedItems[i] = false;
                }
            }

            AlertDialog.Builder mBuilder = new AlertDialog.Builder(MdrrmoReportFormActivity.this);
            mBuilder.setTitle(title);
            mBuilder.setMultiChoiceItems(itemsArray, checkedItems, (dialogInterface, position, isChecked) -> {
                if (isChecked) userItems.add(position); else userItems.remove((Integer.valueOf(position)));
            });
            mBuilder.setPositiveButton("OK", (dialogInterface, which) -> {
                String item = "";
                for (int i = 0; i < userItems.size(); i++) {
                    item += itemsArray[userItems.get(i)];
                    if (i != userItems.size() - 1) item += ", ";
                }
                editText.setText(item);
            });
            mBuilder.setNegativeButton("Dismiss", (dialog, i) -> dialog.dismiss());
            mBuilder.setNeutralButton("Clear All", (dialog, which) -> {
                for (int i = 0; i < checkedItems.length; i++) checkedItems[i] = false;
                userItems.clear();
                editText.setText("");
            });
            mBuilder.create().show();
        });
    }

    private void setVitalRowLabel(View parent, int rowId, String label) {
        View row = parent.findViewById(rowId);
        ((TextView) row.findViewById(R.id.lblParameter)).setText(label);
    }

    private void loadIncidentBasicInfo() {
        incidentsRepository.loadIncidentByIdAsync(
                incidentKey,
                incident -> {
                    if (incident != null && editIncidentLocation.getText().toString().isEmpty()) {
                        String address = incident.getLocationAddress();
                        if (address != null) {
                            editIncidentLocation.setText(address);
                        }
                    }
                    return Unit.INSTANCE;
                },
                throwable -> Unit.INSTANCE
        );
    }

    private void loadExistingReportData() {
        // For Supabase, edit mode would load from unit_reports
        // Simplified for now - just load incident info
        loadIncidentBasicInfo();
    }

    private void showConfirmationDialog() {
        new AlertDialog.Builder(this)
                .setTitle("Submit Report")
                .setMessage("Are you sure you want to submit this report?")
                .setPositiveButton("Yes, Submit", (dialog, which) -> submitReport())
                .setNegativeButton("Cancel", null)
                .show();
    }

    private void submitReport() {
        Map<String, Object> reportDetails = new HashMap<>();

        reportDetails.put("timestamp", new SimpleDateFormat("yyyy-MM-dd HH:mm", Locale.US).format(new Date()));
        reportDetails.put("natureOfCall", getSpinnerValue(spinnerNatureOfCall));
        reportDetails.put("emergencyType", getSpinnerValue(spinnerEmergencyType));
        reportDetails.put("areaType", getSpinnerValue(spinnerAreaType));
        reportDetails.put("incidentLocation", editIncidentLocation.getText().toString());
        reportDetails.put("narrative", editNarrative.getText().toString());
        reportDetails.put("facilityType", getSpinnerValue(spinnerFacilityType));
        reportDetails.put("facilityName", editFacilityName.getText().toString());

        reportDetails.put("time_call", timeCall.getText().toString());
        reportDetails.put("time_dispatch", timeDispatch.getText().toString());
        reportDetails.put("time_scene", timeScene.getText().toString());
        reportDetails.put("time_depart", timeDeparture.getText().toString());
        reportDetails.put("time_facility", timeFacility.getText().toString());
        reportDetails.put("time_handover", timeHandover.getText().toString());
        reportDetails.put("time_clear", timeClear.getText().toString());
        reportDetails.put("time_base", timeBase.getText().toString());

        // Collect patient count
        int patientCount = containerPatients.getChildCount();
        reportDetails.put("patients_count", String.valueOf(patientCount));

        reportsRepository.createOrUpdateReportAsync(
                incidentKey,
                "MDRRMO",
                "MDRRMO Emergency Report",
                reportDetails,
                unit -> {
                    markIncidentAsCompleted();
                    return Unit.INSTANCE;
                },
                throwable -> {
                    Toast.makeText(this, "Failed to save: " + throwable.getMessage(), Toast.LENGTH_SHORT).show();
                    return Unit.INSTANCE;
                }
        );
    }

    private Map<String, Object> scrapePatientData(View view) {
        Map<String, Object> p = new HashMap<>();

        p.put("name", getText(view, R.id.editPatientName));
        p.put("age", getText(view, R.id.editPatientAge));
        p.put("sex", getText(view, R.id.editPatientSex));
        p.put("address", getText(view, R.id.editPatientAddress));
        p.put("nextOfKin", getText(view, R.id.editNextOfKin));

        p.put("chiefComplaint", getText(view, R.id.editChiefComplaint));
        p.put("c_spine", getSpinnerValue(view, R.id.spinnerCSpine));
        p.put("airway", getSpinnerValue(view, R.id.spinnerAirway));
        p.put("breathing", getSpinnerValue(view, R.id.spinnerBreathing));
        p.put("pulse", getSpinnerValue(view, R.id.spinnerPulse));
        p.put("skin", getSpinnerValue(view, R.id.spinnerSkin));
        p.put("loc", getSpinnerValue(view, R.id.spinnerLOC));
        p.put("consciousness", getSpinnerValue(view, R.id.spinnerConsciousness));
        p.put("cap_refill", getSpinnerValue(view, R.id.spinnerCapRefill));

        p.put("signs", getText(view, R.id.editSigns));
        p.put("allergies", getText(view, R.id.editAllergies));
        p.put("meds", getText(view, R.id.editMeds));
        p.put("history", getText(view, R.id.editHistory));
        p.put("oral", getText(view, R.id.editOral));
        p.put("events", getText(view, R.id.editEvents));

        p.put("obs_time", scrapeVitalRow(view, R.id.rowObsTime));
        p.put("bp", scrapeVitalRow(view, R.id.rowBP));
        p.put("pulse_rate", scrapeVitalRow(view, R.id.rowPulseRate));
        p.put("resp_rate", scrapeVitalRow(view, R.id.rowRespRate));
        p.put("temp", scrapeVitalRow(view, R.id.rowTemp));
        p.put("spo2", scrapeVitalRow(view, R.id.rowSaO2));
        p.put("cap_vital", scrapeVitalRow(view, R.id.rowCapRefillVital));
        p.put("pain", scrapeVitalRow(view, R.id.rowPain));
        p.put("glucose", scrapeVitalRow(view, R.id.rowGlucose));

        p.put("gcs_eye", getText(view, R.id.editGcsEye));
        p.put("gcs_verbal", getText(view, R.id.editGcsVerbal));
        p.put("gcs_motor", getText(view, R.id.editGcsMotor));
        p.put("gcs_total", getText(view, R.id.editGcsTotal));

        p.put("manage_airway", getSpinnerValue(view, R.id.spinnerManageAirway));
        p.put("manage_circ", getSpinnerValue(view, R.id.spinnerManageCirc));
        p.put("manage_wound", getSpinnerValue(view, R.id.spinnerManageWound));
        p.put("manage_immob", getSpinnerValue(view, R.id.spinnerManageImmob));
        p.put("manage_other", getSpinnerValue(view, R.id.spinnerManageOther));

        // Multi-select Fields
        p.put("injury_type", getText(view, R.id.editInjuryType));
        p.put("affected_body_parts", getText(view, R.id.editBodyParts));
        p.put("patient_narrative", getText(view, R.id.editPatientNarrative));

        return p;
    }

    private String getText(View parent, int id) {
        EditText et = parent.findViewById(id);
        return et != null ? et.getText().toString() : "";
    }

    private void setText(View parent, int id, String val) {
        EditText et = parent.findViewById(id);
        if (et != null && val != null) et.setText(val);
    }

    private Map<String, String> scrapeVitalRow(View parent, int rowId) {
        View row = parent.findViewById(rowId);
        Map<String, String> v = new HashMap<>();
        v.put("t1", ((EditText) row.findViewById(R.id.inputTime1)).getText().toString());
        v.put("t2", ((EditText) row.findViewById(R.id.inputTime2)).getText().toString());
        v.put("t3", ((EditText) row.findViewById(R.id.inputTime3)).getText().toString());
        return v;
    }

    private String getSpinnerValue(Object viewOrSpinner) {
        Spinner s;
        if (viewOrSpinner instanceof View) {
            // Should not happen with current logic, but safe fallback
            return "";
        } else {
            s = (Spinner) viewOrSpinner;
        }
        if (s != null && s.getSelectedItem() != null) return s.getSelectedItem().toString();
        return "";
    }

    private String getSpinnerValue(View parent, int id) {
        Spinner s = parent.findViewById(id);
        if (s != null && s.getSelectedItem() != null) return s.getSelectedItem().toString();
        return "";
    }

    private void markIncidentAsCompleted() {
        draftManager.deleteDraft(incidentKey, AGENCY_TYPE);
        
        incidentsRepository.updateIncidentStatusAsync(
                incidentKey,
                "resolved",
                unit -> {
                    Toast.makeText(this, "Report Submitted!", Toast.LENGTH_SHORT).show();
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
    
    // --- Validation ---
    private void validateAndSubmit() {
        String location = editIncidentLocation.getText().toString().trim();
        
        if (location.isEmpty()) {
            editIncidentLocation.setError("Incident location is required");
            editIncidentLocation.requestFocus();
            Toast.makeText(this, "Please enter the incident location", Toast.LENGTH_SHORT).show();
            return;
        }
        
        if (containerPatients.getChildCount() == 0) {
            Toast.makeText(this, "Please add at least one patient", Toast.LENGTH_SHORT).show();
            return;
        }
        
        showConfirmationDialog();
    }
    
    // --- Draft Management ---
    @Override
    protected void onPause() {
        super.onPause();
        saveDraft();
    }
    
    private void saveDraft() {
        if (incidentKey == null || draftManager == null || isReadOnlyMode) return;
        
        ReportDraftManager.ReportDraft draft = new ReportDraftManager.ReportDraft();
        // Store key fields in narrative using delimiter
        draft.narrative = editIncidentLocation.getText().toString() + "|" +
                          editNarrative.getText().toString() + "|" +
                          editFacilityName.getText().toString() + "|" +
                          timeCall.getText().toString() + "|" +
                          timeDispatch.getText().toString() + "|" +
                          timeScene.getText().toString();
        
        draftManager.saveDraft(incidentKey, AGENCY_TYPE, draft);
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
        if (parts.length >= 1) editIncidentLocation.setText(parts[0]);
        if (parts.length >= 2) editNarrative.setText(parts[1]);
        if (parts.length >= 3) editFacilityName.setText(parts[2]);
        if (parts.length >= 4) timeCall.setText(parts[3]);
        if (parts.length >= 5) timeDispatch.setText(parts[4]);
        if (parts.length >= 6) timeScene.setText(parts[5]);
        
        Toast.makeText(this, "Draft restored", Toast.LENGTH_SHORT).show();
    }
    
    // --- Read-Only Mode ---
    private void enableReadOnlyMode() {
        btnSubmit.setVisibility(View.GONE);
        btnAddPatient.setVisibility(View.GONE);
        
        editIncidentLocation.setEnabled(false);
        editNarrative.setEnabled(false);
        editFacilityName.setEnabled(false);
        
        timeCall.setEnabled(false);
        timeDispatch.setEnabled(false);
        timeScene.setEnabled(false);
        timeDeparture.setEnabled(false);
        timeFacility.setEnabled(false);
        timeHandover.setEnabled(false);
        timeClear.setEnabled(false);
        timeBase.setEnabled(false);
        
        spinnerNatureOfCall.setEnabled(false);
        spinnerEmergencyType.setEnabled(false);
        spinnerAreaType.setEnabled(false);
        spinnerFacilityType.setEnabled(false);
    }
    
    private void loadSubmittedReportData() {
        reportsRepository.loadReportByIncidentIdAsync(
                incidentKey,
                report -> {
                    if (report != null && report.getDetails() != null) {
                        String detailsJson = report.getDetails().toString();
                        editIncidentLocation.setText(extractJsonValue(detailsJson, "incidentLocation"));
                        editNarrative.setText(extractJsonValue(detailsJson, "narrative"));
                        editFacilityName.setText(extractJsonValue(detailsJson, "facilityName"));
                        timeCall.setText(extractJsonValue(detailsJson, "time_call"));
                        timeDispatch.setText(extractJsonValue(detailsJson, "time_dispatch"));
                        timeScene.setText(extractJsonValue(detailsJson, "time_scene"));
                        timeDeparture.setText(extractJsonValue(detailsJson, "time_depart"));
                        timeFacility.setText(extractJsonValue(detailsJson, "time_facility"));
                        timeHandover.setText(extractJsonValue(detailsJson, "time_handover"));
                        timeClear.setText(extractJsonValue(detailsJson, "time_clear"));
                        timeBase.setText(extractJsonValue(detailsJson, "time_base"));
                        
                        String patientCount = extractJsonValue(detailsJson, "patients_count");
                        if (!patientCount.isEmpty()) {
                            // Add read-only patient info card
                            containerPatients.removeAllViews();
                            TextView tv = new TextView(MdrrmoReportFormActivity.this);
                            tv.setText(patientCount + " patient(s) recorded");
                            tv.setPadding(16, 16, 16, 16);
                            containerPatients.addView(tv);
                        }
                    }
                    return Unit.INSTANCE;
                },
                throwable -> {
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