export interface IncidentReferenceFields {
  id?: string | null;
  incident_reference?: string | null;
  reference_year?: number | null;
  reference_number?: number | null;
  short_code?: string | null;
}

export function getIncidentReference(incident: IncidentReferenceFields): string {
  if (incident.incident_reference) return incident.incident_reference;
  if (incident.reference_year && incident.reference_number) {
    return `INC-${incident.reference_year}-${String(incident.reference_number).padStart(5, '0')}`;
  }
  if (incident.short_code) return `#${incident.short_code.toUpperCase()}`;
  return incident.id ? `#${incident.id.slice(0, 8).toUpperCase()}` : 'Pending reference';
}
