import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import Papa from 'papaparse';

// ============================================
// PDF EXPORT FOR INCIDENT REPORTS
// ============================================
export function exportIncidentsToPDF(incidents: any[], filters?: any) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Header
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('Incident Reports', pageWidth / 2, 15, { align: 'center' });
  
  // Filters info
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  let yPos = 25;
  
  if (filters?.agency) {
    doc.text(`Agency: ${filters.agency.toUpperCase()}`, 14, yPos);
    yPos += 5;
  }
  if (filters?.status) {
    doc.text(`Status: ${filters.status}`, 14, yPos);
    yPos += 5;
  }
  if (filters?.from || filters?.to) {
    const dateRange = `Date Range: ${filters.from || 'Start'} to ${filters.to || 'Present'}`;
    doc.text(dateRange, 14, yPos);
    yPos += 5;
  }
  
  doc.text(`Generated: ${new Date().toLocaleString()}`, 14, yPos);
  yPos += 5;
  doc.text(`Total Incidents: ${incidents.length}`, 14, yPos);
  yPos += 10;
  
  // Helper function to create summary
  const createSummary = (incident: any): string => {
    const parts: string[] = [];
    
    // Add brief description (first 60 chars)
    if (incident.description) {
      const desc = incident.description.length > 60 
        ? incident.description.substring(0, 60) + '...'
        : incident.description;
      parts.push(desc);
    }
    
    // Add casualties info if available
    if (incident.casualties_category) {
      parts.push(`Casualties: ${incident.casualties_category}`);
    }
    if (incident.casualties_count && incident.casualties_count > 0) {
      parts.push(`Count: ${incident.casualties_count}`);
    }
    
    return parts.join(' | ') || 'N/A';
  };
  
  // Table
  const tableData = incidents.map(incident => [
    incident.id.substring(0, 8),
    incident.agency_type.toUpperCase(),
    incident.reporter_name || 'N/A',
    incident.location_address || 'N/A',
    incident.status,
    new Date(incident.created_at).toLocaleDateString(),
    createSummary(incident)
  ]);
  
  autoTable(doc, {
    startY: yPos,
    head: [['ID', 'Agency', 'Reporter', 'Location', 'Status', 'Date', 'Summary']],
    body: tableData,
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [59, 130, 246], textColor: 255 },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    columnStyles: {
      0: { cellWidth: 20 },
      1: { cellWidth: 20 },
      2: { cellWidth: 25 },
      3: { cellWidth: 35 },
      4: { cellWidth: 20 },
      5: { cellWidth: 20 },
      6: { cellWidth: 45 }
    }
  });
  
  // Footer
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.text(
      `Page ${i} of ${pageCount}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: 'center' }
    );
  }
  
  return doc;
}

// ============================================
// PDF EXPORT FOR FINAL REPORTS
// ============================================
export async function exportFinalReportToPDF(incident: any, finalReport: any, agencyType: string) {
  console.log('[PDF-EXPORT] ========== PDF EXPORT STARTED ==========');
  console.log('[PDF-EXPORT] Incident ID:', incident?.id);
  console.log('[PDF-EXPORT] Agency Type:', agencyType);
  console.log('[PDF-EXPORT] Incident media_urls:', incident?.media_urls);
  console.log('[PDF-EXPORT] Report details:', finalReport?.report_details);
  
  // Alert to confirm function is called (visible in packaged app)
  // alert('PDF Export Started - Check debug page in PDF');
  
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;
  let yPos = 20;
  
  // Agency-specific header colors
  const agencyColors: { [key: string]: [number, number, number] } = {
    pnp: [220, 38, 38],      // Red
    bfp: [249, 115, 22],     // Orange
    pdrrmo: [6, 182, 212],   // Cyan
    mdrrmo: [6, 182, 212]    // Cyan
  };
  
  const headerColor = agencyColors[agencyType] || [59, 130, 246];
  
  // Header
  doc.setFillColor(...headerColor);
  doc.rect(0, 0, pageWidth, 35, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('FINAL INCIDENT REPORT', pageWidth / 2, 15, { align: 'center' });
  
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text(`${agencyType.toUpperCase()} - ${incident.location_address}`, pageWidth / 2, 25, { align: 'center' });
  
  // Reset text color
  doc.setTextColor(0, 0, 0);
  yPos = 45;
  
  // Incident Information
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Incident Information', margin, yPos);
  yPos += 8;
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  
  const incidentInfo = [
    ['Incident ID:', incident.id],
    ['Reporter:', incident.reporter_name || 'N/A'],
    ['Location:', incident.location_address || 'N/A'],
    ['Status:', incident.status],
    ['Reported:', new Date(incident.created_at).toLocaleString()],
    ['Resolved:', incident.resolved_at ? new Date(incident.resolved_at).toLocaleString() : 'N/A']
  ];
  
  if (incident.casualties_category) {
    incidentInfo.push(['Estimated Casualties:', incident.casualties_category]);
  }
  
  incidentInfo.forEach(([label, value]) => {
    doc.setFont('helvetica', 'bold');
    doc.text(label, margin, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(String(value), margin + 40, yPos);
    yPos += 6;
  });
  
  yPos += 5;
  
  // Description
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Initial Report Description', margin, yPos);
  yPos += 8;
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const descLines = doc.splitTextToSize(incident.description || 'N/A', pageWidth - 2 * margin);
  doc.text(descLines, margin, yPos);
  yPos += descLines.length * 5 + 10;
  
  // Check if we need a new page
  if (yPos > 250) {
    doc.addPage();
    yPos = 20;
  }
  
  // Final Report Details
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Final Report Details', margin, yPos);
  yPos += 8;
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  
  const details = finalReport.report_details;
  
  // Agency-specific report rendering
  if (agencyType === 'pnp') {
    renderPNPReport(doc, details, margin, yPos, pageWidth);
  } else if (agencyType === 'bfp') {
    renderBFPReport(doc, details, margin, yPos, pageWidth);
  } else if (agencyType === 'pdrrmo') {
    renderPDRRMOReport(doc, details, margin, yPos, pageWidth);
  } else if (agencyType === 'mdrrmo' || agencyType === 'mdrrmo_disaster') {
    renderMDRRMOReport(doc, details, margin, yPos, pageWidth);
  }
  
  // Add media/evidence section if media URLs exist
  const mediaUrls = getMediaUrls(incident, details);
  console.log('[PDF-EXPORT] Media URLs extracted:', mediaUrls);
  console.log('[PDF-EXPORT] Media URLs count:', mediaUrls.length);
  
  if (mediaUrls.length > 0) {
    await addMediaSection(doc, mediaUrls, margin, pageWidth, headerColor);
  }
  
  // Footer
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(128, 128, 128);
    doc.text(
      `Page ${i} of ${pageCount} | Generated: ${new Date().toLocaleString()}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 10,
      { align: 'center' }
    );
  }
  
  return doc;
}

