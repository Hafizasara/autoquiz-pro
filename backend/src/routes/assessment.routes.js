import { Router } from 'express';
import multer from 'multer';
import { PDFParse } from 'pdf-parse';
import { query, supabaseAdmin, supabase } from '../config/supabase.js';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import { getGeminiModel, generateWithFallback } from '../config/gemini.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 } // 25 MB max PDF
});

/**
 * @route POST /api/v1/assessments/extract-pdf
 * @desc Extract text from uploaded lecture notes PDF
 * Detects if the PDF is an image-only scan with no readable text.
 */
router.post('/extract-pdf', requireAuth, upload.single('file'), async (req, res, next) => {
  let parser = null;
  try {
    if (!req.file) {
      return res.status(400).json({
        status: 'fail',
        message: 'No PDF file was uploaded. Please choose a PDF document.'
      });
    }

    const isPdfMime = req.file.mimetype === 'application/pdf';
    const isPdfExt = req.file.originalname?.toLowerCase().endsWith('.pdf');

    if (!isPdfMime && !isPdfExt) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid file format. Please upload a valid PDF file (.pdf).'
      });
    }

    let textResult = null;
    try {
      parser = new PDFParse({ data: req.file.buffer });
      textResult = await parser.getText();
    } catch (parseErr) {
      console.warn('PDF parsing error:', parseErr.message);
      return res.status(400).json({
        status: 'fail',
        code: 'PARSE_ERROR',
        message: 'Could not parse the PDF file. The file may be corrupted or password-protected: ' + parseErr.message
      });
    }

    const rawText = (textResult?.text || '').trim();
    // Normalize newlines and whitespace
    const cleanText = rawText.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

    // Check for readable alphanumeric text content
    const alphanumericCount = (cleanText.match(/[a-zA-Z0-9]/g) || []).length;
    const isReadable = alphanumericCount >= 20;

    if (!isReadable) {
      return res.status(422).json({
        status: 'fail',
        code: 'NO_READABLE_TEXT',
        hasReadableText: false,
        message: '⚠️ No readable text detected in this PDF. It appears to be an image-only scan or empty document. Please upload a searchable/text-based PDF or paste your lecture notes directly as text.',
        data: {
          fileName: req.file.originalname,
          fileSize: req.file.size,
          pageCount: textResult?.total || 0,
          extractedLength: cleanText.length,
          alphanumericCount
        }
      });
    }

    const wordCount = cleanText.split(/\s+/).filter(Boolean).length;

    return res.status(200).json({
      status: 'success',
      message: `Successfully extracted ${wordCount} words from ${req.file.originalname}.`,
      data: {
        text: cleanText,
        fileName: req.file.originalname,
        fileSize: req.file.size,
        pageCount: textResult?.total || 1,
        wordCount,
        characterCount: cleanText.length,
        hasReadableText: true
      }
    });
  } catch (error) {
    next(error);
  } finally {
    if (parser) {
      await parser.destroy().catch(() => {});
    }
  }
});

/**
 * @route POST /api/v1/assessments/generate-questions
 * @desc Generate assessment questions based on lecture notes/topic and teacher-selected question types
 * Question Types supported:
 * - MCQ (Multiple Choice Questions)
 * - SHORT_QUESTION (Conceptual, theory, definitions, explanations)
 * - CODING_QUESTION (Programming challenge, starter code, test cases)
 */
