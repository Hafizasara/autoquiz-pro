import { Router } from 'express';
import PDFDocument from 'pdfkit';
import { supabaseAdmin, supabase } from '../config/supabase.js';
import { requireAuth } from '../middleware/auth.middleware.js';

const router = Router();

// Use admin client where available
const db = supabaseAdmin || supabase;

// ---------------------------------------------------------------------------
// Table bootstrap — fire and forget, never blocks startup
// ---------------------------------------------------------------------------
async function ensureExportTable() {
  if (!db) return;
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS public.assessment_exports (
      export_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      assessment_id INTEGER REFERENCES public.assessments(assessment_id) ON DELETE CASCADE,
      teacher_id INTEGER,
      format TEXT NOT NULL,
      include_answer_key BOOLEAN DEFAULT false,
      file_name TEXT,
      exported_at TIMESTAMPTZ DEFAULT NOW(),
      assessment_title TEXT,
      question_count INTEGER,
      export_meta JSONB DEFAULT '{}'::jsonb
    );
  `;
  try {
    await db.rpc('exec_sql', { query_text: createTableSQL, query_params: [] });
  } catch (e) {
    console.warn('[export] ensureExportTable notice:', e.message);
  }
}
ensureExportTable().catch(console.warn);

// ---------------------------------------------------------------------------
// Helper: fetch assessment from Supabase with draft fallback
// ---------------------------------------------------------------------------
async function fetchAssessment(assessmentId, fallbackData = null) {
  if (fallbackData && typeof fallbackData === 'object' && Array.isArray(fallbackData.questions) && fallbackData.questions.length > 0) {
    return fallbackData;
  }
  const parsedId = parseInt(assessmentId, 10);
  if (!db || isNaN(parsedId) || assessmentId === 'draft') {
    return fallbackData;
  }
  const { data, error } = await db
    .from('assessments')
    .select('*')
    .eq('assessment_id', parsedId)
    .maybeSingle();
  if (error) {
    if (fallbackData) return fallbackData;
    throw error;
  }
  return data || fallbackData;
}

// ---------------------------------------------------------------------------
// Helper: record export in assessment_exports
// ---------------------------------------------------------------------------
async function recordExport({ assessmentId, teacherId, format, includeAnswerKey, fileName, assessmentTitle, questionCount, meta }) {
  if (!db) return null;
  const parsedId = parseInt(assessmentId, 10);
  if (isNaN(parsedId)) return null;
  try {
    const { data, error } = await db
      .from('assessment_exports')
      .insert({
        assessment_id: parsedId,
        teacher_id: teacherId,
        format,
        include_answer_key: includeAnswerKey || false,
        file_name: fileName,
        assessment_title: assessmentTitle,
        question_count: questionCount,
        export_meta: meta || {}
      })
      .select('export_id, exported_at')
      .single();
    if (error) {
      console.warn('[export] recordExport notice:', error.message);
      return null;
    }
    return data;
  } catch (e) {
    console.warn('[export] recordExport exception:', e.message);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Generator: Google Docs HTML
// ---------------------------------------------------------------------------
function generateGoogleDocHtml(assessment, includeAnswerKey) {
  const questions = Array.isArray(assessment.questions) ? assessment.questions : [];
  const title = assessment.title || 'Assessment';
  const course = assessment.course_name || assessment.course_code || `Course ID: ${assessment.course_id || ''}`;
  const description = assessment.description || '';
  const totalMarks = assessment.total_marks || 0;

  const escapedTitle = escapeHtml(title);
  const escapedCourse = escapeHtml(course);
  const escapedDescription = escapeHtml(description);

  let questionsHtml = '';
  questions.forEach((q, idx) => {
    const qText = escapeHtml(q.question_text || q.text || '');
    const marks = q.marks ?? q.points ?? '';
    const bloom = q.bloom_level || q.blooms_level || '';
    const difficulty = q.difficulty || '';
    const rubric = q.rubric || q.grading_rubric || '';

    questionsHtml += `
      <div class="question">
        <div class="question-header">
          <span class="q-num">Q${idx + 1}.</span>
          <span class="q-text">${qText}</span>
        </div>
        <div class="q-meta">`;

    if (marks !== '') questionsHtml += `<span class="meta-badge marks">Marks: ${escapeHtml(String(marks))}</span>`;
    if (bloom)         questionsHtml += `<span class="meta-badge bloom">Bloom's: ${escapeHtml(bloom)}</span>`;
    if (difficulty)    questionsHtml += `<span class="meta-badge diff">Difficulty: ${escapeHtml(difficulty)}</span>`;

    questionsHtml += `</div>`;

    // Options / choices
    const options = q.options || q.choices || [];
    if (options.length > 0) {
      questionsHtml += `<ul class="options">`;
      options.forEach((opt, oi) => {
        const optLabel = String.fromCharCode(65 + oi); // A, B, C …
        const optText = escapeHtml(typeof opt === 'string' ? opt : (opt.text || opt.option_text || JSON.stringify(opt)));
        const isCorrect = includeAnswerKey && (
          opt.is_correct === true ||
          opt.isCorrect === true ||
          q.correct_answer === opt.text ||
          q.correct_answer === String(oi) ||
          q.correct_option === oi
        );
        const correctClass = isCorrect ? ' correct-answer' : '';
        const correctMark  = isCorrect ? ' ✓' : '';
        questionsHtml += `<li class="option${correctClass}">${optLabel}. ${optText}${correctMark}</li>`;
      });
      questionsHtml += `</ul>`;
    }

    // Short / coding: blank answer line or model answer
    if (!options.length) {
      if (includeAnswerKey && (q.model_answer || q.answer || q.correct_answer)) {
        const ans = escapeHtml(q.model_answer || q.answer || q.correct_answer || '');
        questionsHtml += `<div class="model-answer"><strong>Model Answer:</strong> ${ans}</div>`;
      } else {
        questionsHtml += `<div class="answer-blank">Answer: ___________________________________________</div>`;
      }
    }

    // Explanation (answer key only)
    if (includeAnswerKey && (q.explanation || q.feedback)) {
      const exp = escapeHtml(q.explanation || q.feedback || '');
      questionsHtml += `<div class="explanation"><strong>Explanation:</strong> ${exp}</div>`;
    }

    // Rubric
    if (rubric) {
      questionsHtml += `<div class="rubric"><strong>Rubric:</strong> ${escapeHtml(rubric)}</div>`;
    }

    questionsHtml += `</div>`;
  });

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapedTitle}</title>
  <style>
    body { font-family: 'Arial', sans-serif; max-width: 900px; margin: 40px auto; padding: 0 20px; color: #1a1a1a; line-height: 1.6; }
    h1 { color: #1a237e; border-bottom: 3px solid #1a237e; padding-bottom: 10px; }
    .meta-info { background: #f5f5f5; border-left: 4px solid #1a237e; padding: 12px 16px; margin-bottom: 24px; border-radius: 4px; }
    .meta-info p { margin: 4px 0; }
    .question { background: #fff; border: 1px solid #e0e0e0; border-radius: 8px; padding: 18px 20px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.06); }
    .question-header { display: flex; gap: 10px; font-size: 1.05em; font-weight: 500; }
    .q-num { color: #1a237e; font-weight: 700; min-width: 30px; }
    .q-meta { margin: 8px 0 10px 30px; display: flex; gap: 8px; flex-wrap: wrap; }
    .meta-badge { font-size: 0.78em; padding: 2px 8px; border-radius: 12px; font-weight: 600; }
    .marks  { background: #e8f5e9; color: #2e7d32; }
    .bloom  { background: #e3f2fd; color: #1565c0; }
    .diff   { background: #fff3e0; color: #e65100; }
    .options { list-style: none; padding-left: 30px; margin: 8px 0; }
    .options li { padding: 5px 8px; border-radius: 4px; margin-bottom: 4px; }
    .correct-answer { background: #c8e6c9; color: #1b5e20; font-weight: 600; }
    .model-answer { margin: 10px 0 6px 30px; background: #c8e6c9; color: #1b5e20; padding: 8px 12px; border-radius: 4px; font-weight: 500; }
    .answer-blank { margin: 14px 0 6px 30px; color: #555; font-style: italic; }
    .explanation { margin: 8px 0 4px 30px; background: #fff9c4; border-left: 3px solid #f9a825; padding: 8px 12px; border-radius: 4px; font-size: 0.95em; }
    .rubric { margin: 8px 0 4px 30px; background: #f3e5f5; border-left: 3px solid #7b1fa2; padding: 8px 12px; border-radius: 4px; font-size: 0.9em; color: #4a148c; }
    .answer-key-banner { background: #ff8f00; color: #fff; text-align: center; padding: 10px; border-radius: 6px; font-weight: 700; margin-bottom: 20px; }
    footer { text-align: center; margin-top: 40px; color: #9e9e9e; font-size: 0.85em; border-top: 1px solid #eee; padding-top: 16px; }
  </style>
</head>
<body>
  <h1>${escapedTitle}</h1>
  ${includeAnswerKey ? '<div class="answer-key-banner">⚠️ ANSWER KEY VERSION — For Instructor Use Only</div>' : ''}
  <div class="meta-info">
    <p><strong>Course:</strong> ${escapedCourse}</p>
    <p><strong>Total Marks:</strong> ${totalMarks}</p>
    ${escapedDescription ? `<p><strong>Description:</strong> ${escapedDescription}</p>` : ''}
    <p><strong>Total Questions:</strong> ${questions.length}</p>
  </div>
  ${questionsHtml}
  <footer>Generated by AutoQuiz Pro &bull; ${new Date().toLocaleString()}</footer>
</body>
</html>`;
}

// ---------------------------------------------------------------------------
// Generator: Moodle XML
// ---------------------------------------------------------------------------
function generateMoodleXml(assessment) {
  const questions = Array.isArray(assessment.questions) ? assessment.questions : [];
  const title = assessment.title || 'Assessment';
  const categoryName = `AutoQuiz Pro/${escapeXml(title)}`;

  let questionsXml = '';
  questions.forEach((q) => {
    const qText = escapeXml(q.question_text || q.text || '');
    const qType = detectMoodleType(q);
    const marks  = q.marks ?? q.points ?? 1;
    const name   = escapeXml(q.question_text?.substring(0, 60) || 'Question');

    if (qType === 'multichoice') {
      const options = q.options || q.choices || [];
      let answersXml = '';
      options.forEach((opt) => {
        const optText = typeof opt === 'string' ? opt : (opt.text || opt.option_text || '');
        const isCorrect = opt.is_correct === true || opt.isCorrect === true;
        const fraction = isCorrect ? 100 : 0;
        const fb = escapeXml(opt.feedback || (isCorrect ? 'Correct!' : 'Incorrect.'));
        answersXml += `
      <answer fraction="${fraction}" format="html">
        <text><![CDATA[${escapeXml(optText)}]]></text>
        <feedback format="html"><text>${fb}</text></feedback>
      </answer>`;
      });

      questionsXml += `
  <question type="multichoice">
    <name><text>${name}</text></name>
    <questiontext format="html">
      <text><![CDATA[${qText}]]></text>
    </questiontext>
    <defaultgrade>${marks}</defaultgrade>
    <shuffleanswers>1</shuffleanswers>
    <single>1</single>
    ${answersXml}
  </question>`;
    } else if (qType === 'shortanswer') {
      const correctAnswer = q.model_answer || q.answer || q.correct_answer || '';
      questionsXml += `
  <question type="shortanswer">
    <name><text>${name}</text></name>
    <questiontext format="html">
      <text><![CDATA[${qText}]]></text>
    </questiontext>
    <defaultgrade>${marks}</defaultgrade>
    <usecase>0</usecase>
    <answer fraction="100">
      <text>${escapeXml(correctAnswer)}</text>
      <feedback format="html"><text>Correct answer.</text></feedback>
    </answer>
  </question>`;
    } else {
      // essay (coding / long answer)
      questionsXml += `
  <question type="essay">
    <name><text>${name}</text></name>
    <questiontext format="html">
      <text><![CDATA[${qText}]]></text>
    </questiontext>
    <defaultgrade>${marks}</defaultgrade>
    <responseformat>editor</responseformat>
    <responsefieldlines>15</responsefieldlines>
    <attachments>0</attachments>
    <graderinfo format="html">
      <text>${escapeXml(q.rubric || q.grading_rubric || '')}</text>
    </graderinfo>
  </question>`;
    }
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<quiz>
  <!-- Moodle 2.x Question Bank Export — Generated by AutoQuiz Pro -->
  <!-- Category: ${categoryName} -->
  <question type="category">
    <category>
      <text>$course$/top/${categoryName}</text>
    </category>
  </question>
${questionsXml}
</quiz>`;
}

function detectMoodleType(q) {
  const type = (q.question_type || q.type || '').toUpperCase();
  if (type === 'MCQ' || type === 'MULTIPLE_CHOICE' || type === 'MULTICHOICE') return 'multichoice';
  if (type === 'SHORT_QUESTION' || type === 'SHORT' || type === 'SHORTANSWER') return 'shortanswer';
  if (type === 'CODING_QUESTION' || type === 'CODING' || type === 'ESSAY') return 'essay';
  // Auto-detect: has options → MCQ
  if ((q.options || q.choices || []).length > 0) return 'multichoice';
  return 'shortanswer';
}

// ---------------------------------------------------------------------------
// Generator: Google Forms Apps Script
// ---------------------------------------------------------------------------
function generateGoogleFormsScript(assessment) {
  const questions = Array.isArray(assessment.questions) ? assessment.questions : [];
  const title = jsStr(assessment.title || 'Assessment');

  let itemLines = '';
  questions.forEach((q, idx) => {
    const qText = jsStr(q.question_text || q.text || `Question ${idx + 1}`);
    const qType = detectMoodleType(q);
    const isRequired = q.required !== false;

    if (qType === 'multichoice') {
      const options = (q.options || q.choices || []).map(opt =>
        typeof opt === 'string' ? opt : (opt.text || opt.option_text || '')
      );
      const optLines = options.map(o => `      .addChoice(${jsStr(o)})`).join('\n');
      itemLines += `
  // Q${idx + 1} — Multiple Choice
  form.addMultipleChoiceItem()
      .setTitle(${qText})
      .setRequired(${isRequired})
${optLines};
`;
    } else if (qType === 'essay') {
      itemLines += `
  // Q${idx + 1} — Paragraph / Coding
  form.addParagraphTextItem()
      .setTitle(${qText})
      .setRequired(${isRequired});
`;
    } else {
      itemLines += `
  // Q${idx + 1} — Short Answer
  form.addParagraphTextItem()
      .setTitle(${qText})
      .setRequired(${isRequired});
`;
    }
  });

  return `/**
 * AutoQuiz Pro — Google Forms Script
 * Generated: ${new Date().toISOString()}
 *
 * HOW TO USE:
 *  1. Open https://script.google.com in your browser.
 *  2. Click "New project".
 *  3. Delete any existing code and paste this entire script.
 *  4. Click the Save icon (or Ctrl+S).
 *  5. Click "Run" and select the function "createForm".
 *  6. Grant the requested permissions when prompted.
 *  7. After it finishes, check your Google Drive for the new form.
 *     A link to the form will also be logged in the Execution Log.
 */

function createForm() {
  var form = FormApp.create(${jsStr(title)});
  form.setDescription(${jsStr(assessment.description || '')});
  form.setCollectEmail(false);
${itemLines}
  Logger.log('Form created successfully!');
  Logger.log('Edit URL: ' + form.getEditUrl());
  Logger.log('Published URL: ' + form.getPublishedUrl());
  return form;
}
`;
}

// ---------------------------------------------------------------------------
// Utility helpers
// ---------------------------------------------------------------------------
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function jsStr(str) {
  // Produce a safe JS string literal (double-quoted)
  return JSON.stringify(String(str));
}

function safeFileName(base, ext) {
  return base.replace(/[^a-z0-9_\- ]/gi, '_').replace(/\s+/g, '_').substring(0, 60) + ext;
}

// ---------------------------------------------------------------------------
// Generator: PDF Document
// ---------------------------------------------------------------------------
function generateAssessmentPdf(assessment, includeAnswerKey) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks = [];

      doc.on('data', chunk => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', err => reject(err));

      const title = assessment.title || 'Examination Assessment';
      const course = assessment.course_name || assessment.course_code || `Course ID: ${assessment.course_id || 'General'}`;
      const totalMarks = assessment.total_marks || 0;
      const passingMarks = assessment.passing_marks || Math.round(totalMarks * 0.5);
      const duration = assessment.duration_minutes || 60;
      const questions = Array.isArray(assessment.questions) ? assessment.questions : [];

      // Top decorative bar
      doc.rect(50, 45, 495, 3).fill('#2563EB');
      doc.moveDown(0.5);

      // Title & Course
      doc.fillColor('#1E293B').fontSize(18).font('Helvetica-Bold').text(title, { align: 'center' });
      doc.fontSize(11).font('Helvetica').fillColor('#64748B').text(`Course: ${course}`, { align: 'center' });
      if (assessment.description) {
        doc.moveDown(0.3);
        doc.fontSize(9.5).font('Helvetica-Oblique').fillColor('#475569').text(assessment.description, { align: 'center' });
      }

      doc.moveDown(0.8);

      // Metadata Bar
      const startY = doc.y;
      doc.rect(50, startY, 495, 24).fill('#F1F5F9');
      doc.fillColor('#334155').fontSize(9).font('Helvetica-Bold');
      doc.text(`Total Marks: ${totalMarks}`, 65, startY + 7);
      doc.text(`Passing Marks: ${passingMarks}`, 180, startY + 7);
      doc.text(`Duration: ${duration} Mins`, 310, startY + 7);
      doc.text(`Total Questions: ${questions.length}`, 430, startY + 7);

      doc.y = startY + 35;
      doc.moveDown(0.4);

      // Candidate Information Block
      const studentY = doc.y;
      doc.rect(50, studentY, 495, 26).stroke('#CBD5E1');
      doc.fontSize(9).font('Helvetica').fillColor('#64748B');
      doc.text('Student Name: _______________________', 60, studentY + 7);
      doc.text('Roll / ID: __________________', 270, studentY + 7);
      doc.text('Date: ____________', 430, studentY + 7);

      doc.y = studentY + 36;
      doc.moveDown(0.6);

      // Section Header
      doc.fontSize(12).font('Helvetica-Bold').fillColor('#1E293B').text('EXAMINATION QUESTIONS', 50, doc.y);
      doc.rect(50, doc.y + 2, 495, 1).fill('#E2E8F0');
      doc.moveDown(0.8);

      questions.forEach((q, idx) => {
        if (doc.y > 690) {
          doc.addPage();
        }

        const qNum = idx + 1;
        const qText = q.question_text || q.text || q.question || '';
        const marks = q.marks ?? q.points ?? 1;
        const bloom = q.bloom_level || q.bloomLevel || '';
        const qType = (q.type || q.question_type || 'MCQ').toUpperCase();

        doc.fontSize(10).font('Helvetica-Bold').fillColor('#1E293B');
        const badgeText = bloom ? ` [${bloom.toUpperCase()}]` : '';
        doc.text(`Q${qNum}. ${qText} (${marks} pt${marks > 1 ? 's' : ''})${badgeText}`);
        doc.moveDown(0.3);

        const options = q.options || q.choices || [];
        if (options.length > 0) {
          const optLabels = ['A', 'B', 'C', 'D', 'E', 'F'];
          options.forEach((opt, oIdx) => {
            const optText = typeof opt === 'string' ? opt : (opt.text || opt.option_text || '');
            const label = optLabels[oIdx] || String(oIdx + 1);
            doc.fontSize(9.5).font('Helvetica').fillColor('#334155');
            doc.text(`     [  ]  ${label}) ${optText}`);
          });
          doc.moveDown(0.4);
        } else if (qType === 'CODING_QUESTION') {
          const lang = q.programming_language || q.programmingLanguage || 'Code';
          doc.fontSize(9).font('Helvetica-Oblique').fillColor('#64748B').text(`     [Language: ${lang}] Write your solution below:`);
          doc.moveDown(0.2);
          doc.rect(70, doc.y, 475, 45).stroke('#E2E8F0');
          doc.y += 50;
        } else {
          doc.fontSize(9).font('Helvetica-Oblique').fillColor('#64748B').text('     Answer:');
          doc.moveDown(0.2);
          doc.rect(70, doc.y, 475, 30).stroke('#E2E8F0');
          doc.y += 35;
        }
        doc.moveDown(0.2);
      });

      // Answer Key Section
      if (includeAnswerKey) {
        doc.addPage();
        doc.rect(50, 45, 495, 3).fill('#059669');
        doc.moveDown(0.5);
        doc.fontSize(16).font('Helvetica-Bold').fillColor('#059669').text('CONFIDENTIAL: OFFICIAL ANSWER KEY', { align: 'center' });
        doc.fontSize(10).font('Helvetica').fillColor('#64748B').text(`Assessment: ${title}`, { align: 'center' });
        doc.moveDown(1);

        questions.forEach((q, idx) => {
          if (doc.y > 700) {
            doc.addPage();
          }

          const qNum = idx + 1;
          const answer = q.correct_answer || q.correctAnswer || q.model_answer || q.modelAnswer || q.solution_code || q.solutionCode || 'N/A';
          const explanation = q.explanation || q.rubric || '';

          doc.fontSize(10).font('Helvetica-Bold').fillColor('#1E293B').text(`Q${qNum} Answer: `, { continued: true });
          doc.font('Helvetica').fillColor('#059669').text(`${answer}`);

          if (explanation) {
            doc.fontSize(9).font('Helvetica-Oblique').fillColor('#475569').text(`Rationale / Rubric: ${explanation}`);
          }
          doc.moveDown(0.5);
        });
      }

      // Page Footers
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        doc.fontSize(8).font('Helvetica').fillColor('#94A3B8');
        doc.text(
          `AutoQuiz Pro • Page ${i + 1} of ${range.count} • ${new Date().toLocaleDateString()}`,
          50,
          780,
          { align: 'center', width: 495 }
        );
      }

      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}

// ---------------------------------------------------------------------------
// POST /api/v1/exports/:assessmentId/google-doc
// ---------------------------------------------------------------------------
router.post('/:assessmentId/google-doc', requireAuth, async (req, res) => {
  try {
    const { assessmentId } = req.params;
    const includeAnswerKey = req.body?.includeAnswerKey === true || req.body?.includeAnswerKey === 'true';

    const assessment = await fetchAssessment(assessmentId, req.body?.assessment);
    if (!assessment) {
      return res.status(404).json({ status: 'fail', message: 'Assessment not found.' });
    }

    const content = generateGoogleDocHtml(assessment, includeAnswerKey);
    const suffix  = includeAnswerKey ? '_answer_key' : '';
    const fileName = safeFileName(assessment.title || 'assessment', `${suffix}.html`);

    const record = await recordExport({
      assessmentId,
      teacherId: req.user?.user_id,
      format: 'GOOGLE_DOC',
      includeAnswerKey,
      fileName,
      assessmentTitle: assessment.title,
      questionCount: (assessment.questions || []).length,
      meta: { includeAnswerKey }
    });

    return res.json({
      status: 'success',
      data: {
        content,
        fileName,
        mimeType: 'text/html',
        exportId: record?.export_id || null,
        exportedAt: record?.exported_at || new Date().toISOString(),
        format: 'GOOGLE_DOC'
      }
    });
  } catch (err) {
    console.error('[export] google-doc error:', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/exports/:assessmentId/pdf
// ---------------------------------------------------------------------------
router.post('/:assessmentId/pdf', requireAuth, async (req, res) => {
  try {
    const { assessmentId } = req.params;
    const includeAnswerKey = req.body?.includeAnswerKey === true || req.body?.includeAnswerKey === 'true';

    const assessment = await fetchAssessment(assessmentId, req.body?.assessment);
    if (!assessment) {
      return res.status(404).json({ status: 'fail', message: 'Assessment not found.' });
    }

    const pdfBuffer = await generateAssessmentPdf(assessment, includeAnswerKey);
    const suffix = includeAnswerKey ? '_with_answers' : '';
    const fileName = safeFileName(assessment.title || 'assessment', `${suffix}.pdf`);

    const record = await recordExport({
      assessmentId,
      teacherId: req.user?.user_id,
      format: 'PDF',
      includeAnswerKey,
      fileName,
      assessmentTitle: assessment.title,
      questionCount: (assessment.questions || []).length,
      meta: { includeAnswerKey }
    });

    return res.json({
      status: 'success',
      data: {
        content: pdfBuffer.toString('base64'),
        isBase64: true,
        fileName,
        mimeType: 'application/pdf',
        exportId: record?.export_id || null,
        exportedAt: record?.exported_at || new Date().toISOString(),
        format: 'PDF'
      }
    });
  } catch (err) {
    console.error('[export] pdf error:', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/exports/:assessmentId/moodle
// ---------------------------------------------------------------------------
router.post('/:assessmentId/moodle', requireAuth, async (req, res) => {
  try {
    const { assessmentId } = req.params;

    const assessment = await fetchAssessment(assessmentId, req.body?.assessment);
    if (!assessment) {
      return res.status(404).json({ status: 'fail', message: 'Assessment not found.' });
    }

    const content  = generateMoodleXml(assessment);
    const fileName = safeFileName(assessment.title || 'assessment', '_moodle.xml');

    const record = await recordExport({
      assessmentId,
      teacherId: req.user?.user_id,
      format: 'MOODLE_XML',
      includeAnswerKey: true,
      fileName,
      assessmentTitle: assessment.title,
      questionCount: (assessment.questions || []).length,
      meta: {}
    });

    return res.json({
      status: 'success',
      data: {
        content,
        fileName,
        mimeType: 'application/xml',
        exportId: record?.export_id || null,
        exportedAt: record?.exported_at || new Date().toISOString(),
        format: 'MOODLE_XML'
      }
    });
  } catch (err) {
    console.error('[export] moodle error:', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /api/v1/exports/:assessmentId/google-forms
// ---------------------------------------------------------------------------
router.post('/:assessmentId/google-forms', requireAuth, async (req, res) => {
  try {
    const { assessmentId } = req.params;

    const assessment = await fetchAssessment(assessmentId, req.body?.assessment);
    if (!assessment) {
      return res.status(404).json({ status: 'fail', message: 'Assessment not found.' });
    }

    const content  = generateGoogleFormsScript(assessment);
    const fileName = safeFileName(assessment.title || 'assessment', '_google_forms.gs');

    const record = await recordExport({
      assessmentId,
      teacherId: req.user?.user_id,
      format: 'GOOGLE_FORMS',
      includeAnswerKey: false,
      fileName,
      assessmentTitle: assessment.title,
      questionCount: (assessment.questions || []).length,
      meta: {}
    });

    return res.json({
      status: 'success',
      data: {
        content,
        fileName,
        mimeType: 'text/plain',
        exportId: record?.export_id || null,
        exportedAt: record?.exported_at || new Date().toISOString(),
        format: 'GOOGLE_FORMS'
      }
    });
  } catch (err) {
    console.error('[export] google-forms error:', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /api/v1/exports/history   query: { assessmentId? }
// ---------------------------------------------------------------------------
router.get('/history', requireAuth, async (req, res) => {
  try {
    if (!db) return res.json({ status: 'success', data: [] });

    const { assessmentId } = req.query;

    let q = db
      .from('assessment_exports')
      .select('*')
      .order('exported_at', { ascending: false })
      .limit(50);

    if (assessmentId) {
      q = q.eq('assessment_id', parseInt(assessmentId, 10));
    }

    const { data, error } = await q;

    if (error) {
      // Table may not exist yet
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        return res.json({ status: 'success', data: [] });
      }
      throw error;
    }

    return res.json({ status: 'success', data: data || [] });
  } catch (err) {
    console.error('[export] history error:', err);
    // Graceful degradation — never crash on missing table
    return res.json({ status: 'success', data: [] });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/v1/exports/history/:exportId
// ---------------------------------------------------------------------------
router.delete('/history/:exportId', requireAuth, async (req, res) => {
  try {
    if (!db) return res.status(503).json({ status: 'error', message: 'Database not configured.' });

    const { exportId } = req.params;

    const { error } = await db
      .from('assessment_exports')
      .delete()
      .eq('export_id', exportId);

    if (error) {
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        return res.status(404).json({ status: 'fail', message: 'Export record not found.' });
      }
      throw error;
    }

    return res.json({ status: 'success', message: 'Export history record deleted.' });
  } catch (err) {
    console.error('[export] delete history error:', err);
    return res.status(500).json({ status: 'error', message: err.message });
  }
});

export default router;
