<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useAuth } from '../store/auth';
import {
  createAssessment,
  fetchTeacherCourses,
  fetchAssessments,
  extractPdfLectureNotes,
  generateAssessmentQuestions,
  updateAssessment,
  archiveAssessment,
  checkAssessmentAttempts,
  deleteAssessment,
  publishAssessment,
  revertAssessmentDraft,
  exportToGoogleDoc,
  exportToPdf,
  exportToMoodle,
  exportToGoogleForms,
  fetchExportHistory,
  deleteExportHistoryItem
} from '../api';

const router = useRouter();
const auth = useAuth();

const courses = ref([]);
const existingAssessments = ref([]);
const isLoadingCourses = ref(true);
const isSubmitting = ref(false);
const errorMessage = ref('');
const validationErrors = ref([]);
const successMessage = ref('');
const createdAssessmentRecord = ref(null);

// Lecture Notes & PDF Extraction State
const lectureNotesMode = ref('text'); // 'text' | 'pdf'
const isExtractingPdf = ref(false);
const pdfExtractionError = ref('');
const pdfExtractionSuccess = ref('');
const pdfDetails = ref(null);
const selectedPdfFile = ref(null);
const showNotesModal = ref(false);
const activeNotesItem = ref(null);

// Teacher selects ONLY ONE question type: 'MCQ' | 'SHORT_QUESTION' | 'CODING_QUESTION'
const selectedQuestionType = ref('MCQ');

const singleTypeConfig = ref({
  mcq: {
    count: 5,
    marksPerQuestion: 20,
    difficulty: 'medium',
    optionsCount: 4,
    bloomDistribution: {
      remember: 25,
      understand: 25,
      apply: 50,
      analyze: 0,
      evaluate: 0,
      create: 0
    }
  },
  shortQuestion: {
    count: 4,
    marksPerQuestion: 25,
    difficulty: 'medium',
    bloomDistribution: {
      remember: 25,
      understand: 50,
      apply: 25,
      analyze: 0,
      evaluate: 0,
      create: 0
    }
  },
  codingQuestion: {
    count: 2,
    marksPerQuestion: 50,
    language: 'Python',
    difficulty: 'medium',
    bloomDistribution: {
      remember: 0,
      understand: 0,
      apply: 50,
      analyze: 50,
      evaluate: 0,
      create: 0
    }
  }
});

const bloomTaxonomyMetadata = [
  { level: 'remember', label: 'Remember', verb: 'Recall & Identify', desc: 'Facts, definitions, formulas, terms', icon: '🧠', color: '#2563EB' },
  { level: 'understand', label: 'Understand', verb: 'Explain & Compare', desc: 'Concepts, summaries, relationships', icon: '💡', color: '#0891B2' },
  { level: 'apply', label: 'Apply', verb: 'Execute & Solve', desc: 'Practical problem solving, algorithms', icon: '⚙️', color: '#059669' },
  { level: 'analyze', label: 'Analyze', verb: 'Differentiate & Trace', desc: 'Trade-offs, debugging, complexities', icon: '🔍', color: '#D97706' },
  { level: 'evaluate', label: 'Evaluate', verb: 'Critique & Justify', desc: 'Design decisions, architectural judgments', icon: '⚖️', color: '#7C3AED' },
  { level: 'create', label: 'Create', verb: 'Design & Synthesize', desc: 'New algorithms, schemas, systems', icon: '🚀', color: '#DB2777' }
];

const activeBloomTotalPercent = computed(() => {
  const dist = activeTypeParams.value.bloomDistribution || {};
  return Object.values(dist).reduce((sum, p) => sum + (Number(p) || 0), 0);
});

const calculateBloomCount = (level, totalQuestions) => {
  const total = Number(totalQuestions) || 1;
  const dist = activeTypeParams.value.bloomDistribution || {};
  const pct = Number(dist[level]) || 0;
  if (pct === 0) return 0;
  return Math.max(1, Math.round((pct / 100) * total));
};

const getBloomCountsForType = (typeConfig) => {
  const total = Number(typeConfig.count) || 1;
  const dist = typeConfig.bloomDistribution || {};
  const activeEntries = Object.entries(dist).filter(([_, pct]) => Number(pct) > 0);

  if (activeEntries.length === 0) {
    return [{ level: 'understand', count: total, percent: 100 }];
  }

  let allocated = 0;
  const list = activeEntries.map(([level, pct]) => {
    const raw = Math.round((Number(pct) / 100) * total);
    const count = Math.max(1, raw);
    allocated += count;
    return { level, percent: Number(pct), count };
  });

  const diff = total - allocated;
  if (diff !== 0 && list.length > 0) {
    list.sort((a, b) => b.percent - a.percent);
    list[0].count = Math.max(1, list[0].count + diff);
  }

  return list;
};

const toggleBloomLevel = (level) => {
  const dist = activeTypeParams.value.bloomDistribution;
  if (!dist) return;
  if (Number(dist[level]) > 0) {
    dist[level] = 0;
  } else {
    const currentTotal = activeBloomTotalPercent.value;
    const remaining = Math.max(0, 100 - currentTotal);
    dist[level] = remaining > 0 ? remaining : 25;
  }
};

const applyBloomPreset = (preset) => {
  const dist = activeTypeParams.value.bloomDistribution;
  if (!dist) return;
  Object.keys(dist).forEach(k => { dist[k] = 0; });
  if (preset === 'foundational') {
    dist.remember = 50;
    dist.understand = 50;
  } else if (preset === 'application') {
    dist.remember = 25;
    dist.understand = 25;
    dist.apply = 50;
  } else if (preset === 'analytical') {
    dist.apply = 30;
    dist.analyze = 40;
    dist.evaluate = 30;
  } else if (preset === 'balanced') {
    dist.remember = 20;
    dist.understand = 30;
    dist.apply = 30;
    dist.analyze = 20;
  } else if (preset === 'equal') {
    const activeKeys = Object.keys(dist).filter(k => dist[k] > 0);
    const keysToUse = activeKeys.length > 0 ? activeKeys : ['remember', 'understand', 'apply'];
    const share = Math.floor(100 / keysToUse.length);
    const remainder = 100 - (share * keysToUse.length);
    keysToUse.forEach((k, idx) => {
      dist[k] = share + (idx === 0 ? remainder : 0);
    });
  }
};

const autoBalanceBloom = () => {
  applyBloomPreset('equal');
};

const activeTypeParams = computed(() => {
  if (selectedQuestionType.value === 'MCQ') return singleTypeConfig.value.mcq;
  if (selectedQuestionType.value === 'SHORT_QUESTION') return singleTypeConfig.value.shortQuestion;
  return singleTypeConfig.value.codingQuestion;
});

const syncAssessmentMarksFromParams = () => {
  const total = (Number(activeTypeParams.value.count) || 1) * (Number(activeTypeParams.value.marksPerQuestion) || 10);
  form.value.totalMarks = total;
  form.value.passingMarks = Math.round(total * 0.5);
};

const isGeneratingQuestions = ref(false);
const generationSuccessMsg = ref('');
const generationErrorMsg = ref('');

// Active list of configured questions
const questionsList = ref([
  {
    id: 1,
    type: 'MCQ',
    question: 'What is the worst-case time complexity of searching in an unbalanced Binary Search Tree?',
    options: ['O(1)', 'O(log n)', 'O(n)', 'O(n log n)'],
    correctAnswer: 'O(n)',
    explanation: 'When an unbalanced BST degrades into a linear chain/linked list, worst-case search requires examining all n nodes.',
    difficulty: 'medium',
    marks: 20
  },
  {
    id: 2,
    type: 'MCQ',
    question: 'Which abstract data type strictly adheres to the Last-In, First-Out (LIFO) protocol?',
    options: ['Queue', 'Stack', 'Priority Queue', 'Circular Buffer'],
    correctAnswer: 'Stack',
    explanation: 'A Stack pushes and pops elements exclusively from the top, adhering to the LIFO discipline.',
    difficulty: 'easy',
    marks: 20
  },
  {
    id: 3,
    type: 'MCQ',
    question: 'In a circular queue implemented with an array of capacity N, what condition indicates the queue is full?',
    options: ['front == rear', '(rear + 1) % N == front', 'rear == N - 1', 'front == -1'],
    correctAnswer: '(rear + 1) % N == front',
    explanation: 'The modulo arithmetic wrap-around determines fullness when incrementing rear by one meets front.',
    difficulty: 'medium',
    marks: 20
  },
  {
    id: 4,
    type: 'MCQ',
    question: 'What is the auxiliary space complexity of standard Depth-First Search (DFS) on a binary tree with maximum depth h?',
    options: ['O(1)', 'O(h)', 'O(n^2)', 'O(2^h)'],
    correctAnswer: 'O(h)',
    explanation: 'The recursion call stack depth is proportional to the tree height h.',
    difficulty: 'medium',
    marks: 20
  },
  {
    id: 5,
    type: 'MCQ',
    question: 'Which collision resolution strategy in hash tables links colliding elements into a linked list at the hashed bucket index?',
    options: ['Linear Probing', 'Quadratic Probing', 'Separate Chaining', 'Double Hashing'],
    correctAnswer: 'Separate Chaining',
    explanation: 'Separate chaining stores all elements hashing to the same slot in an auxiliary list at that index.',
    difficulty: 'easy',
    marks: 20
  }
]);

// Computed totals
const totalQuestionsMarks = computed(() => {
  return questionsList.value.reduce((sum, q) => sum + (Number(q.marks) || 0), 0);
});

const isMarksSynced = computed(() => {
  return Number(form.value.totalMarks) === totalQuestionsMarks.value;
});

const syncTotalMarks = () => {
  form.value.totalMarks = totalQuestionsMarks.value;
  form.value.passingMarks = Math.round(totalQuestionsMarks.value * 0.5);
};

const selectQuestionType = (type) => {
  selectedQuestionType.value = type;
  loadDefaultQuestionsForType(type);
};

const loadDefaultQuestionsForType = (type) => {
  if (type === 'MCQ') {
    singleTypeConfig.value.mcq.count = 5;
    singleTypeConfig.value.mcq.marksPerQuestion = 20;
    const numOpts = singleTypeConfig.value.mcq.optionsCount || 4;
    const optionLabels = ['A', 'B', 'C', 'D', 'E', 'F'];

    // Helper to adjust options array to configured length
    const adjustOptions = (opts) => {
      if (opts.length >= numOpts) return opts.slice(0, numOpts);
      const extra = Array.from({ length: numOpts - opts.length }, (_, i) => `Option ${optionLabels[opts.length + i] || (opts.length + i + 1)}`);
      return [...opts, ...extra];
    };

    questionsList.value = [
      {
        id: 1,
        type: 'MCQ',
        question: 'What is the worst-case time complexity of searching in an unbalanced Binary Search Tree?',
        options: adjustOptions(['O(1)', 'O(log n)', 'O(n)', 'O(n log n)']),
        correctAnswer: 'O(n)',
        explanation: 'When an unbalanced BST degrades into a linear chain/linked list, worst-case search requires examining all n nodes.',
        difficulty: 'medium',
        bloomLevel: singleTypeConfig.value.mcq.bloomLevel || 'understand',
        marks: 20
      },
      {
        id: 2,
        type: 'MCQ',
        question: 'Which abstract data type strictly adheres to the Last-In, First-Out (LIFO) protocol?',
        options: adjustOptions(['Queue', 'Stack', 'Priority Queue', 'Circular Buffer']),
        correctAnswer: 'Stack',
        explanation: 'A Stack pushes and pops elements exclusively from the top, adhering to the LIFO discipline.',
        difficulty: 'easy',
        bloomLevel: singleTypeConfig.value.mcq.bloomLevel || 'remember',
        marks: 20
      },
      {
        id: 3,
        type: 'MCQ',
        question: 'In a circular queue implemented with an array of capacity N, what condition indicates the queue is full?',
        options: adjustOptions(['front == rear', '(rear + 1) % N == front', 'rear == N - 1', 'front == -1']),
        correctAnswer: '(rear + 1) % N == front',
        explanation: 'The modulo arithmetic wrap-around determines fullness when incrementing rear by one meets front.',
        difficulty: 'medium',
        bloomLevel: singleTypeConfig.value.mcq.bloomLevel || 'understand',
        marks: 20
      },
      {
        id: 4,
        type: 'MCQ',
        question: 'What is the auxiliary space complexity of standard Depth-First Search (DFS) on a binary tree with maximum depth h?',
        options: adjustOptions(['O(1)', 'O(h)', 'O(n^2)', 'O(2^h)']),
        correctAnswer: 'O(h)',
        explanation: 'The recursion call stack depth is proportional to the tree height h.',
        difficulty: 'medium',
        bloomLevel: singleTypeConfig.value.mcq.bloomLevel || 'analyze',
        marks: 20
      },
      {
        id: 5,
        type: 'MCQ',
        question: 'Which collision resolution strategy in hash tables links colliding elements into a linked list at the hashed bucket index?',
        options: adjustOptions(['Linear Probing', 'Quadratic Probing', 'Separate Chaining', 'Double Hashing']),
        correctAnswer: 'Separate Chaining',
        explanation: 'Separate chaining stores all elements hashing to the same slot in an auxiliary list at that index.',
        difficulty: 'easy',
        bloomLevel: singleTypeConfig.value.mcq.bloomLevel || 'remember',
        marks: 20
      }
    ];
  } else if (type === 'SHORT_QUESTION') {
    singleTypeConfig.value.shortQuestion.count = 4;
    singleTypeConfig.value.shortQuestion.marksPerQuestion = 25;
    questionsList.value = [
      {
        id: 1,
        type: 'SHORT_QUESTION',
        question: 'Compare the memory footprint and traversal capabilities between singly linked lists and doubly linked lists.',
        modelAnswer: 'Singly linked lists store only one pointer (next) per node, saving memory but only permitting forward traversal. Doubly linked lists store two pointers (next and prev) per node, incurring extra pointer storage per node but enabling bidirectional traversal and O(1) node removal given a node pointer.',
        rubric: 'Award full marks for contrasting pointer overhead, forward-only vs bidirectional movement, and deletion operation complexities.',
        explanation: 'Doubly linked lists trade O(n) additional pointer memory for O(1) reverse traversal and node removal capabilities.',
        difficulty: 'medium',
        bloomLevel: singleTypeConfig.value.shortQuestion.bloomLevel || 'analyze',
        marks: 25
      },
      {
        id: 2,
        type: 'SHORT_QUESTION',
        question: 'Explain why in-order traversal of a valid Binary Search Tree produces values in strictly ascending sorted order.',
        modelAnswer: 'In-order traversal visits the left subtree, then the root node, and finally the right subtree (LNR). By definition of a BST, every key in the left subtree is less than the root, and every key in the right subtree is greater. Therefore, visiting Left -> Root -> Right recursively enumerates keys in non-decreasing/ascending sorted sequence.',
        rubric: 'Award 50% for defining in-order (LNR) and 50% for connecting it directly to the BST ordering invariant (left < root < right).',
        explanation: 'The fundamental invariant of BSTs guarantees all left descendants are smaller and right descendants larger than the current node.',
        difficulty: 'medium',
        bloomLevel: singleTypeConfig.value.shortQuestion.bloomLevel || 'understand',
        marks: 25
      },
      {
        id: 3,
        type: 'SHORT_QUESTION',
        question: 'Describe how a circular queue overcomes the memory utilization bottleneck of a conventional linear array-based queue.',
        modelAnswer: 'In a linear queue, dequeue operations increment the front pointer, creating unused empty cells at the start that cannot be reused once rear reaches the end. A circular queue wraps around using modulo arithmetic ((rear + 1) % capacity), allowing newly freed slots at the beginning of the buffer to be reused.',
        rubric: 'Award 15 marks for identifying the false overflow issue in linear queues, and 10 marks for explaining the modulo wrap-around mechanism.',
        explanation: 'Modulo arithmetic simulates a ring buffer over contiguous linear memory, achieving maximal capacity reuse without shifting elements.',
        difficulty: 'medium',
        bloomLevel: singleTypeConfig.value.shortQuestion.bloomLevel || 'apply',
        marks: 25
      },
      {
        id: 4,
        type: 'SHORT_QUESTION',
        question: 'Differentiate between worst-case and average-case time complexities of searching in a Hash Table.',
        modelAnswer: 'In the average case with a uniform hash function and load factor < 1, searching requires O(1) constant time. In the worst case where all n keys hash to the identical bucket (collision clustering), search degrades to O(n) linear scanning.',
        rubric: 'Award 15 marks for identifying O(1) average case vs O(n) worst case, and 10 marks for explaining hash collision clustering.',
        explanation: 'Hash distributions depend on universal hashing and load factors; extreme collisions reduce a hash table into an unsorted linked list.',
        difficulty: 'hard',
        bloomLevel: singleTypeConfig.value.shortQuestion.bloomLevel || 'evaluate',
        marks: 25
      }
    ];
  } else if (type === 'CODING_QUESTION') {
    singleTypeConfig.value.codingQuestion.count = 2;
    singleTypeConfig.value.codingQuestion.marksPerQuestion = 50;
    const lang = singleTypeConfig.value.codingQuestion.language || 'Python';
    questionsList.value = [
      {
        id: 1,
        type: 'CODING_QUESTION',
        programmingLanguage: lang,
        question: `Write a ${lang} function 'is_valid_brackets(s)' that takes a string of bracket characters ('(', ')', '[', ']', '{', '}') and returns True if all opening brackets are closed in the exact correct nested order, and False otherwise.`,
        starterCode: lang === 'Python'
          ? 'def is_valid_brackets(s: str) -> bool:\n    # Implement balanced parenthesis validation using a Stack\n    stack = []\n    pass\n'
          : 'function isValidBrackets(s) {\n    // Implement using a stack\n    return false;\n}\n',
        sampleInput: '"({[]})"',
        sampleOutput: 'True',
        rubric: 'Correctness (60%): Passes valid and invalid bracket cases. Edge cases (20%): Empty string, unclosed opening, unmatched closing. Complexity (20%): O(n) time, O(n) space.',
        solutionCode: 'def is_valid_brackets(s: str) -> bool:\n    stack = []\n    mapping = {")": "(", "}": "{", "]": "["}\n    for char in s:\n        if char in mapping.values():\n            stack.append(char)\n        elif char in mapping:\n            if not stack or stack.pop() != mapping[char]:\n                return False\n    return len(stack) == 0\n',
        difficulty: 'medium',
        bloomLevel: singleTypeConfig.value.codingQuestion.bloomLevel || 'apply',
        marks: 50
      },
      {
        id: 2,
        type: 'CODING_QUESTION',
        programmingLanguage: lang,
        question: `Implement a function 'is_valid_bst(root)' in ${lang} that validates whether a given binary tree satisfies all properties of a Binary Search Tree (for every node, left < node < right).`,
        starterCode: lang === 'Python'
          ? 'class TreeNode:\n    def __init__(self, val=0, left=None, right=None):\n        self.val = val\n        self.left = left\n        self.right = right\n\ndef is_valid_bst(root: TreeNode) -> bool:\n    # Validate BST invariants\n    pass\n'
          : 'function isValidBST(root) {\n    // Validate BST\n    return true;\n}\n',
        sampleInput: 'root = [2, 1, 3]',
        sampleOutput: 'True',
        rubric: 'Correctness (60%): Checks left < root < right across entire subtree bounds. Edge cases (20%): Empty tree, single leaf. Complexity (20%): O(n) traversal, O(h) recursion stack.',
        solutionCode: 'def is_valid_bst(root, min_val=float("-inf"), max_val=float("inf")):\n    if not root:\n        return True\n    if not (min_val < root.val < max_val):\n        return False\n    return is_valid_bst(root.left, min_val, root.val) and is_valid_bst(root.right, root.val, max_val)\n',
        difficulty: 'hard',
        bloomLevel: singleTypeConfig.value.codingQuestion.bloomLevel || 'analyze',
        marks: 50
      }
    ];
  }
  syncTotalMarks();
};