router.post('/generate-questions', requireAuth, async (req, res, next) => {
  try {
    const {
      lectureNotes = '',
      topic = '',
      title = '',
      courseName = '',
      selectedTypes = ['MCQ'],
      config = {}
    } = req.body;

    // Normalize types: support string array ['MCQ', 'SHORT_QUESTION', 'CODING_QUESTION']
    const enabledTypes = Array.isArray(selectedTypes) && selectedTypes.length > 0
      ? selectedTypes.map(t => String(t).toUpperCase().trim())
      : ['MCQ'];

    // Helper to resolve multi-level Bloom's taxonomy distribution with exact quotas
    const resolveBloomBreakdown = (typeConfig, defaultLevel, count) => {
      const breakdown = typeConfig?.bloomBreakdown ?? typeConfig?.bloom_breakdown;
      if (Array.isArray(breakdown) && breakdown.length > 0) {
        return breakdown.map(b => ({
          level: String(b.level || defaultLevel).toLowerCase(),
          count: Math.max(1, parseInt(b.count, 10) || 1),
          percent: Number(b.percent) || Math.round((parseInt(b.count, 10) / count) * 100)
        }));
      }

      const dist = typeConfig?.bloomDistribution ?? typeConfig?.bloom_distribution;
      if (dist && typeof dist === 'object') {
        const validLevels = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create'];
        const active = Object.entries(dist)
          .filter(([lvl, pct]) => validLevels.includes(lvl.toLowerCase()) && Number(pct) > 0)
          .map(([lvl, pct]) => ({ level: lvl.toLowerCase(), percent: Number(pct) }));

        if (active.length > 0) {
          let allocated = 0;
          const res = active.map(item => {
            const c = Math.max(1, Math.round((item.percent / 100) * count));
            allocated += c;
            return { level: item.level, percent: item.percent, count: c };
          });
          const diff = count - allocated;
          if (diff !== 0 && res.length > 0) {
            res.sort((a, b) => b.percent - a.percent);
            res[0].count = Math.max(1, res[0].count + diff);
          }
          return res;
        }
      }

      const single = String(typeConfig?.bloomLevel ?? typeConfig?.bloom_level ?? defaultLevel).toLowerCase();
      return [{ level: single, count, percent: 100 }];
    };

    // Read per-type configuration or set intuitive defaults
    const mcqConfig = {
      enabled: enabledTypes.includes('MCQ'),
      count: Math.max(1, parseInt(config?.mcq?.count ?? 4, 10) || 4),
      marks: Math.max(1, parseInt(config?.mcq?.marks ?? 5, 10) || 5),
      optionsCount: Math.min(6, Math.max(2, parseInt(config?.mcq?.optionsCount ?? config?.mcq?.options_count ?? 4, 10) || 4)),
      difficulty: config?.mcq?.difficulty || 'medium'
    };
    mcqConfig.bloomBreakdown = resolveBloomBreakdown(config?.mcq, 'understand', mcqConfig.count);
    mcqConfig.bloomLevel = mcqConfig.bloomBreakdown[0]?.level || 'understand';

    const shortConfig = {
      enabled: enabledTypes.includes('SHORT_QUESTION') || enabledTypes.includes('SHORT') || enabledTypes.includes('SHORT_ANSWER'),
      count: Math.max(1, parseInt(config?.shortQuestion?.count ?? config?.short_question?.count ?? 2, 10) || 2),
      marks: Math.max(1, parseInt(config?.shortQuestion?.marks ?? config?.short_question?.marks ?? 15, 10) || 15),
      difficulty: config?.shortQuestion?.difficulty ?? config?.short_question?.difficulty ?? 'medium'
    };
    shortConfig.bloomBreakdown = resolveBloomBreakdown(config?.shortQuestion ?? config?.short_question, 'apply', shortConfig.count);
    shortConfig.bloomLevel = shortConfig.bloomBreakdown[0]?.level || 'apply';

    const codingConfig = {
      enabled: enabledTypes.includes('CODING_QUESTION') || enabledTypes.includes('CODING') || enabledTypes.includes('CODE'),
      count: Math.max(1, parseInt(config?.codingQuestion?.count ?? config?.coding_question?.count ?? 1, 10) || 1),
      marks: Math.max(1, parseInt(config?.codingQuestion?.marks ?? config?.coding_question?.marks ?? 30, 10) || 30),
      language: config?.codingQuestion?.language ?? config?.coding_question?.language ?? 'Python',
      difficulty: config?.codingQuestion?.difficulty ?? config?.coding_question?.difficulty ?? 'medium'
    };
    codingConfig.bloomBreakdown = resolveBloomBreakdown(config?.codingQuestion ?? config?.coding_question, 'apply', codingConfig.count);
    codingConfig.bloomLevel = codingConfig.bloomBreakdown[0]?.level || 'apply';

    if (!mcqConfig.enabled && !shortConfig.enabled && !codingConfig.enabled) {
      return res.status(400).json({
        status: 'fail',
        message: 'Please select at least one question type (MCQ, Short Question, or Coding Question).'
      });
    }

    const contextParts = [];
    if (title && title.trim()) {
      contextParts.push(`Assessment Title: ${title.trim()}`);
    }
    if (topic && topic.trim()) {
      contextParts.push(`Syllabus Coverage & Exam Instructions:\n${topic.trim()}`);
    }
    if (lectureNotes && lectureNotes.trim()) {
      contextParts.push(`Lecture Notes / Material (Extracted from Text or PDF):\n${lectureNotes.trim()}`);
    }
    const contextText = (contextParts.join('\n\n') || 'Computer Science & Software Engineering Core Curriculum').trim();
    const cleanContext = contextText.length > 8000 ? contextText.slice(0, 8000) + '...' : contextText;

    let generatedQuestions = [];
    let generationMethod = 'gemini';
    let modelUsed = '';

    // Try Gemini AI generation first with cascade fallback across reliable models
    try {
      const requestedBreakdown = [];
      if (mcqConfig.enabled) {
        const quotaLines = mcqConfig.bloomBreakdown
          .map(b => `    * ${b.count} question(s) at "${b.level}" level (${b.percent}%)`)
          .join('\n');
        requestedBreakdown.push(`- Exactly ${mcqConfig.count} Multiple Choice Questions (type: "MCQ", ${mcqConfig.marks} marks each, difficulty: "${mcqConfig.difficulty}").\n  MANDATORY BLOOM'S TAXONOMY DISTRIBUTION:\n${quotaLines}\n  For the answer key, provide exactly ${mcqConfig.optionsCount} distinct options, the single correct option (matching one of the options verbatim), and a clear explanatory rationale.`);
      }
      if (shortConfig.enabled) {
        const quotaLines = shortConfig.bloomBreakdown
          .map(b => `    * ${b.count} question(s) at "${b.level}" level (${b.percent}%)`)
          .join('\n');
        requestedBreakdown.push(`- Exactly ${shortConfig.count} Short Answer / Conceptual Questions (type: "SHORT_QUESTION", ${shortConfig.marks} marks each, difficulty: "${shortConfig.difficulty}").\n  MANDATORY BLOOM'S TAXONOMY DISTRIBUTION:\n${quotaLines}\n  For the answer key, provide a comprehensive model answer, a detailed grading rubric (scoring criteria and point breakdown), and an explanation of the key concepts.`);
      }
      if (codingConfig.enabled) {
        const quotaLines = codingConfig.bloomBreakdown
          .map(b => `    * ${b.count} question(s) at "${b.level}" level (${b.percent}%)`)
          .join('\n');
        requestedBreakdown.push(`- Exactly ${codingConfig.count} Programming / Coding Questions (type: "CODING_QUESTION", ${codingConfig.marks} marks each, language: "${codingConfig.language}", difficulty: "${codingConfig.difficulty}").\n  MANDATORY BLOOM'S TAXONOMY DISTRIBUTION:\n${quotaLines}\n  For the question and answer key, provide the problem description, target programming language, a starter code template with function/class signature in ${codingConfig.language}, sample input, sample output, a grading rubric (criteria for correctness, edge cases, and algorithmic complexity), and the complete reference solution code (answer key) in ${codingConfig.language}.`);
      }

      const prompt = `You are an expert university professor creating an examination paper for "${courseName || title || 'Academic Course'}".

LECTURE NOTES & CURRICULUM CONTEXT:
${cleanContext}

QUESTION TYPE REQUIREMENTS:
${requestedBreakdown.join('\n')}

BLOOM'S TAXONOMY REFERENCE:
- "remember": Recall facts, definitions, terms (keywords: define, list, identify, name)
- "understand": Explain concepts, interpret, summarize (keywords: explain, describe, compare, interpret)
- "apply": Use knowledge in new situations, solve problems (keywords: implement, solve, demonstrate, calculate)
- "analyze": Break information into parts, find relationships (keywords: analyze, differentiate, examine, contrast)
- "evaluate": Make judgments, justify decisions (keywords: evaluate, justify, critique, assess)
- "create": Produce new work, design solutions (keywords: design, construct, develop, formulate)

INSTRUCTIONS:
1. Generate realistic, intellectually rigorous questions aligned strictly with the lecture material, topics, and syllabus instructions provided above.
2. STRICTLY COMPLY WITH THE BLOOM'S TAXONOMY QUOTAS: Frame question stems using appropriate cognitive verbs for each designated Bloom level, and assign the exact requested count of questions to each respective Bloom level.
3. Return ONLY a single raw valid JSON array of question objects (no Markdown formatting, no \`\`\`json wrappers, no introductory or concluding prose).
4. Schema for each question object:
For MCQ (MUST HAVE EXACTLY ${mcqConfig.optionsCount} OPTIONS):
{
  "id": number,
  "type": "MCQ",
  "question": "string",
  "options": ["Option A", "Option B"${mcqConfig.optionsCount > 2 ? ', "Option C"' : ''}${mcqConfig.optionsCount > 3 ? ', "Option D"' : ''}${mcqConfig.optionsCount > 4 ? ', "Option E"' : ''}${mcqConfig.optionsCount > 5 ? ', "Option F"' : ''}],
  "correctAnswer": "Option A",
  "explanation": "string",
  "bloomLevel": "${mcqConfig.bloomLevel}",
  "difficulty": "${mcqConfig.difficulty}",
  "marks": ${mcqConfig.marks}
}
For SHORT_QUESTION:
{
  "id": number,
  "type": "SHORT_QUESTION",
  "question": "string",
  "modelAnswer": "string (authoritative model answer for the answer key)",
  "rubric": "string (grading criteria and score allocation)",
  "explanation": "string (conceptual explanation of why this answer is correct)",
  "bloomLevel": "${shortConfig.bloomLevel}",
  "difficulty": "${shortConfig.difficulty}",
  "marks": ${shortConfig.marks}
}
For CODING_QUESTION:
{
  "id": number,
  "type": "CODING_QUESTION",
  "programmingLanguage": "${codingConfig.language}",
  "question": "string (clear problem statement with input/output format and constraints)",
  "starterCode": "string (code template with function/class signature in ${codingConfig.language})",
  "sampleInput": "string",
  "sampleOutput": "string",
  "rubric": "string (grading criteria: functional correctness, edge cases, time/space complexity)",
  "solutionCode": "string (complete reference solution / answer key in ${codingConfig.language})",
  "bloomLevel": "${codingConfig.bloomLevel}",
  "difficulty": "${codingConfig.difficulty}",
  "marks": ${codingConfig.marks}
}
`;

      const genResult = await generateWithFallback(prompt);
      const rawText = genResult?.text || '';
      modelUsed = genResult?.model || 'gemini';

      // Clean markdown code blocks if returned
      let cleanJson = rawText.trim();
      if (cleanJson.startsWith('```')) {
        cleanJson = cleanJson.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
      }
      const firstBracket = cleanJson.indexOf('[');
      const lastBracket = cleanJson.lastIndexOf(']');
      if (firstBracket !== -1 && lastBracket !== -1 && lastBracket >= firstBracket) {
        cleanJson = cleanJson.slice(firstBracket, lastBracket + 1);
      }

      const parsed = JSON.parse(cleanJson);
      if (Array.isArray(parsed) && parsed.length > 0) {
        generatedQuestions = parsed.map((q, idx) => ({
          id: idx + 1,
          type: (q.type || 'MCQ').toUpperCase(),
          question: q.question || q.title || `Question ${idx + 1}`,
          marks: Number(q.marks) || (q.type === 'CODING_QUESTION' ? codingConfig.marks : (q.type === 'SHORT_QUESTION' ? shortConfig.marks : mcqConfig.marks)),
          difficulty: q.difficulty || 'medium',
          bloomLevel: q.bloomLevel || q.bloom_level || (q.type === 'CODING_QUESTION' ? codingConfig.bloomLevel : (q.type === 'SHORT_QUESTION' ? shortConfig.bloomLevel : mcqConfig.bloomLevel)),
          options: Array.isArray(q.options) ? q.options : (q.type === 'MCQ' ? ['Option A', 'Option B', 'Option C', 'Option D'] : undefined),
          correctAnswer: q.correctAnswer || q.correct_answer || q.answer || q.answerKey || q.answer_key || (q.type === 'MCQ' ? (q.options?.[0] || 'Option A') : undefined),
          explanation: q.explanation || q.rationale || q.reasoning || '',
          modelAnswer: q.modelAnswer || q.model_answer || q.answer || q.solution || '',
          rubric: q.rubric || q.grading_rubric || q.gradingRubric || q.criteria || '',
          programmingLanguage: q.programmingLanguage || q.programming_language || q.language || codingConfig.language,
          starterCode: q.starterCode || q.starter_code || q.codeTemplate || q.code_template || '',
          sampleInput: q.sampleInput || q.sample_input || '',
          sampleOutput: q.sampleOutput || q.sample_output || '',
          solutionCode: q.solutionCode || q.solution_code || q.answerKey || q.answer_key || q.solution || ''
        }));
        generationMethod = 'gemini';
      }
    } catch (aiErr) {
      console.warn('Gemini generation cascade failed, using context-adaptive fallback:', aiErr.message);
      generationMethod = 'algorithmic';
    }

    // Fallback: If Gemini did not return valid questions, generate curriculum-aligned questions
    // based strictly on the teacher's topic, instructions, and syllabus (NEVER hardcoded BST questions!)
    if (!generatedQuestions || generatedQuestions.length === 0) {
      generationMethod = 'algorithmic';
      let currentId = 1;

      // Extract subject matter from title or course
      const rawSubject = (title || courseName || 'Curriculum Subject')
        .replace(/Assessment Title:\s*/i, '')
        .replace(/Midterm|Final|Quiz|Exam|Examination|\d{4}/gi, '')
        .trim() || 'Specified Subject Matter';

      // Parse user syllabus / instructions / notes for key domain terms and concepts
      const sourceText = `${topic || ''}\n${lectureNotes || ''}\n${title || ''}`;
      const candidatePhrases = sourceText
        .split(/[\n,;•\-–—\.]|\band\b|\bwith\b|\bcovering\b/i)
        .map(s => s.replace(/Syllabus Coverage|Exam Instructions|Lecture Notes|Material|Assessment Title/gi, '').trim())
        .filter(s => s.length >= 4 && s.length <= 60 && !/^(the|a|an|for|and|in|on|at|to|from|of|is|are|was|were)$/i.test(s));

      const distinctTopics = Array.from(new Set(candidatePhrases));
      if (distinctTopics.length === 0) {
        distinctTopics.push(rawSubject);
      }

      if (mcqConfig.enabled) {
        const mcqBloomTargets = [];
        for (const b of mcqConfig.bloomBreakdown) {
          for (let k = 0; k < b.count; k++) mcqBloomTargets.push(b.level);
        }
        const optCount = mcqConfig.optionsCount || 4;

        const questionTemplates = [
          (term, subj) => ({
            stem: `Which of the following best defines the primary purpose of ${term} in ${subj}?`,
            correct: `To systematically manage and ensure the required standards and outcomes of ${term}`,
            distractors: [
              `To eliminate all administrative procedures without documentation`,
              `To replace stakeholder collaboration with automated scheduling alone`,
              `To serve purely as an optional post-implementation review`
            ],
            exp: `In ${subj}, ${term} is applied to guarantee standard compliance and structured delivery.`
          }),
          (term, subj) => ({
            stem: `In the context of ${subj}, what is a critical objective when managing ${term}?`,
            correct: `Identifying baseline metrics, tracking deviations, and executing timely corrective actions`,
            distractors: [
              `Postponing any risk assessment until project deliverables are completed`,
              `Bypassing quality assurance to meet early delivery targets`,
              `Assuming uniform performance across all operational teams without evaluation`
            ],
            exp: `Effective control of ${term} requires proactive monitoring against established baselines.`
          }),
          (term, subj) => ({
            stem: `Which principle is most essential for effective execution of ${term}?`,
            correct: `Clear stakeholder alignment, defined roles, and continuous quality governance`,
            distractors: [
              `Rigid adherence to obsolete milestones without change management`,
              `Delegating core strategic decisions exclusively to external parties`,
              `Eliminating quantitative metrics from status reporting`
            ],
            exp: `Successful ${term} relies heavily on transparent alignment and continuous governance.`
          }),
          (term, subj) => ({
            stem: `When assessing ${term} within ${subj}, which factor should be prioritized first?`,
            correct: `Scope alignment, resource constraints, and overall organizational objectives`,
            distractors: [
              `Arbitrary milestone acceleration without risk analysis`,
              `Individual team preferences over formal requirements`,
              `Ignoring regulatory and quality standards for faster turnaround`
            ],
            exp: `Fundamental prioritization in ${term} balances scope, cost, and target quality.`
          }),
          (term, subj) => ({
            stem: `What is the expected outcome of successfully controlling ${term}?`,
            correct: `Deliverables that meet agreed specifications within schedule and resource boundaries`,
            distractors: [
              `Uncontrolled scope creep without formal change approval`,
              `Incomplete documentation and lack of audit trails`,
              `Higher variance from the planned baseline metrics`
            ],
            exp: `Controlling ${term} guarantees delivery integrity and baseline compliance.`
          }),
          (term, subj) => ({
            stem: `Which of the following represents a primary risk or challenge in ${term}?`,
            correct: `Unmanaged requirement changes, inadequate risk mitigation, and misaligned expectations`,
            distractors: [
              `Overly thorough quality verification and regular audits`,
              `Proactive communication between team leads and stakeholders`,
              `Adherence to verified industry standards and benchmarks`
            ],
            exp: `Key vulnerabilities in ${term} arise from vague expectations and inadequate risk response.`
          })
        ];

        for (let i = 0; i < mcqConfig.count; i++) {
          const currentTopic = distinctTopics[i % distinctTopics.length];
          const template = questionTemplates[i % questionTemplates.length](currentTopic, rawSubject);
          
          let options = [template.correct, ...template.distractors];
          if (optCount === 2) {
            options = ['True', 'False'];
          } else if (options.length > optCount) {
            options = options.slice(0, optCount);
          } else {
            while (options.length < optCount) {
              options.push(`Alternative perspective ${options.length + 1} regarding ${currentTopic}`);
            }
          }

          generatedQuestions.push({
            id: currentId++,
            type: 'MCQ',
            question: template.stem,
            options: options,
            correctAnswer: optCount === 2 ? 'True' : template.correct,
            explanation: template.exp,
            difficulty: mcqConfig.difficulty,
            bloomLevel: mcqBloomTargets[i % mcqBloomTargets.length] || 'understand',
            marks: mcqConfig.marks
          });
        }
      }

      if (shortConfig.enabled) {
        const shortBloomTargets = [];
        for (const b of shortConfig.bloomBreakdown) {
          for (let k = 0; k < b.count; k++) shortBloomTargets.push(b.level);
        }
        for (let i = 0; i < shortConfig.count; i++) {
          const currentTopic = distinctTopics[i % distinctTopics.length];
          generatedQuestions.push({
            id: currentId++,
            type: 'SHORT_QUESTION',
            question: `Explain the fundamental concepts and practical significance of ${currentTopic} within ${rawSubject}.`,
            modelAnswer: `In ${rawSubject}, ${currentTopic} provides the structural methodology and processes required to meet target outcomes, maintain quality standards, control constraints, and align team efforts with organizational goals.`,
            rubric: `Full marks (100%): Comprehensive explanation of ${currentTopic}, including core objectives, key processes, and practical impact. Partial marks (50%): Basic conceptual description lacking depth or specific methodologies.`,
            explanation: `Understanding the theoretical and applied dimensions of ${currentTopic} is vital for mastering ${rawSubject}.`,
            difficulty: shortConfig.difficulty,
            bloomLevel: shortBloomTargets[i % shortBloomTargets.length] || 'apply',
            marks: shortConfig.marks
          });
        }
      }

      if (codingConfig.enabled) {
        const codingBloomTargets = [];
        for (const b of codingConfig.bloomBreakdown) {
          for (let k = 0; k < b.count; k++) codingBloomTargets.push(b.level);
        }
        for (let i = 0; i < codingConfig.count; i++) {
          const lang = codingConfig.language;
          const currentTopic = distinctTopics[i % distinctTopics.length];
          const cleanVarName = currentTopic.toLowerCase().replace(/[^a-z0-9]/g, '_').slice(0, 24);
          generatedQuestions.push({
            id: currentId++,
            type: 'CODING_QUESTION',
            programmingLanguage: lang,
            question: `Write a clean and robust function in ${lang} to process and validate numerical metrics for ${currentTopic} (e.g., computing variance and index metrics).`,
            starterCode: lang === 'Python' 
              ? `def analyze_${cleanVarName}_metrics(values: list[float]) -> dict:\n    # Implement metric validation\n    pass\n`
              : `function analyzeMetrics(values) {\n    // Implement metric validation\n    return {};\n}\n`,
            sampleInput: `[100.0, 95.5, 102.0]`,
            sampleOutput: `{"valid": true, "count": 3}`,
            rubric: `Correctness (60%): Handles standard input validation and calculations. Edge Cases (20%): Empty lists, non-numeric inputs. Code Quality (20%): Clean naming, readability.`,
            solutionCode: lang === 'Python'
              ? `def analyze_${cleanVarName}_metrics(values: list[float]) -> dict:\n    if not values:\n        return {"valid": False, "count": 0}\n    return {"valid": True, "count": len(values), "mean": sum(values)/len(values)}\n`
              : `function analyzeMetrics(values) {\n    if (!values || values.length === 0) return { valid: false, count: 0 };\n    return { valid: true, count: values.length, mean: values.reduce((a, b) => a + b, 0) / values.length };\n}\n`,
            difficulty: codingConfig.difficulty,
            bloomLevel: codingBloomTargets[i % codingBloomTargets.length] || 'apply',
            marks: codingConfig.marks
          });
        }
      }
    }

    const totalQuestions = generatedQuestions.length;
    const totalMarks = generatedQuestions.reduce((sum, q) => sum + (Number(q.marks) || 0), 0);

    return res.status(200).json({
      status: 'success',
      message: `Successfully generated ${totalQuestions} questions (${totalMarks} marks total) across selected question types.`,
      data: {
        questions: generatedQuestions,
        totalQuestions,
        totalMarks,
        selectedTypes: enabledTypes,
        generatedBy: generationMethod,
        modelUsed
      }
    });
  } catch (error) {
    console.error('Error generating questions:', error);
    next(error);
  }
});

