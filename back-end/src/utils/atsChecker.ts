const REQUIRED_SECTIONS = [
  { name: 'Contact Information', patterns: [/email|e-mail|phone|mobile|github|linkedin/i] },
  { name: 'Professional Summary', patterns: [/summary|profile|about me|objective/i] },
  { name: 'Work Experience', patterns: [/experience|employment|work history|professional background/i] },
  { name: 'Education', patterns: [/education|academic|degree|university|college/i] },
  { name: 'Skills', patterns: [/skills|technologies|technical skills|competencies/i] },
];

const ACTION_VERBS = [
  'achieved', 'accelerated', 'acquired', 'adapted', 'addressed', 'administered',
  'advanced', 'analyzed', 'applied', 'architected', 'assembled', 'audited',
  'authored', 'automated', 'built', 'calculated', 'catalyzed', 'chaired',
  'championed', 'clarified', 'classified', 'coached', 'collaborated', 'compiled',
  'completed', 'composed', 'conceived', 'conducted', 'configured', 'consolidated',
  'constructed', 'consulted', 'converted', 'coordinated', 'created', 'cultivated',
  'customized', 'debugged', 'decreased', 'defined', 'delegated', 'delivered',
  'demonstrated', 'deployed', 'designed', 'detailed', 'determined', 'developed',
  'devised', 'diagnosed', 'directed', 'discovered', 'documented', 'doubled',
  'drove', 'earned', 'edited', 'educated', 'eliminated', 'enabled', 'encouraged',
  'engineered', 'enhanced', 'established', 'evaluated', 'examined', 'executed',
  'expanded', 'expedited', 'extracted', 'facilitated', 'fashioned', 'filed',
  'finalized', 'forecasted', 'formulated', 'fortified', 'founded', 'generated',
  'governed', 'grew', 'guided', 'hired', 'identified', 'illustrated', 'implemented',
  'improved', 'improvised', 'increased', 'influenced', 'informed', 'initiated',
  'innovated', 'instituted', 'integrated', 'introduced', 'invented', 'investigated',
  'launched', 'lead', 'led', 'leveraged', 'maintained', 'managed', 'marketed',
  'mentored', 'merged', 'met', 'migrated', 'minimized', 'modelled', 'modified',
  'monitored', 'motivated', 'navigated', 'negotiated', 'nurtured', 'optimized',
  'orchestrated', 'organized', 'outlined', 'overhauled', 'oversaw', 'performed',
  'pioneered', 'planned', 'prepared', 'presented', 'prevented', 'produced',
  'programmed', 'progressed', 'projected', 'promoted', 'proposed', 'protected',
  'provided', 'published', 'purchased', 'pursued', 'qualified', 'raised',
  'recommended', 'reconciled', 'recorded', 'recruited', 'redesigned', 'reduced',
  'reengineered', 'refactored', 'reorganized', 'repaired', 'replaced', 'reported',
  'represented', 'researched', 'resolved', 'responded', 'restored', 'restructured',
  'retained', 'retrieved', 'revamped', 'reviewed', 'revised', 'revitalized',
  'saved', 'scheduled', 'secured', 'selected', 'served', 'simplified', 'sold',
  'solved', 'spearheaded', 'stabilized', 'standardized', 'started', 'stimulated',
  'streamlined', 'strengthened', 'structured', 'succeeded', 'suggested', 'summarized',
  'supervised', 'supported', 'surpassed', 'surveyed', 'systematized', 'targeted',
  'trained', 'transformed', 'trimmed', 'tripled', 'troubleshooted', 'tutored',
  'uncovered', 'undertook', 'unified', 'upgraded', 'validated', 'vendored',
  'visualized', 'won', 'wrote',
];

const QUANTIFIED_PATTERN = /\b(\d+[%x]|\d{2,})\b/;

interface ATSRuleResult {
  rule: string;
  passed: boolean;
  score: number;
  maxScore: number;
  details: string;
}

interface ATSSectionBreakdown {
  category: string;
  rules: ATSRuleResult[];
}

export interface ATSResult {
  overallScore: number;
  maxScore: number;
  percentage: number;
  sections: ATSSectionBreakdown[];
  recommendations: string[];
  keywordGaps?: string[];
}

function countOccurrences(text: string, patterns: RegExp[]): number {
  let count = 0;
  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (matches) count += matches.length;
  }
  return count;
}

