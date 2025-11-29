# iReport Admin Dashboard

Electron-based desktop application for LGU emergency response management.

## Features

- **Offline-first**: Works without internet, syncs when connected
- **Real-time updates**: Receives new incidents via Supabase realtime
- **Conflict resolution**: Last-write-wins with full audit trail
- **Local database**: SQLite for fast, reliable local storage
- **Status management**: Update incident status with notes

## Tech Stack

- **Electron** - Desktop app framework
- **React** - UI library
- **SQLite** (better-sqlite3) - Local database
- **Supabase** - Cloud sync & realtime
- **Tailwind CSS** - Styling
- **TypeScript** - Type safety

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
cd admin
npm install
```

### Development

```bash
npm run dev
```

### Build for Production

```bash
# Windows
npm run package:win

# macOS
npm run package:mac

# Linux
npm run package:linux
```

## Sync & Conflict Resolution

### How it works:

1. **Local-first**: All changes are saved to local SQLite first
2. **Sync queue**: Changes are queued for cloud sync
3. **Periodic sync**: Every 30 seconds + on-demand
4. **Conflict resolution**: 
   - Uses `updated_at` timestamps
   - Cloud version wins if newer
   - All changes logged to `status_history` (append-only)
   - Full audit trail preserved

### Status History (Append-only)

Status changes are never overwritten. Each change creates a new entry:

```sql
INSERT INTO status_history (incident_id, status, notes, changed_by, changed_at)
VALUES (?, ?, ?, ?, ?)
```

This ensures:
- Complete audit trail
- No data loss from conflicts
- Accountability for all changes

## Database Schema

### Local Tables

- `incidents` - Mirrored from Supabase
- `status_history` - Append-only status changes
- `sync_queue` - Pending changes to sync
- `users` - Agency user accounts
- `audit_log` - All admin actions
- `sync_meta` - Sync timestamps

## Project Structure

```
admin/
├── src/
│   ├── main/           # Electron main process
│   │   ├── index.ts    # App entry, IPC handlers
│   │   ├── database.ts # SQLite setup
│   │   └── sync.ts     # Cloud sync logic
│   ├── preload/        # Context bridge
│   │   └── index.ts    # Expose APIs to renderer
│   └── renderer/       # React UI
│       ├── components/
│       ├── pages/
│       └── styles/
├── package.json
└── electron.vite.config.ts
```

## Security

- Context isolation enabled
- Node integration disabled
- Preload scripts for safe IPC
- No direct database access from renderer
