"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendToOpenAIForCVTailor = exports.sendToOpenAIForLinkedInProfile = exports.sendToOpenAIForATSWithData = exports.sendToOpenAIForCoverLetter = exports.sendToOpenAIForInterviewFeedback = exports.sendToOpenAIForInterviewSimulation = exports.sendToOpenAIForSalaryComparison = exports.sendToOpenAIForCareerRoadmap = exports.sendToOpenAIForSalaryInsights = exports.sendToOpenAIForInterviewPrep = exports.sendToOpenAIForSkillGap = exports.sendToOpenAIForResumePolish = exports.sendToOpenAIForATS = exports.sendToOpenAI = void 0;
const openai_1 = __importDefault(require("openai"));
const sendToOpenAI = async (content) => {
    const startTime = Date.now();
    const openai = new openai_1.default({
        apiKey: process.env.OPENAI_API_KEY,
    });
    // Prepare all OpenAI API calls as promises
    const personalInfoPromise = openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
            { role: 'system', content: `You are pdf parser. Extract all information from pdf. For the "summary" field, if the CV contains a professional summary, extract it. If it does NOT contain a summary, you MUST generate a professional summary in the FIRST PERSON based on their experience and skills.

Summary Requirements:
- Write as if the candidate is introducing themselves.
- Use "I" naturally and professionally.
- Do NOT use the candidate's name anywhere in the summary.
- Avoid phrases such as "This candidate", "He is", or other third-person references.
- Focus on technical expertise, project impact, problem-solving ability, and career interests.
- Make the writing sound authentic and human rather than AI-generated.
- Avoid generic buzzwords and exaggerated claims.
- Keep the tone confident, concise, and professional.

For the "title" field, extract the candidate's professional title from the CV. If it is NOT explicitly mentioned, you MUST generate a concise professional title (e.g., "Software Engineer", "Data Scientist") that best represents their experience to showcase the position the candidate is applying for.

For all other fields, if they are not mentioned, don't fill them in. Find only personal links in pdf. Output only JSON, no explanation.

        JSON Format 
        {
          "first_name": "",
          "last_name": "",
          "title": "",
          "contact": {
            "phone": "",
            "email": "",
            "location": "",
            "links": {
              title: url
            }
          },
          "summary": "",
          "education": [
            {
              "degree": "",
              "field": "",
              "institution": "",
              "start_date": yyyy-mm,
              "end_date":yyyy-mm,
            }
          ],
          "certifications": [
            {
              "name": "",
              "issuer": "",
              "date": ""
            }
          ],
          "internship_volunteering":[
            {
              "involvement":"",
              "organization":"",
              "description: "",
              "start_date": yyyy-mm,
              "end_date":yyyy-mm,
            }
          ],
          "languages_spoken": [
            {
              language:"",
              level:'A1'?'A2'?'B1'?'B2'?'C1'?:'C2'?:'Basic'?:'Beginner'?:'Intermediate'?:'Upper Intermediate'?:'Advanced'?:'Native'?
            },
          ],
        }` },
            { role: 'user', content: `Here is the content of the pdf:\n${content}` },
        ],
        temperature: 0.1,
        max_tokens: 8192,
    });
    const experiencePromise = openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
            { role: 'system', content: `Extract all the experience information from the pdf. If there is no required information, don't need fill the field. Output only JSON, no explanation.

        JSON Format 
        "experience": [
          {
            "title": "",
            "company": "",
            "location": "",
            "type": "",
            "start_date": yyyy-mm,
            "end_date":yyyy-mm,
            "summary": "",
            "description":[],
          },
        ]` },
            { role: 'user', content: `Here is the content of the pdf:\n${content}` },
        ],
        temperature: 0.1,
        max_tokens: 8192,
    });
    const projectPromise = openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
            { role: 'system', content: `Extract all the projects information from the pdf, not work experience. If there is no information about project, fill [] in that field. Output only JSON, no explanation.

        JSON Format 
        "projects": [
          {
            "project_name": "Project Name",
            "organization": "Company or Personal",
            "start_date": "yyyy-mm",
            "end_date": "yyyy-mm",
            "description": "Short description",
            "technologies": ["Tech 1", "Tech 2"]
          }
        ]` },
            { role: 'user', content: `Here is the content of the pdf:\n${content}` },
        ],
        temperature: 0.1,
        max_tokens: 8192,
    });
    const skillsPromise = openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
            { role: 'system', content: `Extract all only tech-skill information from the pdf. If there is no requried information, fill {} in that field. Output only JSON, no explanation.

        JSON Format 
          "skills": {
            category: category_name,
            skills: [skill1, skill2],
            level: 'Beginner'?'Intermediate'?'Advanced'?'Expert'
          },` },
            { role: 'user', content: `Here is the content of the pdf:\n${content}` },
        ],
        temperature: 0.0,
        max_tokens: 8192,
    });
    // Run all API calls in parallel
    const [response_persoanl_info, response_experience, response_project, response_skills] = await Promise.all([
        personalInfoPromise,
        experiencePromise,
        projectPromise,
        skillsPromise,
    ]);
    // Process personal info
    const result_personal_info_string = response_persoanl_info.choices[0].message?.content;
    let json_personal_info = result_personal_info_string?.trim() || '{}';
    if (json_personal_info.startsWith('```json\n') && json_personal_info.endsWith('```')) {
        json_personal_info = json_personal_info.slice(7, -3).trim();
    }
    let result_personal_info;
    try {
        result_personal_info = JSON.parse(json_personal_info);
    }
    catch (jsonError) {
        result_personal_info = { message: 'Failed to parse OpenAI response as JSON', error: jsonError.message, raw: result_personal_info_string };
    }
    // Process experience
    const result_experience_string = response_experience.choices[0].message?.content;
    let json_experience = result_experience_string?.trim() || '{}';
    if (json_experience.startsWith('```json\n') || json_experience.endsWith('```')) {
        json_experience = json_experience.slice(7, -3).trim();
    }
    let result_experience;
    try {
        result_experience = JSON.parse(json_experience);
    }
    catch (jsonError) {
        result_experience = { message: 'Failed to parse OpenAI response as JSON', error: jsonError.message, raw: result_experience_string };
    }
    // Process projects
    const result_project_string = response_project.choices[0].message?.content;
    let json_project = result_project_string?.trim() || '{}';
    if (json_project.startsWith('```json\n') || json_project.endsWith('```')) {
        json_project = json_project.slice(7, -3).trim();
    }
    let result_project;
    try {
        result_project = JSON.parse(json_project);
    }
    catch (jsonError) {
        result_project = { message: 'Failed to parse OpenAI response as JSON', error: jsonError.message, raw: result_project_string };
    }
    // Process skills
    const result_skills_string = response_skills.choices[0].message?.content;
    let json_skills = result_skills_string?.trim() || '{}';
    if (json_skills.startsWith('```json\n') || json_skills.endsWith('```')) {
        json_skills = json_skills.slice(7, -3).trim();
    }
    let result_skills;
    try {
        result_skills = JSON.parse(json_skills);
    }
    catch (jsonError) {
        result_skills = { message: 'Failed to parse OpenAI response as JSON', error: jsonError.message, raw: result_skills_string };
    }
    const endTime = Date.now();
    console.log(`sendToOpenAI execution time: ${endTime - startTime} ms`);
    return {
        ...result_personal_info,
        experience: result_experience.experience || [],
        projects: result_project.projects || [],
        skills: result_skills.skills || {},
    };
};
exports.sendToOpenAI = sendToOpenAI;
const sendToOpenAIForATS = async (cvContent, jobDescription) => {
    const openai = new openai_1.default({
        apiKey: process.env.OPENAI_API_KEY,
    });
    let jdSection = '';
    if (jobDescription && jobDescription.trim()) {
        jdSection = `\n\nJob Description:\n${jobDescription}`;
    }
    const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
            {
                role: 'system',
                content: `You are an ATS (Applicant Tracking System) expert. Analyze the provided CV and optional job description.

Return JSON only with this structure:
{
  "keywordGaps": ["list of important keywords from the JD missing in the CV"],
  "contentSuggestions": ["list of specific suggestions to improve ATS score"],
  "formatIssues": ["any formatting problems that hurt ATS parsing"],
  "strengths": ["what the CV does well for ATS"],
  "matchedKeywords": ["keywords found in both CV and JD"],
  "missingSections": ["any critical missing sections"]
}

Rules:
- Be specific and actionable
- If a JD is provided, focus on keyword gaps relative to it
- If no JD, give general ATS best-practice advice
- Keep suggestions concise and practical`,
            },
            {
                role: 'user',
                content: `CV Content:\n${cvContent}${jdSection}`,
            },
        ],
        temperature: 0.1,
        max_tokens: 4096,
    });
    let raw = response.choices[0].message?.content?.trim() || '{}';
    if (raw.startsWith('```json\n'))
        raw = raw.slice(7);
    if (raw.endsWith('```'))
        raw = raw.slice(0, -3);
    raw = raw.trim();
    try {
        return JSON.parse(raw);
    }
    catch {
        return {
            keywordGaps: [],
            contentSuggestions: [],
            formatIssues: [],
            strengths: [],
            matchedKeywords: [],
            missingSections: [],
            _raw: raw,
        };
    }
};
exports.sendToOpenAIForATS = sendToOpenAIForATS;
// Resume Polish
const sendToOpenAIForResumePolish = async (cvData) => {
    const openai = new openai_1.default({ apiKey: process.env.OPENAI_API_KEY });
    const cvJson = JSON.stringify(cvData, null, 2);
    const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
            {
                role: 'system',
                content: `You are a professional resume writer and career coach. Analyze the structured CV data and provide specific, actionable suggestions to improve each section.

For each suggestion, provide:
- The section and field it applies to
- The current content
- An improved version
- A brief reason for the change

Focus on:
1. Stronger action verbs
2. Quantified achievements (numbers, percentages, metrics)
3. Clearer impact statements
4. Better keyword optimization
5. Removing filler words and redundancy
6. Improving readability and conciseness

Return JSON only with this structure:
{
  "suggestions": [
    {
      "section": "experience",
      "field": "description",
      "itemIndex": 0,
      "itemLabel": "Software Engineer at Google",
      "current": "Worked on the search team",
      "improved": "Led search algorithm optimization serving 10M+ daily queries, improving relevance by 23%",
      "reason": "Added quantified achievement and stronger action verb"
    }
  ]
}

Rules:
- Be specific to THIS candidate's actual content
- Only suggest changes that genuinely improve the content
- Keep suggestions practical and implementable
- If a section is already strong, don't force suggestions
- Aim for 5-10 high-impact suggestions, not 30 minor ones`,
            },
            {
                role: 'user',
                content: `Structured CV Data (JSON):\n${cvJson}`,
            },
        ],
        temperature: 0.3,
        max_tokens: 4096,
    });
    let raw = response.choices[0].message?.content?.trim() || '{}';
    if (raw.startsWith('```json\n'))
        raw = raw.slice(7);
    if (raw.endsWith('```'))
        raw = raw.slice(0, -3);
    raw = raw.trim();
    try {
        return JSON.parse(raw);
    }
    catch {
        return { suggestions: [], _raw: raw };
    }
};
exports.sendToOpenAIForResumePolish = sendToOpenAIForResumePolish;
// Skill Gap Analysis
const sendToOpenAIForSkillGap = async (cvData, jobDescription) => {
    const openai = new openai_1.default({ apiKey: process.env.OPENAI_API_KEY });
    const cvJson = JSON.stringify(cvData, null, 2);
    const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
            {
                role: 'system',
                content: `You are a career analyst specializing in skill gap analysis. Compare the candidate's skills from their CV against the job description and identify gaps.

Return JSON only with this structure:
{
  "matchPercentage": 75,
  "matchedSkills": ["skills the candidate has that match the job"],
  "missingSkills": ["skills required by the job that the candidate lacks"],
  "recommendedSkills": [
    {
      "skill": "Skill Name",
      "importance": "high|medium|low",
      "reason": "Why this skill matters for this role",
      "howToLearn": "Brief suggestion on how to acquire this skill"
    }
  ]
}

Rules:
- Extract skills from BOTH the CV's skills section AND experience descriptions
- Compare against requirements mentioned in the job description
- Be realistic about what's truly required vs nice-to-have
- For recommendedSkills, focus on the top 5-8 most impactful skills to learn
- Provide actionable learning suggestions (specific courses, projects, certifications)
- Calculate matchPercentage based on how many required skills the candidate covers`,
            },
            {
                role: 'user',
                content: `Candidate CV (JSON):\n${cvJson}\n\nJob Description:\n${jobDescription}`,
            },
        ],
        temperature: 0.2,
        max_tokens: 4096,
    });
    let raw = response.choices[0].message?.content?.trim() || '{}';
    if (raw.startsWith('```json\n'))
        raw = raw.slice(7);
    if (raw.endsWith('```'))
        raw = raw.slice(0, -3);
    raw = raw.trim();
    try {
        return JSON.parse(raw);
    }
    catch {
        return { matchPercentage: 0, matchedSkills: [], missingSkills: [], recommendedSkills: [], _raw: raw };
    }
};
exports.sendToOpenAIForSkillGap = sendToOpenAIForSkillGap;
// Interview Prep
const sendToOpenAIForInterviewPrep = async (cvData, jobDescription, jobTitle, companyName) => {
    const openai = new openai_1.default({ apiKey: process.env.OPENAI_API_KEY });
    const cvJson = JSON.stringify(cvData, null, 2);
    const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
            {
                role: 'system',
                content: `You are an expert interview coach. Generate tailored interview questions based on the candidate's CV and the specific job they're applying for.

Organize questions into these categories:
1. Technical Questions - Based on skills and experience relevant to the role
2. Behavioral Questions - Using STAR method, tailored to their background
3. Role-Specific Questions - About the specific position and responsibilities
4. Company-Specific Questions - About the company and culture fit

For each question, provide:
- The question text
- A model answer based on the candidate's actual CV experience
- Tips for answering well

Return JSON only with this structure:
{
  "categories": [
    {
      "name": "Technical Questions",
      "questions": [
        {
          "question": "Can you describe your experience with [specific technology]?",
          "answer": "Based on your CV, you could mention your work at [company] where you [specific achievement]...",
          "tips": ["Focus on the impact you made", "Use specific numbers and metrics"]
        }
      ]
    }
  ]
}

Rules:
- Generate 3-4 questions per category (12-16 total)
- Model answers should reference the candidate's ACTUAL experience from their CV
- Questions should be realistic and commonly asked in interviews
- Tips should be actionable and specific to each question
- Mix difficulty levels (some easy warm-ups, some challenging)
- Include at least one question about a potential weakness or gap`,
            },
            {
                role: 'user',
                content: `Candidate CV (JSON):\n${cvJson}\n\nCompany: ${companyName}\nPosition: ${jobTitle}\n\nJob Description:\n${jobDescription}`,
            },
        ],
        temperature: 0.4,
        max_tokens: 4096,
    });
    let raw = response.choices[0].message?.content?.trim() || '{}';
    if (raw.startsWith('```json\n'))
        raw = raw.slice(7);
    if (raw.endsWith('```'))
        raw = raw.slice(0, -3);
    raw = raw.trim();
    try {
        return JSON.parse(raw);
    }
    catch {
        return { categories: [], _raw: raw };
    }
};
exports.sendToOpenAIForInterviewPrep = sendToOpenAIForInterviewPrep;
// Salary Insights
const sendToOpenAIForSalaryInsights = async (jobTitle, location, experienceLevel, company) => {
    const openai = new openai_1.default({ apiKey: process.env.OPENAI_API_KEY });
    const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
            {
                role: 'system',
                content: `You are a compensation analyst with expertise in salary benchmarking. Provide salary insights for the specified position.

Return JSON only with this structure:
{
  "range": {
    "min": 75000,
    "max": 120000,
    "median": 95000,
    "currency": "USD"
  },
  "factors": [
    "Factor that influences this salary range (e.g., location, experience, company size)"
  ],
  "negotiationTips": [
    "Specific negotiation tip for this role"
  ],
  "marketDemand": "high|medium|low",
  "marketDemandExplanation": "Brief explanation of job market demand for this role",
  "totalCompensation": "Note about benefits, equity, bonuses beyond base salary"
}

Rules:
- Provide realistic salary ranges based on market data
- Consider the location (cost of living adjustments)
- Consider experience level (entry, mid, senior, lead, executive)
- Include 3-5 factors that affect salary
- Provide 3-5 actionable negotiation tips
- Be honest about market demand
- Note that these are estimates and actual salaries vary
- Use USD as default currency unless another is specified`,
            },
            {
                role: 'user',
                content: `Position: ${jobTitle}\nCompany: ${company || 'Not specified'}\nLocation: ${location || 'Remote/Not specified'}\nExperience Level: ${experienceLevel || 'Mid-level'}`,
            },
        ],
        temperature: 0.2,
        max_tokens: 2048,
    });
    let raw = response.choices[0].message?.content?.trim() || '{}';
    if (raw.startsWith('```json\n'))
        raw = raw.slice(7);
    if (raw.endsWith('```'))
        raw = raw.slice(0, -3);
    raw = raw.trim();
    try {
        return JSON.parse(raw);
    }
    catch {
        return {
            range: { min: 0, max: 0, median: 0, currency: 'USD' },
            factors: [],
            negotiationTips: [],
            marketDemand: 'unknown',
            marketDemandExplanation: '',
            totalCompensation: '',
            _raw: raw,
        };
    }
};
exports.sendToOpenAIForSalaryInsights = sendToOpenAIForSalaryInsights;
// Career Roadmap
const sendToOpenAIForCareerRoadmap = async (cvData, targetRole, timeline, experienceLevel) => {
    const openai = new openai_1.default({ apiKey: process.env.OPENAI_API_KEY });
    const cvJson = JSON.stringify(cvData, null, 2);
    const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
            {
                role: 'system',
                content: `You are a senior career strategist. Based on the candidate's current CV and their career goal, create a personalized career roadmap.

Return JSON only with this structure:
{
  "currentSummary": "Brief assessment of where the candidate is now",
  "targetSummary": "What the target role typically looks like",
  "milestones": [
    {
      "title": "Milestone title",
      "timeline": "e.g. Months 1-3",
      "skills": ["skill1", "skill2"],
      "actions": ["specific action to take"],
      "resources": [
        {
          "name": "Resource name",
          "type": "course|certification|book|project|community",
          "url": "suggested URL or search term"
        }
      ],
      "completed": false
    }
  ],
  "keySkillsToAcquire": [
    {
      "skill": "Skill name",
      "importance": "critical|important|nice-to-have",
      "currentLevel": "none|beginner|intermediate|advanced",
      "targetLevel": "beginner|intermediate|advanced|expert"
    }
  ],
  "potentialChallenges": ["challenge1", "challenge2"],
  "estimatedTimeToTarget": "e.g. 12-18 months"
}

Rules:
- Create 4-6 milestones that progressively build toward the target role
- Skills should be specific and relevant to the actual job market
- Resources should be real, well-known platforms (Coursera, Udemy, AWS, Google, etc.)
- Be realistic about timeline based on experience level
- Consider the gap between current skills and target role requirements
- Make milestones actionable and measurable`,
            },
            {
                role: 'user',
                content: `Current CV (JSON):\n${cvJson}\n\nTarget Role: ${targetRole}\nTimeline: ${timeline}\nExperience Level: ${experienceLevel || 'Not specified'}`,
            },
        ],
        temperature: 0.3,
        max_tokens: 4096,
    });
    let raw = response.choices[0].message?.content?.trim() || '{}';
    if (raw.startsWith('```json\n'))
        raw = raw.slice(7);
    if (raw.endsWith('```'))
        raw = raw.slice(0, -3);
    raw = raw.trim();
    try {
        return JSON.parse(raw);
    }
    catch {
        return {
            currentSummary: '',
            targetSummary: '',
            milestones: [],
            keySkillsToAcquire: [],
            potentialChallenges: [],
            estimatedTimeToTarget: '',
            _raw: raw,
        };
    }
};
exports.sendToOpenAIForCareerRoadmap = sendToOpenAIForCareerRoadmap;
// Salary Comparison
const sendToOpenAIForSalaryComparison = async (jobTitle, locations, experienceLevel, company) => {
    const openai = new openai_1.default({ apiKey: process.env.OPENAI_API_KEY });
    const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
            {
                role: 'system',
                content: `You are a compensation analyst. Compare salary ranges across the given locations for the same role.

Return JSON only with this structure:
{
  "comparisons": [
    {
      "location": "Location name",
      "range": { "min": 0, "max": 0, "median": 0, "currency": "USD" },
      "costOfLiving": "high|medium|low",
      "marketDemand": "high|medium|low",
      "notes": "Brief note about this market"
    }
  ],
  "bestValue": "Location with best salary-to-cost-of-living ratio",
  "recommendation": "Overall recommendation based on the comparison"
}

Rules:
- Provide realistic salary data for each location
- Consider cost of living differences
- Note remote work market conditions if relevant
- Be specific about local market factors`,
            },
            {
                role: 'user',
                content: `Position: ${jobTitle}\nCompany: ${company || 'Not specified'}\nExperience Level: ${experienceLevel || 'Mid-level'}\n\nLocations to compare:\n${locations.map((l, i) => `${i + 1}. ${l}`).join('\n')}`,
            },
        ],
        temperature: 0.2,
        max_tokens: 3000,
    });
    let raw = response.choices[0].message?.content?.trim() || '{}';
    if (raw.startsWith('```json\n'))
        raw = raw.slice(7);
    if (raw.endsWith('```'))
        raw = raw.slice(0, -3);
    raw = raw.trim();
    try {
        return JSON.parse(raw);
    }
    catch {
        return { comparisons: [], bestValue: '', recommendation: '', _raw: raw };
    }
};
exports.sendToOpenAIForSalaryComparison = sendToOpenAIForSalaryComparison;
// Interview Simulation
const sendToOpenAIForInterviewSimulation = async (cvData, jobDescription, jobTitle, companyName, roundType) => {
    const openai = new openai_1.default({ apiKey: process.env.OPENAI_API_KEY });
    const cvJson = JSON.stringify(cvData, null, 2);
    const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
            {
                role: 'system',
                content: `You are an expert interview conductor. Generate a set of interview questions for a specific round type.

Round type: ${roundType}

Generate exactly 5 questions for this round. Mix difficulty levels (2 easy, 2 medium, 1 hard).

Return JSON only with this structure:
{
  "roundType": "${roundType}",
  "questions": [
    {
      "id": 1,
      "question": "The interview question",
      "difficulty": "easy|medium|hard",
      "whatToLookFor": "Brief note on what a good answer should include",
      "modelAnswer": "A strong example answer based on the candidate's CV"
    }
  ]
}

Rules:
- Questions should be realistic and commonly asked in ${roundType} rounds
- Reference the candidate's actual experience where relevant
- Model answers should be specific and use the STAR method where applicable
- Keep questions focused and answerable in 2-3 minutes`,
            },
            {
                role: 'user',
                content: `Candidate CV (JSON):\n${cvJson}\n\nCompany: ${companyName}\nPosition: ${jobTitle}\n\nJob Description:\n${jobDescription}\n\nRound: ${roundType}`,
            },
        ],
        temperature: 0.4,
        max_tokens: 4096,
    });
    let raw = response.choices[0].message?.content?.trim() || '{}';
    if (raw.startsWith('```json\n'))
        raw = raw.slice(7);
    if (raw.endsWith('```'))
        raw = raw.slice(0, -3);
    raw = raw.trim();
    try {
        return JSON.parse(raw);
    }
    catch {
        return { roundType, questions: [], _raw: raw };
    }
};
exports.sendToOpenAIForInterviewSimulation = sendToOpenAIForInterviewSimulation;
// Interview Feedback
const sendToOpenAIForInterviewFeedback = async (question, userAnswer, modelAnswer, whatToLookFor) => {
    const openai = new openai_1.default({ apiKey: process.env.OPENAI_API_KEY });
    const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
            {
                role: 'system',
                content: `You are an expert interview coach evaluating a candidate's answer. Provide honest, constructive feedback.

Return JSON only with this structure:
{
  "score": 7,
  "maxScore": 10,
  "strengths": ["What the candidate did well"],
  "improvements": ["What could be improved"],
  "feedback": "Overall constructive feedback paragraph",
  "betterAnswer": "An improved version of the candidate's answer if it was weak"
}

Rules:
- Score from 1-10 (1=terrible, 5=adequate, 7=good, 9=excellent, 10=perfect)
- Be honest but encouraging
- Focus on: relevance, structure (STAR), specificity, clarity, confidence
- If the answer is good, don't force improvements
- If the answer is weak, provide a concrete better answer
- Keep feedback concise and actionable`,
            },
            {
                role: 'user',
                content: `Question: ${question}

What to look for: ${whatToLookFor}

Model answer: ${modelAnswer}

Candidate's answer: ${userAnswer}

Evaluate this answer and provide feedback.`,
            },
        ],
        temperature: 0.3,
        max_tokens: 2048,
    });
    let raw = response.choices[0].message?.content?.trim() || '{}';
    if (raw.startsWith('```json\n'))
        raw = raw.slice(7);
    if (raw.endsWith('```'))
        raw = raw.slice(0, -3);
    raw = raw.trim();
    try {
        return JSON.parse(raw);
    }
    catch {
        return { score: 0, maxScore: 10, strengths: [], improvements: [], feedback: '', betterAnswer: '', _raw: raw };
    }
};
exports.sendToOpenAIForInterviewFeedback = sendToOpenAIForInterviewFeedback;
const sendToOpenAIForCoverLetter = async (cvData, jobDescription, companyName, jobTitle) => {
    const openai = new openai_1.default({
        apiKey: process.env.OPENAI_API_KEY,
    });
    const cvJson = JSON.stringify(cvData, null, 2);
    const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
            {
                role: 'system',
                content: `You are a professional cover letter writer. Write a tailored cover letter for the candidate based on their CV and the job description.

Guidelines:
- Write in the first person ("I")
- Address the hiring manager professionally (use "Dear Hiring Manager" if no name is provided)
- Open with a strong hook that connects the candidate's background to the role
- Highlight 2-3 specific relevant experiences or skills from the CV that match the job requirements
- Show knowledge of the company and role
- Close with a confident call to action
- Keep it between 250-350 words
- Use a professional but warm tone
- Do NOT use generic filler phrases like "I am writing to express my interest"
- Make each sentence count — every line should add value
- Do NOT include the candidate's name or contact info in the letter body — just the letter content

Return ONLY the cover letter text. No JSON, no explanation, no formatting markers.`,
            },
            {
                role: 'user',
                content: `Candidate CV (JSON):
${cvJson}

Company: ${companyName}
Position: ${jobTitle}

Job Description:
${jobDescription}

Write a tailored cover letter for this candidate applying to this position.`,
            },
        ],
        temperature: 0.7,
        max_tokens: 1024,
    });
    return response.choices[0].message?.content?.trim() || '';
};
exports.sendToOpenAIForCoverLetter = sendToOpenAIForCoverLetter;
const sendToOpenAIForATSWithData = async (cvData, jobDescription) => {
    const openai = new openai_1.default({
        apiKey: process.env.OPENAI_API_KEY,
    });
    const cvJson = JSON.stringify(cvData, null, 2);
    let jdSection = '';
    if (jobDescription && jobDescription.trim()) {
        jdSection = `\n\nJob Description:\n${jobDescription}`;
    }
    const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
            {
                role: 'system',
                content: `You are an ATS (Applicant Tracking System) expert. You will receive a structured CV JSON (already parsed) and an optional job description.

Your task is to analyze the CV content against ATS best practices and the job description (if provided).

The CV data is already structured, so focus your analysis on:
1. Whether the content in each section is optimized for the target role
2. Missing keywords from the job description
3. Whether experience descriptions use strong action verbs and quantified achievements
4. Whether the skills section covers technologies mentioned in the JD
5. Overall content quality and completeness

Return JSON only with this structure:
{
  "keywordGaps": ["list of important keywords from the JD missing in the CV"],
  "contentSuggestions": ["list of specific suggestions to improve ATS score based on the structured data"],
  "formatIssues": ["any formatting or structural problems"],
  "strengths": ["what the CV does well for ATS"],
  "matchedKeywords": ["keywords found in both CV and JD"],
  "missingSections": ["any critical missing sections"]
}

Rules:
- Be specific and actionable — reference actual skills, experience entries, or sections
- If a JD is provided, do deep keyword gap analysis against it
- If no JD, give general ATS best-practice advice based on the structured fields
- Keep suggestions concise and practical`,
            },
            {
                role: 'user',
                content: `Structured CV Data (JSON):\n${cvJson}${jdSection}`,
            },
        ],
        temperature: 0.1,
        max_tokens: 4096,
    });
    let raw = response.choices[0].message?.content?.trim() || '{}';
    if (raw.startsWith('```json\n'))
        raw = raw.slice(7);
    if (raw.endsWith('```'))
        raw = raw.slice(0, -3);
    raw = raw.trim();
    try {
        return JSON.parse(raw);
    }
    catch {
        return {
            keywordGaps: [],
            contentSuggestions: [],
            formatIssues: [],
            strengths: [],
            matchedKeywords: [],
            missingSections: [],
            _raw: raw,
        };
    }
};
exports.sendToOpenAIForATSWithData = sendToOpenAIForATSWithData;
const sendToOpenAIForLinkedInProfile = async (profileText) => {
    const openai = new openai_1.default({ apiKey: process.env.OPENAI_API_KEY });
    const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
            {
                role: 'system',
                content: `You are a LinkedIn profile optimization expert. You will receive a user's LinkedIn profile text (pasted by the user, not scraped).

Analyze the profile across these dimensions:

1. **Completeness** - What sections are present (headline, about, experience, education, skills, certifications, recommendations, languages) and what's missing
2. **Tone & Voice** - Is it professional, first-person vs third-person, action-oriented? Does it use strong action verbs?
3. **Keyword Density** - Does the profile include relevant industry keywords? Is it optimized for LinkedIn search?
4. **Section-by-section improvements** - For each section, provide specific rewrites

Return JSON only with this structure:
{
  "overallScore": <number 0-100>,
  "completeness": {
    "score": <number 0-100>,
    "missingFields": ["list of missing sections"],
    "presentFields": ["list of present sections"]
  },
  "tone": {
    "score": <number 0-100>,
    "assessment": "<brief assessment of tone>",
    "suggestions": ["actionable tone improvement suggestions"]
  },
  "keywords": {
    "score": <number 0-100>,
    "industryKeywords": ["keywords found"],
    "missingKeywords": ["recommended keywords not found"],
    "densityNote": "<summary of keyword usage>"
  },
  "sectionSuggestions": [
    {
      "section": "Headline",
      "currentText": "excerpt of current content",
      "improvedText": "optimized version",
      "reason": "why this change helps"
    }
  ]
}

Rules:
- Be specific and actionable — reference actual profile content
- Suggest realistic improvements that respect the user's actual experience
- For the score, be honest and constructive (even great profiles can improve)
- Focus on LinkedIn best practices: SEO discoverability, professional branding, and engagement
- NEVER fabricate experience or qualifications the user doesn't have`,
            },
            {
                role: 'user',
                content: `LinkedIn Profile Content:\n\n${profileText}`,
            },
        ],
        temperature: 0.2,
        max_tokens: 4096,
    });
    let raw = response.choices[0].message?.content?.trim() || '{}';
    if (raw.startsWith('```json\n'))
        raw = raw.slice(7);
    if (raw.endsWith('```'))
        raw = raw.slice(0, -3);
    raw = raw.trim();
    try {
        return JSON.parse(raw);
    }
    catch {
        return {
            overallScore: 0,
            completeness: { score: 0, missingFields: [], presentFields: [] },
            tone: { score: 0, assessment: '', suggestions: [] },
            keywords: { score: 0, industryKeywords: [], missingKeywords: [], densityNote: '' },
            sectionSuggestions: [],
        };
    }
};
exports.sendToOpenAIForLinkedInProfile = sendToOpenAIForLinkedInProfile;
const sendToOpenAIForCVTailor = async (cvData, jobDescription, jobTitle) => {
    const openai = new openai_1.default({ apiKey: process.env.OPENAI_API_KEY });
    const cvJson = JSON.stringify(cvData, null, 2);
    const response = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages: [
            {
                role: 'system',
                content: `You are a professional CV tailoring expert. Your job is to rewrite a candidate's CV to better match a specific job description.

Analyze the CV data and job description, then return a tailored version with specific edits. Focus on:

1. **Summary** - Rewrite the professional summary to include keywords and themes from the job description
2. **Skills** - Reorder skill categories so the most relevant ones appear first; add relevant keywords the candidate likely has but didn't list
3. **Experience** - Rewrite bullet points to use terminology and language from the job description, emphasizing matching achievements
4. **Projects** - Add relevant keywords from the job description where appropriate

Rules:
- NEVER fabricate experience, education, or certifications the candidate doesn't have
- Only rephrase and reorder existing content
- Add relevant keywords only where they plausibly apply to the candidate's actual background
- Keep the same overall structure and sections
- Be specific to THIS job description - generic improvements are not useful
- Aim for 3-8 high-impact suggestions

Return JSON only with this structure:
{
  "summary": "Rewritten professional summary matching the job description language and keywords",
  "suggestions": [
    {
      "section": "experience",
      "field": "description",
      "itemIndex": 0,
      "itemLabel": "Job Title at Company",
      "current": "original bullet point",
      "improved": "tailored bullet point with job-relevant keywords",
      "reason": "Added [keyword] and [keyword] that match the job requirements"
    }
  ]
}

For skill reordering, use section "skills", field "skills", itemIndex matching the category index, and put the reordered/expanded skills in "improved".`,
            },
            {
                role: 'user',
                content: `Job Title: ${jobTitle}\n\nJob Description:\n${jobDescription}\n\nCandidate CV (JSON):\n${cvJson}`,
            },
        ],
        temperature: 0.3,
        max_tokens: 4096,
    });
    let raw = response.choices[0].message?.content?.trim() || '{}';
    if (raw.startsWith('```json\n'))
        raw = raw.slice(7);
    if (raw.endsWith('```'))
        raw = raw.slice(0, -3);
    raw = raw.trim();
    try {
        return JSON.parse(raw);
    }
    catch {
        return { summary: '', suggestions: [] };
    }
};
exports.sendToOpenAIForCVTailor = sendToOpenAIForCVTailor;
