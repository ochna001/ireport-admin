package com.example.iresponderapp;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.FileProvider;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.text.TextUtils;
import android.util.Log;
import android.view.LayoutInflater;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import com.example.iresponderapp.adapter.MediaPreviewAdapter;
import com.example.iresponderapp.util.ReportDraftManager;
import com.example.iresponderapp.supabase.SupabaseAuthRepository;
import com.example.iresponderapp.supabase.SupabaseIncidentsRepository;
import com.example.iresponderapp.supabase.SupabaseUnitReportsRepository;

import java.io.File;
import java.io.IOException;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import kotlin.Unit;

public class PnpReportFormActivity extends AppCompatActivity {

    private static final String TAG = "PnpReportForm";

    // Read-only UI elements
    private TextView formIncidentType, formIncidentDate, formReportedBy, formIncidentAddress, formIncidentDescription;

    // Containers and Buttons
    private LinearLayout containerSuspects;
    private LinearLayout containerVictims;
    private Button btnAddSuspect, btnAddVictim;

    private EditText editIncidentNarrative;
    private Button btnSubmit;
    
    // Evidence capture buttons
    private Button btnCapturePhoto, btnCaptureVideo;
    private TextView tvEvidenceCount;
    private RecyclerView recyclerMediaPreview;
    private MediaPreviewAdapter mediaPreviewAdapter;
    private int evidenceCount = 0;
    private List<Uri> capturedMediaUris = new ArrayList<>();
    private Uri photoUri;
    private ActivityResultLauncher<Uri> takePictureLauncher;
    private ActivityResultLauncher<Intent> takeVideoLauncher;

    // Supabase repositories
    private String incidentKey;
    private SupabaseIncidentsRepository incidentsRepository;
    private SupabaseUnitReportsRepository reportsRepository;
    private SupabaseAuthRepository authRepository;
    private String currentResponderUid;
    
    // Intent data
    private String incidentType;
    private String incidentReporter;
    private String incidentAddress;
    private String incidentDescription;
    private String incidentCreatedAt;
    
    // Draft manager
    private ReportDraftManager draftManager;
    private static final String AGENCY_TYPE = "PNP";
    
