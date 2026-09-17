import { Request, Response } from 'express';

interface KeywordEntry {
  keyword: string;
  category: string;
  count: number;
  density: number;
  status: 'optimal' | 'under-represented' | 'missing' | 'over-represented';
  color: string;
  suggestedCount: number;
  reason: string;
}

interface KeywordDensityResult {
  overallScore: number;
  totalKeywords: number;
  matchedCount: number;
  missingCount: number;
  overRepresentedCount: number;
  underRepresentedCount: number;
  keywords: KeywordEntry[];
  categories: Record<string, { total: number; matched: number; missing: number; overRepresented: number }>;
  jobDescription: string;
  cvTextLength: number;
  analysisTimestamp: string;
}

const TECH_PREFIXES = [
  'python', 'javascript', 'typescript', 'java', 'react', 'angular', 'vue', 'node', 'django',
  'flask', 'spring', 'dotnet', 'csharp', 'go', 'rust', 'ruby', 'php', 'swift', 'kotlin',
  'scala', 'sql', 'nosql', 'mongodb', 'postgresql', 'mysql', 'redis', 'elasticsearch',
  'graphql', 'rest', 'api', 'docker', 'kubernetes', 'k8s', 'aws', 'azure', 'gcp',
  'terraform', 'ansible', 'jenkins', 'git', 'linux', 'bash', 'html', 'css', 'sass',
  'less', 'webpack', 'vite', 'npm', 'yarn', 'junit', 'pytest', 'selenium', 'cypress',
  'postman', 'gitlab', 'github', 'jira', 'agile', 'scrum', 'kanban', 'machine learning',
  'ml', 'ai', 'deep learning', 'nlp', 'computer vision', 'data science', 'data analysis',
  'etl', 'pipeline', 'cloud', 'serverless', 'microservices', 'frontend', 'backend',
  'fullstack', 'devops', 'sre', 'security', 'cybersecurity', 'encryption', 'authentication',
  'authorization', 'oauth', 'jwt', 'tcp', 'http', 'websocket', 'tailwind', 'bootstrap',
  'storybook', 'figma', 'adobe', 'photoshop', 'sketch', 'slack', 'discord', 'teams',
  'zoom', 'google', 'excel', 'salesforce', 'hubspot', 'crm', 'erp', 'sap', 'recruitment',
  'hiring', 'talent', 'hr', 'blockchain', 'iot', 'robotics', 'ar', 'vr', 'web3',
];

const SOFT_PREFIXES = [
  'leadership', 'communication', 'teamwork', 'collaboration', 'problem-solving',
  'critical-thinking', 'time-management', 'organization', 'attention-to-detail',
  'creativity', 'innovation', 'adaptability', 'flexibility', 'motivation', 'initiative',
  'responsibility', 'accountability', 'reliability', 'integrity', 'professionalism',
  'work ethic', 'self-starter', 'independent', 'autonomous', 'proactive', 'strategic',
  'analytical', 'detail-oriented', 'results-oriented', 'goal-oriented', 'customer-focused',
  'client-facing', 'stakeholder', 'cross-functional', 'diverse', 'inclusive', 'culture',
  'values', 'passion', 'excellence', 'quality', 'continuous', 'improvement', 'learning',
  'growth', 'development', 'mentorship', 'coaching', 'feedback', 'negotiation',
  'persuasion', 'influence', 'management', 'supervision', 'oversight', 'governance',
  'compliance', 'ethics', 'transparency', 'ownership', 'engagement', 'satisfaction',
  'experience', 'presentation', 'public', 'speaking', 'writing', 'documentation',
];

