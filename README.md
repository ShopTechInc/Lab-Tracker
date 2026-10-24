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
2. In **Setup > Shop layout**, set how many booths the shop has and tap the ones used for storage.
3. In **Setup > Classes and booths**, add each class with its start and end times. Each student gets a random code like `K7Q4`.
4. Add your projects and their checkpoints in **Setup > Projects and checkpoints**.
5. Export the roster (**Setup > Export roster**) and import it into the **Roster** tab of the Sheet. Type each student's name next to their code on the **Key** tab.
6. Make a backup (**Setup > Export and backup > Back up everything to a file**) and save it to your school Drive.

## In class

- **Class tab:** tap a booth, then tap what happened. An Undo shows for a few seconds. Use **Select several** to log one thing for a group. Notes, actions taken (warnings, parent contact) and tasks are in the same panel.
- **Class day:** logging anything marks the day as a class day. On a day with nothing to log, tap **Log today as a class day** so the day still counts toward employability.
- **Checkpoints tab:** tap a student's cell, take a photo of the weld if you want one, then tap Approved, Needs work or Redo. Frame the weld only. Approving credits the checkpoint's earned hours (see below). The grid scrolls inside its own box, so the checkpoint names stay along the top and the booth and code stay on the left. Projects every student has finished are grouped at the bottom of the project list under **Everyone done**; **Hide** takes a project off the tab without touching its records.
- **Cleanup tab:** every booth and shared area starts clean. Tap the ones left dirty, pick what was wrong, then **Save cleanup check**. For a booth left in bad shape, tap **Major mess**, take up to four photos and add a short factual note (see below).
- **Reports tab:** today, this week, this month or any dates, for one class or all of them.

## Shared areas (class grade)

The Cleanup tab lists the shop's shared areas under the booths: fab tables, floor, tool crib, grinding station, saws and cutting, and scrap and recycling bins by default. Edit the list in **Setup > Cleanup check**. Tap an area that was left dirty to add a note or photos. It's saved with the booth check.

Shared areas are a **class grade only**: no student loses points. The class's grade is the share of area checks that passed. It shows on the Reports tab, in the Classes comparison, and in the Sheet's Classes tab. To credit a student who cleaned up, use the **Cleaned communal areas** code.

## Earned hours

Each checkpoint can carry a number of earned hours, set in **Setup > Projects and checkpoints**, for example Root pass 2. When you approve a checkpoint, the student is credited those hours.

- **Rework:** before you tap Approved, use **−** and **+** (a quarter hour per tap) to credit more or less than the standard. The sheet shows how many Redo and Needs work entries are on record to help you decide.
- **Taking hours back:** marking an approved checkpoint Needs work or Redo takes its hours back. Approving it again credits them again.
- **Where it shows:** the Checkpoints grid (each checkpoint's standard under its name, each student's project total in the last column), the student's history, the Reports tab, the Sheet's Students and Classes tabs, and the **Lab work and earned hours** PDF from the student's history.
- **What it is:** these are earned hours, like flat-rate book time, not clock time. Every change is its own entry, so the record shows when hours were credited, adjusted or taken back. Ask your WBL coordinator whether earned hours can be reported as WBL hours.

Checkpoints approved before version 1.3 aren't credited. To credit one, open it and tap Approved again.

## Lab work across years, and credentials (NC3)

**A student's lab work:** open their history (tap their booth, then **Full history**, or tap their row on the Reports tab). **Lab work, all years** lists every project they've worked on, in any class or school year, with each checkpoint's status and approval date. Tap a checkpoint to approve it right there. That's how a student finishes last year's project this year without putting the old project back on a class grid.

**Credentials:** in **Setup > Credentials**, add one (for example "NC3 GMAW practical") and tick the projects that count. A student is ready when every checkpoint in each of those projects is approved, in any class or year. You'll see it:
- in the student's history, as Ready or "2 of 5", with what's still to do
- on the **Reports** tab, in a Credentials table of current students, ready first (lab work from any year counts, whatever the date range)
- in the **Lab work and earned hours** PDF, with the date the last project was approved and the remaining checkpoints

Hidden projects still count toward credentials.

## Storage booths and shared booths

**Storage:** in **Setup > Shop layout**, tap a booth number to switch it to storage. Storage booths show hatched on the Class and Cleanup tabs, in their place in the row, so the grid still matches the room. A student can't be put in a storage booth, and a booth with students in it can't be switched to storage until they're moved.

**Two or three students in one booth:** give them the same booth number in **Setup > Classes and booths**. They show as 13A and 13B (or 13C), grouped in one outlined box on the Class tab. Each keeps their own code, so tapping 13B logs only to 13B. **Add a student** fills empty welding booths first and only then doubles up.

**When a shared booth is left dirty:** the Cleanup tab shows one tile per booth. Tap it and both students are marked responsible by default. Tap a student to unmark them if the mess was the other student's. Each student still marked gets the full points. The entry records that the booth was shared and who was marked, so the Sheet's Shared booth column and the PDF record say "only this student was marked responsible" or "every student in it was marked responsible." Photos of a shared booth are stamped with the booth and class but no codes, so they can go in either student's record.

