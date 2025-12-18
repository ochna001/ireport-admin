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
export function exportFinalReportToPDF(incident: any, finalReport: any, agencyType: string) {
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
  
  // Check if it's emergency or disaster report
  if (details.patients_data && Array.isArray(details.patients_data)) {
    // Emergency Report
    const fields = [
      ['Nature of Call:', details.natureOfCall],
      ['Emergency Type:', details.emergencyType],
      ['Area Type:', details.areaType],
      ['Incident Location:', details.incidentLocation],
      ['Patients Count:', details.patients_count]
    ];
    
    fields.forEach(([label, value]) => {
      if (value) {
        doc.setFont('helvetica', 'bold');
        doc.text(label, margin, yPos);
        doc.setFont('helvetica', 'normal');
        doc.text(String(value), margin + 40, yPos);
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
      yPos += lines.length * 5 + 8;
    }
    
    // Patients summary (simplified for PDF)
    if (details.patients_data.length > 0) {
      doc.setFont('helvetica', 'bold');
      doc.text(`Patients (${details.patients_data.length}):`, margin, yPos);
      yPos += 6;
      
      details.patients_data.forEach((patient: any, index: number) => {
        doc.setFont('helvetica', 'normal');
        doc.text(`${index + 1}. ${patient.name || 'Unknown'} - ${patient.chiefComplaint || 'N/A'}`, margin + 5, yPos);
        yPos += 5;
      });
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