// Generate Questions with AI via backend
const handleGenerateQuestionsWithAi = async () => {
  isGeneratingQuestions.value = true;
  generationErrorMsg.value = '';
  generationSuccessMsg.value = '';

  const targetCourse = courses.value.find(c => c.course_id == form.value.courseId);
  const courseName = targetCourse?.course_name || 'Academic Course';

  // If the user selected a PDF file but hasn't extracted it yet, automatically extract it now!
  if (selectedPdfFile.value && (!form.value.lectureNotes || form.value.sourceType !== 'PDF')) {
    try {
      isExtractingPdf.value = true;
      const pdfRes = await extractPdfLectureNotes(auth.token.value, selectedPdfFile.value);
      if (pdfRes.data?.hasReadableText) {
        form.value.lectureNotes = pdfRes.data.text;
        form.value.sourceType = 'PDF';
        form.value.sourceFileName = selectedPdfFile.value.name;
        pdfDetails.value = pdfRes.data;
        pdfExtractionSuccess.value = `✓ Extracted ${pdfRes.data.wordCount.toLocaleString()} words from "${selectedPdfFile.value.name}".`;
      }
    } catch (pdfErr) {
      console.warn('Auto-extraction of PDF before generation failed:', pdfErr);
      if (pdfErr.hasReadableText === false || pdfErr.code === 'NO_READABLE_TEXT') {
        generationErrorMsg.value = '⚠️ Uploaded PDF has no readable text. Please enter instructions or lecture notes as text.';
        isGeneratingQuestions.value = false;
        isExtractingPdf.value = false;
        return;
      }
    } finally {
      isExtractingPdf.value = false;
    }
  }

  try {
    const payload = {
      lectureNotes: form.value.lectureNotes || '',
      topic: form.value.description || '',
      title: form.value.title || 'Examination',
      courseName,
      selectedTypes: [selectedQuestionType.value], // STRICTLY THE SINGLE SELECTED TYPE
      config: {
        mcq: {
          count: singleTypeConfig.value.mcq.count,
          marks: singleTypeConfig.value.mcq.marksPerQuestion,
          difficulty: singleTypeConfig.value.mcq.difficulty,
          bloomDistribution: singleTypeConfig.value.mcq.bloomDistribution,
          bloomBreakdown: getBloomCountsForType(singleTypeConfig.value.mcq),
          optionsCount: singleTypeConfig.value.mcq.optionsCount
        },
        shortQuestion: {
          count: singleTypeConfig.value.shortQuestion.count,
          marks: singleTypeConfig.value.shortQuestion.marksPerQuestion,
          difficulty: singleTypeConfig.value.shortQuestion.difficulty,
          bloomDistribution: singleTypeConfig.value.shortQuestion.bloomDistribution,
          bloomBreakdown: getBloomCountsForType(singleTypeConfig.value.shortQuestion)
        },
        codingQuestion: {
          count: singleTypeConfig.value.codingQuestion.count,
          marks: singleTypeConfig.value.codingQuestion.marksPerQuestion,
          language: singleTypeConfig.value.codingQuestion.language,
          difficulty: singleTypeConfig.value.codingQuestion.difficulty,
          bloomDistribution: singleTypeConfig.value.codingQuestion.bloomDistribution,
          bloomBreakdown: getBloomCountsForType(singleTypeConfig.value.codingQuestion)
        }
      }
    };

    const res = await generateAssessmentQuestions(auth.token.value, payload);
    if (res.status === 'success' && res.data?.questions) {
      // Force replacement of questionsList with fresh reactive array
      questionsList.value = [...res.data.questions];
      const typeLabel = selectedQuestionType.value === 'MCQ' ? 'MCQs' : (selectedQuestionType.value === 'SHORT_QUESTION' ? 'Short Questions' : 'Coding Questions');
      if (res.data.generatedBy === 'gemini') {
        const modelInfo = res.data.modelUsed ? ` (${res.data.modelUsed})` : '';
        generationSuccessMsg.value = `✓ Successfully generated ${res.data.totalQuestions} ${typeLabel} (${res.data.totalMarks} marks) with Gemini AI${modelInfo} based on your instructions and materials!`;
      } else {
        generationSuccessMsg.value = `⚠️ AI server was temporarily busy. Generated ${res.data.totalQuestions} context-aware ${typeLabel} (${res.data.totalMarks} marks) matching your topic. You can review them or click "Generate MCQs with AI" again to retry.`;
      }
      generationErrorMsg.value = '';
      
      // Auto-sync total marks to match generated questions
      if (res.data.totalMarks > 0) {
        form.value.totalMarks = res.data.totalMarks;
        form.value.passingMarks = Math.round(res.data.totalMarks * 0.5);
      }

      // Persist new questions immediately to storage
      persistStudioState();

      // Smooth scroll to questions deck so the educator sees the generated questions immediately
      setTimeout(() => {
        const deckEl = document.querySelector('.questions-deck-section');
        if (deckEl) {
          deckEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 100);
    } else {
      generationErrorMsg.value = res.message || 'No questions were returned by the generation engine. Please try again.';
    }
  } catch (err) {
    console.error('Question generation failed:', err);
    generationErrorMsg.value = err.message || 'Failed to generate questions. You can add or edit questions manually.';
  } finally {
    isGeneratingQuestions.value = false;
  }
};

const getPrimaryBloomLevel = (typeKey) => {
  const dist = singleTypeConfig.value[typeKey]?.bloomDistribution || {};
  const sorted = Object.entries(dist).sort((a, b) => Number(b[1]) - Number(a[1]));
  return (sorted[0] && Number(sorted[0][1]) > 0) ? sorted[0][0] : 'understand';
};

const addManualQuestion = () => {
  const type = selectedQuestionType.value;
  const nextId = questionsList.value.length > 0
    ? Math.max(...questionsList.value.map(q => q.id || 0)) + 1
    : 1;

  if (type === 'MCQ') {
    const numOpts = singleTypeConfig.value.mcq.optionsCount || 4;
    const optionLabels = ['A', 'B', 'C', 'D', 'E', 'F'];
    const options = Array.from({ length: numOpts }, (_, i) => `Option ${optionLabels[i] || (i + 1)}`);
    questionsList.value.push({
      id: nextId,
      type: 'MCQ',
      question: 'Enter your multiple choice question prompt here...',
      options,
      correctAnswer: options[0],
      explanation: 'Explanation for why this is the correct option.',
      difficulty: singleTypeConfig.value.mcq.difficulty || 'medium',
      bloomLevel: getPrimaryBloomLevel('mcq'),
      marks: Number(singleTypeConfig.value.mcq.marksPerQuestion) || 20
    });
  } else if (type === 'SHORT_QUESTION') {
    questionsList.value.push({
      id: nextId,
      type: 'SHORT_QUESTION',
      question: 'Enter short answer / conceptual question prompt here...',
      modelAnswer: 'Comprehensive model answer for evaluation.',
      rubric: 'Grading rubric and key concepts expected in student submission.',
      explanation: 'Explanatory notes detailing why this model answer satisfies the learning objectives.',
      difficulty: singleTypeConfig.value.shortQuestion.difficulty || 'medium',
      bloomLevel: getPrimaryBloomLevel('shortQuestion'),
      marks: Number(singleTypeConfig.value.shortQuestion.marksPerQuestion) || 25
    });
  } else if (type === 'CODING_QUESTION') {
    const lang = singleTypeConfig.value.codingQuestion.language || 'Python';
    questionsList.value.push({
      id: nextId,
      type: 'CODING_QUESTION',
      programmingLanguage: lang,
      question: 'Write a program or function that solves the specified computational task...',
      starterCode: lang === 'Python' ? 'def solution():\n    pass\n' : '// Write solution here\n',
      sampleInput: 'sample input',
      sampleOutput: 'expected output',
      rubric: 'Grading rubric: functionality (60%), edge cases (20%), algorithmic complexity (20%).',
      solutionCode: lang === 'Python' ? 'def solution():\n    return True\n' : '',
      difficulty: singleTypeConfig.value.codingQuestion.difficulty || 'medium',
      bloomLevel: getPrimaryBloomLevel('codingQuestion'),
      marks: Number(singleTypeConfig.value.codingQuestion.marksPerQuestion) || 50
    });
  }
  syncTotalMarks();
};

const moveQuestionUp = (index) => {
  if (index <= 0) return;
  const temp = questionsList.value[index];
  questionsList.value[index] = questionsList.value[index - 1];
  questionsList.value[index - 1] = temp;
};

const moveQuestionDown = (index) => {
  if (index >= questionsList.value.length - 1) return;
  const temp = questionsList.value[index];
  questionsList.value[index] = questionsList.value[index + 1];
  questionsList.value[index + 1] = temp;
};

const addMcqOption = (q) => {
  if (!Array.isArray(q.options)) {
    q.options = ['Option A', 'Option B'];
  }
  if (q.options.length >= 6) return;
  const labels = ['A', 'B', 'C', 'D', 'E', 'F'];
  const nextLabel = labels[q.options.length] || `Option ${q.options.length + 1}`;
  q.options.push(`Option ${nextLabel}`);
};

const removeMcqOption = (q, optIdx) => {
  if (!Array.isArray(q.options) || q.options.length <= 2) return;
  const removedOpt = q.options[optIdx];
  q.options.splice(optIdx, 1);
  if (q.correctAnswer === removedOpt) {
    q.correctAnswer = q.options[0] || '';
  }
};

const removeQuestion = (index) => {
  questionsList.value.splice(index, 1);
  syncTotalMarks();
};

const resetQuestionsToSample = () => {
  loadDefaultQuestionsForType(selectedQuestionType.value);
  generationSuccessMsg.value = `Reset to standard sample ${selectedQuestionType.value} questions.`;
  generationErrorMsg.value = '';
};

// ==========================================
// STUDENT QUIZ PREVIEW STATE & ACTIONS
// ==========================================
const showStudentPreviewModal = ref(false);
const previewQuizData = ref(null);
const showTeacherGradingOverlay = ref(false);
const simulatedStudentAnswers = ref({});
const simulatedTimerSeconds = ref(3600);

const formatSimulatedTime = (seconds) => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

const openStudentPreview = (questions, title, courseId, durationMinutes, totalMarks) => {
  const courseObj = courses.value.find(c => String(c.course_id) === String(courseId));
  previewQuizData.value = {
    title: title || 'Assessment Preview',
    courseName: courseObj ? (courseObj.course_name || courseObj.name) : 'Curriculum Assessment',
    courseCode: courseObj?.course_code || 'CS',
    durationMinutes: durationMinutes || 60,
    totalMarks: totalMarks || 100,
    questions: JSON.parse(JSON.stringify(questions || []))
  };
  simulatedStudentAnswers.value = {};
  showTeacherGradingOverlay.value = false;
  simulatedTimerSeconds.value = (Number(durationMinutes) || 60) * 60;
  showStudentPreviewModal.value = true;
};

const closeStudentPreview = () => {
  showStudentPreviewModal.value = false;
  previewQuizData.value = null;
  showTeacherGradingOverlay.value = false;
};

// ==========================================
// RENAME ASSESSMENT (TITLE EDITING LATER)
// ==========================================
const showRenameModal = ref(false);
const renamingAssessment = ref(null);
const renameTitleInput = ref('');
const isRenaming = ref(false);
const renameError = ref('');

const openRenameModal = (assessment) => {
  renamingAssessment.value = assessment;
  renameTitleInput.value = assessment.title;
  renameError.value = '';
  showRenameModal.value = true;
};

const handleSaveRename = async () => {
  if (!renameTitleInput.value || renameTitleInput.value.trim().length < 3) {
    renameError.value = 'Title must be at least 3 characters long.';
    return;
  }
  isRenaming.value = true;
  renameError.value = '';
  try {
    const res = await updateAssessment(auth.token.value, renamingAssessment.value.assessment_id, {
      title: renameTitleInput.value.trim()
    });
    if (res.status === 'success') {
      renamingAssessment.value.title = renameTitleInput.value.trim();
      successMessage.value = `✓ Assessment #${renamingAssessment.value.assessment_id} title updated to "${renameTitleInput.value.trim()}".`;
      showRenameModal.value = false;
    }
  } catch (err) {
    renameError.value = err.message || 'Failed to update title.';
  } finally {
    isRenaming.value = false;
  }
};

// ==========================================
// PUBLISH / OPEN / CLOSE / SCHEDULE MODAL
// ==========================================
const showPublishModal = ref(false);
const publishingAssessment = ref(null);
const publishForm = ref({
  courseId: '',
  attemptLimit: 1,
  scheduleOpenAt: '',
  scheduleCloseAt: ''
});
const isSubmittingPublish = ref(false);
const publishModalError = ref('');

const openPublishModal = (assessment) => {
  publishingAssessment.value = assessment;
  publishForm.value = {
    courseId: assessment.course_id || courses.value[0]?.course_id || '',
    attemptLimit: assessment.attempt_limit || 1,
    scheduleOpenAt: assessment.schedule_open_at ? assessment.schedule_open_at.substring(0, 16) : '',
    scheduleCloseAt: assessment.schedule_close_at ? assessment.schedule_close_at.substring(0, 16) : ''
  };
  publishModalError.value = '';
  showPublishModal.value = true;
};

const handleExecutePublish = async () => {
  if (!publishingAssessment.value) return;
  if (!publishForm.value.courseId) {
    publishModalError.value = 'Please assign a course before publishing.';
    return;
  }
  isSubmittingPublish.value = true;
  publishModalError.value = '';
  try {
    const payload = {
      courseId: publishForm.value.courseId,
      attemptLimit: Number(publishForm.value.attemptLimit) || 1,
      scheduleOpenAt: publishForm.value.scheduleOpenAt ? new Date(publishForm.value.scheduleOpenAt).toISOString() : null,
      scheduleCloseAt: publishForm.value.scheduleCloseAt ? new Date(publishForm.value.scheduleCloseAt).toISOString() : null
    };

    const res = await publishAssessment(auth.token.value, publishingAssessment.value.assessment_id, payload);
    if (res.status === 'success') {
      publishingAssessment.value.status = 'PUBLISHED';
      publishingAssessment.value.course_id = payload.courseId;
      publishingAssessment.value.attempt_limit = payload.attemptLimit;
      publishingAssessment.value.schedule_open_at = payload.scheduleOpenAt;
      publishingAssessment.value.schedule_close_at = payload.scheduleCloseAt;
      successMessage.value = `✓ Assessment "${publishingAssessment.value.title}" published successfully to course! Students can attempt it up to ${payload.attemptLimit} time(s).`;
      showPublishModal.value = false;
      
      // refresh registry list
      const assessRes = await fetchAssessments(auth.token.value);
      existingAssessments.value = assessRes.data?.assessments || [];
    }
  } catch (err) {
    publishModalError.value = err.message || 'Failed to publish assessment.';
  } finally {
    isSubmittingPublish.value = false;
  }
};

const handleQuickStatusToggle = async (assessment, targetStatus) => {
  try {
    const res = await updateAssessment(auth.token.value, assessment.assessment_id, {
      status: targetStatus
    });
    if (res.status === 'success') {
      assessment.status = targetStatus;
      successMessage.value = `✓ Assessment status updated to ${targetStatus}.`;
      const assessRes = await fetchAssessments(auth.token.value);
      existingAssessments.value = assessRes.data?.assessments || [];
    }
  } catch (err) {
    errorMessage.value = err.message || `Failed to change status to ${targetStatus}.`;
  }
};

// ==========================================
// ARCHIVE & DELETE (WARNING WHEN ATTEMPTS EXIST)
// ==========================================
const showDeleteWarningModal = ref(false);
const deletingAssessment = ref(null);
const warningAttemptsCount = ref(0);
const isDeletingAssessment = ref(false);
const confirmForceCheckbox = ref(false);

const handleArchiveAssessment = async (assessment) => {
  try {
    const res = await archiveAssessment(auth.token.value, assessment.assessment_id);
    if (res.status === 'success') {
      const updatedStatus = res.data?.assessment?.status || (assessment.status === 'ARCHIVED' ? 'SAVED' : 'ARCHIVED');
      assessment.status = updatedStatus;
      successMessage.value = res.message || `Assessment status updated to ${updatedStatus}.`;
    }
  } catch (err) {
    errorMessage.value = err.message || 'Failed to update archive status.';
  }
};

const handleDeleteClick = async (assessment) => {
  deletingAssessment.value = assessment;
  confirmForceCheckbox.value = false;
  try {
    const checkRes = await checkAssessmentAttempts(auth.token.value, assessment.assessment_id);
    const count = checkRes.data?.attemptsCount || 0;
    warningAttemptsCount.value = count;

    if (count > 0) {
      showDeleteWarningModal.value = true;
    } else {
      if (confirm(`Are you sure you want to delete "${assessment.title}"? This action cannot be undone.`)) {
        await executeDelete(assessment.assessment_id, false);
      }
    }
  } catch (err) {
    if (confirm(`Are you sure you want to delete "${assessment.title}"?`)) {
      await executeDelete(assessment.assessment_id, false);
    }
  }
};

const executeDelete = async (assessmentId, force = false) => {
  isDeletingAssessment.value = true;
  try {
    const res = await deleteAssessment(auth.token.value, assessmentId, force);
    if (res.status === 'success') {
      existingAssessments.value = existingAssessments.value.filter(a => a.assessment_id !== assessmentId);
      successMessage.value = res.message || 'Assessment deleted successfully.';
      showDeleteWarningModal.value = false;
      deletingAssessment.value = null;
    }
  } catch (err) {
    if (err.requiresConfirmation || err.code === 'ATTEMPTS_EXIST') {
      warningAttemptsCount.value = err.attemptsCount || 1;
      showDeleteWarningModal.value = true;
    } else {
      errorMessage.value = err.message || 'Failed to delete assessment.';
    }
  } finally {
    isDeletingAssessment.value = false;
  }
};

// ==========================================
// REGISTRY FILTERS (COURSE, STATUS, TYPE, SEARCH)
// ==========================================
const registrySearchQuery = ref('');
const registryCourseFilter = ref('ALL');
const registryStatusFilter = ref('ALL');
const registryTypeFilter = ref('ALL');

const filteredRegistryAssessments = computed(() => {
  return existingAssessments.value.filter(a => {
    // 1. Search filter
    if (registrySearchQuery.value.trim()) {
      const q = registrySearchQuery.value.toLowerCase().trim();
      const matchTitle = (a.title || '').toLowerCase().includes(q);
      const matchDesc = (a.description || '').toLowerCase().includes(q);
      const matchCourse = (a.course_name || '').toLowerCase().includes(q);
      if (!matchTitle && !matchDesc && !matchCourse) return false;
    }
    // 2. Course filter
    if (registryCourseFilter.value !== 'ALL') {
      if (String(a.course_id) !== String(registryCourseFilter.value)) return false;
    }
    // 3. Status filter
    if (registryStatusFilter.value !== 'ALL') {
      const s = (a.status || 'DRAFT').toUpperCase();
      if (s !== registryStatusFilter.value.toUpperCase()) return false;
    }
    // 4. Type filter
    if (registryTypeFilter.value !== 'ALL') {
      const qs = Array.isArray(a.questions) ? a.questions : (typeof a.questions === 'string' ? JSON.parse(a.questions || '[]') : []);
      const hasType = qs.some(q => (q.type || 'MCQ').toUpperCase() === registryTypeFilter.value.toUpperCase());
      if (!hasType) return false;
    }
    return true;
  });
});

const form = ref({
  title: 'Data Structures Midterm Examination 2026',
  courseId: '',
  assessmentType: 'Midterm Exam',
  totalMarks: 100,
  passingMarks: 50,
  durationMinutes: 60,
  description: 'Midterm assessment covering algorithmic complexity, singly and doubly linked lists, stack evaluation, circular queues, and binary search tree traversals.',
  status: 'DRAFT',
  attemptLimit: 1,
  scheduleOpenAt: '',
  scheduleCloseAt: '',
  lectureNotes: '',
  sourceType: 'NONE',
  sourceFileName: ''
});

const handlePdfFileUpload = async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
    pdfExtractionError.value = 'Please select a valid .pdf document.';
    pdfExtractionSuccess.value = '';
    return;
  }

  selectedPdfFile.value = file;
  isExtractingPdf.value = true;
  pdfExtractionError.value = '';
  pdfExtractionSuccess.value = '';
  pdfDetails.value = null;

  try {
    const res = await extractPdfLectureNotes(auth.token.value, file);
    if (res.data?.hasReadableText) {
      form.value.lectureNotes = res.data.text;
      form.value.sourceType = 'PDF';
      form.value.sourceFileName = file.name;
      pdfDetails.value = res.data;
      pdfExtractionSuccess.value = `✓ Successfully extracted ${res.data.wordCount.toLocaleString()} words across ${res.data.pageCount} page(s) from "${file.name}". You can review or edit the extracted text below.`;
      pdfExtractionError.value = '';
    }
  } catch (err) {
    console.warn('PDF extraction failed:', err);
    pdfExtractionSuccess.value = '';
    pdfExtractionError.value = err.message || '⚠️ Failed to extract text from PDF.';
    if (err.hasReadableText === false || err.code === 'NO_READABLE_TEXT') {
      pdfExtractionError.value = err.message || '⚠️ No readable text detected in this PDF. It appears to be an image-only scan or empty document. Please upload a searchable/text-based PDF or paste your lecture notes directly as text.';
    }
  } finally {
    isExtractingPdf.value = false;
  }
};

const setSampleLectureNotes = () => {
  form.value.lectureNotes = `Topic: Data Structures & Algorithms (Week 5 & 6)
1. Abstract Data Types:
- Stacks: LIFO structure, operations include push, pop, peek, isEmpty. Applications in function call stacks and expression parsing.
- Queues: FIFO structure, operations include enqueue, dequeue. Applications in scheduling and buffering.

2. Tree Structures:
- Binary Search Trees (BST): Left child < node < right child.
- Search Complexity: Average case O(log n), Worst case O(n) for unbalanced trees.
- Traversal Orders: Pre-order (NLR), In-order (LNR - yields sorted order), Post-order (LRN).`;
  form.value.sourceType = 'TEXT';
  form.value.sourceFileName = '';
  pdfExtractionError.value = '';
  pdfExtractionSuccess.value = 'Sample lecture notes inserted.';
};

const clearLectureNotes = () => {
  form.value.lectureNotes = '';
  form.value.sourceType = 'NONE';
  form.value.sourceFileName = '';
  selectedPdfFile.value = null;
  pdfExtractionSuccess.value = '';
  pdfExtractionError.value = '';
  pdfDetails.value = null;
};

const viewStoredNotes = (item) => {
  activeNotesItem.value = item;
  showNotesModal.value = true;
};

const STUDIO_STATE_STORAGE_KEY = 'autoquiz_assessment_studio_state_v1';

// Persist full studio state (settings, parameters, notes, questions) to localStorage
const persistStudioState = () => {
  try {
    const payload = {
      selectedQuestionType: selectedQuestionType.value,
      singleTypeConfig: singleTypeConfig.value,
      form: {
        title: form.value.title,
        courseId: form.value.courseId,
        assessmentType: form.value.assessmentType,
        totalMarks: form.value.totalMarks,
        passingMarks: form.value.passingMarks,
        durationMinutes: form.value.durationMinutes,
        description: form.value.description,
        status: form.value.status,
        attemptLimit: form.value.attemptLimit,
        scheduleOpenAt: form.value.scheduleOpenAt,
        scheduleCloseAt: form.value.scheduleCloseAt,
        lectureNotes: form.value.lectureNotes,
        sourceType: form.value.sourceType,
        sourceFileName: form.value.sourceFileName
      },
      questionsList: questionsList.value,
      lectureNotesMode: lectureNotesMode.value,
      savedAt: new Date().toISOString()
    };
    localStorage.setItem(STUDIO_STATE_STORAGE_KEY, JSON.stringify(payload));
  } catch (err) {
    console.warn('Unable to persist assessment studio state to localStorage:', err);
  }
};

