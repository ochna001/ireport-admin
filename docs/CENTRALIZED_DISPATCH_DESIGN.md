# Centralized Dispatch System Design

## Overview

Transform the current agency-specific reporting system into a **911-style centralized dispatch center** that can coordinate multiple agencies simultaneously based on incident severity and urgency.

---

## Current System vs. Proposed System

### **Current Flow**
```
Resident Report → Specific Agency (PNP/BFP/PDRRMO) → Assigned to Station → Assigned to Officer
```

**Limitations:**
- ❌ Resident must know which agency to contact
- ❌ Single agency response only (unless manually escalated)
- ❌ No automatic severity-based routing
- ❌ Delayed multi-agency coordination
- ❌ No centralized oversight

### **Proposed Flow**
```
Resident Report → Central Dispatch → 
  ├─ Auto-classify incident type & severity
  ├─ Determine required agencies (single or multi)
  ├─ Find nearest available stations/units
  ├─ Dispatch simultaneously to all agencies
  └─ Real-time coordination & tracking
```

**Benefits:**
- ✅ Single point of contact (like 911)
- ✅ Automatic multi-agency dispatch
- ✅ Severity-based prioritization
- ✅ Optimal resource allocation
- ✅ Faster response times
- ✅ Centralized command & control

---

## System Architecture

### **1. New User Roles**

#### **Dispatcher** (New Role)
- **Access**: Central Dispatch Dashboard
- **Permissions**:
  - View all incoming reports (any agency)
  - Classify incident type & severity
  - Dispatch to multiple agencies simultaneously
  - Reassign/escalate incidents
  - Override agency assignments
  - Monitor all active incidents
  - Coordinate multi-agency responses

#### **Admin** (Enhanced)
- Current permissions +
- Manage dispatchers
- View dispatch analytics
- System-wide oversight

#### **Agency Users** (Unchanged)
- Chief, Desk Officer, Field Officer
- Receive dispatched incidents
- Update status & submit reports
- Same workflow as current

---

### **2. Incident Classification System**

#### **Severity Levels**
```typescript
enum IncidentSeverity {
  CRITICAL = 'critical',    // Life-threatening, immediate response
  HIGH = 'high',            // Urgent, response within 15 min
  MEDIUM = 'medium',        // Important, response within 1 hour
  LOW = 'low',              // Non-urgent, response within 4 hours
  ROUTINE = 'routine'       // Scheduled/planned response
}
```

#### **Auto-Classification Rules**
Based on keywords, location, time, and reporter input:

**CRITICAL** (Multi-agency dispatch):
- Fire with casualties
- Major accidents (3+ vehicles)
- Active shooter/violence
- Natural disaster (earthquake, flood)
- Mass casualty incidents
- Hazmat incidents

**HIGH** (Primary + support agency):
- Structure fire
- Vehicle accident with injuries
- Armed robbery in progress
- Medical emergency
- Missing person (child/elderly)

**MEDIUM** (Single agency):
- Property crime
- Minor accident
- Small fire (controlled)
- Medical assistance (non-emergency)

**LOW** (Single agency, scheduled):
- Noise complaint
- Lost property
- Minor vandalism
- Welfare check

---

### **3. Agency Dispatch Matrix**

#### **Primary Agency Assignment**
```typescript
const INCIDENT_TYPE_TO_AGENCY = {
  // Fire-related
  'fire': ['BFP'],
  'fire_with_casualties': ['BFP', 'PDRRMO', 'PNP'],
  'explosion': ['BFP', 'PNP', 'PDRRMO'],
  
  // Crime-related
  'robbery': ['PNP'],
  'assault': ['PNP', 'PDRRMO'],
  'shooting': ['PNP', 'PDRRMO'],
  
  // Medical/Disaster
  'medical_emergency': ['PDRRMO'],
  'accident': ['PNP', 'PDRRMO'],
  'natural_disaster': ['PDRRMO', 'PNP', 'BFP'],
  
  // Multi-agency by default
  'mass_casualty': ['PDRRMO', 'PNP', 'BFP'],
  'hazmat': ['BFP', 'PDRRMO', 'PNP']
};
```