export function cvDataToText(cvData: Record<string, unknown>): string {
  const parts: string[] = [];

  if (cvData.first_name || cvData.last_name) {
    parts.push(`Name: ${cvData.first_name || ''} ${cvData.last_name || ''}`);
  }
  if (cvData.title) parts.push(`Title: ${cvData.title}`);
  if (cvData.summary) parts.push(`Summary: ${cvData.summary}`);

  if (cvData.contact && typeof cvData.contact === 'object') {
    const c = cvData.contact as Record<string, unknown>;
    if (c.email) parts.push(`Email: ${c.email}`);
    if (c.phone) parts.push(`Phone: ${c.phone}`);
    if (c.location) parts.push(`Location: ${c.location}`);
  }

  if (Array.isArray(cvData.education)) {
    parts.push('Education:');
    for (const edu of cvData.education) {
      const e = edu as Record<string, unknown>;
      parts.push(`- ${e.degree || ''} ${e.field || ''} at ${e.institution || ''} (${e.start_date || ''} - ${e.end_date || ''})`);
    }
  }

  if (Array.isArray(cvData.experience)) {
    parts.push('Experience:');
    for (const exp of cvData.experience) {
      const e = exp as Record<string, unknown>;
      parts.push(`- ${e.title || ''} at ${e.company || ''}, ${e.location || ''} (${e.start_date || ''} - ${e.end_date || ''})`);
      if (e.summary) parts.push(`  Summary: ${e.summary}`);
      if (Array.isArray(e.description)) {
        for (const d of e.description) {
          if (d) parts.push(`  - ${d}`);
        }
      }
    }
  }

  if (Array.isArray(cvData.projects)) {
    parts.push('Projects:');
    for (const proj of cvData.projects) {
      const p = proj as Record<string, unknown>;
      parts.push(`- ${p.project_name || ''} (${p.organization || ''})`);
      if (p.description) parts.push(`  ${p.description}`);
      if (Array.isArray(p.technologies)) parts.push(`  Technologies: ${p.technologies.join(', ')}`);
    }
  }

  if (Array.isArray(cvData.skills)) {
    parts.push('Skills:');
    for (const skill of cvData.skills) {
      const s = skill as Record<string, unknown>;
      const skillList = Array.isArray(s.skills) ? (s.skills as string[]).join(', ') : '';
      parts.push(`- ${s.category || ''}: ${skillList}`);
    }
  }

  if (Array.isArray(cvData.certifications)) {
    parts.push('Certifications:');
    for (const cert of cvData.certifications) {
      const c = cert as Record<string, unknown>;
      parts.push(`- ${c.name || ''} (${c.issuer || ''})`);
    }
  }

  if (Array.isArray(cvData.languages_spoken)) {
    parts.push('Languages:');
    for (const lang of cvData.languages_spoken) {
      const l = typeof lang === 'string' ? { language: lang } : lang as Record<string, unknown>;
      parts.push(`- ${l.language || l.name || ''} (${l.level || ''})`);
    }
  }

  return parts.join('\n');
}

