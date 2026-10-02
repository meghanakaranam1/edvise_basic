#!/usr/bin/env node
// Generates a simulated multi-sheet workbook structurally faithful to
// "Compass deidentified.xlsx", but with a real, consistent student ID (and
// consistent Last/First names) across every sheet — which the real
// deidentified file lacks — so the multi-sheet merge mechanism can actually
// be exercised end-to-end.
//
// Per the 2026-08-24 check-in with the advisor:
//   - Student ID / Student Number / Lunch ID are treated as the same value
//     across sheets (her explicit call: "let's keep it the same").
//   - Last Name + First Name are also kept consistent per student across
//     sheets, as a second, redundant identity signal.
//   - IDs are NOT small sequential integers (1, 2, 3) — she flagged that as
//     unrealistic — they're generated as a district-style numeric ID.
//   - Stage 1 covers the "most complete/ideal" sheets only: current + prior
//     year rosters, course enrollment, tardy log, and behavior log. iReady
//     Spanish, ELD Interim, and the mid-year survey are explicitly deferred
//     ("let's skip the three first").
//   - Distributions are intentionally realistic per the ABC (Attendance /
//     Behavior / Course performance) early-warning framework, with known,
//     fixed rates and a few deliberately-planted correlations (see the
//     answer-key file this script also writes) so specific analysis
//     questions have a verifiable expected answer — the advisor's plan for
//     testing the merge mechanism against "questions we already know the
//     answers to."
//
// Usage: node scripts/generate-simulated-dataset.js [outputDir]

const ExcelJS = require('exceljs')
const path = require('path')
const fs = require('fs')

const OUT_DIR = process.argv[2] || path.join(require('os').homedir(), 'Downloads')
const OUT_FILE = path.join(OUT_DIR, 'Compass simulated.xlsx')
const ANSWER_KEY_FILE = path.join(OUT_DIR, 'Compass simulated - answer key.md')

// ---------------------------------------------------------------------------
// Deterministic RNG so re-running this script reproduces the same dataset.
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
const rand = mulberry32(20260824)
const pick = arr => arr[Math.floor(rand() * arr.length)]
const weightedPick = pairs => {
  const total = pairs.reduce((s, [, w]) => s + w, 0)
  let r = rand() * total
  for (const [v, w] of pairs) { if ((r -= w) <= 0) return v }
  return pairs[pairs.length - 1][0]
}
const shuffle = arr => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1));[a[i], a[j]] = [a[j], a[i]] } return a }

// ---------------------------------------------------------------------------
const LAST_NAMES = ['Smith', 'Johnson', 'Garcia', 'Martinez', 'Rodriguez', 'Lopez', 'Hernandez', 'Gonzalez', 'Perez', 'Sanchez',
  'Ramirez', 'Torres', 'Flores', 'Rivera', 'Diaz', 'Cruz', 'Morales', 'Ortiz', 'Gutierrez', 'Chavez',
  'Ramos', 'Reyes', 'Nguyen', 'Kim', 'Patel', 'Tran', 'Vang', 'Ahmed', 'Mohamed', 'Chen',
  'Vasquez', 'Castillo', 'Jimenez', 'Moreno', 'Romero', 'Alvarez', 'Mendoza', 'Ruiz', 'Aguilar', 'Vargas']
const FIRST_M = ['Jose', 'Luis', 'Carlos', 'Juan', 'Miguel', 'David', 'Angel', 'Diego', 'Ethan', 'Noah',
  'Liam', 'Mason', 'Kai', 'Omar', 'Elias', 'Ivan', 'Marcus', 'Xavier', 'Tuan', 'Bao',
  'Jayden', 'Anthony', 'Jesus', 'Bryan', 'Eduardo']
const FIRST_F = ['Maria', 'Ana', 'Sofia', 'Valentina', 'Camila', 'Isabella', 'Guadalupe', 'Ximena', 'Emma', 'Olivia',
  'Ava', 'Mia', 'Zoe', 'Lily', 'Thu', 'Linh', 'Fatima', 'Amara', 'Jasmine', 'Daniela',
  'Alondra', 'Yesenia', 'Brianna', 'Aaliyah', 'Vanessa']