#### **Support Agency Triggers**
Automatically add support agencies when:
- Severity is CRITICAL
- Casualties reported
- Multiple locations involved
- Incident duration > 2 hours
- Dispatcher manually adds

---

### **4. Intelligent Station Selection**

#### **Selection Criteria** (Weighted)
1. **Distance** (40%): Nearest station to incident
2. **Availability** (30%): Station has available units/officers
3. **Specialization** (20%): Station has required equipment/expertise
4. **Current Load** (10%): Station's active incident count

#### **Algorithm**
```typescript
function selectOptimalStation(
  incident: Incident,
  agency: string,
  severity: IncidentSeverity
): Station {
  const stations = getStationsByAgency(agency);
  
  return stations
    .map(station => ({
      station,
      score: calculateScore(station, incident, severity)
    }))
    .sort((a, b) => b.score - a.score)
    .filter(s => s.score > MIN_THRESHOLD)
    [0]?.station;
}

function calculateScore(station, incident, severity) {
  const distance = calculateDistance(station, incident);
  const availability = getAvailableUnits(station);
  const specialization = hasRequiredEquipment(station, incident);
  const load = getCurrentIncidentCount(station);
  
  return (
    (1 / distance) * 0.4 +           // Closer is better
    availability * 0.3 +              // More units is better
    specialization * 0.2 +            // Has equipment is better
    (1 / (load + 1)) * 0.1           // Less busy is better
  );
}
```

---

### **5. Database Schema Changes**

#### **New Tables**

##### `dispatch_queue`
```sql
CREATE TABLE dispatch_queue (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  incident_id UUID REFERENCES incidents(id),
  severity incident_severity NOT NULL,
  priority INTEGER NOT NULL,              -- 1-10, auto-calculated
  required_agencies TEXT[] NOT NULL,      -- ['PNP', 'BFP', 'PDRRMO']
  dispatch_status dispatch_status NOT NULL DEFAULT 'pending',
  dispatcher_id UUID REFERENCES profiles(id),
  auto_classified BOOLEAN DEFAULT true,
  classification_confidence FLOAT,        -- 0.0-1.0 for ML confidence
  created_at TIMESTAMP DEFAULT NOW(),
  dispatched_at TIMESTAMP,
  estimated_response_time INTEGER         -- minutes
);

CREATE TYPE incident_severity AS ENUM ('critical', 'high', 'medium', 'low', 'routine');
CREATE TYPE dispatch_status AS ENUM ('pending', 'reviewing', 'dispatched', 'acknowledged', 'completed');
```

##### `incident_dispatches`
```sql
CREATE TABLE incident_dispatches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  incident_id UUID REFERENCES incidents(id),
  agency_type TEXT NOT NULL,
  station_id INTEGER REFERENCES agency_stations(id),
  dispatch_order INTEGER NOT NULL,        -- 1=primary, 2+=support
  dispatched_at TIMESTAMP DEFAULT NOW(),
  acknowledged_at TIMESTAMP,
  arrived_at TIMESTAMP,
  completed_at TIMESTAMP,
  dispatch_notes TEXT,
  auto_selected BOOLEAN DEFAULT true,
  selection_score FLOAT                   -- From algorithm
);
```

##### `dispatch_templates`
```sql
CREATE TABLE dispatch_templates (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  incident_type TEXT NOT NULL,
  severity incident_severity NOT NULL,
  required_agencies TEXT[] NOT NULL,
  response_time_target INTEGER,           -- minutes
  special_instructions TEXT,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### **Modified Tables**

##### `incidents` (Add columns)
```sql
ALTER TABLE incidents
  ADD COLUMN severity incident_severity,
  ADD COLUMN priority INTEGER,
  ADD COLUMN dispatch_queue_id UUID REFERENCES dispatch_queue(id),
  ADD COLUMN auto_classified BOOLEAN DEFAULT false,
  ADD COLUMN requires_multi_agency BOOLEAN DEFAULT false,
  ADD COLUMN estimated_response_time INTEGER;