## Documenting a booth left in bad shape

1. On the **Cleanup** tab, tap the booth, then tap **Major mess** (−3 by default; a plain dirty booth is −1).
2. Tap **Take a photo of the booth**. The camera opens directly, so each photo is taken in the moment, not picked from the camera roll. Add up to four.
3. Each photo gets a strip along the bottom with the booth, code, class, date and time, so it explains itself if it's attached to a referral. Location data from the camera is removed.
4. Add a note with what you saw, in plain facts. Parents can request these records.
5. Keep students out of the frame. The photo is of the booth.

**Patterns:** if a student is about to reach 3 dirty booths in 30 days, the booth sheet warns you before you save. After saving, a banner names the student's booth and links to their history. Change the numbers in **Setup > Booth cleanup check**.

**Record for a conference or referral:** open the student's history (tap their booth on the Class tab, then **Full history**, or tap their row on the Reports tab) and choose **Export record (PDF)**. You can export a **Booth cleanup record**, the **Full record**, or **Lab work and earned hours**. The PDF lists every entry with its date and time, notes and photos, plus a summary with counts and the most common problems. It shows the code, with a blank line where you write the name from the Key tab. Entries removed in the app are left out. If some of the record's photos were cleared from the phone, the app asks for them: tap **Choose photos**, then pick them from Drive with **Browse** (not your photo library). You can select a whole week's photos, or a photo ZIP; it takes only the ones the record needs, matched by name. Or make the record without them, and it lists their file names instead.

## Every week: export to the Sheet

1. In the app: **Setup > Export and backup > Export log and new photos**, then **Save files**. In the share screen, pick Google Drive and your **school** account, and save everything to one folder (a "Shop photos" folder works well).
2. In the Sheet: open the **Events** tab, then **File > Import**, pick the CSV, and choose **Replace current sheet**.
3. When students or booths change, export the roster and import it the same way into the **Roster** tab.

