import OpenAI from 'openai';

export const sendToOpenAI = async (content: string) => {
  const startTime = Date.now();
  const openai = new OpenAI({
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
        ]`},
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
          },`},
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
  } catch (jsonError) {
    result_personal_info = { message: 'Failed to parse OpenAI response as JSON', error: (jsonError as Error).message, raw: result_personal_info_string };
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
  } catch (jsonError) {
    result_experience = { message: 'Failed to parse OpenAI response as JSON', error: (jsonError as Error).message, raw: result_experience_string };
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
  } catch (jsonError) {
    result_project = { message: 'Failed to parse OpenAI response as JSON', error: (jsonError as Error).message, raw: result_project_string };
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
  } catch (jsonError) {
    result_skills = { message: 'Failed to parse OpenAI response as JSON', error: (jsonError as Error).message, raw: result_skills_string };
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

export const sendToOpenAIForATS = async (cvContent: string, jobDescription?: string) => {
  const openai = new OpenAI({
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
  if (raw.startsWith('```json\n')) raw = raw.slice(7);
  if (raw.endsWith('```')) raw = raw.slice(0, -3);
  raw = raw.trim();

  try {
    return JSON.parse(raw);
  } catch {
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

// Resume Polish
export const sendToOpenAIForResumePolish = async (cvData: Record<string, unknown>) => {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
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
  if (raw.startsWith('```json\n')) raw = raw.slice(7);
  if (raw.endsWith('```')) raw = raw.slice(0, -3);
  raw = raw.trim();

  try {
    return JSON.parse(raw);
  } catch {
    return { suggestions: [], _raw: raw };
  }
};

// Skill Gap Analysis
export const sendToOpenAIForSkillGap = async (cvData: Record<string, unknown>, jobDescription: string) => {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
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
  if (raw.startsWith('```json\n')) raw = raw.slice(7);
  if (raw.endsWith('```')) raw = raw.slice(0, -3);
  raw = raw.trim();

  try {
    return JSON.parse(raw);
  } catch {
    return { matchPercentage: 0, matchedSkills: [], missingSkills: [], recommendedSkills: [], _raw: raw };
  }
};

// Interview Prep
export const sendToOpenAIForInterviewPrep = async (
  cvData: Record<string, unknown>,
  jobDescription: string,
  jobTitle: string,
  companyName: string
) => {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
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
  if (raw.startsWith('```json\n')) raw = raw.slice(7);
  if (raw.endsWith('```')) raw = raw.slice(0, -3);
  raw = raw.trim();

  try {
    return JSON.parse(raw);
  } catch {
    return { categories: [], _raw: raw };
  }
};

// Salary Insights
export const sendToOpenAIForSalaryInsights = async (
  jobTitle: string,
  location: string,
  experienceLevel: string,
  company: string
) => {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
  if (raw.startsWith('```json\n')) raw = raw.slice(7);
  if (raw.endsWith('```')) raw = raw.slice(0, -3);
  raw = raw.trim();

  try {
    return JSON.parse(raw);
  } catch {
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

// Career Roadmap
export const sendToOpenAIForCareerRoadmap = async (
  cvData: Record<string, unknown>,
  targetRole: string,
  timeline: string,
  experienceLevel: string
) => {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const cvJson = JSON.stringify(cvData, null, 2);

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are a senior career strategist. Based on the candidate's current CV and their career goal, create a personalized interactive career path visualization as a TREE with branching progression paths.

Return JSON only with this structure:
{
  "tree": {
    "name": "Current Role (inferred from CV, e.g. Junior Developer)",
    "attributes": {
      "salaryRange": "estimated range e.g. $55K-$75K",
      "timeline": "Now",
      "skills": ["current relevant skills from CV"],
      "importance": "current",
      "summary": "Brief assessment of where the candidate is now"
    },
    "children": [
      {
        "name": "Intermediate Role 1 (e.g. Developer)",
        "attributes": {
          "salaryRange": "$70K-$95K",
          "timeline": "Months 1-6",
          "skills": ["skills needed to reach this role"],
          "importance": "intermediate",
          "summary": "What this role involves",
          "actions": ["specific action to reach this role"],
          "resources": [
            { "name": "Resource name", "type": "course|certification|book|project|community", "url": "suggested URL" }
          ]
        },
        "children": [
          {
            "name": "Target Role (e.g. Senior Developer)",
            "attributes": {
              "salaryRange": "$110K-$140K",
              "timeline": "Months 12-18",
              "skills": ["skills for target role"],
              "importance": "target",
              "summary": "What the target role typically looks like",
              "actions": ["specific action"],
              "resources": []
            },
            "children": []
          }
        ]
      },
      {
        "name": "Alternative Path Role (e.g. Specialist track)",
        "attributes": {
          "salaryRange": "$80K-$100K",
          "timeline": "Months 3-9",
          "skills": ["skills for alternative path"],
          "importance": "alternative",
          "summary": "An alternative route to the target",
          "actions": ["specific action"],
          "resources": []
        },
        "children": [
          {
            "name": "Target Role (e.g. Senior Developer)",
            "attributes": {
              "salaryRange": "$110K-$140K",
              "timeline": "Months 15-20",
              "skills": ["skills for target role"],
              "importance": "target",
              "summary": "What the target role typically looks like",
              "actions": [],
              "resources": []
            },
            "children": []
          }
        ]
      }
    ]
  },
  "currentSummary": "Brief assessment of where the candidate is now",
  "targetSummary": "What the target role typically looks like",
  "estimatedTimeToTarget": "e.g. 12-18 months",
  "keySkillsToAcquire": [
    {
      "skill": "Skill name",
      "importance": "critical|important|nice-to-have",
      "currentLevel": "none|beginner|intermediate|advanced",
      "targetLevel": "beginner|intermediate|advanced|expert"
    }
  ],
  "potentialChallenges": ["challenge1", "challenge2"]
}

Rules:
- Create a tree with the CURRENT role as root and the TARGET role as leaf nodes
- Include 2-4 branching paths (some intermediate roles, some alternative tracks) to show multiple ways to reach the target
- Each node must have: salaryRange (realistic market estimate), timeline, skills array, importance (current|intermediate|alternative|target), summary
- Leaf/target nodes and intermediate nodes may include actions and resources
- Resources should be real, well-known platforms (Coursera, Udemy, AWS, Google, etc.)
- Be realistic about salary ranges and timelines based on experience level and region
- Consider the gap between current skills and target role requirements
- Salary ranges should be clearly estimated market values`,
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
  if (raw.startsWith('```json\n')) raw = raw.slice(7);
  if (raw.endsWith('```')) raw = raw.slice(0, -3);
  raw = raw.trim();

  try {
    return JSON.parse(raw);
  } catch {
    return {
      tree: { name: '', attributes: { salaryRange: '', timeline: '', skills: [], importance: 'current', summary: '' }, children: [] },
      currentSummary: '',
      targetSummary: '',
      estimatedTimeToTarget: '',
      keySkillsToAcquire: [],
      potentialChallenges: [],
      _raw: raw,
    };
  }
};

// Salary Comparison
export const sendToOpenAIForSalaryComparison = async (
  jobTitle: string,
  locations: string[],
  experienceLevel: string,
  company: string
) => {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
  if (raw.startsWith('```json\n')) raw = raw.slice(7);
  if (raw.endsWith('```')) raw = raw.slice(0, -3);
  raw = raw.trim();

  try {
    return JSON.parse(raw);
  } catch {
    return { comparisons: [], bestValue: '', recommendation: '', _raw: raw };
  }
};

// Interview Simulation
export const sendToOpenAIForInterviewSimulation = async (
  cvData: Record<string, unknown>,
  jobDescription: string,
  jobTitle: string,
  companyName: string,
  roundType: string,
  topic?: string
) => {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
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
        content: `Candidate CV (JSON):\n${cvJson}\n\nCompany: ${companyName}\nPosition: ${jobTitle}\n\n${jobDescription ? `Job Description:\n${jobDescription}` : `Topic: ${topic || 'General interview preparation'}`}\n\nRound: ${roundType}`,
      },
    ],
    temperature: 0.4,
    max_tokens: 4096,
  });

  let raw = response.choices[0].message?.content?.trim() || '{}';
  if (raw.startsWith('```json\n')) raw = raw.slice(7);
  if (raw.endsWith('```')) raw = raw.slice(0, -3);
  raw = raw.trim();

  try {
    return JSON.parse(raw);
  } catch {
    return { roundType, questions: [], _raw: raw };
  }
};

// Interview Feedback
export const sendToOpenAIForInterviewFeedback = async (
  question: string,
  userAnswer: string,
  modelAnswer: string,
  whatToLookFor: string
) => {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
  if (raw.startsWith('```json\n')) raw = raw.slice(7);
  if (raw.endsWith('```')) raw = raw.slice(0, -3);
  raw = raw.trim();

  try {
    return JSON.parse(raw);
  } catch {
    return { score: 0, maxScore: 10, strengths: [], improvements: [], feedback: '', betterAnswer: '', _raw: raw };
  }
};

export interface CoverLetterVariant {
  style: 'formal' | 'conversational';
  coverLetter: string;
}

export const sendToOpenAIForCoverLetter = async (
  cvData: Record<string, unknown>,
  jobDescription: string,
  companyName: string,
  jobTitle: string
): Promise<CoverLetterVariant[]> => {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  const cvJson = JSON.stringify(cvData, null, 2);

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: `You are a professional cover letter writer. Write TWO tailored cover letter variants for the candidate based on their CV and the job description.

Guidelines (apply to BOTH variants):
- Write in the first person ("I")
- Address the hiring manager professionally (use "Dear Hiring Manager" if no name is provided)
- Open with a strong hook that connects the candidate's background to the role
- Highlight 2-3 specific relevant experiences or skills from the CV that match the job requirements
- Show knowledge of the company and role
- Close with a confident call to action
- Keep each variant between 250-350 words
- Do NOT use generic filler phrases like "I am writing to express my interest"
- Make each sentence count — every line should add value
- Do NOT include the candidate's name or contact info in the letter body — just the letter content

Variant styles:
- "formal": Professional, polished, traditional corporate tone. Precise vocabulary, structured sentences, restrained enthusiasm.
- "conversational": Warm, personable, approachable tone. Reads like a confident human speaking naturally while staying professional.

Return a JSON object with this exact shape:
{
  "formal": "<formal cover letter text>",
  "conversational": "<conversational cover letter text>"
}

Return ONLY the JSON object. No explanation, no markdown, no formatting markers.`,
      },
      {
        role: 'user',
        content: `Candidate CV (JSON):
${cvJson}

Company: ${companyName}
Position: ${jobTitle}

Job Description:
${jobDescription}

Write the two cover letter variants (formal and conversational) for this candidate applying to this position.`,
      },
    ],
    temperature: 0.8,
    max_tokens: 2048,
  });

  const raw = response.choices[0].message?.content?.trim() || '{}';
  let parsed: Record<string, string> = {};
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = {};
  }

  const formal = (parsed.formal || '').trim();
  const conversational = (parsed.conversational || '').trim();

  const variants: CoverLetterVariant[] = [];
  if (formal) variants.push({ style: 'formal', coverLetter: formal });
  if (conversational) variants.push({ style: 'conversational', coverLetter: conversational });

  return variants;
};