// Restore studio state on page load or return
const restoreStudioState = () => {
  try {
    const raw = localStorage.getItem(STUDIO_STATE_STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);

    if (data.selectedQuestionType) {
      selectedQuestionType.value = data.selectedQuestionType;
    }
    if (data.singleTypeConfig) {
      singleTypeConfig.value = {
        mcq: { ...singleTypeConfig.value.mcq, ...data.singleTypeConfig.mcq },
        shortQuestion: { ...singleTypeConfig.value.shortQuestion, ...data.singleTypeConfig.shortQuestion },
        codingQuestion: { ...singleTypeConfig.value.codingQuestion, ...data.singleTypeConfig.codingQuestion }
      };
    }
    if (data.form) {
      form.value = { ...form.value, ...data.form };
    }
    if (Array.isArray(data.questionsList) && data.questionsList.length > 0) {
      questionsList.value = data.questionsList;
    }
    if (data.lectureNotesMode) {
      lectureNotesMode.value = data.lectureNotesMode;
    }
    return true;
  } catch (err) {
    console.warn('Unable to restore assessment studio state:', err);
    return false;
  }
};

// Reset studio form & configurations to institutional defaults
const resetStudioToDefaults = () => {
  try {
    localStorage.removeItem(STUDIO_STATE_STORAGE_KEY);
  } catch (e) {}

  form.value = {
    title: 'Data Structures Midterm Examination 2026',
    courseId: courses.value[0]?.course_id || '',
    assessmentType: 'Midterm Exam',
    totalMarks: 100,
    passingMarks: 50,
    durationMinutes: 60,
    description: 'Midterm assessment covering algorithmic complexity, singly and doubly linked lists, stack evaluation, circular queues, and binary search tree traversals.',
    status: 'DRAFT',
    attemptLimit: 1,
    scheduleOpenAt: '',
    scheduleCloseAt: '',
    lectureNotes: '',
    sourceType: 'NONE',
    sourceFileName: ''
  };
  selectedQuestionType.value = 'MCQ';
  singleTypeConfig.value = {
    mcq: {
      count: 5,
      marksPerQuestion: 20,
      difficulty: 'medium',
      optionsCount: 4,
      bloomDistribution: { remember: 25, understand: 25, apply: 50, analyze: 0, evaluate: 0, create: 0 }
    },
    shortQuestion: {
      count: 4,
      marksPerQuestion: 25,
      difficulty: 'medium',
      bloomDistribution: { remember: 25, understand: 50, apply: 25, analyze: 0, evaluate: 0, create: 0 }
    },
    codingQuestion: {
      count: 2,
      marksPerQuestion: 50,
      language: 'Python',
      difficulty: 'medium',
      bloomDistribution: { remember: 0, understand: 0, apply: 50, analyze: 50, evaluate: 0, create: 0 }
    }
  };
  loadDefaultQuestionsForType('MCQ');
  persistStudioState();
  generationSuccessMsg.value = 'Settings and question deck reset to clean institutional defaults.';
  generationErrorMsg.value = '';
};

// Auto-save changes on any reactive modification
watch(
  [selectedQuestionType, singleTypeConfig, form, questionsList, lectureNotesMode],
  () => {
    persistStudioState();
  },
  { deep: true }
);

const loadInitialData = async () => {
  isLoadingCourses.value = true;
  errorMessage.value = '';

  try {
    const courseRes = await fetchTeacherCourses(auth.token.value);
    courses.value = courseRes.data?.courses || [];

    // Keep restored courseId if valid, otherwise select first available course
    const validCourse = courses.value.find(c => String(c.course_id) === String(form.value.courseId));
    if (!validCourse && courses.value.length > 0) {
      form.value.courseId = courses.value[0].course_id;
    }

    const assessRes = await fetchAssessments(auth.token.value);
    existingAssessments.value = assessRes.data?.assessments || [];
  } catch (err) {
    console.error('Error loading courses or assessments:', err);
    errorMessage.value = err.message || 'Unable to load course catalog';
  } finally {
    isLoadingCourses.value = false;
  }
};

const handleCreateAssessment = async () => {
  errorMessage.value = '';
  validationErrors.value = [];
  successMessage.value = '';
  createdAssessmentRecord.value = null;

  if (!questionsList.value || questionsList.value.length === 0) {
    errorMessage.value = 'Please formulate or generate at least one question for this assessment before submitting.';
    return;
  }

  isSubmitting.value = true;

  try {
    const payload = {
      title: form.value.title,
      courseId: form.value.courseId,
      totalMarks: Number(form.value.totalMarks),
      passingMarks: Number(form.value.passingMarks),
      durationMinutes: Number(form.value.durationMinutes),
      description: form.value.description,
      status: form.value.status,
      attemptLimit: Number(form.value.attemptLimit) || 1,
      scheduleOpenAt: form.value.scheduleOpenAt || null,
      scheduleCloseAt: form.value.scheduleCloseAt || null,
      lectureNotes: form.value.lectureNotes,
      sourceType: form.value.lectureNotes ? (form.value.sourceType || 'TEXT') : 'NONE',
      sourceFileName: form.value.sourceFileName,
      questions: questionsList.value
    };

    const res = await createAssessment(auth.token.value, payload);

    if (res.status === 'success') {
      createdAssessmentRecord.value = res.data.assessment;
      successMessage.value = `✓ Assessment "${res.data.assessment.title}" created successfully with ID #${res.data.assessment.assessment_id}! All your settings, question type, parameters, and Bloom distribution have been retained for creating your next assessment.`;
      
      // Reload existing assessments to show real-time persistence
      const assessRes = await fetchAssessments(auth.token.value);
      existingAssessments.value = assessRes.data?.assessments || [];

      // Retain settings from previous assessment: persist state so reloading or making another assessment keeps them!
      persistStudioState();
    }
  } catch (err) {
    errorMessage.value = err.message || 'Failed to create assessment.';
    if (err.errors && Array.isArray(err.errors)) {
      validationErrors.value = err.errors;
    }
  } finally {
    isSubmitting.value = false;
  }
};

onMounted(async () => {
  restoreStudioState();
  await loadInitialData();
});

// ═══ EXPORT SYSTEM ═══

const showExportModal = ref(false);
const exportingFormat = ref(null);
const exportHistory = ref([]);
const exportHistoryLoading = ref(false);
const exportIncludeAnswerKey = ref(true);
const exportError = ref('');
const exportSuccess = ref('');

const exportTargetAssessment = ref(null);

const openExportModal = async (assessmentOverride = null) => {
  exportTargetAssessment.value = assessmentOverride || createdAssessmentRecord.value || null;
  showExportModal.value = true;
  exportError.value = '';
  exportSuccess.value = '';
  await loadExportHistory();
};

const loadExportHistory = async () => {
  exportHistoryLoading.value = true;
  try {
    const token = auth.token.value || localStorage.getItem('autoquiz_token');
    const currentId = exportTargetAssessment.value?.assessment_id || createdAssessmentRecord.value?.assessment_id || null;
    const res = await fetchExportHistory(token, currentId || null);
    exportHistory.value = Array.isArray(res?.data) ? res.data : (res?.data?.exports || []);
  } catch (e) {
    exportHistory.value = [];
  } finally {
    exportHistoryLoading.value = false;
  }
};