function extractKeywordsFromJD(jobDescription: string): { keyword: string; count: number }[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
    'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been', 'be', 'have', 'has', 'had',
    'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'shall',
    'can', 'it', 'its', 'this', 'that', 'these', 'those', 'i', 'me', 'my', 'we', 'our',
    'you', 'your', 'he', 'she', 'him', 'her', 'they', 'them', 'their', 'what', 'which',
    'who', 'whom', 'when', 'where', 'why', 'how', 'all', 'each', 'every', 'both', 'few',
    'more', 'most', 'other', 'some', 'such', 'no', 'not', 'only', 'own', 'same', 'so',
    'than', 'too', 'very', 'just', 'about', 'above', 'after', 'again', 'against', 'below',
    'between', 'during', 'further', 'here', 'there', 'once', 'then', 'also', 'into', 'up',
    'out', 'off', 'over', 'under', 'new', 'now', 'well', 'back', 'even', 'still', 'way',
    'much', 'take', 'come', 'make', 'like', 'get', 'go', 'know', 'see', 'use', 'find',
    'give', 'tell', 'work', 'call', 'try', 'ask', 'seem', 'feel', 'leave', 'put', 'mean',
    'keep', 'let', 'begin', 'show', 'hear', 'play', 'run', 'move', 'live', 'believe',
    'hold', 'bring', 'happen', 'write', 'provide', 'sit', 'stand', 'lose', 'pay', 'meet',
    'include', 'continue', 'set', 'learn', 'change', 'lead', 'understand', 'watch',
    'follow', 'stop', 'create', 'speak', 'read', 'allow', 'add', 'grow', 'open', 'walk',
    'win', 'teach', 'offer', 'remember', 'consider', 'appear', 'buy', 'serve', 'die',
    'send', 'build', 'stay', 'fall', 'cut', 'reach', 'remain', 'suggest', 'raise', 'pass',
    'sell', 'require', 'report', 'decide', 'pull', 'apply', 'develop', 'manage',
    'produce', 'design', 'engineer', 'implement', 'analyze', 'optimize', 'deploy',
    'configure', 'integrate', 'maintain', 'monitor', 'troubleshoot', 'collaborate',
    'coordinate', 'prioritize', 'evaluate', 'assess', 'architect', 'refactor', 'debug',
    'test', 'validate', 'document', 'mentor', 'coach', 'review', 'approve', 'negotiate',
    'present', 'demonstrate', 'exhibit', 'display', 'utilize', 'leverage', 'harness',
    'facilitate', 'orchestrate', 'spearhead', 'champion', 'drive', 'execute', 'deliver',
    'achieve', 'attain', 'accomplish', 'establish', 'formulate', 'synthesize',
    'consolidate', 'streamline', 'enhance', 'strengthen', 'identify', 'determine',
    'specify', 'define', 'characterize', 'classify', 'categorize', 'troubleshoot',
    'diagnose', 'resolve', 'mitigate', 'eliminate', 'prevent', 'detect', 'track',
    'measure', 'quantify', 'calculate', 'estimate', 'predict', 'forecast', 'plan',
    'organize', 'schedule', 'delegate', 'supervise', 'oversee', 'administer', 'operate',
    'perform', 'conduct', 'execute', 'fulfill', 'complete', 'ensure', 'guarantee',
    'confirm', 'verify', 'certify', 'authorize', 'enable', 'empower', 'support',
    'assist', 'help', 'contribute', 'participate', 'communicate', 'articulate', 'express',
    'convey', 'explain', 'describe', 'summarize', 'outline', 'detail', 'elaborate',
    'clarify', 'compare', 'contrast', 'relate', 'connect', 'link', 'associate',
    'affiliate', 'partner', 'ally', 'allied', 'collaborate', 'cooperate', 'coordinate',
    'sync', 'synchronize', 'harmonize', 'integrate', 'merge', 'combine', 'unify',
    'aggregate', 'accumulate', 'collect', 'gather', 'assemble', 'compile', 'generate',
    'produce', 'manufacture', 'fabricate', 'craft', 'make', 'form', 'shape', 'mold',
    'cast', 'forge', 'weld', 'join', 'connect', 'attach', 'bind', 'tie', 'fasten',
    'secure', 'lock', 'seal', 'close', 'shut', 'stop', 'halt', 'pause', 'wait', 'delay',
    'defer', 'postpone', 'reschedule', 'rearrange', 'reorganize', 'restructure', 'reform',
    'revise', 'update', 'refresh', 'renew', 'restore', 'repair', 'fix', 'mend', 'heal',
    'cure', 'resolve', 'solve', 'settle', 'determine', 'decide', 'choose', 'select',
    'pick', 'opt', 'prefer', 'favor', 'accept', 'agree', 'consent', 'concur', 'align',
    'match', 'correspond', 'relate', 'associate', 'affiliate', 'allied', 'collaborated',
    'cooperated', 'coordinated', 'synced', 'synchronized', 'harmonized', 'merged',
    'combined', 'unified', 'consolidated', 'collected', 'gathered', 'assembled',
    'compiled', 'generated', 'produced', 'created', 'built', 'constructed', 'designed',
    'planned', 'organized', 'arranged', 'ordered', 'sequenced', 'ranked', 'prioritized',
    'scheduled', 'managed', 'handled', 'dealt', 'coped', 'navigated', 'steered', 'guided',
    'directed', 'led', 'headed', 'commanded', 'controlled', 'governed', 'ruled',
    'administered', 'operated', 'oversaw', 'supervised', 'monitored', 'watched',
    'observed', 'tracked', 'measured', 'assessed', 'evaluated', 'analyzed', 'examined',
    'inspected', 'reviewed', 'audited', 'checked', 'verified', 'validated', 'confirmed',
    'certified', 'approved', 'authorized', 'endorsed', 'supported', 'backed', 'sponsored',
    'funded', 'financed', 'invested', 'allocated', 'assigned', 'delegated', 'distributed',
    'shared', 'divided', 'split', 'separated', 'partitioned', 'segmented', 'broken',
    'down', 'decomposed', 'dismantled', 'unpacked', 'extracted', 'pulled', 'removed',
    'deleted', 'erased', 'cleared', 'cleaned', 'purged', 'pruned', 'trimmed', 'cut',
    'reduced', 'decreased', 'lowered', 'dropped', 'declined', 'fell', 'shrank',
    'contracted', 'compressed', 'compacted', 'condensed', 'concentrated', 'focused',
    'narrowed', 'refined', 'improved', 'enhanced', 'boosted', 'elevated', 'upgraded',
    'advanced', 'progressed', 'proceeded', 'continued', 'persisted', 'persevered',
    'endured', 'sustained', 'maintained', 'kept', 'held', 'retained', 'preserved',
    'conserved', 'protected', 'saved', 'stored', 'archived', 'recorded', 'logged',
    'noted', 'marked', 'tagged', 'labeled', 'categorized', 'classified', 'sorted',
    'organized', 'arranged', 'ordered', 'sequenced', 'ranked', 'prioritized', 'planned',
    'designed', 'created', 'built', 'constructed', 'assembled', 'compiled', 'generated',
    'produced', 'manufactured', 'fabricated', 'crafted', 'made', 'formed', 'shaped',
    'molded', 'cast', 'forged', 'welded', 'joined', 'connected', 'linked', 'attached',
    'bound', 'tied', 'fastened', 'secured', 'locked', 'sealed', 'closed', 'shut',
    'stopped', 'halted', 'paused', 'waited', 'delayed', 'deferred', 'postponed',
    'rescheduled', 'rearranged', 'reorganized', 'restructured', 'reformed', 'revised',
    'updated', 'refreshed', 'renewed', 'restored', 'repaired', 'fixed', 'mended',
    'healed', 'cured', 'resolved', 'solved', 'settled', 'determined', 'decided',
    'chose', 'selected', 'picked', 'opted', 'preferred', 'favored', 'accepted',
    'agreed', 'consented', 'concurred', 'aligned', 'matched', 'corresponded',
    'related', 'connected', 'linked', 'associated', 'affiliated', 'partnered',
    'allied', 'collaborated', 'cooperated', 'coordinated', 'synced', 'synchronized',
    'harmonized', 'integrated', 'merged', 'combined', 'unified', 'consolidated',
    'aggregated', 'accumulated', 'collected', 'gathered', 'assembled', 'compiled',
  ]);

  const text = jobDescription.toLowerCase();
  const words = text
    .replace(/[^a-z0-9\s\-]/g, ' ')
    .split(/\s+/)
    .map(w => w.trim())
    .filter(w => w.length > 1 && !stopWords.has(w));

  const bigrams: string[] = [];
  for (let i = 0; i < words.length - 1; i++) {
    const pair = `${words[i]} ${words[i + 1]}`;
    if (words[i + 1].length > 2) {
      bigrams.push(pair);
    }
  }

  const freqMap = new Map<string, number>();
  words.forEach(w => freqMap.set(w, (freqMap.get(w) || 0) + 1));
  bigrams.forEach(b => freqMap.set(b, (freqMap.get(b) || 0) + 1));

  const sorted = Array.from(freqMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 60)
    .map(([keyword, count]) => ({ keyword, count }));

  return sorted;
}

