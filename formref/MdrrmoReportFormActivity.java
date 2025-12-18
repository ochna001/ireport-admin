package com.example.iresponderapp;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.appcompat.app.AlertDialog;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.FileProvider;
import androidx.recyclerview.widget.LinearLayoutManager;
import androidx.recyclerview.widget.RecyclerView;

import android.app.TimePickerDialog;
import android.content.DialogInterface;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.Spinner;
import android.widget.TextView;
import android.widget.Toast;

import com.example.iresponderapp.adapter.MediaPreviewAdapter;
import com.example.iresponderapp.supabase.FinalReportDraft;
import com.example.iresponderapp.supabase.SupabaseAuthRepository;
import com.example.iresponderapp.supabase.SupabaseFinalReportDraftsRepository;
import com.example.iresponderapp.supabase.SupabaseIncidentsRepository;
import com.example.iresponderapp.supabase.SupabaseStorageRepository;
import com.example.iresponderapp.supabase.SupabaseUnitReportsRepository;
import com.example.iresponderapp.util.ReportDraftManager;

import android.util.Log;
import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;

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
    private static final String AGENCY_TYPE = "pdrrmo";

    private LinearLayout containerPatients;
    private Button btnAddPatient, btnSubmit, btnCapturePhoto, btnCaptureVideo;
    private Spinner spinnerNatureOfCall, spinnerEmergencyType, spinnerAreaType, spinnerFacilityType;
    private EditText editIncidentLocation, editFacilityName, editNarrative;
    private TextView tvMediaCount;
    private RecyclerView recyclerMediaPreview;
    private MediaPreviewAdapter mediaPreviewAdapter;
    
    private List<Uri> capturedMediaUris = new ArrayList<>();
    private List<String> uploadedMediaUrls = new ArrayList<>();
    private Uri photoUri;
    private ActivityResultLauncher<Uri> takePictureLauncher;
    private ActivityResultLauncher<Intent> takeVideoLauncher;

    // Time Fields
    private EditText timeCall, timeDispatch, timeScene, timeDeparture, timeFacility, timeHandover, timeClear, timeBase;

    private String incidentKey;
    private SupabaseIncidentsRepository incidentsRepository;
    private SupabaseUnitReportsRepository reportsRepository;
    private SupabaseAuthRepository authRepository;
    private SupabaseFinalReportDraftsRepository draftsRepository;
    private SupabaseStorageRepository storageRepository;
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
        draftsRepository = app.getFinalReportDraftsRepository();
        storageRepository = app.getStorageRepository();

        currentResponderUid = authRepository.getCurrentUserId();
        if (currentResponderUid == null) {
            currentResponderUid = "Unknown";
        }

        draftManager = new ReportDraftManager(this);

        initUiElements();
        initCameraLaunchers();
        initMediaPreview();

        // Pre-fill incident location from intent
        if (incidentAddress != null && !incidentAddress.isEmpty()) {
            editIncidentLocation.setText(incidentAddress);
        } else {
            // Try to load from incident details if not passed via intent
            loadIncidentBasicInfo();
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
        
        btnCapturePhoto = findViewById(R.id.btnCapturePhoto);
        btnCaptureVideo = findViewById(R.id.btnCaptureVideo);
        tvMediaCount = findViewById(R.id.tvMediaCount);
        recyclerMediaPreview = findViewById(R.id.recyclerMediaPreview);
        
        btnCapturePhoto.setOnClickListener(v -> capturePhoto());
        btnCaptureVideo.setOnClickListener(v -> captureVideo());
    }

    private void initCameraLaunchers() {
        takePictureLauncher = registerForActivityResult(new ActivityResultContracts.TakePicture(), result -> {
            if (result) {
                capturedMediaUris.add(photoUri);
                updateMediaCount();
                Toast.makeText(this, "Photo captured!", Toast.LENGTH_SHORT).show();
                uploadMediaToDraft(photoUri, capturedMediaUris.size() - 1);
            }
        });

        takeVideoLauncher = registerForActivityResult(new ActivityResultContracts.StartActivityForResult(), result -> {
            if (result.getResultCode() == RESULT_OK && result.getData() != null) {
                Uri videoUri = result.getData().getData();
                if (videoUri != null) {
                    capturedMediaUris.add(videoUri);
                    updateMediaCount();
                    Toast.makeText(this, "Video recorded!", Toast.LENGTH_SHORT).show();
                    uploadMediaToDraft(videoUri, capturedMediaUris.size() - 1);
                }
            }
        });
    }
    
    private void initMediaPreview() {
        recyclerMediaPreview.setLayoutManager(new LinearLayoutManager(this, LinearLayoutManager.HORIZONTAL, false));
        mediaPreviewAdapter = new MediaPreviewAdapter(this, capturedMediaUris, (position, uri) -> {
            capturedMediaUris.remove(position);
            mediaPreviewAdapter.notifyItemRemoved(position);
            updateMediaCount();
        });
        recyclerMediaPreview.setAdapter(mediaPreviewAdapter);
    }
    
    private void updateMediaCount() {
        int count = capturedMediaUris.size();
        if (count == 0) {
            tvMediaCount.setText("No documentation attached");
            recyclerMediaPreview.setVisibility(View.GONE);
        } else {
            tvMediaCount.setText(count + " documentation file(s)");
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
        takeVideoIntent.putExtra(MediaStore.EXTRA_DURATION_LIMIT, 60);
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
        btnSubmit.setEnabled(false);
        btnSubmit.setText("Uploading...");
        
        if (!capturedMediaUris.isEmpty()) {
            uploadMediaFilesAndSubmit();
        } else {
            submitReportWithMedia(new ArrayList<>());
        }
    }
    
    private void uploadMediaFilesAndSubmit() {
        uploadedMediaUrls.clear();
        uploadNextMedia(0);
    }
    
    private void uploadNextMedia(int index) {
        if (index >= capturedMediaUris.size()) {
            submitReportWithMedia(uploadedMediaUrls);
            return;
        }
        
        Uri mediaUri = capturedMediaUris.get(index);
        
        // Check if this is already a remote URL (from restored draft)
        String uriString = mediaUri.toString();
        if (uriString.startsWith("http://") || uriString.startsWith("https://")) {
            // Already uploaded, just add to list and continue
            uploadedMediaUrls.add(uriString);
            Log.d(TAG, "Media already uploaded (from draft): " + uriString);
            uploadNextMedia(index + 1);
            return;
        }
        
        try {
            byte[] fileBytes = readBytesFromUri(mediaUri);
            String fileName = generateMediaFileName(index, mediaUri);
            String contentType = getContentResolver().getType(mediaUri);
            if (contentType == null) {
                contentType = fileName.endsWith(".mp4") ? "video/mp4" : "image/jpeg";
            }
            
            storageRepository.uploadFileAsync(fileBytes, fileName, contentType,
                url -> {
                    uploadedMediaUrls.add(url);
                    Log.d(TAG, "Uploaded media " + (index + 1) + "/" + capturedMediaUris.size());
                    tvMediaCount.setText("Uploading " + (index + 2) + "/" + capturedMediaUris.size() + "...");
                    uploadNextMedia(index + 1);
                    return Unit.INSTANCE;
                },
                error -> {
                    Log.e(TAG, "Failed to upload media: " + error.getMessage());
                    Toast.makeText(this, "Failed to upload media: " + error.getMessage(), Toast.LENGTH_SHORT).show();
                    btnSubmit.setEnabled(true);
                    btnSubmit.setText("Submit Report");
                    return Unit.INSTANCE;
                }
            );
        } catch (IOException e) {
            Log.e(TAG, "Error reading media file: " + e.getMessage());
            Toast.makeText(this, "Error reading media file", Toast.LENGTH_SHORT).show();
            btnSubmit.setEnabled(true);
            btnSubmit.setText("Submit Report");
        }
    }
    
    private byte[] readBytesFromUri(Uri uri) throws IOException {
        InputStream inputStream = getContentResolver().openInputStream(uri);
        if (inputStream == null) throw new IOException("Cannot open input stream");
        
        ByteArrayOutputStream buffer = new ByteArrayOutputStream();
        byte[] data = new byte[4096];
        int bytesRead;
        while ((bytesRead = inputStream.read(data, 0, data.length)) != -1) {
            buffer.write(data, 0, bytesRead);
        }
        inputStream.close();
        return buffer.toByteArray();
    }
    
    private String generateMediaFileName(int index, Uri uri) {
        String timestamp = new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(new Date());
        String contentType = getContentResolver().getType(uri);
        String extension = ".jpg";
        if (contentType != null) {
            if (contentType.contains("video")) extension = ".mp4";
            else if (contentType.contains("png")) extension = ".png";
            else if (contentType.contains("webp")) extension = ".webp";
        }
        return "mdrrmo/" + incidentKey + "/" + timestamp + "_" + index + extension;
    }
    
    private void uploadMediaToDraft(Uri mediaUri, int index) {
        try {
            byte[] fileBytes = readBytesFromUri(mediaUri);
            String fileName = "drafts/" + generateMediaFileName(index, mediaUri);
            String contentType = getContentResolver().getType(mediaUri);
            if (contentType == null) {
                contentType = fileName.endsWith(".mp4") ? "video/mp4" : "image/jpeg";
            }
            
            storageRepository.uploadFileAsync(fileBytes, fileName, contentType,
                url -> {
                    int uriIndex = capturedMediaUris.indexOf(mediaUri);
                    if (uriIndex != -1) {
                        capturedMediaUris.set(uriIndex, Uri.parse(url));
                        Log.d(TAG, "Draft media uploaded: " + url);
                    }
                    saveDraftToServer();
                    return Unit.INSTANCE;
                },
                error -> {
                    Log.e(TAG, "Failed to upload draft media: " + error.getMessage());
                    Toast.makeText(this, "Warning: Failed to backup documentation", Toast.LENGTH_SHORT).show();
                    return Unit.INSTANCE;
                }
            );
        } catch (IOException e) {
            Log.e(TAG, "Error reading media file for draft: " + e.getMessage());
        }
    }
    
    private void submitReportWithMedia(List<String> mediaUrls) {
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

        // Collect all patient data
        int patientCount = containerPatients.getChildCount();
        reportDetails.put("patients_count", String.valueOf(patientCount));
        
        JSONArray patientsArray = new JSONArray();
        for (int i = 0; i < patientCount; i++) {
            View patientView = containerPatients.getChildAt(i);
            Map<String, Object> patientData = scrapePatientData(patientView);
            patientsArray.put(new JSONObject(patientData));
        }
        reportDetails.put("patients", patientsArray.toString());
        
        reportDetails.put("media_count", String.valueOf(mediaUrls.size()));
        reportDetails.put("media_urls", new JSONArray(mediaUrls).toString());

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
                    btnSubmit.setEnabled(true);
                    btnSubmit.setText("Submit Report");
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
        draftsRepository.deleteDraftAsync(incidentKey, u -> Unit.INSTANCE, e -> Unit.INSTANCE);
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
        // Validate incident location
        String location = editIncidentLocation.getText().toString().trim();
        if (location.isEmpty()) {
            editIncidentLocation.setError("Incident location is required");
            editIncidentLocation.requestFocus();
            Toast.makeText(this, "Please enter the incident location", Toast.LENGTH_SHORT).show();
            return;
        }
        
        // Validate narrative
        String narrative = editNarrative.getText().toString().trim();
        if (narrative.isEmpty()) {
            editNarrative.setError("Narrative is required");
            editNarrative.requestFocus();
            Toast.makeText(this, "Please provide a detailed narrative of the incident", Toast.LENGTH_SHORT).show();
            return;
        }
        
        if (narrative.length() < 20) {
            editNarrative.setError("Narrative is too short (minimum 20 characters)");
            editNarrative.requestFocus();
            Toast.makeText(this, "Please provide more details in the narrative", Toast.LENGTH_SHORT).show();
            return;
        }
        
        // Validate nature of call (skip position 0 which is the prompt)
        if (spinnerNatureOfCall.getSelectedItemPosition() <= 0) {
            Toast.makeText(this, "Please select the nature of call", Toast.LENGTH_SHORT).show();
            spinnerNatureOfCall.requestFocus();
            return;
        }
        
        // Validate emergency type (skip position 0 which is the prompt)
        if (spinnerEmergencyType.getSelectedItemPosition() <= 0) {
            Toast.makeText(this, "Please select the type of emergency", Toast.LENGTH_SHORT).show();
            spinnerEmergencyType.requestFocus();
            return;
        }
        
        // Validate area type (skip position 0 which is the prompt)
        if (spinnerAreaType.getSelectedItemPosition() <= 0) {
            Toast.makeText(this, "Please select the area type", Toast.LENGTH_SHORT).show();
            spinnerAreaType.requestFocus();
            return;
        }
        
        // Validate at least one patient
        if (containerPatients.getChildCount() == 0) {
            Toast.makeText(this, "Please add at least one patient", Toast.LENGTH_SHORT).show();
            return;
        }
        
        // Validate critical times
        if (timeCall.getText().toString().trim().isEmpty()) {
            timeCall.setError("Time of call is required");
            timeCall.requestFocus();
            Toast.makeText(this, "Please enter the time of call", Toast.LENGTH_SHORT).show();
            return;
        }
        
        if (timeScene.getText().toString().trim().isEmpty()) {
            timeScene.setError("Time arrived at scene is required");
            timeScene.requestFocus();
            Toast.makeText(this, "Please enter the time arrived at scene", Toast.LENGTH_SHORT).show();
            return;
        }
        
        showConfirmationDialog();
    }
    
    // --- Draft Management (Server-side with local fallback) ---
    @Override
    protected void onPause() {
        super.onPause();
        saveDraftToServer();
    }
    
    private void saveDraftToServer() {
        if (incidentKey == null || isReadOnlyMode) return;
        
        Map<String, Object> draftDetails = new HashMap<>();
        draftDetails.put("incidentLocation", editIncidentLocation.getText().toString());
        draftDetails.put("narrative", editNarrative.getText().toString());
        draftDetails.put("facilityName", editFacilityName.getText().toString());
        draftDetails.put("time_call", timeCall.getText().toString());
        draftDetails.put("time_dispatch", timeDispatch.getText().toString());
        draftDetails.put("time_scene", timeScene.getText().toString());
        draftDetails.put("time_depart", timeDeparture.getText().toString());
        draftDetails.put("time_facility", timeFacility.getText().toString());
        draftDetails.put("time_handover", timeHandover.getText().toString());
        draftDetails.put("time_clear", timeClear.getText().toString());
        draftDetails.put("time_base", timeBase.getText().toString());
        
        // Save spinner values
        draftDetails.put("natureOfCall", getSpinnerValue(spinnerNatureOfCall));
        draftDetails.put("emergencyType", getSpinnerValue(spinnerEmergencyType));
        draftDetails.put("areaType", getSpinnerValue(spinnerAreaType));
        draftDetails.put("facilityType", getSpinnerValue(spinnerFacilityType));
        
        JSONArray mediaUrlsArray = new JSONArray();
        for (Uri uri : capturedMediaUris) {
            mediaUrlsArray.put(uri.toString());
        }
        draftDetails.put("media_urls", mediaUrlsArray.toString());
        draftDetails.put("evidence_count", String.valueOf(capturedMediaUris.size()));
        
        // Save patient data in draft
        int patientCount = containerPatients.getChildCount();
        draftDetails.put("patients_count", String.valueOf(patientCount));
        JSONArray patientsArray = new JSONArray();
        for (int i = 0; i < patientCount; i++) {
            View patientView = containerPatients.getChildAt(i);
            Map<String, Object> patientData = scrapePatientData(patientView);
            patientsArray.put(new JSONObject(patientData));
        }
        draftDetails.put("patients", patientsArray.toString());
        
        draftsRepository.saveDraftAsync(
                incidentKey,
                AGENCY_TYPE,
                draftDetails,
                "draft",
                unit -> {
                    Log.d(TAG, "Draft saved to server for incident: " + incidentKey);
                    saveLocalDraft();
                    return Unit.INSTANCE;
                },
                error -> {
                    Log.e(TAG, "Failed to save draft to server: " + error.getMessage());
                    saveLocalDraft();
                    return Unit.INSTANCE;
                }
        );
    }
    
    private void saveLocalDraft() {
        if (draftManager == null) return;
        
        ReportDraftManager.ReportDraft draft = new ReportDraftManager.ReportDraft();
        draft.narrative = editIncidentLocation.getText().toString() + "|" +
                          editNarrative.getText().toString() + "|" +
                          editFacilityName.getText().toString() + "|" +
                          timeCall.getText().toString() + "|" +
                          timeDispatch.getText().toString() + "|" +
                          timeScene.getText().toString();
        
        draftManager.saveDraft(incidentKey, AGENCY_TYPE, draft);
        Log.d(TAG, "Draft saved locally for incident: " + incidentKey);
    }
    
    private void checkAndRestoreDraft() {
        draftsRepository.getDraftAsync(
                incidentKey,
                serverDraft -> {
                    if (serverDraft != null) {
                        new AlertDialog.Builder(this)
                                .setTitle("Restore Draft")
                                .setMessage("You have a saved draft for this report. Would you like to restore it?")
                                .setPositiveButton("Restore", (dialog, which) -> restoreServerDraft(serverDraft))
                                .setNegativeButton("Discard", (dialog, which) -> {
                                    draftsRepository.deleteDraftAsync(incidentKey, u -> Unit.INSTANCE, e -> Unit.INSTANCE);
                                    draftManager.deleteDraft(incidentKey, AGENCY_TYPE);
                                })
                                .setCancelable(false)
                                .show();
                    } else {
                        checkLocalDraft();
                    }
                    return Unit.INSTANCE;
                },
                error -> {
                    Log.e(TAG, "Failed to check server draft: " + error.getMessage());
                    checkLocalDraft();
                    return Unit.INSTANCE;
                }
        );
    }
    
    private void checkLocalDraft() {
        if (draftManager != null && draftManager.hasDraft(incidentKey, AGENCY_TYPE)) {
            new AlertDialog.Builder(this)
                    .setTitle("Restore Local Draft")
                    .setMessage("You have a locally saved draft. Would you like to restore it?")
                    .setPositiveButton("Restore", (dialog, which) -> restoreLocalDraft())
                    .setNegativeButton("Discard", (dialog, which) -> draftManager.deleteDraft(incidentKey, AGENCY_TYPE))
                    .setCancelable(false)
                    .show();
        }
    }
    
    private void restoreServerDraft(FinalReportDraft serverDraft) {
        try {
            String detailsJson = serverDraft.getDraftDetails().toString();
            JSONObject details = new JSONObject(detailsJson);
            
            editIncidentLocation.setText(details.optString("incidentLocation", ""));
            editNarrative.setText(details.optString("narrative", ""));
            editFacilityName.setText(details.optString("facilityName", ""));
            timeCall.setText(details.optString("time_call", ""));
            timeDispatch.setText(details.optString("time_dispatch", ""));
            timeScene.setText(details.optString("time_scene", ""));
            timeDeparture.setText(details.optString("time_depart", ""));
            timeFacility.setText(details.optString("time_facility", ""));
            timeHandover.setText(details.optString("time_handover", ""));
            timeClear.setText(details.optString("time_clear", ""));
            timeBase.setText(details.optString("time_base", ""));
            
            // Restore spinner values
            setSpinnerValue(spinnerNatureOfCall, details.optString("natureOfCall", ""));
            setSpinnerValue(spinnerEmergencyType, details.optString("emergencyType", ""));
            setSpinnerValue(spinnerAreaType, details.optString("areaType", ""));
            setSpinnerValue(spinnerFacilityType, details.optString("facilityType", ""));
            
            String mediaUrlsStr = details.optString("media_urls", "[]");
            JSONArray mediaUrlsArray = new JSONArray(mediaUrlsStr);
            capturedMediaUris.clear();
            for (int i = 0; i < mediaUrlsArray.length(); i++) {
                String urlStr = mediaUrlsArray.getString(i);
                if (!urlStr.isEmpty()) {
                    capturedMediaUris.add(Uri.parse(urlStr));
                }
            }
            updateMediaCount();
            
            // Restore patient data
            String patientsStr = details.optString("patients", "[]");
            JSONArray patientsArray = new JSONArray(patientsStr);
            containerPatients.removeAllViews();
            for (int i = 0; i < patientsArray.length(); i++) {
                addPatientCard();
                View patientView = containerPatients.getChildAt(i);
                JSONObject patientData = patientsArray.getJSONObject(i);
                restorePatientData(patientView, patientData);
            }
            // If no patients in draft, add one blank card
            if (patientsArray.length() == 0) {
                addPatientCard();
            }
            
            Toast.makeText(this, "Draft restored from server", Toast.LENGTH_SHORT).show();
        } catch (Exception e) {
            Log.e(TAG, "Error restoring server draft: " + e.getMessage());
            Toast.makeText(this, "Error restoring draft", Toast.LENGTH_SHORT).show();
        }
    }
    
    private void restorePatientData(View view, JSONObject data) {
        try {
            // Patient info
            setText(view, R.id.editPatientName, data.optString("name", ""));
            setText(view, R.id.editPatientAge, data.optString("age", ""));
            setText(view, R.id.editPatientSex, data.optString("sex", ""));
            setText(view, R.id.editPatientAddress, data.optString("address", ""));
            setText(view, R.id.editNextOfKin, data.optString("nextOfKin", ""));
            
            // Primary survey
            setText(view, R.id.editChiefComplaint, data.optString("chiefComplaint", ""));
            setSpinnerValueInView(view, R.id.spinnerCSpine, data.optString("c_spine", ""));
            setSpinnerValueInView(view, R.id.spinnerAirway, data.optString("airway", ""));
            setSpinnerValueInView(view, R.id.spinnerBreathing, data.optString("breathing", ""));
            setSpinnerValueInView(view, R.id.spinnerPulse, data.optString("pulse", ""));
            setSpinnerValueInView(view, R.id.spinnerSkin, data.optString("skin", ""));
            setSpinnerValueInView(view, R.id.spinnerLOC, data.optString("loc", ""));
            setSpinnerValueInView(view, R.id.spinnerConsciousness, data.optString("consciousness", ""));
            setSpinnerValueInView(view, R.id.spinnerCapRefill, data.optString("cap_refill", ""));
            
            // SAMPLE
            setText(view, R.id.editSigns, data.optString("signs", ""));
            setText(view, R.id.editAllergies, data.optString("allergies", ""));
            setText(view, R.id.editMeds, data.optString("meds", ""));
            setText(view, R.id.editHistory, data.optString("history", ""));
            setText(view, R.id.editOral, data.optString("oral", ""));
            setText(view, R.id.editEvents, data.optString("events", ""));
            
            // Vital signs
            restoreVitalRow(view, R.id.rowObsTime, data.optJSONObject("obs_time"));
            restoreVitalRow(view, R.id.rowBP, data.optJSONObject("bp"));
            restoreVitalRow(view, R.id.rowPulseRate, data.optJSONObject("pulse_rate"));
            restoreVitalRow(view, R.id.rowRespRate, data.optJSONObject("resp_rate"));
            restoreVitalRow(view, R.id.rowTemp, data.optJSONObject("temp"));
            restoreVitalRow(view, R.id.rowSaO2, data.optJSONObject("spo2"));
            restoreVitalRow(view, R.id.rowCapRefillVital, data.optJSONObject("cap_vital"));
            restoreVitalRow(view, R.id.rowPain, data.optJSONObject("pain"));
            restoreVitalRow(view, R.id.rowGlucose, data.optJSONObject("glucose"));
            
            // GCS
            setText(view, R.id.editGcsEye, data.optString("gcs_eye", ""));
            setText(view, R.id.editGcsVerbal, data.optString("gcs_verbal", ""));
            setText(view, R.id.editGcsMotor, data.optString("gcs_motor", ""));
            setText(view, R.id.editGcsTotal, data.optString("gcs_total", ""));
            
            // Management
            setSpinnerValueInView(view, R.id.spinnerManageAirway, data.optString("manage_airway", ""));
            setSpinnerValueInView(view, R.id.spinnerManageCirc, data.optString("manage_circ", ""));
            setSpinnerValueInView(view, R.id.spinnerManageWound, data.optString("manage_wound", ""));
            setSpinnerValueInView(view, R.id.spinnerManageImmob, data.optString("manage_immob", ""));
            setSpinnerValueInView(view, R.id.spinnerManageOther, data.optString("manage_other", ""));
            
            // Injury details
            setText(view, R.id.editInjuryType, data.optString("injury_type", ""));
            setText(view, R.id.editBodyParts, data.optString("affected_body_parts", ""));
            setText(view, R.id.editPatientNarrative, data.optString("patient_narrative", ""));
        } catch (Exception e) {
            Log.e(TAG, "Error restoring patient data: " + e.getMessage());
        }
    }
    
    private void restoreVitalRow(View parent, int rowId, JSONObject vitalData) {
        if (vitalData == null) return;
        View row = parent.findViewById(rowId);
        if (row == null) return;
        
        EditText t1 = row.findViewById(R.id.inputTime1);
        EditText t2 = row.findViewById(R.id.inputTime2);
        EditText t3 = row.findViewById(R.id.inputTime3);
        
        if (t1 != null) t1.setText(vitalData.optString("t1", ""));
        if (t2 != null) t2.setText(vitalData.optString("t2", ""));
        if (t3 != null) t3.setText(vitalData.optString("t3", ""));
    }
    
    private void setSpinnerValueInView(View parent, int spinnerId, String value) {
        if (value == null || value.isEmpty()) return;
        Spinner spinner = parent.findViewById(spinnerId);
        if (spinner == null) return;
        for (int i = 0; i < spinner.getCount(); i++) {
            if (spinner.getItemAtPosition(i).toString().equalsIgnoreCase(value)) {
                spinner.setSelection(i);
                break;
            }
        }
    }
    
    private void restoreLocalDraft() {
        ReportDraftManager.ReportDraft draft = draftManager.loadDraft(incidentKey, AGENCY_TYPE);
        if (draft == null || draft.narrative == null) return;
        
        String[] parts = draft.narrative.split("\\|", -1);
        if (parts.length >= 1) editIncidentLocation.setText(parts[0]);
        if (parts.length >= 2) editNarrative.setText(parts[1]);
        if (parts.length >= 3) editFacilityName.setText(parts[2]);
        if (parts.length >= 4) timeCall.setText(parts[3]);
        if (parts.length >= 5) timeDispatch.setText(parts[4]);
        if (parts.length >= 6) timeScene.setText(parts[5]);
        
        Toast.makeText(this, "Draft restored from local storage", Toast.LENGTH_SHORT).show();
    }
    
    // --- Read-Only Mode ---
    private void enableReadOnlyMode() {
        btnSubmit.setVisibility(View.GONE);
        btnAddPatient.setVisibility(View.GONE);
        btnCapturePhoto.setVisibility(View.GONE);
        btnCaptureVideo.setVisibility(View.GONE);
        
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
        // Load from unit_reports table (submitted reports)
        reportsRepository.loadReportByIncidentIdAsync(
                incidentKey,
                report -> {
                    if (report != null && report.getDetails() != null) {
                        try {
                            String detailsJson = report.getDetails().toString();
                            JSONObject details = new JSONObject(detailsJson);
                            
                            editIncidentLocation.setText(details.optString("incidentLocation", ""));
                            editNarrative.setText(details.optString("narrative", ""));
                            editFacilityName.setText(details.optString("facilityName", ""));
                            timeCall.setText(details.optString("time_call", ""));
                            timeDispatch.setText(details.optString("time_dispatch", ""));
                            timeScene.setText(details.optString("time_scene", ""));
                            timeDeparture.setText(details.optString("time_depart", ""));
                            timeFacility.setText(details.optString("time_facility", ""));
                            timeHandover.setText(details.optString("time_handover", ""));
                            timeClear.setText(details.optString("time_clear", ""));
                            timeBase.setText(details.optString("time_base", ""));
                            
                            // Set spinner values
                            setSpinnerValue(spinnerNatureOfCall, details.optString("natureOfCall", ""));
                            setSpinnerValue(spinnerEmergencyType, details.optString("emergencyType", ""));
                            setSpinnerValue(spinnerAreaType, details.optString("areaType", ""));
                            setSpinnerValue(spinnerFacilityType, details.optString("facilityType", ""));
                            
                            // Load media
                            String mediaUrlsStr = details.optString("media_urls", "[]");
                            JSONArray mediaUrlsArray = new JSONArray(mediaUrlsStr);
                            capturedMediaUris.clear();
                            for (int i = 0; i < mediaUrlsArray.length(); i++) {
                                String urlStr = mediaUrlsArray.getString(i);
                                if (!urlStr.isEmpty()) {
                                    capturedMediaUris.add(Uri.parse(urlStr));
                                }
                            }
                            updateMediaCount();

                            // Restore patient details in read-only mode
                            containerPatients.removeAllViews();
                            String patientsStr = details.optString("patients", "[]");
                            JSONArray patientsArray = new JSONArray(patientsStr);
                            if (patientsArray.length() > 0) {
                                for (int i = 0; i < patientsArray.length(); i++) {
                                    addPatientCard();
                                    View patientView = containerPatients.getChildAt(i);
                                    JSONObject patientData = patientsArray.getJSONObject(i);
                                    restorePatientData(patientView, patientData);
                                    setPatientViewReadOnly(patientView);
                                }
                            } else {
                                TextView tv = new TextView(MdrrmoReportFormActivity.this);
                                tv.setText("No patient data recorded");
                                tv.setPadding(16, 16, 16, 16);
                                tv.setTextSize(16);
                                containerPatients.addView(tv);
                            }

                        } catch (Exception e) {
                            Log.e(TAG, "Error parsing report details: " + e.getMessage());
                            Toast.makeText(this, "Error loading report data", Toast.LENGTH_SHORT).show();
                        }
                    } else {
                        Log.w(TAG, "No report found for incident: " + incidentKey);
                        Toast.makeText(this, "No report data found", Toast.LENGTH_SHORT).show();
                    }
                    return Unit.INSTANCE;
                },
                throwable -> {
                    Log.e(TAG, "Failed to load report data: " + throwable.getMessage());
                    Toast.makeText(this, "Failed to load report data", Toast.LENGTH_SHORT).show();
                    return Unit.INSTANCE;
                }
        );
    }
    
    private void setSpinnerValue(Spinner spinner, String value) {
        if (value == null || value.isEmpty()) return;
        for (int i = 0; i < spinner.getCount(); i++) {
            if (spinner.getItemAtPosition(i).toString().equalsIgnoreCase(value)) {
                spinner.setSelection(i);
                break;
            }
        }
    }
    
    // Disable all inputs inside a patient card for read-only display
    private void setPatientViewReadOnly(View parent) {
        if (parent == null) return;
        // Hide remove button
        View removeBtn = parent.findViewById(R.id.btnRemoveEntry);
        if (removeBtn != null) removeBtn.setVisibility(View.GONE);
        disableViewAndChildren(parent);
    }

    private void disableViewAndChildren(View view) {
        view.setEnabled(false);
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) {
                disableViewAndChildren(group.getChildAt(i));
            }
        }
    }
}