const triggerDownload = (content, fileName, mimeType, isBase64 = false) => {
  let blob;
  if (isBase64) {
    const binaryStr = atob(content);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    blob = new Blob([bytes], { type: mimeType });
  } else {
    blob = new Blob([content], { type: mimeType });
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};

const handleExport = async (format) => {
  exportingFormat.value = format;
  exportError.value = '';
  exportSuccess.value = '';
  try {
    const token = auth.token.value || localStorage.getItem('autoquiz_token');
    const currentId = exportTargetAssessment.value?.assessment_id || createdAssessmentRecord.value?.assessment_id || null;

    // Fallback payload from active studio state in case assessment is exported directly from studio
    const fallbackAssessment = {
      title: exportTargetAssessment.value?.title || form.value.title || 'Curriculum Assessment',
      course_name: courses.value.find(c => String(c.course_id) === String(form.value.courseId))?.name || 'Academic Course',
      description: exportTargetAssessment.value?.description || form.value.description || '',
      total_marks: exportTargetAssessment.value?.total_marks || totalQuestionsMarks.value || form.value.totalMarks || 100,
      passing_marks: exportTargetAssessment.value?.passing_marks || form.value.passingMarks || 50,
      duration_minutes: exportTargetAssessment.value?.duration_minutes || form.value.durationMinutes || 60,
      questions: exportTargetAssessment.value?.questions || questionsList.value.map(q => ({
        question_text: q.question,
        type: q.type,
        marks: q.marks,
        bloom_level: q.bloomLevel,
        options: q.options ? q.options.map(opt => ({
          text: opt,
          is_correct: opt === q.correctAnswer
        })) : [],
        correct_answer: q.correctAnswer,
        model_answer: q.modelAnswer,
        explanation: q.explanation,
        rubric: q.rubric,
        programming_language: q.programmingLanguage,
        solution_code: q.solutionCode
      }))
    };

    const targetId = currentId || 'draft';
    const optionsPayload = {
      includeAnswerKey: exportIncludeAnswerKey.value,
      assessment: fallbackAssessment
    };

    let res;
    if (format === 'GOOGLE_DOC') {
      res = await exportToGoogleDoc(token, targetId, optionsPayload);
    } else if (format === 'PDF') {
      res = await exportToPdf(token, targetId, optionsPayload);
    } else if (format === 'MOODLE_XML') {
      res = await exportToMoodle(token, targetId, optionsPayload);
    } else if (format === 'GOOGLE_FORMS') {
      res = await exportToGoogleForms(token, targetId, optionsPayload);
    }

    if (res?.data) {
      triggerDownload(res.data.content, res.data.fileName, res.data.mimeType, res.data.isBase64);
      exportSuccess.value = `✅ "${res.data.fileName}" generated and downloaded to your device!`;
      if (currentId) {
        await loadExportHistory();
      }
    } else {
      throw new Error(res?.message || 'Export response was empty.');
    }
  } catch (e) {
    console.error('Export error:', e);
    exportError.value = e.message || 'Export failed. Please try again.';
  } finally {
    exportingFormat.value = null;
  }
};

const handleDeleteExportHistory = async (exportId) => {
  try {
    const token = auth.token.value || localStorage.getItem('autoquiz_token');
    await deleteExportHistoryItem(token, exportId);
    exportHistory.value = exportHistory.value.filter(e => e.export_id !== exportId);
  } catch (e) {}
};
</script>

<template>
  <div class="assessment-studio-page">
    <!-- Navbar Header -->
    <header class="navbar glass-card">
      <div class="nav-brand">
        <div class="logo-box">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
          </svg>
        </div>
        <div>
          <h1 class="nav-title">AutoQuiz Pro</h1>
          <p class="nav-subtitle">Assessment Studio & Exam Generator</p>
        </div>
      </div>

      <div class="nav-actions">
        <span class="autosave-status-pill" title="Every change, parameter, Bloom distribution, and question is automatically saved locally in your browser">
          <span class="autosave-dot"></span> Settings Auto-Saved
        </span>
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          title="Reset all settings, form inputs, and questions to default institutional values"
          @click="resetStudioToDefaults"
        >
          ↺ Reset to Defaults
        </button>
        <router-link to="/dashboard" class="btn btn-secondary btn-sm">
          &larr; Back to Dashboard
        </router-link>
        <span class="badge badge-info">
          <span class="badge-dot"></span>
          {{ auth.user.value?.role || 'FACULTY' }}
        </span>
      </div>
    </header>

    <main class="studio-container">
      <!-- Page Banner -->
      <div class="glass-card studio-banner">
        <div class="banner-badge-row">
          <span class="badge badge-primary">
            <span class="badge-dot"></span> Week 6 Core Assessment Module
          </span>
          <span class="banner-subtext">Faculty Creator: {{ auth.user.value?.name }} ({{ auth.user.value?.email }})</span>
        </div>
        <h2 class="studio-headline">Create New Academic Assessment</h2>
        <p class="studio-description">
          Define assessment parameters, syllabus topics, duration, and scoring thresholds. Once published, students enrolled in the course will receive instant examination access and automated Gemini AI evaluation.
        </p>
      </div>

      <!-- Success Notification -->
      <div v-if="successMessage" class="alert alert-success">
        <div class="alert-content">
          <p class="font-bold">{{ successMessage }}</p>
          <div v-if="createdAssessmentRecord" class="record-badge-row">
            <span><strong>Assessment ID:</strong> {{ createdAssessmentRecord.assessment_id }}</span>
            <span><strong>Status:</strong> {{ createdAssessmentRecord.status }}</span>
            <span><strong>Total Marks:</strong> {{ createdAssessmentRecord.total_marks }}</span>
            <span><strong>Duration:</strong> {{ createdAssessmentRecord.duration_minutes }} mins</span>
          </div>
        </div>
      </div>

      <!-- Error Notification -->
      <div v-if="errorMessage" class="alert alert-error">
        <div class="alert-content">
          <p class="font-bold">{{ errorMessage }}</p>
          <ul v-if="validationErrors.length" class="error-list">
            <li v-for="(vErr, i) in validationErrors" :key="i">{{ vErr }}</li>
          </ul>
        </div>
      </div>

      <!-- Creation Form Card (WEEK 6 SCREENSHOT 1 TARGET) -->
      <div class="glass-card form-card">
        <div class="form-card-header">
          <div>
            <h3 class="form-title">Assessment Specification Form</h3>
            <p class="form-subtitle">All fields marked with an asterisk (*) are mandatory for institutional compliance.</p>
          </div>
          <span class="status-indicator">
            <span class="badge-dot pulse-dot"></span> Ready for Submission
          </span>
        </div>

        <form @submit.prevent="handleCreateAssessment" class="assessment-form">
          <!-- Title Row -->
          <div class="form-group">
            <label class="form-label" for="assessment-title">
              Assessment Title *
            </label>
            <input
              id="assessment-title"
              v-model="form.title"
              type="text"
              required
              class="form-input"
              placeholder="e.g. Data Structures Midterm Examination 2026"
            />
            <span class="form-hint">Descriptive academic title appearing on the student examination portal.</span>
          </div>

          <!-- Course & Assessment Type Row -->
          <div class="form-row-2">
            <div class="form-group">
              <label class="form-label" for="assessment-course">
                Assigned Course Module *
              </label>
              <select
                id="assessment-course"
                v-model="form.courseId"
                required
                class="form-input"
              >
                <option value="" disabled>Select assigned course...</option>
                <option v-for="c in courses" :key="c.course_id" :value="c.course_id">
                  {{ c.course_code ? `[${c.course_code}] ` : '' }}{{ c.course_name }}
                </option>
              </select>
              <span class="form-hint">Curriculum module linked to this assessment.</span>
            </div>

            <div class="form-group">
              <label class="form-label" for="assessment-type">
                Assessment Category *
              </label>
              <select
                id="assessment-type"
                v-model="form.assessmentType"
                class="form-input"
              >
                <option value="Quiz">Weekly Quiz</option>
                <option value="Midterm Exam">Midterm Examination</option>
                <option value="Final Exam">Final Examination</option>
                <option value="Lab Assessment">Practical / Lab Assessment</option>
              </select>
            </div>
          </div>

          <!-- Single Question Type Selection (Shown strictly below Assessment Title & Category) -->
          <div class="form-group question-type-single-section">
            <div class="q-single-header">
              <div>
                <label class="form-label" style="margin-bottom: 2px;">
                  Examination Question Format *
                  <span class="required-tag">(Select only ONE question type)</span>
                </label>
                <p class="form-helper">
                  Choose the single question type for this assessment. All generated questions will strictly follow this selected format.
                </p>
              </div>

              <span :class="['current-type-pill', selectedQuestionType === 'MCQ' ? 'pill-mcq' : (selectedQuestionType === 'SHORT_QUESTION' ? 'pill-short' : 'pill-coding')]">
                Active: {{ selectedQuestionType === 'MCQ' ? 'MCQ (Multiple Choice)' : (selectedQuestionType === 'SHORT_QUESTION' ? 'Short Question' : 'Coding Question') }}
              </span>
            </div>

            <!-- 3 Mutually Exclusive Radio Selection Cards -->
            <div class="single-type-cards-grid">
              <!-- Option 1: MCQ -->
              <div
                :class="['single-type-card', selectedQuestionType === 'MCQ' ? 'selected-single mcq-theme' : '']"
                @click="selectQuestionType('MCQ')"
              >
                <div class="single-card-top">
                  <label class="single-radio-wrap" @click.stop>
                    <input
                      type="radio"
                      name="assessment-question-type"
                      value="MCQ"
                      :checked="selectedQuestionType === 'MCQ'"
                      @change="selectQuestionType('MCQ')"
                    />
                    <span class="single-custom-radio"></span>
                    <span class="single-card-title">Multiple Choice (MCQ)</span>
                  </label>
                  <span class="single-tag badge-cyan">Auto-Graded</span>
                </div>
                <p class="single-card-desc">
                  Objective 4-option conceptual questions with instant automated answer verification.
                </p>
              </div>

              <!-- Option 2: Short Question -->
              <div
                :class="['single-type-card', selectedQuestionType === 'SHORT_QUESTION' ? 'selected-single short-theme' : '']"
                @click="selectQuestionType('SHORT_QUESTION')"
              >
                <div class="single-card-top">
                  <label class="single-radio-wrap" @click.stop>
                    <input
                      type="radio"
                      name="assessment-question-type"
                      value="SHORT_QUESTION"
                      :checked="selectedQuestionType === 'SHORT_QUESTION'"
                      @change="selectQuestionType('SHORT_QUESTION')"
                    />
                    <span class="single-custom-radio"></span>
                    <span class="single-card-title">Short Question</span>
                  </label>
                  <span class="single-tag badge-purple">Rubric-Graded</span>
                </div>
                <p class="single-card-desc">
                  Theoretical definitions, algorithm comparisons, and conceptual explanations evaluated via rubric.
                </p>
              </div>

              <!-- Option 3: Coding Question -->
              <div
                :class="['single-type-card', selectedQuestionType === 'CODING_QUESTION' ? 'selected-single coding-theme' : '']"
                @click="selectQuestionType('CODING_QUESTION')"
              >
                <div class="single-card-top">
                  <label class="single-radio-wrap" @click.stop>
                    <input
                      type="radio"
                      name="assessment-question-type"
                      value="CODING_QUESTION"
                      :checked="selectedQuestionType === 'CODING_QUESTION'"
                      @change="selectQuestionType('CODING_QUESTION')"
                    />
                    <span class="single-custom-radio"></span>
                    <span class="single-card-title">Coding Question</span>
                  </label>
                  <span class="single-tag badge-emerald">Code Execution</span>
                </div>
                <p class="single-card-desc">
                  Hands-on programming challenges with starter code templates, sample I/O, and test cases.
                </p>
              </div>
            </div>

            <!-- Parameters for Selected Question Type -->
            <div class="selected-type-parameters-box">
              <div class="params-header">
                <span class="params-title">
                  Configuration for <strong>{{ selectedQuestionType === 'MCQ' ? 'Multiple Choice (MCQ)' : (selectedQuestionType === 'SHORT_QUESTION' ? 'Short Answer' : 'Coding Question') }}</strong>
                </span>
                <span class="params-subtotal">
                  Calculated: <strong>{{ activeTypeParams.count }} items &times; {{ activeTypeParams.marksPerQuestion }} pts = {{ (activeTypeParams.count || 0) * (activeTypeParams.marksPerQuestion || 0) }} total marks</strong>
                </span>
              </div>

              <div class="params-fields-row">
                <div class="param-col">
                  <label>Total Questions:</label>
                  <input
                    type="number"
                    v-model.number="activeTypeParams.count"
                    min="1"
                    max="50"
                    class="form-input param-input"
                    @input="syncAssessmentMarksFromParams"
                  />
                </div>

                <div class="param-col">
                  <label>Marks Per Question:</label>
                  <input
                    type="number"
                    v-model.number="activeTypeParams.marksPerQuestion"
                    min="1"
                    max="100"
                    class="form-input param-input"
                    @input="syncAssessmentMarksFromParams"
                  />
                </div>

                <div class="param-col">
                  <label>Difficulty Tier:</label>
                  <select v-model="activeTypeParams.difficulty" class="form-input param-select">
                    <option value="easy">Easy</option>
                    <option value="medium">Medium</option>
                    <option value="hard">Hard</option>
                  </select>
                </div>

                <div v-if="selectedQuestionType === 'MCQ'" class="param-col">
                  <label>Options Per Question:</label>
                  <select v-model.number="singleTypeConfig.mcq.optionsCount" class="form-input param-select">
                    <option :value="2">2 Options</option>
                    <option :value="3">3 Options</option>
                    <option :value="4">4 Options (Default)</option>
                    <option :value="5">5 Options</option>
                    <option :value="6">6 Options</option>
                  </select>
                </div>

                <div v-if="selectedQuestionType === 'CODING_QUESTION'" class="param-col">
                  <label>Target Language:</label>
                  <select v-model="singleTypeConfig.codingQuestion.language" class="form-input param-select">
                    <option value="Python">Python</option>
                    <option value="C++">C++</option>
                    <option value="Java">Java</option>
                    <option value="JavaScript">JavaScript</option>
                    <option value="SQL">SQL</option>
                    <option value="C">C</option>
                  </select>
                </div>
              </div>

              <!-- Bloom's Taxonomy Multi-Level Coverage & Weightage -->
              <div class="bloom-distribution-panel">
                <div class="bloom-panel-header">
                  <div class="bloom-panel-title-wrap">
                    <span class="bloom-panel-title">
                      🎯 Bloom's Taxonomy Coverage &amp; Weightage
                    </span>
                    <span class="bloom-panel-subtitle">
                      Select multiple cognitive levels and set percentage weights (e.g. 25% Understanding, 25% Remembering, 50% Applying)
                    </span>
                  </div>
                  <div class="bloom-panel-actions">
                    <span :class="['bloom-total-pill', activeBloomTotalPercent === 100 ? 'total-pill-success' : 'total-pill-warning']">
                      Total: {{ activeBloomTotalPercent }}% {{ activeBloomTotalPercent === 100 ? '✓' : '(Must equal 100%)' }}
                    </span>
                    <div class="bloom-preset-buttons">
                      <button type="button" class="btn-preset" @click="applyBloomPreset('foundational')" title="50% Remember, 50% Understand">
                        📖 Foundational (50/50)
                      </button>
                      <button type="button" class="btn-preset" @click="applyBloomPreset('application')" title="25% Remember, 25% Understand, 50% Apply">
                        ⚙️ Application (25/25/50)
                      </button>
                      <button type="button" class="btn-preset" @click="applyBloomPreset('balanced')" title="20% Remember, 30% Understand, 30% Apply, 20% Analyze">
                        ⚖️ Balanced
                      </button>
                      <button type="button" class="btn-preset btn-preset-auto" @click="autoBalanceBloom" title="Distribute 100% equally among active levels">
                        ⚡ Auto-Balance
                      </button>
                    </div>
                  </div>
                </div>

                <!-- 6 Bloom's Taxonomy Level Cards -->
                <div class="bloom-cards-grid">
                  <div
                    v-for="item in bloomTaxonomyMetadata"
                    :key="item.level"
                    :class="['bloom-level-card', activeTypeParams.bloomDistribution && activeTypeParams.bloomDistribution[item.level] > 0 ? 'bloom-card-active' : 'bloom-card-inactive']"
                    :style="{ '--level-color': item.color }"
                  >
                    <div class="bloom-card-head">
                      <label class="bloom-toggle-wrap">
                        <input
                          type="checkbox"
                          :checked="activeTypeParams.bloomDistribution && activeTypeParams.bloomDistribution[item.level] > 0"
                          @change="toggleBloomLevel(item.level)"
                        />
                        <span class="bloom-level-icon">{{ item.icon }}</span>
                        <span class="bloom-level-name">{{ item.label }}</span>
                      </label>
                      <span class="bloom-count-pill" v-if="activeTypeParams.bloomDistribution && activeTypeParams.bloomDistribution[item.level] > 0">
                        ~{{ calculateBloomCount(item.level, activeTypeParams.count) }} Qs
                      </span>
                    </div>

                    <div class="bloom-card-desc">
                      <strong class="bloom-verb">{{ item.verb }}</strong>: {{ item.desc }}
                    </div>

                    <div class="bloom-weight-row">
                      <div class="bloom-slider-wrap">
                        <input
                          type="range"
                          min="0"
                          max="100"
                          step="5"
                          v-model.number="activeTypeParams.bloomDistribution[item.level]"
                          class="bloom-slider"
                          :disabled="!activeTypeParams.bloomDistribution || activeTypeParams.bloomDistribution[item.level] === 0"
                        />
                      </div>
                      <div class="bloom-input-wrap">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="5"
                          v-model.number="activeTypeParams.bloomDistribution[item.level]"
                          class="bloom-pct-input"
                        />
                        <span class="bloom-pct-unit">%</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Total Marks, Passing Marks, Duration -->
          <div class="form-row-3">
            <div class="form-group">
              <label class="form-label" for="total-marks">
                Total Marks *
              </label>
              <input
                id="total-marks"
                v-model="form.totalMarks"
                type="number"
                min="1"
                required
                class="form-input"
                placeholder="100"
              />
            </div>

            <div class="form-group">
              <label class="form-label" for="passing-marks">
                Passing Marks *
              </label>
              <input
                id="passing-marks"
                v-model="form.passingMarks"
                type="number"
                min="1"
                required
                class="form-input"
                placeholder="50"
              />
            </div>

            <div class="form-group">
              <label class="form-label" for="duration-mins">
                Duration (Minutes) *
              </label>
              <input
                id="duration-mins"
                v-model="form.durationMinutes"
                type="number"
                min="5"
                required
                class="form-input"
                placeholder="60"
              />
            </div>

            <!-- Student Attempt Limit (Default 1) -->
            <div class="form-group">
              <label class="form-label" for="attempt-limit">
                Student Attempt Limit
                <span class="text-xs text-muted" style="font-weight: 500;">(Default: 1)</span>
              </label>
              <input
                id="attempt-limit"
                v-model="form.attemptLimit"
                type="number"
                min="1"
                max="20"
                class="form-input"
                placeholder="1"
              />
            </div>
          </div>

          <!-- Schedule Window (Open & Close Time) -->
          <div class="form-grid" style="margin-top: -8px; margin-bottom: 12px; background: #f8fafc; padding: 14px 18px; border-radius: 12px; border: 1px dashed #cbd5e1;">
            <div class="form-group mb-0">
              <label class="form-label" for="schedule-open" style="color: #1e293b; font-size: 0.85rem;">
                ⏰ Schedule Open Time <span class="optional-tag">(Optional)</span>
              </label>
              <input
                id="schedule-open"
                v-model="form.scheduleOpenAt"
                type="datetime-local"
                class="form-input"
                style="background: #ffffff;"
              />
              <span class="text-xs text-muted">Students can sit for the exam starting at this time</span>
            </div>

            <div class="form-group mb-0">
              <label class="form-label" for="schedule-close" style="color: #1e293b; font-size: 0.85rem;">
                🛑 Schedule Close Time <span class="optional-tag">(Optional)</span>
              </label>
              <input
                id="schedule-close"
                v-model="form.scheduleCloseAt"
                type="datetime-local"
                class="form-input"
                style="background: #ffffff;"
              />
              <span class="text-xs text-muted">Assessment automatically closes for submissions after this time</span>
            </div>
          </div>

          <!-- Lecture Notes Input / PDF Extraction Card -->
          <div class="form-group lecture-notes-container">
            <div class="lecture-header-row">
              <div>
                <label class="form-label" style="margin-bottom: 2px;">
                  Lecture Notes / Study Material
                  <span class="optional-tag">(Used for Automated Quiz & Question Generation)</span>
                </label>
                <p class="form-helper">
                  Provide lecture notes either by typing/pasting text directly or uploading a PDF document. The system will extract and store readable text, or alert if the PDF contains no readable text.
                </p>
              </div>

              <!-- Mode Switcher -->
              <div class="lecture-mode-switch">
                <button
                  type="button"
                  :class="['mode-tab-btn', lectureNotesMode === 'text' ? 'active' : '']"
                  @click="lectureNotesMode = 'text'"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="mini-svg">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                  Enter as Text
                </button>
                <button
                  type="button"
                  :class="['mode-tab-btn', lectureNotesMode === 'pdf' ? 'active' : '']"
                  @click="lectureNotesMode = 'pdf'"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="mini-svg">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="16" y1="13" x2="8" y2="13"/>
                    <line x1="16" y1="17" x2="8" y2="17"/>
                    <polyline points="10 9 9 9 8 9"/>
                  </svg>
                  Upload Lecture PDF
                </button>
              </div>
            </div>

            <!-- PDF Upload Box (shown in PDF mode) -->
            <div v-if="lectureNotesMode === 'pdf'" class="pdf-upload-box">
              <div class="pdf-dropzone">
                <input
                  type="file"
                  id="pdf-upload-input"
                  accept=".pdf,application/pdf"
                  class="pdf-hidden-input"
                  @change="handlePdfFileUpload"
                  :disabled="isExtractingPdf"
                />
                <label for="pdf-upload-input" class="pdf-dropzone-label">
                  <div class="pdf-icon-wrapper">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="pdf-upload-icon">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                      <polyline points="17 8 12 3 7 8"/>
                      <line x1="12" y1="3" x2="12" y2="15"/>
                    </svg>
                  </div>
                  <div class="pdf-dropzone-text">
                    <span class="pdf-dropzone-title">Click to browse or drag & drop a PDF lecture file</span>
                    <span class="pdf-dropzone-sub">Upload searchable lecture notes (.pdf). System extracts text & verifies readability.</span>
                  </div>
                  <button type="button" class="btn btn-secondary btn-sm" :disabled="isExtractingPdf">
                    Browse File
                  </button>
                </label>
              </div>

              <!-- Loading spinner while extracting -->
              <div v-if="isExtractingPdf" class="extraction-loading-bar">
                <span class="spinner-small"></span>
                <span>Extracting and analyzing text content from PDF... please wait</span>
              </div>
            </div>

            <!-- PDF Extraction Success Feedback -->
            <div v-if="pdfExtractionSuccess" class="notes-alert notes-alert-success">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="alert-icon">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
              <div class="alert-content">
                <strong>Extracted Successfully:</strong>
                <span>{{ pdfExtractionSuccess }}</span>
              </div>
            </div>

            <!-- Non-readable PDF or Error Alert -->
            <div v-if="pdfExtractionError" class="notes-alert notes-alert-warning">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="alert-icon warning-svg">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <div class="alert-content">
                <strong>PDF Text Detection Notice:</strong>
                <p>{{ pdfExtractionError }}</p>
                <div class="alert-actions">
                  <button type="button" class="btn-link" @click="lectureNotesMode = 'text'">
                    Switch to Direct Text Entry
                  </button>
                  <label for="pdf-upload-input" class="btn-link">Try Another PDF</label>
                </div>
              </div>
            </div>

            <!-- Textarea for Lecture Notes (Editable extracted text or direct manual entry) -->
            <div class="notes-textarea-wrapper">
              <div class="notes-meta-bar">
                <span class="notes-source-badge">
                  Source: <strong>{{ form.sourceType === 'PDF' ? (form.sourceFileName ? '📄 PDF (' + form.sourceFileName + ')' : '📄 PDF Upload') : (form.sourceType === 'TEXT' ? '📝 Direct Text' : 'None') }}</strong>
                </span>
                <span class="notes-char-count">
                  {{ form.lectureNotes ? form.lectureNotes.trim().split(/\s+/).filter(Boolean).length : 0 }} words | {{ form.lectureNotes ? form.lectureNotes.length : 0 }} chars
                </span>
              </div>

              <textarea
                id="assessment-lecture-notes"
                v-model="form.lectureNotes"
                rows="6"
                class="form-input textarea-input lecture-textarea"
                :placeholder="lectureNotesMode === 'pdf' ? 'Extracted text from your uploaded PDF will appear here for review and editing...' : 'Type or paste lecture notes, concepts, definitions, formulas, or summaries here...'"
                @input="if (form.sourceType === 'NONE' && form.lectureNotes) { form.sourceType = 'TEXT'; }"
              ></textarea>

              <div class="notes-action-row">
                <button
                  type="button"
                  class="btn-helper-action"
                  @click="setSampleLectureNotes"
                >
                  Load Sample Lecture Notes
                </button>
                <button
                  v-if="form.lectureNotes"
                  type="button"
                  class="btn-helper-action text-danger"
                  @click="clearLectureNotes"
                >
                  Clear Notes
                </button>
              </div>
            </div>
          </div>

          <!-- Description & Examination Instructions -->
          <div class="form-group">
            <label class="form-label" for="assessment-desc">
              Examination Instructions & Syllabus Coverage
            </label>
            <textarea
              id="assessment-desc"
              v-model="form.description"
              rows="3"
              class="form-input textarea-input"
              placeholder="Provide instructions regarding permitted calculators, syllabus chapters, and AI proctoring rules..."
            ></textarea>
          </div>

          <!-- Active Formulated Questions Deck & AI Generator -->
          <div class="form-group questions-deck-section">
            <div class="deck-main-header">
              <div>
                <span class="q-section-badge">Formulated Questions</span>
                <h3 class="deck-title">Active Examination Questions ({{ questionsList.length }})</h3>
                <span class="deck-subtitle">
                  Question Format: <strong>{{ selectedQuestionType === 'MCQ' ? 'Multiple Choice (MCQ)' : (selectedQuestionType === 'SHORT_QUESTION' ? 'Short Question' : 'Coding Question') }}</strong>
                  &bull; Total Question Marks: <strong>{{ totalQuestionsMarks }} pts</strong>
                  &bull; Target Exam Marks: <strong>{{ form.totalMarks }} pts</strong>
                </span>
              </div>

              <!-- Action Toolbar -->
              <div class="deck-actions-toolbar">
                <button
                  type="button"
                  class="btn btn-primary btn-generate"
                  :disabled="isGeneratingQuestions"
                  @click="handleGenerateQuestionsWithAi"
                >
                  <span v-if="isGeneratingQuestions" class="spinner-small"></span>
                  <svg v-else class="btn-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                  </svg>
                  <span>{{ isGeneratingQuestions ? 'Generating with AI...' : `✨ Generate ${selectedQuestionType === 'MCQ' ? 'MCQs' : (selectedQuestionType === 'SHORT_QUESTION' ? 'Short Questions' : 'Coding Questions')} with AI` }}</span>
                </button>

                <button type="button" class="btn btn-secondary btn-sm" @click="addManualQuestion">
                  + Add {{ selectedQuestionType === 'MCQ' ? 'MCQ' : (selectedQuestionType === 'SHORT_QUESTION' ? 'Short Question' : 'Coding Question') }}
                </button>

                <button
                  v-if="!isMarksSynced"
                  type="button"
                  class="btn btn-secondary btn-xs sync-btn"
                  @click="syncTotalMarks"
                >
                  ⚡ Sync Exam Marks to {{ totalQuestionsMarks }} pts
                </button>

                <button type="button" class="btn-link-action" @click="resetQuestionsToSample">
                  ↺ Load Default Set
                </button>
              </div>
            </div>

            <!-- AI Status Banners -->
            <div v-if="generationSuccessMsg" class="notes-alert notes-alert-success mt-2">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="alert-icon">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                <polyline points="22 4 12 14.01 9 11.01"/>
              </svg>
              <div class="alert-content">
                <strong>Generation Successful:</strong> {{ generationSuccessMsg }}
              </div>
            </div>

            <div v-if="generationErrorMsg" class="notes-alert notes-alert-warning mt-2">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="alert-icon warning-svg">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/>
                <line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
              <div class="alert-content">
                <strong>Notice:</strong> {{ generationErrorMsg }}
              </div>
            </div>

            <!-- Active Questions List & Live Editor -->
            <div class="questions-deck">
              <div class="deck-header">
                <div>
                  <h4 class="deck-title">Active Examination Questions ({{ questionsList.length }})</h4>
                  <span class="deck-subtitle">Review, adjust wording, options, rubric, or code templates before final saving.</span>
                </div>
                <div class="deck-actions flex items-center gap-2">
                  <button
                    type="button"
                    class="btn btn-secondary btn-sm flex items-center gap-1.5"
                    @click="openStudentPreview(questionsList, form.title, form.courseId, form.durationMinutes, form.totalMarks)"
                    :disabled="questionsList.length === 0"
                    title="Preview the quiz as a student would experience it"
                  >
                    <span>👁️</span> <strong>Preview as Student</strong>
                  </button>
                  <button class="btn-export-trigger" type="button" @click="openExportModal()">📤 Export</button>
                  <button type="button" class="btn btn-secondary btn-sm" @click="addManualQuestion">
                    + Add Question
                  </button>
                </div>
              </div>

              <div v-if="questionsList.length === 0" class="empty-questions-box">
                <p>No questions currently configured. Click <strong>"✨ Generate Questions with AI"</strong> or select <strong>"+ Add Manual"</strong> above.</p>
              </div>

              <div
                v-for="(q, qIdx) in questionsList"
                :key="q.id || qIdx"
                :class="['question-item-card', `q-type-${(q.type || 'MCQ').toLowerCase()}`]"
              >
                <!-- Question Item Header -->
                <div class="q-item-header">
                  <div class="q-item-left">
                    <span class="q-number-badge">Q{{ qIdx + 1 }}</span>
                    <span :class="['q-type-badge', q.type === 'MCQ' ? 'badge-cyan' : (q.type === 'SHORT_QUESTION' ? 'badge-purple' : 'badge-emerald')]">
                      {{ q.type === 'MCQ' ? 'MCQ (Multiple Choice)' : (q.type === 'SHORT_QUESTION' ? 'Short Question' : 'Coding Question') }}
                    </span>
                    <span v-if="q.programmingLanguage" class="badge-lang">
                      {{ q.programmingLanguage }}
                    </span>

                    <!-- Editable Difficulty Select -->
                    <div class="q-header-select-wrap" title="Edit Question Difficulty">
                      <span class="q-header-select-label">Diff:</span>
                      <select v-model="q.difficulty" class="q-header-select">
                        <option value="easy">Easy</option>
                        <option value="medium">Medium</option>
                        <option value="hard">Hard</option>
                      </select>
                    </div>

                    <!-- Editable Bloom's Taxonomy Level Select -->
                    <div class="q-header-select-wrap" title="Edit Question Bloom's Taxonomy Level">
                      <span class="q-header-select-label">Bloom:</span>
                      <select v-model="q.bloomLevel" class="q-header-select q-select-bloom">
                        <option value="remember">Remember</option>
                        <option value="understand">Understand</option>
                        <option value="apply">Apply</option>
                        <option value="analyze">Analyze</option>
                        <option value="evaluate">Evaluate</option>
                        <option value="create">Create</option>
                      </select>
                    </div>
                  </div>

                  <div class="q-item-right">
                    <div class="q-marks-edit" title="Edit Marks for this question">
                      <label>Marks:</label>
                      <input
                        type="number"
                        v-model.number="q.marks"
                        min="1"
                        max="100"
                        class="marks-inline-input"
                        @input="syncTotalMarks"
                      />
                      <span>pts</span>
                    </div>

                    <!-- Reorder Up/Down Controls -->
                    <div class="q-reorder-buttons" title="Reorder questions">
                      <button
                        type="button"
                        class="btn-reorder"
                        :disabled="qIdx === 0"
                        title="Move question up"
                        @click="moveQuestionUp(qIdx)"
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        class="btn-reorder"
                        :disabled="qIdx === questionsList.length - 1"
                        title="Move question down"
                        @click="moveQuestionDown(qIdx)"
                      >
                        ▼
                      </button>
                    </div>

                    <!-- Delete Question Button -->
                    <button
                      type="button"
                      class="btn-delete-q"
                      title="Delete this question"
                      @click="removeQuestion(qIdx)"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                <!-- Question Prompt Textarea -->
                <div class="q-prompt-box">
                  <label class="q-field-label">Question Prompt / Problem Description:</label>
                  <textarea
                    v-model="q.question"
                    rows="2"
                    class="form-input textarea-input q-prompt-input"
                    placeholder="Enter question wording..."
                  ></textarea>
                </div>

                <!-- MCQ Options Block -->
                <div v-if="q.type === 'MCQ'" class="q-mcq-options-block">
                  <div class="mcq-options-header-row">
                    <label class="q-field-label">Answer Options (Select the radio button for the correct answer key):</label>
                    <span class="mcq-count-hint">{{ (q.options || []).length }} options (2–6 allowed)</span>
                  </div>

                  <div class="mcq-options-grid">
                    <div
                      v-for="(opt, optIdx) in (q.options || ['Option A', 'Option B', 'Option C', 'Option D'])"
                      :key="optIdx"
                      class="mcq-option-row"
                    >
                      <label class="mcq-radio-wrap" title="Mark this option as correct Answer Key">
                        <input
                          type="radio"
                          :name="`correct-opt-${qIdx}`"
                          :value="opt"
                          :checked="q.correctAnswer === opt"
                          @change="q.correctAnswer = q.options[optIdx]"
                        />
                        <span class="mcq-custom-radio"></span>
                      </label>
                      <input
                        type="text"
                        :value="q.options[optIdx]"
                        @input="(e) => {
                          const wasCorrect = q.correctAnswer === q.options[optIdx];
                          q.options[optIdx] = e.target.value;
                          if (wasCorrect) q.correctAnswer = e.target.value;
                        }"
                        class="form-input mcq-option-input"
                        :placeholder="`Option ${String.fromCharCode(65 + optIdx)}`"
                      />
                      <span v-if="q.correctAnswer === q.options[optIdx]" class="correct-badge">✓ Correct Key</span>
                      <button
                        v-if="(q.options || []).length > 2"
                        type="button"
                        class="btn-remove-opt"
                        title="Remove this option"
                        @click="removeMcqOption(q, optIdx)"
                      >
                        &times;
                      </button>
                    </div>
                  </div>

                  <div class="mcq-actions-bar">
                    <button
                      v-if="(q.options || []).length < 6"
                      type="button"
                      class="btn-add-opt"
                      @click="addMcqOption(q)"
                    >
                      + Add Option {{ String.fromCharCode(65 + (q.options || []).length) }}
                    </button>
                  </div>

                  <div class="q-explanation-box">
                    <label class="q-field-label">Explanation / Rationale (Answer Key):</label>
                    <textarea
                      v-model="q.explanation"
                      rows="2"
                      class="form-input textarea-input explanation-input"
                      placeholder="Why is this answer correct? Provide a detailed explanation for the answer key..."
                    ></textarea>
                  </div>
                </div>

                <!-- Short Question Block -->
                <div v-else-if="q.type === 'SHORT_QUESTION'" class="q-short-block">
                  <div class="short-fields-grid">
                    <div>
                      <label class="q-field-label">Model Answer / Key Solution Points:</label>
                      <textarea
                        v-model="q.modelAnswer"
                        rows="3"
                        class="form-input textarea-input short-answer-input"
                        placeholder="Expected answer or core theoretical explanation..."
                      ></textarea>
                    </div>
                    <div>
                      <label class="q-field-label">Grading Rubric / Criteria:</label>
                      <textarea
                        v-model="q.rubric"
                        rows="3"
                        class="form-input textarea-input rubric-input"
                        placeholder="Point breakdown and grading criteria..."
                      ></textarea>
                    </div>
                    <div>
                      <label class="q-field-label">Explanation / Rationale:</label>
                      <textarea
                        v-model="q.explanation"
                        rows="2"
                        class="form-input textarea-input explanation-input"
                        placeholder="Additional explanation for the evaluator — why this answer is expected..."
                      ></textarea>
                    </div>
                  </div>
                </div>

                <!-- Coding Question Block -->
                <div v-else-if="q.type === 'CODING_QUESTION'" class="q-coding-block">
                  <div class="coding-fields-grid">
                    <div class="code-editor-section">
                      <div class="code-editor-header">
                        <label class="q-field-label">Starter Code Template ({{ q.programmingLanguage || 'Python' }}):</label>
                        <select v-model="q.programmingLanguage" class="lang-selector-mini">
                          <option value="Python">Python</option>
                          <option value="C++">C++</option>
                          <option value="Java">Java</option>
                          <option value="JavaScript">JavaScript</option>
                          <option value="SQL">SQL</option>
                          <option value="C">C</option>
                        </select>
                      </div>
                      <textarea
                        v-model="q.starterCode"
                        rows="4"
                        class="form-input textarea-input code-font code-textarea"
                        placeholder="def solution():\n    pass"
                      ></textarea>
                    </div>

                    <div class="testcase-section">
                      <div class="io-row">
                        <div>
                          <label class="q-field-label">Sample Input:</label>
                          <input
                            type="text"
                            v-model="q.sampleInput"
                            class="form-input code-font io-input"
                            placeholder="e.g. [1, 2, 3]"
                          />
                        </div>
                        <div>
                          <label class="q-field-label">Expected Sample Output:</label>
                          <input
                            type="text"
                            v-model="q.sampleOutput"
                            class="form-input code-font io-input"
                            placeholder="e.g. 6"
                          />
                        </div>
                      </div>

                      <div>
                        <label class="q-field-label">Grading Rubric / Criteria:</label>
                        <textarea
                          v-model="q.rubric"
                          rows="2"
                          class="form-input textarea-input rubric-input"
                          placeholder="Evaluation criteria — correctness, efficiency, code style, edge cases..."
                        ></textarea>
                      </div>

                      <div>
                        <label class="q-field-label">Explanation / Solution Rationale:</label>
                        <textarea
                          v-model="q.explanation"
                          rows="2"
                          class="form-input textarea-input explanation-input"
                          placeholder="Explain algorithmic design, approach, and time/space complexity analysis..."
                        ></textarea>
                      </div>

                      <div class="solution-toggle-box">
                        <details class="code-details">
                          <summary class="code-summary">View Reference Solution Code (Answer Key)</summary>
                          <textarea
                            v-model="q.solutionCode"
                            rows="5"
                            class="form-input textarea-input code-font code-textarea"
                            placeholder="Complete working solution..."
                          ></textarea>
                        </details>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Bottom Add Question by Hand Banner -->
              <div v-if="questionsList.length > 0" class="deck-bottom-actions mt-3">
                <button
                  type="button"
                  class="btn btn-secondary btn-bottom-add"
                  @click="addManualQuestion"
                >
                  + Add Question by Hand ({{ selectedQuestionType === 'MCQ' ? 'MCQ' : (selectedQuestionType === 'SHORT_QUESTION' ? 'Short Question' : 'Coding Question') }})
                </button>
              </div>
            </div>
          </div>

          <!-- Publication Status Lifecycle -->
          <div class="form-group">
            <label class="form-label">Assessment Lifecycle Status</label>
            <div class="status-radio-group">
              <label class="radio-label">
                <input type="radio" v-model="form.status" value="DRAFT" />
                <span class="radio-custom"></span>
                <span><strong>DRAFT</strong> (Default &mdash; saved internally for faculty review)</span>
              </label>
              <label class="radio-label">
                <input type="radio" v-model="form.status" value="SAVED" />
                <span class="radio-custom"></span>
                <span><strong>SAVED</strong> (Finalized draft ready for scheduling)</span>
              </label>
              <label class="radio-label">
                <input type="radio" v-model="form.status" value="PUBLISHED" />
                <span class="radio-custom"></span>
                <span><strong>PUBLISHED</strong> (Active &amp; immediately live for student exam taking)</span>
              </label>
            </div>
          </div>

          <!-- Action Buttons -->
          <div class="form-actions-bar">
            <button
              id="btn-create-assessment"
              type="submit"
              class="btn btn-primary btn-lg"
              :disabled="isSubmitting"
            >
              <svg v-if="!isSubmitting" class="btn-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M12 5v14M5 12h14"/>
              </svg>
              <span>{{ isSubmitting ? 'Saving to Database...' : (form.status === 'PUBLISHED' ? 'Create & Publish Assessment' : (form.status === 'SAVED' ? 'Save Assessment to Bank' : 'Save as Draft Assessment')) }}</span>
            </button>

            <button
              type="button"
              class="btn btn-secondary btn-lg flex items-center gap-1.5"
              @click="openStudentPreview(questionsList, form.title, form.courseId, form.durationMinutes, form.totalMarks)"
              :disabled="questionsList.length === 0"
              title="Preview the quiz as a student would experience it before submitting"
            >
              <span>👁️</span> Preview as Student
            </button>

            <router-link to="/dashboard" class="btn btn-secondary btn-lg">
              Cancel
            </router-link>
          </div>
        </form>
      </div>

      <!-- Saved Assessments Registry with Search & Multi-Filters -->
      <div v-if="existingAssessments.length" class="glass-card registry-card">
        <div class="registry-header">
          <div>
            <h3 class="form-title">Assessments Registry &amp; Lifecycle Management ({{ existingAssessments.length }})</h3>
            <p class="form-subtitle">Search, filter by course/status/type, preview as student, edit titles later, archive or safely delete.</p>
          </div>
          <button class="btn btn-secondary btn-sm" @click="loadInitialData">
            Refresh Records
          </button>
        </div>

        <!-- Search & Multi-Filter Toolbar -->
        <div class="registry-filter-bar">
          <div class="filter-field search-field">
            <label class="filter-label">Search Assessments</label>
            <div class="search-input-wrap">
              <span class="search-icon">🔍</span>
              <input
                type="text"
                v-model="registrySearchQuery"
                placeholder="Search by title, description or course..."
                class="filter-input"
              />
              <button
                v-if="registrySearchQuery"
                class="search-clear-btn"
                @click="registrySearchQuery = ''"
              >✕</button>
            </div>
          </div>

          <div class="filter-field">
            <label class="filter-label">Filter by Course</label>
            <select v-model="registryCourseFilter" class="filter-select">
              <option value="ALL">All Courses ({{ courses.length }})</option>
              <option v-for="c in courses" :key="c.course_id" :value="c.course_id">
                {{ c.course_name }} ({{ c.course_code }})
              </option>
            </select>
          </div>

          <div class="filter-field">
            <label class="filter-label">Filter by Status</label>
            <select v-model="registryStatusFilter" class="filter-select">
              <option value="ALL">All Statuses (5)</option>
              <option value="DRAFT">🟡 DRAFT (Default)</option>
              <option value="SAVED">🔵 SAVED</option>
              <option value="PUBLISHED">🟢 PUBLISHED (Live)</option>
              <option value="CLOSED">🔴 CLOSED</option>
              <option value="ARCHIVED">🟣 ARCHIVED</option>
            </select>
          </div>

          <div class="filter-field">
            <label class="filter-label">Filter by Question Type</label>
            <select v-model="registryTypeFilter" class="filter-select">
              <option value="ALL">All Question Types</option>
              <option value="MCQ">MCQ (Multiple Choice)</option>
              <option value="SHORT_QUESTION">Short Answer / Conceptual</option>
              <option value="CODING_QUESTION">Coding Problem</option>
            </select>
          </div>

          <div class="filter-reset-wrap">
            <button
              v-if="registrySearchQuery || registryCourseFilter !== 'ALL' || registryStatusFilter !== 'ALL' || registryTypeFilter !== 'ALL'"
              type="button"
              class="btn btn-secondary btn-xs filter-reset-btn"
              @click="registrySearchQuery = ''; registryCourseFilter = 'ALL'; registryStatusFilter = 'ALL'; registryTypeFilter = 'ALL';"
              title="Reset all active filters"
            >
              ↺ Reset Filters
            </button>
          </div>
        </div>

        <div class="filter-results-counter">
          <span>Showing <strong>{{ filteredRegistryAssessments.length }}</strong> of <strong>{{ existingAssessments.length }}</strong> assessments</span>
        </div>

        <div class="table-responsive">
          <table class="assessment-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Assessment Title</th>
                <th>Course</th>
                <th>Type &amp; Items</th>
                <th>Marks / Duration</th>
                <th>Status</th>
                <th>Lecture Notes</th>
                <th class="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="filteredRegistryAssessments.length === 0">
                <td colspan="8" class="text-center py-6 text-muted">
                  No assessments match your active search and filter criteria.
                </td>
              </tr>
              <tr v-for="a in filteredRegistryAssessments" :key="a.assessment_id">
                <td><code class="code-id">#{{ a.assessment_id }}</code></td>
                <td>
                  <div class="title-cell-wrap">
                    <span class="font-bold assessment-main-title">{{ a.title }}</span>
                    <button
                      type="button"
                      class="rename-pencil-btn"
                      @click="openRenameModal(a)"
                      title="Edit assessment title"
                    >
                      ✏️ Edit Title
                    </button>
                  </div>
                </td>
                <td>{{ a.course_name || `Course #${a.course_id}` }}</td>
                <td>
                  <span class="badge badge-info">
                    {{ Array.isArray(a.questions) ? a.questions.length : (typeof a.questions === 'string' ? JSON.parse(a.questions || '[]').length : 0) }} Items
                  </span>
                </td>
                <td>{{ a.total_marks }} pts &bull; {{ a.duration_minutes }}m</td>
                <td>
                  <span :class="[
                    'badge',
                    (a.status || '').toUpperCase() === 'PUBLISHED' ? 'badge-success' :
                    (a.status || '').toUpperCase() === 'SAVED' ? 'badge-info' :
                    (a.status || '').toUpperCase() === 'CLOSED' ? 'badge-danger' :
                    (a.status || '').toUpperCase() === 'ARCHIVED' ? 'badge-purple' : 'badge-warning'
                  ]">
                    <span class="badge-dot"></span> {{ (a.status || 'DRAFT').toUpperCase() }}
                  </span>
                </td>
                <td>
                  <button
                    v-if="a.lecture_notes"
                    type="button"
                    class="btn btn-secondary btn-xs notes-view-btn"
                    @click="viewStoredNotes(a)"
                  >
                    📖 Notes ({{ (a.source_type || 'TEXT').toUpperCase() }})
                  </button>
                  <span v-else class="text-muted text-xs">None</span>
                </td>
                <td class="text-right">
                  <div class="action-btn-group justify-end flex items-center gap-1.5">
                    <!-- Student View Preview -->
                    <button
                      type="button"
                      class="btn btn-secondary btn-xs flex items-center gap-1"
                      @click="openStudentPreview(
                        Array.isArray(a.questions) ? a.questions : (typeof a.questions === 'string' ? JSON.parse(a.questions || '[]') : []),
                        a.title,
                        a.course_id,
                        a.duration_minutes,
                        a.total_marks
                      )"
                      title="Preview this assessment as a student would see it"
                    >
                      <span>👁️</span> Student View
                    </button>

                    <!-- Export Assessment -->
                    <button
                      type="button"
                      class="btn btn-secondary btn-xs flex items-center gap-1"
                      @click="openExportModal(a)"
                      title="Export assessment to Google Docs, Moodle, or Google Forms"
                    >
                      <span>📤</span> Export
                    </button>

                    <!-- Publish to Course / Configure Schedule -->
                    <button
                      v-if="(a.status || '').toUpperCase() === 'DRAFT' || (a.status || '').toUpperCase() === 'SAVED'"
                      type="button"
                      class="btn btn-primary btn-xs flex items-center gap-1"
                      @click="openPublishModal(a)"
                      title="Publish saved assessment to a course with attempt limits & schedule"
                    >
                      <span>🚀</span> Publish
                    </button>

                    <!-- Open / Re-open Assessment for submissions -->
                    <button
                      v-if="(a.status || '').toUpperCase() === 'CLOSED'"
                      type="button"
                      class="btn btn-primary btn-xs flex items-center gap-1"
                      @click="handleQuickStatusToggle(a, 'PUBLISHED')"
                      title="Re-open assessment for student test taking"
                    >
                      <span>🔓</span> Open
                    </button>

                    <!-- Close Assessment for submissions -->
                    <button
                      v-if="(a.status || '').toUpperCase() === 'PUBLISHED'"
                      type="button"
                      class="btn btn-secondary btn-xs flex items-center gap-1"
                      @click="handleQuickStatusToggle(a, 'CLOSED')"
                      title="Close assessment submissions"
                    >
                      <span>🔒</span> Close
                    </button>

                    <!-- Revert Published to Draft -->
                    <button
                      v-if="(a.status || '').toUpperCase() === 'PUBLISHED'"
                      type="button"
                      class="btn btn-secondary btn-xs"
                      @click="handleQuickStatusToggle(a, 'DRAFT')"
                      title="Revert back to Draft for revisions"
                    >
                      ↩ Revert
                    </button>

                    <!-- Rename Title Later -->
                    <button
                      type="button"
                      class="btn btn-secondary btn-xs"
                      @click="openRenameModal(a)"
                      title="Rename assessment title"
                    >
                      ✏️ Rename
                    </button>

                    <!-- Archive / Unarchive -->
                    <button
                      type="button"
                      :class="['btn btn-xs', (a.status || '').toUpperCase() === 'ARCHIVED' ? 'btn-outline-primary' : 'btn-secondary']"
                      @click="handleArchiveAssessment(a)"
                      :title="(a.status || '').toUpperCase() === 'ARCHIVED' ? 'Restore from Archive' : 'Archive assessment'"
                    >
                      {{ (a.status || '').toUpperCase() === 'ARCHIVED' ? '📂 Unarchive' : '📦 Archive' }}
                    </button>

                    <!-- Delete with Attempts Warning -->
                    <button
                      type="button"
                      class="btn btn-outline-danger btn-xs"
                      @click="handleDeleteClick(a)"
                      title="Delete assessment (warns if attempts exist)"
                    >
                      🗑️ Delete
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </main>

    <!-- ============================================== -->
    <!-- STUDENT QUIZ PREVIEW MODAL                     -->
    <!-- ============================================== -->
    <div v-if="showStudentPreviewModal && previewQuizData" class="modal-backdrop student-preview-backdrop" @click.self="closeStudentPreview">
      <div class="modal-card student-preview-modal-card">
        <!-- Student Exam Banner Header -->
        <div class="student-exam-top-bar">
          <div class="student-identity-tag">
            <span class="student-avatar-sim">🎓</span>
            <div>
              <div class="student-sim-label">STUDENT VIEW SIMULATION</div>
              <div class="student-sim-name">Candidate: Alex Rivera (Roll: 2024-CS-042)</div>
            </div>
          </div>

          <div class="student-timer-box">
            <span class="timer-icon">⏳</span>
            <div class="timer-text">
              <span class="timer-countdown">{{ formatSimulatedTime(simulatedTimerSeconds) }}</span>
              <span class="timer-sub">Simulated Time Left</span>
            </div>
          </div>

          <div class="student-modal-controls flex items-center gap-2">
            <!-- Teacher Overlay Toggle Button -->
            <button
              type="button"
              :class="['btn btn-sm', showTeacherGradingOverlay ? 'btn-primary' : 'btn-outline-amber']"
              @click="showTeacherGradingOverlay = !showTeacherGradingOverlay"
              title="Toggle educator answer key, rubrics, and explanations"
            >
              <span>{{ showTeacherGradingOverlay ? '👁️ Hide Teacher Key & Rubric' : '🔑 Show Teacher Answer Key & Rubric' }}</span>
            </button>
            <button type="button" class="close-btn" @click="closeStudentPreview" title="Exit Student Preview">✕</button>
          </div>
        </div>

        <!-- Exam Paper Subheader -->
        <div class="exam-paper-header">
          <div class="exam-paper-titles">
            <h2 class="exam-paper-title">{{ previewQuizData.title }}</h2>
            <div class="exam-paper-meta">
              <span class="meta-pill meta-course">📘 {{ previewQuizData.courseName }}</span>
              <span class="meta-pill meta-duration">⏱️ {{ previewQuizData.durationMinutes }} Minutes</span>
              <span class="meta-pill meta-marks">🎯 {{ previewQuizData.totalMarks }} Marks Total</span>
              <span class="meta-pill meta-count">📝 {{ previewQuizData.questions.length }} Questions</span>
            </div>
          </div>
          <div v-if="showTeacherGradingOverlay" class="grading-overlay-pill">
            <span class="pulse-dot"></span> Teacher Solution &amp; Rubric Overlay Active
          </div>
        </div>

        <!-- Student Instructions Notice -->
        <div class="exam-instructions-banner">
          <div class="instructions-icon">ℹ️</div>
          <div class="instructions-text">
            <strong>Candidate Examination Guidelines:</strong> Answer all questions thoroughly. Once submitted, your answers will be evaluated based on algorithmic correctness and theoretical precision.
          </div>
        </div>

        <!-- Questions Flow -->
        <div class="student-questions-flow">
          <div
            v-for="(q, idx) in previewQuizData.questions"
            :key="idx"
            class="student-question-card"
          >
            <div class="sq-card-header">
              <div class="sq-header-left">
                <span class="sq-badge">Question {{ idx + 1 }}</span>
                <span :class="['sq-type-badge', q.type === 'MCQ' ? 'sq-type-mcq' : (q.type === 'SHORT_QUESTION' ? 'sq-type-short' : 'sq-type-code')]">
                  {{ q.type === 'CODING_QUESTION' ? 'Coding Problem' : (q.type === 'SHORT_QUESTION' ? 'Short Answer' : 'Multiple Choice') }}
                </span>
                <span v-if="q.programmingLanguage" class="sq-lang-tag">{{ q.programmingLanguage }}</span>
              </div>
              <div class="sq-header-right">
                <span class="sq-marks-pill">{{ q.marks || 10 }} Marks</span>
              </div>
            </div>

            <!-- Question Prompt -->
            <div class="sq-prompt">{{ q.question || q.title }}</div>

            <!-- 1. MCQ Student Test View -->
            <div v-if="q.type === 'MCQ' || (!q.type && q.options)" class="sq-mcq-options-container">
              <label
                v-for="(opt, optIdx) in (q.options || [])"
                :key="optIdx"
                :class="[
                  'sq-mcq-option-label',
                  simulatedStudentAnswers[idx] === opt ? 'sq-option-selected' : '',
                  showTeacherGradingOverlay && (opt === q.correctAnswer || opt === q.answer) ? 'sq-option-correct-key' : ''
                ]"
              >
                <input
                  type="radio"
                  :name="`preview_q_${idx}`"
                  :value="opt"
                  v-model="simulatedStudentAnswers[idx]"
                  class="sq-radio-input"
                />
                <span class="sq-opt-letter">{{ ['A','B','C','D','E','F'][optIdx] || (optIdx+1) }}</span>
                <span class="sq-opt-text">{{ opt }}</span>
                <span v-if="showTeacherGradingOverlay && (opt === q.correctAnswer || opt === q.answer)" class="sq-key-badge">
                  ✓ Correct Key
                </span>
              </label>

              <!-- Teacher Explanation Overlay -->
              <div v-if="showTeacherGradingOverlay && q.explanation" class="teacher-key-explanation-box">
                <div class="t-key-title">💡 Educator Explanation &amp; Rationale:</div>
                <p class="t-key-text">{{ q.explanation }}</p>
              </div>
            </div>

            <!-- 2. Short Question Student Test View -->
            <div v-if="q.type === 'SHORT_QUESTION'" class="sq-short-container">
              <div class="sq-input-label">Candidate Answer:</div>
              <textarea
                v-model="simulatedStudentAnswers[idx]"
                class="sq-textarea"
                rows="4"
                placeholder="Type your response here..."
              ></textarea>
              <div class="sq-textarea-footer">
                <span class="text-xs text-muted">Words: {{ (simulatedStudentAnswers[idx] || '').trim().split(/\s+/).filter(Boolean).length }}</span>
              </div>

              <!-- Teacher Model Answer, Rubric, Explanation Overlay -->
              <div v-if="showTeacherGradingOverlay" class="teacher-short-overlay-box">
                <div v-if="q.modelAnswer" class="t-overlay-section">
                  <span class="t-overlay-label">📖 Model Answer:</span>
                  <div class="t-overlay-body">{{ q.modelAnswer }}</div>
                </div>
                <div v-if="q.rubric" class="t-overlay-section">
                  <span class="t-overlay-label">📋 Grading Rubric:</span>
                  <div class="t-overlay-body t-rubric-body">{{ q.rubric }}</div>
                </div>
                <div v-if="q.explanation" class="t-overlay-section">
                  <span class="t-overlay-label">💡 Explanatory Notes:</span>
                  <div class="t-overlay-body italic">{{ q.explanation }}</div>
                </div>
              </div>
            </div>

            <!-- 3. Coding Question Student Test View -->
            <div v-if="q.type === 'CODING_QUESTION'" class="sq-code-container">
              <div v-if="q.starterCode" class="sq-starter-wrap">
                <div class="sq-code-bar">
                  <span>Starter Code ({{ q.programmingLanguage || 'Template' }})</span>
                </div>
                <pre class="sq-code-pre"><code>{{ q.starterCode }}</code></pre>
              </div>

              <div v-if="q.sampleInput || q.sampleOutput" class="sq-sample-io-grid">
                <div v-if="q.sampleInput" class="sq-io-box">
                  <span class="sq-io-label">Sample Input</span>
                  <pre class="sq-io-code">{{ q.sampleInput }}</pre>
                </div>
                <div v-if="q.sampleOutput" class="sq-io-box">
                  <span class="sq-io-label">Sample Output</span>
                  <pre class="sq-io-code">{{ q.sampleOutput }}</pre>
                </div>
              </div>

              <div class="sq-student-code-input">
                <div class="sq-code-bar">
                  <span>Your {{ q.programmingLanguage || 'Code' }} Implementation:</span>
                </div>
                <textarea
                  v-model="simulatedStudentAnswers[idx]"
                  class="sq-code-textarea"
                  rows="6"
                  :placeholder="`Write your ${q.programmingLanguage || 'code'} solution here...`"
                ></textarea>
              </div>

              <!-- Teacher Code Solution & Rubric Overlay -->
              <div v-if="showTeacherGradingOverlay" class="teacher-code-overlay-box">
                <div v-if="q.rubric" class="t-overlay-section">
                  <span class="t-overlay-label">📋 Code Evaluation Rubric:</span>
                  <div class="t-overlay-body t-rubric-body">{{ q.rubric }}</div>
                </div>
                <div v-if="q.solutionCode" class="t-overlay-section">
                  <span class="t-overlay-label">✓ Answer Key (Reference Solution):</span>
                  <pre class="sq-solution-pre"><code>{{ q.solutionCode }}</code></pre>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Student Simulation Modal Footer -->
        <div class="student-preview-footer">
          <div class="footer-note">
            <span>ℹ️ Student preview mode active. No actual grade or submission is recorded.</span>
          </div>
          <div class="flex items-center gap-2">
            <button
              type="button"
              class="btn btn-secondary"
              @click="closeStudentPreview"
            >
              Exit Student Preview
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ============================================== -->
    <!-- RENAME ASSESSMENT TITLE MODAL                  -->
    <!-- ============================================== -->
    <div v-if="showRenameModal && renamingAssessment" class="modal-backdrop" @click.self="showRenameModal = false">
      <div class="modal-card modal-sm">
        <div class="modal-header">
          <div>
            <h3 class="modal-title">Rename Assessment Title</h3>
            <p class="modal-meta-tag">Update title for Assessment #{{ renamingAssessment.assessment_id }}</p>
          </div>
          <button type="button" class="close-btn" @click="showRenameModal = false">✕</button>
        </div>
        <div class="modal-body p-4">
          <div v-if="renameError" class="alert alert-danger mb-3">{{ renameError }}</div>
          <div class="form-group">
            <label class="form-label">Assessment Title <span class="text-danger">*</span></label>
            <input
              type="text"
              v-model="renameTitleInput"
              class="form-control"
              placeholder="Enter new assessment title..."
              @keyup.enter="handleSaveRename"
            />
            <span class="form-hint">Assessment title can be edited at any time before or after publishing.</span>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" @click="showRenameModal = false">Cancel</button>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="isRenaming || !renameTitleInput.trim()"
            @click="handleSaveRename"
          >
            {{ isRenaming ? 'Saving Title...' : 'Save New Title' }}
          </button>
        </div>
      </div>
    </div>

    <!-- ============================================== -->
    <!-- DELETE WARNING MODAL (ATTEMPTS EXIST)          -->
    <!-- ============================================== -->
    <div v-if="showDeleteWarningModal && deletingAssessment" class="modal-backdrop" @click.self="showDeleteWarningModal = false">
      <div class="modal-card modal-danger-card">
        <div class="modal-header modal-danger-header">
          <div class="flex items-center gap-2">
            <span class="warning-large-icon">⚠️</span>
            <div>
              <h3 class="modal-title text-danger">Warning: Student Attempts Exist!</h3>
              <p class="modal-meta-tag text-danger-sub">Assessment #{{ deletingAssessment.assessment_id }}: {{ deletingAssessment.title }}</p>
            </div>
          </div>
          <button type="button" class="close-btn" @click="showDeleteWarningModal = false">✕</button>
        </div>
        <div class="modal-body p-4">
          <div class="danger-callout-box">
            <p class="font-bold text-red-800 mb-1">
              ⚠️ This assessment currently has {{ warningAttemptsCount }} active student submission(s) / attempt record(s).
            </p>
            <p class="text-xs text-red-700">
              Permanently deleting this assessment will erase all student test results, marks, recorded answers, and academic audit trails from the institutional registry.
            </p>
          </div>

          <div class="mt-3">
            <label class="danger-confirm-checkbox flex items-start gap-2 cursor-pointer">
              <input type="checkbox" v-model="confirmForceCheckbox" class="mt-1" />
              <span class="text-xs font-semibold text-gray-800">
                I understand that student records exist, and I confirm permanent deletion of this assessment and all {{ warningAttemptsCount }} student submission(s).
              </span>
            </label>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" @click="showDeleteWarningModal = false">Cancel (Keep Assessment)</button>
          <button
            type="button"
            class="btn btn-danger"
            :disabled="!confirmForceCheckbox || isDeletingAssessment"
            @click="executeDelete(deletingAssessment.assessment_id, true)"
          >
            {{ isDeletingAssessment ? 'Deleting All Records...' : 'Permanently Delete Assessment & Records' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Stored Lecture Notes Modal Dialog -->
    <div v-if="showNotesModal" class="modal-backdrop" @click.self="showNotesModal = false">
      <div class="modal-card">
        <div class="modal-header">
          <div>
            <h3 class="modal-title">Lecture Notes: {{ activeNotesItem?.title }}</h3>
            <span class="modal-meta-tag">
              Course: {{ activeNotesItem?.course_name || activeNotesItem?.course_id }} | 
              Source: {{ activeNotesItem?.source_type || 'TEXT' }} {{ activeNotesItem?.source_file_name ? `(${activeNotesItem.source_file_name})` : '' }}
            </span>
          </div>
          <button type="button" class="close-btn" @click="showNotesModal = false">✕</button>
        </div>
        <div class="modal-body">
          <pre class="stored-notes-content">{{ activeNotesItem?.lecture_notes }}</pre>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" @click="showNotesModal = false">Close</button>
        </div>
      </div>
    </div>
  </div>

<!-- ═══════════════ PUBLISH & SCHEDULE MODAL ═══════════════ -->
<Teleport to="body">
  <div v-if="showPublishModal" class="export-modal-backdrop" @click.self="showPublishModal = false">
    <div class="export-modal-card" style="max-width: 600px;">
      <div class="export-modal-header">
        <span class="export-modal-icon">🚀</span>
        <div>
          <h2 class="export-modal-title">Publish Assessment to Course</h2>
          <p class="export-modal-sub">Configure destination course, student attempt limits, and test schedule</p>
        </div>
        <button class="export-modal-close" @click="showPublishModal = false">✕</button>
      </div>

      <div v-if="publishModalError" class="export-alert export-alert-error">
        ⚠️ {{ publishModalError }}
      </div>

      <div style="padding: 24px 28px; display: flex; flex-direction: column; gap: 18px;">
        <!-- Assessment Info Banner -->
        <div style="background: #f1f5f9; padding: 12px 16px; border-radius: 10px; border-left: 4px solid #3b82f6;">
          <div style="font-size: 0.75rem; text-transform: uppercase; color: #64748b; font-weight: 700;">Publishing Assessment</div>
          <div style="font-size: 1rem; font-weight: 700; color: #0f172a; margin-top: 2px;">{{ publishingAssessment?.title }}</div>
          <div style="font-size: 0.8rem; color: #64748b; margin-top: 2px;">
            Total Marks: {{ publishingAssessment?.total_marks || 100 }} | Duration: {{ publishingAssessment?.duration_minutes || 60 }} mins
          </div>
        </div>

        <!-- 1. Destination Course Selection -->
        <div class="form-group mb-0">
          <label class="form-label" style="font-weight: 700; color: #1e293b;">
            📚 Destination Course *
          </label>
          <select v-model="publishForm.courseId" class="form-select" style="width: 100%; padding: 10px 14px; border-radius: 8px; border: 1.5px solid #cbd5e1;">
            <option value="" disabled>-- Select Enrolled Course --</option>
            <option v-for="c in courses" :key="c.course_id" :value="c.course_id">
              {{ c.course_code }} - {{ c.course_name }}
            </option>
          </select>
          <span class="text-xs text-muted" style="margin-top: 4px; display: block;">Students registered in this course will have access to sit for this assessment.</span>
        </div>

        <!-- 2. Attempt Limit (Default: 1) -->
        <div class="form-group mb-0">
          <label class="form-label" style="font-weight: 700; color: #1e293b;">
            🎯 Maximum Attempt Limit per Student *
          </label>
          <div style="display: flex; align-items: center; gap: 12px;">
            <input
              type="number"
              v-model="publishForm.attemptLimit"
              min="1"
              max="20"
              class="form-input"
              style="max-width: 140px; padding: 10px 14px; font-weight: 700; font-size: 1.05rem;"
            />
            <span class="text-xs text-muted"><strong>Default is 1 attempt.</strong> Students who exhaust their attempts cannot retake the test.</span>
          </div>
        </div>

        <!-- 3. Schedule Timings (Open & Close Time Window) -->
        <div style="background: #f8fafc; border: 1px dashed #cbd5e1; border-radius: 12px; padding: 16px;">
          <div style="font-size: 0.88rem; font-weight: 700; color: #0f172a; margin-bottom: 4px;">
            ⏰ Schedule Assessment Availability (Optional)
          </div>
          <p style="font-size: 0.78rem; color: #64748b; margin-bottom: 12px; line-height: 1.4;">
            Leave blank for unrestricted 24/7 availability, or set explicit start/close dates and times.
          </p>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div>
              <label style="font-size: 0.78rem; font-weight: 600; color: #334155; display: block; margin-bottom: 4px;">
                🟢 Open Time (Available from)
              </label>
              <input
                type="datetime-local"
                v-model="publishForm.scheduleOpenAt"
                class="form-input"
                style="width: 100%; font-size: 0.82rem; padding: 8px 10px; background: #fff;"
              />
            </div>
            <div>
              <label style="font-size: 0.78rem; font-weight: 600; color: #334155; display: block; margin-bottom: 4px;">
                🛑 Close Time (Deadline)
              </label>
              <input
                type="datetime-local"
                v-model="publishForm.scheduleCloseAt"
                class="form-input"
                style="width: 100%; font-size: 0.82rem; padding: 8px 10px; background: #fff;"
              />
            </div>
          </div>
        </div>
      </div>

      <div style="padding: 16px 28px 24px; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end; gap: 10px; background: #fafafa; border-radius: 0 0 20px 20px;">
        <button
          type="button"
          class="btn btn-secondary"
          @click="showPublishModal = false"
        >
          Cancel
        </button>
        <button
          type="button"
          class="btn btn-primary"
          :disabled="isSubmittingPublish"
          @click="handleExecutePublish"
        >
          {{ isSubmittingPublish ? 'Publishing...' : '🚀 Confirm & Publish to Course' }}
        </button>
      </div>
    </div>
  </div>
</Teleport>

<!-- ═══════════════ EXPORT MODAL ═══════════════ -->
<Teleport to="body">
  <div v-if="showExportModal" class="export-modal-backdrop" @click.self="showExportModal = false">
    <div class="export-modal-card">
      <div class="export-modal-header">
        <span class="export-modal-icon">📤</span>
        <div>
          <h2 class="export-modal-title">Export Assessment</h2>
          <p class="export-modal-sub">Download in multiple formats for different platforms</p>
        </div>
        <button class="export-modal-close" @click="showExportModal = false">✕</button>
      </div>

      <!-- Alert messages -->
      <div v-if="exportError" class="export-alert export-alert-error">⚠️ {{ exportError }}</div>
      <div v-if="exportSuccess" class="export-alert export-alert-success">{{ exportSuccess }}</div>

      <!-- Export Format Cards (Only Google Document, PDF, Moodle, and Google Forms) -->
      <div class="export-formats-grid">

        <!-- Google Doc -->
        <div class="export-format-card" @click="handleExport('GOOGLE_DOC')">
          <div class="export-format-icon gdoc-icon">📄</div>
          <div class="export-format-info">
            <h3>Google Document</h3>
            <p>Formatted HTML document — open directly in Google Docs via File → Open. Includes all questions, marks, and Bloom's taxonomy tags.</p>
            <label class="export-answer-key-toggle" @click.stop>
              <input type="checkbox" v-model="exportIncludeAnswerKey" />
              Include Answer Key &amp; Explanations
            </label>
          </div>
          <button
            class="export-format-btn gdoc-btn"
            :disabled="exportingFormat !== null"
            @click.stop="handleExport('GOOGLE_DOC')"
          >
            <span v-if="exportingFormat === 'GOOGLE_DOC'" class="export-spinner">⏳</span>
            <span v-else>⬇ Download .html</span>
          </button>
          <div class="export-format-hint">💡 Google Docs: File → Open → Upload downloaded file</div>
        </div>

        <!-- PDF Document -->
        <div class="export-format-card" @click="handleExport('PDF')">
          <div class="export-format-icon pdf-icon">📑</div>
          <div class="export-format-info">
            <h3>Printable PDF Examination</h3>
            <p>Institutional PDF exam paper formatted for printing or offline testing. Features candidate block, question rubrics, and optional answer key.</p>
            <label class="export-answer-key-toggle" @click.stop>
              <input type="checkbox" v-model="exportIncludeAnswerKey" />
              Include Answer Key &amp; Explanations
            </label>
          </div>
          <button
            class="export-format-btn pdf-btn"
            :disabled="exportingFormat !== null"
            @click.stop="handleExport('PDF')"
          >
            <span v-if="exportingFormat === 'PDF'" class="export-spinner">⏳</span>
            <span v-else>⬇ Download .pdf</span>
          </button>
          <div class="export-format-hint">💡 Direct PDF download — ready for printing or classroom distribution</div>
        </div>

        <!-- Moodle XML -->
        <div class="export-format-card" @click="handleExport('MOODLE_XML')">
          <div class="export-format-icon moodle-icon">🎓</div>
          <div class="export-format-info">
            <h3>Moodle Import File</h3>
            <p>Standard Moodle 2.x XML format. Import via Moodle → Question Bank → Import. Supports MCQ, Short Answer, and Essay types.</p>
          </div>
          <button
            class="export-format-btn moodle-btn"
            :disabled="exportingFormat !== null"
            @click.stop="handleExport('MOODLE_XML')"
          >
            <span v-if="exportingFormat === 'MOODLE_XML'" class="export-spinner">⏳</span>
            <span v-else>⬇ Download .xml</span>
          </button>
          <div class="export-format-hint">💡 Moodle: Administration → Question Bank → Import → Moodle XML</div>
        </div>

        <!-- Google Forms -->
        <div class="export-format-card" @click="handleExport('GOOGLE_FORMS')">
          <div class="export-format-icon gforms-icon">📋</div>
          <div class="export-format-info">
            <h3>Google Forms Script</h3>
            <p>Auto-generates a Google Apps Script that creates a Google Form quiz. Run once in Google Script Editor to generate your complete form.</p>
          </div>
          <button
            class="export-format-btn gforms-btn"
            :disabled="exportingFormat !== null"
            @click.stop="handleExport('GOOGLE_FORMS')"
          >
            <span v-if="exportingFormat === 'GOOGLE_FORMS'" class="export-spinner">⏳</span>
            <span v-else>⬇ Download .gs</span>
          </button>
          <div class="export-format-hint">💡 script.google.com → New Project → Paste → Run createForm()</div>
        </div>

      </div>

      <!-- Export History -->
      <div class="export-history-section">
        <div class="export-history-header">
          <h3>📋 Export History</h3>
          <button class="export-refresh-btn" @click="loadExportHistory()" :disabled="exportHistoryLoading">
            {{ exportHistoryLoading ? '⏳' : '🔄' }} Refresh
          </button>
        </div>
        <div v-if="exportHistoryLoading" class="export-history-loading">Loading history…</div>
        <div v-else-if="exportHistory.length === 0" class="export-history-empty">No exports yet for this assessment.</div>
        <div v-else class="export-history-list">
          <div v-for="exp in exportHistory" :key="exp.export_id" class="export-history-item">
            <div class="export-history-icon">
              <span v-if="exp.format === 'GOOGLE_DOC'">📄</span>
              <span v-else-if="exp.format === 'PDF'">📑</span>
              <span v-else-if="exp.format === 'MOODLE_XML'">🎓</span>
              <span v-else-if="exp.format === 'GOOGLE_FORMS'">📋</span>
              <span v-else>📄</span>
            </div>
            <div class="export-history-info">
              <div class="export-history-name">{{ exp.file_name || exp.format }}</div>
              <div class="export-history-meta">
                {{ exp.format }} · {{ exp.question_count }} Qs ·
                <span v-if="exp.include_answer_key" class="exp-badge-key">🔑 With Answer Key</span>
                {{ new Date(exp.exported_at).toLocaleString() }}
              </div>
            </div>
            <button class="export-history-delete" @click="handleDeleteExportHistory(exp.export_id)" title="Remove from history">🗑</button>
          </div>
        </div>
      </div>

    </div>
  </div>
</Teleport>
</template>

<style scoped>
.assessment-studio-page {
  min-height: 100vh;
  background-color: #F8FBFF;
  color: #1E293B;
  display: flex;
  flex-direction: column;
}

.navbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.85rem 2rem;
  background: #FFFFFF;
  border-bottom: 1px solid #87CEEB;
  position: sticky;
  top: 0;
  z-index: 50;
  box-shadow: 0 2px 8px rgba(56, 189, 248, 0.08);
}

.nav-brand {
  display: flex;
  align-items: center;
  gap: 0.85rem;
}

.logo-box {
  width: 42px;
  height: 42px;
  min-width: 42px;
  max-width: 42px;
  border-radius: 10px;
  background: #E0F2FE;
  color: #0284C7;
  display: flex;
  align-items: center;
  justify-content: center;
}

.logo-box svg {
  width: 24px;
  height: 24px;
  max-width: 24px;
  max-height: 24px;
}

.nav-title {
  font-size: 1.25rem;
  font-weight: 700;
  color: #1E293B;
  margin: 0;
  line-height: 1.2;
}

.nav-subtitle {
  font-size: 0.8rem;
  color: #64748B;
  margin: 0;
}

.nav-actions {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.autosave-status-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  background: #ECFDF5;
  color: #059669;
  border: 1px solid #A7F3D0;
  border-radius: 9999px;
  font-size: 0.76rem;
  font-weight: 600;
  padding: 0.25rem 0.65rem;
}

.autosave-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #10B981;
}

