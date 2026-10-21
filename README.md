# Weld Shop Tracker

A phone app for tracking employability, booth cleanup and project checkpoints in a welding shop. It works with no signal, has no server or account, and identifies students only by booth number and a random code. Names stay in your school Google Sheet.

## What's in this folder

| File | What it is |
|---|---|
| `index.html`, `app.js`, `app.css` | The app |
| `sw.js` | Lets the app open with no signal after the first visit |
| `manifest.webmanifest`, `icons/` | Home-screen name and icon |

These are plain files. Any web host can serve them. The steps below use GitHub Pages because it's free and needs only a browser.

## Put it online (one time, about 10 minutes)

The site holds only the app's code. No student data ever goes to it, because the app keeps everything on your phone. If district IT would rather host the files on a district web server, give them this folder; nothing below changes.

1. Sign in at github.com (or create a free account).
2. Click **New repository**. Name it `shop-tracker`, leave it **Public**, and click **Create repository**.
3. On the next page click **uploading an existing file**. Drag in every file from this folder, including the `icons` folder. Click **Commit changes**.
4. Open **Settings > Pages**. Under **Branch**, pick `main` and `/ (root)`, then **Save**.
5. After a minute or two the app is live at `https://YOUR-USERNAME.github.io/shop-tracker/`.

## Install it on your phone

Open that address on your phone while you have signal.

- **iPhone (Safari):** Share button > **Add to Home Screen**.
- **Android (Chrome):** menu > **Install app** (or **Add to Home screen**).

Open it from the home-screen icon from then on. That's what lets it start with no signal, and it keeps the phone from clearing the app's storage.

## First setup

1. Open the app and choose **Set up your first class**, or load the sample data to try it first. Erase the sample from **Setup > Export and backup** when you're done.
2. In **Setup > Classes and booths**, add each class with its start and end times. Each booth gets a random code like `K7Q4`.
3. Add your projects and their checkpoints in **Setup > Projects and checkpoints**.
4. Export the roster (**Setup > Export roster**) and import it into the **Roster** tab of the Sheet. Type each student's name next to their code on the **Key** tab.

## In class

- **Class tab:** tap a booth, then tap what happened. An Undo shows for a few seconds. Use **Select several** to log one thing for a group. Notes, actions taken (warnings, parent contact) and tasks are in the same panel.
- **Class day:** logging anything marks the day as a class day. On a day with nothing to log, tap **Log today as a class day** so the day still counts toward employability.
- **Checkpoints tab:** tap a student's cell, take a photo of the weld if you want one, then tap Approved, Needs work or Redo. Frame the weld only.
- **Booths tab:** every booth starts clean. Tap the ones left dirty, pick what was wrong, then **Save booth check**. For a booth left in bad shape, tap **Major mess**, take up to four photos and add a short factual note (see below).
- **Reports tab:** today, this week, this month or any dates, for one class or all of them.

## Documenting a booth left in bad shape

1. On the **Booths** tab, tap the booth, then tap **Major mess** (−3 by default; a plain dirty booth is −1).
2. Tap **Take a photo of the booth**. The camera opens directly, so each photo is taken in the moment, not picked from the camera roll. Add up to four.
3. Each photo gets a strip along the bottom with the booth, code, class, date and time, so it explains itself if it's attached to a referral. Location data from the camera is removed.
4. Add a note with what you saw, in plain facts. Parents can request these records.
5. Keep students out of the frame. The photo is of the booth.

**Patterns:** if a student is about to reach 3 dirty booths in 30 days, the booth sheet warns you before you save. After saving, a banner names the student's booth and links to their history. Change the numbers in **Setup > Booth cleanup check**.

**Record for a conference or referral:** open the student's history (tap their booth on the Class tab, then **Full history**, or tap their row on the Reports tab) and choose **Export record (PDF)**. You can export a **Booth cleanup record** or the **Full record**. The PDF lists every entry with its date and time, notes and photos, plus a summary with counts and the most common problems. It shows the code, with a blank line where you write the name from the Key tab. Entries removed in the app are left out. Photos you've already exported and cleared from the phone are listed by file name so you can find them in Drive.

## Every week: export to the Sheet

1. In the app: **Setup > Export and backup > Export log**. In the share screen, pick Google Drive and your **school** account.
2. In the Sheet: open the **Events** tab, then **File > Import**, pick the CSV, and choose **Replace current sheet**.
3. When students or booths change, export the roster and import it the same way into the **Roster** tab.
4. Weld and booth photos export as one ZIP (**Export weld photos**). File names match the Photo column in the log, and booth photos are named like `2026-10-20_Welding-I_D8XK_booth-10_major_1-9206.jpg`. Once they're in Drive, **Free space: delete photos already exported** clears them off the phone.

The app reminds you when a week has passed since the last export. Anything not exported lives only on the phone.

## New phone

On the old phone: **Setup > Back up everything to a file** and save it to your school Drive. On the new phone, install the app, then choose **Restore from a backup file** on the first screen.

## Updating the app

Upload new versions of the files to the same repository, replacing the old ones. The app shows **A new version is ready** the next time it opens with signal; tap **Reload**. Everything already on the phone carries over.

## For district IT

- **Architecture:** static files only. No backend, database server, accounts, analytics or third-party scripts.
- **Network:** `index.html` sets a Content-Security-Policy with `connect-src 'none'`, `form-action 'none'` and `script-src 'self'`, so the page can't send data to any server. The only traffic is the browser loading these files, plus the service worker caching them.
- **Data on the device:** IndexedDB in the teacher's browser. It holds class names, booth numbers, random 4-character codes (letter, digit, then two random characters; not derived from any student data), behavior and checkpoint entries, short notes, and weld photos.
- **Not collected:** names, student IDs, birthdates, contact details, location.
- **Photos:** weld photos (project checkpoints) and booth photos (cleanup checks). Resized and re-encoded on the device, which removes EXIF data including GPS. By default a caption with booth number, code, class, date and time is drawn onto the image. Teachers are told to keep students out of the frame.
- **PDF records:** built on the device from the same data, with no network use. Codes only, no names.
- **Export:** only when the teacher taps an export button. It produces CSV, ZIP, PDF or JSON files through the device's share sheet or a download. The intended destination is the district Google Workspace.
- **Code-to-name key:** kept only in the teacher's Google Sheet in district Google Workspace.
