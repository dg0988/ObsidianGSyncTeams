An add-on for [GSync](https://community.obsidian.md/plugins/gsync), the free two-way Google Drive sync plugin for Obsidian. GSync Teams is for businesses that keep their documentation in Google Drive.

**Shared Drives.** Sync a vault folder with a folder in a Shared Drive (`Shared drives/<drive name>/<folder>`), so documentation belongs to the business, not to one person's account.

**Manage access.** See who can open each synced folder. Add people by email as Viewer, Commenter or Editor (or Content manager / Manager in Shared Drives), change their role, or remove them, without leaving Obsidian. Google Drive enforces these roles in every app: viewers get every update but can't change the team's files.

GSync does all the syncing. GSync Teams plugs into it and never syncs files itself.

## License

One-time payment, no subscription. Each user can use GSync Teams on 2 devices, such as a computer and a phone.

| Users | Devices | Price |
|---|---|---|
| 3 | 6 | $49 |
| 10 | 20 | $156 |
| 30 | 60 | $400 |

Any number from 3 to 30 users. Buy at [idcomm.tech/gsync-teams](https://idcomm.tech/gsync-teams). Your key appears right after payment and is emailed to you. Paste it in **Settings → GSync Teams** and tap **Activate**.

## Requirements and disclosures

- **Requires GSync 1.1.0 or later**, installed, enabled and signed in to Google.
- **Payment required.** GSync Teams needs a paid license key. Without one, it does nothing.
- **Google Workspace** is needed for Shared Drives. Managing access also works for folders in an ordinary My Drive.
- **Network use.** GSync Teams connects to:
  - **The GSync Teams activation server** (`gsync-teams.dima0988.workers.dev`), to activate a device, list or remove a license's devices, and renew an activation about once a month. It sends the license key, a random device ID created by this plugin, and a device type such as "Android" or "Windows PC". Nothing about your vault, notes or Google account is sent.
  - **Google Drive** (`www.googleapis.com`), through GSync's sign-in, to look up Shared Drives and to read or change who has access to a folder, only when you use those features.
- **Works offline** after activation. A device can go up to 120 days without connecting.
- **No telemetry, analytics or ads.**