/**
 * @route GET /api/v1/assessments
 * @desc Get all assessments (filtered by course or user role)
 */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const courseId = req.query.courseId;
    let sql = `
      SELECT a.*, c.course_name, c.course_code, u.name as teacher_name
      FROM public.assessments a
      LEFT JOIN public.courses c ON a.course_id = c.course_id
      LEFT JOIN public.users u ON a.created_by = u.user_id
    `;
    const params = [];

    if (courseId) {
      sql += ` WHERE a.course_id = $1`;
      params.push(courseId);
    } else if (req.user?.role === 'TEACHER') {
      sql += ` WHERE a.created_by = $1`;
      params.push(req.user.user_id);
    }

    sql += ` ORDER BY a.created_at DESC`;

    const result = await query(sql, params);

    res.status(200).json({
      status: 'success',
      data: {
        assessments: result.rows,
        count: result.rows.length
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/v1/assessments/:id
 * @desc Get single assessment by ID
 */
router.get('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await query(
      `SELECT a.*, c.course_name, c.course_code, u.name as teacher_name
       FROM public.assessments a
       LEFT JOIN public.courses c ON a.course_id = c.course_id
       LEFT JOIN public.users u ON a.created_by = u.user_id
       WHERE a.assessment_id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        status: 'fail',
        message: `Assessment with ID ${id} not found.`
      });
    }

    res.status(200).json({
      status: 'success',
      data: {
        assessment: result.rows[0]
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route GET /api/v1/assessments/:id/attempts-check
 * @desc Check if student attempts/submissions exist for this assessment
 */
router.get('/:id/attempts-check', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const client = supabaseAdmin || supabase;
    let attemptsCount = 0;

    if (client) {
      try {
        const { count, error } = await client
          .from('attempts')
          .select('*', { count: 'exact', head: true })
          .eq('assessment_id', id);
        if (!error && count !== null && count !== undefined) {
          attemptsCount = count;
        }
      } catch (err) {
        console.warn('Attempts count check note:', err.message);
      }
    }

    res.status(200).json({
      status: 'success',
      data: {
        assessmentId: parseInt(id, 10),
        hasAttempts: attemptsCount > 0,
        attemptsCount
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route POST /api/v1/assessments
 * @desc Create new academic assessment / quiz
 * Week 6 Deliverable 2: Real request with assessment ID and status.
 * Week 6 Deliverable 4: Input validation rejecting missing/invalid data.
 * Week 6 Deliverable 8: Protected by requireAuth.
 */
router.post('/', requireAuth, async (req, res) => {
  try {
    const {
      title,
      description,
      courseId,
      course_id,
      totalMarks,
      total_marks,
      passingMarks,
      passing_marks,
      durationMinutes,
      duration_minutes,
      status,
      questions,
      attemptLimit,
      attempt_limit,
      scheduleOpenAt,
      schedule_open_at,
      scheduleCloseAt,
      schedule_close_at,
      lectureNotes,
      lecture_notes,
      sourceType,
      source_type,
      sourceFileName,
      source_file_name
    } = req.body;

    const validationErrors = [];

    // 1. Title validation
    if (!title || typeof title !== 'string' || title.trim().length < 3) {
      validationErrors.push('Assessment title is required and must be at least 3 characters long.');
    }

    // 2. Course ID validation
    const resolvedCourseId = courseId || course_id;
    if (!resolvedCourseId || isNaN(parseInt(resolvedCourseId, 10))) {
      validationErrors.push('A valid courseId is required to associate this assessment with a curriculum module.');
    }

    // 3. Total marks validation
    const resolvedTotalMarks = totalMarks !== undefined ? parseInt(totalMarks, 10) : (total_marks !== undefined ? parseInt(total_marks, 10) : 100);
    if (isNaN(resolvedTotalMarks) || resolvedTotalMarks <= 0) {
      validationErrors.push('Total marks must be a positive integer greater than 0.');
    }

    // 4. Duration validation
    const resolvedDuration = durationMinutes !== undefined ? parseInt(durationMinutes, 10) : (duration_minutes !== undefined ? parseInt(duration_minutes, 10) : 60);
    if (isNaN(resolvedDuration) || resolvedDuration <= 0) {
      validationErrors.push('Assessment duration must be a positive integer in minutes.');
    }

    // Return structured validation error response if any field fails
    if (validationErrors.length > 0) {
      return res.status(400).json({
        status: 'fail',
        message: 'Validation failed: Please provide all required assessment parameters.',
        errors: validationErrors
      });
    }

    // Check if course exists in the database
    const courseCheck = await query(
      `SELECT course_id, course_name, university_id FROM public.courses WHERE course_id = $1`,
      [resolvedCourseId]
    );

    if (courseCheck.rows.length === 0) {
      return res.status(404).json({
        status: 'fail',
        message: `Course with ID ${resolvedCourseId} does not exist in the institutional curriculum.`
      });
    }

    const resolvedPassingMarks = passingMarks !== undefined ? parseInt(passingMarks, 10) : (passing_marks !== undefined ? parseInt(passing_marks, 10) : Math.round(resolvedTotalMarks * 0.5));
    const resolvedAttemptLimit = attemptLimit !== undefined ? parseInt(attemptLimit, 10) : (attempt_limit !== undefined ? parseInt(attempt_limit, 10) : 1);
    const resolvedScheduleOpenAt = scheduleOpenAt || schedule_open_at || null;
    const resolvedScheduleCloseAt = scheduleCloseAt || schedule_close_at || null;
    const validStatuses = ['DRAFT', 'SAVED', 'PUBLISHED', 'CLOSED', 'ARCHIVED'];
    let resolvedStatus = status ? String(status).toUpperCase().trim() : 'DRAFT';
    if (!validStatuses.includes(resolvedStatus)) {
      resolvedStatus = 'DRAFT';
    }
    const cleanNotes = (lectureNotes || lecture_notes || '').trim();
    const cleanSourceType = (sourceType || source_type || (cleanNotes ? 'TEXT' : 'NONE'));
    const cleanSourceFileName = (sourceFileName || source_file_name || null);
    const questionsJson = JSON.stringify(questions || []);

    let createdAssessment = null;
    const client = supabaseAdmin || supabase;

    if (client) {
      try {
        const { data: inserted, error: insErr } = await client
          .from('assessments')
          .insert({
            title: title.trim(),
            description: description || '',
            course_id: resolvedCourseId,
            user_id: req.user.user_id,
            created_by: req.user.user_id,
            total_marks: resolvedTotalMarks,
            passing_marks: resolvedPassingMarks,
            duration_minutes: resolvedDuration,
            status: resolvedStatus,
            attempt_limit: resolvedAttemptLimit,
            schedule_open_at: resolvedScheduleOpenAt,
            schedule_close_at: resolvedScheduleCloseAt,
            questions: questions || []
          })
          .select('*')
          .single();

        if (!insErr && inserted) {
          createdAssessment = {
            ...inserted,
            lecture_notes: cleanNotes,
            source_type: cleanSourceType,
            source_file_name: cleanSourceFileName
          };
        } else if (insErr) {
          console.warn('Supabase client insert note:', insErr.message);
        }
      } catch (cErr) {
        console.warn('Supabase client insert exception:', cErr.message);
      }
    }

    if (!createdAssessment) {
      try {
        const insertRes = await query(
          `INSERT INTO public.assessments (
            title, description, course_id, user_id, created_by, total_marks, passing_marks, duration_minutes, status, questions, lecture_notes, source_type, source_file_name, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, NOW(), NOW())
          RETURNING assessment_id, title, description, course_id, created_by, total_marks, passing_marks, duration_minutes, status, questions, lecture_notes, source_type, source_file_name, created_at`,
          [
            title.trim(),
            description || '',
            resolvedCourseId,
            req.user.user_id,
            resolvedTotalMarks,
            resolvedPassingMarks,
            resolvedDuration,
            resolvedStatus,
            questionsJson,
            cleanNotes,
            cleanSourceType,
            cleanSourceFileName
          ]
        );
        createdAssessment = insertRes.rows[0];
      } catch (insertErr) {
        // Fallback if lecture_notes column is not yet migrated in table
        const fallbackRes = await query(
          `INSERT INTO public.assessments (
            title, description, course_id, user_id, created_by, total_marks, passing_marks, duration_minutes, status, questions, created_at, updated_at
          )
          VALUES ($1, $2, $3, $4, $4, $5, $6, $7, $8, $9::jsonb, NOW(), NOW())
          RETURNING assessment_id, title, description, course_id, created_by, total_marks, passing_marks, duration_minutes, status, questions, created_at`,
          [
            title.trim(),
            description || '',
            resolvedCourseId,
            req.user.user_id,
            resolvedTotalMarks,
            resolvedPassingMarks,
            resolvedDuration,
            resolvedStatus,
            questionsJson
          ]
        );
        createdAssessment = {
          ...fallbackRes.rows[0],
          lecture_notes: cleanNotes,
          source_type: cleanSourceType,
          source_file_name: cleanSourceFileName
        };
      }
    }

    // Synchronize individual questions into public.questions relational table
    if (createdAssessment && Array.isArray(questions) && questions.length > 0) {
      const assessmentId = createdAssessment.assessment_id;
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        try {
          await query(
            `INSERT INTO public.questions (
              assessment_id, question_text, question_type, marks, difficulty, bloom_level,
              correct_answer, explanation, rubric, programming_language, starter_code, sort_order
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
            [
              assessmentId,
              q.question || q.title || `Question ${i + 1}`,
              q.type || 'MCQ',
              Number(q.marks) || 10,
              q.difficulty || 'medium',
              q.bloomLevel || q.bloom_level || 'understand',
              q.correctAnswer || q.solutionCode || q.modelAnswer || '',
              q.explanation || '',
              q.rubric ? JSON.stringify({ rubric: q.rubric }) : null,
              q.programmingLanguage || null,
              q.starterCode || null,
              i + 1
            ]
          );
        } catch (qErr) {
          // Log non-fatal error to avoid failing the assessment creation
          console.warn('Could not insert question row into public.questions table:', qErr.message);
        }
      }
    }

    return res.status(201).json({
      status: 'success',
      message: 'Assessment created successfully.',
      data: {
        assessment: createdAssessment
      }
    });
  } catch (error) {
    console.error('Error creating assessment:', error);
    return res.status(500).json({
      status: 'error',
      message: error.message || 'Internal server error while creating assessment.'
    });
  }
});

