# Multiply Masters — Year 5

A timed multiplication fluency app with student profiles, personal bests, a class leaderboard, editable roster, teacher dashboard and CSV export.

## Fastest setup

1. Create a new GitHub repository.
2. Upload everything in this folder.
3. In Supabase, open SQL Editor and run `supabase.sql`.
4. In Supabase Project Settings → API, copy the project URL and anon key.
5. In Vercel, import the GitHub repository.
6. Add these Environment Variables in Vercel:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_TEACHER_PIN` (choose your own number)
7. Deploy.

## Local testing

```bash
npm install
npm run dev
```

Without Supabase details, the app works in local-browser practice mode. Scores will stay only on that device. With Supabase connected, scores from student iPads appear in the teacher dashboard on your laptop.

## Important classroom note

The included Supabase policies are deliberately simple for an easy classroom prototype. Students do not see the dashboard without the PIN, but the PIN is front-end protection rather than high-security authentication. Do not store sensitive information in this app. Use first names only or student aliases.

## Preloaded class

The app includes 29 Year 5 student first names and uses teacher PIN `3983` by default.


## Existing students table
This version deliberately uses `public.multiplication_students` so it will not conflict with a `public.students` table from another app.

## August 2026 update
- Teacher dashboard now shows round time, accuracy, correct facts and facts per minute.
- Student progress table includes average accuracy, best facts per minute and the student's latest round length.
- Question generation now uses a shuffled deck of unique multiplication facts. A fact will not repeat until the available facts for the selected tables have been used.
- Teacher mode is now rendered separately from student play and clears any selected student when opened.
- No Supabase schema change is required for this update; existing `duration_seconds` and `accuracy` attempt data is used.


## Sync fix / live teacher results
If student rounds appear on the iPad but not on the teacher dashboard, run `supabase-sync-fix.sql` once in Supabase SQL Editor. The app now shows a save confirmation after every round and the teacher dashboard refreshes from Supabase every 5 seconds.