```

##### `profiles` (Add dispatcher role)
```sql
ALTER TABLE profiles
  ALTER COLUMN role TYPE TEXT;
  
-- Update role enum to include 'Dispatcher'
-- Roles: Resident, Field Officer, Desk Officer, Chief, Admin, Dispatcher
```

---

## User Interface Design

### **1. Central Dispatch Dashboard**

#### **Main View** (Dispatcher)
```
┌─────────────────────────────────────────────────────────────┐
│  CENTRAL DISPATCH CENTER                    [User: Dispatcher]│
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─ INCOMING QUEUE ────────────────────────────────────┐    │
│  │  🔴 CRITICAL (2)  🟠 HIGH (5)  🟡 MEDIUM (8)  ⚪ LOW (3) │    │
│  │                                                       │    │
│  │  #1 🔴 CRITICAL - Fire with casualties               │    │
│  │     📍 Brgy. 1, Daet  ⏱️ 2 min ago                    │
│  │     🏢 Residential building, 3rd floor               │
│  │     👥 Est. 5-10 casualties                          │
│  │     🚨 AUTO: BFP + PDRRMO + PNP                      │
│  │     [DISPATCH NOW] [REVIEW] [REASSIGN]               │
│  │                                                       │
│  │  #2 🟠 HIGH - Vehicle accident                       │
│  │     📍 Maharlika Highway, Basud  ⏱️ 5 min ago        │
│  │     🚗 2 vehicles, injuries reported                 │
│  │     🚨 AUTO: PNP + PDRRMO                            │
│  │     [DISPATCH] [REVIEW]                              │
│  └───────────────────────────────────────────────────────┘    │
│                                                               │
│  ┌─ ACTIVE INCIDENTS ──────────────────────────────────┐    │
│  │  Map View                                            │    │
│  │  [Interactive map showing all active incidents       │    │
│  │   with color-coded markers by severity]              │    │
│  │                                                       │    │
│  │  🔴 Critical: 2  🟠 High: 5  🟡 Medium: 8  ⚪ Low: 3  │    │
│  │  📊 Avg Response Time: 8.5 min                       │    │
│  │  🚨 Units Deployed: 18/45                            │    │
│  └───────────────────────────────────────────────────────┘    │
│                                                               │
│  ┌─ AGENCY STATUS ─────────────────────────────────────┐    │
│  │  PNP:    ✅ 12 available  🚨 8 deployed  ⚠️ 2 busy   │    │
│  │  BFP:    ✅ 8 available   🚨 4 deployed  ⚠️ 1 busy   │    │
│  │  PDRRMO: ✅ 6 available   🚨 6 deployed              │    │
│  └───────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

#### **Dispatch Modal** (When clicking incident)
```
┌─────────────────────────────────────────────────────────────┐
│  DISPATCH INCIDENT #1fb7                                  [X]│
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  📋 INCIDENT DETAILS                                         │
│  ├─ Type: Fire with casualties                               │
│  ├─ Severity: 🔴 CRITICAL                                    │
│  ├─ Location: Brgy. 1, Daet, Camarines Norte                │
│  ├─ Reporter: Juan Dela Cruz (09123456789)                  │
│  └─ Description: 3-story residential building on fire...     │
│                                                               │
│  🚨 RECOMMENDED DISPATCH (Auto-classified)                   │
│  Confidence: 95%  [Override Classification]                  │
│                                                               │
│  ┌─ PRIMARY AGENCY ──────────────────────────────────┐      │
│  │  🔥 BFP - Bureau of Fire Protection                │      │
│  │  Station: BFP Daet Central (1.2 km away)           │      │
│  │  ETA: 4 minutes                                     │      │
│  │  Units: Fire Truck #1, Ambulance #2                │      │
│  │  Officers: 6 available                              │      │
│  │  [Change Station ▼]                                 │      │
│  └─────────────────────────────────────────────────────┘      │
│                                                               │
│  ┌─ SUPPORT AGENCIES ────────────────────────────────┐      │
│  │  🏥 PDRRMO - Disaster Response                      │      │
│  │  Station: PDRRMO Main (2.1 km)                     │      │
│  │  ETA: 6 minutes                                     │      │
│  │  Units: Ambulance #1, Rescue Vehicle               │      │
│  │  [Change Station ▼]                                 │      │
│  │                                                     │      │
│  │  👮 PNP - Police (Traffic & Crowd Control)         │      │
│  │  Station: PNP Daet (1.5 km)                        │      │
│  │  ETA: 5 minutes                                     │      │
│  │  Units: Patrol Car #3                               │      │
│  │  [Change Station ▼]                                 │      │
│  │                                                     │      │
│  │  [+ Add Agency]                                     │      │
│  └─────────────────────────────────────────────────────┘      │
│                                                               │
│  📝 DISPATCH NOTES (Optional)                                │
│  [Text area for special instructions...]                     │
│                                                               │
│  ⏱️ ESTIMATED TOTAL RESPONSE TIME: 4-6 minutes               │
│                                                               │
│  [CANCEL]  [SAVE AS TEMPLATE]  [🚨 DISPATCH ALL AGENCIES]   │
└─────────────────────────────────────────────────────────────┘
```