    // Read-only mode for viewing submitted reports
    private boolean isReadOnlyMode = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_pnp_report_form);

        // --- 1. Get Intent Data ---
        incidentKey = getIntent().getStringExtra("INCIDENT_KEY");
        if (incidentKey == null) {
            Toast.makeText(this, "Error: Incident Key Missing", Toast.LENGTH_SHORT).show();
            finish();
            return;
        }
        
        // Get passed incident data
        incidentType = getIntent().getStringExtra("INCIDENT_TYPE");
        incidentReporter = getIntent().getStringExtra("INCIDENT_REPORTER");
        incidentAddress = getIntent().getStringExtra("INCIDENT_ADDRESS");
        incidentDescription = getIntent().getStringExtra("INCIDENT_DESCRIPTION");
        incidentCreatedAt = getIntent().getStringExtra("INCIDENT_CREATED_AT");

        // --- 2. Supabase Init ---
        IreportApp app = (IreportApp) getApplication();
        incidentsRepository = (SupabaseIncidentsRepository) app.getIncidentsRepository();
        reportsRepository = (SupabaseUnitReportsRepository) app.getUnitReportsRepository();
        authRepository = (SupabaseAuthRepository) app.getAuthRepository();
        
        currentResponderUid = authRepository.getCurrentUserId();
        if (currentResponderUid == null) {
            currentResponderUid = "Unknown";
        }
        
        // Initialize draft manager
        draftManager = new ReportDraftManager(this);

        // --- 3. Initialize Camera Launchers ---
        initCameraLaunchers();

        // --- 4. Initialize UI ---
        initUiElements();

        // --- 5. Load Header Data from Intent ---
        loadIncidentHeaderData();

        // --- 6. Add default blank cards ---
        addPersonCard(containerSuspects, "Suspect");
        addPersonCard(containerVictims, "Victim");

        // --- 7. Setup Listeners ---
        btnAddSuspect.setOnClickListener(v -> addPersonCard(containerSuspects, "Suspect"));
        btnAddVictim.setOnClickListener(v -> addPersonCard(containerVictims, "Victim"));
        
        btnCapturePhoto.setOnClickListener(v -> capturePhoto());
        btnCaptureVideo.setOnClickListener(v -> captureVideo());

        btnSubmit.setOnClickListener(v -> validateAndSubmit());
        
        // --- 8. Check if this is a submitted report (read-only mode) ---
        isReadOnlyMode = getIntent().getBooleanExtra("IS_EDIT_MODE", false);
        if (isReadOnlyMode) {
            enableReadOnlyMode();
            loadSubmittedReportData();
        } else {
            // Check for existing draft only if not in read-only mode
            checkAndRestoreDraft();
        }
    }

    private void initUiElements() {
        formIncidentType = findViewById(R.id.formIncidentType);
        formIncidentDate = findViewById(R.id.formIncidentDate);
        formReportedBy = findViewById(R.id.formReportedBy);
        formIncidentAddress = findViewById(R.id.formIncidentAddress);
        formIncidentDescription = findViewById(R.id.formIncidentDescription);

        containerSuspects = findViewById(R.id.containerSuspects);
        containerVictims = findViewById(R.id.containerVictims);
        btnAddSuspect = findViewById(R.id.btnAddSuspect);
        btnAddVictim = findViewById(R.id.btnAddVictim);

        editIncidentNarrative = findViewById(R.id.editIncidentNarrative);
        btnSubmit = findViewById(R.id.btnSubmitPnpReport);
        
        btnCapturePhoto = findViewById(R.id.btnCapturePhoto);
        btnCaptureVideo = findViewById(R.id.btnCaptureVideo);
        tvEvidenceCount = findViewById(R.id.tvEvidenceCount);
        
        // Setup media preview RecyclerView
        recyclerMediaPreview = findViewById(R.id.recyclerMediaPreview);
        recyclerMediaPreview.setLayoutManager(new LinearLayoutManager(this, LinearLayoutManager.HORIZONTAL, false));
        mediaPreviewAdapter = new MediaPreviewAdapter(this, capturedMediaUris, (position, uri) -> {
            capturedMediaUris.remove(position);
            mediaPreviewAdapter.notifyItemRemoved(position);
            updateEvidenceCount();
        });
        recyclerMediaPreview.setAdapter(mediaPreviewAdapter);
    }
    
    private void initCameraLaunchers() {
        takePictureLauncher = registerForActivityResult(new ActivityResultContracts.TakePicture(), result -> {
            if (result) {
                evidenceCount++;
                capturedMediaUris.add(photoUri);
                updateEvidenceCount();
                Toast.makeText(this, "Photo captured!", Toast.LENGTH_SHORT).show();
            }
        });

        takeVideoLauncher = registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), result -> {
            if (result.getResultCode() == RESULT_OK && result.getData() != null) {
                Uri videoUri = result.getData().getData();
                if (videoUri != null) {
                    evidenceCount++;
                    capturedMediaUris.add(videoUri);
                    updateEvidenceCount();
                    Toast.makeText(this, "Video recorded!", Toast.LENGTH_SHORT).show();
                }
            }
        });
    }
    
    private void updateEvidenceCount() {
        int count = capturedMediaUris.size();
        if (count == 0) {
            tvEvidenceCount.setText("No evidence captured");
            recyclerMediaPreview.setVisibility(View.GONE);
        } else {
            tvEvidenceCount.setText(count + " evidence file(s) captured");
            recyclerMediaPreview.setVisibility(View.VISIBLE);
            mediaPreviewAdapter.notifyDataSetChanged();
        }
    }
    
    private void capturePhoto() {
        try {
            File photoFile = createMediaFile("IMG_", ".jpg", Environment.DIRECTORY_PICTURES);
            photoUri = FileProvider.getUriForFile(this, "com.example.iresponderapp.fileprovider", photoFile);
            takePictureLauncher.launch(photoUri);
        } catch (IOException ex) {
            Log.e(TAG, "Error creating image file", ex);
            Toast.makeText(this, "Error: Could not create image file", Toast.LENGTH_SHORT).show();
        }
    }

    private void captureVideo() {
        Intent takeVideoIntent = new Intent(MediaStore.ACTION_VIDEO_CAPTURE);
        takeVideoIntent.putExtra(MediaStore.EXTRA_DURATION_LIMIT, 60); // 60 seconds max
        if (takeVideoIntent.resolveActivity(getPackageManager()) != null) {
            takeVideoLauncher.launch(takeVideoIntent);
        } else {
            Toast.makeText(this, "No video app available", Toast.LENGTH_SHORT).show();
        }
    }

    private File createMediaFile(String prefix, String suffix, String directory) throws IOException {
        String timeStamp = new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(new Date());
        String fileName = prefix + timeStamp + "_";
        File storageDir = getExternalFilesDir(directory);
        return File.createTempFile(fileName, suffix, storageDir);
    }

    // --- Dynamic Card Logic (Adds a blank card) ---
    private void addPersonCard(LinearLayout container, String title) {
        View view = LayoutInflater.from(this).inflate(R.layout.item_pnp_person_entry, container, false);

        TextView header = view.findViewById(R.id.entryHeaderTitle);
        header.setText(title + " Data");

        // Setup Remove Button Logic
        View btnRemove = view.findViewById(R.id.btnRemoveEntry);
        btnRemove.setOnClickListener(v -> container.removeView(view));

        container.addView(view);
    }

    // --- Load Incident Header from Intent Data ---
    private void loadIncidentHeaderData() {
        // Format date/time
        String dateTime = "N/A";
        if (incidentCreatedAt != null && incidentCreatedAt.length() >= 16) {
            dateTime = incidentCreatedAt.substring(0, 10) + " " + incidentCreatedAt.substring(11, 16);
        }
        
        formIncidentType.setText("Incident Type: " + (incidentType != null ? incidentType : "PNP"));
        formIncidentDate.setText("Date & Time: " + dateTime);
        formReportedBy.setText("Reported by: " + (incidentReporter != null ? incidentReporter : "N/A"));
        formIncidentAddress.setText("Address: " + (incidentAddress != null ? incidentAddress : "N/A"));
        formIncidentDescription.setText("Description: " + (incidentDescription != null ? incidentDescription : "N/A"));
    }

    // --- Validation ---
    private void validateAndSubmit() {
        String narrative = editIncidentNarrative.getText().toString().trim();
        
        if (TextUtils.isEmpty(narrative)) {
            editIncidentNarrative.setError("Narrative is required");
            editIncidentNarrative.requestFocus();
            Toast.makeText(this, "Please provide a detailed narrative", Toast.LENGTH_SHORT).show();
            return;
        }
        
        if (narrative.length() < 20) {
            editIncidentNarrative.setError("Narrative is too short (minimum 20 characters)");
            editIncidentNarrative.requestFocus();
            Toast.makeText(this, "Please provide more details in the narrative", Toast.LENGTH_SHORT).show();
            return;
        }
        
        showConfirmationDialog();
    }
    
    // --- Submission Logic ---
    private void showConfirmationDialog() {
        new AlertDialog.Builder(this)
                .setTitle("Confirm Submission")
                .setMessage("Are you sure you want to submit this report? The incident status will be set to RESOLVED.")
                .setPositiveButton("Yes, Submit", (dialog, which) -> submitPnpReport())
                .setNegativeButton("Cancel", null)
                .show();
    }

    private void submitPnpReport() {
        Map<String, Object> reportDetails = new HashMap<>();
        reportDetails.put("narrative", editIncidentNarrative.getText().toString().trim());
        reportDetails.put("timestamp", new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(new Date()));
        reportDetails.put("evidence_count", String.valueOf(evidenceCount));

        // Collect Data from Dynamic Views
        List<Map<String, String>> suspects = collectPersonData(containerSuspects);
        List<Map<String, String>> victims = collectPersonData(containerVictims);
        reportDetails.put("suspects_count", String.valueOf(suspects.size()));
        reportDetails.put("victims_count", String.valueOf(victims.size()));

        // Flatten suspects/victims to string for JSON
        StringBuilder suspectsStr = new StringBuilder();
        for (Map<String, String> s : suspects) {
            suspectsStr.append(s.get("firstName")).append(" ").append(s.get("lastName")).append("; ");
        }
        reportDetails.put("suspects", suspectsStr.toString());

        StringBuilder victimsStr = new StringBuilder();
        for (Map<String, String> v : victims) {
            victimsStr.append(v.get("firstName")).append(" ").append(v.get("lastName")).append("; ");
        }
        reportDetails.put("victims", victimsStr.toString());

        // Save to Supabase
        reportsRepository.createOrUpdateReportAsync(
                incidentKey,
                "PNP",
                "PNP Crime Report",
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

    // Loops through the layout container and extracts data from each card
    private List<Map<String, String>> collectPersonData(LinearLayout container) {
        List<Map<String, String>> personList = new ArrayList<>();

        for (int i = 0; i < container.getChildCount(); i++) {
            View card = container.getChildAt(i);

            EditText fName = card.findViewById(R.id.editFirstName);
            EditText mName = card.findViewById(R.id.editMiddleName);
            EditText lName = card.findViewById(R.id.editLastName);
            EditText address = card.findViewById(R.id.editAddress);
            EditText occupation = card.findViewById(R.id.editOccupation);
            EditText status = card.findViewById(R.id.editStatus);

            Map<String, String> personData = new HashMap<>();
            personData.put("firstName", fName.getText().toString().trim());
            personData.put("middleName", mName.getText().toString().trim());
            personData.put("lastName", lName.getText().toString().trim());
            personData.put("address", address.getText().toString().trim());
            personData.put("occupation", occupation.getText().toString().trim());
            personData.put("status", status.getText().toString().trim());

            // Only add to the list if at least a name is provided
            if (!personData.get("firstName").isEmpty() || !personData.get("lastName").isEmpty()) {
                personList.add(personData);
            }
        }
        return personList;
    }

    private void markIncidentAsCompleted() {
        // Delete draft after successful submission
        draftManager.deleteDraft(incidentKey, AGENCY_TYPE);
        
        incidentsRepository.updateIncidentStatusAsync(
                incidentKey,
                "resolved",
                unit -> {
                    Toast.makeText(this, "Report Submitted & Incident Resolved!", Toast.LENGTH_LONG).show();
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
    
    // --- Draft Management ---
    @Override
    protected void onPause() {
        super.onPause();
        saveDraft();
    }
    
    private void saveDraft() {
        if (incidentKey == null || draftManager == null || isReadOnlyMode) return;
        
        ReportDraftManager.ReportDraft draft = new ReportDraftManager.ReportDraft();
        draft.narrative = editIncidentNarrative.getText().toString();
        draft.setMediaUris(capturedMediaUris);
        
        // Collect suspects
        draft.suspects = new ArrayList<>();
        for (int i = 0; i < containerSuspects.getChildCount(); i++) {
            View card = containerSuspects.getChildAt(i);
            ReportDraftManager.PersonData person = extractPersonFromCard(card);
            if (person != null) {
                draft.suspects.add(person);
            }
        }
        
        // Collect victims
        draft.victims = new ArrayList<>();
        for (int i = 0; i < containerVictims.getChildCount(); i++) {
            View card = containerVictims.getChildAt(i);
            ReportDraftManager.PersonData person = extractPersonFromCard(card);
            if (person != null) {
                draft.victims.add(person);
            }
        }
        
        draftManager.saveDraft(incidentKey, AGENCY_TYPE, draft);
        Log.d(TAG, "Draft saved for incident: " + incidentKey);
    }
    
    private ReportDraftManager.PersonData extractPersonFromCard(View card) {
        EditText fName = card.findViewById(R.id.editFirstName);
        EditText mName = card.findViewById(R.id.editMiddleName);
        EditText lName = card.findViewById(R.id.editLastName);
        EditText address = card.findViewById(R.id.editAddress);
        EditText occupation = card.findViewById(R.id.editOccupation);
        EditText status = card.findViewById(R.id.editStatus);
        
        return new ReportDraftManager.PersonData(
                fName.getText().toString().trim(),
                mName.getText().toString().trim(),
                lName.getText().toString().trim(),
                address.getText().toString().trim(),
                occupation.getText().toString().trim(),
                status.getText().toString().trim()
        );
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
        if (draft == null) return;
        
        if (draft.narrative != null) {
            editIncidentNarrative.setText(draft.narrative);
        }
        
        capturedMediaUris.clear();
        capturedMediaUris.addAll(draft.getMediaUris());
        updateEvidenceCount();
        
        containerSuspects.removeAllViews();
        if (draft.suspects != null && !draft.suspects.isEmpty()) {
            for (ReportDraftManager.PersonData person : draft.suspects) {
                addPersonCardWithData(containerSuspects, "Suspect", person);
            }
        } else {
            addPersonCard(containerSuspects, "Suspect");
        }
        
        containerVictims.removeAllViews();
        if (draft.victims != null && !draft.victims.isEmpty()) {
            for (ReportDraftManager.PersonData person : draft.victims) {
                addPersonCardWithData(containerVictims, "Victim", person);
            }
        } else {
            addPersonCard(containerVictims, "Victim");
        }
        Toast.makeText(this, "Draft restored", Toast.LENGTH_SHORT).show();
    }

    private void addPersonCardWithData(LinearLayout container, String title, ReportDraftManager.PersonData data) {
        View view = LayoutInflater.from(this).inflate(R.layout.item_pnp_person_entry, container, false);
        TextView header = view.findViewById(R.id.entryHeaderTitle);
        header.setText(title + " Data");
        ((EditText) view.findViewById(R.id.editFirstName)).setText(data.firstName);
        ((EditText) view.findViewById(R.id.editMiddleName)).setText(data.middleName);
        ((EditText) view.findViewById(R.id.editLastName)).setText(data.lastName);
        ((EditText) view.findViewById(R.id.editAddress)).setText(data.address);
        ((EditText) view.findViewById(R.id.editOccupation)).setText(data.occupation);
        ((EditText) view.findViewById(R.id.editStatus)).setText(data.status);
        View btnRemove = view.findViewById(R.id.btnRemoveEntry);
        btnRemove.setOnClickListener(v -> container.removeView(view));
        container.addView(view);
    }

    private void enableReadOnlyMode() {
        btnAddSuspect.setVisibility(View.GONE);
        btnAddVictim.setVisibility(View.GONE);
        btnCapturePhoto.setVisibility(View.GONE);
        btnCaptureVideo.setVisibility(View.GONE);
        btnSubmit.setVisibility(View.GONE);
        editIncidentNarrative.setEnabled(false);
        editIncidentNarrative.setFocusable(false);
        editIncidentNarrative.setBackgroundColor(0xFFF5F5F5);
    }

    private void loadSubmittedReportData() {
        reportsRepository.loadReportByIncidentIdAsync(
                incidentKey,
                report -> {
                    if (report != null && report.getDetails() != null) {
                        String detailsJson = report.getDetails().toString();
                        String narrative = extractJsonValue(detailsJson, "narrative");
                        if (narrative != null && !narrative.isEmpty()) {
                            editIncidentNarrative.setText(narrative);
                        }
                        containerSuspects.removeAllViews();
                        containerVictims.removeAllViews();
                        String suspects = extractJsonValue(detailsJson, "suspects");
                        addReadOnlyInfoCard(containerSuspects, "Suspects", suspects != null && !suspects.isEmpty() ? suspects : "No suspects recorded");
                        String victims = extractJsonValue(detailsJson, "victims");
                        addReadOnlyInfoCard(containerVictims, "Victims", victims != null && !victims.isEmpty() ? victims : "No victims recorded");
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

    private void addReadOnlyInfoCard(LinearLayout container, String title, String content) {
        View view = LayoutInflater.from(this).inflate(R.layout.item_pnp_person_entry, container, false);
        TextView header = view.findViewById(R.id.entryHeaderTitle);
        header.setText(title);
        View btnRemove = view.findViewById(R.id.btnRemoveEntry);
        btnRemove.setVisibility(View.GONE);
        EditText firstName = view.findViewById(R.id.editFirstName);
        firstName.setText(content);
        firstName.setEnabled(false);
        firstName.setFocusable(false);
        view.findViewById(R.id.editMiddleName).setVisibility(View.GONE);
        view.findViewById(R.id.editLastName).setVisibility(View.GONE);
        view.findViewById(R.id.editAddress).setVisibility(View.GONE);
        view.findViewById(R.id.editOccupation).setVisibility(View.GONE);
        view.findViewById(R.id.editStatus).setVisibility(View.GONE);
        container.addView(view);
    }
}