.studio-container {
  max-width: 1040px;
  margin: 0 auto;
  width: 100%;
  padding: 2rem 1.5rem 4rem;
  display: flex;
  flex-direction: column;
  gap: 1.75rem;
}

.studio-banner {
  padding: 1.75rem 2rem;
  border-radius: 16px;
  background: #FFFFFF;
  border: 1px solid #87CEEB;
  box-shadow: 0 4px 16px rgba(56, 189, 248, 0.08);
}

.banner-badge-row {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 0.75rem;
}

.banner-subtext {
  font-size: 0.85rem;
  color: #64748B;
}

.studio-headline {
  font-size: 1.65rem;
  font-weight: 700;
  color: #1E293B;
  margin-bottom: 0.5rem;
}

.studio-description {
  font-size: 0.95rem;
  color: #64748B;
  line-height: 1.55;
  max-width: 860px;
}

.form-card {
  padding: 2rem;
  border-radius: 16px;
  background: #FFFFFF;
  border: 1px solid #87CEEB;
  box-shadow: 0 8px 24px rgba(56, 189, 248, 0.09);
}

.form-card-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding-bottom: 1.25rem;
  margin-bottom: 1.5rem;
  border-bottom: 1px solid #E0F2FE;
}

.form-title {
  font-size: 1.25rem;
  font-weight: 700;
  color: #1E293B;
}