const HOME_LANGS = ['eng', 'spa', 'vie', 'chk', 'fra', 'ara', 'mya', 'amh']
const PACK_TEACHERS = ['DT', 'MQ', 'KE', 'SJ', 'FE', 'RM', 'MC', 'VE', 'CM', 'OD', 'BD', 'WD', 'CD', 'GS']
const RACE_CODES = [1, 2, 3, 4, 5, 6] // matches the real file's numeric coding; distribution weighted below
const MLL_VALUES = ['1: Non-ELL', '2: ELL', '3: Redesignated ELL', '4: Provisional ELL', '5: Exit']
const CMAS_LEVELS = ['Exceeded Expectations', 'Met Expectations', 'Approached Expectations', 'Partially Met Expectations', 'Did not yet meet expectations']

// The one deliberately-planted signal for a known-answer cross-dataset
// question (the advisor's example: "do students in [a specific teacher]'s
// classes show a different attendance trend than others?").
const SIGNAL_TEACHER = 'S. Alvarez'
const OTHER_TEACHERS = ['J. Nguyen', 'R. Patel', 'K. Johnson', 'M. Rivera', 'T. Brooks', 'D. Okafor', 'L. Turner', 'C. Walsh', 'E. Diaz', 'A. Morales']
const CLASS_NAMES = ['ELA 6', 'ELA 7', 'ELA 8', 'Math 6', 'Math 7', 'Math 8', 'Science 6', 'Science 7', 'Science 8', 'Social Studies', 'PE', 'Art', 'Band', 'Study Hall']

function pad(n, len) { return String(n).padStart(len, '0') }
function fmtDate(d) { return d.toISOString().slice(0, 10) }
function randomDateBetween(start, end) {
  return new Date(start.getTime() + rand() * (end.getTime() - start.getTime()))
}

// ---------------------------------------------------------------------------
// 1. Build the 24-25 roster with baked-in, documented ABC distributions.
const N_STUDENTS = 253
const GRADES = ['6', '7', '8']
// District-style ID base — not small sequential integers.
const ID_BASE = 348000
const ids24 = shuffle(Array.from({ length: N_STUDENTS }, (_, i) => ID_BASE + i * 3 + Math.floor(rand() * 3)))

const students24 = []
let signalTeacherRoster = []

