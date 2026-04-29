📝 SyllogosHub Project Context & Resume
Project Overview:
Το SyllogosHub είναι μια Web εφαρμογή διαχείρισης πολιτιστικών συλλόγων.
Stack: Next.js 14+ (App Router), TypeScript, Tailwind CSS, Supabase (DB & Auth).
Τρέχουσα Κατάσταση (Current Progress):
Dashboard: Λειτουργικό με στατιστικά για Μέλη, Έσοδα Μήνα και Εκκρεμότητες.
Μητρώο Μελών: Πλήρες CRUD. Προσοχή: Η βάση άλλαξε πρόσφατα από full_name σε first_name & last_name και ο κώδικας χρειάζεται refactor.
Πλάνο Τραπεζιών (Seating): Υλοποιημένο με Realtime συγχρονισμό, drag-and-drop παρεών και διαχείριση εκδηλώσεων.
Database (Supabase): Πίνακες members, payments, events, reservations. Το RLS είναι προσωρινά απενεργοποιημένο (Unrestricted).
Αρχεία Κλειδιά:
app/members/page.tsx: Διαχείριση μελών (χρειάζεται διόρθωση στα πεδία ονόματος).
app/seating/page.tsx: Το σύστημα των τραπεζιών (1100+ γραμμές κώδικα).
lib/supabase/types.ts: Τα TypeScript types του project.
TODO.md: Η πλήρης λίστα των επόμενων βημάτων (Εκδηλώσεις, Οικονομικά, Messaging).
Οδηγία για τον Claude:
"Διάβασε τον κώδικα στα παραπάνω αρχεία για να καταλάβεις τη δομή. Πρώτη προτεραιότητα είναι η διόρθωση του Μητρώου Μελών (first_name/last_name) και μετά η υλοποίηση του Module Εκδηλώσεων σύμφωνα με το TODO.md."

----------------------------
"Target Client / Beta Tester: Ένωση Κρητών Αιγάλεω. Ανάγκη για διαχείριση πολλών χορευτικών τμημάτων, συνδρομών και μεγάλων χοροεσπερίδων."\