/**
 * @route PATCH /api/v1/assessments/:id
 * @desc Update assessment details (title can be edited later, status lifecycle, passing marks, duration)
 */
router.patch('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      status,
      durationMinutes,
      passingMarks,
      courseId,
      course_id,
      attemptLimit,
      attempt_limit,
      scheduleOpenAt,
      schedule_open_at,
      scheduleCloseAt,
      schedule_close_at
    } = req.body;
    const client = supabaseAdmin || supabase;

    // Validate title if provided
    if (title !== undefined) {
      if (typeof title !== 'string' || title.trim().length < 3) {
        return res.status(400).json({
          status: 'fail',
          message: 'Title must be at least 3 characters long.'
        });
      }
    }

    // Validate status if provided
    const validStatuses = ['DRAFT', 'SAVED', 'PUBLISHED', 'CLOSED', 'ARCHIVED'];
    let normalizedStatus = undefined;
    if (status !== undefined) {
      normalizedStatus = String(status).toUpperCase().trim();
      if (!validStatuses.includes(normalizedStatus)) {
        return res.status(400).json({
          status: 'fail',
          message: `Invalid status "${status}". Allowed values: ${validStatuses.join(', ')}`
        });
      }
    }

    const updates = { updated_at: new Date().toISOString() };
    if (title !== undefined) updates.title = title.trim();
    if (description !== undefined) updates.description = description.trim();
    if (normalizedStatus !== undefined) updates.status = normalizedStatus;
    if (durationMinutes !== undefined) updates.duration_minutes = parseInt(durationMinutes, 10);
    if (passingMarks !== undefined) updates.passing_marks = parseInt(passingMarks, 10);
    if (courseId !== undefined || course_id !== undefined) updates.course_id = parseInt(courseId || course_id, 10);
    if (attemptLimit !== undefined || attempt_limit !== undefined) {
      updates.attempt_limit = Math.max(1, parseInt(attemptLimit || attempt_limit, 10) || 1);
    }
    if (scheduleOpenAt !== undefined || schedule_open_at !== undefined) {
      updates.schedule_open_at = scheduleOpenAt || schedule_open_at || null;
    }
    if (scheduleCloseAt !== undefined || schedule_close_at !== undefined) {
      updates.schedule_close_at = scheduleCloseAt || schedule_close_at || null;
    }

    if (client) {
      const { data, error } = await client
        .from('assessments')
        .update(updates)
        .eq('assessment_id', id)
        .select('*')
        .single();

      if (error) {
        return res.status(400).json({ status: 'fail', message: error.message });
      }

      return res.status(200).json({
        status: 'success',
        message: 'Assessment updated successfully.',
        data: { assessment: data }
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'Assessment updated successfully.'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route PATCH /api/v1/assessments/:id/archive
 * @desc Toggle archive status for an assessment (ARCHIVED vs SAVED/DRAFT)
 */
router.patch('/:id/archive', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const client = supabaseAdmin || supabase;

    if (!client) {
      return res.status(500).json({ status: 'error', message: 'Database client not initialized.' });
    }

    const { data: current, error: getErr } = await client
      .from('assessments')
      .select('assessment_id, status, title')
      .eq('assessment_id', id)
      .single();

    if (getErr || !current) {
      return res.status(404).json({ status: 'fail', message: `Assessment #${id} not found.` });
    }

    const nextStatus = current.status === 'ARCHIVED' ? 'SAVED' : 'ARCHIVED';

    const { data: updated, error: updErr } = await client
      .from('assessments')
      .update({ status: nextStatus, updated_at: new Date().toISOString() })
      .eq('assessment_id', id)
      .select('*')
      .single();

    if (updErr) {
      return res.status(400).json({ status: 'fail', message: updErr.message });
    }

    res.status(200).json({
      status: 'success',
      message: nextStatus === 'ARCHIVED'
        ? `Assessment "${current.title}" successfully archived.`
        : `Assessment "${current.title}" restored from archive to SAVED status.`,
      data: { assessment: updated }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route DELETE /api/v1/assessments/:id
 * @desc Delete assessment with explicit warning when attempts exist
 */
router.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    const { id } = req.params;
    const force = req.query.force === 'true';
    const client = supabaseAdmin || supabase;

    if (!client) {
      return res.status(500).json({ status: 'error', message: 'Database client not initialized.' });
    }

    // Check if assessment exists
    const { data: assessment, error: fetchErr } = await client
      .from('assessments')
      .select('assessment_id, title')
      .eq('assessment_id', id)
      .single();

    if (fetchErr || !assessment) {
      return res.status(404).json({ status: 'fail', message: `Assessment #${id} not found.` });
    }

    // Check if student attempts exist for this assessment
    let attemptsCount = 0;
    try {
      const { count, error: attErr } = await client
        .from('attempts')
        .select('*', { count: 'exact', head: true })
        .eq('assessment_id', id);
      if (!attErr && count !== null && count !== undefined) {
        attemptsCount = count;
      }
    } catch (e) {
      console.warn('Error checking attempts during delete:', e.message);
    }

    // If attempts exist and force is not explicitly passed, return warning with attempt count
    if (attemptsCount > 0 && !force) {
      return res.status(409).json({
        status: 'fail',
        code: 'ATTEMPTS_EXIST',
        hasAttempts: true,
        attemptsCount,
        message: `⚠️ Warning: ${attemptsCount} student submission(s) exist for "${assessment.title}". Deleting will permanently erase all student scores, answers, and submission history. Confirm with force=true to proceed.`,
        requiresConfirmation: true
      });
    }

    // Delete associated questions
    try {
      await client.from('questions').delete().eq('assessment_id', id);
    } catch (e) {}

    // Delete attempts if forced
    if (attemptsCount > 0 && force) {
      try {
        await client.from('attempts').delete().eq('assessment_id', id);
      } catch (e) {}
    }

    // Delete assessment
    const { error: delErr } = await client
      .from('assessments')
      .delete()
      .eq('assessment_id', id);

    if (delErr) {
      return res.status(400).json({ status: 'fail', message: delErr.message });
    }

    res.status(200).json({
      status: 'success',
      message: `Assessment "${assessment.title}" deleted successfully.`
    });
  } catch (error) {
    next(error);
  }
});

export default router;