---

### **2. Resident App Changes**

#### **Simplified Reporting**
```
┌─────────────────────────────────────┐
│  REPORT EMERGENCY                   │
├─────────────────────────────────────┤
│                                     │
│  What's happening?                  │
│  ┌─────────────────────────────┐   │
│  │ Fire in my building         │   │
│  │                             │   │
│  └─────────────────────────────┘   │
│                                     │
│  📸 Add Photos/Videos (Optional)   │
│  [Upload]                           │
│                                     │
│  📍 Location                        │
│  ● Use my current location          │
│  ○ Enter address manually           │
│                                     │
│  🚨 Is this life-threatening?      │
│  ● Yes - Critical                   │
│  ○ No - Urgent                      │
│  ○ Not urgent                       │
│                                     │
│  👥 Are there injuries?             │
│  ● Yes (Est: ___ people)            │
│  ○ No                               │
│  ○ Unknown                          │
│                                     │
│  [SEND EMERGENCY REPORT]            │
│                                     │
│  ℹ️ Your report will be sent to    │
│     the Central Dispatch Center     │
│     and appropriate agencies will   │
│     be notified immediately.        │
└─────────────────────────────────────┘
```

**After Submission:**
```
┌─────────────────────────────────────┐
│  ✅ REPORT RECEIVED                 │
├─────────────────────────────────────┤
│                                     │
│  Report ID: #1fb7                   │
│  Status: 🚨 DISPATCHING             │
│                                     │
│  Agencies Responding:               │
│  🔥 Fire Department (4 min ETA)     │
│  🏥 Emergency Medical (6 min ETA)   │
│  👮 Police (5 min ETA)              │
│                                     │
│  📍 Units are on their way!         │
│                                     │
│  [TRACK RESPONSE] [CALL 911]        │
└─────────────────────────────────────┘
```

---

### **3. Agency App Changes** (Minimal)

#### **Receive Dispatched Incidents**
```
🔔 NEW DISPATCH - CRITICAL

Incident: Fire with casualties
Location: Brgy. 1, Daet
Your Role: PRIMARY RESPONDER
ETA Required: 4 minutes

Other Agencies:
- PDRRMO (Support)
- PNP (Support)

[ACKNOWLEDGE] [VIEW DETAILS]
```

**No change to:**
- Status updates
- Final reports
- Officer assignment
- Resource management

---

## Implementation Phases

### **Phase 1: Foundation** (2-3 weeks)

**Database:**
- ✅ Add severity enum and columns
- ✅ Create dispatch_queue table
- ✅ Create incident_dispatches table
- ✅ Add Dispatcher role

**Backend:**
- ✅ Auto-classification logic
- ✅ Station selection algorithm
- ✅ Multi-agency dispatch API
- ✅ Priority calculation

**Testing:**
- ✅ Classification accuracy
- ✅ Station selection logic
- ✅ Multi-agency coordination

---