.form-subtitle {
  font-size: 0.85rem;
  color: #64748B;
  margin-top: 0.25rem;
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.82rem;
  font-weight: 600;
  color: #0284C7;
  background: #E0F2FE;
  padding: 0.35rem 0.75rem;
  border-radius: 20px;
}

.pulse-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #0284C7;
}

.assessment-form {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.form-row-2 {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 1.25rem;
}

.form-row-3 {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 1.25rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.form-label {
  font-size: 0.88rem;
  font-weight: 600;
  color: #1E293B;
}

.form-input {
  width: 100%;
  padding: 0.75rem 0.95rem;
  border-radius: 8px;
  border: 1px solid #CBDFF0;
  background: #FFFFFF;
  color: #1E293B;
  font-size: 0.92rem;
  transition: all 0.2s ease;
}

.form-input:focus {
  outline: none;
  border-color: #38BDF8;
  box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.2);
}

.textarea-input {
  resize: vertical;
  min-height: 85px;
}

.form-hint {
  font-size: 0.78rem;
  color: #64748B;
}

.status-radio-group {
  display: flex;
  gap: 1.5rem;
  margin-top: 0.25rem;
}

.radio-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
  cursor: pointer;
  color: #1E293B;
}

.form-actions-bar {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding-top: 1.25rem;
  margin-top: 0.5rem;
  border-top: 1px solid #E0F2FE;
}

.btn-lg {
  padding: 0.85rem 1.75rem;
  font-size: 0.98rem;
  font-weight: 600;
  border-radius: 10px;
}

.btn-svg {
  width: 18px;
  height: 18px;
  margin-right: 0.4rem;
}

.record-badge-row {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin-top: 0.5rem;
  font-size: 0.88rem;
}

.registry-card {
  padding: 1.75rem;
  border-radius: 16px;
  background: #FFFFFF;
  border: 1px solid #87CEEB;
}

.registry-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.25rem;
}

.assessment-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}

.assessment-table th {
  text-align: left;
  padding: 0.75rem 1rem;
  background: #F8FBFF;
  color: #64748B;
  font-weight: 600;
  border-bottom: 1px solid #CBDFF0;
}