for (let i = 0; i < N_STUDENTS; i++) {
  const gender = rand() < 0.5 ? 'F' : 'M'
  const last = pick(LAST_NAMES)
  const first = gender === 'F' ? pick(FIRST_F) : pick(FIRST_M)
  const grade = GRADES[i % 3]
  const id = ids24[i]

  // --- Deliberately-planted signal cohort: ~30 students, evenly spread across
  // grades, assigned to SIGNAL_TEACHER for one class period and given a much
  // lower chronic-absence rate than the rest of the school. ---
  const inSignalCohort = i % 8 === 0 // ~12.5% of roster, ~31 students

  // --- Attendance (A): fixed 15% chronic-absence rate school-wide, but the
  // signal cohort is set to ~5% instead. Chronic absence = ADA < 90%. ---
  const chronicAbsent = inSignalCohort ? rand() < 0.05 : rand() < 0.17
  const ada = chronicAbsent ? 0.72 + rand() * 0.17 : 0.91 + rand() * 0.09
  const totalDaysAbsent = Math.round((1 - ada) * 170)
  const unexcused = Math.round(totalDaysAbsent * (0.3 + rand() * 0.4))
  const excused = totalDaysAbsent - unexcused

  // --- Course performance (C): correlated with chronic absence — 65% of
  // chronically-absent students also fail academically, vs. 15% baseline. ---
  const academicFailure = chronicAbsent ? rand() < 0.65 : rand() < 0.15
  const cmasMath = academicFailure
    ? weightedPick([['Did not yet meet expectations', 3], ['Partially Met Expectations', 2]])
    : weightedPick([['Met Expectations', 3], ['Approached Expectations', 2], ['Exceeded Expectations', 1], ['Partially Met Expectations', 1]])
  const cmasEla = academicFailure
    ? weightedPick([['Did not yet meet expectations', 3], ['Partially Met Expectations', 2]])
    : weightedPick([['Met Expectations', 3], ['Approached Expectations', 2], ['Exceeded Expectations', 1], ['Partially Met Expectations', 1]])
  const cmasMathScore = academicFailure ? 650 + Math.round(rand() * 60) : 720 + Math.round(rand() * 90)
  const cmasElaScore = academicFailure ? 650 + Math.round(rand() * 60) : 720 + Math.round(rand() * 90)

  // --- Behavior (B): correlated with chronic absence — 40% overlap vs. 8%
  // baseline. Actual events generated later in the behavior-log sheet. ---
  const behaviorRisk = chronicAbsent ? rand() < 0.40 : rand() < 0.08

  const mll = weightedPick([[MLL_VALUES[0], 55], [MLL_VALUES[1], 22], [MLL_VALUES[2], 12], [MLL_VALUES[3], 8], [MLL_VALUES[4], 3]])
  const dl = rand() < 0.12 // simplified: has an active IEP-style flag or not
  const gt = rand() < 0.06
  const race = weightedPick(RACE_CODES.map((c, idx) => [c, idx === 3 ? 45 : idx === 0 ? 20 : 8]))

  const student = {
    id, last, first, gender, grade,
    homeLang: mll === MLL_VALUES[0] ? 'eng' : pick(HOME_LANGS),
    packTeacher: pick(PACK_TEACHERS),
    race, mll, dl, gt,
    chronicAbsent, ada, totalDaysAbsent, unexcused, excused,
    academicFailure, cmasMath, cmasEla, cmasMathScore, cmasElaScore,
    behaviorRisk, inSignalCohort,
    birthdate: fmtDate(randomDateBetween(new Date(2011, 0, 1), new Date(2013, 11, 31))),
    startDate: '2024-08-05',
  }
  students24.push(student)
  if (inSignalCohort) signalTeacherRoster.push(student)
}

// ---------------------------------------------------------------------------
// 2. Prior-year roster (23-24): ~90% overlap with continuing students (same
// ID/name, one grade lower, that year's own CMAS draw), plus students who
// left (graduated 8th graders) and new 24-25 enrollees who weren't here yet.
const GRADE_DOWN = { '6': '5', '7': '6', '8': '7' }
const continuing = students24.filter(() => rand() < 0.90)
const newThisYear = students24.filter(s => !continuing.includes(s))
const leftLastYear = Array.from({ length: Math.round(N_STUDENTS * 0.08) }, (_, i) => {
  const gender = rand() < 0.5 ? 'F' : 'M'
  return {
    id: ID_BASE - 500 - i * 2, last: pick(LAST_NAMES), first: gender === 'F' ? pick(FIRST_F) : pick(FIRST_M),
    gender, grade: '8', // graduated out of middle school
  }
})
const students23 = [
  ...continuing.map(s => ({ ...s, grade: GRADE_DOWN[s.grade] ?? s.grade, cmasMath: weightedPick([['Met Expectations', 2], ['Approached Expectations', 2], ['Partially Met Expectations', 1]]) })),
  ...leftLastYear,
]

// ---------------------------------------------------------------------------
// Workbook assembly
const wb = new ExcelJS.Workbook()

function addSheet(name, headers, rows) {
  const ws = wb.addWorksheet(name)
  ws.addRow(headers)
  rows.forEach(r => ws.addRow(r))
  return ws
}

// --- Sheet 1: all student data 24-25 ---
addSheet('all student data 24-25', [
  'ID', 'Last', 'First', 'Full name', 'Grade', 'Gender', 'Active?', 'Race Ethnicity', 'Birthdate', 'Start Date',
  'MLL', 'DL', 'GT', 'Pack Teacher', 'Home Lang',
  "Last Year's ADA", 'ADA as of 4/4', 'Unexcused Days Absent as of 4/4', 'Excused Days absent as of 4/4', 'Total Days Absent as of 4/4',
  'CMAS Math SS 23-24', 'CMAS Prof Level 23-24', 'CMAS ELA SS 23-24', 'CMAS ELA Prof Level 23-24',
], students24.map(s => [
  s.id, s.last, s.first, `${s.first} ${s.last}`, s.grade, s.gender, 1, s.race, s.birthdate, s.startDate,
  s.mll, s.dl ? '04: Specific Learning Disability' : '', s.gt ? 'Yes' : '', s.packTeacher, s.homeLang,
  Math.round((s.ada + 0.02) * 1000) / 1000, Math.round(s.ada * 1000) / 1000, s.unexcused, s.excused, s.totalDaysAbsent,
  s.cmasMathScore, s.cmasMath, s.cmasElaScore, s.cmasEla,
]))

