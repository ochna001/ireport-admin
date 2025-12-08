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
import android.view.View;
import android.widget.AdapterView;
import android.widget.Button;
import android.widget.EditText;
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
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

public class MdrrmoDisasterReportFormActivity extends AppCompatActivity {

    private static final String TAG = "MdrrmoDisasterReport";
    private static final String AGENCY_TYPE = "pdrrmo";

    // UI Elements
    private Spinner spinnerDisasterType, spinnerDamageLevel;
    private EditText editDisasterTypeOther, editAffectedArea;
    private EditText editCasualtiesDead, editCasualtiesInjured, editCasualtiesMissing;
    private EditText editFamiliesAffected, editIndividualsAffected;
    private EditText editDamageDetails, editNarrative;
    private Button btnSubmit, btnCapturePhoto, btnCaptureVideo;
    private TextView tvMediaCount;
    private RecyclerView recyclerMediaPreview;
    private MediaPreviewAdapter mediaPreviewAdapter;

    private List<Uri> capturedMediaUris = new ArrayList<>();
    private List<String> uploadedMediaUrls = new ArrayList<>();
    private Uri photoUri;
    private ActivityResultLauncher<Uri> takePictureLauncher;
    private ActivityResultLauncher<Intent> takeVideoLauncher;

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
    private String incidentAddress;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_mdrrmo_disaster_report_form);

        incidentKey = getIntent().getStringExtra("INCIDENT_KEY");
        if (incidentKey == null) { finish(); return; }

        incidentType = getIntent().getStringExtra("INCIDENT_TYPE");
        incidentAddress = getIntent().getStringExtra("INCIDENT_ADDRESS");

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
        setupDisasterTypeSpinner();

        // Pre-fill affected area from incident address
        if (incidentAddress != null && !incidentAddress.isEmpty()) {
            editAffectedArea.setText(incidentAddress);
        }

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
        spinnerDisasterType = findViewById(R.id.spinnerDisasterType);
        spinnerDamageLevel = findViewById(R.id.spinnerDamageLevel);
        editDisasterTypeOther = findViewById(R.id.editDisasterTypeOther);
        editAffectedArea = findViewById(R.id.editAffectedArea);
        
        editCasualtiesDead = findViewById(R.id.editCasualtiesDead);
        editCasualtiesInjured = findViewById(R.id.editCasualtiesInjured);
        editCasualtiesMissing = findViewById(R.id.editCasualtiesMissing);
        editFamiliesAffected = findViewById(R.id.editFamiliesAffected);
        editIndividualsAffected = findViewById(R.id.editIndividualsAffected);
        
        editDamageDetails = findViewById(R.id.editDamageDetails);
        editNarrative = findViewById(R.id.editNarrative);
        
        btnSubmit = findViewById(R.id.btnSubmitDisasterReport);
        btnCapturePhoto = findViewById(R.id.btnCapturePhoto);
        btnCaptureVideo = findViewById(R.id.btnCaptureVideo);
        tvMediaCount = findViewById(R.id.tvMediaCount);
        recyclerMediaPreview = findViewById(R.id.recyclerMediaPreview);

        btnCapturePhoto.setOnClickListener(v -> capturePhoto());
        btnCaptureVideo.setOnClickListener(v -> captureVideo());
    }

    private void setupDisasterTypeSpinner() {
        spinnerDisasterType.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override
            public void onItemSelected(AdapterView<?> parent, View view, int position, long id) {
                String selected = parent.getItemAtPosition(position).toString();
                if ("Other".equalsIgnoreCase(selected)) {
                    editDisasterTypeOther.setVisibility(View.VISIBLE);
                } else {
                    editDisasterTypeOther.setVisibility(View.GONE);
                    editDisasterTypeOther.setText("");
                }
            }

            @Override
            public void onNothingSelected(AdapterView<?> parent) {
                editDisasterTypeOther.setVisibility(View.GONE);
            }
        });
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

    private void validateAndSubmit() {
        // Validate disaster type
        if (spinnerDisasterType.getSelectedItemPosition() == 0) {
            Toast.makeText(this, "Please select a disaster type", Toast.LENGTH_SHORT).show();
            return;
        }

        // Validate "Other" disaster type
        String disasterType = spinnerDisasterType.getSelectedItem().toString();
        if ("Other".equalsIgnoreCase(disasterType) && editDisasterTypeOther.getText().toString().trim().isEmpty()) {
            editDisasterTypeOther.setError("Please specify the disaster type");
            editDisasterTypeOther.requestFocus();
            return;
        }

        // Validate affected area
        if (editAffectedArea.getText().toString().trim().isEmpty()) {
            editAffectedArea.setError("Affected area is required");
            editAffectedArea.requestFocus();
            Toast.makeText(this, "Please enter the affected area", Toast.LENGTH_SHORT).show();
            return;
        }

        // Validate narrative
        String narrative = editNarrative.getText().toString().trim();
        if (narrative.isEmpty()) {
            editNarrative.setError("Narrative is required");
            editNarrative.requestFocus();
            Toast.makeText(this, "Please provide a narrative report", Toast.LENGTH_SHORT).show();
            return;
        }

        showConfirmationDialog();
    }

    private void showConfirmationDialog() {
        new AlertDialog.Builder(this)
                .setTitle("Submit Disaster Report")
                .setMessage("Are you sure you want to submit this disaster report?")
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

        // Check if already a remote URL
        String uriString = mediaUri.toString();
        if (uriString.startsWith("http://") || uriString.startsWith("https://")) {
            uploadedMediaUrls.add(uriString);
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
                    tvMediaCount.setText("Uploading " + (index + 2) + "/" + capturedMediaUris.size() + "...");
                    uploadNextMedia(index + 1);
                    return Unit.INSTANCE;
                },
                error -> {
                    Log.e(TAG, "Failed to upload media: " + error.getMessage());
                    Toast.makeText(this, "Failed to upload media", Toast.LENGTH_SHORT).show();
                    btnSubmit.setEnabled(true);
                    btnSubmit.setText("Submit Disaster Report");
                    return Unit.INSTANCE;
                }
            );
        } catch (IOException e) {
            Log.e(TAG, "Error reading media file: " + e.getMessage());
            btnSubmit.setEnabled(true);
            btnSubmit.setText("Submit Disaster Report");
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
        }
        return "mdrrmo_disaster/" + incidentKey + "/" + timestamp + "_" + index + extension;
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
                    }
                    saveDraftToServer();
                    return Unit.INSTANCE;
                },
                error -> {
                    Log.e(TAG, "Failed to upload draft media: " + error.getMessage());
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
        reportDetails.put("report_type", "DISASTER");
        
        // Disaster type
        String disasterType = spinnerDisasterType.getSelectedItem().toString();
        if ("Other".equalsIgnoreCase(disasterType)) {
            disasterType = editDisasterTypeOther.getText().toString().trim();
        }
        reportDetails.put("disaster_type", disasterType);
        reportDetails.put("affected_area", editAffectedArea.getText().toString());

        // Casualties
        reportDetails.put("casualties_dead", getIntValue(editCasualtiesDead));
        reportDetails.put("casualties_injured", getIntValue(editCasualtiesInjured));
        reportDetails.put("casualties_missing", getIntValue(editCasualtiesMissing));
        reportDetails.put("families_affected", getIntValue(editFamiliesAffected));
        reportDetails.put("individuals_affected", getIntValue(editIndividualsAffected));

        // Damage assessment
        reportDetails.put("damage_level", getSpinnerValue(spinnerDamageLevel));
        reportDetails.put("damage_details", editDamageDetails.getText().toString());

        // Narrative
        reportDetails.put("narrative", editNarrative.getText().toString());

        // Media
        reportDetails.put("media_count", String.valueOf(mediaUrls.size()));
        reportDetails.put("media_urls", new JSONArray(mediaUrls).toString());

        reportsRepository.createOrUpdateReportAsync(
                incidentKey,
                "MDRRMO",
                "MDRRMO Disaster Report",
                reportDetails,
                unit -> {
                    markIncidentAsCompleted();
                    return Unit.INSTANCE;
                },
                throwable -> {
                    Toast.makeText(this, "Failed to save: " + throwable.getMessage(), Toast.LENGTH_SHORT).show();
                    btnSubmit.setEnabled(true);
                    btnSubmit.setText("Submit Disaster Report");
                    return Unit.INSTANCE;
                }
        );
    }

    private int getIntValue(EditText editText) {
        String text = editText.getText().toString().trim();
        if (text.isEmpty()) return 0;
        try {
            return Integer.parseInt(text);
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private String getSpinnerValue(Spinner spinner) {
        if (spinner != null && spinner.getSelectedItem() != null) {
            return spinner.getSelectedItem().toString();
        }
        return "";
    }

    private void markIncidentAsCompleted() {
        draftsRepository.deleteDraftAsync(incidentKey, u -> Unit.INSTANCE, e -> Unit.INSTANCE);
        draftManager.deleteDraft(incidentKey, AGENCY_TYPE);

        incidentsRepository.updateIncidentStatusAsync(
                incidentKey,
                "resolved",
                unit -> {
                    Toast.makeText(this, "Disaster Report Submitted!", Toast.LENGTH_SHORT).show();
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
        saveDraftToServer();
    }

    private void saveDraftToServer() {
        if (incidentKey == null || isReadOnlyMode) return;

        Map<String, Object> draftDetails = new HashMap<>();
        
        String disasterType = spinnerDisasterType.getSelectedItem().toString();
        if ("Other".equalsIgnoreCase(disasterType)) {
            disasterType = editDisasterTypeOther.getText().toString().trim();
        }
        draftDetails.put("disaster_type", disasterType);
        draftDetails.put("disaster_type_position", spinnerDisasterType.getSelectedItemPosition());
        draftDetails.put("disaster_type_other", editDisasterTypeOther.getText().toString());
        draftDetails.put("affected_area", editAffectedArea.getText().toString());
        
        draftDetails.put("casualties_dead", editCasualtiesDead.getText().toString());
        draftDetails.put("casualties_injured", editCasualtiesInjured.getText().toString());
        draftDetails.put("casualties_missing", editCasualtiesMissing.getText().toString());
        draftDetails.put("families_affected", editFamiliesAffected.getText().toString());
        draftDetails.put("individuals_affected", editIndividualsAffected.getText().toString());
        
        draftDetails.put("damage_level", getSpinnerValue(spinnerDamageLevel));
        draftDetails.put("damage_level_position", spinnerDamageLevel.getSelectedItemPosition());
        draftDetails.put("damage_details", editDamageDetails.getText().toString());
        draftDetails.put("narrative", editNarrative.getText().toString());

        JSONArray mediaUrlsArray = new JSONArray();
        for (Uri uri : capturedMediaUris) {
            mediaUrlsArray.put(uri.toString());
        }
        draftDetails.put("media_urls", mediaUrlsArray.toString());

        draftsRepository.saveDraftAsync(
                incidentKey,
                AGENCY_TYPE,
                draftDetails,
                "draft",
                unit -> {
                    Log.d(TAG, "Draft saved to server");
                    return Unit.INSTANCE;
                },
                error -> {
                    Log.e(TAG, "Failed to save draft: " + error.getMessage());
                    return Unit.INSTANCE;
                }
        );
    }

    private void checkAndRestoreDraft() {
        draftsRepository.getDraftAsync(
                incidentKey,
                serverDraft -> {
                    if (serverDraft != null && AGENCY_TYPE.equals(serverDraft.getAgencyType())) {
                        new AlertDialog.Builder(this)
                                .setTitle("Restore Draft")
                                .setMessage("You have a saved draft for this disaster report. Would you like to restore it?")
                                .setPositiveButton("Restore", (dialog, which) -> restoreServerDraft(serverDraft))
                                .setNegativeButton("Discard", (dialog, which) -> {
                                    draftsRepository.deleteDraftAsync(incidentKey, u -> Unit.INSTANCE, e -> Unit.INSTANCE);
                                })
                                .setCancelable(false)
                                .show();
                    }
                    return Unit.INSTANCE;
                },
                error -> {
                    Log.e(TAG, "Failed to check draft: " + error.getMessage());
                    return Unit.INSTANCE;
                }
        );
    }

    private void restoreServerDraft(FinalReportDraft serverDraft) {
        try {
            String detailsJson = serverDraft.getDraftDetails().toString();
            JSONObject details = new JSONObject(detailsJson);

            int disasterTypePos = details.optInt("disaster_type_position", 0);
            spinnerDisasterType.setSelection(disasterTypePos);
            editDisasterTypeOther.setText(details.optString("disaster_type_other", ""));
            editAffectedArea.setText(details.optString("affected_area", ""));

            editCasualtiesDead.setText(details.optString("casualties_dead", ""));
            editCasualtiesInjured.setText(details.optString("casualties_injured", ""));
            editCasualtiesMissing.setText(details.optString("casualties_missing", ""));
            editFamiliesAffected.setText(details.optString("families_affected", ""));
            editIndividualsAffected.setText(details.optString("individuals_affected", ""));

            int damageLevelPos = details.optInt("damage_level_position", 0);
            spinnerDamageLevel.setSelection(damageLevelPos);
            editDamageDetails.setText(details.optString("damage_details", ""));
            editNarrative.setText(details.optString("narrative", ""));

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

            Toast.makeText(this, "Draft restored", Toast.LENGTH_SHORT).show();
        } catch (Exception e) {
            Log.e(TAG, "Error restoring draft: " + e.getMessage());
            Toast.makeText(this, "Error restoring draft", Toast.LENGTH_SHORT).show();
        }
    }

    // --- Read-Only Mode ---
    private void enableReadOnlyMode() {
        btnSubmit.setVisibility(View.GONE);
        btnCapturePhoto.setVisibility(View.GONE);
        btnCaptureVideo.setVisibility(View.GONE);

        spinnerDisasterType.setEnabled(false);
        spinnerDamageLevel.setEnabled(false);
        editDisasterTypeOther.setEnabled(false);
        editAffectedArea.setEnabled(false);
        editCasualtiesDead.setEnabled(false);
        editCasualtiesInjured.setEnabled(false);
        editCasualtiesMissing.setEnabled(false);
        editFamiliesAffected.setEnabled(false);
        editIndividualsAffected.setEnabled(false);
        editDamageDetails.setEnabled(false);
        editNarrative.setEnabled(false);
    }

    private void loadSubmittedReportData() {
        reportsRepository.loadReportByIncidentIdAsync(
                incidentKey,
                report -> {
                    if (report != null && report.getDetails() != null) {
                        try {
                            String detailsJson = report.getDetails().toString();
                            JSONObject details = new JSONObject(detailsJson);

                            setSpinnerValue(spinnerDisasterType, details.optString("disaster_type", ""));
                            editAffectedArea.setText(details.optString("affected_area", ""));

                            editCasualtiesDead.setText(String.valueOf(details.optInt("casualties_dead", 0)));
                            editCasualtiesInjured.setText(String.valueOf(details.optInt("casualties_injured", 0)));
                            editCasualtiesMissing.setText(String.valueOf(details.optInt("casualties_missing", 0)));
                            editFamiliesAffected.setText(String.valueOf(details.optInt("families_affected", 0)));
                            editIndividualsAffected.setText(String.valueOf(details.optInt("individuals_affected", 0)));

                            setSpinnerValue(spinnerDamageLevel, details.optString("damage_level", ""));
                            editDamageDetails.setText(details.optString("damage_details", ""));
                            editNarrative.setText(details.optString("narrative", ""));

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
                        } catch (Exception e) {
                            Log.e(TAG, "Error parsing report: " + e.getMessage());
                        }
                    }
                    return Unit.INSTANCE;
                },
                throwable -> {
                    Log.e(TAG, "Failed to load report: " + throwable.getMessage());
                    return Unit.INSTANCE;
                }
        );
    }

    private void setSpinnerValue(Spinner spinner, String value) {
        if (value == null || value.isEmpty()) return;
        for (int i = 0; i < spinner.getCount(); i++) {
            if (spinner.getItemAtPosition(i).toString().equalsIgnoreCase(value)) {
                spinner.setSelection(i);
                return;
            }
        }
        // If not found in spinner and it's disaster type, might be "Other"
        if (spinner == spinnerDisasterType) {
            // Set to "Other" and fill the text field
            for (int i = 0; i < spinner.getCount(); i++) {
                if ("Other".equalsIgnoreCase(spinner.getItemAtPosition(i).toString())) {
                    spinner.setSelection(i);
                    editDisasterTypeOther.setText(value);
                    editDisasterTypeOther.setVisibility(View.VISIBLE);
                    break;
                }
            }
        }
    }
}