**Photos** go out with the log as ordinary photo files, every photo not sent before. Each file name matches the Photo column in the log, for example `2026-10-20_Welding-I_D8XK_booth-10_major_1-9206.jpg`, and contains the student's code, so searching Drive for a code finds that student's photos. **Export photos again** resends them (as a ZIP too, for a computer; Drive itself can't open a ZIP). Once they're in Drive, **Free space: delete photos already exported** clears them off the phone; records can still pull them back from Drive.

The app reminds you when a week has passed since the last export. Anything not exported lives only on the phone.

If you imported older entries (see below), the log export includes them, so **Replace current sheet** still keeps everything.

**Blank row between every line?** Files from versions before 1.3.2 used Windows line endings, which some apps read as two line breaks. 1.3.2 and later don't. Blank rows in the Events tab don't change any totals. In the Roster tab they leave matching gaps on the Students and Checkpoints tabs, so after updating, export the roster again and import it with **Replace current sheet**.

## New school year

At the end of a school year, open **Setup > New school year > Start a new school year**. Nothing changes until the last tap.

1. **Save this year first:** export the log and make a backup from the buttons at the top.
2. **Where each class goes:** the first guess is that each class moves up to the next one in the list and the last one leaves (Welding I to Welding II, II to III, III graduates). Change any of them. Under **Students who don't follow their class**, set exceptions, such as a student who isn't coming back or one who repeats.
3. **New students:** how many each class gets. Each gets a new code.
4. **First day** of the new year.

Then tap **Start the new year**. Continuing students keep their codes in their new class, so their Key tab rows still work and their lab work, credential progress, earned hours and history come along. Everyone else moves to Former students. Nothing is deleted. Continuing students take the first open booths in their old order; change the numbers in Setup if they sit elsewhere. **Undo the new year** stays on screen until you close it.

**Your Sheet:** before the first export of the new year, keep a copy for the record (**File > Make a copy**, named for last year). Then keep using your Sheet: from then on, the log and roster exports cover only the new school year, and the Key tab keeps every name. Set the Start tab's dates to the new year, export the roster, import it into the Roster tab with **Replace current sheet**, and type names next to the new codes. **Export the log for all years** (in the same Setup section) gives you everything if you ever need it.

**Projects** stay as they are. New students start with an empty grid; continuing students keep their approvals. Hide the projects you won't use.

## Where the codes live, and how to keep them

Codes, booths and entries live in the phone's browser storage, not in the files on GitHub. Updating the app replaces only the app's own files and never changes a code. What erases the phone's storage:

- deleting the home-screen icon (on iPhone this erases the app's data), or clearing Safari or Chrome website data
- opening the site in the browser instead of from the icon: on iPhone the browser and the icon keep separate storage, so the browser copy starts empty
- a different phone or browser

To be safe:

1. **Back up before every update** (Setup > Export and backup > **Back up everything to a file**, saved to your school Drive). The update banner has a **Back up** button for this. Setup shows when you last backed up.
2. **Always open the app from the same home-screen icon.** Never delete it to force an update.
3. **If the app ever opens to the first screen** ("Track the shop from your pocket"), **don't set up a class.** That gives every student a new random code. Use **Used this app before?** on that screen instead (next section).

## New phone, or the app lost its data

**With a backup file:** install the app, then choose **Restore from a backup file** on the first screen. Everything comes back, photos included.

**Without one, from your Sheet:**

1. **Import roster from your Sheet** (first screen, or Setup > Export and backup). In the Sheet, open the **Roster** tab, select columns A to F with the header row, copy, paste into the app and tap **Check**. Or download that tab as a CSV (File > Download > Comma-separated values) and choose the file. The preview shows what will change before anything is saved.
2. **Import older log** (Setup > Export and backup). Choose the newest `shop-log` CSV you exported to Drive, or copy the Sheet's **Events** tab. Those entries then go out with every log export, so the weekly **Replace current sheet** keeps them. The app's own Reports and PDF records start with what's logged on the phone.
3. Add your projects and checkpoints again in Setup, then make a backup.

**If you already set classes up again with new codes:** import the roster anyway. Booth by booth, each student in the roster takes the place of the new-code student in the same booth, along with anything logged under the new code since. If you set a class up under a different name, pick it under **Match classes** in the preview and it's renamed to match the roster. Students on the phone who aren't in the roster are removed (or moved to Former students if they have entries); you can untick that.

**One student:** Setup > Classes and booths > **Change** next to the student > **Use a code from your Sheet**. Type the code from the Key tab. Their entries move to that code. Photos keep the code they were taken under in their stamp and file name, and the PDF record notes the change.

Only class, booth, code, start date, active and side are read from a roster. Any other column, such as names, is skipped and never stored. If the Roster tab in your Sheet has already been replaced with the new codes, open **File > Version history > See version history** in the Sheet on a computer, pick a version from before the reset, and choose **Make a copy** from its ⋮ menu. Copy the Roster tab (and, if needed, the Events tab) from that copy. Or enter the Key tab's codes one student at a time.

## Updating the app

1. **Back up first.** In the app: **Setup > Export and backup > Back up everything to a file** (or tap **Back up** on the update banner), and save it to your school Drive. Updates keep everything on the phone; the backup is insurance in case the phone loses its storage some other way.
2. **Upload.** On github.com, open the `shop-tracker` repository, click **Add file > Upload files**, and drag in every file from the new folder, including the `icons` folder. Same names replace the old files. Click **Commit changes**.
3. **Wait for the site.** Open the **Actions** tab. When the newest "pages build and deployment" run shows a green check (usually 1 to 2 minutes), the site is updated. GitHub can keep serving the old files for up to 10 minutes more, so if the next step doesn't work, wait and try again.
4. **Update the phone.** With signal, open the app from its home-screen icon. It checks for a new version every time it opens. After a few seconds, **A new version of the app is ready** appears at the top of the screen. Tap **Reload**.
5. **No banner?** Close the app completely (swipe it away in the app switcher), wait a minute, and open it again. If a booth or entry panel is open when the download finishes, the banner shows up after your next tap.
6. **Check it worked.** **Setup > How your data is kept** shows the version number at the bottom.

Don't delete the home-screen icon or clear Safari or Chrome data to force an update: that erases everything on the phone, codes included. If the banner won't come, follow step 5 again or check the version from step 6.

After updating to version 1.2 or later from an earlier version, open **Setup > Shop layout**: the app guesses the booth count from your highest booth number, so check it and tap your storage booths.

## For district IT

- **Architecture:** static files only. No backend, database server, accounts, analytics or third-party scripts.
- **Network:** `index.html` sets a Content-Security-Policy with `connect-src 'none'`, `form-action 'none'` and `script-src 'self'`, so the page can't send data to any server. The only traffic is the browser loading these files, plus the service worker caching them.
- **Data on the device:** IndexedDB in the teacher's browser. It holds class names, booth numbers, random 4-character codes (letter, digit, then two random characters; not derived from any student data), behavior and checkpoint entries, short notes, and weld photos.
- **Not collected:** names, student IDs, birthdates, contact details, location.
- **Photos:** weld photos (project checkpoints) and booth photos (cleanup checks). Resized and re-encoded on the device, which removes EXIF data including GPS. By default a caption with booth number, code, class, date and time is drawn onto the image. Teachers are told to keep students out of the frame.
- **PDF records:** built on the device from the same data, with no network use. Codes only, no names.
- **Export:** only when the teacher taps an export button. It produces CSV, ZIP, PDF or JSON files through the device's share sheet or a download. The intended destination is the district Google Workspace.
- **Import:** the teacher can paste or pick a roster or log CSV taken from their own Sheet, read on the device with no network use. From a roster only class, booth, code, start date, active and side are kept; other columns, such as names, are dropped while reading and never stored. Imported log rows are the app's own export columns.
- **Code-to-name key:** kept only in the teacher's Google Sheet in district Google Workspace.