// --- Sheet 2: all student data 23-24 (prior year, for longitudinal linking) ---
addSheet('all student data 23-24', [
  'Student_ID', 'Last_Name', 'First_Name', 'Full Name', 'Grade', 'Gender', 'Race_Ethnicity', 'Birthdate', 'Start_Date',
  'MLL_Status', 'CMAS Math Proficiency Level',
], students23.map(s => [
  s.id, s.last, s.first, `${s.first} ${s.last}`, s.grade, s.gender, s.race ?? pick(RACE_CODES), s.birthdate ?? '', '2023-08-07',
  s.mll ?? pick(MLL_VALUES), s.cmasMath ?? pick(CMAS_LEVELS),
]))

// --- Sheet 3: Student and Teacher Classes 24- (course roster, many rows per student) ---
const classRows = []
for (const s of students24) {
  const periods = shuffle(CLASS_NAMES).slice(0, 5 + Math.floor(rand() * 2))
  periods.forEach((className, pi) => {
    const teacher = (s.inSignalCohort && pi === 0) ? SIGNAL_TEACHER : pick(OTHER_TEACHERS)
    classRows.push([s.id, s.last, s.first, pi + 1, pi % 2 === 0 ? 'A' : 'B', className, teacher, s.grade])
  })
}
addSheet('Student and Teacher Classes 24-', ['Student_ID', 'Last Name', 'First_Name', 'Period Block', 'A_or_B_Day', 'Class_Name', 'Teacher', 'student.grade'], classRows)

// --- Sheet 4: Tardy data 24-25 (event log; tardy count correlated with chronic absence) ---
const tardyRows = []
for (const s of students24) {
  const n = s.chronicAbsent ? 3 + Math.floor(rand() * 10) : Math.floor(rand() * 3)
  for (let k = 0; k < n; k++) {
    const date = fmtDate(randomDateBetween(new Date(2024, 7, 5), new Date(2025, 5, 1)))
    tardyRows.push([s.id, s.last, s.first, date, rand() < 0.6 ? 'Unexcused Tardy to School' : 'Excused Tardy to School', 1 + Math.floor(rand() * 7)])
  }
}
addSheet('Tardy data 24-25', ['Student ID', 'Last Name', 'First Name', 'Date', 'Excused Tardy to School/Unexcused Tardy to School/Tardy to Class', 'Period'], tardyRows)

// --- Sheet 5: Major student behavior 24-25 (event log; correlated with behaviorRisk) ---
const EVENTS = ['Disorderly Conduct (Mutual Fighting)', 'Possession of Contraband (No Threat)', 'Assaultive Physical Incident', 'Insubordination', 'Vandalism']
const RESOLUTIONS = ['Out of School Suspension', 'In School Suspension', 'Detention', 'Parent Conference']
const behaviorRows = []
for (const s of students24) {
  if (!s.behaviorRisk) continue
  const n = 1 + (rand() < 0.25 ? 1 : 0)
  for (let k = 0; k < n; k++) {
    const dt = randomDateBetween(new Date(2024, 7, 5), new Date(2025, 5, 1))
    behaviorRows.push(['Compass Academy MS', 'Resolution Detail', s.id, s.last, s.first, s.grade, pick(EVENTS), dt.toISOString(), 'Offender', pick(RESOLUTIONS), fmtDate(new Date(dt.getTime() + 86400000))])
  }
}
addSheet('Major student behavior 24-25', ['School', 'Report Type', 'Student Number', 'Last Name', 'First Name', 'Grade', 'Event', 'Event Date & Time', 'Role', 'Resolution', 'Resolution Date & Time'], behaviorRows)