function categorizeKeyword(keyword: string): string {
  const lower = keyword.toLowerCase();
  for (const prefix of TECH_PREFIXES) {
    if (lower.includes(prefix)) return 'Technical';
  }
  for (const prefix of SOFT_PREFIXES) {
    if (lower.includes(prefix)) return 'Soft Skills';
  }
  return 'General';
}

function calculateDensity(count: number, cvTextLength: number): number {
  if (cvTextLength === 0) return 0;
  return (count / cvTextLength) * 1000;
}

export const analyzeKeywordDensity = async (req: Request, res: Response) => {
  try {
    const { cvText, jobDescription } = req.body;

    if (!cvText || typeof cvText !== 'string') {
      return res.status(400).json({ message: 'cvText is required and must be a string.' });
    }
    if (!jobDescription || typeof jobDescription !== 'string' || !jobDescription.trim()) {
      return res.status(400).json({ message: 'jobDescription is required and must be a non-empty string.' });
    }

    const jdKeywords = extractKeywordsFromJD(jobDescription);
    const cvLower = cvText.toLowerCase();
    const cvWords = cvLower.split(/\s+/).filter(w => w.length > 1);
    const cvTextLength = cvWords.length;

    const keywords: KeywordEntry[] = [];
    const categories: Record<string, { total: number; matched: number; missing: number; overRepresented: number }> = {};

    let matchedCount = 0;
    let missingCount = 0;
    let overRepresentedCount = 0;
    let underRepresentedCount = 0;

    for (const { keyword, count: jdCount } of jdKeywords) {
      const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const cvCount = cvLower.split(new RegExp(`\\b${escapedKeyword}\\b`, 'gi')).length - 1;
      const density = calculateDensity(cvCount, cvTextLength);
      const jdDensity = calculateDensity(jdCount, jobDescription.split(/\s+/).length);

      let status: KeywordEntry['status'];
      let color: string;
      let suggestedCount = jdCount;
      let reason = '';

      if (cvCount === 0) {
        status = 'missing';
        color = '#EF4444';
        missingCount++;
        reason = `Not found in CV. Appears ${jdCount}x in job description.`;
      } else if (density < jdDensity * 0.5) {
        status = 'under-represented';
        color = '#F59E0B';
        underRepresentedCount++;
        suggestedCount = Math.max(jdCount, Math.ceil(jdDensity * cvTextLength / 1000));
        reason = `Found ${cvCount}x but appears ${jdCount}x in JD. Suggested: ${suggestedCount}+ mentions.`;
      } else if (density >= jdDensity * 0.5 && density <= jdDensity * 2) {
        status = 'optimal';
        color = '#10B981';
        matchedCount++;
        reason = `Well-represented. Found ${cvCount}x, JD requires ${jdCount}x.`;
      } else if (density > jdDensity * 2 && density <= jdDensity * 4) {
        status = 'over-represented';
        color = '#3B82F6';
        overRepresentedCount++;
        reason = `Appears ${cvCount}x — slightly over-represented (JD mentions ${jdCount}x). Consider consolidating.`;
      } else {
        status = 'over-represented';
        color = '#6366F1';
        overRepresentedCount++;
        reason = `Keyword stuffing detected: ${cvCount}x mentions vs ${jdCount}x in JD. Reduce for better readability.`;
      }

      const category = categorizeKeyword(keyword);
      if (!categories[category]) {
        categories[category] = { total: 0, matched: 0, missing: 0, overRepresented: 0 };
      }
      categories[category].total++;
      if (status === 'optimal') categories[category].matched++;
      if (status === 'missing') categories[category].missing++;
      if (status === 'over-represented') categories[category].overRepresented++;

      keywords.push({
        keyword,
        category,
        count: cvCount,
        density: parseFloat(density.toFixed(3)),
        status,
        color,
        suggestedCount,
        reason,
      });
    }

    const overallScore = cvTextLength > 0
      ? Math.round(((matchedCount + underRepresentedCount * 0.5) / jdKeywords.length) * 100)
      : 0;

    const result: KeywordDensityResult = {
      overallScore: Math.min(100, Math.max(0, overallScore)),
      totalKeywords: jdKeywords.length,
      matchedCount,
      missingCount,
      overRepresentedCount,
      underRepresentedCount,
      keywords,
      categories,
      jobDescription,
      cvTextLength,
      analysisTimestamp: new Date().toISOString(),
    };

    res.json(result);
  } catch (error) {
    console.error('Error analyzing keyword density:', error);
    res.status(500).json({ message: 'Internal server error', error: (error as Error).message });
  }
};