// ============================================
// AGENCY-SPECIFIC REPORT RENDERERS
// ============================================
function renderPNPReport(doc: jsPDF, details: any, margin: number, startY: number, pageWidth: number) {
  let yPos = startY;
  
  // Narrative
  if (details.narrative) {
    doc.setFont('helvetica', 'bold');
    doc.text('Narrative:', margin, yPos);
    yPos += 6;
    doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(details.narrative, pageWidth - 2 * margin);
    doc.text(lines, margin, yPos);
    yPos += lines.length * 5 + 8;
  }
  
  // Casualties Count
  if (details.casualties_count) {
    doc.setFont('helvetica', 'bold');
    doc.text('Actual Casualties Count:', margin, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(String(details.casualties_count), margin + 50, yPos);
    yPos += 8;
  }
  
  // Suspects
  if (details.suspects_data && Array.isArray(details.suspects_data)) {
    doc.setFont('helvetica', 'bold');
    doc.text('Suspects:', margin, yPos);
    yPos += 6;
    
    const suspectData = details.suspects_data
      .filter((s: any) => s.firstName || s.lastName)
      .map((s: any) => [
        `${s.firstName} ${s.middleName || ''} ${s.lastName}`.trim(),
        s.address || 'N/A',
        s.occupation || 'N/A'
      ]);
    
    if (suspectData.length > 0) {
      autoTable(doc, {
        startY: yPos,
        head: [['Name', 'Address', 'Occupation']],
        body: suspectData,
        styles: { fontSize: 9 },
        margin: { left: margin }
      });
      yPos = (doc as any).lastAutoTable.finalY + 8;
    }
  }
  
  // Victims
  if (details.victims_data && Array.isArray(details.victims_data)) {
    doc.setFont('helvetica', 'bold');
    doc.text('Victims:', margin, yPos);
    yPos += 6;
    
    const victimData = details.victims_data
      .filter((v: any) => v.firstName || v.lastName)
      .map((v: any) => [
        `${v.firstName} ${v.middleName || ''} ${v.lastName}`.trim(),
        v.address || 'N/A',
        v.occupation || 'N/A'
      ]);
    
    if (victimData.length > 0) {
      autoTable(doc, {
        startY: yPos,
        head: [['Name', 'Address', 'Occupation']],
        body: victimData,
        styles: { fontSize: 9 },
        margin: { left: margin }
      });
    }
  }
  
  // Evidence Count
  if (details.evidence_count) {
    yPos = (doc as any).lastAutoTable?.finalY + 8 || yPos;
    doc.setFont('helvetica', 'bold');
    doc.text('Evidence Count:', margin, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(String(details.evidence_count), margin + 35, yPos);
  }
}

function renderBFPReport(doc: jsPDF, details: any, margin: number, startY: number, pageWidth: number) {
  let yPos = startY;
  
  const fields = [
    ['Fire Location:', details.fireLocation],
    ['Area Ownership:', details.areaOwnership],
    ['Class of Fire:', details.classOfFire],
    ['Root Cause:', details.rootCause],
    ['People Injured:', details.peopleInjured],
    ['Estimated Damage:', details.estimatedDamage],
    ['Actual Casualties Count:', details.casualties_count]
  ];
  
  fields.forEach(([label, value]) => {
    if (value) {
      doc.setFont('helvetica', 'bold');
      doc.text(label, margin, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(String(value), margin + 50, yPos);
      yPos += 6;
    }
  });
}

function renderPDRRMOReport(doc: jsPDF, details: any, margin: number, startY: number, pageWidth: number) {
  let yPos = startY;
  const pageHeight = doc.internal.pageSize.getHeight();
  const bottomMargin = 20; // Reserve space for footer
  const maxY = pageHeight - bottomMargin;
  
  // Helper to display value or "--" if empty
  const val = (v: any): string => (v !== undefined && v !== null && v !== '') ? String(v) : '--';
  
  // Helper to validate time format (HH:MM or similar)
  const isValidTime = (v: any): boolean => {
    if (!v || typeof v !== 'string') return false;
    // Check if it looks like a time (contains : and numbers)
    return /^\d{1,2}:\d{2}/.test(v);
  };
  
  // Helper for time fields - only show if valid time format, otherwise show "--"
  const timeVal = (v: any): string => isValidTime(v) ? String(v) : '--';
  
  // Helper to check if we need a new page
  const checkPageBreak = (requiredSpace: number) => {
    if (yPos + requiredSpace > maxY) {
      doc.addPage();
      yPos = 20; // Top margin for new page
      return true;
    }
    return false;
  };
  
  // Check if it's emergency or disaster report
  if (details.patients_data && Array.isArray(details.patients_data)) {
    // Emergency Report - Comprehensive Layout
    
    // Call Information Section
    checkPageBreak(30);
    doc.setFillColor(6, 182, 212);
    doc.rect(margin, yPos, pageWidth - 2 * margin, 6, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('CALL INFORMATION', margin + 2, yPos + 4);
    doc.setTextColor(0, 0, 0);
    yPos += 10;
    
    doc.setFontSize(9);
    const callFields = [
      ['Nature of Call:', val(details.natureOfCall)],
      ['Emergency Type:', val(details.emergencyType)],
      ['Area Type:', val(details.areaType)]
    ];
    
    callFields.forEach(([label, value]) => {
      doc.setFont('helvetica', 'bold');
      doc.text(label, margin + 2, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(value, margin + 45, yPos);
      yPos += 5;
    });
    
    yPos += 5;
    
    // Timeline Section
    checkPageBreak(35);
    doc.setFillColor(6, 182, 212);
    doc.rect(margin, yPos, pageWidth - 2 * margin, 6, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('RESPONSE TIMELINE', margin + 2, yPos + 4);
    doc.setTextColor(0, 0, 0);
    yPos += 10;
    
    doc.setFontSize(8);
    const timeFields = [
      ['Time of Call:', timeVal(details.time_call)],
      ['Dispatch:', timeVal(details.time_dispatch)],
      ['Arrival at Scene:', timeVal(details.time_scene)],
      ['Departure:', timeVal(details.time_depart)],
      ['Arrival at Facility:', timeVal(details.time_facility)],
      ['Patient Handover:', timeVal(details.time_handover)],
      ['Clear:', timeVal(details.time_clear)],
      ['Return to Base:', timeVal(details.time_base)]
    ];
    
    // Display timeline in 2 columns
    const halfLength = Math.ceil(timeFields.length / 2);
    const colWidth = (pageWidth - 2 * margin) / 2;
    
    for (let i = 0; i < halfLength; i++) {
      if (timeFields[i]) {
        doc.setFont('helvetica', 'bold');
        doc.text(timeFields[i][0], margin + 2, yPos);
        doc.setFont('helvetica', 'normal');
        doc.text(timeFields[i][1], margin + 35, yPos);
      }
      
      if (timeFields[i + halfLength]) {
        doc.setFont('helvetica', 'bold');
        doc.text(timeFields[i + halfLength][0], margin + colWidth + 2, yPos);
        doc.setFont('helvetica', 'normal');
        doc.text(timeFields[i + halfLength][1], margin + colWidth + 35, yPos);
      }
      
      yPos += 5;
    }
    
    yPos += 5;
    
    // Facility Information
    checkPageBreak(25);
    doc.setFillColor(6, 182, 212);
    doc.rect(margin, yPos, pageWidth - 2 * margin, 6, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('FACILITY INFORMATION', margin + 2, yPos + 4);
    doc.setTextColor(0, 0, 0);
    yPos += 10;
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('Facility Type:', margin + 2, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(val(details.facilityType), margin + 35, yPos);
    yPos += 5;
    
    doc.setFont('helvetica', 'bold');
    doc.text('Facility Name:', margin + 2, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(val(details.facilityName), margin + 35, yPos);
    yPos += 8;
    
    // Patients - Detailed Cards
    if (details.patients_data && details.patients_data.length > 0) {
      details.patients_data.forEach((patient: any, index: number) => {
        // Check if we need a new page for patient card (estimate 100 units needed)
        checkPageBreak(100);
        
        // Patient Header
        doc.setFillColor(6, 182, 212);
        doc.rect(margin, yPos, pageWidth - 2 * margin, 7, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.text(`PATIENT ${index + 1}: ${patient.name || 'Unknown'}`, margin + 2, yPos + 5);
        doc.setTextColor(0, 0, 0);
        yPos += 12;
        
        // Basic Information
        checkPageBreak(30);
        doc.setFillColor(220, 240, 245);
        doc.rect(margin, yPos, pageWidth - 2 * margin, 5, 'F');
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text('BASIC INFORMATION', margin + 2, yPos + 3.5);
        yPos += 8;
        
        doc.setFontSize(8);
        
        // Display basic info in rows (not grid to allow proper spacing)
        const basicFields = [
          ['Name', val(patient.name)],
          ['Age', val(patient.age)],
          ['Sex', val(patient.sex)]
        ];
        
        // Display Name, Age, Sex in one row
        let xOffset = margin + 2;
        basicFields.forEach((field, idx) => {
          doc.setFont('helvetica', 'bold');
          doc.text(field[0] + ':', xOffset, yPos);
          doc.setFont('helvetica', 'normal');
          const labelWidth = doc.getTextWidth(field[0] + ': ');
          doc.text(field[1], xOffset + labelWidth, yPos);
          xOffset += labelWidth + doc.getTextWidth(field[1]) + 10; // Add spacing
        });
        yPos += 5;
        
        // Display Address on its own line with proper wrapping
        doc.setFont('helvetica', 'bold');
        doc.text('Address:', margin + 2, yPos);
        doc.setFont('helvetica', 'normal');
        const addressText = val(patient.address);
        const addressLines = doc.splitTextToSize(addressText, pageWidth - 2 * margin - 25);
        doc.text(addressLines, margin + 25, yPos);
        yPos += addressLines.length * 4;
        
        // Next of Kin and Chief Complaint
        doc.setFont('helvetica', 'bold');
        doc.text('Next of Kin:', margin + 2, yPos);
        doc.setFont('helvetica', 'normal');
        doc.text(val(patient.nextOfKin || patient.next_of_kin), margin + 25, yPos);
        yPos += 4;
        
        doc.setFont('helvetica', 'bold');
        doc.text('Chief Complaint:', margin + 2, yPos);
        doc.setFont('helvetica', 'normal');
        const ccText = val(patient.chiefComplaint || patient.chief_complaint);
        const ccLines = doc.splitTextToSize(ccText, pageWidth - 2 * margin - 35);
        doc.text(ccLines, margin + 35, yPos);
        yPos += ccLines.length * 4 + 3;
        
        // Primary Survey
        checkPageBreak(25);
        doc.setFillColor(220, 240, 245);
        doc.rect(margin, yPos, pageWidth - 2 * margin, 5, 'F');
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text('PRIMARY SURVEY', margin + 2, yPos + 3.5);
        yPos += 8;
        
        doc.setFontSize(8);
        const primarySurvey = [
          ['C-Spine', val(patient.cSpine || patient.c_spine)],
          ['Airway', val(patient.airway)],
          ['Breathing', val(patient.breathing)],
          ['Pulse', val(patient.pulse)],
          ['Skin', val(patient.skin)],
          ['LOC', val(patient.loc)],
          ['Consciousness', val(patient.consciousness)],
          ['Cap Refill', val(patient.capRefill || patient.cap_refill)]
        ];
        
        const surveyCols = 4;
        const surveyCellWidth = (pageWidth - 2 * margin) / surveyCols;
        primarySurvey.forEach((field, idx) => {
          const col = idx % surveyCols;
          const xPos = margin + 2 + (col * surveyCellWidth);
          
          doc.setFont('helvetica', 'bold');
          doc.text(field[0] + ':', xPos, yPos);
          doc.setFont('helvetica', 'normal');
          const textWidth = doc.getTextWidth(field[0] + ': ');
          doc.text(field[1], xPos + textWidth, yPos);
          
          if ((idx + 1) % surveyCols === 0 || idx === primarySurvey.length - 1) {
            yPos += 4;
          }
        });
        
        yPos += 3;
        
        // SAMPLE History
        checkPageBreak(35);
        doc.setFillColor(220, 240, 245);
        doc.rect(margin, yPos, pageWidth - 2 * margin, 5, 'F');
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text('SAMPLE HISTORY', margin + 2, yPos + 3.5);
        yPos += 8;
        
        doc.setFontSize(8);
        const sampleHistory = [
          ['Signs/Symptoms', val(patient.signs)],
          ['Allergies', val(patient.allergies)],
          ['Medications', val(patient.medications || patient.meds)],
          ['Past History', val(patient.history)],
          ['Last Oral Intake', val(patient.oral)],
          ['Events Leading', val(patient.events)]
        ];
        
        sampleHistory.forEach(([label, value]) => {
          doc.setFont('helvetica', 'bold');
          doc.text(label + ':', margin + 2, yPos);
          doc.setFont('helvetica', 'normal');
          doc.text(value, margin + 35, yPos);
          yPos += 4;
        });
        
        yPos += 3;
        
        // Vital Signs
        checkPageBreak(30);
        doc.setFillColor(220, 240, 245);
        doc.rect(margin, yPos, pageWidth - 2 * margin, 5, 'F');
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text('VITAL SIGNS', margin + 2, yPos + 3.5);
        yPos += 8;
        
        doc.setFontSize(8);
        const vitals = patient.vitals || {};
        const vitalFields = [
          ['BP', val(vitals.bp || patient.bp)],
          ['Pulse Rate', val(vitals.pulseRate || vitals.pulse_rate || patient.pulse_rate)],
          ['Resp Rate', val(vitals.respRate || vitals.resp_rate || patient.resp_rate)],
          ['Temp', val(vitals.temp || patient.temp)],
          ['SpO2', val(vitals.spo2 || patient.spo2)],
          ['Pain (0-10)', val(vitals.pain || patient.pain)],
          ['Glucose', val(vitals.glucose || patient.glucose)],
          ['Obs Time', val(vitals.obsTime || vitals.obs_time || patient.obs_time)]
        ];
        
        const vitalCols = 4;
        const vitalCellWidth = (pageWidth - 2 * margin) / vitalCols;
        vitalFields.forEach((field, idx) => {
          const col = idx % vitalCols;
          const xPos = margin + 2 + (col * vitalCellWidth);
          
          doc.setFont('helvetica', 'bold');
          doc.text(field[0] + ':', xPos, yPos);
          doc.setFont('helvetica', 'normal');
          const textWidth = doc.getTextWidth(field[0] + ': ');
          doc.text(field[1], xPos + textWidth, yPos);
          
          if ((idx + 1) % vitalCols === 0 || idx === vitalFields.length - 1) {
            yPos += 4;
          }
        });
        
        yPos += 3;
        
        // Glasgow Coma Scale
        checkPageBreak(20);
        doc.setFillColor(220, 240, 245);
        doc.rect(margin, yPos, pageWidth - 2 * margin, 5, 'F');
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text('GLASGOW COMA SCALE (GCS)', margin + 2, yPos + 3.5);
        yPos += 8;
        
        doc.setFontSize(8);
        const gcsFields = [
          ['Eye (1-4)', val(patient.gcsEye || patient.gcs_eye)],
          ['Verbal (1-5)', val(patient.gcsVerbal || patient.gcs_verbal)],
          ['Motor (1-6)', val(patient.gcsMotor || patient.gcs_motor)],
          ['Total (3-15)', val(patient.gcsTotal || patient.gcs_total)]
        ];
        
        gcsFields.forEach((field, idx) => {
          const col = idx % 4;
          const xPos = margin + 2 + (col * ((pageWidth - 2 * margin) / 4));
          
          doc.setFont('helvetica', 'bold');
          doc.text(field[0] + ':', xPos, yPos);
          doc.setFont('helvetica', 'normal');
          const textWidth = doc.getTextWidth(field[0] + ': ');
          doc.text(field[1], xPos + textWidth, yPos);
          
          if ((idx + 1) % 4 === 0) {
            yPos += 4;
          }
        });
        
        yPos += 3;
        
        // Management/Interventions
        checkPageBreak(35);
        doc.setFillColor(220, 240, 245);
        doc.rect(margin, yPos, pageWidth - 2 * margin, 5, 'F');
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text('MANAGEMENT & INTERVENTIONS', margin + 2, yPos + 3.5);
        yPos += 8;
        
        doc.setFontSize(8);
        const management = [
          ['Airway', val(patient.manageAirway || patient.manage_airway)],
          ['Circulation', val(patient.manageCirc || patient.manage_circ)],
          ['Wound Care', val(patient.manageWound || patient.manage_wound)],
          ['Immobilization', val(patient.manageImmob || patient.manage_immob)],
          ['Other', val(patient.manageOther || patient.manage_other)]
        ];
        
        management.forEach(([label, value]) => {
          doc.setFont('helvetica', 'bold');
          doc.text(label + ':', margin + 2, yPos);
          doc.setFont('helvetica', 'normal');
          doc.text(value, margin + 35, yPos);
          yPos += 4;
        });
        
        // Interventions Performed
        const interventionsText = patient.interventions;
        if (interventionsText) {
          doc.setFont('helvetica', 'bold');
          doc.text('Interventions:', margin + 2, yPos);
          doc.setFont('helvetica', 'normal');
          const intText = val(interventionsText);
          const intLines = doc.splitTextToSize(intText, pageWidth - 2 * margin - 35);
          doc.text(intLines, margin + 35, yPos);
          yPos += intLines.length * 4;
        }
        
        yPos += 3;
        
        // Injury Details
        checkPageBreak(30);
        doc.setFillColor(220, 240, 245);
        doc.rect(margin, yPos, pageWidth - 2 * margin, 5, 'F');
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text('INJURY DETAILS', margin + 2, yPos + 3.5);
        yPos += 8;
        
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.text('Injury Type:', margin + 2, yPos);
        doc.setFont('helvetica', 'normal');
        const injuryText = val(patient.injuryType || patient.injury_type);
        const injuryLines = doc.splitTextToSize(injuryText, pageWidth - 2 * margin - 30);
        doc.text(injuryLines, margin + 30, yPos);
        yPos += injuryLines.length * 4;
        
        doc.setFont('helvetica', 'bold');
        doc.text('Affected Body Parts:', margin + 2, yPos);
        doc.setFont('helvetica', 'normal');
        const bodyText = val(patient.affectedBodyParts || patient.affected_body_parts);
        const bodyLines = doc.splitTextToSize(bodyText, pageWidth - 2 * margin - 40);
        doc.text(bodyLines, margin + 40, yPos);
        yPos += bodyLines.length * 4;
        
        // Patient Narrative
        const patientNarr = patient.patientNarrative || patient.patient_narrative;
        if (patientNarr) {
          yPos += 2;
          doc.setFont('helvetica', 'bold');
          doc.text('Patient Narrative:', margin + 2, yPos);
          yPos += 4;
          doc.setFont('helvetica', 'normal');
          const narrativeLines = doc.splitTextToSize(val(patientNarr), pageWidth - 2 * margin - 4);
          doc.text(narrativeLines, margin + 4, yPos);
          yPos += narrativeLines.length * 4;
        }
        
        yPos += 8; // Space between patients
      });
    }
    
    // Overall Incident Narrative
    if (details.narrative) {
      checkPageBreak(30);
      
      doc.setFillColor(6, 182, 212);
      doc.rect(margin, yPos, pageWidth - 2 * margin, 6, 'F');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('INCIDENT NARRATIVE', margin + 2, yPos + 4);
      doc.setTextColor(0, 0, 0);
      yPos += 10;
      
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      const narrativeLines = doc.splitTextToSize(details.narrative, pageWidth - 2 * margin - 4);
      doc.text(narrativeLines, margin + 2, yPos);
    }
  }
}

function renderMDRRMOReport(doc: jsPDF, details: any, margin: number, startY: number, pageWidth: number) {
  let yPos = startY;
  
  const fields = [
    ['Disaster Type:', details.disaster_type],
    ['Affected Area:', details.affected_area],
    ['Casualties (Dead):', details.casualties_dead],
    ['Casualties (Injured):', details.casualties_injured],
    ['Casualties (Missing):', details.casualties_missing],
    ['Actual Casualties Count:', details.casualties_count],
    ['Families Affected:', details.families_affected],
    ['Individuals Affected:', details.individuals_affected],
    ['Damage Level:', details.damage_level],
    ['Damage Details:', details.damage_details]
  ];
  
  fields.forEach(([label, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      doc.setFont('helvetica', 'bold');
      doc.text(label, margin, yPos);
      doc.setFont('helvetica', 'normal');
      doc.text(String(value), margin + 50, yPos);
      yPos += 6;
    }
  });
  
  yPos += 4;
  
  // Narrative
  if (details.narrative) {
    doc.setFont('helvetica', 'bold');
    doc.text('Narrative:', margin, yPos);
    yPos += 6;
    doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(details.narrative, pageWidth - 2 * margin);
    doc.text(lines, margin, yPos);
  }
}

// ============================================
// CSV EXPORT FOR BATCH OPERATIONS
// ============================================
export function parseResourcesCSV(csvContent: string): Promise<any[]> {
  return new Promise((resolve, reject) => {
    Papa.parse(csvContent, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        resolve(results.data);
      },
      error: (error: any) => {
        reject(error);
      }
    });
  });
}

export function generateResourcesCSVTemplate(): string {
  const headers = ['name', 'type', 'status', 'description'];
  const example = ['Ambulance Unit 1', 'vehicle', 'available', 'Emergency response ambulance'];
  
  return Papa.unparse({
    fields: headers,
    data: [example]
  });
}

export function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ============================================
// MEDIA HANDLING FOR PDF REPORTS
// ============================================

/**
 * Extract media URLs from incident and report details
 */
function getMediaUrls(incident: any, details: any): string[] {
  const urls: string[] = [];
  
  // Get from incident.media_urls
  if (incident?.media_urls) {
    if (Array.isArray(incident.media_urls)) {
      urls.push(...incident.media_urls.filter((u: any) => typeof u === 'string'));
    } else if (typeof incident.media_urls === 'string') {
      try {
        const parsed = JSON.parse(incident.media_urls);
        if (Array.isArray(parsed)) {
          urls.push(...parsed.filter((u: any) => typeof u === 'string'));
        }
      } catch {
        // If not JSON, might be a single URL
        if (incident.media_urls.startsWith('http')) {
          urls.push(incident.media_urls);
        }
      }
    }
  }
  
  // Get from details.media_urls (from final report)
  if (details?.media_urls) {
    if (Array.isArray(details.media_urls)) {
      urls.push(...details.media_urls.filter((u: any) => typeof u === 'string'));
    } else if (typeof details.media_urls === 'string') {
      try {
        const parsed = JSON.parse(details.media_urls);
        if (Array.isArray(parsed)) {
          urls.push(...parsed.filter((u: any) => typeof u === 'string'));
        }
      } catch {
        if (details.media_urls.startsWith('http')) {
          urls.push(details.media_urls);
        }
      }
    }
  }
  
  // Deduplicate
  return [...new Set(urls)];
}

/**
 * Determine if URL is an image
 */
function isImageUrl(url: string): boolean {
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'];
  const urlLower = url.toLowerCase();
  return imageExtensions.some(ext => urlLower.includes(ext));
}

/**
 * Determine if URL is a video
 */
function isVideoUrl(url: string): boolean {
  const videoExtensions = ['.mp4', '.mov', '.avi', '.webm', '.mkv', '.m4v'];
  const urlLower = url.toLowerCase();
  return videoExtensions.some(ext => urlLower.includes(ext));
}

/**
 * Load image as base64 data URL
 * Uses fetch to bypass CORS restrictions in packaged Electron app
 */
async function loadImageAsDataUrl(url: string): Promise<string | null> {
  try {
    console.log('[PDF-DEBUG] Starting image fetch:', url);
    // Fetch the image as a blob to bypass CORS restrictions
    const response = await fetch(url);
    if (!response.ok) {
      console.error('[PDF-DEBUG] Failed to fetch image:', url, response.status);
      return null;
    }
    console.log('[PDF-DEBUG] Image fetched successfully, blob size:', response.headers.get('content-length'));
    
    const blob = await response.blob();
    console.log('[PDF-DEBUG] Blob created, size:', blob.size, 'type:', blob.type);
    
    // Convert blob to data URL using FileReader
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        
        // Convert to canvas to ensure consistent format and compression
        const img = new Image();
        img.onload = () => {
          try {
            console.log('[PDF-DEBUG] Image loaded to DOM, dimensions:', img.width, 'x', img.height);
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(img, 0, 0);
              const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.8);
              console.log('[PDF-DEBUG] Canvas conversion successful, data URL length:', compressedDataUrl.length);
              resolve(compressedDataUrl);
            } else {
              console.error('[PDF-DEBUG] Failed to get canvas context');
              resolve(dataUrl);
            }
          } catch (error) {
            console.error('[PDF-DEBUG] Error converting image to canvas:', error);
            resolve(dataUrl);
          }
        };
        img.onerror = (e) => {
          console.error('[PDF-DEBUG] Error loading image from blob:', url, e);
          resolve(dataUrl);
        };
        img.src = dataUrl;
      };
      reader.onerror = (e) => {
        console.error('[PDF-DEBUG] Error reading blob:', url, e);
        resolve(null);
      };
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error('[PDF-DEBUG] Error loading image via fetch:', url, error);
    return null;
  }
}

/**
 * Create video thumbnail by loading first frame
 */
async function createVideoThumbnail(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.preload = 'metadata';
    
    video.onloadeddata = () => {
      try {
        // Seek to 1 second to get a better frame
        video.currentTime = 1;
      } catch (error) {
        console.error('Error seeking video:', error);
        resolve(null);
      }
    };
    
    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
          resolve(dataUrl);
        } else {
          resolve(null);
        }
      } catch (error) {
        console.error('Error creating video thumbnail:', error);
        resolve(null);
      }
    };
    
    video.onerror = () => {
      console.error('Error loading video:', url);
      resolve(null);
    };
    
    video.src = url;
  });
}