export const sendToOpenAIForATSWithData = async (cvData: Record<string, unknown>, jobDescription?: string) => {
  const openai = new OpenAI({
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
  if (raw.startsWith('```json\n')) raw = raw.slice(7);
  if (raw.endsWith('```')) raw = raw.slice(0, -3);
  raw = raw.trim();

  try {
    return JSON.parse(raw);
  } catch {
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

export const sendToOpenAIForLinkedInProfile = async (profileText: string) => {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
  if (raw.startsWith('```json\n')) raw = raw.slice(7);
  if (raw.endsWith('```')) raw = raw.slice(0, -3);
  raw = raw.trim();

  try {
    return JSON.parse(raw);
  } catch {
    return {
      overallScore: 0,
      completeness: { score: 0, missingFields: [], presentFields: [] },
      tone: { score: 0, assessment: '', suggestions: [] },
      keywords: { score: 0, industryKeywords: [], missingKeywords: [], densityNote: '' },
      sectionSuggestions: [],
    };
  }
};

export const sendToOpenAIForCVTailor = async (
  cvData: Record<string, unknown>,
  jobDescription: string,
  jobTitle: string
) => {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
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
  if (raw.startsWith('```json\n')) raw = raw.slice(7);
  if (raw.endsWith('```')) raw = raw.slice(0, -3);
  raw = raw.trim();

  try {
    return JSON.parse(raw);
  } catch {
    return { summary: '', suggestions: [] };
  }
};

// Keyword Optimizer
export const sendToOpenAIForKeywordOptimization = async (
  cvData: Record<string, unknown>,
  jobDescription: string
) => {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const cvJson = JSON.stringify(cvData, null, 2);

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are an ATS keyword optimization expert. Analyze the candidate's CV against the job description and extract a comprehensive keyword map.

Return JSON only with this structure:
{
  "overallMatchScore": 72,
  "totalJDKeywords": 45,
  "matchedKeywords": 32,
  "missingCritical": [
    {
      "keyword": "Kubernetes",
      "importance": "critical",
      "category": "technical",
      "frequencyInJD": 3,
      "suggestedSections": ["skills", "experience"],
      "contextInJD": "Required for container orchestration in production environments"
    }
  ],
  "missingImportant": [
    {
      "keyword": "CI/CD",
      "importance": "important",
      "category": "technical",
      "frequencyInJD": 2,
      "suggestedSections": ["experience", "projects"],
      "contextInJD": "Experience with automated deployment pipelines"
    }
  ],
  "missingNiceToHave": [
    {
      "keyword": "GraphQL",
      "importance": "nice-to-have",
      "category": "technical",
      "frequencyInJD": 1,
      "suggestedSections": ["skills"],
      "contextInJD": "Familiarity with GraphQL APIs preferred"
    }
  ],
  "matchedKeywordDetails": [
    {
      "keyword": "React",
      "category": "technical",
      "foundInCVSections": ["skills", "experience"],
      "frequencyInJD": 2
    }
  ],
  "keywordCategories": {
    "technical": { "total": 25, "matched": 18, "missing": 7 },
    "soft": { "total": 8, "matched": 6, "missing": 2 },
    "domain": { "total": 5, "matched": 3, "missing": 2 },
    "tools": { "total": 7, "matched": 5, "missing": 2 }
  },
  "placementSuggestions": [
    {
      "keyword": "Kubernetes",
      "bestSection": "skills",
      "exampleIntegration": "Add 'Kubernetes' to your 'DevOps & Cloud' skills category"
    },
    {
      "keyword": "CI/CD",
      "bestSection": "experience",
      "exampleIntegration": "Update your experience bullet: 'Implemented CI/CD pipelines using GitHub Actions...'"
    }
  ],
  "quickWins": [
    "Add 'Agile/Scrum' to skills (mentioned 3x in JD, easy to add)",
    "Include 'REST APIs' in experience descriptions (matches your backend work)"
  ]
}

Rules:
- Parse the JD thoroughly for ALL keywords: technical skills, tools, methodologies, soft skills, domain terms
- Categorize each keyword: technical (languages, frameworks, platforms), soft (communication, leadership), domain (industry-specific), tools (software, platforms)
- Assess importance based on frequency in JD, explicit "required"/"must have" language, and context
- For each missing keyword, suggest the BEST CV section(s) to add it (skills, experience, projects, summary, certifications)
- Provide specific, actionable integration examples
- Calculate overall match score as (matchedKeywords / totalJDKeywords) * 100
- Include "quick wins" - keywords easy to add that have high JD frequency
- Be comprehensive but practical - aim for 30-50 total JD keywords identified`,
      },
      {
        role: 'user',
        content: `Candidate CV (JSON):\n${cvJson}\n\nJob Description:\n${jobDescription}`,
      },
    ],
    temperature: 0.1,
    max_tokens: 4096,
  });

  let raw = response.choices[0].message?.content?.trim() || '{}';
  if (raw.startsWith('```json\n')) raw = raw.slice(7);
  if (raw.endsWith('```')) raw = raw.slice(0, -3);
  raw = raw.trim();

  try {
    return JSON.parse(raw);
  } catch {
    return {
      overallMatchScore: 0,
      totalJDKeywords: 0,
      matchedKeywords: 0,
      missingCritical: [],
      missingImportant: [],
      missingNiceToHave: [],
      matchedKeywordDetails: [],
      keywordCategories: { technical: { total: 0, matched: 0, missing: 0 }, soft: { total: 0, matched: 0, missing: 0 }, domain: { total: 0, matched: 0, missing: 0 }, tools: { total: 0, matched: 0, missing: 0 } },
      placementSuggestions: [],
      quickWins: [],
      _raw: raw,
    };
  }
};

export const sendToOpenAIForAttention = async (
  layoutSummary: Record<string, unknown>,
  cvData: Record<string, unknown>
) => {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const summaryJson = JSON.stringify(layoutSummary, null, 2);
  const cvJson = JSON.stringify(cvData, null, 2);

  const response = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are an expert recruiter and resume layout analyst. You explain how a recruiter is likely to visually scan a candidate's resume in the first 6-8 seconds. The resume layout has been machine-analyzed into a structured summary with per-section attention scores (0-100), geometry, typography and density metrics.

Return JSON only with this structure:
{
  "observations": [
    "Recruiters will spend most of their attention on your experience because it occupies the center of the page with strong visual hierarchy.",
    "Your summary reads as dense and may be skipped during an initial scan."
  ],
  "issues": [
    { "severity": "critical", "message": "Your certifications section is buried below the fold and will likely be overlooked.", "fix": "Move certifications to the top half of page two or cut it to a single line." },
    { "severity": "medium", "message": "Projects receive limited attention due to weak spacing between bullets.", "fix": "Increase paragraph spacing and keep projects to 3-4 bullets." },
    { "severity": "minor", "message": "Skills use heavy bold throughout, reducing visual hierarchy.", "fix": "Bold only the first skill in each category." }
  ],
  "recommendations": [
    { "severity": "critical", "title": "Reveal your experience", "detail": "Your experience section is visually hidden below an oversized summary. Trim the summary to 2 lines so experience rises above the fold." },
    { "severity": "medium", "title": "Add breathing room to projects", "detail": "Increase spacing between projects and convert long paragraphs into 3-4 bullet points." },
    { "severity": "minor", "title": "Tame the bold", "detail": "Reduce bold usage in skills so section headings keep their dominance." }
  ],
  "recruiterImpression": "In 6-8 seconds a recruiter will register a competent, dense candidate with strong experience but a cluttered top fold. Tightening spacing and hierarchy would substantially raise scannability.",
  "scanTimeSeconds": 7
}

Rules:
- Write observations as if narrating the predicted scan. Maximum 8 observations.
- Only mention facts supported by the layout summary (scores, geometry, typography, density, section order). Do not invent text that is not present.
- Severity: critical = hurts the resume materially, medium = noticeable friction, minor = polish.
- Be specific, concise and actionable. Use plain recruiter language, not jargon.
- scanTimeSeconds should be between 6 and 8.`,
      },
      {
        role: 'user',
        content: `Layout Summary (JSON):\n${summaryJson}\n\nCandidate CV (JSON):\n${cvJson}`,
      },
    ],
    temperature: 0.4,
    max_tokens: 2048,
  });

  let raw = response.choices[0].message?.content?.trim() || '{}';
  if (raw.startsWith('```json\n')) raw = raw.slice(7);
  if (raw.endsWith('```')) raw = raw.slice(0, -3);
  raw = raw.trim();

  try {
    return JSON.parse(raw);
  } catch {
    return {
      observations: [],
      issues: [],
      recommendations: [],
      recruiterImpression: '',
      scanTimeSeconds: 7,
      _raw: raw,
    };
  }
};