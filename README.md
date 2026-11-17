# GSync Teams

An add-on for [GSync](https://community.obsidian.md/plugins/gsync), the free two-way Google Drive sync plugin for Obsidian. GSync Teams is for businesses that keep their documentation in Google Drive:

- **Shared Drives**: let GSync sync a vault folder with a folder in a Shared Drive (`Shared drives/<drive name>/<folder>`), so documentation belongs to the business, not to one person's account.
- **Manage access**: see who can open each synced folder, add people by email as Viewer, Commenter or Editor (or Content manager / Manager in Shared Drives), change roles, or remove access, without leaving Obsidian. Google Drive enforces these roles in every app.

GSync does all the syncing. GSync Teams never syncs files itself; it plugs into GSync.

---

## Requirements and disclosures

- **Requires GSync 1.1.0 or later**, installed, enabled and signed in to Google.
- **Payment is required for full access.** GSync Teams needs a paid license key. Without one, it does nothing.
- **Network use.** GSync Teams connects to:
  - **The GSync Teams activation server** (`gsync-teams.dima0988.workers.dev`): to activate a device, list or remove a license's devices, and renew an activation about once a month. It sends the license key, a random device id created by this plugin, and a device type such as "Android" or "Windows PC". Nothing about your vault, notes or Google account is sent.
  - **Google Drive** (`www.googleapis.com`), through GSync's sign-in: to look up Shared Drives and to read or change who has access to a folder, only when you use those features.
- **Google account required**, through GSync. Shared Drives need a Google Workspace plan.
- **Works offline** after activation. A device can go up to 120 days without connecting.
- **No telemetry, analytics or ads.**

---

## Pricing

One payment, no subscription. Each user can use GSync Teams on **2 devices** (for example a computer and a phone).

| Users | Devices | Price | Per user |
|---|---|---|---|
| 3 | 6 | $49 | $16.33 |
| 5 | 10 | $81 | $16.20 |
| 10 | 20 | $156 | $15.60 |
| 15 | 30 | $225 | $15.00 |
| 20 | 40 | $289 | $14.45 |
| 30 | 60 | $400 | $13.33 |

Any number from 3 to 30 users. **Buy at [idcomm.tech/gsync-teams](https://idcomm.tech/gsync-teams).** Your key appears right after payment and is emailed to you. For more than 30 users, use the contact form on that site.

---

## Setup

1. **Install GSync** from Community plugins, sign in, and set up syncing (see the [GSync README](https://github.com/dg0988/ObsidianGSync#readme)).
2. **Install GSync Teams** from Community plugins (search **GSync Teams**) and enable it.
3. Open **Settings → GSync Teams**, paste your license key, and tap **Activate**. This uses one of your license's device slots and needs internet once.
4. In **Settings → GSync → More folders**, add a folder pair whose Drive folder is in a Shared Drive, for example vault `Clients` with `Shared drives/Acme/Clients`.
5. To manage access, tap the people icon next to a folder in GSync's settings, use **Manage access** in GSync Teams' settings, or run **GSync Teams: Manage access to a synced folder** from the command palette.

Repeat steps 1–3 on each device.

### Devices

- After activation, GSync Teams works offline. It renews the activation in the background about once a month while online; an activation lasts 120 days without internet.
- **Settings → GSync Teams → Show devices** lists the devices using your license. **Remove** frees a slot from a lost or replaced device. **Deactivate** frees this device's slot.
- The device id is stored on each device, outside the vault, so syncing a vault (with GSync's settings sync, Google Drive for Desktop or anything else) never copies one device's activation to another.

---

## How access roles work

| Role | In Obsidian with GSync |
|---|---|
| Viewer, Commenter | Gets every change from Drive. Edits stay on their device as "(local edit …)" copies; nothing is uploaded. |
| Editor | Two-way sync. |
| Content manager, Manager (Shared Drives) | Two-way sync, and can change who has access. |

People who had access from a parent folder or the Shared Drive itself are shown as inherited; change those in the parent folder or the Shared Drive's settings.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| "Install and enable GSync first" | GSync Teams only adds features to GSync. Install GSync from Community plugins and enable it. |
| "Update GSync" | This version of GSync Teams needs a newer GSync. |
| "All N devices for this license are in use" | Remove a device you no longer use under **Show devices**, or buy a license with more users. |
| "This device was removed from the license" | Someone removed this device under **Show devices**. Tap **Activate** to use a slot again. |
| `Shared drive "…" not found` | Use the Shared Drive's exact name after `Shared drives/`, and check that your Google account is a member. |
| "Couldn't change access" | Your role in that folder can't share it. Ask the folder's owner or a Shared Drive manager. |

---

## Development

```
npm install
npm test        # unit tests
npm run build   # type-check + production build -> main.js
```

`src/gsync-api.ts` is a copy of GSync's add-on interface (`src/api.ts` in the GSync repo); keep them in step. The Stripe store and activation server live in [`sales-worker/`](sales-worker/DEPLOY.md).

### Releasing

1. Update `version` in `manifest.json` and `package.json`, and add it to `versions.json`.
2. Commit and push.
3. Publish a GitHub release whose tag exactly matches the version (e.g. `1.0.1`). The workflow builds `main.js`, attests it, and attaches `main.js` and `manifest.json`.

---

## License

[MIT](LICENSE) © ID Communications LLC