export function checkATSRules(content: string, jobDescription?: string): ATSResult {
  const sections: ATSSectionBreakdown[] = [];
  const recommendations: string[] = [];
  let totalScore = 0;
  let totalMaxScore = 0;

  // 1. Required Sections Check
  const sectionRules: ATSRuleResult[] = [];
  let foundSections = 0;
  for (const section of REQUIRED_SECTIONS) {
    const passed = section.patterns.some((p) => p.test(content));
    if (passed) foundSections++;
    sectionRules.push({
      rule: `Section: ${section.name}`,
      passed,
      score: passed ? 15 : 0,
      maxScore: 15,
      details: passed ? `Found` : `Missing — add a "${section.name}" section`,
    });
  }
  if (foundSections < REQUIRED_SECTIONS.length) {
    const missing = REQUIRED_SECTIONS
      .filter((s) => !s.patterns.some((p) => p.test(content)))
      .map((s) => s.name);
    recommendations.push(`Add missing sections: ${missing.join(', ')}`);
  }
  sections.push({ category: 'Required Sections', rules: sectionRules });

  // 2. Action Verbs
  const verbMatches = content.match(new RegExp(`\\b(${ACTION_VERBS.join('|')})\\b`, 'gi'));
  const verbCount = verbMatches ? verbMatches.length : 0;
  const verbScore = Math.min(verbCount * 2, 20);
  const verbRule: ATSRuleResult = {
    rule: 'Action Verbs',
    passed: verbCount >= 5,
    score: verbScore,
    maxScore: 20,
    details: verbCount >= 5
      ? `Found ${verbCount} action verbs — good`
      : `Only ${verbCount} action verbs — aim for at least 5`,
  };
  if (verbCount < 5) recommendations.push(`Use more action verbs (found ${verbCount}, aim for 5+)`);
  sections.push({ category: 'Language Quality', rules: [verbRule] });

  // 3. Quantified Achievements
  const quantifiedMatches = content.match(QUANTIFIED_PATTERN);
  const hasQuantified = !!quantifiedMatches;
  const qRule: ATSRuleResult = {
    rule: 'Quantified Achievements',
    passed: hasQuantified,
    score: hasQuantified ? 20 : 0,
    maxScore: 20,
    details: hasQuantified
      ? 'Found quantified metrics — excellent for ATS'
      : 'No quantified achievements — add numbers, percentages, or metrics',
  };
  if (!hasQuantified) recommendations.push('Add quantified achievements (%, $$, numbers) to strengthen impact');
  sections.push({ category: 'Content Quality', rules: [qRule] });

  // 4. Keyword Match vs Job Description
  if (jobDescription && jobDescription.trim()) {
    const cvWords = new Set(content.toLowerCase().match(/\b[a-z]{3,}\b/g) || []);
    const jdWords = new Set<string>(jobDescription.toLowerCase().match(/\b[a-z]{3,}\b/g) || []);

    const techKeywords = ['react', 'angular', 'vue', 'node', 'python', 'java', 'aws', 'docker',
      'kubernetes', 'sql', 'typescript', 'javascript', 'api', 'rest', 'graphql', 'mongodb',
      'postgresql', 'redis', 'git', 'ci/cd', 'terraform', 'linux', 'agile', 'scrum',
    ];

    const missingKeywords: string[] = [];
    for (const kw of techKeywords) {
      if (jdWords.has(kw) && !cvWords.has(kw)) {
        missingKeywords.push(kw);
      }
    }

    const jdUniqueWords = new Set<string>();
    for (const w of jdWords) {
      if (!cvWords.has(w) && w.length > 3) jdUniqueWords.add(w as string);
    }

    const keywordScore = Math.max(0, 20 - missingKeywords.length * 3);
    const kwRule: ATSRuleResult = {
      rule: 'Keyword Match with Job Description',
      passed: missingKeywords.length <= 2,
      score: keywordScore,
      maxScore: 20,
      details: missingKeywords.length === 0
        ? 'All key tech keywords matched'
        : `Missing keywords: ${missingKeywords.join(', ') || 'none detected'}`,
    };
    if (missingKeywords.length > 0) {
      recommendations.push(`Add missing keywords to align with job: ${missingKeywords.join(', ')}`);
    }
    sections.push({ category: 'Job Description Alignment', rules: [kwRule] });
  }

  // 5. Length Check
  const wordCount = content.split(/\s+/).length;
  const optimalLength = wordCount >= 300 && wordCount <= 1200;
  const lengthRule: ATSRuleResult = {
    rule: 'CV Length',
    passed: optimalLength,
    score: optimalLength ? 10 : wordCount < 300 ? 3 : 5,
    maxScore: 10,
    details: optimalLength
      ? `${wordCount} words — optimal length`
      : wordCount < 300
        ? `Too short (${wordCount} words) — aim for 300-1200`
        : `Too long (${wordCount} words) — consider trimming below 1200`,
  };
  if (!optimalLength) {
    recommendations.push(wordCount < 300 ? 'CV is too short — add more details' : 'CV is too long — trim to under 1200 words');
  }
  sections.push({ category: 'Formatting', rules: [lengthRule] });

  // 6. Spelling basics — common typos
  const COMMON_TYPOS = [
    /\bmanger\b/i, /\bteh\b/i, /\brecieve\b/i, /\bacheive\b/i,
    /\bdefinately\b/i, /\bseperate\b/i, /\boccured\b/i, /\bu?til(?!ity)/i,
  ];
  const typoMatches: string[] = [];
  for (const typo of COMMON_TYPOS) {
    const m = content.match(typo);
    if (m) typoMatches.push(m[0]);
  }
  const spellRule: ATSRuleResult = {
    rule: 'Spelling',
    passed: typoMatches.length === 0,
    score: typoMatches.length === 0 ? 10 : Math.max(0, 10 - typoMatches.length * 3),
    maxScore: 10,
    details: typoMatches.length === 0
      ? 'No common typos detected'
      : `Possible typos found: ${typoMatches.join(', ')}`,
  };
  if (typoMatches.length > 0) recommendations.push(`Fix possible typos: ${typoMatches.join(', ')}`);
  sections.push({ category: 'Formatting', rules: [spellRule] });

  // Compile totals
  for (const section of sections) {
    for (const rule of section.rules) {
      totalScore += rule.score;
      totalMaxScore += rule.maxScore;
    }
  }

  const percentage = totalMaxScore > 0 ? Math.round((totalScore / totalMaxScore) * 100) : 0;

  return {
    overallScore: totalScore,
    maxScore: totalMaxScore,
    percentage,
    sections,
    recommendations,
  };
}