### **Phase 2: Dispatch Dashboard** (2-3 weeks)

**UI Components:**
- ✅ Dispatch queue view
- ✅ Incident classification modal
- ✅ Multi-agency dispatch modal
- ✅ Real-time map view
- ✅ Agency status panel

**Features:**
- ✅ Manual override
- ✅ Template system
- ✅ Bulk dispatch
- ✅ Incident reassignment

---

### **Phase 3: Resident App Update** (1-2 weeks)

**Changes:**
- ✅ Remove agency selection
- ✅ Add severity indicators
- ✅ Add casualty estimation
- ✅ Simplified form
- ✅ Multi-agency tracking

**Testing:**
- ✅ User acceptance testing
- ✅ Response time measurement

---

### **Phase 4: Intelligence & Optimization** (3-4 weeks)

**Advanced Features:**
- ✅ Machine learning classification
- ✅ Predictive dispatch
- ✅ Historical pattern analysis
- ✅ Resource optimization
- ✅ Performance analytics

**ML Model:**
```typescript
// Train on historical data
const model = trainClassifier({
  features: ['description', 'location', 'time', 'keywords'],
  labels: ['incident_type', 'severity', 'required_agencies']
});

// Use for auto-classification
const prediction = model.predict(newIncident);
```

---

## Key Features

### **1. Auto-Classification**
- NLP analysis of incident description
- Keyword matching (fire, accident, robbery, etc.)
- Location-based risk assessment
- Time-based severity adjustment
- Historical pattern matching

### **2. Smart Dispatch**
- Multi-agency coordination
- Optimal station selection
- Resource availability check
- ETA calculation
- Automatic escalation

### **3. Real-Time Coordination**
- Live incident map
- Agency status dashboard
- Cross-agency communication
- Resource tracking
- Performance metrics

### **4. Dispatcher Tools**
- Override auto-classification
- Manual agency assignment
- Template-based dispatch
- Incident reassignment
- Priority adjustment

---

## Migration Strategy

### **Backward Compatibility**

**Option 1: Parallel Systems** (Recommended)
- Keep current agency-specific reporting
- Add new centralized dispatch
- Gradual migration over 3-6 months
- Dispatchers can handle both flows

**Option 2: Hybrid Mode**
- Residents can choose:
  - "Emergency Dispatch" (new system)
  - "Report to Agency" (old system)
- Track usage and migrate gradually

**Option 3: Full Cutover**
- Train all dispatchers
- Update all apps simultaneously
- Big bang migration
- Higher risk but faster

---

## Success Metrics

### **Performance KPIs**
- ⏱️ **Response Time**: Target < 5 min for critical
- 🎯 **Classification Accuracy**: > 90%
- 🚨 **Multi-Agency Coordination**: < 2 min delay
- 📊 **Resource Utilization**: > 80%
- ✅ **First-Call Resolution**: > 95%

### **User Satisfaction**
- Resident satisfaction score
- Agency coordination rating
- Dispatcher workload assessment
- System uptime (99.9% target)

---

## Cost-Benefit Analysis

### **Costs**
- Development: 8-12 weeks
- Training: 2-4 weeks
- Infrastructure: Minimal (use existing)
- Ongoing: Dispatcher salaries

### **Benefits**
- ⚡ **30-50% faster response times**
- 🤝 **Seamless multi-agency coordination**
- 📈 **Better resource utilization**
- 💰 **Reduced redundant dispatches**
- 🎯 **Improved incident outcomes**
- 📊 **Data-driven decision making**

---

## Conclusion

This centralized dispatch system transforms your incident management from **agency-centric** to **incident-centric**, similar to how 911 operates. The key advantages:

1. **Single Point of Contact**: Residents don't need to know which agency to call
2. **Intelligent Routing**: AI-powered classification and dispatch
3. **Multi-Agency Coordination**: Automatic coordination for complex incidents
4. **Optimal Resource Allocation**: Best station/unit selection
5. **Faster Response**: Reduced decision time, parallel dispatch

**Recommendation**: Start with **Phase 1** to build the foundation, then iterate based on real-world usage and feedback.