// ---------------------------------------------------------------------------
fs.mkdirSync(OUT_DIR, { recursive: true })
wb.xlsx.writeFile(OUT_FILE).then(() => {
  const chronicCount = students24.filter(s => s.chronicAbsent).length
  const academicCount = students24.filter(s => s.academicFailure).length
  const behaviorCount = students24.filter(s => s.behaviorRisk).length
  const signalCohortChronic = signalTeacherRoster.filter(s => s.chronicAbsent).length
  const restChronic = students24.filter(s => !s.inSignalCohort && s.chronicAbsent).length
  const restTotal = students24.length - signalTeacherRoster.length

  const answerKey = `# Compass simulated.xlsx — answer key

Generated ${new Date().toISOString().slice(0, 10)} from a fixed random seed (rerun the script for the same data).

## Roster
- ${N_STUDENTS} students in "all student data 24-25", IDs ${ID_BASE}-${ID_BASE + N_STUDENTS * 3} (district-style, non-sequential).
- Same ID + Last/First name repeated consistently across every sheet (Student_ID / Student Number / Lunch ID all treated as the same value, per the 08/24 check-in).
- "all student data 23-24": ~90% of the 24-25 roster carried over one grade level down (same ID), plus ~8% who graduated out and aren't in 24-25, and ~10% of 24-25 students are new (not in 23-24) — for testing cross-year linking.

## Known, fixed rates (verify these against Edvise's analysis output)
- Chronic absence (ADA < 90%): ~17% baseline rate → ${chronicCount} of ${N_STUDENTS} students (${(100 * chronicCount / N_STUDENTS).toFixed(1)}%).
- Academic failure (CMAS "Did not yet meet" or "Partially Met"): ~15% baseline, but 65% among chronically-absent students → ${academicCount} of ${N_STUDENTS} (${(100 * academicCount / N_STUDENTS).toFixed(1)}%) — deliberately correlated with attendance.
- Behavior risk (≥1 disciplinary event): ~8% baseline, but 40% among chronically-absent students → ${behaviorCount} of ${N_STUDENTS} (${(100 * behaviorCount / N_STUDENTS).toFixed(1)}%) flagged, ${behaviorRows.length} total events logged in "Major student behavior 24-25".

## Planted cross-dataset signal (for a known-answer test question)
"${SIGNAL_TEACHER}" teaches one class period to a cohort of ${signalTeacherRoster.length} students (spread across grades 6-8), deliberately given a much lower chronic-absence rate than everyone else:
- ${SIGNAL_TEACHER}'s cohort: ${signalCohortChronic} of ${signalTeacherRoster.length} chronically absent (${(100 * signalCohortChronic / signalTeacherRoster.length).toFixed(1)}%).
- Everyone else: ${restChronic} of ${restTotal} chronically absent (${(100 * restChronic / restTotal).toFixed(1)}%).

Test question (matches the advisor's example): **"Do students in ${SIGNAL_TEACHER}'s classes show a different attendance trend than other students?"** Expected answer: yes, notably lower chronic absence — this requires correctly joining "Student and Teacher Classes 24-" (to find who's in her class) with "all student data 24-25" (for ADA), so it's a real test of the merge mechanism, not just a lookup on one sheet.

## Sheets included (stage 1 — "most complete/ideal" per the check-in)
- all student data 24-25 (primary)
- all student data 23-24 (prior year)
- Student and Teacher Classes 24- (event log, aggregates to a per-student count on merge)
- Tardy data 24-25 (event log, correlated with chronic absence)
- Major student behavior 24-25 (event log, correlated with behavior risk)

## Deliberately deferred (per the check-in: "let's skip the three first")
- iReady Spanish (redundant with the English iReady columns already on the roster)
- ELD Interim
- Mid-year survey — revisit once the ABC merge mechanism is validated
`
  fs.writeFileSync(ANSWER_KEY_FILE, answerKey)
  console.log('Wrote', OUT_FILE)
  console.log('Wrote', ANSWER_KEY_FILE)
  console.log('\n' + answerKey)
}).catch(err => { console.error(err); process.exit(1) })