/**
 * Add media/evidence section to PDF with images and video thumbnails
 */
async function addMediaSection(
  doc: jsPDF, 
  mediaUrls: string[], 
  margin: number, 
  pageWidth: number,
  headerColor: [number, number, number]
) {
  console.log('[PDF-DEBUG] ========== MEDIA SECTION START ==========');
  console.log('[PDF-DEBUG] Total media URLs to process:', mediaUrls.length);
  console.log('[PDF-DEBUG] Media URLs:', mediaUrls);
  
  // Add new page for media
  doc.addPage();
  let yPos = 20;
  
  // Header for media section
  doc.setFillColor(...headerColor);
  doc.rect(0, 0, pageWidth, 35, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('EVIDENCE / MEDIA ATTACHMENTS', pageWidth / 2, 15, { align: 'center' });
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`${mediaUrls.length} file(s) attached`, pageWidth / 2, 25, { align: 'center' });
  
  doc.setTextColor(0, 0, 0);
  yPos = 45;
  
  const maxImageWidth = pageWidth - 2 * margin;
  const maxImageHeight = 80;
  
  for (let i = 0; i < mediaUrls.length; i++) {
    const url = mediaUrls[i];
    const isImage = isImageUrl(url);
    const isVideo = isVideoUrl(url);
    
    console.log(`[PDF-DEBUG] Processing media ${i + 1}/${mediaUrls.length}:`, {
      url,
      isImage,
      isVideo,
      type: isVideo ? 'Video' : isImage ? 'Image' : 'Unknown'
    });
    
    // Check if we need a new page
    if (yPos > 240) {
      doc.addPage();
      yPos = 20;
    }
    
    // Media item number
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text(`${i + 1}. ${isVideo ? 'Video' : isImage ? 'Image' : 'File'}`, margin, yPos);
    yPos += 6;
    
    // URL
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 255);
    const urlLines = doc.splitTextToSize(url, maxImageWidth);
    doc.text(urlLines, margin, yPos);
    doc.setTextColor(0, 0, 0);
    yPos += urlLines.length * 4 + 4;
    
    // Try to embed image or video thumbnail
    try {
      let dataUrl: string | null = null;
      
      // Load image or video thumbnail (without adding text to PDF)
      if (isImage) {
        console.log('[PDF-DEBUG] Loading image...');
        dataUrl = await loadImageAsDataUrl(url);
        console.log('[PDF-DEBUG] Image load result:', dataUrl ? 'SUCCESS' : 'FAILED');
      } else if (isVideo) {
        console.log('[PDF-DEBUG] Creating video thumbnail...');
        dataUrl = await createVideoThumbnail(url);
        console.log('[PDF-DEBUG] Video thumbnail result:', dataUrl ? 'SUCCESS' : 'FAILED');
      }
      
      if (dataUrl) {
        console.log('[PDF-DEBUG] Data URL obtained, length:', dataUrl.length);
        // Calculate dimensions to fit within max bounds while maintaining aspect ratio
        const img = new Image();
        await new Promise<void>((resolve) => {
          img.onload = () => resolve();
          img.onerror = () => resolve();
          img.src = dataUrl!;
        });
        
        let imgWidth = img.width;
        let imgHeight = img.height;
        
        // Scale down if too large
        if (imgWidth > maxImageWidth) {
          const ratio = maxImageWidth / imgWidth;
          imgWidth = maxImageWidth;
          imgHeight = imgHeight * ratio;
        }
        
        if (imgHeight > maxImageHeight) {
          const ratio = maxImageHeight / imgHeight;
          imgHeight = maxImageHeight;
          imgWidth = imgWidth * ratio;
        }
        
        // Add image to PDF
        console.log('[PDF-DEBUG] Adding image to PDF at position:', { x: margin, y: yPos, width: imgWidth, height: imgHeight });
        doc.addImage(dataUrl, 'JPEG', margin, yPos, imgWidth, imgHeight);
        console.log('[PDF-DEBUG] Image successfully added to PDF');
        yPos += imgHeight + 5;
        
        if (isVideo) {
          doc.setFontSize(8);
          doc.setTextColor(128, 128, 128);
          doc.text('(Video thumbnail - first frame)', margin, yPos);
          yPos += 4;
        }
      } else {
        // Failed to load - show placeholder
        console.warn('[PDF-DEBUG] No data URL obtained for media item');
        doc.setFontSize(9);
        doc.setTextColor(200, 0, 0);
        doc.text(`[${isVideo ? 'Video' : 'Image'} could not be loaded]`, margin, yPos);
        yPos += 5;
      }
    } catch (error) {
      console.error('[PDF-DEBUG] Error embedding media:', error);
      doc.setFontSize(9);
      doc.setTextColor(200, 0, 0);
      doc.text('[Error loading media]', margin, yPos);
      yPos += 5;
    }
    
    doc.setTextColor(0, 0, 0);
    yPos += 10; // Spacing between media items
  }
}