.assessment-table td {
  padding: 0.85rem 1rem;
  border-bottom: 1px solid #E0F2FE;
  color: #1E293B;
}

.code-id {
  background: #E0F2FE;
  color: #0284C7;
  padding: 0.2rem 0.45rem;
  border-radius: 4px;
  font-family: monospace;
  font-weight: 600;
}

/* Lecture Notes & PDF Extraction Styles */
.lecture-notes-container {
  background: #F8FBFF;
  border: 1px solid #BAE6FD;
  border-radius: 12px;
  padding: 1.25rem;
  margin-bottom: 1.5rem;
}

.lecture-header-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  flex-wrap: wrap;
  margin-bottom: 0.85rem;
}

.optional-tag {
  font-size: 0.8rem;
  color: #0284C7;
  font-weight: normal;
  margin-left: 0.35rem;
}

.form-helper {
  font-size: 0.82rem;
  color: #64748B;
  margin-top: 0.2rem;
}

.lecture-mode-switch {
  display: flex;
  background: #E0F2FE;
  border-radius: 8px;
  padding: 3px;
  gap: 4px;
}

.mode-tab-btn {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.85rem;
  font-size: 0.85rem;
  font-weight: 600;
  border: none;
  background: transparent;
  color: #0369A1;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.mode-tab-btn:hover {
  color: #0284C7;
}

.mode-tab-btn.active {
  background: #FFFFFF;
  color: #0284C7;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
}

.mini-svg {
  width: 15px;
  height: 15px;
}

.pdf-upload-box {
  margin-bottom: 1rem;
}

.pdf-dropzone {
  position: relative;
  border: 2px dashed #7DD3FC;
  background: #FFFFFF;
  border-radius: 10px;
  padding: 1.5rem 1rem;
  text-align: center;
  transition: border-color 0.2s ease, background-color 0.2s ease;
}

.pdf-dropzone:hover {
  border-color: #0284C7;
  background: #F0F9FF;
}

.pdf-hidden-input {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}

.pdf-dropzone-label {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
  cursor: pointer;
  pointer-events: none;
}

.pdf-dropzone-label button {
  pointer-events: auto;
}

.pdf-icon-wrapper {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: #E0F2FE;
  color: #0284C7;
  display: flex;
  align-items: center;
  justify-content: center;
}

.pdf-upload-icon {
  width: 26px;
  height: 26px;
}

.pdf-dropzone-text {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.pdf-dropzone-title {
  font-size: 0.95rem;
  font-weight: 600;
  color: #1E293B;
}

.pdf-dropzone-sub {
  font-size: 0.8rem;
  color: #64748B;
}

.extraction-loading-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  margin-top: 0.75rem;
  padding: 0.6rem 1rem;
  background: #E0F2FE;
  border-radius: 8px;
  color: #0284C7;
  font-size: 0.85rem;
  font-weight: 500;
}

.spinner-small {
  width: 16px;
  height: 16px;
  border: 2px solid #BAE6FD;
  border-top-color: #0284C7;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.notes-alert {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.85rem 1rem;
  border-radius: 8px;
  font-size: 0.86rem;
  line-height: 1.45;
  margin-bottom: 0.85rem;
}

.notes-alert-success {
  background: #ECFDF5;
  border: 1px solid #A7F3D0;
  color: #065F46;
}

.notes-alert-warning {
  background: #FFFBEB;
  border: 1px solid #FDE68A;
  color: #92400E;
}

.alert-icon {
  width: 20px;
  height: 20px;
  flex-shrink: 0;
  margin-top: 2px;
}

.alert-content {
  flex: 1;
}

.alert-actions {
  display: flex;
  gap: 1rem;
  margin-top: 0.4rem;
}

.btn-link {
  background: none;
  border: none;
  color: #0284C7;
  font-weight: 600;
  text-decoration: underline;
  cursor: pointer;
  padding: 0;
  font-size: 0.82rem;
}

.notes-textarea-wrapper {
  background: #FFFFFF;
  border-radius: 8px;
  border: 1px solid #CBDFF0;
  overflow: hidden;
}

.notes-meta-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 0.85rem;
  background: #F1F5F9;
  border-bottom: 1px solid #CBDFF0;
  font-size: 0.8rem;
  color: #475569;
}

.notes-source-badge strong {
  color: #0284C7;
}

.lecture-textarea {
  border: none !important;
  border-radius: 0 !important;
  padding: 0.85rem !important;
  font-family: inherit;
  font-size: 0.88rem;
  line-height: 1.5;
  resize: vertical;
}

.lecture-textarea:focus {
  outline: none;
  box-shadow: none !important;
}

.notes-action-row {
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
  padding: 0.45rem 0.85rem;
  background: #F8FBFF;
  border-top: 1px solid #E2E8F0;
}

.btn-helper-action {
  background: none;
  border: none;
  font-size: 0.8rem;
  color: #0284C7;
  cursor: pointer;
  padding: 0;
  text-decoration: underline;
}

.btn-helper-action:hover {
  color: #0369A1;
}

.text-danger {
  color: #DC2626 !important;
}

.btn-xs {
  padding: 0.3rem 0.6rem;
  font-size: 0.78rem;
}

.notes-view-btn {
  white-space: nowrap;
}

.text-xs {
  font-size: 0.75rem;
}

/* Notes Modal Dialog */
.modal-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1.5rem;
}

.modal-card {
  background: #FFFFFF;
  border-radius: 14px;
  width: 100%;
  max-width: 650px;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
  border: 1px solid #BAE6FD;
  overflow: hidden;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid #E2E8F0;
  background: #F8FBFF;
}

.modal-title {
  font-size: 1.1rem;
  font-weight: 700;
  color: #0F172A;
  margin: 0;
}

.modal-meta-tag {
  display: block;
  font-size: 0.8rem;
  color: #64748B;
  margin-top: 0.2rem;
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.4rem;
  color: #64748B;
  cursor: pointer;
  line-height: 1;
  padding: 0;
}

.close-btn:hover {
  color: #0F172A;
}

.modal-body {
  padding: 1.25rem 1.5rem;
  overflow-y: auto;
  flex: 1;
}

.stored-notes-content {
  background: #F8FAFC;
  border: 1px solid #E2E8F0;
  border-radius: 8px;
  padding: 1rem;
  font-size: 0.85rem;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  color: #1E293B;
  max-height: 50vh;
  overflow-y: auto;
  font-family: inherit;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  padding: 0.85rem 1.5rem;
  border-top: 1px solid #E2E8F0;
  background: #F8FBFF;
}

/* Question Types Selection & Generator Styles */
.question-type-single-section {
  background: #FFFFFF;
  border: 1.5px solid #BAE6FD;
  border-radius: 14px;
  padding: 1.35rem 1.5rem;
  margin-bottom: 1.5rem;
  box-shadow: 0 4px 14px rgba(2, 132, 199, 0.06);
}

.q-single-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 0.85rem;
  margin-bottom: 1.15rem;
  border-bottom: 1px solid #E0F2FE;
  padding-bottom: 0.75rem;
}

.required-tag {
  font-size: 0.8rem;
  color: #DC2626;
  font-weight: 600;
  margin-left: 0.35rem;
}

.current-type-pill {
  font-size: 0.8rem;
  font-weight: 700;
  padding: 0.3rem 0.75rem;
  border-radius: 20px;
}

.pill-mcq {
  background: #E0F2FE;
  color: #0284C7;
  border: 1px solid #7DD3FC;
}

.pill-short {
  background: #F3E8FF;
  color: #9333EA;
  border: 1px solid #D8B4FE;
}

.pill-coding {
  background: #ECFDF5;
  color: #059669;
  border: 1px solid #6EE7B7;
}

/* 3 Single-Select Cards */
.single-type-cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 1rem;
  margin-bottom: 1.25rem;
}

.single-type-card {
  border: 2px solid #E2E8F0;
  background: #F8FBFF;
  border-radius: 12px;
  padding: 1.1rem;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  flex-direction: column;
}

.single-type-card:hover {
  border-color: #94A3B8;
  background: #FFFFFF;
  transform: translateY(-2px);
}

.single-type-card.selected-single {
  background: #FFFFFF;
}

.selected-single.mcq-theme {
  border-color: #0284C7;
  box-shadow: 0 6px 16px rgba(2, 132, 199, 0.14);
}

.selected-single.short-theme {
  border-color: #9333EA;
  box-shadow: 0 6px 16px rgba(147, 51, 234, 0.14);
}

.selected-single.coding-theme {
  border-color: #059669;
  box-shadow: 0 6px 16px rgba(5, 150, 105, 0.14);
}

.single-card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.single-radio-wrap {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  cursor: pointer;
}

.single-radio-wrap input[type="radio"] {
  width: 18px;
  height: 18px;
  accent-color: #0284C7;
  cursor: pointer;
}

.single-card-title {
  font-size: 0.95rem;
  font-weight: 700;
  color: #0F172A;
}

.single-tag {
  font-size: 0.72rem;
  font-weight: 600;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
}

.single-card-desc {
  font-size: 0.82rem;
  color: #64748B;
  line-height: 1.45;
  margin: 0;
}

/* Parameters Box for the Single Selected Type */
.selected-type-parameters-box {
  background: #F8FAFC;
  border: 1px solid #E2E8F0;
  border-radius: 10px;
  padding: 1rem 1.25rem;
}

.params-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-bottom: 0.85rem;
}

.params-title {
  font-size: 0.88rem;
  color: #334155;
}

.params-title strong {
  color: #0F172A;
}

.params-subtotal {
  font-size: 0.84rem;
  color: #0284C7;
}

.params-fields-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 1rem;
}

.param-col {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.param-col label {
  font-size: 0.75rem;
  font-weight: 600;
  color: #475569;
  text-transform: uppercase;
}

.param-input,
.param-select {
  padding: 0.45rem 0.7rem;
  font-size: 0.88rem;
}

/* Bloom's Taxonomy Multi-Level Distribution Panel */
.bloom-distribution-panel {
  margin-top: 1.25rem;
  padding-top: 1.15rem;
  border-top: 1px dashed #CBD5E1;
}

.bloom-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.bloom-panel-title-wrap {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.bloom-panel-title {
  font-size: 0.92rem;
  font-weight: 700;
  color: #0F172A;
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.bloom-panel-subtitle {
  font-size: 0.78rem;
  color: #64748B;
}

.bloom-panel-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.6rem;
}

.bloom-total-pill {
  font-size: 0.78rem;
  font-weight: 700;
  padding: 0.25rem 0.65rem;
  border-radius: 9999px;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}

.total-pill-success {
  background: #ECFDF5;
  color: #059669;
  border: 1px solid #A7F3D0;
}

.total-pill-warning {
  background: #FFFBEB;
  color: #D97706;
  border: 1px solid #FDE68A;
}

.bloom-preset-buttons {
  display: flex;
  gap: 0.35rem;
  flex-wrap: wrap;
}

.btn-preset {
  background: #F1F5F9;
  border: 1px solid #CBD5E1;
  color: #334155;
  font-size: 0.74rem;
  font-weight: 600;
  padding: 0.25rem 0.55rem;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-preset:hover {
  background: #E2E8F0;
  color: #0F172A;
  border-color: #94A3B8;
}

.btn-preset-auto {
  background: #EFF6FF;
  border-color: #BFDBFE;
  color: #1D4ED8;
}

.btn-preset-auto:hover {
  background: #DBEAFE;
  border-color: #93C5FD;
}

.bloom-cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 0.85rem;
}

.bloom-level-card {
  background: #FFFFFF;
  border: 1.5px solid #E2E8F0;
  border-radius: 10px;
  padding: 0.85rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  transition: all 0.2s ease;
}

.bloom-level-card.bloom-card-active {
  border-color: var(--level-color, #0284C7);
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.04);
}

.bloom-level-card.bloom-card-inactive {
  background: #F8FAFC;
  opacity: 0.65;
  border-color: #E2E8F0;
}

.bloom-card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.bloom-toggle-wrap {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  cursor: pointer;
}

.bloom-toggle-wrap input[type="checkbox"] {
  width: 16px;
  height: 16px;
  accent-color: var(--level-color, #0284C7);
  cursor: pointer;
}

.bloom-level-icon {
  font-size: 1.05rem;
}

.bloom-level-name {
  font-size: 0.86rem;
  font-weight: 700;
  color: #0F172A;
}

.bloom-count-pill {
  font-size: 0.72rem;
  font-weight: 700;
  background: #F1F5F9;
  color: #0F172A;
  padding: 0.15rem 0.45rem;
  border-radius: 6px;
  border: 1px solid #CBD5E1;
}

.bloom-card-desc {
  font-size: 0.74rem;
  color: #64748B;
  line-height: 1.35;
}

.bloom-verb {
  color: var(--level-color, #0284C7);
}

.bloom-weight-row {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin-top: 0.25rem;
}

.bloom-slider-wrap {
  flex: 1;
  display: flex;
  align-items: center;
}

.bloom-slider {
  width: 100%;
  accent-color: var(--level-color, #0284C7);
  cursor: pointer;
}

.bloom-slider:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.bloom-input-wrap {
  display: flex;
  align-items: center;
  gap: 0.2rem;
}

.bloom-pct-input {
  width: 54px;
  padding: 0.25rem 0.35rem;
  font-size: 0.85rem;
  font-weight: 700;
  text-align: right;
  border: 1px solid #CBD5E1;
  border-radius: 6px;
  color: #0F172A;
}

.bloom-pct-input:focus {
  outline: none;
  border-color: var(--level-color, #0284C7);
}

.bloom-pct-unit {
  font-size: 0.82rem;
  font-weight: 600;
  color: #64748B;
}

/* Questions Deck Section (Placed at the bottom for review) */
.questions-deck-section {
  background: #FFFFFF;
  border: 1px solid #CBD5E1;
  border-radius: 14px;
  padding: 1.5rem;
  margin-top: 1.5rem;
  margin-bottom: 1.5rem;
}

.deck-main-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 1rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid #E2E8F0;
}

.deck-actions-toolbar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.65rem;
}

.question-generation-section {
  background: #FFFFFF;
  border: 1px solid #7DD3FC;
  border-radius: 14px;
  padding: 1.5rem;
  margin-top: 1.5rem;
  margin-bottom: 1.5rem;
  box-shadow: 0 4px 12px rgba(2, 132, 199, 0.05);
}

.q-section-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 1rem;
  margin-bottom: 1.25rem;
  border-bottom: 1px solid #E0F2FE;
  padding-bottom: 0.85rem;
}

.q-section-badge {
  font-size: 0.75rem;
  text-transform: uppercase;
  font-weight: 700;
  letter-spacing: 0.05em;
  color: #0284C7;
  background: #E0F2FE;
  padding: 0.2rem 0.55rem;
  border-radius: 4px;
  display: inline-block;
  margin-bottom: 0.35rem;
}

.q-section-title {
  font-size: 1.15rem;
  font-weight: 700;
  color: #0F172A;
  margin: 0;
}

.q-type-pills {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.type-pill {
  font-size: 0.78rem;
  padding: 0.25rem 0.6rem;
  border-radius: 20px;
  background: #F1F5F9;
  color: #94A3B8;
  font-weight: 600;
  border: 1px solid #E2E8F0;
}

.active-mcq {
  background: #E0F2FE;
  color: #0284C7;
  border-color: #7DD3FC;
}

.active-short {
  background: #F3E8FF;
  color: #9333EA;
  border-color: #D8B4FE;
}

.active-coding {
  background: #ECFDF5;
  color: #059669;
  border-color: #6EE7B7;
}

/* 3 Cards Grid */
.q-type-cards-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1rem;
  margin-bottom: 1.25rem;
}

.q-type-card {
  border: 1.5px solid #E2E8F0;
  background: #F8FBFF;
  border-radius: 10px;
  padding: 1rem;
  transition: all 0.2s ease;
}

.q-type-card.selected-card {
  background: #FFFFFF;
}

.mcq-theme.selected-card {
  border-color: #0284C7;
  box-shadow: 0 4px 10px rgba(2, 132, 199, 0.08);
}

.short-theme.selected-card {
  border-color: #9333EA;
  box-shadow: 0 4px 10px rgba(147, 51, 234, 0.08);
}

.coding-theme.selected-card {
  border-color: #059669;
  box-shadow: 0 4px 10px rgba(5, 150, 105, 0.08);
}

.q-card-head {
  display: flex;
  align-items: center;
  margin-bottom: 0.4rem;
}

.q-checkbox-label {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  cursor: pointer;
  width: 100%;
}

.q-checkbox {
  width: 18px;
  height: 18px;
  accent-color: #0284C7;
  cursor: pointer;
}

.q-card-title-group {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.q-card-name {
  font-size: 0.95rem;
  font-weight: 700;
  color: #1E293B;
}

.q-card-tag {
  font-size: 0.72rem;
  font-weight: 600;
  padding: 0.15rem 0.45rem;
  border-radius: 4px;
}

.badge-cyan {
  background: #E0F2FE;
  color: #0284C7;
}

.badge-purple {
  background: #F3E8FF;
  color: #9333EA;
}

.badge-emerald {
  background: #ECFDF5;
  color: #059669;
}

.badge-lang {
  background: #FEF3C7;
  color: #B45309;
  font-size: 0.72rem;
  font-weight: 700;
  padding: 0.15rem 0.45rem;
  border-radius: 4px;
  font-family: monospace;
}

.q-card-desc {
  font-size: 0.8rem;
  color: #64748B;
  line-height: 1.4;
  margin-bottom: 0.75rem;
  min-height: 2.3em;
}

.q-card-config-box {
  background: #F8FAFC;
  border: 1px solid #E2E8F0;
  border-radius: 8px;
  padding: 0.75rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  align-items: flex-end;
}

.q-config-field {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  flex: 1;
  min-width: 60px;
}

.q-config-field label {
  font-size: 0.72rem;
  font-weight: 600;
  color: #64748B;
  text-transform: uppercase;
}

.q-mini-input {
  padding: 0.35rem 0.5rem;
  font-size: 0.85rem;
  border: 1px solid #CBD5E1;
  border-radius: 6px;
  width: 100%;
}

.q-mini-select {
  padding: 0.35rem 0.4rem;
  font-size: 0.82rem;
  border: 1px solid #CBD5E1;
  border-radius: 6px;
  width: 100%;
  background: #FFFFFF;
}

.q-config-subtotal {
  width: 100%;
  font-size: 0.8rem;
  color: #475569;
  text-align: right;
  margin-top: 0.2rem;
}

.q-config-subtotal strong {
  color: #0F172A;
}

/* Ribbon */
.q-sync-ribbon {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.85rem;
  background: #F1F5F9;
  border: 1px solid #CBD5E1;
  border-radius: 8px;
  padding: 0.6rem 1rem;
  margin-bottom: 1rem;
}

.q-ribbon-left {
  display: flex;
  gap: 1.25rem;
  flex-wrap: wrap;
  font-size: 0.84rem;
  color: #475569;
}

.q-ribbon-stat strong {
  color: #0F172A;
}

.sync-btn {
  background: #0284C7;
  color: #FFFFFF;
  border: none;
  font-weight: 600;
}

.synced-tag {
  font-size: 0.82rem;
  font-weight: 600;
  color: #059669;
}

/* Toolbar */
.q-action-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.85rem;
  margin-bottom: 1.25rem;
}

.q-action-group-left {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.btn-generate {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-weight: 700;
  box-shadow: 0 4px 12px rgba(2, 132, 199, 0.2);
}

.manual-add-dropdown {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.manual-add-label {
  font-size: 0.8rem;
  color: #64748B;
  font-weight: 600;
}

.btn-chip {
  background: #FFFFFF;
  border: 1px solid #CBD5E1;
  color: #334155;
  font-size: 0.78rem;
  padding: 0.3rem 0.55rem;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-chip:hover {
  background: #E0F2FE;
  border-color: #7DD3FC;
  color: #0284C7;
}

.btn-link-action {
  background: none;
  border: none;
  color: #64748B;
  font-size: 0.82rem;
  cursor: pointer;
  text-decoration: underline;
}

.btn-link-action:hover {
  color: #0F172A;
}

/* Deck */
.questions-deck {
  border-top: 1px solid #E2E8F0;
  padding-top: 1.25rem;
}

.deck-header {
  margin-bottom: 1rem;
}

.deck-title {
  font-size: 1.05rem;
  font-weight: 700;
  color: #0F172A;
  margin: 0 0 0.2rem 0;
}

.deck-subtitle {
  font-size: 0.82rem;
  color: #64748B;
}

.empty-questions-box {
  padding: 2rem;
  text-align: center;
  border: 2px dashed #CBD5E1;
  border-radius: 10px;
  color: #64748B;
  font-size: 0.9rem;
}

.question-item-card {
  border: 1px solid #CBD5E1;
  border-radius: 10px;
  background: #FFFFFF;
  padding: 1.15rem;
  margin-bottom: 1rem;
  transition: border-color 0.2s ease;
}

.question-item-card:hover {
  border-color: #94A3B8;
}

.q-type-mcq {
  border-left: 4px solid #0284C7;
}

.q-type-short_question {
  border-left: 4px solid #9333EA;
}

.q-type-coding_question {
  border-left: 4px solid #059669;
}

.q-item-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
  gap: 0.75rem;
}

.q-item-left {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.q-number-badge {
  font-size: 0.85rem;
  font-weight: 800;
  color: #0F172A;
}

.q-type-badge {
  font-size: 0.72rem;
  font-weight: 700;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  text-transform: uppercase;
}

.q-item-right {
  display: flex;
  align-items: center;
  gap: 0.85rem;
}

.q-marks-edit {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.82rem;
  color: #475569;
}

.marks-inline-input {
  width: 50px;
  padding: 0.2rem 0.4rem;
  font-size: 0.82rem;
  border: 1px solid #CBD5E1;
  border-radius: 4px;
  text-align: center;
}

.btn-delete-q {
  background: none;
  border: none;
  color: #94A3B8;
  font-size: 1.1rem;
  cursor: pointer;
  padding: 0 0.3rem;
  line-height: 1;
}

.btn-delete-q:hover {
  color: #EF4444;
}

/* Question Card Header Controls: Editable Difficulty & Bloom */
.q-header-select-wrap {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  background: #F1F5F9;
  border: 1px solid #CBD5E1;
  border-radius: 6px;
  padding: 0.1rem 0.35rem;
}

.q-header-select-label {
  font-size: 0.72rem;
  font-weight: 700;
  color: #475569;
}

.q-header-select {
  border: none;
  background: transparent;
  font-size: 0.75rem;
  font-weight: 600;
  color: #0F172A;
  padding: 0.1rem 0.2rem;
  cursor: pointer;
  outline: none;
}

.q-select-bloom {
  color: #7C3AED;
}

/* Reorder Buttons */
.q-reorder-buttons {
  display: inline-flex;
  gap: 0.2rem;
}

.btn-reorder {
  background: #F1F5F9;
  border: 1px solid #CBD5E1;
  border-radius: 4px;
  color: #475569;
  font-size: 0.65rem;
  padding: 0.2rem 0.4rem;
  cursor: pointer;
  line-height: 1;
  transition: all 0.15s ease;
}

.btn-reorder:hover:not(:disabled) {
  background: #E2E8F0;
  color: #0F172A;
  border-color: #94A3B8;
}

.btn-reorder:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

/* MCQ Options Toolbar & Remove Option */
.mcq-options-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.35rem;
}

.mcq-count-hint {
  font-size: 0.74rem;
  color: #64748B;
}

.btn-remove-opt {
  background: none;
  border: none;
  color: #94A3B8;
  font-size: 1rem;
  cursor: pointer;
  padding: 0 0.3rem;
  line-height: 1;
  border-radius: 4px;
}

.btn-remove-opt:hover {
  color: #EF4444;
  background: #FEE2E2;
}

.mcq-actions-bar {
  margin-top: 0.4rem;
  display: flex;
  gap: 0.5rem;
}

.btn-add-opt {
  background: #F8FAFC;
  border: 1px dashed #CBD5E1;
  color: #0284C7;
  font-size: 0.76rem;
  font-weight: 600;
  padding: 0.3rem 0.65rem;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-add-opt:hover {
  background: #F0F9FF;
  border-color: #0284C7;
}

/* Bottom Add Question Button */
.deck-bottom-actions {
  display: flex;
  justify-content: center;
  padding-top: 0.5rem;
}

.btn-bottom-add {
  padding: 0.6rem 1.4rem;
  font-size: 0.88rem;
  font-weight: 600;
  border-radius: 8px;
}

.q-field-label {
  display: block;
  font-size: 0.78rem;
  font-weight: 600;
  color: #475569;
  margin-bottom: 0.3rem;
}

.q-prompt-box {
  margin-bottom: 0.85rem;
}

.q-prompt-input {
  font-size: 0.9rem;
  line-height: 1.45;
  resize: vertical;
}

/* MCQ Options */
.mcq-options-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 0.5rem;
  margin-bottom: 0.6rem;
}

.mcq-option-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  background: #F8FAFC;
  border: 1px solid #E2E8F0;
  border-radius: 6px;
  padding: 0.35rem 0.6rem;
}

.mcq-radio-wrap {
  display: flex;
  align-items: center;
  cursor: pointer;
}

.mcq-option-input {
  border: none !important;
  background: transparent !important;
  padding: 0.2rem 0.4rem !important;
  font-size: 0.84rem;
  width: 100%;
}

.correct-badge {
  font-size: 0.7rem;
  font-weight: 700;
  color: #059669;
  white-space: nowrap;
}

.q-explanation-box {
  margin-top: 0.5rem;
}

.explanation-input {
  font-size: 0.82rem;
  padding: 0.35rem 0.6rem;
}

/* Short Question */
.short-fields-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.85rem;
}

@media (max-width: 640px) {
  .short-fields-grid {
    grid-template-columns: 1fr;
  }
}

.short-answer-input,
.rubric-input {
  font-size: 0.84rem;
  line-height: 1.4;
}

/* Coding Question */
.coding-fields-grid {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.code-editor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.3rem;
}

.lang-selector-mini {
  padding: 0.2rem 0.5rem;
  font-size: 0.78rem;
  font-weight: 600;
  border: 1px solid #CBD5E1;
  border-radius: 4px;
  background: #FFFFFF;
}

.code-font {
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 0.84rem;
}

.code-textarea {
  background: #0F172A;
  color: #38BDF8;
  border-radius: 6px;
  line-height: 1.45;
}

.io-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.85rem;
  margin-bottom: 0.5rem;
}

.io-input {
  padding: 0.35rem 0.6rem;
  font-size: 0.82rem;
}

.solution-toggle-box {
  background: #F1F5F9;
  border-radius: 6px;
  padding: 0.4rem 0.6rem;
}

.code-summary {
  font-size: 0.78rem;
  font-weight: 600;
  color: #0284C7;
  cursor: pointer;
}

.solution-preview {
  margin-top: 0.4rem;
  background: #1E293B;
  color: #F8FAFC;
  padding: 0.6rem;
  border-radius: 4px;
  font-size: 0.8rem;
  overflow-x: auto;
}

/* Registry Filter Bar */
.registry-filter-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: flex-end;
  background: #F8FAFC;
  padding: 0.85rem;
  border-radius: 8px;
  border: 1px solid #E2E8F0;
  margin-bottom: 0.75rem;
}

.filter-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  flex: 1;
  min-width: 140px;
}

.search-field {
  min-width: 220px;
  flex: 2;
}

.filter-label {
  font-size: 0.72rem;
  font-weight: 700;
  color: #475569;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.search-input-wrap {
  position: relative;
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 0.6rem;
  font-size: 0.85rem;
  color: #94A3B8;
  pointer-events: none;
}

.filter-input {
  width: 100%;
  padding: 0.45rem 1.8rem 0.45rem 2rem;
  font-size: 0.82rem;
  border: 1px solid #CBD5E1;
  border-radius: 6px;
  background: #FFFFFF;
}

.search-clear-btn {
  position: absolute;
  right: 0.5rem;
  border: none;
  background: transparent;
  color: #94A3B8;
  cursor: pointer;
  font-size: 0.75rem;
}

.filter-select {
  width: 100%;
  padding: 0.45rem 0.6rem;
  font-size: 0.82rem;
  border: 1px solid #CBD5E1;
  border-radius: 6px;
  background: #FFFFFF;
  color: #1E293B;
}

.filter-reset-wrap {
  display: flex;
  align-items: flex-end;
}

.filter-reset-btn {
  white-space: nowrap;
}

.filter-results-counter {
  font-size: 0.78rem;
  color: #64748B;
  margin-bottom: 0.6rem;
}

.title-cell-wrap {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.2rem;
}

.assessment-main-title {
  color: #0F172A;
  font-size: 0.88rem;
}

.rename-pencil-btn {
  font-size: 0.72rem;
  color: #0284C7;
  background: transparent;
  border: none;
  padding: 0;
  cursor: pointer;
  text-decoration: underline;
}

.rename-pencil-btn:hover {
  color: #0369A1;
}

.badge-purple {
  background: #F3E8FF;
  color: #7E22CE;
}

.badge-danger {
  background: #FFE4E6;
  color: #BE123C;
}

/* Student Simulation Modal */
.student-preview-backdrop {
  z-index: 1000;
  background: rgba(15, 23, 42, 0.75);
}

.student-preview-modal-card {
  max-width: 900px;
  width: 95%;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 0;
  background: #FFFFFF;
  border-radius: 12px;
}

.student-exam-top-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #0F172A;
  color: #FFFFFF;
  padding: 0.85rem 1.25rem;
  border-top-left-radius: 12px;
  border-top-right-radius: 12px;
}

.student-identity-tag {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.student-avatar-sim {
  font-size: 1.5rem;
  background: #1E293B;
  padding: 0.3rem;
  border-radius: 50%;
}

.student-sim-label {
  font-size: 0.65rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  color: #38BDF8;
}

.student-sim-name {
  font-size: 0.84rem;
  font-weight: 600;
  color: #F8FAFC;
}

.student-timer-box {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  background: #1E293B;
  padding: 0.35rem 0.75rem;
  border-radius: 8px;
  border: 1px solid #334155;
}

.timer-countdown {
  font-family: 'Consolas', monospace;
  font-size: 1rem;
  font-weight: 700;
  color: #F59E0B;
}

.timer-sub {
  font-size: 0.65rem;
  color: #94A3B8;
  display: block;
}

.exam-paper-header {
  padding: 1rem 1.25rem 0.75rem;
  border-bottom: 1px solid #E2E8F0;
  background: #F8FAFC;
}

.exam-paper-title {
  font-size: 1.2rem;
  font-weight: 800;
  color: #0F172A;
  margin: 0 0 0.4rem;
}

.exam-paper-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.meta-pill {
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.2rem 0.55rem;
  border-radius: 20px;
  background: #E2E8F0;
  color: #334155;
}

.grading-overlay-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.76rem;
  font-weight: 700;
  color: #92400E;
  background: #FEF3C7;
  padding: 0.3rem 0.7rem;
  border-radius: 6px;
  margin-top: 0.5rem;
  border: 1px solid #FCD34D;
}

.exam-instructions-banner {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  padding: 0.6rem 1.25rem;
  background: #EFF6FF;
  border-bottom: 1px solid #DBEAFE;
  font-size: 0.78rem;
  color: #1E40AF;
}

.student-questions-flow {
  flex: 1;
  overflow-y: auto;
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  background: #F1F5F9;
}

.student-question-card {
  background: #FFFFFF;
  border-radius: 8px;
  padding: 1.1rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  border: 1px solid #E2E8F0;
}

.sq-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.sq-badge {
  font-size: 0.78rem;
  font-weight: 800;
  background: #0F172A;
  color: #FFFFFF;
  padding: 0.2rem 0.55rem;
  border-radius: 4px;
}

.sq-type-badge {
  font-size: 0.72rem;
  font-weight: 700;
  padding: 0.15rem 0.45rem;
  border-radius: 4px;
  text-transform: uppercase;
}

.sq-type-mcq { background: #E0F2FE; color: #0369A1; }
.sq-type-short { background: #F3E8FF; color: #7E22CE; }
.sq-type-code { background: #DCFCE7; color: #15803D; }

.sq-lang-tag {
  font-size: 0.72rem;
  font-family: monospace;
  font-weight: 700;
  background: #FEF3C7;
  color: #92400E;
  padding: 0.15rem 0.4rem;
  border-radius: 4px;
}

.sq-marks-pill {
  font-size: 0.76rem;
  font-weight: 700;
  color: #475569;
  background: #F8FAFC;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
  border: 1px solid #E2E8F0;
}

.sq-prompt {
  font-size: 0.95rem;
  font-weight: 600;
  color: #1E293B;
  line-height: 1.45;
  margin-bottom: 0.85rem;
}

/* MCQ Test UI */
.sq-mcq-options-container {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.sq-mcq-option-label {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.6rem 0.85rem;
  border: 1px solid #E2E8F0;
  border-radius: 6px;
  background: #FFFFFF;
  cursor: pointer;
  transition: all 0.15s ease;
}

.sq-mcq-option-label:hover {
  background: #F8FAFC;
  border-color: #CBD5E1;
}

.sq-option-selected {
  background: #EFF6FF !important;
  border-color: #3B82F6 !important;
}

.sq-option-correct-key {
  border-color: #10B981 !important;
  background: #ECFDF5 !important;
}

.sq-opt-letter {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #E2E8F0;
  color: #334155;
  font-size: 0.75rem;
  font-weight: 800;
}

.sq-option-selected .sq-opt-letter {
  background: #3B82F6;
  color: #FFFFFF;
}

.sq-key-badge {
  margin-left: auto;
  font-size: 0.7rem;
  font-weight: 800;
  color: #047857;
  background: #D1FAE5;
  padding: 0.15rem 0.45rem;
  border-radius: 4px;
}

.teacher-key-explanation-box,
.teacher-short-overlay-box,
.teacher-code-overlay-box {
  margin-top: 0.75rem;
  padding: 0.75rem;
  background: #FEF3C7;
  border-radius: 6px;
  border: 1px solid #FCD34D;
  font-size: 0.8rem;
}

.t-key-title {
  font-weight: 800;
  color: #92400E;
  margin-bottom: 0.25rem;
}

.t-key-text {
  color: #78350F;
  margin: 0;
  line-height: 1.4;
}

.t-overlay-section {
  margin-bottom: 0.5rem;
}

.t-overlay-section:last-child {
  margin-bottom: 0;
}

.t-overlay-label {
  font-weight: 800;
  color: #78350F;
  display: block;
  margin-bottom: 0.2rem;
}

.t-overlay-body {
  color: #451A03;
  line-height: 1.4;
}

.t-rubric-body {
  font-size: 0.76rem;
  background: #FFFBEB;
  padding: 0.4rem;
  border-radius: 4px;
  border: 1px dashed #F59E0B;
}

/* Short Question Test UI */
.sq-short-container {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.sq-input-label {
  font-size: 0.78rem;
  font-weight: 700;
  color: #475569;
}

.sq-textarea {
  width: 100%;
  border: 1px solid #CBD5E1;
  border-radius: 6px;
  padding: 0.6rem;
  font-size: 0.85rem;
  font-family: inherit;
  resize: vertical;
}

.sq-textarea:focus {
  outline: none;
  border-color: #3B82F6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.15);
}

.sq-textarea-footer {
  display: flex;
  justify-content: flex-end;
}

/* Coding Question Test UI */
.sq-code-container {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.sq-code-bar {
  background: #1E293B;
  color: #94A3B8;
  font-size: 0.72rem;
  font-weight: 700;
  padding: 0.35rem 0.65rem;
  border-top-left-radius: 6px;
  border-top-right-radius: 6px;
  text-transform: uppercase;
}

.sq-code-pre {
  margin: 0;
  padding: 0.75rem;
  background: #0F172A;
  color: #38BDF8;
  font-family: 'Consolas', monospace;
  font-size: 0.82rem;
  border-bottom-left-radius: 6px;
  border-bottom-right-radius: 6px;
  overflow-x: auto;
}

.sq-sample-io-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.6rem;
}

.sq-io-box {
  background: #F8FAFC;
  border: 1px solid #E2E8F0;
  border-radius: 6px;
  padding: 0.5rem;
}

.sq-io-label {
  font-size: 0.68rem;
  font-weight: 800;
  text-transform: uppercase;
  color: #64748B;
  display: block;
}

.sq-io-code {
  margin: 0.2rem 0 0;
  font-family: monospace;
  font-size: 0.78rem;
  color: #0F172A;
  white-space: pre-wrap;
}

.sq-code-textarea {
  width: 100%;
  background: #0F172A;
  color: #A7F3D0;
  border: 1px solid #334155;
  border-bottom-left-radius: 6px;
  border-bottom-right-radius: 6px;
  padding: 0.75rem;
  font-family: 'Consolas', monospace;
  font-size: 0.85rem;
  resize: vertical;
}

.sq-solution-pre {
  margin: 0;
  padding: 0.6rem;
  background: #064E3B;
  color: #6EE7B7;
  font-family: monospace;
  font-size: 0.8rem;
  border-radius: 4px;
}

.student-preview-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.85rem 1.25rem;
  background: #F8FAFC;
  border-top: 1px solid #E2E8F0;
}

.footer-note {
  font-size: 0.76rem;
  color: #64748B;
}

/* Danger Modal for Attempts Warning */
.modal-danger-card {
  border-top: 4px solid #DC2626;
}

.modal-danger-header {
  border-bottom: 1px solid #FEE2E2;
}

.warning-large-icon {
  font-size: 1.8rem;
}

.text-danger {
  color: #DC2626;
}

.text-danger-sub {
  color: #991B1B;
}

.danger-callout-box {
  background: #FEF2F2;
  border: 1px solid #FCA5A5;
  border-radius: 8px;
  padding: 0.85rem;
}

.danger-confirm-checkbox {
  background: #FFF1F2;
  border: 1px solid #FECDD3;
  padding: 0.6rem;
  border-radius: 6px;
}

@media (max-width: 768px) {
  .form-row-2,
  .form-row-3 {
    grid-template-columns: 1fr;
  }
}

/* ═══ EXPORT MODAL ═══ */
.btn-export-trigger {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 8px 16px; border-radius: 8px; border: 1.5px solid #3b82f6;
  background: #eff6ff; color: #1d4ed8; font-weight: 600; cursor: pointer;
  transition: all .2s;
}
.btn-export-trigger:hover { background: #3b82f6; color: #fff; }

.export-modal-backdrop {
  position: fixed; inset: 0; background: rgba(15,23,42,.55);
  backdrop-filter: blur(4px); z-index: 2100;
  display: flex; align-items: center; justify-content: center; padding: 20px;
}
.export-modal-card {
  background: #fff; border-radius: 20px; width: 100%; max-width: 860px;
  max-height: 90vh; overflow-y: auto;
  box-shadow: 0 25px 60px rgba(15,23,42,.35);
  display: flex; flex-direction: column; gap: 0;
}
.export-modal-header {
  display: flex; align-items: flex-start; gap: 14px; padding: 28px 28px 20px;
  border-bottom: 1px solid #e2e8f0; position: sticky; top: 0;
  background: #fff; border-radius: 20px 20px 0 0; z-index: 1;
}
.export-modal-icon { font-size: 2rem; }
.export-modal-title { font-size: 1.3rem; font-weight: 700; color: #0f172a; margin: 0; }
.export-modal-sub { font-size: .85rem; color: #64748b; margin: 2px 0 0; }
.export-modal-close {
  margin-left: auto; background: #f1f5f9; border: none; border-radius: 8px;
  width: 36px; height: 36px; cursor: pointer; font-size: 1rem;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}
.export-modal-close:hover { background: #fee2e2; color: #dc2626; }

.export-alert { padding: 12px 20px; margin: 0 28px; border-radius: 10px; font-size: .88rem; font-weight: 500; }
.export-alert-error { background: #fef2f2; color: #dc2626; border: 1px solid #fecaca; margin-top: 12px; }
.export-alert-success { background: #f0fdf4; color: #16a34a; border: 1px solid #bbf7d0; margin-top: 12px; }

.export-formats-grid {
  display: grid; grid-template-columns: 1fr 1fr; gap: 16px; padding: 20px 28px;
}
@media (max-width: 640px) { .export-formats-grid { grid-template-columns: 1fr; } }

.export-format-card {
  border: 1.5px solid #e2e8f0; border-radius: 14px; padding: 18px;
  display: flex; flex-direction: column; gap: 10px;
  transition: border-color .2s, box-shadow .2s;
}
.export-format-card:hover { border-color: #94a3b8; box-shadow: 0 4px 16px rgba(0,0,0,.07); }
.export-format-icon { font-size: 2rem; }
.export-format-info h3 { font-size: .95rem; font-weight: 700; color: #0f172a; margin: 0 0 4px; }
.export-format-info p { font-size: .82rem; color: #64748b; margin: 0; line-height: 1.5; }
.export-answer-key-toggle {
  display: flex; align-items: center; gap: 7px; margin-top: 8px;
  font-size: .82rem; font-weight: 600; color: #374151; cursor: pointer;
}
.export-answer-key-toggle input { accent-color: #3b82f6; width: 15px; height: 15px; }

.export-format-btn {
  padding: 9px 16px; border-radius: 9px; border: none; font-weight: 600;
  font-size: .85rem; cursor: pointer; transition: all .2s; margin-top: auto;
}
.export-format-btn:disabled { opacity: .6; cursor: not-allowed; }
.gdoc-btn   { background: #4285f4; color: #fff; }
.gdoc-btn:hover:not(:disabled)   { background: #1a73e8; }
.moodle-btn { background: #f97316; color: #fff; }
.moodle-btn:hover:not(:disabled) { background: #ea6500; }
.gforms-btn { background: #34a853; color: #fff; }
.gforms-btn:hover:not(:disabled) { background: #2d9142; }
.pdf-btn    { background: #dc2626; color: #fff; }
.pdf-btn:hover:not(:disabled)    { background: #b91c1c; }

.export-format-hint { font-size: .75rem; color: #94a3b8; font-style: italic; }
.export-spinner { animation: spin 1s linear infinite; display: inline-block; }
@keyframes spin { to { transform: rotate(360deg); } }

/* ── Export History ── */
.export-history-section { padding: 0 28px 28px; border-top: 1px solid #e2e8f0; margin-top: 4px; }
.export-history-header { display: flex; align-items: center; justify-content: space-between; padding: 18px 0 12px; }
.export-history-header h3 { font-size: 1rem; font-weight: 700; color: #0f172a; margin: 0; }
.export-refresh-btn { background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 7px; padding: 6px 12px; cursor: pointer; font-size: .82rem; }
.export-refresh-btn:hover { background: #e2e8f0; }
.export-history-loading, .export-history-empty { text-align: center; color: #94a3b8; padding: 24px 0; font-size: .88rem; }
.export-history-list { display: flex; flex-direction: column; gap: 8px; }
.export-history-item {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 14px; border: 1px solid #e2e8f0; border-radius: 10px;
  background: #f8fafc;
}
.export-history-icon { font-size: 1.4rem; flex-shrink: 0; }
.export-history-info { flex: 1; min-width: 0; }
.export-history-name { font-size: .88rem; font-weight: 600; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.export-history-meta { font-size: .75rem; color: #94a3b8; margin-top: 2px; }
.exp-badge-key { background: #fef3c7; color: #d97706; border-radius: 4px; padding: 1px 5px; font-size: .72rem; font-weight: 600; }
.export-history-delete { background: none; border: none; cursor: pointer; font-size: 1rem; opacity: .4; padding: 4px; border-radius: 6px; }
.export-history-delete:hover { opacity: 1; background: #fee2e2; }
</style>
